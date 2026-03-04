import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, LineChart, PieChart, AreaChart, ScatterChart as ScatterIcon,
  Radar, TrendingUp, Plus, Trash2, Download, Save, Eye, Flame, Grid3X3, Box, GitBranch as SankeyIcon
} from 'lucide-react';
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
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';

const CHART_TYPES = [
  { id: 'bar', label: 'Bar', icon: BarChart3 },
  { id: 'line', label: 'Line', icon: LineChart },
  { id: 'pie', label: 'Pie', icon: PieChart },
  { id: 'area', label: 'Area', icon: AreaChart },
  { id: 'scatter', label: 'Scatter', icon: ScatterIcon },
  { id: 'radar', label: 'Radar', icon: Radar },
  { id: 'funnel', label: 'Funnel', icon: TrendingUp },
  { id: 'treemap', label: 'Treemap', icon: Grid3X3 },
  { id: 'waterfall', label: 'Waterfall', icon: BarChart3 },
  { id: 'heatmap', label: 'Heatmap', icon: Flame },
  { id: 'boxplot', label: 'Box Plot', icon: Box },
  { id: 'horizontal_bar', label: 'H-Bar', icon: BarChart3 },
] as const;

const COLORS = [
  'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
  'hsl(210, 80%, 55%)', 'hsl(30, 90%, 55%)', 'hsl(160, 60%, 45%)',
  'hsl(0, 70%, 55%)', 'hsl(45, 85%, 50%)', 'hsl(260, 50%, 60%)',
];

type ChartType = typeof CHART_TYPES[number]['id'];

function TreemapContent(props: any) {
  const { x, y, width, height, name, value } = props;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={COLORS[Math.abs(String(name).charCodeAt(0)) % COLORS.length]} stroke="hsl(var(--background))" strokeWidth={2} rx={4} />
      {width > 50 && height > 30 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight="bold">{name}</text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>{value}</text>
        </>
      )}
    </g>
  );
}

// HeatmapCell for custom heatmap rendering
function HeatmapCell({ data, xLabels, yLabels }: { data: number[][]; xLabels: string[]; yLabels: string[] }) {
  const maxVal = Math.max(...data.flat());
  const minVal = Math.min(...data.flat());
  const cellW = 100 / xLabels.length;
  const cellH = 100 / yLabels.length;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
      {data.map((row, yi) =>
        row.map((val, xi) => {
          const intensity = maxVal === minVal ? 0.5 : (val - minVal) / (maxVal - minVal);
          const hue = 174 - intensity * 140; // teal to red
          return (
            <g key={`${yi}-${xi}`}>
              <rect x={xi * cellW} y={yi * cellH} width={cellW} height={cellH}
                fill={`hsl(${hue}, 72%, ${50 - intensity * 15}%)`} stroke="hsl(var(--background))" strokeWidth={0.3} rx={0.5} />
              {cellW > 8 && cellH > 8 && (
                <text x={xi * cellW + cellW / 2} y={yi * cellH + cellH / 2 + 1.5}
                  textAnchor="middle" fill="white" fontSize={2.5} fontWeight="bold">{val.toFixed(0)}</text>
              )}
            </g>
          );
        })
      )}
      {/* X labels */}
      {xLabels.map((l, i) => (
        <text key={`xl-${i}`} x={i * cellW + cellW / 2} y={100 + 3} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={2}>{l.slice(0, 8)}</text>
      ))}
      {/* Y labels */}
      {yLabels.map((l, i) => (
        <text key={`yl-${i}`} x={-1} y={i * cellH + cellH / 2 + 1} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={2}>{l.slice(0, 8)}</text>
      ))}
    </svg>
  );
}

