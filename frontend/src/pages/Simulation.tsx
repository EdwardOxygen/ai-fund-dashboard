import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import ReactECharts from "../components/Chart";
import { api, formatWan, SAFETY_LINE, type LocalStore } from "../api";
import PageHeader from "../components/PageHeader";
import {
  accountPool,
  attributeScenario,
  localDate,
  SCENARIOS,
  simulate,
  type CollectionTerms,
  type PaymentTerms,
  type PaymentPlan,
  type Scenario,
} from "../domain/simulation";

const scopes = [
  { value: "general", label: "一般资金" },
  { value: "payroll", label: "工资专户" },
  { value: "project", label: "项目专户" },
  { value: "unassigned", label: "用途待确认" },
];
const poolName = (pool: string) =>
  pool === "general"
    ? "一般资金"
    : pool === "payroll"
      ? "工资专户"
      : pool === "unassigned"
        ? "用途待确认"
        : "项目专户 " + pool.split(":")[1];

export default function Simulation({
  allocationMode = false,
}: {
  allocationMode?: boolean;
}) {
  const [data, setData] = useState<LocalStore | null>(null);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState<Scenario>({ ...SCENARIOS[0] });
  const [horizon, setHorizon] = useState(30);
  const [safety, setSafety] = useState(SAFETY_LINE);
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [solving, setSolving] = useState(false);
  const [editing, setEditing] = useState<{
    kind: "collection" | "payment" | "account";
    id: number;
  } | null>(null);
  const [form] = Form.useForm();
  const [messageApi, context] = message.useMessage();
  const start = localDate();
  const workerRef = useRef<Worker | null>(null);
  const solveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      clearTimeout(solveTimer.current);
    },
    [],
  );
  useEffect(() => {
    workerRef.current?.terminate();
    clearTimeout(solveTimer.current);
    setSolving(false);
    setPlan(null);
  }, [data, scenario, horizon, safety]);

  useEffect(() => {
    const load = () => {
      api
        .getSimulationData()
        .then((d) => {
          setData(d);
          setError("");
          setPlan(null);
        })
        .catch((e) => setError(e.message));
    };
    load();
    window.addEventListener("fund-dashboard-refresh", load);
    return () => window.removeEventListener("fund-dashboard-refresh", load);
  }, []);
  const result = useMemo(
    () => (data ? simulate(data, scenario, horizon, safety, start) : null),
    [data, scenario, horizon, safety, start],
  );
  const base = useMemo(
    () => (data ? simulate(data, SCENARIOS[0], horizon, safety, start) : null),
    [data, horizon, safety, start],
  );
  const comparisons = useMemo(
    () =>
      data
        ? SCENARIOS.map((s) =>
            simulate(
              data,
              { ...s, project_ids: scenario.project_ids },
              horizon,
              safety,
              start,
            ),
          )
        : [],
    [data, horizon, safety, scenario.project_ids, start],
  );
  const attribution = useMemo(
    () => (base && result ? attributeScenario(base, result) : []),
    [base, result],
  );
  const names = new Map(
    data?.projects.map((p) => [p.id, p.project_name]) || [],
  );
  const changeScenario = (change: Partial<Scenario>) => {
    setScenario((s) => ({ ...s, ...change }));
    setPlan(null);
  };
  function edit(kind: "collection" | "payment" | "account", id: number) {
    const row =
      kind === "collection"
        ? data?.collections.find((c) => c.id === id)
        : kind === "payment"
          ? data?.payments.find((p) => p.id === id)
          : data?.accounts.find((a) => a.id === id);
    form.resetFields();
    form.setFieldsValue({
      first_receipt_ratio: 100,
      retention_ratio: 0,
      certification_days: 0,
      payment_days: 0,
      installment_gap_days: 0,
      allow_split: false,
      minimum_installment: 0,
      scope: "unassigned",
      ...row,
    });
    setEditing({ kind, id });
  }
  async function save() {
    try {
      const values = await form.validateFields();
      if (editing?.kind === "collection")
        await api.updateCollectionTerms(editing.id, {
          ...values,
          milestone_date: values.milestone_date || undefined,
          retention_date: values.retention_date || undefined,
        } as CollectionTerms);
      if (editing?.kind === "payment")
        await api.updatePaymentTerms(editing.id, {
          ...values,
          latest_payment_date: values.latest_payment_date || undefined,
        } as PaymentTerms);
      if (editing?.kind === "account")
        await api.updateAccountScope(
          editing.id,
          values.scope,
          values.project_id,
        );
      setEditing(null);
      messageApi.success("条件已保存，所有预测已同步更新");
    } catch (e) {
      if (e instanceof Error) messageApi.error(e.message);
    }
  }
  function solve() {
    if (!data) return;
    if (horizon > 90) {
      messageApi.info("长期预测可查看两年；付款统筹请将周期切换至90天以内。");
      return;
    }
    setSolving(true);
    setPlan(null);
    workerRef.current?.terminate();
    const worker = new Worker(
      new URL("../domain/optimizer.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    const done = () => {
      clearTimeout(solveTimer.current);
      worker.terminate();
      setSolving(false);
    };
    worker.onmessage = (event) => {
      if (event.data.error) messageApi.error(event.data.error);
      else setPlan(event.data.result);
      done();
    };
    worker.onerror = () => {
      messageApi.error("求解进程异常，请减少申请数量后重试");
      done();
    };
    solveTimer.current = setTimeout(() => {
      messageApi.error("求解超时，请缩短周期或减少到期申请");
      done();
    }, 15000);
    worker.postMessage({ data, scenario, horizon, safety, start });
  }
  function exportResult() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            generated_at: new Date().toISOString(),
            assumptions: { start, horizon, safety, scenario },
            simulation: result,
            attribution,
            payment_plan: plan,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `资金情景推演-${start}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!data || !result || !base)
    return error ? <Alert type="error" message={error} /> : <Spin />;
  const money = (value: number) => formatWan(value);
  return (
    <>
      {context}
      <PageHeader
        eyebrow="资金决策 / 本地引擎"
        title={allocationMode ? "公司统筹付款" : "收支情景推演"}
        description={
          allocationMode
            ? "项目重要性与分包优先系数共同参与排序；在账户用途、公司现金和项目垫资边界内生成付款建议。"
            : "将项目合同收支汇总到公司，比较回款延迟与施工压力下的资金变化。"
        }
        actions={<Button onClick={exportResult}>导出推演结果</Button>}
      />
      <Alert
        className="page-section"
        showIcon
        type="info"
        message={`${data.data_mode === "demo" ? "当前为演示数据" : "当前浏览器数据"} · 非随机情景推演 · 金额单位：万元`}
        description="延迟和涨价为可修改的压力假设，不表示发生概率。基准包含全部未付义务；负余额表示未筹足的资金需求，不表示允许账户透支。"
      />
      <Card
        className="page-section"
        title="模拟条件"
        extra={<Tag>预测起点 {start}</Tag>}
      >
        <Row gutter={[20, 16]}>
          <Col xs={24} md={6}>
            <label className="field-label">预测周期</label>
            <Select
              aria-label="预测周期"
              className="full-width"
              value={horizon}
              options={(allocationMode
                ? [7, 30, 90]
                : [7, 30, 90, 180, 365, 730]
              ).map((value) => ({
                value,
                label: `${value}天`,
              }))}
              onChange={(v) => {
                setHorizon(v);
                setPlan(null);
              }}
            />
          </Col>
          <Col xs={24} md={6}>
            <label className="field-label">一般资金安全线（元）</label>
            <InputNumber
              aria-label="资金安全线"
              className="full-width"
              min={0}
              value={safety}
              onChange={(v) => {
                setSafety(v || 0);
                setPlan(null);
              }}
            />
          </Col>
          <Col xs={24} md={12}>
            <label className="field-label">
              受影响项目（留空表示全部；可同时选择同一业主的项目）
            </label>
            <Select
              aria-label="受影响项目"
              className="full-width"
              mode="multiple"
              allowClear
              value={scenario.project_ids || []}
              options={data.projects.map((p) => ({
                value: p.id,
                label: p.project_name,
              }))}
              onChange={(v) => changeScenario({ project_ids: v })}
            />
          </Col>
        </Row>
        <div className="scenario-grid">
          {comparisons.map((r) => (
            <button
              key={r.scenario.id}
              className={`scenario-choice ${scenario.id === r.scenario.id ? "selected" : ""}`}
              onClick={() => changeScenario(r.scenario)}
            >
              <span>{r.scenario.name}</span>
              <strong>{money(r.summary.gap)}</strong>
              <small>
                安全线缺口 · {r.summary.first_gap_date || "期内无缺口"}
              </small>
            </button>
          ))}
        </div>
        <Row gutter={[20, 12]}>
          <Col xs={24} md={8}>
            <label className="field-label">回款延迟（天）</label>
            <InputNumber
              aria-label="回款延迟天数"
              min={0}
              max={365}
              precision={0}
              value={scenario.receipt_delay_days}
              onChange={(v) =>
                changeScenario({
                  id: "custom",
                  name: "自定义情景",
                  receipt_delay_days: v || 0,
                })
              }
            />
          </Col>
          <Col xs={24} md={8}>
            <label className="field-label">未达节点工期延迟（天）</label>
            <InputNumber
              aria-label="工期延迟天数"
              min={0}
              max={365}
              precision={0}
              value={scenario.construction_delay_days}
              onChange={(v) =>
                changeScenario({
                  id: "custom",
                  name: "自定义情景",
                  construction_delay_days: v || 0,
                })
              }
            />
          </Col>
          <Col xs={24} md={8}>
            <label className="field-label">材料支出压力增幅（%）</label>
            <InputNumber
              aria-label="材料增幅"
              min={0}
              max={100}
              value={scenario.material_increase_pct}
              onChange={(v) =>
                changeScenario({
                  id: "custom",
                  name: "自定义情景",
                  material_increase_pct: v || 0,
                })
              }
            />
          </Col>
        </Row>
      </Card>
      <Row gutter={[16, 16]} className="page-section">
        {[
          ["一般资金期初", money(result.summary.general_opening)],
          ["专户可用余额", money(result.summary.restricted_opening)],
          ["首次低于安全线", result.summary.first_gap_date || "期内无缺口"],
          ["最大安全线缺口", money(result.summary.gap)],
        ].map(([title, value]) => (
          <Col xs={24} sm={12} xl={6} key={title}>
            <Card>
              <Statistic title={title} value={value} />
            </Card>
          </Col>
        ))}
      </Row>
      <Tabs
        defaultActiveKey={allocationMode ? "plan" : "trend"}
        items={[
          {
            key: "trend",
            label: "趋势与缺口原因",
            children: (
              <>
                <Card
                  className="page-section"
                  title={`一般资金余额 · ${scenario.name}`}
                >
                  <ReactECharts
                    style={{ height: 360 }}
                    option={{
                      tooltip: {
                        trigger: "axis",
                        valueFormatter: (v: number) => `${v.toFixed(2)} 万元`,
                      },
                      legend: { top: 0, data: ["合同基准", "当前情景"] },
                      grid: { left: 75, right: 35, bottom: 35 },
                      xAxis: {
                        type: "category",
                        data: result.days.map((d) => d.forecast_date.slice(5)),
                      },
                      yAxis: { type: "value", name: "万元" },
                      series: [
                        {
                          name: "合同基准",
                          type: "line",
                          step: "end",
                          data: base.days.map((d) => d.general_balance / 10000),
                          color: "#8799ad",
                          lineStyle: { type: "dashed" },
                        },
                        {
                          name: "当前情景",
                          type: "line",
                          step: "end",
                          data: result.days.map(
                            (d) => d.general_balance / 10000,
                          ),
                          color: "#236ba7",
                          markLine: {
                            symbol: "none",
                            data: [{ yAxis: safety / 10000, name: "安全线" }],
                            label: { formatter: "安全线" },
                            lineStyle: { color: "#d97706" },
                          },
                        },
                      ],
                    }}
                  />
                  <Descriptions
                    size="small"
                    column={{ xs: 1, sm: 3 }}
                    items={[
                      {
                        key: "minimum",
                        label: "最低一般资金余额",
                        children: money(result.summary.minimum),
                      },
                      {
                        key: "date",
                        label: "最低点日期",
                        children: result.summary.minimum_date,
                      },
                      {
                        key: "duration",
                        label: "低于安全线",
                        children: `${result.summary.below_safety_days} 天`,
                      },
                      {
                        key: "beyond",
                        label: "预测期外应收",
                        children: money(result.summary.beyond_horizon_inflow),
                      },
                      {
                        key: "unpaid",
                        label: "预测期外应付",
                        children: money(result.summary.beyond_horizon_outflow),
                      },
                      {
                        key: "unassigned",
                        label: "用途未确认余额",
                        children: money(result.summary.unassigned),
                      },
                    ]}
                  />
                </Card>
                <Card
                  className="page-section"
                  title={`截至 ${result.summary.minimum_date}，相对基准的项目现金净流量变化`}
                >
                  <Typography.Paragraph type="secondary">
                    正值表示压力增加，负值表示压力减轻。此表按同一截止日分解收支差额，不把项目贡献直接等同于安全线缺口；专户用途还会影响可调度余额。
                  </Typography.Paragraph>
                  <Table
                    rowKey="project_id"
                    size="small"
                    dataSource={attribution}
                    pagination={false}
                    scroll={{ x: 650 }}
                    columns={[
                      {
                        title: "项目",
                        dataIndex: "project_id",
                        render: (id) => names.get(id),
                      },
                      {
                        title: "回款时移影响",
                        dataIndex: "receipt_shift",
                        render: money,
                      },
                      {
                        title: "支出变化",
                        dataIndex: "cost_change",
                        render: money,
                      },
                      {
                        title: "现金净流量减少",
                        dataIndex: "total",
                        render: money,
                      },
                    ]}
                  />
                </Card>
                <Card title="项目存贷差与垫资风险" className="page-section">
                  <Table
                    rowKey="id"
                    dataSource={result.project_positions}
                    scroll={{ x: 650 }}
                    columns={[
                      { title: "项目", dataIndex: "name" },
                      {
                        title: "期初存贷差",
                        dataIndex: "opening",
                        render: money,
                      },
                      {
                        title: "预测垫资峰值",
                        dataIndex: "peak_advance",
                        render: money,
                      },
                      {
                        title: "首次突破额度或期限",
                        dataIndex: "breach_date",
                        render: (v) => v || "期内未突破",
                      },
                    ]}
                  />
                  <Typography.Text type="secondary">
                    仅检查已启用合同预测的项目。项目存贷差不重复计入公司账户余额。
                  </Typography.Text>
                </Card>
                <Card title="待确认的数据假设">
                  <ul className="assumption-list">
                    {result.warnings.length ? (
                      result.warnings.map((w, i) => <li key={i}>{w}</li>)
                    ) : (
                      <li>当前逐笔收款日期、收款账户与资金用途均已设置。</li>
                    )}
                  </ul>
                </Card>
              </>
            ),
          },
          {
            key: "events",
            label: "逐笔收支明细",
            children: (
              <Card title="包含预测期外收支与待定质保金">
                <Table
                  rowKey="id"
                  dataSource={result.events}
                  scroll={{ x: 1100 }}
                  columns={[
                    {
                      title: "日期",
                      dataIndex: "date",
                      render: (d) =>
                        d === "9999-12-31" ? "释放日期待确认" : d,
                    },
                    { title: "项目 / 收付款对象", dataIndex: "name" },
                    {
                      title: "收支",
                      dataIndex: "direction",
                      render: (d) => (
                        <Tag color={d === "in" ? "green" : "orange"}>
                          {d === "in" ? "收入" : "支出"}
                        </Tag>
                      ),
                    },
                    { title: "金额", dataIndex: "amount", render: money },
                    { title: "计算依据", dataIndex: "note" },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: "terms",
            label: "合同节点与资金用途",
            children: (
              <>
                <Card title="账户资金用途" className="page-section">
                  <Table
                    rowKey="id"
                    dataSource={data.accounts}
                    pagination={false}
                    scroll={{ x: 650 }}
                    columns={[
                      { title: "账户", dataIndex: "account_name" },
                      {
                        title: "可用余额",
                        dataIndex: "available_balance",
                        render: money,
                      },
                      {
                        title: "用途",
                        render: (_, a) => poolName(accountPool(a)),
                      },
                      {
                        title: "操作",
                        render: (_, a) => (
                          <Button onClick={() => edit("account", a.id)}>
                            设置用途
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Card>
                <Card title="回款节点与分期" className="page-section">
                  <Table
                    rowKey="id"
                    dataSource={data.collections}
                    scroll={{ x: 850 }}
                    columns={[
                      {
                        title: "项目",
                        dataIndex: "project_id",
                        render: (id) => names.get(id),
                      },
                      {
                        title: "剩余应收金额",
                        dataIndex: "amount",
                        render: money,
                      },
                      { title: "人工预计日", dataIndex: "expected_date" },
                      {
                        title: "计划来源",
                        render: (_, c) =>
                          c.milestone_date ? "合同节点" : "人工预计日",
                      },
                      {
                        title: "操作",
                        render: (_, c) => (
                          <Button
                            disabled={c.generated}
                            onClick={() => edit("collection", c.id)}
                          >
                            {c.generated ? "项目合同生成" : "设置合同节点"}
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Card>
                <Card title="付款约束">
                  <Table
                    rowKey="id"
                    dataSource={data.payments}
                    scroll={{ x: 900 }}
                    columns={[
                      { title: "收款方", dataIndex: "payee_name" },
                      { title: "到期日", dataIndex: "due_date" },
                      {
                        title: "最迟支付日",
                        render: (_, p) => p.latest_payment_date || p.due_date,
                      },
                      {
                        title: "分期",
                        render: (_, p) => (p.allow_split ? "允许" : "整笔支付"),
                      },
                      {
                        title: "操作",
                        render: (_, p) => (
                          <Button
                            disabled={p.generated}
                            onClick={() => edit("payment", p.id)}
                          >
                            {p.generated ? "项目分包生成" : "设置付款约束"}
                          </Button>
                        ),
                      },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: "plan",
            label: "付款约束安排",
            children: (
              <Card
                title="资金用途与合同约束下的付款方案"
                extra={
                  <Button type="primary" loading={solving} onClick={solve}>
                    计算付款安排
                  </Button>
                }
              >
                <Alert
                  className="page-section"
                  type="info"
                  showIcon
                  message="有限资金 · 项目垫资边界 · 未付义务保留"
                  description="以高惩罚权重保障刚性付款，其他付款按项目重要系数×分包优先系数×付款规则权重安排。公司账户不能透支；项目仅在设置期限内允许限定额度的负存贷差。资料未齐、资金不足或越过垫资边界的付款保留待付。方案是建议，不执行真实付款。"
                />
                {result.warnings
                  .filter((w) => /期初进度待收|尚未录入分包|基准日/.test(w))
                  .map((w, i) => (
                    <Alert
                      key={i}
                      type="warning"
                      showIcon
                      message={w}
                      className="page-section"
                    />
                  ))}
                {horizon > 90 && (
                  <Alert
                    type="info"
                    message="当前为长期收支预测。付款安排仅支持90天内，请切换预测周期后计算。"
                    className="page-section"
                  />
                )}
                {plan ? (
                  <>
                    <Space wrap className="page-section">
                      <Tag>{plan.status}</Tag>
                      <Tag color="green">期内安排 {money(plan.scheduled)}</Tag>
                      <Tag color={plan.unpaid > 0 ? "red" : "green"}>
                        到期未覆盖 {money(plan.unpaid)}
                      </Tag>
                      <Tag>未来7天安排 {money(plan.scheduled_week)}</Tag>
                    </Space>
                    <Typography.Paragraph>
                      方案最低一般资金余额 {money(plan.minimum_general_balance)}
                      ；低于安全线 {plan.below_safety_days}{" "}
                      天。现金余额改善须结合未付义务一起判断。
                    </Typography.Paragraph>
                    <ReactECharts
                      style={{ height: 320 }}
                      option={{
                        tooltip: { trigger: "axis" },
                        legend: { data: ["合同基准", "付款安排后"] },
                        grid: { left: 70, right: 25, bottom: 35 },
                        xAxis: {
                          type: "category",
                          data: plan.cashflow.map((d) => d.date.slice(5)),
                        },
                        yAxis: { type: "value", name: "万元" },
                        series: [
                          {
                            name: "合同基准",
                            type: "line",
                            data: result.days.map(
                              (d) => d.general_balance / 10000,
                            ),
                            lineStyle: { type: "dashed" },
                            color: "#9daabd",
                          },
                          {
                            name: "付款安排后",
                            type: "line",
                            data: plan.cashflow.map(
                              (d) => d.general_balance / 10000,
                            ),
                            color: "#2d7b8e",
                          },
                        ],
                      }}
                    />
                    <Table
                      className="page-section"
                      rowKey="id"
                      pagination={false}
                      dataSource={plan.project_positions}
                      scroll={{ x: 600 }}
                      columns={[
                        { title: "项目", dataIndex: "name" },
                        {
                          title: "安排后垫资峰值",
                          dataIndex: "peak_advance",
                          render: money,
                        },
                        {
                          title: "期末存贷差",
                          dataIndex: "ending",
                          render: money,
                        },
                        {
                          title: "额度与期限校验",
                          render: () => <Tag color="green">期内通过</Tag>,
                        },
                      ]}
                    />
                    <Table
                      rowKey="id"
                      dataSource={plan.rows}
                      scroll={{ x: 1100 }}
                      expandable={{
                        expandedRowRender: (r) =>
                          r.allocations.length ? (
                            <ul>
                              {r.allocations.map((a, i) => (
                                <li key={i}>
                                  {a.date} · {poolName(a.pool)} ·{" "}
                                  {money(a.amount)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "无安排；义务仍然保留。"
                          ),
                      }}
                      columns={[
                        { title: "付款对象", dataIndex: "name" },
                        {
                          title: "义务金额",
                          dataIndex: "amount",
                          render: money,
                        },
                        {
                          title: "安排金额",
                          dataIndex: "scheduled",
                          render: money,
                        },
                        {
                          title: "未安排余额",
                          dataIndex: "unpaid",
                          render: money,
                        },
                        { title: "状态", dataIndex: "status" },
                      ]}
                    />
                  </>
                ) : (
                  <Typography.Paragraph type="secondary">
                    设置资金用途和付款条件后，计算当前情景下的方案。模拟不会执行真实付款。
                  </Typography.Paragraph>
                )}
              </Card>
            ),
          },
        ]}
      />
      <Modal
        open={Boolean(editing)}
        title={
          editing?.kind === "collection"
            ? "合同回款节点"
            : editing?.kind === "payment"
              ? "付款条件"
              : "账户资金用途"
        }
        onCancel={() => setEditing(null)}
        onOk={save}
        okText="保存并重算"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {editing?.kind === "collection" && (
            <>
              <Form.Item
                label="预计达到合同付款节点日（不填则沿用人工预计日）"
                name="milestone_date"
              >
                <Input type="date" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="审核确权天数" name="certification_days">
                    <InputNumber min={0} max={3650} precision={0} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="确权后付款账期（天）" name="payment_days">
                    <InputNumber min={0} max={3650} precision={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="扣除质保金后首期回款比例（%）"
                name="first_receipt_ratio"
              >
                <InputNumber min={0} max={100} />
              </Form.Item>
              <Form.Item
                label="剩余回款距首期的间隔（天）"
                name="installment_gap_days"
              >
                <InputNumber min={0} max={3650} precision={0} />
              </Form.Item>
              <Form.Item
                label="质保金占剩余应收比例（%）"
                name="retention_ratio"
              >
                <InputNumber min={0} max={100} />
              </Form.Item>
              <Form.Item label="质保金释放日期" name="retention_date">
                <Input type="date" />
              </Form.Item>
              <Form.Item
                label="收款账户"
                name="receipt_account_id"
                rules={[{ required: true, message: "请选择收款账户" }]}
              >
                <Select
                  options={data.accounts.map((a) => ({
                    value: a.id,
                    label: a.account_name,
                  }))}
                />
              </Form.Item>
            </>
          )}
          {editing?.kind === "payment" && (
            <>
              <Alert
                className="page-section"
                type="info"
                message="刚性付款按到期日安排；其他付款仅在设置的日期窗口内调整。"
              />
              <Form.Item
                label="合同允许的最迟支付日（不填则按原到期日）"
                name="latest_payment_date"
              >
                <Input type="date" />
              </Form.Item>
              <Form.Item
                label="允许分期"
                name="allow_split"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                label="每次最低分期金额（元；0表示无最低限制）"
                name="minimum_installment"
              >
                <InputNumber min={0} className="full-width" />
              </Form.Item>
            </>
          )}
          {editing?.kind === "account" && (
            <>
              <Form.Item
                label="资金用途"
                name="scope"
                rules={[{ required: true }]}
              >
                <Select options={scopes} />
              </Form.Item>
              <Form.Item noStyle shouldUpdate>
                {() =>
                  form.getFieldValue("scope") === "project" ? (
                    <Form.Item
                      label="专户绑定项目"
                      name="project_id"
                      rules={[
                        { required: true, message: "请选择专户所属项目" },
                      ]}
                    >
                      <Select
                        options={data.projects.map((p) => ({
                          value: p.id,
                          label: p.project_name,
                        }))}
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}
