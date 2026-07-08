import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Typography } from "antd";
import { api, PaymentPriority as PaymentRow } from "../api";
import PaymentTable from "../components/PaymentTable";

export default function PaymentPriority() {
  const [data, setData] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getPaymentsPriority());
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

  return (
    <>
      <div className="toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            付款优先级决策
          </Typography.Title>
          <Typography.Text type="secondary">按AI评分从高到低排序，覆盖分包付款、农民工工资、材料款、税款和机械租赁。</Typography.Text>
        </div>
      </div>
      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}
      <Card bordered={false}>
        <PaymentTable data={data} loading={loading} />
      </Card>
    </>
  );
}
