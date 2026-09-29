import { projectFundingFloor, type ProjectPlan } from "./projectPlanning";
export type FundScope = "general" | "payroll" | "project" | "unassigned";
export interface AccountInput {
  id: number;
  account_name: string;
  available_balance: number;
  scope?: FundScope;
  project_id?: number;
}
export interface CollectionTerms {
  milestone_date?: string;
  certification_days?: number;
  payment_days?: number;
  first_receipt_ratio?: number;
  installment_gap_days?: number;
  retention_ratio?: number;
  retention_date?: string;
  receipt_account_id?: number;
}
export interface PaymentTerms {
  latest_payment_date?: string;
  allow_split?: boolean;
  minimum_installment?: number;
}
export interface CollectionInput extends CollectionTerms {
  generated?: boolean;
  calculation_note?: string;
  id: number;
  project_id: number;
  amount: number;
  expected_date: string;
  collection_stage: string;
  historical_delay_days: number;
}
export interface PaymentInput extends PaymentTerms {
  priority_weight?: number;
  calculation_note?: string;
  id: number;
  project_id: number;
  amount: number;
  due_date: string;
  payment_type: string;
  payee_name: string;
  is_rigid_payment: boolean;
  attachment_status: string;
  ai_score: number;
}
export interface SimulationInput {
  planning_warnings?: string[];
  accounts: AccountInput[];
  projects: {
    id: number;
    project_name: string;
    owner_type: string;
    plan?: ProjectPlan;
  }[];
  collections: CollectionInput[];
  payments: PaymentInput[];
}
export interface Scenario {
  id: string;
  name: string;
  receipt_delay_days: number;
  construction_delay_days: number;
  material_increase_pct: number;
  project_ids?: number[];
}
export const SCENARIOS: Scenario[] = [
  {
    id: "base",
    name: "合同基准",
    receipt_delay_days: 0,
    construction_delay_days: 0,
    material_increase_pct: 0,
  },
  {
    id: "delay",
    name: "回款延迟",
    receipt_delay_days: 30,
    construction_delay_days: 0,
    material_increase_pct: 0,
  },
  {
    id: "construction",
    name: "施工承压",
    receipt_delay_days: 0,
    construction_delay_days: 14,
    material_increase_pct: 5,
  },
  {
    id: "stress",
    name: "组合压力",
    receipt_delay_days: 30,
    construction_delay_days: 14,
    material_increase_pct: 5,
  },
];
export interface CashEvent {
  id: string;
  source_id: number;
  project_id: number;
  name: string;
  date: string;
  amount: number;
  direction: "in" | "out";
  pool: string;
  rigid: boolean;
  note: string;
}
export interface SimulationDay {
  id: number;
  forecast_date: string;
  opening_balance: number;
  expected_collection: number;
  planned_payment: number;
  rigid_payment: number;
  ending_balance: number;
  general_balance: number;
  risk_level: "绿色" | "黄色" | "红色" | "重大风险";
}
export interface SimulationResult {
  project_positions: ProjectPosition[];
  scenario: Scenario;
  days: SimulationDay[];
  events: CashEvent[];
  warnings: string[];
  summary: {
    opening: number;
    general_opening: number;
    restricted_opening: number;
    unassigned: number;
    minimum: number;
    minimum_date: string;
    gap: number;
    first_gap_date: string | null;
    below_safety_days: number;
    inflow: number;
    outflow: number;
    beyond_horizon_inflow: number;
    beyond_horizon_outflow: number;
  };
}
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
}
export const cents = (n: number) => Math.round(n * 100) / 100;
export const sum = (items: number[]) => cents(items.reduce((a, b) => a + b, 0));
export const isRigid = (p: PaymentInput) =>
  p.is_rigid_payment || /工资|税款/.test(p.payment_type);
