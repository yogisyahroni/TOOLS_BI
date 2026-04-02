import { useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Upload, GitBranch, FileText, Shield, Settings,
  ChevronLeft, ChevronRight, Database, Sparkles, Code2, LogOut,
  Search, LayoutGrid, PaintBucket, MessageSquare, BookOpen, Target,
  Table2, Bell, Network, Calculator, Bookmark, Paintbrush, Layers,
  Globe, Link2, StickyNote, Variable, Clock, ShieldCheck, Code, FileDown, RefreshCw,
  Activity, Workflow, PlugZap, FolderInput, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useSidebar } from '@/hooks/use-sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

// ─── Menu structure with groups ───────────────────────────────────────────────
interface MenuItem { icon: React.ElementType; label: string; path: string; badge?: string }
interface MenuGroup { title: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    ],
  },
  {
    title: 'Data Sources',
    items: [
      { icon: PlugZap, label: 'External Databases', path: '/connections', badge: 'NEW' },
      { icon: Upload, label: 'Upload Data', path: '/upload' },
      { icon: Database, label: 'Datasets', path: '/datasets' },
      { icon: RefreshCw, label: 'Data Refresh', path: '/data-refresh' },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { icon: Search, label: 'Data Explorer', path: '/explorer' },
      { icon: MessageSquare, label: 'Ask Data (AI)', path: '/ask-data' },
      { icon: Table2, label: 'Pivot Table', path: '/pivot' },
      { icon: Code2, label: 'SQL Query', path: '/query' },
      { icon: Activity, label: 'Data Profiling', path: '/data-profiling' },
      { icon: Target, label: 'KPI Scorecard', path: '/kpi' },
    ],
  },
  {
    title: 'Visualize',
    items: [
      { icon: PaintBucket, label: 'Chart Builder', path: '/chart-builder' },
      { icon: LayoutGrid, label: 'Dashboard Builder', path: '/dashboard-builder' },
      { icon: Globe, label: 'Geo Visualization', path: '/geo' },
    ],
  },
  {
    title: 'Transform',
    items: [
      { icon: GitBranch, label: 'ETL Pipeline', path: '/etl' },
      { icon: Workflow, label: 'Visual ETL', path: '/visual-etl' },
      { icon: Network, label: 'Data Modeling', path: '/modeling' },
      { icon: Database, label: 'DB Diagram', path: '/db-diagram' },
      { icon: Calculator, label: 'Calculated Fields', path: '/calculated-fields' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { icon: FileText, label: 'Reports', path: '/reports' },
      { icon: Sparkles, label: 'AI Reports', path: '/ai-reports' },
      { icon: BookOpen, label: 'Data Stories', path: '/stories' },
      { icon: LayoutGrid, label: 'Report Templates', path: '/report-templates' },
      { icon: Clock, label: 'Scheduled Reports', path: '/scheduled-reports' },
      { icon: FileDown, label: 'Export / PDF', path: '/export' },
    ],
  },
  {
    title: 'Features',
    items: [
      { icon: Bell, label: 'Alerts', path: '/alerts' },
      { icon: Link2, label: 'Cross-Filter', path: '/cross-filter' },
      { icon: StickyNote, label: 'Annotations', path: '/annotations' },
      { icon: Code, label: 'Embed & Share', path: '/embed' },
      { icon: Bookmark, label: 'Bookmarks', path: '/bookmarks' },
    ],
  },
  {
    title: 'Security',
    items: [
      { icon: ShieldCheck, label: 'Row-Level Security', path: '/rls' },
      { icon: Shield, label: 'Data Privacy', path: '/privacy' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: Settings, label: 'Settings', path: '/settings' },
    ],
  },
];

