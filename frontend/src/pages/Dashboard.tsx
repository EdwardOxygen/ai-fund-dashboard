import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Card,
  Col,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AlertOutlined,
  BankOutlined,
  FieldTimeOutlined,
  FundProjectionScreenOutlined,
  PayCircleOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  WalletOutlined
} from "@ant-design/icons";
import { api, DashboardSummary, ProjectRisk, formatPercent, formatWan } from "../api";
import CashflowChart from "../components/CashflowChart";
import PaymentTable from "../components/PaymentTable";
import RiskCard, { riskColor } from "../components/RiskCard";

export default function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getDashboardSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => window.removeEventListener("fund-dashboard-refresh", refresh);
  }, [load]);

  const projectColumns: ColumnsType<ProjectRisk> = [
    { title: "项目名称", dataIndex: "project_name", width: 210 },
    { title: "业主类型", dataIndex: "owner_type", width: 100 },
    {
      title: "回款率",
      dataIndex: "collection_rate",
      width: 100,
      render: (value: number) => formatPercent(value)
    },
    {
      title: "风险等级",
      dataIndex: "risk_level",
      width: 100,
      render: (value: string) => <Tag color={riskColor(value)}>{value}</Tag>
    },
    { title: "AI提示", dataIndex: "ai_hint" }
  ];

  if (loading && !data) {
    return <Spin size="large" />;
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />;
  }

  if (!data) return null;

  return (
    <>
      <Row gutter={[16, 16]} className="metric-grid">
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="当前可用资金" value={formatWan(data.current_available_funds)} icon={<WalletOutlined />} footer="含集团资金中心、监管专户、工资专户" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="未来7日资金缺口" value={formatWan(data.gap_7d)} icon={<FieldTimeOutlined />} footer="按安全线测算" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="未来30日资金缺口" value={formatWan(data.gap_30d)} icon={<FundProjectionScreenOutlined />} footer="风险调整后回款口径" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="未来90日资金缺口" value={formatWan(data.gap_90d)} icon={<AlertOutlined />} footer="用于滚动资金调度" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="高风险项目数量" value={data.high_risk_project_count} unit="个" icon={<ProjectOutlined />} footer="红色风险项目" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="待审批付款金额" value={formatWan(data.pending_payment_amount)} icon={<PayCircleOutlined />} footer="全部待付款申请合计" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="AI建议本周付款金额" value={formatWan(data.suggested_week_payment_amount)} icon={<BankOutlined />} footer="立即、优先及部分支付" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <RiskCard title="资金风险等级" value={data.fund_risk_level} riskLevel={data.fund_risk_level} icon={<SafetyCertificateOutlined />} footer="基于未来30日期末余额" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="page-section">
        <Col xs={24} xl={15}>
          <Card bordered={false} title="未来30天资金余额趋势">
            <CashflowChart data={data.cashflow_trend} safetyLine={data.safety_line} />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card bordered={false} title="AI资金分析摘要">
            <Space direction="vertical" size={16}>
              <Typography.Paragraph>{data.ai_summary}</Typography.Paragraph>
              <Alert
                type={data.fund_risk_level === "绿色" ? "success" : data.fund_risk_level === "黄色" ? "warning" : "error"}
                showIcon
                message={`当前资金风险等级：${data.fund_risk_level}`}
                description="建议对红色项目回款、农民工工资、税款和关键材料款进行日级资金调度。"
              />
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card bordered={false} title="付款优先级前10条">
            <PaymentTable data={data.top_payments} compact />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card bordered={false} title="高风险项目列表">
            <Table
              rowKey="id"
              columns={projectColumns}
              dataSource={data.high_risk_projects}
              pagination={false}
              size="middle"
              scroll={{ x: 780 }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
