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
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Download, Share2, ArrowLeft,
  BarChart3, LineChart, PieChart, AreaChart, LayoutGridIcon,
  BarChart2, TrendingUp, Grid3X3, Flame, Box, Gauge, SunMedium,
  Network, Combine, Edit2, Zap, Radar, ScatterChart as ScatterIcon,
  Loader2, Info, Play, Pause, BookOpen, ExternalLink,
} from 'lucide-react';
import { usePDF } from 'react-to-pdf';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useStories, useCharts, useDatasetData } from '@/hooks/useApi';
import type { DataStory } from '@/lib/api';
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
function PresentationChartCard({ widget, savedCharts }: { widget: SlideWidget; savedCharts: any[] }) {
  const savedChart = useMemo(() => {
    if (widget.chartId) return savedCharts.find((c: any) => String(c.id) === String(widget.chartId));
    return null;
  }, [widget.chartId, savedCharts]);

  const datasetId = widget.datasetId || savedChart?.datasetId || '';
  const { data: rawData, isLoading } = useDatasetData(datasetId, { limit: 10000 });

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
  const heightClass = widget.height === 'sm' ? 'h-40' : widget.height === 'lg' ? 'h-80' : 'h-60';
  const colSpan = widget.width === 'full' ? 'col-span-2' : '';

  return (
    <div className={`rounded-xl border border-white/10 bg-[#0f172a]/60 backdrop-blur flex flex-col overflow-hidden shadow-lg ${colSpan}`}>
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2 border-b border-white/10">
        <div>
          <h4 className="font-semibold text-sm text-white leading-tight">{widget.title}</h4>
          {widget.insight && (
            <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{widget.insight}</p>
          )}
        </div>
        <Icon className="w-4 h-4 shrink-0 text-cyan-400/70 mt-0.5" />
      </div>
      <div className={`${heightClass} p-2 relative`}>
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
}: {
  slide: ExtendedSlide;
  slideNumber: number;
  totalSlides: number;
  savedCharts: any[];
}) {
  const hasAIWidgets = Array.isArray(slide.slideWidgets) && slide.slideWidgets.length > 0;

  return (
    <div className="w-full flex flex-col min-h-full">
      {/* Slide header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-medium text-cyan-400/70 uppercase tracking-wider">
            Slide {slideNumber} / {totalSlides}
          </span>
        </div>
        <h2 className="text-3xl font-bold text-white tracking-tight leading-tight">{slide.title}</h2>
        {slide.subtitle && (
          <p className="text-sm text-white/50 mt-2">{slide.subtitle}</p>
        )}
      </div>

      {/* Slide body */}
      <div className="flex-1">
        {hasAIWidgets ? (
          <div className="grid grid-cols-2 gap-5">
            {slide.slideWidgets!.map((widget) => (
              <PresentationChartCard key={widget.id} widget={widget} savedCharts={savedCharts} />
            ))}
          </div>
        ) : (
          <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-white prose-p:text-white/70 prose-strong:text-white">
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
  const { data: stories = [], isLoading } = useStories();
  const { data: savedCharts = [] } = useCharts();
  const { toast } = useToast();
  const { toPDF, targetRef } = usePDF({ filename: 'Presentation.pdf' });

  const [currentSlide, setCurrentSlide] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const AUTO_PLAY_INTERVAL = 8000; // 8 detik per slide

  const story = useMemo(
    () => stories.find((s: DataStory) => s.id === storyId) || null,
    [stories, storyId]
  );

  const slides = useMemo(
    () => (story ? parseStoryContent(story.content) : []),
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
          <h2 className="text-xl font-semibold text-white mb-2">Presentasi tidak ditemukan</h2>
          <p className="text-sm mb-6">Story ini mungkin telah dihapus atau link tidak valid.</p>
          <Link to="/stories">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
              <ArrowLeft className="w-4 h-4 mr-2" /> Kembali ke Data Stories
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top bar ── */}
      <header className="h-14 bg-[#0f172a]/90 backdrop-blur border-b border-white/10 flex items-center justify-between px-6 shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link to="/stories" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
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
          {/* Open in stories list */}
          <Link to="/stories" target="_self">
            <Button variant="outline" size="sm"
              className="border-white/20 text-white/70 hover:bg-white/10 h-8 px-3 text-xs gap-1.5 hidden md:flex">
              <ExternalLink className="w-3.5 h-3.5" /> Edit
            </Button>
          </Link>
        </div>
      </header>

      {/* ── Main slide area ── */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {/* Slide content */}
        <div className="flex-1 overflow-y-auto" ref={targetRef}>
          <div className="min-h-full p-8 md:p-14 max-w-6xl mx-auto">
            {slides.length > 0 && (
              <PresentationSlide
                slide={slides[currentSlide]}
                slideNumber={currentSlide + 1}
                totalSlides={slides.length}
                savedCharts={savedCharts}
              />
            )}
          </div>
        </div>

        {/* ── Right thumbnail panel (if multiple slides) ── */}
        {slides.length > 1 && (
          <aside className="hidden lg:flex w-52 bg-[#0f172a]/70 border-l border-white/10 flex-col py-4 gap-2 overflow-y-auto shrink-0">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider px-4 mb-1">
              Slide
            </p>
            {slides.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlide(idx)}
                className={`mx-3 rounded-lg border text-left transition-all px-3 py-2.5 ${
                  idx === currentSlide
                    ? 'border-cyan-500 bg-cyan-500/10 text-white'
                    : 'border-white/10 bg-transparent text-white/40 hover:border-white/30 hover:text-white/70'
                }`}
              >
                <p className="text-[10px] text-current/60 mb-0.5">{idx + 1}</p>
                <p className="text-xs font-medium leading-tight line-clamp-2">{s.title}</p>
              </button>
            ))}
          </aside>
        )}
      </main>

      {/* ── Bottom navigation bar ── */}
      <footer className="h-14 bg-[#0f172a]/90 backdrop-blur border-t border-white/10 flex items-center justify-between px-6 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
          disabled={currentSlide === 0}
          className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 gap-1.5"
        >
          <ChevronLeft className="w-4 h-4" /> Sebelumnya
        </Button>

        {/* Dot navigation */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-[40%]">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={`rounded-full transition-all shrink-0 ${
                idx === currentSlide
                  ? 'bg-cyan-400 w-5 h-2'
                  : 'bg-white/20 hover:bg-white/40 w-2 h-2'
              }`}
              title={`Slide ${idx + 1}`}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
          disabled={currentSlide === slides.length - 1}
          className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 gap-1.5"
        >
          Berikutnya <ChevronRight className="w-4 h-4" />
        </Button>
      </footer>
    </div>
  );
}
