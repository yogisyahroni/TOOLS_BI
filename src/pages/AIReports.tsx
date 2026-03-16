import { useDatasets, useDatasetData, useAIConfig, useCreateReport, useReportTemplates, useReports } from '@/hooks/useApi';
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, FileText, Lightbulb, TrendingUp, Target,
  Send, Loader2, AlertTriangle, Shield, Download, Layout,
  CheckCircle2, Database, Cpu, Zap, Circle, BookOpen
} from 'lucide-react';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { generateReport } from '@/lib/aiService';
import { AIChatPanel } from '@/components/AIChatPanel';
import { builtinTemplates } from '@/lib/builtinTemplates';
import type { Report, ReportTemplate } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';
import { api, reportApi, API_BASE, getAccessToken } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ReportHistory } from '@/components/ReportHistory';

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream progress stage definition
// ─────────────────────────────────────────────────────────────────────────────
type Stage = 'idle' | 'thinking' | 'generating' | 'executing' | 'done' | 'error';

interface ProgressStep {
  id: Stage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: ProgressStep[] = [
  { id: 'thinking', label: 'Analyzing request', icon: Cpu },
  { id: 'generating', label: 'AI writing report', icon: Sparkles },
  { id: 'done', label: 'Complete', icon: CheckCircle2 },
];

// ─────────────────────────────────────────────────────────────────────────────
// StreamingText — renders text with a blinking cursor as tokens arrive
// ─────────────────────────────────────────────────────────────────────────────
function StreamingText({ text, isDone }: { text: string; isDone: boolean }) {
  return (
    <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:mb-4 prose-headings:mt-8 first:prose-headings:mt-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
      {!isDone && (
        <span className="inline-block w-2 h-5 bg-primary ml-1 animate-pulse align-middle" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StageIndicator — visual pipeline showing current AI progress stage
// ─────────────────────────────────────────────────────────────────────────────
function StageIndicator({ currentStage }: { currentStage: Stage }) {
  return (
    <div className="flex items-center gap-2">
      {STAGES.map((step, i) => {
        const stageOrder: Stage[] = ['thinking', 'generating', 'done'];
        const currentIdx = stageOrder.indexOf(currentStage);
        const stepIdx = stageOrder.indexOf(step.id);
        const isActive = step.id === currentStage;
        const isDone = stepIdx < currentIdx || currentStage === 'done';

        return (
          <div key={step.id} className="flex items-center gap-2">
            <div className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300
              ${isActive ? 'bg-primary/20 text-primary border border-primary/40 shadow-glow' :
                isDone ? 'bg-success/10 text-success border border-success/30' :
                  'bg-muted/30 text-muted-foreground border border-border/40'}
            `}>
              {isActive ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isDone ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <Circle className="w-3 h-3" />
              )}
              {step.label}
            </div>
            {i < STAGES.length - 1 && (
              <div className={`h-px w-4 transition-all duration-500 ${isDone || isActive ? 'bg-primary/40' : 'bg-border/40'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AIReports() {
  const { data: templates = [] } = useReportTemplates();
  const { privacySettings } = usePrivacySettings();
  const { data: aiConfig } = useAIConfig();
  const { user } = useAuth();
  const createReportMutation = useCreateReport();
  const { data: dataSets = [] } = useDatasets();
  const { data: reports = [], isLoading: isLoadingReports } = useReports();
  const { toast } = useToast();
  const [selectedDataset, setSelectedDataset] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);

  // Streaming state
  const [streamingText, setStreamingText] = useState('');
  const [streamStage, setStreamStage] = useState<Stage>('idle');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamBoxRef = useRef<HTMLDivElement>(null);

  const allTemplates: ReportTemplate[] = [
    ...builtinTemplates,
    ...templates.map((t: any) => ({
      ...t,
      category: t.category,
      source: t.source,
      pages: t.pages || [],
      colorScheme: t.colorScheme || { primary: '#2c3e50', secondary: '#3498db', accent: '#e74c3c', background: '#ffffff' },
      createdAt: new Date(t.createdAt),
      isDefault: false,
    }))
  ];
  const selectedTemplate = allTemplates.find((t) => t.id === selectedTemplateId);
  const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(selectedDataset || '', { limit: 10000 });
  const dataset = React.useMemo(() => {
    const meta = dataSets.find(ds => ds.id === selectedDataset);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, selectedDataset, __datasetDataRes]);

  // Auto-scroll streaming output box
  useEffect(() => {
    if (streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
    }
  }, [streamingText]);

  const computeStats = () => {
    if (!dataset) return {};
    const stats: Record<string, any> = {};
    dataset.columns.forEach(col => {
      if (col.type === 'number') {
        const vals = dataset.data.map(r => Number(r[col.name])).filter(n => !isNaN(n));
        if (vals.length) {
          stats[col.name] = {
            min: Math.min(...vals),
            max: Math.max(...vals),
            avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
            sum: vals.reduce((a, b) => a + b, 0),
            count: vals.length,
          };
        }
      } else {
        const unique = new Set(dataset.data.map(r => String(r[col.name])));
        stats[col.name] = { uniqueValues: unique.size, sampleValues: Array.from(unique).slice(0, 5) };
      }
    });
    return stats;
  };

  // ── Streaming handler: calls /api/v1/reports/stream via SSE ──────────────
  const handleStreamReport = async () => {
    if (!selectedDataset || !dataset) {
      toast({ title: 'Select a dataset', description: 'Please select a dataset first.', variant: 'destructive' });
      return;
    }
    if (!prompt.trim()) {
      toast({ title: 'Enter a prompt', description: 'Describe what kind of report you want.', variant: 'destructive' });
      return;
    }

    setIsStreaming(true);
    setStreamingText('');
    setStreamStage('thinking');
    setGeneratedReport(null);

    // Build enriched prompt with template context & data stats
    let sampleData = dataset.data.slice(0, 10);
    if (privacySettings.excludeColumns.length > 0) {
      sampleData = sampleData.map(row => {
        const filtered = { ...row };
        privacySettings.excludeColumns.forEach(col => delete filtered[col]);
        return filtered;
      });
    }
    const stats = computeStats();
    const templateContext = selectedTemplate
      ? `\n\nTemplate: "${selectedTemplate.name}" (${selectedTemplate.category}), Pages: ${selectedTemplate.pages.map(p => `"${p.title}"`).join(', ')}`
      : '';

    const fullPrompt = `${prompt}${templateContext}

Dataset: "${dataset.name}" (${dataset.rowCount.toLocaleString()} rows)
Columns: ${dataset.columns.filter(c => !privacySettings.excludeColumns.includes(c.name)).map(c => `${c.name}(${c.type})`).join(', ')}
Stats sample: ${JSON.stringify(Object.fromEntries(Object.entries(stats).slice(0, 5)), null, 1)}
Sample data (first 5 rows): ${JSON.stringify(sampleData.slice(0, 5), null, 1)}

Format tanggapan Anda sebagai laporan markdown komprehensif dalam Bahasa Indonesia dengan:
# [Judul Laporan]
## Ringkasan Eksekutif
## Temuan Utama
## Analisis Data
## Rekomendasi
## Kesimpulan`;

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await reportApi.streamGenerate(selectedDataset, fullPrompt);

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.startsWith('data: ')) {
            const data = line.replace('data: ', '');
            
            // Handle structured events
            if (data.startsWith('{')) {
              try {
                const event = JSON.parse(data);
                if (event.type === 'token') {
                  fullContent += event.content;
                  setStreamingText(fullContent);
                  setStreamStage('generating');
                } else if (event.type === 'progress') {
                  setStreamStage(event.stage as Stage);
                } else if (event.type === 'report') {
                  setGeneratedReport(event.report);
                  setStreamStage('done');
                  toast({ title: '✅ Report saved!', description: 'AI report persistent storage success.' });
                } else if (event.type === 'error') {
                   toast({ title: 'AI Error', description: event.message, variant: 'destructive' });
                   setStreamStage('error');
                }
              } catch {
                fullContent += data;
                setStreamingText(fullContent);
              }
            } else {
              fullContent += data;
              setStreamingText(fullContent);
              setStreamStage('generating');
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      // Fallback to non‑streaming (no API key configured, etc.)
      try {
        setStreamStage('generating');
        const response = await generateReport(
          dataset.name,
          dataset.columns.filter(c => !privacySettings.excludeColumns.includes(c.name)).map(c => ({ name: c.name, type: c.type })),
          sampleData,
          computeStats(),
          prompt + (selectedTemplate ? `\n\nTemplate: ${selectedTemplate.name}` : ''),
        );
        if (response.error) throw new Error(response.error);

        setStreamingText(response.content);
        setStreamStage('done');
        const report: Report = {
          id: generateId(),
          userId: user?.id || '',
          title: `${dataset.name} Analysis Report`,
          content: response.content,
          story: '',
          decisions: [],
          recommendations: [],
          chartConfigs: [],
          datasetId: selectedDataset,
          createdAt: new Date(),
        };
        setGeneratedReport(report);
        createReportMutation.mutate(report);
        toast({ title: 'Report generated!' });
      } catch (fallbackErr: any) {
        toast({ title: 'Error', description: fallbackErr.message || 'Failed to generate report', variant: 'destructive' });
        setStreamStage('error');
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamStage('done');
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              AI Reports <HelpTooltip text="Pilih dataset dan template (opsional), lalu deskripsikan analisis yang diinginkan. AI akan membuat laporan lengkap secara streaming — kamu bisa melihat progress kata per kata." />
            </h1>
            <p className="text-muted-foreground">Generate intelligent reports from your data — streamed in real-time</p>
          </div>
        </div>
      </motion.div>

      {/* Privacy Notice */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <h4 className="font-medium text-foreground">Data Privacy Protection Active</h4>
          <p className="text-sm text-muted-foreground mt-1">
            {privacySettings.maskSensitiveData && 'Sensitive data is masked. '}
            {privacySettings.anonymizeData && 'Data is anonymized. '}
            {privacySettings.excludeColumns.length > 0 && `${privacySettings.excludeColumns.length} columns excluded. `}
            {aiConfig?.apiKey ? `Using ${aiConfig.provider} (${aiConfig.model}) — streaming enabled` : '⚠️ AI not configured — using fallback analysis.'}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Left Sidebar: History */}
        <div className="xl:col-span-1 space-y-6">
          <ReportHistory 
            reports={reports} 
            isLoading={isLoadingReports} 
            onSelect={(r) => {
              setGeneratedReport(r);
              setStreamingText(r.content);
              setStreamStage('done');
            }}
            selectedId={generatedReport?.id}
          />
        </div>

        {/* Middle: Input & Output */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="xl:col-span-2 space-y-6">
          <div className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Generate Report
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Select Dataset</label>
                <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                  <SelectTrigger><SelectValue placeholder="Choose a dataset" /></SelectTrigger>
                  <SelectContent>
                    {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name} ({ds.rowCount.toLocaleString()} rows)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Report Template (optional)</label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger><SelectValue placeholder="No template — free form" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template — free form</SelectItem>
                    {allTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.category})</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Layout className="w-3 h-3" />
                    {selectedTemplate.pages.length} pages · {selectedTemplate.pages.reduce((a, p) => a + p.sections.length, 0)} sections · {selectedTemplate.source}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">What would you like to analyze?</label>
                <Textarea
                  placeholder="e.g., Analyze sales trends and identify top-performing products..."
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  className="min-h-[120px]"
                  disabled={isStreaming}
                />
              </div>
              {dataSets.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <p className="text-sm text-warning">No datasets available. Please upload data first.</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gradient-primary text-primary-foreground"
                  onClick={handleStreamReport}
                  disabled={isStreaming || dataSets.length === 0}
                >
                  {isStreaming
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                    : <><Send className="w-4 h-4 mr-2" /> Generate Report (Streaming)</>}
                </Button>
                {isStreaming && (
                  <Button variant="outline" onClick={handleStop} className="border-destructive/50 text-destructive hover:bg-destructive/10">
                    Stop
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Templates */}
          <div className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Quick Templates</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { icon: TrendingUp, title: 'Trend Analysis', prompt: 'Analyze trends and patterns in the data. Identify key growth areas and seasonal variations.' },
                { icon: Target, title: 'Performance Report', prompt: 'Create a comprehensive performance report with KPIs, benchmarks, and improvement recommendations.' },
                { icon: Lightbulb, title: 'Insights Discovery', prompt: 'Discover hidden insights and correlations in the data. Highlight unexpected findings.' },
                { icon: FileText, title: 'Executive Summary', prompt: 'Generate an executive summary suitable for senior leadership, focusing on key metrics and strategic recommendations.' },
              ].map(t => (
                <button key={t.title} onClick={() => setPrompt(t.prompt)} disabled={isStreaming}
                  className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <t.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right Sidebar: AI Chat */}
        <div className="xl:col-span-1">
          <AIChatPanel
            systemPrompt={`You are a business analytics assistant for DataLens. Help users formulate analysis questions and understand their data. ${dataset ? `Current dataset: "${dataset.name}" with columns: ${dataset.columns.map(c => `${c.name} (${c.type})`).join(', ')}. ${dataset.rowCount} rows.` : 'No dataset selected yet.'}`}
            title="AI Analysis Chat"
            placeholder="Tanyakan tentang data Anda..."
          />
        </div>
      </div>

      {/* ── Streaming Output Panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {(isStreaming || streamingText) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="bg-card rounded-xl border border-border shadow-card overflow-hidden"
          >
            {/* Header with stage indicator */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">AI Report Stream</h3>
                  <p className="text-xs text-muted-foreground">Real-time generation</p>
                </div>
              </div>
              <StageIndicator currentStage={streamStage} />
            </div>

            {/* Streaming text with scrollable box */}
            <div
              ref={streamBoxRef}
              className="p-6 max-h-[520px] overflow-y-auto bg-background/50"
            >
              {streamingText ? (
                <StreamingText text={streamingText} isDone={!isStreaming} />
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm">Connecting to AI...</span>
                </div>
              )}
            </div>

            {/* Footer progress bar */}
            {isStreaming && (
              <div className="h-1 bg-muted">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary via-primary/60 to-transparent"
                  animate={{ width: ['0%', '90%'] }}
                  transition={{ duration: 30, ease: 'linear' }}
                />
              </div>
            )}

            {/* Export button (shown when done) */}
            {streamStage === 'done' && streamingText && (
              <div className="px-6 py-3 border-t border-border flex items-center justify-between bg-muted/10">
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Report generation complete ({streamingText.length.toLocaleString()} chars)
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="hover:bg-primary/5 border-primary/20 text-primary" onClick={async () => {
                    if (!generatedReport?.id) return;
                    try {
                      await reportApi.convertToStory(generatedReport.id);
                      toast({ title: '✨ Story Created!', description: 'Report converted to interactive Data Story.' });
                    } catch (err) {
                      toast({ title: 'Story Conversion Failed', variant: 'destructive' });
                    }
                  }}>
                    <BookOpen className="w-4 h-4 mr-1" /> Convert to Story
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    const blob = new Blob([streamingText], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `AI-Report-${dataset?.name || 'export'}-${new Date().toISOString().slice(0, 10)}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: 'Report exported as Markdown' });
                  }}>
                    <Download className="w-4 h-4 mr-1" /> Export Markdown
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Saved Report (non-streaming legacy view) ──────────────────────────── */}
      {generatedReport && streamStage === 'done' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl p-8 border border-border shadow-card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{generatedReport.title}</h2>
                <p className="text-sm text-muted-foreground">
                  <Database className="w-3 h-3 inline mr-1" />
                  {dataset?.name} · {new Date(generatedReport.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              const content = `# ${generatedReport.title}\n\nGenerated: ${new Date(generatedReport.createdAt).toLocaleDateString()}\n\n${generatedReport.content}`;
              const blob = new Blob([content], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `${generatedReport.title}.md`; a.click();
              URL.revokeObjectURL(url);
              toast({ title: 'Report exported' });
            }}>
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          </div>
          <div className="prose prose-invert max-w-none mt-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {generatedReport.content}
            </ReactMarkdown>
          </div>

          {generatedReport.decisions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
              <div className="p-6 rounded-xl bg-success/5 border border-success/20">
                <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5 text-success" /> Key Decisions
                </h3>
                <ul className="space-y-2">
                  {generatedReport.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center flex-shrink-0 text-xs font-bold">{i + 1}</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              {generatedReport.recommendations.length > 0 && (
                <div className="p-6 rounded-xl bg-info/5 border border-info/20">
                  <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-info" /> Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {generatedReport.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-muted-foreground">
                        <span className="w-5 h-5 rounded-full bg-info/20 text-info flex items-center justify-center flex-shrink-0 text-xs font-bold">{i + 1}</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
