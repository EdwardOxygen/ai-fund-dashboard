import type { TemplateColumn } from "./templateImport";
export type DataCategory = "projects" | "accounts" | "collections" | "payments";
const id: TemplateColumn = {
  key: "id",
  label: "编号(新增留空)",
  type: "number",
  optional: true,
};
const project: TemplateColumn = {
  key: "project_id",
  label: "项目编号",
  type: "number",
};
const amount: TemplateColumn = {
  key: "amount",
  label: "未收或未付金额(元)",
  type: "number",
};
export const dataTemplates: Record<
  DataCategory,
  { title: string; columns: TemplateColumn[] }
> = {
  projects: {
    title: "项目基本信息",
    columns: [
      id,
      { key: "project_name", label: "项目名称" },
      { key: "owner_type", label: "业主类型" },
      { key: "contract_amount", label: "合同额(元)", type: "number" },
      { key: "confirmed_output", label: "累计产值(元)", type: "number" },
      { key: "billed_amount", label: "累计开票(元)", type: "number" },
      { key: "collected_amount", label: "累计实收(元)", type: "number" },
    ],
  },
  accounts: {
    title: "资金账户",
    columns: [
      id,
      { key: "account_name", label: "账户名称" },
      { key: "bank_name", label: "开户银行" },
      {
        key: "scope",
        label: "账户用途",
        values: {
          一般资金: "general",
          工资专户: "payroll",
          项目专户: "project",
          未分类: "unassigned",
        },
      },
      { ...project, optional: true },
      { key: "balance", label: "账户总余额(元)", type: "number" },
      { key: "available_balance", label: "可用余额(元)", type: "number" },
      { key: "frozen_amount", label: "冻结金额(元)", type: "number" },
    ],
  },
  collections: {
    title: "逐笔回款",
    columns: [
      id,
      project,
      amount,
      { key: "expected_date", label: "预计到账日", type: "date" },
      { key: "receipt_account_id", label: "收款账户编号", type: "number" },
      { key: "collection_stage", label: "回款阶段" },
      { key: "invoice_status", label: "开票状态" },
      { key: "aging_days", label: "账龄(天)", type: "number" },
      { key: "historical_delay_days", label: "历史延期(天)", type: "number" },
    ],
  },
  payments: {
    title: "逐笔付款",
    columns: [
      id,
      project,
      { key: "payee_name", label: "收款单位" },
      { key: "payment_type", label: "付款类型" },
      amount,
      { key: "due_date", label: "到期日", type: "date" },
      { key: "contract_amount", label: "分包合同额(元)", type: "number" },
      { key: "settled_amount", label: "累计结算(元)", type: "number" },
      { key: "paid_amount", label: "累计已付(元)", type: "number" },
      { key: "attachment_status", label: "资料状态" },
      { key: "is_rigid_payment", label: "刚性付款", type: "boolean" },
      { key: "is_labor_payment", label: "劳务或工资付款", type: "boolean" },
      {
        key: "latest_payment_date",
        label: "最迟付款日",
        type: "date",
        optional: true,
      },
      {
        key: "allow_split",
        label: "允许拆分付款",
        type: "boolean",
        optional: true,
      },
    ],
  },
};
