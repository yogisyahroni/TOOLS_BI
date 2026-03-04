import { motion } from 'framer-motion';
import { Database, BarChart3, FileText, Shield, Sparkles, Clock, Loader2 } from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DataChart } from '@/components/dashboard/DataChart';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { RecentReports } from '@/components/dashboard/RecentReports';
import { useDatasets } from '@/hooks/useApi';
import { useReports } from '@/hooks/useApi';
import { usePipelines } from '@/hooks/useApi';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { data: datasets = [], isLoading: dsLoading } = useDatasets();
  const { data: reports = [], isLoading: rptLoading } = useReports();
  const { data: pipelines = [], isLoading: plLoading } = usePipelines();

  const isLoading = dsLoading || rptLoading || plLoading;

  const totalRecords = datasets.reduce((sum, ds) => sum + (ds.rowCount ?? 0), 0);

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
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Dashboard <HelpTooltip text="Ringkasan KPI real-time dari backend API: jumlah dataset, record, report, dan pipeline aktif." />
            </h1>
            <p className="text-muted-foreground">Welcome back! Here's your live analytics overview.</p>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <StatsCard key={stat.title} {...stat} delay={index * 0.1} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentReports reports={reports} />

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
            <Clock className="w-5 h-5 text-primary" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Link to="/upload" className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group">
              <Database className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">Upload Data</p>
              <p className="text-xs text-muted-foreground mt-1">CSV, Excel, JSON</p>
            </Link>

            <Link to="/ai-reports" className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group">
              <Sparkles className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">Generate Report</p>
              <p className="text-xs text-muted-foreground mt-1">AI-powered insights</p>
            </Link>

            <Link to="/etl" className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group">
              <BarChart3 className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">ETL Pipeline</p>
              <p className="text-xs text-muted-foreground mt-1">Transform your data</p>
            </Link>

            <Link to="/privacy" className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group">
              <Shield className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">Data Privacy</p>
              <p className="text-xs text-muted-foreground mt-1">Protect your data</p>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
