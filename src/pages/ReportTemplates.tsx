import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layout, Plus, Upload, Eye, Trash2, Copy, Download, FileText,
  BarChart3, PieChart, Table2, Target, TrendingUp, Layers,
  ChevronRight, Sparkles, Filter, Import,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDataStore } from '@/stores/dataStore';
import { builtinTemplates } from '@/lib/builtinTemplates';
import type { ReportTemplate, TemplateCategory, TemplateSource, TemplatePage, TemplateSection } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

function genId() { return Math.random().toString(36).substring(2, 12); }

const categoryIcons: Record<TemplateCategory, any> = {
  executive: Target, operational: Layers, client: FileText, performance: TrendingUp,
  financial: BarChart3, logistics: Import, sales: PieChart, custom: Layout,
};

const categoryLabels: Record<TemplateCategory, string> = {
  executive: 'Executive', operational: 'Operational', client: 'Client-Facing', performance: 'Performance',
  financial: 'Financial', logistics: 'Logistics', sales: 'Sales', custom: 'Custom',
};

const sourceLabels: Record<TemplateSource, string> = {
  builtin: 'Built-in', powerbi: 'Power BI', tableau: 'Tableau', metabase: 'Metabase', pptx: 'PPTX', custom: 'Custom',
};

const sectionTypeIcons: Record<string, any> = {
  kpi_cards: Target, bar_chart: BarChart3, line_chart: TrendingUp, pie_chart: PieChart,
  donut_chart: PieChart, table: Table2, pivot_table: Table2, text: FileText,
  filter_panel: Filter, stacked_bar: BarChart3, horizontal_bar: BarChart3, trend_line: TrendingUp, geo_map: Layout,
};

