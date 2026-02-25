import { motion } from 'framer-motion';
import { FileText, Download, Trash2, Calendar, Eye, ExternalLink } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { Report } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

export default function Reports() {
  const { reports, removeReport, dataSets } = useDataStore();
  const { toast } = useToast();

  const handleDelete = (id: string, title: string) => {
    removeReport(id);
    toast({
      title: 'Report deleted',
      description: `${title} has been removed.`,
    });
  };

  const handleExport = (report: Report) => {
    const content = `# ${report.title}\n\n${report.content}\n\n## Story\n${report.story}\n\n## Decisions\n${report.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n## Recommendations\n${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
    
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Export successful',
      description: `${report.title} has been exported as Markdown.`,
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
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Reports <HelpTooltip text="Lihat semua laporan yang sudah dibuat oleh AI Reports. Klik untuk melihat detail, ekspor sebagai Markdown, atau hapus." /></h1>
            <p className="text-muted-foreground">
              View and manage your generated reports
            </p>
          </div>
        </div>
      </motion.div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-xl p-12 border border-border shadow-card text-center"
        >
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No reports yet</h3>
          <p className="text-muted-foreground mb-4">
            Generate your first AI-powered report to see it here
          </p>
          <Button asChild>
            <a href="/ai-reports">Generate Report</a>
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {reports.map((report, index) => {
            const dataset = dataSets.find((ds) => ds.id === report.dataSetId);
            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{report.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                        </span>
                        {dataset && (
                          <span className="flex items-center gap-1">
                            <ExternalLink className="w-4 h-4" />
                            {dataset.name}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-3 line-clamp-2">
                        {report.content.substring(0, 200)}...
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                        <DialogHeader>
                          <DialogTitle>{report.title}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6">
                          <div className="prose prose-invert max-w-none">
                            <div className="whitespace-pre-wrap text-foreground/90">
                              {report.content}
                            </div>
                          </div>
                          
                          <div className="p-4 rounded-lg bg-muted/50">
                            <h4 className="font-semibold text-foreground mb-2">Story</h4>
                            <p className="text-muted-foreground">{report.story}</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-semibold text-foreground mb-2">Decisions</h4>
                              <ul className="space-y-1 text-sm text-muted-foreground">
                                {report.decisions.map((d, i) => (
                                  <li key={i}>{i + 1}. {d}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4 className="font-semibold text-foreground mb-2">Recommendations</h4>
                              <ul className="space-y-1 text-sm text-muted-foreground">
                                {report.recommendations.map((r, i) => (
                                  <li key={i}>{i + 1}. {r}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport(report)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(report.id, report.title)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
