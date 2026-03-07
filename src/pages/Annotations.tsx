import React from 'react';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { StickyNote, Plus, Trash2, Loader2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useAnnotations, useCreateAnnotation, useDeleteAnnotation, useDatasets, useDatasetData } from '@/hooks/useApi';

const ANNO_COLORS = [
  { label: 'Red', value: 'hsl(0 72% 51%)' },
  { label: 'Green', value: 'hsl(142 76% 36%)' },
  { label: 'Blue', value: 'hsl(199 89% 48%)' },
  { label: 'Yellow', value: 'hsl(38 92% 50%)' },
];

export default function Annotations() {
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();
  const [dsId, setDsId] = useState('');
  const [xCol, setXCol] = useState('');
  const [yCol, setYCol] = useState('');
  const [annoLabel, setAnnoLabel] = useState('');
  const [annoValue, setAnnoValue] = useState('');
  const [annoColor, setAnnoColor] = useState(ANNO_COLORS[0].value);

  // BUG-H6 FIX: use API hooks instead of local useState<Annotation[]>
  const { data: annotations = [], isLoading } = useAnnotations(dsId || undefined);
  const createMut = useCreateAnnotation();
  const deleteMut = useDeleteAnnotation(dsId || undefined);

  const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(dsId || '', { limit: 10000 });
  const dataset = React.useMemo(() => {
    const meta = dataSets.find(ds => ds.id === dsId);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, dsId, __datasetDataRes]);

  const chartData = useMemo(() => {
    if (!dataset || !xCol || !yCol) return [];
    const grouped: Record<string, number> = {};
    dataset.data.forEach(row => {
      const key = String(row[xCol] || 'N/A');
      grouped[key] = (grouped[key] || 0) + (Number(row[yCol]) || 0);
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value })).slice(0, 20);
  }, [dataset, xCol, yCol]);

  const addAnnotation = async () => {
    if (!annoLabel || !annoValue) {
      toast({ title: 'Fill label and value', variant: 'destructive' });
      return;
    }
    try {
      await createMut.mutateAsync({
        datasetId: dsId,
        xCol,
        yCol,
        label: annoLabel,
        value: Number(annoValue),
        color: annoColor,
        type: 'line',
      });
      toast({ title: 'Annotation saved to backend' });
      setAnnoLabel(''); setAnnoValue('');
    } catch {
      toast({ title: 'Failed to save annotation', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <StickyNote className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Chart Annotations
              <HelpTooltip text="Tambahkan garis referensi dan catatan pada chart. Data tersimpan persisten ke backend." />
            </h1>
            <p className="text-muted-foreground">Add reference lines, notes, and markers to charts</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Chart Source</h3>
            <Select value={dsId} onValueChange={v => { setDsId(v); setXCol(''); setYCol(''); }}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Dataset" /></SelectTrigger>
              <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
            {dataset && (
              <>
                <Select value={xCol || 'none'} onValueChange={v => setXCol(v === 'none' ? '' : v)}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="X-Axis" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Select</SelectItem>{dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={yCol || 'none'} onValueChange={v => setYCol(v === 'none' ? '' : v)}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Y-Axis" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Select</SelectItem>{dataset.columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </>
            )}
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Add Annotation</h3>
            <Input value={annoLabel} onChange={e => setAnnoLabel(e.target.value)} placeholder="Label (e.g., Target)" className="bg-muted/50 border-border" />
            <Input value={annoValue} onChange={e => setAnnoValue(e.target.value)} placeholder="Y-value" type="number" className="bg-muted/50 border-border" />
            <div className="flex gap-1.5">
              {ANNO_COLORS.map(c => (
                <button key={c.label} onClick={() => setAnnoColor(c.value)}
                  className="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c.value, borderColor: annoColor === c.value ? 'hsl(var(--foreground))' : 'transparent' }} />
              ))}
            </div>
            <Button onClick={addAnnotation} className="w-full gradient-primary text-primary-foreground" size="sm" disabled={createMut.isPending}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : annotations.length > 0 && (
            <div className="bg-card rounded-xl p-5 border border-border shadow-card">
              <h3 className="font-semibold text-foreground text-sm mb-3">Annotations ({annotations.length})</h3>
              <div className="space-y-2">
                {annotations.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
                      <span className="text-xs text-foreground">{a.label}: {a.value}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(a.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2">
          {chartData.length > 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">{yCol} by {xCol}</h3>
              </div>
              <div className="p-4 h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    {annotations.map(a => (
                      <ReferenceLine key={a.id} y={a.value} stroke={a.color} strokeDasharray="5 5" strokeWidth={2}>
                        <Label value={a.label} position="right" fill={a.color} fontSize={12} />
                      </ReferenceLine>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
              <StickyNote className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Configure Chart</h3>
              <p className="text-muted-foreground">Select dataset and axes to add annotations</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
