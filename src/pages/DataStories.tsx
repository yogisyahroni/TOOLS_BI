import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { motion } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BookOpen, Sparkles, Loader2, Trash2, Eye, Plus, Share2, Download, ChevronLeft, ChevronRight, PieChart, BarChart3, LineChart, AreaChart, ScatterChart as ScatterIcon, Radar, TrendingUp, Grid3X3, Flame, Box, LayoutGrid as LayoutGridIcon, Gauge, SunMedium, Network, Combine, Edit2, Zap, Type, Heading1, BarChart2, Info, ExternalLink } from 'lucide-react';
import { usePDF } from 'react-to-pdf';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useStories, useCreateStory, useDeleteStory, useDatasets, useGenerateReport, useCharts, useDatasetData } from '@/hooks/useApi';
import type { DataStory } from '@/lib/api';
import { SlideBuilder, Slide } from '@/components/SlideBuilder';
import { ChartRenderer } from '@/components/ChartRenderer';
import type { SlideWidget } from '@/types/data';

// ─── Widget type → Icon mapping ───────────────────────────────────────────────
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

// ─── Extended Slide: Slide from SlideBuilder + optional AI chart widgets ──────
interface ExtendedSlide extends Slide {
  slideWidgets?: SlideWidget[];
  subtitle?: string;
}

// ─── Parse story content (backward compatible) ─────────────────────────────────
const parseStoryContent = (content: string): ExtendedSlide[] => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
      return parsed as ExtendedSlide[];
    }
  } catch {
    // not JSON, treat as single markdown slide
  }
  return [
    {
      id: crypto.randomUUID(),
      title: 'Story',
      content: content || '',
    },
  ];
};