export function accountPool(account: AccountInput): string {
  if (account.scope === "general") return "general";
  if (account.scope === "payroll") return "payroll";
  if (account.scope === "project" && account.project_id)
    return `project:${account.project_id}`;
  return "unassigned";
}
export function initialPools(input: SimulationInput) {
  const pools: Record<string, number> = { general: 0, payroll: 0 };
  for (const account of input.accounts) {
    const pool = accountPool(account);
    if (pool !== "unassigned")
      pools[pool] = cents((pools[pool] || 0) + account.available_balance);
  }
  return pools;
}
export function eligiblePools(
  payment: PaymentInput,
  pools: Record<string, number>,
): string[] {
  const keys = [
    `project:${payment.project_id}`,
    ...(/工资/.test(payment.payment_type) ? ["payroll"] : []),
    "general",
  ];
  return keys.filter((key) => key in pools);
}
export function makeEvents(
  input: SimulationInput,
  scenario: Scenario,
  start = localDate(),
) {
  const events: CashEvent[] = [];
  const warnings: string[] = [...(input.planning_warnings || [])];
  const names = new Map(input.projects.map((p) => [p.id, p.project_name]));
  const targeted = (id: number) =>
    !scenario.project_ids?.length || scenario.project_ids.includes(id);
  for (const c of input.collections) {
    const project = names.get(c.project_id) || `项目${c.project_id}`;
    const hasTerms = Boolean(c.milestone_date);
    let date = hasTerms
      ? addDays(
          c.milestone_date!,
          (c.certification_days || 0) + (c.payment_days || 0),
        )
      : c.expected_date;
    const affected = targeted(c.project_id);
    if (affected)
      date = addDays(
        date,
        scenario.receipt_delay_days +
          (c.collection_stage === "未到节点" || c.generated
            ? scenario.construction_delay_days
            : 0),
      );
    const overdue = date < start;
    if (overdue) {
      warnings.push(
        `${project}回款#${c.id}原预计日已过，暂放预测首日，须重新确认到账日。`,
      );
      date = start;
    }
    if (!hasTerms)
      warnings.push(
        `${project}回款#${c.id}尚未设置合同节点，沿用人工预计到账日。`,
      );
    const retention = cents((c.amount * (c.retention_ratio || 0)) / 100);
    const net = cents(c.amount - retention);
    const first = cents((net * (c.first_receipt_ratio ?? 100)) / 100);
    const account = input.accounts.find((a) => a.id === c.receipt_account_id);
    const pool = account ? accountPool(account) : "unassigned";
    if (pool === "unassigned")
      warnings.push(
        `${project}回款#${c.id}未指定可用的收款账户，暂不作为可调度资金。`,
      );
    const push = (
      suffix: string,
      when: string,
      amount: number,
      note: string,
    ) => {
      if (amount > 0)
        events.push({
          id: `c${c.id}-${suffix}`,
          source_id: c.id,
          project_id: c.project_id,
          name: `${project} / ${suffix}`,
          date: when,
          amount,
          direction: "in",
          pool,
          rigid: false,
          note,
        });
    };
    const explanation = hasTerms
      ? `节点${c.milestone_date}＋审核${c.certification_days || 0}天＋账期${c.payment_days || 0}天；情景：${scenario.name}`
      : `人工预计日${c.expected_date}；情景：${scenario.name}`;
    push(
      c.generated ? c.collection_stage : "首期回款",
      date,
      first,
      c.calculation_note
        ? `${c.calculation_note}；${explanation}`
        : explanation,
    );
    push(
      "后续回款",
      addDays(date, c.installment_gap_days || 0),
      cents(net - first),
      explanation,
    );
    if (retention > 0) {
      if (c.retention_date)
        push(
          "质保金",
          c.retention_date < start ? start : c.retention_date,
          retention,
          "按独立质保金释放日期；不随普通回款自动平移",
        );
      else {
        warnings.push(
          `${project}质保金释放日期未填，保留${retention}元未排期应收。`,
        );
        push("待定质保金", "9999-12-31", retention, "释放日期待确认");
      }
    }
  }
  for (const p of input.payments) {
    const extra =
      targeted(p.project_id) && /材料/.test(p.payment_type)
        ? scenario.material_increase_pct
        : 0;
    events.push({
      id: `p${p.id}`,
      source_id: p.id,
      project_id: p.project_id,
      name: `${names.get(p.project_id) || p.project_id} / ${p.payee_name}`,
      date: p.due_date < start ? start : p.due_date,
      amount: cents(p.amount * (1 + extra / 100)),
      direction: "out",
      pool: "general",
      rigid: isRigid(p),
      note: `${p.payment_type}；${p.due_date < start ? "逾期义务结转首日；" : ""}${extra ? `材料压力假设+${extra}%；` : ""}原到期日${p.due_date}`,
    });
  }
  return {
    events: events.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    ),
    warnings,
  };
}
export function simulate(
  input: SimulationInput,
  scenario: Scenario = SCENARIOS[0],
  horizon = 90,
  safety = 3000000,
  start = localDate(),
): SimulationResult {
  const daysCount = Math.max(1, Math.min(730, Math.floor(horizon)));
  const { events, warnings } = makeEvents(input, scenario, start);
  const pools = initialPools(input);
  const opening = sum(Object.values(pools));
  const generalOpening = pools.general;
  const unassigned = sum(
    input.accounts
      .filter((a) => accountPool(a) === "unassigned")
      .map((a) => a.available_balance),
  );
  if (unassigned)
    warnings.push("存在未分类账户余额；请确认用途后再纳入可调度资金。");
  const days: SimulationDay[] = [];
  const paymentMap = new Map(input.payments.map((p) => [p.id, p]));
  for (let t = 0; t < daysCount; t++) {
    const date = addDays(start, t);
    const dayEvents = events.filter((e) => e.date === date);
    const begin = sum(Object.values(pools));
    let inflow = 0,
      rigid = 0,
      planned = 0,
      rigidShortfall = false;
    for (const event of dayEvents.filter(
      (e) => e.direction === "in" && e.pool !== "unassigned",
    )) {
      pools[event.pool] = cents((pools[event.pool] || 0) + event.amount);
      inflow += event.amount;
    }
    const outflows = dayEvents
      .filter((e) => e.direction === "out")
      .sort((a, b) => Number(b.rigid) - Number(a.rigid));
    for (const event of outflows) {
      let remaining = event.amount;
      for (const key of eligiblePools(
        paymentMap.get(event.source_id)!,
        pools,
      )) {
        const take = Math.min(remaining, Math.max(0, pools[key]));
        pools[key] = cents(pools[key] - take);
        remaining = cents(remaining - take);
      }
      // Negative general balance is the unfunded obligation, not fictional available cash.
      if (remaining > 0) {
        pools.general = cents(pools.general - remaining);
        if (event.rigid) rigidShortfall = true;
      }
      if (event.rigid) rigid += event.amount;
      else planned += event.amount;
    }
    const ending = sum(Object.values(pools));
    days.push({
      id: t + 1,
      forecast_date: date,
      opening_balance: begin,
      expected_collection: cents(inflow),
      planned_payment: cents(planned),
      rigid_payment: cents(rigid),
      ending_balance: ending,
      general_balance: pools.general,
      risk_level: rigidShortfall
        ? "重大风险"
        : pools.general < safety
          ? "红色"
          : pools.general < safety * 1.25
            ? "黄色"
            : "绿色",
    });
  }
  const minimum = days.reduce((a, b) =>
    b.general_balance < a.general_balance ? b : a,
  );
  const end = addDays(start, daysCount - 1);
  const project_positions = projectPositions(input, events, start, daysCount);
  for (const p of project_positions)
    if (p.breach_date)
      warnings.push(`${p.name}于${p.breach_date}突破项目垫资额度或期限。`);
  for (const p of input.projects)
    if (p.plan?.enabled && p.plan.as_of !== start)
      warnings.push(
        `${p.project_name}合同预测基准日为${p.plan.as_of}，当前预测起点为${start}；请更新累计实收、期初存贷差等基准，避免已完成收支重复预测。`,
      );
  return {
    scenario,
    days,
    events,
    project_positions,
    warnings: [...new Set(warnings)],
    summary: {
      opening,
      general_opening: generalOpening,
      restricted_opening: cents(opening - generalOpening),
      unassigned,
      minimum: minimum.general_balance,
      minimum_date: minimum.forecast_date,
      gap: cents(Math.max(0, safety - minimum.general_balance)),
      first_gap_date:
        days.find((d) => d.general_balance < safety)?.forecast_date || null,
      below_safety_days: days.filter((d) => d.general_balance < safety).length,
      inflow: sum(days.map((d) => d.expected_collection)),
      outflow: sum(days.map((d) => d.planned_payment + d.rigid_payment)),
      beyond_horizon_inflow: sum(
        events
          .filter((e) => e.direction === "in" && e.date > end)
          .map((e) => e.amount),
      ),
      beyond_horizon_outflow: sum(
        events
          .filter((e) => e.direction === "out" && e.date > end)
          .map((e) => e.amount),
      ),
    },
  };
}

