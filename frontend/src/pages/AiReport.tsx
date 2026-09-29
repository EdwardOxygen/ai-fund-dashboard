import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Descriptions, Row, Space, Spin, Tag, Typography } from "antd";
import { CloudOutlined, FileTextOutlined } from "@ant-design/icons";
import { api, AiProviderStatus, AiReport as AiReportData, formatWan } from "../api";
import { EXTERNAL_AI_ENABLED } from "../config/features";
import RiskCard from "../components/RiskCard";
import PageHeader from "../components/PageHeader";

export default function AiReport() {
  const [data, setData] = useState<AiReportData | null>(null);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [externalLoading, setExternalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "local" | "external" | "auto" = "auto") => {
    setLoading(true);
    setError(null);
    try {
      const [report, status] = await Promise.all([
        api.getAiReport(mode),
        api.getAiProviderStatus()
      ]);
      setData(report);
      setProviderStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  async function generateExternalReport() {
    setExternalLoading(true);
    setError(null);
    try {
      setData(await api.getAiReport("external"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "外部AI生成失败");
    } finally {
      setExternalLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("fund-dashboard-refresh", refresh);
    };
  }, [load]);

  if (loading && !data) {
    return <Spin size="large" />;
  }

  return (
    <>
      <PageHeader
        title="资金分析报告"
        description="由本地计算引擎生成，汇总资金缺口、付款关注事项、压力情景与催收建议。业务数据不发送到外部模型。"
        actions={<>
          <Button icon={<FileTextOutlined />} onClick={() => load("local")} loading={loading}>
            本地规则报告
          </Button>
          {EXTERNAL_AI_ENABLED ? <Button type="primary" icon={<CloudOutlined />} onClick={generateExternalReport} loading={externalLoading} disabled={!providerStatus?.minimax_configured}>
            外部 AI 生成
          </Button> : null}
        </>}
      />
      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}

      {EXTERNAL_AI_ENABLED ? <Card
        variant="borderless"
        title="AI能力与运行环境"
        className="page-section"
        extra={
          providerStatus ? (
            <Space>
              <Tag color={providerStatus.minimax_configured ? "green" : "default"}>
                {providerStatus.minimax_configured ? "已配置" : "未配置"}
              </Tag>
              <Tag>{providerStatus.minimax_protocol === "anthropic" ? "Anthropic兼容" : "OpenAI兼容"}</Tag>
            </Space>
          ) : null
        }
      >
        <Descriptions
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            { key: "provider", label: "当前提供方", children: providerStatus?.provider || "local" },
            { key: "model", label: "模型", children: providerStatus?.minimax_model || "rule-template" },
            { key: "protocol", label: "协议", children: providerStatus?.minimax_protocol === "anthropic" ? "Anthropic 兼容" : "OpenAI 兼容" },
            { key: "status", label: "运行状态", children: providerStatus?.minimax_configured ? "已配置外部模型" : "本地规则模式" }
          ]}
        />
        <Typography.Paragraph type="secondary" className="config-note">
          当前公开演示版使用本地规则报告，不上传业务数据，也不开放付费模型接口。外部大模型接入需完成访问认证与服务端配置。
        </Typography.Paragraph>
      </Card> : <Alert className="page-section" type="info" showIcon message="本地引擎分析" description="报告来自当前业务数据、合同收支规则与确定性压力情景，不调用外部AI接口。建议仅供复核和调度讨论，实际付款须履行审批。" />}

      {data ? (
        <>
          <Row gutter={[16, 16]} className="metric-grid">
            <Col xs={24} md={6}>
              <RiskCard title="当前可用资金" value={formatWan(data.metrics.current_available_funds)} />
            </Col>
            <Col xs={24} md={6}>
              <RiskCard title="7日缺口" value={formatWan(data.metrics.gap_7d)} />
            </Col>
            <Col xs={24} md={6}>
              <RiskCard title="30日缺口" value={formatWan(data.metrics.gap_30d)} />
            </Col>
            <Col xs={24} md={6}>
              <RiskCard title="高风险项目" value={data.metrics.high_risk_project_count} unit="个" />
            </Col>
          </Row>
          <Card
            variant="borderless"
            title={`生成时间：${data.generated_at}`}
            extra={
              <Space wrap>
                <Tag color={data.report_source === "external" ? "green" : "blue"}>
                  {data.report_source === "external" ? "外部AI" : "本地规则"}
                </Tag>
                {EXTERNAL_AI_ENABLED ? <><Tag>{data.provider}</Tag><Tag>{data.model}</Tag></> : <Tag>可追溯 · 可复核</Tag>}
              </Space>
            }
          >
            {EXTERNAL_AI_ENABLED && providerStatus ? (
              <Alert
                type={providerStatus.minimax_configured ? "success" : "info"}
                showIcon
                message={
                  providerStatus.minimax_configured
                    ? `MiniMax 已配置：${providerStatus.minimax_model}`
                    : "当前为本地报告模式：计算结果真实可复核，文字由规则模板生成"
                }
                description="不把规则报告标为真实大模型生成。生产接入后方可启用外部AI。"
                className="page-section"
              />
            ) : null}
            {EXTERNAL_AI_ENABLED && data.fallback_reason ? (
              <Alert
                type="warning"
                showIcon
                message="外部AI调用失败，已回退到本地规则报告"
                description={data.fallback_reason}
                className="page-section"
              />
            ) : null}
            <div className="report-content">{data.report}</div>
          </Card>
        </>
      ) : null}
    </>
  );
}
