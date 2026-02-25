import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Table2, Download } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { HelpTooltip } from '@/components/HelpTooltip';

type AggFunc = 'sum' | 'avg' | 'count' | 'min' | 'max';

export default function PivotTable() {
  const { dataSets } = useDataStore();
  const { toast } = useToast();
  const [dsId, setDsId] = useState('');
  const [rowField, setRowField] = useState('');
  const [colField, setColField] = useState('');
  const [valueField, setValueField] = useState('');
  const [aggFunc, setAggFunc] = useState<AggFunc>('sum');

  const dataset = dataSets.find(d => d.id === dsId);
  const strCols = dataset?.columns.filter(c => c.type === 'string') || [];
  const numCols = dataset?.columns.filter(c => c.type === 'number') || [];

  const pivotData = useMemo(() => {
    if (!dataset || !rowField || !valueField) return null;

    const rows = new Set<string>();
    const cols = new Set<string>();
    const cells: Record<string, number[]> = {};

    dataset.data.forEach(row => {
      const r = String(row[rowField] ?? 'N/A');
      const c = colField ? String(row[colField] ?? 'N/A') : 'Value';
      const v = Number(row[valueField]) || 0;
      rows.add(r);
      cols.add(c);
      const key = `${r}__${c}`;
      if (!cells[key]) cells[key] = [];
      cells[key].push(v);
    });

    const rowKeys = Array.from(rows).sort();
    const colKeys = Array.from(cols).sort();

    const aggregate = (vals: number[]) => {
      if (!vals || vals.length === 0) return 0;
      switch (aggFunc) {
        case 'sum': return vals.reduce((a, b) => a + b, 0);
        case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length;
        case 'count': return vals.length;
        case 'min': return Math.min(...vals);
        case 'max': return Math.max(...vals);
      }
    };

    const tableData = rowKeys.map(r => {
      const row: Record<string, any> = { _row: r };
      let rowTotal = 0;
      colKeys.forEach(c => {
        const val = aggregate(cells[`${r}__${c}`] || []);
        row[c] = val;
        rowTotal += val;
      });
      row._total = rowTotal;
      return row;
    });

    // Grand totals
    const grandTotals: Record<string, number> = {};
    colKeys.forEach(c => {
      grandTotals[c] = tableData.reduce((sum, row) => sum + (row[c] || 0), 0);
    });
    grandTotals._total = Object.values(grandTotals).reduce((a, b) => a + b, 0);

    return { rowKeys, colKeys, tableData, grandTotals };
  }, [dataset, rowField, colField, valueField, aggFunc]);

  const exportCSV = () => {
    if (!pivotData) return;
    const header = [rowField, ...pivotData.colKeys, 'Total'].join(',');
    const rows = pivotData.tableData.map(r =>
      [r._row, ...pivotData.colKeys.map(c => r[c]?.toFixed(2)), r._total?.toFixed(2)].join(',')
    );
    const totals = ['Grand Total', ...pivotData.colKeys.map(c => pivotData.grandTotals[c]?.toFixed(2)), pivotData.grandTotals._total?.toFixed(2)].join(',');
    const csv = [header, ...rows, totals].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pivot-table.csv'; a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'Pivot table exported as CSV.' });
  };

  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Table2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Pivot Table <HelpTooltip text="Buat tabel pivot: pilih Row Field (baris), Column Field (kolom), Value Field (nilai numerik), dan Aggregation (Sum/Avg/dll). Ekspor hasil ke CSV." /></h1>
            <p className="text-muted-foreground">Cross-tabulation analysis with drag & drop fields</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div><Label>Dataset</Label>
            <Select value={dsId} onValueChange={v => { setDsId(v); setRowField(''); setColField(''); setValueField(''); }}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Row Field</Label>
            <Select value={rowField} onValueChange={setRowField}>
              <SelectTrigger><SelectValue placeholder="Rows" /></SelectTrigger>
              <SelectContent>{strCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Column Field</Label>
            <Select value={colField || "none"} onValueChange={v => setColField(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Columns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {strCols.filter(c => c.name !== rowField).map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Value Field</Label>
            <Select value={valueField} onValueChange={setValueField}>
              <SelectTrigger><SelectValue placeholder="Values" /></SelectTrigger>
              <SelectContent>{numCols.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Aggregation</Label>
            <Select value={aggFunc} onValueChange={(v: AggFunc) => setAggFunc(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">Sum</SelectItem><SelectItem value="avg">Average</SelectItem>
                <SelectItem value="count">Count</SelectItem><SelectItem value="min">Min</SelectItem><SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {pivotData ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">{aggFunc.toUpperCase()} of {valueField} by {rowField}{colField ? ` × ${colField}` : ''}</h3>
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">{rowField}</TableHead>
                  {pivotData.colKeys.map(c => <TableHead key={c} className="text-right">{c}</TableHead>)}
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pivotData.tableData.map(row => (
                  <TableRow key={row._row}>
                    <TableCell className="font-medium">{row._row}</TableCell>
                    {pivotData.colKeys.map(c => <TableCell key={c} className="text-right">{fmt(row[c] || 0)}</TableCell>)}
                    <TableCell className="text-right font-bold">{fmt(row._total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold">Grand Total</TableCell>
                  {pivotData.colKeys.map(c => <TableCell key={c} className="text-right font-bold">{fmt(pivotData.grandTotals[c] || 0)}</TableCell>)}
                  <TableCell className="text-right font-bold">{fmt(pivotData.grandTotals._total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </motion.div>
      ) : dataset && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Table2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Configure your pivot</h3>
          <p className="text-muted-foreground">Select Row, Value fields above to generate pivot table</p>
        </motion.div>
      )}
    </div>
  );
}
