from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_name = Column(String(100), nullable=False)
    bank_name = Column(String(100), nullable=False)
    balance = Column(Float, nullable=False, default=0)
    available_balance = Column(Float, nullable=False, default=0)
    frozen_amount = Column(Float, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String(150), nullable=False)
    owner_type = Column(String(50), nullable=False)
    contract_amount = Column(Float, nullable=False, default=0)
    confirmed_output = Column(Float, nullable=False, default=0)
    billed_amount = Column(Float, nullable=False, default=0)
    collected_amount = Column(Float, nullable=False, default=0)
    risk_level = Column(String(20), nullable=False, default="绿色")

    expected_collections = relationship("ExpectedCollection", back_populates="project")
    payment_requests = relationship("PaymentRequest", back_populates="project")


class ExpectedCollection(Base):
    __tablename__ = "expected_collections"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    expected_date = Column(Date, nullable=False, index=True)
    amount = Column(Float, nullable=False, default=0)
    collection_stage = Column(String(60), nullable=False)
    invoice_status = Column(String(60), nullable=False)
    aging_days = Column(Integer, nullable=False, default=0)
    historical_delay_days = Column(Integer, nullable=False, default=0)
    ai_probability = Column(Float, nullable=False, default=0)
    risk_level = Column(String(20), nullable=False, default="绿色")

    project = relationship("Project", back_populates="expected_collections")


class PaymentRequest(Base):
    __tablename__ = "payment_requests"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    payee_name = Column(String(150), nullable=False)
    payment_type = Column(String(60), nullable=False)
    amount = Column(Float, nullable=False, default=0)
    due_date = Column(Date, nullable=False, index=True)
    contract_amount = Column(Float, nullable=False, default=0)
    settled_amount = Column(Float, nullable=False, default=0)
    paid_amount = Column(Float, nullable=False, default=0)
    is_rigid_payment = Column(Boolean, nullable=False, default=False)
    is_labor_payment = Column(Boolean, nullable=False, default=False)
    attachment_status = Column(String(60), nullable=False, default="完整")
    ai_score = Column(Float, nullable=False, default=0)
    suggestion = Column(String(60), nullable=False, default="暂缓支付")

    project = relationship("Project", back_populates="payment_requests")


class CashflowForecast(Base):
    __tablename__ = "cashflow_forecasts"

    id = Column(Integer, primary_key=True, index=True)
    forecast_date = Column(Date, nullable=False, index=True, unique=True)
    opening_balance = Column(Float, nullable=False, default=0)
    expected_collection = Column(Float, nullable=False, default=0)
    planned_payment = Column(Float, nullable=False, default=0)
    rigid_payment = Column(Float, nullable=False, default=0)
    ending_balance = Column(Float, nullable=False, default=0)
    risk_level = Column(String(20), nullable=False, default="绿色")