// ─── SlideChartCard: render satu widget/chart dari AI Story ───────────────────
function SlideChartCard({ widget, savedCharts }: { widget: SlideWidget; savedCharts: any[] }) {
  const savedChart = useMemo(() => {
    if (widget.chartId) {
      return savedCharts.find((c: any) => String(c.id) === String(widget.chartId));
    }
    return null;
  }, [widget.chartId, savedCharts]);

  const datasetId = widget.datasetId || savedChart?.datasetId || '';
  const { data: rawData, isLoading } = useDatasetData(datasetId, { limit: 10000 });

  const dataset = useMemo(() => ({ data: rawData?.data || [] }), [rawData]);
  const columns = useMemo(() => rawData?.columns || [], [rawData]);

  const numericColumns = useMemo(
    () => columns.filter((c: any) => c.type === 'number' || c.type === 'float' || c.type === 'integer'),
    [columns]
  );
  const categoricalColumns = useMemo(
    () => columns.filter((c: any) => c.type === 'string' || c.type === 'text' || c.type === 'date'),
    [columns]
  );

  const chartType = savedChart?.type || widget.type || 'bar';
  const xAxis = savedChart?.xAxis || widget.xAxis || '';
  const yAxis = savedChart?.yAxis || widget.yAxis || '';
  const groupBy = savedChart?.groupBy || widget.groupBy || '';
  const limit = widget.limit?.toString() || savedChart?.dataLimit || '50';
  const heightClass = widget.height === 'sm' ? 'h-40' : widget.height === 'lg' ? 'h-72' : 'h-52';

  // Fallback for text/kpi/no-chart widgets
  if (widget.type === 'text' || widget.fallbackText) {
    return (
      <div className={`rounded-xl border border-border bg-muted/20 p-5 flex flex-col gap-2 ${widget.width === 'full' ? 'col-span-2' : ''}`}>
        <h4 className="font-semibold text-sm text-foreground">{widget.title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {widget.fallbackText || widget.htmlContent || widget.insight || widget.title}
        </p>
      </div>
    );
  }

  const widthMap = {
    'full': 'col-span-12',
    'half': 'col-span-12 md:col-span-6',
    'third': 'col-span-12 md:col-span-4',
    'quarter': 'col-span-12 md:col-span-6 lg:col-span-3'
  };
  const colSpan = widthMap[widget.width as keyof typeof widthMap] || 'col-span-12';
  // FIX: stat chart type does NOT require xAxis (it aggregates yAxis only)
  const isStatChart = chartType === 'stat';
  const hasRequiredData = datasetId && yAxis && (isStatChart || xAxis);

  return (
    <div className={`group relative rounded-xl border border-border bg-card/60 backdrop-blur-md flex flex-col overflow-hidden transition-all duration-300 hover:border-primary/20 hover:shadow-xl ${colSpan}`}>
      <div className="px-5 pt-5 pb-2 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-muted border border-border group-hover:bg-primary/10 group-hover:border-primary/20 transition-all shrink-0">
            {(() => {
              const Icon = WIDGET_TYPES.find(wt => wt.id === chartType)?.icon || BarChart3;
              return <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />;
            })()}
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-sm text-foreground tracking-tight leading-loose group-hover:text-primary transition-colors">
              {widget.title}
            </h4>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded-full bg-muted border border-border text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{chartType.replace('_', ' ')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-muted border border-border text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{widget.width}</span>
            </div>
          </div>
        </div>
      </div>
      {widget.insight && (
        <div className="px-5 pb-2">
          <p className="text-[11px] text-muted-foreground font-medium leading-relaxed italic line-clamp-1 border-l-2 border-border pl-3">
            "{widget.insight}"
          </p>
        </div>
      )}
      <div className={`${heightClass} p-4 pt-1 relative`}>
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
          </div>
        ) : !hasRequiredData ? (
          <div className="flex flex-col items-center justify-center w-full h-full text-muted-foreground/20 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Info className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium tracking-wide uppercase">Data Not Available</span>
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

// ─── SlideViewer: render satu slide (markdown atau AI chart grid) ──────────────
function SlideViewer({ slide, savedCharts }: { slide: ExtendedSlide; savedCharts: any[] }) {
  const hasAIWidgets = Array.isArray(slide.slideWidgets) && slide.slideWidgets.length > 0;

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Dashboard Banner in Preview */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/30 px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-primary rounded-full" />
              <h2 className="text-2xl font-bold text-foreground tracking-tight">
                {slide.title}
              </h2>
            </div>
            {slide.subtitle && (
              <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
                {slide.subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-4 text-muted-foreground/30 text-[10px] font-bold uppercase tracking-[0.2em] border-b border-border pb-2">
          Overall KPI & Trend
        </div>
        
        {hasAIWidgets ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pb-10">
            {slide.slideWidgets!.map((widget) => (
              <SlideChartCard key={widget.id} widget={widget} savedCharts={savedCharts} />
            ))}
          </div>
        ) : (
          <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-img:rounded-xl pb-10">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {slide.content || ''}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PresentationModal: modal presentasi terpusat ─────────────────────────────
function PresentationModal({
  story,
  open,
  onClose,
  savedCharts,
}: {
  story: DataStory | null;
  open: boolean;
  onClose: () => void;
  savedCharts: any[];
}) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const { toPDF, targetRef } = usePDF({ filename: `${story?.title || 'DataStory'}.pdf` });

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [story?.id]);

  if (!story) return null;

  const slides = parseStoryContent(story.content);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-border bg-card shrink-0">
          <DialogTitle className="text-xl font-bold truncate pr-4">{story.title}</DialogTitle>
          <div className="pr-6">
            <Button variant="outline" size="sm" onClick={() => toPDF()} className="hidden md:flex whitespace-nowrap">
              <Download className="w-4 h-4 mr-2" /> Export PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Slide content — SCROLLABLE */}
        <div className="flex-1 bg-muted/20 flex flex-col min-h-0" ref={targetRef}>
          {/* FIX: overflow-y-auto pada inner div agar slide bisa di-scroll */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-start gap-6 min-h-0">
            {slides.length > 0 && (
              <SlideViewer slide={slides[currentSlideIndex]} savedCharts={savedCharts} />
            )}
          </div>

          {/* Navigation (only if multiple slides) */}
          {slides.length > 1 && (
            <div className="h-16 bg-card border-t border-border flex items-center justify-between px-6 shrink-0">
              <Button
                variant="outline"
                onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                disabled={currentSlideIndex === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Sebelumnya
              </Button>
              <div className="flex items-center gap-2 overflow-x-auto max-w-[50%]">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlideIndex(idx)}
                    className={`rounded-full transition-all ${
                      idx === currentSlideIndex
                        ? 'bg-primary w-4 h-2'
                        : 'bg-primary/30 hover:bg-primary/50 w-2 h-2'
                    }`}
                    title={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
              <Button
                variant="default"
                onClick={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
                disabled={currentSlideIndex === slides.length - 1}
              >
                Berikutnya <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DataStories() {
  const { data: stories = [], isLoading } = useStories();
  const { data: datasets = [] } = useDatasets();
  const { data: savedCharts = [] } = useCharts();
  const createMut = useCreateStory();
  const deleteMut = useDeleteStory();
  const generateMut = useGenerateReport();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedDsId, setSelectedDsId] = useState('');
  const [storyFocus, setStoryFocus] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [slides, setSlides] = useState<Slide[]>([{ id: crypto.randomUUID(), title: 'Slide 1', content: '' }]);
  const navigate = useNavigate();

  // FIX: satu controlled state untuk modal presentasi
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);

  const openStory = useMemo(
    () => stories.find((s: DataStory) => s.id === openStoryId) || null,
    [stories, openStoryId]
  );

  // Auto-open modal dari URL jika ada ?preview=id (hanya modal, bukan lihat presentasi)
  useEffect(() => {
    const sId = searchParams.get('preview');
    if (sId && stories.length > 0) {
      const found = stories.find((s: DataStory) => s.id === sId);
      if (found) setOpenStoryId(sId);
    }
  }, [searchParams, stories]);

  // Share — buka EmbedShare dengan pre-select story ini (token aman, bisa revoke)
  const handleShare = (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
    navigate(`/embed-share?type=story&id=${storyId}`);
  };

  // Buka presentasi full-screen di tab baru (Tableau Stories style)
  const handleOpenPresentation = (storyId: string) => {
    window.open(`/stories/view/${storyId}`, '_blank', 'noopener,noreferrer');
  };

  const handleGenerateAI = async () => {
    if (!selectedDsId) { toast({ title: 'Pilih dataset terlebih dahulu', variant: 'destructive' }); return; }
    try {
      const result = await generateMut.mutateAsync({ datasetId: selectedDsId, prompt: storyFocus || undefined });
      const aiSlides: Slide[] = [{ id: crypto.randomUUID(), title: result.title || 'AI Story', content: result.content }];
      await createMut.mutateAsync({ title: result.title, content: JSON.stringify(aiSlides), datasetId: selectedDsId });
      toast({ title: 'Story berhasil dibuat!', description: 'AI data story telah disimpan.' });
      setStoryFocus('');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Gagal membuat story.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const handleCreateManual = async () => {
    if (!manualTitle || slides.length === 0) { toast({ title: 'Judul dan konten diperlukan', variant: 'destructive' }); return; }
    const hasContent = slides.some(s => s.content && s.content.trim() !== '' && s.content !== '<p></p>');
    if (!hasContent) { toast({ title: 'Tambahkan konten ke slide Anda', variant: 'destructive' }); return; }
    try {
      await createMut.mutateAsync({ title: manualTitle, content: JSON.stringify(slides) });
      setManualTitle('');
      setSlides([{ id: crypto.randomUUID(), title: 'Slide 1', content: '' }]);
      setIsComposing(false);
      toast({ title: 'Story berhasil disimpan' });
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan story.', variant: 'destructive' });
    }
  };

  // ── Manual Compose Mode ──────────────────────────────────────────────────────
  if (isComposing) {
    return (
      <div className="h-full flex flex-col p-6 space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" /> Story Builder
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Rancang layout narasi Anda</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsComposing(false)}>Batal</Button>
            <Button onClick={handleCreateManual} disabled={createMut.isPending || !manualTitle}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Simpan Presentasi
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-4 flex-1 min-h-[500px]">
          <Input
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Judul Presentasi..."
            className="text-xl md:text-2xl font-semibold px-4 py-6 border border-border shadow-sm bg-card hover:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/50 transition-colors"
          />
          <div className="flex flex-1 gap-4 overflow-hidden">
            <div className="flex-[3] rounded-xl shadow-sm bg-background border border-border overflow-hidden">
              <SlideBuilder slides={slides} onChange={setSlides} />
            </div>
            <div className="flex-1 max-w-[300px] border border-border bg-card/80 backdrop-blur-sm hidden md:flex flex-col shadow-sm z-30 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border font-semibold flex items-center justify-between text-foreground">
                <div className="flex items-center gap-2"><LayoutGridIcon className="w-4 h-4 text-primary" /> Elemen</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Blok Teks</h4>
                  <div className="space-y-2">
                    {[{ type: 'heading', Icon: Heading1, label: 'Heading' }, { type: 'paragraph', Icon: Type, label: 'Paragraf' }].map(({ type, Icon, label }) => (
                      <div key={type} className="bg-background rounded-lg border border-border/50 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-border/80 group cursor-grab active:cursor-grabbing"
                        draggable={true} unselectable="on"
                        onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ source: 'text-element', type })); e.dataTransfer.effectAllowed = 'copy'; }}>
                        <div className="p-2.5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                          <span className="text-sm font-medium text-foreground">{label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-px bg-border my-2" />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Chart Tersimpan</h4>
                  {savedCharts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-background rounded-xl border border-dashed border-border shadow-sm mt-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 shadow-inner"><PieChart className="w-6 h-6 text-primary/70" /></div>
                      <h4 className="text-sm font-semibold text-foreground mb-1.5">Belum Ada Chart</h4>
                      <p className="text-xs text-muted-foreground mb-5 leading-relaxed">Buat chart terlebih dahulu di Chart Builder.</p>
                    </div>
                  ) : (
                    savedCharts.map((chart: any) => {
                      const Icon = WIDGET_TYPES.find(wt => wt.id === chart.type)?.icon || BarChart3;
                      return (
                        <div key={chart.id} className="bg-background rounded-xl border border-border/50 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-border/80 group cursor-grab active:cursor-grabbing mb-2"
                          draggable={true} unselectable="on"
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({ source: 'saved-chart', chartId: chart.id, title: chart.title, type: chart.type, datasetId: chart.datasetId, xAxis: chart.xAxis, yAxis: chart.yAxis, groupBy: chart.groupBy }));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}>
                          <div className="p-3 flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Icon className="w-4 h-4 text-primary" /></div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-foreground truncate" title={chart.title}>{chart.title}</h4>
                              <p className="text-[10px] text-muted-foreground truncate">{chart.type} • {chart.xAxis}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* FIX: Modal presentasi terpusat — dikontrol oleh openStoryId */}
      <PresentationModal
        story={openStory}
        open={openStoryId !== null}
        onClose={() => {
          setOpenStoryId(null);
          setSearchParams({});
        }}
        savedCharts={savedCharts}
      />

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Data Stories <HelpTooltip text="Buat presentasi interaktif dari data Anda. Dukung multi-slide dan chart interaktif." />
            </h1>
            <p className="text-muted-foreground">Presentasi narasi interaktif berbasis data</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Generate Story Baru
        </h3>
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Dataset</Label>
            <Select value={selectedDsId} onValueChange={setSelectedDsId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Pilih dataset" /></SelectTrigger>
              <SelectContent>{datasets.map((ds: any) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Fokus analisis (opsional)</Label>
            <Input placeholder="misal: tren penjualan, performa regional" value={storyFocus} onChange={(e) => setStoryFocus(e.target.value)} className="w-64" />
          </div>
          <Button onClick={handleGenerateAI} disabled={!selectedDsId || generateMut.isPending || createMut.isPending}>
            {(generateMut.isPending || createMut.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate dengan AI
          </Button>
          <div className="px-2 font-medium text-muted-foreground">atau</div>
          <Button variant="default" onClick={() => setIsComposing(true)}>
            <Plus className="w-4 h-4 mr-2" />Buat Presentasi
          </Button>
        </div>
      </motion.div>

      {stories.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Belum ada story</h3>
          <p className="text-muted-foreground">Buat presentasi baru atau biarkan AI menghasilkan story dari data Anda</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stories.map((story: DataStory, i: number) => {
            const parsedSlides = parseStoryContent(story.content);
            const hasAICharts = parsedSlides.some(s => Array.isArray((s as ExtendedSlide).slideWidgets) && (s as ExtendedSlide).slideWidgets!.length > 0);
            const firstSlidePreview = parsedSlides[0]?.content?.replace(/<[^>]+>/g, '').substring(0, 150) || '';

            return (
              <motion.div key={story.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-1 line-clamp-1" title={story.title}>{story.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{parsedSlides.length} Slide{parsedSlides.length !== 1 ? 's' : ''}</span>
                        {hasAICharts && <span className="flex items-center gap-1 text-primary"><Sparkles className="w-3 h-3" /> AI Charts</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {/* FIX: Eye button kini trigger modal terpusat */}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpenStoryId(story.id)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={(e) => handleShare(e, story.id)}>
                      <Share2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      disabled={deleteMut.isPending}
                      onClick={() => deleteMut.mutate(story.id, { onSuccess: () => toast({ title: 'Story dihapus' }) })}>
                      {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                {!hasAICharts && firstSlidePreview && (
                  <div className="flex-1 relative overflow-hidden text-sm text-muted-foreground/80 my-2">
                    <div className="line-clamp-3 prose prose-sm dark:prose-invert prose-p:my-1 opacity-80">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{firstSlidePreview}</ReactMarkdown>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                  </div>
                )}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-border text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 shadow-sm">
                    <Sparkles className="w-3 h-3 text-primary" />
                    {formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}
                  </div>
                  {/* "Lihat Presentasi" → new tab full screen (Tableau Stories style) */}
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleOpenPresentation(story.id)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Lihat Presentasi
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