export function Sidebar() {
  const { isOpen, setIsOpen, isCollapsed, setIsCollapsed } = useSidebar();
  const isMobile = useIsMobile();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userInitials = user?.displayName
    ? user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] ?? 'U').toUpperCase();

  const toggleGroup = (title: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  };

  return (
    <>
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ 
          width: isCollapsed ? 80 : 280,
          x: isMobile ? (isOpen ? 0 : -280) : 0 
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={cn(
          "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-50 flex flex-col transition-all duration-300",
          !isMobile && "translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border shrink-0">
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
                  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                    <ellipse cx="20" cy="20" rx="17" ry="11" fill="white" fillOpacity="0.18" />
                    <circle cx="20" cy="20" r="7" fill="white" fillOpacity="0.15" />
                    <rect x="16" y="22" width="2" height="3" rx="0.5" fill="white" fillOpacity="0.7" />
                    <rect x="19.5" y="19.5" width="2" height="5.5" rx="0.5" fill="white" fillOpacity="0.9" />
                    <rect x="23" y="17.5" width="2" height="7.5" rx="0.5" fill="white" />
                    <path d="M3 20 Q11.5 9 20 9 Q28.5 9 37 20 Q28.5 31 20 31 Q11.5 31 3 20 Z"
                      fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
                  </svg>
                </div>
                <div>
                  <h1 className="font-bold text-foreground">NeuraDash</h1>
                  <p className="text-xs text-muted-foreground">Analytics Platform</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {isCollapsed && (
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow mx-auto">
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                <ellipse cx="20" cy="20" rx="17" ry="11" fill="white" fillOpacity="0.18" />
                <circle cx="20" cy="20" r="7" fill="white" fillOpacity="0.15" />
                <rect x="16" y="22" width="2" height="3" rx="0.5" fill="white" fillOpacity="0.7" />
                <rect x="19.5" y="19.5" width="2" height="5.5" rx="0.5" fill="white" fillOpacity="0.9" />
                <rect x="23" y="17.5" width="2" height="7.5" rx="0.5" fill="white" />
                <path d="M3 20 Q11.5 9 20 9 Q28.5 9 37 20 Q28.5 31 20 31 Q11.5 31 3 20 Z"
                  fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.3" />
              </svg>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5 scrollbar-thin">
          {menuGroups.map((group) => {
            const isGroupCollapsed = !isCollapsed && collapsedGroups.has(group.title);
            const hasActive = group.items.some(item =>
              item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
            );

            return (
              <div key={group.title} className="mb-1">
                {/* Group header */}
                {!isCollapsed && (
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors',
                      hasActive
                        ? 'text-primary/80'
                        : 'text-muted-foreground/60 hover:text-muted-foreground'
                    )}
                  >
                    <span>{group.title}</span>
                    <ChevronDown className={cn('w-3 h-3 transition-transform', isGroupCollapsed && '-rotate-90')} />
                  </button>
                )}

                {/* Items */}
                <AnimatePresence initial={false}>
                  {!isGroupCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden space-y-0.5"
                    >
                      {group.items.map((item) => {
                        const isActive = item.path === '/'
                          ? location.pathname === '/'
                          : location.pathname.startsWith(item.path);
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative touch-target',
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                            title={isCollapsed ? item.label : undefined}
                          >
                            {isActive && (
                              <motion.div layoutId="activeIndicator" className="absolute left-0 w-1 h-5 bg-primary rounded-r-full" transition={{ duration: 0.2 }} />
                            )}
                            <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive && 'text-primary')} />
                            <AnimatePresence mode="wait">
                              {!isCollapsed && (
                                <motion.span
                                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                                  className="font-medium whitespace-nowrap text-sm flex-1"
                                >
                                  {item.label}
                                </motion.span>
                              )}
                            </AnimatePresence>
                            {!isCollapsed && item.badge && (
                              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground leading-none">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle - Hide on mobile */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border hidden lg:flex items-center justify-center hover:bg-muted transition-colors z-10"
        >
          {isCollapsed
            ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
            : <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          }
        </button>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-foreground">{userInitials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user?.displayName || user?.email || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate text-[10px]">{user?.email}</p>
                </div>
                <ThemeToggle />
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 touch-target"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </motion.div>
            )}
            {isCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 justify-center items-center">
                <ThemeToggle />
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors touch-target"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
}
