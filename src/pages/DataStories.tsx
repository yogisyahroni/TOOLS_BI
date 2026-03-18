import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Sparkles, Loader2, Trash2, Eye, Plus, Share2, Download, ChevronLeft, ChevronRight, PieChart, BarChart3, LineChart, AreaChart, ScatterChart as ScatterIcon, Radar, TrendingUp, Grid3X3, Flame, Box, LayoutGrid as LayoutGridIcon, Gauge, SunMedium, Network, Combine, Edit2, Zap, Type, Heading1 } from 'lucide-react';
import { usePDF } from 'react-to-pdf';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useStories, useCreateStory, useDeleteStory, useDatasets, useGenerateReport, useCharts } from '@/hooks/useApi';
import type { DataStory } from '@/lib/api';

import { SlideBuilder, Slide } from '@/components/SlideBuilder';

// Helper to parse story content
const parseStoryContent = (content: string): Slide[] => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
      return parsed as Slide[];
    }
  } catch (e) {
    // If not JSON or invalid format, return as single slide
  }
  return [
    {
      id: crypto.randomUUID(),
      title: 'Story',
      content: content || ''
    }
  ];
};

// Add WIDGET_TYPES array for mapping icons easily
const WIDGET_TYPES = [
  { id: 'bar', icon: BarChart3 },
  { id: 'horizontal_bar', icon: BarChart3 },
  { id: 'line', icon: LineChart },
  { id: 'pie', icon: PieChart },
  { id: 'area', icon: AreaChart },
  { id: 'scatter', icon: ScatterIcon },
  { id: 'radar', icon: Radar },
  { id: 'funnel', icon: TrendingUp },
  { id: 'treemap', icon: Grid3X3 },
  { id: 'waterfall', icon: BarChart3 },
  { id: 'heatmap', icon: Flame },
  { id: 'boxplot', icon: Box },
  { id: 'stat', icon: LayoutGridIcon },
  { id: 'gauge', icon: Gauge },
  { id: 'sunburst', icon: SunMedium },
  { id: 'sankey', icon: Network },
  { id: 'combo', icon: Combine },
  { id: 'text', icon: Edit2 },
  { id: 'action', icon: Zap },
];

