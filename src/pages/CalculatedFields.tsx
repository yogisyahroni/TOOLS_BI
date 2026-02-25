import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calculator, Plus, Trash2, Play, Sparkles, AlertTriangle } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { CalculatedField } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

const FORMULA_TEMPLATES = [
  { label: 'SUM(column)', formula: 'SUM(column_name)', desc: 'Sum of all values' },
  { label: 'AVG(column)', formula: 'AVG(column_name)', desc: 'Average value' },
  { label: 'COUNT(column)', formula: 'COUNT(column_name)', desc: 'Count non-null' },
  { label: 'IF condition', formula: 'IF(column_name > 100, "High", "Low")', desc: 'Conditional logic' },
  { label: 'Math operation', formula: 'column_a + column_b', desc: 'Arithmetic between columns' },
  { label: 'Percentage', formula: '(column_a / column_b) * 100', desc: 'Percentage calculation' },
  { label: 'CONCAT', formula: 'CONCAT(col_a, " - ", col_b)', desc: 'Join text values' },
  { label: 'ROUND', formula: 'ROUND(column_name, 2)', desc: 'Round to decimals' },
];

function evaluateFormula(formula: string, row: Record<string, any>, allRows: Record<string, any>[]): any {
  const f = formula.trim();

  // Aggregation functions
  const aggMatch = f.match(/^(SUM|AVG|COUNT|MIN|MAX)\((\w+)\)$/i);
  if (aggMatch) {
    const [, fn, col] = aggMatch;
    const vals = allRows.map(r => Number(r[col])).filter(n => !isNaN(n));
    switch (fn.toUpperCase()) {
      case 'SUM': return vals.reduce((a, b) => a + b, 0);
      case 'AVG': return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      case 'COUNT': return allRows.filter(r => r[col] != null).length;
      case 'MIN': return vals.length ? Math.min(...vals) : 0;
      case 'MAX': return vals.length ? Math.max(...vals) : 0;
    }
  }

  // ROUND
  const roundMatch = f.match(/^ROUND\((.+),\s*(\d+)\)$/i);
  if (roundMatch) {
    const inner = evaluateFormula(roundMatch[1], row, allRows);
    return Number(Number(inner).toFixed(Number(roundMatch[2])));
  }

  // CONCAT
  const concatMatch = f.match(/^CONCAT\((.+)\)$/i);
  if (concatMatch) {
    const parts = concatMatch[1].split(',').map(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
      return row[trimmed] ?? trimmed;
    });
    return parts.join('');
  }

  // IF
  const ifMatch = f.match(/^IF\((.+?)\s*(>|<|>=|<=|=|!=)\s*(.+?),\s*(.+?),\s*(.+?)\)$/i);
  if (ifMatch) {
    const [, col, op, threshold, trueVal, falseVal] = ifMatch;
    const colVal = Number(row[col.trim()] ?? 0);
    const threshNum = Number(threshold.trim().replace(/"/g, ''));
    const clean = (v: string) => { const t = v.trim(); return t.startsWith('"') ? t.slice(1, -1) : Number(t); };
    let cond = false;
    switch (op) {
      case '>': cond = colVal > threshNum; break;
      case '<': cond = colVal < threshNum; break;
      case '>=': cond = colVal >= threshNum; break;
      case '<=': cond = colVal <= threshNum; break;
      case '=': cond = colVal === threshNum; break;
      case '!=': cond = colVal !== threshNum; break;
    }
    return cond ? clean(trueVal) : clean(falseVal);
  }

  // Arithmetic: col_a + col_b, col_a * 2, etc.
  const arithMatch = f.match(/^(\w+)\s*([+\-*/])\s*(.+)$/);
  if (arithMatch) {
    const [, left, op, right] = arithMatch;
    const lv = row[left] != null ? Number(row[left]) : Number(left);
    const rv = row[right.trim()] != null ? Number(row[right.trim()]) : Number(right.trim());
    if (!isNaN(lv) && !isNaN(rv)) {
      switch (op) {
        case '+': return lv + rv;
        case '-': return lv - rv;
        case '*': return lv * rv;
        case '/': return rv !== 0 ? lv / rv : 0;
      }
    }
  }

  // Percentage: (col_a / col_b) * 100
  const pctMatch = f.match(/^\((\w+)\s*\/\s*(\w+)\)\s*\*\s*(\d+)$/);
  if (pctMatch) {
    const [, a, b, mult] = pctMatch;
    const av = Number(row[a] ?? 0);
    const bv = Number(row[b] ?? 1);
    return bv !== 0 ? (av / bv) * Number(mult) : 0;
  }

  // Direct column ref
  if (row[f] !== undefined) return row[f];

  return 'N/A';
}

export default function CalculatedFields() {
  const { dataSets, calculatedFields, addCalculatedField, removeCalculatedField } = useDataStore();
  const { toast } = useToast();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [formula, setFormula] = useState('');
  const [preview, setPreview] = useState<any[] | null>(null);

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);
  const dsFields = calculatedFields.filter(f => f.dataSetId === selectedDataSet);

  const handlePreview = () => {
    if (!dataset || !formula.trim()) return;
    try {
      const results = dataset.data.slice(0, 10).map(row => ({
        ...row,
        [fieldName || '_result']: evaluateFormula(formula, row, dataset.data),
      }));
      setPreview(results);
    } catch {
      toast({ title: 'Formula error', variant: 'destructive' });
    }
  };

  const handleSave = () => {
    if (!fieldName.trim() || !formula.trim() || !selectedDataSet) {
      toast({ title: 'Fill all fields', variant: 'destructive' });
      return;
    }
    addCalculatedField({
      id: Date.now().toString(),
      dataSetId: selectedDataSet,
      name: fieldName,
      formula,
      createdAt: new Date(),
    });
    toast({ title: 'Calculated field saved', description: fieldName });
    setFieldName('');
    setFormula('');
    setPreview(null);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Calculator className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Calculated Fields <HelpTooltip text="Buat kolom baru dengan formula DAX-like (SUM, AVG, IF, CONCAT, dll). Pilih dataset, tulis formula, lalu klik Evaluate untuk melihat hasil." /></h1>
            <p className="text-muted-foreground">Create DAX-like formulas and computed columns</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formula Builder */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2 space-y-4">
          <div className="bg-card rounded-xl p-6 border border-border shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">New Calculated Field</h3>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
              <Select value={selectedDataSet} onValueChange={setSelectedDataSet}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                <SelectContent>
                  {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {dataset && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground mr-1">Columns:</span>
                {dataset.columns.map(c => (
                  <button key={c.name} onClick={() => setFormula(f => f + c.name)}
                    className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono">
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Field Name</label>
              <Input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="e.g., revenue_per_unit" className="bg-muted/50 border-border font-mono" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Formula</label>
              <Input value={formula} onChange={e => setFormula(e.target.value)} placeholder='e.g., IF(salary > 50000, "High", "Low")' className="bg-muted/50 border-border font-mono" />
            </div>

            <div className="flex gap-2">
              <Button onClick={handlePreview} variant="outline" size="sm" disabled={!dataset || !formula}>
                <Play className="w-4 h-4 mr-1" /> Preview
              </Button>
              <Button onClick={handleSave} size="sm" className="gradient-primary text-primary-foreground" disabled={!fieldName || !formula || !selectedDataSet}>
                <Plus className="w-4 h-4 mr-1" /> Save Field
              </Button>
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="p-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground">Preview (first 10 rows)</span>
              </div>
              <div className="overflow-auto max-h-[300px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {dataset && dataset.columns.slice(0, 3).map(c => (
                        <th key={c.name} className="p-2 text-left text-muted-foreground font-mono">{c.name}</th>
                      ))}
                      <th className="p-2 text-left text-primary font-mono font-bold">{fieldName || '_result'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                        {dataset && dataset.columns.slice(0, 3).map(c => (
                          <td key={c.name} className="p-2 text-foreground font-mono">{String(row[c.name] ?? '')}</td>
                        ))}
                        <td className="p-2 text-primary font-mono font-semibold">{String(row[fieldName || '_result'] ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Saved Fields */}
          {dsFields.length > 0 && (
            <div className="bg-card rounded-xl p-5 border border-border shadow-card">
              <h3 className="font-semibold text-foreground mb-3">Saved Fields</h3>
              <div className="space-y-2">
                {dsFields.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{f.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{f.formula}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { removeCalculatedField(f.id); toast({ title: 'Deleted' }); }}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Formula Reference */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">Formula Templates</h3>
            </div>
            <div className="space-y-2">
              {FORMULA_TEMPLATES.map(t => (
                <button key={t.label} onClick={() => setFormula(t.formula)}
                  className="w-full text-left p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <p className="text-xs font-semibold text-foreground">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{t.formula}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <h3 className="font-semibold text-foreground text-sm">Supported Functions</h3>
            </div>
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p><span className="text-primary font-mono">SUM, AVG, COUNT, MIN, MAX</span> — Aggregations</p>
              <p><span className="text-primary font-mono">IF(cond, true, false)</span> — Conditional</p>
              <p><span className="text-primary font-mono">CONCAT(a, b, ...)</span> — Text join</p>
              <p><span className="text-primary font-mono">ROUND(expr, n)</span> — Round decimals</p>
              <p><span className="text-primary font-mono">+, -, *, /</span> — Arithmetic</p>
              <p><span className="text-primary font-mono">(a / b) * 100</span> — Percentage</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
