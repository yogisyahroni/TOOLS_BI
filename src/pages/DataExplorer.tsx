import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, ArrowUpDown, BarChart3, Hash, Type, Calendar, ToggleLeft, Download } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function DataExplorer() {
  const { dataSets } = useDataStore();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterCol, setFilterCol] = useState('');
  const [filterVal, setFilterVal] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);

  const filteredData = useMemo(() => {
    if (!dataset) return [];
    let data = [...dataset.data];

    // Global search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(row =>
        Object.values(row).some(v => String(v).toLowerCase().includes(term))
      );
    }

    // Column filter
    if (filterCol && filterVal) {
      data = data.filter(row =>
        String(row[filterCol] ?? '').toLowerCase().includes(filterVal.toLowerCase())
      );
    }

    // Sort
    if (sortColumn) {
      data.sort((a, b) => {
        const av = a[sortColumn], bv = b[sortColumn];
        const cmp = typeof av === 'number' ? av - Number(bv) : String(av).localeCompare(String(bv));
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }

    return data;
  }, [dataset, searchTerm, sortColumn, sortDir, filterCol, filterVal]);

  const pagedData = filteredData.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filteredData.length / pageSize);

  // Column stats
  const columnStats = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.map(col => {
      const values = dataset.data.map(r => r[col.name]).filter(v => v != null);
      const numVals = values.map(Number).filter(n => !isNaN(n));
      const uniqueCount = new Set(values.map(String)).size;
      const nullCount = dataset.data.length - values.length;
      
      return {
        name: col.name,
        type: col.type,
        unique: uniqueCount,
        nulls: nullCount,
        min: numVals.length ? Math.min(...numVals) : null,
        max: numVals.length ? Math.max(...numVals) : null,
        mean: numVals.length ? numVals.reduce((a, b) => a + b, 0) / numVals.length : null,
      };
    });
  }, [dataset]);

  const typeIcon = (type: string) => {
    switch (type) {
      case 'number': return <Hash className="w-3 h-3" />;
      case 'string': return <Type className="w-3 h-3" />;
      case 'date': return <Calendar className="w-3 h-3" />;
      case 'boolean': return <ToggleLeft className="w-3 h-3" />;
      default: return null;
    }
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Search className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Data Explorer</h1>
            <p className="text-muted-foreground">Explore, filter, and analyze your datasets</p>
          </div>
        </div>
      </motion.div>

      {/* Dataset Selector */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
            <Select value={selectedDataSet} onValueChange={v => { setSelectedDataSet(v); setPage(0); setSortColumn(''); setFilterCol(''); setFilterVal(''); setSearchTerm(''); }}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>
                {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name} ({ds.rowCount} rows)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(0); }} placeholder="Search all columns..." className="pl-9 bg-muted/50 border-border" />
            </div>
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs text-muted-foreground mb-1 block">Filter Column</label>
            <Select value={filterCol} onValueChange={setFilterCol}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {dataset?.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {filterCol && (
            <div className="min-w-[150px]">
              <label className="text-xs text-muted-foreground mb-1 block">Filter Value</label>
              <Input value={filterVal} onChange={e => { setFilterVal(e.target.value); setPage(0); }} placeholder="Contains..." className="bg-muted/50 border-border" />
            </div>
          )}
        </div>
      </motion.div>

      {dataset ? (
        <Tabs defaultValue="data" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="data">Data Table</TabsTrigger>
            <TabsTrigger value="stats">Column Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="data">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{filteredData.length} of {dataset.rowCount} rows</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <span className="text-xs text-muted-foreground">{page + 1} / {totalPages || 1}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      {dataset.columns.map(col => (
                        <TableHead key={col.name} className="cursor-pointer hover:bg-muted/30" onClick={() => handleSort(col.name)}>
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            {typeIcon(col.type)}
                            <span>{col.name}</span>
                            {sortColumn === col.name && <ArrowUpDown className="w-3 h-3 text-primary" />}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedData.map((row, i) => (
                      <TableRow key={i} className="border-border hover:bg-muted/20">
                        {dataset.columns.map(col => (
                          <TableCell key={col.name} className="text-xs font-mono text-foreground max-w-[200px] truncate">
                            {row[col.name] != null ? String(row[col.name]) : <span className="text-muted-foreground italic">null</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="stats">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {columnStats.map(stat => (
                <div key={stat.name} className="bg-card rounded-xl p-5 border border-border shadow-card">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      {typeIcon(stat.type)}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{stat.name}</p>
                      <Badge variant="secondary" className="text-[10px]">{stat.type}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Unique</span><span className="text-foreground font-mono">{stat.unique}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Nulls</span><span className="text-foreground font-mono">{stat.nulls}</span></div>
                    {stat.min != null && (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Min</span><span className="text-foreground font-mono">{stat.min.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Max</span><span className="text-foreground font-mono">{stat.max?.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Mean</span><span className="text-foreground font-mono">{stat.mean?.toFixed(2)}</span></div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          </TabsContent>
        </Tabs>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Dataset Selected</h3>
          <p className="text-muted-foreground">Choose a dataset above to explore its data</p>
        </motion.div>
      )}
    </div>
  );
}
