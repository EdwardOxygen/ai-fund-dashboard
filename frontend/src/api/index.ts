import {
  simulate,
  SCENARIOS,
  localDate,
  accountPool,
  type CollectionTerms,
  type PaymentTerms,
  type FundScope,
} from "../domain/simulation";
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
export const SAFETY_LINE = 3_000_000;
let aiConfig: AiProviderConfigPayload | null = null;

export const PREDICTION_RULES: PredictionRuleSection[] = [
  {
    title: "项目合同收款与预付款扣回",
    formula:
      "进度累计目标＝累计产值×进度比例＋未扣预付款；本期回款＝max(0,累计目标－此前累计已收)，总收款封顶合同额",
    variables: [
      "竣工、结算、质保金分别按合同额×累计支付比例补差，质保金最后累计至100%。各比例不是独立相加。",
      "累计产值达到合同额×门槛后，当期开始扣回；每期扣回＝min(剩余预付款,当期应收进度款,设定基数×扣回比例)。基数可选当期产值或应收进度款。",
      "历史实收含预付款。历史金额已在期初余额内，不重复作为未来收入。期初进度欠款暂置基准日并提示人工确认。",
    ],
    rules: [
      "单个项目可以从原逐笔收支切换到合同预测；原记录保留但不与生成明细重复计入。停用合同预测可恢复原口径。",
      "剩余产值可按均匀或S形曲线分配，也可逐月录入或CSV导入。未来产值加期初产值须等于合同额。",
      "本版采用合同额作为最终结算基数，未单列签证变更、税金与动态结算调整。",
    ],
  },
  {
    title: "分包付款与公司统筹",
    formula: "综合权重＝项目重要系数×分包优先系数×(10000＋规则分×100)",
    variables: [
      "项目和分包系数均为1至5。刚性付款使用单独的高惩罚权重10亿；这是政策权重，不是概率或严格词典序最优保证。",
      "简易模式：剩余估算金额在进场至完工期间均匀分配后加账期。详细模式：按均匀分包产值乘进度比例，再按完工、结算、质保累计目标补差。",
    ],
    rules: [
      "已付金额扣除；付款资料未齐时不安排，但义务仍保留。是否拆分及可延期天数须按合同填写。",
      "混合整数规划在最多90天、100笔到期义务内限时求解。每个账户每天不可透支，专户用途不可突破。",
      "付款后公司余额按实际建议分配重算；未覆盖义务另列，不能因为延后支付就认定风险消失。",
    ],
  },
  {
    title: "项目存贷差与垫资边界",
    formula:
      "项目存贷差＝期初历史净收支＋累计未来到账－累计安排付款；允许期内≥－垫资峰值，其他日期≥0",
    variables: [
      "一般资金可跨项目统筹；项目存贷差是归属账，不是第二份银行余额。不得叠加到公司期初资金。",
      "垫资开始日与截止日均包含在允许期间，截止日次日起须回正。约束逐日检查，不只看月末。",
    ],
    rules: [
      "即使公司资金充足也不能突破项目额度；期初垫资无法在期限内回正时报告无可行方案。",
      "合同基准展示全部到期义务导致的负余额及风险，统筹方案只展示通过约束的安排。",
      "项目基准日与今日不一致时，需更新累计实收、产值、已付和存贷差后再统筹付款。",
    ],
  },
  {
    title: "1. 预测起点与安全线",
    formula: "A₀ = Σ 已分类账户可用余额；一般资金安全线 S = 3,000,000 元",
    variables: [
      "账户分为一般资金、工资专户、项目专户、未分类；工资和项目专户只覆盖对应用途。未分类余额不计入可调度资金。",
      "S：首页和常规预测默认安全线为300万元，情景推演可单独调整。账户总余额和冻结金额不直接进入预测。",
    ],
    rules: ["预测只使用人工录入的账户可用余额，不调用银行或ERP接口。"],
  },
  {
    title: "2. 回款规则评分（辅助风险提示）",
    formula:
      "P = clamp(50 + 阶段分 + 开票分 + 业主/账龄分 + 历史延期分 + 账龄风险分, 0, 100)",
    variables: [
      "P：回款规则分 ai_probability，取值0至100；未经历史样本校准，不代表真实到账概率。",
      "规则评分不再折减回款金额。现金流按节点日期、分期比例、质保金释放日期和情景延迟生成实际收款事件。",
    ],
    rules: [
      "回款阶段：付款节点已达成 +20；已确权 +16；审计中 +6；未到节点 -12。",
      "开票状态：已开票 +14；部分开票 +5；未开票 -12。",
      "业主与账龄：政府单位/平台公司账龄>60天 -10；民营业主账龄>30天 -8。",
      "历史延期：>45天 -18；>30天 -12；>15天 -6。",
      "账龄风险：>90天 -24并标红；>60天 -15并标红；>30天 -8并标黄。",
      "最终评分限制在0至100；评分<45标红，45至<70标黄，其余标绿（已触发红色账龄的除外）。",
    ],
  },
  {
    title: "3. 付款优先级评分与建议",
    formula:
      "Q = clamp(45 + 类型分 + 标记分 + 到期分 + 付款比例分 + 附件分 + 资金影响分, 0, 100)",
    variables: [
      "Q：付款优先级 ai_score，取值0至100，按分数从高到低排序。",
      "付款比例 r = (paid_amount + amount) ÷ (settled_amount 或 contract_amount 或 1)。",
      "逾期天数 d = floor((今天 - due_date) ÷ 1天)。",
    ],
    rules: [
      "付款类型：工资/农民工工资/税款 +34；劳务分包/材料款/机械租赁/专业分包等履约类 +18；其他 +5。",
      "人工标记：刚性付款 +10；劳务或农民工工资 +8。",
      "到期情况：逾期>30天 +18；>14天 +12；>0天 +8；未来7天内到期 +4。",
      "本次付款后累计付款比例：r>95% -22；r>85% -14；r>75% -7。",
      "附件状态：完整 +7；部分缺失 -12；缺失/待补充 -24。",
      "付款后可用资金<0元 -32；低于安全线 -18；低于安全线1.2倍 -8。",
      "建议阈值：Q≥85立即支付；70≤Q<85优先支付；55≤Q<70部分支付；40≤Q<55暂缓支付；Q<40不建议支付或退回补充资料。附件缺失且Q<55时优先退回补充资料。",
    ],
  },
  {
    title: "4. 项目风险等级",
    formula:
      "回款风险 = avg(P)；回款率 = collected_amount ÷ contract_amount；未付金额 = Σ payment.amount",
    variables: [
      "高回款风险：avg(P)<55 或 回款率<25%。中回款风险：avg(P)<72 或 回款率<45%。",
      "高付款风险：未付金额>合同额10% 或 ai_score≥70的付款金额>合同额4%；中付款风险：未付金额>合同额5%。",
    ],
    rules: [
      "项目任一维度为高风险，项目标红；任一维度为中风险且无高风险，项目标黄；否则标绿。",
      "数据不足时，回款明细平均可信度按100计算，但项目回款率和付款数据仍按实际录入值计算。",
    ],
  },
  {
    title: "5. 7/30/90天现金流滚动预测",
    formula: "Bₜ = Bₜ₋₁ + Eₜ - Nₜ - Rₜ",
    variables: [
      "Bₜ：第t日期末可用余额；B₀=A₀。",
      "Eₜ：当日已分类账户计划到账金额；Nₜ：当日非刚性未付义务；Rₜ：当日刚性未付义务。首页趋势展示一般资金余额，专户余额单列。",
    ],
    rules: [
      "刚性付款：人工标记为刚性付款，或付款类型包含工资/税款的，按全额计入Rₜ。",
      "所有非刚性付款义务全额进入合同基准。逾期未付款结转首日。付款安排使用混合整数规划，未覆盖金额单列，不从义务中删除。",
      "系统按日滚动，最长生成90天；7天、30天和90天缺口均取对应期间的最低期末余额计算。",
    ],
  },
  {
    title: "6. 资金缺口与现金流风险",
    formula: "Gₙ = max(0, S - min(一般资金余额₁…一般资金余额ₙ))",
    variables: [
      "Gₙ：未来n天资金缺口，n取7、30或90。",
      "现金流风险：刚性付款无法由符合用途的资金覆盖，标记重大风险；否则一般资金余额<S标红，<1.25S标黄，其余标绿。",
    ],
    rules: [
      "缺口为0表示预测期间内最低期末余额仍不低于安全线，不代表可以忽略刚性付款和数据录入质量。",
      "本导出文件只包含当前站点实际运行的资金、回款、付款和风险规则；利润/EAC模型尚未纳入本版本的现金流计算。",
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

function collectionScore(
  project: Project,
  item: ExpectedCollection,
): { score: number; risk: RiskLevel; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];
  score +=
    (
      { 付款节点已达成: 20, 已确权: 16, 审计中: 6, 未到节点: -12 } as Record<
        string,
        number
      >
    )[item.collection_stage] ?? 0;
  score +=
    ({ 已开票: 14, 部分开票: 5, 未开票: -12 } as Record<string, number>)[
      item.invoice_status
    ] ?? 0;
  if (["付款节点已达成", "已确权"].includes(item.collection_stage))
    reasons.push("已确权或达到合同付款节点");
  if (item.invoice_status === "已开票") reasons.push("已完成开票");
  else reasons.push("开票资料仍需跟进");
  if (
    ["政府单位", "平台公司"].includes(project.owner_type) &&
    item.aging_days > 60
  ) {
    score -= 10;
    reasons.push("政府或平台项目账龄较长");
  }
  if (project.owner_type === "民营业主" && item.aging_days > 30) {
    score -= 8;
    reasons.push("民营业主账龄偏长");
  }
  if (item.historical_delay_days > 45) {
    score -= 18;
    reasons.push("历史延期超过45天");
  } else if (item.historical_delay_days > 30) score -= 12;
  else if (item.historical_delay_days > 15) score -= 6;
  let risk: RiskLevel = "绿色";
  if (item.aging_days > 90) {
    score -= 24;
    risk = "红色";
  } else if (item.aging_days > 60) {
    score -= 15;
    risk = "红色";
  } else if (item.aging_days > 30) {
    score -= 8;
    risk = "黄色";
  }
  score = Math.max(0, Math.min(100, round(score)));
  if (score < 45) risk = "红色";
  else if (score < 70 && risk !== "红色") risk = "黄色";
  return { score, risk, reasons };
}
function paymentScore(
  item: PaymentRequest,
  available: number,
): { score: number; suggestion: string; reasons: string[] } {
  let score = 45;
  const reasons: string[] = [];
  const rigid = ["工资", "农民工工资", "税款"];
  const site = [
    "劳务分包",
    "材料款",
    "机械租赁",
    "专业分包",
    "钢筋材料款",
    "混凝土材料款",
  ];
  if (rigid.some((x) => item.payment_type.includes(x))) {
    score += 34;
    reasons.push("涉及工资、农民工工资或税款等刚性支付");
  } else if (site.some((x) => item.payment_type.includes(x))) {
    score += 18;
    reasons.push("影响项目现场履约或供应链稳定");
  } else {
    score += 5;
    reasons.push("一般项目资金支付事项");
  }
  if (bool(item.is_rigid_payment)) {
    score += 10;
    reasons.push("被标记为刚性付款");
  }
  if (bool(item.is_labor_payment)) {
    score += 8;
    reasons.push("涉及劳务或农民工工资实名制支付");
  }
  const overdue = Math.floor(
    (Date.parse(today()) - Date.parse(item.due_date)) / 86400000,
  );
  if (overdue > 30) {
    score += 18;
    reasons.push("已逾期超过30天");
  } else if (overdue > 14) {
    score += 12;
    reasons.push("已逾期超过14天");
  } else if (overdue > 0) {
    score += 8;
    reasons.push("付款已逾期");
  } else if (overdue >= -7) {
    score += 4;
    reasons.push("7天内到期");
  }
  const ratio =
    (item.paid_amount + item.amount) /
    (item.settled_amount || item.contract_amount || 1);
  if (ratio > 0.95) {
    score -= 22;
    reasons.push("本次支付后累计付款比例超过95%");
  } else if (ratio > 0.85) {
    score -= 14;
    reasons.push("本次支付后累计付款比例偏高");
  } else if (ratio > 0.75) {
    score -= 7;
    reasons.push("需关注分包累计付款比例");
  }
  if (item.attachment_status === "完整") {
    score += 7;
    reasons.push("合同、结算、发票等附件完整");
  } else if (item.attachment_status === "部分缺失") {
    score -= 12;
    reasons.push("附件部分缺失");
  } else {
    score -= 24;
    reasons.push("附件缺失或待补充");
  }
  if (available - item.amount < 0) {
    score -= 32;
    reasons.push("本次付款后账户资金为负");
  } else if (available - item.amount < SAFETY_LINE) {
    score -= 18;
    reasons.push("本次付款后资金余额低于安全线");
  } else if (available - item.amount < SAFETY_LINE * 1.2) score -= 8;
  score = Math.max(0, Math.min(100, round(score)));
  let suggestion = "不建议支付或退回补充资料";
  if (["缺失", "待补充"].includes(item.attachment_status) && score < 55)
    suggestion = "退回补充资料";
  else if (score >= 85) suggestion = "立即支付";
  else if (score >= 70) suggestion = "优先支付";
  else if (score >= 55) suggestion = "部分支付";
  else if (score >= 40) suggestion = "暂缓支付";
  return { score, suggestion, reasons };
}

function recalculateStore(store: LocalStore): void {
  const available = store.accounts.reduce(
    (sum, item) => sum + num(item.available_balance),
    0,
  );
  const projectMap = new Map(store.projects.map((item) => [item.id, item]));
  for (const item of store.collections) {
    const project = projectMap.get(item.project_id);
    if (!project) continue;
    const scored = collectionScore(project, item);
    item.ai_probability = scored.score;
    item.risk_level = scored.risk;
  }
  for (const item of store.payments) {
    const scored = paymentScore(item, available);
    item.ai_score = scored.score;
    item.suggestion = scored.suggestion;
  }
  for (const project of store.projects) {
    const collections = store.collections.filter(
      (item) => item.project_id === project.id,
    );
    const payments = store.payments.filter(
      (item) => item.project_id === project.id,
    );
    const avg = collections.length
      ? collections.reduce((s, item) => s + item.ai_probability, 0) /
        collections.length
      : 100;
    const unpaid = payments.reduce((s, item) => s + item.amount, 0);
    const highAmount = payments
      .filter((item) => item.ai_score >= 70)
      .reduce((s, item) => s + item.amount, 0);
    const rate = project.contract_amount
      ? project.collected_amount / project.contract_amount
      : 0;
    const contractual = project.plan?.enabled
      ? projectReceiptStatus(project.contract_amount, project.plan)
      : null;
    const collectionHigh = contractual
      ? contractual.overdueDays > 60
      : avg < 55 || rate < 0.25;
    const collectionMedium = contractual
      ? contractual.outstanding > 0
      : avg < 72 || rate < 0.45;
    const paymentHigh =
      unpaid > project.contract_amount * 0.1 ||
      highAmount > project.contract_amount * 0.04;
    const paymentMedium = unpaid > project.contract_amount * 0.05;
    project.risk_level =
      collectionHigh || paymentHigh
        ? "红色"
        : collectionMedium || paymentMedium
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
  const available = store.accounts.reduce(
    (s, item) => s + item.available_balance,
    0,
  );
  const projects = new Map(store.projects.map((item) => [item.id, item]));
  return store.payments
    .map((item) => {
      const score = paymentScore(item, available);
      const weight = item.priority_weight ?? 1;
      const rigid =
        item.is_rigid_payment || /工资|税款/.test(item.payment_type);
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
        ai_score: score.score,
        priority_weight: weight,
        weighted_score: rigid
          ? 1000000000
          : (10000 + score.score * 100) * weight,
        suggestion: score.suggestion,
        risk_reason: score.reasons.slice(0, 3).join("；"),
        risk_reasons: score.reasons,
      };
    })
    .sort(
      (a, b) =>
        b.weighted_score - a.weighted_score ||
        a.due_date.localeCompare(b.due_date),
    );
}
function forecasts(store: LocalStore, days: number): CashflowForecast[] {
  const rows = simulate(store, SCENARIOS[0], days, SAFETY_LINE).days;
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
  const paymentRows = priorities(store);
  const scoreMap = new Map(paymentRows.map((item) => [item.id, item]));
  return store.projects
    .map((project): ProjectRisk => {
      const collections = store.collections.filter(
        (item) => item.project_id === project.id,
      );
      const payments = store.payments.filter(
        (item) => item.project_id === project.id,
      );
      const avg = collections.length
        ? collections.reduce((s, item) => s + item.ai_probability, 0) /
          collections.length
        : 100;
      const unpaid = payments.reduce((s, item) => s + item.amount, 0);
      const highAmount = payments
        .filter((item) => (scoreMap.get(item.id)?.ai_score ?? 0) >= 70)
        .reduce((s, item) => s + item.amount, 0);
      const contractual = project.plan?.enabled
        ? projectReceiptStatus(project.contract_amount, project.plan)
        : null;
      const rate = contractual
        ? contractual.rate
        : project.contract_amount
          ? project.collected_amount / project.contract_amount
          : 0;
      const collectionRisk = contractual
        ? contractual.overdueDays > 60
          ? "高"
          : contractual.outstanding > 0
            ? "中"
            : "低"
        : avg < 55 || rate < 0.25
          ? "高"
          : avg < 72 || rate < 0.45
            ? "中"
            : "低";
      const paymentRisk =
        unpaid > project.contract_amount * 0.1 ||
        highAmount > project.contract_amount * 0.04
          ? "高"
          : unpaid > project.contract_amount * 0.05
            ? "中"
            : "低";
      const risk: RiskLevel =
        collectionRisk === "高" || paymentRisk === "高"
          ? "红色"
          : collectionRisk === "中" || paymentRisk === "中"
            ? "黄色"
            : "绿色";
      const hint = contractual
        ? contractual.outstanding > 0
          ? `截至项目基准日进度款待收${formatWanText(contractual.outstanding)}；${contractual.overdueDays > 0 ? `逾期${contractual.overdueDays}天，需催收` : "未确认逾期，需核实合同应收日"}。预计补收日${project.plan!.opening_receivable_date || project.plan!.as_of}仅为预测假设。`
          : `${contractual.expected > 0 ? "截至项目基准日，按进度比例及预付款扣回口径应收款已收齐" : "截至项目基准日暂无应收进度款"}；未到期尾款不作为欠款。付款压力另行评估。`
        : risk === "红色"
          ? `项目资金承压，已开票未回款${formatWanText(Math.max(0, project.billed_amount - project.collected_amount))}，需强化催收并控制付款节奏。`
          : risk === "黄色"
            ? "项目回款或付款节奏存在波动，建议纳入周资金调度清单。"
            : "项目资金状态相对稳定，按合同节点持续跟踪回款。";
      return {
        ...project,
        collection_rate: round(rate),
        outstanding_amount: contractual?.outstanding,
        overdue_amount: contractual?.overdueAmount,
        overdue_days: contractual?.overdueDays,
        collection_basis: contractual
          ? "基准日进度应收兑现率(含未扣预付款)"
          : "累计实收占合同额(旧逐笔模式)",
        risk_level: risk,
        collection_risk: collectionRisk,
        payment_risk: paymentRisk,
        ai_hint: hint,
      };
    })
    .sort(
      (a, b) =>
        ({ 重大风险: -1, 红色: 0, 黄色: 1, 绿色: 2 })[a.risk_level] -
        { 重大风险: -1, 红色: 0, 黄色: 1, 绿色: 2 }[b.risk_level],
    );
}

function localReport(store: LocalStore): AiReport {
  const summary = dashboard(store);
  const paymentRows = priorities(store);
  const risks = projectRisks(store);
  const rows = forecasts(store, 30);
  const immediate = paymentRows
    .filter((item) => ["立即支付", "优先支付"].includes(item.suggestion))
    .slice(0, 5);
  const deferred = paymentRows
    .filter((item) =>
      ["暂缓支付", "退回补充资料", "不建议支付或退回补充资料"].includes(
        item.suggestion,
      ),
    )
    .slice(0, 5);
  const sentence = (items: PaymentPriority[], prefix: string) =>
    items.length
      ? `${prefix}：${items.map((item) => `${item.project_name}向${item.payee_name}支付${item.payment_type}${formatWanText(item.amount)}`).join("；")}。`
      : `${prefix}暂无。`;
  const min = Math.min(...rows.map((item) => item.general_balance));
  let report = `资金驾驶舱分析报告（本地引擎）\n\n一、当前资金总体情况\n当前可用资金${formatWanText(summary.current_available_funds)}，安全线${formatWanText(SAFETY_LINE)}，未来30天最低一般资金余额${formatWanText(min)}，待审批付款${formatWanText(summary.pending_payment_amount)}。\n\n二、资金缺口\n未来7天缺口${formatWanText(summary.gap_7d)}，未来30天缺口${formatWanText(summary.gap_30d)}，未来90天缺口${formatWanText(summary.gap_90d)}。\n\n三、付款安排\n${sentence(immediate, "建议优先安排")}\n${sentence(deferred, "建议暂缓或补充资料")}\n\n四、重点催收\n${
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
    "本文件由浏览器本地规则引擎生成，内容对应当前站点实际执行的预测公式、评分加减分和风险阈值。系统的业务数据仍保存在当前浏览器中；导出规则不调用任何外部业务接口。",
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
  const comparisons = SCENARIOS.map((s) => simulate(store, s, 90, SAFETY_LINE));
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
        ? round(projectReceiptStatus(project.contract_amount, project.plan).rate)
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
