from datetime import datetime
from typing import List

from sqlalchemy.orm import Session

from models import BankAccount, ExpectedCollection, PaymentRequest, Project
from services.cashflow_service import (
    SAFETY_LINE,
    get_cashflow_forecast,
    get_current_available_funds,
    get_funding_gap,
)
from services.collection_score_service import calculate_collection_score
from services.external_ai_service import ExternalAIError, generate_external_report, get_ai_provider_status
from services.payment_score_service import calculate_payment_score


def format_wan(value: float) -> str:
    return f"{value / 10000:.2f}万元"


def build_payment_priority(db: Session) -> List[dict]:
    """输出付款优先级排序，并补充可解释风险原因。"""
    current_available_funds = get_current_available_funds(db)
    rows = []
    for payment in db.query(PaymentRequest).all():
        score, suggestion, reasons = calculate_payment_score(payment, current_available_funds)
        payment.ai_score = score
        payment.suggestion = suggestion
        paid_ratio = payment.paid_amount / payment.settled_amount if payment.settled_amount else 0
        rows.append(
            {
                "id": payment.id,
                "project_name": payment.project.project_name,
                "payee_name": payment.payee_name,
                "payment_type": payment.payment_type,
                "amount": payment.amount,
                "due_date": payment.due_date.isoformat(),
                "paid_ratio": round(paid_ratio, 4),
                "ai_score": score,
                "suggestion": suggestion,
                "risk_reason": "；".join(reasons[:3]),
                "risk_reasons": reasons,
            }
        )
    db.commit()
    return sorted(rows, key=lambda item: item["ai_score"], reverse=True)


def build_project_risk(db: Session) -> List[dict]:
    """汇总项目资金风险、回款风险和付款风险。"""
    rows = []
    for project in db.query(Project).all():
        collections = project.expected_collections
        payments = project.payment_requests
        collection_scores = [calculate_collection_score(project, item)[0] for item in collections]
        average_probability = sum(collection_scores) / len(collection_scores) if collection_scores else 100
        unpaid_payment_amount = sum(item.amount for item in payments)
        high_score_payment_amount = sum(item.amount for item in payments if item.ai_score >= 70)
        collection_rate = project.collected_amount / project.contract_amount if project.contract_amount else 0

        if average_probability < 55 or collection_rate < 0.25:
            collection_risk = "高"
        elif average_probability < 72 or collection_rate < 0.45:
            collection_risk = "中"
        else:
            collection_risk = "低"

        if unpaid_payment_amount > project.contract_amount * 0.10 or high_score_payment_amount > project.contract_amount * 0.04:
            payment_risk = "高"
        elif unpaid_payment_amount > project.contract_amount * 0.05:
            payment_risk = "中"
        else:
            payment_risk = "低"

        if collection_risk == "高" or payment_risk == "高":
            risk_level = "红色"
        elif collection_risk == "中" or payment_risk == "中":
            risk_level = "黄色"
        else:
            risk_level = "绿色"

        project.risk_level = risk_level
        gap_hint = project.billed_amount - project.collected_amount
        if risk_level == "红色":
            hint = (
                f"项目资金承压，已开票未回款{format_wan(gap_hint)}，"
                "需强化业主催收并控制分包付款节奏。"
            )
        elif risk_level == "黄色":
            hint = "项目回款或付款节奏存在波动，建议纳入周资金调度清单。"
        else:
            hint = "项目资金状态相对稳定，按合同节点持续跟踪回款。"

        rows.append(
            {
                "id": project.id,
                "project_name": project.project_name,
                "owner_type": project.owner_type,
                "contract_amount": project.contract_amount,
                "confirmed_output": project.confirmed_output,
                "billed_amount": project.billed_amount,
                "collected_amount": project.collected_amount,
                "collection_rate": round(collection_rate, 4),
                "risk_level": risk_level,
                "collection_risk": collection_risk,
                "payment_risk": payment_risk,
                "ai_hint": hint,
            }
        )
    db.commit()
    return sorted(rows, key=lambda item: {"红色": 0, "黄色": 1, "绿色": 2}[item["risk_level"]])


