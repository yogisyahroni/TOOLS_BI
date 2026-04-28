import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, BarChart3, FileText, Shield, Sparkles, Clock, Loader2, RefreshCw } from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DataChart } from '@/components/dashboard/DataChart';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { RecentReports } from '@/components/dashboard/RecentReports';
import { AnomalyForensicsWidget } from '@/components/dashboard/AnomalyForensicsWidget';
import { DriftSentinelBanner } from '@/components/dashboard/DriftSentinelBanner';
import { useDatasets } from '@/hooks/useApi';
import { useReports } from '@/hooks/useApi';
import { usePipelines } from '@/hooks/useApi';
import { Link } from 'react-router-dom';
import { haptics } from '@/lib/mobile';
import { ImpactStyle } from '@capacitor/haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { openDetachedWindow, isDesktop, setTrayStatus } from '@/lib/desktop';
import { Maximize2 } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: datasets = [], isLoading: dsLoading } = useDatasets();
  const { data: reports = [], isLoading: rptLoading } = useReports();
  const { data: pipelines = [], isLoading: plLoading } = usePipelines();

  const handleRefresh = async () => {
    await haptics.impact(ImpactStyle.Medium);
    queryClient.invalidateQueries();
  };

  const isLoading = dsLoading || rptLoading || plLoading;

  useEffect(() => {
    if (!isDesktop() || isLoading) return;

    const hasFailure = pipelines.some((p) => p.status === 'failed' || p.status === 'error');
    const isIdleEmpty = datasets.length === 0 && pipelines.length === 0;

    if (hasFailure) {
      setTrayStatus('Critical');
    } else if (isIdleEmpty) {
      setTrayStatus('Warning');
    } else {
      setTrayStatus('Optimal');
    }
  }, [pipelines, datasets, isLoading]);

  const totalRecords = datasets.reduce((sum, ds) => sum + (ds.rowCount ?? 0), 0);
// ... existing stats definition ...
// (I will use multi_replace for better accuracy if I need to change many things, but here it's just header and imports)

  const stats = [
    {
      title: 'Datasets',
      value: datasets.length,
      change: datasets.length > 0 ? `${datasets.length} total` : 'No datasets yet',
      changeType: 'positive' as const,
      icon: Database,
    },
    {
      title: 'Total Records',
      value: totalRecords.toLocaleString(),
      change: 'Across all datasets',
      changeType: 'neutral' as const,
      icon: BarChart3,
    },
    {
      title: 'Reports Generated',
      value: reports.length,
      change: reports.length > 0 ? `${reports.length} total` : 'No reports yet',
      changeType: 'positive' as const,
      icon: FileText,
    },
    {
      title: 'ETL Pipelines',
      value: pipelines.length,
      change: pipelines.filter((p) => p.status === 'running').length > 0
        ? `${pipelines.filter((p) => p.status === 'running').length} running`
        : pipelines.length > 0 ? 'All idle' : 'No pipelines',
      changeType: 'neutral' as const,
      icon: Shield,
    },
  ];

  // Build trend data from reports (last 7, by creation order)
  const trendData = reports.slice(-7).map((r, i) => ({
    name: `W${i + 1}`,
    value: Math.floor(Math.random() * 5000) + 1000, // placeholder trend until backend metric endpoint
  }));

  // Build dataset distribution donut data
  const donutData = datasets.slice(0, 5).map((ds) => ({
    name: ds.name,
    value: ds.rowCount ?? 0,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <DriftSentinelBanner />
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
                Dashboard <HelpTooltip text="Ringkasan KPI real-time dari backend API: jumlah dataset, record, report, dan pipeline aktif." />
              </h1>
              <p className="text-muted-foreground text-sm lg:text-base">Welcome back! Here's your live analytics overview.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {isDesktop() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDetachedWindow('dashboard-detach', 'Sentinel Dashboard (Detached)', '/')}
                className="flex items-center gap-2 h-10 px-4 rounded-xl border-border bg-card hover:bg-muted/50 transition-all shadow-sm"
              >
                <Maximize2 className="w-4 h-4" />
                Detach
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              className="flex items-center gap-2 h-10 px-4 rounded-xl border-border bg-card hover:bg-muted/50 transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Data
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {stats.map((stat, index) => (
          <StatsCard key={stat.title} {...stat} delay={index * 0.1} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
        <DataChart
          data={trendData.length > 0 ? trendData : [
            { name: 'Jan', value: 0 }, { name: 'Feb', value: 0 }, { name: 'Mar', value: 0 },
          ]}
          title="Data Processing Trend"
          dataKey="value"
          xAxisKey="name"
        />
        <DonutChart
          data={donutData.length > 0 ? donutData : [{ name: 'No datasets', value: 1 }]}
          title="Dataset Distribution (by rows)"
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
        <AnomalyForensicsWidget />
        <RecentReports reports={reports} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}
          className="bg-card rounded-xl p-4 lg:p-6 border border-border shadow-card"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
            <Clock className="w-5 h-5 text-primary" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
            <Link to="/upload" className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group touch-target">
              <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Upload Data</p>
                <p className="text-xs text-muted-foreground">CSV, Excel, JSON</p>
              </div>
            </Link>

            <Link to="/ai-reports" className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group touch-target">
              <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">AI Reports</p>
                <p className="text-xs text-muted-foreground">Get insights</p>
              </div>
            </Link>

            <Link to="/etl" className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group touch-target">
              <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Pipelines</p>
                <p className="text-xs text-muted-foreground">ETL Jobs</p>
              </div>
            </Link>

            <Link to="/privacy" className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group touch-target">
              <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Privacy</p>
                <p className="text-xs text-muted-foreground">Data Safety</p>
              </div>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
