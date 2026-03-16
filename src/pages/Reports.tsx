import { motion } from 'framer-motion';
import { FileText, Download, Trash2, Calendar, Eye, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useReports, useDeleteReport, useGenerateReport, useDatasets } from '@/hooks/useApi';
import type { Report } from '@/lib/api';

const LANGUAGES = [
  { value: 'id', label: '🇮🇩 Bahasa Indonesia' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'ms', label: '🇲🇾 Bahasa Melayu' },
  { value: 'zh', label: '🇨🇳 中文' },
  { value: 'ja', label: '🇯🇵 日本語' },
];

export default function Reports() {
  const { data: reports = [], isLoading, refetch } = useReports();
  const { data: datasets = [] } = useDatasets();
  const deleteMut = useDeleteReport();
  const generateMut = useGenerateReport();
  const { toast } = useToast();
  const [selectedDsId, setSelectedDsId] = useState('');
  const [language, setLanguage] = useState('id'); // default: Bahasa Indonesia

  const handleDelete = (id: string, title: string) => {
    deleteMut.mutate(id, {
      onSuccess: () => toast({ title: 'Report deleted', description: `${title} removed.` }),
      onError: () => toast({ title: 'Error', variant: 'destructive' }),
    });
  };

  const handleExport = (report: Report) => {
    const content = `# ${report.title}\n\n${report.content}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${report.title.replace(/\s+/g, '_')}.md`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Export successful', description: `${report.title} exported as Markdown.` });
  };

  const handleGenerate = async () => {
    if (!selectedDsId) { toast({ title: 'Pilih dataset terlebih dahulu', variant: 'destructive' }); return; }
    try {
      await generateMut.mutateAsync({ datasetId: selectedDsId, language });
      const langLabel = LANGUAGES.find(l => l.value === language)?.label ?? language;
      toast({ title: '✅ Laporan berhasil dibuat!', description: `Laporan AI dalam ${langLabel} telah disimpan.` });
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Gagal membuat laporan.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
            <FileText className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              Reports <HelpTooltip text="Lihat semua laporan yang dibuat AI. Buat laporan baru dengan memilih dataset dan klik Generate." />
            </h1>
            <p className="text-muted-foreground text-sm lg:text-base">View and manage your AI-generated reports</p>
          </div>
          <div className="sm:ml-auto">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto touch-target">
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Generate new report */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-card rounded-xl p-4 lg:p-6 border border-border shadow-card">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Generate AI Report
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <Select value={selectedDsId} onValueChange={setSelectedDsId}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Pilih dataset" /></SelectTrigger>
            <SelectContent>{datasets.map((ds) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Pilih bahasa" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleGenerate} disabled={!selectedDsId || generateMut.isPending} className="w-full sm:w-auto touch-target">
            {generateMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate
          </Button>
        </div>
      </motion.div>

      {reports.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-card rounded-xl p-8 lg:p-12 border border-border shadow-card text-center">
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No reports yet</h3>
          <p className="text-muted-foreground">Generate your first AI-powered report above</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:gap-6">
          {reports.map((report, index) => (
            <motion.div key={report.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}
              className="bg-card rounded-xl p-4 lg:p-6 border border-border shadow-card hover:shadow-glow transition-all duration-300">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                    <FileText className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground line-clamp-1">{report.title}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-3 text-sm line-clamp-2 leading-relaxed">{report.content?.substring(0, 200)}…</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1 sm:flex-none touch-target"><Eye className="w-4 h-4 mr-2" />View</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                      <DialogHeader><DialogTitle>{report.title}</DialogTitle></DialogHeader>
                      <div className="space-y-6">
                        <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed text-sm lg:text-base">{report.content}</div>
                        {Array.isArray((report as any).insights) && (report as any).insights.length > 0 && (
                          <div className="p-4 rounded-lg bg-muted/50 border border-border">
                            <h4 className="font-semibold text-foreground mb-2">Key Insights</h4>
                            <ul className="space-y-2">
                              {(report as any).insights.map((ins: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                                  <Sparkles className="w-3.5 h-3.5 mt-0.5 text-primary flex-shrink-0" />{ins}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" size="sm" onClick={() => handleExport(report)} className="touch-target">
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive touch-target"
                    disabled={deleteMut.isPending}
                    onClick={() => handleDelete(report.id, report.title)}>
                    {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
