import React from 'react';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Table as TableIcon, Code2, Play, Save, Download, Clock, Database, Sparkles, X } from 'lucide-react';
import { AIChatPanel } from '@/components/AIChatPanel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useDatasets, useDatasetData } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { DatasetRecommendation } from '@/components/AIChatPanel';
import { HelpTooltip } from '@/components/HelpTooltip';

interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  executionTime: number;
  rowCount: number;
}

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  dataSetId: string;
  createdAt: Date;
}

// Simple SQL-like query parser
function executeQuery(query: string, data: Record<string, any>[]): QueryResult {
  const startTime = performance.now();
  const q = query.trim().toLowerCase();

  if (!q.startsWith('select')) throw new Error('Only SELECT queries are supported');

  let result = [...data];
  let selectedColumns: string[] = [];

  // Parse SELECT columns
  const selectMatch = q.match(/select\s+(.+?)\s+from/i);
  if (!selectMatch) throw new Error('Invalid query syntax. Use: SELECT columns FROM dataset');

  const colsPart = selectMatch[1].trim();
  if (colsPart === '*') {
    selectedColumns = data.length > 0 ? Object.keys(data[0]) : [];
  } else {
    selectedColumns = colsPart.split(',').map(c => c.trim());
  }

  // Parse WHERE
  const whereMatch = q.match(/where\s+(.+?)(?:\s+order|\s+limit|\s+group|$)/i);
  if (whereMatch) {
    const condition = whereMatch[1].trim();
    // Support: column = 'value', column > number, column < number, column LIKE '%pattern%'
    const likeMatch = condition.match(/(\w+)\s+like\s+'([^']+)'/i);
    const compMatch = condition.match(/(\w+)\s*(=|!=|>|<|>=|<=)\s*'?([^']*)'?/i);

    if (likeMatch) {
      const [, col, pattern] = likeMatch;
      const regex = new RegExp(pattern.replace(/%/g, '.*'), 'i');
      result = result.filter(row => regex.test(String(row[col] || '')));
    } else if (compMatch) {
      const [, col, op, val] = compMatch;
      result = result.filter(row => {
        const rowVal = row[col];
        const numVal = Number(val);
        const isNum = !isNaN(numVal) && !isNaN(Number(rowVal));
        switch (op) {
          case '=': return isNum ? Number(rowVal) === numVal : String(rowVal) === val;
          case '!=': return isNum ? Number(rowVal) !== numVal : String(rowVal) !== val;
          case '>': return Number(rowVal) > numVal;
          case '<': return Number(rowVal) < numVal;
          case '>=': return Number(rowVal) >= numVal;
          case '<=': return Number(rowVal) <= numVal;
          default: return true;
        }
      });
    }
  }

  // Parse ORDER BY
  const orderMatch = q.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
  if (orderMatch) {
    const [, col, dir] = orderMatch;
    result.sort((a, b) => {
      const av = a[col], bv = b[col];
      const cmp = typeof av === 'number' ? av - Number(bv) : String(av).localeCompare(String(bv));
      return dir?.toLowerCase() === 'desc' ? -cmp : cmp;
    });
  }

  // Parse LIMIT
  const limitMatch = q.match(/limit\s+(\d+)/i);
  if (limitMatch) {
    result = result.slice(0, Number(limitMatch[1]));
  }

  // Project columns
  if (colsPart !== '*') {
    result = result.map(row => {
      const projected: Record<string, any> = {};
      selectedColumns.forEach(col => { projected[col] = row[col]; });
      return projected;
    });
  }

  return {
    columns: selectedColumns,
    rows: result,
    executionTime: performance.now() - startTime,
    rowCount: result.length,
  };
}

