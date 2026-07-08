import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Space, Spin, Tag, Typography, message } from "antd";
import { CloudOutlined, FileTextOutlined, SaveOutlined } from "@ant-design/icons";
import { api, AiProviderConfigPayload, AiProviderStatus, AiReport as AiReportData, formatWan } from "../api";
import RiskCard from "../components/RiskCard";

type AiProviderFormValues = AiProviderConfigPayload & {
  api_key?: string;
};

export default function AiReport() {
  const [data, setData] = useState<AiReportData | null>(null);
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [externalLoading, setExternalLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [configForm] = Form.useForm<AiProviderFormValues>();

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
      configForm.setFieldsValue({
        provider: "minimax",
        api_key: "",
        base_url: status.minimax_base_url,
        model: status.minimax_model,
        timeout_seconds: 30
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [configForm]);

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

  async function saveMinimaxConfig(values: AiProviderFormValues) {
    setSavingConfig(true);
    setError(null);
    try {
      const apiKey = values.api_key?.trim();
      const status = await api.updateAiProviderConfig({
        provider: "minimax",
        ...(apiKey ? { api_key: apiKey } : {}),
        base_url: values.base_url,
        model: values.model,
        timeout_seconds: values.timeout_seconds
      });
      setProviderStatus(status);
      configForm.setFieldValue("api_key", "");
      messageApi.success("MiniMax API配置已保存");
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingConfig(false);
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("fund-dashboard-refresh", refresh);
    return () => window.removeEventListener("fund-dashboard-refresh", refresh);
  }, [load]);

  if (loading && !data) {
    return <Spin size="large" />;
  }

  return (
    <>
      {contextHolder}
      <div className="toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            AI资金风险分析报告
          </Typography.Title>
          <Typography.Text type="secondary">正式财务汇报口径，覆盖资金缺口、付款建议、催收项目和管理建议。</Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<FileTextOutlined />} onClick={() => load("local")} loading={loading}>
            本地规则报告
          </Button>
          <Button type="primary" icon={<CloudOutlined />} onClick={generateExternalReport} loading={externalLoading}>
            外部AI生成
          </Button>
        </Space>
      </div>
      {error ? <Alert type="error" showIcon message={error} className="page-section" /> : null}

      <Card
        bordered={false}
        title="MiniMax API配置"
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
        <Form
          form={configForm}
          layout="vertical"
          initialValues={{
            provider: "minimax",
            api_key: "",
            base_url: "https://api.minimaxi.com/anthropic",
            model: "MiniMax-M3",
            timeout_seconds: 30
          }}
          onFinish={saveMinimaxConfig}
        >
          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item label="API Key" name="api_key">
                <Input.Password placeholder="MINIMAX_API_KEY" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item label="Base URL" name="base_url" rules={[{ required: true, message: "请输入 Base URL" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={5}>
              <Form.Item label="模型" name="model" rules={[{ required: true, message: "请输入模型名称" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={3}>
              <Form.Item label="超时" name="timeout_seconds" rules={[{ required: true, message: "请输入超时秒数" }]}>
                <InputNumber min={5} max={120} precision={0} addonAfter="秒" className="full-width" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={2}>
              <Form.Item label=" " colon={false}>
                <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={savingConfig} block>
                  保存
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

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
            bordered={false}
            title={`生成时间：${data.generated_at}`}
            extra={
              <Space wrap>
                <Tag color={data.report_source === "external" ? "green" : "blue"}>
                  {data.report_source === "external" ? "外部AI" : "本地规则"}
                </Tag>
                <Tag>{data.provider}</Tag>
                <Tag>{data.model}</Tag>
              </Space>
            }
          >
            {providerStatus ? (
              <Alert
                type={providerStatus.minimax_configured ? "success" : "info"}
                showIcon
                message={
                  providerStatus.minimax_configured
                    ? `MiniMax 已配置：${providerStatus.minimax_model}`
                    : "MiniMax 未配置：设置 MINIMAX_API_KEY 后可使用外部AI生成"
                }
                description={`当前 provider=${providerStatus.provider}，protocol=${providerStatus.minimax_protocol}，base_url=${providerStatus.minimax_base_url}`}
                className="page-section"
              />
            ) : null}
            {data.fallback_reason ? (
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
