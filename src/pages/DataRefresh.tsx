import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Plus, Trash2, Play, Pause, Clock, Zap, CalendarClock, Hand } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { HelpTooltip } from '@/components/HelpTooltip';

type RefreshMode = 'realtime' | 'interval' | 'scheduled' | 'manual';
type JobType = 'data_refresh' | 'report_gen' | 'alert_check' | 'etl_run' | 'export_send' | 'kpi_snapshot';

interface CronJob {
  id: string;
  name: string;
  type: JobType;
  targetId: string;
  targetName: string;
  mode: RefreshMode;
  schedule: string;
  intervalMinutes: number;
  timezone: string;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error' | 'running';
  nextRunAt?: string;
  runCount: number;
}

const JOB_TYPES: { value: JobType; label: string; desc: string }[] = [
  { value: 'data_refresh', label: 'Data Refresh', desc: 'Re-fetch/reload dataset' },
  { value: 'report_gen', label: 'Report Generation', desc: 'Auto-generate AI report' },
  { value: 'alert_check', label: 'Alert Check', desc: 'Check all alert thresholds' },
  { value: 'etl_run', label: 'ETL Pipeline Run', desc: 'Execute ETL pipeline' },
  { value: 'export_send', label: 'Export & Send', desc: 'Export and deliver report' },
  { value: 'kpi_snapshot', label: 'KPI Snapshot', desc: 'Snapshot current KPI values' },
];

