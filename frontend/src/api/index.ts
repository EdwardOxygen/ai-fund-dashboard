import {
  simulate,
  SCENARIOS,
  localDate,
  accountPool,
  paymentPriorityCost,
  isRigid,
  type CollectionTerms,
  type PaymentTerms,
  type FundScope,
} from "../domain/simulation";
import { forecastBasis, forecastView } from "../domain/forecast";
import { EXTERNAL_AI_ENABLED } from "../config/features";
import {
  buildProjectSchedule,
  projectReceiptStatus,
  validateProjectPlan,
  shiftDate,
  type ProjectPlan,
} from "../domain/projectPlanning";
import { dataTemplates, type DataCategory } from "../domain/dataTemplates";
/*
 * 本地业务引擎：除“外部 AI 报告”外，系统不再调用任何业务 API。
 * 真实数据由用户在页面录入，计算在浏览器完成，并保存在当前浏览器中。
 */
export const API_BASE_URL = "";
export type RiskLevel = "绿色" | "黄色" | "红色" | "重大风险";

export interface CashflowForecast {
  id: number;
  forecast_date: string;
  opening_balance: number;
  expected_collection: number;
  planned_payment: number;
  rigid_payment: number;
  ending_balance: number;
  general_balance: number;
  risk_level: RiskLevel;
}
export interface BankAccount {
  scope?: FundScope;
  project_id?: number;
  id: number;
  account_name: string;
  bank_name: string;
  balance: number;
  available_balance: number;
  frozen_amount: number;
  updated_at: string;
}
export interface Project {
  id: number;
  project_name: string;
  owner_type: string;
  contract_amount: number;
  confirmed_output: number;
  billed_amount: number;
  collected_amount: number;
  risk_level: RiskLevel;
  plan?: ProjectPlan;
}
export interface ProjectMaster extends Project {
  collection_rate: number;
  expected_collection_count: number;
  payment_request_count: number;
  unpaid_payment_amount: number;
}
export interface PaymentPriority {
  priority_weight: number;
  weighted_score: number;
  id: number;
  project_name: string;
  payee_name: string;
  payment_type: string;
  amount: number;
  due_date: string;
  paid_ratio: number;
  ai_score: number;
  suggestion: string;
  risk_reason: string;
  risk_reasons: string[];
}
export interface ExpectedCollection extends CollectionTerms {
  generated?: boolean;
  calculation_note?: string;
  id: number;
  project_id: number;
  expected_date: string;
  amount: number;
  collection_stage: string;
  invoice_status: string;
  aging_days: number;
  historical_delay_days: number;
  ai_probability: number;
  risk_level: RiskLevel;
}
export interface PaymentRequest extends PaymentTerms {
  generated?: boolean;
  priority_weight?: number;
  calculation_note?: string;
  id: number;
  project_id: number;
  payee_name: string;
  payment_type: string;
  amount: number;
  due_date: string;
  contract_amount: number;
  settled_amount: number;
  paid_amount: number;
  is_rigid_payment: boolean;
  is_labor_payment: boolean;
  attachment_status: string;
  ai_score: number;
  suggestion: string;
}
export interface ProjectRisk {
  outstanding_amount?: number;
  overdue_amount?: number;
  overdue_days?: number;
  collection_basis?: string;
  id: number;
  project_name: string;
  owner_type: string;
  contract_amount: number;
  confirmed_output: number;
  billed_amount: number;
  collected_amount: number;
  collection_rate: number;
  risk_level: RiskLevel;
  collection_risk: string;
  payment_risk: string;
  ai_hint: string;
}
export interface DashboardSummary {
  current_available_funds: number;
  gap_7d: number;
  gap_30d: number;
  gap_90d: number;
  high_risk_project_count: number;
  pending_payment_amount: number;
  suggested_week_payment_amount: number;
  fund_risk_level: RiskLevel;
  safety_line: number;
  cashflow_trend: Array<{
    date: string;
    ending_balance: number;
    risk_level: RiskLevel;
  }>;
  top_payments: PaymentPriority[];
  high_risk_projects: ProjectRisk[];
  ai_summary: string;
}
export interface AiReport {
  generated_at: string;
  report: string;
  report_source: "local" | "external";
  provider: string;
  model: string;
  fallback_reason: string | null;
  metrics: {
    current_available_funds: number;
    gap_7d: number;
    gap_30d: number;
    high_risk_project_count: number;
  };
}
export interface AiProviderStatus {
  provider: string;
  minimax_configured: boolean;
  minimax_base_url: string;
  minimax_model: string;
  minimax_protocol: "anthropic" | "openai";
  runtime_configured: boolean;
}
export interface AiProviderConfigPayload {
  provider: "minimax";
  api_key?: string;
  base_url: string;
  model: string;
  timeout_seconds: number;
}
export interface BankAccountPayload {
  scope?: FundScope;
  project_id?: number;
  account_name: string;
  bank_name: string;
  balance: number;
  available_balance: number;
  frozen_amount: number;
}
export interface ProjectPayload {
  project_name: string;
  owner_type: string;
  contract_amount: number;
  confirmed_output: number;
  billed_amount: number;
  collected_amount: number;
}
export interface ExpectedCollectionPayload extends CollectionTerms {
  project_id: number;
  expected_date: string;
  amount: number;
  collection_stage: string;
  invoice_status: string;
  aging_days: number;
  historical_delay_days: number;
}
export interface PaymentRequestPayload extends PaymentTerms {
  project_id: number;
  payee_name: string;
  payment_type: string;
  amount: number;
  due_date: string;
  contract_amount: number;
  settled_amount: number;
  paid_amount: number;
  is_rigid_payment: boolean;
  is_labor_payment: boolean;
  attachment_status: string;
}
export interface PredictionRuleSection {
  title: string;
  formula: string;
  variables: string[];
  rules: string[];
}

export type LocalStore = {
  planning_warnings?: string[];
  data_mode?: "demo" | "manual";
  accounts: BankAccount[];
  projects: Project[];
  collections: ExpectedCollection[];
  payments: PaymentRequest[];
};
const STORAGE_KEY = "ai-fund-dashboard-local-v3";
export const SAFETY_LINE = 0;
let aiConfig: AiProviderConfigPayload | null = null;

