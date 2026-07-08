import { Progress, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { PaymentPriority } from "../api";
import { formatPercent, formatWan } from "../api";

interface PaymentTableProps {
  data: PaymentPriority[];
  loading?: boolean;
  compact?: boolean;
}

function suggestionColor(suggestion: string): string {
  if (suggestion === "立即支付") return "red";
  if (suggestion === "优先支付") return "orange";
  if (suggestion === "部分支付") return "gold";
  if (suggestion === "暂缓支付") return "blue";
  return "default";
}

export default function PaymentTable({ data, loading, compact }: PaymentTableProps) {
  const columns: ColumnsType<PaymentPriority> = [
    {
      title: "项目名称",
      dataIndex: "project_name",
      width: 190,
      fixed: "left"
    },
    {
      title: "付款对象",
      dataIndex: "payee_name",
      width: 170
    },
    {
      title: "付款类型",
      dataIndex: "payment_type",
      width: 120,
      render: (value: string) => <Tag color={value.includes("工资") || value.includes("税款") ? "red" : "cyan"}>{value}</Tag>
    },
    {
      title: "申请金额",
      dataIndex: "amount",
      width: 120,
      align: "right",
      render: (value: number) => formatWan(value)
    },
    {
      title: "已付款比例",
      dataIndex: "paid_ratio",
      width: 140,
      render: (value: number) => <Progress percent={Number((value * 100).toFixed(1))} size="small" />
    },
    {
      title: "AI评分",
      dataIndex: "ai_score",
      width: 110,
      sorter: (a, b) => a.ai_score - b.ai_score,
      render: (value: number) => (
        <Space>
          <Progress
            type="circle"
            percent={value}
            size={42}
            strokeColor={value >= 85 ? "#c92a2a" : value >= 70 ? "#f08c00" : "#176b5b"}
          />
        </Space>
      )
    },
    {
      title: "付款建议",
      dataIndex: "suggestion",
      width: 140,
      render: (value: string) => <Tag color={suggestionColor(value)}>{value}</Tag>
    },
    {
      title: "风险原因",
      dataIndex: "risk_reason",
      ellipsis: compact,
      render: (value: string, record) => (
        <Typography.Text type={record.suggestion.includes("退回") ? "danger" : undefined}>{value}</Typography.Text>
      )
    }
  ];

  return (
    <Table
      className="table-compact"
      rowKey="id"
      columns={columns}
      dataSource={data}
      loading={loading}
      pagination={compact ? false : { pageSize: 10 }}
      size="middle"
      scroll={{ x: 1160 }}
    />
  );
}
