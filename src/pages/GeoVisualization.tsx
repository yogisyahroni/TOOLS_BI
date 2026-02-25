import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Globe } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';

const REGION_COLORS = [
  'hsl(199 89% 48%)', 'hsl(142 76% 36%)', 'hsl(38 92% 50%)', 'hsl(0 72% 51%)',
  'hsl(262 83% 58%)', 'hsl(180 70% 45%)', 'hsl(330 80% 55%)', 'hsl(45 93% 47%)',
];

export default function GeoVisualization() {
  const { dataSets } = useDataStore();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [locationCol, setLocationCol] = useState('');
  const [valueCol, setValueCol] = useState('');

  const dataset = dataSets.find(ds => ds.id === selectedDataSet);

  const geoData = useMemo(() => {
    if (!dataset || !locationCol || !valueCol) return [];
    const grouped: Record<string, number> = {};
    dataset.data.forEach(row => {
      const loc = String(row[locationCol] || 'Unknown');
      const val = Number(row[valueCol]) || 0;
      grouped[loc] = (grouped[loc] || 0) + val;
    });
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 30);
  }, [dataset, locationCol, valueCol]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Globe className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Geo Visualization <HelpTooltip text="Visualisasikan data berdasarkan lokasi geografis. Pilih kolom lokasi (kota/negara) dan kolom nilai untuk melihat distribusi pada chart." /></h1>
            <p className="text-muted-foreground">Visualize data by geographic regions</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Configuration</h3>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
              <Select value={selectedDataSet} onValueChange={v => { setSelectedDataSet(v); setLocationCol(''); setValueCol(''); }}>
                <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {dataset && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Location Column</label>
                  <Select value={locationCol || "none"} onValueChange={v => setLocationCol(v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select column</SelectItem>
                      {dataset.columns.filter(c => c.type === 'string').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Value Column</label>
                  <Select value={valueCol || "none"} onValueChange={v => setValueCol(v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select column</SelectItem>
                      {dataset.columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {geoData.length > 0 && (
            <div className="bg-card rounded-xl p-5 border border-border shadow-card">
              <h3 className="font-semibold text-foreground text-sm mb-3">Top Regions</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {geoData.slice(0, 10).map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: REGION_COLORS[i % REGION_COLORS.length] }} />
                    <span className="text-xs text-foreground flex-1 truncate">{d.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-3">
          {geoData.length > 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">Regional Distribution — {locationCol} by {valueCol}</h3>
              </div>
              <div className="p-4 h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={geoData} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={75} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {geoData.map((_, i) => <Cell key={i} fill={REGION_COLORS[i % REGION_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
              <Globe className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Configure Geo View</h3>
              <p className="text-muted-foreground">Select a dataset, location column, and value column</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
