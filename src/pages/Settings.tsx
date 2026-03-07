import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings, Key, Bot, Save, AlertCircle, CheckCircle, Check, ChevronsUpDown, RefreshCw, Loader2, Globe, ShieldCheck, Trash2, Lock } from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import type { AIProvider } from '@/types/data';
import { cn } from '@/lib/utils';
import { aiProviders, fetchOpenRouterModels, type ModelOption } from '@/lib/aiProviders';
import { api } from '@/lib/api';


/**
 * SECURITY ARCHITECTURE — Settings Page AI Config:
 *
 * 1. User fills in API key and clicks "Save Configuration"
 * 2. Frontend sends the key ONE TIME to PUT /api/v1/settings/ai-config over HTTPS
 *    (captured in DevTools Network as a one-time POST to YOUR domain, not to OpenAI)
 * 3. Backend encrypts the key with AES-256-GCM using ENCRYPTION_KEY env var
 * 4. Encrypted blob is stored in user_ai_configs table — raw key NEVER in DB
 * 5. All subsequent AI calls hit your backend proxy (/api/v1/reports/stream, etc.)
 *    The backend decrypts the key and calls OpenAI server-side.
 * 6. Browser DevTools NEVER shows "Authorization: Bearer sk-xxx" to OpenAI.
 *
 * The GET /api/v1/settings/ai-config returns {hasApiKey: true/false} — never raw key.
 * After saving, the API key field is cleared from the browser input.
 */

interface BackendAIConfig {
  configured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  hasApiKey: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();