export const PREDICTION_RULES: PredictionRuleSection[] = [
  {
    title: "项目预测与公司预测",
    formula:
      "项目期末存贷差＝项目期初存贷差＋项目收款－项目合同应付；公司期末余额＝账户期初可用资金＋公司计入收款－全部项目合同应付",
    variables: [
      "项目存贷差是归属账，不是银行余额，不能再叠加到公司期初。",
      "公司收款要求指定已分类账户；项目自身合同应收不因账户未分类而消失，未分类收款在公司核对表单列。",
    ],
    rules: [
      "公司合并要求启用合同计划的项目基准日一致，不将不同日期的期初状态混用。",
      "预测默认从已填报基准日开始；重开网页不会自行把历史回款提前到今天。",
    ],
  },
  {
    title: "累计收款与预付款",
    formula:
      "累计进度目标＝累计产值×进度比例＋未扣预付款；新增回款＝max(0,累计目标－此前累计已收)",
    variables: [
      "竣工、结算、质保均按累计支付目标补差，不把80%、90%、97%独立相加。",
      "累计产值达到设定门槛后，当期按设置比例扣回预付款，直至扣清；不超过未扣余额和当期可扣进度款。",
    ],
    rules: [
      "历史实收只作为期初状态，未来收款不重复计入。",
      "只有超过合同应收日的待收才是逾期；未到期尾款不是当前欠款。",
      "剩余产值支持手工逐月、均匀分配与S形曲线，均为计划，不是机器学习预测。",
    ],
  },
  {
    title: "分包付款",
    formula: "详细模式按累计目标补差；简易模式按剩余估算额与剩余期间分配",
    variables: [
      "付款由分包进场、完工、账期和各阶段累计比例生成。",
      "项目重要系数与分包优先系数各为1至5。",
    ],
    rules: [
      "资料未齐不删除义务，但统筹时不安排。",
      "本期预测只计本期到期义务，未来全部合同尾款不直接用于判定当前高风险。",
    ],
  },
  {
    title: "公司付款统筹",
    formula:
      "非刚性未付惩罚＝10000×项目重要系数×分包优先系数×(1＋min(逾期天数,90)÷30)",
    variables: [
      "刚性义务使用10亿高惩罚，优先保障但不突破现金和用途约束。",
      "不再按旧版AI分数给出立即支付、部分支付等指令；只有优化生成的金额经过约束。",
    ],
    rules: [
      "账户不得透支，工资和项目专户不得挪用；考虑整笔、最低分期、资料和付款窗口。",
      "最多90天、100笔到期义务限时求解；可行不等于全局最优。",
      "未安排款项保留，安排后余额改善不等于盈利或免除债务；最终须人工审批。",
    ],
  },
  {
    title: "垫资边界",
    formula: "允许垫资期间：项目存贷差≥－额度；期限外：项目存贷差≥0",
    variables: [
      "单项目预测显示合同按期全付下的垫资峰值和首次超限日期。",
      "公司统筹显示建议付款后的项目存贷差，不得与合同基准结果混淆。",
    ],
    rules: [
      "逐日检查，不只看月末；允许期间包含起止日，截止日次日起须回正。",
      "公司有钱不等于项目可无限垫资，期初已超限也须明确提示。",
    ],
  },
  {
    title: "筹资需求与安全储备",
    formula:
      "筹资需求＝max(0,－最低一般资金余额)；安全储备不足＝max(0,安全储备－最低一般资金余额)",
    variables: [
      "安全储备为用户可选参数，默认0，不再隐含固定300万元。",
      "安全储备不足已包含可能的筹资需求，两者不可相加。",
    ],
    rules: [
      "公司合计余额包含已分类专户，一般资金单列；专户有钱仍可能不能支付其他用途。",
      "情景按项目逐条新增，每个项目可分别设置回款延迟、未来节点延迟、材料付款增幅；未添加项目按原计划，不改变公司汇总范围。",
      "同项目回款延迟与未来工程节点延迟在适用的回款上相加；节点延迟不自动平移分包付款。情景可带入付款统筹，界面明确标识。",
      "外部AI接口保留关闭，核心预测、优化和说明均在本地执行。",
    ],
  },
];

function dateAt(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDate(d);
}
function today(): string {
  return dateAt(0);
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function num(v: unknown): number {
  return Number(v || 0);
}
function bool(v: unknown): boolean {
  return v === true || v === 1;
}
function broadcast(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("fund-dashboard-refresh"));
}

