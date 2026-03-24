import { motion } from 'framer-motion';
import { Database, Trash2, Download, Eye, Calendar, BarChart3, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useDatasets, useDeleteDataset, useDatasetData } from '@/hooks/useApi';
import type { DatasetItem } from '@/lib/api';

export default function Datasets() {
  const { data: datasets = [], isLoading, isError, refetch } = useDatasets();
  const deleteMut = useDeleteDataset();
  const [selectedDataset, setSelectedDataset] = useState<DatasetItem | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'uploads' | 'pipelines' | 'ai'>('all');
  const { toast } = useToast();

  const filteredDatasets = useMemo(() => {
    return datasets.filter((ds) => {
      if (activeTab === 'all') return true;
      const isPipeline = ds.name.endsWith('(Result)') || ds.fileName?.endsWith('_output.sql');
      const isAI = ds.name.endsWith('(AI Generated)');
      
      if (activeTab === 'pipelines') return isPipeline;
      if (activeTab === 'ai') return isAI;
      if (activeTab === 'uploads') return !isPipeline && !isAI;
      return true;
    });
  }, [datasets, activeTab]);

  // Lazy-load preview data when a dataset is selected in the dialog
  const { data: previewResult } = useDatasetData(selectedDataset?.id ?? '', { page: 1, limit: 50 });
  const previewData = previewResult?.data ?? [];

  const handleDelete = (id: string, name: string) => {
    deleteMut.mutate(id, {
      onSuccess: () => toast({ title: 'Dataset deleted', description: `${name} has been removed.` }),
      onError: () => toast({ title: 'Error', description: 'Failed to delete dataset.', variant: 'destructive' }),
    });
  };

  const handleExport = (ds: DatasetItem) => {
    toast({ title: 'Exporting…', description: 'Downloading dataset as JSON.' });
    const url = `${import.meta.env.VITE_API_URL}/datasets/${ds.id}/data?limit=100000`;
    window.open(url, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive font-medium">Failed to load datasets.</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
            <Database className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              Datasets <HelpTooltip text="Daftar semua dataset yang sudah diunggah. Klik Eye untuk preview data, Download untuk ekspor, atau Trash untuk menghapus." />
            </h1>
            <p className="text-muted-foreground text-sm lg:text-base">Manage and explore your uploaded data</p>
          </div>
          <div className="sm:ml-auto">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto touch-target">
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full overflow-x-auto pb-2">
          <TabsList className="bg-card border border-border inline-flex min-w-max">
            <TabsTrigger value="all">All Datasets</TabsTrigger>
            <TabsTrigger value="uploads">Uploaded Data</TabsTrigger>
            <TabsTrigger value="pipelines">Pipeline Results</TabsTrigger>
            <TabsTrigger value="ai">AI Generated</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Datasets Grid */}
      {datasets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-xl p-8 lg:p-12 border border-border shadow-card text-center"
        >
          <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No datasets yet</h3>
          <p className="text-muted-foreground mb-4">Upload your first dataset to get started with analysis</p>
          <Button asChild className="touch-target"><a href="/upload">Upload Data</a></Button>
        </motion.div>
      ) : filteredDatasets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-xl p-8 lg:p-12 border border-border shadow-card text-center"
        >
          <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No datasets found</h3>
          <p className="text-muted-foreground mb-4">There are no datasets in this category.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {filteredDatasets.map((ds, index) => (
            <motion.div
              key={ds.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all duration-300 group flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                  <Database className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="flex gap-1">
                  {/* Preview dialog */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDataset(ds)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                      <DialogHeader>
                        <DialogTitle>{selectedDataset?.name}</DialogTitle>
                      </DialogHeader>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {selectedDataset?.columns.map((col) => (
                                <TableHead key={col.name}>{col.name}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewData.slice(0, 10).map((row, i) => (
                              <TableRow key={i}>
                                {(selectedDataset?.columns ?? []).map((col) => (
                                  <TableCell key={col.name}>{String(row[col.name] ?? '')}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {previewData.length === 0 && (
                          <p className="text-center text-muted-foreground py-8">No data available for preview.</p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleExport(ds)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(ds.id, ds.name)}
                    disabled={deleteMut.isPending}
                  >
                    {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1 truncate" title={ds.name}>{ds.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 truncate" title={ds.fileName}>{ds.fileName}</p>
              
              {/* Type Badge */}
              <div className="mb-4">
                {ds.name.endsWith('(Result)') || ds.fileName?.endsWith('_output.sql') ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    Pipeline Result
                  </span>
                ) : ds.name.endsWith('(AI Generated)') ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20">
                    AI Generated
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                    Uploaded Data
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span>{ds.rowCount.toLocaleString()} rows</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="w-4 h-4 text-primary" />
                  <span>{ds.columns.length} columns</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{formatDistanceToNow(new Date(ds.createdAt), { addSuffix: true })}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
