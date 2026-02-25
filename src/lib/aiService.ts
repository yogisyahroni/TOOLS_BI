import { useDataStore } from '@/stores/dataStore';
import { getProviderConfig } from '@/lib/aiProviders';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  content: string;
  error?: string;
}

export async function callAI(messages: ChatMessage[]): Promise<AIResponse> {
  const { aiConfig } = useDataStore.getState();

  if (!aiConfig || !aiConfig.apiKey) {
    return { content: '', error: 'AI belum dikonfigurasi. Silakan setup API key di halaman Settings terlebih dahulu.' };
  }

  const { provider, model, apiKey, maxTokens, temperature } = aiConfig;
  const providerConfig = getProviderConfig(provider);

  try {
    // Anthropic has unique API format
    if (provider === 'anthropic' || providerConfig?.apiFormat === 'anthropic') {
      const systemMsg = messages.find(m => m.role === 'system')?.content || '';
      const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens || 2048,
          temperature: temperature ?? 0.7,
          system: systemMsg,
          messages: userMessages,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { content: '', error: `Anthropic API error (${res.status}): ${errText}` };
      }

      const data = await res.json();
      return { content: data.content?.[0]?.text || '' };
    }

    // Google AI has unique API format
    if (provider === 'google' || providerConfig?.apiFormat === 'google') {
      const allContent = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: allContent }] }],
          generationConfig: { maxOutputTokens: maxTokens || 2048, temperature: temperature ?? 0.7 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { content: '', error: `Google AI error (${res.status}): ${errText}` };
      }

      const data = await res.json();
      return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
    }

    // OpenAI-compatible API (OpenAI, OpenRouter, NVIDIA, Groq, Together, Mistral, Cohere, DeepSeek, Moonshot)
    const url = providerConfig?.baseUrl || 'https://openrouter.ai/api/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'DataLens Analytics';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens || 2048,
        temperature: temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { content: '', error: `AI API error (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '' };
  } catch (err: any) {
    return { content: '', error: `Connection error: ${err.message}` };
  }
}

export async function generateSQL(datasetName: string, columns: { name: string; type: string }[], userRequest: string): Promise<AIResponse> {
  return callAI([
    {
      role: 'system',
      content: `You are a SQL query assistant for a dataset called "${datasetName}". The available columns are: ${columns.map(c => `${c.name} (${c.type})`).join(', ')}. 
      
Generate SQL-like queries using this syntax: SELECT, WHERE (=, !=, >, <, >=, <=, LIKE), ORDER BY (ASC/DESC), LIMIT.
Table name is always "dataset".
Return ONLY the SQL query, no explanation.`,
    },
    { role: 'user', content: userRequest },
  ]);
}

export async function generateETLPipeline(
  datasetName: string,
  columns: { name: string; type: string }[],
  sampleData: Record<string, any>[],
  userRequest: string
): Promise<AIResponse> {
  return callAI([
    {
      role: 'system',
      content: `You are an ETL pipeline assistant. The dataset "${datasetName}" has columns: ${columns.map(c => `${c.name} (${c.type})`).join(', ')}.

Sample data (first 3 rows): ${JSON.stringify(sampleData.slice(0, 3))}

Generate ETL pipeline steps as a JSON array. Each step has: type (filter|transform|aggregate|select|sort), and config object.

Step configs:
- filter: { "column": "col_name", "operator": "=|!=|>|<|>=|<=|contains", "value": "val" }
- transform: { "column": "col_name", "operation": "uppercase|lowercase|trim|round|abs|add|multiply", "newColumn": "new_col", "operand": number_if_needed }
- aggregate: { "groupBy": "col_name", "aggregations": [{ "column": "col", "function": "sum|avg|count|min|max", "alias": "result_name" }] }
- select: { "columns": ["col1", "col2"] }
- sort: { "column": "col_name", "direction": "asc|desc" }

Return ONLY valid JSON array of steps, no explanation.`,
    },
    { role: 'user', content: userRequest },
  ]);
}

export async function generateReport(
  datasetName: string,
  columns: { name: string; type: string }[],
  sampleData: Record<string, any>[],
  stats: Record<string, any>,
  userRequest: string
): Promise<AIResponse> {
  return callAI([
    {
      role: 'system',
      content: `You are a business analytics report generator. Create detailed, insightful reports in Bahasa Indonesia.
      
Dataset: "${datasetName}"
Columns: ${columns.map(c => `${c.name} (${c.type})`).join(', ')}
Sample data: ${JSON.stringify(sampleData.slice(0, 5))}
Statistics: ${JSON.stringify(stats)}

Generate a report with this JSON structure:
{
  "title": "Report title",
  "content": "Full markdown report content with ## headers, bullet points, and analysis",
  "story": "A narrative data story paragraph",
  "decisions": ["decision 1", "decision 2", "decision 3", "decision 4"],
  "recommendations": ["rec 1", "rec 2", "rec 3", "rec 4"]
}

Make it comprehensive, data-driven, and actionable. Return ONLY valid JSON.`,
    },
    { role: 'user', content: userRequest },
  ]);
}
