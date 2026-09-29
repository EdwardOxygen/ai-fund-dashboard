import solver from "javascript-lp-solver";
import {
  addDays,
  cents,
  sum,
  isRigid,
  initialPools,
  eligiblePools,
  makeEvents,
  localDate,
  SCENARIOS,
  projectPositions,
  type CashEvent,
  type SimulationInput,
  type PaymentPlan,
} from "./simulation";
import { projectFundingFloor } from "./projectPlanning";
type Constraint = { min?: number; max?: number; equal?: number };
/** Deterministic MILP: continuous account allocations + binary whole/minimum payments.
 * Units are 10,000 CNY. Unpaid obligations are explicit slack, never deleted.
 * Positive weighted costs are business policy weights, not probability estimates.
 */
export function optimizePayments(
  input: SimulationInput,
  scenario = SCENARIOS[0],
  horizon = 30,
  safety = 3000000,
  start = localDate(),
): PaymentPlan {
  horizon = Math.max(1, Math.min(90, Math.floor(horizon)));
  const end = addDays(start, horizon - 1);
  const pools = initialPools(input);
  const events = makeEvents(input, scenario, start).events;
  for (const e of events.filter(
    (e) => e.direction === "in" && e.pool !== "unassigned",
  ))
    pools[e.pool] ??= 0;
  if (input.payments.filter((p) => p.due_date <= end).length > 100)
    throw new Error("单次付款优化支持100笔到期申请，请缩短预测周期。");
  const constraints: Record<string, Constraint> = {};
  const variables: Record<string, Record<string, number>> = {};
  const ints: Record<string, number> = {};
  const names = new Map(input.projects.map((p) => [p.id, p.project_name]));
  const allocations: Record<
    string,
    { payment: number; date: string; pool: string }
  > = {};
  const constrainedProjects = input.projects.filter((p) => p.plan?.enabled);
  for (const p of constrainedProjects)
    if (p.plan!.as_of !== start)
      throw new Error(
        `${p.project_name}的预测基准日不是${start}，请先更新累计实收与期初存贷差后再统筹付款。`,
      );
  for (let t = 0; t < horizon; t++) {
    const date = addDays(start, t);
    for (const p of constrainedProjects) {
      const budget =
        p.plan!.opening_balance +
        sum(
          events
            .filter(
              (e) =>
                e.direction === "in" &&
                e.pool !== "unassigned" &&
                e.project_id === p.id &&
                e.date <= date,
            )
            .map((e) => e.amount),
        ) -
        projectFundingFloor(p.plan!, date);
      if (budget < -0.01)
        throw new Error(
          `${p.project_name}在${date}即使不新增付款也超出垫资约束，请核实期初存贷差、回款或垫资期限。`,
        );
      constraints[`project_${p.id}_${t}`] = {
        max: Math.max(0, budget) / 10000,
      };
    }
    for (const pool of Object.keys(pools)) {
      const funds =
        (pools[pool] +
          sum(
            events
              .filter(
                (e) =>
                  e.direction === "in" && e.pool === pool && e.date <= date,
              )
              .map((e) => e.amount),
          )) /
        10000;
      constraints[`cash_${pool}_${t}`] = { max: funds };
      if (pool === "general") {
        constraints[`reserve_${t}`] = { max: funds - safety / 10000 };
        variables[`slack_${t}`] = { cost: 1, [`reserve_${t}`]: -1 };
      }
    }
  }
  const active = input.payments.filter((p) => p.due_date <= end);
  for (const p of active) {
    const event = events.find((e) => e.id === `p${p.id}`)!;
    const amount = event.amount / 10000;
    constraints[`payment_${p.id}`] = { equal: amount };
    variables[`unpaid_${p.id}`] = {
      cost: isRigid(p)
        ? 1000000000
        : (10000 + p.ai_score * 100) * (p.priority_weight ?? 1),
      [`payment_${p.id}`]: 1,
    };
    if (p.attachment_status !== "完整") continue;
    const earliest = p.due_date < start ? start : p.due_date;
    const last = isRigid(p)
      ? earliest
      : p.latest_payment_date && p.latest_payment_date > earliest
        ? p.latest_payment_date
        : earliest;
    for (let t = 0; t < horizon; t++) {
      const date = addDays(start, t);
      if (date < earliest || date > last) continue;
      const group = `group_${p.id}_${t}`;
      const minimum = p.minimum_installment || 0;
      if (!p.allow_split || minimum > 0) {
        const y = `chosen_${p.id}_${t}`;
        ints[y] = 1;
        constraints[`binary_${y}`] = { max: 1 };
        constraints[group] = { max: 0 };
        variables[y] = { cost: 0.00001, [`binary_${y}`]: 1, [group]: -amount };
        const lower = `min_${p.id}_${t}`;
        constraints[lower] = { min: 0 };
        variables[y][lower] = -(p.allow_split
          ? Math.min(minimum / 10000, amount)
          : amount);
      }
      for (const pool of eligiblePools(p, pools)) {
        const key = `pay_${p.id}_${t}_${pool}`;
        const v: Record<string, number> = {
          cost: t * 0.01,
          [`payment_${p.id}`]: 1,
        };
        if (!p.allow_split || minimum > 0) {
          v[group] = 1;
          v[`min_${p.id}_${t}`] = 1;
        }
        for (let k = t; k < horizon; k++) {
          v[`cash_${pool}_${k}`] = 1;
          if (pool === "general") v[`reserve_${k}`] = 1;
          if (constraints[`project_${p.project_id}_${k}`])
            v[`project_${p.project_id}_${k}`] = 1;
        }
        variables[key] = v;
        allocations[key] = { payment: p.id, date, pool };
      }
    }
  }
  if (active.length > 100)
    throw new Error(
      "单次付款优化支持100笔到期申请，请缩短预测周期。情景预测不受此限制。",
    );
  const solved = solver.Solve({
    optimize: "cost",
    opType: "min",
    constraints,
    variables,
    ints,
    options: { timeout: 5000, tolerance: 0 },
  });
  if (!solved.feasible || !solved.bounded)
    throw new Error("未得到可行付款方案，请检查账户余额与输入条件。");
  const rows = input.payments.map((p) => {
    const event = events.find((e) => e.id === `p${p.id}`)!;
    const list = Object.entries(allocations)
      .filter(([, a]) => a.payment === p.id)
      .map(([key, a]) => ({
        date: a.date,
        pool: a.pool,
        amount: cents(Number(solved[key] || 0) * 10000),
      }))
      .filter((a) => a.amount > 0);
    const scheduled = sum(list.map((a) => a.amount));
    const unpaid = cents(Math.max(0, event.amount - scheduled));
    return {
      id: p.id,
      name: `${names.get(p.project_id)} / ${p.payee_name}`,
      amount: event.amount,
      scheduled,
      unpaid,
      due_date: p.due_date,
      allocations: list,
      status:
        p.due_date > end
          ? "预测期外义务"
          : p.attachment_status !== "完整"
            ? "资料不全，保留待付"
            : unpaid > 0.01
              ? "存在未覆盖义务"
              : "已安排（待人工审批）",
    };
  });
  // Independently validate rounded allocations before displaying a feasible plan.
  for (const row of rows) {
    if (Math.abs(row.scheduled + row.unpaid - row.amount) > 0.02)
      throw new Error("付款金额校验未通过，请复核输入。");
    const p = input.payments.find((p) => p.id === row.id)!;
    if (
      !p.allow_split &&
      row.scheduled > 0.01 &&
      Math.abs(row.scheduled - row.amount) > 0.02
    )
      throw new Error("整笔支付约束未通过。");
  }
  for (let t = 0; t < horizon; t++)
    for (const pool of Object.keys(pools)) {
      const date = addDays(start, t);
      const available =
        pools[pool] +
        sum(
          events
            .filter(
              (e) => e.direction === "in" && e.pool === pool && e.date <= date,
            )
            .map((e) => e.amount),
        );
      const used = sum(
        rows
          .flatMap((r) => r.allocations)
          .filter((a) => a.pool === pool && a.date <= date)
          .map((a) => a.amount),
      );
      if (used > available + 0.02)
        throw new Error("账户余额校验未通过，未展示该方案。");
    }
  let minGeneral = Infinity,
    below = 0;
  const cashflow: PaymentPlan["cashflow"] = [];
  for (let t = 0; t < horizon; t++) {
    const date = addDays(start, t);
    const balance =
      pools.general +
      sum(
        events
          .filter(
            (e) =>
              e.direction === "in" && e.pool === "general" && e.date <= date,
          )
          .map((e) => e.amount),
      ) -
      sum(
        rows
          .flatMap((r) => r.allocations)
          .filter((a) => a.pool === "general" && a.date <= date)
          .map((a) => a.amount),
      );
    minGeneral = Math.min(minGeneral, balance);
    if (balance < safety - 0.01) below++;
    const total =
      sum(Object.values(pools)) +
      sum(
        events
          .filter(
            (e) =>
              e.direction === "in" && e.pool !== "unassigned" && e.date <= date,
          )
          .map((e) => e.amount),
      ) -
      sum(
        rows
          .flatMap((r) => r.allocations)
          .filter((a) => a.date <= date)
          .map((a) => a.amount),
      );
    cashflow.push({
      date,
      general_balance: cents(balance),
      total_balance: cents(total),
    });
  }
  const plannedEvents: CashEvent[] = [
    ...events.filter((e) => e.direction === "in"),
    ...rows.flatMap((r) =>
      r.allocations.map((a, i) => ({
        ...events.find((e) => e.id === `p${r.id}`)!,
        id: `plan${r.id}-${i}`,
        date: a.date,
        amount: a.amount,
        pool: a.pool,
      })),
    ),
  ];
  const project_positions = projectPositions(
    input,
    plannedEvents,
    start,
    horizon,
  );
  if (project_positions.some((p) => p.breach_date))
    throw new Error("项目垫资约束复核未通过，未展示该方案。");
  return {
    status: "已求得可行方案（限时求解，不承诺全局最优）",
    rows,
    scheduled: sum(rows.map((r) => r.scheduled)),
    unpaid: sum(rows.filter((r) => r.due_date <= end).map((r) => r.unpaid)),
    scheduled_week: sum(
      rows
        .flatMap((r) => r.allocations)
        .filter((a) => a.date < addDays(start, 7))
        .map((a) => a.amount),
    ),
    minimum_general_balance: cents(minGeneral),
    below_safety_days: below,
    cashflow,
    project_positions,
  };
}
