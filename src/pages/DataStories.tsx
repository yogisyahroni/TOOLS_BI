import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Loader2, Trash2, Eye, Plus } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { callAI } from '@/lib/aiService';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import type { DataStory } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

function genId() { return Math.random().toString(36).substring(2, 15); }

export default function DataStories() {
  const { dataSets, stories, addStory, removeStory } = useDataStore();
  const { toast } = useToast();
  const [selectedDsId, setSelectedDsId] = useState('');
  const [storyFocus, setStoryFocus] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewStory, setViewStory] = useState<DataStory | null>(null);

  const dataset = dataSets.find(d => d.id === selectedDsId);

  const generateStory = async () => {
    if (!dataset) return;
    setLoading(true);

    // Compute basic stats
    const numCols = dataset.columns.filter(c => c.type === 'number');
    const stats: Record<string, any> = {};
    numCols.forEach(col => {
      const vals = dataset.data.map(r => Number(r[col.name]) || 0);
      stats[col.name] = {
        min: Math.min(...vals), max: Math.max(...vals),
        avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
        sum: vals.reduce((a, b) => a + b, 0),
      };
    });

    const aiRes = await callAI([{
      role: 'system',
      content: `You are a data storytelling expert. Create compelling narrative stories from data, like Power BI Smart Narratives.
      
Dataset: "${dataset.name}" (${dataset.rowCount} rows)
Columns: ${dataset.columns.map(c => `${c.name}(${c.type})`).join(', ')}
Stats: ${JSON.stringify(stats)}
Sample: ${JSON.stringify(dataset.data.slice(0, 5))}

Return JSON:
{
  "title": "Compelling story title",
  "narrative": "A detailed, engaging narrative (3-5 paragraphs) that tells the story behind the data, with specific numbers, trends, and actionable insights. Use markdown.",
  "insights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "charts": [{"type":"bar|line|pie","title":"chart title","xAxis":"col","yAxis":"col"}]
}
Return ONLY valid JSON.`
    }, {
      role: 'user',
      content: storyFocus ? `Create a data story focusing on: ${storyFocus}` : 'Create a comprehensive data story about this dataset'
    }]);

    if (aiRes.error) {
      // Fallback: generate locally
      const fallbackStory: DataStory = {
        id: genId(), title: `${dataset.name} - Data Story`, dataSetId: dataset.id,
        narrative: `## Overview\n\nDataset "${dataset.name}" contains **${dataset.rowCount} records** across **${dataset.columns.length} fields**.\n\n` +
          numCols.map(c => `**${c.name}**: ranges from ${stats[c.name]?.min} to ${stats[c.name]?.max} (avg: ${stats[c.name]?.avg})`).join('\n\n') +
          `\n\n## Key Takeaway\n\nThis dataset provides a solid foundation for deeper analysis.`,
        insights: [
          `Total of ${dataset.rowCount} data points available`,
          ...numCols.slice(0, 3).map(c => `${c.name} averages ${stats[c.name]?.avg}`),
          `${dataset.columns.length} dimensions tracked`,
        ],
        charts: numCols.length > 0 && dataset.columns.find(c => c.type === 'string')
          ? [{ type: 'bar', title: `${numCols[0].name} Overview`, xAxis: dataset.columns.find(c => c.type === 'string')!.name, yAxis: numCols[0].name }]
          : [],
        createdAt: new Date(),
      };
      addStory(fallbackStory);
      toast({ title: 'Story generated', description: 'Data story created with local analysis.' });
    } else {
      try {
        const parsed = JSON.parse(aiRes.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        const story: DataStory = {
          id: genId(), title: parsed.title || `${dataset.name} Story`, dataSetId: dataset.id,
          narrative: parsed.narrative || '', insights: parsed.insights || [],
          charts: parsed.charts || [], createdAt: new Date(),
        };
        addStory(story);
        toast({ title: 'Story generated', description: 'AI-powered data story created successfully.' });
      } catch {
        toast({ title: 'Error', description: 'Failed to parse AI response.', variant: 'destructive' });
      }
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Data Stories <HelpTooltip text="Generate narasi data otomatis oleh AI. Pilih dataset dan (opsional) focus area, lalu klik Generate. AI akan membuat cerita lengkap dengan insight." /></h1>
            <p className="text-muted-foreground">AI-powered narrative insights from your data</p>
          </div>
        </div>
      </motion.div>

      {/* Create Story */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Generate New Story
        </h3>
        <div className="flex gap-4 flex-wrap">
          <Select value={selectedDsId} onValueChange={setSelectedDsId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select dataset" /></SelectTrigger>
            <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Focus area (optional)" value={storyFocus} onChange={e => setStoryFocus(e.target.value)} className="w-64" />
          <Button onClick={generateStory} disabled={!dataset || loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Generate Story
          </Button>
        </div>
      </motion.div>

      {/* Stories List */}
      {stories.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No stories yet</h3>
          <p className="text-muted-foreground">Select a dataset above to generate your first data story</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stories.map((story, i) => {
            const ds = dataSets.find(d => d.id === story.dataSetId);
            return (
              <motion.div key={story.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
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
                        <div className="space-y-4">
                          <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{viewStory?.narrative}</div>
                          {viewStory && viewStory.insights.length > 0 && (
                            <div className="p-4 rounded-lg bg-muted/50">
                              <h4 className="font-semibold text-foreground mb-2">Key Insights</h4>
                              <ul className="space-y-1">
                                {viewStory.insights.map((ins, j) => (
                                  <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                                    <Sparkles className="w-3 h-3 mt-1 text-primary flex-shrink-0" />
                                    {ins}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => { removeStory(story.id); toast({ title: 'Story deleted' }); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1 truncate">{story.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{ds?.name || 'Unknown dataset'}</p>
                <p className="text-sm text-muted-foreground line-clamp-3">{story.narrative.substring(0, 200)}...</p>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 text-primary" />
                  {story.insights.length} insights
                  <span className="mx-1">•</span>
                  {formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
