import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Code, Copy, Check, ExternalLink, Shield, Trash2, Clock, Eye, BookOpen, Layout, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useEmbedTokens, useGenerateEmbedToken, useRevokeEmbedToken, useDashboards, useCharts, useStories } from '@/hooks/useApi';
import { API_BASE } from '@/lib/api';
import { useSearchParams } from 'react-router-dom';

const EXPIRE_OPTIONS = [
  { label: '1 hari', value: 1 },
  { label: '7 hari', value: 7 },
  { label: '30 hari', value: 30 },
  { label: 'Tidak ada', value: 0 },
];

type ResourceType = 'dashboard' | 'chart' | 'story';

const TABS: { id: ResourceType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboards', icon: Layout },
  { id: 'chart', label: 'Charts', icon: BarChart3 },
  { id: 'story', label: 'Stories', icon: BookOpen },
];

export default function EmbedShare() {
  const [searchParams] = useSearchParams();
  const { data: dashboards = [] } = useDashboards();
  const { data: savedCharts = [] } = useCharts();
  const { data: stories = [] } = useStories();
  const { toast } = useToast();

  // Read pre-selection from URL params (?type=story&id=xxx)
  const urlType = searchParams.get('type') as ResourceType | null;
  const urlId = searchParams.get('id') || '';

  const [type, setType] = useState<ResourceType>(
    urlType && ['dashboard', 'chart', 'story'].includes(urlType) ? urlType : 'dashboard'
  );
  const [selectedId, setSelectedId] = useState(urlId);
  const [width, setWidth] = useState('800');
  const [height, setHeight] = useState('600');
  const [showToolbar, setShowToolbar] = useState(true);
  const [expireDays, setExpireDays] = useState(7);
  const [copied, setCopied] = useState<string | null>(null);

  // Re-apply URL params if they change (e.g. navigating from DataStories)
  useEffect(() => {
    if (urlType && ['dashboard', 'chart', 'story'].includes(urlType)) {
      setType(urlType as ResourceType);
    }
    if (urlId) setSelectedId(urlId);
  }, [urlType, urlId]);

  // BUG-M5 fix: use backend secure tokens
  const { data: tokens = [], isLoading: tokenLoading } = useEmbedTokens();
  const generateMut = useGenerateEmbedToken();
  const revokeMut = useRevokeEmbedToken();

  const items =
    type === 'dashboard'
      ? dashboards.map((d) => ({ id: d.id, name: d.name }))
      : type === 'chart'
      ? savedCharts.map((c) => ({ id: c.id, name: c.title }))
      : stories.map((s: any) => ({ id: s.id, name: s.title }));

  /**
   * URL yang dibagikan:
   * - dashboard/chart → embed viewer (iframe-friendly)
   * - story → halaman presentasi full-screen (bukan iframe)
   */
  const getShareUrl = (tokenId: string) =>
    type === 'story'
      ? `${window.location.origin}/embed/view/${tokenId}`
      : `${window.location.origin}/embed/view/${tokenId}`;

  const getPresentationUrl = (tokenId: string) =>
    `${window.location.origin}/embed/view/${tokenId}`;

  const getIframeCode = (tokenId: string) =>
    type === 'story'
      ? `<!-- Story Presentation Link (opens full-screen) -->\n<a href="${getPresentationUrl(tokenId)}" target="_blank" rel="noreferrer" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-family:Inter,sans-serif;">\n  Lihat Presentasi\n</a>`
      : `<iframe\n  src="${getShareUrl(tokenId)}"\n  width="${width}"\n  height="${height}"\n  frameborder="0"\n  style="border: 1px solid #e5e7eb; border-radius: 8px;"\n  allowfullscreen\n></iframe>`;

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast({ title: 'Disalin ke clipboard' });
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
          toast({ title: '✅ Token dibuat', description: 'Link aman sudah siap.' });
          copyText(getShareUrl(token.id), `url-${token.id}`);
        },
        onError: () => toast({ title: 'Gagal membuat token', variant: 'destructive' }),
      }
    );
  };

  const handleRevoke = (id: string) => {
    revokeMut.mutate(id, {
      onSuccess: () => toast({ title: 'Token dicabut', description: 'Link tidak lagi valid.' }),
    });
  };

  const activeTokens = tokens.filter(
    (t) => !t.revoked && t.resourceType === type && t.resourceId === selectedId
  );

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
              Embed &amp; Share{' '}
              <HelpTooltip text="Generate secure token dari backend untuk embed/share dashboard, chart, atau data story. Token dapat direvoke kapanpun untuk mencabut akses." />
            </h1>
            <p className="text-muted-foreground">
              Generate link aman dengan token yang bisa dicabut untuk dashboard, chart, dan data story
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Generate Token Aman</h3>
            </div>

            {/* Type tabs */}
            <div className="flex gap-2">
              {TABS.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  variant={type === id ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setType(id);
                    setSelectedId('');
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Button>
              ))}
            </div>

            {/* Resource selector */}
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="bg-muted/50 border-border">
                <SelectValue placeholder={`Pilih ${type}`} />
              </SelectTrigger>
              <SelectContent>
                {items.length === 0 && (
                  <SelectItem value="none" disabled>
                    Tidak ada {type} tersedia
                  </SelectItem>
                )}
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Width/Height — only shown for dashboard & chart */}
            {type !== 'story' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Lebar (px)</label>
                  <Input
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    className="bg-muted/50 border-border"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tinggi (px)</label>
                  <Input
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="bg-muted/50 border-border"
                  />
                </div>
              </div>
            )}

            {/* Story info banner */}
            {type === 'story' && (
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-sm text-primary flex items-start gap-2">
                <BookOpen className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Story akan dibagikan sebagai halaman presentasi <strong>full-screen</strong> (seperti Tableau Stories).
                  Link hanya dapat diakses dengan token yang valid dan dapat dicabut kapanpun.
                </p>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Kedaluwarsa</label>
              <Select
                value={String(expireDays)}
                onValueChange={(v) => setExpireDays(parseInt(v))}
              >
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type !== 'story' && (
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground">Tampilkan Toolbar</label>
                <Switch checked={showToolbar} onCheckedChange={setShowToolbar} />
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={!selectedId || generateMut.isPending}
            >
              <Shield className="w-4 h-4 mr-2" />
              {generateMut.isPending ? 'Membuat token...' : 'Generate Token Aman'}
            </Button>
          </div>
        </motion.div>

        {/* Active Tokens + History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          {selectedId && (
            <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Token Aktif</h3>
                <Badge variant="secondary">{activeTokens.length} aktif</Badge>
              </div>
              {activeTokens.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Belum ada token aktif — generate di panel kiri
                </p>
              ) : (
                <div className="space-y-3">
                  {activeTokens.map((token) => (
                    <div key={token.id} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            {token.id.slice(0, 8)}...
                          </Badge>
                          {token.expiresAt && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              Exp {new Date(token.expiresAt).toLocaleDateString('id-ID')}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="w-3 h-3" />
                            {token.accessCount} views
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive/80 h-7 px-2"
                          onClick={() => handleRevoke(token.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Share URL */}
                      <div className="flex gap-2">
                        <Input
                          value={getShareUrl(token.id)}
                          readOnly
                          className="bg-muted/50 border-border text-xs font-mono h-7 flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 shrink-0"
                          onClick={() => copyText(getShareUrl(token.id), `url-${token.id}`)}
                        >
                          {copied === `url-${token.id}` ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                        <a
                          href={getShareUrl(token.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0"
                        >
                          <Button variant="outline" size="sm" className="h-7 px-2">
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      </div>

                      {/* Embed code / story link */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {type === 'story' ? 'Kode tautan presentasi' : 'Kode iframe'}
                        </label>
                        <Textarea
                          value={getIframeCode(token.id)}
                          readOnly
                          rows={type === 'story' ? 5 : 4}
                          className="bg-muted/50 border-border font-mono text-xs"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={() =>
                            copyText(getIframeCode(token.id), `iframe-${token.id}`)
                          }
                        >
                          {copied === `iframe-${token.id}` ? (
                            <Check className="w-3 h-3 mr-1" />
                          ) : (
                            <Copy className="w-3 h-3 mr-1" />
                          )}
                          {type === 'story' ? 'Salin kode tautan' : 'Salin kode iframe'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Token History */}
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground">Riwayat Token</h3>
            {tokenLoading ? (
              <div className="animate-pulse space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded" />
                ))}
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-6">
                <ExternalLink className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Belum ada token yang dibuat</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={token.revoked ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {token.revoked ? 'Dicabut' : 'Aktif'}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        {token.id.slice(0, 12)}...
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {token.resourceType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        <Eye className="w-3 h-3 inline mr-1" />
                        {token.accessCount}
                      </span>
                      {!token.revoked && (
                        <>
                          <a
                            href={getShareUrl(token.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-primary hover:underline items-center gap-1 inline-flex"
                          >
                            <ExternalLink className="w-3 h-3" /> Buka
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 h-6 px-2 text-xs"
                            onClick={() => handleRevoke(token.id)}
                          >
                            Cabut
                          </Button>
                        </>
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
