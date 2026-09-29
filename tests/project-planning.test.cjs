const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProjectSchedule,
  defaultProjectPlan,
  distributeOutput,
  validateProjectPlan,
  optimizePayments,
  simulate,
  SCENARIOS,
  csvEncode,
  csvParse,
} = require("../.artifacts/engine.cjs");
const start = "2026-09-29";
test("编辑日期为空时自动产值预览不会崩溃，保存时仍需严格校验", () => {
  assert.deepEqual(distributeOutput(1000, "", "2026-12-31", "uniform"), []);
  assert.deepEqual(distributeOutput(-1, start, "2026-12-31", "uniform"), []);
});
function plan(patch = {}) {
  return {
    ...defaultProjectPlan(1000, 0, 0, start),
    enabled: true,
    receipt_account_id: 1,
    output_mode: "manual",
    output_periods: [
      { date: "2026-09-30", amount: 250 },
      { date: "2026-10-31", amount: 250 },
      { date: "2026-11-30", amount: 250 },
      { date: "2026-12-31", amount: 250 },
    ],
    payment_days: 0,
    completion_date: "2027-01-31",
    settlement_date: "2027-02-28",
    retention_date: "2028-02-28",
    ...patch,
  };
}
const total = (xs) =>
  Math.round(xs.reduce((s, r) => s + r.amount, 0) * 100) / 100;
