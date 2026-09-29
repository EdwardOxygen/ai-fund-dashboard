/** Project contracts produce deterministic cash events. Amounts are CNY, not probabilities. */
export interface OutputPeriod {
  date: string;
  amount: number;
}
export interface SubcontractPlan {
  payment_type?: string;
  is_rigid_payment?: boolean;
  id: string;
  name: string;
  mode: "simple" | "detailed";
  amount: number;
  paid: number;
  entry_date: string;
  end_date: string;
  payment_days: number;
  priority: number;
  progress_ratio: number;
  completion_ratio: number;
  settlement_ratio: number;
  completion_date: string;
  settlement_date: string;
  retention_date: string;
  allow_split: boolean;
  grace_days: number;
  documents_ready: boolean;
}
export interface ProjectPlan {
  enabled: boolean;
  as_of: string;
  importance: number;
  opening_balance: number;
  advance_limit: number;
  funding_start: string;
  funding_end: string;
  output_mode: "auto" | "manual";
  output_start: string;
  output_end: string;
  output_curve: "uniform" | "s-curve";
  output_periods: OutputPeriod[];
  opening_output: number;
  received_to_date: number;
  opening_receivable_date?: string;
  receipt_account_id?: number;
  payment_days: number;
  progress_ratio: number;
  advance_ratio: number;
  advance_date: string;
  advance_received: number;
  advance_recovered: number;
  recovery_threshold: number;
  recovery_ratio: number;
  recovery_basis: "output" | "progress";
  completion_ratio: number;
  completion_date: string;
  settlement_ratio: number;
  settlement_date: string;
  retention_date: string;
  subcontracts: SubcontractPlan[];
}
export interface PlannedCash {
  date: string;
  amount: number;
  name: string;
  note: string;
  subcontract?: SubcontractPlan;
}
export interface ProjectSchedule {
  receipts: PlannedCash[];
  payments: PlannedCash[];
  outputs: OutputPeriod[];
  warnings: string[];
}
const money = (n: number) => Math.round(n * 100) / 100;
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const validDate = (s: string) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function defaultProjectPlan(
  contract: number,
  output: number,
  received: number,
  today: string,
): ProjectPlan {
  return {
    enabled: false,
    as_of: today,
    importance: 3,
    opening_balance: 0,
    advance_limit: 0,
    funding_start: today,
    funding_end: shiftDate(today, 180),
    output_mode: "auto",
    output_start: today,
    output_end: shiftDate(today, 180),
    output_curve: "s-curve",
    output_periods: [],
    opening_output: Math.min(contract, output),
    received_to_date: received,
    opening_receivable_date: today,
    payment_days: 30,
    progress_ratio: 80,
    advance_ratio: 0,
    advance_date: today,
    advance_received: 0,
    advance_recovered: 0,
    recovery_threshold: 20,
    recovery_ratio: 10,
    recovery_basis: "output",
    completion_ratio: 90,
    completion_date: shiftDate(today, 240),
    settlement_ratio: 97,
    settlement_date: shiftDate(today, 330),
    retention_date: shiftDate(today, 695),
    subcontracts: [],
  };
}
/** Monthly cumulative S curve, differenced, with the last cent assigned to the final period. */
export function distributeOutput(
  amount: number,
  start: string,
  end: string,
  curve: "uniform" | "s-curve",
): OutputPeriod[] {
  if (
    !validDate(start) ||
    !validDate(end) ||
    end < start ||
    !Number.isFinite(amount) ||
    amount < 0
  )
    return [];
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end && dates.length < 600) {
    const d = new Date(`${cursor}T12:00:00Z`);
    const monthEnd = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10);
    const date = monthEnd < end ? monthEnd : end;
    dates.push(date);
    cursor = shiftDate(date, 1);
  }
  let allocated = 0;
  return dates.map((date, i) => {
    const x = (i + 1) / dates.length;
    const target = money(
      amount * (curve === "uniform" ? x : x * x * (3 - 2 * x)),
    );
    const value = money(target - allocated);
    allocated = target;
    return { date, amount: value };
  });
}
export function validateProjectPlan(plan: ProjectPlan, contract: number) {
  if (!plan || typeof plan !== "object" || typeof plan.enabled !== "boolean")
    throw new Error("项目预测设置无效");
  const amounts = [
    "opening_output",
    "received_to_date",
    "advance_limit",
    "advance_received",
    "advance_recovered",
  ] as const;
  for (const k of amounts)
    if (!Number.isFinite(plan[k]) || plan[k] < 0 || plan[k] > 1e12)
      throw new Error(`${k}须为有效非负金额`);
  if (
    !Number.isFinite(plan.opening_balance) ||
    Math.abs(plan.opening_balance) > 1e12
  )
    throw new Error("期初存贷差无效");
  for (const k of [
    "progress_ratio",
    "completion_ratio",
    "settlement_ratio",
    "advance_ratio",
    "recovery_threshold",
    "recovery_ratio",
  ] as const)
    if (!Number.isFinite(plan[k]) || plan[k] < 0 || plan[k] > 100)
      throw new Error("比例须为0至100");
  for (const k of [
    "as_of",
    "funding_start",
    "funding_end",
    "output_start",
    "output_end",
    "advance_date",
    "completion_date",
    "settlement_date",
    "retention_date",
  ] as const)
    if (!validDate(plan[k])) throw new Error("请填写有效的项目日期");
  if (
    !["auto", "manual"].includes(plan.output_mode) ||
    !["uniform", "s-curve"].includes(plan.output_curve) ||
    !["output", "progress"].includes(plan.recovery_basis)
  )
    throw new Error("预测模式无效");
  if (
    !Number.isInteger(plan.importance) ||
    plan.importance < 1 ||
    plan.importance > 5
  )
    throw new Error("项目重要系数须为1至5");
  if (
    !Number.isInteger(plan.payment_days) ||
    plan.payment_days < 0 ||
    plan.payment_days > 3650
  )
    throw new Error("回款账期须为0至3650天");
  if (plan.funding_end < plan.funding_start)
    throw new Error("垫资截止日不得早于开始日");
  if (
    plan.opening_receivable_date &&
    (!validDate(plan.opening_receivable_date) ||
      plan.opening_receivable_date < plan.as_of)
  )
    throw new Error("期初待收进度款到账日须不早于基准日");
  if (plan.opening_output > contract || plan.received_to_date > contract)
    throw new Error("期初产值及累计已收不得超过合同额");
  if (
    plan.advance_received >
      money((contract * plan.advance_ratio) / 100) + 0.01 ||
    plan.advance_recovered > plan.advance_received ||
    plan.advance_received > plan.received_to_date
  )
    throw new Error("预付款已收、已扣及累计已收关系不正确");
  if (!(
    plan.progress_ratio <= plan.completion_ratio &&
    plan.completion_ratio <= plan.settlement_ratio
  ))
    throw new Error("累计支付比例须满足：进度 ≤ 竣工 ≤ 结算 ≤ 100%");
  if (plan.output_end < plan.output_start || plan.output_start < plan.as_of)
    throw new Error("未来产值开始日不得早于预测基准日，结束日不得早于开始日");
  if (plan.output_end > shiftDate(plan.output_start, 3650))
    throw new Error("单次产值计划最长支持10年，请核实日期");
  if (
    plan.advance_date < plan.as_of &&
    money((contract * plan.advance_ratio) / 100) > plan.advance_received
  )
    throw new Error("尚未收到的预付款请设置未来预计到账日");
  if (
    !Array.isArray(plan.output_periods) ||
    plan.output_periods.length > 600 ||
    !Array.isArray(plan.subcontracts) ||
    plan.subcontracts.length > 100
  )
    throw new Error("产值或分包条数超限");
  if (plan.output_mode === "manual") {
    if (
      plan.output_periods.some(
        (p) =>
          !validDate(p.date) ||
          p.date < plan.as_of ||
          !Number.isFinite(p.amount) ||
          p.amount < 0,
      )
    )
      throw new Error("逐月产值须为基准日后的日期和非负金额");
    if (
      new Set(plan.output_periods.map((p) => p.date.slice(0, 7))).size !==
      plan.output_periods.length
    )
      throw new Error("同一月份只填写一条产值");
    if (
      Math.abs(
        plan.output_periods.reduce((s, p) => s + p.amount, 0) +
          plan.opening_output -
          contract,
      ) > 0.02
    )
      throw new Error("未来产值合计加期初累计产值须等于合同额");
  }
  const outputs =
    plan.output_mode === "manual"
      ? plan.output_periods
      : distributeOutput(
          contract - plan.opening_output,
          plan.output_start,
          plan.output_end,
          plan.output_curve,
        );
  const lastOutput = outputs.reduce(
    (date, p) => (p.date > date ? p.date : date),
    plan.as_of,
  );
  if (
    plan.completion_date < shiftDate(lastOutput, plan.payment_days) ||
    plan.settlement_date < plan.completion_date ||
    plan.retention_date < plan.settlement_date
  )
    throw new Error("到账日期须依次为：末期进度款、竣工款、结算款、质保金");
  const firstOutput = outputs.reduce(
    (date, p) => (p.date < date ? p.date : date),
    lastOutput,
  );
  if (
    (contract * plan.advance_ratio) / 100 > plan.advance_received &&
    plan.advance_date > firstOutput
  )
    throw new Error("剩余预付款到账日须不晚于首期未来产值日");
  const ids = new Set<string>();
  for (const sub of plan.subcontracts) {
    if (
      sub.is_rigid_payment !== undefined &&
      typeof sub.is_rigid_payment !== "boolean"
    )
      throw new Error("分包刚性付款标记无效");
    if (
      sub.payment_type !== undefined &&
      ![
        "专业分包",
        "劳务分包",
        "材料款",
        "机械租赁",
        "农民工工资",
        "税款",
      ].includes(sub.payment_type)
    )
      throw new Error("分包付款类型无效");
    if (
      typeof sub.id !== "string" ||
      !sub.id ||
      ids.has(sub.id) ||
      typeof sub.name !== "string" ||
      !sub.name.trim()
    )
      throw new Error("分包编号须唯一，名称不能为空");
    ids.add(sub.id);
    if (
      !["simple", "detailed"].includes(sub.mode) ||
      typeof sub.allow_split !== "boolean" ||
      typeof sub.documents_ready !== "boolean"
    )
      throw new Error("分包模式或标记无效");
    if (
      ![sub.amount, sub.paid].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 1e12,
      ) ||
      sub.paid > sub.amount
    )
      throw new Error("分包金额或累计已付无效");
    if (
      ![
        sub.entry_date,
        sub.end_date,
        sub.completion_date,
        sub.settlement_date,
        sub.retention_date,
      ].every(validDate) ||
      sub.end_date < sub.entry_date
    )
      throw new Error("分包日期无效");
    if (sub.end_date < plan.as_of)
      throw new Error("已完工分包请将剩余应付作为基准日后的简易计划录入");
    if (sub.end_date > shiftDate(sub.entry_date, 3650))
      throw new Error("分包计划最长支持10年，请核实进场与完工日期");
    if (
      ![sub.payment_days, sub.grace_days].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 3650,
      ) ||
      !Number.isInteger(sub.priority) ||
      sub.priority < 1 ||
      sub.priority > 5
    )
      throw new Error("分包账期或优先系数无效");
    if (
      ![sub.progress_ratio, sub.completion_ratio, sub.settlement_ratio].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 100,
      ) ||
      sub.progress_ratio > sub.completion_ratio ||
      sub.completion_ratio > sub.settlement_ratio
    )
      throw new Error("分包累计付款比例须递增且不超过100%");
    if (
      sub.mode === "detailed" &&
      (sub.completion_date < shiftDate(sub.end_date, sub.payment_days) ||
        sub.settlement_date < sub.completion_date ||
        sub.retention_date < sub.settlement_date)
    )
      throw new Error("分包进度、完工、结算和质保金日期须依次排列");
  }
}
export function buildProjectSchedule(
  contract: number,
  p: ProjectPlan,
): ProjectSchedule {
  validateProjectPlan(p, contract);
  const outputs =
    p.output_mode === "manual"
      ? [...p.output_periods].sort((a, b) => a.date.localeCompare(b.date))
      : distributeOutput(
          money(contract - p.opening_output),
          p.output_start,
          p.output_end,
          p.output_curve,
        );
  const receipts: PlannedCash[] = [];
  const payments: PlannedCash[] = [];
  const warnings: string[] = [];
  let received = p.received_to_date,
    output = p.opening_output,
    advance = money(p.advance_received - p.advance_recovered);
  const receipt = (
    date: string,
    amount: number,
    name: string,
    note: string,
  ) => {
    amount = money(Math.min(contract - received, Math.max(0, amount)));
    if (amount > 0) {
      receipts.push({ date, amount, name, note });
      received = money(received + amount);
    }
    return amount;
  };
  const arrears = money(
    Math.max(
      0,
      Math.min(contract, (output * p.progress_ratio) / 100 + advance) -
        received,
    ),
  );
  if (arrears > 0) {
    receipt(
      p.opening_receivable_date || p.as_of,
      arrears,
      "期初进度款待收",
      "期初累计产值×进度比例＋未扣预付款－累计已收；按设置的期初待收到账日",
    );
    warnings.push(
      `期初进度待收${arrears}元按${p.opening_receivable_date || p.as_of}到账，请核实；不是已确认的现金。`,
    );
  }
  const futureAdvance = money(
    (contract * p.advance_ratio) / 100 - p.advance_received,
  );
  const scheduledAdvance = receipt(
    p.advance_date,
    futureAdvance,
    "预付款",
    `合同额×${p.advance_ratio}%－预付款已收`,
  );
  advance = money(advance + scheduledAdvance);
  if (scheduledAdvance < futureAdvance)
    warnings.push(
      "预付款与期初待收合计超过合同剩余金额，预付款按剩余额度封顶；请核实历史收款。",
    );
  for (const period of outputs) {
    output = money(output + period.amount);
    const gross = money((period.amount * p.progress_ratio) / 100);
    const trigger = output >= money((contract * p.recovery_threshold) / 100);
    const recovered = trigger
      ? money(
          Math.min(
            advance,
            gross,
            ((p.recovery_basis === "output" ? period.amount : gross) *
              p.recovery_ratio) /
              100,
          ),
        )
      : 0;
    advance = money(advance - recovered);
    // The cumulative target prevents historical overpayment from being paid a second time.
    const target = money(
      Math.min(contract, (output * p.progress_ratio) / 100 + advance),
    );
    receipt(
      shiftDate(period.date, p.payment_days),
      target - received,
      "进度款",
      `累计产值${output}×${p.progress_ratio}%＋未扣预付款${advance}－此前累计已收；本期扣回${recovered}元`,
    );
  }
  for (const [date, ratio, name] of [
    [p.completion_date, p.completion_ratio, "竣工款"],
    [p.settlement_date, p.settlement_ratio, "结算款"],
    [p.retention_date, 100, "质保金"],
  ] as const)
    receipt(
      date,
      (contract * ratio) / 100 - received,
      name,
      `累计支付至合同额${ratio}%－此前累计已收（含预付款）；剩余预付款由累计目标抵扣`,
    );
  for (const sub of p.subcontracts) {
    let paid = sub.paid;
    const pay = (date: string, target: number, name: string) => {
      const amount = money(Math.max(0, target - paid));
      if (amount) {
        payments.push({
          date: date < p.as_of ? p.as_of : date,
          amount,
          name: `${sub.name} · ${name}`,
          note: `累计目标${money(target)}－此前累计已付${paid}；项目系数${p.importance}×分包系数${sub.priority}`,
          subcontract: sub,
        });
        paid = money(paid + amount);
      }
    };
    if (sub.mode === "simple") {
      const remaining = distributeOutput(
        money(sub.amount - sub.paid),
        sub.entry_date < p.as_of ? p.as_of : sub.entry_date,
        sub.end_date,
        "uniform",
      );
      for (const period of remaining)
        pay(
          shiftDate(period.date, sub.payment_days),
          paid + period.amount,
          "估算付款",
        );
    } else {
      let subOutput = 0;
      for (const period of distributeOutput(
        sub.amount,
        sub.entry_date,
        sub.end_date,
        "uniform",
      )) {
        subOutput = money(subOutput + period.amount);
        pay(
          shiftDate(period.date, sub.payment_days),
          (subOutput * sub.progress_ratio) / 100,
          "进度款",
        );
      }
      pay(
        sub.completion_date,
        (sub.amount * sub.completion_ratio) / 100,
        "完工款",
      );
      pay(
        sub.settlement_date,
        (sub.amount * sub.settlement_ratio) / 100,
        "结算款",
      );
      pay(sub.retention_date, sub.amount, "质保金");
    }
  }
  if (!p.subcontracts.length)
    warnings.push(
      "尚未录入分包，项目合同模式下付款预测为0；不代表项目没有成本。",
    );
  return {
    receipts: receipts.sort((a, b) => a.date.localeCompare(b.date)),
    payments: payments.sort((a, b) => a.date.localeCompare(b.date)),
    outputs,
    warnings,
  };
}
export const projectFundingFloor = (p: ProjectPlan, date: string) =>
  date >= p.funding_start && date <= p.funding_end ? -p.advance_limit : 0;