function demoStore(): LocalStore {
  const accounts: BankAccount[] = [
    {
      id: 1,
      account_name: "集团资金中心主账户",
      bank_name: "中国建设银行",
      balance: 8500000,
      available_balance: 7600000,
      frozen_amount: 900000,
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      account_name: "项目监管专户",
      bank_name: "中国工商银行",
      balance: 5200000,
      available_balance: 4500000,
      frozen_amount: 700000,
      updated_at: new Date().toISOString(),
    },
    {
      id: 3,
      account_name: "农民工工资专户",
      bank_name: "中国农业银行",
      balance: 1300000,
      available_balance: 850000,
      frozen_amount: 450000,
      updated_at: new Date().toISOString(),
    },
  ];
  const projectRows: Array<
    [number, string, string, number, number, number, number]
  > = [
    [
      1,
      "市政快速路改造工程",
      "政府单位",
      180000000,
      92000000,
      65000000,
      42000000,
    ],
    [
      2,
      "城投安置房一期总承包",
      "平台公司",
      260000000,
      138000000,
      96000000,
      70000000,
    ],
    [
      3,
      "民营产业园厂房项目",
      "民营业主",
      95000000,
      54000000,
      38000000,
      16000000,
    ],
    [
      4,
      "高新区学校EPC项目",
      "政府单位",
      150000000,
      88000000,
      70000000,
      52000000,
    ],
    [
      5,
      "商业综合体机电安装",
      "民营业主",
      72000000,
      45000000,
      33000000,
      20500000,
    ],
    [
      6,
      "地铁站附属土建工程",
      "平台公司",
      210000000,
      116000000,
      88000000,
      61000000,
    ],
    [
      7,
      "人民医院扩建项目",
      "政府单位",
      130000000,
      76000000,
      59000000,
      49000000,
    ],
    [
      8,
      "住宅小区精装修工程",
      "民营业主",
      68000000,
      41000000,
      31000000,
      14500000,
    ],
  ];
  const projects: Project[] = projectRows.map(
    ([
      id,
      project_name,
      owner_type,
      contract_amount,
      confirmed_output,
      billed_amount,
      collected_amount,
    ]) => ({
      id,
      project_name,
      owner_type,
      contract_amount,
      confirmed_output,
      billed_amount,
      collected_amount,
      risk_level: "绿色",
    }),
  );
  const collectionRows: Array<
    [number, number, number, number, string, string, number, number]
  > = [
    [1, 1, 3, 5800000, "付款节点已达成", "已开票", 28, 12],
    [2, 1, 18, 7200000, "已确权", "部分开票", 46, 20],
    [3, 2, 6, 9500000, "已确权", "已开票", 72, 38],
    [4, 2, 33, 12000000, "审计中", "部分开票", 88, 50],
    [5, 3, 9, 4200000, "已确权", "未开票", 95, 64],
    [6, 3, 27, 3600000, "审计中", "未开票", 121, 75],
    [7, 4, 12, 8100000, "付款节点已达成", "已开票", 18, 8],
    [8, 4, 41, 6500000, "已确权", "已开票", 29, 10],
    [9, 5, 7, 3800000, "已确权", "部分开票", 42, 22],
    [10, 6, 15, 10800000, "付款节点已达成", "已开票", 65, 32],
    [11, 6, 58, 8600000, "审计中", "部分开票", 78, 45],
    [12, 8, 11, 2700000, "已确权", "部分开票", 70, 52],
  ];
  const collections = collectionRows.map(
    ([
      id,
      project_id,
      offset,
      amount,
      collection_stage,
      invoice_status,
      aging_days,
      historical_delay_days,
    ]) => ({
      id,
      project_id,
      expected_date: dateAt(offset),
      amount,
      collection_stage,
      invoice_status,
      aging_days,
      historical_delay_days,
      ai_probability: 0,
      risk_level: "绿色" as RiskLevel,
    }),
  );
  const paymentRows: Array<
    [
      number,
      number,
      string,
      string,
      number,
      number,
      number,
      number,
      number,
      boolean,
      boolean,
      string,
    ]
  > = [
    [
      1,
      1,
      "华东劳务有限公司",
      "农民工工资",
      2800000,
      -2,
      20000000,
      15200000,
      11300000,
      true,
      true,
      "完整",
    ],
    [
      2,
      1,
      "杭城沥青材料公司",
      "材料款",
      1900000,
      4,
      12000000,
      8500000,
      6100000,
      false,
      false,
      "完整",
    ],
    [
      3,
      2,
      "皖北建筑劳务集团",
      "劳务分包",
      3600000,
      2,
      36000000,
      26000000,
      18600000,
      false,
      true,
      "完整",
    ],
    [
      4,
      2,
      "省税务局电子税务",
      "税款",
      1450000,
      5,
      1450000,
      1450000,
      0,
      true,
      false,
      "完整",
    ],
    [
      5,
      3,
      "宏远劳务班组",
      "农民工工资",
      1600000,
      1,
      11000000,
      9200000,
      7100000,
      true,
      true,
      "完整",
    ],
    [
      6,
      3,
      "远达模板脚手架",
      "周转材料租赁",
      820000,
      8,
      3600000,
      3200000,
      2950000,
      false,
      false,
      "待补充",
    ],
    [
      7,
      4,
      "校园机电安装分包",
      "专业分包",
      2100000,
      6,
      14000000,
      9000000,
      5500000,
      false,
      false,
      "完整",
    ],
    [
      8,
      5,
      "天成电缆有限公司",
      "材料款",
      1180000,
      -5,
      5000000,
      4200000,
      3950000,
      false,
      false,
      "部分缺失",
    ],
    [
      9,
      6,
      "华中劳务有限公司",
      "农民工工资",
      2950000,
      7,
      24000000,
      19000000,
      15800000,
      true,
      true,
      "完整",
    ],
    [
      10,
      6,
      "盾构配套专业分包",
      "专业分包",
      3400000,
      29,
      16000000,
      12500000,
      10900000,
      false,
      false,
      "完整",
    ],
    [
      11,
      7,
      "省税务局电子税务",
      "税款",
      980000,
      25,
      980000,
      980000,
      0,
      true,
      false,
      "完整",
    ],
    [
      12,
      8,
      "精装修劳务班组",
      "劳务分包",
      1420000,
      14,
      6800000,
      5900000,
      4700000,
      false,
      true,
      "部分缺失",
    ],
  ];
  const payments = paymentRows.map(
    ([
      id,
      project_id,
      payee_name,
      payment_type,
      amount,
      offset,
      contract_amount,
      settled_amount,
      paid_amount,
      is_rigid_payment,
      is_labor_payment,
      attachment_status,
    ]) => ({
      id,
      project_id,
      payee_name,
      payment_type,
      amount,
      due_date: dateAt(offset),
      contract_amount,
      settled_amount,
      paid_amount,
      is_rigid_payment,
      is_labor_payment,
      attachment_status,
      ai_score: 0,
      suggestion: "暂缓支付",
    }),
  );
  return {
    data_mode: "demo",
    accounts: accounts.map((a) => ({
      ...a,
      scope: a.id === 3 ? "payroll" : a.id === 2 ? "project" : "general",
      ...(a.id === 2 ? { project_id: 1 } : {}),
    })),
    projects,
    collections: collections.map((c) => ({ ...c, receipt_account_id: 1 })),
    payments,
  };
}