def build_dashboard_summary(db: Session) -> dict:
    """聚合首页驾驶舱指标。"""
    forecasts_30 = get_cashflow_forecast(db, 30)
    payment_rows = build_payment_priority(db)
    project_rows = build_project_risk(db)

    current_available_funds = get_current_available_funds(db)
    pending_payment_amount = sum(item.amount for item in db.query(PaymentRequest).all())
    suggested_week_payment_amount = sum(
        item["amount"] if item["suggestion"] in ("立即支付", "优先支付") else item["amount"] * 0.5
        for item in payment_rows
        if item["suggestion"] in ("立即支付", "优先支付", "部分支付")
    )
    high_risk_projects = [item for item in project_rows if item["risk_level"] == "红色"]
    risk_order = {"重大风险": 0, "红色": 1, "黄色": 2, "绿色": 3}
    fund_risk_level = min((item.risk_level for item in forecasts_30), key=lambda level: risk_order[level])
    accounts = db.query(BankAccount).all()

    ai_summary = (
        f"当前建筑企业项目资金可用余额{format_wan(current_available_funds)}，"
        f"30日内最大资金缺口{format_wan(get_funding_gap(db, 30))}。"
        f"系统建议优先保障农民工工资、税款及影响现场履约的分包付款，"
        f"重点催收{len(high_risk_projects)}个高风险项目回款。"
    )

    return {
        "current_available_funds": current_available_funds,
        "gap_7d": get_funding_gap(db, 7),
        "gap_30d": get_funding_gap(db, 30),
        "gap_90d": get_funding_gap(db, 90),
        "high_risk_project_count": len(high_risk_projects),
        "pending_payment_amount": pending_payment_amount,
        "suggested_week_payment_amount": suggested_week_payment_amount,
        "fund_risk_level": fund_risk_level,
        "safety_line": SAFETY_LINE,
        "bank_accounts": [
            {
                "account_name": item.account_name,
                "bank_name": item.bank_name,
                "balance": item.balance,
                "available_balance": item.available_balance,
                "frozen_amount": item.frozen_amount,
            }
            for item in accounts
        ],
        "cashflow_trend": [
            {
                "date": item.forecast_date.isoformat(),
                "ending_balance": item.ending_balance,
                "risk_level": item.risk_level,
            }
            for item in forecasts_30
        ],
        "top_payments": payment_rows[:10],
        "high_risk_projects": high_risk_projects[:8],
        "ai_summary": ai_summary,
    }


def build_ai_report(db: Session, mode: str = "local") -> dict:
    """生成资金风险分析报告。

    local：使用本地规则模板。
    external：调用配置的外部AI生成报告，失败时回退本地模板。
    auto：当 AI_REPORT_PROVIDER=minimax 且配置了 MINIMAX_API_KEY 时调用外部AI，否则本地生成。
    """
    mode = (mode or "local").lower()
    local_report = _build_local_ai_report(db)
    provider_status = get_ai_provider_status()
    should_use_external = mode == "external" or (
        mode == "auto"
        and provider_status["provider"] == "minimax"
        and provider_status["minimax_configured"]
    )

    if not should_use_external:
        return local_report

    try:
        external = generate_external_report(_build_ai_report_context(db, local_report))
    except ExternalAIError as exc:
        local_report["fallback_reason"] = str(exc)
        return local_report

    return {
        **local_report,
        "report": external["report"],
        "report_source": "external",
        "provider": external["provider"],
        "model": external["model"],
        "fallback_reason": None,
    }


