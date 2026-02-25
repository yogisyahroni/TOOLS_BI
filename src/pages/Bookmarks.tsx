import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Plus, Trash2, Eye, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';

export default function Bookmarks() {
  const { dataSets, bookmarks, addBookmark, removeBookmark } = useDataStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [name, setName] = useState('');
  const [filterCol, setFilterCol] = useState('');
  const [filterVal, setFilterVal] = useState('');
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<{ column: string; value: string }[]>([]);

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);

  const addFilter = () => {
    if (!filterCol || !filterVal) return;
    setFilters(prev => [...prev, { column: filterCol, value: filterVal }]);
    setFilterCol('');
    setFilterVal('');
  };

  const handleSave = () => {
    if (!name.trim() || !selectedDataSet) {
      toast({ title: 'Fill name and select dataset', variant: 'destructive' });
      return;
    }
    addBookmark({
      id: Date.now().toString(),
      name,
      dataSetId: selectedDataSet,
      filters,
      sortColumn: sortCol || undefined,
      sortDirection: sortCol ? sortDir : undefined,
      createdAt: new Date(),
    });
    toast({ title: 'Bookmark saved', description: name });
    setName('');
    setFilters([]);
    setSortCol('');
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Bookmark className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Bookmarks & Saved Views <HelpTooltip text="Simpan state tampilan (filter, sort, halaman) sebagai bookmark. Klik bookmark untuk kembali ke tampilan tersebut dengan cepat." /></h1>
            <p className="text-muted-foreground">Save and restore data views with filters and sorting</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Bookmark */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Create Bookmark</h3>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
              <Select value={selectedDataSet} onValueChange={setSelectedDataSet}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                <SelectContent>
                  {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bookmark Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., High salary employees" className="bg-muted/50 border-border" />
            </div>

            {/* Filters */}
            {dataset && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground block">Add Filters</label>
                <div className="flex gap-2">
                  <Select value={filterCol || "none"} onValueChange={v => setFilterCol(v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-muted/50 border-border flex-1"><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select column</SelectItem>
                      {dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={filterVal} onChange={e => setFilterVal(e.target.value)} placeholder="Value" className="bg-muted/50 border-border flex-1" />
                  <Button onClick={addFilter} variant="outline" size="sm"><Plus className="w-4 h-4" /></Button>
                </div>
                {filters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filters.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-xs">
                        <Filter className="w-3 h-3" /> {f.column} = {f.value}
                        <button onClick={() => setFilters(prev => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sort */}
            {dataset && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Sort By</label>
                  <Select value={sortCol || "none"} onValueChange={v => setSortCol(v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Sort column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-muted-foreground mb-1 block">Direction</label>
                  <Select value={sortDir} onValueChange={v => setSortDir(v as 'asc' | 'desc')}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground" disabled={!name || !selectedDataSet}>
              <Bookmark className="w-4 h-4 mr-1" /> Save Bookmark
            </Button>
          </div>
        </motion.div>

        {/* Saved Bookmarks */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="font-semibold text-foreground mb-4">Saved Bookmarks ({bookmarks.length})</h3>
            {bookmarks.length === 0 ? (
              <div className="text-center py-8">
                <Bookmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">No bookmarks yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookmarks.map(bm => {
                  const ds = dataSets.find(d => d.id === bm.dataSetId);
                  return (
                    <div key={bm.id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-foreground text-sm">{bm.name}</p>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate('/explorer')}>
                            <Eye className="w-4 h-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { removeBookmark(bm.id); toast({ title: 'Deleted' }); }}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">Dataset: {ds?.name || 'Unknown'}</p>
                      {bm.filters.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bm.filters.map((f, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                              {f.column}={f.value}
                            </span>
                          ))}
                        </div>
                      )}
                      {bm.sortColumn && (
                        <p className="text-[10px] text-muted-foreground mt-1">Sort: {bm.sortColumn} {bm.sortDirection?.toUpperCase()}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
