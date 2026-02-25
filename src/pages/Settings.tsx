import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings, Key, Bot, Save, AlertCircle, CheckCircle, Search, Check, ChevronsUpDown, RefreshCw, Loader2, Globe } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import type { AIConfig, AIProvider } from '@/types/data';
import { cn } from '@/lib/utils';
import { HelpTooltip } from '@/components/HelpTooltip';
import { aiProviders, fetchOpenRouterModels, type ModelOption } from '@/lib/aiProviders';

export default function SettingsPage() {
  const { aiConfig, setAIConfig } = useDataStore();
  const { toast } = useToast();
  
  const [config, setConfig] = useState<Partial<AIConfig>>(aiConfig || {
    provider: 'openrouter',
    model: 'google/gemma-3-27b-it:free',
    apiKey: '',
    maxTokens: 4096,
    temperature: 0.7,
  });

  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');
  
  // Auto-update state for OpenRouter
  const [dynamicModels, setDynamicModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [useDynamic, setUseDynamic] = useState(false);

  const selectedProvider = aiProviders.find((p) => p.value === config.provider);
  const currentModels = useDynamic && dynamicModels.length > 0 ? dynamicModels : (selectedProvider?.models || []);
  const selectedModel = currentModels.find((m) => m.value === config.model);

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

  // Auto-fetch OpenRouter models on provider change
  useEffect(() => {
    if (config.provider === 'openrouter' && dynamicModels.length === 0) {
      // Don't auto-fetch, let user click refresh
      setUseDynamic(false);
    } else if (config.provider !== 'openrouter') {
      setUseDynamic(false);
    }
  }, [config.provider, dynamicModels.length]);

  const handleSave = () => {
    if (!config.apiKey) {
      toast({ title: 'API Key Required', description: 'Please enter your AI provider API key.', variant: 'destructive' });
      return;
    }
    setAIConfig(config as AIConfig);
    toast({ title: 'Settings saved', description: 'Your AI configuration has been updated.' });
  };

  const freeModels = currentModels.filter(m => m.free);
  const paidModels = currentModels.filter(m => !m.free);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Settings className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Settings <HelpTooltip text="Konfigurasi koneksi AI: pilih provider (OpenAI, Gemini, NVIDIA, dll), masukkan API Key, dan pilih model. API Key disimpan lokal di browser." /></h1>
            <p className="text-muted-foreground">Configure your AI integration and preferences</p>
          </div>
        </div>
      </motion.div>

      {/* AI Configuration */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">AI Configuration</h3>
            <p className="text-sm text-muted-foreground">Connect your preferred AI provider — 11 providers supported</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Provider Select */}
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select
              value={config.provider}
              onValueChange={(value: AIProvider) => {
                const provider = aiProviders.find((p) => p.value === value);
                setConfig({ ...config, provider: value, model: provider?.models[0]?.value });
                setUseDynamic(false);
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-[350px]">
                {aiProviders.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    <div className="flex items-center gap-2">
                      <span>{provider.label}</span>
                      <span className="text-[10px] text-muted-foreground">— {provider.description}</span>
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={loadOpenRouterModels}
                  disabled={isLoadingModels}
                >
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
                        {selectedModel.free && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded">FREE</span>
                        )}
                      </>
                    ) : config.model ? (
                      <span className="text-muted-foreground">{config.model}</span>
                    ) : (
                      "Select model..."
                    )}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[450px] p-0 bg-popover border-border" align="start">
                <Command className="bg-transparent">
                  <CommandInput placeholder="Cari model..." className="border-b border-border" />
                  <CommandList className="max-h-[350px]">
                    <CommandEmpty>Model tidak ditemukan.</CommandEmpty>

                    {/* Custom model input */}
                    <CommandGroup heading="✏️ Custom Model">
                      <div className="px-2 py-1.5 flex gap-2">
                        <Input
                          placeholder="Ketik model ID custom..."
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          className="h-8 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customModel.trim()) {
                              setConfig({ ...config, model: customModel.trim() });
                              setCustomModel('');
                              setModelOpen(false);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={!customModel.trim()}
                          onClick={() => {
                            setConfig({ ...config, model: customModel.trim() });
                            setCustomModel('');
                            setModelOpen(false);
                          }}
                        >
                          Set
                        </Button>
                      </div>
                    </CommandGroup>

                    {/* Free models */}
                    {freeModels.length > 0 && (
                      <CommandGroup heading="🆓 Free Models">
                        {freeModels.map((model) => (
                          <CommandItem
                            key={model.value}
                            value={model.label}
                            onSelect={() => {
                              setConfig({ ...config, model: model.value });
                              setModelOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <Check className={cn("mr-2 h-4 w-4", config.model === model.value ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1 truncate">{model.label}</span>
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded">FREE</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {/* Paid models */}
                    {paidModels.length > 0 && (
                      <CommandGroup heading={freeModels.length > 0 ? "💎 Premium Models" : "📦 Models"}>
                        {paidModels.map((model) => (
                          <CommandItem
                            key={model.value}
                            value={model.label}
                            onSelect={() => {
                              setConfig({ ...config, model: model.value });
                              setModelOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <Check className={cn("mr-2 h-4 w-4", config.model === model.value ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{model.label}</span>
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
              <Key className="w-4 h-4" />
              API Key
            </Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type={apiKeyVisible ? 'text' : 'password'}
                placeholder="Enter your API key"
                value={config.apiKey || ''}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                className="flex-1"
              />
              <Button variant="outline" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
                {apiKeyVisible ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Your API key is stored locally and never sent to our servers
            </p>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              value={config.maxTokens}
              onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) || 4096 })}
              min={100}
              max={128000}
            />
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              type="number"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0.7 })}
              min={0}
              max={2}
            />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {aiConfig ? (
              <>
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="text-sm text-muted-foreground">
                  Connected to {aiProviders.find((p) => p.value === aiConfig.provider)?.label}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-warning" />
                <span className="text-sm text-muted-foreground">No AI provider configured</span>
              </>
            )}
          </div>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </motion.div>

      {/* Provider Cards */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <h4 className="font-semibold text-foreground mb-4">Supported Providers ({aiProviders.length})</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {aiProviders.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                const provider = aiProviders.find(pr => pr.value === p.value);
                setConfig({ ...config, provider: p.value, model: provider?.models[0]?.value });
                setUseDynamic(false);
              }}
              className={cn(
                "p-3 rounded-lg border text-left transition-all hover:shadow-md",
                config.provider === p.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <p className="font-medium text-sm text-foreground">{p.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{p.models.length} model{p.supportsAutoUpdate ? ' + auto-update' : ''}</p>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Info Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="bg-muted/50 rounded-xl p-6 border border-border">
        <h4 className="font-semibold text-foreground mb-3">About AI Integration</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5" />
            Your data is processed securely and never used for AI training
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5" />
            All communications are encrypted with TLS 1.3
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5" />
            Privacy settings are applied before sending data to AI
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5" />
            API keys are stored locally in your browser
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5" />
            OpenRouter supports auto-update model list dari API resmi
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success mt-0.5" />
            11 provider didukung: OpenAI, Anthropic, Google, NVIDIA, Moonshot, Groq, Together, Mistral, Cohere, DeepSeek, OpenRouter
          </li>
        </ul>
      </motion.div>
    </div>
  );
}
