import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Progress, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api, ProjectRisk as ProjectRiskRow, formatWan } from "../api";
import { riskColor } from "../components/RiskCard";

export default function ProjectRisk() {
  const [data, setData] = useState<ProjectRiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getProjectsRisk());
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

  const columns: ColumnsType<ProjectRiskRow> = [
    { title: "项目名称", dataIndex: "project_name", width: 210, fixed: "left" },
    { title: "业主类型", dataIndex: "owner_type", width: 100 },
    { title: "合同额", dataIndex: "contract_amount", align: "right", render: (value: number) => formatWan(value) },
    { title: "确权产值", dataIndex: "confirmed_output", align: "right", render: (value: number) => formatWan(value) },
    { title: "已开票金额", dataIndex: "billed_amount", align: "right", render: (value: number) => formatWan(value) },
    { title: "已回款金额", dataIndex: "collected_amount", align: "right", render: (value: number) => formatWan(value) },
    {
      title: "回款率",
      dataIndex: "collection_rate",
      width: 140,
      render: (value: number) => <Progress percent={Number((value * 100).toFixed(1))} size="small" />
    },
    {
      title: "风险等级",
      dataIndex: "risk_level",
      width: 100,
      render: (value: string) => <Tag color={riskColor(value)}>{value}</Tag>
    },
    {
      title: "回款风险",
      dataIndex: "collection_risk",
      width: 90,
      render: (value: string) => <Tag color={value === "高" ? "red" : value === "中" ? "gold" : "green"}>{value}</Tag>
    },
    {
      title: "付款风险",
      dataIndex: "payment_risk",
      width: 90,
      render: (value: string) => <Tag color={value === "高" ? "red" : value === "中" ? "gold" : "green"}>{value}</Tag>
    },
    { title: "AI提示", dataIndex: "ai_hint", width: 320 }
  ];

  return (
    <>
      <div className="toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            项目风险预警
          </Typography.Title>
          <Typography.Text type="secondary">展示每个建筑项目的资金风险、回款风险和付款风险。</Typography.Text>
        </div>
      </div>
      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}
      <Card bordered={false}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 1580 }}
        />
      </Card>
    </>
  );
}
