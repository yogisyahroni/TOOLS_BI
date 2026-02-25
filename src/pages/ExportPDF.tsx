import { useState } from 'react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { motion } from 'framer-motion';
import { FileDown, Download } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function ExportPDF() {
  const { dataSets, reports, dashboards } = useDataStore();
  const { toast } = useToast();
  const [exportType, setExportType] = useState<'dataset' | 'report' | 'dashboard'>('dataset');
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);

  const items = exportType === 'dataset'
    ? dataSets.map(d => ({ id: d.id, name: d.name }))
    : exportType === 'report'
    ? reports.map(r => ({ id: r.id, name: r.title }))
    : dashboards.map(d => ({ id: d.id, name: d.name }));

  const handleExport = () => {
    if (!selectedId) { toast({ title: 'Select an item to export', variant: 'destructive' }); return; }

    let content = '';
    const exportTitle = title || items.find(i => i.id === selectedId)?.name || 'Export';

    if (exportType === 'dataset') {
      const ds = dataSets.find(d => d.id === selectedId);
      if (!ds) return;
      content = `# ${exportTitle}\n\nGenerated: ${new Date().toLocaleString()}\n\n## Data Summary\n- Rows: ${ds.rowCount}\n- Columns: ${ds.columns.length}\n- Size: ${(ds.size / 1024).toFixed(1)} KB\n\n## Columns\n${ds.columns.map(c => `- **${c.name}** (${c.type})`).join('\n')}\n\n## Data Preview\n\n| ${ds.columns.map(c => c.name).join(' | ')} |\n| ${ds.columns.map(() => '---').join(' | ')} |\n${ds.data.slice(0, 100).map(r => `| ${ds.columns.map(c => r[c.name] ?? '').join(' | ')} |`).join('\n')}\n`;
      if (includeSummary) {
        const numCols = ds.columns.filter(c => c.type === 'number');
        if (numCols.length > 0) {
          content += '\n## Statistics\n';
          numCols.forEach(col => {
            const vals = ds.data.map(r => Number(r[col.name])).filter(v => !isNaN(v));
            if (vals.length > 0) {
              const sum = vals.reduce((a, b) => a + b, 0);
              content += `\n### ${col.name}\n- Sum: ${sum.toLocaleString()}\n- Avg: ${(sum / vals.length).toFixed(2)}\n- Min: ${Math.min(...vals)}\n- Max: ${Math.max(...vals)}\n`;
            }
          });
        }
      }
    } else if (exportType === 'report') {
      const report = reports.find(r => r.id === selectedId);
      if (!report) return;
      content = `# ${exportTitle}\n\nGenerated: ${new Date().toLocaleString()}\n\n${report.content}\n\n## Key Decisions\n${report.decisions.map(d => `- ${d}`).join('\n')}\n\n## Recommendations\n${report.recommendations.map(r => `- ${r}`).join('\n')}`;
    } else {
      const dash = dashboards.find(d => d.id === selectedId);
      if (!dash) return;
      content = `# ${exportTitle}\n\nGenerated: ${new Date().toLocaleString()}\n\n## Dashboard: ${dash.name}\n\n### Widgets (${dash.widgets.length})\n${dash.widgets.map(w => `- **${w.title}** — ${w.type} chart (${w.width})`).join('\n')}`;
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${exportTitle.replace(/\s+/g, '_')}.md`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: 'Export downloaded', description: `${exportTitle}.md` });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <FileDown className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Export & Download <HelpTooltip text="Ekspor dataset sebagai CSV/JSON/Excel, atau ekspor laporan dan chart sebagai file untuk distribusi." /></h1>
            <p className="text-muted-foreground">Export datasets, reports, and dashboards</p>
          </div>
        </div>
      </motion.div>

      <div className="max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-5">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Export Type</label>
              <div className="flex gap-2">
                {(['dataset', 'report', 'dashboard'] as const).map(t => (
                  <Button key={t} variant={exportType === t ? 'default' : 'outline'} size="sm"
                    onClick={() => { setExportType(t); setSelectedId(''); }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Select {exportType}</label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder={`Choose ${exportType}`} /></SelectTrigger>
                <SelectContent>
                  {items.length === 0 && <SelectItem value="none" disabled>No {exportType}s</SelectItem>}
                  {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Custom Title (optional)</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Export title" className="bg-muted/50 border-border" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground">Include Statistics Summary</label>
                <Switch checked={includeSummary} onCheckedChange={setIncludeSummary} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground">Include Chart References</label>
                <Switch checked={includeCharts} onCheckedChange={setIncludeCharts} />
              </div>
            </div>

            <Button onClick={handleExport} className="w-full gradient-primary text-primary-foreground" disabled={!selectedId}>
              <Download className="w-4 h-4 mr-1" /> Export as Markdown
            </Button>

            <p className="text-xs text-muted-foreground text-center">Tip: Open the .md file in any Markdown viewer or convert to PDF using tools like Pandoc</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
