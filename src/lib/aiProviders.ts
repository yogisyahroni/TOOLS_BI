import type { AIProvider } from '@/types/data';

export interface ModelOption {
  value: string;
  label: string;
  free?: boolean;
}

export interface ProviderConfig {
  value: AIProvider;
  label: string;
  description: string;
  baseUrl: string;
  apiFormat: 'openai' | 'anthropic' | 'google';
  models: ModelOption[];
  supportsAutoUpdate?: boolean;
}

export const aiProviders: ProviderConfig[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4 Turbo, GPT-3.5',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiFormat: 'openai',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      { value: 'o1-preview', label: 'O1 Preview' },
      { value: 'o1-mini', label: 'O1 Mini' },
    ],
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude Sonnet, Opus, Haiku',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    apiFormat: 'anthropic',
    models: [
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    ],
  },
  {
    value: 'google',
    label: 'Google AI',
    description: 'Gemini 2.0, 1.5 Pro/Flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    apiFormat: 'google',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
  {
    value: 'nvidia',
    label: 'NVIDIA NIM',
    description: 'Nemotron, Llama via NVIDIA API',
    baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
    apiFormat: 'openai',
    models: [
      { value: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nemotron 70B Instruct' },
      { value: 'nvidia/llama-3.3-nemotron-super-49b-v1', label: 'Nemotron Super 49B' },
      { value: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: 'Nemotron Ultra 253B' },
      { value: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (NVIDIA)' },
      { value: 'meta/llama-3.1-405b-instruct', label: 'Llama 3.1 405B (NVIDIA)' },
      { value: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (NVIDIA)' },
      { value: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2 (NVIDIA)' },
      { value: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1 (NVIDIA)' },
      { value: 'qwen/qwen2.5-72b-instruct', label: 'Qwen 2.5 72B (NVIDIA)' },
    ],
  },
  {
    value: 'moonshot',
    label: 'Moonshot (Kimi)',
    description: 'Moonshot v1 models - Kimi AI',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    apiFormat: 'openai',
    models: [
      { value: 'moonshot-v1-128k', label: 'Moonshot V1 128K' },
      { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
      { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
    ],
  },
  {
    value: 'groq',
    label: 'Groq',
    description: 'Ultra-fast inference - Llama, Mixtral, Gemma',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    apiFormat: 'openai',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { value: 'llama-guard-3-8b', label: 'Llama Guard 3 8B' },
      { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
      { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
      { value: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B' },
      { value: 'qwen-qwq-32b', label: 'Qwen QwQ 32B' },
    ],
  },
  {
    value: 'together',
    label: 'Together AI',
    description: 'Open-source models at scale',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    apiFormat: 'openai',
    models: [
      { value: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
      { value: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', label: 'Llama 3.1 405B Turbo' },
      { value: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo' },
      { value: 'mistralai/Mixtral-8x22B-Instruct-v0.1', label: 'Mixtral 8x22B' },
      { value: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B v0.3' },
      { value: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo' },
      { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
      { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { value: 'google/gemma-2-27b-it', label: 'Gemma 2 27B' },
    ],
  },
  {
    value: 'mistral',
    label: 'Mistral AI',
    description: 'Mistral Large, Small, Codestral',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    apiFormat: 'openai',
    models: [
      { value: 'mistral-large-latest', label: 'Mistral Large' },
      { value: 'mistral-medium-latest', label: 'Mistral Medium' },
      { value: 'mistral-small-latest', label: 'Mistral Small' },
      { value: 'open-mistral-nemo', label: 'Mistral Nemo' },
      { value: 'codestral-latest', label: 'Codestral' },
      { value: 'pixtral-large-latest', label: 'Pixtral Large' },
    ],
  },
  {
    value: 'cohere',
    label: 'Cohere',
    description: 'Command R+, Command R, Embed',
    baseUrl: 'https://api.cohere.com/v2/chat',
    apiFormat: 'openai',
    models: [
      { value: 'command-r-plus-08-2024', label: 'Command R+ (Aug 2024)' },
      { value: 'command-r-08-2024', label: 'Command R (Aug 2024)' },
      { value: 'command-r-plus', label: 'Command R+' },
      { value: 'command-r', label: 'Command R' },
      { value: 'command-light', label: 'Command Light' },
    ],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek V3, R1, Coder',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    apiFormat: 'openai',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek V3 (Chat)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek R1 (Reasoner)' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder' },
    ],
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Gateway ke 100+ model AI (gratis & premium)',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiFormat: 'openai',
    supportsAutoUpdate: true,
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
      { value: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nvidia Nemotron 70B (Paid)' },
    ],
  },
];

// Fetch latest models from OpenRouter API
export async function fetchOpenRouterModels(): Promise<ModelOption[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) return [];
    const data = await res.json();
    
    return (data.data || [])
      .filter((m: any) => m.id && m.name)
      .map((m: any) => ({
        value: m.id,
        label: m.name || m.id,
        free: m.pricing?.prompt === '0' && m.pricing?.completion === '0',
      }))
      .sort((a: ModelOption, b: ModelOption) => {
        // Free first, then alphabetical
        if (a.free && !b.free) return -1;
        if (!a.free && b.free) return 1;
        return a.label.localeCompare(b.label);
      });
  } catch {
    return [];
  }
}

export function getProviderConfig(provider: AIProvider): ProviderConfig | undefined {
  return aiProviders.find(p => p.value === provider);
}
