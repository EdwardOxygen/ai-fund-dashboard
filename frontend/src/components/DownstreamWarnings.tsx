import { Alert, Card, Table, Tag } from "antd";
import { formatWan } from "../api";
import type { ProjectPlan } from "../domain/projectPlanning";
import {
  downstreamForecastChecks,
  stageNames,
  type DownstreamCheck,
} from "../domain/downstreamControl";
const labels = {
  off: "已关闭",
  missing: "依据不足",
  warning: "超比例预警",
  ok: "未超预警线",
};
export function DownstreamStatus({ check }: { check: DownstreamCheck }) {
  return (
    <Tag
      color={
        check.status === "warning"
          ? "orange"
          : check.status === "ok"
            ? "green"
            : undefined
      }
    >
      {labels[check.status]}
      {check.ratio !== null
        ? ` · ${check.ratio.toFixed(2)}% / ${check.limit}%`
        : ""}
    </Tag>
  );
}
export default function DownstreamWarnings({
  projects,
  end,
  payments = [],
  mode = "contract",
}: {
  projects: { id: number; project_name: string; plan?: ProjectPlan }[];
  end: string;
  payments?: { date: string; amount: number; project_id: number }[];
  mode?: "contract" | "allocation";
}) {
  const grouped = new Map<number, { date: string; amount: number }[]>();
  for (const payment of payments) {
    const bucket = grouped.get(payment.project_id) || [];
    bucket.push(payment);
    grouped.set(payment.project_id, bucket);
  }
  const rows = projects
    .filter((p) => p.plan?.enabled)
    .flatMap((p) =>
      downstreamForecastChecks(p.plan!, end, grouped.get(p.id) || []).map(
        (check) => ({
          ...check,
          project: p.project_name,
          key: `${p.id}-${check.date}`,
        }),
      ),
    );
  if (!rows.length) return null;
  const warnings = rows.filter((r) => r.status === "warning").length;
  return (
    <Card className="page-section" title="下游成本与付款比例 · 项目合并预警">
      <Alert
        showIcon
        className="page-section"
        type={warnings ? "warning" : "info"}
        message={
          warnings
            ? `${warnings}个检查点超过预警线，请核对付款节奏`
            : "每个项目独立检查，不设置公司总比例"
        }
        description="分包、材料、机械等合并计算。当前比例＝累计实际已付款÷同日累计已确认成本；未来比例仅为预测，不代表已付款。超过比例只提醒，不改变原合同、账期、质保金、排序或垫资约束。"
      />
      <p>
        未来检查按填写的成本计划日期进行，不插值、不把当前成本当成未来成本；未覆盖的期末显示“依据不足”。自动阶段依据项目竣工/结算日期，手动阶段在整个预测期保持不变；压力情景不自动改写成本和阶段计划。
      </p>
      <Table
        rowKey="key"
        dataSource={rows}
        size="small"
        pagination={rows.length > 8 ? { pageSize: 8 } : false}
        scroll={{ x: 1100 }}
        columns={[
          {
            title: "项目 / 检查日期",
            render: (_, r) => (
              <>
                {r.project}
                <br />
                {r.date}
              </>
            ),
          },
          {
            title: "检查口径",
            render: (_, r) =>
              r.basis === "actual"
                ? "当前实际"
                : mode === "allocation"
                  ? "若执行付款建议"
                  : "若按合同全付",
          },
          {
            title: "阶段 / 预警线",
            render: (_, r) =>
              r.stage ? `${stageNames[r.stage]} / ${r.limit}%` : "待设置阶段",
          },
          {
            title: "累计实付 / 预计累计付款",
            dataIndex: "paid",
            render: formatWan,
          },
          {
            title: "同日累计成本（实际 / 计划）",
            dataIndex: "cost",
            render: (v) => (v === null ? "未填写" : formatWan(v)),
          },
          {
            title: "付款比例与状态",
            render: (_, r) => <DownstreamStatus check={r} />,
          },
          {
            title: "超线金额 / 说明",
            render: (_, r) => (
              <>
                {r.excess > 0 && (
                  <strong>
                    {formatWan(r.excess)}
                    <br />
                  </strong>
                )}
                {r.reason}
              </>
            ),
          },
        ]}
      />
    </Card>
  );
}
