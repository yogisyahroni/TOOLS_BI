/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Plus, Trash2, GripVertical, BarChart3, X, Move, Maximize2, Minimize2, Loader2,
  LineChart, PieChart, AreaChart, ScatterChart as ScatterIcon,
  Radar, TrendingUp, Grid3X3, Flame, Box, Settings, Database, Edit2, Columns, Filter,
  HelpCircle, ChevronRight, Share2, Users, Search, Check, Download, MousePointer2, Settings2, AlertCircle, Variable, PenTool, Braces, Link2, Sparkles, MessageSquare, Zap, Gauge, SunMedium, Network, Combine, Hash, Type, FunctionSquare, ExternalLink
} from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useRelationships, useAutoJoinQuery, useFormatRules, useCreateFormatRule, useDeleteFormatRule, useParameters, useCreateParameter, useDeleteParameter, useUpdateParameter, useDrillConfig, useSaveDrillConfig, useCalcFields, useCreateCalcField, useDeleteCalcField, useExecuteAction, useComments, useCreateComment, useDeleteComment, useDatasets, useDatasetData, useDashboards, useCreateDashboard, useUpdateDashboard, useDeleteDashboard, useCharts } from '@/hooks/useApi';
import { useGraphQLDashboardBundle } from '@/hooks/useGraphQLDashboard';
import { useMultiplayer } from '@/hooks/useMultiplayer';
import type { WidgetType, Widget, DashboardConfig } from '@/types/data';
import type { DashboardParameter } from '@/lib/api';
import { HelpTooltip } from '@/components/HelpTooltip';
import { ChartRenderer } from '../components/ChartRenderer';
import { TextEditorModal } from '@/components/TextEditorModal';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const AnyResponsiveGridLayout = ResponsiveGridLayout as any;

