import React from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useRLSRules, useCreateRLSRule, useDeleteRLSRule, useToggleRLSRule, useDatasets, useDatasetData } from '@/hooks/useApi';

// BUG-M6 fix: RLS rules now persist to backend via /api/v1/rls-rules

function RLSRuleItem({ r, dataSets, toggleMut, deleteMut }: any) {
  const ds = dataSets.find((d: any) => d.id === r.datasetId);
  const allowedVals = Array.isArray(r.allowedValues) ? r.allowedValues : [];
  const { data: __datasetDataRes } = useDatasetData(r.datasetId || '', { limit: 10000 });
  const datasetWithData = React.useMemo(() => {
    if (!ds) return null;
    return { ...ds, data: __datasetDataRes?.data || [] };
  }, [ds, __datasetDataRes]);

  const count = datasetWithData ? datasetWithData.data.filter((row: any) => allowedVals.includes(String(row[r.columnName]))).length : 0;

  return (
    <div key={r.id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-semibold text-foreground text-sm">{r.role}</p>
          <p className="text-xs text-muted-foreground">{ds?.name ?? r.datasetId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={r.enabled} onCheckedChange={enabled => toggleMut.mutate({ id: r.id, enabled })} />
          <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground"><span className="font-mono text-primary">{r.columnName}</span> IN [{allowedVals.join(', ')}]</p>
      <p className="text-xs text-muted-foreground mt-1">Accessible rows: <span className="text-primary font-semibold">{count}</span></p>
    </div>
  );
}

export default function RowLevelSecurity() {
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();
  const [dsId, setDsId] = useState('');
  const [role, setRole] = useState('');
  const [col, setCol] = useState('');
  const [vals, setVals] = useState('');

  const { data: rules = [], isLoading } = useRLSRules();
  const createMut = useCreateRLSRule();
  const deleteMut = useDeleteRLSRule();
  const toggleMut = useToggleRLSRule();

  const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(dsId || '', { limit: 10000 });
  const dataset = React.useMemo(() => {
    const meta = dataSets.find(ds => ds.id === dsId);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, dsId, __datasetDataRes]);

  const addRule = () => {
    if (!dsId || !role || !col || !vals) { toast({ title: 'Fill all fields', variant: 'destructive' }); return; }
    createMut.mutate({
      datasetId: dsId, role, columnName: col,
      allowedValues: vals.split(',').map(v => v.trim()),
      enabled: true,
    }, {
      onSuccess: () => { toast({ title: 'RLS rule added' }); setRole(''); setVals(''); },
      onError: () => toast({ title: 'Failed to create rule', variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <ShieldCheck className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Row-Level Security <HelpTooltip text="Atur akses data per baris berdasarkan role. Tentukan kolom dan nilai yang diizinkan untuk setiap role pengguna." /></h1>
            <p className="text-muted-foreground">Control data access by user role</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Create RLS Rule</h3>
            <Select value={dsId} onValueChange={v => { setDsId(v); setCol(''); }}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Role (e.g., Manager, Analyst)" className="bg-muted/50 border-border" />
            {dataset && (
              <Select value={col || "none"} onValueChange={v => setCol(v === "none" ? "" : v)}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Filter column" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select column</SelectItem>
                  {dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input value={vals} onChange={e => setVals(e.target.value)} placeholder="Allowed values (comma separated)" className="bg-muted/50 border-border" />
            <Button onClick={addRule} disabled={createMut.isPending || !dsId || !role || !col || !vals} className="w-full gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-1" /> {createMut.isPending ? 'Saving…' : 'Add Rule'}
            </Button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="font-semibold text-foreground mb-4">RLS Rules ({isLoading ? '…' : rules.length})</h3>
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                {[1, 2].map(i => <div key={i} className="h-16 rounded-lg bg-muted/30" />)}
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">No RLS rules defined</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map(r => (
                  <RLSRuleItem key={r.id} r={r} dataSets={dataSets} toggleMut={toggleMut} deleteMut={deleteMut} />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
