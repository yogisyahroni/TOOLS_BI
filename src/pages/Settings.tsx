import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings, Key, Bot, Save, AlertCircle, CheckCircle, Check, ChevronsUpDown, RefreshCw, Loader2, Globe, ShieldCheck, Trash2, Lock, Plus, Mail, MessageSquare, Send, Share2, ExternalLink, Zap } from 'lucide-react';
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
 * 3. Backend encrypts the key with AES-256-GCM using ENCRYPTION_KEY env var
 * 4. Encrypted blob is stored in user_ai_configs table — raw key NEVER in DB
 * 5. All subsequent AI calls hit your backend proxy (/api/v1/reports/stream, etc.)
 */

interface BackendAIConfig {
  configured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  hasApiKey: boolean;
  notificationTargets: NotificationTarget[];
  integrationConnectors: IntegrationConnector[];
}

interface NotificationTarget {
  type: 'whatsapp' | 'telegram' | 'email';
  target: string;
  name: string;
  enabled: boolean;
}

interface IntegrationConnector {
  id: string;
  name: string;
  type: 'sap' | 'odoo' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();

  // Form state
  const [provider, setProvider] = useState<AIProvider>('openrouter');
  const [model, setModel] = useState('google/gemma-3-27b-it:free');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [notificationTargets, setNotificationTargets] = useState<NotificationTarget[]>([]);
  const [integrationConnectors, setIntegrationConnectors] = useState<IntegrationConnector[]>([]);

  // Backend status
  const [backendConfig, setBackendConfig] = useState<BackendAIConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // UI state
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