function readStore(): LocalStore {
  if (typeof window === "undefined") return demoStore();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const store = JSON.parse(raw);
      validateStore(store);
      return store;
    } catch {
      throw new Error(
        "本地数据无法读取，请先导出原始备份，再恢复有效数据；系统未覆盖原数据。",
      );
    }
  }
  const initial = demoStore();
  writeStore(initial);
  return initial;
}
function validateStore(value: unknown): asserts value is LocalStore {
  if (!value || typeof value !== "object") throw new Error("备份结构无效");
  const store = value as LocalStore;
  for (const key of [
    "accounts",
    "projects",
    "collections",
    "payments",
  ] as const) {
    if (!Array.isArray(store[key])) throw new Error("缺少数据列表：" + key);
    const ids = new Set<number>();
    for (const row of store[key]) {
      if (!row || typeof row !== "object") throw new Error("数据行无效");
      if (!Number.isInteger(row.id) || row.id <= 0 || ids.has(row.id))
        throw new Error("数据编号无效或重复");
      ids.add(row.id);
      for (const [field, v] of Object.entries(row))
        if (typeof v === "number" && (!Number.isFinite(v) || v < 0))
          throw new Error(field + "不能为负数或无效数值");
    }
  }
  const numericFields = {
    accounts: ["balance", "available_balance", "frozen_amount"],
    projects: [
      "contract_amount",
      "confirmed_output",
      "billed_amount",
      "collected_amount",
    ],
    collections: ["amount", "aging_days", "historical_delay_days"],
    payments: ["amount", "contract_amount", "settled_amount", "paid_amount"],
  };
  for (const key of [
    "accounts",
    "projects",
    "collections",
    "payments",
  ] as const) {
    if (store[key].length > 10000) throw new Error("单类数据不能超过10000条");
    for (const row of store[key])
      for (const field of numericFields[key]) {
        const v = (row as unknown as Record<string, unknown>)[field];
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e12)
          throw new Error(field + "须为有效非负金额或数值");
      }
  }
  const projects = new Set(store.projects.map((p) => p.id));
  const textFields = {
    accounts: ["account_name", "bank_name"],
    projects: ["project_name", "owner_type"],
    collections: ["collection_stage", "invoice_status"],
    payments: ["payee_name", "payment_type", "attachment_status"],
  };
  for (const key of [
    "accounts",
    "projects",
    "collections",
    "payments",
  ] as const)
    for (const row of store[key])
      for (const field of textFields[key]) {
        const v = (row as unknown as Record<string, unknown>)[field];
        if (typeof v !== "string" || !v.trim() || v.length > 500)
          throw new Error(`${key}编号${row.id}：${field}不能为空或过长`);
      }
  for (const project of store.projects)
    if (project.plan) {
      validateProjectPlan(project.plan, project.contract_amount);
      if (
        project.plan.enabled &&
        !store.accounts.some(
          (a) =>
            a.id === project.plan?.receipt_account_id &&
            (a.scope === "general" ||
              (a.scope === "project" && a.project_id === project.id)),
        )
      )
        throw new Error("项目收款须绑定一般账户或本项目专户");
    }
  for (const row of [...store.collections, ...store.payments])
    if (!projects.has(row.project_id))
      throw new Error("回款或付款引用不存在的项目");
  for (const row of store.collections) {
    if (
      !validDate(row.expected_date) ||
      (row.milestone_date && !validDate(row.milestone_date)) ||
      (row.retention_date && !validDate(row.retention_date))
    )
      throw new Error("回款日期无效");
    for (const v of [
      row.first_receipt_ratio,
      row.retention_ratio,
      row.receipt_account_id,
    ])
      if (
        v !== undefined &&
        (typeof v !== "number" || !Number.isFinite(v) || v < 0)
      )
        throw new Error("回款条件须为有效非负数值");
    if (
      (row.first_receipt_ratio ?? 100) > 100 ||
      (row.retention_ratio ?? 0) > 100
    )
      throw new Error("分期比例和质保金比例应在0至100之间");
    if (
      row.receipt_account_id &&
      !store.accounts.some((a) => a.id === row.receipt_account_id)
    )
      throw new Error("收款账户不存在");
    for (const n of [
      row.certification_days,
      row.payment_days,
      row.installment_gap_days,
    ])
      if (n !== undefined && (!Number.isInteger(n) || n > 3650))
        throw new Error("节点天数应为0至3650的整数");
  }
  for (const row of store.payments) {
    if (
      typeof row.is_rigid_payment !== "boolean" ||
      typeof row.is_labor_payment !== "boolean"
    )
      throw new Error("付款刚性与劳务标记须为是或否");
    if (
      row.priority_weight !== undefined &&
      (!Number.isFinite(row.priority_weight) ||
        row.priority_weight < 1 ||
        row.priority_weight > 25)
    )
      throw new Error("付款综合系数须在1至25之间");
    if (
      !validDate(row.due_date) ||
      (row.latest_payment_date &&
        (!validDate(row.latest_payment_date) ||
          row.latest_payment_date < row.due_date))
    )
      throw new Error("最迟付款日不得早于到期日");
    if (
      row.minimum_installment !== undefined &&
      (typeof row.minimum_installment !== "number" ||
        !Number.isFinite(row.minimum_installment) ||
        row.minimum_installment < 0)
    )
      throw new Error("最低分期金额无效");
    if (row.allow_split !== undefined && typeof row.allow_split !== "boolean")
      throw new Error("分期标记无效");
    if ((row.minimum_installment || 0) > row.amount)
      throw new Error("最低分期金额不得超过申请金额");
  }
  for (const a of store.accounts) {
    if (
      a.scope &&
      !["general", "payroll", "project", "unassigned"].includes(a.scope)
    )
      throw new Error("账户用途无效");
    if (a.available_balance + a.frozen_amount > a.balance + 0.01)
      throw new Error("可用余额加冻结金额不能超过账户余额");
    if (a.scope === "project" && !projects.has(a.project_id || 0))
      throw new Error("项目专户必须绑定项目");
  }
}
function validDate(s: string) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
function writeStore(store: LocalStore): void {
  if (typeof window !== "undefined")
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
function mutate<T>(fn: (store: LocalStore) => T): T {
  const store = readStore();
  const result = fn(store);
  store.data_mode = "manual";
  validateStore(store);
  recalculateStore(store);
  writeStore(store);
  broadcast();
  return result;
}

function recalculateStore(store: LocalStore): void {
  // Compatibility fields remain readable in older backups, but are not predictive probabilities.
  for (const item of store.collections) {
    item.ai_probability = 0;
    item.risk_level =
      item.aging_days > 60 ? "红色" : item.aging_days > 0 ? "黄色" : "绿色";
  }
  for (const item of store.payments) {
    item.ai_score = 0;
    item.suggestion =
      item.attachment_status === "完整" ? "待公司统筹校验" : "待补充资料";
  }
  for (const project of store.projects) {
    const status = project.plan?.enabled
      ? projectReceiptStatus(project.contract_amount, project.plan)
      : null;
    project.risk_level =
      status && status.overdueDays > 60
        ? "红色"
        : status && status.outstanding > 0
          ? "黄色"
          : "绿色";
  }
}
function snapshot(): LocalStore {
  const store = readStore();
  store.planning_warnings = [];
  let collectionId = Math.max(0, ...store.collections.map((c) => c.id));
  let paymentId = Math.max(0, ...store.payments.map((p) => p.id));
  for (const project of store.projects) {
    const plan = project.plan;
    if (!plan?.enabled) continue;
    const schedule = buildProjectSchedule(project.contract_amount, plan);
    store.planning_warnings.push(
      ...schedule.warnings.map((w) => `${project.project_name}：${w}`),
    );
    store.collections = store.collections.filter(
      (c) => c.project_id !== project.id,
    );
    store.payments = store.payments.filter((p) => p.project_id !== project.id);
    for (const c of schedule.receipts)
      store.collections.push({
        id: ++collectionId,
        project_id: project.id,
        amount: c.amount,
        expected_date: c.date,
        milestone_date: c.date,
        collection_stage: c.name,
        calculation_note: c.note,
        invoice_status: "未开票",
        aging_days: c.aging_days ?? 0,
        historical_delay_days: 0,
        receipt_account_id: plan.receipt_account_id,
        ai_probability: 0,
        risk_level: "绿色",
        generated: true,
      });
    for (const p of schedule.payments) {
      const sub = p.subcontract!;
      store.payments.push({
        id: ++paymentId,
        project_id: project.id,
        amount: p.amount,
        due_date: p.date,
        payee_name: p.name,
        payment_type: sub.payment_type || "专业分包",
        contract_amount: sub.amount,
        settled_amount: sub.amount,
        paid_amount: sub.paid,
        is_rigid_payment: sub.is_rigid_payment || false,
        is_labor_payment: /工资|劳务/.test(sub.payment_type || ""),
        attachment_status: sub.documents_ready ? "完整" : "待补充",
        ai_score: 0,
        suggestion: "",
        generated: true,
        priority_weight: plan.importance * sub.priority,
        calculation_note: p.note,
        allow_split: sub.allow_split,
        latest_payment_date: shiftDate(p.date, sub.grace_days),
      });
    }
  }
  recalculateStore(store);
  return store;
}
function formatWanText(value: number): string {
  return `${(value / 10000).toFixed(2)}万元`;
}

function priorities(store: LocalStore): PaymentPriority[] {
  const start = forecastBasis(store, { kind: "company" });
  const projects = new Map(store.projects.map((p) => [p.id, p]));
  return store.payments
    .map((item) => {
      const reasons = [
        `项目与分包综合系数${item.priority_weight ?? 1}`,
        isRigid(item) ? "刚性付款优先保障" : "按合同到期日纳入统筹",
        "排序不等于可执行付款，须通过资金与垫资约束",
      ];
      return {
        id: item.id,
        project_name: projects.get(item.project_id)?.project_name ?? "未知项目",
        payee_name: item.payee_name,
        payment_type: item.payment_type,
        amount: item.amount,
        due_date: item.due_date,
        paid_ratio: item.settled_amount
          ? round(item.paid_amount / item.settled_amount)
          : 0,
        ai_score: 0,
        priority_weight: item.priority_weight ?? 1,
        weighted_score: paymentPriorityCost(item, start),
        suggestion:
          item.attachment_status === "完整" ? "待公司统筹校验" : "待补充资料",
        risk_reason: reasons.join("；"),
        risk_reasons: reasons,
      };
    })
    .sort(
      (a, b) =>
        b.weighted_score - a.weighted_score ||
        a.due_date.localeCompare(b.due_date),
    );
}
function forecasts(store: LocalStore, days: number): CashflowForecast[] {
  const rows = simulate(
    store,
    SCENARIOS[0],
    days,
    SAFETY_LINE,
    forecastBasis(store, { kind: "company" }),
  ).days;
  return rows;
}
function gap(rows: CashflowForecast[]): number {
  return round(
    Math.max(
      0,
      SAFETY_LINE - Math.min(...rows.map((item) => item.general_balance)),
    ),
  );
}

function dashboard(store: LocalStore): DashboardSummary {
  const accountTotal = store.accounts
    .filter((a) => accountPool(a) === "general")
    .reduce((s, item) => s + item.available_balance, 0);
  const trend = forecasts(store, 90);
  const paymentRows = priorities(store);
  const risks = projectRisks(store);
  const high = risks.filter((item) => item.risk_level === "红色");
  const riskOrder: Record<RiskLevel, number> = {
    重大风险: 0,
    红色: 1,
    黄色: 2,
    绿色: 3,
  };
  const fundRisk = trend
    .slice(0, 30)
    .reduce<RiskLevel>(
      (worst, item) =>
        riskOrder[item.risk_level] < riskOrder[worst] ? item.risk_level : worst,
      "绿色",
    );
  const suggested = paymentRows
    .filter((item) => item.due_date <= dateAt(6))
    .reduce((s, item) => s + item.amount, 0);
  const g30 = gap(trend.slice(0, 30));
  return {
    current_available_funds: accountTotal,
    gap_7d: gap(trend.slice(0, 7)),
    gap_30d: g30,
    gap_90d: gap(trend),
    high_risk_project_count: high.length,
    pending_payment_amount: store.payments.reduce(
      (s, item) => s + item.amount,
      0,
    ),
    suggested_week_payment_amount: round(suggested),
    fund_risk_level: fundRisk,
    safety_line: SAFETY_LINE,
    cashflow_trend: trend.slice(0, 30).map((item) => ({
      date: item.forecast_date,
      ending_balance: item.general_balance,
      risk_level: item.risk_level,
    })),
    top_payments: paymentRows.slice(0, 10),
    high_risk_projects: high.slice(0, 8),
    ai_summary: `当前可用资金${formatWanText(accountTotal)}，30日内最大资金缺口${formatWanText(g30)}。建议优先保障农民工工资、税款及影响现场履约的分包付款，跟踪${risks.filter((p) => p.collection_risk !== "低").length}个回款待跟进项目；付款压力不等于业主回款逾期。`,
  };
}
function projectRisks(store: LocalStore): ProjectRisk[] {
  return store.projects.map((project): ProjectRisk => {
    const status = project.plan?.enabled
      ? projectReceiptStatus(project.contract_amount, project.plan)
      : null;
    const view = project.plan?.enabled
      ? forecastView(
          store,
          { kind: "project", projectId: project.id },
          SCENARIOS[0],
          90,
        )
      : null;
    const collectionRisk = status
      ? status.overdueDays > 60
        ? "高"
        : status.outstanding > 0
          ? "中"
          : "低"
      : "中";
    const paymentRisk = view
      ? view.breachDate
        ? "高"
        : view.peakAdvance > 0
          ? "中"
          : "低"
      : "中";
    const hint = status
      ? status.outstanding > 0
        ? `截至项目基准日进度款待收${formatWanText(status.outstanding)}；${status.overdueDays > 0 ? `逾期${status.overdueDays}天，需催收` : "未确认逾期，需核实合同应收日"}。预计补收日仅为预测假设。`
        : "截至项目基准日应收进度款已收齐或暂无应收；未到期尾款不作为欠款。"
      : "请完善项目合同与应收日期，旧逐笔数据不足以判断进度回款是否收齐。";
    return {
      ...project,
      collection_rate: status
        ? round(status.rate)
        : project.contract_amount
          ? round(project.collected_amount / project.contract_amount)
          : 0,
      outstanding_amount: status?.outstanding,
      overdue_amount: status?.overdueAmount,
      overdue_days: status?.overdueDays,
      collection_basis: status
        ? "基准日进度应收兑现率(含未扣预付款)"
        : "累计实收占合同额(待完善合同)",
      risk_level:
        collectionRisk === "高" || paymentRisk === "高"
          ? "红色"
          : collectionRisk === "中" || paymentRisk === "中"
            ? "黄色"
            : "绿色",
      collection_risk: collectionRisk,
      payment_risk: paymentRisk,
      ai_hint:
        hint +
        (view?.breachDate
          ? `未来90天合同付款预测于${view.breachDate}突破项目垫资限制，需在公司统筹中调整。`
          : ""),
    };
  });
}

function localReport(store: LocalStore): AiReport {
  const summary = dashboard(store);
  const risks = projectRisks(store);
  const rows = forecasts(store, 30);
  const min = Math.min(...rows.map((item) => item.general_balance));
  let report = `资金驾驶舱分析报告（本地引擎）\n\n一、当前资金总体情况\n当前可用资金${formatWanText(summary.current_available_funds)}，安全线${formatWanText(SAFETY_LINE)}，未来30天最低一般资金余额${formatWanText(min)}，剩余全周期合同应付${formatWanText(summary.pending_payment_amount)}。\n\n二、资金缺口\n未来7天缺口${formatWanText(summary.gap_7d)}，未来30天缺口${formatWanText(summary.gap_30d)}，未来90天缺口${formatWanText(summary.gap_90d)}。\n\n三、付款安排\n请在公司付款统筹中生成方案，按项目与分包权重、专户用途、资料完整性和项目垫资限制共同校验；本报告不直接给出支付指令。\n\n四、重点催收\n${
    risks
      .filter((item) => item.collection_risk !== "低")
      .map((item) => `${item.project_name}：${item.ai_hint}`)
      .join("；") || "暂无重点催收项目。"
  }\n\n五、管理建议\n建议按日滚动录入真实回款、付款和账户余额；红色项目执行周调度，黄色项目双周复盘，所有重大付款先完成合同、结算、发票和工资专户校验。`;
  report += simulationReport(store);
  return {
    generated_at: new Date().toLocaleString("zh-CN", { hour12: false }),
    report,
    report_source: "local",
    provider: "local",
    model: "rule-template",
    fallback_reason: null,
    metrics: {
      current_available_funds: summary.current_available_funds,
      gap_7d: summary.gap_7d,
      gap_30d: summary.gap_30d,
      high_risk_project_count: summary.high_risk_project_count,
    },
  };
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function predictionRulesMarkdown(): string {
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const sections = PREDICTION_RULES.map((section) =>
    [
      `## ${section.title}`,
      "",
      `**公式：** ${section.formula}`,
      "",
      "**变量说明：**",
      ...section.variables.map((item) => `- ${item}`),
      "",
      "**执行规则：**",
      ...section.rules.map((item) => `- ${item}`),
      "",
    ].join("\n"),
  ).join("\n");
  return [
    "# AI资金驾驶舱——预测数学规则",
    "",
    `导出时间：${generatedAt}`,
    "",
    "本文件由浏览器本地规则引擎生成，内容对应当前站点实际执行的预测公式、付款约束和口径边界。系统的业务数据仍保存在当前浏览器中；导出规则不调用任何外部业务接口。",
    "",
    sections,
    "## 规则使用边界",
    "",
    "- 预测结果用于资金计划、付款排序和风险提示，不替代合同审核、结算审核、税务审核和管理人员最终决策。",
    "- 预计回款、付款申请、账户可用余额等输入数据由财务人员手动维护，数据质量会直接影响预测结果。",
    "- 本版本实际计算范围为资金、回款、付款和风险；利润/EAC预测尚未纳入当前现金流引擎。",
  ].join("\n");
}

export function exportPredictionRules(): void {
  downloadTextFile(
    `ai-fund-dashboard-prediction-rules-${today()}.md`,
    predictionRulesMarkdown(),
    "text/markdown;charset=utf-8",
  );
}

function simulationReport(store: LocalStore): string {
  const comparisons = SCENARIOS.map((s) =>
    simulate(
      store,
      s,
      90,
      SAFETY_LINE,
      forecastBasis(store, { kind: "company" }),
    ),
  );
  return (
    "\n\n六、非随机情景推演（90天）\n" +
    comparisons
      .map(
        (r) =>
          r.scenario.name +
          "：最大安全线缺口" +
          formatWanText(r.summary.gap) +
          "；首次缺口" +
          (r.summary.first_gap_date || "无") +
          "；最低一般资金余额日期" +
          r.summary.minimum_date,
      )
      .join("\n") +
    "\n情景为条件假设，不代表发生概率。基准按逐笔合同计划计入全部未付义务；专户不可任意调拨；未分类资金不纳入可调度余额。" +
    "\n待确认数据：" +
    comparisons[0].warnings.slice(0, 5).join("；")
  );
}
export const api = {
  previewBatch: async (
    category: DataCategory,
    rows: Record<string, unknown>[],
  ) => {
    const store = readStore();
    applyBatch(store, category, rows);
    validateStore(store);
  },
  importBatch: async (
    category: DataCategory,
    rows: Record<string, unknown>[],
  ) => mutate((store) => applyBatch(store, category, rows)),
  getPlanningData: async () => readStore(),
  saveProjectPlan: async (id: number, plan: ProjectPlan) =>
    mutate((store) => {
      const project = store.projects.find((p) => p.id === id);
      if (!project) throw new Error("项目不存在");
      project.plan = structuredClone(plan);
      if (plan.enabled) {
        project.confirmed_output = plan.opening_output;
        project.collected_amount = plan.received_to_date;
      }
    }),
  getSimulationData: async () => snapshot(),
  updateCollectionTerms: async (id: number, terms: CollectionTerms) =>
    mutate((store) => {
      const row = store.collections.find((c) => c.id === id);
      if (!row) throw new Error("回款不存在");
      Object.assign(row, terms);
    }),
  updatePaymentTerms: async (id: number, terms: PaymentTerms) =>
    mutate((store) => {
      const row = store.payments.find((p) => p.id === id);
      if (!row) throw new Error("付款不存在");
      Object.assign(row, terms);
    }),
  updateAccountScope: async (
    id: number,
    scope: FundScope,
    project_id?: number,
  ) =>
    mutate((store) => {
      const row = store.accounts.find((a) => a.id === id);
      if (!row) throw new Error("账户不存在");
      Object.assign(row, { scope, project_id });
    }),
  importData: (text: string) => {
    const data = JSON.parse(text);
    validateStore(data);
    writeStore(data);
    broadcast();
  },

  getDashboardSummary: async () => dashboard(snapshot()),
  getCashflowForecast: async (days: number) => forecasts(snapshot(), days),
  getPaymentsPriority: async () => priorities(snapshot()),
  getProjectsRisk: async () => projectRisks(snapshot()),
  getAiReport: async (mode: "local" | "external" | "auto" = "local") => {
    const local = localReport(snapshot());
    if (mode !== "external" || !EXTERNAL_AI_ENABLED) return local;
    try {
      const response = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: local.report,
          metrics: local.metrics,
          config: aiConfig,
        }),
      });
      if (!response.ok) throw new Error("外部 AI 未配置或调用失败");
      const external = (await response.json()) as Partial<AiReport>;
      return {
        ...local,
        ...external,
        report_source: "external" as const,
        fallback_reason: null,
      };
    } catch (error) {
      return {
        ...local,
        fallback_reason:
          error instanceof Error ? error.message : "外部 AI 调用失败",
      };
    }
  },
  getAiProviderStatus: async (): Promise<AiProviderStatus> => {
    if (!EXTERNAL_AI_ENABLED)
      return {
        provider: "local",
        minimax_configured: false,
        minimax_base_url: "",
        minimax_model: "rule-template",
        minimax_protocol: "anthropic",
        runtime_configured: false,
      };
    try {
      const response = await fetch("/api/ai/status");
      if (response.ok) return await response.json();
    } catch {
      /* local report works offline */
    }
    return {
      provider: "local",
      minimax_configured: false,
      minimax_base_url: "",
      minimax_model: "rule-template",
      minimax_protocol: "anthropic",
      runtime_configured: false,
    };
  },
  updateAiProviderConfig: async (payload: AiProviderConfigPayload) => {
    aiConfig = { ...payload };
    return api.getAiProviderStatus();
  },
  getProjectMasters: async () => {
    const store = snapshot();
    return store.projects.map((project) => ({
      ...project,
      collection_rate: project.plan?.enabled
        ? round(
            projectReceiptStatus(project.contract_amount, project.plan).rate,
          )
        : project.contract_amount
          ? round(project.collected_amount / project.contract_amount)
          : 0,
      expected_collection_count: store.collections.filter(
        (item) => item.project_id === project.id,
      ).length,
      payment_request_count: store.payments.filter(
        (item) => item.project_id === project.id,
      ).length,
      unpaid_payment_amount: store.payments
        .filter((item) => item.project_id === project.id)
        .reduce((s, item) => s + item.amount, 0),
    }));
  },
  createProjectMaster: async (payload: ProjectPayload) =>
    mutate((store) => {
      const item = {
        id: Math.max(0, ...store.projects.map((x) => x.id)) + 1,
        ...payload,
        risk_level: "绿色" as RiskLevel,
      };
      store.projects.push(item);
      return item as ProjectMaster;
    }),
  updateProjectMaster: async (id: number, payload: ProjectPayload) =>
    mutate((store) => {
      const item = store.projects.find((x) => x.id === id);
      if (!item) throw new Error("项目不存在");
      Object.assign(item, payload);
      if (item.plan) {
        item.plan.opening_output = payload.confirmed_output;
        item.plan.received_to_date = payload.collected_amount;
      }
      return item as ProjectMaster;
    }),
  deleteProjectMaster: async (id: number) =>
    mutate((store) => {
      if (
        store.projects.find((p) => p.id === id)?.plan ||
        store.collections.some((x) => x.project_id === id) ||
        store.payments.some((x) => x.project_id === id)
      )
        throw new Error("项目已有合同预测、回款或付款数据，不能直接删除");
      store.projects = store.projects.filter((x) => x.id !== id);
      return { success: true, message: "项目已删除，预测已重算。" };
    }),
  getDataEntryAccounts: async () => snapshot().accounts,
  getDataEntryProjects: async () => snapshot().projects,
  createBankAccount: async (payload: BankAccountPayload) =>
    mutate((store) => {
      const item = {
        id: Math.max(0, ...store.accounts.map((x) => x.id)) + 1,
        ...payload,
        updated_at: new Date().toISOString(),
      };
      store.accounts.push(item);
      return item;
    }),
  updateBankAccount: async (id: number, payload: BankAccountPayload) =>
    mutate((store) => {
      const item = store.accounts.find((x) => x.id === id);
      if (!item) throw new Error("账户不存在");
      Object.assign(item, payload, { updated_at: new Date().toISOString() });
      return item;
    }),
  createProject: async (payload: ProjectPayload) =>
    mutate((store) => {
      const item = {
        id: Math.max(0, ...store.projects.map((x) => x.id)) + 1,
        ...payload,
        risk_level: "绿色" as RiskLevel,
      };
      store.projects.push(item);
      return item;
    }),
  createExpectedCollection: async (payload: ExpectedCollectionPayload) =>
    mutate((store) => {
      if (
        store.projects.find((p) => p.id === payload.project_id)?.plan?.enabled
      )
        throw new Error("该项目已启用合同预测，请到项目工作台维护收款条款");
      const item = {
        id: Math.max(0, ...store.collections.map((x) => x.id)) + 1,
        ...payload,
        ai_probability: 0,
        risk_level: "绿色" as RiskLevel,
      };
      store.collections.push(item);
      return item;
    }),
  createPaymentRequest: async (payload: PaymentRequestPayload) =>
    mutate((store) => {
      if (
        store.projects.find((p) => p.id === payload.project_id)?.plan?.enabled
      )
        throw new Error("该项目已启用合同预测，请到项目工作台维护分包计划");
      const item = {
        id: Math.max(0, ...store.payments.map((x) => x.id)) + 1,
        ...payload,
        ai_score: 0,
        suggestion: "暂缓支付",
      };
      store.payments.push(item);
      return item;
    }),
  recalculate: async () => {
    const store = readStore();
    recalculateStore(store);
    writeStore(store);
    broadcast();
    return {
      success: true,
      message: "项目合同预测与公司收支已重新计算",
      forecast_days: 90,
    };
  },
  clearAllData: () => {
    const empty: LocalStore = {
      data_mode: "manual",
      accounts: [],
      projects: [],
      collections: [],
      payments: [],
    };
    writeStore(empty);
    broadcast();
  },
  resetDemoData: () => {
    const demo = demoStore();
    recalculateStore(demo);
    writeStore(demo);
    broadcast();
  },
  exportData: () => {
    const blob = new Blob(
      [
        window.localStorage.getItem(STORAGE_KEY) ||
          JSON.stringify(snapshot(), null, 2),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-fund-dashboard-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },
  exportPredictionRules,
};

function applyBatch(
  store: LocalStore,
  category: DataCategory,
  rows: Record<string, unknown>[],
) {
  if (!rows.length || rows.length > 10000)
    throw new Error("批量导入须为1至10000行");
  const list = store[category] as unknown as Record<string, unknown>[];
  const used = new Set<number>();
  const signatures = new Set<string>();
  let next = Math.max(0, ...list.map((r) => Number(r.id)));
  rows.forEach((source, i) => {
    const row: Record<string, unknown> = {};
    for (const col of dataTemplates[category].columns)
      if (source[col.key] !== undefined) row[col.key] = source[col.key];
    const id = row.id === undefined ? ++next : Number(row.id);
    if (!Number.isSafeInteger(id) || id < 1 || used.has(id))
      throw new Error(`第${i + 2}行：编号无效或重复`);
    used.add(id);
    const existing =
      row.id === undefined ? undefined : list.find((r) => r.id === id);
    if (row.id !== undefined && !existing)
      throw new Error(`第${i + 2}行：编号${id}不存在；新增请留空编号`);
    const signature = JSON.stringify(
      Object.fromEntries(Object.entries(row).filter(([k]) => k !== "id")),
    );
    if (signatures.has(signature))
      throw new Error(`第${i + 2}行：内容与前面记录重复`);
    signatures.add(signature);
    if (
      (category === "projects" || category === "accounts") &&
      list.some(
        (r) =>
          r.id !== id &&
          r[category === "projects" ? "project_name" : "account_name"] ===
            row[category === "projects" ? "project_name" : "account_name"],
      )
    )
      throw new Error(`第${i + 2}行：名称重复，更新请填写原编号`);
    if (
      (category === "collections" || category === "payments") &&
      store.projects.find((p) => p.id === row.project_id)?.plan?.enabled
    )
      throw new Error(
        `第${i + 2}行：该项目已启用合同预测，请到项目工作台维护条款或分包，避免重复口径`,
      );
    const defaults =
      category === "projects"
        ? { risk_level: "绿色" }
        : category === "accounts"
          ? { updated_at: new Date().toISOString() }
          : category === "collections"
            ? { ai_probability: 0, risk_level: "绿色" }
            : { ai_score: 0, suggestion: "" };
    if (existing) Object.assign(existing, row);
    else list.push({ ...defaults, ...row, id });
    if (existing && category === "projects" && existing.plan) {
      const plan = existing.plan as ProjectPlan;
      plan.opening_output = Number(existing.confirmed_output);
      plan.received_to_date = Number(existing.collected_amount);
    }
  });
}

export function formatWan(value: number): string {
  return `${(value / 10000).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 万`;
}
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
