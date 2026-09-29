import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Chart from "../components/Chart";
import { useFundData } from "../hooks/useFundData";
import { formatWan } from "../api";
import { forecastView } from "../domain/forecast";
import {
  addDays,
  isRigid,
  SCENARIOS,
  type PaymentPlan,
  type Scenario,
} from "../domain/simulation";

export default function Allocation() {
  const { data, error } = useFundData();
  const navigate = useNavigate();
  const location = useLocation();
  const scenario = useMemo<Scenario>(
    () =>
      location.state?.scenario?.id === "per-project" &&
      Array.isArray(location.state.scenario.project_scenarios)
        ? location.state.scenario
        : SCENARIOS[0],
    [location.state],
  );
  const [horizon, setHorizon] = useState<number>(() =>
    [7, 30, 90].includes(location.state?.horizon) ? location.state.horizon : 30,
  );
  const [safety, setSafety] = useState<number>(() =>
    Number.isFinite(location.state?.safetyWan) && location.state.safetyWan >= 0
      ? location.state.safetyWan
      : 0,
  );
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const version = useRef(0);
  useEffect(() => {
    version.current += 1;
    worker.current?.terminate();
    clearTimeout(timer.current);
    setPlan(null);
    setBusy(false);
    setFailure("");
    return () => {
      version.current += 1;
      worker.current?.terminate();
      clearTimeout(timer.current);
    };
  }, [data, horizon, safety, scenario]);
  const base = useMemo(() => {
    if (!data) return null;
    try {
      return {
        view: forecastView(
          data,
          { kind: "company" },
          scenario,
          horizon,
          safety * 10000,
        ),
        error: "",
      };
    } catch (e) {
      return { view: null, error: (e as Error).message };
    }
  }, [data, horizon, safety, scenario]);
  function solve() {
    if (!data || !base?.view) return;
    const generation = ++version.current;
    setBusy(true);
    setPlan(null);
    setFailure("");
    const w = new Worker(
      new URL("../domain/optimizer.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    const finish = () => {
      w.terminate();
      clearTimeout(timer.current);
      if (version.current === generation) setBusy(false);
    };
    w.onmessage = (e) => {
      if (version.current === generation) {
        if (e.data.error) setFailure(e.data.error);
        else setPlan(e.data.result);
      }
      finish();
    };
    w.onerror = () => {
      if (version.current === generation)
        setFailure("计算失败，请缩短周期后重试。");
      finish();
    };
    timer.current = setTimeout(() => {
      if (version.current === generation)
        setFailure("计算超时，请缩短周期或减少到期笔数。");
      finish();
    }, 15000);
    w.postMessage({
      data,
      scenario,
      horizon,
      safety: safety * 10000,
      start: base.view.start,
    });
  }
  if (error) return <Alert type="error" message={error} />;
  if (!data || !base) return <p>正在加载公司付款计划…</p>;
  const names = new Map(data.projects.map((p) => [p.id, p.project_name]));
  const scenarioAmounts = new Map(
    base.view?.events
      .filter((event) => event.direction === "out")
      .map((event) => [event.source_id, event.amount]),
  );
  const due = base.view
    ? data.payments.filter(
        (p) => p.due_date <= addDays(base.view!.start, horizon - 1),
      )
    : [];
  return (
    <>
      <PageHeader
        title="公司付款统筹"
        description="回答“接下来哪些款先付、能付多少”。先核对原计划，再生成建议；这里只做计划，不会执行银行转账。"
        actions={
          <Button onClick={() => navigate("/company")}>返回公司预测</Button>
        }
      />
      {scenario.project_scenarios && (
        <Alert
          className="page-section"
          showIcon
          type="warning"
          message={`正在按情景安排付款 · 已带入${scenario.project_scenarios.length}个项目情况`}
          description={
            <>
              {scenario.project_scenarios.map((r) => (
                <p key={r.project_id}>
                  {names.get(r.project_id)}：晚收{r.receipt_delay_days}
                  天，未来节点延后{r.construction_delay_days}天，材料付款增加
                  {r.material_increase_pct}%。
                </p>
              ))}
              <p>
                只在所选安排周期内计算（最长90天），其余项目按原计划。下方“按期全付”和“统筹建议”都使用这些情况。
              </p>
              <Button
                onClick={() =>
                  navigate("/allocation", { replace: true, state: null })
                }
              >
                切回原合同计划
              </Button>
            </>
          }
        />
      )}
      <Card
        className="page-section"
        title={
          <Space wrap>
            <Tag color="blue">公司整体 · 全部项目共同排程</Tag>
            <span>数据截至 {base.view?.start || "未统一"}（预测起点）</span>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <label className="field-label">安排周期</label>
            <Select
              aria-label="付款安排周期"
              className="full-width"
              value={horizon}
              onChange={setHorizon}
              options={[7, 30, 90].map((v) => ({ value: v, label: `${v}天` }))}
            />
          </Col>
          <Col xs={24} md={8}>
            <label className="field-label">希望额外留在手里的钱（万元）</label>
            <InputNumber
              aria-label="统筹安全储备万元"
              className="full-width"
              min={0}
              value={safety}
              onChange={(v) => setSafety(v ?? 0)}
            />
          </Col>
          <Col xs={24} md={8}>
            <label className="field-label">
              所选期间到期及以前未付：{due.length} 笔
            </label>
            <Button
              block
              type="primary"
              loading={busy}
              disabled={!base.view || due.length > 100}
              onClick={solve}
            >
              计算公司付款建议
            </Button>
          </Col>
        </Row>
        <p>
          希望优先保障的项目和分包，可在合同里把重要系数调高；工资、税款等优先保障。资料不全、钱不够或超过项目允许垫资额度的款项，会保留在“还未安排”里。预留资金只是尽量达到的目标，不保证一定留足。
        </p>
        <Alert
          type="info"
          message="只有下方计算生成的方案才经过资金及垫资约束。排序靠前不等于已获批或一定能付款。"
        />
      </Card>
      {(base.error || failure || due.length > 100) && (
        <Alert
          className="page-section"
          showIcon
          type="warning"
          message={
            base.error || failure || "单次支持100笔到期义务，请缩短安排周期。"
          }
        />
      )}
      {plan && (
        <>
          <Alert
            className="page-section"
            showIcon
            type="success"
            message={plan.status}
            description={`本期应付${formatWan(plan.scheduled + plan.unpaid)}＝建议安排${formatWan(plan.scheduled)}＋还未安排${formatWan(plan.unpaid)}。请在明细“状态”列查看原因。图中余额变高通常是部分款项暂未支付，不是多赚了钱，也不是债务消失。`}
          />
          <Row gutter={[16, 16]} className="page-section">
            {[
              ["建议安排付款（尚未支付）", plan.scheduled],
              ["还未安排的到期款", plan.unpaid],
              ["安排后最少可统筹的钱", plan.minimum_general_balance],
            ].map(([label, value]) => (
              <Col xs={24} md={8} key={label}>
                <Card>
                  <Statistic title={label} value={formatWan(Number(value))} />
                </Card>
              </Col>
            ))}
          </Row>
          <Card
            title={
              scenario.project_scenarios
                ? "当前情景下可统筹资金：按期全付与统筹建议"
                : "可统筹资金对比：按合同全付，还是按建议安排"
            }
            className="page-section"
          >
            <p>
              预测区间：{base.view?.start} 至 {base.view?.end}
              。横轴为月－日，金额单位为万元。
            </p>
            <Chart
              style={{ height: 370 }}
              option={{
                tooltip: {
                  trigger: "axis",
                  valueFormatter: (v: number) => `${v.toFixed(2)} 万元`,
                },
                legend: { type: "scroll", top: 0, left: 0, right: 0 },
                grid: {
                  left: 12,
                  right: 22,
                  bottom: 76,
                  top: 65,
                  containLabel: true,
                },
                xAxis: {
                  type: "category",
                  data: plan.cashflow.map((d) => d.date),
                  axisLabel: {
                    hideOverlap: true,
                    margin: 14,
                    formatter: (date: string) => date.slice(5),
                  },
                },
                yAxis: { type: "value", name: "万元" },
                dataZoom: [
                  { type: "inside" },
                  { type: "slider", bottom: 10, height: 20, showDetail: false },
                ],
                series: [
                  {
                    name: scenario.project_scenarios
                      ? "当前情景按期全付"
                      : "合同按期全付",
                    type: "line",
                    data: base.view?.days.map((d) => d.general! / 10000),
                    lineStyle: { type: "dashed" },
                  },
                  {
                    name: "付款建议执行后",
                    type: "line",
                    data: plan.cashflow.map((d) => d.general_balance / 10000),
                  },
                ],
              }}
            />
          </Card>
          <Card title="本期付款安排明细" className="page-section">
            <Table
              rowKey="id"
              dataSource={plan.rows
                .filter((r) => r.due_date <= base.view!.end)
                .sort((a, b) => a.due_date.localeCompare(b.due_date))}
              scroll={{ x: 950 }}
              expandable={{
                expandedRowRender: (r) =>
                  r.allocations.length ? (
                    r.allocations.map((a, i) => (
                      <p key={i}>
                        {a.date} ·{" "}
                        {a.pool === "general"
                          ? "一般资金"
                          : a.pool === "payroll"
                            ? "工资专户"
                            : `项目专户${a.pool.split(":")[1]}`}{" "}
                        · {formatWan(a.amount)}
                      </p>
                    ))
                  ) : (
                    <p>未安排义务保留，不计作已付款。</p>
                  ),
              }}
              columns={[
                { title: "项目 / 分包", dataIndex: "name" },
                { title: "原到期日", dataIndex: "due_date" },
                { title: "义务金额", dataIndex: "amount", render: formatWan },
                {
                  title: "安排金额",
                  dataIndex: "scheduled",
                  render: formatWan,
                },
                { title: "未安排金额", dataIndex: "unpaid", render: formatWan },
                { title: "状态", dataIndex: "status" },
              ]}
            />
          </Card>
          <details className="page-section">
            <summary>期外合同义务（不计入本期未安排金额）</summary>
            <Table
              rowKey="id"
              dataSource={plan.rows.filter((r) => r.due_date > base.view!.end)}
              columns={[
                { title: "项目 / 分包", dataIndex: "name" },
                { title: "合同到期日", dataIndex: "due_date" },
                { title: "金额", dataIndex: "amount", render: formatWan },
              ]}
            />
          </details>
          <Card title="付款建议下的项目垫资复核" className="page-section">
            <Table
              rowKey="id"
              pagination={false}
              dataSource={plan.project_positions}
              columns={[
                { title: "项目", dataIndex: "name" },
                {
                  title: "安排后垫资峰值",
                  dataIndex: "peak_advance",
                  render: formatWan,
                },
                { title: "期末存贷差", dataIndex: "ending", render: formatWan },
                {
                  title: "本安排周期内校验",
                  render: () => "已纳入额度与期限约束",
                },
              ]}
            />
          </Card>
        </>
      )}
      <Card
        title={
          scenario.project_scenarios
            ? "当前情景应付与优先依据"
            : "本期合同应付与优先依据"
        }
      >
        <Table
          rowKey="id"
          dataSource={due}
          scroll={{ x: 1000 }}
          columns={[
            {
              title: "项目",
              dataIndex: "project_id",
              render: (id) => names.get(id),
            },
            { title: "分包 / 对象", dataIndex: "payee_name" },
            { title: "到期日", dataIndex: "due_date" },
            {
              title: scenario.project_scenarios ? "情景应付金额" : "金额",
              render: (_, payment) =>
                formatWan(scenarioAmounts.get(payment.id) ?? payment.amount),
            },
            {
              title: "项目×分包权重",
              dataIndex: "priority_weight",
              render: (v) => v ?? "历史逐笔",
            },
            {
              title: "刚性",
              render: (_, p) =>
                isRigid(p) ? <Tag color="orange">优先保障</Tag> : "否",
            },
            { title: "资料", dataIndex: "attachment_status" },
          ]}
        />
      </Card>
    </>
  );
}
