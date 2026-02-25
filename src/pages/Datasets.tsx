import { motion } from 'framer-motion';
import { Database, Trash2, Download, Eye, Calendar, BarChart3 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useState } from 'react';
import type { DataSet } from '@/types/data';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';

export default function Datasets() {
  const { dataSets, removeDataSet } = useDataStore();
  const [selectedDataset, setSelectedDataset] = useState<DataSet | null>(null);
  const { toast } = useToast();

  const handleDelete = (id: string, name: string) => {
    removeDataSet(id);
    toast({
      title: 'Dataset deleted',
      description: `${name} has been removed from your datasets.`,
    });
  };

  const handleExport = (dataSet: DataSet) => {
    const jsonString = JSON.stringify(dataSet.data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataSet.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Export successful',
      description: `${dataSet.name} has been exported as JSON.`,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Database className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Datasets <HelpTooltip text="Daftar semua dataset yang sudah diunggah. Klik Eye untuk preview data, Download untuk ekspor JSON, atau Trash untuk menghapus." /></h1>
            <p className="text-muted-foreground">
              Manage and explore your uploaded data
            </p>
          </div>
        </div>
      </motion.div>

      {/* Datasets Grid */}
      {dataSets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-xl p-12 border border-border shadow-card text-center"
        >
          <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No datasets yet</h3>
          <p className="text-muted-foreground mb-4">
            Upload your first dataset to get started with analysis
          </p>
          <Button asChild>
            <a href="/upload">Upload Data</a>
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dataSets.map((dataSet, index) => (
            <motion.div
              key={dataSet.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                  <Database className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="flex gap-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSelectedDataset(dataSet)}
                      >
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
                            {selectedDataset?.data.slice(0, 10).map((row, i) => (
                              <TableRow key={i}>
                                {selectedDataset.columns.map((col) => (
                                  <TableCell key={col.name}>
                                    {String(row[col.name] ?? '')}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {(selectedDataset?.data.length ?? 0) > 10 && (
                          <p className="text-sm text-muted-foreground text-center mt-4">
                            Showing first 10 of {selectedDataset?.data.length} rows
                          </p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleExport(dataSet)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(dataSet.id, dataSet.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <h3 className="text-lg font-semibold text-foreground mb-1 truncate">
                {dataSet.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">{dataSet.fileName}</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span>{dataSet.rowCount.toLocaleString()} rows</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="w-4 h-4 text-primary" />
                  <span>{dataSet.columns.length} columns</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {formatDistanceToNow(new Date(dataSet.uploadedAt), { addSuffix: true })}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
