import { useState } from 'react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { motion } from 'framer-motion';
import { Clock, Plus, Trash2, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useCronJobs, useCreateCronJob, useDeleteCronJob, useRunCronJob, useDatasets } from '@/hooks/useApi';
import type { CronJobCreate } from '@/lib/api';

const FREQUENCY_CRON: Record<string, string> = {
  daily: '0 8 * * *',
  weekly: '0 8 * * 1',
  monthly: '0 8 1 * *',
};

export default function ScheduledReports() {
  const { data: cronJobs = [], isLoading } = useCronJobs();
  const { data: datasets = [] } = useDatasets();
  const createMut = useCreateCronJob();
  const deleteMut = useDeleteCronJob();
  const runMut = useRunCronJob();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [dsId, setDsId] = useState('');
  const [freq, setFreq] = useState('weekly');

  const handleCreate = async () => {
    if (!name || !dsId) { toast({ title: 'Fill all fields', variant: 'destructive' }); return; }
    const payload: CronJobCreate = {
      name,
      type: 'data_refresh',
      schedule: FREQUENCY_CRON[freq] ?? '0 8 * * 1',
      timezone: 'Asia/Jakarta',
      targetId: dsId,
    };
    try {
      await createMut.mutateAsync(payload);
      toast({ title: 'Schedule created', description: name });
      setName(''); setDsId('');
    } catch {
      toast({ title: 'Error', description: 'Failed to create schedule.', variant: 'destructive' });
    }
  };

  const handleRunNow = async (id: string, jobName: string) => {
    try {
      await runMut.mutateAsync(id);
      toast({ title: 'Job triggered', description: `${jobName} is running…` });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Clock className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Scheduled Reports <HelpTooltip text="Jadwalkan data refresh otomatis via backend cron scheduler. Pilih dataset dan frekuensi." />
            </h1>
            <p className="text-muted-foreground">Automate data refresh via backend cron scheduler</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Create Schedule</h3>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Schedule name" className="bg-muted/50 border-border" />
            <Select value={dsId} onValueChange={setDsId}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>{datasets.map((ds) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Frequency</label>
              <Select value={freq} onValueChange={setFreq}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily (08:00)</SelectItem>
                  <SelectItem value="weekly">Weekly (Mon 08:00)</SelectItem>
                  <SelectItem value="monthly">Monthly (1st 08:00)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} className="w-full" disabled={!name || !dsId || createMut.isPending}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Schedule
            </Button>
          </div>
        </motion.div>

        {/* Jobs list */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Schedules ({cronJobs.length})</h3>
            {cronJobs.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">No scheduled jobs yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cronJobs.map((job) => (
                  <div key={job.id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-foreground text-sm">{job.name}</p>
                      <div className="flex items-center gap-2">
                        <Switch checked={job.enabled} disabled />
                        <Button variant="ghost" size="sm" onClick={() => handleRunNow(job.id, job.name)} disabled={runMut.isPending}>
                          {runMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-primary" />}
                        </Button>
                        <Button variant="ghost" size="sm"
                          disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(job.id, { onSuccess: () => toast({ title: 'Schedule deleted' }) })}>
                          {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">{job.schedule}</span>
                      <span className="px-2 py-0.5 rounded bg-accent text-accent-foreground">{job.type}</span>
                      {job.lastStatus && (
                        <span className={`px-2 py-0.5 rounded ${job.lastStatus === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          {job.lastStatus}
                        </span>
                      )}
                    </div>
                    {job.lastRunAt && (
                      <p className="text-xs text-muted-foreground mt-2">Last run: {new Date(job.lastRunAt).toLocaleString()}</p>
                    )}
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
