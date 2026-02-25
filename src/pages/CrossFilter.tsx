import { useState, useMemo } from 'react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { motion } from 'framer-motion';
import { Link2, X } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const COLORS = ['hsl(199 89% 48%)', 'hsl(142 76% 36%)', 'hsl(38 92% 50%)', 'hsl(0 72% 51%)', 'hsl(262 83% 58%)', 'hsl(180 70% 45%)'];

export default function CrossFilter() {
  const { dataSets } = useDataStore();
  const [dsId, setDsId] = useState('');
  const [col1, setCol1] = useState('');
  const [col2, setCol2] = useState('');
  const [col3, setCol3] = useState('');
  const [activeFilter, setActiveFilter] = useState<{ column: string; value: string } | null>(null);

  const dataset = dataSets.find(ds => ds.id === dsId);

  const filteredData = useMemo(() => {
    if (!dataset) return [];
    if (!activeFilter) return dataset.data;
    return dataset.data.filter(row => String(row[activeFilter.column]) === activeFilter.value);
  }, [dataset, activeFilter]);

  const aggregate = (col: string) => {
    const grouped: Record<string, number> = {};
    filteredData.forEach(row => {
      const key = String(row[col] || 'N/A');
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  };

  const handleClick = (col: string, value: string) => {
    if (activeFilter?.column === col && activeFilter?.value === value) {
      setActiveFilter(null);
    } else {
      setActiveFilter({ column: col, value });
    }
  };

  const chart1 = col1 ? aggregate(col1) : [];
  const chart2 = col2 ? aggregate(col2) : [];
  const chart3 = col3 ? aggregate(col3) : [];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Link2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Cross-Filter Charts <HelpTooltip text="Klik segmen pada satu chart untuk memfilter semua chart lainnya secara bersamaan. Pilih dataset dan kolom yang ingin dianalisis." /></h1>
            <p className="text-muted-foreground">Click any chart segment to filter all charts simultaneously</p>
          </div>
        </div>
      </motion.div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px]">
            <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
            <Select value={dsId} onValueChange={v => { setDsId(v); setCol1(''); setCol2(''); setCol3(''); setActiveFilter(null); }}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {dataset && ['Chart 1', 'Chart 2', 'Chart 3'].map((label, i) => {
            const val = [col1, col2, col3][i];
            const setter = [setCol1, setCol2, setCol3][i];
            return (
              <div key={label} className="min-w-[150px]">
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <Select value={val || "none"} onValueChange={v => setter(v === "none" ? "" : v)}>
                  <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Column" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {activeFilter && (
            <Button variant="outline" size="sm" onClick={() => setActiveFilter(null)} className="gap-1">
              <X className="w-3 h-3" /> Clear: {activeFilter.column}={activeFilter.value}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {col1 && chart1.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="p-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">{col1}</span>
              <span className="text-xs text-muted-foreground ml-2">(Bar Chart)</span>
            </div>
            <div className="p-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                  <Bar dataKey="value" cursor="pointer" onClick={(d: any) => handleClick(col1, d.name)}>
                    {chart1.map((d, i) => (
                      <Cell key={i} fill={activeFilter?.value === d.name && activeFilter?.column === col1 ? 'hsl(var(--primary))' : COLORS[i % COLORS.length]} opacity={activeFilter && !(activeFilter.column === col1 && activeFilter.value === d.name) ? 0.4 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {col2 && chart2.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="p-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">{col2}</span>
              <span className="text-xs text-muted-foreground ml-2">(Pie Chart)</span>
            </div>
            <div className="p-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chart2} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} cursor="pointer"
                    onClick={(d: any) => handleClick(col2, d.name)}>
                    {chart2.map((d, i) => (
                      <Cell key={i} fill={activeFilter?.value === d.name && activeFilter?.column === col2 ? 'hsl(var(--primary))' : COLORS[i % COLORS.length]} opacity={activeFilter && !(activeFilter.column === col2 && activeFilter.value === d.name) ? 0.4 : 1} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {col3 && chart3.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="p-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">{col3}</span>
              <span className="text-xs text-muted-foreground ml-2">(Line Chart)</span>
            </div>
            <div className="p-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </div>

      {!col1 && !col2 && !col3 && dataset && (
        <div className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <Link2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Select Columns for Charts</h3>
          <p className="text-muted-foreground">Choose columns above to create cross-filtered visualizations</p>
        </div>
      )}
    </div>
  );
}
