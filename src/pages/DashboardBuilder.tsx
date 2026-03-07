/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Plus, Trash2, GripVertical, BarChart3, X, Move, Maximize2, Minimize2,
  LineChart, PieChart, AreaChart, ScatterChart as ScatterIcon,
  Radar, TrendingUp, Grid3X3, Flame, Box, Settings, Database, Edit2, Columns, Filter,
  HelpCircle, ChevronRight, Share2, Users, Search, Check, Download, MousePointer2, Settings2, AlertCircle, Variable, PenTool, Braces, Link2, Sparkles, MessageSquare, Zap, Gauge, SunMedium, Network, Combine
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  ReferenceLine
} from 'recharts';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useRelationships, useAutoJoinQuery, useFormatRules, useCreateFormatRule, useDeleteFormatRule, useParameters, useCreateParameter, useDeleteParameter, useUpdateParameter, useDrillConfig, useSaveDrillConfig, useCalcFields, useCreateCalcField, useDeleteCalcField, useExecuteAction, useComments, useCreateComment, useDeleteComment, useDatasets, useDatasetData } from '@/hooks/useApi';
import { useMultiplayer } from '@/hooks/useMultiplayer';
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
  { id: 'gauge', label: 'Gauge', icon: Gauge },
  { id: 'sunburst', label: 'Sunburst', icon: SunMedium },
  { id: 'sankey', label: 'Sankey', icon: Network },
  { id: 'combo', label: 'Combo', icon: Combine },
  { id: 'text', label: 'Text', icon: Edit2 },
  { id: 'action', label: 'Action', icon: Zap },
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
  const {  dashboards, addDashboard, updateDashboard, removeDashboard  } = useDataStore();
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();

  const [activeDashboardId, setActiveDashboardId] = useState('');
  const [newDashName, setNewDashName] = useState('');
  const [activeFilter, setActiveFilter] = useState<{ column: string; value: string } | null>(null);

  // Selection state for Property Right Panel
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  const activeDashboard = dashboards.find(d => d.id === activeDashboardId) || null;
  const selectedWidget = activeDashboard?.widgets.find(w => w.id === selectedWidgetId) || null;

  // --- Multiplayer (Phase 15) ---
  const { cursors, ydocReady, ydoc } = useMultiplayer(activeDashboardId);

  // --- Comments (Phase 15) ---
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [newCommentPos, setNewCommentPos] = useState<{ x: number, y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const { data: comments = [], refetch: refetchComments } = useComments(activeDashboardId || '');
  const createCommentMut = useCreateComment();
  const deleteCommentMut = useDeleteComment();

  useEffect(() => {
    const handleCommentsUpdated = () => refetchComments();
    window.addEventListener('dashboard_comments_updated', handleCommentsUpdated);
    return () => window.removeEventListener('dashboard_comments_updated', handleCommentsUpdated);
  }, [refetchComments]);

  // --- Multiplayer Yjs Widgets Sync ---
  useEffect(() => {
    if (!ydocReady || !activeDashboardId) return;

    const yState = ydoc.getMap<string>('dashboardState');

    const observer = (event: any, transaction: any) => {
      if (transaction.origin === 'local') return;

      const widgetsJson = yState.get('widgets');
      if (widgetsJson) {
        try {
          const remoteWidgets = JSON.parse(widgetsJson);
          // Update Zustand directly without causing react infinite loops across the normal hook
          // using the store getState() avoids stale closure issues with updaters
          useDataStore.getState().updateDashboard(activeDashboardId, { widgets: remoteWidgets });
        } catch (e) {
          console.error('Failed to parse remote widgets', e);
        }
      }
    };

    yState.observe(observer);

    // Initial load sync
    if (!yState.has('widgets') && activeDashboard?.widgets) {
      ydoc.transact(() => {
        yState.set('widgets', JSON.stringify(activeDashboard.widgets));
      }, 'local');
    } else if (yState.has('widgets')) {
      try {
        const remoteWidgets = JSON.parse(yState.get('widgets')!);
        useDataStore.getState().updateDashboard(activeDashboardId, { widgets: remoteWidgets });
      } catch (e) {
        // ignore error
      }
    }

    return () => {
      yState.unobserve(observer);
    };
  }, [ydocReady, activeDashboardId, ydoc]);

  const syncToYjs = (widgets: Widget[]) => {
    if (ydocReady) {
      ydoc.transact(() => {
        ydoc.getMap<string>('dashboardState').set('widgets', JSON.stringify(widgets));
      }, 'local');
    }
  };

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

  // --- Calculated Fields State ---
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcDatasetId, setCalcDatasetId] = useState('');
  const [calcName, setCalcName] = useState('');
  const [calcFormula, setCalcFormula] = useState('');

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

  const { data: allCalcFields = [] } = useCalcFields();
  const createCalcMut = useCreateCalcField();
  const deleteCalcMut = useDeleteCalcField();

  const executeActionMut = useExecuteAction();

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
    const newWidgets = [...activeDashboard.widgets, widget];
    updateDashboard(activeDashboard.id, { widgets: newWidgets });
    syncToYjs(newWidgets);
    setSelectedWidgetId(newId);
    toast({ title: 'Widget added', description: 'Configure it in the properties panel.' });
  };

  const updateSelectedWidget = (updates: Partial<Widget>) => {
    if (!activeDashboard || !selectedWidgetId) return;
    const newWidgets = activeDashboard.widgets.map(w => w.id === selectedWidgetId ? { ...w, ...updates } : w);
    updateDashboard(activeDashboard.id, { widgets: newWidgets });
    syncToYjs(newWidgets);
  };

  const removeWidget = (widgetId: string) => {
    if (!activeDashboard) return;
    const newWidgets = activeDashboard.widgets.filter(w => w.id !== widgetId);
    updateDashboard(activeDashboard.id, { widgets: newWidgets });
    syncToYjs(newWidgets);
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null);
  };

  const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
    if (!activeDashboard) return;
    const idx = activeDashboard.widgets.findIndex(w => w.id === widgetId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === activeDashboard.widgets.length - 1) return;

    const newWidgets = [...activeDashboard.widgets];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newWidgets[idx], newWidgets[swapIdx]] = [newWidgets[swapIdx], newWidgets[idx]];

    updateDashboard(activeDashboard.id, { widgets: newWidgets });
    syncToYjs(newWidgets);
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

    const filteredData = processData(widget, dataset);
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

    const filteredData = processData(widget, dataset);
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
    const filteredData = processData(widget, dataset);

    const nums = filteredData.map((r: any) => Number(r[widget.yAxis])).filter((n: any) => !isNaN(n));
    const sum = nums.reduce((a: number, b: number) => a + b, 0);
    return { value: sum, count: nums.length, avg: nums.length ? sum / nums.length : 0 };
  };


  const getGaugeData = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.yAxis) return 0;
    const stat = getStatValue(widget, dataset);
    return stat.value;
  };


  const getSunburstData = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.xAxis || !widget.groupBy || !widget.yAxis) return [];
    const filteredData = processData(widget, dataset);
    const groups = new Map<string, Map<string, number>>();


    filteredData.forEach((row: any) => {
      const parent = String(row[widget.xAxis] || 'Unknown');
      const child = String(row[widget.groupBy!] || 'Unknown');
      const val = Number(row[widget.yAxis]) || 0;

      if (!groups.has(parent)) groups.set(parent, new Map());
      const childMap = groups.get(parent)!;
      childMap.set(child, (childMap.get(child) || 0) + val);
    });

    return Array.from(groups.entries()).map(([parentName, childMap]) => ({
      name: parentName,
      children: Array.from(childMap.entries()).map(([childName, val]) => ({
        name: childName,
        value: val
      }))
    }));
  };


  const getSankeyData = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.xAxis || !widget.groupBy || !widget.yAxis) return { nodes: [], links: [] };
    const filteredData = processData(widget, dataset);

    const nodesSet = new Set<string>();
    const linksMap = new Map<string, number>();


    filteredData.forEach((row: any) => {
      const source = String(row[widget.xAxis] || 'Unknown');
      const target = String(row[widget.groupBy!] || 'Unknown');
      const val = Number(row[widget.yAxis]) || 0;

      nodesSet.add(source);
      nodesSet.add(target);

      const key = `${source}->${target}`;
      linksMap.set(key, (linksMap.get(key) || 0) + val);
    });

    const nodes = Array.from(nodesSet).map(name => ({ name }));
    const links = Array.from(linksMap.entries()).map(([key, value]) => {
      const [source, target] = key.split('->');
      return { source, target, value };
    });

    return { nodes, links };
  };


  const getComboData = (widget: Widget, dataset: any) => {
    if (!dataset || !widget.xAxis || !widget.yAxis) return [];
    const filteredData = processData(widget, dataset);
    const agg = new Map<string, { bar: number, line: number }>();


    filteredData.forEach((row: any) => {
      const key = String(row[widget.xAxis] || 'Unknown');
      const barVal = Number(row[widget.yAxis]) || 0;
      const lineVal = widget.groupBy ? (Number(row[widget.groupBy]) || 0) : 0;

      if (!agg.has(key)) agg.set(key, { bar: 0, line: 0 });
      const current = agg.get(key)!;
      current.bar += barVal;
      current.line += lineVal;
    });

    return Array.from(agg.entries()).map(([name, vals]) => ({
      name,
      barValue: vals.bar,
      lineValue: vals.line
    })).slice(0, 50);
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
    const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(widget.dataSetId || '', { limit: 10000 });
  const ds = React.useMemo(() => {
    const meta = dataSets.find(d => d.id === widget.dataSetId);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, widget.dataSetId, __datasetDataRes]);
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

    if (widget.type === 'action') {
      const isExecuting = executeActionMut.isPending;
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto space-y-4 bg-muted/10 rounded-lg">
          <Zap className="w-12 h-12 text-primary opacity-80" />
          <p className="text-sm font-medium text-center">{widget.title || "Action Button"}</p>
          <Button
            size="lg"
            className="w-full max-w-[200px] shadow-lg shadow-primary/20"
            disabled={!widget.actionConfig?.url || isExecuting}
            onClick={(e) => {
              e.stopPropagation();
              if (!widget.actionConfig?.url) return toast({ title: 'URL Not Configured', variant: 'destructive' });

              // Replace parameters in body
              let parsedBody = widget.actionConfig.bodyTemplate || '';
              params.forEach(p => {
                const ref = `{{${p.name}}}`;
                if (parsedBody.includes(ref)) {
                  parsedBody = parsedBody.split(ref).join(p.defaultValue);
                }
              });

              executeActionMut.mutate({
                url: widget.actionConfig.url,
                method: widget.actionConfig.method || 'POST',
                headers: (widget.actionConfig.headers || []).filter(h => h.key && h.value).reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {}),
                body: parsedBody
              }, {
                onSuccess: (data) => {
                  toast({ title: 'Action Executed', description: `Status: ${data.status}` });
                },
                onError: (err) => {
                  toast({ title: 'Action Failed', description: err.message, variant: 'destructive' });
                }
              });
            }}
          >
            {isExecuting ? 'Executing...' : 'Trigger Action'}
          </Button>
          {!widget.actionConfig?.url && <p className="text-xs text-destructive">URL not configured.</p>}
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
        case 'radar': {
          const maxVal = Math.max(...data.map(v => Number(v.value) || 0)) * 1.1;
          option.radar = { indicator: data.map(d => ({ name: String(d.name), max: maxVal })), axisName: { color: 'hsl(var(--muted-foreground))', fontSize: 10 } };
          option.series = [{ type: 'radar', data: [{ value: data.map(d => d.value), name: widget.yAxis }], areaStyle: { opacity: 0.3 }, itemStyle: { color: 'hsl(var(--primary))' }, lineStyle: { color: 'hsl(var(--primary))', width: 2 } }];
          break;
        }
        case 'funnel':
          option.series = [{ type: 'funnel', left: '10%', top: 20, bottom: 20, width: '80%', data: seriesData.sort((a, b) => b.value - a.value), label: { show: true, position: 'inside', formatter: '{b}' }, itemStyle: { borderColor: 'hsl(var(--background))', borderWidth: 2 } }];
          break;
        case 'treemap':
          option.series = [{ type: 'treemap', data: seriesData, roam: false, label: { show: true, formatter: '{b}\n{c}' }, itemStyle: { borderColor: 'hsl(var(--background))' } }];
          break;
        case 'waterfall': {
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
        }
        case 'gauge': {
          const gaugeVal = getGaugeData(widget, ds);
          const gaugeMax = gaugeVal > 0 ? Math.pow(10, Math.ceil(Math.log10(gaugeVal))) : 100;
          option = {
            tooltip: { formatter: '{a} <br/>{b} : {c}' },
            series: [{
              name: widget.title || 'KPI',
              type: 'gauge',
              max: gaugeMax,
              progress: { show: true, width: 18, itemStyle: { color: 'hsl(var(--primary))' } },
              axisLine: { lineStyle: { width: 18, color: [[1, 'hsl(var(--muted))']] } },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: { show: false },
              detail: { valueAnimation: true, fontSize: 30, color: 'hsl(var(--foreground))', formatter: '{value}' },
              data: [{ value: gaugeVal, name: widget.yAxis }]
            }]
          };
          break;
        }
        case 'sunburst': {
          const sunburstData = getSunburstData(widget, ds);
          option.series = [{
            type: 'sunburst',
            data: sunburstData,
            radius: [0, '90%'],
            itemStyle: { borderRadius: 4, borderWidth: 2, borderColor: 'hsl(var(--background))' },
            label: { show: false }
          }];
          break;
        }
        case 'sankey': {
          const sankeyData = getSankeyData(widget, ds);
          option.series = [{
            type: 'sankey',
            data: sankeyData.nodes,
            links: sankeyData.links,
            emphasis: { focus: 'adjacency' },
            nodeAlign: 'justify',
            lineStyle: { color: 'source', curveness: 0.5 },
            itemStyle: { borderColor: 'hsl(var(--background))', borderWidth: 1 }
          }];
          break;
        }
        case 'combo': {
          const comboData = getComboData(widget, ds);
          const comboNames = comboData.map(d => d.name);
          option.xAxis = { type: 'category', data: comboNames, axisLabel: axisLabelStyle, axisPointer: { type: 'shadow' } };
          option.yAxis = [
            { type: 'value', name: widget.yAxis, axisLabel: axisLabelStyle, splitLine: splitLineStyle },
            { type: 'value', name: widget.groupBy || '', axisLabel: axisLabelStyle, splitLine: { show: false } }
          ];
          option.series = [
            {
              name: widget.yAxis,
              type: 'bar',

              data: comboData.map((d, i) => ({ value: d.barValue, name: d.name, itemStyle: { color: getCellColor(widget, d as any, i), borderRadius: [3, 3, 0, 0] } }))
            },
            {
              name: widget.groupBy || 'Secondary',
              type: 'line',
              yAxisIndex: 1,
              data: comboData.map(d => ({ value: d.lineValue, name: d.name })),
              itemStyle: { color: 'hsl(var(--destructive))' },
              lineStyle: { width: 3 },
              symbolSize: 6
            }
          ];
          break;
        }
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
    const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(selectedWidget.dataSetId || '', { limit: 10000 });
  const baseDs = React.useMemo(() => {
    const meta = dataSets.find(d => d.id === selectedWidget.dataSetId);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, selectedWidget.dataSetId, __datasetDataRes]);
    if (baseDs) {
      groups.push({ datasetName: `${baseDs.name} (Base)`, columns: baseDs.columns });

      // Related datasets
      const relatedIds = new Set<string>();
      rels.forEach(r => {
        if (r.sourceDatasetId === baseDs.id) relatedIds.add(r.targetDatasetId);
        if (r.targetDatasetId === baseDs.id) relatedIds.add(r.sourceDatasetId);
      });

      relatedIds.forEach(targetId => {
        const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(targetId || '', { limit: 10000 });
  const targetDs = React.useMemo(() => {
    const meta = dataSets.find(d => d.id === targetId);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, targetId, __datasetDataRes]);
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

      // Inject calculated fields into Base Group visually
      const dsCalcFields = allCalcFields.filter(f => f.datasetId === baseDs.id);
      if (dsCalcFields.length > 0) {
        const baseGroup = groups.find(g => g.datasetName === `${baseDs.name} (Base)`);
        if (baseGroup) {
          dsCalcFields.forEach(cf => {
            baseGroup.columns.push({
              name: cf.name,
              type: 'number',
              displayName: `fx: ${cf.name}`
            });
          });
        }
      }
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
                  {allCalcFields.filter(cf => cf.datasetId === ds.id).map(cf => (
                    <div key={cf.id} className="text-xs flex items-center justify-between text-primary font-medium group">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500" />
                        fx <i>{cf.name}</i>
                      </div>
                      <X className="w-3 h-3 text-destructive cursor-pointer opacity-0 group-hover:opacity-100" onClick={() => deleteCalcMut.mutate(cf.id)} />
                    </div>
                  ))}
                  <div className="pt-2">
                    <Sheet open={calcOpen && calcDatasetId === ds.id} onOpenChange={(open) => {
                      setCalcOpen(open);
                      if (open) setCalcDatasetId(ds.id);
                    }}>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-primary h-6 justify-start px-0" onClick={() => setCalcDatasetId(ds.id)}>
                          <Plus className="w-3 h-3 mr-1" /> Add Formula
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="bg-card w-[400px] border-l border-border overflow-y-auto z-50">
                        <SheetHeader className="mb-6 border-b border-border pb-4">
                          <SheetTitle className="flex items-center gap-2">
                            <Variable className="w-5 h-5 text-violet-500" /> Formula Editor (DLX)
                          </SheetTitle>
                        </SheetHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Field Name</Label>
                            <Input placeholder="e.g. Profit Margin" value={calcName} onChange={e => setCalcName(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Expression (PostgreSQL Syntax)</Label>
                            <textarea
                              className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                              placeholder='e.g. "sales" - "cost"'
                              value={calcFormula}
                              onChange={e => setCalcFormula(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Use double quotes for column names (e.g. <code className="text-violet-500">"revenue" / "orders"</code>). No subqueries allowed here.</p>
                          </div>
                          <Button className="w-full" disabled={!calcName || !calcFormula || createCalcMut.isPending} onClick={() => {
                            createCalcMut.mutate({ datasetId: ds.id, name: calcName, formula: calcFormula }, {
                              onSuccess: () => {
                                toast({ title: 'Formula saved successfully.' });
                                setCalcName('');
                                setCalcFormula('');
                                setCalcOpen(false);
                              }
                            });
                          }}>
                            Save Calculated Field
                          </Button>
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                </div>
              </div>
            ))}
            {dataSets.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No datasets available.</p>
            )}
          </div>
        </div>

        {/* MIDDLE PANEL: Main Canvas */}
        <div
          className="flex-1 overflow-y-auto p-6 relative"
          onClick={(e) => {
            if (!isCommentMode || !activeDashboardId) return;
            if ((e.target as HTMLElement).closest('.comment-pin') || (e.target as HTMLElement).closest('.comment-popover')) return;
            const rect = e.currentTarget.getBoundingClientRect();
            // Optional: You could adjust to scroll offset if scrolling happens on this container
            const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
            const y = e.clientY - rect.top + e.currentTarget.scrollTop;
            setNewCommentPos({ x, y });
            setNewCommentText('');
          }}
          style={{ cursor: isCommentMode ? 'crosshair' : 'default' }}
        >
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
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground relative z-10">
              <Columns className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No Dashboard Active</p>
              <p className="text-sm">Select or create one to start building.</p>
            </div>
          ) : (
            <>
              {/* Contextual Comments Render */}
              {comments.map((comment: any) => (
                <div key={comment.id} className="absolute comment-pin z-40 transition-transform hover:scale-110" style={{ left: comment.positionX, top: comment.positionY }}>
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer ring-2 ring-background group relative">
                    <MessageSquare className="w-3 h-3" />
                    <div className="hidden group-hover:block absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-card border border-border rounded-lg shadow-xl p-3 z-50 text-left cursor-default">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground">{comment.user?.name || 'User'}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(comment.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-foreground/90">{comment.content}</p>
                      {/* Optional delete button if owner: */}
                      <div className="mt-2 flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-5 w-5 hover:text-destructive" onClick={(e) => {
                          e.stopPropagation();
                          deleteCommentMut.mutate(comment.id);
                        }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {isCommentMode && newCommentPos && (
                <div className="absolute comment-popover z-50 bg-card border border-border shadow-xl rounded-lg p-3 w-64" style={{ left: newCommentPos.x + 10, top: newCommentPos.y + 10 }}>
                  <textarea
                    autoFocus
                    placeholder="Type your comment..."
                    value={newCommentText}
                    onChange={e => setNewCommentText(e.target.value)}
                    className="w-full h-20 text-sm bg-background/50 border border-input rounded flex p-2 mb-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none placeholder:text-muted-foreground text-foreground"
                  />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setNewCommentPos(null)} className="h-7 text-xs">Cancel</Button>
                    <Button size="sm" onClick={() => {
                      if (!newCommentText.trim() || !activeDashboardId) return;
                      createCommentMut.mutate({
                        dashboardId: activeDashboardId,
                        content: newCommentText.trim(),
                        posX: newCommentPos.x,
                        posY: newCommentPos.y,
                      });
                      setNewCommentPos(null);
                    }} className="h-7 text-xs bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" disabled={createCommentMut.isPending}>
                      {createCommentMut.isPending ? 'Posting...' : 'Post'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Live Cursors Overlay */}
              <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
                {Object.values(cursors).map(c => (
                  <motion.div
                    key={c.userId}
                    className="absolute flex flex-col items-start drop-shadow-md"
                    animate={{ x: c.x, y: c.y }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.5 }}
                  >
                    <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute -top-2 -left-2 drop-shadow-sm">
                      <path d="M5.65376 2.15376C5.4041 1.9041 5 2.0809 5 2.43431V28.5657C5 28.9191 5.4041 29.0959 5.65376 28.8462L11 23.5H19.5657C19.9191 23.5 20.0959 23.0959 19.8462 22.8462L5.65376 2.15376Z" fill={c.color} />
                    </svg>
                    <div className="mt-5 ml-4 px-2 py-0.5 rounded text-[11px] text-white font-medium whitespace-nowrap shadow-sm opacity-90" style={{ backgroundColor: c.color }}>
                      {c.userName}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">{activeDashboard.name}</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant={isCommentMode ? 'default' : 'outline'}
                    onClick={() => {
                      setIsCommentMode(!isCommentMode);
                      setNewCommentPos(null);
                    }}
                    className={isCommentMode ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-all font-medium" : "text-primary border-primary/30 hover:bg-primary/20 transition-all font-medium"}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" /> {isCommentMode ? 'Exit Comments' : 'Comments'}
                  </Button>
                  <Button onClick={handleAddWidgetPlaceholder} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
                    <Plus className="w-4 h-4 mr-2" /> Add Blank Widget
                  </Button>
                </div>
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

                        <div className={`p-4 ${widget.type === 'stat' ? 'h-[180px]' : (widget.type === 'text' || widget.type === 'action') ? 'h-[180px]' : 'h-[300px]'}`}>
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
                      {selectedWidget.type === 'action' ? (
                        <>
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Target Endpoint</Label>
                          <div>
                            <Label className="text-xs mb-1 block">URL</Label>
                            <Input
                              placeholder="https://api.example.com/webhook"
                              value={selectedWidget.actionConfig?.url || ''}
                              onChange={e => {
                                const conf = selectedWidget.actionConfig || { url: '', method: 'POST', bodyTemplate: '' };
                                updateSelectedWidget({ actionConfig: { ...conf, url: e.target.value } });
                              }}
                              className="bg-muted/50"
                            />
                          </div>
                          <div>
                            <Label className="text-xs mb-1 block">Method</Label>
                            <Select
                              value={selectedWidget.actionConfig?.method || 'POST'}
                              onValueChange={(v: any) => {
                                const conf = selectedWidget.actionConfig || { url: '', method: 'POST', bodyTemplate: '' };
                                updateSelectedWidget({ actionConfig: { ...conf, method: v } });
                              }}
                            >
                              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="DELETE">DELETE</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <Label className="text-xs block">Headers (Auth, etc.)</Label>
                              <Button variant="ghost" size="sm" className="h-4 text-[10px] px-1" onClick={() => {
                                const conf = selectedWidget.actionConfig || { url: '', method: 'POST', headers: [] };
                                const headers = [...(conf.headers || []), { key: '', value: '' }];
                                updateSelectedWidget({ actionConfig: { ...conf, headers } });
                              }}><Plus className="w-3 h-3 mr-1" />Add</Button>
                            </div>
                            <div className="space-y-2">
                              {(selectedWidget.actionConfig?.headers || []).map((h, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                  <Input placeholder="Key" value={h.key} className="h-8 text-xs bg-muted/50" onChange={e => {
                                    const headers = [...(selectedWidget.actionConfig?.headers || [])];
                                    headers[i].key = e.target.value;
                                    updateSelectedWidget({ actionConfig: { ...selectedWidget.actionConfig!, headers } });
                                  }} />
                                  <Input placeholder="Value" value={h.value} className="h-8 text-xs bg-muted/50" onChange={e => {
                                    const headers = [...(selectedWidget.actionConfig?.headers || [])];
                                    headers[i].value = e.target.value;
                                    updateSelectedWidget({ actionConfig: { ...selectedWidget.actionConfig!, headers } });
                                  }} />
                                  <X className="w-4 h-4 cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => {
                                    const headers = [...(selectedWidget.actionConfig?.headers || [])];
                                    headers.splice(i, 1);
                                    updateSelectedWidget({ actionConfig: { ...selectedWidget.actionConfig!, headers } });
                                  }} />
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs mb-1 block">JSON Body <span className="text-[10px] text-muted-foreground">(Use {'{{parameter_name}}'} for variables)</span></Label>
                            <textarea
                              className="flex min-h-[100px] w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary font-mono"
                              placeholder='{"status": "approved", "account": "{{user_id}}"}'
                              value={selectedWidget.actionConfig?.bodyTemplate || ''}
                              onChange={e => {
                                const conf = selectedWidget.actionConfig || { url: '', method: 'POST' };
                                updateSelectedWidget({ actionConfig: { ...conf, bodyTemplate: e.target.value } });
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
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
