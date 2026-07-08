import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ExternalAIError(RuntimeError):
    pass


MINIMAX_DEFAULT_BASE_URL = "https://api.minimaxi.com/anthropic"
MINIMAX_DEFAULT_MODEL = "MiniMax-M3"
MINIMAX_REPORT_SYSTEM_PROMPT = (
    "你是建筑企业资金管理专家。请基于结构化经营数据，输出正式、审慎、可落地的"
    "中文资金风险分析报告。不要编造未提供的项目、金额或日期。"
)

_runtime_config: dict[str, str | float] = {}


def set_ai_provider_config(config: dict[str, Any]) -> dict:
    provider = str(config.get("provider") or "minimax").strip().lower()
    _runtime_config["provider"] = provider

    api_key = config.get("api_key")
    if isinstance(api_key, str) and api_key.strip():
        _runtime_config["minimax_api_key"] = api_key.strip()

    base_url = config.get("base_url")
    if isinstance(base_url, str) and base_url.strip():
        _runtime_config["minimax_base_url"] = base_url.strip().rstrip("/")

    model = config.get("model")
    if isinstance(model, str) and model.strip():
        _runtime_config["minimax_model"] = model.strip()

    timeout = config.get("timeout_seconds")
    if timeout is not None:
        _runtime_config["minimax_timeout_seconds"] = float(timeout)

    return get_ai_provider_status()


def get_ai_provider_status() -> dict:
    provider = _get_config_value("provider", "AI_REPORT_PROVIDER", "minimax").strip().lower()
    minimax_key = _get_config_value("minimax_api_key", "MINIMAX_API_KEY", "").strip()
    minimax_base_url = _get_config_value("minimax_base_url", "MINIMAX_BASE_URL", MINIMAX_DEFAULT_BASE_URL)
    return {
        "provider": provider,
        "minimax_configured": bool(minimax_key),
        "minimax_base_url": minimax_base_url,
        "minimax_model": _get_config_value("minimax_model", "MINIMAX_MODEL", MINIMAX_DEFAULT_MODEL),
        "minimax_protocol": _infer_minimax_protocol(minimax_base_url),
        "runtime_configured": "minimax_api_key" in _runtime_config,
    }


def generate_external_report(context: dict[str, Any]) -> dict:
    provider = _get_config_value("provider", "AI_REPORT_PROVIDER", "minimax").strip().lower()
    if provider != "minimax":
        raise ExternalAIError(f"暂不支持的外部AI提供方：{provider}")
    return _generate_minimax_report(context)


def _generate_minimax_report(context: dict[str, Any]) -> dict:
    api_key = _get_config_value("minimax_api_key", "MINIMAX_API_KEY", "").strip()
    if not api_key:
        raise ExternalAIError("未配置 MINIMAX_API_KEY，无法调用 MiniMax。")

    base_url = _get_config_value("minimax_base_url", "MINIMAX_BASE_URL", MINIMAX_DEFAULT_BASE_URL).rstrip("/")
    model = _get_config_value("minimax_model", "MINIMAX_MODEL", MINIMAX_DEFAULT_MODEL)
    timeout = float(_get_config_value("minimax_timeout_seconds", "MINIMAX_TIMEOUT_SECONDS", "30"))
    prompt = _build_report_prompt(context)
    protocol = _infer_minimax_protocol(base_url)

    if protocol == "anthropic":
        payload = {
            "model": model,
            "max_tokens": 2200,
            "temperature": 0.2,
            "system": MINIMAX_REPORT_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": prompt}],
        }
        body = _post_minimax_json(_build_anthropic_messages_url(base_url), payload, api_key, timeout)
        report = _extract_anthropic_report(body)
    else:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": MINIMAX_REPORT_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 2200,
            "stream": False,
        }
        body = _post_minimax_json(_build_openai_chat_completions_url(base_url), payload, api_key, timeout)
        report = _extract_openai_report(body)

    return {
        "report": report,
        "provider": "minimax",
        "model": model,
        "protocol": protocol,
    }


def _post_minimax_json(url: str, payload: dict[str, Any], api_key: str, timeout: float) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ExternalAIError(f"MiniMax API 请求失败：HTTP {exc.code} {detail[:300]}") from exc
    except URLError as exc:
        raise ExternalAIError(f"MiniMax API 网络错误：{exc.reason}") from exc
    except TimeoutError as exc:
        raise ExternalAIError("MiniMax API 请求超时。") from exc
    except json.JSONDecodeError as exc:
        raise ExternalAIError("MiniMax API 返回内容不是合法 JSON。") from exc

    if not isinstance(body, dict):
        raise ExternalAIError("MiniMax API 返回内容不是 JSON 对象。")
    return body


def _extract_anthropic_report(body: dict[str, Any]) -> str:
    content = body.get("content")
    if isinstance(content, str):
        return _validate_report_text(content)
    if not isinstance(content, list):
        raise ExternalAIError("MiniMax API 返回结构缺少 content 文本块。")

    text_parts = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and isinstance(block.get("text"), str):
            text_parts.append(block["text"].strip())

    return _validate_report_text("\n".join(part for part in text_parts if part))


def _extract_openai_report(body: dict[str, Any]) -> str:
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ExternalAIError("MiniMax API 返回结构缺少 choices[0].message.content。") from exc

    if isinstance(content, str):
        return _validate_report_text(content)
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                text_parts.append(block["text"].strip())
        return _validate_report_text("\n".join(part for part in text_parts if part))

    raise ExternalAIError("MiniMax API 返回的报告内容不是文本。")


def _validate_report_text(report: str) -> str:
    if not isinstance(report, str) or not report.strip():
        raise ExternalAIError("MiniMax API 返回了空报告。")
    return report.strip()


def _infer_minimax_protocol(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/").lower()
    if "/anthropic" in normalized or normalized.endswith("/messages"):
        return "anthropic"
    return "openai"


def _build_anthropic_messages_url(base_url: str) -> str:
    base = base_url.strip().rstrip("/")
    if base.endswith("/v1/messages") or base.endswith("/messages"):
        return base
    if base.endswith("/v1"):
        return f"{base}/messages"
    return f"{base}/v1/messages"


def _build_openai_chat_completions_url(base_url: str) -> str:
    base = base_url.strip().rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _get_config_value(runtime_key: str, env_key: str, default: str) -> str:
    value = _runtime_config.get(runtime_key)
    if value is not None:
        return str(value)
    return os.getenv(env_key, default)


def _build_report_prompt(context: dict[str, Any]) -> str:
    compact_context = json.dumps(context, ensure_ascii=False, separators=(",", ":"))
    return f"""
请根据以下 JSON 数据生成《AI资金风险分析报告》。

要求：
1. 保留正式财务汇报口径，按“总体情况、7/30天风险、付款建议、催收重点、管理建议”组织。
2. 所有金额使用万元口径，可四舍五入到两位小数。
3. 明确指出高风险项目、优先付款事项、暂缓付款事项和回款不确定性。
4. 直接输出报告正文，不要输出 JSON、代码块、Markdown 表格或思考过程。
5. 不要编造数据。

数据：
{compact_context}
""".strip()
