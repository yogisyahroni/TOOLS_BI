import { useState } from 'react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { motion } from 'framer-motion';
import { Clock, Plus, Trash2, Play, Pause } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface Schedule {
  id: string;
  name: string;
  dataSetId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  format: 'csv' | 'markdown' | 'json';
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  createdAt: Date;
}

function getNextRun(freq: string): string {
  const now = new Date();
  if (freq === 'daily') now.setDate(now.getDate() + 1);
  else if (freq === 'weekly') now.setDate(now.getDate() + 7);
  else now.setMonth(now.getMonth() + 1);
  return now.toLocaleDateString();
}

export default function ScheduledReports() {
  const { dataSets } = useDataStore();
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [name, setName] = useState('');
  const [dsId, setDsId] = useState('');
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [format, setFormat] = useState<'csv' | 'markdown' | 'json'>('csv');

  const addSchedule = () => {
    if (!name || !dsId) { toast({ title: 'Fill all fields', variant: 'destructive' }); return; }
    setSchedules(prev => [...prev, {
      id: Date.now().toString(), name, dataSetId: dsId, frequency: freq,
      format, enabled: true, nextRun: getNextRun(freq), createdAt: new Date(),
    }]);
    toast({ title: 'Schedule created', description: name });
    setName('');
  };

  const toggle = (id: string) => setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));

  const runNow = (schedule: Schedule) => {
    const ds = dataSets.find(d => d.id === schedule.dataSetId);
    if (!ds) return;
    let content = '';
    if (schedule.format === 'csv') {
      const headers = ds.columns.map(c => c.name).join(',');
      const rows = ds.data.map(r => ds.columns.map(c => r[c.name]).join(','));
      content = [headers, ...rows].join('\n');
    } else if (schedule.format === 'json') {
      content = JSON.stringify(ds.data.slice(0, 100), null, 2);
    } else {
      content = `# ${schedule.name}\n\n**Dataset:** ${ds.name}\n**Generated:** ${new Date().toLocaleString()}\n\n| ${ds.columns.map(c => c.name).join(' | ')} |\n| ${ds.columns.map(() => '---').join(' | ')} |\n${ds.data.slice(0, 50).map(r => `| ${ds.columns.map(c => r[c.name] ?? '').join(' | ')} |`).join('\n')}`;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${schedule.name}.${schedule.format === 'markdown' ? 'md' : schedule.format}`;
    a.click(); URL.revokeObjectURL(url);
    setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, lastRun: new Date().toLocaleString(), nextRun: getNextRun(s.frequency) } : s));
    toast({ title: 'Report generated & downloaded' });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Clock className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Scheduled Reports <HelpTooltip text="Jadwalkan pengiriman laporan otomatis. Pilih laporan, format (PDF/CSV/Excel), frekuensi, dan email penerima." /></h1>
            <p className="text-muted-foreground">Automate report generation and export</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Create Schedule</h3>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Report name" className="bg-muted/50 border-border" />
            <Select value={dsId} onValueChange={setDsId}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Frequency</label>
                <Select value={freq} onValueChange={v => setFreq(v as any)}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Format</label>
                <Select value={format} onValueChange={v => setFormat(v as any)}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={addSchedule} className="w-full gradient-primary text-primary-foreground" disabled={!name || !dsId}>
              <Plus className="w-4 h-4 mr-1" /> Create Schedule
            </Button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Schedules ({schedules.length})</h3>
            {schedules.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">No scheduled reports</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => (
                  <div key={s.id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-foreground text-sm">{s.name}</p>
                      <div className="flex items-center gap-2">
                        <Switch checked={s.enabled} onCheckedChange={() => toggle(s.id)} />
                        <Button variant="ghost" size="sm" onClick={() => runNow(s)}><Play className="w-4 h-4 text-primary" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setSchedules(prev => prev.filter(x => x.id !== s.id))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">{s.frequency}</span>
                      <span className="px-2 py-0.5 rounded bg-accent text-accent-foreground">{s.format.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Next: {s.nextRun} {s.lastRun && `• Last: ${s.lastRun}`}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
