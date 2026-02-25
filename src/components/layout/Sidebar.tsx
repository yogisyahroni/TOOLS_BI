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
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', tooltip: 'Ringkasan data utama. Lihat KPI, grafik, dan laporan terbaru dalam satu tampilan.' },
  { icon: Upload, label: 'Upload Data', path: '/upload', tooltip: 'Unggah file CSV, Excel, atau JSON sebagai sumber data untuk analisis dan visualisasi.' },
  { icon: Database, label: 'Datasets', path: '/datasets', tooltip: 'Kelola semua dataset yang sudah diunggah. Lihat, edit, atau hapus dataset.' },
  { icon: Search, label: 'Data Explorer', path: '/explorer', tooltip: 'Jelajahi data secara interaktif. Filter, sort, dan cari pola dalam dataset Anda.' },
  { icon: MessageSquare, label: 'Ask Data', path: '/ask-data', tooltip: 'Tanya data menggunakan bahasa natural. AI akan menjawab dengan chart atau tabel.' },
  { icon: Table2, label: 'Pivot Table', path: '/pivot', tooltip: 'Buat tabel pivot untuk analisis multidimensi. Drag & drop kolom ke rows, columns, dan values.' },
  { icon: PaintBucket, label: 'Chart Builder', path: '/chart-builder', tooltip: 'Buat visualisasi chart (bar, line, pie, dll). Pilih dataset, kolom, dan tipe chart.' },
  { icon: LayoutGrid, label: 'Dashboard Builder', path: '/dashboard-builder', tooltip: 'Rancang dashboard kustom. Susun beberapa chart dan widget dalam satu halaman.' },
  { icon: Target, label: 'KPI Scorecard', path: '/kpi', tooltip: 'Pantau KPI bisnis utama dengan target dan threshold. Lihat status pencapaian secara real-time.' },
  { icon: Code2, label: 'SQL Query', path: '/query', tooltip: 'Tulis dan jalankan query SQL langsung pada dataset. Cocok untuk analisis lanjutan.' },
  { icon: GitBranch, label: 'ETL Pipeline', path: '/etl', tooltip: 'Buat pipeline Extract-Transform-Load. Otomasi proses pembersihan dan transformasi data.' },
  { icon: Network, label: 'Data Modeling', path: '/modeling', tooltip: 'Definisikan relasi antar tabel dan buat data model untuk analisis yang lebih kaya.' },
  { icon: Calculator, label: 'Calculated Fields', path: '/calculated-fields', tooltip: 'Buat kolom kalkulasi baru dengan formula (SUM, AVG, IF, dll) tanpa mengubah data asli.' },
  { icon: Layers, label: 'Drill-Down', path: '/drill-down', tooltip: 'Telusuri data dari level tinggi ke detail. Klik chart untuk melihat breakdown lebih dalam.' },
  { icon: Paintbrush, label: 'Formatting', path: '/formatting', tooltip: 'Atur conditional formatting: warnai cell berdasarkan nilai, buat heatmap, atau highlight anomali.' },
  { icon: Bookmark, label: 'Bookmarks', path: '/bookmarks', tooltip: 'Simpan state tampilan (filter, sort, view) sebagai bookmark agar bisa diakses kembali dengan cepat.' },
  { icon: Globe, label: 'Geo Visualization', path: '/geo', tooltip: 'Visualisasikan data geografis pada peta interaktif. Cocok untuk data lokasi dan distribusi regional.' },
  { icon: Link2, label: 'Cross-Filter', path: '/cross-filter', tooltip: 'Hubungkan beberapa chart agar saling filter. Klik satu chart untuk memfilter chart lainnya.' },
  { icon: StickyNote, label: 'Annotations', path: '/annotations', tooltip: 'Tambahkan catatan dan komentar pada chart atau data point. Berguna untuk kolaborasi tim.' },
  { icon: Variable, label: 'Parameters', path: '/parameters', tooltip: 'Buat parameter dinamis (dropdown, slider) yang bisa mengubah tampilan chart dan dashboard secara interaktif.' },
  { icon: Clock, label: 'Scheduled Reports', path: '/scheduled-reports', tooltip: 'Jadwalkan pengiriman laporan otomatis via email. Atur frekuensi harian, mingguan, atau bulanan.' },
  { icon: ShieldCheck, label: 'Row-Level Security', path: '/rls', tooltip: 'Atur akses data per baris berdasarkan role pengguna. Pastikan setiap user hanya melihat data yang relevan.' },
  { icon: Code, label: 'Embed & Share', path: '/embed', tooltip: 'Generate kode embed (iframe) atau link untuk menyematkan dashboard/chart di website atau aplikasi lain.' },
  { icon: FileDown, label: 'Export', path: '/export', tooltip: 'Ekspor dashboard atau chart ke PDF, PNG, atau CSV untuk presentasi dan dokumentasi.' },
  { icon: RefreshCw, label: 'Data Refresh', path: '/data-refresh', tooltip: 'Kelola jadwal refresh data: real-time, interval, atau cron schedule. Pastikan data selalu up-to-date.' },
  { icon: BookOpen, label: 'Data Stories', path: '/stories', tooltip: 'Buat narasi data interaktif. Gabungkan teks, chart, dan insight dalam format storytelling.' },
  { icon: LayoutGrid, label: 'Report Templates', path: '/report-templates', tooltip: 'Kelola template laporan. Import dari Power BI, Tableau, PPTX, atau buat template kustom.' },
  { icon: Sparkles, label: 'AI Reports', path: '/ai-reports', tooltip: 'Generate laporan otomatis dengan AI. Pilih dataset dan template, AI akan menganalisis dan membuat insight.' },
  { icon: FileText, label: 'Reports', path: '/reports', tooltip: 'Lihat semua laporan yang sudah dibuat. Kelola, edit, atau bagikan laporan ke tim.' },
  { icon: Bell, label: 'Alerts', path: '/alerts', tooltip: 'Atur notifikasi otomatis saat data melewati threshold tertentu. Dapatkan alert via email atau in-app.' },
  { icon: Shield, label: 'Data Privacy', path: '/privacy', tooltip: 'Kelola privasi data: masking, anonymization, dan audit log akses data sensitif.' },
  { icon: Settings, label: 'Settings', path: '/settings', tooltip: 'Konfigurasi aplikasi: profil, koneksi database, API keys, tema, dan preferensi lainnya.' },
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
            <Tooltip key={item.path} delayDuration={300}>
              <TooltipTrigger asChild>
                <Link
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
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-xs leading-relaxed">
                <p className="font-semibold mb-1">{item.label}</p>
                <p className="text-popover-foreground/80">{item.tooltip}</p>
              </TooltipContent>
            </Tooltip>
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
