import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, BarChart3, Loader2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
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

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <div className="flex gap-4 mb-4">
          <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
            <SelectTrigger className="w-64">
              <Database className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Select dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((ds) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder={selectedDataset ? `Ask about ${selectedDataset.name}… e.g. "What's the average salary by department?"` : 'Select a dataset first'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            disabled={!selectedDataset || askMutation.isPending}
            className="flex-1"
          />
          <Button onClick={handleAsk} disabled={!selectedDataset || !question.trim() || askMutation.isPending}>
            {askMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.map((suggestion, i) => (
              <button key={i} onClick={() => setQuestion(suggestion)}
                className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm hover:bg-primary/10 hover:text-primary transition-colors">
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {results.map((r, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{r.question}</p>
              <code className="text-xs text-primary/70 mt-1 block font-mono bg-muted/50 px-2 py-1 rounded mt-2 break-all">{r.sql}</code>
              <p className="text-xs text-muted-foreground mt-1">{r.rowCount} rows returned</p>
            </div>
          </div>
          {renderChart(r)}
        </motion.div>
      ))}

      {results.length === 0 && selectedDataset && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Ask anything about your data</h3>
          <p className="text-muted-foreground">Your question will be converted to SQL and executed on the backend</p>
        </motion.div>
      )}
    </div>
  );
}
