import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Upload, GitBranch, FileText, Shield, Settings,
  ChevronLeft, ChevronRight, Database, Sparkles, BarChart3, Code2,
  Search, LayoutGrid, PaintBucket, MessageSquare, BookOpen, Target,
  Table2, Bell, Network, Calculator, Bookmark, Paintbrush, Layers,
  Globe, Link2, StickyNote, Variable, Clock, ShieldCheck, Code, FileDown, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Upload, label: 'Upload Data', path: '/upload' },
  { icon: Database, label: 'Datasets', path: '/datasets' },
  { icon: Search, label: 'Data Explorer', path: '/explorer' },
  { icon: MessageSquare, label: 'Ask Data', path: '/ask-data' },
  { icon: Table2, label: 'Pivot Table', path: '/pivot' },
  { icon: PaintBucket, label: 'Chart Builder', path: '/chart-builder' },
  { icon: LayoutGrid, label: 'Dashboard Builder', path: '/dashboard-builder' },
  { icon: Target, label: 'KPI Scorecard', path: '/kpi' },
  { icon: Code2, label: 'SQL Query', path: '/query' },
  { icon: GitBranch, label: 'ETL Pipeline', path: '/etl' },
  { icon: Network, label: 'Data Modeling', path: '/modeling' },
  { icon: Database, label: 'DB Diagram', path: '/db-diagram' },
  { icon: GitBranch, label: 'Visual ETL', path: '/visual-etl' },
  { icon: Calculator, label: 'Calculated Fields', path: '/calculated-fields' },
  { icon: Layers, label: 'Drill-Down', path: '/drill-down' },
  { icon: Paintbrush, label: 'Formatting', path: '/formatting' },
  { icon: Bookmark, label: 'Bookmarks', path: '/bookmarks' },
  { icon: Globe, label: 'Geo Visualization', path: '/geo' },
  { icon: Link2, label: 'Cross-Filter', path: '/cross-filter' },
  { icon: StickyNote, label: 'Annotations', path: '/annotations' },
  { icon: Variable, label: 'Parameters', path: '/parameters' },
  { icon: Clock, label: 'Scheduled Reports', path: '/scheduled-reports' },
  { icon: ShieldCheck, label: 'Row-Level Security', path: '/rls' },
  { icon: Code, label: 'Embed & Share', path: '/embed' },
  { icon: FileDown, label: 'Export', path: '/export' },
  { icon: RefreshCw, label: 'Data Refresh', path: '/data-refresh' },
  { icon: BookOpen, label: 'Data Stories', path: '/stories' },
  { icon: LayoutGrid, label: 'Report Templates', path: '/report-templates' },
  { icon: Sparkles, label: 'AI Reports', path: '/ai-reports' },
  { icon: FileText, label: 'Reports', path: '/reports' },
  { icon: Bell, label: 'Alerts', path: '/alerts' },
  { icon: Shield, label: 'Data Privacy', path: '/privacy' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 280 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-50 flex flex-col"
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <BarChart3 className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-bold text-foreground">DataLens</h1>
                <p className="text-xs text-muted-foreground">Analytics Platform</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow mx-auto">
            <BarChart3 className="w-6 h-6 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {isActive && (
                <motion.div layoutId="activeIndicator" className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" transition={{ duration: 0.2 }} />
              )}
              <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive && 'text-primary')} />
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                    className="font-medium whitespace-nowrap text-sm">
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Collapse Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronLeft className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center">
                <span className="text-xs font-bold text-foreground">AI</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">AI Powered</p>
                <p className="text-xs text-muted-foreground">Protected Mode</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
