import sys
from datetime import datetime, timedelta
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal, init_db
from models import BankAccount, CashflowForecast, ExpectedCollection, PaymentRequest, Project
from services.cashflow_service import recalculate_cashflow


def seed_database(db) -> None:
    db.query(CashflowForecast).delete()
    db.query(PaymentRequest).delete()
    db.query(ExpectedCollection).delete()
    db.query(Project).delete()
    db.query(BankAccount).delete()
    db.flush()

    now = datetime.now()
    today = now.date()

    accounts = [
        BankAccount(
            account_name="集团资金中心主账户",
            bank_name="中国建设银行",
            balance=8_500_000,
            available_balance=7_600_000,
            frozen_amount=900_000,
            updated_at=now,
        ),
        BankAccount(
            account_name="项目监管专户",
            bank_name="中国工商银行",
            balance=5_200_000,
            available_balance=4_500_000,
            frozen_amount=700_000,
            updated_at=now,
        ),
        BankAccount(
            account_name="农民工工资专户",
            bank_name="中国农业银行",
            balance=1_300_000,
            available_balance=850_000,
            frozen_amount=450_000,
            updated_at=now,
        ),
    ]
    db.add_all(accounts)

    projects = [
        Project(
            project_name="市政快速路改造工程",
            owner_type="政府单位",
            contract_amount=180_000_000,
            confirmed_output=92_000_000,
            billed_amount=65_000_000,
            collected_amount=42_000_000,
            risk_level="黄色",
        ),
        Project(
            project_name="城投安置房一期总承包",
            owner_type="平台公司",
            contract_amount=260_000_000,
            confirmed_output=138_000_000,
            billed_amount=96_000_000,
            collected_amount=70_000_000,
            risk_level="黄色",
        ),
        Project(
            project_name="民营产业园厂房项目",
            owner_type="民营业主",
            contract_amount=95_000_000,
            confirmed_output=54_000_000,
            billed_amount=38_000_000,
            collected_amount=16_000_000,
            risk_level="红色",
        ),
        Project(
            project_name="高新区学校EPC项目",
            owner_type="政府单位",
            contract_amount=150_000_000,
            confirmed_output=88_000_000,
            billed_amount=70_000_000,
            collected_amount=52_000_000,
            risk_level="绿色",
        ),
        Project(
            project_name="商业综合体机电安装",
            owner_type="民营业主",
            contract_amount=72_000_000,
            confirmed_output=45_000_000,
            billed_amount=33_000_000,
            collected_amount=20_500_000,
            risk_level="黄色",
        ),
        Project(
            project_name="地铁站附属土建工程",
            owner_type="平台公司",
            contract_amount=210_000_000,
            confirmed_output=116_000_000,
            billed_amount=88_000_000,
            collected_amount=61_000_000,
            risk_level="黄色",
        ),
        Project(
            project_name="人民医院扩建项目",
            owner_type="政府单位",
            contract_amount=130_000_000,
            confirmed_output=76_000_000,
            billed_amount=59_000_000,
            collected_amount=49_000_000,
            risk_level="绿色",
        ),
        Project(
            project_name="住宅小区精装修工程",
            owner_type="民营业主",
            contract_amount=68_000_000,
            confirmed_output=41_000_000,
            billed_amount=31_000_000,
            collected_amount=14_500_000,
            risk_level="红色",
        ),
    ]
    db.add_all(projects)
    db.flush()

    project_by_name = {project.project_name: project for project in projects}

    collections = [
        ("市政快速路改造工程", 3, 5_800_000, "付款节点已达成", "已开票", 28, 12),
        ("市政快速路改造工程", 18, 7_200_000, "已确权", "部分开票", 46, 20),
        ("城投安置房一期总承包", 6, 9_500_000, "已确权", "已开票", 72, 38),
        ("城投安置房一期总承包", 33, 12_000_000, "审计中", "部分开票", 88, 50),
        ("民营产业园厂房项目", 9, 4_200_000, "已确权", "未开票", 95, 64),
        ("民营产业园厂房项目", 27, 3_600_000, "审计中", "未开票", 121, 75),
        ("高新区学校EPC项目", 12, 8_100_000, "付款节点已达成", "已开票", 18, 8),
        ("高新区学校EPC项目", 41, 6_500_000, "已确权", "已开票", 29, 10),
        ("商业综合体机电安装", 7, 3_800_000, "已确权", "部分开票", 42, 22),
        ("商业综合体机电安装", 22, 4_100_000, "未到节点", "未开票", 20, 15),
        ("地铁站附属土建工程", 15, 10_800_000, "付款节点已达成", "已开票", 65, 32),
        ("地铁站附属土建工程", 58, 8_600_000, "审计中", "部分开票", 78, 45),
        ("人民医院扩建项目", 5, 6_900_000, "已确权", "已开票", 24, 9),
        ("住宅小区精装修工程", 11, 2_700_000, "已确权", "部分开票", 70, 52),
        ("住宅小区精装修工程", 36, 3_300_000, "审计中", "未开票", 112, 80),
    ]

    db.add_all(
        [
            ExpectedCollection(
                project_id=project_by_name[name].id,
                expected_date=today + timedelta(days=offset),
                amount=amount,
                collection_stage=stage,
                invoice_status=invoice,
                aging_days=aging,
                historical_delay_days=delay,
                ai_probability=0,
                risk_level="绿色",
            )
            for name, offset, amount, stage, invoice, aging, delay in collections
        ]
    )

    payments = [
        ("市政快速路改造工程", "华东劳务有限公司", "农民工工资", 2_800_000, -2, 20_000_000, 15_200_000, 11_300_000, True, True, "完整"),
        ("市政快速路改造工程", "杭城沥青材料公司", "材料款", 1_900_000, 4, 12_000_000, 8_500_000, 6_100_000, False, False, "完整"),
        ("市政快速路改造工程", "市政机械租赁站", "机械租赁", 760_000, 13, 4_000_000, 2_900_000, 2_400_000, False, False, "部分缺失"),
        ("城投安置房一期总承包", "皖北建筑劳务集团", "劳务分包", 3_600_000, 2, 36_000_000, 26_000_000, 18_600_000, False, True, "完整"),
        ("城投安置房一期总承包", "省税务局电子税务", "税款", 1_450_000, 5, 1_450_000, 1_450_000, 0, True, False, "完整"),
        ("城投安置房一期总承包", "安居防水专业分包", "专业分包", 2_400_000, 20, 10_000_000, 8_800_000, 7_700_000, False, False, "完整"),
        ("民营产业园厂房项目", "江南钢材贸易有限公司", "钢筋材料款", 2_200_000, -10, 9_000_000, 7_600_000, 6_900_000, False, False, "完整"),
        ("民营产业园厂房项目", "宏远劳务班组", "农民工工资", 1_600_000, 1, 11_000_000, 9_200_000, 7_100_000, True, True, "完整"),
        ("民营产业园厂房项目", "远达模板脚手架", "周转材料租赁", 820_000, 8, 3_600_000, 3_200_000, 2_950_000, False, False, "待补充"),
        ("高新区学校EPC项目", "校园机电安装分包", "专业分包", 2_100_000, 6, 14_000_000, 9_000_000, 5_500_000, False, False, "完整"),
        ("高新区学校EPC项目", "混凝土供应站", "混凝土材料款", 1_350_000, 16, 8_000_000, 6_500_000, 4_300_000, False, False, "完整"),
        ("商业综合体机电安装", "天成电缆有限公司", "材料款", 1_180_000, -5, 5_000_000, 4_200_000, 3_950_000, False, False, "部分缺失"),
        ("商业综合体机电安装", "机电安装劳务队", "劳务分包", 1_720_000, 3, 7_500_000, 5_300_000, 3_600_000, False, True, "完整"),
        ("地铁站附属土建工程", "轨道土方运输公司", "机械租赁", 1_260_000, 9, 6_000_000, 4_800_000, 3_700_000, False, False, "完整"),
        ("地铁站附属土建工程", "华中劳务有限公司", "农民工工资", 2_950_000, 7, 24_000_000, 19_000_000, 15_800_000, True, True, "完整"),
        ("地铁站附属土建工程", "盾构配套专业分包", "专业分包", 3_400_000, 29, 16_000_000, 12_500_000, 10_900_000, False, False, "完整"),
        ("人民医院扩建项目", "医建装饰分包", "专业分包", 1_850_000, 10, 9_000_000, 6_900_000, 4_700_000, False, False, "完整"),
        ("人民医院扩建项目", "省税务局电子税务", "税款", 980_000, 25, 980_000, 980_000, 0, True, False, "完整"),
        ("住宅小区精装修工程", "木作材料供应商", "材料款", 1_050_000, -18, 4_200_000, 3_700_000, 3_540_000, False, False, "缺失"),
        ("住宅小区精装修工程", "精装修劳务班组", "劳务分包", 1_420_000, 14, 6_800_000, 5_900_000, 4_700_000, False, True, "部分缺失"),
    ]

    db.add_all(
        [
            PaymentRequest(
                project_id=project_by_name[name].id,
                payee_name=payee,
                payment_type=payment_type,
                amount=amount,
                due_date=today + timedelta(days=offset),
                contract_amount=contract_amount,
                settled_amount=settled_amount,
                paid_amount=paid_amount,
                is_rigid_payment=is_rigid,
                is_labor_payment=is_labor,
                attachment_status=attachment_status,
                ai_score=0,
                suggestion="暂缓支付",
            )
            for (
                name,
                payee,
                payment_type,
                amount,
                offset,
                contract_amount,
                settled_amount,
                paid_amount,
                is_rigid,
                is_labor,
                attachment_status,
            ) in payments
        ]
    )

    db.commit()
    recalculate_cashflow(db, 90)


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
        print("已初始化AI资金驾驶舱模拟数据：3个账户、8个项目、15条预计回款、20条付款申请、90天预测。")
    finally:
        db.close()


if __name__ == "__main__":
    main()
