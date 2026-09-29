import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Tag,
} from "antd";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import ForecastResults from "../components/ForecastResults";
import { useFundData } from "../hooks/useFundData";
import { forecastView, type ForecastScope } from "../domain/forecast";
import { SCENARIOS, type Scenario } from "../domain/simulation";

export default function ForecastWorkspace({
  mode = "company",
}: {
  mode?: "company" | "project" | "scenario";
}) {
  const { data, error } = useFundData();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [selectedScope, setSelectedScope] = useState<string>("company");
  const [horizon, setHorizon] = useState(90);
  const [safetyWan, setSafetyWan] = useState(0);
  const [scenario, setScenario] = useState<Scenario>({ ...SCENARIOS[0] });
  const key =
    mode === "project"
      ? projectId || ""
      : mode === "company"
        ? "company"
        : selectedScope;
  const scope = useMemo<ForecastScope>(
    () =>
      key === "company"
        ? { kind: "company" }
        : { kind: "project", projectId: Number(key) },
    [key],
  );
  const calculations = useMemo(() => {
    if (!data) return null;
    try {
      const applied =
        mode === "scenario"
          ? {
              ...scenario,
              project_ids:
                scope.kind === "project"
                  ? [scope.projectId]
                  : scenario.project_ids,
            }
          : SCENARIOS[0];
      return {
        result: forecastView(data, scope, applied, horizon, safetyWan * 10000),
        base:
          mode === "scenario"
            ? forecastView(
                data,
                scope,
                SCENARIOS[0],
                horizon,
                safetyWan * 10000,
              )
            : undefined,
        error: "",
      };
    } catch (e) {
      return {
        error: (e as Error).message,
        result: undefined,
        base: undefined,
      };
    }
  }, [data, scope, scenario, horizon, safetyWan, mode]);
  if (error) return <Alert type="error" message={error} />;
  if (!data) return <Spin />;
  const projectName =
    scope.kind === "project"
      ? data.projects.find((p) => p.id === scope.projectId)?.project_name
      : undefined;
  const change = (patch: Partial<Scenario>) =>
    setScenario((s) => ({ ...s, id: "custom", name: "自定义", ...patch }));
  return (
    <>
      <PageHeader
        title={
          mode === "scenario"
            ? "情景对比"
            : scope.kind === "company"
              ? "公司收支预测"
              : "项目收支预测"
        }
        description={
          mode === "scenario" ? "选择公司或单项目范围，在同一基准与周期下对比压力假设；不修改合同原始数据。" : scope.kind === "company"
            ? "所有项目的本期收支汇总到公司账户。当前结果为合同基准，尚未调整付款节奏。"
            : "只计算当前项目的收款、分包付款与存贷差。不使用公司的银行余额作为项目期初。"
        }
        actions={
          <Button
            onClick={() =>
              navigate(scope.kind === "company" ? "/allocation" : "/")
            }
          >
            {scope.kind === "company" ? "进入公司付款统筹" : "返回项目与合同"}
          </Button>
        }
      />
      <Card
        className="page-section"
        title={
          <Space wrap>
            <Tag color="blue">
              {scope.kind === "company"
                ? `公司整体 · ${data.projects.length}个项目`
                : `单项目 · ${projectName || "未选择"}`}
            </Tag>
            <span>基准日 {calculations?.result?.start || "待统一"}</span>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          {mode === "scenario" && (
            <Col xs={24} md={10}>
              <label className="field-label">
                查看范围（决定所有图表和明细）
              </label>
              <Select
                aria-label="查看范围"
                className="full-width"
                value={selectedScope}
                onChange={setSelectedScope}
                options={[
                  { value: "company", label: "公司整体预测" },
                  ...data.projects
                    .filter((p) => p.plan?.enabled)
                    .map((p) => ({
                      value: String(p.id),
                      label: `单项目：${p.project_name}`,
                    })),
                ]}
              />
            </Col>
          )}
          <Col xs={24} md={7}>
            <label className="field-label">从基准日起预测</label>
            <Select
              aria-label="预测周期"
              className="full-width"
              value={horizon}
              onChange={setHorizon}
              options={[30, 90, 180, 365, 730].map((v) => ({
                value: v,
                label: `${v}天`,
              }))}
            />
          </Col>
          {scope.kind === "company" && (
            <Col xs={24} md={7}>
              <label className="field-label">
                一般资金安全储备（万元，可选）
              </label>
              <InputNumber
                aria-label="安全储备万元"
                className="full-width"
                min={0}
                value={safetyWan}
                onChange={(v) => setSafetyWan(v ?? 0)}
              />
            </Col>
          )}
        </Row>
        <p className="muted">
          同一基准日核对：项目累计实收、期初存贷差和公司账户余额均应为该日状态。日期不会随打开网页自动前移；更换基准日请先更新项目基础数据。
        </p>
        {mode === "scenario" && (
          <>
            <Space wrap className="page-section">
              {SCENARIOS.map((s) => (
                <Button
                  key={s.id}
                  type={scenario.id === s.id ? "primary" : "default"}
                  onClick={() =>
                    setScenario({ ...s, project_ids: scenario.project_ids })
                  }
                >
                  {s.name}
                </Button>
              ))}
            </Space>
            {scope.kind === "company" && (
              <div className="page-section">
                <label className="field-label">
                  压力施加给哪些项目（不改变公司汇总范围；留空为全部）
                </label>
                <Select
                  aria-label="压力影响项目"
                  mode="multiple"
                  allowClear
                  className="full-width"
                  value={scenario.project_ids || []}
                  onChange={(v) => change({ project_ids: v })}
                  options={data.projects.map((p) => ({
                    value: p.id,
                    label: p.project_name,
                  }))}
                />
              </div>
            )}
            <Row gutter={[16, 16]}>
              {(
                [
                  ["回款延迟（天）", "receipt_delay_days"],
                  ["未来进度节点延期（天）", "construction_delay_days"],
                  ["材料支出增加（%）", "material_increase_pct"],
                ] as const
              ).map(([label, field]) => (
                <Col xs={24} md={8} key={field}>
                  <label className="field-label">{label}</label>
                  <InputNumber
                    aria-label={label}
                    min={0}
                    max={field === "material_increase_pct" ? 100 : 365}
                    precision={0}
                    value={scenario[field]}
                    onChange={(v) => change({ [field]: v || 0 })}
                  />
                </Col>
              ))}
            </Row>
            <p>
              这是确定性假设对比，不是发生概率，不修改原合同。单项目范围内只施加该项目的压力；公司范围内保持其他项目不变。
            </p>
          </>
        )}
      </Card>
      {calculations?.error ? (
        <Alert
          showIcon
          type="warning"
          message="当前无法合并测算"
          description={calculations.error}
        />
      ) : (
        calculations?.result && (
          <ForecastResults
            view={calculations.result}
            baseline={calculations.base}
            safety={safetyWan * 10000}
          />
        )
      )}
    </>
  );
}
