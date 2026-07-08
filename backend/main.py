import os
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from data.seed_data import seed_database
from database import get_db, init_db
from models import BankAccount, ExpectedCollection, PaymentRequest, Project
from schemas import (
    AIProviderConfigIn,
    BankAccountCreate,
    BankAccountOut,
    ExpectedCollectionCreate,
    ExpectedCollectionOut,
    PaymentRequestCreate,
    PaymentRequestOut,
    ProjectCreate,
    ProjectMasterOut,
    ProjectOut,
    RecalculateOut,
)
from services.cashflow_service import get_cashflow_forecast, recalculate_cashflow, serialize_forecast
from services.external_ai_service import get_ai_provider_status, set_ai_provider_config
from services.report_service import (
    build_ai_report,
    build_dashboard_summary,
    build_payment_priority,
    build_project_risk,
)


app = FastAPI(
    title="AI资金驾驶舱：建筑企业资金计划预测与付款优先级决策系统",
    version="0.1.0",
)

default_cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
extra_cors_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=default_cors_origins + extra_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIST = Path(
    os.getenv("FRONTEND_DIST", Path(__file__).resolve().parent.parent / "frontend" / "dist")
)
FRONTEND_INDEX = FRONTEND_DIST / "index.html"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS), name="assets")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    db = next(get_db())
    try:
        if db.query(BankAccount).count() == 0:
            seed_database(db)
    finally:
        db.close()


@app.get("/api/health")
def health_check() -> dict:
    return {"status": "ok", "system": "AI资金驾驶舱"}


