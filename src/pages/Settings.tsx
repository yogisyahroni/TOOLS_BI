import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, Key, Bot, Save, AlertCircle, CheckCircle, Check, 
  ChevronsUpDown, RefreshCw, Loader2, Globe, ShieldCheck, 
  Trash2, Lock, Plus, Mail, MessageSquare, Send, 
  Share2, ExternalLink, Zap, Radio, Cpu 
} from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { AIProvider } from '@/types/data';
import { cn } from '@/lib/utils';
import { aiProviders, fetchOpenRouterModels, type ModelOption } from '@/lib/aiProviders';
import { api } from '@/lib/api';

/**
 * SECURITY ARCHITECTURE — Settings Page AI Config:
 * 1. API key encrypted server-side with AES-256-GCM.
 * 2. Key never appears in browser Network tab during AI generations.
 * 3. Proactive Autonomous analysis destinations (WA/Telegram/ERP) configured here.
 */

interface BackendAIConfig {
  configured: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  hasApiKey: boolean;
  hasTelegramToken: boolean;
  hasWhatsAppInstance: boolean;
  hasWhatsAppToken: boolean;
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

  // ── Core AI State ──────────────────────────────────────────────────────────
  const [provider, setProvider] = useState<AIProvider>('openrouter');
  const [model, setModel] = useState('google/gemma-3-27b-it:free');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);

  // ── v2.0 Autonomous State ──────────────────────────────────────────────────
  const [notificationTargets, setNotificationTargets] = useState<NotificationTarget[]>([]);
  const [integrationConnectors, setIntegrationConnectors] = useState<IntegrationConnector[]>([]);

  // -- Global Channel Credentials --
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');
  const [whatsappToken, setWhatsappToken] = useState('');

  // ── Status State ──────────────────────────────────────────────────────────
  const [backendConfig, setBackendConfig] = useState<BackendAIConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── UI UI UI — THE BEAUTY ──────────────────────────────────────────────────
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [dynamicModels, setDynamicModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [useDynamic, setUseDynamic] = useState(false);
  const [activeTab, setActiveTab] = useState('intelligence');

  const selectedProvider = aiProviders.find(p => p.value === provider);
  const currentModels = useDynamic && dynamicModels.length > 0 ? dynamicModels : (selectedProvider?.models || []);
  const selectedModel = currentModels.find(m => m.value === model);

  // Load configuration
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
          hasTelegramToken: false,
          hasWhatsAppInstance: false,
          hasWhatsAppToken: false,
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
      toast({ title: 'Models synced', description: `${models.length} models retrieved from cloud.` });
    }
    setIsLoadingModels(false);
  }, [toast]);

  const handleSave = async () => {
    if (!backendConfig?.hasApiKey && !apiKey) {
      toast({ title: 'Security Warning', description: 'Please provide an API key to activate AI services.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const body: any = { 
        provider, 
        model, 
        baseUrl, 
        maxTokens, 
        temperature, 
        notificationTargets, 
        integrationConnectors,
        telegramBotToken,
        whatsappInstanceId,
        whatsappToken
      };
      if (apiKey) body.apiKey = apiKey;

      const { data } = await api.put<BackendAIConfig>('/settings/ai-config', body);
      setBackendConfig({ 
        ...data, 
        provider, 
        model, 
        baseUrl, 
        maxTokens, 
        temperature, 
        notificationTargets, 
        integrationConnectors
      });
      setApiKey('');
      setTelegramBotToken('');
      setWhatsappInstanceId('');
      setWhatsappToken('');
      toast({ title: '🔒 Core state updated', description: 'Changes committed and encrypted on secure hardware.' });
    } catch (err: any) {
      toast({ title: 'Commit Failed', description: err?.response?.data?.error || 'Unknown network error', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete('/settings/ai-config');
      setBackendConfig(prev => prev ? { ...prev, configured: false, hasApiKey: false, notificationTargets: [], integrationConnectors: [] } : null);
      setApiKey('');
      setNotificationTargets([]);
      setIntegrationConnectors([]);
      toast({ title: 'Purge Complete', description: 'All encrypted keys and profiles wiped from primary storage.' });
    } catch {
      toast({ title: 'Purge Failed', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background/50 backdrop-blur-xl">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground animate-pulse">Initializing Security Decryption...</p>
        </div>
      </div>
    );
  }

  const freeModels = currentModels.filter(m => m.free);
  const paidModels = currentModels.filter(m => !m.free);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-32">
      {/* Header — Premium Glassmorphism */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-glow-primary transform hover:rotate-6 transition-transform">
            <Settings className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-foreground flex items-center gap-2">
              System Configuration
              <HelpTooltip text="Kelola arsitektur AI dan jalur distribusi otonom Anda dari pusat kontrol ini." />
            </h1>
            <p className="text-muted-foreground font-medium">Configure Intelligence Engine and Autonomous Delivery Protocol</p>
          </div>
        </div>
        <div className="hidden md:block px-4 py-2 rounded-full border border-border bg-card/40 backdrop-blur-md text-[10px] font-bold tracking-widest uppercase text-muted-foreground animate-pulse">
           Status: Enclave Active 🔒
        </div>
      </motion.div>

      {/* TABS ARCHITECTURE */}
      <Tabs defaultValue="intelligence" className="w-full" onValueChange={setActiveTab}>
        <div className="flex justify-center mb-8">
          <TabsList className="grid w-full max-w-[500px] grid-cols-2 bg-muted/40 p-1 rounded-2xl border border-border">
            <TabsTrigger value="intelligence" className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-lg py-3 flex items-center gap-2">
              <Cpu className="w-4 h-4" /> AI Intelligence
            </TabsTrigger>
            <TabsTrigger value="autonomous" className="rounded-xl data-[state=active]:bg-card data-[state=active]:shadow-lg py-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Autonomous & Actions
            </TabsTrigger>
          </TabsList>
        </div>

        <AnimatePresence mode="wait">
          {/* TAB 1: AI INTELLIGENCE — THE RICH ORIGINAL UI */}
          <TabsContent value="intelligence">
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.3 }} className="space-y-8">
              
              {/* Security info banner from original */}
              <div className="p-6 rounded-2xl bg-success/5 border border-success/10 flex items-start gap-4">
                 <ShieldCheck className="w-6 h-6 text-success shrink-0 mt-1" />
                 <div>
                   <h4 className="text-lg font-bold text-foreground">Zero-Exposure Key Storage</h4>
                   <p className="text-sm text-muted-foreground mt-1">
                     Kunci API Anda akan dienkripsi dengan <strong>AES-256-GCM</strong> sebelum disimpan di database backend. 
                     Panggilan AI diproses melalui proxy server kami, sehingga kunci API asli <strong>tidak akan pernah muncul di tab Network DevTools browser</strong> Anda saat pemrosesan laporan berlangsung.
                   </p>
                 </div>
              </div>

              {/* Original Core AI Configuration Card */}
              <div className="bg-card rounded-2xl p-8 border border-border shadow-soft group">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                      <Bot className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">Intelligence Engine</h3>
                      <p className="text-sm text-muted-foreground">Select your LLM brain and operational profile</p>
                    </div>
                  </div>
                  {backendConfig?.configured && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                      onClick={handleDelete} disabled={isDeleting}>
                      {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                      Purge Configuration
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 opacity-80">
                      Primary AI Provider
                    </Label>
                    <Select value={provider} onValueChange={(val: AIProvider) => setProvider(val)}>
                      <SelectTrigger className="h-12 bg-muted/20 border-border group-hover:border-primary/50 transition-all rounded-xl">
                        <SelectValue placeholder="Identify provider" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover backdrop-blur-2xl border-border rounded-xl">
                        {aiProviders.map(p => (
                          <SelectItem key={p.value} value={p.value} className="py-3 px-4 focus:bg-primary/5 focus:text-primary transition-colors cursor-pointer">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold">{p.label}</span>
                              <span className="text-[10px] opacity-60 font-medium italic">{p.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold opacity-80">LLM Model Profile</Label>
                      {selectedProvider?.supportsAutoUpdate && (
                        <button onClick={loadOpenRouterModels} disabled={isLoadingModels}
                          className="text-[10px] uppercase tracking-tighter font-black text-primary hover:brightness-125 transition-all flex items-center gap-1">
                          {isLoadingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {isLoadingModels ? 'Syncing...' : 'Autosync Cloud'}
                        </button>
                      )}
                    </div>
                    <Popover open={modelOpen} onOpenChange={setModelOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full h-12 justify-between bg-muted/20 border-border hover:bg-muted/30 transition-all rounded-xl font-normal overflow-hidden group">
                           <div className="flex items-center gap-2 truncate">
                              {selectedModel ? (
                                <>
                                  <span className="font-bold">{selectedModel.label}</span>
                                  {selectedModel.free && <span className="px-1.5 py-0.5 text-[8px] font-black bg-success/20 text-success rounded uppercase tracking-widest">Free</span>}
                                </>
                              ) : <span className="text-muted-foreground">{model || "Select Model..."}</span>}
                           </div>
                           <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0 bg-popover/90 backdrop-blur-2xl border-border shadow-2xl rounded-2xl overflow-hidden mt-2" align="start">
                        <Command className="bg-transparent">
                          <CommandInput placeholder="Search intelligence library..." className="h-12 border-none px-4" />
                          <CommandList className="max-h-[350px] custom-scrollbar p-1">
                            <CommandEmpty>Library entry not found.</CommandEmpty>
                            <CommandGroup heading="✏️ Custom Target">
                               <div className="px-2 py-2 flex gap-2">
                                  <Input placeholder="Enter Model ID (e.g. gpt-4o)" value={customModel} 
                                    onChange={e => setCustomModel(e.target.value)} className="h-9 bg-card text-xs rounded-lg"
                                    onKeyDown={e => { if(e.key === 'Enter' && customModel.trim()){ setModel(customModel.trim()); setCustomModel(''); setModelOpen(false); } }} />
                                  <Button size="sm" className="h-9 w-9 p-0 rounded-lg" disabled={!customModel.trim()}
                                    onClick={() => { setModel(customModel.trim()); setCustomModel(''); setModelOpen(false); }}>
                                    <Plus className="w-4 h-4" />
                                  </Button>
                               </div>
                            </CommandGroup>
                            {freeModels.length > 0 && (
                              <CommandGroup heading="🆓 Free Utility Models">
                                {freeModels.map(m => (
                                  <CommandItem key={m.value} onSelect={() => { setModel(m.value); setModelOpen(false); }} className="rounded-lg py-2.5 px-3 cursor-pointer mb-0.5">
                                    <Check className={cn('mr-3 h-4 w-4 text-primary transition-all', model === m.value ? 'scale-100 opacity-100' : 'scale-0 opacity-0')} />
                                    <div className="flex-1 flex items-center justify-between">
                                      <span className={cn('font-medium', model === m.value && 'font-bold text-primary')}>{m.label}</span>
                                      <span className="text-[9px] font-black bg-success/15 text-success px-1.5 py-0.5 rounded tracking-widest">FREE</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            <CommandGroup heading="💎 Global Standard Models">
                                {paidModels.map(m => (
                                  <CommandItem key={m.value} onSelect={() => { setModel(m.value); setModelOpen(false); }} className="rounded-lg py-2.5 px-3 cursor-pointer mb-0.5">
                                    <Check className={cn('mr-3 h-4 w-4 text-primary transition-all', model === m.value ? 'scale-100 opacity-100' : 'scale-0 opacity-0')} />
                                    <span className={cn('font-medium', model === m.value && 'font-bold text-primary')}>{m.label}</span>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="md:col-span-2 space-y-4 pt-4">
                    <Label className="text-sm font-bold flex items-center gap-2 opacity-90">
                      <Key className="w-4 h-4 text-primary" /> API Access Key
                      {backendConfig?.hasApiKey && (
                        <span className="text-[9px] uppercase tracking-widest font-black text-success px-2 py-0.5 rounded-full bg-success/10 border border-success/20">
                          Encrypted Profile Active 🔒
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                       <Input type={apiKeyVisible ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                         placeholder={backendConfig?.hasApiKey ? "•••••••••••••••••••••••••••• (Leave blank to keep existing encrypted key)" : "Insert Primary API Key"}
                         className="h-12 bg-muted/20 border-border font-mono rounded-xl focus:ring-primary focus:border-primary transition-all" />
                       <Button variant="outline" className="h-12 px-6 rounded-xl border-border bg-card/50" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
                         {apiKeyVisible ? 'Hide Proxy' : 'Show Proxy'}
                       </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-semibold opacity-70">Custom Base Endpoint (Advanced)</Label>
                    <Input placeholder="https://api.domain.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                      className="h-11 bg-muted/20 border-border rounded-xl" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold opacity-70">Max Generation Tokens</Label>
                      <Input type="number" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value) || 4096)}
                         className="h-11 bg-muted/20 border-border rounded-xl text-center font-bold" />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold opacity-70">Generation Temperature</Label>
                      <Input type="number" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value) || 0.7)}
                         className="h-11 bg-muted/20 border-border rounded-xl text-center font-bold" />
                    </div>
                  </div>
                </div>

                <div className="mt-10 pt-8 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     {backendConfig?.configured ? (
                       <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-xs font-bold border border-success/20 animate-in fade-in zoom-in duration-500">
                          <CheckCircle className="w-4 h-4" />
                          Engine Ready: {aiProviders.find(p => p.value === backendConfig.provider)?.label}
                       </div>
                     ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning/10 text-warning text-xs font-bold border border-warning/20">
                          <AlertCircle className="w-4 h-4" />
                          Engine Standby — Configuration Required
                        </div>
                     )}
                  </div>
                  <Button onClick={handleSave} disabled={isSaving} size="lg" className="gradient-primary text-primary-foreground font-extrabold px-12 h-14 rounded-2xl shadow-glow-primary hover:scale-[1.02] active:scale-[0.98] transition-all">
                     {isSaving ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Committing Changes...</> : <><Save className="w-5 h-5 mr-3" /> Save Intelligence Config</>}
                  </Button>
                </div>
              </div>

              {/* RESTORED: Provider Selection Cards Grid */}
              <div className="relative">
                 <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-6 bg-primary rounded-full" />
                    <h4 className="text-xl font-bold tracking-tight">Access Hub: Supported Intelligence Providers</h4>
                 </div>
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {aiProviders.map(p => (
                      <motion.button key={p.value} whileHover={{ y: -5, scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={() => { setProvider(p.value); setModel(p.models[0]?.value || ''); setUseDynamic(false); }}
                        className={cn(
                          'p-5 rounded-2xl border text-left transition-all relative overflow-hidden group shadow-soft',
                          provider === p.value ? 'border-primary bg-primary/10 shadow-glow' : 'border-border bg-card/60 hover:border-primary/40'
                        )}>
                        <p className={cn('font-bold text-sm tracking-tighter', provider === p.value ? 'text-primary' : 'text-foreground')}>
                          {p.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 font-medium italic">
                           {p.models.length} profiles{p.supportsAutoUpdate ? ' + dynamic' : ''}
                        </p>
                        {provider === p.value && (
                          <div className="absolute top-2 right-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                          </div>
                        )}
                      </motion.button>
                    ))}
                 </div>
              </div>

              {/* RESTORED: Detailed Security Info Card */}
              <div className="bg-muted/30 p-8 rounded-3xl border border-border shadow-inner">
                 <div className="flex items-center gap-3 mb-6">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                    <h5 className="font-extrabold text-foreground">Cyber-Hardened Architecture Protocol</h5>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { icon: <Lock />, title: "End-to-End Encryption", desc: "Kunci API dienkripsi di level data-at-rest menggunakan AES-256-GCM grade militer." },
                      { icon: <ShieldCheck />, title: "Backend Proxy Layer", desc: "API key tidak pernah dipancarkan ke browser. Semua auth terjadi di server yang aman." },
                      { icon: <RefreshCw />, title: "Token Rotation Friendly", desc: "Ubah atau hapus kunci kapan saja. Redundansi database aman untuk rotasi berkala." }
                    ].map((item, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="text-primary w-5 h-5 mb-2">{item.icon}</div>
                        <h6 className="font-bold text-sm">{item.title}</h6>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                 </div>
              </div>

            </motion.div>
          </TabsContent>

          {/* TAB 2: AUTONOMOUS DELIVERY — THE NEW v2.0 FEATURES */}
          <TabsContent value="autonomous">
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3 }} className="space-y-8">
              
              <div className="bg-card rounded-2xl p-8 border border-border shadow-soft relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-40 group-hover:scale-125 transition-transform duration-1000">
                  <Zap className="w-20 h-20 text-primary rotate-12" />
                </div>

                <div className="flex items-center gap-4 mb-12">
                   <div className="w-14 h-14 rounded-2xl bg-success/15 flex items-center justify-center border border-success/20">
                      <Share2 className="w-7 h-7 text-success" />
                   </div>
                   <div>
                      <h3 className="text-2xl font-extrabold tracking-tight text-foreground">Autonomous Delivery Protocol</h3>
                      <p className="text-muted-foreground font-medium">Instruksikan AI untuk mengirimkan hasil analisis ke kanal pilihan Anda secara mandiri.</p>
                   </div>
                </div>

                {/* NEW: Global Channel Credentials */}
                <div className="mb-12 p-6 rounded-2xl bg-primary/5 border border-primary/10 space-y-6">
                   <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      <h4 className="font-bold text-foreground italic">Global Channel Credentials (Sender Config)</h4>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                         <Label className="text-xs font-bold opacity-70 flex items-center justify-between">
                             <span className="flex items-center gap-1">
                                Telegram Bot Token
                                <HelpTooltip text="Dapatkan Token Bot dari @BotFather di Telegram untuk mengaktifkan pengiriman pesan otomatis melalui bot Anda sendiri." />
                             </span>
                            {backendConfig?.hasTelegramToken && <span className="text-success text-[10px] uppercase font-black tracking-widest">Saved 🔒</span>}
                         </Label>
                         <Input type="password" placeholder={backendConfig?.hasTelegramToken ? "••••••••••••••••" : "Insert Bot Token (from @BotFather)"}
                            value={telegramBotToken} onChange={e => setTelegramBotToken(e.target.value)}
                            className="h-10 bg-card border-border rounded-xl text-xs font-mono" />
                      </div>
                      <div className="space-y-3">
                         <Label className="text-xs font-bold opacity-70 flex items-center justify-between">
                             <span className="flex items-center gap-1">
                                WhatsApp Instance ID
                                <HelpTooltip text="Gunakan 'Instance ID' dari panel Green-API (green-api.com) untuk menghubungkan instance pengirim." />
                             </span>
                            {backendConfig?.hasWhatsAppInstance && <span className="text-success text-[10px] uppercase font-black tracking-widest">Saved 🔒</span>}
                         </Label>
                         <Input placeholder={backendConfig?.hasWhatsAppInstance ? "Instance Active" : "Green-API Instance ID"}
                            value={whatsappInstanceId} onChange={e => setWhatsappInstanceId(e.target.value)}
                            className="h-10 bg-card border-border rounded-xl text-xs" />
                      </div>
                      <div className="space-y-3 md:col-span-2">
                         <Label className="text-xs font-bold opacity-70 flex items-center justify-between">
                             <span className="flex items-center gap-1">
                                WhatsApp API Token
                                <HelpTooltip text="Salin 'API Token' dari konsol Green-API Anda untuk otentikasi pengiriman pesan WhatsApp." />
                             </span>
                            {backendConfig?.hasWhatsAppToken && <span className="text-success text-[10px] uppercase font-black tracking-widest">Saved 🔒</span>}
                         </Label>
                         <Input type="password" placeholder={backendConfig?.hasWhatsAppToken ? "••••••••••••••••" : "Green-API Token"}
                            value={whatsappToken} onChange={e => setWhatsappToken(e.target.value)}
                            className="h-10 bg-card border-border rounded-xl text-xs font-mono" />
                      </div>
                   </div>
                   <p className="text-[10px] text-muted-foreground font-medium">
                      *Kredensial di atas digunakan sebagai akun pengirim. Anda hanya perlu mengkonfigurasi ini sekali.
                   </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                   {/* Channels List */}
                   <div className="space-y-6">
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                         <h4 className="text-xs font-black uppercase tracking-widest text-foreground/40 flex items-center gap-2">
                            <Radio className="w-4 h-4" /> Active Delivery Channels
                         </h4>
                         <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase rounded-lg border-dashed hover:border-primary"
                           onClick={() => setNotificationTargets([...notificationTargets, { type: 'whatsapp', target: '', name: 'Management Lead', enabled: true }])}>
                           <Plus className="w-3.5 h-3.5 mr-1" /> Add Channel
                         </Button>
                      </div>

                      <div className="space-y-5">
                         {notificationTargets.length === 0 ? (
                           <div className="py-20 border-2 border-dashed border-border rounded-2xl bg-muted/5 flex flex-col items-center justify-center text-center">
                              <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-4 text-muted-foreground">
                                 <Send className="w-6 h-6" />
                              </div>
                              <p className="text-sm font-bold opacity-60">No destinations configured</p>
                              <p className="text-[10px] opacity-40 max-w-xs mt-1 italic">Reports will be restricted to the secure dashboard internal view.</p>
                           </div>
                         ) : (
                           notificationTargets.map((t, idx) => (
                             <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={idx} 
                               className="p-5 rounded-2xl border border-border bg-card/50 flex items-center gap-5 hover:border-primary/40 transition-all hover:shadow-lg relative overflow-hidden group/item">
                               <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm", 
                                 t.type === 'whatsapp' ? 'bg-green-500/10 text-green-500 shadow-green-500/10' : 
                                 t.type === 'telegram' ? 'bg-blue-500/10 text-blue-500 shadow-blue-500/10' : 
                                 'bg-orange-500/10 text-orange-500 shadow-orange-500/10')}>
                                 {t.type === 'whatsapp' ? <MessageSquare className="w-6 h-6" /> : 
                                  t.type === 'telegram' ? <Send className="w-6 h-6" /> : <Mail className="w-6 h-6" />}
                               </div>
                               <div className="flex-1 min-w-0 space-y-2">
                                  <div className="flex gap-2">
                                     <Select value={t.type} onValueChange={(val: any) => {
                                       const update = [...notificationTargets];
                                       update[idx].type = val;
                                       setNotificationTargets(update);
                                     }}>
                                       <SelectTrigger className="h-9 w-28 bg-muted/20 border-border text-[11px] font-bold rounded-lg"><SelectValue /></SelectTrigger>
                                       <SelectContent className="bg-popover border-border backdrop-blur-3xl rounded-xl">
                                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                          <SelectItem value="telegram">Telegram</SelectItem>
                                          <SelectItem value="email">Email</SelectItem>
                                       </SelectContent>
                                     </Select>
                                     <Input placeholder="Destination Name" value={t.name} onChange={e => {
                                        const update = [...notificationTargets];
                                        update[idx].name = e.target.value;
                                        setNotificationTargets(update);
                                     }} className="h-9 text-[11px] bg-muted/20 border-border rounded-lg font-bold" />
                                  </div>
                                  <Input placeholder={t.type === 'email' ? 'email@domain.com' : 'Target Identifier / Phone'} value={t.target}
                                     onChange={e => {
                                        const update = [...notificationTargets];
                                        update[idx].target = e.target.value;
                                        setNotificationTargets(update);
                                     }} className="h-9 text-[11px] font-mono bg-muted/20 border-border rounded-lg" />
                               </div>
                               <div className="flex flex-col gap-1">
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-primary hover:bg-primary/10 rounded-lg group-hover/item:scale-110 transition-transform"
                                    onClick={async () => {
                                       try {
                                         const { data } = await api.post('/settings/test-notification', { type: t.type, target: t.target });
                                         toast({ title: 'Signal Dispatched', description: data.message });
                                       } catch {
                                         toast({ title: 'Signal Lost', variant: 'destructive' });
                                       }
                                    }}>
                                    <Zap className="w-5 h-5 fill-primary/20" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover/item:opacity-100 transition-opacity"
                                    onClick={() => setNotificationTargets(notificationTargets.filter((_, i) => i !== idx))}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                               </div>
                             </motion.div>
                           ))
                         )}
                      </div>
                   </div>

                   {/* ERP/Action Connectors */}
                   <div className="space-y-6">
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                         <h4 className="text-xs font-black uppercase tracking-widest text-foreground/40 flex items-center gap-2">
                            <ExternalLink className="w-4 h-4" /> Intelligence Bridge (SAP/Odoo)
                         </h4>
                         <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase rounded-lg border-dashed hover:border-primary"
                           onClick={() => setIntegrationConnectors([...integrationConnectors, { id: crypto.randomUUID(), name: 'ERP Master Connector', type: 'webhook', config: {}, enabled: true }])}>
                           <Plus className="w-3.5 h-3.5 mr-1" /> New Connector
                         </Button>
                      </div>

                      <div className="space-y-5">
                         <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/10 opacity-80 backdrop-blur-sm">
                            <p className="text-xs text-muted-foreground leading-relaxed leading-6 font-medium">
                               Konfigurasikan jalur integrasi ke sistem ERP Anda. AI akan memicu tindakan (seperti pembuatan Purchase Order atau penyesuaian Stok) 
                               saat deteksi kausalitas menemukan ketidakefisienan yang dapat diperbaiki.
                            </p>
                         </div>

                         {integrationConnectors.map((c, i) => (
                           <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} key={c.id} 
                             className="p-6 rounded-2xl border border-border bg-card/50 shadow-inner group/conn relative overflow-hidden">
                             <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                                      <Zap className="w-5 h-5" />
                                   </div>
                                   <Input value={c.name} onChange={e => {
                                      const update = [...integrationConnectors];
                                      update[i].name = e.target.value;
                                      setIntegrationConnectors(update);
                                   }} className="h-9 text-xs font-black bg-muted/20 border-border w-56 rounded-lg" />
                                </div>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover/conn:opacity-100"
                                  onClick={() => setIntegrationConnectors(integrationConnectors.filter((_, idx) => idx !== i))}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                                <Select value={c.type} onValueChange={(val: any) => {
                                  const update = [...integrationConnectors];
                                  update[i].type = val;
                                  setIntegrationConnectors(update);
                                }}>
                                   <SelectTrigger className="h-10 bg-muted/20 border-border rounded-lg text-[10px] font-black uppercase tracking-widest leading-none p-4"><SelectValue /></SelectTrigger>
                                   <SelectContent className="bg-popover border-border backdrop-blur-3xl rounded-xl">
                                      <SelectItem value="sap">SAP Module</SelectItem>
                                      <SelectItem value="odoo">Odoo Connector</SelectItem>
                                      <SelectItem value="webhook">REST Webhook</SelectItem>
                                   </SelectContent>
                                </Select>
                                <Input placeholder="Secure Endpoint URL" value={c.config.url || ''} onChange={e => {
                                   const update = [...integrationConnectors];
                                   update[i].config.url = e.target.value;
                                   setIntegrationConnectors(update);
                                }} className="h-10 bg-muted/20 border-border rounded-lg text-xs font-mono" />
                             </div>
                           </motion.div>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="mt-14 pt-10 border-t border-border flex items-center justify-between">
                   <div className="text-[10px] font-bold text-muted-foreground flex items-center gap-2 opacity-50 uppercase tracking-widest">
                      <Radio className="w-3 h-3" /> Autonomous Strategy Synchronization: Encrypted
                   </div>
                   <Button onClick={handleSave} disabled={isSaving} size="lg" className="h-14 px-10 bg-card border border-border hover:border-primary/50 text-foreground rounded-2xl shadow-xl hover:shadow-primary/5 transition-all">
                      {isSaving ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : <Save className="w-4 h-4 mr-3" />}
                      Finalize & Persist Strategy
                   </Button>
                </div>
              </div>

            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
