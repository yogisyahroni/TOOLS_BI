import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  BarChart3,
  Loader2,
  Database,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  Lock,
  Unlock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useDatasets } from '@/hooks/useApi';
import { API_BASE, getAccessToken } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const COLORS = [
  'hsl(174 72% 46%)',
  'hsl(199 89% 48%)',
  'hsl(142 76% 36%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(340 82% 52%)',
];

// Types
interface QAResult {
  id: string;
  question: string;
  sql: string;
  rowCount: number;
  chartData: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'table';
  // 2026: AI Metadata
  confidence: number;
  explanation: string;
  executionPlan: string;
  provider: string;
  latencyMs: number;
  isSafe: boolean;
  securityWarnings: string[];
  queryType: string;
  executedAt: string;
}

interface StreamState {
  isStreaming: boolean;
  stage: 'idle' | 'thinking' | 'writing' | 'security_check' | 'running' | 'complete' | 'error';
  progress: number;
  streamingSQL: string;
  confidence: number;
  explanation: string;
  securityStatus: 'pending' | 'safe' | 'warning' | 'danger';
  securityWarnings: string[];
  error?: string;
}

function autoDetectChart(data: Record<string, unknown>[]): {
  xKey: string;
  yKey: string;
  chartType: QAResult['chartType']
} {
  if (!data || data.length === 0) return { xKey: '', yKey: '', chartType: 'table' };

  const keys = Object.keys(data[0]);
  const numKey = keys.find((k) => typeof data[0][k] === 'number');
  const strKey = keys.find((k) => typeof data[0][k] === 'string');

  if (numKey && strKey) {
    return {
      xKey: strKey,
      yKey: numKey,
      chartType: data.length <= 8 ? 'bar' : 'line'
    };
  }

  if (numKey && keys.length >= 2) {
    return { xKey: keys[0], yKey: numKey, chartType: 'line' };
  }

  return { xKey: '', yKey: '', chartType: 'table' };
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-green-500 bg-green-500/10 border-green-500/20';
  if (confidence >= 0.7) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
  return 'text-red-500 bg-red-500/10 border-red-500/20';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High Confidence';
  if (confidence >= 0.7) return 'Medium Confidence';
  return 'Low Confidence - Review Required';
}

