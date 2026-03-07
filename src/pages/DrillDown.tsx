import React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layers, ChevronRight, ArrowLeft, Save, RotateCcw } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';
import { Badge } from '@/components/ui/badge';
import { useDrillConfig, useSaveDrillConfig, useDatasets } from '@/hooks/useApi';
import { useToast } from '@/hooks/use-toast';

const COLORS = [
  'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
];

interface DrillLevel {
  column: string;
  filterValue?: string;
}

export default function DrillDown() {
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [levels, setLevels] = useState<DrillLevel[]>([]);
  const [hierarchy, setHierarchy] = useState<string[]>([]);
  const [metricCol, setMetricCol] = useState('');
  const [aggFn, setAggFn] = useState<'count' | 'sum' | 'avg'>('count');

  // BUG-M2 fix: load persisted config from backend
  const { data: savedConfigs } = useDrillConfig(selectedDataSet || undefined);
  const saveMut = useSaveDrillConfig();

  // When dataset changes, load saved config if available
  useEffect(() => {
    if (selectedDataSet && savedConfigs && savedConfigs.length > 0) {
      const cfg = savedConfigs[0];
      setHierarchy(cfg.hierarchy ?? []);
      setMetricCol(cfg.metricCol ?? '');
      setAggFn(cfg.aggFn ?? 'count');
      setLevels([]);
    } else if (selectedDataSet) {
      setHierarchy([]);
      setMetricCol('');
      setAggFn('count');
      setLevels([]);
    }
  }, [selectedDataSet, savedConfigs]);

  const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(selectedDataSet || '', { limit: 10000 });
  const dataset = React.useMemo(() => {
    const meta = dataSets.find(ds => ds.id === selectedDataSet);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, selectedDataSet, __datasetDataRes]);
  const stringCols = dataset?.columns.filter(c => c.type === 'string') || [];
  const numCols = dataset?.columns.filter(c => c.type === 'number') || [];

  const currentDepth = levels.length;
  const currentColumn = hierarchy[currentDepth];

  // Filter data based on drill levels
  const filteredData = useMemo(() => {
    if (!dataset) return [];
    let data = [...dataset.data];
    for (const level of levels) {
      if (level.filterValue) {
        data = data.filter(r => String(r[level.column]) === level.filterValue);
      }
    }
    return data;
  }, [dataset, levels]);

  // Aggregate for current level
  const chartData = useMemo(() => {
    if (!currentColumn || !filteredData.length) return [];
    const groups: Record<string, number[]> = {};
    filteredData.forEach(row => {
      const key = String(row[currentColumn] ?? 'Unknown');
      if (!groups[key]) groups[key] = [];
      if (metricCol && row[metricCol] != null) {
        groups[key].push(Number(row[metricCol]));
      } else {
        groups[key].push(1);
      }
    });

    return Object.entries(groups).map(([name, vals]) => {
      let value: number;
      switch (aggFn) {
        case 'sum': value = vals.reduce((a, b) => a + b, 0); break;
        case 'avg': value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break;
        default: value = vals.length;
      }
      return { name, value: Math.round(value * 100) / 100, count: vals.length };
    }).sort((a, b) => b.value - a.value).slice(0, 20);
  }, [filteredData, currentColumn, metricCol, aggFn]);

  const drillInto = (value: string) => {
    if (currentDepth >= hierarchy.length - 1) return;
    setLevels(prev => [...prev, { column: currentColumn, filterValue: value }]);
  };

  const drillBack = () => {
    setLevels(prev => prev.slice(0, -1));
  };

  const addHierarchyLevel = (col: string) => {
    if (!hierarchy.includes(col)) setHierarchy(prev => [...prev, col]);
  };

  const removeHierarchyLevel = (col: string) => {
    setHierarchy(prev => prev.filter(c => c !== col));
    setLevels([]);
  };

  // BUG-M2: save config to backend
  const handleSaveConfig = () => {
    if (!selectedDataSet || hierarchy.length === 0) return;
    saveMut.mutate(
      { datasetId: selectedDataSet, hierarchy, metricCol, aggFn },
      {
        onSuccess: () => toast({ title: '✅ Config saved', description: 'Drill hierarchy will be restored on next visit.' }),
        onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Layers className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Drill-Down <HelpTooltip text="Buat hierarki drill-down untuk analisis bertingkat. Konfigurasi disimpan otomatis ke backend." />
            </h1>
            <p className="text-muted-foreground">Interactive hierarchical data exploration</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
          <h3 className="font-semibold text-foreground">Configuration</h3>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
            <Select value={selectedDataSet} onValueChange={setSelectedDataSet}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>
                {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {dataset && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Add Hierarchy Level</label>
                <Select onValueChange={addHierarchyLevel}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Add column..." /></SelectTrigger>
                  <SelectContent>
                    {stringCols.filter(c => !hierarchy.includes(c.name)).map(c =>
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {hierarchy.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Hierarchy Order</label>
                  <div className="space-y-1">
                    {hierarchy.map((col, i) => (
                      <div key={col} className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5">
                        <span className="text-sm">{i + 1}. {col}</span>
                        <button onClick={() => removeHierarchyLevel(col)} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Metric Column</label>
                <Select value={metricCol} onValueChange={setMetricCol}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Count (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Count (default)</SelectItem>
                    {numCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Aggregation</label>
                <Select value={aggFn} onValueChange={(v) => setAggFn(v as 'count' | 'sum' | 'avg')}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Count</SelectItem>
                    <SelectItem value="sum">Sum</SelectItem>
                    <SelectItem value="avg">Average</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleSaveConfig}
                disabled={hierarchy.length === 0 || saveMut.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                {saveMut.isPending ? 'Saving...' : 'Save Config'}
              </Button>
            </>
          )}
        </motion.div>

        {/* Drill Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="lg:col-span-2 bg-card rounded-xl p-6 border border-border shadow-card">

          {/* Breadcrumb */}
          {hierarchy.length > 0 && (
            <div className="flex items-center gap-1 mb-4 flex-wrap">
              <Badge variant="outline" className="text-xs">Root</Badge>
              {levels.map((l, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="secondary" className="text-xs">{l.filterValue}</Badge>
                </span>
              ))}
              {currentColumn && (
                <span className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <Badge className="text-xs">{currentColumn}</Badge>
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">
              {currentColumn ? `${currentColumn} Breakdown` : 'Select a dataset and hierarchy'}
            </h3>
            {levels.length > 0 && (
              <Button variant="outline" size="sm" onClick={drillBack}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
          </div>

          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} onClick={(d) => d.activePayload && drillInto(d.activePayload[0].payload.name)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    formatter={(v) => [v, aggFn === 'count' ? 'Count' : metricCol]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}
                    cursor={currentDepth < hierarchy.length - 1 ? 'pointer' : 'default'}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {currentDepth < hierarchy.length - 1 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Click a bar to drill into {hierarchy[currentDepth + 1]}
                </p>
              )}

              {/* Data Table */}
              <div className="mt-4 border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{currentColumn}</TableHead>
                      <TableHead className="text-right">
                        {aggFn === 'count' ? 'Count' : `${aggFn}(${metricCol})`}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chartData.slice(0, 10).map((row) => (
                      <TableRow key={row.name}
                        className={currentDepth < hierarchy.length - 1 ? 'cursor-pointer hover:bg-muted/30' : ''}
                        onClick={() => currentDepth < hierarchy.length - 1 && drillInto(row.name)}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right font-mono">{row.value.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <RotateCcw className="w-12 h-12 mb-4 opacity-30" />
              <p>{!selectedDataSet ? 'Select a dataset to begin' : hierarchy.length === 0 ? 'Add hierarchy levels to start drilling' : 'No data at this level'}</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
