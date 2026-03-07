import React from 'react';
import { useState } from 'react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { motion } from 'framer-motion';
import { Variable, Plus, Trash2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useParameters, useCreateParameter, useDeleteParameter, useUpdateParameter, useDatasets } from '@/hooks/useApi';
import type { DashboardParameter } from '@/lib/api';

// BUG-M1 fix: Parameters now persist to backend via /api/v1/parameters
export default function Parameters() {
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<'number' | 'text' | 'list'>('number');
  const [defaultVal, setDefaultVal] = useState('');
  const [dsId, setDsId] = useState('');
  const [filterCol, setFilterCol] = useState('');

  const { data: params = [], isLoading } = useParameters();
  const createMut = useCreateParameter();
  const deleteMut = useDeleteParameter();
  const updateMut = useUpdateParameter();

  const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(dsId || '', { limit: 10000 });
  const dataset = React.useMemo(() => {
    const meta = dataSets.find(ds => ds.id === dsId);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, dsId, __datasetDataRes]);

  const addParam = () => {
    if (!name) { toast({ title: 'Enter parameter name', variant: 'destructive' }); return; }
    createMut.mutate({
      name, type, defaultValue: defaultVal,
      ...(type === 'number' ? { minVal: 0, maxVal: 1000 } : {}),
    }, {
      onSuccess: () => { toast({ title: 'Parameter created' }); setName(''); setDefaultVal(''); },
      onError: () => toast({ title: 'Failed to create parameter', variant: 'destructive' }),
    });
  };

  const updateValue = (param: DashboardParameter, value: string) => {
    updateMut.mutate({ id: param.id, data: { defaultValue: value } });
  };

  const filteredData = dataset?.data.filter(row => {
    if (!filterCol) return true;
    return params.every(p => {
      if (!p.defaultValue) return true;
      if (p.type === 'number') return Number(row[filterCol]) >= Number(p.defaultValue);
      return String(row[filterCol] || '').toLowerCase().includes(p.defaultValue.toLowerCase());
    });
  }).slice(0, 50) || [];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Variable className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Parameters & Variables <HelpTooltip text="Buat parameter dinamis (dropdown, slider, teks) yang bisa mengontrol filter dan tampilan chart/dashboard secara interaktif." /></h1>
            <p className="text-muted-foreground">Create dynamic parameters to control data views</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Create Parameter</h3>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Parameter name" className="bg-muted/50 border-border" />
            <Select value={type} onValueChange={v => setType(v as any)}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="list">List</SelectItem>
              </SelectContent>
            </Select>
            <Input value={defaultVal} onChange={e => setDefaultVal(e.target.value)} placeholder="Default value" className="bg-muted/50 border-border" />
            <Button onClick={addParam} disabled={createMut.isPending} className="w-full gradient-primary text-primary-foreground" size="sm">
              <Plus className="w-4 h-4 mr-1" /> {createMut.isPending ? 'Saving…' : 'Add Parameter'}
            </Button>
          </div>

          {!isLoading && params.length > 0 && (
            <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
              <h3 className="font-semibold text-foreground text-sm">Active Parameters ({params.length})</h3>
              {params.map(p => (
                <div key={p.id} className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(p.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                  {p.type === 'number' ? (
                    <div className="space-y-1">
                      <Slider value={[Number(p.defaultValue) || 0]} min={p.minVal ?? 0} max={p.maxVal ?? 1000} step={1}
                        onValueChange={v => updateValue(p, String(v[0]))} />
                      <span className="text-xs font-mono text-primary">{p.defaultValue || 0}</span>
                    </div>
                  ) : (
                    <Input value={p.defaultValue} onChange={e => updateValue(p, e.target.value)} className="bg-muted/50 border-border text-sm h-8" />
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2 space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Preview with Parameters</h3>
            <div className="flex gap-3">
              <Select value={dsId} onValueChange={v => { setDsId(v); setFilterCol(''); }}>
                <SelectTrigger className="bg-muted/50 border-border flex-1"><SelectValue placeholder="Dataset" /></SelectTrigger>
                <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
              </Select>
              {dataset && (
                <Select value={filterCol || "none"} onValueChange={v => setFilterCol(v === "none" ? "" : v)}>
                  <SelectTrigger className="bg-muted/50 border-border flex-1"><SelectValue placeholder="Filter column" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All columns</SelectItem>
                    {dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {dataset && (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="p-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground">{dataset.name}</span>
                <span className="text-xs text-muted-foreground ml-2">({filteredData.length} rows shown)</span>
              </div>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      {dataset.columns.map(c => <TableHead key={c.name} className="text-muted-foreground text-xs font-mono">{c.name}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row, i) => (
                      <TableRow key={i} className="border-border">
                        {dataset.columns.map(c => <TableCell key={c.name} className="text-xs font-mono">{row[c.name] != null ? String(row[c.name]) : ''}</TableCell>)}
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
