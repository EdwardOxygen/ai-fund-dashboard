import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Progress, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api, ProjectRisk as ProjectRiskRow, formatWan } from "../api";
import { riskColor } from "../components/RiskCard";
import PageHeader from "../components/PageHeader";

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
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("fund-dashboard-refresh", refresh);
    };
  }, [load]);

  const columns: ColumnsType<ProjectRiskRow> = [
    { title: "项目名称", dataIndex: "project_name", width: 210, fixed: "left" },
    { title: "业主类型", dataIndex: "owner_type", width: 100 },
    {
      title: "合同额",
      dataIndex: "contract_amount",
      align: "right",
      render: (value: number) => formatWan(value),
    },
    {
      title: "确权产值",
      dataIndex: "confirmed_output",
      align: "right",
      render: (value: number) => formatWan(value),
    },
    {
      title: "已开票金额",
      dataIndex: "billed_amount",
      align: "right",
      render: (value: number) => formatWan(value),
    },
    {
      title: "已回款金额",
      dataIndex: "collected_amount",
      align: "right",
      render: (value: number) => formatWan(value),
    },
    {
      title: "应收兑现率",
      dataIndex: "collection_rate",
      width: 140,
      render: (value: number, row) => (
        <div title={row.collection_basis}>
          <Progress percent={Number((value * 100).toFixed(1))} size="small" />
        </div>
      ),
    },
    {
      title: "期初进度款待收",
      dataIndex: "outstanding_amount",
      align: "right",
      render: (v?: number) => (v === undefined ? "—" : formatWan(v)),
    },
    {
      title: "其中逾期",
      dataIndex: "overdue_amount",
      align: "right",
      render: (v?: number) => (v === undefined ? "—" : formatWan(v)),
    },
    {
      title: "逾期天数",
      dataIndex: "overdue_days",
      render: (v?: number) => (v === undefined ? "待核实" : `${v}天`),
    },
    {
      title: "风险等级",
      dataIndex: "risk_level",
      width: 100,
      render: (value: string) => <Tag color={riskColor(value)}>{value}</Tag>,
    },
    {
      title: "回款风险",
      dataIndex: "collection_risk",
      width: 90,
      render: (value: string) => (
        <Tag color={value === "高" ? "red" : value === "中" ? "gold" : "green"}>
          {value}
        </Tag>
      ),
    },
    {
      title: "付款风险",
      dataIndex: "payment_risk",
      width: 90,
      render: (value: string) => (
        <Tag color={value === "高" ? "red" : value === "中" ? "gold" : "green"}>
          {value}
        </Tag>
      ),
    },
    { title: "本地规则提示", dataIndex: "ai_hint", width: 360 },
  ];

  return (
    <>
      <PageHeader
        title="项目风险预警"
        description="合同预测项目按基准日进度应收与实收比较，未到期尾款不算欠款；逾期天数按合同应收日计算。旧逐笔模式仍显示累计实收占合同额。回款风险与付款压力分别评估。"
      />
      {error ? (
        <Alert type="error" showIcon message={error} className="page-section" />
      ) : null}
      <Card variant="borderless">
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
