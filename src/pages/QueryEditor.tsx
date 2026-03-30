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

  const handleRun = async () => {
    if (!dataset) {
      toast({ title: 'No dataset selected', variant: 'destructive' });
      return;
    }
    setError('');
    try {
      const res = await api.post(`/datasets/${selectedDataSet}/query`, { query });
      setQueryResult(res.data);
      toast({ title: 'Query executed', description: `${res.data.rowCount} rows in ${res.data.executionTime}ms` });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
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
      // Use a sequential loop instead of Promise.all to prevent Supabase connection pool errors
      for (const rec of recommendations) {
        await api.post('/datasets/ai-generate', {
          sourceDatasetId: selectedDataSet,
          name: rec.name,
          description: rec.description,
          query: rec.sql
        });
      }
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
    return `You are a Senior Enterprise Business Intelligence Architect for a dataset called "${dataset.name}". 
The available columns are: ${dataset.columns.map(c => `${c.name} (${c.type})`).join(', ')}. Total rows: ${dataset.rowCount}.
The underlying table name is "${dataset.dataTableName}".

### YOUR MISSION:
Analyze the user's request and architect a suite of professional, high-value data views (datasets) for analysis.

### ANALYTICAL MANDATE:
1. **Dashboard/Monitoring Focus**: If the user mentions "dashboard", "monitoring", or "insight", you MUST provide **at least 6-8 distinct dataset recommendations** covering:
   - Key Performance Indicators (KPIs) & Aggregations.
   - Time-series trends (Daily/Weekly/Monthly).
   - Categorical breakdowns (Top N branches, products, etc.).
   - Anomalies or Bottlenecks (e.g., long delays, low stock).
2. **Advanced SQL**: Do not be afraid of complex PostgreSQL! Use CTEs and Window Functions (RANK, ROW_NUMBER, OVER) for strategic analysis.

### CRITICAL TECHNICAL RULES (DO NOT IGNORE):
- **PostgreSQL Syntax**: Only use valid PostgreSQL.
- **Identifier Quoting**: ALWAYS use double quotes for ALL identifiers (e.g., SELECT "Column_Name" FROM "public"."${dataset.dataTableName}"). Always quote schema and table separately: "public"."${dataset.dataTableName}".
- **Type Casting for Aggregations**: If a column type is "text" but contains numbers, you MUST cast it to numeric for math/avg/sum: "Column_Name"::NUMERIC.
- **Timestamp Conversion**: 
  - If a column is "bigint" representing Unix ms: to_timestamp("column" / 1000).
  - If a column is "bigint" representing Unix seconds: to_timestamp("column").
- **DATE_TRUNC**: The first argument must be a string literal (e.g., 'day', 'month') and the second MUST be a TIMESTAMP.
- **No Semicolons**: DO NOT end your SQL query with a semicolon (;). This is CRITICAL.

### OUTPUT FORMAT:
Provide a brief, professional architectural reasoning first, and then return the dataset recommendations in a VALID JSON array block wrapped in \`\`\`json\`\`\`.

The JSON schema:
[
  {
    "name": "Professional Name (e.g., 'Jakarta Branch: Delivery SLA Analysis')",
    "description": "Strategic explanation of what this data reveals and its business impact.",
    "sql": "Professional PostgreSQL query..."
  }
]`;
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

        </motion.div>

        {/* Middle Panel - Editor & Results */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 space-y-4">
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

        {/* Right Panel - AI Chat Panel */}
        <div className="lg:col-span-1 h-[calc(100vh-12rem)] min-h-[500px] flex flex-col">
          <div className="sticky top-6 flex-1 h-full">
            <AIChatPanel
              systemPrompt={getAIPrompt()}
              title="Enterprise Data Assistant"
              placeholder="e.g., Analyze this data and suggest useful views..."
              onAIResponse={handleAIResponse}
              onCreateViews={handleCreateViews}
              isCreatingViews={isCreatingViews}
              contextType="sql"
              className="h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
