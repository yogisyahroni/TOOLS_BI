const fs = require('fs');
const path = require('path');

const chartBuilderPath = path.join(__dirname, '../src/pages/ChartBuilder.tsx');
const chartRendererPath = path.join(__dirname, '../src/components/ChartRenderer.tsx');

let content = fs.readFileSync(chartBuilderPath, 'utf-8');

// Find the start of renderChart
const startIndex = content.indexOf('const renderChart = () => {');
if (startIndex === -1) {
    console.log('renderChart not found');
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

let renderChartBody = content.substring(startIndex, endIndex);

// We need to modify renderChart to accept props instead of taking them from scope.
// But doing string manipulation is hard. Let's just create a wrapper.

const newComponentContent = `import React from 'react';
import ReactECharts from 'echarts-for-react';
import { ALL_CHART_TYPES } from './Sidebar';

export const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const EmptyChart = ({ msg = "Select Dataset, X-Axis, and Y-Axis" }: { msg?: string }) => (
  <div className="flex items-center justify-center h-full border-2 border-dashed border-border rounded-lg bg-muted/20">
    <div className="flex flex-col items-center gap-2">
      <div className="p-3 shadow-sm bg-background border border-border rounded-xl">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground w-6 h-6"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
      </div>
      <p className="text-sm font-medium text-muted-foreground">{msg}</p>
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
  chartType: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  dataLimit: string;
  dataset: any;
  chartData: any[];
  groupedData: any;
  numericColumns: any[];
  categoricalColumns: any[];
  COLORS?: string[];
  sortOrder?: 'asc' | 'desc' | 'none';
  showLegend?: boolean;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
  chartType,
  xAxis,
  yAxis,
  groupBy,
  dataLimit,
  dataset,
  chartData,
  groupedData,
  numericColumns,
  categoricalColumns,
  sortOrder = 'none',
  showLegend = true,
}) => {
  const renderChart = () => {
    // Injected body from ChartBuilder
    let bodyObj = \`\${renderChartBody}\`;
    
    // We are inside renderChart, so we can just replace 'const renderChart = () => {' and trailing '}'
    return null;
  };

  return renderChart();
};
`;

let targetFileContent = newComponentContent.replace(
  '// Injected body from ChartBuilder\\n    let bodyObj = `${renderChartBody}`;\\n    \\n    // We are inside renderChart, so we can just replace \\'const renderChart = () => {\\' and trailing \\'}\\n    return null;',
  renderChartBody.replace('const renderChart = () => {', '')
);

fs.writeFileSync(chartRendererPath, targetFileContent);
console.log('Successfully created ChartRenderer.tsx');
