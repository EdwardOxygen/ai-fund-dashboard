import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Segmented, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api, CashflowForecast as ForecastRow, formatWan } from "../api";
import CashflowChart from "../components/CashflowChart";
import PageHeader from "../components/PageHeader";
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
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("fund-dashboard-refresh", refresh);
    };
  }, [load]);

  const columns: ColumnsType<ForecastRow> = [
    { title: "日期", dataIndex: "forecast_date", width: 120, fixed: "left" },
    { title: "期初余额", dataIndex: "opening_balance", align: "right", render: (value: number) => formatWan(value) },
    { title: "预计回款", dataIndex: "expected_collection", align: "right", render: (value: number) => formatWan(value) },
    { title: "刚性支出", dataIndex: "rigid_payment", align: "right", render: (value: number) => formatWan(value) },
    { title: "计划付款", dataIndex: "planned_payment", align: "right", render: (value: number) => formatWan(value) },
    { title: "期末合计余额", dataIndex: "ending_balance", align: "right", render: (value: number) => formatWan(value) },
    { title: "其中：一般资金", dataIndex: "general_balance", align: "right", render: (value: number) => formatWan(value) },
    {
      title: "风险等级",
      dataIndex: "risk_level",
      width: 110,
      render: (value: string) => <Tag color={riskColor(value)}>{value}</Tag>
    }
  ];

  return (
    <>
      <PageHeader
        title="现金流预测"
        description="按合同节点与全部未付义务滚动计算。合计余额用于收支核对，一般资金余额用于安全线预警；负数代表未筹足的资金需求。金额单位：万元。"
        actions={<Segmented
          value={days}
          onChange={(value) => setDays(Number(value))}
          options={[
            { label: "未来 7 天", value: 7 },
            { label: "未来 30 天", value: 30 },
            { label: "未来 90 天", value: 90 }
          ]}
        />}
      />

      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}

      <Card variant="borderless" className="page-section" title={`未来${days}天资金余额趋势`}>
        <CashflowChart data={data.map(d => ({ ...d, ending_balance: d.general_balance }))} />
      </Card>

      <Card variant="borderless" title={`未来${days}天现金流预测表`}>
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
