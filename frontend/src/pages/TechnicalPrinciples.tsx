import { Alert, Button, Card, Col, Row, Space, Tag, Timeline, Typography, message } from "antd";
import {
  ApiOutlined,
  CalculatorOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  FundProjectionScreenOutlined
} from "@ant-design/icons";
import { api, PREDICTION_RULES } from "../api";
import PageHeader from "../components/PageHeader";

const principleSections = [
  {
    title: "一、系统定位",
    tags: ["建筑企业", "资金计划", "业财融合"],
    body:
      "系统以项目为资金管理主线，汇集银行账户、项目主数据、预计回款、付款申请和现金流预测，形成“数据填报、规则评分、风险预警、AI报告”的闭环。核心目标不是替代财务判断，而是把分散的项目资金信息转为可排序、可解释、可复盘的资金调度依据。"
  },
  {
    title: "二、项目主数据",
    tags: ["合同额", "确权", "开票", "回款"],
    body:
      "项目主数据维护项目名称、业主类型、合同额、确权产值、已开票金额和已回款金额。系统基于合同额与已回款金额计算回款率，同时结合预计回款和付款申请，动态形成项目红黄绿风险等级。项目主数据是后续回款预测、付款评分和报告生成的共同基础。"
  },
  {
    title: "三、回款可信度评分",
    tags: ["付款节点", "开票状态", "账龄", "历史延期"],
    body:
      "预计回款按规则模型计算 ai_probability。加分因素包括已确权、付款节点已达成、已开票；扣分因素包括未到节点、未开票、账龄偏长和历史延期。评分仅辅助判断催收关注程度，未经历史样本校准，不表示真实概率，也不折减合同现金流。"
  },
  {
    title: "四、付款优先级评分",
    tags: ["刚性支出", "农民工工资", "税款", "履约影响"],
    body:
      "付款申请按 ai_score 排序。工资、农民工工资、税款等刚性支出优先；劳务分包、材料款、机械租赁、专业分包按现场履约影响加分；逾期付款加分；附件缺失、付款后低于安全线、付款比例过高扣分。系统据此给出立即支付、优先支付、部分支付、暂缓支付或退回补充资料等建议。"
  },
  {
    title: "五、现金流预测",
    tags: ["90天滚动", "安全线", "刚性支付", "资金缺口"],
    body:
      "现金流预测以当前可用资金为起点，按日滚动生成未来 90 天余额。回款由合同节点、审核天数、账期、分期及质保金组成；全部未付义务全额纳入。对比合同基准、回款延迟、施工承压、组合压力四类确定性情景，不使用蒙特卡洛。一般资金余额低于安全线标记红色，接近安全线标记黄色，刚性支出无法覆盖时标记重大风险。"
  },
  {
    title: "六、AI报告生成",
    tags: ["本地规则", "MiniMax", "外部API", "回退机制"],
    body:
      "报告默认由本地规则模板生成，确保无外部 API key 时系统仍可运行。点击外部AI生成时，后端会把资金指标、现金流、付款优先级、项目风险和催收重点整理成结构化上下文，优先调用 MiniMax Anthropic-compatible Messages 接口生成正式报告，也兼容 OpenAI-compatible Chat Completions。若外部调用失败，页面会展示失败原因并自动回退到本地报告。"
  }
];

const dataFlow = [
  "财务人员手动录入账户、项目、预计回款和付款申请",
  "浏览器本地规则引擎刷新 ai_probability、ai_score、suggestion",
  "现金流服务按日生成 7/30/90 天余额、资金缺口和风险等级",
  "看板、项目风险、付款优先级和报告页面读取同一套计算结果",
  "外部AI报告仅在用户点击时消费计算结果，不直接修改业务数据"
];

export default function TechnicalPrinciples() {
  const [messageApi, contextHolder] = message.useMessage();

  function handleExportRules() {
    api.exportPredictionRules();
    messageApi.success("预测数学规则文件已生成");
  }

  return (
    <>
      {contextHolder}
      <PageHeader
        title="技术原理说明"
        description="展示系统的数据链路、评分逻辑、现金流预测与人工落地方式；可导出当前站点实际执行的数学规则。"
        actions={<Button icon={<DownloadOutlined />} onClick={handleExportRules}>导出预测数学规则</Button>}
      />

      <Alert className="page-section" type="info" showIcon message="模型边界：可解释的情景推演，不等同于已训练的AI预测模型" description="付款优化使用混合整数规划，受账户用途、付款窗口、刚性期限、分期条件及资料完整性约束；最多100笔到期申请、限时求解，不承诺全局最优。未覆盖义务单列，任何方案均需人工审批。大模型仅用于文字解释，不改变计算结果。" />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Space direction="vertical" size={16} className="full-width">
            {principleSections.map((section, index) => (
              <Card
                key={section.title}
                variant="borderless"
                title={
                  <Space>
                    {index === 0 ? <DatabaseOutlined /> : null}
                    {index === 2 ? <CalculatorOutlined /> : null}
                    {index === 4 ? <FundProjectionScreenOutlined /> : null}
                    {index === 5 ? <ApiOutlined /> : null}
                    <span>{section.title}</span>
                  </Space>
                }
              >
                <Space wrap className="page-section">
                  {section.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Space>
                <Typography.Paragraph className="principle-text">{section.body}</Typography.Paragraph>
              </Card>
            ))}
          </Space>
        </Col>
        <Col xs={24} xl={9}>
          <Card variant="borderless" title="数据处理链路">
            <Timeline
              items={dataFlow.map((item, index) => ({
                dot: index === dataFlow.length - 1 ? <FileSearchOutlined /> : undefined,
                children: item
              }))}
            />
          </Card>
          <Card variant="borderless" title="唯一外部接口：AI报告" className="page-section">
            <Typography.Paragraph>
              <code>AI_REPORT_PROVIDER=minimax</code>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <code>默认使用本地报告。公开演示站不开放付费模型调用；生产接入需独立认证和服务端密钥。</code>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <code>外部模型以服务器实际配置为准</code>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <code>MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic</code>
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      <Card
        variant="borderless"
        className="page-section"
        title="预测数学规则（当前实际执行版本）"
        extra={<Tag color="blue">本地规则引擎</Tag>}
      >
        <Alert
          type="info"
          showIcon
          message="公式、加减分和阈值与当前浏览器端计算代码保持一致"
          description="可点击页面右上角或本卡片上方的“导出预测数学规则”，下载 Markdown 版规则文件，用于财务复核、制度说明和后续模型迭代。"
          className="page-section"
        />
        <Row gutter={[16, 16]}>
          {PREDICTION_RULES.map((section) => (
            <Col xs={24} lg={12} key={section.title}>
              <Card size="small" title={section.title} className="rule-card">
                <Typography.Text strong>核心公式</Typography.Text>
                <div className="formula-block">{section.formula}</div>
                <Typography.Text strong>变量说明</Typography.Text>
                <ul className="rule-list">
                  {section.variables.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <Typography.Text strong>执行规则</Typography.Text>
                <ul className="rule-list">
                  {section.rules.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </>
  );
}
