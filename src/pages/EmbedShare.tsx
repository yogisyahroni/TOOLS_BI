import { useState } from 'react';
import { motion } from 'framer-motion';
import { Code, Copy, Check, ExternalLink } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';

export default function EmbedShare() {
  const { dashboards, savedCharts } = useDataStore();
  const { toast } = useToast();
  const [type, setType] = useState<'dashboard' | 'chart'>('dashboard');
  const [selectedId, setSelectedId] = useState('');
  const [width, setWidth] = useState('800');
  const [height, setHeight] = useState('600');
  const [showToolbar, setShowToolbar] = useState(true);
  const [copied, setCopied] = useState(false);

  const items = type === 'dashboard' ? dashboards.map(d => ({ id: d.id, name: d.name })) : savedCharts.map(c => ({ id: c.id, name: c.title }));
  const selected = items.find(i => i.id === selectedId);

  const baseUrl = window.location.origin;
  const embedUrl = `${baseUrl}/${type === 'dashboard' ? 'dashboard-builder' : 'chart-builder'}?embed=true&id=${selectedId}${showToolbar ? '' : '&toolbar=false'}`;
  const iframeCode = `<iframe\n  src="${embedUrl}"\n  width="${width}"\n  height="${height}"\n  frameborder="0"\n  style="border: 1px solid #e5e7eb; border-radius: 8px;"\n  allowfullscreen\n></iframe>`;

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Code className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Embed & Share <HelpTooltip text="Generate kode iframe atau link untuk embed dashboard/chart di website lain. Atur ukuran dan opsi toolbar." /></h1>
            <p className="text-muted-foreground">Generate embed codes and shareable links for dashboards and charts</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Configuration</h3>

            <div className="flex gap-2">
              <Button variant={type === 'dashboard' ? 'default' : 'outline'} size="sm" onClick={() => { setType('dashboard'); setSelectedId(''); }}>Dashboards</Button>
              <Button variant={type === 'chart' ? 'default' : 'outline'} size="sm" onClick={() => { setType('chart'); setSelectedId(''); }}>Charts</Button>
            </div>

            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder={`Select ${type}`} /></SelectTrigger>
              <SelectContent>
                {items.length === 0 && <SelectItem value="none" disabled>No {type}s available</SelectItem>}
                {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Width (px)</label>
                <Input value={width} onChange={e => setWidth(e.target.value)} className="bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Height (px)</label>
                <Input value={height} onChange={e => setHeight(e.target.value)} className="bg-muted/50 border-border" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">Show Toolbar</label>
              <Switch checked={showToolbar} onCheckedChange={setShowToolbar} />
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
          {/* Share Link */}
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground">Shareable Link</h3>
            <div className="flex gap-2">
              <Input value={selectedId ? embedUrl : ''} readOnly className="bg-muted/50 border-border text-xs font-mono" />
              <Button variant="outline" size="sm" onClick={() => copyCode(embedUrl)} disabled={!selectedId}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Embed Code */}
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Embed Code</h3>
              <Button variant="outline" size="sm" onClick={() => copyCode(iframeCode)} disabled={!selectedId}>
                <Copy className="w-4 h-4 mr-1" /> Copy
              </Button>
            </div>
            <Textarea value={selectedId ? iframeCode : 'Select a dashboard or chart to generate embed code'} readOnly rows={8}
              className="bg-muted/50 border-border font-mono text-xs" />
          </div>

          {/* Preview */}
          {selectedId && (
            <div className="bg-card rounded-xl p-6 border border-border shadow-card">
              <h3 className="font-semibold text-foreground mb-3">Preview</h3>
              <div className="rounded-lg border border-border overflow-hidden bg-muted/20 flex items-center justify-center" style={{ width: '100%', height: '200px' }}>
                <div className="text-center">
                  <ExternalLink className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-sm text-foreground font-semibold">{selected?.name}</p>
                  <p className="text-xs text-muted-foreground">{width}×{height}px embed</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
