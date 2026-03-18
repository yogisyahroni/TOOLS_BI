import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, BarChart3, Loader2, Database, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useDatasets, useAskData } from '@/hooks/useApi';
import { useToast } from '@/hooks/use-toast';
import type { AskDataResult } from '@/lib/api';

const COLORS = [
  'hsl(174 72% 46%)', 'hsl(199 89% 48%)', 'hsl(142 76% 36%)',
  'hsl(38 92% 50%)', 'hsl(280 65% 60%)', 'hsl(340 82% 52%)',
];

interface QAResult {
  question: string;
  sql: string;
  rowCount: number;
  chartData: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'table';
}

function autoDetectChart(data: Record<string, unknown>[]): { xKey: string; yKey: string; chartType: QAResult['chartType'] } {
  if (!data || data.length === 0) return { xKey: '', yKey: '', chartType: 'table' };
  const keys = Object.keys(data[0]);
  const numKey = keys.find((k) => typeof data[0][k] === 'number');
  const strKey = keys.find((k) => typeof data[0][k] === 'string');
  if (numKey && strKey) {
    return { xKey: strKey, yKey: numKey, chartType: data.length <= 8 ? 'bar' : 'line' };
  }
  if (numKey && keys.length >= 2) {
    return { xKey: keys[0], yKey: numKey, chartType: 'line' };
  }
  return { xKey: '', yKey: '', chartType: 'table' };
}