test("累计80-90-97-100只收差额，合同1000全周期收1000", () => {
  const r = buildProjectSchedule(1000, plan());
  assert.equal(total(r.receipts), 1000);
  assert.deepEqual(
    r.receipts
      .filter((r) => ["竣工款", "结算款", "质保金"].includes(r.name))
      .map((r) => r.amount),
    [100, 70, 30],
  );
});
test("预付款达到门槛当期开始扣回，封顶已收预付款余额", () => {
  const r = buildProjectSchedule(
    1000,
    plan({ advance_ratio: 20, recovery_threshold: 50, recovery_ratio: 50 }),
  );
  assert.equal(total(r.receipts), 1000);
  const progress = r.receipts.filter((r) => r.name === "进度款");
  assert.deepEqual(
    progress.map((r) => r.amount),
    [200, 75, 125, 200],
  );
  assert.match(progress[1].note, /本期扣回125元/);
  assert.match(progress[2].note, /本期扣回75元/);
});
test("按进度款基数扣回与按产值扣回可分别设置", () => {
  const r = buildProjectSchedule(
    1000,
    plan({
      advance_ratio: 20,
      recovery_threshold: 0,
      recovery_ratio: 50,
      recovery_basis: "progress",
    }),
  );
  assert.deepEqual(
    r.receipts.filter((r) => r.name === "进度款").map((r) => r.amount),
    [100, 100, 200, 200],
  );
  assert.equal(total(r.receipts), 1000);
});
test("期初已收及已扣回不再次入账，未来收款等于剩余合同金额", () => {
  const p = plan({
    opening_output: 250,
    received_to_date: 300,
    advance_ratio: 20,
    advance_received: 200,
    advance_recovered: 100,
    output_periods: [
      { date: "2026-10-31", amount: 250 },
      { date: "2026-11-30", amount: 250 },
      { date: "2026-12-31", amount: 250 },
    ],
    recovery_threshold: 0,
    recovery_ratio: 100,
  });
  const r = buildProjectSchedule(1000, p);
  assert.equal(total(r.receipts), 700);
  assert.equal(r.receipts.filter((r) => r.name === "预付款").length, 0);
});
test("历史超进度付款不重复收，所有未来收款非负且总额封顶", () => {
  const p = plan({ received_to_date: 900 });
  const r = buildProjectSchedule(1000, p);
  assert.equal(total(r.receipts), 100);
  assert.ok(r.receipts.every((r) => r.amount >= 0));
});
test("边界比例与历史数据组合全周期金额守恒", () => {
  for (const advance of [0, 10, 50, 100])
    for (const recovery of [0, 10, 100])
      for (const received of [0, 400, 950]) {
        const r = buildProjectSchedule(
          1000,
          plan({
            advance_ratio: advance,
            recovery_ratio: recovery,
            received_to_date: received,
          }),
        );
        assert.equal(total(r.receipts), 1000 - received);
        assert.ok(r.receipts.every((e) => e.amount >= 0));
      }
});
test("自动均匀与S形产值保留到分，不丢尾差", () => {
  for (const curve of ["uniform", "s-curve"]) {
    const r = distributeOutput(999.99, "2026-09-29", "2027-03-03", curve);
    assert.equal(total(r), 999.99);
    assert.equal(r.at(-1).date, "2027-03-03");
  }
});
test("拒绝重复产值月份、不守恒总额、倒挂累计比例和无效扣回", () => {
  for (const patch of [
    { output_periods: [{ date: "2026-09-30", amount: 400 }] },
    { completion_ratio: 70 },
    { advance_ratio: 10, advance_received: 200 },
    { advance_received: 0, advance_recovered: 1 },
    { funding_end: "2026-01-01" },
    {
      output_periods: [
        { date: "2026-09-29", amount: 500 },
        { date: "2026-09-30", amount: 500 },
      ],
    },
  ])
    assert.throws(() => validateProjectPlan(plan(patch), 1000));
});
function sub(patch = {}) {
  return {
    id: "S1",
    name: "钢结构分包",
    mode: "detailed",
    amount: 1000,
    paid: 100,
    entry_date: "2026-09-29",
    end_date: "2026-12-31",
    payment_days: 0,
    priority: 4,
    progress_ratio: 80,
    completion_ratio: 90,
    settlement_ratio: 97,
    completion_date: "2027-01-31",
    settlement_date: "2027-02-28",
    retention_date: "2028-02-28",
    allow_split: true,
    grace_days: 30,
    documents_ready: true,
    ...patch,
  };
}
test("详细分包累计付款补差，简易分包只分配剩余估算额", () => {
  for (const mode of ["simple", "detailed"]) {
    const r = buildProjectSchedule(
      1000,
      plan({ subcontracts: [sub({ mode })] }),
    );
    assert.equal(total(r.payments), 900);
    assert.ok(r.payments.every((p) => p.date >= start));
  }
});
test("分包进场前无付款，基准日前历史未付结转且不重付已付款", () => {
  const r = buildProjectSchedule(
    1000,
    plan({ subcontracts: [sub({ entry_date: "2026-11-01" })] }),
  );
  assert.ok(r.payments.every((p) => p.date >= "2026-11-01"));
  const r2 = buildProjectSchedule(
    1000,
    plan({ subcontracts: [sub({ entry_date: "2026-01-01", paid: 800 })] }),
  );
  assert.equal(total(r2.payments), 200);
});
function input(patch = {}) {
  return {
    accounts: [
      {
        id: 1,
        account_name: "一般账户",
        scope: "general",
        available_balance: 1000,
      },
    ],
    projects: [
      {
        id: 1,
        project_name: "项目1",
        owner_type: "企业",
        plan: plan({ advance_limit: 300, funding_end: "2026-10-10" }),
      },
    ],
    collections: [],
    payments: [
      {
        id: 1,
        project_id: 1,
        payee_name: "分包",
        payment_type: "专业分包",
        amount: 800,
        due_date: start,
        ai_score: 70,
        priority_weight: 12,
        is_rigid_payment: false,
        attachment_status: "完整",
        allow_split: true,
      },
    ],
    ...patch,
  };
}
test("公司资金足够仍受项目垫资峰值限制", () => {
  const p = optimizePayments(input(), SCENARIOS[0], 7, 0, start);
  assert.equal(p.scheduled, 300);
  assert.equal(p.unpaid, 500);
  assert.equal(p.project_positions[0].peak_advance, 300);
  assert.equal(p.cashflow[0].general_balance, 700);
});
test("项目垫资到期前须回正，不能靠未付义务消失美化", () => {
  const p = optimizePayments(input(), SCENARIOS[0], 30, 0, start);
  assert.equal(p.scheduled, 0);
  assert.equal(p.unpaid, 800);
  assert.ok(p.project_positions.every((p) => p.breach_date === null));
});
test("期限内回款覆盖垫资，释放付款额度", () => {
  const d = input({
    collections: [
      {
        id: 1,
        project_id: 1,
        expected_date: "2026-10-05",
        amount: 800,
        receipt_account_id: 1,
        collection_stage: "已确权",
        historical_delay_days: 0,
      },
    ],
  });
  const p = optimizePayments(d, SCENARIOS[0], 30, 0, start);
  assert.equal(p.scheduled, 300);
  assert.equal(p.project_positions[0].ending, 500);
});
test("期初垫资在到期无法回正时报告不可行而非伪造现金", () => {
  const d = input();
  d.projects[0].plan.opening_balance = -200;
  assert.throws(
    () => optimizePayments(d, SCENARIOS[0], 30, 0, start),
    /即使不新增付款/,
  );
});
test("项目与分包综合系数确实改变同额付款先后", () => {
  const d = input();
  d.projects = [];
  d.payments = [
    {
      ...d.payments[0],
      id: 1,
      amount: 1000,
      allow_split: false,
      priority_weight: 1,
    },
    {
      ...d.payments[0],
      id: 2,
      amount: 1000,
      allow_split: false,
      priority_weight: 25,
    },
  ];
  const p = optimizePayments(d, SCENARIOS[0], 7, 0, start);
  assert.equal(p.rows[1].scheduled, 1000);
  assert.equal(p.rows[0].scheduled, 0);
});
test("资金统筹不重复增加公司现金，基准预测暴露项目超额垫资", () => {
  const r = simulate(input(), SCENARIOS[0], 30, 0, start);
  assert.equal(r.days[0].ending_balance, 200);
  assert.equal(r.project_positions[0].breach_date, start);
  assert.equal(r.project_positions[0].minimum, -800);
});
test("项目基准过期时阻止统筹付款", () => {
  const d = input();
  d.projects[0].plan.as_of = "2026-09-28";
  assert.throws(
    () => optimizePayments(d, SCENARIOS[0], 7, 0, start),
    /预测基准日/,
  );
});
test("CSV支持中文、引号、逗号和跨行文本，拒绝错列与非法日期", () => {
  const cols = [
    { key: "name", label: "名称" },
    { key: "n", label: "金额", type: "number" },
    { key: "date", label: "日期", type: "date" },
    { key: "yes", label: "是否", type: "boolean" },
  ];
  const rows = [
    { name: '中文,"测试"\n第二行', n: 0, date: "2026-09-29", yes: false },
  ];
  assert.deepEqual(csvParse("\ufeff" + csvEncode(cols, rows), cols), rows);
  assert.throws(() =>
    csvParse("名称,金额,日期,是否\na,10,2026-02-31,是", cols),
  );
  assert.throws(() => csvParse("名称,金额\na,10", cols));
});
test("CSV模板防公式注入，零金额与否不被当作缺失", () => {
  const c = [
    { key: "s", label: "名称" },
    { key: "n", label: "金额", type: "number" },
  ];
  const encoded = csvEncode(c, [{ s: "=CMD()", n: 0 }]);
  assert.match(encoded, /'=CMD/);
  assert.equal(csvParse(encoded, c)[0].n, 0);
});
