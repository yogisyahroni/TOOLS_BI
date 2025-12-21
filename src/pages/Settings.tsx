import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Key, Bot, Save, AlertCircle, CheckCircle, Search, Check, ChevronsUpDown } from 'lucide-react';
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
import type { AIConfig } from '@/types/data';
import { cn } from '@/lib/utils';

interface ModelOption {
  value: string;
  label: string;
  free?: boolean;
}

const aiProviders: { value: AIConfig['provider']; label: string; models: ModelOption[] }[] = [
  { 
    value: 'openai', 
    label: 'OpenAI', 
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ] 
  },
  { 
    value: 'anthropic', 
    label: 'Anthropic', 
    models: [
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ] 
  },
  { 
    value: 'google', 
    label: 'Google AI', 
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ] 
  },
  { 
    value: 'openrouter', 
    label: 'OpenRouter', 
    models: [
      // Free Models
      { value: 'google/gemma-3-27b-it:free', label: 'Google Gemma 3 27B', free: true },
      { value: 'google/gemma-3-12b-it:free', label: 'Google Gemma 3 12B', free: true },
      { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', free: true },
      { value: 'meta-llama/llama-3.2-11b-vision-instruct:free', label: 'Llama 3.2 11B Vision', free: true },
      { value: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B', free: true },
      { value: 'meta-llama/llama-3.2-1b-instruct:free', label: 'Llama 3.2 1B', free: true },
      { value: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B', free: true },
      { value: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B', free: true },
      { value: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B', free: true },
      { value: 'qwen/qwen3-32b:free', label: 'Qwen 3 32B', free: true },
      { value: 'qwen/qwen3-14b:free', label: 'Qwen 3 14B', free: true },
      { value: 'qwen/qwen3-8b:free', label: 'Qwen 3 8B', free: true },
      { value: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1 24B', free: true },
      { value: 'mistralai/mistral-nemo:free', label: 'Mistral Nemo', free: true },
      { value: 'microsoft/phi-4:free', label: 'Microsoft Phi-4', free: true },
      { value: 'microsoft/phi-3-medium-128k-instruct:free', label: 'Microsoft Phi-3 Medium', free: true },
      { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', free: true },
      { value: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek Chat V3', free: true },
      { value: 'nvidia/llama-3.1-nemotron-70b-instruct:free', label: 'Nvidia Nemotron 70B', free: true },
      { value: 'openchat/openchat-7b:free', label: 'OpenChat 7B', free: true },
      { value: 'huggingfaceh4/zephyr-7b-beta:free', label: 'Zephyr 7B', free: true },
      { value: 'undi95/toppy-m-7b:free', label: 'Toppy M 7B', free: true },
      { value: 'gryphe/mythomist-7b:free', label: 'MythoMist 7B', free: true },
      
      // Paid Premium Models
      { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
      { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
      { value: 'openai/gpt-4-turbo', label: 'OpenAI GPT-4 Turbo' },
      { value: 'openai/o1-preview', label: 'OpenAI O1 Preview' },
      { value: 'openai/o1-mini', label: 'OpenAI O1 Mini' },
      { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
      { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku' },
      { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
      { value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
      { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (Paid)' },
      { value: 'meta-llama/llama-3.1-405b-instruct', label: 'Llama 3.1 405B' },
      { value: 'mistralai/mistral-large-2411', label: 'Mistral Large' },
      { value: 'mistralai/mixtral-8x22b-instruct', label: 'Mixtral 8x22B' },
      { value: 'cohere/command-r-plus', label: 'Cohere Command R+' },
      { value: 'cohere/command-r', label: 'Cohere Command R' },
      { value: 'perplexity/sonar-pro', label: 'Perplexity Sonar Pro' },
      { value: 'perplexity/sonar', label: 'Perplexity Sonar' },
      { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (Paid)' },
      { value: 'deepseek/deepseek-coder', label: 'DeepSeek Coder' },
      { value: 'x-ai/grok-2', label: 'xAI Grok 2' },
      { value: 'x-ai/grok-beta', label: 'xAI Grok Beta' },
    ] 
  },
];

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

  const selectedProvider = aiProviders.find((p) => p.value === config.provider);
  const selectedModel = selectedProvider?.models.find((m) => m.value === config.model);

  const handleSave = () => {
    if (!config.apiKey) {
      toast({
        title: 'API Key Required',
        description: 'Please enter your AI provider API key.',
        variant: 'destructive',
      });
      return;
    }

    setAIConfig(config as AIConfig);
    toast({
      title: 'Settings saved',
      description: 'Your AI configuration has been updated.',
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Settings className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">
              Configure your AI integration and preferences
            </p>
          </div>
        </div>
      </motion.div>

      {/* AI Configuration */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-card rounded-xl p-6 border border-border shadow-card"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">AI Configuration</h3>
            <p className="text-sm text-muted-foreground">
              Connect your preferred AI provider
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select
              value={config.provider}
              onValueChange={(value: AIConfig['provider']) => {
                const provider = aiProviders.find((p) => p.value === value);
                setConfig({ 
                  ...config, 
                  provider: value, 
                  model: provider?.models[0]?.value 
                });
              }}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {aiProviders.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={modelOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="flex items-center gap-2 truncate">
                    {selectedModel ? (
                      <>
                        {selectedModel.label}
                        {selectedModel.free && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded">
                            FREE
                          </span>
                        )}
                      </>
                    ) : (
                      "Select model..."
                    )}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0 bg-popover border-border" align="start">
                <Command className="bg-transparent">
                  <CommandInput placeholder="Search model..." className="border-b border-border" />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>No model found.</CommandEmpty>
                    {config.provider === 'openrouter' && (
                      <>
                        <CommandGroup heading="🆓 Free Models">
                          {selectedProvider?.models
                            .filter((m) => m.free)
                            .map((model) => (
                              <CommandItem
                                key={model.value}
                                value={model.label}
                                onSelect={() => {
                                  setConfig({ ...config, model: model.value });
                                  setModelOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    config.model === model.value ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="flex-1">{model.label}</span>
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded">
                                  FREE
                                </span>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup heading="💎 Premium Models">
                          {selectedProvider?.models
                            .filter((m) => !m.free)
                            .map((model) => (
                              <CommandItem
                                key={model.value}
                                value={model.label}
                                onSelect={() => {
                                  setConfig({ ...config, model: model.value });
                                  setModelOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    config.model === model.value ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {model.label}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </>
                    )}
                    {config.provider !== 'openrouter' && (
                      <CommandGroup>
                        {selectedProvider?.models.map((model) => (
                          <CommandItem
                            key={model.value}
                            value={model.label}
                            onSelect={() => {
                              setConfig({ ...config, model: model.value });
                              setModelOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                config.model === model.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {model.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

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
              <Button
                variant="outline"
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
              >
                {apiKeyVisible ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Your API key is stored locally and never sent to our servers
            </p>
          </div>

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

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-muted/50 rounded-xl p-6 border border-border"
      >
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
            OpenRouter provides access to many free models with rate limits
          </li>
        </ul>
      </motion.div>
    </div>
  );
}
