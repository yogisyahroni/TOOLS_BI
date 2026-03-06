import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Plus, Trash2, GripVertical, BarChart3, X, Move, Maximize2, Minimize2,
  LineChart, PieChart, AreaChart, ScatterChart as ScatterIcon,
  Radar, TrendingUp, Grid3X3, Flame, Box, Settings, Database, Edit2, Columns, Filter,
  Paintbrush, Layers, Variable
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useRelationships, useAutoJoinQuery, useFormatRules, useCreateFormatRule, useDeleteFormatRule, useParameters, useCreateParameter, useDeleteParameter, useUpdateParameter, useDrillConfig, useSaveDrillConfig } from '@/hooks/useApi';
import type { WidgetType, Widget, DashboardConfig } from '@/types/data';
import type { FormatRuleItem, FormatRuleCreate, DashboardParameter } from '@/lib/api';
import { HelpTooltip } from '@/components/HelpTooltip';

const COLORS = [
  'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
  'hsl(210, 80%, 55%)', 'hsl(30, 90%, 55%)', 'hsl(160, 60%, 45%)',
  'hsl(0, 70%, 55%)', 'hsl(45, 85%, 50%)', 'hsl(260, 50%, 60%)',
];

const WIDGET_TYPES: { id: WidgetType; label: string; icon: any }[] = [
  { id: 'bar', label: 'Bar', icon: BarChart3 },
  { id: 'horizontal_bar', label: 'H-Bar', icon: BarChart3 },
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
  { id: 'stat', label: 'Stat', icon: LayoutGrid },
  { id: 'text', label: 'Text', icon: Edit2 },
];

const FORMAT_PRESETS = [
  { label: 'High (Green)', bg: 'hsl(142 76% 36% / 0.2)', text: 'hsl(142 76% 56%)' },
  { label: 'Medium (Yellow)', bg: 'hsl(38 92% 50% / 0.2)', text: 'hsl(38 92% 60%)' },
  { label: 'Low (Red)', bg: 'hsl(0 72% 51% / 0.2)', text: 'hsl(0 72% 65%)' },
  { label: 'Info (Blue)', bg: 'hsl(199 89% 48% / 0.2)', text: 'hsl(199 89% 60%)' },
];

const FORMAT_CONDITIONS = [
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
  { value: 'contains', label: 'Contains' },
  { value: 'empty', label: 'Is Empty' },
];

function matchesRule(value: any, rule: FormatRuleItem): boolean {
  if (rule.condition === 'empty') return value == null || String(value).trim() === '';
  if (rule.condition === 'contains') return String(value).toLowerCase().includes(rule.value.toLowerCase());
  const num = Number(value);
  const threshold = Number(rule.value);
  if (isNaN(num) || isNaN(threshold)) {
    if (rule.condition === 'eq') return String(value) === rule.value;
    return false;
  }
  switch (rule.condition) {
    case 'gt': return num > threshold;
    case 'lt': return num < threshold;
    case 'gte': return num >= threshold;
    case 'lte': return num <= threshold;
    case 'eq': return num === threshold;
    default: return false;
  }
}

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

function HeatmapCell({ data, xLabels, yLabels }: { data: number[][]; xLabels: string[]; yLabels: string[] }) {
  const maxVal = Math.max(...data.flat(), 1);
  const minVal = Math.min(...data.flat(), 0);
  const cellW = 100 / (xLabels.length || 1);
  const cellH = 100 / (yLabels.length || 1);

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
      {xLabels.map((l, i) => (
        <text key={`xl-${i}`} x={i * cellW + cellW / 2} y={100 + 3} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={2}>{l.slice(0, 8)}</text>
      ))}
      {yLabels.map((l, i) => (
        <text key={`yl-${i}`} x={-1} y={i * cellH + cellH / 2 + 1} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={2}>{l.slice(0, 8)}</text>
      ))}
    </svg>
  );
}

