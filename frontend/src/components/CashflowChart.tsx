import { useMemo } from "react";
import ReactECharts from "./Chart";
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
    const dates = data.map((item) => {
      const raw = item.date || item.forecast_date || "";
      return raw.length >= 10 ? raw.slice(5, 10).replace("-", "/") : raw;
    });
    const endingBalances = data.map((item) => Number((item.ending_balance / 10000).toFixed(2)));
    const collections = data.map((item) => Number(((item.expected_collection || 0) / 10000).toFixed(2)));
    const hasMovements = data.some(d => d.expected_collection !== undefined);
    const payments = data.map((item) => Number((((item.planned_payment || 0) + (item.rigid_payment || 0)) / 10000).toFixed(2)));

    return {
      color: ["#236ba7", "#80b5ca", "#de8d8d"],
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(11, 31, 42, .94)",
        borderWidth: 0,
        textStyle: { color: "#ffffff" },
        valueFormatter: (value: number) => `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 万`
      },
      grid: { top: 48, right: 22, bottom: 34, left: 58 },
      legend: {
        top: 0,
        data: hasMovements ? ["一般资金余额", "预计回款", "计划支出"] : ["一般资金余额"],
        icon: "roundRect",
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { color: "#667b83", fontSize: 12 }
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: "#dce6e5" } },
        axisTick: { show: false },
        axisLabel: { color: "#8a9aa0", fontSize: 11, interval: "auto" }
      },
      yAxis: {
        type: "value",
        name: "万元",
        nameTextStyle: { color: "#8a9aa0", padding: [0, 0, 4, 0] },
        axisLabel: { color: "#8a9aa0", fontSize: 11 },
        splitLine: { lineStyle: { color: "#edf2f1", type: "dashed" } }
      },
      series: [
        {
          name: "一般资金余额",
          type: "line",
          step: "end",
          symbol: "circle",
          symbolSize: 5,
          data: endingBalances,
          lineStyle: { width: 3 },
          itemStyle: { borderWidth: 2, borderColor: "#ffffff" },
          areaStyle: { opacity: 0.12 },
          markLine: {
            symbol: "none",
            label: { formatter: "安全线", position: "insideEndTop", color: "#d97706", fontSize: 11 },
            lineStyle: { color: "#d97706", type: "dashed", width: 1.5 },
            data: [{ yAxis: Number((safetyLine / 10000).toFixed(2)) }]
          }
        },
        {
          name: "预计回款",
          type: "bar",
          barMaxWidth: 12,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: collections
        },
        {
          name: "计划支出",
          type: "bar",
          barMaxWidth: 12,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: payments
        }
      ].filter((_, i) => i === 0 || hasMovements)
    };
  }, [data, safetyLine]);

  return <ReactECharts option={option} className="chart-box" notMerge lazyUpdate />;
}
