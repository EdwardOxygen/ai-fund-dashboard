const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  forecastView,
  forecastBasis,
  defaultProjectPlan,
  SCENARIOS,
  paymentPriorityCost,
} = require("../.artifacts/engine.cjs");
const start = "2026-09-29";
test("施工节点压力不平移期初欠收、预付款和固定质保金", () => {
  const { makeEvents } = require("../.artifacts/engine.cjs");
  const d = fixture();
  d.collections = ["期初逾期进度款待收","期初进度款待收","预付款","质保金","进度款","竣工款","结算款"].map((stage,i) => ({
    ...d.collections[0],id:i+1,collection_stage:stage,generated:true
  }));
  const rows = makeEvents(d,{...SCENARIOS[0],construction_delay_days:14},start).events.filter(e=>e.direction==="in");
  assert.ok(rows.filter(e=>e.source_id<=4).every(e=>e.date===start));
  assert.ok(rows.filter(e=>e.source_id>=5).every(e=>e.date==="2026-10-13"));
});
function fixture() {
  const projects = [1, 2].map((id) => ({
    id,
    project_name: "项目" + id,
    owner_type: "企业",
    contract_amount: 1000,
    plan: {
      ...defaultProjectPlan(1000, 0, 0, start),
      enabled: true,
      opening_balance: id === 1 ? 400 : -100,
      advance_limit: 200,
    },
  }));
  return {
    projects,
    accounts: [
      {
        id: 1,
        scope: "general",
        available_balance: 700,
        account_name: "一般户",
      },
    ],
    collections: [
      {
        id: 1,
        project_id: 1,
        amount: 80,
        expected_date: start,
        receipt_account_id: 1,
        collection_stage: "进度款",
      },
      {
        id: 2,
        project_id: 2,
        amount: 20,
        expected_date: start,
        receipt_account_id: 1,
        collection_stage: "进度款",
      },
    ],
    payments: [
      {
        id: 1,
        project_id: 1,
        amount: 30,
        due_date: start,
        payment_type: "材料款",
        payee_name: "甲",
        attachment_status: "完整",
      },
      {
        id: 2,
        project_id: 2,
        amount: 40,
        due_date: start,
        payment_type: "材料款",
        payee_name: "乙",
        attachment_status: "完整",
      },
    ],
  };
}
test("公司期初只取银行账户，不叠加项目存贷差", () => {
  const r = forecastView(fixture(), { kind: "company" });
  assert.equal(r.opening, 700);
  assert.equal(r.ending, 730);
  assert.equal(
    r.projectRows.reduce((s, p) => s + p.inflow, 0),
    r.inflow,
  );
  assert.equal(
    r.projectRows.reduce((s, p) => s + p.outflow, 0),
    r.outflow,
  );
});
test("单项目只取自身收支和期初，不继承公司账户余额", () => {
  const r = forecastView(fixture(), { kind: "project", projectId: 1 });
  assert.equal(r.opening, 400);
  assert.equal(r.inflow, 80);
  assert.equal(r.outflow, 30);
  assert.equal(r.ending, 450);
  assert.ok(r.events.every((e) => e.project_id === 1));
});
test("余额为正但低于储备目标不是实际资金缺口", () => {
  const r = forecastView(
    fixture(),
    { kind: "company" },
    SCENARIOS[0],
    30,
    1000,
  );
  assert.equal(r.fundingGap, 0);
  assert.equal(r.reserveGap, 300);
});
test("未绑定银行的回款保留项目归属，公司可调度预测单列排除", () => {
  const d = fixture();
  delete d.collections[0].receipt_account_id;
  const c = forecastView(d, { kind: "company" }),
    p = forecastView(d, { kind: "project", projectId: 1 });
  assert.equal(c.inflow, 20);
  assert.equal(c.projectRows[0].unassigned, 80);
  assert.equal(p.inflow, 80);
});
test("不同项目基准日禁止直接合并，但单项目可以独立测算", () => {
  const d = fixture();
  d.projects[1].plan.as_of = "2026-10-01";
  assert.throws(() => forecastBasis(d, { kind: "company" }), /基准日不一致/);
  assert.equal(forecastBasis(d, { kind: "project", projectId: 1 }), start);
});
test("期初垫资已经超限时，即使首日收回也保留超限提示", () => {
  const d = fixture();
  d.projects[0].plan.opening_balance = -250;
  const r = forecastView(d, { kind: "project", projectId: 1 });
  assert.equal(r.peakAdvance, 250);
  assert.equal(r.breachDate, start);
});
test("压力影响项目与实际测算范围互不混淆", () => {
  const scenario = {
    ...SCENARIOS[0],
    receipt_delay_days: 60,
    project_ids: [2],
  };
  const r = forecastView(fixture(), { kind: "company" }, scenario, 30);
  assert.equal(r.projectRows.length, 2);
  assert.equal(r.inflow, 80);
  assert.equal(r.projectRows[1].inflow, 0);
});
test("付款优先代价不再受旧AI评分影响，只由权重和到期规则决定", () => {
  const p = { ...fixture().payments[0], priority_weight: 6, ai_score: 0 };
  assert.equal(paymentPriorityCost(p, start), 60000);
  assert.equal(paymentPriorityCost({ ...p, ai_score: 100 }, start), 60000);
});
