import { useCallback, useEffect, useState } from "react";
import { Alert, Card } from "antd";
import { api, PaymentPriority as PaymentRow } from "../api";
import PaymentTable from "../components/PaymentTable";
import PageHeader from "../components/PageHeader";

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
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("fund-dashboard-refresh", refresh);
    };
  }, [load]);

  return (
    <>
      <PageHeader
        title="付款优先级决策"
        description="按统筹权重排序：项目重要系数×分包优先系数×付款规则权重。刚性付款单列高权重。此清单不是可支付承诺，请在统筹付款中计算满足现金与项目垫资约束的方案。"
      />
      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}
      <Card variant="borderless">
        <PaymentTable data={data} loading={loading} />
      </Card>
    </>
  );
}
