import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FileText, 
    Search, 
    Calendar, 
    Trash2, 
    ChevronRight,
    Loader2,
    Database,
    Clock
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';
import type { Report } from '@/types/data';
import { useDeleteReport } from '@/hooks/useApi';
import { useToast } from '@/hooks/use-toast';

interface ReportHistoryProps {
    reports: Report[];
    isLoading: boolean;
    onSelect: (report: Report) => void;
    selectedId?: string;
}

export function ReportHistory({ reports, isLoading, onSelect, selectedId }: ReportHistoryProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const deleteMutation = useDeleteReport();
    const { toast } = useToast();

    const filteredReports = reports
        .filter(r => 
            r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.content.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Delete this report?')) {
            try {
                await deleteMutation.mutateAsync(id);
                toast({ title: 'Report deleted' });
            } catch (err) {
                toast({ title: 'Delete failed', variant: 'destructive' });
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20">
                <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-primary" /> Riwayat Laporan
                </h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                        placeholder="Cari laporan..." 
                        className="pl-9 bg-background/50 h-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar min-h-[400px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mb-2" />
                        <p className="text-sm">Memuat riwayat...</p>
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
                        <FileText className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">Belum ada laporan ditemukan.</p>
                    </div>
                ) : (
                    filteredReports.map((report) => (
                        <motion.button
                            key={report.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={() => onSelect(report)}
                            className={cn(
                                "w-full text-left p-3 rounded-lg transition-all group relative",
                                selectedId === report.id 
                                    ? "bg-primary/10 border-primary/20" 
                                    : "hover:bg-muted/50 border-transparent"
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h4 className={cn(
                                        "text-sm font-medium truncate mb-1",
                                        selectedId === report.id ? "text-primary" : "text-foreground"
                                    )}>
                                        {report.title}
                                    </h4>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(report.createdAt).toLocaleDateString()}
                                        </span>
                                        <span className="flex items-center gap-1 truncate">
                                            <Database className="w-3 h-3" />
                                            Dataset: {report.datasetId.slice(0, 8)}...
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => handleDelete(e, report.id)}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </div>
                            </div>
                            {selectedId === report.id && (
                                <motion.div 
                                    layoutId="active-indicator"
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/4 bg-primary rounded-r-full"
                                />
                            )}
                        </motion.button>
                    ))
                )}
            </div>
        </div>
    );
}
