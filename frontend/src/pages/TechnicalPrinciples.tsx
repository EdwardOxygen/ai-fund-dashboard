import { Card, Col, Row, Space, Tag, Timeline, Typography } from "antd";
import {
  ApiOutlined,
  CalculatorOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FundProjectionScreenOutlined
} from "@ant-design/icons";

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
      "预计回款按规则模型计算 ai_probability。加分因素包括已确权、付款节点已达成、已开票；扣分因素包括未到节点、未开票、账龄偏长和历史延期。评分结果会折算现金流中的风险调整回款金额，并参与项目回款风险判断。"
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
      "现金流预测以当前可用资金为起点，按日滚动生成未来 90 天余额。预计回款按可信度折算；刚性付款全额纳入；立即支付和优先支付纳入计划付款；部分支付按 50% 纳入。期末余额低于安全线标记红色，接近安全线标记黄色，刚性支出无法覆盖时标记重大风险。"
  },
  {
    title: "六、AI报告生成",
    tags: ["本地规则", "MiniMax", "外部API", "回退机制"],
    body:
      "报告默认由本地规则模板生成，确保无外部 API key 时系统仍可运行。点击外部AI生成时，后端会把资金指标、现金流、付款优先级、项目风险和催收重点整理成结构化上下文，优先调用 MiniMax Anthropic-compatible Messages 接口生成正式报告，也兼容 OpenAI-compatible Chat Completions。若外部调用失败，页面会展示失败原因并自动回退到本地报告。"
  }
];

const dataFlow = [
  "项目主数据、账户余额、预计回款、付款申请进入 SQLite 数据库",
  "回款评分和付款评分服务刷新 ai_probability、ai_score、suggestion",
  "现金流服务按日生成 7/30/90 天余额、资金缺口和风险等级",
  "看板、项目风险、付款优先级和报告页面读取同一套计算结果",
  "外部AI报告只消费计算后的结构化上下文，不直接修改业务数据"
];

export default function TechnicalPrinciples() {
  return (
    <>
      <div className="toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            技术原理说明
          </Typography.Title>
          <Typography.Text type="secondary">
            这页内容集中维护在 <code>frontend/src/pages/TechnicalPrinciples.tsx</code>，后续可直接修改文案和章节。
          </Typography.Text>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Space direction="vertical" size={16} className="full-width">
            {principleSections.map((section, index) => (
              <Card
                key={section.title}
                bordered={false}
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
          <Card bordered={false} title="数据处理链路">
            <Timeline
              items={dataFlow.map((item, index) => ({
                dot: index === dataFlow.length - 1 ? <FileSearchOutlined /> : undefined,
                children: item
              }))}
            />
          </Card>
          <Card bordered={false} title="外部AI环境变量" className="page-section">
            <Typography.Paragraph>
              <code>AI_REPORT_PROVIDER=minimax</code>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <code>MINIMAX_API_KEY=你的MiniMax Key</code>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <code>MINIMAX_MODEL=MiniMax-M3</code>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <code>MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic</code>
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>
    </>
  );
}
