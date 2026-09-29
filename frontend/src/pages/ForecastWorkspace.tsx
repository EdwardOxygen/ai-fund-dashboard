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
import ProjectScenarioEditor from "../components/ProjectScenarioEditor";
import { SCENARIOS, type ProjectScenario } from "../domain/simulation";

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
  const [projectScenarios, setProjectScenarios] = useState<ProjectScenario[]>(
    [],
  );
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
              ...SCENARIOS[0],
              id: "per-project",
              name: "逐项目情况",
              project_scenarios: projectScenarios,
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
  }, [data, scope, projectScenarios, horizon, safetyWan, mode]);
  if (error) return <Alert type="error" message={error} />;
  if (!data) return <Spin />;
  const projectName =
    scope.kind === "project"
      ? data.projects.find((p) => p.id === scope.projectId)?.project_name
      : undefined;
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
          mode === "scenario"
            ? "选择公司或单项目范围，在同一基准与周期下对比压力假设；不修改合同原始数据。"
            : scope.kind === "company"
              ? "所有项目的本期收支汇总到公司账户。当前结果为合同基准，尚未调整付款节奏。"
              : "只计算当前项目的收款、分包付款与存贷差。不使用公司的银行余额作为项目期初。"
        }
        actions={
          <Button
            onClick={() =>
              scope.kind === "company"
                ? navigate(
                    "/allocation",
                    mode === "scenario"
                      ? {
                          state: {
                            scenario: {
                              ...SCENARIOS[0],
                              id: "per-project",
                              name: "逐项目情况",
                              project_scenarios: projectScenarios,
                            },
                            horizon: Math.min(horizon, 90),
                            safetyWan,
                          },
                        }
                      : undefined,
                  )
                : navigate("/")
            }
          >
            {scope.kind === "company"
              ? mode === "scenario"
                ? "按这些情况安排付款"
                : "进入公司付款统筹"
              : "返回项目与合同"}
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
            <span>
              数据截至 {calculations?.result?.start || "待统一"}（预测起点）
            </span>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          {mode === "scenario" && (
            <Col xs={24} md={10}>
              <label className="field-label">
                第一步：看整个公司，还是一个项目？
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
                希望额外留在手里的钱（万元，可选）
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
          这里从“数据截至”日期开始往后算，不是从今天自动开始。请先确认各项目已收已付及银行余额都更新到同一天。安全储备填0表示只看是否缺钱；填100表示还希望留100万元，不是新增存款。
        </p>
      </Card>
      {mode === "scenario" && (
        <ProjectScenarioEditor
          projects={data.projects}
          rows={projectScenarios}
          onChange={setProjectScenarios}
          projectId={scope.kind === "project" ? scope.projectId : undefined}
        />
      )}
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