export interface ProjectPosition {
  id: number;
  name: string;
  opening: number;
  minimum: number;
  peak_advance: number;
  breach_date: string | null;
  ending: number;
  days: { date: string; balance: number; floor: number }[];
}
export function projectPositions(
  input: SimulationInput,
  events: CashEvent[],
  start: string,
  horizon: number,
): ProjectPosition[] {
  return input.projects
    .filter((p) => p.plan?.enabled)
    .map((project) => {
      const plan = project.plan!;
      let balance = plan.opening_balance,
        minimum = balance;
      let breach: string | null = null;
      const projectEvents = events.filter(
        (e) => e.project_id === project.id && e.pool !== "unassigned",
      );
      const days = Array.from({ length: horizon }, (_, t) => {
        const date = addDays(start, t);
        balance = cents(
          balance +
            sum(
              projectEvents
                .filter((e) => e.date === date)
                .map((e) => (e.direction === "in" ? e.amount : -e.amount)),
            ),
        );
        const floor = projectFundingFloor(plan, date);
        if (balance < floor - 0.01 && !breach) breach = date;
        minimum = Math.min(minimum, balance);
        return { date, balance, floor };
      });
      return {
        id: project.id,
        name: project.project_name,
        opening: plan.opening_balance,
        minimum,
        peak_advance: cents(Math.max(0, -minimum)),
        breach_date: breach,
        ending: balance,
        days,
      };
    });
}
export interface PaymentPlanRow {
  id: number;
  name: string;
  amount: number;
  scheduled: number;
  unpaid: number;
  due_date: string;
  status: string;
  allocations: { date: string; amount: number; pool: string }[];
}
export interface PaymentPlan {
  status: string;
  rows: PaymentPlanRow[];
  scheduled: number;
  unpaid: number;
  scheduled_week: number;
  minimum_general_balance: number;
  below_safety_days: number;
  cashflow: { date: string; general_balance: number; total_balance: number }[];
  project_positions: ProjectPosition[];
}
export function attributeScenario(
  base: SimulationResult,
  selected: SimulationResult,
) {
  const cutoff = selected.summary.minimum_date;
  const effects = new Map<
    number,
    { project_id: number; receipt_shift: number; cost_change: number }
  >();
  for (const result of [base, selected])
    for (const e of result.events.filter(
      (e) =>
        e.date <= cutoff && (e.direction === "out" || e.pool !== "unassigned"),
    )) {
      const row = effects.get(e.project_id) || {
        project_id: e.project_id,
        receipt_shift: 0,
        cost_change: 0,
      };
      const sign = result === base ? 1 : -1;
      if (e.direction === "in") row.receipt_shift += sign * e.amount;
      else row.cost_change -= sign * e.amount;
      effects.set(e.project_id, row);
    }
  return [...effects.values()]
    .map((r) => ({
      ...r,
      receipt_shift: cents(r.receipt_shift),
      cost_change: cents(r.cost_change),
      total: cents(r.receipt_shift + r.cost_change),
    }))
    .sort((a, b) => b.total - a.total);
}
