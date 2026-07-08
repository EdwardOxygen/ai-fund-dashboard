from typing import List, Tuple

import numpy as np


def calculate_collection_score(project, collection) -> Tuple[float, str, List[str]]:
    """计算预计回款可信度评分。

    当前采用可解释规则模型，后续可替换为机器学习模型或大语言模型接口，
    将业主画像、合同条款、历史回款流水等更多特征纳入预测。
    """
    score = 50.0
    reasons: List[str] = []

    stage_score = {
        "付款节点已达成": 20,
        "已确权": 16,
        "审计中": 6,
        "未到节点": -12,
    }
    invoice_score = {
        "已开票": 14,
        "部分开票": 5,
        "未开票": -12,
    }

    score += stage_score.get(collection.collection_stage, 0)
    if collection.collection_stage in ("付款节点已达成", "已确权"):
        reasons.append("已确权或达到合同付款节点")
    if collection.collection_stage == "未到节点":
        reasons.append("尚未达到合同付款节点")

    score += invoice_score.get(collection.invoice_status, 0)
    if collection.invoice_status == "已开票":
        reasons.append("已完成开票")
    elif collection.invoice_status != "已开票":
        reasons.append("开票资料仍需跟进")

    if project.owner_type in ("政府单位", "平台公司") and collection.aging_days > 60:
        score -= 10
        reasons.append(f"{project.owner_type}账龄较长，财政或审批周期存在不确定性")
    elif project.owner_type == "民营业主" and collection.aging_days > 30:
        score -= 8
        reasons.append("民营业主账龄偏长，需关注履约和资金来源")

    if collection.historical_delay_days > 45:
        score -= 18
        reasons.append("历史延期超过45天")
    elif collection.historical_delay_days > 30:
        score -= 12
        reasons.append("历史延期超过30天")
    elif collection.historical_delay_days > 15:
        score -= 6
        reasons.append("存在历史延期记录")

    if collection.aging_days > 90:
        score -= 24
        risk_level = "红色"
        reasons.append("账龄超过90天")
    elif collection.aging_days > 60:
        score -= 15
        risk_level = "红色"
        reasons.append("账龄超过60天")
    elif collection.aging_days > 30:
        score -= 8
        risk_level = "黄色"
        reasons.append("账龄超过30天")
    else:
        risk_level = "绿色"

    score = float(np.clip(round(score, 2), 0, 100))
    if score < 45:
        risk_level = "红色"
    elif score < 70 and risk_level != "红色":
        risk_level = "黄色"

    if not reasons:
        reasons.append("回款条件相对清晰")
    return score, risk_level, reasons
