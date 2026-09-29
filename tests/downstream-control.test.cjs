const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultProjectPlan,
  defaultDownstreamControl,
  validateDownstreamControl,
  checkDownstream,
  downstreamForecastChecks,
  mergeCostRows,
  buildProjectSchedule,
  optimizePayments,
  SCENARIOS,
} = require("../.artifacts/engine.cjs");
const { api } = require("../.artifacts/api.cjs");
const date = "2026-09-29";
function plan() {
  const p = defaultProjectPlan(1000, 0, 0, date);
  p.enabled = true;
  p.subcontracts = ["专业分包", "材料款", "机械租赁"].map(
    (payment_type, i) => ({
      id: String(i),
      name: payment_type,
      payment_type,
      mode: "simple",
      amount: 300,
      paid: [300, 250, 150][i],
      entry_date: date,
      end_date: p.output_end,
      payment_days: 0,
      priority: 3,
      progress_ratio: 80,
      completion_ratio: 90,
      settlement_ratio: 97,
      completion_date: p.completion_date,
      settlement_date: p.settlement_date,
      retention_date: p.retention_date,
      allow_split: true,
      grace_days: 30,
      documents_ready: true,
    }),
  );
  p.downstream_control = {
    ...defaultDownstreamControl(),
    costs: [{ date, kind: "confirmed", amount: 1000 }],
  };
  return p;
}
test("项目合并全部下游，以已付除已确认成本，恰好70%不预警", () => {
  const c = checkDownstream(plan());
  assert.equal(c.paid, 700);
  assert.equal(c.ratio, 70);
  assert.equal(c.status, "ok");
});
test("在施70、竣工80、结算100自动按独立里程碑切换，不取业主到账日", () => {
  const p = plan();
  Object.assign(p.downstream_control, {
    stage_mode: "auto",
    completion_date: "2026-10-15",
    settlement_date: "2026-11-15",
    costs: [
      ...p.downstream_control.costs,
      ...["2026-10-15", "2026-11-15"].map((date) => ({
        date,
        kind: "planned",
        amount: 1000,
      })),
    ],
  });
  assert.equal(checkDownstream(p).limit, 70);
  assert.equal(checkDownstream(p, "2026-10-15", 150).limit, 80);
  assert.equal(checkDownstream(p, "2026-10-15", 150).excess, 50);
  assert.equal(checkDownstream(p, "2026-11-15", 150).limit, 100);
  assert.equal(checkDownstream(p, "2026-11-15", 150).status, "ok");
});
test("开关、调整比例和手动阶段独立生效，关闭不清空成本", () => {
  const p = plan();
  p.downstream_control.construction_ratio = 60;
  assert.equal(checkDownstream(p).excess, 100);
  p.downstream_control.manual_stage = "completed";
  assert.equal(checkDownstream(p).status, "ok");
  p.downstream_control.enabled = false;
  assert.equal(checkDownstream(p).status, "off");
  assert.equal(p.downstream_control.costs.length, 1);
});
test("缺失、零、过期成本不误报达标，未来不能借用当前成本", () => {
  const p = plan();
  assert.equal(checkDownstream(p, "2026-10-29", 100).status, "missing");
  p.downstream_control.costs[0].amount = 0;
  assert.equal(checkDownstream(p).ratio, null);
  p.downstream_control.costs[0] = {
    date: "2026-08-29",
    amount: 1000,
    kind: "confirmed",
  };
  assert.equal(checkDownstream(p).status, "missing");
  p.downstream_control.stage_mode = "auto";
  assert.equal(checkDownstream(p).stage, null);
});
test("未来只计算同日成本计划和截至该日付款，不把安排金额当实际", () => {
  const p = plan();
  p.downstream_control.costs.push({
    date: "2026-10-29",
    kind: "planned",
    amount: 1100,
  });
  const rows = downstreamForecastChecks(p, "2026-11-29", [
    { date: "2026-10-20", amount: 100 },
    { date: "2026-11-01", amount: 50 },
  ]);
  assert.equal(rows[0].paid, 700);
  assert.equal(rows[1].paid, 800);
  assert.equal(rows[1].excess, 30);
  assert.equal(rows[2].status, "missing");
  assert.equal(rows[2].paid, 850);
});
test("比例预警不改变原合同应付、质保金及优化排程", () => {
  const p = plan(),
    before = buildProjectSchedule(1000, p);
  p.downstream_control.construction_ratio = 0;
  assert.deepEqual(buildProjectSchedule(1000, p), before);
  const data = {
    accounts: [
      {
        id: 1,
        account_name: "一般",
        scope: "general",
        available_balance: 1000,
      },
    ],
    projects: [{ id: 1, project_name: "测试", owner_type: "企业", plan: p }],
    collections: [],
    payments: [
      {
        id: 1,
        project_id: 1,
        payee_name: "材料",
        payment_type: "材料款",
        amount: 100,
        due_date: date,
        attachment_status: "完整",
        allow_split: true,
      },
    ],
  };
  p.opening_balance = 1000;
  const on = optimizePayments(data, SCENARIOS[0], 7, 0, date);
  p.downstream_control.enabled = false;
  assert.deepEqual(optimizePayments(data, SCENARIOS[0], 7, 0, date), on);
});
test("模板按月份类型合并且保留其他月，拒绝重复与日期金额异常", () => {
  const p = plan(),
    c = p.downstream_control;
  const merged = mergeCostRows(
    [{ date: "2026-08-31", kind: "confirmed", amount: 900 }, ...c.costs],
    [{ date, kind: "confirmed", amount: 1200 }],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[1].amount, 1200);
  for (const costs of [
    [...c.costs, ...c.costs],
    [{ date: "2026-10-01", kind: "confirmed", amount: 1 }],
    [{ date, kind: "planned", amount: 1 }],
    [{ date, kind: "confirmed", amount: -1 }],
    [{ date: "2026-02-30", kind: "confirmed", amount: 1 }],
  ])
    assert.throws(() => validateDownstreamControl({ ...c, costs }, date));
  assert.throws(() =>
    validateDownstreamControl({ ...c, construction_ratio: 90 }, date),
  );
});
let memory;
beforeEach(() => {
  memory = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
    },
    dispatchEvent: () => {},
  };
  global.CustomEvent = class {};
});
test("补充模拟成本只改指定模拟项目，重复执行不覆盖；备份可往返且非法成本不写入", async () => {
  const d = await api.getPlanningData();
  d.collections = [];
  d.payments = [];
  d.projects = [
    "【模拟】滨江道路改造—正常回款",
    "【模拟】城南安置房—回款偏慢",
    "真实项目",
  ].map((project_name, i) => ({
    ...d.projects[0],
    id: i + 1,
    project_name,
    contract_amount: 1000,
    confirmed_output: 0,
    collected_amount: 0,
    billed_amount: 0,
    plan: { ...plan(), enabled: false, downstream_control: undefined },
  }));
  api.importData(JSON.stringify(d));
  const before = await api.getPlanningData();
  assert.equal(await api.fillDownstreamDemo(), 2);
  const after = await api.getPlanningData();
  assert.deepEqual(after.accounts, before.accounts);
  assert.deepEqual(after.collections, before.collections);
  assert.deepEqual(after.payments, before.payments);
  for (let i = 0; i < 3; i++) {
    const p = structuredClone(after.projects[i]);
    delete p.plan.downstream_control;
    const old = structuredClone(before.projects[i]);
    delete old.plan.downstream_control;
    assert.deepEqual(p, old);
  }
  assert.equal(after.projects[2].plan.downstream_control, undefined);
  assert.equal(await api.fillDownstreamDemo(), 0);
  assert.deepEqual((await api.getPlanningData()).projects, after.projects);
  api.importData(JSON.stringify(after));
  assert.deepEqual((await api.getPlanningData()).projects, after.projects);
  const bad = structuredClone(after);
  bad.projects[0].plan.downstream_control.costs[0].amount = -1;
  assert.throws(() => api.importData(JSON.stringify(bad)));
  assert.deepEqual((await api.getPlanningData()).projects, after.projects);
});
