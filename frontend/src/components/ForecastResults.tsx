import { Alert, Card, Col, Row, Statistic, Table, Tabs, Tag } from "antd";
import { formatWan } from "../api";
import type { ForecastView } from "../domain/forecast";
import Chart from "./Chart";

export default function ForecastResults({
  view,
  baseline,
  safety = 0,
}: {
  view: ForecastView;
  baseline?: ForecastView;
  safety?: number;
}) {
  const company = view.scope.kind === "company";
  const balanceLabel = company ? "公司合计余额" : "项目存贷差";
  const metrics: [string, number | string][] = [
    [
      company ? "公司期初资金（不含用途未确认）" : "项目期初存贷差",
      view.opening,
    ],
    ["本期预计收款", view.inflow],
    ["本期合同应付款", view.outflow],
    [company ? "期末公司合计余额" : "期末项目存贷差", view.ending],
    [
      company ? "一般资金最大筹资需求" : "项目垫资峰值",
      company ? view.fundingGap : view.peakAdvance,
    ],
    [
      company ? "一般资金安全储备不足" : "首次突破垫资限制",
      company ? view.reserveGap : view.breachDate || "本期未突破",
    ],
  ];
  const report = company
    ? `公司期初资金${formatWan(view.opening)}＋本期预计收款${formatWan(view.inflow)}－本期合同应付${formatWan(view.outflow)}＝期末合计余额${formatWan(view.ending)}。一般资金筹资需求${formatWan(view.fundingGap)}；安全储备不足${formatWan(view.reserveGap)}，两者不可相加。该预测假设合同应付款全部按期支付，尚未进行付款优化。`
    : `本项目期初存贷差${formatWan(view.opening)}＋本期预计收款${formatWan(view.inflow)}－本期合同应付${formatWan(view.outflow)}＝期末存贷差${formatWan(view.ending)}。垫资峰值${formatWan(view.peakAdvance)}，${view.breachDate ? `于${view.breachDate}突破允许额度或期限` : "本期未突破垫资边界"}。这里不包含公司账户余额，也不是可从银行支取的资金。`;
  return (
    <>
      <Row gutter={[12, 12]} className="page-section">
        {metrics.map(([label, value]) => (
          <Col xs={24} sm={12} xl={8} key={label}>
            <Card>
              <Statistic
                title={label}
                value={typeof value === "number" ? formatWan(value) : value}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Tabs
        items={[
          {
            key: "trend",
            label: "收支与余额",
            children: (
              <Card title={`${balanceLabel} · ${view.start} 至 ${view.end}`}>
                <Chart
                  style={{ height: 360 }}
                  option={{
                    tooltip: {
                      trigger: "axis",
                      valueFormatter: (v: number) => `${v.toFixed(2)} 万元`,
                    },
                    legend: { top: 0 },
                    grid: { left: 75, right: 28, bottom: 65, top: 70 },
                    xAxis: {
                      type: "category",
                      data: view.days.map((d) => d.date),
                    },
                    yAxis: { type: "value", name: "万元" },
                    dataZoom: [
                      { type: "inside" },
                      { type: "slider", bottom: 8 },
                    ],
                    series: [
                      {
                        name: "预计收款",
                        type: "bar",
                        data: view.days.map((d) => d.inflow / 10000),
                        itemStyle: { color: "#60a79d" },
                      },
                      {
                        name: "合同应付",
                        type: "bar",
                        data: view.days.map((d) => -d.outflow / 10000),
                        itemStyle: { color: "#c89878" },
                      },
                      {
                        name: balanceLabel,
                        type: "line",
                        step: "end",
                        showSymbol: false,
                        data: view.days.map((d) => d.ending / 10000),
                        itemStyle: { color: "#276b94" },
                      },
                      ...(company
                        ? [
                            {
                              name: "其中一般资金",
                              type: "line",
                              showSymbol: false,
                              data: view.days.map((d) => d.general! / 10000),
                              lineStyle: { type: "dashed" },
                              markLine: {
                                symbol: "none",
                                data: [
                                  { yAxis: safety / 10000, name: "安全储备" },
                                ],
                                label: { formatter: "安全储备" },
                              },
                            },
                          ]
                        : [
                            {
                              name: "允许最低存贷差",
                              type: "line",
                              showSymbol: false,
                              data: view.days.map((d) => d.floor! / 10000),
                              lineStyle: { type: "dashed", color: "#bd7548" },
                            },
                          ]),
                      ...(baseline
                        ? [
                            {
                              name: "合同基准余额",
                              type: "line",
                              showSymbol: false,
                              data: baseline.days.map((d) => d.ending / 10000),
                              lineStyle: { type: "dotted", color: "#8b94a0" },
                            },
                          ]
                        : []),
                    ],
                  }}
                />
                <Alert
                  type="info"
                  message={
                    company
                      ? "负余额表示按期全付时尚未筹足的资金；专户资金仍受用途限制。"
                      : "负存贷差表示项目需要垫资，允许范围内不等于异常；项目正存贷差不能重复加到公司余额。"
                  }
                />
              </Card>
            ),
          },
          {
            key: "daily",
            label: "逐日核对",
            children: (
              <Table
                rowKey="date"
                dataSource={view.days}
                pagination={{ pageSize: 15 }}
                scroll={{ x: 850 }}
                columns={[
                  { title: "日期", dataIndex: "date" },
                  { title: "期初", dataIndex: "opening", render: formatWan },
                  { title: "收款", dataIndex: "inflow", render: formatWan },
                  { title: "应付款", dataIndex: "outflow", render: formatWan },
                  {
                    title: company ? "期末合计" : "期末存贷差",
                    dataIndex: "ending",
                    render: formatWan,
                  },
                  company
                    ? {
                        title: "其中一般资金",
                        dataIndex: "general",
                        render: formatWan,
                      }
                    : {
                        title: "允许最低存贷差",
                        dataIndex: "floor",
                        render: formatWan,
                      },
                ]}
              />
            ),
          },
          ...(company
            ? [
                {
                  key: "projects",
                  label: "项目收支汇总",
                  children: (
                    <Card title="仅汇总本期收支，不汇总项目期初存贷差">
                      <Table
                        rowKey="id"
                        dataSource={view.projectRows}
                        pagination={false}
                        scroll={{ x: 700 }}
                        columns={[
                          { title: "项目", dataIndex: "name" },
                          {
                            title: "计入公司收款",
                            dataIndex: "inflow",
                            render: formatWan,
                          },
                          {
                            title: "合同应付",
                            dataIndex: "outflow",
                            render: formatWan,
                          },
                          {
                            title: "本期净流量",
                            dataIndex: "net",
                            render: formatWan,
                          },
                          {
                            title: "账户未确认收款（未计入）",
                            dataIndex: "unassigned",
                            render: formatWan,
                          },
                        ]}
                      />
                      <p>
                        项目收款合计＝公司本期收款；项目应付合计＝公司本期应付。公司期初只取资金账户，不再加项目存贷差。
                      </p>
                    </Card>
                  ),
                },
              ]
            : []),
          {
            key: "events",
            label: "本期合同事件",
            children: (
              <Table
                rowKey="id"
                dataSource={view.events.filter(
                  (e) => e.date >= view.start && e.date <= view.end,
                )}
                scroll={{ x: 950 }}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: "预计日期", dataIndex: "date" },
                  { title: "项目 / 对象", dataIndex: "name" },
                  {
                    title: "收支",
                    dataIndex: "direction",
                    render: (v) => (
                      <Tag color={v === "in" ? "green" : "orange"}>
                        {v === "in" ? "收款" : "付款"}
                      </Tag>
                    ),
                  },
                  { title: "金额", dataIndex: "amount", render: formatWan },
                  { title: "计算依据", dataIndex: "note" },
                ]}
              />
            ),
          },
          {
            key: "report",
            label: "结果说明",
            children: (
              <Card title="本次预测的核对口径">
                <p>{report}</p>
                <p>
                  预测区间：{view.start} 至 {view.end}
                  。预计回款并非已到账资金；未来付款是合同义务，不代表已审批申请。金额不按旧版“AI概率”打折。
                </p>
                {baseline && (
                  <p>
                    同区间相对基准：收款变化
                    {formatWan(view.inflow - baseline.inflow)}，应付款变化
                    {formatWan(view.outflow - baseline.outflow)}，期末余额变化
                    {formatWan(view.ending - baseline.ending)}。
                  </p>
                )}
              </Card>
            ),
          },
        ]}
      />
      {view.warnings.length > 0 && (
        <details className="page-section">
          <summary>数据核对提醒（{view.warnings.length}项）</summary>
          <ul>
            {view.warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
