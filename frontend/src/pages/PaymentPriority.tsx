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
        description="按规则分从高到低排序，辅助识别工资、税款和履约付款的紧迫性；此清单不是可支付承诺，请在收支模拟中计算满足资金约束的付款安排。"
      />
      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}
      <Card variant="borderless">
        <PaymentTable data={data} loading={loading} />
      </Card>
    </>
  );
}
