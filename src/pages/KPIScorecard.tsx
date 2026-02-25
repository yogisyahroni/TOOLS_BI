import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Plus, Trash2, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import type { KPI } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

function genId() { return Math.random().toString(36).substring(2, 15); }

export default function KPIScorecard() {
  const { dataSets, kpis, addKPI, removeKPI } = useDataStore();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', dataSetId: '', column: '', aggregation: 'sum' as KPI['aggregation'], target: '', unit: '' });

  const selectedDs = dataSets.find(d => d.id === form.dataSetId);
  const numCols = selectedDs?.columns.filter(c => c.type === 'number') || [];

  const computeKPIValue = (kpi: KPI): number => {
    const ds = dataSets.find(d => d.id === kpi.dataSetId);
    if (!ds) return 0;
    const vals = ds.data.map(r => Number(r[kpi.column]) || 0);
    if (vals.length === 0) return 0;
    switch (kpi.aggregation) {
      case 'sum': return vals.reduce((a, b) => a + b, 0);
      case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length;
      case 'count': return vals.length;
      case 'min': return Math.min(...vals);
      case 'max': return Math.max(...vals);
      case 'last': return vals[vals.length - 1];
      default: return 0;
    }
  };

  const handleCreate = () => {
    if (!form.name || !form.dataSetId || !form.column) return;
    const kpi: KPI = {
      id: genId(), name: form.name, dataSetId: form.dataSetId,
      column: form.column, aggregation: form.aggregation,
      target: form.target ? parseFloat(form.target) : undefined,
      unit: form.unit || undefined, trend: 'flat', createdAt: new Date(),
    };
    addKPI(kpi);
    setForm({ name: '', dataSetId: '', column: '', aggregation: 'sum', target: '', unit: '' });
    setDialogOpen(false);
    toast({ title: 'KPI created', description: `${kpi.name} has been added to your scorecard.` });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Target className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">KPI Scorecard <HelpTooltip text="Buat KPI dari kolom numerik dataset. Pilih agregasi (Sum, Avg, dll), set target, dan pantau progress. Warna hijau = target tercapai." /></h1>
              <p className="text-muted-foreground">Track key performance indicators</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Add KPI</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create KPI</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>KPI Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Total Revenue" /></div>
                <div><Label>Dataset</Label>
                  <Select value={form.dataSetId} onValueChange={v => setForm({ ...form, dataSetId: v, column: '' })}>
                    <SelectTrigger><SelectValue placeholder="Select dataset" /></SelectTrigger>
                    <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Column</Label>
                  <Select value={form.column} onValueChange={v => setForm({ ...form, column: v })}>
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>{numCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Aggregation</Label>
                  <Select value={form.aggregation} onValueChange={(v: KPI['aggregation']) => setForm({ ...form, aggregation: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sum">Sum</SelectItem><SelectItem value="avg">Average</SelectItem>
                      <SelectItem value="count">Count</SelectItem><SelectItem value="min">Min</SelectItem>
                      <SelectItem value="max">Max</SelectItem><SelectItem value="last">Last Value</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Target (optional)</Label><Input type="number" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} /></div>
                  <div><Label>Unit (optional)</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="e.g. IDR, %" /></div>
                </div>
                <Button onClick={handleCreate} className="w-full">Create KPI</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {kpis.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No KPIs configured</h3>
          <p className="text-muted-foreground">Add KPIs to track your most important metrics</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kpis.map((kpi, i) => {
            const value = computeKPIValue(kpi);
            const ds = dataSets.find(d => d.id === kpi.dataSetId);
            const progress = kpi.target ? Math.min((value / kpi.target) * 100, 100) : null;
            const isOnTarget = kpi.target ? value >= kpi.target : null;

            return (
              <motion.div key={kpi.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isOnTarget === true ? 'bg-success/10' : isOnTarget === false ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                    {isOnTarget === true ? <TrendingUp className="w-5 h-5 text-success" /> : isOnTarget === false ? <TrendingDown className="w-5 h-5 text-destructive" /> : <Minus className="w-5 h-5 text-primary" />}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => { removeKPI(kpi.id); toast({ title: 'KPI removed' }); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{kpi.name}</p>
                <p className="text-3xl font-bold text-foreground">
                  {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {kpi.unit && <span className="text-base font-normal text-muted-foreground ml-1">{kpi.unit}</span>}
                </p>
                {kpi.target && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Target: {kpi.target.toLocaleString()}</span>
                      <span className={`font-medium ${isOnTarget ? 'text-success' : 'text-destructive'}`}>{progress?.toFixed(0)}%</span>
                    </div>
                    <Progress value={progress || 0} className="h-2" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">{kpi.aggregation.toUpperCase()} of {kpi.column} • {ds?.name}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
