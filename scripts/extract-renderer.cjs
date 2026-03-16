const fs = require('fs');
const path = require('path');

const chartBuilderPath = path.join(__dirname, '../src/pages/ChartBuilder.tsx');
const chartRendererPath = path.join(__dirname, '../src/components/ChartRenderer.tsx');

let content = fs.readFileSync(chartBuilderPath, 'utf-8');

// Find the start of renderChart
const startIndex = content.indexOf('const renderChart = () => {');
if (startIndex === -1) {
    console.error('renderChart not found');
    process.exit(1);
}

let braceCount = 0;
let endIndex = startIndex;
let started = false;

for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
        braceCount++;
        started = true;
    } else if (content[i] === '}') {
        braceCount--;
    }
    
    if (started && braceCount === 0) {
        endIndex = i + 1;
        break;
    }
}

// We want to skip "const renderChart = () => {"
const bodyStartIndex = content.indexOf('{', startIndex) + 1;
// we want to skip the final "}"
const bodyEndIndex = endIndex - 1;

let renderChartBody = content.substring(bodyStartIndex, bodyEndIndex);

// Find the start of the useMemo blocks (line 307 approx, const chartData = useMemo)
// Since we want all the calculation hooks, let's extract from "const chartData = useMemo" 
// to the end of the "const groupedData = useMemo" hook.

const useMemoStart = content.indexOf('const chartData = useMemo(() => {');
let hooksEndIndex = content.indexOf('const handleSave = async () => {');
let hooksContent = content.substring(useMemoStart, hooksEndIndex).trim();
if (hooksEndIndex === -1) hooksContent = "";

const newComponentContent = `import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ALL_CHART_TYPES } from '../pages/Sidebar';
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

export const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

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
        backgroundColor: \`rgba(16, 185, 129, \${Math.max(0.1, intensity)})\`,
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
  ${hooksContent}

  const renderChart = () => {
${renderChartBody}
  };

  return renderChart();
};
`;

fs.writeFileSync(chartRendererPath, newComponentContent);
console.log('Successfully created complete ChartRenderer.tsx without replace trick!');
