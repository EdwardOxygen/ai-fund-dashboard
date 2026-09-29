import { Card, Col, Row } from "antd";
export default function GettingStarted() {
  return (
    <Card className="page-section" title="第一次使用？按这个顺序走">
      <Row gutter={[20, 16]}>
        {[
          [
            "1 · 填项目合同",
            "进入项目，填业主怎么付款、产值进度、分包怎么付，以及以前已经收付了多少。金额输入框看清元或万元。",
          ],
          [
            "2 · 核对银行余额",
            "在“账户与导入”填写同一天的可用余额。工资专户和项目专户只能按用途使用，不能当成随便花的钱。",
          ],
          [
            "3 · 看未来会不会缺钱",
            "项目预测看本项目要垫多少钱；公司预测看银行资金够不够。两种余额不是同一个数，不能相加。",
          ],
          [
            "4 · 再安排先付哪些款",
            "公司付款统筹会给出建议和未安排金额。“已安排”只是计划，不是实际付款；实际支付还需人工审批。",
          ],
        ].map(([title, text]) => (
          <Col xs={24} md={12} xl={6} key={title}>
            <strong>{title}</strong>
            <p>{text}</p>
          </Col>
        ))}
      </Row>
      <details>
        <summary>“情景对比”什么时候用？</summary>
        <p>
          想知道某项目晚回款、工期延后或材料支出增加，会带来什么影响时使用。先添加项目情况，再与原计划对比；不需要重填合同。
        </p>
      </details>
    </Card>
  );
}
