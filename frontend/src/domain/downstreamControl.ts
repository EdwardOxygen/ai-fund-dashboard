import type { ProjectPlan } from "./projectPlanning";
import type { TemplateColumn } from "./templateImport";

export type DownstreamStage = "construction" | "completed" | "settled";
export interface CostConfirmation {
  date: string;
  amount: number;
  kind: "confirmed" | "planned";
}
export interface DownstreamControl {
  enabled: boolean;
  construction_ratio: number;
  completed_ratio: number;
  settled_ratio: number;
  stage_mode: "auto" | "manual";
  manual_stage: DownstreamStage;
  completion_date: string;
  settlement_date: string;
  costs: CostConfirmation[];
}
export const stageNames = {
  construction: "在施",
  completed: "竣工",
  settled: "结算后",
};
export const defaultDownstreamControl = (): DownstreamControl => ({
  enabled: true,
  construction_ratio: 70,
  completed_ratio: 80,
  settled_ratio: 100,
  stage_mode: "manual",
  manual_stage: "construction",
  completion_date: "",
  settlement_date: "",
  costs: [],
});
const validDate = (s: string) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validateDownstreamControl(c: DownstreamControl, asOf: string) {
  if (!c || typeof c !== "object" || typeof c.enabled !== "boolean")
    throw new Error("下游比例预警设置无效");
  for (const key of [
    "construction_ratio",
    "completed_ratio",
    "settled_ratio",
  ] as const)
    if (!Number.isFinite(c[key]) || c[key] < 0 || c[key] > 100)
      throw new Error("下游预警比例须为0至100");
  if (
    c.construction_ratio > c.completed_ratio ||
    c.completed_ratio > c.settled_ratio
  )
    throw new Error("预警比例须满足：在施 ≤ 竣工 ≤ 结算后");
  if (
    !["auto", "manual"].includes(c.stage_mode) ||
    !Object.prototype.hasOwnProperty.call(stageNames, c.manual_stage)
  )
    throw new Error("下游预警阶段无效");
  for (const date of [c.completion_date, c.settlement_date])
    if (date !== "" && !validDate(date))
      throw new Error("下游预警里程碑日期无效");
  if (
    c.settlement_date &&
    (!c.completion_date || c.settlement_date < c.completion_date)
  )
    throw new Error("请先填写竣工日期，结算日期不得早于竣工日期");
  if (!Array.isArray(c.costs) || c.costs.length > 600)
    throw new Error("成本记录须为数组，最多600条");
  const months = new Set<string>();
  for (const r of c.costs) {
    if (
      !r ||
      !validDate(r.date) ||
      !Number.isFinite(r.amount) ||
      r.amount < 0 ||
      r.amount > 1e12 ||
      !["confirmed", "planned"].includes(r.kind)
    )
      throw new Error("成本记录须包含有效日期、非负累计金额及确认/计划类型");
    if (
      (r.kind === "confirmed" && r.date > asOf) ||
      (r.kind === "planned" && r.date <= asOf)
    )
      throw new Error(
        "已确认成本日期不得晚于数据基准日，未来成本计划须晚于基准日",
      );
    const key = `${r.kind}:${r.date.slice(0, 7)}`;
    if (months.has(key))
      throw new Error("同一月份、同一类型只能填写一条累计成本");
    months.add(key);
  }
}
export const costColumns: TemplateColumn[] = [
  { key: "date", label: "确认或计划日期", type: "date" },
  {
    key: "kind",
    label: "数据类型",
    values: { 已确认: "confirmed", 未来计划: "planned" },
  },
  { key: "amount", label: "截至该日累计下游成本(元)", type: "number" },
];
export function mergeCostRows(
  current: CostConfirmation[],
  incoming: Record<string, unknown>[],
) {
  const rows = incoming.map((r) => ({
    date: String(r.date),
    kind: r.kind as CostConfirmation["kind"],
    amount: Number(r.amount),
  }));
  const keys = new Set(rows.map((r) => `${r.kind}:${r.date.slice(0, 7)}`));
  return [
    ...current.filter((r) => !keys.has(`${r.kind}:${r.date.slice(0, 7)}`)),
    ...rows,
  ].sort((a, b) => a.date.localeCompare(b.date));
}
export function downstreamStage(
  c: DownstreamControl,
  date: string,
): DownstreamStage | null {
  if (c.stage_mode === "manual") return c.manual_stage;
  // These are physical project milestones, never owner receipt dates.
  if (!c.completion_date) return null;
  if (c.settlement_date && date >= c.settlement_date) return "settled";
  return date >= c.completion_date ? "completed" : "construction";
}
export interface DownstreamCheck {
  date: string;
  basis: "actual" | "forecast";
  paid: number;
  cost: number | null;
  stage: DownstreamStage | null;
  limit: number | null;
  ratio: number | null;
  excess: number;
  status: "off" | "missing" | "warning" | "ok";
  reason: string;
}
export function checkDownstream(
  plan: ProjectPlan,
  date = plan.as_of,
  addedPayment = 0,
): DownstreamCheck {
  const c = plan.downstream_control || defaultDownstreamControl();
  const actual = date === plan.as_of;
  const paid =
    Math.round(
      (plan.subcontracts.reduce((sum, s) => sum + s.paid, 0) +
        (actual ? 0 : addedPayment)) *
        100,
    ) / 100;
  const stage = downstreamStage(c, date);
  const limit = stage ? c[`${stage}_ratio`] : null;
  const cost =
    c.costs.find(
      (r) => r.date === date && r.kind === (actual ? "confirmed" : "planned"),
    )?.amount ?? null;
  const base: DownstreamCheck = {
    date,
    basis: actual ? "actual" : "forecast",
    paid,
    cost,
    stage,
    limit,
    ratio: null,
    excess: 0,
    status: "missing",
    reason: "",
  };
  if (!c.enabled)
    return {
      ...base,
      status: "off",
      reason: "本项目已关闭比例预警，原合同测算不受影响",
    };
  if (!stage)
    return { ...base, reason: "请填写项目竣工日期，或改为手动选择阶段" };
  if (cost === null || cost <= 0)
    return {
      ...base,
      reason: actual
        ? "缺少与基准日一致的正数已确认成本，不能判断是否达标"
        : "该日期没有正数未来成本计划，不沿用当前成本判断未来付款",
    };
  const ratio = (paid / cost) * 100;
  const excess = Math.max(
    0,
    Math.round((paid - (cost * limit!) / 100) * 100) / 100,
  );
  return {
    ...base,
    ratio,
    excess,
    status: excess > 0 ? "warning" : "ok",
    reason:
      excess > 0
        ? "超过预警线，仅提醒；不压减合同应付或改变排序"
        : "未超过预警线，不代表满足全部付款审批条件",
  };
}
export function downstreamForecastChecks(
  plan: ProjectPlan,
  end: string,
  payments: { date: string; amount: number }[],
) {
  const current = checkDownstream(plan);
  if (current.status === "off" || end <= plan.as_of) return [current];
  const dates = [
    ...new Set([
      ...(plan.downstream_control?.costs || [])
        .filter(
          (r) => r.kind === "planned" && r.date > plan.as_of && r.date <= end,
        )
        .map((r) => r.date),
      end,
    ]),
  ].sort();
  return [
    current,
    ...dates.map((date) =>
      checkDownstream(
        plan,
        date,
        payments
          .filter((p) => p.date >= plan.as_of && p.date <= date)
          .reduce((s, p) => s + p.amount, 0),
      ),
    ),
  ];
}