export default function AskData() {
  const { data: datasets = [] } = useDatasets();
  const { toast } = useToast();
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [question, setQuestion] = useState('');
  const [results, setResults] = useState<QAResult[]>([]);

  const askMutation = useAskData();

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);

  const handleAsk = useCallback(async () => {
    if (!question.trim() || !selectedDatasetId) return;
    const currentQuestion = question;
    setQuestion('');

    try {
      const res: AskDataResult = await askMutation.mutateAsync({ question: currentQuestion, datasetId: selectedDatasetId });
      const { xKey, yKey, chartType } = autoDetectChart(res.data);
      setResults((prev) => [{
        question: res.question,
        sql: res.sql,
        rowCount: res.rowCount,
        chartData: res.data,
        xKey,
        yKey,
        chartType,
      }, ...prev]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'AI query failed';
      toast({ title: 'Query failed', description: msg, variant: 'destructive' });
      setQuestion(currentQuestion); // restore
    }
  }, [question, selectedDatasetId, askMutation, toast]);

  const renderChart = (r: QAResult) => {
    if (r.chartType === 'table' || !r.xKey || !r.yKey || r.chartData.length === 0) {
      if (r.chartData.length === 0) return <p className="text-muted-foreground text-sm text-center py-4">No data returned.</p>;
      const cols = Object.keys(r.chartData[0]);
      return (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead><tr>{cols.map((c) => <th key={c} className="text-left p-2 text-muted-foreground border-b border-border">{c}</th>)}</tr></thead>
            <tbody>{r.chartData.slice(0, 20).map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                {cols.map((c) => <td key={c} className="p-2 text-foreground">{String(row[c] ?? '')}</td>)}
              </tr>
            ))}</tbody>
          </table>
          {r.rowCount > 20 && <p className="text-xs text-muted-foreground text-center mt-2">Showing 20 of {r.rowCount} rows</p>}
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={280}>
        {r.chartType === 'pie' ? (
          <PieChart>
            <Pie data={r.chartData} dataKey={r.yKey!} nameKey={r.xKey!} cx="50%" cy="50%" outerRadius={90} label>
              {r.chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip /><Legend />
          </PieChart>
        ) : r.chartType === 'line' ? (
          <LineChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={11} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={11} />
            <Tooltip contentStyle={{ background: 'hsl(222 47% 10%)', border: '1px solid hsl(222 47% 16%)' }} />
            <Line type="monotone" dataKey={r.yKey} stroke={COLORS[0]} strokeWidth={2} dot={false} />
          </LineChart>
        ) : r.chartType === 'area' ? (
          <AreaChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={11} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={11} />
            <Tooltip contentStyle={{ background: 'hsl(222 47% 10%)', border: '1px solid hsl(222 47% 16%)' }} />
            <Area type="monotone" dataKey={r.yKey} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
          </AreaChart>
        ) : (
          <BarChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={11} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={11} />
            <Tooltip contentStyle={{ background: 'hsl(222 47% 10%)', border: '1px solid hsl(222 47% 16%)' }} />
            <Bar dataKey={r.yKey} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    );
  };

  const suggestions = selectedDataset
    ? [
      `How many rows are in ${selectedDataset.name}?`,
      `Show top 10 records from ${selectedDataset.name}`,
      selectedDataset.columns.find((c) => c.type === 'number')
        ? `What is the average ${selectedDataset.columns.find((c) => c.type === 'number')!.name}?`
        : `Show all unique values in ${selectedDataset.columns[0]?.name}`,
    ]
    : [];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Ask Data <HelpTooltip text="Tanya data menggunakan bahasa natural. AI akan mengkonversi ke SQL dan menjalankan query langsung ke database backend." />
            </h1>
            <p className="text-muted-foreground">Ask in natural language — AI converts to SQL and runs it against your database</p>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
        {/* CENTER COLUMN: RESULTS */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar pb-6">
            {results.length === 0 && selectedDatasetId && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full min-h-[400px] text-center bg-card/30 rounded-xl border border-border border-dashed">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Ask anything about your data</h3>
                <p className="text-muted-foreground max-w-sm">Type your question in the sidebar on the right. The AI will convert it to SQL and show the results here.</p>
              </motion.div>
            )}

            {results.length === 0 && !selectedDatasetId && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full min-h-[400px] text-center bg-card/30 rounded-xl border border-border border-dashed opacity-50">
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Select a Dataset</h3>
                <p className="text-muted-foreground">Please select a dataset from the sidebar to begin.</p>
              </motion.div>
            )}

            {results.map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-xl p-6 border border-border shadow-card">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{r.question}</p>
                    <code className="text-xs text-primary/70 mt-1 block font-mono bg-muted/50 px-2 py-1 rounded break-all">{r.sql}</code>
                    <p className="text-xs text-muted-foreground mt-1">{r.rowCount} rows returned</p>
                  </div>
                </div>
                {renderChart(r)}
              </motion.div>
            ))}
          </div>
        </div>

        {/* RIGHT SIDEBAR: CONFIG & AI */}
        <div className="lg:col-span-1 flex flex-col space-y-6 overflow-hidden pb-6">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col space-y-6 h-full">
            
            <div className="bg-card rounded-xl p-5 border border-border shadow-card flex-shrink-0">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Data Source Configuration
              </h3>
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                <SelectTrigger className="w-full bg-muted/50">
                  <SelectValue placeholder="Select dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((ds) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 bg-card rounded-xl border border-border shadow-card flex flex-col min-h-[400px] overflow-hidden">
              <div className="p-4 border-b border-border bg-gradient-to-r from-muted/30 to-muted/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Ask AI Assistant</span>
                </div>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto bg-muted/5 custom-scrollbar">
                {suggestions.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suggested Questions</p>
                    <div className="flex flex-col gap-2">
                      {suggestions.map((suggestion, i) => (
                        <button key={i} onClick={() => setQuestion(suggestion)}
                          className="px-3 py-2 text-left rounded-lg bg-background border border-border text-xs text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all">
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                    <MessageSquare className="w-8 h-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground max-w-[200px]">Select a dataset above to see tailored suggestions.</p>
                  </div>
                )}
              </div>

              <div className="p-3 bg-card border-t border-border">
                <div className="relative">
                  <Textarea
                    placeholder={selectedDataset ? `Ask about ${selectedDataset.name}...` : 'Select a dataset first'}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
                    }}
                    disabled={!selectedDataset || askMutation.isPending}
                    className="min-h-[80px] resize-none pr-12 text-sm bg-background border-border"
                  />
                  <Button 
                    size="icon" 
                    className="absolute right-2 bottom-2 h-8 w-8 gradient-primary"
                    onClick={handleAsk} 
                    disabled={!selectedDataset || !question.trim() || askMutation.isPending}
                  >
                    {askMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" /> : <Send className="w-4 h-4 text-primary-foreground" />}
                  </Button>
                </div>
                <p className="text-[10px] text-center text-muted-foreground mt-2">Press Enter to send, Shift+Enter for new line</p>
              </div>
            </div>

          </motion.div>
        </div>
      </div>
    </div>
  );
}
