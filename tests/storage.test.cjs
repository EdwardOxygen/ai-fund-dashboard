const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { api } = require("../.artifacts/api.cjs");
let memory;
test("仅欠收项目进入催收，已收齐和新开工项目不因合同尾款被误判", async () => {
  const raw = await api.getPlanningData();
  raw.projects = [0, 1, 2, 3].map((i) => {
    const received = i === 1 ? 300 : i === 3 ? 0 : 400;
    const p = {
      id: i + 1,
      project_name: `状态测试${i}`,
      owner_type: "政府单位",
      contract_amount: 1000,
      confirmed_output: i === 3 ? 0 : 500,
      billed_amount: received,
      collected_amount: received,
      risk_level: "绿色",
    };
    p.plan = {
      ...defaultProjectPlan(1000, p.confirmed_output, received, localDate()),
      enabled: true,
      receipt_account_id: 1,
    };
    if (i === 1)
      Object.assign(p.plan, {
        opening_receivable_due_date:
          require("../.artifacts/engine.cjs").shiftDate(localDate(), -30),
        opening_receivable_date: require("../.artifacts/engine.cjs").shiftDate(
          localDate(),
          30,
        ),
      });
    return p;
  });
  raw.accounts = [{ ...raw.accounts[0], scope: "general" }];
  raw.collections = [];
  raw.payments = [];
  api.importData(JSON.stringify(raw));
  const risk = await api.getProjectsRisk();
  assert.equal(risk.filter((p) => p.collection_risk !== "低").length, 1);
  const late = risk.find((p) => p.id === 2);
  const masters = await api.getProjectMasters();
  assert.deepEqual(masters.map(p => p.collection_rate), [1,.75,1,1]);
  assert.equal(late.overdue_amount, 100);
  assert.equal(late.overdue_days, 30);
  assert.equal(late.collection_rate, 0.75);
  assert.ok(
    risk
      .filter((p) => p.id !== 2)
      .every((p) => p.collection_rate === 1 && p.overdue_amount === 0),
  );
  const compiled = await api.getSimulationData();
  assert.equal(compiled.collections.filter((c) => c.aging_days > 0).length, 1);
  const section = (await api.getAiReport("local")).report
    .split("四、重点催收")[1]
    .split("五、管理建议")[0];
  assert.match(section, /状态测试1/);
  assert.doesNotMatch(section, /状态测试0|状态测试2|状态测试3/);
});
const { defaultProjectPlan, localDate } = require("../.artifacts/engine.cjs");
beforeEach(() => {
  memory = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => memory.get(k) || null,
      setItem: (k, v) => memory.set(k, v),
    },
    dispatchEvent: () => {},
  };
});
test("示例数据与看板/预测/报告口径一致", async () => {
  const data = await api.getSimulationData();
  assert.equal(data.data_mode, "demo");
  assert.equal(data.accounts.length, 3);
  const [d, rows, report] = await Promise.all([
    api.getDashboardSummary(),
    api.getCashflowForecast(30),
    api.getAiReport("local"),
  ]);
  assert.equal(
    d.gap_30d,
    Math.max(0, -Math.min(...rows.map((r) => r.general_balance))),
  );
  assert.equal(d.cashflow_trend[0].ending_balance, rows[0].general_balance);
  assert.equal(report.metrics.gap_30d, d.gap_30d);
});
test("合法备份可往返导入，金额与条数不变", async () => {
  const d = await api.getSimulationData();
  api.importData(JSON.stringify(d));
  assert.deepEqual(await api.getSimulationData(), d);
});
test("无效金额、日期、项目引用、账户用途不能覆盖当前数据", async () => {
  const d = await api.getSimulationData(),
    original = memory.get("ai-fund-dashboard-local-v3");
  const mutations = [
    (x) => delete x.accounts[0].balance,
    (x) => (x.collections[0].expected_date = "2026-02-31"),
    (x) => (x.payments[0].project_id = 999),
    (x) => (x.accounts[0].scope = "all"),
    (x) => (x.collections[0].retention_ratio = "50"),
    (x) => x.accounts.push({ ...x.accounts[0] }),
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(d);
    mutate(copy);
    assert.throws(() => api.importData(JSON.stringify(copy)));
    assert.equal(memory.get("ai-fund-dashboard-local-v3"), original);
  }
});
test("损坏的浏览器数据不被示例数据静默覆盖", async () => {
  memory.set("ai-fund-dashboard-local-v3", "{broken");
  await assert.rejects(api.getSimulationData());
  assert.equal(memory.get("ai-fund-dashboard-local-v3"), "{broken");
});
test("真实填报后标记本机业务数据并保留原账户", async () => {
  const d = await api.getSimulationData();
  await api.createBankAccount({
    account_name: "测试账户",
    bank_name: "测试银行",
    balance: 1000,
    available_balance: 1000,
    frozen_amount: 0,
    scope: "general",
  });
  const next = await api.getSimulationData();
  assert.equal(next.data_mode, "manual");
  assert.equal(next.accounts.length, d.accounts.length + 1);
});
test("公开报告接口不开放外部调用，状态无密钥", () => {
  const status = require("../api/ai/status.js"),
    report = require("../api/ai/report.js");
  const res = {
    setHeader() {},
    status(s) {
      this.code = s;
      return this;
    },
    json(x) {
      this.body = x;
      return this;
    },
  };
  status({ method: "GET" }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.minimax_configured, false);
  report({ method: "POST", body: {} }, res);
  assert.equal(res.code, 503);
});