export default function ChartBuilder() {
  const { dataSets, savedCharts, addSavedChart, removeSavedChart } = useDataStore();
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');
  const [chartTitle, setChartTitle] = useState('Untitled Chart');
  const [groupBy, setGroupBy] = useState('');

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);
  const columns = dataset?.columns || [];
  const numericColumns = columns.filter(c => c.type === 'number');

  const chartData = useMemo(() => {
    if (!dataset || !xAxis || !yAxis) return [];
    const aggregated = new Map<string, number>();
    dataset.data.forEach(row => {
      const key = String(row[xAxis] || 'Unknown');
      const val = Number(row[yAxis]) || 0;
      aggregated.set(key, (aggregated.get(key) || 0) + val);
    });
    return Array.from(aggregated.entries())
      .map(([name, value]) => ({ name, value }))
      .slice(0, 50);
  }, [dataset, xAxis, yAxis]);

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
      const x = String(row[xAxis] || '');
      const y = String(row[groupBy] || '');
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
      const key = String(row[xAxis] || 'Unknown');
      const val = Number(row[yAxis]);
      if (!isNaN(val)) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(val);
      }
    });
    return Array.from(groups.entries()).slice(0, 20).map(([name, vals]) => {
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

  const handleSave = () => {
    if (!selectedDataSet || !xAxis || !yAxis) {
      toast({ title: 'Incomplete', description: 'Please select dataset and axes', variant: 'destructive' });
      return;
    }
    addSavedChart({
      id: Date.now().toString(), title: chartTitle, type: chartType as any,
      dataSetId: selectedDataSet, xAxis, yAxis, groupBy: groupBy || undefined,
    });
    toast({ title: 'Chart Saved', description: `"${chartTitle}" has been saved` });
  };

  const handleExport = () => {
    if (!chartRef.current) return;
    const svg = chartRef.current.querySelector('svg');
    if (!svg) { toast({ title: 'Export failed', description: 'No chart to export', variant: 'destructive' }); return; }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2; canvas.height = img.height * 2;
      ctx!.scale(2, 2);
      ctx!.fillStyle = 'hsl(222, 47%, 6%)';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      ctx!.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${chartTitle.replace(/\s+/g, '_')}.png`;
      a.click();
      toast({ title: 'Exported!', description: `${chartTitle} exported as PNG` });
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const loadChart = (chart: typeof savedCharts[0]) => {
    setChartType(chart.type as ChartType);
    setSelectedDataSet(chart.dataSetId);
    setXAxis(chart.xAxis);
    setYAxis(chart.yAxis);
    setChartTitle(chart.title);
    setGroupBy(chart.groupBy || '');
  };

  const renderChart = () => {
    if (chartType === 'heatmap') {
      if (!heatmapData.data.length) return <EmptyChart msg="Select X-Axis, Y-Axis, and Group By for heatmap" />;
      return <HeatmapCell {...heatmapData} />;
    }

    if (chartType === 'boxplot') {
      if (!boxplotData.length) return <EmptyChart />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={boxplotData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-popover border border-border rounded-lg p-3 text-sm text-popover-foreground shadow-lg">
                  <p className="font-semibold">{d.name}</p>
                  <p>Max: {d.max?.toFixed(1)}</p><p>Q3: {d.q3?.toFixed(1)}</p>
                  <p>Median: {d.median?.toFixed(1)}</p><p>Q1: {d.q1?.toFixed(1)}</p>
                  <p>Min: {d.min?.toFixed(1)}</p>
                </div>
              );
            }} />
            {/* Box: Q1 to Q3 */}
            <Bar dataKey="q1" stackId="box" fill="transparent" />
            <Bar dataKey="iqr" stackId="box" fill="hsl(var(--primary))" fillOpacity={0.6} stroke="hsl(var(--primary))" radius={[4, 4, 4, 4]} />
            {/* Median line */}
            {boxplotData.map((d, i) => (
              <ReferenceLine key={i} y={d.median} stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="3 3" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (!chartData.length) return <EmptyChart />;

    const commonProps = { data: chartData, margin: { top: 20, right: 30, left: 20, bottom: 60 } };

    switch (chartType) {
      case 'bar':
        return (<ResponsiveContainer width="100%" height="100%"><BarChart {...commonProps}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} /><Tooltip contentStyle={tooltipStyle} /><Legend /><Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>);
      case 'horizontal_bar':
        return (<ResponsiveContainer width="100%" height="100%"><BarChart {...commonProps} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} /><YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={80} /><Tooltip contentStyle={tooltipStyle} /><Legend /><Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>);
      case 'line':
        return (<ResponsiveContainer width="100%" height="100%"><ReLineChart {...commonProps}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} /><Tooltip contentStyle={tooltipStyle} /><Legend /><Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} /></ReLineChart></ResponsiveContainer>);
      case 'pie':
        return (<ResponsiveContainer width="100%" height="100%"><RePieChart><Pie data={chartData} cx="50%" cy="50%" outerRadius={120} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend /></RePieChart></ResponsiveContainer>);
      case 'area':
        return (<ResponsiveContainer width="100%" height="100%"><ReAreaChart {...commonProps}><defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-45} textAnchor="end" /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#areaGrad)" strokeWidth={2} /></ReAreaChart></ResponsiveContainer>);
      case 'scatter':
        return (<ResponsiveContainer width="100%" height="100%"><ScatterChart {...commonProps}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} /><YAxis dataKey="value" stroke="hsl(var(--muted-foreground))" fontSize={11} /><Tooltip contentStyle={tooltipStyle} /><Scatter data={chartData} fill="hsl(var(--primary))" /></ScatterChart></ResponsiveContainer>);
      case 'radar':
        return (<ResponsiveContainer width="100%" height="100%"><RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}><PolarGrid stroke="hsl(var(--border))" /><PolarAngleAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} /><PolarRadiusAxis stroke="hsl(var(--muted-foreground))" fontSize={10} /><ReRadar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} /><Legend /></RadarChart></ResponsiveContainer>);
      case 'funnel':
        return (<ResponsiveContainer width="100%" height="100%"><FunnelChart><Tooltip contentStyle={tooltipStyle} /><Funnel dataKey="value" data={chartData.sort((a, b) => b.value - a.value)} isAnimationActive>{chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}<LabelList position="center" fill="hsl(var(--foreground))" stroke="none" dataKey="name" fontSize={11} /></Funnel></FunnelChart></ResponsiveContainer>);
      case 'treemap':
        return (<ResponsiveContainer width="100%" height="100%"><Treemap data={chartData} dataKey="value" aspectRatio={4 / 3} stroke="hsl(var(--border))" fill="hsl(var(--primary))" content={<TreemapContent />} /></ResponsiveContainer>);
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
  };

  const tooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <BarChart3 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Chart Builder <HelpTooltip text="Buat visualisasi chart interaktif. Pilih tipe chart, dataset, sumbu X dan Y, lalu simpan atau ekspor sebagai PNG. Mendukung 12 tipe chart termasuk waterfall, heatmap, dan boxplot." /></h1>
            <p className="text-muted-foreground">Create interactive visualizations — 12 chart types</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Config Panel */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1 space-y-6">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">Chart Type <HelpTooltip text="12 tipe: Bar, Line, Pie, Area, Scatter, Radar, Funnel, Treemap, Waterfall, Heatmap, Box Plot, Horizontal Bar." /></h3>
            <div className="grid grid-cols-4 gap-2">
              {CHART_TYPES.map(ct => (
                <button key={ct.id} onClick={() => setChartType(ct.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-[10px] ${chartType === ct.id ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'}`}>
                  <ct.icon className="w-4 h-4" />{ct.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">Data Source <HelpTooltip text="Pilih dataset, X-Axis (kategori), Y-Axis (nilai numerik), dan Group By (opsional, untuk heatmap)." /></h3>
            <div className="space-y-3">
              <div>
                <Label className="text-muted-foreground text-xs">Dataset</Label>
                <Select value={selectedDataSet} onValueChange={v => { setSelectedDataSet(v); setXAxis(''); setYAxis(''); setGroupBy(''); }}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                  <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">X-Axis (Category)</Label>
                <Select value={xAxis} onValueChange={setXAxis}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Y-Axis (Value)</Label>
                <Select value={yAxis} onValueChange={setYAxis}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>{numericColumns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {(chartType === 'heatmap') && (
                <div>
                  <Label className="text-muted-foreground text-xs">Group By (Y-Axis Heatmap)</Label>
                  <Select value={groupBy} onValueChange={setGroupBy}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>{columns.filter(c => c.name !== xAxis).map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">Settings</h3>
            <div>
              <Label className="text-muted-foreground text-xs">Chart Title</Label>
              <Input value={chartTitle} onChange={e => setChartTitle(e.target.value)} className="bg-muted/50 border-border" />
            </div>
            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">
              <Save className="w-4 h-4 mr-2" /> Save Chart
            </Button>
          </div>
        </motion.div>

        {/* Preview Panel */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-3">
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">{chartTitle}</h3>
                <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground capitalize">{chartType}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="w-4 h-4 mr-1" /> Export PNG
              </Button>
            </div>
            <div ref={chartRef} className="h-[500px] p-6">
              {renderChart()}
            </div>
          </div>

          {savedCharts.length > 0 && (
            <div className="mt-6 bg-card rounded-xl p-5 border border-border shadow-card">
              <h3 className="font-semibold text-foreground mb-4">Saved Charts ({savedCharts.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {savedCharts.map(chart => (
                  <div key={chart.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                    <button onClick={() => loadChart(chart)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                      {(() => { const Icon = CHART_TYPES.find(ct => ct.id === chart.type)?.icon || BarChart3; return <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-primary" /></div>; })()}
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{chart.title}</p>
                        <p className="text-xs text-muted-foreground">{chart.type} • {chart.xAxis} vs {chart.yAxis}</p>
                      </div>
                    </button>
                    <Button variant="ghost" size="sm" onClick={() => removeSavedChart(chart.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function EmptyChart({ msg }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <BarChart3 className="w-16 h-16 mb-4 opacity-30" />
      <p className="text-lg font-medium">No data to display</p>
      <p className="text-sm">{msg || 'Select a dataset and configure axes to preview'}</p>
    </div>
  );
}
