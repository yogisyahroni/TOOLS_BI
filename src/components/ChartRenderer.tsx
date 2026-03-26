import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import 'echarts-wordcloud';
import { format, parseISO, isValid } from 'date-fns';
import { ALL_CHART_TYPES } from '../constants/chartTypes';
import {
  BarChart, Bar, LineChart as ReLineChart, Line,
  PieChart as RePieChart, Pie, Cell,
  AreaChart as ReAreaChart, Area,
  ScatterChart, Scatter,
  RadarChart, Radar as ReRadar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  FunnelChart, Funnel, LabelList, Treemap,
  ComposedChart, ReferenceLine
} from 'recharts';

export const COLORS = [
  'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
  'hsl(210, 80%, 55%)', 'hsl(30, 90%, 55%)', 'hsl(160, 60%, 45%)',
  'hsl(0, 70%, 55%)', 'hsl(45, 85%, 50%)', 'hsl(260, 50%, 60%)',
];

const formatValue = (value: any) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    // Check if it's an ISO date string (YYYY-MM-DDTHH:mm:ss...)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const date = parseISO(value);
      if (isValid(date)) {
        return format(date, 'dd MMM yyyy'); // e.g., 01 Jan 2024
      }
    }
  }
  return String(value);
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  borderColor: 'hsl(var(--border))',
  borderRadius: '0.5rem',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px'
};

const EmptyChart = ({ msg = "Select Dataset, X-Axis, and Y-Axis" }: { msg?: string }) => (
  <div className="flex items-center justify-center h-full border-2 border-dashed border-border rounded-lg bg-muted/20">
    <div className="flex flex-col items-center gap-2">
      <div className="p-3 shadow-sm bg-background border border-border rounded-xl">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground w-6 h-6"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
      </div>
      <p className="text-sm font-medium text-muted-foreground text-center px-4">{msg}</p>
    </div>
  </div>
);

const HeatmapCell = ({ value, max }: { value: number, max: number }) => {
  const intensity = max > 0 ? value / max : 0;
  return (
    <div
      className="w-full h-8 rounded-sm transition-all"
      style={{
        backgroundColor: `rgba(16, 185, 129, ${Math.max(0.1, intensity)})`,
        border: '1px solid rgba(16, 185, 129, 0.2)'
      }}
      title={value.toString()}
    />
  );
};

