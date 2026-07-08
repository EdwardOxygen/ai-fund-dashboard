import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Segmented, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api, CashflowForecast as ForecastRow, formatWan } from "../api";
import CashflowChart from "../components/CashflowChart";
import { riskColor } from "../components/RiskCard";

export default function CashflowForecast() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getCashflowForecast(days));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => window.removeEventListener("fund-dashboard-refresh", refresh);
  }, [load]);

  const columns: ColumnsType<ForecastRow> = [
    { title: "日期", dataIndex: "forecast_date", width: 120, fixed: "left" },
    { title: "期初余额", dataIndex: "opening_balance", align: "right", render: (value: number) => formatWan(value) },
    { title: "预计回款", dataIndex: "expected_collection", align: "right", render: (value: number) => formatWan(value) },
    { title: "刚性支出", dataIndex: "rigid_payment", align: "right", render: (value: number) => formatWan(value) },
    { title: "计划付款", dataIndex: "planned_payment", align: "right", render: (value: number) => formatWan(value) },
    { title: "期末余额", dataIndex: "ending_balance", align: "right", render: (value: number) => formatWan(value) },
    {
      title: "风险等级",
      dataIndex: "risk_level",
      width: 110,
      render: (value: string) => <Tag color={riskColor(value)}>{value}</Tag>
    }
  ];

  return (
    <>
      <div className="toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            现金流预测
          </Typography.Title>
          <Typography.Text type="secondary">按预计回款可信度和付款优先级测算未来资金缺口。</Typography.Text>
        </div>
        <Segmented
          value={days}
          onChange={(value) => setDays(Number(value))}
          options={[
            { label: "未来7天", value: 7 },
            { label: "未来30天", value: 30 },
            { label: "未来90天", value: 90 }
          ]}
        />
      </div>

      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}

      <Card bordered={false} className="page-section" title={`未来${days}天资金余额趋势`}>
        <CashflowChart data={data} />
      </Card>

      <Card bordered={false} title={`未来${days}天现金流预测表`}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: days > 30 ? 15 : 10 }}
            scroll={{ x: 980 }}
          />
        </Space>
      </Card>
    </>
  );
}
