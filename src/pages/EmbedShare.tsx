import { useState } from 'react';
import { motion } from 'framer-motion';
import { Code, Copy, Check, ExternalLink, Shield, Trash2, Clock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useEmbedTokens, useGenerateEmbedToken, useRevokeEmbedToken, useDatasets, useDatasetData, useDashboards, useCharts } from '@/hooks/useApi';
import { API_BASE } from '@/lib/api';

const EXPIRE_OPTIONS = [
  { label: '1 day', value: 1 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: 'Never', value: 0 },
];

export default function EmbedShare() {
  const { data: dashboards = [] } = useDashboards();
  const { data: savedCharts = [] } = useCharts();
  const { toast } = useToast();
  const [type, setType] = useState<'dashboard' | 'chart'>('dashboard');
  const [selectedId, setSelectedId] = useState('');
  const [width, setWidth] = useState('800');
  const [height, setHeight] = useState('600');
  const [showToolbar, setShowToolbar] = useState(true);
  const [expireDays, setExpireDays] = useState(7);
  const [copied, setCopied] = useState<string | null>(null);

  // BUG-M5 fix: use backend secure tokens
  const { data: tokens = [], isLoading: tokenLoading } = useEmbedTokens();
  const generateMut = useGenerateEmbedToken();
  const revokeMut = useRevokeEmbedToken();

  const items = type === 'dashboard'
    ? dashboards.map(d => ({ id: d.id, name: d.name }))
    : savedCharts.map(c => ({ id: c.id, name: c.title }));
  const selected = items.find(i => i.id === selectedId);

  // Public embed URL using secure token
  const getEmbedUrl = (tokenId: string) =>
    `${window.location.origin}/embed/view/${tokenId}`;

  const getIframeCode = (tokenId: string) =>
    `<iframe\n  src="${getEmbedUrl(tokenId)}"\n  width="${width}"\n  height="${height}"\n  frameborder="0"\n  style="border: 1px solid #e5e7eb; border-radius: 8px;"\n  allowfullscreen\n></iframe>`;

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleGenerate = () => {
    if (!selectedId) return;
    generateMut.mutate(
      {
        resourceId: selectedId,
        resourceType: type,
        showToolbar,
        width: parseInt(width) || 800,
        height: parseInt(height) || 600,
        expireDays: expireDays > 0 ? expireDays : undefined,
      },
      {
        onSuccess: (token) => {
          toast({ title: '✅ Token generated', description: 'Secure embed URL is ready.' });
          copyText(getEmbedUrl(token.id), `url-${token.id}`);
        },
        onError: () => toast({ title: 'Failed to generate token', variant: 'destructive' }),
      }
    );
  };

  const handleRevoke = (id: string) => {
    revokeMut.mutate(id, {
      onSuccess: () => toast({ title: 'Token revoked', description: 'Embed link is now invalid.' }),
    });
  };

  const activeTokens = tokens.filter(t => !t.revoked && t.resourceType === type && t.resourceId === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Code className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Embed & Share <HelpTooltip text="Generate secure token dari backend untuk embed dashboard/chart. Token dapat direvoke kapanpun." />
            </h1>
            <p className="text-muted-foreground">Generate secure, revocable embed tokens for dashboards and charts</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Generate Secure Token</h3>
            </div>

            <div className="flex gap-2">
              <Button variant={type === 'dashboard' ? 'default' : 'outline'} size="sm"
                onClick={() => { setType('dashboard'); setSelectedId(''); }}>Dashboards</Button>
              <Button variant={type === 'chart' ? 'default' : 'outline'} size="sm"
                onClick={() => { setType('chart'); setSelectedId(''); }}>Charts</Button>
            </div>

            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="bg-muted/50 border-border">
                <SelectValue placeholder={`Select ${type}`} />
              </SelectTrigger>
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

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Expiration</label>
              <Select value={String(expireDays)} onValueChange={(v) => setExpireDays(parseInt(v))}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPIRE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">Show Toolbar</label>
              <Switch checked={showToolbar} onCheckedChange={setShowToolbar} />
            </div>

            <Button className="w-full" onClick={handleGenerate} disabled={!selectedId || generateMut.isPending}>
              <Shield className="w-4 h-4 mr-2" />
              {generateMut.isPending ? 'Generating...' : 'Generate Secure Token'}
            </Button>
          </div>
        </motion.div>

        {/* Active Tokens for selected item */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
          {selectedId && (
            <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Active Tokens</h3>
                <Badge variant="secondary">{activeTokens.length} active</Badge>
              </div>
              {activeTokens.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active tokens — generate one above</p>
              ) : (
                <div className="space-y-3">
                  {activeTokens.map(token => (
                    <div key={token.id} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">{token.id.slice(0, 8)}...</Badge>
                          {token.expiresAt && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              Expires {new Date(token.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="w-3 h-3" />{token.accessCount} views
                          </span>
                        </div>
                        <Button variant="ghost" size="sm"
                          className="text-destructive hover:text-destructive/80 h-7 px-2"
                          onClick={() => handleRevoke(token.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={getEmbedUrl(token.id)}
                          readOnly className="bg-muted/50 border-border text-xs font-mono h-7 flex-1" />
                        <Button variant="outline" size="sm" className="h-7 px-2"
                          onClick={() => copyText(getEmbedUrl(token.id), `url-${token.id}`)}>
                          {copied === `url-${token.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <Textarea
                          value={getIframeCode(token.id)}
                          readOnly rows={4}
                          className="bg-muted/50 border-border font-mono text-xs" />
                        <Button variant="outline" size="sm" className="w-full h-7 text-xs"
                          onClick={() => copyText(getIframeCode(token.id), `iframe-${token.id}`)}>
                          {copied === `iframe-${token.id}` ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                          Copy iframe code
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Tokens History */}
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground">Token History</h3>
            {tokenLoading ? (
              <div className="animate-pulse space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded" />)}
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-6">
                <ExternalLink className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No tokens generated yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tokens.map(token => (
                  <div key={token.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={token.revoked ? 'destructive' : 'secondary'} className="text-xs">
                        {token.revoked ? 'Revoked' : 'Active'}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">{token.id.slice(0, 12)}...</span>
                      <span className="text-xs text-muted-foreground">{token.resourceType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground"><Eye className="w-3 h-3 inline mr-1" />{token.accessCount}</span>
                      {!token.revoked && (
                        <Button variant="ghost" size="sm" className="text-destructive h-6 px-2 text-xs"
                          onClick={() => handleRevoke(token.id)}>Revoke</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
