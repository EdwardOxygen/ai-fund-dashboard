import type { ReactNode } from "react";
import { Space, Typography } from "antd";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  status?: ReactNode;
}

export default function PageHeader({
  eyebrow = "AI 资金驾驶舱",
  title,
  description,
  actions,
  status
}: PageHeaderProps) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="page-eyebrow">{eyebrow}</div>
        <Typography.Title level={2} className="page-heading-title">
          {title}
        </Typography.Title>
        <Typography.Paragraph className="page-heading-description">
          {description}
        </Typography.Paragraph>
      </div>
      {actions || status ? (
        <Space className="page-heading-actions" wrap>
          {status}
          {actions}
        </Space>
      ) : null}
    </div>
  );
}
