import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Spin, Table, Tag } from "antd";
import { WalletOutlined, SafetyCertificateOutlined, CalendarOutlined, ProjectOutlined, ExperimentOutlined, FileTextOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api, type DashboardSummary, type LocalStore, formatWan, formatPercent, SAFETY_LINE } from "../api";
import { simulate, SCENARIOS } from "../domain/simulation";
import CashflowChart from "../components/CashflowChart";
import PaymentTable from "../components/PaymentTable";
import RiskCard, { riskColor } from "../components/RiskCard";
import PageHeader from "../components/PageHeader";

export default function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [store, setStore] = useState<LocalStore | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const [summary, raw] = await Promise.all([api.getDashboardSummary(), api.getSimulationData()]); if (active) { setData(summary); setStore(raw); setError(""); } }
      catch (e) { if (active) setError(e instanceof Error ? e.message : "数据加载失败"); }
    };
    void load(); window.addEventListener("fund-dashboard-refresh", load);
    return () => { active = false; window.removeEventListener("fund-dashboard-refresh", load); };
  }, []);
  if (error) return <Alert type="error" showIcon message={error} />;
  if (!data || !store) return <div className="page-loading"><Spin /><span>正在汇总资金计划…</span></div>;
  const baseline = simulate(store, SCENARIOS[0], 30, SAFETY_LINE);
  const stress = simulate(store, SCENARIOS[3], 30, SAFETY_LINE);
  const urgent = data.top_payments.filter(p => p.suggestion === "立即支付").length;
  return <div className="dashboard-page">
    <PageHeader eyebrow="经营总览 / 资金计划" title="资金总览" description="看清可调度资金、近期支付义务与未来缺口。" actions={<><Tag className="mode-tag">{store.data_mode === "demo" ? "演示数据" : "本机业务数据"}</Tag><Button type="primary" icon={<ExperimentOutlined />} onClick={() => navigate("/simulation")}>开展情景推演</Button></>} />
    <Row gutter={[18,18]} className="page-section">
      <Col xs={24} sm={12} xl={6}><RiskCard title="一般可调度资金" value={formatWan(data.current_available_funds)} icon={<WalletOutlined />} tone="teal" footer={`专户余额另列 ${formatWan(baseline.summary.restricted_opening)}`} /></Col>
      <Col xs={24} sm={12} xl={6}><RiskCard title="30日安全线缺口" value={formatWan(data.gap_30d)} icon={<SafetyCertificateOutlined />} tone={data.gap_30d > 0 ? "red" : "default"} footer={`安全储备 ${formatWan(SAFETY_LINE)}`} /></Col>
      <Col xs={24} sm={12} xl={6}><RiskCard title="未来7天到期付款" value={formatWan(data.suggested_week_payment_amount)} icon={<CalendarOutlined />} footer="含已逾期待付义务；未执行付款" /></Col>
      <Col xs={24} sm={12} xl={6}><RiskCard title="重点关注项目" value={data.high_risk_project_count} unit="个" icon={<ProjectOutlined />} tone={data.high_risk_project_count ? "amber" : "default"} footer="按回款与付款风险规则识别" /></Col>
    </Row>
    <Row gutter={[18,18]} className="page-section">
      <Col xs={24} xl={16}><Card className="dashboard-card" title={<div><span className="card-kicker">合同基准 · 未来30天</span><div>一般资金余额趋势</div></div>} extra={<Button type="link" onClick={() => navigate("/cashflow")}>查看明细</Button>}>
        <CashflowChart data={data.cashflow_trend} safetyLine={SAFETY_LINE} />
        <div className="chart-footer"><span>最低点 <strong>{baseline.summary.minimum_date}</strong></span><span>最低余额 <strong>{formatWan(baseline.summary.minimum)}</strong></span><span>低于安全线 <strong>{baseline.summary.below_safety_days}天</strong></span></div>
      </Card></Col>
      <Col xs={24} xl={8}><Card className="decision-card" title="资金判断与行动">
        <Tag color={riskColor(data.fund_risk_level)}>{data.fund_risk_level === "绿色" ? "基准资金平稳" : data.fund_risk_level === "黄色" ? "安全储备偏紧" : "需要资金安排"}</Tag>
        <h3>{data.gap_30d > 0 ? "先确认缺口，再安排付款" : "基准充足，仍需测试延期影响"}</h3>
        <p>{data.gap_30d > 0 ? `未来30日有${baseline.summary.below_safety_days}天低于安全线，首次发生在${baseline.summary.first_gap_date}。` : "按当前合同计划，未来30日的一般资金余额保持在安全线以上。"}</p>
        <div className="decision-stat"><span>组合压力情景缺口</span><strong>{formatWan(stress.summary.gap)}</strong><small>回款延迟30天 / 未达节点延期14天 / 材料支出+5%</small></div>
        <Button block type="primary" onClick={() => navigate("/simulation")}>比较情景与付款安排</Button>
        <Button block type="text" icon={<FileTextOutlined />} onClick={() => navigate("/report")}>查看资金分析报告</Button>
      </Card></Col>
    </Row>
    <div className="action-strip">
      <div><span className="section-kicker">近期工作</span><h3>跟进影响资金的关键事项</h3></div>
      <Space wrap><Tag>待付义务 {formatWan(data.pending_payment_amount)}</Tag><Tag color="orange">前10条中紧急申请 {urgent} 笔</Tag><Button onClick={() => navigate("/entry")}>维护业务数据</Button></Space>
    </div>
    <Card className="page-section" title="付款关注清单" extra={<Button type="link" onClick={() => navigate("/payments")}>全部付款</Button>}><PaymentTable data={data.top_payments.slice(0,5)} compact /></Card>
    <Card title="项目资金风险" extra={<Button type="link" onClick={() => navigate("/projects")}>全部项目</Button>}>
      <Table rowKey="id" size="middle" pagination={false} dataSource={data.high_risk_projects} scroll={{ x: 780 }} columns={[
        { title: "项目名称", dataIndex: "project_name", width: 240 },
        { title: "业主类型", dataIndex: "owner_type", width: 120 },
        { title: "回款率", dataIndex: "collection_rate", width: 110, render: formatPercent },
        { title: "风险", dataIndex: "risk_level", width: 90, render: v => <Tag color={riskColor(v)}>{v}</Tag> },
        { title: "跟进重点", dataIndex: "ai_hint" },
      ]} />
    </Card>
  </div>;
}
