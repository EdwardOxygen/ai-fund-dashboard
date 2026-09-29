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
import { useNavigate } from "react-router-dom";
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
} from "../domain/simulation";

export default function Allocation() {
  const { data, error } = useFundData();
  const navigate = useNavigate();
  const [horizon, setHorizon] = useState(30);
  const [safety, setSafety] = useState(0);
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
  }, [data, horizon, safety]);
  const base = useMemo(() => {
    if (!data) return null;
    try {
      return {
        view: forecastView(
          data,
          { kind: "company" },
          SCENARIOS[0],
          horizon,
          safety * 10000,
        ),
        error: "",
      };
    } catch (e) {
      return { view: null, error: (e as Error).message };
    }
  }, [data, horizon, safety]);
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
      scenario: SCENARIOS[0],
      horizon,
      safety: safety * 10000,
      start: base.view.start,
    });
  }
  if (error) return <Alert type="error" message={error} />;
  if (!data || !base) return <p>正在加载公司付款计划…</p>;
  const names = new Map(data.projects.map((p) => [p.id, p.project_name]));
  const due = base.view
    ? data.payments.filter(
        (p) => p.due_date <= addDays(base.view!.start, horizon - 1),
      )
    : [];
  return (
    <>
      <PageHeader
        title="公司付款统筹"
        description="在公司资金池内安排各项目分包付款；这不是收支预测，也不会执行真实支付。"
        actions={
          <Button onClick={() => navigate("/company")}>返回公司预测</Button>
        }
      />
      <Card
        className="page-section"
        title={
          <Space wrap>
            <Tag color="blue">公司整体 · 全部项目共同排程</Tag>
            <span>基准日 {base.view?.start || "未统一"}</span>
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
            <label className="field-label">
              一般资金安全储备（万元，软目标）
            </label>
            <InputNumber
              aria-label="统筹安全储备万元"
              className="full-width"
              min={0}
              value={safety}
              onChange={(v) => setSafety(v ?? 0)}
            />
          </Col>
          <Col xs={24} md={8}>
            <label className="field-label">当前到期义务 {due.length} 笔</label>
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
          项目重要系数 ×
          分包优先系数作为基础权重，逾期待付适当提高优先级。工资、税款等刚性义务优先；账户用途、资料、付款窗口、整笔/分期及项目垫资额度与期限是约束。资金不足时保留未安排金额。
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
            description="未安排款项仍然存在。安排后的余额改善来自付款节奏变化，不是创造现金或免除债务。"
          />
          <Row gutter={[16, 16]} className="page-section">
            {[
              ["本期已安排", plan.scheduled],
              ["本期未安排", plan.unpaid],
              ["安排后最低一般资金", plan.minimum_general_balance],
            ].map(([label, value]) => (
              <Col xs={24} md={8} key={label}>
                <Card>
                  <Statistic title={label} value={formatWan(Number(value))} />
                </Card>
              </Col>
            ))}
          </Row>
          <Card
            title="公司一般资金：合同按期全付与统筹建议"
            className="page-section"
          >
            <Chart
              style={{ height: 300 }}
              option={{
                tooltip: { trigger: "axis" },
                legend: {},
                grid: { left: 70, right: 25, bottom: 40 },
                xAxis: {
                  type: "category",
                  data: plan.cashflow.map((d) => d.date),
                },
                yAxis: { type: "value", name: "万元" },
                series: [
                  {
                    name: "合同按期全付",
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
              dataSource={plan.rows.filter(r => r.due_date <= base.view!.end).sort((a,b) => a.due_date.localeCompare(b.due_date))}
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
            <Table rowKey="id" dataSource={plan.rows.filter(r => r.due_date > base.view!.end)} columns={[
              {title:"项目 / 分包",dataIndex:"name"},
              {title:"合同到期日",dataIndex:"due_date"},
              {title:"金额",dataIndex:"amount",render:formatWan},
            ]} />
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
      <Card title="本期合同应付与优先依据">
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
            { title: "金额", dataIndex: "amount", render: formatWan },
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