test("隐藏外部AI时不产生网络请求，external请求仍返回本地报告", async () => {
  let calls = 0;
  const original = global.fetch;
  global.fetch = async () => {
    calls++;
    throw Error("不应请求网络");
  };
  try {
    const report = await api.getAiReport("external");
    const status = await api.getAiProviderStatus();
    assert.equal(report.report_source, "local");
    assert.equal(status.provider, "local");
    assert.equal(calls, 0);
  } finally {
    global.fetch = original;
  }
});

test("启用项目合同预测不删除原收付款，重算与停用可恢复原口径", async () => {
  const raw = await api.getPlanningData(),
    project = raw.projects[0];
  const p = {
    ...defaultProjectPlan(
      project.contract_amount,
      project.confirmed_output,
      project.collected_amount,
      localDate(),
    ),
    enabled: true,
    receipt_account_id: 1,
  };
  await api.saveProjectPlan(project.id, p);
  const compiled = await api.getSimulationData();
  assert.ok(
    compiled.collections.some(
      (c) => c.project_id === project.id && c.generated,
    ),
  );
  assert.equal(
    compiled.payments.filter((x) => x.project_id === project.id).length,
    0,
  );
  await api.recalculate();
  const saved = await api.getPlanningData();
  const inputs = (rows) =>
    rows.map(({ ai_probability, risk_level, ...row }) => row);
  assert.deepEqual(inputs(saved.collections), inputs(raw.collections));
  assert.deepEqual(
    saved.payments.map((x) => [x.id, x.amount]),
    raw.payments.map((x) => [x.id, x.amount]),
  );
  await api.saveProjectPlan(project.id, { ...p, enabled: false });
  assert.deepEqual(
    (await api.getSimulationData()).collections.map((c) => [c.id, c.amount]),
    raw.collections.map((c) => [c.id, c.amount]),
  );
});
test("批量导入先校验且原子保存，失败不写入任何一行", async () => {
  const raw = await api.getPlanningData();
  const before = memory.get("ai-fund-dashboard-local-v3");
  const rows = [
    {
      project_name: "测试新增项目",
      owner_type: "国有企业",
      contract_amount: 1000,
      confirmed_output: 0,
      billed_amount: 0,
      collected_amount: 0,
    },
    {
      project_name: "非法项目",
      owner_type: "政府单位",
      contract_amount: -1,
      confirmed_output: 0,
      billed_amount: 0,
      collected_amount: 0,
    },
  ];
  await assert.rejects(api.previewBatch("projects", rows));
  await assert.rejects(api.importBatch("projects", rows));
  assert.equal(memory.get("ai-fund-dashboard-local-v3"), before);
  await api.previewBatch("projects", rows.slice(0, 1));
  assert.equal(memory.get("ai-fund-dashboard-local-v3"), before);
  await api.importBatch("projects", rows.slice(0, 1));
  assert.equal(
    (await api.getPlanningData()).projects.length,
    raw.projects.length + 1,
  );
});
test("批量导入更新保留项目合同设置，未知和重复编号被拒绝", async () => {
  const raw = await api.getPlanningData(),
    p = raw.projects[0];
  await api.saveProjectPlan(
    p.id,
    defaultProjectPlan(
      p.contract_amount,
      p.confirmed_output,
      p.collected_amount,
      localDate(),
    ),
  );
  await api.importBatch("projects", [{ ...p, project_name: "修改后的项目" }]);
  assert.ok((await api.getPlanningData()).projects[0].plan);
  await assert.rejects(api.importBatch("projects", [{ ...p, id: 9999 }]));
  await assert.rejects(api.importBatch("projects", [p, p]));
});
test("合同预测项目不接受会被隐藏的逐笔收付款导入", async () => {
  const raw = await api.getPlanningData(),
    p = raw.projects[0];
  await api.saveProjectPlan(p.id, {
    ...defaultProjectPlan(
      p.contract_amount,
      p.confirmed_output,
      p.collected_amount,
      localDate(),
    ),
    enabled: true,
    receipt_account_id: 1,
  });
  await assert.rejects(
    api.createExpectedCollection({ ...raw.collections[0], project_id: p.id }),
    /项目工作台/,
  );
  await assert.rejects(
    api.importBatch("payments", [
      { ...raw.payments[0], id: undefined, project_id: p.id },
    ]),
    /已启用合同预测/,
  );
});
test("项目合同条款备份往返保留嵌套计划，不把预测明细写回原始数据", async () => {
  const raw = await api.getPlanningData(),
    p = raw.projects[0];
  await api.saveProjectPlan(p.id, {
    ...defaultProjectPlan(
      p.contract_amount,
      p.confirmed_output,
      p.collected_amount,
      localDate(),
    ),
    enabled: true,
    receipt_account_id: 1,
  });
  const saved = memory.get("ai-fund-dashboard-local-v3");
  api.importData(saved);
  assert.equal(memory.get("ai-fund-dashboard-local-v3"), saved);
  assert.ok(
    (await api.getPlanningData()).collections.every((c) => !c.generated),
  );
});
