import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Plus, Trash2, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useKPIs, useCreateKPI, useDeleteKPI, useDatasets } from '@/hooks/useApi';
import type { KPICreate } from '@/lib/api';

export default function KPIScorecard() {
  const { data: kpis = [], isLoading } = useKPIs();
  const { data: datasets = [] } = useDatasets();
  const createMut = useCreateKPI();
  const deleteMut = useDeleteKPI();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<KPICreate & { datasetIdLocal: string }>({
    name: '', datasetId: '', columnName: '', aggregation: 'SUM', target: undefined,
    unit: '', datasetIdLocal: '',
  });

  const selectedDs = datasets.find((d) => d.id === form.datasetId);
  const numCols = selectedDs?.columns.filter((c) => c.type === 'number') ?? [];

  const handleCreate = async () => {
    if (!form.name || !form.datasetId || !form.columnName) return;
    try {
      await createMut.mutateAsync({
        name: form.name, datasetId: form.datasetId, columnName: form.columnName,
        aggregation: form.aggregation, target: form.target, unit: form.unit || undefined,
      });
      setForm({ name: '', datasetId: '', columnName: '', aggregation: 'SUM', target: undefined, unit: '', datasetIdLocal: '' });
      setDialogOpen(false);
      toast({ title: 'KPI created', description: `${form.name} added to scorecard.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to create KPI.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Target className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                KPI Scorecard <HelpTooltip text="Buat KPI dari kolom numerik dataset. Pilih agregasi, set target, dan pantau progress di backend." />
              </h1>
              <p className="text-muted-foreground">Track key performance indicators against your data</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Add KPI</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create KPI</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>KPI Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Total Revenue" />
                </div>
                <div>
                  <Label>Dataset</Label>
                  <Select value={form.datasetId} onValueChange={(v) => setForm({ ...form, datasetId: v, columnName: '' })}>
                    <SelectTrigger><SelectValue placeholder="Select dataset" /></SelectTrigger>
                    <SelectContent>{datasets.map((ds) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Column (numeric)</Label>
                  <Select value={form.columnName} onValueChange={(v) => setForm({ ...form, columnName: v })}>
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>{numCols.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Aggregation</Label>
                  <Select value={form.aggregation} onValueChange={(v) => setForm({ ...form, aggregation: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SUM">Sum</SelectItem>
                      <SelectItem value="AVG">Average</SelectItem>
                      <SelectItem value="COUNT">Count</SelectItem>
                      <SelectItem value="MIN">Min</SelectItem>
                      <SelectItem value="MAX">Max</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Target (optional)</Label><Input type="number" value={form.target ?? ''} onChange={(e) => setForm({ ...form, target: e.target.value ? parseFloat(e.target.value) : undefined })} /></div>
                  <div><Label>Unit (optional)</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="IDR, %, etc." /></div>
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Create KPI
                </Button>
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
            const progress = kpi.target ? Math.min(100, 100) : null; // value from backend; placeholder 100% until live value endpoint
            const ds = datasets.find((d) => d.id === kpi.datasetId);
            return (
              <motion.div key={kpi.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(kpi.id, { onSuccess: () => toast({ title: 'KPI removed' }) })}>
                    {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{kpi.name}</p>
                <p className="text-2xl font-bold text-foreground">
                  {kpi.aggregation}({kpi.columnName})
                  {kpi.unit && <span className="text-base font-normal text-muted-foreground ml-1">{kpi.unit}</span>}
                </p>
                {kpi.target && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Target: {kpi.target.toLocaleString()}</span>
                      <span className="font-medium text-primary">{progress?.toFixed(0)}%</span>
                    </div>
                    <Progress value={progress ?? 0} className="h-2" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">{ds?.name ?? 'Unknown dataset'}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