export interface ChartRendererProps {
  chartTitle?: string;
  chartType: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  dataLimit: string;
  dataset: any;
  numericColumns: any[];
  categoricalColumns: any[];
  sortOrder?: 'asc' | 'desc' | 'none';
  showLegend?: boolean;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  chartTitle,
  chartType,
  xAxis,
  yAxis,
  groupBy,
  dataLimit,
  dataset,
  numericColumns,
  categoricalColumns,
  sortOrder = 'none',
  showLegend = true,
}) => {
  const chartData = useMemo(() => {
    if (!dataset || !xAxis || !yAxis) return [];
    const aggregated = new Map<string, number>();
    dataset.data.forEach(row => {
      const key = formatValue(row[xAxis] || 'Unknown');
      const val = Number(row[yAxis]) || 0;
      aggregated.set(key, (aggregated.get(key) || 0) + val);
    });
    let result = Array.from(aggregated.entries()).map(([name, value]) => ({ name, value }));

    if (sortOrder === 'asc') result.sort((a, b) => a.value - b.value);
    else if (sortOrder === 'desc') result.sort((a, b) => b.value - a.value);

    const limit = parseInt(dataLimit, 10);
    if (limit > 0) result = result.slice(0, limit);

    return result;
  }, [dataset, xAxis, yAxis, sortOrder, dataLimit]);

  // Waterfall data: compute running total
  const waterfallData = useMemo(() => {
    if (chartType !== 'waterfall' || !chartData.length) return [];
    let running = 0;
    return chartData.map((d, i) => {
      const start = running;
      running += d.value;
      return { name: d.name, value: d.value, start, end: running, fill: d.value >= 0 ? COLORS[0] : COLORS[5] };
    });
  }, [chartData, chartType]);

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (chartType !== 'heatmap' || !dataset || !xAxis || !yAxis || !groupBy) return { data: [], xLabels: [], yLabels: [] };
    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const map = new Map<string, number>();
    dataset.data.forEach(row => {
      const x = formatValue(row[xAxis] || '');
      const y = formatValue(row[groupBy] || '');
      const v = Number(row[yAxis]) || 0;
      xSet.add(x); ySet.add(y);
      const key = `${y}__${x}`;
      map.set(key, (map.get(key) || 0) + v);
    });
    const xLabels = Array.from(xSet).slice(0, 20);
    const yLabels = Array.from(ySet).slice(0, 15);
    const data = yLabels.map(y => xLabels.map(x => map.get(`${y}__${x}`) || 0));
    return { data, xLabels, yLabels };
  }, [chartType, dataset, xAxis, yAxis, groupBy]);

  // Boxplot data
  const boxplotData = useMemo(() => {
    if (chartType !== 'boxplot' || !dataset || !xAxis || !yAxis) return [];
    const groups = new Map<string, number[]>();
    dataset.data.forEach(row => {
      const key = formatValue(row[xAxis] || 'Unknown');
      const val = Number(row[yAxis]);
      if (!isNaN(val)) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(val);
      }
    });

    let result = Array.from(groups.entries());
    const limit = parseInt(dataLimit, 10);
    if (limit > 0) result = result.slice(0, limit);

    return result.map(([name, vals]) => {
      vals.sort((a, b) => a - b);
      const q1 = vals[Math.floor(vals.length * 0.25)];
      const median = vals[Math.floor(vals.length * 0.5)];
      const q3 = vals[Math.floor(vals.length * 0.75)];
      const min = vals[0];
      const max = vals[vals.length - 1];
      const iqr = q3 - q1;
      return { name, min, q1, median, q3, max, iqr, low: Math.max(min, q1 - 1.5 * iqr), high: Math.min(max, q3 + 1.5 * iqr) };
    });
  }, [chartType, dataset, xAxis, yAxis]);

  // Generic Grouped Data (for Clustered, Stacked, Parallel, etc)
  const groupedData = useMemo(() => {
    const supportedTypes = [
      'bar', 'horizontal_bar', 'line', 'area', 'scatter', 'radar', 'stacked_area_100',
      'clustered_bar', 'stacked_bar', '100_stacked_bar', 'butterfly', 'marimekko', 'parallel', 'bullet', 'slopegraph'
    ];
    if (!supportedTypes.includes(chartType) || !dataset || !xAxis || !yAxis || !groupBy) {
      return { categories: [] as string[], groups: [] as string[], matrix: [] as any[] };
    }
    const xSet = new Set<string>();
    const gSet = new Set<string>();
    const map = new Map<string, number>();

    dataset.data.forEach(row => {
      const x = formatValue(row[xAxis] || 'Unknown');
      const g = formatValue(row[groupBy] || 'Unknown');
      const v = Number(row[yAxis]) || 0;
      xSet.add(x); gSet.add(g);
      const key = `${x}__${g}`;
      map.set(key, (map.get(key) || 0) + v);
    });

    let categories = Array.from(xSet);
    const groups = Array.from(gSet);

    let matrix = categories.map(x => {
      const obj: any = { name: x };
      let total = 0;
      groups.forEach(g => {
        const val = map.get(`${x}__${g}`) || 0;
        obj[g] = val;
        total += val;
      });
      obj.total = total;
      return obj;
    });

    if (sortOrder === 'asc') matrix.sort((a, b) => a.total - b.total);
    else if (sortOrder === 'desc') matrix.sort((a, b) => b.total - a.total);

    const limit = parseInt(dataLimit, 10);
    if (limit > 0) matrix = matrix.slice(0, limit);
    categories = matrix.map(m => m.name);

    return { categories, groups, matrix };
  }, [chartType, dataset, xAxis, yAxis, groupBy, sortOrder, dataLimit]);

  const renderChart = () => {
    if (!dataset?.data) return <EmptyChart />;

    if (chartType === 'pivot_table') {
      if (!dataset.data || dataset.data.length === 0) return <EmptyChart msg="No data for Pivot Table." />;
      
      const rowField = xAxis;
      const colField = groupBy;
      const [aggFunc, valueField] = (yAxis || '').split(':');
      
      if (!rowField || !valueField) return <EmptyChart msg="Pivot Table requires Row and Value fields." />;

      // Grouping logic
      const pivotData: Record<string, Record<string, number[]>> = {};
      const colSet = new Set<string>();

      dataset.data.forEach((row: any) => {
        const rVal = formatValue(row[rowField] || 'Unknown');
        const cVal = colField ? formatValue(row[colField] || 'Unknown') : 'Total';
        const vVal = Number(row[valueField]) || 0;

        if (!pivotData[rVal]) pivotData[rVal] = {};
        if (!pivotData[rVal][cVal]) pivotData[rVal][cVal] = [];
        
        pivotData[rVal][cVal].push(vVal);
        if (colField) colSet.add(cVal);
      });

      const cols = colField ? Array.from(colSet).sort() : ['Total'];
      const rows = Object.keys(pivotData).sort();

      const getAgg = (vals: number[]) => {
        if (!vals || vals.length === 0) return null;
        const sum = vals.reduce((a, b) => a + b, 0);
        switch (aggFunc) {
          case 'sum': return sum;
          case 'avg': return sum / vals.length;
          case 'min': return Math.min(...vals);
          case 'max': return Math.max(...vals);
          case 'count': return vals.length;
          default: return sum;
        }
      };

      const formatVal = (val: number | null) => {
        if (val === null) return '-';
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val);
      };

      return (
        <div className="w-full h-full overflow-auto text-sm">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-muted z-10">
              <tr>
                <th className="p-2 border border-border text-left font-semibold">{rowField}</th>
                {cols.map(c => (
                  <th key={c} className="p-2 border border-border text-right font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r} className="hover:bg-muted/50">
                  <td className="p-2 border border-border font-medium">{r}</td>
                  {cols.map(c => {
                    const vals = pivotData[r]?.[c] || [];
                    const agg = getAgg(vals);
                    return (
                      <td key={c} className="p-2 border border-border text-right text-muted-foreground">
                        {formatVal(agg)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Removed redundant and broken heatmap/boxplot blocks to use main switch instead.

    if (chartType === 'stat') {
      if (!dataset || !yAxis) return <EmptyChart msg="Pilih Dataset dan Y-Axis untuk menghitung KPI/Stat" />;
      const sum = dataset.data.map((r: any) => Number(r[yAxis])).filter((n: any) => !isNaN(n)).reduce((a: number, b: number) => a + b, 0) || 0;
      const count = dataset.data.map((r: any) => Number(r[yAxis])).filter((n: any) => !isNaN(n)).length || 0;
      const avg = count > 0 ? sum / count : 0;
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <p className="text-5xl font-bold text-primary">{sum.toLocaleString()}</p>
          <p className="text-base text-muted-foreground mt-2">Sum of {yAxis}</p>
          <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
            <span>Count: {count.toLocaleString()}</span>
            <span>Avg: {avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      );
    }

    if (chartType === 'gauge') {
      if (!dataset || !yAxis) return <EmptyChart msg="Pilih Dataset dan Y-Axis untuk melihat Gauge" />;
      const sum = dataset.data.map((r: any) => Number(r[yAxis])).filter((n: any) => !isNaN(n)).reduce((a: number, b: number) => a + b, 0) || 0;
      const gaugeMax = sum > 0 ? Math.pow(10, Math.ceil(Math.log10(sum))) : 100;
      const option = {
        backgroundColor: 'transparent',
        tooltip: { formatter: '{a} <br/>{b} : {c}' },
        series: [{
          name: chartTitle || 'KPI',
          type: 'gauge',
          max: gaugeMax,
          progress: { show: true, width: 18, itemStyle: { color: '#0ea5e9' } },
          axisLine: { lineStyle: { width: 18, color: [[1, '#334155']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: { valueAnimation: true, fontSize: 30, color: '#f8fafc', formatter: '{value}' },
          data: [{ value: sum, name: yAxis }]
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'sunburst') {
      if (!dataset || !xAxis || !groupBy || !yAxis) return <EmptyChart msg="Pilih Dataset, X-Axis, Y-Axis, dan Group By untuk Sunburst" />;
      const groups = new Map<string, Map<string, number>>();
      dataset.data.forEach((row: any) => {
        const parent = formatValue(row[xAxis] || 'Unknown');
        const child = formatValue(row[groupBy] || 'Unknown');
        const val = Number(row[yAxis]) || 0;
        if (!groups.has(parent)) groups.set(parent, new Map());
        const childMap = groups.get(parent)!;
        childMap.set(child, (childMap.get(child) || 0) + val);
      });
      const sunburstData = Array.from(groups.entries()).map(([parentName, childMap]) => ({
        name: parentName,
        children: Array.from(childMap.entries()).map(([childName, val]) => ({ name: childName, value: val }))
      }));
      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', backgroundColor: '#0f172a', borderColor: '#334155', textStyle: { color: '#f8fafc' }, borderRadius: 8 },
        series: [{ type: 'sunburst', data: sunburstData, radius: [0, '90%'], itemStyle: { borderRadius: 4, borderWidth: 2, borderColor: '#0f172a' }, label: { show: false } }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'sankey') {
      if (!dataset || !xAxis || !groupBy || !yAxis) return <EmptyChart msg="Pilih Dataset, X-Axis, Y-Axis, dan Group By untuk Sankey" />;
      const nodesSet = new Set<string>();
      const linksMap = new Map<string, number>();
      dataset.data.forEach((row: any) => {
        const source = formatValue(row[xAxis] || 'Unknown');
        const target = formatValue(row[groupBy] || 'Unknown');
        const val = Number(row[yAxis]) || 0;
        nodesSet.add(source);
        nodesSet.add(target);
        const key = `${source}->${target}`;
        linksMap.set(key, (linksMap.get(key) || 0) + val);
      });
      const sankeyData = {
        nodes: Array.from(nodesSet).map(name => ({ name })),
        links: Array.from(linksMap.entries()).map(([key, value]) => { const [source, target] = key.split('->'); return { source, target, value }; })
      };
      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', backgroundColor: '#0f172a', borderColor: '#334155', textStyle: { color: '#f8fafc' }, borderRadius: 8 },
        series: [{ type: 'sankey', data: sankeyData.nodes, links: sankeyData.links, emphasis: { focus: 'adjacency' }, nodeAlign: 'justify', lineStyle: { color: 'source', curveness: 0.5 }, itemStyle: { borderColor: '#0f172a', borderWidth: 1 } }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'combo') {
      if (!dataset || !xAxis || !yAxis) return <EmptyChart msg="Pilih Dataset, X-Axis, dan Y-Axis (serta opsional Group By) untuk Combo Chart" />;
      const agg = new Map<string, { bar: number, line: number }>();
      dataset.data.forEach((row: any) => {
        const key = formatValue(row[xAxis] || 'Unknown');
        const barVal = Number(row[yAxis]) || 0;
        const lineVal = groupBy ? (Number(row[groupBy]) || 0) : 0;
        if (!agg.has(key)) agg.set(key, { bar: 0, line: 0 });
        const current = agg.get(key)!;
        current.bar += barVal;
        current.line += lineVal;
      });

      let result = Array.from(agg.entries()).map(([name, vals]) => ({ name, barValue: vals.bar, lineValue: vals.line }));
      const limit = parseInt(dataLimit, 10);
      if (limit > 0) result = result.slice(0, limit);

      const comboData = result;
      const axisLabelStyle = { color: '#9ca3af', fontSize: 10 };
      const splitLineStyle = { lineStyle: { color: '#374151', type: 'dashed' } };
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 30, left: 50, containLabel: true },
        tooltip: { trigger: 'axis', backgroundColor: '#0f172a', borderColor: '#334155', textStyle: { color: '#f8fafc' }, borderRadius: 8, axisPointer: { type: 'shadow' } },
        xAxis: { type: 'category', data: comboData.map(d => d.name), axisLabel: { ...axisLabelStyle, interval: 0, rotate: comboData.length > 5 ? 45 : 0 } },
        yAxis: [
          { type: 'value', name: yAxis, axisLabel: axisLabelStyle, splitLine: splitLineStyle },
          { type: 'value', name: groupBy || '', axisLabel: axisLabelStyle, splitLine: { show: false } }
        ],
        series: [
          { name: yAxis, type: 'bar', data: comboData.map((d, i) => ({ value: d.barValue, name: d.name, itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [3, 3, 0, 0] } })) },
          { name: groupBy || 'Secondary', type: 'line', yAxisIndex: 1, data: comboData.map(d => ({ value: d.lineValue, name: d.name })), itemStyle: { color: '#ef4444' }, lineStyle: { width: 3 }, symbolSize: 6 }
        ]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (['clustered_bar', 'stacked_bar', '100_stacked_bar', 'likert'].includes(chartType)) {
      if (!groupedData.categories.length) return <EmptyChart msg={`Pilih Dataset, X-Axis, Y-Axis, dan Group By untuk ${chartType}`} />;
      
      const isStacked = chartType === 'stacked_bar' || chartType === '100_stacked_bar' || chartType === 'likert';
      const is100 = chartType === '100_stacked_bar' || chartType === 'likert';
      const isHorizontal = chartType === 'likert';

      const series = groupedData.groups.map((g, i) => ({
        name: g,
        type: 'bar',
        stack: isStacked ? 'total' : undefined,
        data: groupedData.matrix.map(row => {
          let val = row[g] || 0;
          if (is100 && row.total > 0) val = (val / row.total) * 100;
          return val;
        }),
        itemStyle: { color: COLORS[i % COLORS.length] },
      }));

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: is100 ? (params: any) => {
           let s = params[0].name + '<br/>';
           params.forEach((p: any) => { s += `${p.marker} ${p.seriesName}: ${p.value.toFixed(1)}%<br/>`; });
           return s;
        } : undefined },
        legend: { data: groupedData.groups, textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: isHorizontal ? { type: 'value', axisLabel: { color: '#9ca3af', formatter: is100 ? '{value}%' : '{value}' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } } : { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af', interval: 0, rotate: groupedData.categories.length > 5 ? 45 : 0 } },
        yAxis: isHorizontal ? { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af', interval: 0 } } : { type: 'value', axisLabel: { color: '#9ca3af', formatter: is100 ? '{value}%' : '{value}' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'pareto') {
      if (!chartData.length) return <EmptyChart />;
      const sorted = [...chartData].sort((a, b) => b.value - a.value);
      const total = sorted.reduce((sum, d) => sum + d.value, 0);
      let running = 0;
      const paretoData = sorted.map(d => {
        running += d.value;
        return { name: d.name, bar: d.value, line: total > 0 ? (running / total) * 100 : 0 };
      });

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 50, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: { type: 'category', data: paretoData.map(d => d.name), axisLabel: { color: '#9ca3af', interval: 0, rotate: 45 } },
        yAxis: [
          { type: 'value', name: yAxis, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
          { type: 'value', name: 'Cumulative %', min: 0, max: 100, axisLabel: { color: '#9ca3af', formatter: '{value}%' }, splitLine: { show: false } }
        ],
        series: [
          { name: yAxis, type: 'bar', data: paretoData.map(d => d.bar), itemStyle: { color: COLORS[0], borderRadius: [3, 3, 0, 0] } },
          { name: 'Cumulative %', type: 'line', yAxisIndex: 1, data: paretoData.map(d => d.line), itemStyle: { color: '#ef4444' }, lineStyle: { width: 3 }, symbolSize: 6 }
        ]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'lollipop') {
      if (!chartData.length) return <EmptyChart />;
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: { type: 'category', data: chartData.map(d => d.name), axisLabel: { color: '#9ca3af', interval: 0, rotate: 45 } },
        yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [
          { type: 'bar', name: yAxis, data: chartData.map(d => d.value), barWidth: 4, itemStyle: { color: COLORS[1], borderRadius: 2 } },
          { type: 'scatter', name: yAxis, data: chartData.map(d => d.value), symbolSize: 16, itemStyle: { color: COLORS[0] } }
        ]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'bullet') {
      if (!groupedData.categories.length || groupedData.groups.length < 2) 
        return <EmptyChart msg="Bullet Chart requires a secondary column (Group By) as the Target metric." />;
      const actualGroup = groupedData.groups[0];
      const targetGroup = groupedData.groups[1];
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 80, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { data: [targetGroup, actualGroup], textStyle: { color: '#9ca3af' }, bottom: 0 },
        yAxis: { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af' } },
        xAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [
          { name: targetGroup, type: 'bar', barWidth: '60%', data: groupedData.matrix.map(row => row[targetGroup] || 0), itemStyle: { color: '#334155' }, animationDuration: 1000 },
          { name: actualGroup, type: 'bar', barGap: '-80%', barWidth: '30%', data: groupedData.matrix.map(row => row[actualGroup] || 0), itemStyle: { color: COLORS[0] }, animationDuration: 1500 }
        ]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (['diverging_bar', 'butterfly'].includes(chartType)) {
      if (!groupedData.categories.length || groupedData.groups.length < 2) 
        return <EmptyChart msg="Diverging/Butterfly Chart requires Group By with at least 2 groups." />;
      const g1 = groupedData.groups[0];
      const g2 = groupedData.groups[1];
      const isButterfly = chartType === 'butterfly';
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: isButterfly ? '8%' : 50, containLabel: !isButterfly },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => {
           let s = params[0].name + '<br/>';
           params.forEach((p: any) => { s += `${p.marker} ${p.seriesName}: ${Math.abs(p.value)}<br/>`; });
           return s;
        } },
        legend: { data: [g1, g2], textStyle: { color: '#9ca3af' }, bottom: 0 },
        yAxis: isButterfly ? [
          { type: 'category', data: groupedData.categories, position: 'left', axisLabel: { show: false }, axisTick: { show: false } },
          { type: 'category', data: groupedData.categories, position: 'center', axisLabel: { color: '#f8fafc', fontWeight: 'bold' }, axisTick: { show: false }, axisLine: { show: false } }
        ] : { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af' } },
        xAxis: { type: 'value', axisLabel: { color: '#9ca3af', formatter: (v: number) => Math.abs(v) }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [
          { name: g1, type: 'bar', stack: 'total', data: groupedData.matrix.map(row => Math.abs(row[g1]||0)), itemStyle: { color: COLORS[0] } },
          { name: g2, type: 'bar', stack: 'total', data: groupedData.matrix.map(row => -Math.abs(row[g2]||0)), itemStyle: { color: COLORS[1] } }
        ]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'parallel') {
      const pCols = numericColumns.slice(0, 7); // Max 7 columns for readability
      if (pCols.length < 2) return <EmptyChart msg="Parallel chart needs at least 2 numeric columns in dataset." />;
      
      const option = {
        backgroundColor: 'transparent',
        parallelAxis: pCols.map((c, i) => ({ dim: i, name: c.name, nameTextStyle: { color: '#9ca3af', fontSize: 10 }, axisLabel: { color: '#9ca3af', fontSize: 10 } })),
        tooltip: { trigger: 'item' },
        parallel: { left: '5%', right: '10%', bottom: 30, top: 40 },
        series: {
          type: 'parallel',
          lineStyle: { width: 1.5, opacity: 0.4, color: COLORS[0] },
          data: dataset.data.slice(0, 200).map((row: any) => pCols.map(c => Number(row[c.name]) || 0)) 
        }
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'cleveland_dot') {
      if (!groupedData.categories.length || groupedData.groups.length < 2) 
        return <EmptyChart msg="Cleveland Dot Plot requires Group By with at least 2 groups." />;
      const g1 = groupedData.groups[0];
      const g2 = groupedData.groups[1];
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 80, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { data: [g1, g2], textStyle: { color: '#9ca3af' }, bottom: 0 },
        yAxis: { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af' } },
        xAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [
          { type: 'custom', name: 'Range', renderItem: (params: any, api: any) => {
              const categoryIndex = api.value(0);
              const val1 = api.value(1);
              const val2 = api.value(2);
              const pt1 = api.coord([val1, categoryIndex]);
              const pt2 = api.coord([val2, categoryIndex]);
              return { type: 'line', shape: { x1: pt1[0], y1: pt1[1], x2: pt2[0], y2: pt2[1] }, style: { stroke: '#4b5563', lineWidth: 2 } };
            },
            data: groupedData.matrix.map((row, i) => [i, row[g1]||0, row[g2]||0]),
            z: 1
          },
          { name: g1, type: 'scatter', symbolSize: 12, data: groupedData.matrix.map(row => row[g1]||0), itemStyle: { color: COLORS[0] }, z: 2 },
          { name: g2, type: 'scatter', symbolSize: 12, data: groupedData.matrix.map(row => row[g2]||0), itemStyle: { color: COLORS[1] }, z: 2 }
        ]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (['slope', 'bump'].includes(chartType)) {
      if (!groupedData.categories.length) return <EmptyChart msg="Slope/Bump Chart requires X-Axis (Time) and Group By (Categories)." />;
      const isBump = chartType === 'bump';
      
      const ranksByCat = new Map<string, number[]>();
      if (isBump) {
        groupedData.categories.forEach(cat => {
          const row = groupedData.matrix.find(r => r.name === cat);
          if (!row) return;
          const rankedGroups = [...groupedData.groups].sort((a, b) => (row[b]||0) - (row[a]||0));
          rankedGroups.forEach((g, idx) => {
            if (!ranksByCat.has(g)) ranksByCat.set(g, []);
            ranksByCat.get(g)!.push(idx + 1);
          });
        });
      }

      const series = groupedData.groups.map((g, i) => ({
        name: g,
        type: 'line',
        smooth: isBump,
        symbolSize: 8,
        lineStyle: { width: 3 },
        data: isBump ? ranksByCat.get(g) : groupedData.matrix.map(row => row[g] || 0),
        itemStyle: { color: COLORS[i % COLORS.length] },
      }));

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: groupedData.groups, textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af', interval: 0 }, splitLine: { show: true, lineStyle: { color: '#374151', type: 'dashed' } } },
        yAxis: { type: 'value', inverse: isBump, axisLabel: { color: '#9ca3af' }, splitLine: { show: false } },
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'marimekko' || chartType === 'mekko') {
      if (!groupedData.categories.length || groupedData.groups.length < 2) 
        return <EmptyChart msg="Mekko/Marimekko Chart requires X-Axis (Categories) and Group By (Categories)." />;
      
      const totalValue = groupedData.matrix.reduce((sum, row) => sum + row.total, 0);
      if (totalValue === 0) return <EmptyChart />;

      const data: any[] = [];
      let currentX = 0;
      
      groupedData.matrix.forEach(row => {
        const xWidth = row.total;
        if (xWidth === 0) return;
        let currentY = 0;
        
        groupedData.groups.forEach((g, i) => {
          const val = row[g] || 0;
          if (val === 0) return;
          
          const yPct = (val / row.total) * 100;
          
          data.push({
            name: `${row.name} - ${g}`,
            value: [currentX, currentX + xWidth, currentY, currentY + yPct, val, row.name, g, xWidth, row.total],
            itemStyle: { color: COLORS[i % COLORS.length] }
          });
          currentY += yPct;
        });
        currentX += xWidth;
      });

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: {
          formatter: (params: any) => {
            const d = params.data.value;
            return `<strong>${d[5]}</strong><br/>${d[6]}: ${d[4]} (${(d[4]/d[8]*100).toFixed(1)}%)<br/>Category Width: ${(d[7]/totalValue*100).toFixed(1)}%`;
          }
        },
        xAxis: { type: 'value', max: totalValue, axisLabel: { formatter: (v: number) => (v / totalValue * 100).toFixed(0) + '%' }, splitLine: { show: false } },
        yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [{
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const x0 = api.coord([api.value(0), api.value(2)]);
            const x1 = api.coord([api.value(1), api.value(3)]);
            return {
              type: 'rect',
              shape: { x: x0[0], y: x1[1], width: x1[0] - x0[0], height: x0[1] - x1[1] },
              style: api.style({ stroke: '#1f2937', lineWidth: 1 })
            };
          },
          data
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'range_bar') {
      const rangeCols = numericColumns.slice(0, 2);
      if (rangeCols.length < 2) return <EmptyChart msg="Span/Range Bar needs at least 2 numeric columns (e.g., Start & End)." />;
      const c1 = rangeCols[0].name;
      const c2 = rangeCols[1].name;
      
      const limit = parseInt(dataLimit, 10) || 50;
      const dataSlice = dataset.data.slice(0, limit);

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params: any) => {
            const item = params[0]?.data;
            if (!item) return '';
            return `<strong>${item.name}</strong><br/>${c1}: ${item.value[1]}<br/>${c2}: ${item.value[2]}`;
          }
        },
        xAxis: { type: 'value', splitLine: { lineStyle: { color: '#374151', type: 'dashed' } }, axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'category', data: dataSlice.map((row: any, i: number) => formatValue(row[xAxis] || i)), axisLabel: { color: '#9ca3af' } },
        series: [{
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const categoryIndex = api.value(0);
            const start = api.coord([api.value(1), categoryIndex]);
            const end = api.coord([api.value(2), categoryIndex]);
            const height = api.size([0, 1])[1] * 0.6;
            return {
              type: 'rect',
              shape: { x: Math.min(start[0], end[0]), y: start[1] - height / 2, width: Math.abs(end[0] - start[0]), height },
              style: api.style()
            };
          },
          itemStyle: { color: COLORS[0], borderRadius: 4 },
          data: dataSlice.map((row: any, i: number) => ({
            name: formatValue(row[xAxis] || i),
            value: [i, Number(row[c1]) || 0, Number(row[c2]) || 0]
          }))
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (['multi_line', 'smooth_step_line', 'stacked_area'].includes(chartType as string)) {
      if (!groupedData.categories.length) return <EmptyChart msg="Chart requires X-Axis (Time) and Group By (Categories)." />;
      
      const isSmooth = chartType === 'smooth_step_line';
      const isArea = chartType === 'stacked_area';
      
      const series = groupedData.groups.map((g, i) => ({
        name: g,
        type: 'line',
        smooth: isSmooth ? undefined : undefined,
        step: isSmooth ? 'start' : undefined,
        areaStyle: isArea ? {} : undefined,
        stack: isArea ? 'total' : undefined,
        symbolSize: isArea ? 0 : 6,
        data: groupedData.matrix.map(row => row[g] || 0),
        itemStyle: { color: COLORS[i % COLORS.length] },
      }));

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: groupedData.groups, textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: { type: 'category', boundaryGap: false, data: groupedData.categories, axisLabel: { color: '#9ca3af' }, splitLine: { show: true, lineStyle: { color: '#374151', type: 'dashed' } } },
        yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'stream_graph') {
      if (!groupedData.categories.length || !groupedData.groups.length) return <EmptyChart msg="Stream Graph requires X-Axis and Group By." />;
      const rawData: any[] = [];
      groupedData.matrix.forEach(row => {
        groupedData.groups.forEach(g => {
          rawData.push([row.name, row[g] || 0, g]);
        });
      });
      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: 'rgba(0,0,0,0.2)', width: 1, type: 'solid' } } },
        legend: { data: groupedData.groups, textStyle: { color: '#9ca3af' }, bottom: 0 },
        singleAxis: {
          top: 50, bottom: 50,
          axisTick: {}, axisLabel: { color: '#9ca3af' },
          type: 'category', data: groupedData.categories,
          splitLine: { show: true, lineStyle: { type: 'dashed', color: '#374151' } }
        },
        series: [{
          type: 'themeRiver',
          emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 0, 0, 0.8)' } },
          data: rawData,
          color: COLORS
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'horizon') {
      if (!groupedData.categories.length) return <EmptyChart msg="Horizon Chart requires X-Axis (Time)." />;
      const valCol = numericColumns[0]?.name;
      if (!valCol) return <EmptyChart msg="Horizon Chart needs a numeric column." />;
      
      const maxVal = Math.max(...dataset.data.map((d: any) => Number(d[valCol]) || 0));
      const bands = 4;
      const bandSize = maxVal / bands || 1;
      
      const series = Array.from({length: bands}).map((_, i) => ({
        name: `Band ${i+1}`,
        type: 'line',
        areaStyle: { opacity: 0.8 },
        lineStyle: { width: 0 },
        symbol: 'none',
        step: 'start',
        data: dataset.data.slice(0, 100).map((row: any) => {
          const v = Number(row[valCol]) || 0;
          return Math.max(0, Math.min(bandSize, v - (i * bandSize)));
        }),
        itemStyle: { color: COLORS[(i + 4) % COLORS.length] } // offset colors for gradient look
      }));

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', boundaryGap: false, data: dataset.data.slice(0, 100).map((r: any) => formatValue(r[xAxis])), axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', max: bandSize, axisLabel: { color: '#9ca3af' } },
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'sparkline') {
      const valCol = numericColumns[0]?.name;
      if (!valCol) return <EmptyChart msg="Sparkline needs a numeric column." />;
      const data = dataset.data.slice(0, 100).map((r: any) => Number(r[valCol]) || 0);
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 10, right: 10, bottom: 10, left: 10 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
        yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
        series: [{ type: 'line', data, showSymbol: false, lineStyle: { width: 3, color: COLORS[0] }, areaStyle: { color: 'rgba(45, 212, 191, 0.2)' } }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'cycle_plot') {
      if (!groupedData.categories.length || !groupedData.groups.length) return <EmptyChart msg="Cycle Plot requires X-Axis and Group By." />;
      const series = groupedData.groups.map((g, i) => ({
        name: g,
        type: 'line',
        data: groupedData.matrix.map(row => ({ name: row.name, value: row[g] || 0 })),
        itemStyle: { color: COLORS[i % COLORS.length] },
      }));
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: groupedData.groups, textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', axisLabel: { color: '#9ca3af' } },
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'cumulative_flow') {
      if (!groupedData.categories.length) return <EmptyChart msg="Requires X-Axis (Time)." />;
      const groups = groupedData.groups.length ? groupedData.groups : numericColumns.slice(0, 3).map(c => c.name);
      
      const series = groups.map((g, i) => {
        let sum = 0;
        return {
          name: g,
          type: 'line',
          areaStyle: {},
          stack: 'total',
          data: groupedData.matrix.map(row => {
            sum += (row[g] || 0);
            return sum;
          }),
          itemStyle: { color: COLORS[i % COLORS.length] }
        };
      });

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: groups, textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: { type: 'category', boundaryGap: false, data: groupedData.categories, axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', axisLabel: { color: '#9ca3af' } },
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'burn_down' || chartType === 'burn_up') {
      const valCol = numericColumns[0]?.name;
      if (!valCol) return <EmptyChart msg="Requires a numeric column." />;
      const limit = parseInt(dataLimit, 10) || 50;
      const dataSlice = dataset.data.slice(0, limit);
      
      const isDown = chartType === 'burn_down';
      const actualData = dataSlice.map((r: any) => Number(r[valCol]) || 0);
      const maxVal = Math.max(...actualData);
      
      const idealData = dataSlice.map((_, i) => {
        const progress = i / Math.max(1, dataSlice.length - 1);
        return isDown ? maxVal * (1 - Math.pow(progress, 0.8)) : maxVal * Math.pow(progress, 0.8);
      });

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: ['Actual', 'Ideal'], textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: { type: 'category', data: dataSlice.map((r: any) => formatValue(r[xAxis])), axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', axisLabel: { color: '#9ca3af' } },
        series: [
          { name: 'Actual', type: 'line', data: actualData, itemStyle: { color: COLORS[0] }, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3 } },
          { name: 'Ideal', type: 'line', data: idealData, itemStyle: { color: '#9ca3af' }, lineStyle: { type: 'dashed', width: 2 }, symbol: 'none' }
        ]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'combo_dual') {
      if (!groupedData.categories.length) return <EmptyChart msg="Requires X-Axis (Time)." />;
      const groups = groupedData.groups.length ? groupedData.groups : numericColumns.slice(0, 2).map(c => c.name);
      if (groups.length < 2) return <EmptyChart msg="Combo Dual Axis needs at least 2 metrics/groups." />;
      
      const series = [
        {
          name: groups[0],
          type: 'bar',
          data: groupedData.matrix.map(row => row[groups[0]] || 0),
          itemStyle: { color: COLORS[0], borderRadius: [4, 4, 0, 0] }
        },
        {
          name: groups[1],
          type: 'line',
          yAxisIndex: 1, // Use second y-axis
          data: groupedData.matrix.map(row => row[groups[1]] || 0),
          itemStyle: { color: COLORS[1] },
          symbolSize: 8,
          lineStyle: { width: 3 }
        }
      ];

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 50, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        legend: { data: [groups[0], groups[1]], textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: { type: 'category', data: groupedData.categories, axisLabel: { color: '#9ca3af' } },
        yAxis: [
          { type: 'value', name: groups[0], position: 'left', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
          { type: 'value', name: groups[1], position: 'right', axisLabel: { color: '#9ca3af' }, splitLine: { show: false } }
        ],
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'candlestick') {
      if (!groupedData.categories.length || numericColumns.length < 4) 
        return <EmptyChart msg="Candlestick needs X-Axis and at least 4 numeric columns (Open, Close, Low, High)." />;
      
      const [colOpen, colClose, colLow, colHigh] = numericColumns.slice(0, 4).map(c => c.name);
      
      // Echarts expects [open, close, lowest, highest]
      const data = dataset.data.slice(0, 100).map((row: any) => [
        Number(row[colOpen]) || 0,
        Number(row[colClose]) || 0,
        Number(row[colLow]) || 0,
        Number(row[colHigh]) || 0
      ]);

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        xAxis: { type: 'category', data: dataset.data.slice(0, 100).map((r: any) => formatValue(r[xAxis])), axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', scale: true, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [{
          type: 'candlestick',
          data,
          itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' }
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'kagi') { // Visual approximation using step line
      const valCol = numericColumns[0]?.name;
      if (!valCol) return <EmptyChart msg="Requires a numeric column." />;
      const data = dataset.data.slice(0, 100).map((r: any) => Number(r[valCol]) || 0);
      
      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: dataset.data.slice(0, 100).map((r: any) => formatValue(r[xAxis])), axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', scale: true, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [{ type: 'line', step: 'middle', data, itemStyle: { color: COLORS[0] }, lineStyle: { width: 3 }, symbol: 'none' }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'renko') { // Visual approximation using custom rects
      const valCol = numericColumns[0]?.name;
      if (!valCol) return <EmptyChart msg="Requires a numeric column." />;
      
      const data = dataset.data.slice(0, 100).map((r: any) => Number(r[valCol]) || 0);
      let lastVal = data[0] || 0;
      const parsedData = data.map((v: number, i: number) => {
        const item = [i, lastVal, v];
        lastVal = v;
        return item;
      });

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: dataset.data.slice(0, 100).map((r: any) => formatValue(r[xAxis])), axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', scale: true, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [{
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const x = api.coord([api.value(0), 0])[0];
            const y0 = api.coord([0, api.value(1)])[1];
            const y1 = api.coord([0, api.value(2)])[1];
            const isUp = api.value(2) >= api.value(1);
            return {
              type: 'rect',
              shape: { x: x - 5, y: Math.min(y0, y1), width: 10, height: Math.abs(y1 - y0) || 2 },
              style: api.style({ fill: isUp ? 'transparent' : '#1f2937', stroke: isUp ? '#10b981' : '#ef4444', lineWidth: 2 })
            };
          },
          data: parsedData
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'point_figure') { // Visual approximation using scatter with custom symbols (X or O)
      const valCol = numericColumns[0]?.name;
      if (!valCol) return <EmptyChart msg="Requires a numeric column." />;
      
      const data = dataset.data.slice(0, 100).map((r: any) => Number(r[valCol]) || 0);
      let lastVal = data[0] || 0;
      
      const scatterData = data.map((v: number, i: number) => {
        const isUp = v >= lastVal;
        lastVal = v;
        return {
          value: [i, v],
          symbolSize: 12,
          symbol: isUp ? 'path://M10,10 L90,90 M10,90 L90,10' : 'circle', // X or O
          itemStyle: { color: isUp ? '#10b981' : 'transparent', borderColor: isUp ? '#10b981' : '#ef4444', borderWidth: 2 }
        };
      });

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { formatter: (p: any) => `Value: ${p.value[1]}` },
        xAxis: { type: 'category', data: dataset.data.slice(0, 100).map((r: any) => formatValue(r[xAxis])), axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', scale: true, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series: [{ type: 'scatter', data: scatterData }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (['calendar', 'gantt', 'streamgraph', 'connected_scatter', 'slopegraph', 'control_chart'].includes(chartType as string)) {
      if (!chartData.length) return <EmptyChart />;
      switch (chartType) {
        case 'calendar': {
          const option = {
            backgroundColor: 'transparent',
            tooltip: {},
            visualMap: { min: 0, max: 1000, calculable: true, orient: 'horizontal', left: 'center', bottom: '15%' },
            calendar: { top: 60, left: 30, right: 30, cellSize: ['auto', 20], range: '2024', itemStyle: { borderWidth: 0.5 } },
            series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: dataset.data.slice(0, 365).map((r:any) => [formatValue(r[xAxis]), Number(r[yAxis])||0]) }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'gantt': {
           return <EmptyChart msg="Gantt Chart requires start and end date fields." />;
        }
        case 'streamgraph': {
           if (!groupBy) return <EmptyChart msg="Streamgraph requires a Group By field." />;
           const option = {
             backgroundColor: 'transparent',
             tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: 'rgba(0,0,0,0.2)', width: 1, type: 'solid' } } },
             singleAxis: { top: 50, bottom: 50, axisTick: {}, axisLabel: {}, type: 'time', axisPointer: { animation: true, label: { show: true } }, splitLine: { show: true, lineStyle: { type: 'dashed', opacity: 0.2 } } },
             series: [{ type: 'themeRiver', emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 0, 0, 0.8)' } }, data: dataset.data.map((r:any) => [formatValue(r[xAxis]), Number(r[yAxis])||0, formatValue(r[groupBy])]) }]
           };
           return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'connected_scatter': {
           const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item' },
            xAxis: { type: 'value', name: xAxis, axisLabel: { color: '#9ca3af' } },
            yAxis: { type: 'value', name: yAxis, axisLabel: { color: '#9ca3af' } },
            series: [{ type: 'line', symbolSize: 8, data: dataset.data.map((r:any) => [Number(r[xAxis])||0, Number(r[yAxis])||0]), itemStyle: { color: COLORS[0] } }]
           };
           return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'slopegraph': {
           if (!groupBy) return <EmptyChart msg="Slopegraph requires a Group By field." />;
           const option = {
              backgroundColor: 'transparent',
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'category', data: groupedData.categories },
              yAxis: { type: 'value' },
              series: groupedData.groups.map((g, i) => ({ type: 'line', name: g, data: groupedData.matrix.map(row => row[g] || 0), itemStyle: { color: COLORS[i % COLORS.length] } }))
           };
           return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'control_chart': {
           const values = chartData.map(d => d.value);
           const mean = values.reduce((a, b) => a + b, 0) / values.length;
           const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (values.length - 1));
           const upperLimit = mean + (3 * stdDev);
           const lowerLimit = mean - (3 * stdDev);
           const option = {
             backgroundColor: 'transparent',
             tooltip: { trigger: 'axis' },
             xAxis: { type: 'category', data: chartData.map(d => d.name) },
             yAxis: { type: 'value' },
             series: [
               { type: 'line', data: values, itemStyle: { color: COLORS[0] } },
               { type: 'line', data: values.map(() => upperLimit), lineStyle: { type: 'dashed', color: 'red' }, symbol: 'none', name: 'UCL' },
               { type: 'line', data: values.map(() => lowerLimit), lineStyle: { type: 'dashed', color: 'red' }, symbol: 'none', name: 'LCL' },
               { type: 'line', data: values.map(() => mean), lineStyle: { type: 'solid', color: 'green' }, symbol: 'none', name: 'Mean' }
             ]
           };
           return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
      }
    }

    if (['wordcloud', 'wordtree', 'parallel_sets', 'upset_plot', 'lollipop'].includes(chartType as string)) {
      if (!chartData.length) return <EmptyChart />;
      switch(chartType) {
         case 'wordcloud': {
            const option = {
               backgroundColor: 'transparent',
               tooltip: { show: true },
               series: [{
                 type: 'wordCloud',
                 shape: 'circle',
                 left: 'center',
                 top: 'center',
                 width: '100%',
                 height: '100%',
                 sizeRange: [12, 60],
                 rotationRange: [-90, 90],
                 rotationStep: 45,
                 gridSize: 8,
                 textStyle: {
                   color: function () {
                     return 'rgb(' + [
                       Math.round(Math.random() * 255),
                       Math.round(Math.random() * 255),
                       Math.round(Math.random() * 255)
                     ].join(',') + ')';
                   }
                 },
                 data: chartData.map(d => ({
                   name: String(d.name),
                   value: Number(d.value)
                 }))
               }]
            };
            return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
         }
         case 'wordtree': {
            const treeData = {
              name: xAxis || 'Root',
              children: chartData.slice(0, 50).map(d => ({
                name: String(d.name),
                value: Number(d.value)
              }))
            };
            const option = {
              backgroundColor: 'transparent',
              tooltip: { trigger: 'item', triggerOn: 'mousemove' },
              series: [
                {
                  type: 'tree',
                  data: [treeData],
                  top: '1%', left: '7%', bottom: '1%', right: '20%',
                  symbolSize: 7,
                  label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 11, color: '#9ca3af' },
                  leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
                  expandAndCollapse: true,
                  animationDuration: 550,
                  animationDurationUpdate: 750
                }
              ]
            };
            return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
         }
         case 'parallel_sets': {
            const dims = categoricalColumns.slice(0, 4).map((c, i) => ({ dim: i, name: c.name }));
            const option = {
               backgroundColor: 'transparent',
               parallelAxis: dims,
               series: { type: 'parallel', lineStyle: { width: 2, opacity: 0.5 }, data: dataset.data.slice(0, 100).map((r:any) => dims.map(d => r[d.name])) }
            };
            return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
         }
         case 'upset_plot': return <EmptyChart msg="UpSet Plot requires complex intersection calculations." />;
         case 'lollipop': {
            const option = {
               backgroundColor: 'transparent',
               tooltip: { trigger: 'axis' },
               xAxis: { type: 'category', data: chartData.map(d=>d.name), axisLabel:{color:'#9ca3af'} },
               yAxis: { type: 'value', axisLabel:{color:'#9ca3af'}, splitLine:{lineStyle:{color:'#374151', type:'dashed'}} },
               series: [
                  { type: 'scatter', symbolSize: 15, data: chartData.map(d=>d.value), itemStyle: { color: COLORS[0] }, z: 10 },
                  { type: 'bar', barWidth: 2, data: chartData.map(d=>d.value), itemStyle: { color: COLORS[0] } }
               ]
            };
            return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
         }
      }
    }

    if (['kpi_card', 'bullet', 'progress_bar'].includes(chartType as string)) {
       if (!chartData.length) return <EmptyChart />;
       switch(chartType) {
          case 'kpi_card': {
             const sum = chartData.reduce((a,b)=>a+b.value, 0);
             return (
               <div className="flex flex-col items-center justify-center h-full">
                 <h2 className="text-xl text-muted-foreground mb-4">{yAxis} (Total)</h2>
                 <p className="text-6xl font-bold text-primary">{sum.toLocaleString()}</p>
               </div>
             );
          }
          case 'bullet': return <EmptyChart msg="Bullet chart requires Target and Range configuration." />;
          case 'progress_bar': {
             const val = chartData[0]?.value || 0;
             const option = {
                backgroundColor: 'transparent',
                series: [{
                   type: 'gauge',
                   startAngle: 90, endAngle: -270,
                   pointer: { show: false },
                   progress: { show: true, overlap: false, roundCap: true, clip: false, itemStyle: { color: COLORS[0] } },
                   axisLine: { lineStyle: { width: 20 } },
                   splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
                   data: [{ value: val, name: chartData[0]?.name || '' }],
                   detail: { width: 50, height: 14, fontSize: 32, color: 'auto', formatter: '{value}' }
                }]
             };
             return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
          }
       }
    }

    if (['3d_scatter', '3d_surface', 'custom_echarts'].includes(chartType as string)) {
       return <EmptyChart msg={`${ALL_CHART_TYPES.find(c=>c.id===chartType)?.label} requires WebGL/echarts-gl or custom JSON config.`} />;
    }

    if (['choropleth_map', 'bubble_map', 'connection_map', 'cartogram', 'hexbin_map', 'geo_heatmap'].includes(chartType as string)) {
      return <EmptyChart msg={`${ALL_CHART_TYPES.find(c=>c.id===chartType)?.label} requires GeoJSON map registration and Lat/Long data.`} />;
    }

    if (['scatter', 'scatter_regression', 'bubble', 'heatmap', 'radviz', 'network', 'arc', 'hexbin', 'contour'].includes(chartType as string)) {
      if (!chartData.length) return <EmptyChart />;

      switch (chartType) {
        case 'scatter': {
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item' },
            xAxis: { type: 'value', name: xAxis, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
            yAxis: { type: 'value', name: yAxis, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
            series: [{ type: 'scatter', symbolSize: 8, data: dataset.data.slice(0, 1000).map((r:any) => [Number(r[xAxis])||0, Number(r[yAxis])||0]), itemStyle: { color: COLORS[0] } }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'scatter_regression': {
          const points = dataset.data.slice(0, 500).map((r:any) => [Number(r[xAxis])||0, Number(r[yAxis])||0]);
          let sumX=0, sumY=0, sumXY=0, sumX2=0;
          points.forEach(([x,y]) => { sumX+=x; sumY+=y; sumXY+=x*y; sumX2+=x*x; });
          const n = points.length;
          const m = n === 0 ? 0 : (n*sumXY - sumX*sumY)/(n*sumX2 - sumX*sumX || 1);
          const b = n === 0 ? 0 : (sumY - m*sumX)/n;
          const minX = Math.min(...points.map(p=>p[0]));
          const maxX = Math.max(...points.map(p=>p[0]));
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item' },
            xAxis: { type: 'value', name: xAxis, axisLabel: { color: '#9ca3af' } },
            yAxis: { type: 'value', name: yAxis, axisLabel: { color: '#9ca3af' } },
            series: [
              { type: 'scatter', symbolSize: 6, data: points, itemStyle: { color: COLORS[1] } },
              { type: 'line', data: [[minX, m*minX+b], [maxX, m*maxX+b]], lineStyle: { color: COLORS[5], width: 2, type: 'dashed' }, symbol: 'none' }
            ]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'bubble': {
          const zAxis = numericColumns.find(c => c.name !== xAxis && c.name !== yAxis)?.name || yAxis;
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item' },
            xAxis: { type: 'value', name: xAxis, axisLabel: { color: '#9ca3af' } },
            yAxis: { type: 'value', name: yAxis, axisLabel: { color: '#9ca3af' } },
            series: [{ 
              type: 'scatter', 
              data: dataset.data.slice(0, 500).map((r:any) => [Number(r[xAxis])||0, Number(r[yAxis])||0, Number(r[zAxis])||0]),
              symbolSize: (data: any) => Math.min(Math.max(data[2] / 10, 5), 50),
              itemStyle: { color: COLORS[2], opacity: 0.7 }
            }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'heatmap': {
          if (dataset.data.length === 0) return <EmptyChart />;
          const xCats = Array.from(new Set(dataset.data.map((r:any) => formatValue(r[xAxis])))).slice(0, 20);
          const yCats = Array.from(new Set(dataset.data.map((r:any) => formatValue(r[groupBy || yAxis])))).slice(0, 20);
          const zAxisName = (!groupBy || groupBy === yAxis) ? 'count' : yAxis;
          const map = new Map();
          dataset.data.forEach((r:any) => {
             const x = formatValue(r[xAxis]);
             const y = formatValue(r[groupBy || yAxis]);
             const z = zAxisName === 'count' ? 1 : (Number(r[yAxis])||0);
             if(!map.has(x)) map.set(x, new Map());
             const ym = map.get(x);
             ym.set(y, (ym.get(y)||0) + z);
          });
          const dataPoints = [];
          for(let i=0; i<xCats.length; i++) {
             for(let j=0; j<yCats.length; j++) {
                dataPoints.push([i, j, map.get(xCats[i])?.get(yCats[j]) || 0]);
             }
          }
          const option = {
            backgroundColor: 'transparent',
            tooltip: { position: 'top' },
            grid: { top: 30, bottom: 60, left: 60, right: 20 },
            xAxis: { type: 'category', data: xCats, splitArea: { show: true }, axisLabel: { color: '#9ca3af' } },
            yAxis: { type: 'category', data: yCats, splitArea: { show: true }, axisLabel: { color: '#9ca3af' } },
            visualMap: { min: 0, max: Math.max(...dataPoints.map(d=>d[2]), 1), calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', textStyle:{color:'#9ca3af'} },
            series: [{ type: 'heatmap', data: dataPoints, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } } }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'radviz': {
          return <EmptyChart msg="Radviz algorithm requires complex dimensionality reduction." />;
        }
        case 'network': {
          if (!groupBy) return <EmptyChart msg="Network Graph requires a Group By field for Source and X/Y for Target." />;
          let nodesMap = new Map();
          let links: any[] = [];
          dataset.data.slice(0, 200).forEach((r:any) => {
            const src = formatValue(r[groupBy]);
            const tgt = formatValue(r[xAxis]);
            if(!nodesMap.has(src)) nodesMap.set(src, { name: src, symbolSize: 20 });
            if(!nodesMap.has(tgt)) nodesMap.set(tgt, { name: tgt, symbolSize: 10 });
            links.push({ source: src, target: tgt, value: Number(r[yAxis])||1 });
          });
          const option = {
            backgroundColor: 'transparent',
            tooltip: {},
            series: [{
              type: 'graph', layout: 'force',
              data: Array.from(nodesMap.values()),
              links: links,
              roam: true,
              label: { show: true, position: 'right', color: '#9ca3af' },
              force: { repulsion: 100 },
              lineStyle: { color: 'source', curveness: 0.3 }
            }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'arc': {
          return <EmptyChart msg="Arc Diagram requires extensive layout calculation. Consider Network Graph." />;
        }
        case 'hexbin': {
          return <EmptyChart msg="Hexbin requires custom svg shapes or ECharts custom series. Scatter plot available." />;
        }
        case 'contour': {
           return <EmptyChart msg="Contour requires 2D kernel density estimation." />;
        }
      }
    }

    if (['histogram', 'density_plot', 'box_plot', 'violin_plot', 'scatter_matrix', 'bee_swarm', 'joyplot', 'dot_plot', 'qq_plot', 'ecdf'].includes(chartType as string)) {
      if (!chartData.length) return <EmptyChart />;

      switch (chartType) {
        case 'histogram': {
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            xAxis: { type: 'category', data: chartData.map(d => d.name), axisLabel: { color: '#9ca3af' } },
            yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
            series: [{ type: 'bar', barCategoryGap: '0%', data: chartData.map(d => d.value), itemStyle: { color: COLORS[0], borderColor: '#1f2937' } }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'density_plot': {
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', boundaryGap: false, data: chartData.map(d => d.name), axisLabel: { color: '#9ca3af' } },
            yAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
            series: [{ type: 'line', smooth: 0.5, areaStyle: { opacity: 0.5 }, data: chartData.map(d => d.value), itemStyle: { color: COLORS[1] }, symbol: 'none' }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'box_plot': {
          if (!groupBy) {
             const values = chartData.map(d => d.value).sort((a,b)=>a-b);
             const getQ = (arr: number[], q: number) => {
               const pos = (arr.length - 1) * q;
               const base = Math.floor(pos);
               const rest = pos - base;
               if ((arr[base + 1] !== undefined)) return arr[base] + rest * (arr[base + 1] - arr[base]);
               else return arr[base];
             };
             const min = values[0] || 0;
             const max = values[values.length - 1] || 0;
             const q1 = getQ(values, 0.25) || 0;
             const median = getQ(values, 0.5) || 0;
             const q3 = getQ(values, 0.75) || 0;
             const option = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'item' },
                xAxis: { type: 'category', data: [yAxis] },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
                series: [{ type: 'boxplot', data: [[min, q1, median, q3, max]], itemStyle: { color: COLORS[2], borderColor: COLORS[2] } }]
             };
             return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
          } else {
             const categories = Array.from(new Set(dataset.data.map((r:any) => formatValue(r[groupBy])))) as string[];
             const boxData = categories.map(cat => {
               const values = dataset.data.filter((r:any) => formatValue(r[groupBy]) === cat)
                                          .map((r:any) => Number(r[yAxis]) || 0)
                                          .sort((a,b)=>a-b);
               if(!values.length) return [0,0,0,0,0];
               const getQ = (arr: number[], q: number) => {
                 const pos = (arr.length - 1) * q;
                 const base = Math.floor(pos);
                 const rest = pos - base;
                 if ((arr[base + 1] !== undefined)) return arr[base] + rest * (arr[base + 1] - arr[base]);
                 else return arr[base];
               };
               return [values[0], getQ(values, 0.25), getQ(values, 0.5), getQ(values, 0.75), values[values.length - 1]];
             });
             const option = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'item' },
                xAxis: { type: 'category', data: categories.map(c => c.slice(0, 15)), axisLabel: { color: '#9ca3af' } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
                series: [{ type: 'boxplot', data: boxData, itemStyle: { color: COLORS[2], borderColor: COLORS[2] } }]
             };
             return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
          }
        }
        case 'violin_plot': {
          return <EmptyChart msg="Violin plot approximation requires WebGL. Fallback to Box Plot available." />;
        }
        case 'scatter_matrix': {
          const cols = numericColumns.slice(0, 3).map(c => c.name);
          if (cols.length < 2) return <EmptyChart msg="Need at least 2 numeric columns for Scatter Matrix." />;
          
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'none' },
            grid: [],
            xAxis: [],
            yAxis: [],
            series: []
          } as any;
          
          const size = 100 / cols.length;
          let idx = 0;
          for (let i = 0; i < cols.length; i++) {
            for (let j = 0; j < cols.length; j++) {
              option.grid.push({ left: `${j * size + 2}%`, top: `${i * size + 2}%`, width: `${size - 6}%`, height: `${size - 6}%` });
              option.xAxis.push({ gridIndex: idx, type: 'value', show: i === cols.length - 1, axisLabel: { show: false } });
              option.yAxis.push({ gridIndex: idx, type: 'value', show: j === 0, axisLabel: { show: false } });
              
              if (i === j) {
                option.series.push({
                  type: 'scatter', xAxisIndex: idx, yAxisIndex: idx,
                  data: [],
                });
              } else {
                option.series.push({
                  type: 'scatter', xAxisIndex: idx, yAxisIndex: idx,
                  symbolSize: 4, itemStyle: { opacity: 0.5, color: COLORS[0] },
                  data: dataset.data.slice(0, 100).map((r:any) => [r[cols[j]], r[cols[i]]])
                });
              }
              idx++;
            }
          }
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'bee_swarm': {
          return <EmptyChart msg="Bee Swarm native layout not available. Scatter plot with jitter recommended." />;
        }
        case 'joyplot': {
          if (!groupBy) return <EmptyChart msg="Ridgejoy/Joyplot requires a Group By field." />;
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: groupedData.categories, boundaryGap: false },
            yAxis: { type: 'value', show: false },
            series: groupedData.groups.map((g, i) => ({
              name: g,
              type: 'line',
              smooth: true,
              areaStyle: { opacity: 0.8 },
              lineStyle: { width: 1 },
              symbol: 'none',
              data: groupedData.matrix.map(row => (row[g] || 0)),
              z: groupedData.groups.length - i,
              itemStyle: { color: COLORS[i % COLORS.length] }
            }))
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'dot_plot': {
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
            yAxis: { type: 'category', data: chartData.map(d => d.name), axisLabel: { color: '#9ca3af' } },
            series: [{ type: 'scatter', symbolSize: 10, data: chartData.map(d => d.value), itemStyle: { color: COLORS[4] } }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'qq_plot': {
          const values = chartData.map(d => d.value).sort((a,b)=>a-b);
          const option = {
            backgroundColor: 'transparent',
            tooltip: { formatter: (p: any) => `Theoretical: ${p.value[0]?.toFixed(2)}<br/>Actual: ${p.value[1]?.toFixed(2)}` },
            xAxis: { type: 'value', name: 'Theoretical Quantiles', nameLocation: 'middle', nameGap: 25 },
            yAxis: { type: 'value', name: 'Sample Quantiles', nameLocation: 'middle', nameGap: 35 },
            series: [{ 
              type: 'scatter', 
              data: values.map((v, i) => {
                const p = (i + 0.5) / values.length;
                const t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p)));
                let q = t - ((0.010328 * t + 0.802853) * t + 2.515517) / (((0.001308 * t + 0.189269) * t + 1.432788) * t + 1);
                if (p < 0.5) q = -q;
                return [q, v];
              }),
              itemStyle: { color: COLORS[5] }
            }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'ecdf': {
          const values = chartData.map(d => d.value).sort((a,b)=>a-b);
          const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'value', min: values[0], max: values[values.length - 1], axisLabel: { color: '#9ca3af' } },
            yAxis: { type: 'value', max: 1, axisLabel: { color: '#9ca3af' } },
            series: [{ 
              type: 'line', 
              step: 'end',
              data: values.map((v, i) => [v, (i + 1) / values.length]),
              itemStyle: { color: COLORS[6] },
              symbol: 'none'
            }]
          };
          return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
      }
    }

    if (['sunburst', 'icicle', 'dendrogram'].includes(chartType as string)) {
      if (!chartData.length) return <EmptyChart />;
      
      let treeData: any[] = [{
        name: 'Root',
        children: chartData.map(d => ({ name: d.name, value: d.value }))
      }];
      
      if (groupBy) {
        const grouped = dataset.data.reduce((acc: any, row: any) => {
          const g = formatValue(row[groupBy]);
          if (!acc[g]) acc[g] = [];
          acc[g].push({ name: formatValue(row[xAxis]), value: Number(row[yAxis]) || 0 });
          return acc;
        }, {});
        treeData = [{
          name: 'Root',
          children: Object.keys(grouped).map(g => ({
            name: g,
            children: grouped[g]
          }))
        }];
      }

      const typeMap: Record<string, any> = {
        sunburst: { type: 'sunburst', radius: ['10%', '90%'], itemStyle: { borderRadius: 4, borderWidth: 2 } },
        icicle: { type: 'treemap', leafDepth: 2, roam: false, nodeClick: false, breadcrumb: { show: false }, itemStyle: { gapWidth: 1 } },
        dendrogram: { type: 'tree', layout: 'orthogonal', symbolSize: 8, label: { position: 'left', align: 'right' }, leaves: { label: { position: 'right', align: 'left' } }, edgeShape: 'polyline' }
      };

      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        series: [{
          ...typeMap[chartType],
          data: treeData,
          color: COLORS
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (['funnel', 'pyramid', 'funnel_dropoff'].includes(chartType as string)) {
      if (!chartData.length) return <EmptyChart />;
      const sorted = [...chartData].sort((a, b) => b.value - a.value);
      const isPyramid = chartType === 'pyramid';
      const isDropoff = chartType === 'funnel_dropoff';
      const maxVal = sorted[0]?.value || 1;

      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', formatter: '{b}: {c}' },
        series: [{
          type: 'funnel',
          left: '10%', top: 30, bottom: 30, width: '80%',
          sort: isPyramid ? 'ascending' : 'descending',
          gap: 2,
          label: {
            show: true,
            position: 'inside',
            formatter: isDropoff 
              ? (p: any) => `${p.name}\n${((p.value/maxVal)*100).toFixed(1)}%`
              : '{b}'
          },
          data: sorted.map((d, i) => ({ ...d, itemStyle: { color: COLORS[i % COLORS.length] } }))
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'sankey') {
      if (!chartData.length) return <EmptyChart />;
      const links: any[] = [];
      const nodesSet = new Set<string>();
      
      if (groupBy) {
        dataset.data.forEach((row: any) => {
          const source = formatValue(row[groupBy]);
          const target = formatValue(row[xAxis]);
          const value = Number(row[yAxis]) || 0;
          if (value > 0) {
            nodesSet.add(source);
            nodesSet.add(target);
            links.push({ source, target, value });
          }
        });
      } else {
        chartData.forEach((d, i) => {
          if (i > 0) {
            nodesSet.add(chartData[0].name);
            nodesSet.add(d.name);
            links.push({ source: chartData[0].name, target: d.name, value: d.value });
          }
        });
      }

      if (nodesSet.size === 0) return <EmptyChart msg="Sankey Diagram needs valid relational mapping (Group By -> X-Axis)." />;

      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        series: [{
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          data: Array.from(nodesSet).map(name => ({ name })),
          links,
          lineStyle: { color: 'source', curveness: 0.5, opacity: 0.3 },
          itemStyle: { borderWidth: 0, borderRadius: 4 },
          color: COLORS
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'chord') {
      if (!chartData.length) return <EmptyChart />;
      const links: any[] = [];
      const nodesSet = new Set<string>();
      
      if (groupBy) {
        dataset.data.forEach((row: any) => {
          const source = formatValue(row[groupBy]);
          const target = formatValue(row[xAxis]);
          const value = Number(row[yAxis]) || 0;
          if (value > 0) {
            nodesSet.add(source);
            nodesSet.add(target);
            links.push({ source, target, value });
          }
        });
      } else {
        chartData.forEach((d, i) => { 
          if (i > 0) {
            nodesSet.add(chartData[0].name);
            nodesSet.add(d.name);
            links.push({ source: chartData[0].name, target: d.name, value: d.value }); 
          }
        });
      }

      if (nodesSet.size === 0) return <EmptyChart msg="Chord Diagram needs relations (Group By -> X-Axis)." />;

      const option = {
        backgroundColor: 'transparent',
        tooltip: {},
        series: [{
          type: 'graph',
          layout: 'circular',
          circular: { rotateLabel: true },
          data: Array.from(nodesSet).map(name => ({ name, symbolSize: 20 })),
          links,
          roam: true,
          label: { show: true, position: 'right' },
          lineStyle: { color: 'source', curveness: 0.3, width: 2, opacity: 0.7 },
          color: COLORS
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'nightingale') {
      if (!chartData.length) return <EmptyChart />;
      const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, textStyle: { color: '#9ca3af' } },
        series: [{
          type: 'pie',
          radius: [30, 120],
          center: ['50%', '45%'],
          roseType: 'area',
          itemStyle: { borderRadius: 4 },
          data: chartData.map((d, i) => ({ ...d, itemStyle: { color: COLORS[i % COLORS.length] } })),
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'isotype' || chartType === 'waffle') {
      if (!chartData.length) return <EmptyChart />;
      const isWaffle = chartType === 'waffle';
      const option = {
        backgroundColor: 'transparent',
        tooltip: {},
        xAxis: { type: 'value', splitLine: { show: false }, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
        yAxis: { type: 'category', data: chartData.map(d => d.name), axisLabel: { color: '#9ca3af' }, axisLine: { show: false }, axisTick: { show: false } },
        series: [{
          type: 'pictorialBar',
          symbol: isWaffle ? 'roundRect' : 'path://M0,10 L10,10 L10,0 L0,0 Z',
          symbolRepeat: true,
          symbolSize: [15, 15],
          symbolMargin: 2,
          data: chartData.map((d, i) => ({ value: d.value, itemStyle: { color: COLORS[i % COLORS.length] } }))
        }]
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }

    if (chartType === 'stacked_area_100') {
      if (!groupedData.categories.length) return <EmptyChart msg="Requires X-Axis and Group By." />;
      const series = groupedData.groups.map((g, i) => {
        return {
          name: g,
          type: 'line',
          areaStyle: {},
          stack: 'total',
          data: groupedData.matrix.map(row => {
            let total = 0;
            groupedData.groups.forEach(gx => total += (row[gx] || 0));
            return total === 0 ? 0 : Number(((row[g] || 0) / total * 100).toFixed(2));
          }),
          itemStyle: { color: COLORS[i % COLORS.length] }
        };
      });

      const option = {
        backgroundColor: 'transparent',
        grid: { top: 30, right: 30, bottom: 50, left: 50, containLabel: true },
        tooltip: { trigger: 'axis', valueFormatter: (val: any) => `${val}%` },
        legend: { data: groupedData.groups, textStyle: { color: '#9ca3af' }, bottom: 0 },
        xAxis: { type: 'category', boundaryGap: false, data: groupedData.categories, axisLabel: { color: '#9ca3af' } },
        yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: '#9ca3af' }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
        series
      };
      return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
    }


    if (!chartData.length) return <EmptyChart />;

    const isGrouped = !!(groupBy && groupedData.matrix.length > 0);
    const dataToUse = isGrouped ? groupedData.matrix : chartData;
    const seriesKeys = isGrouped ? groupedData.groups : ['value'];

    const commonProps = { data: dataToUse, margin: { top: 20, right: 30, left: 20, bottom: 60 } };

    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  name={isGrouped ? key : undefined}
                  fill={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} 
                  radius={[4, 4, 0, 0]} 
                >
                  {!isGrouped && dataToUse.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'horizontal_bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart {...commonProps} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={80} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  name={isGrouped ? key : undefined}
                  fill={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} 
                  radius={[0, 4, 4, 0]} 
                >
                  {!isGrouped && dataToUse.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Pie 
                data={chartData} 
                cx="50%" 
                cy="50%" 
                outerRadius={120} 
                dataKey="value" 
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
            </RePieChart>
          </ResponsiveContainer>
        );
      case 'donut':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Pie 
                data={chartData} 
                cx="50%" 
                cy="50%" 
                innerRadius={70} 
                outerRadius={120} 
                dataKey="value" 
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
            </RePieChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ReLineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Line 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  name={isGrouped ? key : undefined}
                  stroke={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} 
                  strokeWidth={2} 
                  dot={(props: any) => {
                    const { cx, cy, payload, index } = props;
                    return (
                      <circle 
                        cx={cx} cy={cy} r={4} 
                        fill={isGrouped ? COLORS[i % COLORS.length] : COLORS[index % COLORS.length]} 
                        stroke="none" 
                      />
                    );
                  }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              ))}
            </ReLineChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ReAreaChart {...commonProps}>
              <defs>
                {seriesKeys.map((key, i) => (
                  <linearGradient key={`grad-${key}`} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Area 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  name={isGrouped ? key : undefined}
                  stroke={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} 
                  fill={`url(#grad-${key})`} 
                  strokeWidth={2} 
                  dot={(props: any) => {
                    const { cx, cy, index } = props;
                    return (
                      <circle 
                        cx={cx} cy={cy} r={3} 
                        fill={isGrouped ? COLORS[i % COLORS.length] : COLORS[index % COLORS.length]} 
                        stroke="none" 
                      />
                    );
                  }}
                />
              ))}
            </ReAreaChart>
          </ResponsiveContainer>
        );
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis dataKey={isGrouped ? seriesKeys[0] : "value"} stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Scatter 
                  key={key} 
                  name={isGrouped ? key : "Value"}
                  data={dataToUse} 
                  fill={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"}
                >
                  {!isGrouped && dataToUse.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Scatter>
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        );
      case 'radar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={dataToUse}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <PolarRadiusAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              {seriesKeys.map((key, i) => (
                <ReRadar 
                  key={key} 
                  name={key}
                  dataKey={key} 
                  stroke={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} 
                  fill={isGrouped ? COLORS[i % COLORS.length] : "hsl(var(--primary))"} 
                  fillOpacity={0.3} 
                />
              ))}
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        );
      case 'funnel':
        return (<ResponsiveContainer width="100%" height="100%"><FunnelChart><Tooltip contentStyle={tooltipStyle} /><Funnel dataKey="value" data={chartData.sort((a, b) => b.value - a.value)} isAnimationActive>{chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}<LabelList position="center" fill="hsl(var(--foreground))" stroke="none" dataKey="name" fontSize={11} /></Funnel></FunnelChart></ResponsiveContainer>);
      case 'treemap':
        const CustomizedTreemapContent = (props: any) => {
          const { x, y, width, height, index, name } = props;
          return (
            <g>
              <rect 
                x={x} 
                y={y} 
                width={width} 
                height={height} 
                style={{ fill: COLORS[index % COLORS.length], stroke: '#fff', strokeWidth: 1 }} 
              />
              {width > 30 && height > 20 && (
                <text x={x + 4} y={y + 16} fill="#fff" fontSize={10} style={{ pointerEvents: 'none' }}>
                  {name}
                </text>
              )}
            </g>
          );
        };
        return (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap 
              data={chartData} 
              dataKey="value" 
              aspectRatio={4 / 3} 
              stroke="hsl(var(--border))" 
              fill="hsl(var(--primary))"
              content={<CustomizedTreemapContent />} 
            />
          </ResponsiveContainer>
        );
      case 'waterfall':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} content={({ payload }) => {
                if (!payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border border-border rounded-lg p-2 text-sm text-popover-foreground shadow-lg">
                    <p className="font-semibold">{d.name}</p>
                    <p>Value: {d.value >= 0 ? '+' : ''}{d.value}</p>
                    <p>Running: {d.end}</p>
                  </div>
                );
              }} />
              <Bar dataKey="start" stackId="waterfall" fill="transparent" />
              <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
                {waterfallData.map((d, i) => (
                  <Cell key={i} fill={d.value >= 0 ? COLORS[0] : COLORS[5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
    }
    
    if (['kpi_card', 'gauge', 'thermometer', 'big_number', 'progress_bar', 'stoplight'].includes(chartType)) {
      if (!chartData.length) return <EmptyChart />;
      const latestValue = chartData[chartData.length - 1]?.value || 0;
      const targetValue = chartData[0]?.value || 100;
      const percentage = Math.min(Math.round((Number(latestValue) / Number(targetValue)) * 100), 100) || 0;

      switch(chartType) {
        case 'big_number':
        case 'kpi_card': {
          return (
            <div className="flex flex-col items-center justify-center w-full h-full p-4 bg-transparent">
               <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">{xAxis || 'Metric'}</span>
               <span className="text-5xl font-bold text-foreground">{Number(latestValue).toLocaleString()}</span>
               {chartType === 'kpi_card' && (
                  <div className="flex items-center mt-4 space-x-2">
                     <span className={`text-sm font-medium px-2 py-1 rounded-full ${percentage >= 100 ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {percentage}% of Target
                     </span>
                     <span className="text-xs text-muted-foreground">Target: {Number(targetValue).toLocaleString()}</span>
                  </div>
               )}
            </div>
          );
        }
        case 'progress_bar': {
          return (
             <div className="flex flex-col justify-center w-full h-full p-6 space-y-4">
               <div className="flex justify-between items-end">
                 <span className="text-sm font-medium text-foreground">{xAxis || 'Progress'}</span>
                 <span className="text-2xl font-bold">{percentage}%</span>
               </div>
               <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
                 <div className="h-full bg-primary transition-all duration-1000 ease-out" style={{ width: `${percentage}%` }} />
               </div>
               <div className="flex justify-between text-xs text-muted-foreground">
                 <span>0</span>
                 <span>{Number(targetValue).toLocaleString()}</span>
               </div>
             </div>
          );
        }
        case 'gauge': {
           const option = {
              backgroundColor: 'transparent',
              series: [
                {
                  type: 'gauge',
                  startAngle: 180,
                  endAngle: 0,
                  center: ['50%', '75%'],
                  radius: '90%',
                  min: 0,
                  max: targetValue,
                  splitNumber: 8,
                  axisLine: {
                    lineStyle: { width: 10, color: [ [percentage/100, '#3b82f6'], [1, '#1f2937'] ] }
                  },
                  pointer: { icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z', length: '12%', width: 20, offsetCenter: [0, '-60%'], itemStyle: { color: 'auto' } },
                  axisTick: { length: 12, lineStyle: { color: 'auto', width: 2 } },
                  splitLine: { length: 20, lineStyle: { color: 'auto', width: 5 } },
                  axisLabel: { color: '#9ca3af', fontSize: 10, distance: -60, formatter: function (value) { return value === 0 ? '0' : value === targetValue ? 'TARGET' : ''; } },
                  title: { offsetCenter: [0, '-20%'], fontSize: 12, color: '#9ca3af' },
                  detail: { fontSize: 30, offsetCenter: [0, '0%'], valueAnimation: true, formatter: function (value) { return Math.round(value) + ''; }, color: 'auto' },
                  data: [{ value: latestValue, name: xAxis || 'Metric' }]
                }
              ]
           };
           return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />;
        }
        case 'thermometer': {
           const option = {
             backgroundColor: 'transparent',
             grid: { left: '45%', right: '45%', bottom: '15%', top: '15%' },
             xAxis: { show: false },
             yAxis: { show: false, min: 0, max: targetValue },
             series: [
               { type: 'bar', data: [targetValue], barWidth: 20, itemStyle: { color: '#1f2937', borderRadius: 10 }, z: 1, silent: true },
               { type: 'bar', data: [latestValue], barWidth: 20, barGap: '-100%', itemStyle: { color: '#dc2626', borderRadius: 10 }, z: 2 }
             ]
           };
           return (
             <div className="relative w-full h-full flex items-center justify-center">
               <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} />
               <div className="absolute bottom-[2%] text-2xl font-bold text-red-500">{Number(latestValue).toLocaleString()}</div>
               <div className="absolute top-[2%] text-xs text-muted-foreground border-b border-border pb-1">Target: {Number(targetValue).toLocaleString()}</div>
             </div>
           );
        }
        case 'stoplight': {
           const color = percentage >= 80 ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : percentage >= 50 ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
           return (
             <div className="flex flex-col items-center justify-center w-full h-full bg-transparent p-4">
               <div className="w-16 h-40 bg-zinc-900 rounded-full border border-border p-2 flex flex-col justify-between items-center shadow-inner">
                 <div className={`w-10 h-10 rounded-full transition-all duration-500 ${percentage >= 80 ? color : 'bg-zinc-800'}`} />
                 <div className={`w-10 h-10 rounded-full transition-all duration-500 ${percentage >= 50 && percentage < 80 ? color : 'bg-zinc-800'}`} />
                 <div className={`w-10 h-10 rounded-full transition-all duration-500 ${percentage < 50 ? color : 'bg-zinc-800'}`} />
               </div>
               <div className="mt-6 text-center">
                 <span className="text-xl font-bold text-foreground block">{Number(latestValue).toLocaleString()}</span>
                 <span className="text-xs text-muted-foreground uppercase tracking-widest">{xAxis || 'Status'}</span>
               </div>
             </div>
           );
        }
      }
    }
  
  };

  return renderChart();
};
