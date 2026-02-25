import { useState } from 'react';
import { motion } from 'framer-motion';
import { Network, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { DataRelationship } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

function genId() { return Math.random().toString(36).substring(2, 15); }

export default function DataModeling() {
  const { dataSets, relationships, addRelationship, removeRelationship } = useDataStore();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    sourceDataSetId: '', targetDataSetId: '',
    sourceColumn: '', targetColumn: '',
    type: 'one-to-many' as DataRelationship['type']
  });

  const srcDs = dataSets.find(d => d.id === form.sourceDataSetId);
  const tgtDs = dataSets.find(d => d.id === form.targetDataSetId);

  const handleCreate = () => {
    if (!form.sourceDataSetId || !form.targetDataSetId || !form.sourceColumn || !form.targetColumn) return;
    const rel: DataRelationship = {
      id: genId(), ...form, createdAt: new Date(),
    };
    addRelationship(rel);
    setForm({ sourceDataSetId: '', targetDataSetId: '', sourceColumn: '', targetColumn: '', type: 'one-to-many' });
    setDialogOpen(false);
    toast({ title: 'Relationship created', description: 'Datasets have been linked.' });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Network className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Data Modeling <HelpTooltip text="Definisikan relasi antar dataset (One-to-One, One-to-Many, Many-to-Many). Pilih kolom penghubung untuk join data." /></h1>
              <p className="text-muted-foreground">Define relationships between datasets</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Add Relationship</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Relationship</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Source Dataset</Label>
                    <Select value={form.sourceDataSetId} onValueChange={v => setForm({ ...form, sourceDataSetId: v, sourceColumn: '' })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Target Dataset</Label>
                    <Select value={form.targetDataSetId} onValueChange={v => setForm({ ...form, targetDataSetId: v, targetColumn: '' })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{dataSets.filter(d => d.id !== form.sourceDataSetId).map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Source Column</Label>
                    <Select value={form.sourceColumn} onValueChange={v => setForm({ ...form, sourceColumn: v })}>
                      <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
                      <SelectContent>{srcDs?.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Target Column</Label>
                    <Select value={form.targetColumn} onValueChange={v => setForm({ ...form, targetColumn: v })}>
                      <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
                      <SelectContent>{tgtDs?.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Relationship Type</Label>
                  <Select value={form.type} onValueChange={(v: DataRelationship['type']) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one-to-one">One to One</SelectItem>
                      <SelectItem value="one-to-many">One to Many</SelectItem>
                      <SelectItem value="many-to-many">Many to Many</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} className="w-full">Create Relationship</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Visual Model */}
      {dataSets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
          <h3 className="font-semibold text-foreground mb-4">Data Model</h3>
          <div className="flex flex-wrap gap-6 items-start">
            {dataSets.map((ds, i) => {
              const rels = relationships.filter(r => r.sourceDataSetId === ds.id || r.targetDataSetId === ds.id);
              return (
                <motion.div key={ds.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
                  className={`bg-muted/50 rounded-lg p-4 border min-w-[200px] ${rels.length > 0 ? 'border-primary/30' : 'border-border'}`}>
                  <p className="font-semibold text-foreground text-sm mb-2">{ds.name}</p>
                  <div className="space-y-1">
                    {ds.columns.map(col => {
                      const isKey = relationships.some(r =>
                        (r.sourceDataSetId === ds.id && r.sourceColumn === col.name) ||
                        (r.targetDataSetId === ds.id && r.targetColumn === col.name)
                      );
                      return (
                        <p key={col.name} className={`text-xs ${isKey ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                          {isKey ? '🔑 ' : ''}{col.name} <span className="opacity-60">({col.type})</span>
                        </p>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Relationships List */}
      {relationships.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Network className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No relationships defined</h3>
          <p className="text-muted-foreground">Link datasets together by defining column relationships</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {relationships.map((rel, i) => {
            const src = dataSets.find(d => d.id === rel.sourceDataSetId);
            const tgt = dataSets.find(d => d.id === rel.targetDataSetId);
            return (
              <motion.div key={rel.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl p-4 border border-border shadow-card flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-sm text-primary font-medium">{src?.name}.{rel.sourceColumn}</div>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <ArrowRight className="w-4 h-4" />
                    <span className="bg-muted px-2 py-0.5 rounded">{rel.type}</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-info/10 text-sm text-info font-medium">{tgt?.name}.{rel.targetColumn}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => { removeRelationship(rel.id); toast({ title: 'Relationship removed' }); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
