import type { ReactNode } from "react";
import { Card, Tag } from "antd";
import type { RiskLevel } from "../api";

interface RiskCardProps {
  title: string;
  value: string | number;
  unit?: string;
  riskLevel?: RiskLevel;
  icon?: ReactNode;
  footer?: string;
}

export function riskColor(level?: string): string {
  if (level === "重大风险") return "volcano";
  if (level === "红色") return "red";
  if (level === "黄色") return "gold";
  if (level === "绿色") return "green";
  return "default";
}

export default function RiskCard({ title, value, unit, riskLevel, icon, footer }: RiskCardProps) {
  return (
    <Card className="metric-card" bordered={false}>
      <div className="metric-title">
        <span>{title}</span>
        {riskLevel ? <Tag color={riskColor(riskLevel)}>{riskLevel}</Tag> : icon}
      </div>
      <div className="metric-value">
        <span className="metric-number">{value}</span>
        {unit ? <span className="metric-unit">{unit}</span> : null}
      </div>
      {footer ? <div className="metric-footer">{footer}</div> : null}
    </Card>
  );
}
