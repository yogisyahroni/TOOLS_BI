import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, FileBarChart2, Database, Layers, CheckCircle, XCircle,
    Loader2, Eye, Download, ChevronRight, BarChart3, FileText,
    PieChart, Table2, Zap, X
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { importApi, type ParsedReport } from '@/lib/api';
import toast from 'react-hot-toast';

// ─── Visual type icons ────────────────────────────────────────────────────────
const VISUAL_ICON: Record<string, typeof BarChart3> = {
    bar: BarChart3, line: BarChart3, pie: PieChart, area: BarChart3,
    scatter: BarChart3, table: Table2, matrix: Table2, kpi: Zap,
    card: FileText, text: FileText, image: FileText, chart: BarChart3,
};

const VisualIcon = ({ type }: { type: string }) => {
    const Icon = VISUAL_ICON[type] ?? BarChart3;
    return <Icon className="w-3.5 h-3.5" />;
};

// ─── Source type badge ────────────────────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; color: string; emoji: string }> = {
    powerbi: { label: 'Power BI', color: '#F2C811', emoji: '📊' },
    tableau: { label: 'Tableau', color: '#E8762D', emoji: '📈' },
    pptx: { label: 'PowerPoint', color: '#D04525', emoji: '📑' },
};

const ACCEPTED_EXTS = ['.pbix', '.twb', '.twbx', '.pptx'];

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImportPage() {
    const [dragOver, setDragOver] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [parsed, setParsed] = useState<ParsedReport | null>(null);
    const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
    const [confirmed, setConfirmed] = useState<{ template: { name: string }; reports: unknown[] } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // ── Parse preview ──────────────────────────────────────────────────────────
    const parseMut = useMutation({
        mutationFn: (f: File) => importApi.parse(f).then(r => r.data.parsed as ParsedReport),
        onSuccess: (data) => { setParsed(data); setStep('preview'); },
        onError: (e: Error) => toast.error(e.message || 'Parse failed — invalid or unsupported file'),
    });

    // ── Confirm import ─────────────────────────────────────────────────────────
    const confirmMut = useMutation({
        mutationFn: (f: File) => importApi.confirm(f).then(r => r.data),
        onSuccess: (data) => { setConfirmed(data); setStep('done'); toast.success('Import successful!'); },
        onError: (e: Error) => toast.error(e.message || 'Import failed'),
    });

    // ── File selection ─────────────────────────────────────────────────────────
    const handleFile = useCallback((f: File) => {
        const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
        if (!ACCEPTED_EXTS.includes(ext)) {
            toast.error(`Unsupported format: ${ext}. Accepted: ${ACCEPTED_EXTS.join(', ')}`);
            return;
        }
        setFile(f);
        setParsed(null);
        setStep('upload');
        parseMut.mutate(f);
    }, [parseMut]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    }, [handleFile]);

    const reset = () => { setFile(null); setParsed(null); setStep('upload'); setConfirmed(null); parseMut.reset(); confirmMut.reset(); };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-16">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg">
                        <Download className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Import Report</h1>
                        <p className="text-muted-foreground text-sm">Import .pbix Power BI, .twb/.twbx Tableau, or .pptx PowerPoint files</p>
                    </div>
                </div>
                {/* Supported format chips */}
                <div className="flex gap-2 mt-4 flex-wrap">
                    {Object.entries(SOURCE_META).map(([key, meta]) => (
                        <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-border bg-card"
                            style={{ color: meta.color }}>
                            {meta.emoji} {meta.label}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-border bg-card text-muted-foreground">
                        Max 100 MB
                    </span>
                </div>
            </motion.div>

            {/* Step indicator */}
            <div className="flex items-center gap-2">
                {['Upload & Parse', 'Preview', 'Done'].map((label, i) => {
                    const idx = ['upload', 'preview', 'done'].indexOf(step);
                    return (
                        <div key={label} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i <= idx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                {i < idx ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                            </div>
                            <span className={`text-xs font-medium ${i <= idx ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                            {i < 2 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                    );
                })}
            </div>

            {/* ── Upload zone ─────────────────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {step === 'upload' && (
                    <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={onDrop}
                            onClick={() => fileRef.current?.click()}
                            className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all p-16 text-center flex flex-col items-center gap-4 ${dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'}`}
                        >
                            <input ref={fileRef} type="file" className="hidden"
                                accept=".pbix,.twb,.twbx,.pptx"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

                            {parseMut.isPending ? (
                                <>
                                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                                    <div>
                                        <p className="text-lg font-semibold text-foreground">Parsing {file?.name}…</p>
                                        <p className="text-sm text-muted-foreground">Extracting pages, visuals, and data sources</p>
                                    </div>
                                    <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-primary rounded-full animate-pulse w-3/4" />
                                    </div>
                                </>
                            ) : parseMut.isError ? (
                                <>
                                    <XCircle className="w-12 h-12 text-destructive" />
                                    <div>
                                        <p className="text-lg font-semibold text-foreground">Parse Failed</p>
                                        <p className="text-sm text-muted-foreground">Try another file or check the format</p>
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); reset(); }}
                                        className="px-4 py-2 rounded-lg bg-muted text-sm text-muted-foreground hover:bg-muted/80 transition">
                                        Try Again
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400/20 to-pink-500/20 flex items-center justify-center">
                                        <Upload className="w-8 h-8 text-orange-500" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-semibold text-foreground">Drop your file here</p>
                                        <p className="text-sm text-muted-foreground mt-1">or click to browse — .pbix, .twb, .twbx, .pptx</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* ── Preview ──────────────────────────────────────────────────────── */}
                {step === 'preview' && parsed && (
                    <motion.div key="preview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                        {/* Parsed report header card */}
                        <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
                            <div className="text-4xl">{SOURCE_META[parsed.sourceType]?.emoji ?? '📄'}</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-lg text-foreground truncate">{parsed.title}</p>
                                <p className="text-sm text-muted-foreground capitalize">{parsed.sourceType} · {parsed.pages.length} pages · {parsed.dataSources?.length ?? 0} data sources</p>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {parsed.dataSources?.slice(0, 4).map((ds, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground">
                                            <Database className="w-2.5 h-2.5" /> {ds.type}: {ds.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <button onClick={reset} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Pages list */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                Pages / Slides ({parsed.pages.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                                {parsed.pages.map((pg, i) => (
                                    <div key={i} className="bg-card border border-border rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{i + 1}</div>
                                            <p className="font-medium text-sm text-foreground truncate">{pg.name}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {pg.visuals.slice(0, 6).map((v, j) => (
                                                <span key={j} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground">
                                                    <VisualIcon type={v.type} /> {v.type}{v.title ? `: ${v.title.slice(0, 20)}` : ''}
                                                </span>
                                            ))}
                                            {pg.visuals.length > 6 && (
                                                <span className="px-2 py-0.5 text-xs text-muted-foreground">+{pg.visuals.length - 6}</span>
                                            )}
                                            {pg.visuals.length === 0 && <span className="text-xs text-muted-foreground italic">No visuals detected</span>}
                                        </div>
                                        {pg.rawNotes && (
                                            <p className="mt-2 text-xs text-muted-foreground truncate italic">{pg.rawNotes.slice(0, 80)}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Confirm button */}
                        <div className="flex items-center gap-3">
                            <button onClick={reset} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition">
                                ← Start Over
                            </button>
                            <button
                                onClick={() => file && confirmMut.mutate(file)}
                                disabled={confirmMut.isPending}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-pink-600 text-white font-semibold shadow-lg hover:opacity-90 active:scale-95 transition disabled:opacity-50 flex-1 justify-center"
                            >
                                {confirmMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                {confirmMut.isPending ? 'Importing…' : `Import ${parsed.pages.length} Page(s) as Report Templates`}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ── Done ─────────────────────────────────────────────────────────── */}
                {step === 'done' && confirmed && (
                    <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                        className="bg-card border border-border rounded-2xl p-12 text-center">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground mb-1">Import Complete!</h2>
                        <p className="text-muted-foreground mb-6">
                            Created template <strong>{confirmed.template.name}</strong> with{' '}
                            <strong>{(confirmed.reports as unknown[]).length}</strong> report page(s).
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={reset}
                                className="px-5 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium transition">
                                Import Another
                            </button>
                            <a href="/report-templates"
                                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition">
                                View Templates →
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
