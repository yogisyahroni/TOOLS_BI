/**
 * AI Reports — AI Story Generator
 * 4-Step wizard: Setup → AI Plan → Execute → Result
 * Menghasilkan Data Story multi-slide dengan chart interaktif.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, FileText, Database, Cpu, CheckCircle2,
  Loader2, ChevronRight, ChevronLeft,
  BarChart3, PieChart, LineChart, AreaChart,
  TrendingUp, Grid3X3, Flame, Gauge, BarChart2,
  Eye, AlertTriangle, BookOpen, Zap, RefreshCcw,
  Target, Settings2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { builtinTemplates } from '@/lib/builtinTemplates';
import { planPageSections, planToSlideWidget, type AIPagePlan } from '@/lib/aiChartPlanner';
import { useDatasets, useDatasetData, useReportTemplates, useCreateChart, useCreateStory } from '@/hooks/useApi';
import type { ReportTemplate } from '@/types/data';

// ─── Wizard step type ─────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4;

// ─── Chart type icon map ──────────────────────────────────────────────────────
const CHART_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  bar: BarChart3,
  horizontal_bar: BarChart2,
  line: LineChart,
  pie: PieChart,
  area: AreaChart,
  funnel: TrendingUp,
  treemap: Grid3X3,
  heatmap: Flame,
  gauge: Gauge,
  stat: Target,
  text: FileText,
};

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: 'Setup', icon: Database },
  { n: 2, label: 'AI Plan', icon: Cpu },
  { n: 3, label: 'Generate', icon: Zap },
  { n: 4, label: 'Selesai', icon: CheckCircle2 },
];

function StepBar({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = s.n < current;
        const active = s.n === current;
        return (
          <React.Fragment key={s.n}>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              active ? 'bg-primary text-primary-foreground shadow-glow' :
              done ? 'bg-primary/15 text-primary' :
              'bg-muted/50 text-muted-foreground'
            }`}>
              {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.n}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 transition-all duration-500 ${done ? 'bg-primary/40' : 'bg-border/40'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────
function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: ReportTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const pageCount = template.pages?.length || 0;
  const sectionCount = template.pages?.reduce((sum, p) => sum + (p.sections?.length || 0), 0) || 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex flex-col gap-2 hover:shadow-md ${
        selected
          ? 'border-primary bg-primary/5 shadow-glow'
          : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${template.colorScheme?.primary}22` }}
        >
          <BarChart3 className="w-4 h-4" style={{ color: template.colorScheme?.primary || '#6366f1' }} />
        </div>
        {selected && (
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        )}
      </div>
      <div>
        <h4 className="font-semibold text-sm text-foreground leading-tight">{template.name}</h4>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 mt-auto pt-1">
        <Badge variant="secondary" className="text-[10px] h-5">{pageCount} slide</Badge>
        <Badge variant="outline" className="text-[10px] h-5">{sectionCount} chart</Badge>
        {template.category && (
          <Badge className="text-[10px] h-5 bg-primary/10 text-primary border-0">{template.category}</Badge>
        )}
      </div>
    </button>
  );
}

// ─── Plan Preview Card ────────────────────────────────────────────────────────
function PlanCard({ plan, index }: { plan: AIPagePlan; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-card border border-border rounded-xl overflow-hidden shadow-sm"
    >
      <div className="bg-muted/30 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
            {index + 1}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{plan.pageTitle}</h3>
            {plan.pageSubtitle && <p className="text-xs text-muted-foreground">{plan.pageSubtitle}</p>}
          </div>
          <Badge className="ml-auto text-[10px] h-5 bg-primary/10 text-primary border-0">
            {plan.sections.length} widget
          </Badge>
        </div>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {plan.sections.map((section) => {
          const Icon = CHART_ICONS[section.chartType] || BarChart3;
          return (
            <div
              key={section.sectionId}
              className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                section.fallbackToText
                  ? 'border-yellow-500/30 bg-yellow-500/5'
                  : 'border-border bg-muted/20'
              }`}
            >
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">{section.title}</p>
                {section.fallbackToText ? (
                  <p className="text-[10px] text-yellow-600 dark:text-yellow-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Tidak dapat dipetakan
                  </p>
                ) : (
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{section.xAxis}</span>
                    <span className="text-[10px] text-muted-foreground">→</span>
                    <span className="text-[10px] text-primary">{section.yAxis}</span>
                  </div>
                )}
                {section.insight && (
                  <p className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-2 italic">{section.insight}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AIReports() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Hooks
  const { data: datasets = [] } = useDatasets();
  const { data: userTemplates = [] } = useReportTemplates();
  const createChartMut = useCreateChart();
  const createStoryMut = useCreateStory();

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [storyTitle, setStoryTitle] = useState('');
  const [analysisFocus, setAnalysisFocus] = useState('');

  // Dataset data for AI planning
  const { data: rawDatasetRes, isLoading: isLoadingData } = useDatasetData(
    selectedDatasetId,
    { limit: 5000 }
  );

  // Kolom dari metadata dataset (sama seperti ChartBuilder)
  const datasetMeta = useMemo(
    () => datasets.find((d: any) => d.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );
  const datasetColumns = useMemo(
    () => datasetMeta?.columns || [],
    [datasetMeta]
  );
  const dataSample = useMemo(() => (rawDatasetRes?.data || []).slice(0, 10), [rawDatasetRes]);

  // All templates (builtin + user)
  const allTemplates: ReportTemplate[] = useMemo(() => [
    ...builtinTemplates,
    ...userTemplates.map((t: any) => ({
      ...t,
      pages: t.pages || [],
      colorScheme: t.colorScheme || { primary: '#6366f1', secondary: '#3b82f6', accent: '#f59e0b', background: '#ffffff' },
      createdAt: new Date(t.createdAt),
      isDefault: false,
    })),
  ], [userTemplates]);

  const selectedTemplate = useMemo(
    () => allTemplates.find((t) => t.id === selectedTemplateId),
    [allTemplates, selectedTemplateId]
  );

  const selectedDataset = useMemo(
    () => datasets.find((d: any) => d.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );

  // Step 2 state — AI plans per page
  const [pagePlans, setPagePlans] = useState<AIPagePlan[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningProgress, setPlanningProgress] = useState('');

  // Step 3 state — execution
  const [isExecuting, setIsExecuting] = useState(false);
  const [execProgress, setExecProgress] = useState<string[]>([]);
  const [execDone, setExecDone] = useState(false);

  // Step 4 state — result
  const [createdStoryId, setCreatedStoryId] = useState<string | null>(null);

  // ── Validation ───────────────────────────────────────────────────────────────
  const step1Valid = !!selectedDatasetId && !!selectedTemplateId && !!storyTitle.trim();

  // ── Step 2: AI Planning ──────────────────────────────────────────────────────
  const runAIPlanning = useCallback(async () => {
    if (!selectedTemplate || !datasetColumns.length) return;
    setIsPlanning(true);
    setPagePlans([]);
    const pages = selectedTemplate.pages || [];
    const plans: AIPagePlan[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      setPlanningProgress(`Menganalisis slide ${i + 1}/${pages.length}: "${page.title}"...`);
      try {
        const plan = await planPageSections(
          page,
          datasetColumns,
          dataSample,
          analysisFocus || `Analisis ${selectedDataset?.name || 'dataset'}`
        );
        plans.push(plan);
        setPagePlans([...plans]);
      } catch (err) {
        plans.push({
          pageId: page.id,
          pageTitle: page.title,
          pageSubtitle: page.subtitle,
          sections: page.sections.map((s) => ({
            sectionId: s.id,
            sectionType: s.type,
            sectionTitle: s.title,
            chartType: 'text' as const,
            xAxis: '',
            yAxis: '',
            title: s.title,
            insight: '',
            width: (s.width as 'full' | 'half' | 'third') || 'half',
            fallbackToText: true,
            fallbackText: `Gagal mapping: ${s.title}`,
          })),
        });
        setPagePlans([...plans]);
      }
    }

    setPlanningProgress('');
    setIsPlanning(false);
  }, [selectedTemplate, datasetColumns, dataSample, analysisFocus, selectedDataset]);

  // ── Step 3: Execute — buat charts & simpan story ──────────────────────────────
  const runExecution = useCallback(async () => {
    if (!pagePlans.length || !selectedDatasetId || !storyTitle.trim()) return;
    setIsExecuting(true);
    setExecProgress([]);
    const addLog = (msg: string) => setExecProgress((prev) => [...prev, msg]);

    try {
      addLog('🚀 Memulai pembuatan chart...');
      const slides: any[] = [];

      for (let pi = 0; pi < pagePlans.length; pi++) {
        const plan = pagePlans[pi];
        addLog(`📄 Slide ${pi + 1}: "${plan.pageTitle}"`);
        const slideWidgets: any[] = [];

        for (const section of plan.sections) {
          if (section.fallbackToText) {
            // Text widget — no chart needed
            const widget = planToSlideWidget(section);
            widget.datasetId = selectedDatasetId;
            slideWidgets.push(widget);
            addLog(`  📝 Widget teks: ${section.title}`);
            continue;
          }

          try {
            addLog(`  📊 Membuat chart: ${section.title} (${section.chartType})`);
            const chartPayload = {
              title: section.title,
              type: section.chartType,
              datasetId: selectedDatasetId,
              xAxis: section.xAxis,
              yAxis: section.yAxis,
              groupBy: section.groupBy || undefined,
              dataLimit: (section.limit || 50).toString(),
              sortOrder: section.sortOrder || 'desc',
              showLegend: true,
            };
            const savedChart = await createChartMut.mutateAsync(chartPayload as any);
            const chartId = savedChart?.id;
            const widget = planToSlideWidget(section, chartId ? String(chartId) : undefined);
            widget.datasetId = selectedDatasetId;
            slideWidgets.push(widget);
            addLog(`  ✅ Chart tersimpan: ${section.title}`);
          } catch (chartErr: any) {
            // Chart gagal → fallback ke text
            const widget = planToSlideWidget(section);
            widget.datasetId = selectedDatasetId;
            widget.fallbackText = `Chart tidak dapat dibuat: ${section.title}`;
            slideWidgets.push(widget);
            addLog(`  ⚠️ Fallback teks untuk: ${section.title}`);
          }
        }

        slides.push({
          id: plan.pageId || crypto.randomUUID(),
          title: plan.pageTitle,
          subtitle: plan.pageSubtitle,
          content: '',
          slideWidgets,
        });
      }

      addLog('💾 Menyimpan Data Story...');
      const story = await createStoryMut.mutateAsync({
        title: storyTitle,
        content: JSON.stringify(slides),
        datasetId: selectedDatasetId,
      });

      const storyId = story?.data?.id;
      setCreatedStoryId(storyId ? String(storyId) : null);
      addLog('🎉 Data Story berhasil disimpan!');
      setExecDone(true);
      setStep(4);
    } catch (err: any) {
      addLog(`❌ Error: ${err?.message || 'Gagal membuat story'}`);
      toast({
        title: 'Gagal membuat story',
        description: err?.message || 'Periksa koneksi dan coba lagi.',
        variant: 'destructive',
      });
    } finally {
      setIsExecuting(false);
    }
  }, [pagePlans, selectedDatasetId, storyTitle, createChartMut, createStoryMut, toast]);

  // ── Reset wizard ─────────────────────────────────────────────────────────────
  const resetWizard = () => {
    setStep(1);
    setSelectedDatasetId('');
    setSelectedTemplateId('');
    setStoryTitle('');
    setAnalysisFocus('');
    setPagePlans([]);
    setExecProgress([]);
    setExecDone(false);
    setCreatedStoryId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              AI Story Generator
              <HelpTooltip text="Wizard 4-langkah untuk membuat Data Story multi-slide berbasis template dan AI, lengkap dengan chart interaktif." />
            </h1>
            <p className="text-muted-foreground">Dataset → Template → AI Plan → Data Story otomatis</p>
          </div>
        </div>
      </motion.div>

      {/* Step Bar */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-card">
        <StepBar current={step} />
      </div>

      {/* ── STEP 1: Setup ── */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 shadow-card space-y-6">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" /> Langkah 1 — Setup
              </h2>

              {/* Basic Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Judul Story <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="misal: Laporan Kinerja Logistik Q1 2025"
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dataset <span className="text-destructive">*</span></Label>
                  <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="Pilih dataset..." /></SelectTrigger>
                    <SelectContent>
                      {datasets.map((ds: any) => (
                        <SelectItem key={ds.id} value={ds.id}>
                          <div className="flex items-center gap-2">
                            <Database className="w-3.5 h-3.5 text-muted-foreground" />
                            {ds.name}
                            {ds.rowCount && (
                              <span className="text-xs text-muted-foreground">({ds.rowCount.toLocaleString()} baris)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Fokus Analisis (opsional)</Label>
                <Textarea
                  placeholder="misal: Fokus pada performa pengiriman per kurir, tren keterlambatan per wilayah, dan analisis biaya..."
                  rows={2}
                  value={analysisFocus}
                  onChange={(e) => setAnalysisFocus(e.target.value)}
                  className="bg-background resize-none"
                />
                <p className="text-xs text-muted-foreground">Deskripsikan aspek data yang ingin difokuskan. AI akan menyesuaikan pilihan chart dan narasi.</p>
              </div>

              {/* Dataset info */}
              {selectedDatasetId && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isLoadingData ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Memuat kolom dataset...</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 text-green-500" /> {datasetColumns.length} kolom terdeteksi ({datasetColumns.filter((c: any) => {
                        const t = (c.type || '').toLowerCase();
                        return ['number','numeric','int','float','decimal','double'].some(k => t.includes(k));
                      }).length} numerik, {datasetColumns.filter((c: any) => {
                        const t = (c.type || '').toLowerCase();
                        return ['string','text','varchar','char','name'].some(k => t.includes(k));
                      }).length} teks)</>
                  )}
                </div>
              )}
            </div>

            {/* Template Selection */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-card space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" /> Pilih Template
                <span className="text-sm text-muted-foreground font-normal">({allTemplates.length} template tersedia)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
                {allTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    selected={selectedTemplateId === template.id}
                    onSelect={() => setSelectedTemplateId(template.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={!step1Valid || isLoadingData}
                onClick={() => { setStep(2); runAIPlanning(); }}
                className="gap-2"
              >
                Lanjut ke AI Plan <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: AI Plan ── */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-primary" /> Langkah 2 — AI Planning
                </h2>
                {!isPlanning && pagePlans.length > 0 && (
                  <Button variant="outline" size="sm" onClick={runAIPlanning} className="gap-2">
                    <RefreshCcw className="w-3.5 h-3.5" /> Regenerasi
                  </Button>
                )}
              </div>

              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 pb-5 border-b border-border">
                {[
                  { label: 'Dataset', value: selectedDataset?.name || '-', icon: Database },
                  { label: 'Template', value: selectedTemplate?.name || '-', icon: FileText },
                  { label: 'Slide', value: `${selectedTemplate?.pages?.length || 0}`, icon: BookOpen },
                  { label: 'Kolom', value: `${datasetColumns.length}`, icon: BarChart3 },
                ].map((item) => (
                  <div key={item.label} className="bg-muted/30 rounded-lg p-3 flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-semibold text-foreground truncate" title={item.value}>{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Planning progress */}
              {isPlanning && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Cpu className="w-7 h-7 text-primary animate-pulse" />
                    </div>
                    <Loader2 className="w-5 h-5 text-primary animate-spin absolute -top-1 -right-1" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">{planningProgress || 'AI sedang menganalisis dataset dan template...'}</p>
                  <div className="flex gap-1 mt-1">
                    {(selectedTemplate?.pages || []).map((_, i) => (
                      <div key={i} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${i < pagePlans.length ? 'bg-primary' : 'bg-muted'}`} />
                    ))}
                  </div>
                </div>
              )}

              {/* Page plans */}
              {pagePlans.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    AI telah merencanakan <strong className="text-foreground">{pagePlans.reduce((s, p) => s + p.sections.length, 0)} chart</strong> dalam <strong className="text-foreground">{pagePlans.length} slide</strong>. Periksa dan lanjutkan.
                  </p>
                  {pagePlans.map((plan, i) => (
                    <PlanCard key={plan.pageId} plan={plan} index={i} />
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ChevronLeft className="w-4 h-4" /> Kembali
              </Button>
              <Button
                size="lg"
                disabled={isPlanning || pagePlans.length === 0}
                onClick={() => { setStep(3); runExecution(); }}
                className="gap-2"
              >
                Generate Charts & Story <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 3: Execute ── */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-primary" /> Langkah 3 — Generasi Chart & Story
              </h2>

              {/* Status */}
              <div className="flex flex-col items-center gap-4 py-4 mb-6">
                {isExecuting ? (
                  <>
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                        <Sparkles className="w-8 h-8 text-primary-foreground animate-pulse" />
                      </div>
                      <Loader2 className="w-6 h-6 text-primary animate-spin absolute -top-1 -right-1" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Membuat chart dan menyusun story...</p>
                  </>
                ) : execDone ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/30">
                      <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">Selesai! Story berhasil dibuat.</p>
                  </>
                ) : null}
              </div>

              {/* Log Terminal */}
              <div className="bg-zinc-950 dark:bg-black rounded-xl p-4 font-mono text-xs max-h-72 overflow-y-auto border border-zinc-800">
                <div className="text-zinc-500 mb-2">// AI Story Generator — execution log</div>
                {execProgress.map((line, i) => (
                  <div key={i} className={`leading-relaxed ${
                    line.startsWith('❌') ? 'text-red-400' :
                    line.startsWith('⚠️') ? 'text-yellow-400' :
                    line.startsWith('✅') ? 'text-green-400' :
                    line.startsWith('🎉') ? 'text-emerald-400 font-bold' :
                    line.startsWith('📊') ? 'text-blue-400' :
                    line.startsWith('📄') ? 'text-purple-400' :
                    line.startsWith('💾') ? 'text-cyan-400' :
                    'text-zinc-300'
                  }`}>
                    {line}
                  </div>
                ))}
                {isExecuting && (
                  <span className="inline-block w-2 h-3.5 bg-primary/60 ml-0.5 animate-pulse" />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STEP 4: Result ── */}
        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-10 shadow-card text-center flex flex-col items-center gap-5">
              {/* Celebration icon */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                  <CheckCircle2 className="w-10 h-10 text-primary-foreground" />
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-lg"
                >
                  🎉
                </motion.div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Story Berhasil Dibuat!</h2>
                <p className="text-muted-foreground max-w-md">
                  <strong className="text-foreground">"{storyTitle}"</strong> telah disimpan ke Data Stories dengan{' '}
                  <strong className="text-primary">{pagePlans.length} slide</strong> dan{' '}
                  <strong className="text-primary">{pagePlans.reduce((s, p) => s + p.sections.filter(sec => !sec.fallbackToText).length, 0)} chart interaktif</strong>.
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                {[
                  { label: 'Slide', value: pagePlans.length },
                  { label: 'Charts', value: pagePlans.reduce((s, p) => s + p.sections.filter(sec => !sec.fallbackToText).length, 0) },
                  { label: 'Widget', value: pagePlans.reduce((s, p) => s + p.sections.length, 0) },
                ].map((stat) => (
                  <div key={stat.label} className="bg-muted/30 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Log Summary */}
              <div className="bg-muted/20 rounded-xl p-4 w-full text-left border border-border max-h-32 overflow-y-auto">
                <p className="text-xs text-muted-foreground font-mono">
                  {execProgress.filter(l => l.startsWith('✅') || l.startsWith('⚠️') || l.startsWith('🎉')).join('\n') || execProgress.slice(-5).join('\n')}
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                <Button
                  size="lg"
                  className="gap-2 shadow-glow"
                  onClick={() =>
                    navigate(createdStoryId ? `/stories?storyId=${createdStoryId}` : '/stories')
                  }
                >
                  <Eye className="w-4 h-4" /> Lihat Data Story
                </Button>
                <Button variant="outline" size="lg" className="gap-2" onClick={resetWizard}>
                  <RefreshCcw className="w-4 h-4" /> Buat Story Baru
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