@app.get("/api/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)) -> dict:
    return build_dashboard_summary(db)


@app.get("/api/cashflow/forecast")
def cashflow_forecast(
    days: int = Query(default=30, ge=1, le=90),
    db: Session = Depends(get_db),
) -> list[dict]:
    forecasts = get_cashflow_forecast(db, days)
    return [serialize_forecast(item) for item in forecasts]


@app.get("/api/payments/priority")
def payments_priority(db: Session = Depends(get_db)) -> list[dict]:
    return build_payment_priority(db)


@app.get("/api/projects/risk")
def projects_risk(db: Session = Depends(get_db)) -> list[dict]:
    return build_project_risk(db)


@app.get("/api/reports/ai-summary")
def ai_report(
    mode: str = Query(default="local", pattern="^(local|external|auto)$"),
    db: Session = Depends(get_db),
) -> dict:
    return build_ai_report(db, mode)


@app.get("/api/ai/provider-status")
def ai_provider_status() -> dict:
    return get_ai_provider_status()


@app.put("/api/ai/provider-config")
def update_ai_provider_config(payload: AIProviderConfigIn) -> dict:
    return set_ai_provider_config(payload.model_dump())


def _serialize_project_master(project: Project) -> dict:
    payment_requests = list(project.payment_requests)
    collection_rate = project.collected_amount / project.contract_amount if project.contract_amount else 0
    return {
        "id": project.id,
        "project_name": project.project_name,
        "owner_type": project.owner_type,
        "contract_amount": project.contract_amount,
        "confirmed_output": project.confirmed_output,
        "billed_amount": project.billed_amount,
        "collected_amount": project.collected_amount,
        "collection_rate": round(collection_rate, 4),
        "risk_level": project.risk_level,
        "expected_collection_count": len(project.expected_collections),
        "payment_request_count": len(payment_requests),
        "unpaid_payment_amount": sum(item.amount for item in payment_requests),
    }


@app.get("/api/master-data/projects", response_model=list[ProjectMasterOut])
def master_data_projects(db: Session = Depends(get_db)) -> list[dict]:
    projects = db.query(Project).order_by(Project.id.asc()).all()
    return [_serialize_project_master(project) for project in projects]


@app.get("/api/master-data/projects/{project_id}", response_model=ProjectMasterOut)
def master_data_project(project_id: int, db: Session = Depends(get_db)) -> dict:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return _serialize_project_master(project)


@app.post("/api/master-data/projects", response_model=ProjectMasterOut)
def create_master_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> dict:
    project = Project(**payload.model_dump(), risk_level="绿色")
    db.add(project)
    db.commit()
    db.refresh(project)
    recalculate_cashflow(db, 90)
    db.refresh(project)
    return _serialize_project_master(project)


@app.put("/api/master-data/projects/{project_id}", response_model=ProjectMasterOut)
def update_master_project(
    project_id: int,
    payload: ProjectCreate,
    db: Session = Depends(get_db),
) -> dict:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    for key, value in payload.model_dump().items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    recalculate_cashflow(db, 90)
    db.refresh(project)
    return _serialize_project_master(project)


@app.delete("/api/master-data/projects/{project_id}")
def delete_master_project(project_id: int, db: Session = Depends(get_db)) -> dict:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.expected_collections or project.payment_requests:
        raise HTTPException(status_code=409, detail="项目已有回款或付款数据，不能直接删除")

    db.delete(project)
    db.commit()
    recalculate_cashflow(db, 90)
    return {"success": True, "message": "项目已删除，现金流预测已重算。"}


@app.get("/api/data-entry/accounts", response_model=list[BankAccountOut])
def data_entry_accounts(db: Session = Depends(get_db)) -> list[BankAccount]:
    return db.query(BankAccount).order_by(BankAccount.id.asc()).all()


@app.post("/api/data-entry/accounts", response_model=BankAccountOut)
def create_bank_account(payload: BankAccountCreate, db: Session = Depends(get_db)) -> BankAccount:
    account = BankAccount(**payload.model_dump(), updated_at=datetime.now())
    db.add(account)
    db.commit()
    db.refresh(account)
    recalculate_cashflow(db, 90)
    db.refresh(account)
    return account


@app.put("/api/data-entry/accounts/{account_id}", response_model=BankAccountOut)
def update_bank_account(
    account_id: int,
    payload: BankAccountCreate,
    db: Session = Depends(get_db),
) -> BankAccount:
    account = db.get(BankAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="账户不存在")

    for key, value in payload.model_dump().items():
        setattr(account, key, value)
    account.updated_at = datetime.now()
    db.commit()
    db.refresh(account)
    recalculate_cashflow(db, 90)
    db.refresh(account)
    return account


@app.get("/api/data-entry/projects", response_model=list[ProjectOut])
def data_entry_projects(db: Session = Depends(get_db)) -> list[Project]:
    return db.query(Project).order_by(Project.id.asc()).all()


@app.post("/api/data-entry/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> Project:
    project = Project(**payload.model_dump(), risk_level="绿色")
    db.add(project)
    db.commit()
    db.refresh(project)
    recalculate_cashflow(db, 90)
    db.refresh(project)
    return project


@app.post("/api/data-entry/collections", response_model=ExpectedCollectionOut)
def create_expected_collection(
    payload: ExpectedCollectionCreate,
    db: Session = Depends(get_db),
) -> ExpectedCollection:
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    collection = ExpectedCollection(
        **payload.model_dump(),
        ai_probability=0,
        risk_level="绿色",
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    recalculate_cashflow(db, 90)
    db.refresh(collection)
    return collection


@app.post("/api/data-entry/payments", response_model=PaymentRequestOut)
def create_payment_request(
    payload: PaymentRequestCreate,
    db: Session = Depends(get_db),
) -> PaymentRequest:
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    payment = PaymentRequest(
        **payload.model_dump(),
        ai_score=0,
        suggestion="暂缓支付",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    recalculate_cashflow(db, 90)
    db.refresh(payment)
    return payment


@app.post("/api/recalculate", response_model=RecalculateOut)
def recalculate(db: Session = Depends(get_db)) -> RecalculateOut:
    forecasts = recalculate_cashflow(db, 90)
    return RecalculateOut(
        success=True,
        message="已完成回款可信度、付款优先级和未来90天现金流预测重算。",
        forecast_days=len(forecasts),
    )


@app.get("/", include_in_schema=False)
def serve_frontend_root():
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return health_check()


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")

    requested_file = FRONTEND_DIST / full_path
    if requested_file.is_file():
        return FileResponse(requested_file)

    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)

    raise HTTPException(status_code=404, detail="Not Found")
