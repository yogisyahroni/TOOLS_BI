import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Plus, Trash2, CheckCircle, AlertTriangle, BellOff } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import type { DataAlert } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

function genId() { return Math.random().toString(36).substring(2, 15); }

const CONDITIONS: { value: DataAlert['condition']; label: string; symbol: string }[] = [
  { value: 'gt', label: 'Greater than', symbol: '>' },
  { value: 'lt', label: 'Less than', symbol: '<' },
  { value: 'gte', label: 'Greater or equal', symbol: '≥' },
  { value: 'lte', label: 'Less or equal', symbol: '≤' },
  { value: 'eq', label: 'Equal to', symbol: '=' },
  { value: 'change_pct', label: 'Change % exceeds', symbol: 'Δ%' },
];

export default function Alerts() {
  const { dataSets, alerts, addAlert, updateAlert, removeAlert } = useDataStore();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', dataSetId: '', column: '', condition: 'gt' as DataAlert['condition'], threshold: '' });

  const selectedDs = dataSets.find(d => d.id === form.dataSetId);
  const numCols = selectedDs?.columns.filter(c => c.type === 'number') || [];

  const checkAlert = (alert: DataAlert): boolean => {
    const ds = dataSets.find(d => d.id === alert.dataSetId);
    if (!ds) return false;
    const vals = ds.data.map(r => Number(r[alert.column]) || 0);
    if (vals.length === 0) return false;
    const current = vals.reduce((a, b) => a + b, 0) / vals.length; // avg
    switch (alert.condition) {
      case 'gt': return current > alert.threshold;
      case 'lt': return current < alert.threshold;
      case 'gte': return current >= alert.threshold;
      case 'lte': return current <= alert.threshold;
      case 'eq': return current === alert.threshold;
      case 'change_pct': return Math.abs(current) > alert.threshold;
    }
  };

  const handleCreate = () => {
    if (!form.name || !form.dataSetId || !form.column || !form.threshold) return;
    const alert: DataAlert = {
      id: genId(), name: form.name, dataSetId: form.dataSetId,
      column: form.column, condition: form.condition,
      threshold: parseFloat(form.threshold), enabled: true,
      triggered: false, lastChecked: new Date(), createdAt: new Date(),
    };
    alert.triggered = checkAlert(alert);
    addAlert(alert);
    setForm({ name: '', dataSetId: '', column: '', condition: 'gt', threshold: '' });
    setDialogOpen(false);
    toast({ title: 'Alert created', description: alert.triggered ? '⚠️ This alert is currently triggered!' : 'Alert is active and monitoring.' });
  };

  const handleCheckAll = () => {
    alerts.forEach(alert => {
      if (alert.enabled) {
        const triggered = checkAlert(alert);
        updateAlert(alert.id, { triggered, lastChecked: new Date() });
      }
    });
    toast({ title: 'Alerts checked', description: `${alerts.filter(a => checkAlert(a)).length} of ${alerts.length} alerts triggered.` });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Bell className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Data Alerts <HelpTooltip text="Buat alert untuk monitor kolom numerik dataset. Pilih kondisi (>, <, =, dll) dan threshold. Alert bisa diaktifkan/nonaktifkan dan dicek manual." /></h1>
              <p className="text-muted-foreground">Monitor thresholds and get notified</p>
            </div>
          </div>
          <div className="flex gap-2">
            {alerts.length > 0 && <Button variant="outline" onClick={handleCheckAll}>Check All</Button>}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Create Alert</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Data Alert</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Alert Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. High salary alert" /></div>
                  <div><Label>Dataset</Label>
                    <Select value={form.dataSetId} onValueChange={v => setForm({ ...form, dataSetId: v, column: '' })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Column</Label>
                    <Select value={form.column} onValueChange={v => setForm({ ...form, column: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{numCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Condition</Label>
                      <Select value={form.condition} onValueChange={(v: DataAlert['condition']) => setForm({ ...form, condition: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.symbol} {c.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Threshold</Label><Input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} /></div>
                  </div>
                  <Button onClick={handleCreate} className="w-full">Create Alert</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </motion.div>

      {alerts.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No alerts configured</h3>
          <p className="text-muted-foreground">Create alerts to monitor data thresholds</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert, i) => {
            const ds = dataSets.find(d => d.id === alert.dataSetId);
            const condSymbol = CONDITIONS.find(c => c.value === alert.condition)?.symbol || '';
            return (
              <motion.div key={alert.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`bg-card rounded-xl p-5 border shadow-card flex items-center gap-4 ${alert.triggered && alert.enabled ? 'border-warning/50' : 'border-border'}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  !alert.enabled ? 'bg-muted' : alert.triggered ? 'bg-warning/10' : 'bg-success/10'
                }`}>
                  {!alert.enabled ? <BellOff className="w-5 h-5 text-muted-foreground" /> :
                    alert.triggered ? <AlertTriangle className="w-5 h-5 text-warning" /> : <CheckCircle className="w-5 h-5 text-success" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{alert.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {alert.column} {condSymbol} {alert.threshold.toLocaleString()} • {ds?.name || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={alert.enabled} onCheckedChange={v => updateAlert(alert.id, { enabled: v })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => { removeAlert(alert.id); toast({ title: 'Alert deleted' }); }}>
                    <Trash2 className="w-4 h-4" />
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
