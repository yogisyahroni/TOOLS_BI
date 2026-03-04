import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Plus, Trash2, CheckCircle, AlertTriangle, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useAlerts, useCreateAlert, useDeleteAlert, useToggleAlert, useDatasets } from '@/hooks/useApi';
import type { AlertCreate } from '@/lib/api';

const CONDITIONS = [
  { value: 'gt', label: 'Greater than', symbol: '>' },
  { value: 'lt', label: 'Less than', symbol: '<' },
  { value: 'gte', label: 'Greater or equal', symbol: '≥' },
  { value: 'lte', label: 'Less or equal', symbol: '≤' },
  { value: 'eq', label: 'Equal to', symbol: '=' },
  { value: 'change_pct', label: 'Change % exceeds', symbol: 'Δ%' },
];

export default function Alerts() {
  const { data: alerts = [], isLoading } = useAlerts();
  const { data: datasets = [] } = useDatasets();
  const createMut = useCreateAlert();
  const deleteMut = useDeleteAlert();
  const toggleMut = useToggleAlert();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AlertCreate & { conditionLocal: string }>({
    name: '', datasetId: '', columnName: '', condition: 'gt', threshold: 0, conditionLocal: 'gt',
  });

  const selectedDs = datasets.find((d) => d.id === form.datasetId);
  const numCols = selectedDs?.columns.filter((c) => c.type === 'number') ?? [];

  const handleCreate = async () => {
    if (!form.name || !form.datasetId || !form.columnName || !form.threshold) {
      toast({ title: 'Fill all fields', variant: 'destructive' });
      return;
    }
    try {
      await createMut.mutateAsync({
        name: form.name, datasetId: form.datasetId, columnName: form.columnName,
        condition: form.condition, threshold: form.threshold,
      });
      setForm({ name: '', datasetId: '', columnName: '', condition: 'gt', threshold: 0, conditionLocal: 'gt' });
      setDialogOpen(false);
      toast({ title: 'Alert created', description: 'Alert is active and monitoring data.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to create alert.', variant: 'destructive' });
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
              <Bell className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                Data Alerts <HelpTooltip text="Buat alert untuk monitor kolom numerik. Backend akan mengecek kondisi setiap kali cron scheduler berjalan." />
              </h1>
              <p className="text-muted-foreground">Monitor data thresholds — alerts checked by backend scheduler</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Create Alert</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Data Alert</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Alert Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. High salary alert" /></div>
                <div>
                  <Label>Dataset</Label>
                  <Select value={form.datasetId} onValueChange={(v) => setForm({ ...form, datasetId: v, columnName: '' })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{datasets.map((ds) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Column (numeric)</Label>
                  <Select value={form.columnName} onValueChange={(v) => setForm({ ...form, columnName: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{numCols.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Condition</Label>
                    <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.symbol} {c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Threshold</Label><Input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Create Alert
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {alerts.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No alerts configured</h3>
          <p className="text-muted-foreground">Create alerts to monitor data thresholds automatically</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert, i) => {
            const ds = datasets.find((d) => d.id === alert.datasetId);
            const condSymbol = CONDITIONS.find((c) => c.value === alert.condition)?.symbol ?? '';
            return (
              <motion.div key={alert.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`bg-card rounded-xl p-5 border shadow-card flex items-center gap-4 ${!alert.enabled ? 'border-border' : 'border-border'}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${!alert.enabled ? 'bg-muted' : 'bg-success/10'}`}>
                  {!alert.enabled ? <BellOff className="w-5 h-5 text-muted-foreground" /> :
                    <CheckCircle className="w-5 h-5 text-success" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{alert.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {alert.columnName} {condSymbol} {alert.threshold.toLocaleString()} • {ds?.name ?? 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={alert.enabled}
                    onCheckedChange={() => toggleMut.mutate(alert.id, {
                      onSuccess: () => toast({ title: alert.enabled ? 'Alert paused' : 'Alert enabled' })
                    })}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(alert.id, { onSuccess: () => toast({ title: 'Alert deleted' }) })}>
                    {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
