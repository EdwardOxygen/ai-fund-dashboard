import EChartsReactCore from 'echarts-for-react/lib/core';
import type { EChartsReactProps } from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer]);
export default function Chart(props: Omit<EChartsReactProps, 'echarts'>) {
  return <EChartsReactCore echarts={echarts} {...props} />;
}