export default function QueryEditor() {
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [query, setQuery] = useState("SELECT * FROM dataset LIMIT 100");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [queryName, setQueryName] = useState('');

  const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(selectedDataSet || '', { limit: 10000 });
  const dataset = React.useMemo(() => {
    const meta = dataSets.find(ds => ds.id === selectedDataSet);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, selectedDataSet, __datasetDataRes]);

  const handleRun = () => {
    if (!dataset) {
      toast({ title: 'No dataset selected', variant: 'destructive' });
      return;
    }
    setError('');
    try {
      const result = executeQuery(query, dataset.data);
      setQueryResult(result);
      toast({ title: 'Query executed', description: `${result.rowCount} rows in ${result.executionTime.toFixed(1)}ms` });
    } catch (err: any) {
      setError(err.message);
      setQueryResult(null);
    }
  };

  const handleSaveQuery = () => {
    const name = queryName || `Query ${savedQueries.length + 1}`;
    setSavedQueries(prev => [...prev, {
      id: Date.now().toString(), name, query, dataSetId: selectedDataSet, createdAt: new Date()
    }]);
    toast({ title: 'Query saved', description: name });
    setQueryName('');
  };

  const handleExportCSV = () => {
    if (!queryResult) return;
    const header = queryResult.columns.join(',');
    const rows = queryResult.rows.map(r => queryResult.columns.map(c => JSON.stringify(r[c] ?? '')).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'query_result.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const [isCreatingViews, setIsCreatingViews] = useState(false);

  const handleAIResponse = (response: string, jsonRecommendations?: DatasetRecommendation[]) => {
    if (jsonRecommendations && jsonRecommendations.length > 0) {
      // If it's a JSON response, we don't put the SQL directly in the editor unless there's only one.
      // The AIChatPanel handles showing the cards.
      toast({ title: 'AI Recommendations Ready', description: `Generated ${jsonRecommendations.length} dataset suggestions.` });
      return;
    }

    // Fallback for single query extraction
    const sqlMatch = response.match(/```sql\n?([\s\S]*?)```/) || response.match(/SELECT[\s\S]*?(?:LIMIT\s+\d+|$)/i);
    if (sqlMatch) {
      const sql = (sqlMatch[1] || sqlMatch[0]).trim();
      setQuery(sql);
      toast({ title: 'AI Query Generated', description: 'Query has been placed in the editor. Press Run to execute.' });
    } else if (response.toUpperCase().startsWith('SELECT')) {
      setQuery(response.trim());
      toast({ title: 'AI Query Generated', description: 'Query placed in editor.' });
    }
  };

  const handleCreateViews = async (recommendations: DatasetRecommendation[]) => {
    if (!selectedDataSet) {
      toast({ title: 'Error', description: 'Please select a source dataset first.', variant: 'destructive' });
      return;
    }

    setIsCreatingViews(true);
    try {
      const promises = recommendations.map(rec =>
        api.post('/datasets/ai-generate', {
          sourceDatasetId: selectedDataSet,
          name: rec.name,
          description: rec.description,
          query: rec.sql
        })
      );

      await Promise.all(promises);
      toast({ title: 'Success', description: `Successfully created ${recommendations.length} new datasets.` });
      // Trigger a refetch of datasets
      window.location.reload(); // Simple way to refresh the sidebar and lists
    } catch (err: any) {
      toast({
        title: 'Failed to create datasets',
        description: err.response?.data?.error || err.message,
        variant: 'destructive'
      });
    } finally {
      setIsCreatingViews(false);
    }
  };

  const getAIPrompt = () => {
    if (!dataset) return 'No dataset selected. Ask the user to select a dataset first.';
    return `You are an Enterprise Data Preparation Assistant for a dataset called "${dataset.name}". 
The available columns are: ${dataset.columns.map(c => `${c.name} (${c.type})`).join(', ')}. Total rows: ${dataset.rowCount}.
The underlying table name is "${dataset.dataTableName}".

Your task is to analyze the user's request and suggest one or more valuable data views (datasets) that can be derived from this source data.
Provide a brief, helpful explanation of your reasoning first, and then provide the dataset recommendations in a structured JSON block.

CRITICAL INSTRUCTION: You MUST include your recommendations as a valid JSON array object. Wrap the JSON in a standard markdown code block: \`\`\`json [your json] \`\`\`.

The JSON MUST conform exactly to this structure:
[
  {
    "name": "Short, descriptive name for the dataset (e.g., 'Monthly Sales Revenue')",
    "description": "A brief explanation of what this dataset shows and its business value.",
    "sql": "The complete PostgreSQL query using SELECT... FROM ${dataset.dataTableName} ..."
  }
]

- Use PostgreSQL syntax.
- You CAN use aggregations (SUM, COUNT, AVG), GROUP BY, and date functions (DATE_TRUNC).
- CRITICAL for Aggregations: If a column type is "text" but contains numbers, you MUST cast it to numeric for math/avg/sum: "Column_Name"::NUMERIC.
- IMPORTANT for DATE_TRUNC: The first argument must be a string literal (e.g., 'month') and the second MUST be a TIMESTAMP.
- If a column is "bigint" but represents a Unix timestamp, you MUST convert it using to_timestamp() before passing to DATE_TRUNC. 
- Example (ms): to_timestamp("column" / 1000). Example (s): to_timestamp("column").
- ALWAYS use double quotes for ALL identifiers (e.g., SELECT "Column_Name" FROM "public"."${dataset.dataTableName}").
- IMPORTANT: If a table name has a schema (e.g., public.users), quote them separately: "public"."users".
- DO NOT end your SQL query with a semicolon (;). This is CRITICAL.`;
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Code2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">SQL Query Editor <HelpTooltip text="Tulis query SQL (SELECT, WHERE, ORDER BY, LIMIT) pada dataset. Gunakan AI Assistant untuk generate query dari bahasa natural. Ctrl+Enter untuk run." /></h1>
            <p className="text-muted-foreground">Query your datasets with SQL-like syntax</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel - Schema + AI (Desktop) / Collapsible (Mobile) */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card">
            <h3 className="font-semibold text-foreground mb-3">Data Source</h3>
            <Select value={selectedDataSet} onValueChange={setSelectedDataSet}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>
                {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:block hidden space-y-4">
            {dataset && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-card">
                <div className="flex items-center gap-2 mb-3">
                  <TableIcon className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Schema</h3>
                </div>
                <div className="space-y-1">
                  {dataset.columns.map(col => (
                    <div key={col.name} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-sm">
                      <span className="text-foreground font-mono text-xs">{col.name}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{col.type}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">{dataset.rowCount.toLocaleString()} rows</p>
              </div>
            )}

            {savedQueries.length > 0 && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-card">
                <h3 className="font-semibold text-foreground mb-3">Saved Queries</h3>
                <div className="space-y-2">
                  {savedQueries.map(sq => (
                    <button
                      key={sq.id}
                      onClick={() => { setQuery(sq.query); setSelectedDataSet(sq.dataSetId); }}
                      className="w-full text-left p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">{sq.name}</p>
                      <p className="text-xs text-muted-foreground truncate font-mono">{sq.query}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mobile Collapsible Panels */}
          <div className="lg:hidden space-y-2">
            {dataset && (
              <details className="bg-card rounded-xl border border-border shadow-card group">
                <summary className="p-4 font-semibold text-foreground cursor-pointer flex items-center justify-between list-none">
                  <div className="flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-primary" />
                    <span>Schema</span>
                  </div>
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">↓</span>
                </summary>
                <div className="p-4 pt-0 space-y-1">
                  {dataset.columns.map(col => (
                    <div key={col.name} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-sm">
                      <span className="text-foreground font-mono text-xs">{col.name}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{col.type}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {savedQueries.length > 0 && (
              <details className="bg-card rounded-xl border border-border shadow-card group">
                <summary className="p-4 font-semibold text-foreground cursor-pointer flex items-center justify-between list-none">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <span>Saved Queries</span>
                  </div>
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">↓</span>
                </summary>
                <div className="p-4 pt-0 space-y-2">
                  {savedQueries.map(sq => (
                    <button
                      key={sq.id}
                      onClick={() => { setQuery(sq.query); setSelectedDataSet(sq.dataSetId); }}
                      className="w-full text-left p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground">{sq.name}</p>
                      <p className="text-xs text-muted-foreground truncate font-mono">{sq.query}</p>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* AI Chat Layout (Drawer on Mobile, Sidebar on Desktop) */}
          <div className="lg:block hidden">
            <AIChatPanel
              systemPrompt={getAIPrompt()}
              title="Enterprise Data Assistant"
              placeholder="e.g., Analyze this data and suggest useful views..."
              onAIResponse={handleAIResponse}
              onCreateViews={handleCreateViews}
              isCreatingViews={isCreatingViews}
            />
          </div>

          <div className="lg:hidden fixed bottom-6 right-6 z-50">
            <details className="group relative">
              <summary className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-lg shadow-primary/30 cursor-pointer list-none hover:scale-105 active:scale-95 transition-all">
                <Sparkles className="w-6 h-6 text-primary-foreground group-open:hidden" />
                <X className="w-6 h-6 text-primary-foreground hidden group-open:block" />
              </summary>
              <div className="absolute bottom-16 right-0 w-[calc(100vw-3rem)] max-w-[360px] animate-in slide-in-from-bottom-4 duration-300">
                <AIChatPanel
                  systemPrompt={getAIPrompt()}
                  title="AI Assistant"
                  placeholder="Ask AI about this data..."
                  onAIResponse={handleAIResponse}
                  onCreateViews={handleCreateViews}
                  isCreatingViews={isCreatingViews}
                  className="shadow-2xl border-primary/20 h-[500px]"
                />
              </div>
            </details>
          </div>
        </motion.div>

        {/* Right Panel - Editor & Results */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-3 space-y-4">
          {/* Editor */}
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground text-sm">Editor</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRun} size="sm" className="gradient-primary text-primary-foreground">
                  <Play className="w-4 h-4 mr-1" /> Run Query
                </Button>
                <Button onClick={handleSaveQuery} variant="outline" size="sm">
                  <Save className="w-4 h-4 mr-1" /> Save
                </Button>
              </div>
            </div>
            <Textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="min-h-[150px] border-0 rounded-none bg-muted/20 font-mono text-sm resize-none focus-visible:ring-0"
              placeholder="SELECT * FROM dataset WHERE column > 100 ORDER BY column DESC LIMIT 50"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRun(); }}
            />
            <div className="px-4 py-2 border-t border-border bg-muted/10">
              <p className="text-xs text-muted-foreground">
                Supports: SELECT, WHERE (=, !=, &gt;, &lt;, LIKE), ORDER BY, LIMIT • Press Ctrl+Enter to run
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
              <p className="text-destructive text-sm font-medium">Error: {error}</p>
            </div>
          )}

          {/* Results */}
          {queryResult && (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-foreground">Results</span>
                  <span className="text-xs text-muted-foreground">{queryResult.rowCount} rows</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {queryResult.executionTime.toFixed(1)}ms
                  </span>
                </div>
                <Button onClick={handleExportCSV} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-1" /> CSV
                </Button>
              </div>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      {queryResult.columns.map(col => (
                        <TableHead key={col} className="text-muted-foreground font-mono text-xs">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queryResult.rows.slice(0, 200).map((row, i) => (
                      <TableRow key={i} className="border-border hover:bg-muted/30">
                        {queryResult.columns.map(col => (
                          <TableCell key={col} className="text-foreground text-xs font-mono">{String(row[col] ?? '')}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
