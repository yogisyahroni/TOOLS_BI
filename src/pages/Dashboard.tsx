import { motion } from 'framer-motion';
import { Database, BarChart3, FileText, Shield, Sparkles, Clock } from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useDataStore } from '@/stores/dataStore';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DataChart } from '@/components/dashboard/DataChart';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { RecentReports } from '@/components/dashboard/RecentReports';

// Sample data for charts
const chartData = [
  { name: 'Jan', value: 4000 },
  { name: 'Feb', value: 3000 },
  { name: 'Mar', value: 5000 },
  { name: 'Apr', value: 4500 },
  { name: 'May', value: 6000 },
  { name: 'Jun', value: 5500 },
  { name: 'Jul', value: 7000 },
];

const pieData = [
  { name: 'Sales', value: 400 },
  { name: 'Marketing', value: 300 },
  { name: 'Development', value: 500 },
  { name: 'Operations', value: 200 },
];

export default function Dashboard() {
  const { dataSets, reports, pipelines } = useDataStore();

  const stats = [
    {
      title: 'Datasets',
      value: dataSets.length,
      change: '+2 this week',
      changeType: 'positive' as const,
      icon: Database,
    },
    {
      title: 'Total Records',
      value: dataSets.reduce((sum, ds) => sum + ds.rowCount, 0).toLocaleString(),
      change: 'Across all datasets',
      changeType: 'neutral' as const,
      icon: BarChart3,
    },
    {
      title: 'Reports Generated',
      value: reports.length,
      change: '+5 this month',
      changeType: 'positive' as const,
      icon: FileText,
    },
    {
      title: 'ETL Pipelines',
      value: pipelines.length,
      change: 'Active',
      changeType: 'neutral' as const,
      icon: Shield,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Dashboard <HelpTooltip text="Halaman utama dengan ringkasan KPI, grafik tren, distribusi data, dan laporan terbaru. Gunakan Quick Actions untuk navigasi cepat." /></h1>
            <p className="text-muted-foreground">
              Welcome back! Here's your analytics overview.
            </p>
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
          data={chartData}
          title="Data Processing Trend"
          dataKey="value"
          xAxisKey="name"
        />
        <DonutChart data={pieData} title="Data Distribution" />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentReports reports={reports} />
        
        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
            <Clock className="w-5 h-5 text-primary" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <a
              href="/upload"
              className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group"
            >
              <Database className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">Upload Data</p>
              <p className="text-xs text-muted-foreground mt-1">CSV, Excel, JSON</p>
            </a>
            
            <a
              href="/ai-reports"
              className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group"
            >
              <Sparkles className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">Generate Report</p>
              <p className="text-xs text-muted-foreground mt-1">AI-powered insights</p>
            </a>
            
            <a
              href="/etl"
              className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group"
            >
              <BarChart3 className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">ETL Pipeline</p>
              <p className="text-xs text-muted-foreground mt-1">Transform your data</p>
            </a>
            
            <a
              href="/privacy"
              className="p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group"
            >
              <Shield className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-medium text-foreground">Data Privacy</p>
              <p className="text-xs text-muted-foreground mt-1">Protect your data</p>
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
