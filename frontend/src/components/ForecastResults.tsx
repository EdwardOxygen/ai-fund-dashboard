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
  const firstGap = view.days.find((d) => (d.general ?? 0) < -0.01)?.date;
  const balanceLabel = company ? "公司合计余额" : "项目存贷差";
  const metrics: [string, number | string][] = [
    [
      company ? "开始时银行可用资金（含专户）" : "开始时项目结余 / 垫资",
      view.opening,
    ],
    ["这段时间预计收多少钱", view.inflow],
    [
      baseline ? "这些情况下预计应付多少" : "这段时间按合同应付多少",
      view.outflow,
    ],
    [
      company ? "到最后一天银行资金还剩多少" : "到最后一天项目结余 / 垫资",
      view.ending,
    ],
    [
      company ? "中途最多还缺多少钱" : "项目最多需要垫多少钱",
      company ? view.fundingGap : view.peakAdvance,
    ],
    [
      company ? "第一次缺钱是哪天" : "第一次超过允许垫资是哪天",
      company ? firstGap || "本期未出现" : view.breachDate || "本期未突破",
    ],
  ];
  const report = company
    ? `公司期初资金${formatWan(view.opening)}＋本期预计收款${formatWan(view.inflow)}－本期合同应付${formatWan(view.outflow)}＝期末合计余额${formatWan(view.ending)}。一般资金筹资需求${formatWan(view.fundingGap)}；安全储备不足${formatWan(view.reserveGap)}，两者不可相加。该预测假设合同应付款全部按期支付，尚未进行付款优化。`
    : `本项目期初存贷差${formatWan(view.opening)}＋本期预计收款${formatWan(view.inflow)}－本期合同应付${formatWan(view.outflow)}＝期末存贷差${formatWan(view.ending)}。垫资峰值${formatWan(view.peakAdvance)}，${view.breachDate ? `于${view.breachDate}突破允许额度或期限` : "本期未突破垫资边界"}。这里不包含公司账户余额，也不是可从银行支取的资金。`;
  return (
    <>
      <Alert
        className="page-section"
        showIcon
        type={
          (company ? view.fundingGap > 0 : !!view.breachDate)
            ? "warning"
            : "info"
        }
        message={
          company
            ? view.fundingGap > 0
              ? `在${baseline ? "这些项目情况" : "原计划"}下，若到期款全部支付，中途最多需要补充${formatWan(view.fundingGap)}可统筹资金。`
              : "按当前回款假设，本期没有出现未筹足的付款资金。"
            : view.breachDate
              ? `本项目在${view.breachDate}超过允许垫资，需要检查回款或付款安排。`
              : `本项目最多垫资${formatWan(view.peakAdvance)}，本期未超过已设置的限制。`
        }
        description={
          company
            ? "最后一天有钱，不代表中途每天都够用。公司合计包含专户，工资和项目专户不能随意挪用。下一步可到“公司付款统筹”看能安排哪些款。"
            : "项目结余也叫存贷差：正数表示累计收得比付得多，负数表示需要公司垫资。它是项目归属账，不是银行账户余额，也不代表项目利润。"
        }
      />
      {baseline && (
        <Card
          className="page-section"
          title="改了这些项目情况，比原计划有什么变化？"
        >
          <Table
            rowKey="label"
            pagination={false}
            size="small"
            scroll={{ x: 550 }}
            dataSource={[
              {
                label: "这段时间收款",
                before: baseline.inflow,
                after: view.inflow,
              },
              {
                label: "这段时间应付款",
                before: baseline.outflow,
                after: view.outflow,
              },
              {
                label: "最后一天余额",
                before: baseline.ending,
                after: view.ending,
              },
              {
                label: company ? "中途最大资金缺口" : "项目垫资峰值",
                before: company ? baseline.fundingGap : baseline.peakAdvance,
                after: company ? view.fundingGap : view.peakAdvance,
              },
            ]}
            columns={[
              { title: "比较内容", dataIndex: "label" },
              { title: "原计划", dataIndex: "before", render: formatWan },
              { title: "设置情况后", dataIndex: "after", render: formatWan },
              {
                title: "变化（后－前）",
                render: (_, r) => formatWan(r.after - r.before),
              },
            ]}
          />
          <p>
            收款减少可能只是推迟到所选期间之外，并不是少收了合同总额。正负变化不直接代表好坏，请结合指标名称看。
          </p>
        </Card>
      )}
      {company && safety > 0 && (
        <Alert
          className="page-section"
          type="info"
          message={`如果还希望额外保留${formatWan(safety)}，离这个目标最多差${formatWan(view.reserveGap)}。这已包含上面的资金缺口，不能重复相加。`}
        />
      )}
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
                    legend: { type: "scroll", top: 0, left: 0, right: 0 },
                    grid: {
                      left: 12,
                      right: 22,
                      bottom: 76,
                      top: 65,
                      containLabel: true,
                    },
                    xAxis: {
                      type: "category",
                      data: view.days.map((d) => d.date),
                      axisLabel: {
                        hideOverlap: true,
                        margin: 14,
                        formatter: (date: string) => date.slice(5),
                      },
                    },
                    yAxis: { type: "value", name: "万元" },
                    dataZoom: [
                      { type: "inside" },
                      {
                        type: "slider",
                        bottom: 10,
                        height: 20,
                        showDetail: false,
                      },
                    ],
                    series: [
                      {
                        name: "预计收款",
                        type: "bar",
                        data: view.days.map((d) => d.inflow / 10000),
                        itemStyle: { color: "#60a79d" },
                      },
                      {
                        name: baseline ? "情景应付" : "合同应付",
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
                                label: {
                                  formatter: "安全储备",
                                  position: "insideEndTop",
                                },
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
            label: "收付款明细（怎么算的）",
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
                {baseline && (
                  <p>
                    本页已叠加逐项目设置的情况；下面的收款日期和应付金额是情景试算值，不会改写原合同。
                  </p>
                )}
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
