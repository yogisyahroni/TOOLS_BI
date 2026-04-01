import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layout, Plus, Upload, Eye, Trash2, Copy, Download, FileText,
  BarChart3, PieChart, Table2, Target, TrendingUp, Layers,
  ChevronRight, Sparkles, Filter, Import, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { builtinTemplates } from '@/lib/builtinTemplates';
import type { ReportTemplate, TemplateCategory, TemplateSource, TemplatePage, TemplateSection } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useReportTemplates, useCreateReportTemplate, useDeleteReportTemplate, useImportTemplate } from '@/hooks/useApi';

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
  const { toast } = useToast();
  const { data: userTemplates = [] } = useReportTemplates();
  
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [viewTemplate, setViewTemplate] = useState<ReportTemplate | null>(null);
  const [importSource, setImportSource] = useState<TemplateSource>('powerbi');
  const fileRef = useRef<HTMLInputElement>(null);

  const createMut = useCreateReportTemplate();
  const deleteMut = useDeleteReportTemplate();
  const importMut = useImportTemplate();

  // Integrated template list: Builtin + User (Migrated)
  const allTemplates: ReportTemplate[] = [
    ...builtinTemplates,
    ...userTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: (t.category as TemplateCategory) || 'custom',
      source: (t.source as TemplateSource) || 'custom',
      isDefault: t.isDefault,
      pages: (typeof t.pages === 'string' ? JSON.parse(t.pages) : (t.pages || [])) as TemplatePage[],
      colorScheme: (t.colorScheme as ReportTemplate['colorScheme']) || { primary: '#2c3e50', secondary: '#3498db', accent: '#e74c3c', background: '#ffffff' },
      createdAt: new Date(t.createdAt),
    })),
  ];

  const filtered = selectedCategory === 'all' 
    ? allTemplates 
    : allTemplates.filter(t => t.category === selectedCategory);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importMut.mutateAsync(file);
      
      // Auto-close dialog on success
      setImportOpen(false);
      
      toast({
        title: "Import Successful",
        description: `Successfully migrated template from ${file.name}.`,
      });
      
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      toast({
        title: "Import Failed",
        description: err?.response?.data?.error || "Error during AI conversion. Please try a different file.",
        variant: "destructive"
      });
    }
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
    
    createMut.mutate({
      name: copy.name,
      description: copy.description,
      category: copy.category,
      source: copy.source,
      pages: copy.pages as unknown[],
      colorScheme: copy.colorScheme as Record<string, string>,
    });
    toast({ title: 'Template duplicated' });
  };

  const exportTemplate = (tpl: ReportTemplate) => {
    const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(tpl.name || 'template').replace(/\s+/g, '_')}.json`; a.click();
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
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Report Templates 
              <HelpTooltip text="Kelola template laporan. Import dari Power BI (.pbix), Tableau (.twb), PPTX, atau JSON. Gunakan template saat generate AI Reports." />
            </h1>
            <p className="text-muted-foreground">Pre-built templates for reports, dashboards & presentations</p>
          </div>
        </div>
      </motion.div>

      {/* Import & Filter Bar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex flex-wrap items-center gap-4">
          <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as TemplateCategory | 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(categoryLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">
                <Import className="h-4 w-4" />
                {importMut.isPending ? 'Processing...' : 'Import Template'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px] overflow-hidden">
              <AnimatePresence>
                {importMut.isPending && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md"
                  >
                    <div className="relative flex flex-col items-center p-8 text-center max-w-sm">
                      <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse" />
                      <Loader2 className="h-12 w-12 text-primary animate-spin mb-6 relative" />
                      <h3 className="text-xl font-bold tracking-tight mb-2 relative">Migrating Template</h3>
                      <p className="text-sm text-muted-foreground mb-6 relative">
                        AI is analyzing your BI metadata and generating the NeuraDash report layout. This usually takes 10-20 seconds.
                      </p>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden relative">
                        <motion.div
                          className="h-full bg-primary"
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <DialogHeader>
                <DialogTitle>Import from BI Tool</DialogTitle>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4 py-6">
                {[
                  { name: 'Power BI', ext: '.pbix', source: 'powerbi', desc: 'Import Power BI Layout' },
                  { name: 'Tableau', ext: '.twbx, .twb', source: 'tableau', desc: 'Import Tableau Workbook' },
                  { name: 'PowerPoint', ext: '.pptx', source: 'pptx', desc: 'Import Presentation Slides' },
                  { name: 'JSON', ext: '.json', source: 'custom', desc: 'Import NeuraDash Template' },
                ].map((tool) => (
                  <button
                    key={tool.name}
                    className="p-4 rounded-xl border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/40 transition-all text-left flex flex-col gap-2 group"
                    onClick={() => { setImportSource(tool.source as TemplateSource); fileRef.current?.click(); }}
                  >
                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center border border-border group-hover:text-primary group-hover:border-primary/30 transition-colors">
                      <Import className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{tool.name}</p>
                      <p className="text-xs text-muted-foreground">{tool.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-primary block mb-0.5">AI-Powered Migration</span>
                  Your file will be extracted and translated by our specialized AI agent. 
                  Visuals, layouts, and mappings will be converted to high-fidelity NeuraDash components.
                </p>
              </div>
              
              <input
                type="file"
                ref={fileRef}
                className="hidden"
                onChange={handleImportFile}
                accept=".pbix,.twbx,.twb,.json,.pptx"
              />
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((tpl, i) => {
          const CatIcon = categoryIcons[tpl.category] || Layout;
          return (
            <motion.div 
              key={tpl.id} 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl border border-border shadow-card hover:shadow-glow transition-all group overflow-hidden"
            >
              {/* Color stripe */}
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${tpl.colorScheme.primary}, ${tpl.colorScheme.accent})` }} />

              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-border" style={{ background: `${tpl.colorScheme.primary}10` }}>
                      <CatIcon className="w-4 h-4" style={{ color: tpl.colorScheme.primary }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-sm leading-tight tracking-tight">{tpl.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                          {categoryLabels[tpl.category]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium opacity-70">
                          {sourceLabels[tpl.source]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 mb-4 h-8">{tpl.description}</p>

                {/* Preview of pages */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tpl.pages.slice(0, 3).map((page) => (
                    <div key={page.id} className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5 border border-border/50">
                      <FileText className="w-2.5 h-2.5" />
                      <span className="truncate max-w-[70px]">{page.title}</span>
                    </div>
                  ))}
                  {tpl.pages.length > 3 && (
                    <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-md px-1.5 py-0.5">
                      +{tpl.pages.length - 3} more
                    </div>
                  )}
                </div>

                {/* Section type icons preview */}
                <div className="flex flex-wrap gap-1 mb-5">
                  {Array.from(new Set(tpl.pages.flatMap(p => p.sections.map(s => s.type)))).slice(0, 5).map(type => {
                    const Icon = sectionTypeIcons[type] || Layout;
                    return (
                      <div key={type} className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center border border-border/30" title={(type || 'unknown').replace(/_/g, ' ')}>
                        <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-border/50">
                  <Button variant="ghost" size="sm" className="h-8 text-xs flex-1 font-medium hover:bg-primary/10 hover:text-primary" onClick={() => setViewTemplate(tpl)}>
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => duplicateTemplate(tpl)} title="Duplicate">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => exportTemplate(tpl)} title="Export JSON">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  {!tpl.isDefault && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteMut.mutate(tpl.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-2xl p-20 border border-border shadow-soft text-center max-w-2xl mx-auto">
          <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
            <Layout className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">No templates found</h3>
          <p className="text-muted-foreground mb-8">Import a file from Power BI, Tableau, or PowerPoint to generate your first custom template using AI.</p>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Import className="h-4 w-4" /> Import Now
          </Button>
        </motion.div>
      )}

      {/* Template Preview Dialog */}
      <Dialog open={!!viewTemplate} onOpenChange={(o) => { if(!o) setViewTemplate(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0 gap-0">
          {viewTemplate && (
            <div className="flex flex-col h-full max-h-[90vh]">
              <div className="p-6 border-b border-border bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-1.5 h-12 rounded-full" style={{ background: viewTemplate.colorScheme.primary }} />
                    <div>
                      <DialogTitle className="text-2xl font-bold tracking-tight">{viewTemplate.name}</DialogTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary">{categoryLabels[viewTemplate.category]}</Badge>
                        <p className="text-sm text-muted-foreground line-clamp-1">{viewTemplate.description}</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="default" className="gap-2" onClick={() => { duplicateTemplate(viewTemplate); setViewTemplate(null); }}>
                    <Plus className="h-4 w-4" /> Use Template
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 bg-muted/10">
                <Tabs defaultValue={viewTemplate.pages[0]?.id}>
                  <TabsList className="w-full justify-start flex-wrap h-auto gap-2 p-1 bg-transparent border-b border-border rounded-none mb-6">
                    {viewTemplate.pages.map((page, i) => (
                      <TabsTrigger 
                        key={page.id} 
                        value={page.id} 
                        className="data-[state=active]:bg-background data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border rounded-lg px-4 py-2 text-sm font-medium transition-all"
                      >
                        {i + 1}. {page.title}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {viewTemplate.pages.map((page) => (
                    <TabsContent key={page.id} value={page.id} className="mt-0 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-lg font-bold">{page.title}</h4>
                          {page.subtitle && <p className="text-sm text-muted-foreground">{page.subtitle}</p>}
                        </div>
                        {page.filters && page.filters.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Filters:</span>
                            <div className="flex gap-1.5">
                              {page.filters.map(f => (
                                <Badge key={f} variant="outline" className="bg-background/50">{f}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Sections layout preview */}
                      <div className="grid grid-cols-12 gap-4">
                        {page.sections.map((section) => {
                          const colSpanValue = section.width === 'full' ? 12 : section.width === 'half' ? 6 : section.width === 'third' ? 4 : 3;
                          const Icon = sectionTypeIcons[section.type] || Layout;
                          const heightClass = section.height === 'lg' ? 'h-48' : section.height === 'sm' ? 'h-24' : 'h-36';

                          return (
                            <div 
                              key={section.id} 
                              className="rounded-xl border border-border/60 bg-card p-4 shadow-sm flex flex-col"
                              style={{ 
                                gridColumn: `span ${colSpanValue}`,
                                minHeight: section.height === 'lg' ? '192px' : section.height === 'sm' ? '96px' : '144px'
                              }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-primary/5 flex items-center justify-center">
                                    <Icon className="w-4 h-4 text-primary/70" />
                                  </div>
                                  <span className="text-sm font-bold truncate max-w-[150px]">{section.title}</span>
                                </div>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize opacity-60">
                                  {(section.type || 'unknown').replace(/_/g, ' ')}
                                </Badge>
                              </div>
                              <div className="flex-1 rounded-lg border border-dashed border-border/50 bg-muted/20 flex items-center justify-center">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold opacity-30">
                                  Visual Preview
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>

              <div className="p-4 border-t border-border bg-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-medium">Color Palette:</span>
                  <div className="flex gap-1.5 p-1 bg-muted/30 rounded-lg border border-border/50">
                    {Object.entries(viewTemplate.colorScheme).map(([key, color]) => (
                      <div key={key} className="w-6 h-6 rounded-md border border-background shadow-sm" style={{ background: color as string }} title={key} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setViewTemplate(null)}>Close</Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => exportTemplate(viewTemplate)}>
                    <Download className="h-4 w-4" /> Export Config
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