export default function AskData() {
  const { data: datasets = [] } = useDatasets();
  const { toast } = useToast();

  // State
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [question, setQuestion] = useState('');
  const [results, setResults] = useState<QAResult[]>([]);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [pendingResult, setPendingResult] = useState<Partial<QAResult> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false); // Toggle untuk demo

  // 2026: Enhanced Streaming State
  const [stream, setStream] = useState<StreamState>({
    isStreaming: false,
    stage: 'idle',
    progress: 0,
    streamingSQL: '',
    confidence: 0,
    explanation: '',
    securityStatus: 'pending',
    securityWarnings: [],
  });

  const abortRef = useRef<AbortController | null>(null);
  const streamBoxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
    }
  }, [stream.streamingSQL]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [results]);

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);

  // 2026: Enhanced Ask dengan Security & Confidence
  const handleAsk = useCallback(async () => {
    if (!question.trim() || !selectedDatasetId) return;

    const currentQuestion = question;
    setQuestion('');

    // Reset stream state
    setStream({
      isStreaming: true,
      stage: 'thinking',
      progress: 10,
      streamingSQL: '',
      confidence: 0,
      explanation: '',
      securityStatus: 'pending',
      securityWarnings: [],
    });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // 2026: Streaming SSE Endpoint
      const response = await fetch(
        `${API_BASE}/ask-data/stream`,
        {
          method: 'POST',
          headers: {
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({
            question: currentQuestion,
            datasetId: selectedDatasetId,
          }),
          signal: abort.signal,
        }
      );

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let currentEvent = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
            continue;
          }

          if (!line.trim() || !line.startsWith('data: ')) {
            continue;
          }

          const dataStr = line.substring(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);

            switch (currentEvent) {
              case 'progress':
                setStream(prev => {
                  let p = prev.progress;
                  if (parsed.stage === 'thinking') p = 15;
                  if (parsed.stage === 'generating') p = 30;
                  if (parsed.stage === 'executing') p = 90;
                  return {
                    ...prev,
                    stage: parsed.stage || prev.stage,
                    progress: p,
                    explanation: parsed.message || prev.explanation,
                  };
                });
                break;

              case 'token':
                // parsed is just a string here
                setStream(prev => ({
                  ...prev,
                  stage: 'writing',
                  progress: Math.min(80, prev.progress + 1),
                  streamingSQL: prev.streamingSQL + parsed,
                }));
                break;

              case 'thought':
                setStream(prev => ({
                  ...prev,
                  explanation: parsed || prev.explanation,
                }));
                break;

              case 'sql':
                setStream(prev => ({
                  ...prev,
                  streamingSQL: parsed.sql || prev.streamingSQL,
                }));
                break;

              case 'error':
                throw new Error(parsed.error || 'Unknown server error');

              case 'result':
                const finalResult: QAResult = {
                  id: generateId(),
                  question: currentQuestion,
                  sql: parsed.sql || stream.streamingSQL,
                  rowCount: parsed.rowCount || 0,
                  chartData: parsed.data || [],
                  ...autoDetectChart(parsed.data || []),
                  confidence: parsed.confidence || 0.9, // Default to 0.9 if not provided
                  explanation: parsed.explanation || stream.explanation || 'Query executed successfully.',
                  executionPlan: parsed.executionPlan || 'Unknown',
                  provider: parsed.provider || 'AI',
                  latencyMs: parsed.latencyMs || 0,
                  isSafe: parsed.isSafe ?? true,
                  securityWarnings: parsed.warnings || [],
                  queryType: parsed.queryType || 'SELECT',
                  executedAt: new Date().toISOString(),
                };

                // 2026: Security Check sebelum add ke results
                if (!finalResult.isSafe && !isAdmin) {
                  setPendingResult(finalResult);
                  setShowApprovalDialog(true);
                  setStream(prev => ({ ...prev, isStreaming: false, stage: 'idle' }));
                  return;
                }

                // Low confidence warning
                if (finalResult.confidence < 0.6) {
                  setPendingResult(finalResult);
                  setShowApprovalDialog(true);
                  setStream(prev => ({ ...prev, isStreaming: false, stage: 'idle' }));
                  return;
                }

                setResults(prev => [finalResult, ...prev]);
                
                toast({
                  title: '✨ Query Successful',
                  description: `Found ${finalResult.rowCount} rows.`,
                });
                break;
                
              case 'done':
                setStream(prev => ({
                  ...prev,
                  isStreaming: false,
                  stage: 'idle',
                  progress: 100,
                }));
                break;
            }
          } catch (e) {
            console.error('SSE parse error:', e, dataStr);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        toast({
          title: 'Query failed',
          description: err.message,
          variant: 'destructive'
        });
        setQuestion(currentQuestion);
      }

      setStream(prev => ({
        ...prev,
        isStreaming: false,
        stage: 'error',
        error: err.message,
      }));
    } finally {
      abortRef.current = null;
    }
  }, [question, selectedDatasetId, stream.streamingSQL, stream.confidence, stream.explanation, isAdmin, toast]);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setStream(prev => ({ ...prev, isStreaming: false, stage: 'idle' }));
  }, []);

  const approveExecution = useCallback(() => {
    if (!pendingResult) return;

    const finalResult: QAResult = {
      ...pendingResult as QAResult,
      id: generateId(),
      executedAt: new Date().toISOString(),
    };

    setResults(prev => [finalResult, ...prev]);
    setPendingResult(null);
    setShowApprovalDialog(false);

    toast({
      title: 'Query executed (admin approved)',
      description: `${finalResult.rowCount} rows returned`,
    });
  }, [pendingResult, toast]);

  const rejectExecution = useCallback(() => {
    setPendingResult(null);
    setShowApprovalDialog(false);
    toast({
      title: 'Query rejected',
      description: 'Execution cancelled for security reasons',
      variant: 'destructive',
    });
  }, [toast]);

  const renderChart = (r: QAResult) => {
    if (r.chartType === 'table' || !r.xKey || !r.yKey || r.chartData.length === 0) {
      if (r.chartData.length === 0) {
        return (
          <p className="text-muted-foreground text-sm text-center py-4">
            No data returned.
          </p>
        );
      }

      const cols = Object.keys(r.chartData[0]);
      return (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="text-left p-2 text-muted-foreground border-b border-border">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.chartData.slice(0, 20).map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  {cols.map((c) => (
                    <td key={c} className="p-2 text-foreground">
                      {String(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {r.rowCount > 20 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Showing 20 of {r.rowCount} rows
            </p>
          )}
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={280}>
        {r.chartType === 'pie' ? (
          <PieChart>
            <Pie
              data={r.chartData}
              dataKey={r.yKey!}
              nameKey={r.xKey!}
              cx="50%"
              cy="50%"
              outerRadius={90}
              label
            >
              {r.chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : r.chartType === 'line' ? (
          <LineChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={11} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={11} />
            <Tooltip contentStyle={{
              background: 'hsl(222 47% 10%)',
              border: '1px solid hsl(222 47% 16%)'
            }} />
            <Line
              type="monotone"
              dataKey={r.yKey}
              stroke={COLORS[0]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        ) : r.chartType === 'area' ? (
          <AreaChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={11} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={11} />
            <Tooltip contentStyle={{
              background: 'hsl(222 47% 10%)',
              border: '1px solid hsl(222 47% 16%)'
            }} />
            <Area
              type="monotone"
              dataKey={r.yKey}
              stroke={COLORS[0]}
              fill={COLORS[0]}
              fillOpacity={0.3}
            />
          </AreaChart>
        ) : (
          <BarChart data={r.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 16%)" />
            <XAxis dataKey={r.xKey} stroke="hsl(215 20% 55%)" fontSize={11} />
            <YAxis stroke="hsl(215 20% 55%)" fontSize={11} />
            <Tooltip contentStyle={{
              background: 'hsl(222 47% 10%)',
              border: '1px solid hsl(222 47% 16%)'
            }} />
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
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 flex-shrink-0"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                Ask Data
                <HelpTooltip text="Natural language to SQL with AI confidence scoring and security checks." />
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                  AI-Powered
                </Badge>
              </h1>
              <p className="text-muted-foreground">
                Natural language queries with confidence scoring & security validation
              </p>
            </div>
          </div>

          {/* 2026: Admin Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Admin Mode</span>
            <Button
              variant={isAdmin ? "default" : "outline"}
              size="sm"
              onClick={() => setIsAdmin(!isAdmin)}
              className={isAdmin ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {isAdmin ? <Unlock className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
              {isAdmin ? 'ON' : 'OFF'}
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
        {/* MAIN CONTENT: RESULTS */}
        <div className="lg:col-span-3 flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar pb-6">

            {/* Empty States */}
            {results.length === 0 && selectedDatasetId && !stream.isStreaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full min-h-[400px] text-center bg-card/30 rounded-xl border border-border border-dashed"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Ask anything about your data
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Type your question below. AI will convert to SQL with confidence scoring and security validation.
                </p>
              </motion.div>
            )}

            {results.length === 0 && !selectedDatasetId && !stream.isStreaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full min-h-[400px] text-center bg-card/30 rounded-xl border border-border border-dashed opacity-50"
              >
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Select a Dataset</h3>
                <p className="text-muted-foreground">Choose a dataset from the sidebar to begin.</p>
              </motion.div>
            )}

            {/* 2026: Streaming State dengan Progress & Security */}
            {stream.isStreaming && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-xl p-6 border border-primary/20 shadow-card"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 animate-pulse">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        {stream.stage === 'thinking' && 'Understanding your question...'}
                        {stream.stage === 'writing' && 'Generating SQL...'}
                        {stream.stage === 'security_check' && 'Security validation...'}
                        {stream.stage === 'running' && 'Executing query...'}
                      </h3>
                      <span className="text-xs text-muted-foreground">{stream.progress}%</span>
                    </div>
                    <Progress value={stream.progress} className="h-1 mt-2" />
                  </div>
                </div>

                {/* SQL Preview */}
                {stream.streamingSQL && (
                  <div className="bg-muted/30 rounded-lg p-4 border border-border/50 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Generated SQL</span>
                      {stream.confidence > 0 && (
                        <Badge className={getConfidenceColor(stream.confidence)}>
                          {Math.round(stream.confidence * 100)}% {getConfidenceLabel(stream.confidence)}
                        </Badge>
                      )}
                    </div>
                    <div
                      ref={streamBoxRef}
                      className="font-mono text-xs text-foreground whitespace-pre-wrap max-h-[150px] overflow-y-auto custom-scrollbar"
                    >
                      {stream.streamingSQL}
                    </div>
                  </div>
                )}

                {/* Security Status */}
                {stream.securityStatus !== 'pending' && (
                  <Alert className={
                    stream.securityStatus === 'safe' ? 'border-green-500/50 bg-green-500/5' :
                      stream.securityStatus === 'warning' ? 'border-yellow-500/50 bg-yellow-500/5' :
                        'border-red-500/50 bg-red-500/5'
                  }>
                    <Shield className={`w-4 h-4 ${stream.securityStatus === 'safe' ? 'text-green-500' :
                        stream.securityStatus === 'warning' ? 'text-yellow-500' :
                          'text-red-500'
                      }`} />
                    <AlertTitle className="text-xs">
                      {stream.securityStatus === 'safe' ? 'Security Check Passed' :
                        stream.securityStatus === 'warning' ? 'Security Warning' :
                          'Security Alert'}
                    </AlertTitle>
                    <AlertDescription className="text-xs">
                      {stream.securityWarnings.length > 0 ? (
                        <ul className="list-disc list-inside mt-1">
                          {stream.securityWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      ) : 'No security issues detected'}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Cancel Button */}
                <div className="flex justify-end mt-4">
                  <Button variant="outline" size="sm" onClick={cancelStream}>
                    <XCircle className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Results dengan 2026 Metadata */}
            <AnimatePresence>
              {results.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-card rounded-xl border border-border shadow-card overflow-hidden"
                >
                  {/* Result Header */}
                  <div className="p-4 border-b border-border bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{r.question}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <code className="text-xs text-primary/70 font-mono bg-muted/50 px-2 py-0.5 rounded truncate max-w-[300px]">
                            {r.sql}
                          </code>
                          <Badge variant="outline" className="text-[10px]">
                            {r.rowCount} rows
                          </Badge>
                          <Badge className={getConfidenceColor(r.confidence)}>
                            {Math.round(r.confidence * 100)}%
                          </Badge>
                          {r.isSafe ? (
                            <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-500">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Safe
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-500">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Reviewed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="p-4">
                    {renderChart(r)}
                  </div>

                  {/* 2026: Expandable Metadata */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <button className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center gap-1 transition-colors border-t border-border">
                        <Info className="w-3 h-3" />
                        Query Details
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 py-3 bg-muted/20 border-t border-border text-xs space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-muted-foreground">Provider:</span>
                            <span className="ml-2 font-medium">{r.provider}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Latency:</span>
                            <span className="ml-2 font-medium">{r.latencyMs}ms</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Type:</span>
                            <span className="ml-2 font-medium">{r.queryType}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Execution:</span>
                            <span className="ml-2 font-medium">{r.executionPlan}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Explanation:</span>
                          <p className="mt-1 text-foreground">{r.explanation}</p>
                        </div>
                        {r.securityWarnings.length > 0 && (
                          <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                            <span className="text-yellow-600 font-medium">Warnings:</span>
                            <ul className="list-disc list-inside mt-1 text-yellow-700">
                              {r.securityWarnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="lg:col-span-1 flex flex-col space-y-6 overflow-hidden pb-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col space-y-6 h-full"
          >
            {/* Dataset Selector */}
            <div className="bg-card rounded-xl p-5 border border-border shadow-card flex-shrink-0">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Data Source
              </h3>
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                <SelectTrigger className="w-full bg-muted/50">
                  <SelectValue placeholder="Select dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* AI Assistant Panel */}
            <div className="flex-1 bg-card rounded-xl border border-border shadow-card flex flex-col min-h-[400px] overflow-hidden">
              <div className="p-4 border-b border-border bg-gradient-to-r from-muted/30 to-muted/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">AI Assistant</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] text-muted-foreground">Online</span>
                </div>
              </div>

              {/* Suggestions */}
              <div className="flex-1 p-4 overflow-y-auto bg-muted/5 custom-scrollbar">
                {suggestions.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Suggested Questions
                    </p>
                    <div className="flex flex-col gap-2">
                      {suggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          onClick={() => setQuestion(suggestion)}
                          className="px-3 py-2 text-left rounded-lg bg-background border border-border text-xs text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                    <MessageSquare className="w-8 h-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground max-w-[200px]">
                      Select a dataset to see tailored suggestions.
                    </p>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-3 bg-card border-t border-border">
                <div className="relative">
                  <Textarea
                    placeholder={selectedDataset ? `Ask about ${selectedDataset.name}...` : 'Select dataset first'}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAsk();
                      }
                    }}
                    disabled={!selectedDataset || stream.isStreaming}
                    className="min-h-[80px] resize-none pr-12 text-sm bg-background border-border"
                  />
                  <Button
                    size="icon"
                    className="absolute right-2 bottom-2 h-8 w-8 gradient-primary"
                    onClick={handleAsk}
                    disabled={!selectedDataset || !question.trim() || stream.isStreaming}
                  >
                    {stream.isStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
                    ) : (
                      <Send className="w-4 h-4 text-primary-foreground" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-center text-muted-foreground mt-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* 2026: Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Query Requires Approval
            </DialogTitle>
            <DialogDescription>
              This query has security warnings or low confidence. Please review before executing.
            </DialogDescription>
          </DialogHeader>

          {pendingResult && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Question:</p>
                <p className="text-sm font-medium">{pendingResult.question}</p>
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Generated SQL:</p>
                <code className="text-xs font-mono block whitespace-pre-wrap break-all">
                  {pendingResult.sql}
                </code>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={getConfidenceColor(pendingResult.confidence || 0)}>
                  {Math.round((pendingResult.confidence || 0) * 100)}% Confidence
                </Badge>
                {pendingResult.securityWarnings && pendingResult.securityWarnings.length > 0 && (
                  <Badge variant="outline" className="border-red-500/50 text-red-500">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {pendingResult.securityWarnings.length} Warnings
                  </Badge>
                )}
              </div>

              {pendingResult.securityWarnings && pendingResult.securityWarnings.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Security Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside text-xs">
                      {pendingResult.securityWarnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={rejectExecution}>
              Cancel
            </Button>
            <Button onClick={approveExecution} className="bg-yellow-600 hover:bg-yellow-700">
              <Shield className="w-4 h-4 mr-1" />
              Execute as Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}