  // Form state — provider/model/etc from backend; API key only in memory while typing
  const [provider, setProvider] = useState<AIProvider>('openrouter');
  const [model, setModel] = useState('google/gemma-3-27b-it:free');
  const [apiKey, setApiKey] = useState('');         // only touches this input, never stored in localStorage
  const [baseUrl, setBaseUrl] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);

  // Backend status
  const [backendConfig, setBackendConfig] = useState<BackendAIConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // UI
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [dynamicModels, setDynamicModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [useDynamic, setUseDynamic] = useState(false);

  const selectedProvider = aiProviders.find(p => p.value === provider);
  const currentModels = useDynamic && dynamicModels.length > 0 ? dynamicModels : (selectedProvider?.models || []);
  const selectedModel = currentModels.find(m => m.value === model);

  // ── Load current config from backend on mount ──────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<BackendAIConfig>('/settings/ai-config');
        setBackendConfig(data);
        if (data.configured) {
          setProvider(data.provider as AIProvider);
          setModel(data.model);
          setBaseUrl(data.baseUrl || '');
          setMaxTokens(data.maxTokens);
          setTemperature(data.temperature);
          setMaxTokens(data.maxTokens);
          setTemperature(data.temperature);
        }
      } catch {
        // Backend not reachable or not configured — fallback silently
        setBackendConfig({ configured: false, provider: 'openrouter', model: 'google/gemma-3-27b-it:free', baseUrl: '', maxTokens: 4096, temperature: 0.7, hasApiKey: false });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOpenRouterModels = useCallback(async () => {
    setIsLoadingModels(true);
    const models = await fetchOpenRouterModels();
    if (models.length > 0) {
      setDynamicModels(models);
      setLastUpdated(new Date());
      setUseDynamic(true);
      toast({ title: 'Model berhasil diperbarui', description: `${models.length} model ditemukan dari OpenRouter.` });
    } else {
      toast({ title: 'Gagal memuat model', description: 'Menggunakan daftar model bawaan.', variant: 'destructive' });
    }
    setIsLoadingModels(false);
  }, [toast]);

  // ── Save: POST to backend — API key goes over HTTPS to YOUR server only ────
  const handleSave = async () => {
    if (!backendConfig?.hasApiKey && !apiKey) {
      toast({ title: 'API Key Required', description: 'Enter your API key to configure AI.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = { provider, model, baseUrl, maxTokens, temperature };
      // Only send apiKey if user actually typed something new
      if (apiKey) body.apiKey = apiKey;

      const { data } = await api.put<BackendAIConfig>('/settings/ai-config', body);
      setBackendConfig({ ...data, provider, model, baseUrl, maxTokens, temperature });

      // SECURITY: Clear API key from input immediately after successful save
      setApiKey('');

      toast({
        title: '🔒 Configuration saved securely',
        description: 'Your API key is encrypted and stored server-side. It will never appear in browser DevTools.',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to save configuration';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete: remove AI config from server ───────────────────────────────────
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete('/settings/ai-config');
      setBackendConfig(prev => prev ? { ...prev, configured: false, hasApiKey: false } : null);
      setApiKey('');
      toast({ title: 'AI configuration removed', description: 'Your API key has been deleted from the server.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove configuration', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const freeModels = currentModels.filter(m => m.free);
  const paidModels = currentModels.filter(m => !m.free);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Settings className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Settings
              <HelpTooltip text="API key disimpan terenkripsi (AES-256-GCM) di server — tidak pernah tersimpan di browser atau terlihat di DevTools." />
            </h1>
            <p className="text-muted-foreground">Configure your AI integration and preferences</p>
          </div>
        </div>
      </motion.div>

      {/* Security Info Banner */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex items-start gap-3 p-4 rounded-xl bg-success/5 border border-success/20">
        <ShieldCheck className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">Zero-Exposure Key Storage</p>
          <p className="text-muted-foreground mt-0.5">
            Your API key is encrypted with <strong>AES-256-GCM</strong> before being stored server-side.
            All AI calls go through our secure backend proxy — your API key <strong>never appears in browser DevTools Network tab</strong>.
          </p>
        </div>
      </motion.div>

      {/* AI Configuration */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-card rounded-xl p-6 border border-border shadow-card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">AI Configuration</h3>
              <p className="text-sm text-muted-foreground">Connect your preferred AI provider — 11 providers supported</p>
            </div>
          </div>
          {backendConfig?.configured && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Remove Key
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Provider Select */}
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select value={provider} onValueChange={(value: AIProvider) => {
              const p = aiProviders.find(pr => pr.value === value);
              setProvider(value);
              setModel(p?.models[0]?.value || '');
              setUseDynamic(false);
            }}>
              <SelectTrigger id="provider"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-[350px]">
                {aiProviders.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <span>{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">— {p.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Model</Label>
              {selectedProvider?.supportsAutoUpdate && (
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1"
                  onClick={loadOpenRouterModels} disabled={isLoadingModels}>
                  {isLoadingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {isLoadingModels ? 'Loading...' : 'Auto-Update'}
                </Button>
              )}
            </div>
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={modelOpen} className="w-full justify-between font-normal">
                  <span className="flex items-center gap-2 truncate">
                    {selectedModel ? (
                      <>
                        {selectedModel.label}
                        {selectedModel.free && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded">FREE</span>}
                      </>
                    ) : model ? (
                      <span className="text-muted-foreground">{model}</span>
                    ) : 'Select model...'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[450px] p-0 bg-popover border-border" align="start">
                <Command className="bg-transparent">
                  <CommandInput placeholder="Cari model..." className="border-b border-border" />
                  <CommandList className="max-h-[350px]">
                    <CommandEmpty>Model tidak ditemukan.</CommandEmpty>
                    <CommandGroup heading="✏️ Custom Model">
                      <div className="px-2 py-1.5 flex gap-2">
                        <Input placeholder="Ketik model ID custom..." value={customModel}
                          onChange={e => setCustomModel(e.target.value)} className="h-8 text-xs"
                          onKeyDown={e => { if (e.key === 'Enter' && customModel.trim()) { setModel(customModel.trim()); setCustomModel(''); setModelOpen(false); } }} />
                        <Button size="sm" className="h-8 text-xs" disabled={!customModel.trim()}
                          onClick={() => { setModel(customModel.trim()); setCustomModel(''); setModelOpen(false); }}>
                          Set
                        </Button>
                      </div>
                    </CommandGroup>
                    {freeModels.length > 0 && (
                      <CommandGroup heading="🆓 Free Models">
                        {freeModels.map(m => (
                          <CommandItem key={m.value} value={m.label} onSelect={() => { setModel(m.value); setModelOpen(false); }} className="cursor-pointer">
                            <Check className={cn('mr-2 h-4 w-4', model === m.value ? 'opacity-100' : 'opacity-0')} />
                            <span className="flex-1 truncate">{m.label}</span>
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded">FREE</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {paidModels.length > 0 && (
                      <CommandGroup heading={freeModels.length > 0 ? '💎 Premium Models' : '📦 Models'}>
                        {paidModels.map(m => (
                          <CommandItem key={m.value} value={m.label} onSelect={() => { setModel(m.value); setModelOpen(false); }} className="cursor-pointer">
                            <Check className={cn('mr-2 h-4 w-4', model === m.value ? 'opacity-100' : 'opacity-0')} />
                            <span className="truncate">{m.label}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {lastUpdated && useDynamic && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Globe className="w-3 h-3" />
                Model terakhir diperbarui: {lastUpdated.toLocaleTimeString('id-ID')} ({dynamicModels.length} model)
              </p>
            )}
          </div>

          {/* API Key */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="apiKey" className="flex items-center gap-2">
              <Key className="w-4 h-4" /> API Key
              {backendConfig?.hasApiKey && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success border border-success/30">
                  <Lock className="w-2.5 h-2.5" /> Encrypted key saved
                </span>
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type={apiKeyVisible ? 'text' : 'password'}
                placeholder={backendConfig?.hasApiKey ? '••••••••••••••••••• (leave blank to keep existing)' : 'Enter your API key'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="flex-1 font-mono"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button variant="outline" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
                {apiKeyVisible ? 'Hide' : 'Show'}
              </Button>
            </div>
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-success mt-0.5 flex-shrink-0" />
              <span>
                <strong className="text-foreground">Secure proxy mode:</strong> your key is sent once to our backend via HTTPS,
                encrypted with AES-256-GCM, and stored server-side. It is <strong className="text-foreground">never visible in browser DevTools</strong> after that.
              </span>
            </div>
          </div>

          {/* Base URL (optional) */}
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Custom Base URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input id="baseUrl" placeholder="https://api.openai.com/v1" value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)} />
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input id="maxTokens" type="number" value={maxTokens}
              onChange={e => setMaxTokens(parseInt(e.target.value) || 4096)} min={100} max={128000} />
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <Label htmlFor="temperature">Temperature</Label>
            <Input id="temperature" type="number" step="0.1" value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value) || 0.7)} min={0} max={2} />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {backendConfig?.configured ? (
              <>
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="text-sm text-muted-foreground">
                  Connected to {aiProviders.find(p => p.value === backendConfig.provider)?.label}
                  {backendConfig.hasApiKey ? ' (key secured 🔒)' : ''}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-warning" />
                <span className="text-sm text-muted-foreground">No AI provider configured</span>
              </>
            )}
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="gradient-primary text-primary-foreground">
            {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Encrypting & Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Configuration</>}
          </Button>
        </div>
      </motion.div>

      {/* Provider Cards */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
        className="bg-card rounded-xl p-6 border border-border shadow-card">
        <h4 className="font-semibold text-foreground mb-4">Supported Providers ({aiProviders.length})</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {aiProviders.map(p => (
            <button key={p.value}
              onClick={() => { const pr = aiProviders.find(pr => pr.value === p.value); setProvider(p.value); setModel(pr?.models[0]?.value || ''); setUseDynamic(false); }}
              className={cn('p-3 rounded-lg border text-left transition-all hover:shadow-md',
                provider === p.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}>
              <p className="font-medium text-sm text-foreground">{p.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{p.models.length} model{p.supportsAutoUpdate ? ' + auto-update' : ''}</p>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Info Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-muted/50 rounded-xl p-6 border border-border">
        <h4 className="font-semibold text-foreground mb-3">Security Architecture</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            'API key encrypted with AES-256-GCM — stored server-side only',
            'Browser DevTools will NEVER show your API key after initial save',
            'All AI calls proxied through your backend — not directly to OpenAI from browser',
            'Sensitive data masked and anonymized before sending to AI (Privacy Settings)',
            'All server communications use TLS 1.3',
            '11 providers supported: OpenAI, Anthropic, Google, NVIDIA, Groq, OpenRouter, and more',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
