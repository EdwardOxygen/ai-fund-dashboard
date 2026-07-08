from datetime import date, timedelta
from typing import Dict, List

import pandas as pd
from sqlalchemy.orm import Session

from models import BankAccount, CashflowForecast, ExpectedCollection, PaymentRequest, Project
from services.collection_score_service import calculate_collection_score
from services.payment_score_service import SAFETY_LINE, calculate_payment_score


def classify_fund_risk(ending_balance: float, rigid_payment: float = 0, available_before_payment: float = 0) -> str:
    """按安全线和刚性支出可支付性划分红黄绿及重大风险。"""
    if rigid_payment > 0 and available_before_payment < rigid_payment:
        return "重大风险"
    if ending_balance < SAFETY_LINE:
        return "红色"
    if ending_balance < SAFETY_LINE * 1.25:
        return "黄色"
    return "绿色"


def get_current_available_funds(db: Session) -> float:
    return float(sum(account.available_balance for account in db.query(BankAccount).all()))


def refresh_scores(db: Session) -> None:
    """刷新回款可信度、付款优先级评分和项目风险等级。"""
    current_available_funds = get_current_available_funds(db)

    for collection in db.query(ExpectedCollection).all():
        score, risk_level, _ = calculate_collection_score(collection.project, collection)
        collection.ai_probability = score
        collection.risk_level = risk_level

    for payment in db.query(PaymentRequest).all():
        score, suggestion, _ = calculate_payment_score(payment, current_available_funds)
        payment.ai_score = score
        payment.suggestion = suggestion

    for project in db.query(Project).all():
        collection_risks = [item.risk_level for item in project.expected_collections]
        project_payments = project.payment_requests
        high_payment_count = sum(1 for item in project_payments if item.ai_score >= 70)
        unpaid_amount = sum(item.amount for item in project_payments)
        collection_rate = project.collected_amount / project.contract_amount if project.contract_amount else 0

        if "红色" in collection_risks or collection_rate < 0.25 or unpaid_amount > project.contract_amount * 0.12:
            project.risk_level = "红色"
        elif "黄色" in collection_risks or high_payment_count >= 2 or collection_rate < 0.45:
            project.risk_level = "黄色"
        else:
            project.risk_level = "绿色"


def recalculate_cashflow(db: Session, days: int = 90) -> List[CashflowForecast]:
    """生成未来现金流预测。

    回款按AI可信度折算为风险调整金额；付款根据AI建议识别刚性支付、
    全额优先支付和部分支付。该逻辑可作为后续智能资金调度模型的基线。
    """
    days = max(1, min(days, 90))
    refresh_scores(db)
    db.query(CashflowForecast).delete()
    db.flush()

    start = date.today()
    collections = db.query(ExpectedCollection).all()
    payments = db.query(PaymentRequest).all()

    collection_df = pd.DataFrame(
        [
            {
                "forecast_date": item.expected_date,
                "risk_adjusted_amount": item.amount * item.ai_probability / 100,
            }
            for item in collections
        ]
    )
    if collection_df.empty:
        collection_by_date: Dict[date, float] = {}
    else:
        collection_by_date = collection_df.groupby("forecast_date")["risk_adjusted_amount"].sum().to_dict()

    payment_rows = []
    for item in payments:
        rigid = item.is_rigid_payment or "工资" in item.payment_type or "税款" in item.payment_type
        if rigid:
            planned_amount = 0.0
            rigid_amount = item.amount
        elif item.suggestion in ("立即支付", "优先支付"):
            planned_amount = item.amount
            rigid_amount = 0.0
        elif item.suggestion == "部分支付":
            planned_amount = item.amount * 0.5
            rigid_amount = 0.0
        else:
            planned_amount = 0.0
            rigid_amount = 0.0
        payment_rows.append(
            {
                "forecast_date": item.due_date,
                "planned_amount": planned_amount,
                "rigid_amount": rigid_amount,
            }
        )

    payment_df = pd.DataFrame(payment_rows)
    if payment_df.empty:
        planned_by_date: Dict[date, float] = {}
        rigid_by_date: Dict[date, float] = {}
    else:
        planned_by_date = payment_df.groupby("forecast_date")["planned_amount"].sum().to_dict()
        rigid_by_date = payment_df.groupby("forecast_date")["rigid_amount"].sum().to_dict()

    opening_balance = get_current_available_funds(db)
    forecasts: List[CashflowForecast] = []

    for offset in range(days):
        forecast_date = start + timedelta(days=offset)
        expected_collection = float(collection_by_date.get(forecast_date, 0.0))
        planned_payment = float(planned_by_date.get(forecast_date, 0.0))
        rigid_payment = float(rigid_by_date.get(forecast_date, 0.0))
        available_before_payment = opening_balance + expected_collection
        ending_balance = available_before_payment - rigid_payment - planned_payment
        risk_level = classify_fund_risk(ending_balance, rigid_payment, available_before_payment)

        forecast = CashflowForecast(
            forecast_date=forecast_date,
            opening_balance=round(opening_balance, 2),
            expected_collection=round(expected_collection, 2),
            planned_payment=round(planned_payment, 2),
            rigid_payment=round(rigid_payment, 2),
            ending_balance=round(ending_balance, 2),
            risk_level=risk_level,
        )
        db.add(forecast)
        forecasts.append(forecast)
        opening_balance = ending_balance

    db.commit()
    return forecasts


def get_cashflow_forecast(db: Session, days: int = 30) -> List[CashflowForecast]:
    """读取指定天数预测；数据不足时自动重算。"""
    days = max(1, min(days, 90))
    forecasts = (
        db.query(CashflowForecast)
        .order_by(CashflowForecast.forecast_date.asc())
        .limit(days)
        .all()
    )
    if len(forecasts) < days:
        forecasts = recalculate_cashflow(db, 90)[:days]
    return forecasts


def get_funding_gap(db: Session, days: int) -> float:
    """计算给定周期内相对安全线的最大资金缺口。"""
    forecasts = get_cashflow_forecast(db, days)
    if not forecasts:
        return 0.0
    minimum_balance = min(item.ending_balance for item in forecasts)
    return round(max(0.0, SAFETY_LINE - minimum_balance), 2)


def serialize_forecast(item: CashflowForecast) -> dict:
    return {
        "id": item.id,
        "forecast_date": item.forecast_date.isoformat(),
        "opening_balance": item.opening_balance,
        "expected_collection": item.expected_collection,
        "planned_payment": item.planned_payment,
        "rigid_payment": item.rigid_payment,
        "ending_balance": item.ending_balance,
        "risk_level": item.risk_level,
    }
