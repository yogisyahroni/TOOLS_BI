import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Loader2, Trash2, Eye, Plus } from 'lucide-react';
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

export default function DataStories() {
  const { data: stories = [], isLoading } = useStories();
  const { data: datasets = [] } = useDatasets();
  const createMut = useCreateStory();
  const deleteMut = useDeleteStory();
  const generateMut = useGenerateReport();
  const { toast } = useToast();

  // AI generate mode
  const [selectedDsId, setSelectedDsId] = useState('');
  const [storyFocus, setStoryFocus] = useState('');

  // Manual create mode
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');

  // View dialog
  const [viewStory, setViewStory] = useState<DataStory | null>(null);

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
      setManualDialogOpen(false);
      toast({ title: 'Story created' });
    } catch {
      toast({ title: 'Error', description: 'Failed to create story.', variant: 'destructive' });
    }
  };

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
          <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="w-4 h-4 mr-2" />Write Manually</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Write Story</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Title</Label><Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Story title" /></div>
                <div><Label>Content</Label><Textarea value={manualContent} onChange={(e) => setManualContent(e.target.value)} placeholder="Write your story…" rows={8} /></div>
                <Button onClick={handleCreateManual} className="w-full" disabled={createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save Story
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
                      <DialogHeader><DialogTitle>{viewStory?.title}</DialogTitle></DialogHeader>
                      <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{viewStory?.content}</div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => deleteMut.mutate(story.id, { onSuccess: () => toast({ title: 'Story deleted' }) })}>
                    {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1 truncate">{story.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-3">{story.content.substring(0, 200)}…</p>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
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
