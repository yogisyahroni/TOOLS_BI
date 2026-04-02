import { useState, useCallback, useRef, useEffect } from 'react';
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
import { API_BASE, getAccessToken, dashboardApi } from '@/lib/api';
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
  type: string; // "stat", "line", "bar", "area", "pie", "donut", "radar", "geo", "pivot", "table"
  width: number;
  query: string;
  data: Record<string, unknown>[];
}

interface StreamState {
  isStreaming: boolean;
  stage: string;
  message: string;
  progress: number;
}

function AIDashboardBuilder() {
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
  });

  const abortRef = useRef<AbortController | null>(null);
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
    setStream({
      isStreaming: true,
      stage: 'init',
      message: 'Menghubungkan ke NeuraDash AI...',
      progress: 5,
    });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
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

          if (!line.trim() || !line.startsWith('data: ')) continue;
          const dataStr = line.substring(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (currentEvent === 'progress') {
              setStream(prev => {
                let p = prev.progress;
                if (parsed.stage === 'planning') p = 15;
                if (parsed.stage === 'executing') p = 40;
                if (parsed.stage === 'executing_sql') p += 5;
                if (parsed.stage === 'layouting') p = 90;
                if (parsed.stage === 'success') p = 100;
                
                return { ...prev, stage: parsed.stage, message: parsed.message, progress: Math.min(p, 99) };
              });
            } else if (currentEvent === 'layout') {
               setCharts(parsed);
               setStream(prev => ({ ...prev, progress: 100 }));
            }
          } catch {
             if (currentEvent === 'error') {
                const errMsg = dataStr.replace(/^"|"$/g, '').replace(/\\"/g, '"');
                throw new Error(errMsg);
             }
          }
        }
      }
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        toast({ title: 'Dibatalkan' });
      } else {
        toast({
          title: 'Error generating dashboard',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setStream(prev => ({ ...prev, isStreaming: false }));
    }
  }, [prompt, selectedDatasetId, toast]);

  const handleSaveToLibrary = async () => {
    if (!charts.length || isSaving || isSaved) return;

    const finalName = dashboardName.trim() || `AI Generated Report - ${new Date().toLocaleDateString('id-ID')}`;
    setIsSaving(true);

    try {
      // Map AI Charts to Standard Dashboard Widgets
      const widgets = charts.map((c, i) => ({
        id: `widget-${i}`,
        title: c.title,
        type: c.type,
        width: c.width,
        query: c.query,
        config: {
          isAiGenerated: true,
          datasetId: selectedDatasetId,
          // Store chart metadata for reuse in regular builder
          chartConfig: {
            type: c.type,
            title: c.title,
            query: c.query
          }
        }
      }));

      await dashboardApi.create({
        name: finalName,
        widgets: widgets,
        isPublic: false
      });

      setIsSaved(true);
      toast({
        title: 'Dashboard Tersimpan!',
        description: `"${finalName}" telah ditambahkan ke daftar Dashboard Anda.`,
      });
    } catch (err) {
      toast({
        title: 'Gagal Menyimpan',
        description: 'Terjadi kesalahan sistem saat mencoba menyimpan dashboard.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelStream = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
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
      return (
        <div className="flex bg-muted/20 items-center justify-center p-8 rounded-lg text-muted-foreground text-sm">
          Tidak ada data atau error eksekusi query.
        </div>
      );
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
        <div className="overflow-x-auto w-full max-h-[400px]">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
              <tr>
                {keys.map(k => <th key={k} className="px-4 py-3 font-medium text-nowrap">{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {chart.data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
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
               <Pie 
                 data={chart.data} 
                 cx="50%" cy="50%" 
                 innerRadius={isDonut ? 60 : 0} 
                 outerRadius={80} 
                 paddingAngle={2}
                 dataKey={numKey || keys[0]} 
                 nameKey={strKey || keys[1] || keys[0]} 
                 stroke="hsl(var(--background))" 
                 strokeWidth={2}
               >
                  {chart.data.map((_, i) => (
                     <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
               </Pie>
            </PieChart>
         </ResponsiveContainer>
      );
    }

    if (chart.type === 'geo' || chart.type === 'map') {
      return (
        <div className="flex flex-col gap-4 h-64 overflow-hidden border border-border/20 rounded-xl bg-muted/5 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground border-b border-border/20 pb-2">
            <span>Location / Area</span>
            <span>Value Contribution</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {chart.data.length > 0 ? chart.data.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between group hover:bg-muted/10 p-1.5 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                  <span className="text-sm font-medium">{item[strKey || keys[0]] as any}</span>
                </div>
                <span className="text-sm font-mono text-primary/80">
                   {typeof (item as any)[numKey || keys[1]] === 'number' 
                     ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format((item as any)[numKey || keys[1]])
                     : (item as any)[numKey || keys[1]] as any}
                </span>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-muted-foreground/50 italic">
                Data lokasi tidak tersedia
              </div>
            )}
          </div>
        </div>
      );
    }

    if (chart.type === 'table' || chart.type === 'pivot') {
      return (
        <div className="h-64 overflow-hidden border border-border/20 rounded-xl bg-card shadow-inner flex flex-col">
          <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-md z-10">
                <tr>
                  {keys.map((k) => (
                    <th key={k} className="px-4 py-3 font-semibold text-muted-foreground border-b border-border/30 first:rounded-tl-lg last:rounded-tr-lg capitalize">
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {chart.data.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/5 transition-colors group">
                    {keys.map((k) => (
                      <td key={k} className="px-4 py-3 text-foreground/80 group-hover:text-foreground">
                        {typeof (row as any)[k] === 'number' ? ((row as any)[k] as number).toLocaleString() : String((row as any)[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
              <XAxis dataKey={xKeyUsed} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--foreground))' }} />
              <YAxis tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend iconType="circle" />
              <Line type="monotone" dataKey={yKeyUsed} stroke={COLORS[0]} strokeWidth={3} dot={{ strokeWidth: 2, r: 4, fill: 'hsl(var(--background))' }} activeDot={{ r: 6 }} />
            </LineChart>
         ) : chart.type === 'area' ? (
           <AreaChart data={chart.data}>
             <defs>
                <linearGradient id="colorY" x1="0" y1="0" x2="0" y2="1">
                   <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8}/>
                   <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/>
                </linearGradient>
             </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey={xKeyUsed} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--foreground))' }} />
              <YAxis tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
              <Tooltip />
              <Legend iconType="circle" />
              <Area type="monotone" dataKey={yKeyUsed} stroke={COLORS[0]} fill="url(#colorY)" fillOpacity={1} />
           </AreaChart>
         ) : (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey={xKeyUsed} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--foreground))' }} />
              <YAxis tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.2)' }} />
              <Legend iconType="circle" />
              <Bar dataKey={yKeyUsed} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
         )}
       </ResponsiveContainer>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-background relative">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
      
      {/* Scrollable Dashboard Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 pb-40">
         <AnimatePresence>
            {stream.isStreaming && (
               <motion.div 
                 initial={{ opacity: 0, y: -20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0 }}
                 className="max-w-xl mx-auto mb-8 bg-card border border-border/50 shadow-2xl rounded-2xl p-6 backdrop-blur-xl z-20"
               >
                 <div className="flex items-center gap-3 text-primary mb-4">
                   <Sparkles className="h-6 w-6 animate-pulse" />
                   <h2 className="font-semibold text-lg">{stream.message || 'Menyiapkan...'}</h2>
                 </div>
                 <Progress value={stream.progress} className="h-2" />
                 <p className="text-xs text-muted-foreground mt-3 text-right">{stream.progress}%</p>
                 <Button variant="ghost" size="sm" onClick={cancelStream} className="mt-4 w-full text-muted-foreground hover:text-destructive">
                   Batalkan
                 </Button>
               </motion.div>
            )}
         </AnimatePresence>

         {charts.length > 0 && !stream.isStreaming && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-4 bg-primary/5 border border-primary/20 p-4 rounded-2xl mb-8 backdrop-blur-sm shadow-sm"
            >
               <div className="flex-1 flex items-center gap-3 w-full">
                  <div className="bg-primary/20 p-2 rounded-xl text-primary">
                    <Save className="w-5 h-5" />
                  </div>
                  <Input 
                    placeholder="Nama Dashboard (Contoh: Laporan Penjualan Q1)"
                    value={dashboardName}
                    onChange={(e) => setDashboardName(e.target.value)}
                    className="bg-transparent border-none focus-visible:ring-0 text-lg font-medium placeholder:text-muted-foreground/40"
                  />
               </div>
               <Button 
                onClick={handleSaveToLibrary} 
                disabled={isSaving || isSaved}
                className="rounded-xl px-8 h-11 w-full md:w-auto shadow-lg shadow-primary/20 shrink-0"
               >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : isSaved ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {isSaving ? 'Menyimpan...' : isSaved ? 'Tersimpan' : 'Simpan ke Library'}
               </Button>
            </motion.div>
         )}

         {charts.length > 0 && (
           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             className="grid grid-cols-12 gap-6"
           >
             {charts.map((chart, i) => (
               <motion.div 
                 key={i} 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: i * 0.1 }}
                 style={{ gridColumn: `span ${chart.width || 12} / span ${chart.width || 12}` }}
                 className="bg-card border border-border/40 hover:border-primary/30 transition-all duration-300 rounded-2xl shadow-sm overflow-hidden flex flex-col group hover:shadow-xl hover:shadow-primary/5"
               >
                  <div className="flex items-center justify-between p-5 border-b border-border/30 bg-muted/5">
                     <h3 className="font-semibold text-foreground flex items-center gap-3">
                       <span className="bg-primary/10 p-1.5 rounded-lg text-primary group-hover:scale-110 transition-transform">
                          {renderIconForType(chart.type)}
                       </span>
                       {chart.title}
                     </h3>
                     <code className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity max-w-[200px] truncate cursor-help" title={chart.query}>{chart.query}</code>
                  </div>
                  <div className="p-6 flex-1">
                     {renderChartBody(chart)}
                  </div>
               </motion.div>
             ))}
           </motion.div>
         )}

         {!stream.isStreaming && charts.length === 0 && (
           <div className="flex flex-col h-full space-y-12">
             {/* New Professional Header (Top-Left) */}
             <motion.div 
               initial={{ opacity: 0, x: -20 }} 
               animate={{ opacity: 1, x: 0 }} 
               transition={{ duration: 0.5 }}
               className="flex flex-col sm:flex-row sm:items-center gap-4 py-4"
             >
               <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
                 <Sparkles className="w-6 h-6 text-primary-foreground" />
               </div>
               <div>
                 <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
                   Agentic AI Dashboard Builder
                 </h1>
                 <p className="text-muted-foreground text-sm lg:text-base">Rancang dashboard profesional otomatis menggunakan otonomi AI.</p>
               </div>
             </motion.div>
  
             {/* Suggestion Cards Grid (Modern Grid) */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
               <motion.button
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.2 }}
                 onClick={() => setPrompt("Analisis growth sales per bulan dan kategori produk terlaris")}
                 className="flex flex-col text-left p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all group relative overflow-hidden h-full shadow-sm"
               >
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <BarChart3 className="w-16 h-16" />
                 </div>
                 <div className="bg-primary/10 w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform">
                   <BarChart3 className="w-5 h-5" />
                 </div>
                 <h3 className="font-bold text-foreground mb-2">Growth Analytics</h3>
                 <p className="text-sm text-muted-foreground">"Analisis growth sales per bulan dan kategori produk terlaris"</p>
               </motion.button>
  
               <motion.button
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.3 }}
                 onClick={() => setPrompt("Tampilkan peta sebaran kustomer dan tabel detail transaksi harian")}
                 className="flex flex-col text-left p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all group relative overflow-hidden h-full shadow-sm"
               >
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <MapPin className="w-16 h-16" />
                 </div>
                 <div className="bg-primary/10 w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform">
                   <MapPin className="w-5 h-5" />
                 </div>
                 <h3 className="font-bold text-foreground mb-2">Customer Mapping</h3>
                 <p className="text-sm text-muted-foreground">"Tampilkan peta sebaran kustomer dan tabel detail transaksi harian"</p>
               </motion.button>
  
               <motion.button
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.4 }}
                 onClick={() => setPrompt("Dashboard eksekutif untuk performa finansial tahun ini dengan perbandingan budget")}
                 className="flex flex-col text-left p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all group relative overflow-hidden h-full shadow-sm"
               >
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <LayoutGrid className="w-16 h-16" />
                 </div>
                 <div className="bg-primary/10 w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform">
                   <LayoutGrid className="w-5 h-5" />
                 </div>
                 <h3 className="font-bold text-foreground mb-2">Executive Overview</h3>
                 <p className="text-sm text-muted-foreground">"Dashboard eksekutif untuk performa finansial tahun ini..."</p>
               </motion.button>
  
               <motion.button
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.5 }}
                 onClick={() => setPrompt("Analisis anomali data transaksi dan identifikasi bottleneck pada operasional")}
                 className="flex flex-col text-left p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all group relative overflow-hidden h-full shadow-sm"
               >
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Database className="w-16 h-16" />
                 </div>
                 <div className="bg-primary/10 w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform">
                   <Database className="w-5 h-5" />
                 </div>
                 <h3 className="font-bold text-foreground mb-2">Anomaly Detection</h3>
                 <p className="text-sm text-muted-foreground">"Analisis anomali data transaksi dan identifikasi bottleneck..."</p>
               </motion.button>
             </div>
           </div>

         )}
       </div>

       {/* Floating Chat Input Area */}
       <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-10">
         <div className="bg-card/70 backdrop-blur-3xl border border-border/80 shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-[2rem] overflow-hidden flex flex-col p-1.5 transition-all duration-300 focus-within:shadow-primary/10">
            <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-3">
               <Database className="w-4 h-4 text-primary" />
               <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                 <SelectTrigger className="w-full h-8 text-sm focus:ring-0 border-none bg-transparent hover:bg-muted/30 transition-colors px-0">
                   <SelectValue placeholder="Pilih Dataset untuk dianalisis oleh AI..." />
                 </SelectTrigger>
                 <SelectContent className="rounded-2xl border-border/60">
                   {datasets.map((d) => (
                     <SelectItem key={d.id} value={d.id} className="rounded-xl m-1 cursor-pointer">
                       <div className="flex items-center gap-2">
                         <span className="font-medium text-nowrap">{d.name}</span>
                         <span className="text-[10px] text-muted-foreground opacity-60">({d.rowCount} baris)</span>
                       </div>
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
            </div>
            <div className="flex items-end gap-2 p-1">
               <Textarea
                 ref={textareaRef}
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleGenerate();
                   }
                 }}
                 disabled={stream.isStreaming}
                 placeholder="Rancang dashboard impian Anda..."
                 className="min-h-[60px] max-h-[180px] border-none focus-visible:ring-0 resize-none bg-transparent placeholder:text-muted-foreground/50 text-foreground py-4 px-4 text-base"
               />
               <Button 
                 size="icon" 
                 className="h-14 w-14 rounded-3xl mb-1 shrink-0 shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all" 
                 disabled={!prompt.trim() || !selectedDatasetId || stream.isStreaming}
                 onClick={handleGenerate}
               >
                   {stream.isStreaming ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6 ml-0.5" />}
               </Button>
            </div>
         </div>
       </div>
    </div>
  );
}

export default AIDashboardBuilder;
