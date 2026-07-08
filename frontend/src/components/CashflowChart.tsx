import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { RiskLevel } from "../api";

interface CashflowChartItem {
  date?: string;
  forecast_date?: string;
  ending_balance: number;
  expected_collection?: number;
  planned_payment?: number;
  rigid_payment?: number;
  risk_level?: RiskLevel;
}

interface CashflowChartProps {
  data: CashflowChartItem[];
  safetyLine?: number;
}

export default function CashflowChart({ data, safetyLine = 3_000_000 }: CashflowChartProps) {
  const option = useMemo(() => {
    const dates = data.map((item) => item.date || item.forecast_date || "");
    const endingBalances = data.map((item) => Number((item.ending_balance / 10000).toFixed(2)));
    const collections = data.map((item) => Number(((item.expected_collection || 0) / 10000).toFixed(2)));
    const payments = data.map((item) => Number((((item.planned_payment || 0) + (item.rigid_payment || 0)) / 10000).toFixed(2)));

    return {
      color: ["#176b5b", "#2b8a3e", "#c92a2a"],
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number) => `${value.toLocaleString("zh-CN")} 万`
      },
      grid: { top: 36, right: 26, bottom: 44, left: 58 },
      legend: {
        top: 0,
        data: ["期末余额", "预计回款", "计划支出"]
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates
      },
      yAxis: {
        type: "value",
        name: "万元",
        splitLine: { lineStyle: { color: "#eef0f2" } }
      },
      series: [
        {
          name: "期末余额",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 5,
          data: endingBalances,
          areaStyle: { opacity: 0.08 },
          markLine: {
            symbol: "none",
            label: { formatter: "安全线" },
            lineStyle: { color: "#f08c00", type: "dashed" },
            data: [{ yAxis: Number((safetyLine / 10000).toFixed(2)) }]
          }
        },
        {
          name: "预计回款",
          type: "bar",
          barMaxWidth: 14,
          data: collections
        },
        {
          name: "计划支出",
          type: "bar",
          barMaxWidth: 14,
          data: payments
        }
      ]
    };
  }, [data, safetyLine]);

  return <ReactECharts option={option} className="chart-box" notMerge lazyUpdate />;
}
