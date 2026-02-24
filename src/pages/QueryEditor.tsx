import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Code2, Play, Clock, Download, Trash2, Save, Table as TableIcon } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

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
  const { dataSets } = useDataStore();
  const { toast } = useToast();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [query, setQuery] = useState("SELECT * FROM dataset LIMIT 100");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [queryName, setQueryName] = useState('');

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);

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

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Code2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">SQL Query Editor</h1>
            <p className="text-muted-foreground">Query your datasets with SQL-like syntax</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel - Schema */}
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
