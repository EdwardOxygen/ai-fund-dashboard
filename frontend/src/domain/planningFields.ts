import type { TemplateColumn } from "./templateImport";
import type { ProjectPlan, SubcontractPlan } from "./projectPlanning";
export const planSections: {
  title: string;
  description: string;
  fields: TemplateColumn[];
}[] = [
  {
    title: "项目基准与统筹约束",
    description:
      "期初存贷差＝历史项目实收－历史项目实付，不是银行余额。垫资期限之外，项目存贷差不得小于0。",
    fields: [
      { key: "as_of", label: "预测基准日", type: "date" },
      { key: "importance", label: "项目重要系数(1至5)", type: "number" },
      { key: "opening_balance", label: "期初存贷差(元)", type: "number" },
      { key: "advance_limit", label: "项目垫资峰值上限(元)", type: "number" },
      { key: "funding_start", label: "允许垫资开始日", type: "date" },
      { key: "funding_end", label: "允许垫资截止日", type: "date" },
      { key: "opening_output", label: "基准日前累计产值(元)", type: "number" },
      {
        key: "received_to_date",
        label: "基准日前累计实收含预付款(元)",
        type: "number",
      },
    ],
  },
  {
    title: "业主收款条款",
    description:
      "进度款以累计产值为基数，竣工、结算及质保金以合同额为基数。每个节点只收取累计目标与此前累计已收的差额。金额统一采用相同含税口径。",
    fields: [
      {
        key: "opening_receivable_due_date",
        label: "期初待收进度款合同应收日(仅有欠款时填写)",
        type: "date",
        optional: true,
      },
      {
        key: "opening_receivable_date",
        label: "期初待收进度款预计到账日",
        type: "date",
        optional: true,
      },
      { key: "progress_ratio", label: "进度款累计支付至(%)", type: "number" },
      { key: "payment_days", label: "产值确认后到账间隔(天)", type: "number" },
      { key: "completion_ratio", label: "竣工累计支付至(%)", type: "number" },
      { key: "completion_date", label: "竣工款预计到账日", type: "date" },
      { key: "settlement_ratio", label: "结算累计支付至(%)", type: "number" },
      { key: "settlement_date", label: "结算款预计到账日", type: "date" },
      { key: "retention_date", label: "质保金到账日(累计100%)", type: "date" },
    ],
  },
  {
    title: "预付款与扣回",
    description:
      "累计产值达到合同额的设定比例时，从达到门槛的当期开始扣回。扣回额不超过当期进度应收及尚未扣清的预付款；后续节点仍按累计目标补差，不重复收款。",
    fields: [
      { key: "advance_ratio", label: "预付款占合同额(%)", type: "number" },
      { key: "advance_date", label: "剩余预付款预计到账日", type: "date" },
      {
        key: "advance_received",
        label: "基准日前预付款已收(元)",
        type: "number",
      },
      {
        key: "advance_recovered",
        label: "基准日前预付款已扣回(元)",
        type: "number",
      },
      {
        key: "recovery_threshold",
        label: "累计产值达到合同额(%)后扣回",
        type: "number",
      },
      { key: "recovery_ratio", label: "每期扣回比例(%)", type: "number" },
      {
        key: "recovery_basis",
        label: "扣回计算基数",
        values: { 当期产值: "output", 当期应收进度款: "progress" },
      },
    ],
  },
  {
    title: "产值计划",
    description:
      "自动计划分配剩余合同产值，可选均匀或S形施工节奏。逐月手填及模板导入的产值合计必须与剩余合同产值一致。",
    fields: [
      {
        key: "output_mode",
        label: "产值计划方式",
        values: { 自动分配: "auto", 逐月填写: "manual" },
      },
      {
        key: "output_curve",
        label: "自动分配曲线",
        values: { 均匀: "uniform", S形: "s-curve" },
      },
      { key: "output_start", label: "未来产值开始日", type: "date" },
      { key: "output_end", label: "未来产值结束日", type: "date" },
    ],
  },
];
export const outputColumns: TemplateColumn[] = [
  { key: "date", label: "产值日期", type: "date" },
  { key: "amount", label: "当月新增产值(元)", type: "number" },
];
export const planTemplateColumns: TemplateColumn[] = [
  ...planSections.flatMap((s) => s.fields),
  {
    key: "receipt_account_id",
    label: "收款账户编号",
    type: "number",
    optional: true,
  },
  { key: "enabled", label: "启用合同预测", type: "boolean" },
];
export const subcontractColumns: TemplateColumn[] = [
  {
    key: "payment_type",
    label: "付款类型",
    optional: true,
    values: {
      专业分包: "专业分包",
      劳务分包: "劳务分包",
      材料款: "材料款",
      机械租赁: "机械租赁",
      农民工工资: "农民工工资",
      税款: "税款",
    },
  },
  {
    key: "is_rigid_payment",
    label: "刚性付款",
    type: "boolean",
    optional: true,
  },
  { key: "id", label: "分包编号" },
  { key: "name", label: "分包名称" },
  {
    key: "mode",
    label: "计划模式",
    values: { 简易估算: "simple", 详细比例: "detailed" },
  },
  { key: "amount", label: "分包总额或估算总额(元)", type: "number" },
  { key: "paid", label: "基准日前累计已付(元)", type: "number" },
  { key: "entry_date", label: "进场日期", type: "date" },
  { key: "end_date", label: "预计完工日期", type: "date" },
  { key: "payment_days", label: "付款账期(天)", type: "number" },
  { key: "priority", label: "分包优先系数(1至5)", type: "number" },
  {
    key: "progress_ratio",
    label: "进度累计付款至(%)",
    type: "number",
    optional: true,
  },
  {
    key: "completion_ratio",
    label: "完工累计付款至(%)",
    type: "number",
    optional: true,
  },
  {
    key: "completion_date",
    label: "完工款付款日期",
    type: "date",
    optional: true,
  },
  {
    key: "settlement_ratio",
    label: "结算累计付款至(%)",
    type: "number",
    optional: true,
  },
  {
    key: "settlement_date",
    label: "结算款付款日期",
    type: "date",
    optional: true,
  },
  {
    key: "retention_date",
    label: "质保金付款日期",
    type: "date",
    optional: true,
  },
  { key: "allow_split", label: "允许拆分付款", type: "boolean" },
  { key: "grace_days", label: "合同允许延期(天)", type: "number" },
  { key: "documents_ready", label: "付款资料已完整", type: "boolean" },
];
export function normalizeSubcontractRows(
  rows: Record<string, unknown>[],
  plan: ProjectPlan,
): SubcontractPlan[] {
  return rows.map((row, i) => {
    const detailed = [
      "progress_ratio",
      "completion_ratio",
      "completion_date",
      "settlement_ratio",
      "settlement_date",
      "retention_date",
    ];
    if (row.mode === "detailed" && detailed.some((k) => row[k] === undefined))
      throw new Error(
        `第${i + 2}行：详细模式必须填写进度、完工、结算比例及付款日期`,
      );
    return {
      progress_ratio: 80,
      completion_ratio: 90,
      settlement_ratio: 97,
      completion_date: plan.completion_date,
      settlement_date: plan.settlement_date,
      retention_date: plan.retention_date,
      ...row,
    } as unknown as SubcontractPlan;
  });
}
