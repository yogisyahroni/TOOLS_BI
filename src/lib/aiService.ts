import { api, aiApi } from '@/lib/api';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  content: string;
  error?: string;
}

export async function callAI(messages: ChatMessage[]): Promise<AIResponse> {
  try {
    const res = await api.post<{ content: string }>('/ai/chat', { messages });
    return { content: res.data.content || '' };
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || err.message || 'Unknown error occurred communicating with AI';
    return { content: '', error: `Connection error: ${errorMsg}` };
  }
}

export async function callAIStream(
  messages: ChatMessage[],
  onMessage: (chunk: string) => void,
  onThought?: (thoughtJSON: string) => void
): Promise<AIResponse> {
  try {
    const res = await aiApi.chatStream(messages);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    if (!res.body) throw new Error('ReadableStream not supported by browser');
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) {
          if (line.includes('[DONE]')) break;
          continue;
        }

        const dataStr = line.substring(6).trim();
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.event === 'message' && parsed.data) {
            fullContent += parsed.data;
            onMessage(parsed.data);
          } else if (parsed.event === 'thought' && parsed.data && onThought) {
            onThought(parsed.data);
          } else if (parsed.event === 'error') {
            const errObj = JSON.parse(parsed.data);
            return { content: fullContent, error: errObj.error || 'Stream error' };
          }
        } catch (e) {
          console.error("Error parsing SSE JSON:", e, dataStr);
        }
      }
    }

    return { content: fullContent };
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || err.message || 'Unknown error occurred communicating with AI';
    return { content: '', error: `Connection error: ${errorMsg}` };
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
