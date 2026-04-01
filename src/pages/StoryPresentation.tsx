/**
 * StoryPresentation.tsx
 * Full-screen presentation viewer — public, no sidebar, Tableau Stories style.
 * URL: /stories/view/:storyId
 *
 * Features:
 * - Fullscreen slides with live data (charts always fetch fresh data)
 * - Keyboard navigation (← →)
 * - Auto-play mode (optional)
 * - Export PDF
 * - Share link copy
 * - No auth required (public read)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useParams, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  ChevronLeft, ChevronRight, Download, Share2, ArrowLeft,
  BarChart3, LineChart, PieChart, AreaChart, LayoutGridIcon,
  BarChart2, TrendingUp, Grid3X3, Flame, Box, Gauge, SunMedium,
  Network, Combine, Edit2, Zap, Radar, ScatterChart as ScatterIcon,
  Loader2, Info, Play, Pause, BookOpen, ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { usePDF } from 'react-to-pdf';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useStories, useCharts, useDatasetData } from '@/hooks/useApi';
import { API_BASE, type DataStory, type SavedChart } from '@/lib/api';
import { ChartRenderer } from '@/components/ChartRenderer';
import type { SlideWidget } from '@/types/data';
import type { Slide } from '@/components/SlideBuilder';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExtendedSlide extends Slide {
  slideWidgets?: SlideWidget[];
  subtitle?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const WIDGET_TYPES = [
  { id: 'bar', icon: BarChart3 },
  { id: 'horizontal_bar', icon: BarChart2 },
  { id: 'line', icon: LineChart },
  { id: 'pie', icon: PieChart },
  { id: 'area', icon: AreaChart },
  { id: 'scatter', icon: ScatterIcon },
  { id: 'radar', icon: Radar },
  { id: 'funnel', icon: TrendingUp },
  { id: 'treemap', icon: Grid3X3 },
  { id: 'waterfall', icon: BarChart3 },
  { id: 'heatmap', icon: Flame },
  { id: 'boxplot', icon: Box },
  { id: 'stat', icon: LayoutGridIcon },
  { id: 'gauge', icon: Gauge },
  { id: 'sunburst', icon: SunMedium },
  { id: 'sankey', icon: Network },
  { id: 'combo', icon: Combine },
  { id: 'text', icon: Edit2 },
  { id: 'action', icon: Zap },
];

const parseStoryContent = (content: string): ExtendedSlide[] => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
      return parsed as ExtendedSlide[];
    }
  } catch {
    // not JSON
  }
  return [{ id: crypto.randomUUID(), title: 'Story', content: content || '' }];
};

// ─── Chart widget card ─────────────────────────────────────────────────────────
function PresentationChartCard({ widget, savedCharts, token, publicCharts }: { widget: SlideWidget; savedCharts: any[]; token?: string; publicCharts?: SavedChart[] }) {
  const activeCharts = token ? (publicCharts || []) : savedCharts;

  const savedChart = useMemo(() => {
    if (!widget.chartId) return null;
    return activeCharts.find((c: SavedChart) => String(c.id) === String(widget.chartId)) || null;
  }, [widget.chartId, activeCharts]);

  const datasetId = widget.datasetId || savedChart?.datasetId || '';
  
  // Public data state
  const [publicData, setPublicData] = useState<any>(null);
  const [publicLoading, setPublicLoading] = useState(false);

  useEffect(() => {
    if (!token || !datasetId) return;
    const fetchPublicData = async () => {
      try {
        setPublicLoading(true);
        const res = await axios.get(`${API_BASE}/embed/data/${datasetId}?token=${token}`);
        setPublicData(res.data);
      } catch (err) {
        console.error('Error fetching public chart data:', err);
      } finally {
        setPublicLoading(false);
      }
    };
    fetchPublicData();
  }, [token, datasetId]);

  // Private data hook
  const { data: privateData, isLoading: privateLoading } = useDatasetData(
    datasetId, 
    { limit: 10000 }, 
    { enabled: !token && !!datasetId }
  );

  const rawData = token ? publicData : privateData;
  const isLoading = token ? publicLoading : privateLoading;

  const dataset = useMemo(() => ({ data: rawData?.data || [] }), [rawData]);
  const columns = useMemo(() => rawData?.columns || [], [rawData]);
  const numericColumns = useMemo(
    () => columns.filter((c: any) => ['number', 'float', 'integer'].includes(c.type)),
    [columns]
  );
  const categoricalColumns = useMemo(
    () => columns.filter((c: any) => ['string', 'text', 'date'].includes(c.type)),
    [columns]
  );

  const chartType = savedChart?.type || widget.type || 'bar';
  const xAxis = savedChart?.xAxis || widget.xAxis || '';
  const yAxis = savedChart?.yAxis || widget.yAxis || '';
  const groupBy = savedChart?.groupBy || widget.groupBy || '';
  const limit = widget.limit?.toString() || savedChart?.dataLimit || '50';

  const isStatChart = chartType === 'stat';
  const hasRequiredData = datasetId && yAxis && (isStatChart || xAxis);

  // Text / fallback widgets
  if (widget.type === 'text' || widget.fallbackText) {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-2 ${widget.width === 'full' ? 'col-span-2' : ''}`}>
        <h4 className="font-semibold text-sm text-white">{widget.title}</h4>
        <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
          {widget.fallbackText || widget.htmlContent || widget.insight || widget.title}
        </p>
      </div>
    );
  }

  const Icon = WIDGET_TYPES.find(wt => wt.id === chartType)?.icon || BarChart3;
  const heightClass = widget.height === 'sm' ? 'h-48' : widget.height === 'lg' ? 'h-96' : 'h-72';
  
  const widthMap = {
    'full': 'col-span-12',
    'half': 'col-span-12 md:col-span-6',
    'third': 'col-span-12 md:col-span-4',
    'quarter': 'col-span-12 md:col-span-6 lg:col-span-3'
  };
  const colSpan = widthMap[widget.width] || 'col-span-12';

  return (
    <div className={`group relative rounded-xl border border-white/5 bg-[#0f172a]/60 backdrop-blur-md flex flex-col overflow-hidden transition-all duration-300 hover:border-primary/20 hover:shadow-xl ${colSpan}`}>
      <div className="px-5 pt-5 pb-2 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-white/5 border border-white/5 group-hover:bg-primary/10 group-hover:border-primary/20 transition-all shrink-0">
            <Icon className="w-4 h-4 text-white/40 group-hover:text-primary transition-colors" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-sm text-white/90 tracking-tight leading-loose group-hover:text-primary transition-colors">
              {widget.title}
            </h4>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] text-white/40 font-bold uppercase tracking-widest">{chartType.replace('_', ' ')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] text-white/40 font-bold uppercase tracking-widest">{widget.width}</span>
            </div>
          </div>
        </div>
      </div>
      {widget.insight && (
        <div className="px-5 pb-2">
          <p className="text-[11px] text-white/40 font-medium leading-relaxed italic line-clamp-1 border-l-2 border-white/5 pl-3">
            "{widget.insight}"
          </p>
        </div>
      )}
      <div className={`${heightClass} p-4 pt-1 relative`}>
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400/50" />
          </div>
        ) : !hasRequiredData ? (
          <div className="flex flex-col items-center justify-center w-full h-full text-white/30 gap-2">
            <Info className="w-5 h-5" />
            <span className="text-xs">Data tidak tersedia</span>
          </div>
        ) : (
          <ChartRenderer
            chartType={chartType}
            xAxis={xAxis}
            yAxis={yAxis}
            groupBy={groupBy}
            dataLimit={limit}
            dataset={dataset}
            numericColumns={numericColumns}
            categoricalColumns={categoricalColumns}
            sortOrder={widget.sortOrder || 'desc'}
          />
        )}
      </div>
    </div>
  );
}

// ─── Slide Viewer (full-screen style) ─────────────────────────────────────────
function PresentationSlide({
  slide,
  slideNumber,
  totalSlides,
  savedCharts,
  token,
  publicCharts,
  allSlides,
  currentSlideIdx,
  onSlideChange
}: {
  slide: ExtendedSlide;
  slideNumber: number;
  totalSlides: number;
  savedCharts: any[];
  token?: string;
  publicCharts?: SavedChart[];
  allSlides: ExtendedSlide[];
  currentSlideIdx: number;
  onSlideChange: (idx: number) => void;
}) {
  const hasAIWidgets = Array.isArray(slide.slideWidgets) && slide.slideWidgets.length > 0;

  return (
    <div className="w-full flex flex-col min-h-full gap-8">
      {/* ── Dashboard Banner (Image 1 Style) ── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#0f172a]/60 backdrop-blur-2xl px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
          <div className="space-y-4 max-w-4xl">
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-10 bg-cyan-400 rounded-full" />
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {slide.title}
              </h1>
            </div>
            <p className="text-white/50 text-base md:text-lg leading-relaxed max-w-3xl">
              {slide.subtitle || slide.content?.slice(0, 150) + "..." || "Executive KPI overview with trend analysis, performance by region/PIC, SLA aging table."}
            </p>
          </div>
        </div>

        {/* Tab Navigation (Pills inside Banner) */}
        {allSlides.length > 1 && (
          <div className="mt-8 flex flex-wrap gap-2 p-1.5 bg-black/40 rounded-xl border border-white/5 w-fit">
            {allSlides.map((s, idx) => {
              const isActive = idx === currentSlideIdx;
              return (
                <button
                  key={s.id}
                  onClick={() => onSlideChange(idx)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                    isActive 
                      ? 'bg-white text-black shadow-lg shadow-white/10' 
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                >
                  {idx + 1}. {s.title}
                </button>
              );
            })}
          </div>
        )}

        {/* Filters bar placeholder (Aesthetic only as per Image 1) */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
          <div className="flex items-center gap-4 py-1">
             <div className="flex items-center gap-1.5 text-white/30 text-[10px] font-bold uppercase tracking-widest mr-2">
                <ChevronRight className="w-3 h-3" /> Filters:
             </div>
             <div className="flex flex-wrap gap-2">
                {['PERIODE', 'REGIONAL', 'ORIGIN', 'ZONA', 'CUSTOMER NAME', 'STATUS'].map(f => (
                  <button key={f} className="px-3 py-1 rounded-full border border-white/10 bg-black/20 text-[9px] font-bold text-white/50 hover:border-white/30 hover:text-white transition-all">
                    {f}
                  </button>
                ))}
             </div>
          </div>
        </div>
      </div>

      {/* Slide body */}
      <div className="flex-1 px-1">
        <div className="flex items-center gap-2 mb-6 text-white/30 text-[10px] font-bold uppercase tracking-[0.2em] border-b border-white/5 pb-2">
          Overall KPI & Trend
        </div>
        
        {hasAIWidgets ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-20">
            {slide.slideWidgets!.map((widget) => (
              <PresentationChartCard key={widget.id} widget={widget} savedCharts={savedCharts} token={token} publicCharts={publicCharts} />
            ))}
          </div>
        ) : (
          <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-white prose-p:text-white/70 prose-strong:text-white overflow-hidden pb-20">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {slide.content || ''}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Presentation Page ────────────────────────────────────────────────────
export default function StoryPresentation() {
  const { storyId } = useParams<{ storyId: string }>();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const token = searchParams.get('token') || undefined;

  const [publicStory, setPublicStory] = useState<DataStory | null>(null);
  const [publicCharts, setPublicCharts] = useState<SavedChart[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  // Authenticated hooks
  // Authenticated hooks - only enabled if not in public view mode
  const { data: stories = [], isLoading: privateLoading } = useStories({ enabled: !token });
  const { data: savedCharts = [] } = useCharts(undefined, { enabled: !token });
  
  const { toast } = useToast();
  const { toPDF, targetRef } = usePDF({ filename: 'Presentation.pdf' });

  const [currentSlide, setCurrentSlide] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const AUTO_PLAY_INTERVAL = 8000; // 8 detik per slide

  // Public fetch effect
  useEffect(() => {
    if (!token) return;
    const fetchPublicStory = async () => {
      try {
        setPublicLoading(true);
        const res = await axios.get(`${API_BASE}/embed/view/${token}`);
        if (res.data.resourceType === 'story' && res.data.resourceData) {
          if (res.data.resourceData.story) {
            setPublicStory(res.data.resourceData.story);
            if (res.data.resourceData.charts) {
              setPublicCharts(res.data.resourceData.charts);
            }
          } else {
            // Fallback if structure is old
            setPublicStory(res.data.resourceData);
          }
        } else {
          setPublicError('Resource bukan tipe Story atau data tidak ditemukan.');
        }
      } catch (err: any) {
        setPublicError(err.response?.data?.error || 'Gagal memuat story publik.');
      } finally {
        setPublicLoading(false);
      }
    };
    fetchPublicStory();
  }, [token]);

  const story = useMemo(
    () => {
      if (token) return publicStory;
      return stories.find((s: DataStory) => s.id === storyId) || null;
    },
    [stories, storyId, token, publicStory]
  );

  const isLoading = token ? publicLoading : privateLoading;

  const slides = useMemo(
    () => {
      if (!story) return [];
      // Prioritaskan slides terstruktur (dari field slides atau legacy charts)
      const rawSlides = (story as any).slides || (story as any).charts;
      if (rawSlides) {
        try {
          const parsed = typeof rawSlides === 'string' ? JSON.parse(rawSlides) : rawSlides;
          if (Array.isArray(parsed) && parsed.length > 0) return parsed as ExtendedSlide[];
        } catch (e) {
          console.error("Failed to parse story slides:", e);
        }
      }
      // Fallback ke parsing content (legacy format)
      return parseStoryContent(story.content);
    },
    [story]
  );

  // Keyboard navigation
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentSlide((p) => Math.min(slides.length - 1, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentSlide((p) => Math.max(0, p - 1));
      }
    },
    [slides.length]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((p) => {
        if (p >= slides.length - 1) { setAutoPlay(false); return p; }
        return p + 1;
      });
    }, AUTO_PLAY_INTERVAL);
    return () => clearInterval(timer);
  }, [autoPlay, slides.length]);

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: story?.title || 'Data Story', url }).catch(() => {
        navigator.clipboard.writeText(url);
        toast({ title: 'Link disalin!' });
      });
    } else {
      navigator.clipboard.writeText(url);
      toast({ title: 'Link disalin!', description: url });
    }
  };

  // ── Loading / Not found ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white/60">
          <Loader2 className="w-10 h-10 animate-spin text-cyan-400" />
          <p className="text-sm">Memuat presentasi...</p>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-center text-white/60">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-white/20" />
          <h2 className="text-xl font-semibold text-white mb-2">
            {publicError || 'Presentasi tidak ditemukan'}
          </h2>
          <p className="text-sm mb-6">
            {token ? 'Link mungkin tidak valid atau sudah kedaluwarsa.' : 'Story ini mungkin telah dihapus atau link tidak valid.'}
          </p>
          {!token && (
            <Link to="/stories">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                <ArrowLeft className="w-4 h-4 mr-2" /> Kembali ke Data Stories
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top bar ── */}
      <header className="h-14 bg-[#0f172a]/90 backdrop-blur border-b border-white/10 flex items-center justify-between px-6 shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {!token && (
            <Link to="/stories" className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          {token && (
            <div className="text-cyan-400">
               <ShieldCheck className="w-4 h-4" />
            </div>
          )}
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white truncate max-w-[200px] md:max-w-[400px]">
              {story.title}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto play */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoPlay(!autoPlay)}
            className="text-white/60 hover:text-white hover:bg-white/10 h-8 px-3 text-xs gap-1.5"
          >
            {autoPlay
              ? <><Pause className="w-3.5 h-3.5" /> Stop</>
              : <><Play className="w-3.5 h-3.5" /> Auto Play</>}
          </Button>
          {/* Share */}
          <Button variant="ghost" size="sm" onClick={handleShare}
            className="text-white/60 hover:text-white hover:bg-white/10 h-8 px-3 gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-xs">Bagikan</span>
          </Button>
          {/* Export PDF */}
          <Button variant="ghost" size="sm" onClick={() => toPDF()}
            className="text-white/60 hover:text-white hover:bg-white/10 h-8 px-3 gap-1.5">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-xs">Export PDF</span>
          </Button>
          {/* Open in stories list (Hidden in public mode) */}
          {!token && (
            <Link to="/stories" target="_self">
              <Button variant="outline" size="sm"
                className="border-white/20 text-white/70 hover:bg-white/10 h-8 px-3 text-xs gap-1.5 hidden md:flex">
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* ── Tabs Navigation (Moved to Slide Banner) ── */}

      {/* ── Main slide area ── */}
      <main className="flex-1 flex overflow-hidden min-h-0 bg-slate-950">
        {/* Slide content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar" ref={targetRef}>
          <div className="min-h-full p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
            {slides.length > 0 && (
              <PresentationSlide
                slide={slides[currentSlide]}
                slideNumber={currentSlide + 1}
                totalSlides={slides.length}
                savedCharts={savedCharts}
                token={token}
                publicCharts={publicCharts}
                allSlides={slides}
                currentSlideIdx={currentSlide}
                onSlideChange={setCurrentSlide}
              />
            )}
          </div>
        </div>
      </main>

      {/* ── Bottom navigation bar ── */}
      <footer className="h-16 bg-[#0f172a]/95 backdrop-blur border-t border-white/10 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-4">
           {/* Color swatches as per Template Image 1 */}
           <div className="flex gap-2 mr-6 items-center">
              <div className="w-4 h-4 rounded bg-[#334155]" />
              <div className="w-4 h-4 rounded bg-[#fbbf24]" />
              <div className="w-4 h-4 rounded bg-[#38bdf8]" />
              <div className="w-4 h-4 rounded bg-[#f8fafc]" />
           </div>
           
           <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            disabled={currentSlide === 0}
            className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-white/40 text-xs font-mono">
            {String(currentSlide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
            disabled={currentSlide === slides.length - 1}
            className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 gap-1.5"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button className="bg-[#0f172a] border border-white/20 text-white hover:bg-white/5 h-10 px-6 rounded-xl font-bold flex items-center gap-2 group">
            <LayoutGridIcon className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
            Use Template
          </Button>
        </div>
      </footer>
    </div>
  );
}
