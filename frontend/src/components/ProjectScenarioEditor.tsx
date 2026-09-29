import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  InputNumber,
  Row,
  Select,
  Space,
  Tag,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ProjectScenario } from "../domain/simulation";

type Props = {
  projects: { id: number; project_name: string }[];
  rows: ProjectScenario[];
  onChange: (rows: ProjectScenario[]) => void;
  projectId?: number;
};
const presets = [
  {
    name: "恢复原计划",
    receipt_delay_days: 0,
    construction_delay_days: 0,
    material_increase_pct: 0,
  },
  {
    name: "晚收30天",
    receipt_delay_days: 30,
  },
  {
    name: "工期延后14天",
    construction_delay_days: 14,
  },
  {
    name: "材料增加5%",
    material_increase_pct: 5,
  },
];
const fields = [
  {
    key: "receipt_delay_days",
    label: "比原计划晚收款（天）",
    help: "在原预计到账日上再往后推，包括期初欠收款。",
    max: 365,
  },
  {
    key: "construction_delay_days",
    label: "未来工程节点延后（天）",
    help: "仅推迟未来进度、竣工、结算回款；与晚收款天数相加，不自动推迟分包付款。",
    max: 365,
  },
  {
    key: "material_increase_pct",
    label: "剩余材料付款增加（%）",
    help: "例如填5，100万元材料付款按105万元试算；其他付款不变。",
    max: 100,
  },
] as const;
export default function ProjectScenarioEditor({
  projects,
  rows,
  onChange,
  projectId,
}: Props) {
  const visible = rows.filter(
    (r) => projectId === undefined || r.project_id === projectId,
  );
  const candidates = projects.filter(
    (p) =>
      (projectId === undefined || p.id === projectId) &&
      !rows.some((r) => r.project_id === p.id),
  );
  const update = (id: number, patch: Partial<ProjectScenario>) =>
    onChange(rows.map((r) => (r.project_id === id ? { ...r, ...patch } : r)));
  return (
    <Card
      className="page-section"
      title="第二步：逐个添加项目情况"
      extra={
        <Button
          icon={<PlusOutlined />}
          disabled={!candidates.length}
          onClick={() =>
            onChange([
              ...rows,
              {
                project_id: candidates[0].id,
                receipt_delay_days: 0,
                construction_delay_days: 0,
                material_increase_pct: 0,
              },
            ])
          }
        >
          新增项目情况
        </Button>
      }
    >
      <p>
        一个项目一张卡，每张卡可设置不同情况。
        <strong>未添加的项目继续按原计划计算。</strong>
        同一项目不能重复添加，删除卡片即恢复该项目原计划。
      </p>
      {!visible.length && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有设置变化，当前结果与原计划一致。点击“新增项目情况”开始。"
        />
      )}
      {visible.map((row, index) => (
        <Card
          key={row.project_id}
          size="small"
          className="page-section"
          title={
            <Space>
              <Tag>情况 {index + 1}</Tag>
              <span>
                {projects.find((p) => p.id === row.project_id)?.project_name ||
                  "项目已移除"}
              </span>
            </Space>
          }
          extra={
            <Button
              type="text"
              icon={<DeleteOutlined />}
              aria-label={`删除项目情况${index + 1}`}
              onClick={() =>
                onChange(rows.filter((r) => r.project_id !== row.project_id))
              }
            >
              移除情况
            </Button>
          }
        >
          <label className="field-label">选择项目</label>
          <Select
            aria-label={`情况${index + 1}的项目`}
            className="full-width"
            value={row.project_id}
            disabled={projectId !== undefined}
            onChange={(id) => update(row.project_id, { project_id: id })}
            options={projects.map((p) => ({
              value: p.id,
              label: p.project_name,
              disabled:
                p.id !== row.project_id &&
                rows.some((r) => r.project_id === p.id),
            }))}
          />
          <Space wrap style={{ margin: "14px 0" }}>
            {presets.map(({ name, ...values }) => (
              <Button
                size="small"
                key={name}
                onClick={() => update(row.project_id, values)}
              >
                {name}
              </Button>
            ))}
          </Space>
          <Row gutter={[20, 16]}>
            {fields.map((f) => (
              <Col xs={24} lg={8} key={f.key}>
                <label className="field-label">{f.label}</label>
                <InputNumber
                  className="full-width"
                  aria-label={`情况${index + 1}：${f.label}`}
                  min={0}
                  max={f.max}
                  precision={0}
                  value={row[f.key]}
                  onChange={(v) => update(row.project_id, { [f.key]: v ?? 0 })}
                />
                <p className="muted">{f.help}</p>
              </Col>
            ))}
          </Row>
          <Tag color="blue">
            仅影响本项目 · 晚收{row.receipt_delay_days}天 · 工程节点延后
            {row.construction_delay_days}天 · 材料增加
            {row.material_increase_pct}%
          </Tag>
        </Card>
      ))}
      {projectId !== undefined && rows.length > visible.length && (
        <p>
          其他项目的{rows.length - visible.length}
          条情况仍保留，切回“公司整体”可查看；不会混入当前单项目结果。
        </p>
      )}
      <Alert
        type="info"
        showIcon
        message="这是假设试算，不是合同变更，也不是发生概率。"
        description="修改后下方结果自动更新。可用“按这些情况安排付款”带入统筹；其他方式离开后临时情景会重置。原合同和原数据不变。计算仍依赖回款按假设到账，不代表现金已经到账。"
      />
    </Card>
  );
}
