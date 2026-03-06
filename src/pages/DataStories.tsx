import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Sparkles, Loader2, Trash2, Eye, Plus, Share2, Download } from 'lucide-react';
import { usePDF } from 'react-to-pdf';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useStories, useCreateStory, useDeleteStory, useDatasets, useGenerateReport } from '@/hooks/useApi';
import type { DataStory } from '@/lib/api';

import { StoryEditor } from '@/components/StoryEditor';

export default function DataStories() {
  const { data: stories = [], isLoading } = useStories();
  const { data: datasets = [] } = useDatasets();
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
  const [manualContent, setManualContent] = useState('');

  // View dialog
  const [viewStory, setViewStory] = useState<DataStory | null>(null);

  useEffect(() => {
    const sId = searchParams.get('storyId');
    if (sId && stories.length > 0) {
      const found = stories.find(s => s.id === sId);
      if (found && (!viewStory || viewStory.id !== found.id)) {
        setViewStory(found);
      }
    }
  }, [searchParams, stories]);

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
      // save as a story
      await createMut.mutateAsync({ title: result.title, content: result.content, datasetId: selectedDsId });
      toast({ title: 'Story generated!', description: 'AI data story created and saved.' });
      setStoryFocus('');
    } catch {
      toast({ title: 'Error', description: 'Failed to generate story.', variant: 'destructive' });
    }
  };

  const handleCreateManual = async () => {
    if (!manualTitle || !manualContent) { toast({ title: 'Title and content required', variant: 'destructive' }); return; }
    try {
      await createMut.mutateAsync({ title: manualTitle, content: manualContent });
      setManualTitle(''); setManualContent('');
      setIsComposing(false);
      toast({ title: 'Story created' });
    } catch {
      toast({ title: 'Error', description: 'Failed to create story.', variant: 'destructive' });
    }
  };

  if (isComposing) {
    return (
      <div className="h-full flex flex-col p-6 space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" /> Story Builder
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Design your narrative layout</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsComposing(false)}>Cancel</Button>
            <Button onClick={handleCreateManual} disabled={createMut.isPending || !manualTitle || !manualContent || manualContent === '<p></p>'}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Save Story
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6 flex-1 min-h-[500px]">
          {/* Settings Sidebar */}
          <div className="space-y-6 pr-6 border-r border-border md:block hidden overflow-y-auto">
            <div>
              <h3 className="font-semibold text-sm mb-3">Story Settings</h3>
              <div className="space-y-2">
                <Label className="text-xs">Related Dataset (Optional)</Label>
                <Select value={selectedDsId} onValueChange={setSelectedDsId}>
                  <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Link to dataset" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {datasets?.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">Linking a dataset allows you to reference its specific metrics down the line.</p>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-primary mb-1">
                  <Sparkles className="w-4 h-4" /> AI Tip
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">Want to generate a story automatically instead? Cancel this manual mode and use the AI generator in the main menu.</p>
              </div>
            </div>
          </div>

          {/* Editor Area */}
          <div className="flex flex-col space-y-4">
            <Input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="Storyboard Title..."
              className="text-xl md:text-2xl font-semibold px-4 py-6 border border-border shadow-sm bg-card hover:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/50 transition-colors"
            />
            <div className="flex-1 rounded-xl overflow-hidden shadow-sm flex flex-col bg-background border border-border">
              <StoryEditor content={manualContent} onChange={setManualContent} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Data Stories <HelpTooltip text="Generate narasi data oleh AI backend, atau tulis manual. AI menganalisis dataset dan membuat cerita dengan insight." />
            </h1>
            <p className="text-muted-foreground">AI-generated narrative insights from your data</p>
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
          <Button variant="outline" onClick={() => setIsComposing(true)}>
            <Plus className="w-4 h-4 mr-2" />Write Manually
          </Button>
        </div>
      </motion.div>

      {/* Stories grid */}
      {stories.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No stories yet</h3>
          <p className="text-muted-foreground">Select a dataset and click Generate to create your first AI data story</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stories.map((story, i) => (
            <motion.div key={story.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-glow transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex gap-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewStory(story)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto flex flex-col">
                      <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b border-border mr-10">
                        <DialogTitle className="text-2xl font-bold">{viewStory?.title}</DialogTitle>
                        <Button variant="outline" size="sm" onClick={() => toPDF()} className="hidden md:flex">
                          <Download className="w-4 h-4 mr-2" /> Export to PDF
                        </Button>
                      </DialogHeader>
                      <div className="flex-1 p-2" ref={targetRef}>
                        <div className="p-4 md:p-8 bg-background rounded-lg">
                          <h1 className="text-3xl font-bold mb-6 text-foreground print:text-black">{viewStory?.title}</h1>
                          <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed prose prose-sm md:prose-base dark:prose-invert max-w-none print:prose-neutral" dangerouslySetInnerHTML={{ __html: viewStory?.content || '' }} />
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={(e) => handleShare(e, story.id)}>
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(story.id, { onSuccess: () => toast({ title: 'Story deleted' }) })}>
                    {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1 truncate">{story.title}</h3>
              <div className="flex-1 relative overflow-hidden text-sm text-muted-foreground/80 mb-2">
                <div className="line-clamp-3 prose prose-sm dark:prose-invert prose-p:my-1 opacity-80" dangerouslySetInnerHTML={{ __html: story.content || '' }} />
                <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
              </div>
              <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border text-xs text-muted-foreground shadow-sm">
                <Sparkles className="w-3 h-3 text-primary" />
                {formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