const INTERVALS = [
  { value: 1, label: 'Every 1 minute' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every 1 hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Every 24 hours' },
];

const SCHEDULES = [
  { value: '0 * * * *', label: 'Every hour at :00' },
  { value: '0 */2 * * *', label: 'Every 2 hours' },
  { value: '0 8 * * *', label: 'Daily at 08:00' },
  { value: '0 8 * * 1-5', label: 'Weekdays at 08:00' },
  { value: '0 8 * * 1', label: 'Monday at 08:00' },
  { value: '0 0 1 * *', label: '1st of month at 00:00' },
  { value: '0 8,17 * * 1-5', label: 'Weekdays 08:00 & 17:00' },
];

const TIMEZONES = [
  'UTC', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo',
  'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin',
];

function getModeIcon(mode: RefreshMode) {
  switch (mode) {
    case 'realtime': return Zap;
    case 'interval': return RefreshCw;
    case 'scheduled': return CalendarClock;
    case 'manual': return Hand;
  }
}

function getNextRun(mode: RefreshMode, intervalMin: number, schedule: string): string {
  const now = new Date();
  if (mode === 'realtime') return 'Continuous';
  if (mode === 'manual') return 'On demand';
  if (mode === 'interval') {
    now.setMinutes(now.getMinutes() + intervalMin);
    return now.toLocaleString();
  }
  // Simplified for scheduled
  now.setHours(now.getHours() + 1);
  return now.toLocaleString();
}

export default function DataRefresh() {
  const { dataSets, pipelines, reports } = useDataStore();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<CronJob[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [jobType, setJobType] = useState<JobType>('data_refresh');
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<RefreshMode>('interval');
  const [intervalMin, setIntervalMin] = useState(60);
  const [schedule, setSchedule] = useState('0 * * * *');
  const [customCron, setCustomCron] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');

  // Get target options based on job type
  const targets = jobType === 'data_refresh' || jobType === 'alert_check' || jobType === 'kpi_snapshot'
    ? dataSets.map(ds => ({ id: ds.id, name: ds.name }))
    : jobType === 'etl_run'
    ? pipelines.map(p => ({ id: p.id, name: p.name }))
    : jobType === 'report_gen' || jobType === 'export_send'
    ? reports.map(r => ({ id: r.id, name: r.title }))
    : [];

  const addJob = () => {
    if (!name) { toast({ title: 'Enter a job name', variant: 'destructive' }); return; }
    const target = targets.find(t => t.id === targetId);
    const finalSchedule = mode === 'scheduled' ? (customCron || schedule) : mode === 'interval' ? `*/${intervalMin} * * * *` : '';

    const newJob: CronJob = {
      id: Date.now().toString(),
      name,
      type: jobType,
      targetId,
      targetName: target?.name || 'All',
      mode,
      schedule: finalSchedule,
      intervalMinutes: intervalMin,
      timezone,
      enabled: true,
      nextRunAt: getNextRun(mode, intervalMin, finalSchedule),
      runCount: 0,
    };

    setJobs(prev => [...prev, newJob]);
    toast({ title: 'Job created', description: `${name} — ${mode}` });
    setName('');
  };

  const toggleJob = (id: string) => setJobs(prev => prev.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j));

  const runNow = (job: CronJob) => {
    setJobs(prev => prev.map(j => j.id === job.id ? {
      ...j, lastRunAt: new Date().toLocaleString(), lastStatus: 'success' as const,
      runCount: j.runCount + 1, nextRunAt: getNextRun(j.mode, j.intervalMinutes, j.schedule),
    } : j));
    toast({ title: `Running: ${job.name}`, description: 'Job executed successfully' });
  };

  const activeJobs = jobs.filter(j => j.enabled).length;
  const realtimeJobs = jobs.filter(j => j.mode === 'realtime').length;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <RefreshCw className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Data Refresh & Cron Jobs <HelpTooltip text="Kelola jadwal refresh data: Realtime (WebSocket), Interval (setiap X menit), Scheduled (cron expression), atau Manual. Cocok untuk ETL, alert, dan report otomatis." /></h1>
            <p className="text-muted-foreground">Configure realtime, interval, or scheduled data refresh</p>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Jobs', value: jobs.length, color: 'text-primary' },
          { label: 'Active', value: activeJobs, color: 'text-primary' },
          { label: 'Realtime', value: realtimeJobs, color: 'text-primary' },
          { label: 'Total Runs', value: jobs.reduce((s, j) => s + j.runCount, 0), color: 'text-primary' },
        ].map(stat => (
          <div key={stat.label} className="bg-card rounded-xl p-4 border border-border shadow-card">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Job Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Create Cron Job</h3>

            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Job name" className="bg-muted/50 border-border" />

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Job Type</label>
              <Select value={jobType} onValueChange={v => { setJobType(v as JobType); setTargetId(''); }}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">{JOB_TYPES.find(t => t.value === jobType)?.desc}</p>
            </div>

            {targets.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Target</label>
                <Select value={targetId || "all"} onValueChange={v => setTargetId(v === "all" ? "" : v)}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select target" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {targets.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Refresh Mode */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Refresh Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {(['realtime', 'interval', 'scheduled', 'manual'] as RefreshMode[]).map(m => {
                  const Icon = getModeIcon(m);
                  return (
                    <button key={m} onClick={() => setMode(m)}
                      className={`p-3 rounded-lg border text-left transition-all ${mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80'}`}>
                      <Icon className="w-4 h-4 mb-1" />
                      <p className="text-xs font-semibold capitalize">{m}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mode-specific config */}
            {mode === 'interval' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Interval</label>
                <Select value={String(intervalMin)} onValueChange={v => setIntervalMin(Number(v))}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map(i => <SelectItem key={i.value} value={String(i.value)}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === 'scheduled' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Preset Schedule</label>
                  <Select value={schedule} onValueChange={v => { setSchedule(v); setCustomCron(''); }}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCHEDULES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Or Custom Cron</label>
                  <Input value={customCron} onChange={e => setCustomCron(e.target.value)} placeholder="e.g. 0 8,17 * * 1-5" className="bg-muted/50 border-border font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground mt-1">Format: minute hour day month weekday</p>
                </div>
              </div>
            )}

            {mode !== 'manual' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Timezone</label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={addJob} className="w-full gradient-primary text-primary-foreground" disabled={!name}>
              <Plus className="w-4 h-4 mr-1" /> Create Job
            </Button>
          </div>
        </motion.div>

        {/* Job List */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Cron Jobs ({jobs.length})</h3>

            {jobs.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Jobs Configured</h3>
                <p className="text-muted-foreground text-sm">Create a cron job to automate data refresh, reports, and alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map(job => {
                  const ModeIcon = getModeIcon(job.mode);
                  return (
                    <div key={job.id} className={`p-4 rounded-lg border transition-all ${job.enabled ? 'bg-muted/20 border-border/50' : 'bg-muted/5 border-border/20 opacity-60'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ModeIcon className="w-4 h-4 text-primary" />
                          <div>
                            <p className="font-semibold text-foreground text-sm">{job.name}</p>
                            <p className="text-xs text-muted-foreground">{job.targetName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={job.enabled} onCheckedChange={() => toggleJob(job.id)} />
                          <Button variant="ghost" size="sm" onClick={() => runNow(job)} title="Run now">
                            <Play className="w-4 h-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{job.type.replace('_', ' ')}</Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 capitalize">{job.mode}</Badge>
                        {job.mode !== 'manual' && job.mode !== 'realtime' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-mono">
                            {job.mode === 'interval' ? `Every ${job.intervalMinutes}m` : job.schedule}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">{job.timezone}</Badge>
                      </div>

                      <div className="flex gap-4 text-[10px] text-muted-foreground">
                        <span>Next: <span className="text-foreground">{job.nextRunAt || '—'}</span></span>
                        {job.lastRunAt && (
                          <span>Last: <span className="text-foreground">{job.lastRunAt}</span></span>
                        )}
                        {job.lastStatus && (
                          <span>Status: <span className={job.lastStatus === 'success' ? 'text-primary' : job.lastStatus === 'error' ? 'text-destructive' : 'text-foreground'}>{job.lastStatus}</span></span>
                        )}
                        <span>Runs: <span className="text-foreground">{job.runCount}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
