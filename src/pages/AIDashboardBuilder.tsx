import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Database,
  Send,
  Loader2,
  LayoutGrid,
  BarChart3,
  PieChart as PieChartIcon,
  MapPin,
  Table as TableIcon,
  Save,
  CheckCircle2
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
import { useDatasets } from '@/hooks/useApi';
import { API_BASE, getAccessToken, dashboardApi, chartApi, datasetApi, authApi, type BatchAIGenerateRequest } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

// Recharts components
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const COLORS = [
  'hsl(174 72% 46%)', 'hsl(199 89% 48%)', 'hsl(142 76% 36%)',
  'hsl(38 92% 50%)', 'hsl(280 65% 60%)', 'hsl(340 82% 52%)',
];

interface AIDashboardChart {
  title: string;
  type: string; // bar,line,pie,donut,area,scatter,radar,funnel,treemap,stat
  width: number;
  query: string;
  data: Record<string, unknown>[];
}

interface StreamState {
  isStreaming: boolean;
  stage: string;
  message: string;
  progress: number;
  error: string | null;
}

function AIDashboardBuilder() {
  const navigate = useNavigate();
  const { data: datasets = [] } = useDatasets();
  const { toast } = useToast();

  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [charts, setCharts] = useState<AIDashboardChart[]>([]);
  const [dashboardName, setDashboardName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  
  const [stream, setStream] = useState<StreamState>({
    isStreaming: false,
    stage: 'idle',
    message: '',
    progress: 0,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  // Total charts ref untuk menghitung increment progress yang proporsional
  const totalChartsRef = useRef<number>(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [prompt]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !selectedDatasetId) return;

    setCharts([]);
    setIsSaved(false);
    setDashboardName('');
    totalChartsRef.current = 0; // reset for new generation
    setStream({
      isStreaming: true,
      stage: 'init',
      message: 'Menghubungkan ke NeuraDash AI...',
      progress: 5,
      error: null,
    });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      console.info('[AI] Starting stream connection...');
      
      // PRE-FLIGHT: Ensure token is fresh via axios
      try {
        await authApi.me();
      } catch (e) {
        console.warn('[AI] Pre-flight auth check failed...');
      }

      const response = await fetch(`${API_BASE}/ai-dashboard/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ datasetId: selectedDatasetId, prompt }),
        signal: abort.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Sesi kedaluwarsa. Silakan muat ulang halaman untuk masuk kembali.');
        }
        throw new Error(`Server error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
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

          if (!line.trim() || !line.startsWith('data: ')) continue;
          const dataStr = line.substring(6).trim();
          if (dataStr === '[DONE]') {
            setStream(prev => ({ ...prev, isStreaming: false, progress: 100 }));
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);

            if (currentEvent === 'progress') {
              setStream(prev => {
                let p = prev.progress;

                if (parsed.stage === 'planning') {
                  // AI is thinking: 5% → 15%
                  p = Math.max(p, 15);
                } else if (parsed.stage === 'executing') {
                  // SQL phase starting: store total charts for proportional increment
                  // CRITICAL FIX: do NOT reset p to 40 if already > 40.
                  // This event fires once at the start of SQL execution.
                  if (parsed.totalCharts) {
                    totalChartsRef.current = parsed.totalCharts;
                  }
                  p = Math.max(p, 40);
                } else if (parsed.stage === 'executing_sql') {
                  // Per-chart SQL result: increment proportionally from 40% → 88%
                  // Formula: 40 + (done / total) * 48
                  const done = parsed.done ?? 1;
                  const total = totalChartsRef.current > 0 ? totalChartsRef.current : (parsed.total ?? 8);
                  p = Math.max(p, Math.round(40 + (done / total) * 48));
                } else if (parsed.stage === 'layouting') {
                  p = Math.max(p, 90);
                } else if (parsed.stage === 'success') {
                  p = 99;
                }

                return {
                  ...prev,
                  stage: parsed.stage,
                  message: parsed.message,
                  progress: Math.min(p, 99),
                  error: null,
                };
              });
            } else if (currentEvent === 'layout') {
               setCharts(parsed);
               setStream(prev => ({ ...prev, isStreaming: false, progress: 100 }));
            }
          } catch (e) {
             if (currentEvent === 'error') {
                const errMsg = dataStr.replace(/^"|"$/g, '').replace(/\\"/g, '"');
                throw new Error(errMsg || 'AI encountered an internal processing error');
             }
          }
        }
      }
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        toast({ title: 'Dibatalkan' });
        setStream(prev => ({ ...prev, isStreaming: false }));
      } else {
        console.error('[AI-BUILDER] Stream Error:', error);
        setStream(prev => ({ 
          ...prev, 
          message: 'Gagal memproses permintaan', 
          error: error.message,
          isStreaming: false 
        }));
        toast({
          title: 'Error generating dashboard',
          description: error.message,
          variant: 'destructive',
        });
      }
    }
  }, [prompt, selectedDatasetId, toast]);

  const cleanSQL = (q: string) => {
    // 1. Remove markdown
    let cleaned = q.replace(/```sql|```/gi, '').trim();
    // 2. Remove SQL comments and join lines (Single line for safe DDL)
    return cleaned.split('\n')
      .map(line => line.split('--')[0].trim())
      .filter(line => line.length > 0)
      .join(' ');
  };

  const handleSaveToLibrary = async () => {
    if (!charts.length || isSaving || isSaved) return;

    const finalName = dashboardName.trim() || `AI Generated Report - ${new Date().toLocaleDateString('id-ID')}`;
    setIsSaving(true);

    try {
      const savedChartIds: Record<number, string> = {};
      const syncedAxes: Record<number, { xAxis: string; yAxis: string; datasetId: string }> = {};

      const batchReq: BatchAIGenerateRequest = {
        sourceDatasetId: selectedDatasetId,
        datasets: charts.map(c => ({
          name: c.title,
          description: `AI Generated data for chart: ${c.title}`,
          query: cleanSQL(c.query)
        }))
      };

      const newDatasets = await datasetApi.aiGenerateBatch(batchReq);
      
      if (!newDatasets || newDatasets.length !== charts.length) {
        throw new Error("Respons server tidak konsisten dengan jumlah widget.");
      }

      for (let i = 0; i < charts.length; i++) {
        const c = charts[i];
        const newDataset = newDatasets[i];
        const newDatasetId = newDataset.id;

        // ── AXIS DETECTION: 2-tier strategy ───────────────────────────────────
        // Tier 1 (preferred): Use backend-saved dataset.columns metadata.
        // columns is already typed as ColumnDef[] — no string-parsing needed.
        // After the backend fix, this correctly reflects actual AI query columns
        // (e.g. [status, total] from GROUP BY), NOT raw source table columns.
        //
        // Tier 2 (fallback): Inspect runtime data types from preview rows.
        let xAxis = '';
        let yAxis = '';

        // newDataset.columns is ColumnDef[] per the DatasetItem interface.
        // Use it directly — no JSON.parse or typeof-string guards required.
        const dsColumns = Array.isArray(newDataset.columns) ? newDataset.columns : [];

        if (dsColumns.length > 0) {
          // Tier 1: columns metadata from backend (source of truth)
          // ColumnDef.type is 'string' | 'number' | 'date' | 'boolean'
          const strCol = dsColumns.find(col => col.type === 'string' || col.type === 'date');
          const numCol = dsColumns.find(col => col.type === 'number');
          xAxis = strCol?.name || dsColumns[0]?.name || '';
          yAxis = numCol?.name || (dsColumns.length > 1 ? dsColumns[1].name : dsColumns[0]?.name) || '';
        } else {
          // Tier 2: fallback to runtime JS type inspection of preview data
          const firstRow = c.data[0] || {};
          const keys = Object.keys(firstRow).filter(k => k !== 'map_key');
          xAxis = keys.find(k => typeof firstRow[k] === 'string') || keys[0] || '';
          yAxis = keys.find(k => typeof firstRow[k] === 'number') || (keys.length > 1 ? keys[1] : keys[0]) || '';
        }

        syncedAxes[i] = { xAxis, yAxis, datasetId: newDatasetId };

        const chartPayload = {
          title: `AI - ${c.title}`,
          type: c.type as any,
          datasetId: newDatasetId,
          xAxis: xAxis || 'category',
          yAxis: yAxis || 'value',
          groupBy: '',
          config: {
            query: c.query,
            isAiGenerated: true,
            width: c.width
          }
        };

        const res = await chartApi.create(chartPayload);
        if (res.data && res.data.id) {
          savedChartIds[i] = res.data.id;
        } else {
          throw new Error(`Gagal menyimpan konfigurasi chart: ${c.title}`);
        }
      }

      let currentX = 0;
      let currentY = 0;
      const ROW_HEIGHT = 4;

      const widgets = charts.map((c, i) => {
        const w = Number(c.width) || 12;
        const h = c.type === 'stat' ? 2 : ROW_HEIGHT;
        const { xAxis, yAxis, datasetId } = syncedAxes[i];

        if (currentX + w > 12) {
          currentX = 0;
          currentY += ROW_HEIGHT;
        }

        const widget = {
          id: `widget-${Date.now()}-${i}`,
          title: c.title,
          type: c.type,
          dataSetId: datasetId,
          chartId: savedChartIds[i],
          x: currentX,
          y: currentY,
          w: w,
          h: h,
          xAxis: xAxis,
          yAxis: yAxis,
          width: w === 12 ? 'full' : 'half',
          config: {
            isAiGenerated: true,
            query: c.query
          }
        };

        currentX += w;
        if (currentX >= 12) {
          currentX = 0;
          currentY += h;
        }

        return widget;
      });

      const selectedDataset = datasets.find(d => d.id === selectedDatasetId);
      const dashboardTitle = dashboardName.trim() || `AI Dashboard - ${selectedDataset?.name || 'New'}`;

      const response = await dashboardApi.create({
        name: dashboardTitle,
        widgets: widgets
      });

      const newDash = response.data;
      toast({ title: "Success!", description: "Dashboard has been created and saved to your library." });
      navigate(`/dashboard-builder?id=${newDash.id}`);
    } catch (err: any) {
      console.error("[DEBUG] Final Save Error:", err);
      toast({
        title: 'Gagal Menyimpan',
        description: err.response?.data?.error || err.message || "Request failed",
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelStream = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const renderIconForType = (type: string) => {
    switch(type) {
      case 'stat': return <LayoutGrid className="w-4 h-4" />;
      case 'bar':
      case 'line':
      case 'area': return <BarChart3 className="w-4 h-4" />;
      case 'pie':
      case 'donut':
      case 'radar': return <PieChartIcon className="w-4 h-4" />;
      case 'geo': return <MapPin className="w-4 h-4" />;
      default: return <TableIcon className="w-4 h-4" />;
    }
  };

  const renderChartBody = (chart: AIDashboardChart) => {
    if (!chart.data || chart.data.length === 0) {
      return <div className="flex bg-muted/20 items-center justify-center p-8 rounded-lg text-muted-foreground text-sm italic">Tidak ada data atau error eksekusi query.</div>;
    }

    const firstRow = chart.data[0];
    const keys = Object.keys(firstRow);
    const numKey = keys.find(k => typeof firstRow[k] === 'number');
    const strKey = keys.find(k => typeof firstRow[k] === 'string' && k !== 'map_key');

    if (chart.type === 'stat') {
      const val = numKey ? firstRow[numKey] : Object.values(firstRow)[0];
      return (
        <div className="flex flex-col justify-center h-24">
          <h2 className="text-4xl font-bold tracking-tight text-foreground">
            {typeof val === 'number' ? new Intl.NumberFormat('id-ID').format(val) : String(val)}
          </h2>
        </div>
      );
    }

    if (chart.type === 'table' || chart.type === 'pivot') {
      return (
        <div className="overflow-x-auto w-full max-h-[400px] border border-border/20 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
              <tr>
                {keys.map(k => <th key={k} className="px-4 py-3 font-medium text-nowrap">{k}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {chart.data.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  {keys.map(k => <td key={k} className="px-4 py-3 text-nowrap">{String(row[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (chart.type === 'pie' || chart.type === 'donut') {
      const isDonut = chart.type === 'donut';
      return (
         <ResponsiveContainer width="100%" height={250}>
            <PieChart>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
               <Pie data={chart.data} cx="50%" cy="50%" innerRadius={isDonut ? 60 : 0} outerRadius={80} paddingAngle={2} dataKey={numKey || keys[0]} nameKey={strKey || keys[1] || keys[0]} stroke="hsl(var(--background))" strokeWidth={2}>
                  {chart.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
               </Pie>
            </PieChart>
         </ResponsiveContainer>
      );
    }

    if (chart.type === 'geo' || chart.type === 'map') {
      return (
        <div className="flex flex-col gap-4 h-64 overflow-hidden border border-border/20 rounded-xl bg-muted/5 p-4">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground border-b border-border/20 pb-2 uppercase tracking-widest opacity-60">
            <span>Location</span>
            <span>Value</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {chart.data.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between group hover:bg-muted/10 p-2 rounded-lg transition-colors border border-transparent hover:border-border/40">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                  <span className="text-sm font-medium">{String(item[strKey || keys[0]])}</span>
                </div>
                <span className="text-sm font-mono font-bold text-primary">
                   {typeof (item as any)[numKey || keys[1]] === 'number' 
                     ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format((item as any)[numKey || keys[1]])
                     : String((item as any)[numKey || keys[1]])}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const xKeyUsed = strKey || keys[0];
    const yKeyUsed = numKey || keys[1] || keys[0];

    return (
       <ResponsiveContainer width="100%" height={250}>
         {chart.type === 'line' ? (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey={xKeyUsed} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend iconType="circle" />
              <Line type="monotone" dataKey={yKeyUsed} stroke={COLORS[0]} strokeWidth={3} dot={{ strokeWidth: 2, r: 4, fill: 'hsl(var(--background))' }} activeDot={{ r: 6 }} animationDuration={1500} />
            </LineChart>
         ) : chart.type === 'area' ? (
            <AreaChart data={chart.data}>
              <defs>
                 <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/>
                 </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey={xKeyUsed} fontSize={12} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey={yKeyUsed} stroke={COLORS[0]} fill="url(#colorArea)" fillOpacity={1} strokeWidth={3} animationDuration={1500} />
            </AreaChart>
         ) : (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey={xKeyUsed} fontSize={12} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.2)' }} />
              <Bar dataKey={yKeyUsed} fill={COLORS[0]} radius={[4, 4, 0, 0]} animationDuration={1500} />
            </BarChart>
         )}
       </ResponsiveContainer>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-background relative">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
      
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 pb-40">
        
        {/* Monitoring / Progress / Error Section */}
        <AnimatePresence mode="wait">
          {(stream.isStreaming || stream.error) && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className={`max-w-xl mx-auto mb-10 p-8 rounded-3xl border shadow-2xl relative overflow-hidden backdrop-blur-xl z-20 ${
                stream.error ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-card/70 border-border/50'
              }`}
            >
              {!stream.error && <div className="absolute inset-0 bg-primary/5 animate-pulse opacity-40 pointer-events-none" />}
              
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${
                  stream.error ? 'bg-destructive/20' : 'bg-primary/20 text-primary animate-bounce'
                }`}>
                  {stream.error ? <Sparkles className="w-8 h-8 opacity-50" /> : <Loader2 className="w-8 h-8 animate-spin" />}
                </div>
                
                <h2 className={`text-xl font-bold mb-2 ${stream.error ? 'text-destructive' : 'text-foreground'}`}>
                  {stream.error ? 'Terjadi Kesalahan' : stream.message || 'Menyiapkan...'}
                </h2>
                
                <p className="text-muted-foreground text-sm max-w-sm mb-8 leading-relaxed">
                  {stream.error ? stream.error : 'AI sedang merancang dashboard terbaik Anda. Sinkronisasi data dan arsitektur visual sedang berlangsung.'}
                </p>

                <div className="w-full space-y-3">
                  <div className="flex justify-between text-[11px] font-bold mb-1 px-1 tracking-widest uppercase opacity-80">
                    <span>{stream.error ? 'SYSTEM ERROR' : stream.stage}</span>
                    <span>{Math.round(stream.progress)}%</span>
                  </div>
                  <Progress value={stream.progress} className={`h-2 rounded-full overflow-hidden ${stream.error ? 'bg-destructive/20 [&>div]:bg-destructive' : 'bg-muted/30 [&>div]:gradient-primary'}`} />
                </div>

                <div className="flex gap-3 w-full mt-8">
                  {stream.error ? (
                    <Button onClick={() => window.location.reload()} className="w-full rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20">
                      Muat Ulang & Coba Lagi
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={cancelStream} className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl py-6">
                      Hentikan Proses
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {charts.length > 0 && !stream.isStreaming && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-4 bg-primary/5 border border-primary/20 p-4 rounded-2xl mb-8 backdrop-blur-sm shadow-sm">
            <div className="flex-1 flex items-center gap-3 w-full">
              <div className="bg-primary/20 p-2 rounded-xl text-primary"><Save className="w-5 h-5" /></div>
              <Input placeholder="Nama Dashboard..." value={dashboardName} onChange={(e) => setDashboardName(e.target.value)} className="bg-transparent border-none focus-visible:ring-0 text-lg font-medium" />
            </div>
            <Button onClick={handleSaveToLibrary} disabled={isSaving || isSaved} className="rounded-xl px-8 h-11 w-full md:w-auto shadow-lg shadow-primary/20">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : isSaved ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {isSaving ? 'Menyimpan...' : isSaved ? 'Tersimpan' : 'Simpan ke Library'}
            </Button>
          </motion.div>
        )}

        {charts.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-12 gap-6">
            {charts.map((chart, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} style={{ gridColumn: `span ${chart.width || 12} / span ${chart.width || 12}` }} className="bg-card border border-border/40 hover:border-primary/30 transition-all duration-300 rounded-2xl shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:shadow-primary/5">
                <div className="flex items-center justify-between p-5 border-b border-border/30 bg-muted/5">
                  <h3 className="font-semibold text-foreground flex items-center gap-3">
                    <span className="bg-primary/10 p-1.5 rounded-lg text-primary group-hover:scale-110 transition-transform">{renderIconForType(chart.type)}</span>
                    {chart.title}
                  </h3>
                  <code className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 truncate cursor-help" title={chart.query}>{chart.query}</code>
                </div>
                <div className="p-6 flex-1">{renderChartBody(chart)}</div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {!stream.isStreaming && charts.length === 0 && !stream.error && (
          <div className="flex flex-col h-full min-h-[600px]">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="flex flex-col sm:flex-row sm:items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0"><Sparkles className="w-6 h-6 text-primary-foreground" /></div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Agentic AI Dashboard Builder</h1>
                <p className="text-muted-foreground text-sm lg:text-base">Rancang dashboard profesional otomatis menggunakan otonomi AI.</p>
              </div>
            </motion.div>
            <div className="flex-1 flex items-center justify-center pb-20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {[
                  { label: "Growth Analytics", prompt: "Analisis growth sales per bulan dan kategori produk terlaris", icon: <BarChart3 className="w-5 h-5"/>, bgIcon: <BarChart3 className="w-16 h-16"/> },
                  { label: "Customer Mapping", prompt: "Tampilkan peta sebaran kustomer dan tabel detail transaksi harian", icon: <MapPin className="w-5 h-5"/>, bgIcon: <MapPin className="w-16 h-16"/> },
                  { label: "Executive Overview", prompt: "Dashboard eksekutif untuk performa finansial tahun ini dengan perbandingan budget", icon: <LayoutGrid className="w-5 h-5"/>, bgIcon: <LayoutGrid className="w-16 h-16"/> },
                  { label: "Anomaly Detection", prompt: "Analisis anomali data transaksi dan identifikasi bottleneck pada operasional", icon: <Database className="w-5 h-5"/>, bgIcon: <Database className="w-16 h-16"/> }
                ].map((card, i) => (
                  <motion.button key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + (i * 0.1) }} onClick={() => setPrompt(card.prompt)} className="flex flex-col text-left p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all group relative overflow-hidden h-full shadow-sm">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">{card.bgIcon}</div>
                    <div className="bg-primary/10 w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform">{card.icon}</div>
                    <h3 className="font-bold text-foreground mb-2">{card.label}</h3>
                    <p className="text-sm text-muted-foreground">"{card.prompt}"</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-10">
        <div className="bg-card/70 backdrop-blur-3xl border border-border/80 shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-[2rem] overflow-hidden flex flex-col p-1.5 transition-all duration-300 focus-within:shadow-primary/10">
          <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-3">
            <Database className="w-4 h-4 text-primary" />
            <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
              <SelectTrigger className="w-full h-8 text-sm focus:ring-0 border-none bg-transparent hover:bg-muted/30 px-0"><SelectValue placeholder="Pilih Dataset..." /></SelectTrigger>
              <SelectContent className="rounded-2xl border-border/60">
                {datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="rounded-xl m-1 cursor-pointer">
                    <div className="flex items-center gap-2"><span className="font-medium text-nowrap">{d.name}</span><span className="text-[10px] text-muted-foreground opacity-60">({d.rowCount} baris)</span></div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 p-1">
            <Textarea ref={textareaRef} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }} disabled={stream.isStreaming} placeholder="Rancang dashboard impian Anda..." className="min-h-[60px] max-h-[180px] border-none focus-visible:ring-0 resize-none bg-transparent py-4 px-4 text-base" />
            <Button size="icon" className="h-14 w-14 rounded-3xl mb-1 shrink-0 shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all" disabled={!prompt.trim() || !selectedDatasetId || stream.isStreaming} onClick={handleGenerate}>
              {stream.isStreaming ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6 ml-0.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIDashboardBuilder;
