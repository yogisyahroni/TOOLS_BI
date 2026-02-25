import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layers, ChevronRight, ArrowLeft } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';

const COLORS = [
  'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
];

interface DrillLevel {
  column: string;
  filterValue?: string;
}

export default function DrillDown() {
  const { dataSets } = useDataStore();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [levels, setLevels] = useState<DrillLevel[]>([]);
  const [hierarchy, setHierarchy] = useState<string[]>([]);
  const [metricCol, setMetricCol] = useState('');
  const [aggFn, setAggFn] = useState<'count' | 'sum' | 'avg'>('count');

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);
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

  const addToHierarchy = (col: string) => {
    if (!hierarchy.includes(col)) setHierarchy(prev => [...prev, col]);
  };

  const resetDrill = () => {
    setLevels([]);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Layers className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Drill-Down Explorer <HelpTooltip text="Klik segmen chart untuk drill-down ke level detail berikutnya. Pilih kolom hierarki (misal: Departemen → Kota → Nama) untuk navigasi data bertingkat." /></h1>
            <p className="text-muted-foreground">Navigate data hierarchies by clicking into chart segments</p>
          </div>
        </div>
      </motion.div>

      {/* Config */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[180px]">
            <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
            <Select value={selectedDataSet} onValueChange={v => { setSelectedDataSet(v); setHierarchy([]); setLevels([]); setMetricCol(''); }}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>
                {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs text-muted-foreground mb-1 block">Add Hierarchy Level</label>
            <Select value="none" onValueChange={v => { if (v !== 'none') addToHierarchy(v); }}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Add column" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select column</SelectItem>
                {stringCols.filter(c => !hierarchy.includes(c.name)).map(c =>
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs text-muted-foreground mb-1 block">Metric</label>
            <Select value={metricCol || "none"} onValueChange={v => setMetricCol(v === "none" ? "" : v)}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Count" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Count (rows)</SelectItem>
                {numCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[100px]">
            <label className="text-xs text-muted-foreground mb-1 block">Aggregation</label>
            <Select value={aggFn} onValueChange={v => setAggFn(v as any)}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Count</SelectItem>
                <SelectItem value="sum">Sum</SelectItem>
                <SelectItem value="avg">Average</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Hierarchy breadcrumb */}
        {hierarchy.length > 0 && (
          <div className="flex items-center gap-1 mt-4 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Hierarchy:</span>
            {hierarchy.map((h, i) => (
              <span key={h} className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded ${i === currentDepth ? 'bg-primary/20 text-primary font-bold' : i < currentDepth ? 'bg-muted text-muted-foreground' : 'bg-muted/30 text-muted-foreground'}`}>
                  {h}
                </span>
                {i < hierarchy.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </span>
            ))}
            {hierarchy.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setHierarchy([])} className="ml-2 text-xs h-6">
                Clear
              </Button>
            )}
          </div>
        )}
      </motion.div>

      {/* Drill navigation */}
      {levels.length > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={drillBack}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button variant="ghost" size="sm" onClick={resetDrill}>Reset</Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {levels.map((l, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <span className="text-primary">{l.column}</span> = <span className="font-mono">{l.filterValue}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      {currentColumn && chartData.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">
              {currentColumn} — {filteredData.length} rows
              {currentDepth < hierarchy.length - 1 && <span className="text-xs text-primary ml-2">(click bars to drill down)</span>}
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 47%, 16%)" />
              <XAxis dataKey="name" tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} angle={-30} textAnchor="end" height={80} />
              <YAxis tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(222, 47%, 10%)', border: '1px solid hsl(222, 47%, 16%)', borderRadius: 8 }}
                labelStyle={{ color: 'hsl(210, 40%, 98%)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}
                cursor={currentDepth < hierarchy.length - 1 ? 'pointer' : 'default'}
                onClick={(data) => { if (currentDepth < hierarchy.length - 1) drillInto(data.name); }}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Detail Table */}
          <div className="mt-6 overflow-auto max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground text-xs">{currentColumn}</TableHead>
                  <TableHead className="text-muted-foreground text-xs">{metricCol ? `${aggFn}(${metricCol})` : 'Count'}</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.map(row => (
                  <TableRow key={row.name} className="border-border hover:bg-muted/20 cursor-pointer"
                    onClick={() => { if (currentDepth < hierarchy.length - 1) drillInto(row.name); }}>
                    <TableCell className="text-foreground text-xs font-mono">{row.name}</TableCell>
                    <TableCell className="text-primary text-xs font-mono font-semibold">{row.value.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Layers className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {!dataset ? 'Select a Dataset' : hierarchy.length === 0 ? 'Define a Hierarchy' : 'No data at this level'}
          </h3>
          <p className="text-muted-foreground text-sm">
            {!dataset ? 'Choose a dataset to start drilling' : hierarchy.length === 0 ? 'Add columns to create a drill-down hierarchy (e.g., Department → Role → Name)' : 'Try going back or resetting.'}
          </p>
        </motion.div>
      )}
    </div>
  );
}