export default function ReportTemplates() {
  const { templates, addTemplate, removeTemplate } = useDataStore();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewTemplate, setViewTemplate] = useState<ReportTemplate | null>(null);
  const [importSource, setImportSource] = useState<TemplateSource>('powerbi');
  const fileRef = useRef<HTMLInputElement>(null);

  const allTemplates = [...builtinTemplates, ...templates];
  const filtered = selectedCategory === 'all' ? allTemplates : allTemplates.filter(t => t.category === selectedCategory);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        let template: ReportTemplate;

        if (ext === 'json') {
          const parsed = JSON.parse(ev.target?.result as string);
          template = {
            ...parsed,
            id: genId(),
            source: parsed.source || importSource,
            createdAt: new Date(),
            isDefault: false,
          };
        } else if (ext === 'pptx' || ext === 'ppt') {
          // PPTX parsing placeholder — in production, backend parses slides
          template = {
            id: genId(),
            name: file.name.replace(/\.(pptx?|ppt)$/i, ''),
            description: `Imported from ${file.name}. Slide structure will be parsed by backend.`,
            category: 'custom',
            source: 'pptx',
            pages: [{
              id: genId(), title: 'Slide 1 (Imported)',
              sections: [
                { id: genId(), type: 'text', title: 'Content from PPTX', width: 'full', config: { content: 'Imported from PPTX. Connect Go backend for full slide parsing with charts, tables, and images.' } },
              ],
            }],
            colorScheme: { primary: '#2c3e50', secondary: '#3498db', accent: '#e74c3c', background: '#ffffff' },
            createdAt: new Date(),
          };
        } else if (ext === 'pbix' || ext === 'twb' || ext === 'twbx') {
          // Power BI / Tableau file — backend needed
          const source: TemplateSource = ext === 'pbix' ? 'powerbi' : 'tableau';
          template = {
            id: genId(),
            name: file.name.replace(/\.(pbix|twbx?|twb)$/i, ''),
            description: `Imported from ${sourceLabels[source]}. Full parsing requires Go backend.`,
            category: 'custom',
            source,
            pages: [{
              id: genId(), title: `Page 1 (${sourceLabels[source]})`,
              sections: [
                { id: genId(), type: 'text', title: `${sourceLabels[source]} Import`, width: 'full', config: { content: `Template structure imported from ${file.name}. Connect Go backend for full visual/measure extraction.` } },
              ],
            }],
            colorScheme: { primary: '#1e3a5f', secondary: '#f0c929', accent: '#4a90d9', background: '#ffffff' },
            createdAt: new Date(),
          };
        } else {
          toast({ title: 'Unsupported format', description: 'Supports: JSON, PPTX, PBIX, TWB/TWBX', variant: 'destructive' });
          return;
        }

        addTemplate(template);
        toast({ title: 'Template imported', description: `"${template.name}" added successfully.` });
      } catch (err) {
        toast({ title: 'Import error', description: 'Failed to parse template file.', variant: 'destructive' });
      }
    };

    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const duplicateTemplate = (tpl: ReportTemplate) => {
    const copy: ReportTemplate = {
      ...JSON.parse(JSON.stringify(tpl)),
      id: genId(),
      name: `${tpl.name} (Copy)`,
      source: 'custom' as TemplateSource,
      isDefault: false,
      createdAt: new Date(),
    };
    addTemplate(copy);
    toast({ title: 'Template duplicated' });
  };

  const exportTemplate = (tpl: ReportTemplate) => {
    const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tpl.name.replace(/\s+/g, '_')}.json`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Template exported' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Layout className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Report Templates <HelpTooltip text="Kelola template laporan. Import dari Power BI (.pbix), Tableau (.twb), PPTX, atau JSON. Gunakan template saat generate AI Reports." /></h1>
            <p className="text-muted-foreground">Pre-built templates for reports, dashboards & presentations</p>
          </div>
        </div>
      </motion.div>

      {/* Import & Filter Bar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex flex-wrap items-center gap-4">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(categoryLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <input ref={fileRef} type="file" accept=".json,.pptx,.ppt,.pbix,.twb,.twbx" className="hidden" onChange={handleImportFile} />

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="w-4 h-4 mr-2" /> Import Template</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Import Template</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Import template dari berbagai sumber:</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { source: 'powerbi' as TemplateSource, label: 'Power BI (.pbix)', desc: 'Import layout dari Power BI Desktop' },
                    { source: 'tableau' as TemplateSource, label: 'Tableau (.twb/.twbx)', desc: 'Import workbook Tableau' },
                    { source: 'pptx' as TemplateSource, label: 'PowerPoint (.pptx)', desc: 'Import slide presentation' },
                    { source: 'custom' as TemplateSource, label: 'JSON Template', desc: 'Import DataLens template' },
                  ]).map(item => (
                    <button key={item.source}
                      onClick={() => { setImportSource(item.source); fileRef.current?.click(); }}
                      className="p-4 rounded-lg border border-border bg-muted/50 hover:bg-primary/10 hover:border-primary/30 transition-all text-left">
                      <p className="font-medium text-foreground text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                    </button>
                  ))}
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground">
                    <Sparkles className="w-3 h-3 inline mr-1" />
                    Parsing penuh file PBIX, TWB, dan PPTX memerlukan Go backend. Saat ini, metadata template akan diekstrak dan struktur layout dibuat otomatis.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((tpl, i) => {
          const CatIcon = categoryIcons[tpl.category] || Layout;
          return (
            <motion.div key={tpl.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl border border-border shadow-card hover:shadow-glow transition-all group">
              {/* Color stripe */}
              <div className="h-2 rounded-t-xl" style={{ background: `linear-gradient(90deg, ${tpl.colorScheme.primary}, ${tpl.colorScheme.accent})` }} />

              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${tpl.colorScheme.primary}20` }}>
                      <CatIcon className="w-4 h-4" style={{ color: tpl.colorScheme.primary }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm leading-tight">{tpl.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{categoryLabels[tpl.category]}</Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{sourceLabels[tpl.source]}</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{tpl.description}</p>

                {/* Mini preview of pages */}
                <div className="flex items-center gap-1.5 mb-3">
                  {tpl.pages.map((page, pi) => (
                    <div key={page.id} className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                      <FileText className="w-2.5 h-2.5" />
                      <span className="truncate max-w-[80px]">{page.title}</span>
                    </div>
                  ))}
                </div>

                {/* Section type icons preview */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {Array.from(new Set(tpl.pages.flatMap(p => p.sections.map(s => s.type)))).slice(0, 6).map(type => {
                    const Icon = sectionTypeIcons[type] || Layout;
                    return (
                      <div key={type} className="w-6 h-6 rounded bg-muted/50 flex items-center justify-center" title={type.replace(/_/g, ' ')}>
                        <Icon className="w-3 h-3 text-muted-foreground" />
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-3 border-t border-border">
                  <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setViewTemplate(tpl)}>
                    <Eye className="w-3 h-3 mr-1" /> Preview
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => duplicateTemplate(tpl)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => exportTemplate(tpl)}>
                    <Download className="w-3 h-3" />
                  </Button>
                  {!tpl.isDefault && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => { removeTemplate(tpl.id); toast({ title: 'Template deleted' }); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Layout className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No templates found</h3>
          <p className="text-muted-foreground">Import or duplicate a template to get started</p>
        </motion.div>
      )}

      {/* Template Preview Dialog */}
      <Dialog open={!!viewTemplate} onOpenChange={(o) => !o && setViewTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          {viewTemplate && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-10 rounded" style={{ background: viewTemplate.colorScheme.primary }} />
                  <div>
                    <DialogTitle>{viewTemplate.name}</DialogTitle>
                    <p className="text-sm text-muted-foreground mt-1">{viewTemplate.description}</p>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue={viewTemplate.pages[0]?.id}>
                <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
                  {viewTemplate.pages.map((page, i) => (
                    <TabsTrigger key={page.id} value={page.id} className="text-xs">
                      {i + 1}. {page.title}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {viewTemplate.pages.map((page) => (
                  <TabsContent key={page.id} value={page.id} className="space-y-4">
                    {page.subtitle && <p className="text-sm text-muted-foreground">{page.subtitle}</p>}

                    {/* Filters */}
                    {page.filters && page.filters.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Filter className="w-3 h-3" /> Filters:</span>
                        {page.filters.map(f => (
                          <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Sections layout preview */}
                    <div className="grid grid-cols-12 gap-3">
                      {page.sections.map((section) => {
                        const colSpan = section.width === 'full' ? 12 : section.width === 'half' ? 6 : section.width === 'third' ? 4 : 3;
                        const Icon = sectionTypeIcons[section.type] || Layout;
                        const heightClass = section.height === 'lg' ? 'min-h-[140px]' : section.height === 'sm' ? 'min-h-[60px]' : 'min-h-[100px]';

                        return (
                          <div key={section.id} className={`col-span-${colSpan} rounded-lg border border-border/60 bg-muted/30 p-3 ${heightClass}`}
                            style={{ gridColumn: `span ${colSpan}` }}>
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-foreground">{section.title}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                {section.type.replace(/_/g, ' ')}
                              </Badge>
                              {section.width !== 'full' && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">{section.width}</Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              <div className="flex items-center gap-2 pt-3 border-t border-border">
                <div className="flex gap-1">
                  {Object.entries(viewTemplate.colorScheme).map(([key, color]) => (
                    <div key={key} className="w-6 h-6 rounded border border-border" style={{ background: color }} title={key} />
                  ))}
                </div>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => { duplicateTemplate(viewTemplate); setViewTemplate(null); }}>
                  <Copy className="w-4 h-4 mr-1" /> Use Template
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
