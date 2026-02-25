import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, BarChart3, Loader2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callAI } from '@/lib/aiService';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';

const COLORS = [
  'hsl(174 72% 46%)', 'hsl(199 89% 48%)', 'hsl(142 76% 36%)',
  'hsl(38 92% 50%)', 'hsl(280 65% 60%)', 'hsl(340 82% 52%)',
];

interface QAResult {
  question: string;
  answer: string;
  chartType?: 'bar' | 'line' | 'pie' | 'area' | 'number';
  chartData?: any[];
  xKey?: string;
  yKey?: string;
  value?: string;
}

export default function AskData() {
  const { dataSets } = useDataStore();
  const [selectedDataSetId, setSelectedDataSetId] = useState('');
  const [question, setQuestion] = useState('');
  const [results, setResults] = useState<QAResult[]>([]);
  const [loading, setLoading] = useState(false);

  const dataset = dataSets.find(d => d.id === selectedDataSetId);

  const handleAsk = async () => {
    if (!question.trim() || !dataset) return;
    setLoading(true);

    const currentQuestion = question;
    setQuestion('');

    // Try AI first
    const aiResult = await callAI([{
      role: 'system',
      content: `You analyze data and answer questions. Dataset "${dataset.name}" has columns: ${dataset.columns.map(c => `${c.name}(${c.type})`).join(', ')}.
Sample: ${JSON.stringify(dataset.data.slice(0, 5))}
Total rows: ${dataset.rowCount}

Return JSON: { "answer": "text answer", "chartType": "bar|line|pie|area|number", "operation": { "type": "group|filter|aggregate|raw", "groupBy": "col", "aggColumn": "col", "aggFunc": "sum|avg|count|min|max", "filterCol": "col", "filterOp": "=|>|<", "filterVal": "val" } }
Return ONLY valid JSON.`
    }, { role: 'user', content: currentQuestion }]);

    let result: QAResult = { question: currentQuestion, answer: '' };

    if (aiResult.error || !aiResult.content) {
      // Fallback: basic local analysis
      result = localAnalyze(currentQuestion, dataset);
    } else {
      try {
        const parsed = JSON.parse(aiResult.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        result.answer = parsed.answer || 'Analysis complete.';
        const op = parsed.operation;

        if (op && dataset.data.length > 0) {
          if (op.type === 'group' && op.groupBy && op.aggColumn) {
            const groups: Record<string, number[]> = {};
            dataset.data.forEach(row => {
              const key = String(row[op.groupBy] ?? 'Unknown');
              if (!groups[key]) groups[key] = [];
              groups[key].push(Number(row[op.aggColumn]) || 0);
            });
            const chartData = Object.entries(groups).map(([key, vals]) => ({
              name: key,
              value: op.aggFunc === 'avg' ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length
                : op.aggFunc === 'count' ? vals.length
                : op.aggFunc === 'min' ? Math.min(...vals)
                : op.aggFunc === 'max' ? Math.max(...vals)
                : vals.reduce((a: number, b: number) => a + b, 0)
            }));
            result.chartType = parsed.chartType || 'bar';
            result.chartData = chartData;
            result.xKey = 'name';
            result.yKey = 'value';
          } else if (op.type === 'aggregate' && op.aggColumn) {
            const vals = dataset.data.map(r => Number(r[op.aggColumn]) || 0);
            const v = op.aggFunc === 'avg' ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length
              : op.aggFunc === 'count' ? vals.length
              : op.aggFunc === 'min' ? Math.min(...vals)
              : op.aggFunc === 'max' ? Math.max(...vals)
              : vals.reduce((a: number, b: number) => a + b, 0);
            result.chartType = 'number';
            result.value = v.toLocaleString();
          }
        }
        if (!result.chartType) result.chartType = parsed.chartType;
      } catch {
        result = localAnalyze(currentQuestion, dataset);
      }
    }

    setResults(prev => [result, ...prev]);
    setLoading(false);
  };

  const localAnalyze = (q: string, ds: typeof dataset): QAResult => {
    if (!ds) return { question: q, answer: 'No dataset selected.' };
    const numCols = ds.columns.filter(c => c.type === 'number');
    const strCols = ds.columns.filter(c => c.type === 'string');

    // Simple groupBy for string + number columns
    if (strCols.length > 0 && numCols.length > 0) {
      const groupCol = strCols[0].name;
      const valCol = numCols[0].name;
      const groups: Record<string, number> = {};
      ds.data.forEach(row => {
        const k = String(row[groupCol] ?? 'Unknown');
        groups[k] = (groups[k] || 0) + (Number(row[valCol]) || 0);
      });
      return {
        question: q,
        answer: `Showing ${valCol} grouped by ${groupCol}.`,
        chartType: 'bar',
        chartData: Object.entries(groups).map(([name, value]) => ({ name, value })),
        xKey: 'name',
        yKey: 'value',
      };
    }
    return { question: q, answer: `Dataset has ${ds.rowCount} rows and ${ds.columns.length} columns.` };
  };

  const renderChart = (r: QAResult) => {
    if (r.chartType === 'number') {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-5xl font-bold text-gradient">{r.value}</div>
        </div>
      );
    }
    if (!r.chartData || !r.xKey || !r.yKey) return null;

    return (
      <ResponsiveContainer width="100%" height={300}>
        {r.chartType === 'pie' ? (
          <PieChart>
            <Pie data={r.chartData} dataKey={r.yKey} nameKey={r.xKey} cx="50%" cy="50%" outerRadius={100} label>
              {r.chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : r.chartType === 'line' ? (
          <LineChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={12} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={12} />
            <Tooltip contentStyle={{ background: 'hsl(222 47% 10%)', border: '1px solid hsl(222 47% 16%)' }} />
            <Line type="monotone" dataKey={r.yKey} stroke={COLORS[0]} strokeWidth={2} />
          </LineChart>
        ) : r.chartType === 'area' ? (
          <AreaChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={12} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={12} />
            <Tooltip contentStyle={{ background: 'hsl(222 47% 10%)', border: '1px solid hsl(222 47% 16%)' }} />
            <Area type="monotone" dataKey={r.yKey} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
          </AreaChart>
        ) : (
          <BarChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={12} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={12} />
            <Tooltip contentStyle={{ background: 'hsl(222 47% 10%)', border: '1px solid hsl(222 47% 16%)' }} />
            <Bar dataKey={r.yKey} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    );
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Ask Data <HelpTooltip text="Tanya data menggunakan bahasa natural (misal: 'berapa rata-rata gaji?'). AI akan menjawab dengan teks dan visualisasi chart otomatis." /></h1>
            <p className="text-muted-foreground">Ask questions in natural language, get instant visualizations</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <div className="flex gap-4 mb-4">
          <Select value={selectedDataSetId} onValueChange={setSelectedDataSetId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select dataset" /></SelectTrigger>
            <SelectContent>
              {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder={dataset ? `Ask about ${dataset.name}... e.g. "What's the average salary by department?"` : 'Select a dataset first'}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            disabled={!dataset || loading}
            className="flex-1"
          />
          <Button onClick={handleAsk} disabled={!dataset || !question.trim() || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {dataset && (
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              `What's the distribution of ${dataset.columns.find(c => c.type === 'string')?.name || 'data'}?`,
              `Show average ${dataset.columns.find(c => c.type === 'number')?.name || 'values'}`,
              `How many records are there?`,
            ].map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setQuestion(suggestion)}
                className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm hover:bg-primary/10 hover:text-primary transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {results.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl p-6 border border-border shadow-card"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{r.question}</p>
              <p className="text-foreground mt-1">{r.answer}</p>
            </div>
          </div>
          {renderChart(r)}
        </motion.div>
      ))}

      {results.length === 0 && dataset && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Ask anything about your data</h3>
          <p className="text-muted-foreground">Type a question above and get instant answers with auto-generated charts</p>
        </motion.div>
      )}
    </div>
  );
}
