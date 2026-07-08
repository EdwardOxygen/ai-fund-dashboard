from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BankAccountOut(OrmBase):
    id: int
    account_name: str
    bank_name: str
    balance: float
    available_balance: float
    frozen_amount: float
    updated_at: datetime


class BankAccountCreate(BaseModel):
    account_name: str = Field(min_length=1, max_length=100)
    bank_name: str = Field(min_length=1, max_length=100)
    balance: float = Field(ge=0)
    available_balance: float = Field(ge=0)
    frozen_amount: float = Field(default=0, ge=0)


class ProjectOut(OrmBase):
    id: int
    project_name: str
    owner_type: str
    contract_amount: float
    confirmed_output: float
    billed_amount: float
    collected_amount: float
    risk_level: str


class ProjectCreate(BaseModel):
    project_name: str = Field(min_length=1, max_length=150)
    owner_type: str = Field(min_length=1, max_length=50)
    contract_amount: float = Field(ge=0)
    confirmed_output: float = Field(default=0, ge=0)
    billed_amount: float = Field(default=0, ge=0)
    collected_amount: float = Field(default=0, ge=0)


class ProjectMasterOut(BaseModel):
    id: int
    project_name: str
    owner_type: str
    contract_amount: float
    confirmed_output: float
    billed_amount: float
    collected_amount: float
    collection_rate: float
    risk_level: str
    expected_collection_count: int
    payment_request_count: int
    unpaid_payment_amount: float


class ExpectedCollectionOut(OrmBase):
    id: int
    project_id: int
    expected_date: date
    amount: float
    collection_stage: str
    invoice_status: str
    aging_days: int
    historical_delay_days: int
    ai_probability: float
    risk_level: str


class ExpectedCollectionCreate(BaseModel):
    project_id: int = Field(gt=0)
    expected_date: date
    amount: float = Field(gt=0)
    collection_stage: str = Field(min_length=1, max_length=60)
    invoice_status: str = Field(min_length=1, max_length=60)
    aging_days: int = Field(default=0, ge=0)
    historical_delay_days: int = Field(default=0, ge=0)


class PaymentRequestOut(OrmBase):
    id: int
    project_id: int
    payee_name: str
    payment_type: str
    amount: float
    due_date: date
    contract_amount: float
    settled_amount: float
    paid_amount: float
    is_rigid_payment: bool
    is_labor_payment: bool
    attachment_status: str
    ai_score: float
    suggestion: str


class PaymentRequestCreate(BaseModel):
    project_id: int = Field(gt=0)
    payee_name: str = Field(min_length=1, max_length=150)
    payment_type: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0)
    due_date: date
    contract_amount: float = Field(default=0, ge=0)
    settled_amount: float = Field(default=0, ge=0)
    paid_amount: float = Field(default=0, ge=0)
    is_rigid_payment: bool = False
    is_labor_payment: bool = False
    attachment_status: str = Field(default="完整", min_length=1, max_length=60)


class CashflowForecastOut(OrmBase):
    id: int
    forecast_date: date
    opening_balance: float
    expected_collection: float
    planned_payment: float
    rigid_payment: float
    ending_balance: float
    risk_level: str


class PaymentPriorityOut(BaseModel):
    id: int
    project_name: str
    payee_name: str
    payment_type: str
    amount: float
    due_date: date
    paid_ratio: float
    ai_score: float
    suggestion: str
    risk_reason: str
    risk_reasons: List[str]


class ProjectRiskOut(BaseModel):
    id: int
    project_name: str
    owner_type: str
    contract_amount: float
    confirmed_output: float
    billed_amount: float
    collected_amount: float
    collection_rate: float
    risk_level: str
    collection_risk: str
    payment_risk: str
    ai_hint: str


class AIProviderConfigIn(BaseModel):
    provider: str = Field(default="minimax", pattern="^minimax$")
    api_key: Optional[str] = Field(default=None, max_length=1000)
    base_url: str = Field(default="https://api.minimaxi.com/anthropic", min_length=1, max_length=300)
    model: str = Field(default="MiniMax-M3", min_length=1, max_length=100)
    timeout_seconds: float = Field(default=30, ge=5, le=120)


class RecalculateOut(BaseModel):
    success: bool
    message: str
    forecast_days: Optional[int] = None
