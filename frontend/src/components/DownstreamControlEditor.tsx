import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Table,
} from "antd";
import type { ProjectPlan } from "../domain/projectPlanning";
import {
  checkDownstream,
  costColumns,
  defaultDownstreamControl,
  mergeCostRows,
  stageNames,
  validateDownstreamControl,
  type DownstreamControl,
  type DownstreamStage,
} from "../domain/downstreamControl";
import { formatWan } from "../api";
import TemplateImport from "./TemplateImport";
import { DownstreamStatus } from "./DownstreamWarnings";
import type { TemplateColumn } from "../domain/templateImport";
const settingsColumns: TemplateColumn[] = [
  { key: "enabled", label: "启用预警", type: "boolean" },
  { key: "construction_ratio", label: "在施预警比例(%)", type: "number" },
  { key: "completed_ratio", label: "竣工预警比例(%)", type: "number" },
  { key: "settled_ratio", label: "结算后预警比例(%)", type: "number" },
  {
    key: "stage_mode",
    label: "阶段识别",
    values: { 自动: "auto", 手动: "manual" },
  },
  {
    key: "manual_stage",
    label: "手动阶段",
    values: { 在施: "construction", 竣工: "completed", 结算后: "settled" },
  },
  {
    key: "completion_date",
    label: "项目竣工日期",
    type: "date",
    optional: true,
  },
  {
    key: "settlement_date",
    label: "项目结算日期",
    type: "date",
    optional: true,
  },
];
export default function DownstreamControlEditor({
  plan,
  onChange,
}: {
  plan: ProjectPlan;
  onChange: (patch: Partial<ProjectPlan>) => void;
}) {
  const c = plan.downstream_control || defaultDownstreamControl();
  const change = (patch: Partial<DownstreamControl>) =>
    onChange({ downstream_control: { ...c, ...patch } });
  let error = "";
  try {
    validateDownstreamControl(c, plan.as_of);
  } catch (e) {
    error = (e as Error).message;
  }
  const check = error
    ? null
    : checkDownstream({ ...plan, downstream_control: c });
  return (
    <>
      <Card
        className="page-section"
        title="项目付款比例预警"
        extra={
          <Space>
            <span>启用本项目预警</span>
            <Switch
              aria-label="启用本项目下游比例预警"
              checked={c.enabled}
              onChange={(enabled) => change({ enabled })}
            />
          </Space>
        }
      >
        <p>
          以本项目全部下游合并后的“累计实际已付 ÷
          累计已确认成本”检查，原分包合同继续决定应付金额。这里只预警，不自动拦截或压减付款。
        </p>
        <Row gutter={[20, 16]}>
          {(["construction", "completed", "settled"] as const).map((stage) => (
            <Col xs={24} md={8} key={stage}>
              <label className="field-label" htmlFor={`cost-${stage}`}>
                {stageNames[stage]}预警比例（%）
              </label>
              <InputNumber
                id={`cost-${stage}`}
                className="full-width"
                min={0}
                max={100}
                precision={2}
                value={c[`${stage}_ratio`]}
                onChange={(value) => change({ [`${stage}_ratio`]: value ?? 0 })}
              />
            </Col>
          ))}
          <Col xs={24} md={8}>
            <label className="field-label" htmlFor="cost-stage-mode">
              阶段识别方式
            </label>
            <Select
              id="cost-stage-mode"
              className="full-width"
              value={c.stage_mode}
              onChange={(stage_mode) => change({ stage_mode })}
              options={[
                { value: "manual", label: "手动选择阶段" },
                { value: "auto", label: "按项目里程碑日期自动切换" },
              ]}
            />
          </Col>
          {c.stage_mode === "manual" ? (
            <Col xs={24} md={8}>
              <label className="field-label" htmlFor="cost-stage">
                当前及预测阶段
              </label>
              <Select
                id="cost-stage"
                className="full-width"
                value={c.manual_stage}
                onChange={(manual_stage: DownstreamStage) =>
                  change({ manual_stage })
                }
                options={Object.entries(stageNames).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Col>
          ) : (
            <>
              <Col xs={24} md={8}>
                <label className="field-label" htmlFor="cost-completion">
                  项目竣工日期
                </label>
                <Input
                  id="cost-completion"
                  type="date"
                  value={c.completion_date}
                  onChange={(e) => change({ completion_date: e.target.value })}
                />
              </Col>
              <Col xs={24} md={8}>
                <label className="field-label" htmlFor="cost-settlement">
                  项目结算日期（未定可留空）
                </label>
                <Input
                  id="cost-settlement"
                  type="date"
                  value={c.settlement_date}
                  onChange={(e) => change({ settlement_date: e.target.value })}
                />
              </Col>
            </>
          )}
        </Row>
        <p className="muted">
          项目竣工/结算日期不是业主竣工款/结算款到账日。手动阶段在预测期保持不变；切换为自动后才按日期变化。结算后100%也不取消分包质保金条款。
        </p>
        <TemplateImport
          title="下游预警设置"
          columns={settingsColumns}
          sample={[{ ...c }]}
          hint="只更新本项目预警设置，保留成本记录和全部原合同。导入后请保存项目计划。"
          onValidate={(rows) => {
            if (rows.length !== 1) throw new Error("预警设置只允许一行");
            validateDownstreamControl(
              {
                ...c,
                ...rows[0],
                completion_date: String(rows[0].completion_date ?? ""),
                settlement_date: String(rows[0].settlement_date ?? ""),
              } as DownstreamControl,
              plan.as_of,
            );
          }}
          onImport={(rows) =>
            change({
              ...rows[0],
              completion_date: String(rows[0].completion_date ?? ""),
              settlement_date: String(rows[0].settlement_date ?? ""),
            } as Partial<DownstreamControl>)
          }
        />
      </Card>
      <Card
        className="page-section"
        title="按月确认下游成本"
        extra={
          <Button
            onClick={() =>
              change({
                costs: [
                  ...c.costs,
                  { date: plan.as_of, amount: 0, kind: "confirmed" },
                ],
              })
            }
          >
            新增成本记录
          </Button>
        }
      >
        <p>
          填写项目合计，不必逐家录入。金额为
          <strong>累计数，不是本月新增数</strong>
          ；单位为元。例如累计成本2000万元填20000000。已确认与未来计划分开，未来计划不能冒充已确认成本。
        </p>
        <Alert
          className="page-section"
          type="info"
          showIcon
          message={`当前实付取分包计划中的“累计已付”合计：${formatWan(plan.subcontracts.reduce((s, p) => s + p.paid, 0))}，数据基准日${plan.as_of}。当前成本确认日期应与基准日一致；旧月成本保留备查，不与新日期实付直接相除。`}
        />
        <TemplateImport
          title="下游累计成本"
          columns={costColumns}
          sample={c.costs.map((r) => ({ ...r }))}
          hint="按月份和类型新增或更新，其他月份保留。有一行错误整批不导入；这里只写入草稿，最后请保存项目计划。"
          onValidate={(rows) =>
            validateDownstreamControl(
              { ...c, costs: mergeCostRows(c.costs, rows) },
              plan.as_of,
            )
          }
          onImport={(rows) => change({ costs: mergeCostRows(c.costs, rows) })}
        />
        <Table
          rowKey={(_, i) => String(i)}
          scroll={{ x: 660 }}
          dataSource={c.costs}
          pagination={false}
          columns={[
            {
              title: "确认 / 计划日期",
              render: (_, r, i) => (
                <Input
                  type="date"
                  aria-label={`成本第${i + 1}行日期`}
                  value={r.date}
                  onChange={(e) =>
                    change({
                      costs: c.costs.map((x, j) =>
                        i === j ? { ...x, date: e.target.value } : x,
                      ),
                    })
                  }
                />
              ),
            },
            {
              title: "数据类型",
              render: (_, r, i) => (
                <Select
                  aria-label={`成本第${i + 1}行类型`}
                  value={r.kind}
                  style={{ width: 125 }}
                  options={[
                    { value: "confirmed", label: "已确认" },
                    { value: "planned", label: "未来计划" },
                  ]}
                  onChange={(kind) =>
                    change({
                      costs: c.costs.map((x, j) =>
                        i === j ? { ...x, kind } : x,
                      ),
                    })
                  }
                />
              ),
            },
            {
              title: "累计下游成本（元）",
              render: (_, r, i) => (
                <InputNumber
                  aria-label={`成本第${i + 1}行累计金额`}
                  min={0}
                  precision={2}
                  style={{ width: "100%" }}
                  value={r.amount}
                  onChange={(amount) =>
                    change({
                      costs: c.costs.map((x, j) =>
                        i === j ? { ...x, amount: amount ?? 0 } : x,
                      ),
                    })
                  }
                />
              ),
            },
            {
              title: "操作",
              render: (_, r, i) => (
                <Button
                  danger
                  aria-label={`移除成本第${i + 1}行`}
                  onClick={() =>
                    change({ costs: c.costs.filter((_, j) => i !== j) })
                  }
                >
                  移除
                </Button>
              ),
            },
          ]}
        />
        {error ? (
          <Alert type="warning" showIcon message={error} />
        ) : (
          check && (
            <Alert
              className="page-section"
              type={check.status === "warning" ? "warning" : "info"}
              showIcon
              message={
                <Space>
                  <span>当前项目检查</span>
                  <DownstreamStatus check={check} />
                </Space>
              }
              description={`${check.reason}${check.excess > 0 ? `；超线${formatWan(check.excess)}` : ""}。修改后请点击上方“保存项目计划”。`}
            />
          )
        )}
      </Card>
    </>
  );
}
