import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Paintbrush, Plus, Trash2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';

interface FormatRule {
  id: string;
  column: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains' | 'empty';
  value: string;
  bgColor: string;
  textColor: string;
}

const CONDITIONS = [
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
  { value: 'contains', label: 'Contains' },
  { value: 'empty', label: 'Is Empty' },
];

const PRESETS = [
  { label: 'High (Green)', bg: 'hsl(142 76% 36% / 0.2)', text: 'hsl(142 76% 56%)' },
  { label: 'Medium (Yellow)', bg: 'hsl(38 92% 50% / 0.2)', text: 'hsl(38 92% 60%)' },
  { label: 'Low (Red)', bg: 'hsl(0 72% 51% / 0.2)', text: 'hsl(0 72% 65%)' },
  { label: 'Info (Blue)', bg: 'hsl(199 89% 48% / 0.2)', text: 'hsl(199 89% 60%)' },
];

function matchesRule(value: any, rule: FormatRule): boolean {
  if (rule.condition === 'empty') return value == null || String(value).trim() === '';
  if (rule.condition === 'contains') return String(value).toLowerCase().includes(rule.value.toLowerCase());
  const num = Number(value);
  const threshold = Number(rule.value);
  if (isNaN(num) || isNaN(threshold)) {
    if (rule.condition === 'eq') return String(value) === rule.value;
    return false;
  }
  switch (rule.condition) {
    case 'gt': return num > threshold;
    case 'lt': return num < threshold;
    case 'gte': return num >= threshold;
    case 'lte': return num <= threshold;
    case 'eq': return num === threshold;
    default: return false;
  }
}

export default function ConditionalFormatting() {
  const { dataSets } = useDataStore();
  const { toast } = useToast();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [rules, setRules] = useState<FormatRule[]>([]);
  const [newCol, setNewCol] = useState('');
  const [newCond, setNewCond] = useState<string>('gt');
  const [newVal, setNewVal] = useState('');
  const [newBg, setNewBg] = useState(PRESETS[0].bg);
  const [newText, setNewText] = useState(PRESETS[0].text);

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);

  const addRule = () => {
    if (!newCol) { toast({ title: 'Select a column', variant: 'destructive' }); return; }
    setRules(prev => [...prev, {
      id: Date.now().toString(), column: newCol, condition: newCond as FormatRule['condition'],
      value: newVal, bgColor: newBg, textColor: newText,
    }]);
    toast({ title: 'Rule added' });
  };

  const previewData = dataset?.data.slice(0, 50) || [];

  const getCellStyle = (col: string, value: any): React.CSSProperties => {
    for (const rule of rules) {
      if (rule.column === col && matchesRule(value, rule)) {
        return { backgroundColor: rule.bgColor, color: rule.textColor };
      }
    }
    return {};
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Paintbrush className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Conditional Formatting <HelpTooltip text="Warnai cell tabel berdasarkan aturan (>, <, =, contains, dll). Pilih warna background dan teks untuk setiap kondisi." /></h1>
            <p className="text-muted-foreground">Color-code cells based on data rules</p>
          </div>
        </div>
      </motion.div>

      {/* Dataset + Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Data Source</h3>
            <Select value={selectedDataSet} onValueChange={setSelectedDataSet}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>
                {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Add Rule</h3>
            {dataset && (
              <>
                <Select value={newCol || "none"} onValueChange={v => setNewCol(v === "none" ? "" : v)}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Column" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select column</SelectItem>
                    {dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={newCond} onValueChange={setNewCond}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {newCond !== 'empty' && (
                  <Input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="Value" className="bg-muted/50 border-border" />
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Color Preset</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESETS.map(p => (
                      <button key={p.label} onClick={() => { setNewBg(p.bg); setNewText(p.text); }}
                        className="text-xs p-2 rounded-lg border border-border/50 text-left transition-all hover:scale-105"
                        style={{ backgroundColor: p.bg, color: p.text }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button onClick={addRule} className="w-full gradient-primary text-primary-foreground" size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Add Rule
                </Button>
              </>
            )}
          </div>

          {/* Active Rules */}
          {rules.length > 0 && (
            <div className="bg-card rounded-xl p-5 border border-border shadow-card">
              <h3 className="font-semibold text-foreground text-sm mb-3">Active Rules ({rules.length})</h3>
              <div className="space-y-2">
                {rules.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: r.bgColor }}>
                    <span className="text-xs font-mono" style={{ color: r.textColor }}>
                      {r.column} {CONDITIONS.find(c => c.value === r.condition)?.label} {r.value}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Preview Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2">
          {dataset ? (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="p-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground">Preview — {dataset.name}</span>
                <span className="text-xs text-muted-foreground ml-2">({rules.length} rules active)</span>
              </div>
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      {dataset.columns.map(col => (
                        <TableHead key={col.name} className="text-muted-foreground text-xs font-mono">{col.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row, i) => (
                      <TableRow key={i} className="border-border">
                        {dataset.columns.map(col => (
                          <TableCell key={col.name} className="text-xs font-mono" style={getCellStyle(col.name, row[col.name])}>
                            {row[col.name] != null ? String(row[col.name]) : ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
              <Paintbrush className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Select a Dataset</h3>
              <p className="text-muted-foreground">Choose a dataset to apply conditional formatting</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
