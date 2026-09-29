const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  makeEvents,
  forecastView,
  optimizePayments,
  defaultProjectPlan,
  SCENARIOS,
} = require("../.artifacts/engine.cjs");
const start = "2026-09-29";
const row = (project_id, patch = {}) => ({
  project_id,
  receipt_delay_days: 0,
  construction_delay_days: 0,
  material_increase_pct: 0,
  ...patch,
});
const scenario = (rows) => ({ ...SCENARIOS[3], project_scenarios: rows });
function input() {
  return {
    accounts: [{ id: 1, scope: "general", available_balance: 10000 }],
    projects: [1, 2, 3].map((id) => ({
      id,
      project_name: "项目" + id,
      owner_type: "企业",
      plan: {
        ...defaultProjectPlan(1000, 0, 0, start),
        enabled: true,
        opening_balance: 1000,
      },
    })),
    collections: [1, 2, 3].map((id) => ({
      id,
      project_id: id,
      amount: 1000,
      expected_date: start,
      milestone_date: start,
      receipt_account_id: 1,
      collection_stage: "进度款",
      generated: true,
    })),
    payments: [1, 2, 3].map((id) => ({
      id,
      project_id: id,
      amount: 100,
      due_date: start,
      payment_type: "材料款",
      payee_name: "分包" + id,
      attachment_status: "完整",
      allow_split: true,
    })),
  };
}
test("未添加情景不施加任何压力，即使兼容全局预设有值", () => {
  assert.deepEqual(
    makeEvents(input(), scenario([]), start).events.map((e) => [
      e.id,
      e.date,
      e.amount,
    ]),
    makeEvents(input(), SCENARIOS[0], start).events.map((e) => [
      e.id,
      e.date,
      e.amount,
    ]),
  );
});
test("不同项目分别延迟和涨价，未添加项目保持原状", () => {
  const rows = makeEvents(
    input(),
    scenario([
      row(1, { receipt_delay_days: 10 }),
      row(2, { receipt_delay_days: 20, material_increase_pct: 5 }),
    ]),
    start,
  ).events;
  assert.equal(
    rows.find((e) => e.direction === "in" && e.project_id === 1).date,
    "2026-10-09",
  );
  assert.equal(
    rows.find((e) => e.direction === "in" && e.project_id === 2).date,
    "2026-10-19",
  );
  assert.equal(
    rows.find((e) => e.direction === "in" && e.project_id === 3).date,
    start,
  );
  assert.equal(
    rows.find((e) => e.direction === "out" && e.project_id === 2).amount,
    105,
  );
  assert.equal(
    rows.find((e) => e.direction === "out" && e.project_id === 1).amount,
    100,
  );
  assert.equal(
    rows.find((e) => e.direction === "out" && e.project_id === 3).amount,
    100,
  );
});
test("同项目晚收天数与未来节点延迟相加", () => {
  const events = makeEvents(
    input(),
    scenario([row(1, { receipt_delay_days: 10, construction_delay_days: 14 })]),
    start,
  ).events;
  assert.equal(
    events.find((e) => e.direction === "in" && e.project_id === 1).date,
    "2026-10-23",
  );
});

test("未来节点延后不额外推迟期初欠收、预付款和质保金", () => {
  for (const stage of ["期初欠收", "预付款", "质保金"]) {
    const d = input();
    d.collections[0].collection_stage = stage;
    const events = makeEvents(
      d,
      scenario([
        row(1, { receipt_delay_days: 10, construction_delay_days: 14 }),
      ]),
      start,
    ).events;
    assert.equal(
      events.find((e) => e.direction === "in" && e.project_id === 1).date,
      "2026-10-09",
    );
  }
});
test("移除一条情景只恢复这个项目，其他情景仍有效", () => {
  const rows = [
    row(1, { receipt_delay_days: 30 }),
    row(2, { material_increase_pct: 10 }),
  ];
  const events = makeEvents(
    input(),
    scenario(rows.filter((r) => r.project_id !== 1)),
    start,
  ).events;
  assert.equal(
    events.find((e) => e.direction === "in" && e.project_id === 1).date,
    start,
  );
  assert.equal(
    events.find((e) => e.direction === "out" && e.project_id === 2).amount,
    110,
  );
});
test("单项目结果不受其他项目情景污染，公司汇总仍包含全部项目", () => {
  const d = input(),
    s = scenario([
      row(2, { receipt_delay_days: 30, material_increase_pct: 10 }),
    ]);
  assert.equal(
    forecastView(d, { kind: "project", projectId: 1 }, s, 7).inflow,
    1000,
  );
  const c = forecastView(d, { kind: "company" }, s, 7);
  assert.equal(c.projectRows.length, 3);
  assert.equal(c.inflow, 2000);
  assert.equal(c.outflow, 310);
});
test("情景计算和付款引擎保持金额一致且不修改原数据", () => {
  const d = input(),
    before = JSON.stringify(d),
    s = scenario([row(2, { material_increase_pct: 5 })]);
  assert.equal(optimizePayments(d, s, 7, 0, start).scheduled, 305);
  assert.equal(forecastView(d, { kind: "company" }, s, 7).outflow, 305);
  assert.equal(JSON.stringify(d), before);
});
test("同项目重复情景及非法数值明确拒绝，不能静默叠加", () => {
  assert.throws(
    () => makeEvents(input(), scenario([row(1), row(1)]), start),
    /只能添加一条/,
  );
  for (const value of [-1, 366, NaN, Infinity, 1.5])
    assert.throws(
      () =>
        makeEvents(
          input(),
          scenario([row(1, { receipt_delay_days: value })]),
          start,
        ),
      /非负整数/,
    );
});