  // ── Load current config ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<BackendAIConfig>('/settings/ai-config');
        setBackendConfig(data);
        if (data.configured) {
          setProvider(data.provider as AIProvider);
          setModel(data.model);
          setBaseUrl(data.baseUrl || '');
          setTemperature(data.temperature);
          setNotificationTargets(data.notificationTargets || []);
          setIntegrationConnectors(data.integrationConnectors || []);
        }
      } catch {
        setBackendConfig({ 
          configured: false, 
          provider: 'openrouter', 
          model: 'google/gemma-3-27b-it:free', 
          baseUrl: '', 
          maxTokens: 4096, 
          temperature: 0.7, 
          hasApiKey: false,
          notificationTargets: [],
          integrationConnectors: []
        });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const loadOpenRouterModels = useCallback(async () => {
    setIsLoadingModels(true);
    const models = await fetchOpenRouterModels();
    if (models.length > 0) {
      setDynamicModels(models);
      setLastUpdated(new Date());
      setUseDynamic(true);
      toast({ title: 'Model refreshed', description: `${models.length} models found.` });
    }
    setIsLoadingModels(false);
  }, [toast]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!backendConfig?.hasApiKey && !apiKey) {
      toast({ title: 'API Key Required', description: 'Enter your API key to configure AI.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const body: any = { provider, model, baseUrl, maxTokens, temperature, notificationTargets, integrationConnectors };
      if (apiKey) body.apiKey = apiKey;

      const { data } = await api.put<BackendAIConfig>('/settings/ai-config', body);
      setBackendConfig({ ...data, provider, model, baseUrl, maxTokens, temperature, notificationTargets, integrationConnectors });
      setApiKey(''); // Clear security sensitive field from state

      toast({
        title: '🔒 Configuration saved securely',
        description: 'Your API key is encrypted and stored server-side.',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to save configuration';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete('/settings/ai-config');
      setBackendConfig(prev => prev ? { ...prev, configured: false, hasApiKey: false, notificationTargets: [], integrationConnectors: [] } : null);
      setApiKey('');
      setNotificationTargets([]);
      setIntegrationConnectors([]);
      toast({ title: 'AI configuration removed', description: 'Data has been deleted from the server.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove configuration', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const freeModels = currentModels.filter(m => m.free);
  const paidModels = currentModels.filter(m => !m.free);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Settings className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Settings
              <HelpTooltip text="Semua konfigurasi sensitif disimpan terenkripsi dengan AES-256-GCM." />
            </h1>
            <p className="text-muted-foreground">Configure your AI intelligence and delivery channels</p>
          </div>
        </div>
      </motion.div>

      {/* Security Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex items-start gap-4 p-5 rounded-2xl bg-success/5 border border-success/10 group hover:border-success/30 transition-all">
        <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-success" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground">Zero-Exposure Key Storage</h4>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Your API key is encrypted server-side. Our secure proxy architecture ensures that your 
            credentials <strong>never appear in browser DevTools Network tab</strong> during AI generations.
          </p>
        </div>
      </motion.div>

      {/* AI Core Config */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl p-8 border border-border shadow-soft relative overflow-hidden group">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">LLM Configuration</h3>
              <p className="text-sm text-muted-foreground">Select your engine and model profile</p>
            </div>
          </div>
          {backendConfig?.configured && (
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
              onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Clear Config
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">AI Provider</Label>
            <Select value={provider} onValueChange={(val: AIProvider) => setProvider(val)}>
              <SelectTrigger className="h-11 bg-muted/30 border-border group-hover:border-primary/50 transition-all">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border backdrop-blur-xl">
                {aiProviders.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Model</Label>
              {selectedProvider?.supportsAutoUpdate && (
                <button onClick={loadOpenRouterModels} disabled={isLoadingModels}
                  className="text-[10px] uppercase tracking-wider font-bold text-primary hover:text-primary/70 disabled:opacity-50">
                  {isLoadingModels ? 'Syncing...' : 'Autosync Models'}
                </button>
              )}
            </div>
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full h-11 justify-between bg-muted/30 hover:bg-muted/50 border-border font-normal">
                  <span className="truncate">{selectedModel?.label || model}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 bg-popover/90 backdrop-blur-xl border-border shadow-2xl">
                <Command className="bg-transparent">
                  <CommandInput placeholder="Search models..." className="border-none" />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>No model found.</CommandEmpty>
                    {freeModels.length > 0 && (
                      <CommandGroup heading="Free Profiles">
                        {freeModels.map(m => (
                          <CommandItem key={m.value} onSelect={() => { setModel(m.value); setModelOpen(false); }} className="cursor-pointer">
                            <Check className={cn('mr-2 h-4 w-4', model === m.value ? 'opacity-100' : 'opacity-0')} />
                            {m.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    <CommandGroup heading="Premium Profiles">
                      {paidModels.map(m => (
                        <CommandItem key={m.value} onSelect={() => { setModel(m.value); setModelOpen(false); }} className="cursor-pointer">
                          <Check className={cn('mr-2 h-4 w-4', model === m.value ? 'opacity-100' : 'opacity-0')} />
                          {m.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="md:col-span-2 space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> API Access Key
            </Label>
            <div className="flex gap-2">
              <Input type={apiKeyVisible ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={backendConfig?.hasApiKey ? "•••••••••••• (Key set, leave blank to keep)" : "Enter your API key..."}
                className="h-11 font-mono bg-muted/30 border-border" />
              <Button variant="outline" className="h-11 px-6 border-border" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
                {apiKeyVisible ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground italic flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-success" />
            AES-256 encryption active
          </div>
          <Button onClick={handleSave} disabled={isSaving} size="lg" className="gradient-primary text-primary-foreground min-w-[200px] shadow-glow-primary">
            {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Commit Profile</>}
          </Button>
        </div>
      </motion.div>

      {/* Autonomous Delivery (The New v2.0 Section) */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-card rounded-2xl p-8 border border-border shadow-soft relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700">
          <Zap className="w-12 h-12 text-primary rotate-12" />
        </div>

        <div className="flex items-center gap-4 mb-10">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
            <Share2 className="w-6 h-6 text-success" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Autonomous Delivery Channels</h3>
            <p className="text-sm text-muted-foreground">AI sends proactive analysis to these destinations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Notification Targets */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-widest text-foreground/60 flex items-center gap-2">
                <Send className="w-4 h-4" /> Targets
              </h4>
              <Button variant="outline" size="sm" className="h-8 text-xs border-dashed"
                onClick={() => setNotificationTargets([...notificationTargets, { type: 'whatsapp', target: '', name: 'Management', enabled: true }])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New Target
              </Button>
            </div>

            <div className="space-y-4">
              {notificationTargets.length === 0 ? (
                <div className="py-12 border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center bg-muted/10">
                  <p className="text-sm text-muted-foreground">No channels configured</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Autonomous reports will be dashboard-only</p>
                </div>
              ) : (
                notificationTargets.map((t, i) => (
                  <div key={i} className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-4 hover:border-primary/50 transition-all group/item">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", 
                      t.type === 'whatsapp' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500')}>
                      {t.type === 'whatsapp' ? <MessageSquare className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 mb-2">
                         <Select value={t.type} onValueChange={(val: any) => {
                           const updated = [...notificationTargets];
                           updated[i].type = val;
                           setNotificationTargets(updated);
                         }}>
                           <SelectTrigger className="h-8 text-xs w-28 bg-card"><SelectValue /></SelectTrigger>
                           <SelectContent className="bg-popover border-border">
                             <SelectItem value="whatsapp">WhatsApp</SelectItem>
                             <SelectItem value="telegram">Telegram</SelectItem>
                             <SelectItem value="email">Email</SelectItem>
                           </SelectContent>
                         </Select>
                         <Input placeholder="Label" value={t.name} onChange={e => {
                           const updated = [...notificationTargets];
                           updated[i].name = e.target.value;
                           setNotificationTargets(updated);
                         }} className="h-8 text-xs bg-card" />
                      </div>
                      <Input placeholder={t.type === 'whatsapp' ? 'Phone Number' : 'Target ID'} value={t.target}
                        onChange={e => {
                          const updated = [...notificationTargets];
                          updated[i].target = e.target.value;
                          setNotificationTargets(updated);
                        }} className="h-8 text-xs font-mono bg-card" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10"
                        title="Test Channel" onClick={async () => {
                          try {
                            const { data } = await api.post('/settings/test-notification', { type: t.type, target: t.target });
                            toast({ title: 'Test Dispatched', description: data.message });
                          } catch {
                            toast({ title: 'Test Failed', variant: 'destructive' });
                          }
                        }}>
                        <Zap className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover/item:opacity-100"
                        onClick={() => setNotificationTargets(notificationTargets.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Intelligence Connectors */}
          <div className="space-y-5">
            <h4 className="text-sm font-bold uppercase tracking-widest text-foreground/60 flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> Action Connectors (ERP)
            </h4>
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-dashed border-border bg-muted/10">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Definisikan bridge ke sistem internal (SAP, Odoo, custom ERP). 
                  AI akan memunculkan tombol aksi saat anomali terdeteksi untuk integrasi one-click.
                </p>
                <Button variant="ghost" size="sm" className="mt-3 text-[10px] h-7 w-full border border-border border-dashed hover:border-primary/50"
                  onClick={() => setIntegrationConnectors([...integrationConnectors, { id: crypto.randomUUID(), name: 'ERP Connector', type: 'webhook', config: {}, enabled: true }])}>
                  <Plus className="w-3 h-3 mr-1" /> Add Action Connector
                </Button>
              </div>

              {integrationConnectors.map((c, i) => (
                <div key={c.id} className="p-4 rounded-xl border border-border bg-muted/20 space-y-3 group/conn">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                        <Zap className="w-4 h-4" />
                      </div>
                      <Input value={c.name} onChange={e => {
                        const updated = [...integrationConnectors];
                        updated[i].name = e.target.value;
                        setIntegrationConnectors(updated);
                      }} className="h-8 text-xs bg-card w-48" />
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover/conn:opacity-100"
                      onClick={() => setIntegrationConnectors(integrationConnectors.filter((_, idx) => idx !== i))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <Select value={c.type} onValueChange={(val: any) => {
                       const updated = [...integrationConnectors];
                       updated[i].type = val;
                       setIntegrationConnectors(updated);
                     }}>
                       <SelectTrigger className="h-8 text-[10px] bg-card"><SelectValue /></SelectTrigger>
                       <SelectContent className="bg-popover border-border">
                         <SelectItem value="sap">SAP</SelectItem>
                         <SelectItem value="odoo">Odoo</SelectItem>
                         <SelectItem value="webhook">Webhook</SelectItem>
                       </SelectContent>
                     </Select>
                     <Input placeholder="Endpoint/URL" value={c.config.url || ''} onChange={e => {
                        const updated = [...integrationConnectors];
                        updated[i].config.url = e.target.value;
                        setIntegrationConnectors(updated);
                     }} className="h-8 text-[10px] bg-card font-mono" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-border flex justify-end">
           <Button variant="outline" size="lg" onClick={handleSave} disabled={isSaving} className="border-border hover:border-primary/50 text-foreground">
             {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
             Save Automation Profile
           </Button>
        </div>
      </motion.div>
    </div>
  );
}
