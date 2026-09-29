import { Button, Card } from "antd";
import { api, PREDICTION_RULES } from "../api";
import PageHeader from "../components/PageHeader";
export default function TechnicalPrinciples() {
  return (
    <>
      <PageHeader
        title="计算口径与功能分工"
        description="一套合同计划，项目和公司两种视角；合同基准与付款建议分开核对。"
        actions={
          <Button onClick={() => api.exportPredictionRules()}>
            导出计算规则
          </Button>
        }
      />
      {PREDICTION_RULES.map((s) => (
        <Card key={s.title} title={s.title} className="page-section">
          <p>
            <strong>{s.formula}</strong>
          </p>
          <ul>
            {[...s.variables, ...s.rules].map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
