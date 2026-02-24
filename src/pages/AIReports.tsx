import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, FileText, Lightbulb, TrendingUp, Target,
  Send, Loader2, AlertTriangle, Shield,
} from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { generateReport } from '@/lib/aiService';
import { AIChatPanel } from '@/components/AIChatPanel';
import type { Report } from '@/types/data';

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

export default function AIReports() {
  const { dataSets, addReport, privacySettings, aiConfig } = useDataStore();
  const { toast } = useToast();
  const [selectedDataset, setSelectedDataset] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<Report | null>(null);

  const dataset = dataSets.find(ds => ds.id === selectedDataset);

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

  const handleGenerateReport = async () => {
    if (!selectedDataset || !dataset) {
      toast({ title: 'Select a dataset', description: 'Please select a dataset to generate a report from.', variant: 'destructive' });
      return;
    }
    if (!prompt.trim()) {
      toast({ title: 'Enter a prompt', description: 'Please describe what kind of report you want.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);

    // Prepare data with privacy settings
    let sampleData = dataset.data.slice(0, 10);
    if (privacySettings.excludeColumns.length > 0) {
      sampleData = sampleData.map(row => {
        const filtered = { ...row };
        privacySettings.excludeColumns.forEach(col => delete filtered[col]);
        return filtered;
      });
    }

    const columns = dataset.columns
      .filter(c => !privacySettings.excludeColumns.includes(c.name))
      .map(c => ({ name: c.name, type: c.type }));

    const stats = computeStats();

    if (aiConfig?.apiKey) {
      // Use real AI
      const response = await generateReport(dataset.name, columns, sampleData, stats, prompt);

      if (response.error) {
        toast({ title: 'AI Error', description: response.error, variant: 'destructive' });
        setIsGenerating(false);
        return;
      }

      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const report: Report = {
            id: generateId(),
            title: parsed.title || `${dataset.name} Analysis Report`,
            content: parsed.content || response.content,
            story: parsed.story || '',
            decisions: parsed.decisions || [],
            recommendations: parsed.recommendations || [],
            dataSetId: selectedDataset,
            createdAt: new Date(),
          };
          setGeneratedReport(report);
          addReport(report);
          toast({ title: 'Report generated!', description: 'AI-powered report has been created.' });
        } else {
          // AI returned plain text
          const report: Report = {
            id: generateId(),
            title: `${dataset.name} Analysis Report`,
            content: response.content,
            story: '',
            decisions: [],
            recommendations: [],
            dataSetId: selectedDataset,
            createdAt: new Date(),
          };
          setGeneratedReport(report);
          addReport(report);
          toast({ title: 'Report generated!' });
        }
      } catch {
        const report: Report = {
          id: generateId(),
          title: `${dataset.name} Analysis Report`,
          content: response.content,
          story: '',
          decisions: [],
          recommendations: [],
          dataSetId: selectedDataset,
          createdAt: new Date(),
        };
        setGeneratedReport(report);
        addReport(report);
        toast({ title: 'Report generated!' });
      }
    } else {
      // Fallback: generate locally without AI
      setTimeout(() => {
        const report: Report = {
          id: generateId(),
          title: `${dataset.name} Analysis Report`,
          content: `## Executive Summary\n\nAnalysis of "${dataset.name}" dataset with ${dataset.rowCount.toLocaleString()} records across ${dataset.columns.length} columns.\n\n## Key Findings\n\n${Object.entries(stats).map(([col, s]: [string, any]) => {
            if (s.avg) return `- **${col}**: Min ${s.min}, Max ${s.max}, Avg ${s.avg}, Sum ${s.sum}`;
            return `- **${col}**: ${s.uniqueValues} unique values`;
          }).join('\n')}\n\n## Analysis Request\n\n"${prompt}"\n\n> ⚠️ This is a basic report generated without AI. Configure an AI provider in Settings for intelligent, detailed analysis.`,
          story: `Dataset "${dataset.name}" contains ${dataset.rowCount} records. A comprehensive AI-powered analysis requires configuring an AI provider in Settings.`,
          decisions: ['Configure AI provider for deeper analysis', 'Review data quality metrics', 'Identify key business metrics to track'],
          recommendations: ['Setup API key in Settings → AI Configuration', 'Upload more data for comprehensive analysis', 'Use ETL Pipeline to clean and transform data'],
          dataSetId: selectedDataset,
          createdAt: new Date(),
        };
        setGeneratedReport(report);
        addReport(report);
        toast({ title: 'Basic report generated', description: 'Configure AI in Settings for intelligent reports.' });
      }, 1500);
    }

    setIsGenerating(false);
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Reports</h1>
            <p className="text-muted-foreground">Generate intelligent reports from your data</p>
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
            {aiConfig?.apiKey ? `Using ${aiConfig.provider} (${aiConfig.model})` : '⚠️ AI not configured - using basic analysis.'}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Generate Report</h3>
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
                <label className="block text-sm font-medium text-foreground mb-2">What would you like to analyze?</label>
                <Textarea placeholder="e.g., Analyze sales trends and identify top-performing products..." value={prompt} onChange={e => setPrompt(e.target.value)} className="min-h-[120px]" />
              </div>
              {dataSets.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <p className="text-sm text-warning">No datasets available. Please upload data first.</p>
                </div>
              )}
              <Button className="w-full gradient-primary text-primary-foreground" onClick={handleGenerateReport} disabled={isGenerating || dataSets.length === 0}>
                {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Send className="w-4 h-4 mr-2" /> Generate Report</>}
              </Button>
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
                <button key={t.title} onClick={() => setPrompt(t.prompt)}
                  className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all text-left group">
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

        {/* AI Chat */}
        <div>
          <AIChatPanel
            systemPrompt={`You are a business analytics assistant for DataLens. Help users formulate analysis questions and understand their data. ${dataset ? `Current dataset: "${dataset.name}" with columns: ${dataset.columns.map(c => `${c.name} (${c.type})`).join(', ')}. ${dataset.rowCount} rows.` : 'No dataset selected yet.'}`}
            title="AI Analysis Chat"
            placeholder="Tanyakan tentang data Anda..."
          />
        </div>
      </div>

      {/* Generated Report */}
      {generatedReport && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl p-8 border border-border shadow-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{generatedReport.title}</h2>
              <p className="text-sm text-muted-foreground">Generated on {new Date(generatedReport.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-foreground/90">{generatedReport.content}</div>
          </div>

          {generatedReport.story && (
            <div className="mt-8 p-6 rounded-xl bg-muted/50 border border-border">
              <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" /> Data Story
              </h3>
              <p className="text-muted-foreground">{generatedReport.story}</p>
            </div>
          )}

          {(generatedReport.decisions.length > 0 || generatedReport.recommendations.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {generatedReport.decisions.length > 0 && (
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
              )}
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