def _build_local_ai_report(db: Session) -> dict:
    """生成正式资金风险分析报告。"""
    forecasts_7 = get_cashflow_forecast(db, 7)
    forecasts_30 = get_cashflow_forecast(db, 30)
    payments = build_payment_priority(db)
    projects = build_project_risk(db)
    current_available_funds = get_current_available_funds(db)
    gap_7 = get_funding_gap(db, 7)
    gap_30 = get_funding_gap(db, 30)

    immediate_payments = [item for item in payments if item["suggestion"] in ("立即支付", "优先支付")][:5]
    deferred_payments = [item for item in payments if item["suggestion"] in ("暂缓支付", "退回补充资料", "不建议支付或退回补充资料")][:5]
    collection_focus = (
        db.query(ExpectedCollection)
        .order_by(ExpectedCollection.risk_level.desc(), ExpectedCollection.ai_probability.asc())
        .limit(5)
        .all()
    )
    min_7_balance = min(item.ending_balance for item in forecasts_7)
    min_30_balance = min(item.ending_balance for item in forecasts_30)
    main_gap_sources = [
        item for item in payments if item["suggestion"] in ("立即支付", "优先支付") and item["amount"] > 1_000_000
    ][:4]

    report = f"""
AI资金驾驶舱分析报告

一、当前资金总体情况
截至{datetime.now().strftime('%Y年%m月%d日')}，建筑企业当前可用项目资金为{format_wan(current_available_funds)}，资金安全线为{format_wan(SAFETY_LINE)}。未来30天预测最低期末余额为{format_wan(min_30_balance)}，总体风险等级为{'红色' if gap_30 > 0 else '绿色'}。当前待审批付款金额合计{format_wan(sum(item['amount'] for item in payments))}，资金调度需优先保障刚性支出和现场履约。

二、未来7天和30天资金风险
未来7天预测最低余额为{format_wan(min_7_balance)}，相对安全线资金缺口为{format_wan(gap_7)}。未来30天预测资金缺口为{format_wan(gap_30)}。如部分预计回款未按期到账，工资、农民工工资、税款及关键分包付款可能形成阶段性挤压，应按日滚动监控现金流。

三、主要资金缺口来源
主要压力来自分包付款、材料款、机械租赁和刚性税款集中到期。{_format_payment_sentence(main_gap_sources, '其中金额较大的事项包括')}同时，部分政府项目和平台公司项目回款存在审批周期拉长、账龄偏长的问题，削弱了未来现金流确定性。

四、建议优先支付事项
{_format_payment_sentence(immediate_payments, '建议优先安排')}上述事项与农民工工资、税款及现场履约直接相关，建议纳入本周资金计划并由财务资金、项目商务、工程管理协同确认支付口径。

五、建议暂缓支付事项
{_format_payment_sentence(deferred_payments, '建议暂缓或退回补充资料')}对付款比例过高、附件不完整、与当前履约关联度较低的申请，应先完成结算复核、发票校验和合同付款节点确认。

六、重点催收项目
{_format_collection_sentence(collection_focus)}建议对高风险回款建立责任到人的催收台账，明确业主联系人、预计审批节点、发票状态和回款承诺日期。

七、管理建议
建议以AI资金驾驶舱为统一入口，形成“回款预测、付款优先级、资金缺口、风险预警”的业财融合闭环；对红色项目执行周调度，对黄色项目执行双周复盘，对绿色项目保持合同节点跟踪。短期内应压降非刚性付款，优先保障农民工工资、税款及关键材料款，必要时提前准备融资或内部资金调拨方案。
""".strip()

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "report": report,
        "report_source": "local",
        "provider": "local",
        "model": "rule-template",
        "fallback_reason": None,
        "metrics": {
            "current_available_funds": current_available_funds,
            "gap_7d": gap_7,
            "gap_30d": gap_30,
            "high_risk_project_count": len([item for item in projects if item["risk_level"] == "红色"]),
        },
    }


def _build_ai_report_context(db: Session, local_report: dict) -> dict:
    payments = build_payment_priority(db)
    projects = build_project_risk(db)
    forecasts = get_cashflow_forecast(db, 30)
    collection_focus = (
        db.query(ExpectedCollection)
        .order_by(ExpectedCollection.risk_level.desc(), ExpectedCollection.ai_probability.asc())
        .limit(8)
        .all()
    )

    return {
        "generated_at": local_report["generated_at"],
        "metrics": local_report["metrics"],
        "safety_line": SAFETY_LINE,
        "cashflow_forecast_30d": [
            {
                "forecast_date": item.forecast_date.isoformat(),
                "opening_balance": item.opening_balance,
                "expected_collection": item.expected_collection,
                "planned_payment": item.planned_payment,
                "rigid_payment": item.rigid_payment,
                "ending_balance": item.ending_balance,
                "risk_level": item.risk_level,
            }
            for item in forecasts
        ],
        "payment_priority_top": payments[:10],
        "deferred_payments": [
            item
            for item in payments
            if item["suggestion"] in ("暂缓支付", "退回补充资料", "不建议支付或退回补充资料")
        ][:8],
        "project_risks": projects,
        "collection_focus": [
            {
                "project_name": item.project.project_name,
                "expected_date": item.expected_date.isoformat(),
                "amount": item.amount,
                "collection_stage": item.collection_stage,
                "invoice_status": item.invoice_status,
                "aging_days": item.aging_days,
                "historical_delay_days": item.historical_delay_days,
                "ai_probability": item.ai_probability,
                "risk_level": item.risk_level,
            }
            for item in collection_focus
        ],
    }


def _format_payment_sentence(payments: List[dict], prefix: str) -> str:
    if not payments:
        return f"{prefix}暂无。"
    parts = [
        f"{item['project_name']}向{item['payee_name']}支付{item['payment_type']}{format_wan(item['amount'])}"
        for item in payments
    ]
    return f"{prefix}：" + "；".join(parts) + "。"


def _format_collection_sentence(collections: List[ExpectedCollection]) -> str:
    if not collections:
        return "暂无重点催收事项。"
    parts = [
        f"{item.project.project_name}预计回款{format_wan(item.amount)}，可信度{item.ai_probability:.0f}%，风险等级{item.risk_level}"
        for item in collections
    ]
    return "重点催收：" + "；".join(parts) + "。"