export default function DataStories() {
  const { data: stories = [], isLoading } = useStories();
  const { data: datasets = [] } = useDatasets();
  const { data: savedCharts = [] } = useCharts(); // Load Saved Charts
  const createMut = useCreateStory();
  const deleteMut = useDeleteStory();
  const generateMut = useGenerateReport();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toPDF, targetRef } = usePDF({ filename: 'DataStory.pdf' });

  // AI generate mode
  const [selectedDsId, setSelectedDsId] = useState('');
  const [storyFocus, setStoryFocus] = useState('');

  // Manual create mode
  const [isComposing, setIsComposing] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [slides, setSlides] = useState<Slide[]>([{ id: crypto.randomUUID(), title: 'Slide 1', content: '' }]);

  // View dialog
  const [viewStory, setViewStory] = useState<DataStory | null>(null);
  const [currentViewSlideIndex, setCurrentViewSlideIndex] = useState(0);

  useEffect(() => {
    const sId = searchParams.get('storyId');
    if (sId && stories.length > 0) {
      const found = stories.find(s => s.id === sId);
      if (found && (!viewStory || viewStory.id !== found.id)) {
        setViewStory(found);
      }
    }
  }, [searchParams, stories]);

  useEffect(() => {
    if (viewStory) setCurrentViewSlideIndex(0);
  }, [viewStory]);

  const handleShare = (e: React.MouseEvent, storyId: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}/stories?storyId=${storyId}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: 'Story link copied to clipboard.' });
  };

  const handleGenerateAI = async () => {
    if (!selectedDsId) { toast({ title: 'Select a dataset first', variant: 'destructive' }); return; }
    try {
      const result = await generateMut.mutateAsync({ datasetId: selectedDsId, prompt: storyFocus || undefined });
      // The AI might just return raw markdown. We construct a single slide for it.
      const aiSlides: Slide[] = [{
        id: crypto.randomUUID(),
        title: result.title || 'AI Story',
        content: result.content
      }];
      
      await createMut.mutateAsync({ title: result.title, content: JSON.stringify(aiSlides), datasetId: selectedDsId });
      toast({ title: 'Story generated!', description: 'AI data story created and saved.' });
      setStoryFocus('');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to generate story.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const handleCreateManual = async () => {
    if (!manualTitle || slides.length === 0) { toast({ title: 'Title and content required', variant: 'destructive' }); return; }
    
    // Check if at least one slide has content
    const hasContent = slides.some(s => s.content && s.content.trim() !== '' && s.content !== '<p></p>');
    if (!hasContent) {
      toast({ title: 'Add some content to your slides', variant: 'destructive' }); 
      return;
    }

    try {
      await createMut.mutateAsync({ title: manualTitle, content: JSON.stringify(slides) });
      setManualTitle(''); 
      setSlides([{ id: crypto.randomUUID(), title: 'Slide 1', content: '' }]);
      setIsComposing(false);
      toast({ title: 'Story created' });
    } catch {
      toast({ title: 'Error', description: 'Failed to create story.', variant: 'destructive' });
    }
  };

  if (isComposing) {
    return (
      <div className="h-full flex flex-col p-6 space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" /> Story Builder
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Design your narrative layout</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsComposing(false)}>Cancel</Button>
            <Button onClick={handleCreateManual} disabled={createMut.isPending || !manualTitle}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Save Presentation
            </Button>
          </div>
        </div>

        <div className="flex flex-col space-y-4 flex-1 min-h-[500px]">
          <Input
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Presentation Title..."
            className="text-xl md:text-2xl font-semibold px-4 py-6 border border-border shadow-sm bg-card hover:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/50 transition-colors"
          />
          <div className="flex flex-1 gap-4 overflow-hidden">
            {/* Center Area: Slide Builder */}
            <div className="flex-[3] rounded-xl shadow-sm bg-background border border-border overflow-hidden">
              <SlideBuilder slides={slides} onChange={setSlides} />
            </div>
            
            {/* RIGHT PANEL: Saved Charts Library */}
            <div className="flex-1 max-w-[300px] border border-border bg-card/80 backdrop-blur-sm hidden md:flex flex-col shadow-sm z-30 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border font-semibold flex items-center justify-between text-foreground">
                <div className="flex items-center gap-2">
                  <LayoutGridIcon className="w-4 h-4 text-primary" /> Elements
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Text Widgets */}
                <div>
                   <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Text Blocks</h4>
                   <div className="space-y-2">
                     <div
                        className="bg-background rounded-lg border border-border/50 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-border/80 group cursor-grab active:cursor-grabbing"
                        draggable={true}
                        unselectable="on"
                        onDragStart={(e) => {
                          const dragData = { source: 'text-element', type: 'heading' };
                          e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                     >
                        <div className="p-2.5 flex items-center gap-3">
                           <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                             <Heading1 className="w-4 h-4 text-primary" />
                           </div>
                           <span className="text-sm font-medium text-foreground">Heading Text</span>
                        </div>
                     </div>
                     <div
                        className="bg-background rounded-lg border border-border/50 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-border/80 group cursor-grab active:cursor-grabbing"
                        draggable={true}
                        unselectable="on"
                        onDragStart={(e) => {
                          const dragData = { source: 'text-element', type: 'paragraph' };
                          e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                     >
                        <div className="p-2.5 flex items-center gap-3">
                           <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                             <Type className="w-4 h-4 text-primary" />
                           </div>
                           <span className="text-sm font-medium text-foreground">Paragraph</span>
                        </div>
                     </div>
                   </div>
                </div>

                <div className="h-px bg-border my-2" />

                <div>
                   <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Saved Charts</h4>
                {savedCharts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-background rounded-xl border border-dashed border-border shadow-sm mt-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 shadow-inner">
                      <PieChart className="w-6 h-6 text-primary/70" />
                    </div>
                    <h4 className="text-sm font-semibold text-foreground mb-1.5">Belum Ada Chart</h4>
                    <p className="text-xs text-muted-foreground mb-5 leading-relaxed">Buat chart terlebih dahulu di Data Explorer.</p>
                  </div>
                ) : (
                  savedCharts.map((chart: any) => {
                    const Icon = WIDGET_TYPES.find(wt => wt.id === chart.type)?.icon || BarChart3;
                    return (
                      <div
                        key={chart.id}
                        className="bg-background rounded-xl border border-border/50 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-border/80 group cursor-grab active:cursor-grabbing"
                        draggable={true}
                        unselectable="on"
                        onDragStart={(e) => {
                          const dragData = {
                            source: 'saved-chart',
                            chartId: chart.id,
                            title: chart.title,
                            type: chart.type,
                            datasetId: chart.datasetId,
                            xAxis: chart.xAxis,
                            yAxis: chart.yAxis,
                            groupBy: chart.groupBy
                          };
                          e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                      >
                        <div className="p-3 flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-foreground truncate" title={chart.title}>{chart.title}</h4>
                            <p className="text-[10px] text-muted-foreground truncate">{chart.type} • {chart.xAxis}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // Render view story mode
  const viewSlides = viewStory ? parseStoryContent(viewStory.content) : [];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Data Stories <HelpTooltip text="Buat presentasi interaktif dengan data Anda. Anda bisa menambahkan multi-slide dan layout kaya visual." />
            </h1>
            <p className="text-muted-foreground">Interactive narrative presentations</p>
          </div>
        </div>
      </motion.div>

      {/* Create controls */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Generate New Story
        </h3>
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Dataset</Label>
            <Select value={selectedDsId} onValueChange={setSelectedDsId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>{datasets.map((ds) => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Focus area (optional)</Label>
            <Input placeholder="e.g. sales trends, top performers" value={storyFocus} onChange={(e) => setStoryFocus(e.target.value)} className="w-64" />
          </div>
          <Button onClick={handleGenerateAI} disabled={!selectedDsId || generateMut.isPending || createMut.isPending}>
            {(generateMut.isPending || createMut.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate with AI
          </Button>
          <div className="px-2 font-medium text-muted-foreground">or</div>
          <Button variant="default" onClick={() => setIsComposing(true)}>
            <Plus className="w-4 h-4 mr-2" />Create Presentation
          </Button>
        </div>
      </motion.div>

      {/* Stories grid */}
      {stories.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No stories yet</h3>
          <p className="text-muted-foreground">Create a new presentation or ask AI to generate one from your data</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stories.map((story, i) => {
            const parsedSlides = parseStoryContent(story.content);
            const firstSlidePreview = parsedSlides[0]?.content?.replace(/<[^>]+>/g, '').substring(0, 150) || 'Empty story';

            return (
            <motion.div key={story.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1 line-clamp-1" title={story.title}>{story.title}</h3>
                    <div className="text-xs text-muted-foreground">{parsedSlides.length} Slide{parsedSlides.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                
                <div className="flex gap-1 ml-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewStory(story)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl w-[90vw] h-[85vh] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
                      <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-border bg-card shrink-0">
                        <DialogTitle className="text-xl font-bold truncate pr-4">{viewStory?.title}</DialogTitle>
                        <div className="pr-6">
                          <Button variant="outline" size="sm" onClick={() => toPDF()} className="hidden md:flex whitespace-nowrap">
                            <Download className="w-4 h-4 mr-2" /> Export to PDF
                          </Button>
                        </div>
                      </DialogHeader>
                      
                      <div className="flex-1 bg-muted/20 relative flex flex-col overflow-hidden" ref={targetRef}>
                        {/* Slide Viewport */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-center">
                          {viewSlides.length > 0 && (
                            <div className="w-full max-w-[1200px] bg-card border border-border shadow-lg rounded-xl overflow-hidden min-h-[400px] flex flex-col transition-all">
                              <div className="border-b border-border bg-muted/10 p-4">
                                <h2 className="text-2xl font-bold text-foreground">{viewSlides[currentViewSlideIndex]?.title}</h2>
                              </div>
                              <div className="p-6 md:p-10 flex-1 prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-img:rounded-xl">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                  {viewSlides[currentViewSlideIndex]?.content || ''}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Navigation Controls */}
                        {viewSlides.length > 1 && (
                          <div className="h-16 bg-card border-t border-border flex items-center justify-between px-6 shrink-0">
                            <Button 
                              variant="outline" 
                              onClick={() => setCurrentViewSlideIndex(Math.max(0, currentViewSlideIndex - 1))}
                              disabled={currentViewSlideIndex === 0}
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                            </Button>
                            
                            <div className="flex items-center gap-2 overflow-x-auto max-w-[50%]">
                              {viewSlides.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setCurrentViewSlideIndex(idx)}
                                  className={`w-2 h-2 rounded-full transition-all ${
                                    idx === currentViewSlideIndex 
                                      ? 'bg-primary w-4' 
                                      : 'bg-primary/30 hover:bg-primary/50'
                                  }`}
                                  title={`Go to slide ${idx + 1}`}
                                />
                              ))}
                            </div>
                            
                            <Button 
                              variant="default" 
                              onClick={() => setCurrentViewSlideIndex(Math.min(viewSlides.length - 1, currentViewSlideIndex + 1))}
                              disabled={currentViewSlideIndex === viewSlides.length - 1}
                            >
                              Next <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={(e) => handleShare(e, story.id)}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(story.id, { onSuccess: () => toast({ title: 'Story deleted' }) })}>
                    {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 relative overflow-hidden text-sm text-muted-foreground/80 my-2">
                <div className="line-clamp-3 prose prose-sm dark:prose-invert prose-p:my-1 opacity-80">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {firstSlidePreview}
                  </ReactMarkdown>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
              </div>

              <div className="flex items-center justify-between mt-auto pt-3 border-t border-border text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 shadow-sm">
                  <Sparkles className="w-3 h-3 text-primary" />
                  {formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewStory(story)}>
                  View Presentation
                </Button>
              </div>
            </motion.div>
          )})}
        </div>
      )}
    </div>
  );
}