function WidgetChartRenderer({ widget, metaDs, renderFn }: { widget: any, metaDs: any, renderFn: (w: any, ds: any, isLoading: boolean) => React.ReactNode }) {
  const { data: __datasetDataRes, isLoading } = useDatasetData(widget.dataSetId || '', { limit: 10000 });
  const ds = React.useMemo(() => {
    if (!metaDs) return null;
    return { ...metaDs, data: __datasetDataRes?.data || [] };
  }, [metaDs, __datasetDataRes]);

  return <>{renderFn(widget, ds, isLoading)}</>;
}

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
  const queryClient = useQueryClient();
  const { data: dashboardsData = [] } = useDashboards();
  const dashboards = dashboardsData as unknown as DashboardConfig[];
  const createDashboardMut = useCreateDashboard();
  const updateDashboardMut = useUpdateDashboard();
  const deleteDashboardMut = useDeleteDashboard();
  const { data: dataSets = [] } = useDatasets();
  const { data: savedCharts = [] } = useCharts(); // Load Saved Charts
  const { toast } = useToast();

  const [containerWidth, setContainerWidth] = useState(1200);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const draggedItemRef = useRef<any>(null);

  useEffect(() => {
    if (!gridContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(gridContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const [activeDashboardId, setActiveDashboardId] = useState('');
  const [editingTextWidgetId, setEditingTextWidgetId] = useState<string | null>(null);

  // ── GraphQL cache-warmer (Phase 38) ─────────────────────────────────────────
  // Fires a single `/graphql` query that returns the full bundle (dashboard meta
  // + all charts + all dataset schemas).  We seed the TanStack Query cache so
  // that `useDatasetData` calls inside `WidgetChartRenderer` often find a warm
  // cache hit and skip individual REST round-trips.
  // If /graphql is unreachable (cold start, network error) the error is silently
  // swallowed — REST hooks continue to work identically.
  const { data: gqlBundle } = useGraphQLDashboardBundle(activeDashboardId || null);

  useEffect(() => {
    if (!gqlBundle || !activeDashboardId) return;

    // Seed dataset metadata cache so widgets that call useDatasets() get a hit.
    if (gqlBundle.datasets.length > 0) {
      queryClient.setQueryData(['datasets'], (old: unknown) => {
        // Merge — keep existing if already fresh to avoid overwriting REST data.
        if (Array.isArray(old) && old.length >= gqlBundle.datasets.length) return old;
        // Map GQL dataset to the same shape REST returns (best-effort).
        return gqlBundle.datasets.map((ds) => ({
          id:            ds.id,
          user_id:       ds.userId,
          name:          ds.name,
          file_name:     ds.fileName,
          row_count:     ds.rowCount,
          size_bytes:    ds.sizeBytes,
          columns:       ds.columns,
          data_table_name: ds.dataTableName,
          created_at:    ds.createdAt,
          updated_at:    ds.updatedAt,
        }));
      });
    }

    // Seed charts cache.
    if (gqlBundle.charts.length > 0) {
      queryClient.setQueryData(['charts'], (old: unknown) => {
        if (Array.isArray(old) && old.length >= gqlBundle.charts.length) return old;
        return gqlBundle.charts.map((c) => ({
          id:          c.id,
          user_id:     c.userId,
          dataset_id:  c.datasetId,
          title:       c.title,
          type:        c.type,
          x_axis:      c.xAxis,
          y_axis:      c.yAxis,
          group_by:    c.groupBy,
          annotations: c.annotations,
          created_at:  c.createdAt,
        }));
      });
    }
  }, [gqlBundle, activeDashboardId, queryClient]);
  // ── End GraphQL cache-warmer ─────────────────────────────────────────────────
  const [newDashName, setNewDashName] = useState('');
  const [activeFilter, setActiveFilter] = useState<{ column: string; value: string } | null>(null);

  // Selection state for Property Right Panel
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  const safeDashboards = Array.isArray(dashboards) ? dashboards : [];
  const activeDashboard: any = safeDashboards.find((d: any) => d.id === activeDashboardId) || null;
  const safeWidgets = Array.isArray(activeDashboard?.widgets) ? activeDashboard.widgets : [];

  // Debug Log State Re-renders
  useEffect(() => {
    console.log('[DEBUG RENDER] safeWidgets changed. Length:', safeWidgets.length, 'activeDashboardId:', activeDashboardId, safeWidgets);
  }, [safeWidgets.length, activeDashboardId]);

  const selectedWidget: any = safeWidgets.find((w: any) => w.id === selectedWidgetId) || null;

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
          queryClient.setQueryData(['dashboards'], (old: any) => {
            if (!old) return old;
            return old.map((d: any) => d.id === activeDashboardId ? { ...d, widgets: remoteWidgets } : d);
          });
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
        queryClient.setQueryData(['dashboards'], (old: any) => {
          if (!old) return old;
          return old.map((d: any) => d.id === activeDashboardId ? { ...d, widgets: remoteWidgets } : d);
        });
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



  const createDashboard = () => {
    if (!newDashName.trim()) return;
    createDashboardMut.mutate({
      name: newDashName.trim(),
      widgets: []
    }, {
      onSuccess: (response) => {
        const data = response.data;
        setActiveDashboardId(data.id);
        setNewDashName('');
        toast({ title: 'Dashboard created', description: data.name });
      }
    });
  };

  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [newWidgetDatasetId, setNewWidgetDatasetId] = useState('');

  const handleUpdateWidgets = (newWidgets: any[]) => {
    if (!activeDashboard) {
      console.error('[DEBUG UPDATE] activeDashboard is null, aborting handleUpdateWidgets');
      return;
    }

    console.log('[DEBUG UPDATE] Committing new widgets array length:', newWidgets.length);

    // Optimistic Update local Query Cache
    // Access queryClient from the top of the component
    queryClient.setQueryData(['dashboards'], (oldData: any) => {
      console.log('[DEBUG QUERY CACHE SET] oldData:', oldData);
      if (!oldData || !Array.isArray(oldData)) return oldData;
      const updated = oldData.map((d: any) => d.id === activeDashboard.id ? { ...d, widgets: newWidgets } : d);
      console.log('[DEBUG QUERY CACHE SET] new mapped data:', updated);
      return updated;
    });

    // DB Call
    console.log('[DEBUG UPDATE] Sending mutate command to backend...');
    updateDashboardMut.mutate(
      { id: activeDashboard.id, payload: { widgets: newWidgets } },
      {
        onSuccess: (data) => {
          console.log('[DEBUG UPDATE SUCCESS] server returned:', data);
          queryClient.invalidateQueries({ queryKey: ['dashboards'] });
        },
        onError: (err) => {
          console.error('[DEBUG UPDATE ERROR]', err);
        }
      }
    );

    // Multiplayer Sync
    syncToYjs(newWidgets);
  };

  const handleAddWidget = (datasetId: string) => {
    if (!activeDashboard) return;
    const newId = Date.now().toString();
    const widget: Widget = {
      id: newId, type: 'bar', title: 'New Widget',
      dataSetId: datasetId, xAxis: '', yAxis: '', width: 'half',
      x: 0, y: Infinity, w: 6, h: 4
    };
    const newWidgets = [...safeWidgets, widget];
    handleUpdateWidgets(newWidgets);
    setSelectedWidgetId(newId);
    toast({ title: 'Widget Ditambahkan', description: 'Silahkan atur properti widget di panel kanan.' });
  };

  const gridLayouts = useMemo(() => ({
    lg: safeWidgets.map((w: any) => ({
      i: w.id,
      x: w.x ?? 0,
      y: w.y ?? Infinity,
      w: w.w ?? (w.width === 'full' ? 12 : w.width === 'half' ? 6 : 4),
      h: w.h ?? (w.type === 'stat' || w.type === 'text' || w.type === 'action' ? 2 : 4)
    }))
  }), [safeWidgets]);

  const updateSelectedWidget = (updates: Partial<Widget>) => {
    if (!activeDashboard || !selectedWidgetId) return;
    const newWidgets = safeWidgets.map((w: any) => w.id === selectedWidgetId ? { ...w, ...updates } : w);
    handleUpdateWidgets(newWidgets);
  };

  const removeWidget = (widgetId: string) => {
    if (!activeDashboard) return;
    const newWidgets = safeWidgets.filter((w: any) => w.id !== widgetId);
    handleUpdateWidgets(newWidgets);
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null);
  };

  const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
    if (!activeDashboard) return;
    const idx = safeWidgets.findIndex((w: any) => w.id === widgetId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === safeWidgets.length - 1) return;

    const newWidgets = [...safeWidgets];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newWidgets[idx], newWidgets[swapIdx]] = [newWidgets[swapIdx], newWidgets[idx]];

    handleUpdateWidgets(newWidgets);
  };

  const handleDeleteDashboard = (id: string) => {
    deleteDashboardMut.mutate(id, {
      onSuccess: () => {
        if (activeDashboardId === id) {
          setActiveDashboardId('');
          setSelectedWidgetId(null);
        }
        toast({ title: 'Dashboard deleted' });
      }
    });
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

    return filteredData;
  };

  const getWidgetXAxis = (widget: Widget, datasetId: string) => {
    return widget.xAxis;
  };

  const renderWidgetChart = (widget: Widget, ds: any, isLoading: boolean) => {
    if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    if (!ds) return <p className="text-muted-foreground text-center mt-8 text-sm">Dataset not found</p>;

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
        <div 
          className="flex flex-col h-full w-full p-4 overflow-auto group relative cursor-pointer hover:bg-muted/10 transition-colors"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingTextWidgetId(widget.id);
          }}
        >
          {widget.htmlContent ? (
            <div 
              className="prose prose-sm xl:prose-base dark:prose-invert max-w-none w-full"
              dangerouslySetInnerHTML={{ __html: widget.htmlContent }} 
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-muted-foreground text-center text-sm">{widget.title}</p>
              <p className="text-muted-foreground/50 text-center text-xs mt-2">Double click to edit text</p>
            </div>
          )}
          
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm border-border pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                setEditingTextWidgetId(widget.id);
              }}
            >
              <Edit2 className="h-3.5 w-3.5 text-foreground" />
            </Button>
          </div>
        </div>
      );
    }

    const filteredData = processData(widget, ds);
    const filteredDataset = { ...ds, data: filteredData };
    
    const numericColumns = ds.columns?.filter((c: any) => c.type && ['number', 'numeric', 'int', 'integer', 'float', 'decimal', 'double precision'].some(val => c.type.toLowerCase().includes(val))) || [];
    const categoricalColumns = ds.columns?.filter((c: any) => !numericColumns.includes(c)) || [];

    return (
      <div className="w-full h-full relative">
        <ChartRenderer
          chartTitle={widget.title}
          chartType={widget.type}
          xAxis={getWidgetXAxis(widget, widget.dataSetId)}
          yAxis={widget.yAxis}
          groupBy={widget.groupBy}
          dataLimit={String(widget.limit || 50)}
          dataset={filteredDataset}
          numericColumns={numericColumns}
          categoricalColumns={categoricalColumns}
          sortOrder={widget.sortOrder || 'none'}
        />
      </div>
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
      <div className="border-b border-border bg-background/80 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0 z-40 sticky top-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <LayoutGrid className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Unified Dashboard</h1>
              {activeDashboardId && (
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/20 font-normal">
                  Auto-saved
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Build, edit, and explore in one place <HelpTooltip text="Buka dataset di kiri, bangun canvas di tengah, dan atur detail widget di kanan." /></p>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          {activeDashboardId && (
            <Button variant="outline" className="border-border text-foreground gap-2" onClick={() => window.open('/embed', '_blank')}>
              <Share2 className="w-4 h-4" /> Share
            </Button>
          )}

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

      <div className="flex flex-1 overflow-hidden bg-muted/20 relative">
        {/* LEFT PANEL: Saved Charts Library */}
        <div className="w-72 border-r border-border bg-card/80 backdrop-blur-sm hidden md:flex flex-col shadow-sm z-30">
          <div className="p-4 border-b border-border font-semibold flex items-center justify-between text-foreground">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" /> Charts Library
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.location.href = '/chart-builder'}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {savedCharts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-background rounded-xl border border-dashed border-border shadow-sm mt-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 shadow-inner">
                  <PieChart className="w-6 h-6 text-primary/70" />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1.5">Belum Ada Chart</h4>
                <p className="text-xs text-muted-foreground mb-5 leading-relaxed">Buat chart terlebih dahulu di Data Explorer (Chart Builder).</p>
                <Button variant="default" size="sm" className="w-full text-xs shadow-sm bg-primary hover:bg-primary/90 transition-colors" onClick={() => window.location.href = '/chart-builder'}>
                  <BarChart3 className="w-3.5 h-3.5 mr-2" /> Buka Chart Builder
                </Button>
              </div>
            ) : (
              savedCharts.map(chart => {
                const Icon = WIDGET_TYPES.find(wt => wt.id === chart.type)?.icon || BarChart3;
                return (
                  <div
                    key={chart.id}
                    className="bg-background rounded-xl border border-border/50 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-border/80 group cursor-grab active:cursor-grabbing"
                    draggable={true}
                    unselectable="on"
                    onDragStart={(e) => {
                      const dragData = {
                        source: 'saved-chart',
                        chartId: chart.id,
                        title: chart.title,
                        type: chart.type,
                        datasetId: chart.datasetId,
                        xAxis: chart.xAxis,
                        yAxis: chart.yAxis,
                        groupBy: chart.groupBy
                      };
                      draggedItemRef.current = dragData;
                      e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <div className="p-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-foreground truncate" title={chart.title}>{chart.title}</h4>
                        <p className="text-[10px] text-muted-foreground truncate">{chart.type} • {chart.xAxis}</p>
                      </div>
                    </div>
                    <div className="px-3 pb-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs h-7 shadow-sm bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-colors"
                        onClick={() => {
                          if (!activeDashboardId) {
                            toast({ title: 'Pilih Dashboard', description: 'Buat atau pilih dashboard terlebih dahulu.', variant: 'destructive' });
                            return;
                          }
                          const newWidget = {
                            id: crypto.randomUUID(),
                            title: chart.title,
                            type: chart.type as any, // Cast to any to satisfy WidgetType compatibility if strict
                            dataSetId: chart.datasetId, // Mapping API `datasetId` to Widget `dataSetId`
                            xAxis: chart.xAxis,
                            yAxis: chart.yAxis,
                            groupBy: chart.groupBy || '',
                            width: 'half',
                            x: 0,
                            y: Infinity,
                            w: 6,
                            h: 4
                          };

                          // Handle local optimistic update, ydoc sync AND internal updateDashboardMut
                          const newWidgets = [...safeWidgets, newWidget];
                          handleUpdateWidgets(newWidgets);
                          toast({ title: 'Widget Ditambahkan', description: chart.title });
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Tambah ke Canvas
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* MIDDLE PANEL: Main Canvas */}
        <div
          ref={gridContainerRef}
          className="flex-1 overflow-y-auto p-8 relative"
          onClick={(e) => {
            if (!isCommentMode || !activeDashboardId) return;
            if ((e.target as HTMLElement).closest('.comment-pin') || (e.target as HTMLElement).closest('.comment-popover')) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
            const y = e.clientY - rect.top + e.currentTarget.scrollTop;
            setNewCommentPos({ x, y });
            setNewCommentText('');
          }}
          style={{
            cursor: isCommentMode ? 'crosshair' : 'default',
            backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)',
            backgroundSize: '24px 24px'
          }}
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
                  <Button onClick={() => setIsAddingWidget(true)} className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all font-medium hidden">
                    <Plus className="w-4 h-4 mr-2" /> Tambah Widget Baru
                  </Button>
                </div>
              </div>

              <div
                className="relative min-h-[500px] w-full"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                  }
                }}
                onDrop={async (e) => {
                  // Fallback drop handler if RGL ignores the drop or if canvas is completely empty
                  try {
                    let parsed = draggedItemRef.current;
                    if (!parsed) {
                      const transferData = e.dataTransfer?.getData('text/plain');
                      if (!transferData) return;
                      parsed = JSON.parse(transferData);
                    }

                    if (parsed && parsed.source === 'saved-chart') {
                      let targetDashId = activeDashboardId;
                      let targetWidgets = safeWidgets;

                      // Auto-Create dashboard if empty
                      if (!targetDashId) {
                        toast({ title: 'Creating Dashboard...' });
                        const newDash = await createDashboardMut.mutateAsync({
                          name: 'Untitled Dashboard',
                          isPublic: false,
                          widgets: []
                        });
                        targetDashId = newDash.data.id;
                        setActiveDashboardId(newDash.data.id);
                        targetWidgets = []; // Fresh array
                      }

                      const newWidget = {
                        id: crypto.randomUUID(),
                        title: parsed.title,
                        type: parsed.type,
                        dataSetId: parsed.datasetId,
                        xAxis: parsed.xAxis,
                        yAxis: parsed.yAxis,
                        groupBy: parsed.groupBy || '',
                        width: 'half',
                        x: 0,
                        y: Infinity, // forces to bottom
                        w: 6,
                        h: 4
                      };

                      const newWidgets = [...targetWidgets, newWidget];

                      // Using the explicit mutation here instead of handleUpdateWidgets to ensure 
                      // we pass the correct auto-created dashboard ID.
                      updateDashboardMut.mutate(
                        { id: targetDashId, payload: { widgets: newWidgets } },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({ queryKey: ['dashboards'] });
                            toast({ title: 'Widget Ditambahkan', description: parsed.title });
                          }
                        }
                      );

                      draggedItemRef.current = null; // reset
                    }
                  } catch (error) {
                    console.error("Fallback Drop Parse Error", error);
                  }
                }}
              >
                {safeWidgets.length === 0 && (
                  <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center pt-12">
                    <div className="rounded-2xl p-16 border-2 border-border border-dashed text-center bg-card/50 backdrop-blur-sm max-w-2xl mx-auto shadow-sm">
                      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <LayoutGrid className="w-8 h-8 text-primary/60" />
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2">Kanvas Masih Kosong</h3>
                      <p className="text-muted-foreground mb-6">Mulai bangun dashboard analitik Anda dengan menyeret chart dari library di sebelah kiri.</p>
                    </div>
                  </div>
                )}
                <AnyResponsiveGridLayout
                  className="layout -mx-4"
                  style={{ minHeight: 500 }}
                  width={containerWidth}
                  layouts={gridLayouts}
                  breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                  cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                  rowHeight={80}
                  onLayoutChange={(currentLayout: any) => {
                    // Update the x,y,w,h in safeWidgets
                    const newWidgets = safeWidgets.map((w: any) => {
                      const lay = currentLayout.find((l: any) => l.i === w.id);
                      if (lay) {
                        return { ...w, x: lay.x, y: lay.y, w: lay.w, h: lay.h };
                      }
                      return w;
                    });

                    // Prevent infinite loops by checking if changed
                    const changed = newWidgets.some((nw: any, i: number) =>
                      nw.x !== safeWidgets[i].x || nw.y !== safeWidgets[i].y || nw.w !== safeWidgets[i].w || nw.h !== safeWidgets[i].h
                    );

                    if (changed) {
                      handleUpdateWidgets(newWidgets);
                    }
                  }}
                  margin={[24, 24]}
                  isDroppable={true}
                  droppingItem={{ i: 'drop', w: 6, h: 4, x: 0, y: 0 }}
                  onDrop={(layout: any, layoutItem: any, _event: any) => {
                    const e = _event as unknown as React.DragEvent;
                    if (e.preventDefault) e.preventDefault();
                    if (!activeDashboardId) return;

                    try {
                      let parsed = draggedItemRef.current;

                      if (!parsed) {
                        const transferData = e.dataTransfer?.getData('text/plain');
                        if (!transferData) return;
                        parsed = JSON.parse(transferData);
                      }

                      if (parsed && parsed.source === 'saved-chart') {
                        const newWidget = {
                          id: crypto.randomUUID(),
                          title: parsed.title,
                          type: parsed.type,
                          dataSetId: parsed.datasetId,
                          xAxis: parsed.xAxis,
                          yAxis: parsed.yAxis,
                          groupBy: parsed.groupBy || '',
                          width: 'half',
                          x: layoutItem.x,
                          y: layoutItem.y,
                          w: 6,
                          h: 4
                        };

                        const newWidgets = [...safeWidgets, newWidget];
                        handleUpdateWidgets(newWidgets);
                        toast({ title: 'Widget Ditambahkan', description: parsed.title });
                        draggedItemRef.current = null; // reset
                      }
                    } catch (error) {
                      console.error("Drop Parse Error", error);
                    }
                  }}
                >
                  {safeWidgets.map((widget: any) => (
                    <div key={widget.id}
                      onClick={() => setSelectedWidgetId(widget.id)}
                      className={`rounded-xl border shadow-sm hover:shadow-md overflow-hidden bg-card/90 backdrop-blur-sm cursor-pointer flex flex-col ${selectedWidgetId === widget.id ? 'ring-2 ring-primary border-transparent shadow-lg scale-[1.01]' : 'border-border hover:border-primary/40'}`}>

                      <div className={`drag-handle flex-none p-3 border-b flex items-center justify-between transition-colors ${selectedWidgetId === widget.id ? 'bg-primary/5 border-primary/20' : 'border-border bg-muted/20'}`}>
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                          <span className="font-semibold text-foreground text-sm line-clamp-1">{widget.title || 'Untitled'}</span>
                        </div>

                        <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}>
                            <X className="w-3.5 h-3.5 hover:text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 p-4">
                        <WidgetChartRenderer
                          widget={widget}
                          metaDs={dataSets.find(d => d.id === widget.dataSetId)}
                          renderFn={renderWidgetChart}
                        />
                      </div>
                    </div>
                  ))}
                </AnyResponsiveGridLayout>
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL: Widget Properties */}
        <AnimatePresence>
          {selectedWidgetId && selectedWidget && (
            <motion.div initial={{ width: 0, opacity: 0, x: 20 }} animate={{ width: 340, opacity: 1, x: 0 }} exit={{ width: 0, opacity: 0, x: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="border-l border-border bg-card/90 backdrop-blur-xl flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.15)] z-50 absolute top-0 right-0 h-full">

              <div className="p-5 border-b border-border flex items-center justify-between bg-muted/10">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Settings2 className="w-5 h-5 text-primary" /> Pengaturan Widget
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive rounded-full" onClick={() => setSelectedWidgetId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  <div className="space-y-4">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><LayoutGrid className="w-3.5 h-3.5" /> Pengaturan Dasar</Label>
                    <div className="bg-muted/20 p-4 rounded-xl border border-border space-y-4">
                      <div>
                        <Label className="text-xs font-medium mb-1.5 block">Judul Widget</Label>
                        <Input value={selectedWidget.title} onChange={e => updateSelectedWidget({ title: e.target.value })} className="bg-background shadow-sm" />
                      </div>
                      <div>
                        <Label className="text-xs font-medium mb-1.5 block">Ukuran Lebar</Label>
                        <Select value={selectedWidget.width} onValueChange={(v: any) => updateSelectedWidget({ width: v })}>
                          <SelectTrigger className="bg-background shadow-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="third">Kecil (1/3)</SelectItem>
                            <SelectItem value="half">Sedang (1/2)</SelectItem>
                            <SelectItem value="full">Besar (Menyebar Penuh)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                    ) : selectedWidget.type === 'text' ? null : (
                      <div className="space-y-4">
                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Settings2 className="w-3.5 h-3.5" /> Konfigurasi Chart</Label>
                        <div className="bg-muted/20 p-4 rounded-xl border border-border flex flex-col items-center justify-center text-center space-y-3">
                          <PieChart className="w-8 h-8 text-muted-foreground/50" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Chart dikelola di Data Explorer</p>
                            <p className="text-xs text-muted-foreground mt-1">Struktur chart, sumbu, dan agregasi terinkronisasi dari Saved Chart ini. Buka Chart Builder untuk memodifikasi logikanya.</p>
                          </div>
                          <Button variant="outline" className="w-full text-xs mt-2 border-primary/30 text-primary hover:bg-primary/10" onClick={() => window.open(`/chart-builder?edit=${selectedWidget.dataSetId}`, '_blank')}>
                            <ExternalLink className="w-3.5 h-3.5 mr-2" /> Buka Chart Builder
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Add Widget Dialog */}
      <Dialog open={isAddingWidget} onOpenChange={setIsAddingWidget}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Pilih Sumber Dataset</DialogTitle>
            <DialogDescription>
              Tentukan dataset mana yang ingin Anda hubungkan ke Widget baru ini.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tersedia {dataSets.length} Dataset</Label>
              <Select value={newWidgetDatasetId} onValueChange={setNewWidgetDatasetId}>
                <SelectTrigger className="w-full shadow-sm">
                  <SelectValue placeholder="Pilih dataset..." />
                </SelectTrigger>
                <SelectContent>
                  {dataSets.map(ds => (
                    <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                  ))}
                  {dataSets.length === 0 && (
                    <SelectItem value="none" disabled>Tidak ada dataset ditemukan</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddingWidget(false)}>Batal</Button>
            <Button onClick={() => {
              if (!newWidgetDatasetId) return toast({ title: 'Aksi Ditolak', description: 'Pilih dataset terlebih dahulu!', variant: 'destructive' });
              handleAddWidget(newWidgetDatasetId);
              setIsAddingWidget(false);
              setNewWidgetDatasetId('');
            }} className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all">
              Tambahkan Widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Text Editor Modal */}
      {editingTextWidgetId && (
        <TextEditorModal
          isOpen={true}
          onClose={() => setEditingTextWidgetId(null)}
          initialHtml={dashboards.find(d => d.id === activeDashboardId)?.widgets.find(w => w.id === editingTextWidgetId)?.htmlContent || ''}
          onSave={(html) => {
            const dashboard = dashboards.find(d => d.id === activeDashboardId);
            if (!dashboard) return;
            const newWidgets = dashboard.widgets.map(w => w.id === editingTextWidgetId ? { ...w, htmlContent: html } : w);
            updateDashboardMut.mutate({ id: dashboard.id, payload: { widgets: newWidgets } }, {
               onSuccess: () => {
                 toast({ title: 'Text Updated', description: 'Text widget content has been saved successfully.' });
               }
            });
            setEditingTextWidgetId(null);
          }}
        />
      )}
    </div >
  );
}