export default function DashboardBuilder() {
  const { dataSets, dashboards, addDashboard, updateDashboard, removeDashboard } = useDataStore();
  const { toast } = useToast();

  const [activeDashboardId, setActiveDashboardId] = useState('');
  const [newDashName, setNewDashName] = useState('');
  const [activeFilter, setActiveFilter] = useState<{ column: string; value: string } | null>(null);

  // Selection state for Property Right Panel
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  const activeDashboard = dashboards.find(d => d.id === activeDashboardId) || null;
  const selectedWidget = activeDashboard?.widgets.find(w => w.id === selectedWidgetId) || null;

  // --- Parameters State ---
  const [paramOpen, setParamOpen] = useState(false);
  const [paramName, setParamName] = useState('');
  const [paramType, setParamType] = useState<'number' | 'text' | 'list'>('number');
  const [paramDefaultVal, setParamDefaultVal] = useState('');

  // --- Cross-Dataset Logic ---
  const { data: rawRelationships } = useRelationships();
  const rels = rawRelationships || [];

  const autoJoinMut = useAutoJoinQuery();
  const [crossDatasetCache, setCrossDatasetCache] = useState<Record<string, any[]>>({});

  // --- Conditional Formatting State ---
  const [formatCol, setFormatCol] = useState('');
  const [formatCond, setFormatCond] = useState<FormatRuleCreate['condition']>('gt');
  const [formatVal, setFormatVal] = useState('');
  const [formatBg, setFormatBg] = useState(FORMAT_PRESETS[0].bg);
  const [formatText, setFormatText] = useState(FORMAT_PRESETS[0].text);

  // --- Drill Down State ---
  const [drillHierarchy, setDrillHierarchy] = useState<string[]>([]);
  const [drillMetricCol, setDrillMetricCol] = useState('');
  const [drillAggFn, setDrillAggFn] = useState<'count' | 'sum' | 'avg'>('count');
  const [drillLevels, setDrillLevels] = useState<Record<string, { column: string, filterValue: string }[]>>({});

  // Right Panel Tabs State
  const [activeTab, setActiveTab] = useState('basic');

  // Hooks
  const { data: params = [] } = useParameters();
  const createParamMut = useCreateParameter();
  const deleteParamMut = useDeleteParameter();
  const updateParamMut = useUpdateParameter();

  const activeDatasetId = selectedWidget?.dataSetId;
  const { data: formatRules = [] } = useFormatRules(activeDatasetId || undefined);
  const createRuleMut = useCreateFormatRule();
  const deleteRuleMut = useDeleteFormatRule();

  const { data: drillConfigs = [] } = useDrillConfig(activeDatasetId || undefined);
  const saveDrillMut = useSaveDrillConfig();

  // When switching widget, repopulate drill state
  useEffect(() => {
    if (activeDatasetId && drillConfigs && drillConfigs.length > 0) {
      const cfg = drillConfigs[0];
      setDrillHierarchy(cfg.hierarchy ?? []);
      setDrillMetricCol(cfg.metricCol ?? '');
      setDrillAggFn(cfg.aggFn ?? 'count');
    } else {
      setDrillHierarchy([]);
      setDrillMetricCol('');
      setDrillAggFn('count');
    }
  }, [activeDatasetId, drillConfigs]);

  const createDashboard = () => {
    if (!newDashName.trim()) return;
    const dash: DashboardConfig = {
      id: Date.now().toString(), name: newDashName.trim(), widgets: [], createdAt: new Date()
    };
    addDashboard(dash);
    setActiveDashboardId(dash.id);
    setNewDashName('');
    toast({ title: 'Dashboard created', description: newDashName });
  };

  const handleAddWidgetPlaceholder = () => {
    if (!activeDashboard) return;
    const newId = Date.now().toString();
    const widget: Widget = {
      id: newId, type: 'bar', title: 'New Widget',
      dataSetId: dataSets[0]?.id || '', xAxis: '', yAxis: '', width: 'half',
    };
    updateDashboard(activeDashboard.id, { widgets: [...activeDashboard.widgets, widget] });
    setSelectedWidgetId(newId);
    toast({ title: 'Widget added', description: 'Configure it in the properties panel.' });
  };

  const updateSelectedWidget = (updates: Partial<Widget>) => {
    if (!activeDashboard || !selectedWidgetId) return;
    updateDashboard(activeDashboard.id, {
      widgets: activeDashboard.widgets.map(w => w.id === selectedWidgetId ? { ...w, ...updates } : w)
    });
  };

  const removeWidget = (widgetId: string) => {
    if (!activeDashboard) return;
    updateDashboard(activeDashboard.id, { widgets: activeDashboard.widgets.filter(w => w.id !== widgetId) });
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null);
  };

  const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
    if (!activeDashboard) return;
    const widgets = [...activeDashboard.widgets];
    const idx = widgets.findIndex(w => w.id === widgetId);
    if (direction === 'up' && idx > 0) [widgets[idx - 1], widgets[idx]] = [widgets[idx], widgets[idx - 1]];
    if (direction === 'down' && idx < widgets.length - 1) [widgets[idx], widgets[idx + 1]] = [widgets[idx + 1], widgets[idx]];
    updateDashboard(activeDashboard.id, { widgets });
  };

  const handleDeleteDashboard = (id: string) => {
    removeDashboard(id);
    if (activeDashboardId === id) {
      setActiveDashboardId('');
      setSelectedWidgetId(null);
    }
    toast({ title: 'Dashboard deleted' });
  };

  // --- Data Computation ---

  const processData = (widget: Widget, dataset: any) => {
    if (!dataset) return [];
    let filteredData = dataset.data;

    // 1. Cross-filter
    if (activeFilter) {
      filteredData = filteredData.filter((row: any) => String(row[activeFilter.column]) === activeFilter.value);
    }

    // 2. Parameters (Global)
    if (params.length > 0) {
      filteredData = filteredData.filter((row: any) => {
        return params.every((p: any) => {
          if (!p.defaultValue || !(p.name in row)) return true;
          if (p.type === 'number') return Number(row[p.name]) >= Number(p.defaultValue);
          return String(row[p.name]).toLowerCase().includes(p.defaultValue.toLowerCase());
        });
      });
    }

    // 3. Drill Down for this widget
    const widgetDrill = drillLevels[widget.id] || [];
    if (widgetDrill.length > 0) {
      filteredData = filteredData.filter((row: any) => {
        return widgetDrill.every((d: any) => String(row[d.column]) === d.filterValue);
      });
    }

    return filteredData;
  };

  const getWidgetXAxis = (widget: Widget, datasetId: string) => {
    let currentXAxis = widget.xAxis;
    if (!currentXAxis) return currentXAxis;
    const drillCfg = drillConfigs.find((c: any) => c.datasetId === datasetId);
    if (drillCfg && drillCfg.hierarchy && drillCfg.hierarchy.length > 0) {
      // Allow drill down if current xAxis is in the hierarchy
      if (drillCfg.hierarchy.includes(widget.xAxis)) {
        const depth = (drillLevels[widget.id] || []).length;
        if (depth < drillCfg.hierarchy.length) {
          currentXAxis = drillCfg.hierarchy[depth];
        }
      }
    }
    return currentXAxis;
  };

  const getStandardChartData = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.xAxis || !widget.yAxis) return [];

    // Auto-Join Check
    const isAutoJoin = widget.xAxis.includes('.') || widget.yAxis.includes('.') || (widget.groupBy && widget.groupBy.includes('.'));
    const sourceData = isAutoJoin ? (crossDatasetCache[widget.id] || []) : dataset.data;

    let filteredData = sourceData;
    if (activeFilter) {
      filteredData = filteredData.filter((row: any) => String(row[activeFilter.column]) === activeFilter.value);
    }
    const agg = new Map<string, number>();
    filteredData.forEach((row: any) => {
      const key = String(row[widget.xAxis] || 'Unknown');
      agg.set(key, (agg.get(key) || 0) + (Number(row[widget.yAxis]) || 0));
    });
    return Array.from(agg.entries()).map(([name, value]) => ({ name, value })).slice(0, 50);
  };

  // Trigger AutoJoin mutations when widget configuration changes
  useEffect(() => {
    if (!activeDashboard) return;
    activeDashboard.widgets.forEach(w => {
      if (!w.dataSetId || !w.yAxis || !w.xAxis) return;

      const checkMulti = (val: string) => val && val.includes('.');
      const isAutoJoin = checkMulti(w.xAxis) || checkMulti(w.yAxis) || checkMulti(w.groupBy || '');

      if (isAutoJoin) {
        const fields = [];
        const parseCol = (val: string) => {
          if (!val) return null;
          if (val.includes('.')) {
            const [ds, col] = val.split('.');
            return { datasetId: ds, column: col };
          }
          return { datasetId: w.dataSetId, column: val };
        };

        const xF = parseCol(w.xAxis); if (xF) fields.push(xF);
        const yF = parseCol(w.yAxis); if (yF) fields.push({ ...yF, aggFn: w.type === 'stat' ? 'count' : 'sum' });
        const gF = parseCol(w.groupBy || ''); if (gF) fields.push(gF);

        autoJoinMut.mutate({ baseDatasetId: w.dataSetId, fields, limit: 100 }, {
          onSuccess: (res) => {
            setCrossDatasetCache(prev => ({ ...prev, [w.id]: res.data }));
          }
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboard, dataSets]);

  const getWaterfallData = (baseData: any[]) => {
    let running = 0;
    return baseData.map(d => {
      const start = running;
      running += d.value;
      return { ...d, start, end: running };
    });
  };

  const getHeatmapData = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.xAxis || !widget.yAxis || !widget.groupBy) return { data: [], xLabels: [], yLabels: [] };
    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const map = new Map<string, number>();

    let filteredData = processData(widget, dataset);
    const currentXAxis = getWidgetXAxis(widget, dataset.id);

    filteredData.forEach((row: any) => {
      const x = String(row[currentXAxis] || '');
      const y = String(row[widget.groupBy!] || '');
      const v = Number(row[widget.yAxis]) || 0;
      xSet.add(x); ySet.add(y);
      const key = `${y}__${x}`;
      map.set(key, (map.get(key) || 0) + v);
    });
    const xLabels = Array.from(xSet).slice(0, 20);
    const yLabels = Array.from(ySet).slice(0, 15);
    const data = yLabels.map(y => xLabels.map(x => map.get(`${y}__${x}`) || 0));
    return { data, xLabels, yLabels };
  };

  const getBoxplotData = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.xAxis || !widget.yAxis) return [];
    const groups = new Map<string, number[]>();

    let filteredData = processData(widget, dataset);
    const currentXAxis = getWidgetXAxis(widget, dataset.id);

    filteredData.forEach((row: any) => {
      const key = String(row[currentXAxis] || 'Unknown');
      const val = Number(row[widget.yAxis]);
      if (!isNaN(val)) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(val);
      }
    });
    return Array.from(groups.entries()).slice(0, 20).map(([name, vals]) => {
      vals.sort((a, b) => a - b);
      const q1 = vals[Math.floor(vals.length * 0.25)] || 0;
      const median = vals[Math.floor(vals.length * 0.5)] || 0;
      const q3 = vals[Math.floor(vals.length * 0.75)] || 0;
      const min = vals[0] || 0;
      const max = vals[vals.length - 1] || 0;
      const iqr = q3 - q1;
      return { name, min, q1, median, q3, max, iqr, low: Math.max(min, q1 - 1.5 * iqr), high: Math.min(max, q3 + 1.5 * iqr) };
    });
  };

  const getStatValue = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.yAxis) return { value: 0, count: 0, avg: 0 };
    let filteredData = processData(widget, dataset);
    const nums = filteredData.map((r: any) => Number(r[widget.yAxis])).filter((n: any) => !isNaN(n));
    const sum = nums.reduce((a: number, b: number) => a + b, 0);
    return { value: sum, count: nums.length, avg: nums.length ? sum / nums.length : 0 };
  };

  const handleChartClick = (widget: Widget, data: any) => {
    if (data?.activePayload?.[0]?.payload?.name) {
      const clickedValue = data.activePayload[0].payload.name;
      const currentXAxis = getWidgetXAxis(widget, widget.dataSetId);
      const drillCfg = drillConfigs.find((c: any) => c.datasetId === widget.dataSetId);

      // 1. Check Drill Down capability
      if (drillCfg && drillCfg.hierarchy && drillCfg.hierarchy.includes(widget.xAxis)) {
        const depth = (drillLevels[widget.id] || []).length;
        if (depth < drillCfg.hierarchy.length - 1) { // proceed deeper
          setDrillLevels(prev => ({
            ...prev,
            [widget.id]: [...(prev[widget.id] || []), { column: currentXAxis, filterValue: clickedValue }]
          }));
          toast({ title: 'Drilled Down', description: `${currentXAxis} = ${clickedValue}` });
          return;
        }
      }

      // 2. Global Cross-Filtering
      if (activeFilter?.column === currentXAxis && activeFilter?.value === clickedValue) {
        setActiveFilter(null);
      } else {
        setActiveFilter({ column: currentXAxis, value: clickedValue });
        toast({ title: 'Filter applied', description: `Filtering by ${currentXAxis} = "${clickedValue}". Click again to clear.` });
      }
    }
  };

  const handleDrillUp = (widgetId: string) => {
    setDrillLevels(prev => {
      const current = prev[widgetId] || [];
      if (current.length === 0) return prev;
      return { ...prev, [widgetId]: current.slice(0, -1) };
    });
  };

  const getCellColor = (widget: Widget, dataRow: any, index: number) => {
    const currentXAxis = getWidgetXAxis(widget, widget.dataSetId);
    if (activeFilter?.column === currentXAxis && activeFilter?.value === dataRow.name) {
      return COLORS[3]; // highlight
    }
    for (const rule of formatRules) {
      if (rule.column === widget.xAxis && matchesRule(dataRow.name, rule)) return rule.bgColor;
      if (rule.column === widget.yAxis && matchesRule(dataRow.value, rule)) return rule.bgColor;
    }
    return COLORS[index % COLORS.length];
  };

  const renderWidgetChart = (widget: Widget) => {
    const ds = dataSets.find(d => d.id === widget.dataSetId);
    if (!ds) return <p className="text-muted-foreground text-center mt-8 text-sm">Dataset not found</p>;

    if (widget.type === 'stat') {
      const stat = getStatValue(widget, ds);
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-4xl font-bold text-primary">{stat.value.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Sum of {widget.yAxis || 'value'}</p>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span>Count: {stat.count.toLocaleString()}</span>
            <span>Avg: {stat.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      );
    }

    if (widget.type === 'text') {
      return (
        <div className="flex items-center justify-center h-full p-4 overflow-auto">
          <p className="text-muted-foreground text-center text-sm">{widget.title}</p>
        </div>
      );
    }

    if (widget.type === 'heatmap') {
      const heatData = getHeatmapData(widget, ds);
      if (!heatData.data.length) return <p className="text-muted-foreground text-sm text-center mt-8">Configure X, Y, and Group By</p>;
      return <HeatmapCell {...heatData} />;
    }

    if (widget.type === 'boxplot') {
      const boxData = getBoxplotData(widget, ds);
      if (!boxData.length) return <p className="text-muted-foreground text-sm text-center mt-8">Configure X and Y axes</p>;
      const tooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' };
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={boxData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} angle={-45} textAnchor="end" />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <Tooltip contentStyle={tooltipStyle} content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-popover border border-border rounded-lg p-2 text-xs shadow-lg">
                  <p className="font-semibold">{d.name}</p>
                  <p>Max: {d.max?.toFixed(1)}</p><p>Q3: {d.q3?.toFixed(1)}</p>
                  <p>Median: {d.median?.toFixed(1)}</p><p>Q1: {d.q1?.toFixed(1)}</p>
                  <p>Min: {d.min?.toFixed(1)}</p>
                </div>
              );
            }} />
            <Bar dataKey="q1" stackId="box" fill="transparent" />
            <Bar dataKey="iqr" stackId="box" fill="hsl(var(--primary))" fillOpacity={0.6} stroke="hsl(var(--primary))" radius={[2, 2, 2, 2]} cursor="pointer" onClick={(d) => handleChartClick(widget, { activePayload: [{ payload: d }] })} />
            {boxData.map((d, i) => (
              <ReferenceLine key={i} y={d.median} stroke="hsl(var(--primary))" strokeWidth={2} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    const data = getStandardChartData(widget, ds);
    if (!data.length) return <p className="text-muted-foreground text-sm text-center mt-8">Incomplete configuration</p>;

    const getEchartsOption = () => {
      const isHorizontal = widget.type === 'horizontal_bar';
      const categoryNames = data.map(d => String(d.name));
      const seriesData = data.map((d, i) => ({
        value: Number(d.value) || 0,
        name: String(d.name),
        itemStyle: {
          color: getCellColor(widget, d, i),
          borderWidth: activeFilter?.value === String(d.name) ? 2 : 0,
          borderColor: activeFilter?.value === String(d.name) ? 'hsl(var(--foreground))' : 'transparent'
        }
      }));

      const axisLabelStyle = { fontSize: 10, color: 'hsl(var(--muted-foreground))' };
      const splitLineStyle = { lineStyle: { color: 'hsl(var(--border))', type: 'dashed' as const } };

      let option: any = {
        grid: { top: 30, right: 20, bottom: 30, left: isHorizontal ? 80 : 40, containLabel: true },
        tooltip: {
          trigger: 'item',
          backgroundColor: 'hsl(var(--popover))',
          borderColor: 'hsl(var(--border))',
          textStyle: { color: 'hsl(var(--popover-foreground))', fontSize: 12 },
          borderRadius: 8
        },
      };

      if (['bar', 'line', 'area', 'scatter', 'horizontal_bar', 'waterfall'].includes(widget.type)) {
        option.xAxis = isHorizontal
          ? { type: 'value', axisLabel: axisLabelStyle, splitLine: splitLineStyle }
          : { type: 'category', data: categoryNames, axisLabel: { ...axisLabelStyle, interval: 0, rotate: categoryNames.length > 5 ? 45 : 0 } };
        option.yAxis = isHorizontal
          ? { type: 'category', data: categoryNames, axisLabel: { ...axisLabelStyle, width: 60, overflow: 'truncate' } }
          : { type: 'value', axisLabel: axisLabelStyle, splitLine: splitLineStyle };
      }

      switch (widget.type) {
        case 'bar':
        case 'horizontal_bar':
          option.series = [{ data: seriesData, type: 'bar', itemStyle: { borderRadius: isHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] } }];
          break;
        case 'line':
          option.series = [{ data: seriesData, type: 'line', symbolSize: 6, lineStyle: { width: 3 }, itemStyle: { color: 'hsl(var(--primary))' } }];
          break;
        case 'area':
          option.series = [{ data: seriesData, type: 'line', areaStyle: { opacity: 0.2 }, symbolSize: 6, lineStyle: { width: 2 }, itemStyle: { color: 'hsl(var(--primary))' } }];
          break;
        case 'scatter':
          option.xAxis = { type: 'category', data: categoryNames, axisLabel: axisLabelStyle };
          option.series = [{ data: data.map((d, i) => ({ value: [d.name, d.value], itemStyle: { color: getCellColor(widget, d, i) } })), type: 'scatter', symbolSize: 12 }];
          break;
        case 'pie':
          option.series = [{ data: seriesData, type: 'pie', radius: ['45%', '75%'], center: ['50%', '50%'], label: { show: false }, itemStyle: { borderRadius: 4, borderColor: 'hsl(var(--background))', borderWidth: 2 } }];
          option.tooltip.formatter = '{b}: {c} ({d}%)';
          break;
        case 'radar':
          const maxVal = Math.max(...data.map(v => Number(v.value) || 0)) * 1.1;
          option.radar = { indicator: data.map(d => ({ name: String(d.name), max: maxVal })), axisName: { color: 'hsl(var(--muted-foreground))', fontSize: 10 } };
          option.series = [{ type: 'radar', data: [{ value: data.map(d => d.value), name: widget.yAxis }], areaStyle: { opacity: 0.3 }, itemStyle: { color: 'hsl(var(--primary))' }, lineStyle: { color: 'hsl(var(--primary))', width: 2 } }];
          break;
        case 'funnel':
          option.series = [{ type: 'funnel', left: '10%', top: 20, bottom: 20, width: '80%', data: seriesData.sort((a, b) => b.value - a.value), label: { show: true, position: 'inside', formatter: '{b}' }, itemStyle: { borderColor: 'hsl(var(--background))', borderWidth: 2 } }];
          break;
        case 'treemap':
          option.series = [{ type: 'treemap', data: seriesData, roam: false, label: { show: true, formatter: '{b}\n{c}' }, itemStyle: { borderColor: 'hsl(var(--background))' } }];
          break;
        case 'waterfall':
          const wfData = getWaterfallData(data);
          const baseSeries = wfData.map(d => ({ value: d.start, itemStyle: { color: 'transparent' } }));
          const valSeries = wfData.map((d, i) => ({ value: Number(d.value) || 0, itemStyle: { color: getCellColor(widget, d, i), borderRadius: [3, 3, 0, 0] } }));
          option.series = [
            { type: 'bar', stack: 'total', data: baseSeries, tooltip: { show: false } },
            { type: 'bar', stack: 'total', data: valSeries }
          ];
          option.tooltip.formatter = (params: any) => {
            const dataIndex = params[params.length - 1].dataIndex;
            const d = wfData[dataIndex];
            return `<b>${d.name}</b><br/>Value: ${d.value >= 0 ? '+' : ''}${d.value}<br/>Total: ${d.end}`;
          };
          break;
        default:
          return null;
      }
      return option;
    };

    const echartsOption = getEchartsOption();
    if (!echartsOption) return <p className="text-muted-foreground text-center mt-8">Chart type not supported</p>;

    const onEvents = {
      click: (e: any) => {
        handleChartClick(widget, { activePayload: [{ payload: { name: e.name || e.data?.name, value: e.value } }] });
      }
    };

    return (
      <ReactECharts
        option={echartsOption}
        style={{ height: '100%', width: '100%' }}
        onEvents={onEvents}
        notMerge={true}
      />
    );
  };

  // Helper to fetch columns for the currently selected widget, including related datasets if semantic layer is active.
  const getWidgetColumns = () => {
    if (!selectedWidget || !selectedWidget.dataSetId) return [];

    // Group fields by semantic relations
    const groups: { datasetName: string, columns: any[] }[] = [];

    // Base dataset
    const baseDs = dataSets.find(d => d.id === selectedWidget.dataSetId);
    if (baseDs) {
      groups.push({ datasetName: `${baseDs.name} (Base)`, columns: baseDs.columns });

      // Related datasets
      const relatedIds = new Set<string>();
      rels.forEach(r => {
        if (r.sourceDatasetId === baseDs.id) relatedIds.add(r.targetDatasetId);
        if (r.targetDatasetId === baseDs.id) relatedIds.add(r.sourceDatasetId);
      });

      relatedIds.forEach(targetId => {
        const targetDs = dataSets.find(d => d.id === targetId);
        if (targetDs) {
          // Identify fields that are from related datasets with format datasetId.columnName
          const mappedColumns = targetDs.columns.map(c => ({
            ...c,
            // special name signature for Auto-Join detection
            name: `${targetDs.id}.${c.name}`,
            displayName: c.name
          }));
          groups.push({ datasetName: `Related: ${targetDs.name}`, columns: mappedColumns });
        }
      });
    }
    return groups;
  };

  const widgetColumnGroups = getWidgetColumns();
  // Flat list for straightforward lookups (like formatting, which currently only applies to base)
  const widgetColumns = widgetColumnGroups.length > 0 ? widgetColumnGroups[0].columns : [];

  // Flatten for numeric column detection in all grouped tables
  const allNumericColumns = widgetColumnGroups.flatMap(g => g.columns.filter(c => c.type === 'number'));
  const allColumnsFlat = widgetColumnGroups.flatMap(g => g.columns);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] -m-6 w-[calc(100%+3rem)]">
      {/* Top Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <LayoutGrid className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Unified Dashboard <HelpTooltip text="Buka dataset di kiri, bangun canvas di tengah, dan atur detail widget di kanan." /></h1>
            <p className="text-sm text-muted-foreground">Build, edit, and explore in one place</p>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <Sheet open={paramOpen} onOpenChange={setParamOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="border-primary/30 text-primary gap-2">
                <Variable className="w-4 h-4" /> Parameters
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-card w-[400px] border-l border-border overflow-y-auto">
              <SheetHeader className="mb-6 border-b border-border pb-4">
                <SheetTitle className="flex items-center gap-2">
                  <Variable className="w-5 h-5 text-primary" /> Global Parameters
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-3">
                  <Input value={paramName} onChange={e => setParamName(e.target.value)} placeholder="Parameter Name (matches column)" className="bg-background" />
                  <Select value={paramType} onValueChange={(v: any) => setParamType(v)}>
                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={paramDefaultVal} onChange={e => setParamDefaultVal(e.target.value)} placeholder="Default Value" className="bg-background" />
                  <Button className="w-full" onClick={() => {
                    if (!paramName) return toast({ title: 'Name required', variant: 'destructive' });
                    createParamMut.mutate({ name: paramName, type: paramType, defaultValue: paramDefaultVal }, {
                      onSuccess: () => { setParamName(''); setParamDefaultVal(''); toast({ title: 'Parameter Created' }); }
                    });
                  }} disabled={createParamMut.isPending}>Add Parameter</Button>
                </div>
                {params.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-border">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">Active Parameters</Label>
                    {params.map(p => (
                      <div key={p.id} className="bg-background border border-border p-3 rounded-lg relative group">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-sm">{p.name} ({p.type})</span>
                          <button onClick={() => deleteParamMut.mutate(p.id)} className="text-muted-foreground hover:text-destructive">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {p.type === 'number' ? (
                          <div className="space-y-2">
                            <Slider value={[Number(p.defaultValue) || 0]} max={100} onValueCommit={([v]) => updateParamMut.mutate({ id: p.id, data: { defaultValue: String(v) } })} />
                            <div className="text-right text-xs text-primary">{p.defaultValue || '0'}</div>
                          </div>
                        ) : (
                          <Input value={p.defaultValue} onChange={e => updateParamMut.mutate({ id: p.id, data: { defaultValue: e.target.value } })} className="h-8 text-sm" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Select value={activeDashboardId || "none"} onValueChange={id => {
            setActiveDashboardId(id === "none" ? "" : id);
            setSelectedWidgetId(null);
          }}>
            <SelectTrigger className="w-[200px] bg-muted/50 border-border"><SelectValue placeholder="Select Dashboard" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-- Select existing --</SelectItem>
              {dashboards.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Input value={newDashName} onChange={e => setNewDashName(e.target.value)} placeholder="New dash name..." className="w-[150px] bg-muted/50 border-border" onKeyDown={e => e.key === 'Enter' && createDashboard()} />
            <Button onClick={createDashboard} className="gradient-primary text-primary-foreground" disabled={!newDashName.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {activeDashboard && (
            <Button variant="destructive" size="icon" onClick={() => handleDeleteDashboard(activeDashboard.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden bg-background">
        {/* LEFT PANEL: Data Assets */}
        <div className="w-64 border-r border-border bg-card/50 hidden md:flex flex-col">
          <div className="p-4 border-b border-border font-semibold flex items-center gap-2 text-foreground">
            <Database className="w-4 h-4 text-primary" /> Data Assets
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {dataSets.map(ds => (
              <div key={ds.id} className="space-y-2">
                <p className="font-semibold text-sm text-foreground">{ds.name}</p>
                <div className="space-y-1 pl-2 border-l-2 border-primary/20">
                  {ds.columns.map(c => (
                    <div key={c.name} className="text-xs flex items-center gap-2 text-muted-foreground">
                      <span className={`w-2 h-2 rounded-full ${c.type === 'number' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {dataSets.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No datasets available.</p>
            )}
          </div>
        </div>

        {/* MIDDLE PANEL: Main Canvas */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          {activeFilter && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-10 backdrop-blur-md">
              <span className="text-sm text-primary font-medium flex items-center gap-2">
                <Filter className="w-4 h-4" /> Cross-filter: <strong>{activeFilter.column}</strong> = "{activeFilter.value}"
              </span>
              <Button variant="outline" size="sm" onClick={() => setActiveFilter(null)} className="text-primary border-primary/30 hover:bg-primary/20">
                Clear Filter
              </Button>
            </motion.div>
          )}

          {!activeDashboard ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Columns className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No Dashboard Active</p>
              <p className="text-sm">Select or create one to start building.</p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold">{activeDashboard.name}</h2>
                <Button onClick={handleAddWidgetPlaceholder} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
                  <Plus className="w-4 h-4 mr-2" /> Add Blank Widget
                </Button>
              </div>

              {activeDashboard.widgets.length === 0 ? (
                <div className="rounded-xl p-12 border-2 border-border border-dashed text-center">
                  <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                  <p className="text-muted-foreground mb-4">Click "Add Blank Widget" to drop a block onto the canvas.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max">
                  <AnimatePresence>
                    {activeDashboard.widgets.map((widget, idx) => (
                      <motion.div key={widget.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        onClick={() => setSelectedWidgetId(widget.id)}
                        className={`rounded-xl border shadow-sm overflow-hidden bg-card cursor-pointer transition-all ${selectedWidgetId === widget.id ? 'ring-2 ring-primary border-transparent' : 'border-border hover:border-primary/50'} ${widget.width === 'full' ? 'md:col-span-2 lg:col-span-3' : widget.width === 'half' ? 'md:col-span-2' : ''}`}>

                        <div className={`p-3 border-b flex items-center justify-between ${selectedWidgetId === widget.id ? 'bg-primary/10 border-primary/20' : 'border-border'}`}>
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                            <span className="font-semibold text-foreground text-sm">{widget.title || 'Untitled'}</span>
                          </div>

                          <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); moveWidget(widget.id, 'up'); }} disabled={idx === 0}>
                              <Move className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}>
                              <X className="w-3.5 h-3.5 hover:text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <div className={`p-4 ${widget.type === 'stat' ? 'h-[180px]' : widget.type === 'text' ? 'h-[140px]' : 'h-[300px]'}`}>
                          {renderWidgetChart(widget)}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT PANEL: Widget Properties */}
        <AnimatePresence>
          {selectedWidgetId && selectedWidget && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="border-l border-border bg-card/80 backdrop-blur-lg flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.1)] z-20">

              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  <Settings className="w-4 h-4 text-primary" /> Properties
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedWidgetId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-4 pt-2">
                  <TabsList className="grid grid-cols-3 w-full bg-muted/50">
                    <TabsTrigger value="basic" className="text-xs data-[state=active]:bg-background">Setup</TabsTrigger>
                    <TabsTrigger value="format" className="text-xs data-[state=active]:bg-background" disabled={!selectedWidget.dataSetId}>Format</TabsTrigger>
                    <TabsTrigger value="drill" className="text-xs data-[state=active]:bg-background" disabled={!selectedWidget.dataSetId}>Drill</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  <TabsContent value="basic" className="space-y-6 mt-0">
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Layout</Label>
                      <div>
                        <Label className="text-xs mb-1 block">Widget Title</Label>
                        <Input value={selectedWidget.title} onChange={e => updateSelectedWidget({ title: e.target.value })} className="bg-muted/50" />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Widget Type</Label>
                        <div className="grid grid-cols-4 gap-1 mt-1">
                          {WIDGET_TYPES.map(wt => (
                            <button key={wt.id} onClick={() => updateSelectedWidget({ type: wt.id })} title={wt.label}
                              className={`flex justify-center p-2 rounded-lg transition-all border ${selectedWidget.type === wt.id ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'}`}>
                              <wt.icon className="w-4 h-4" />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Width Scale</Label>
                        <Select value={selectedWidget.width} onValueChange={(v: any) => updateSelectedWidget({ width: v })}>
                          <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="third">Small (1/3)</SelectItem>
                            <SelectItem value="half">Medium (1/2)</SelectItem>
                            <SelectItem value="full">Large (Full Width)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Data Map</Label>
                      <div>
                        <Label className="text-xs mb-1 block">Dataset</Label>
                        <Select value={selectedWidget.dataSetId} onValueChange={v => updateSelectedWidget({ dataSetId: v, xAxis: '', yAxis: '', groupBy: '' })}>
                          <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>

                      {selectedWidget.type !== 'text' && selectedWidget.dataSetId && (
                        <>
                          {(!['stat'].includes(selectedWidget.type)) && (
                            <div>
                              <Label className="text-xs mb-1 block">X-Axis (Dimension)</Label>
                              <Select value={selectedWidget.xAxis || ''} onValueChange={v => updateSelectedWidget({ xAxis: v })}>
                                <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  {widgetColumnGroups.map(g => (
                                    <SelectGroup key={g.datasetName}>
                                      <SelectLabel className="text-xs text-primary">{g.datasetName}</SelectLabel>
                                      {g.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.displayName || c.name}</SelectItem>)}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs mb-1 block">{selectedWidget.type === 'stat' ? 'Metric' : 'Y-Axis (Measure)'}</Label>
                            <Select value={selectedWidget.yAxis || ''} onValueChange={v => updateSelectedWidget({ yAxis: v })}>
                              <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {widgetColumnGroups.map(g => {
                                  const numCols = g.columns.filter(c => c.type === 'number');
                                  if (numCols.length === 0) return null;
                                  return (
                                    <SelectGroup key={g.datasetName}>
                                      <SelectLabel className="text-xs text-primary">{g.datasetName}</SelectLabel>
                                      {numCols.map(c => <SelectItem key={c.name} value={c.name}>{c.displayName || c.name}</SelectItem>)}
                                    </SelectGroup>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          {selectedWidget.type === 'heatmap' && (
                            <div>
                              <Label className="text-xs mb-1 block">Group By (Y-Axis Dimension)</Label>
                              <Select value={selectedWidget.groupBy || ''} onValueChange={v => updateSelectedWidget({ groupBy: v })}>
                                <SelectTrigger className="bg-muted/50"><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  {widgetColumnGroups.map(g => (
                                    <SelectGroup key={g.datasetName}>
                                      <SelectLabel className="text-xs text-primary">{g.datasetName}</SelectLabel>
                                      {g.columns.filter(c => c.name !== selectedWidget.xAxis).map(c => <SelectItem key={c.name} value={c.name}>{c.displayName || c.name}</SelectItem>)}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="format" className="space-y-6 mt-0">
                    <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-3">
                      <Label className="text-xs font-semibold">New Rule</Label>
                      <Select value={formatCol} onValueChange={setFormatCol}>
                        <SelectTrigger className="bg-background h-8"><SelectValue placeholder="Column" /></SelectTrigger>
                        <SelectContent>{widgetColumns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Select value={formatCond} onValueChange={(val) => setFormatCond(val as FormatRuleCreate['condition'])}>
                          <SelectTrigger className="bg-background h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{FORMAT_CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input value={formatVal} onChange={e => setFormatVal(e.target.value)} placeholder="Value" className="h-8 bg-background" disabled={formatCond === 'empty'} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Style Preset</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {FORMAT_PRESETS.map(p => (
                            <button key={p.label} onClick={() => { setFormatBg(p.bg); setFormatText(p.text); }}
                              className={`h-8 rounded-md text-xs font-medium border flex items-center justify-center ${formatBg === p.bg ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border'}`}
                              style={{ backgroundColor: p.bg, color: p.text }}>{p.label.split(' ')[0]}</button>
                          ))}
                        </div>
                      </div>
                      <Button className="w-full h-8 text-xs" onClick={() => {
                        if (!formatCol || !activeDatasetId) return;
                        if (formatCond !== 'empty' && !formatVal) return;
                        createRuleMut.mutate({ datasetId: activeDatasetId, column: formatCol, condition: formatCond, value: formatVal, bgColor: formatBg, textColor: formatText }, {
                          onSuccess: () => { setFormatVal(''); toast({ title: 'Rule added' }); }
                        });
                      }}>Apply Rule</Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Active Rules</Label>
                      {formatRules.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic text-center py-4">No rules created yet</p>
                      ) : (
                        formatRules.map(rule => (
                          <div key={rule.id} className="flex items-center justify-between p-2 rounded border border-border text-xs" style={{ backgroundColor: rule.bgColor, color: rule.textColor }}>
                            <span>{rule.column} {FORMAT_CONDITIONS.find(c => c.value === rule.condition)?.label} {rule.value}</span>
                            <button onClick={() => deleteRuleMut.mutate(rule.id)} className="hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="drill" className="space-y-6 mt-0">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Hierarchy Variables</Label>
                        <div className="flex flex-wrap gap-2">
                          {widgetColumns.filter(c => c.type === 'string').map(c => {
                            const active = drillHierarchy.includes(c.name);
                            return (
                              <button key={c.name} disabled={active} onClick={() => setDrillHierarchy(prev => [...prev, c.name])}
                                className={`px-2 py-1 text-xs rounded-md border ${active ? 'bg-primary/20 text-primary opacity-50' : 'bg-background hover:border-primary'}`}>
                                + {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {drillHierarchy.length > 0 && (
                        <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-border">
                          {drillHierarchy.map((col, i) => (
                            <div key={col} className="flex items-center gap-2 text-sm bg-background p-2 rounded border">
                              <span className="bg-primary/20 text-primary w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                              <span className="flex-1 truncate">{col}</span>
                              <button onClick={() => setDrillHierarchy(prev => prev.filter(c => c !== col))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border">
                        <div>
                          <Label className="text-xs mb-1 block">Metric</Label>
                          <Select value={drillMetricCol} onValueChange={setDrillMetricCol}>
                            <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Col..." /></SelectTrigger>
                            <SelectContent>
                              {widgetColumnGroups.map(g => {
                                const numCols = g.columns.filter(c => c.type === 'number');
                                if (numCols.length === 0) return null;
                                return (
                                  <SelectGroup key={g.datasetName}>
                                    <SelectLabel className="text-xs text-primary">{g.datasetName}</SelectLabel>
                                    {numCols.map(c => <SelectItem key={c.name} value={c.name}>{c.displayName || c.name}</SelectItem>)}
                                  </SelectGroup>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Agg</Label>
                          <Select value={drillAggFn} onValueChange={(v: any) => setDrillAggFn(v)}>
                            <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sum">SUM</SelectItem>
                              <SelectItem value="avg">AVG</SelectItem>
                              <SelectItem value="count">COUNT</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button className="w-full text-xs" variant="secondary" onClick={() => {
                        if (!activeDatasetId || drillHierarchy.length === 0) return;
                        saveDrillMut.mutate({ datasetId: activeDatasetId, hierarchy: drillHierarchy, metricCol: drillMetricCol, aggFn: drillAggFn }, {
                          onSuccess: () => toast({ title: 'Config Saved' })
                        });
                      }}>Save Strategy</Button>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
