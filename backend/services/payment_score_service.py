from datetime import date
from typing import List, Tuple

import numpy as np


SAFETY_LINE = 3_000_000.0


def get_payment_suggestion(score: float, attachment_status: str) -> str:
    if attachment_status in ("缺失", "待补充") and score < 55:
        return "退回补充资料"
    if score >= 85:
        return "立即支付"
    if score >= 70:
        return "优先支付"
    if score >= 55:
        return "部分支付"
    if score >= 40:
        return "暂缓支付"
    return "不建议支付或退回补充资料"


def calculate_payment_score(payment, current_available_funds: float, safety_line: float = SAFETY_LINE) -> Tuple[float, str, List[str]]:
    """计算待付款申请AI优先级评分。

    当前为规则评分模型，重点体现建筑企业工资税款刚性支出、分包付款、
    材料款和现场履约影响。后续可扩展为机器学习排序模型或LLM辅助审核。
    """
    score = 45.0
    reasons: List[str] = []

    high_priority_types = ("工资", "农民工工资", "税款")
    site_priority_types = ("劳务分包", "材料款", "机械租赁", "专业分包", "钢筋材料款", "混凝土材料款")

    if any(key in payment.payment_type for key in high_priority_types):
        score += 34
        reasons.append("涉及工资、农民工工资或税款等刚性支付")
    elif any(key in payment.payment_type for key in site_priority_types):
        score += 18
        reasons.append("影响项目现场履约或供应链稳定")
    else:
        score += 5
        reasons.append("一般项目资金支付事项")

    if payment.is_rigid_payment:
        score += 10
        reasons.append("被标记为刚性付款")
    if payment.is_labor_payment:
        score += 8
        reasons.append("涉及劳务或农民工工资实名制支付")

    days_overdue = (date.today() - payment.due_date).days
    if days_overdue > 30:
        score += 18
        reasons.append("已逾期超过30天")
    elif days_overdue > 14:
        score += 12
        reasons.append("已逾期超过14天")
    elif days_overdue > 0:
        score += 8
        reasons.append("付款已逾期")
    elif days_overdue >= -7:
        score += 4
        reasons.append("7天内到期")

    denominator = payment.settled_amount or payment.contract_amount or 1
    paid_ratio_after_payment = (payment.paid_amount + payment.amount) / denominator
    if paid_ratio_after_payment > 0.95:
        score -= 22
        reasons.append("本次支付后分包累计付款比例超过95%")
    elif paid_ratio_after_payment > 0.85:
        score -= 14
        reasons.append("本次支付后分包累计付款比例偏高")
    elif paid_ratio_after_payment > 0.75:
        score -= 7
        reasons.append("需关注分包累计付款比例")

    if payment.attachment_status == "完整":
        score += 7
        reasons.append("合同、结算、发票等附件完整")
    elif payment.attachment_status == "部分缺失":
        score -= 12
        reasons.append("附件部分缺失")
    elif payment.attachment_status in ("缺失", "待补充"):
        score -= 24
        reasons.append("附件缺失或待补充")

    balance_after_payment = current_available_funds - payment.amount
    if balance_after_payment < 0:
        score -= 32
        reasons.append("本次付款后账户资金为负")
    elif balance_after_payment < safety_line:
        score -= 18
        reasons.append("本次付款后资金余额低于安全线")
    elif balance_after_payment < safety_line * 1.2:
        score -= 8
        reasons.append("本次付款后资金余额接近安全线")

    score = float(np.clip(round(score, 2), 0, 100))
    suggestion = get_payment_suggestion(score, payment.attachment_status)
    return score, suggestion, reasons
