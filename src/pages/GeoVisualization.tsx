import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe, Map, BarChart2 } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';

const PALETTE = [
  'hsl(199 89% 48%)', 'hsl(142 76% 36%)', 'hsl(38 92% 50%)', 'hsl(0 72% 51%)',
  'hsl(262 83% 58%)', 'hsl(180 70% 45%)', 'hsl(330 80% 55%)', 'hsl(45 93% 47%)',
];

// Lightweight SVG bubble-matrix world map — no external dep required
// Displays top regions as proportional bubbles on a stylized world grid.
function BubbleMap({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (data.length === 0) return null;

  const max = Math.max(...data.map(d => d.value));
  const cols = Math.ceil(Math.sqrt(data.length));
  const rows = Math.ceil(data.length / cols);
  const cellW = 120;
  const cellH = 90;
  const pad = 16;
  const totalW = cols * cellW + pad * 2;
  const totalH = rows * cellH + pad * 2;

  return (
    <div className="relative overflow-auto">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width="100%"
        style={{ minHeight: 320, background: 'transparent' }}
      >
        {/* Grid background lines */}
        {Array.from({ length: cols + 1 }).map((_, i) => (
          <line key={`v${i}`} x1={pad + i * cellW} y1={pad} x2={pad + i * cellW} y2={totalH - pad}
            stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="3 3" />
        ))}
        {Array.from({ length: rows + 1 }).map((_, i) => (
          <line key={`h${i}`} x1={pad} y1={pad + i * cellH} x2={totalW - pad} y2={pad + i * cellH}
            stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="3 3" />
        ))}

        {data.map((d, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = pad + col * cellW + cellW / 2;
          const cy = pad + row * cellH + cellH / 2;
          const maxR = Math.min(cellW, cellH) / 2 - 6;
          const r = Math.max(8, (d.value / max) * maxR);
          const color = PALETTE[i % PALETTE.length];
          const isHov = hovered === d.name;

          return (
            <g key={d.name}
              onMouseEnter={() => setHovered(d.name)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}>
              <circle cx={cx} cy={cy} r={r}
                fill={color} fillOpacity={isHov ? 0.95 : 0.65}
                stroke={color} strokeWidth={isHov ? 2 : 1}
                style={{ transition: 'all 0.2s' }} />
              <text x={cx} y={cy + r + 13}
                textAnchor="middle" fontSize={10}
                fill="hsl(var(--muted-foreground))"
                style={{ pointerEvents: 'none' }}>
                {d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name}
              </text>
              {isHov && (
                <g>
                  <rect x={cx - 50} y={cy - r - 32} width={100} height={26} rx={6}
                    fill="hsl(var(--card))" stroke={color} strokeWidth={1} />
                  <text x={cx} y={cy - r - 14}
                    textAnchor="middle" fontSize={11} fontWeight="600"
                    fill="hsl(var(--foreground))">
                    {d.value.toLocaleString()}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function GeoVisualization() {
  const { dataSets } = useDataStore();
  const [selectedDataSet, setSelectedDataSet] = useState('');
  const [locationCol, setLocationCol] = useState('');
  const [valueCol, setValueCol] = useState('');
  const [tab, setTab] = useState<'map' | 'bar'>('map');

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

  const totalValue = geoData.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Globe className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Geo Visualization
              <HelpTooltip text="Visualisasikan data berdasarkan lokasi geografis. Tampilan Bubble Map dan Bar Chart tersedia." />
            </h1>
            <p className="text-muted-foreground">Visualize data by geographic regions — bubble map & bar chart</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-4 sticky top-4">
            <h3 className="font-semibold text-foreground text-sm">Data Source</h3>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
              <Select value={selectedDataSet} onValueChange={v => {
                setSelectedDataSet(v); setLocationCol(''); setValueCol('');
              }}>
                <SelectTrigger className="bg-muted/50 border-border">
                  <SelectValue placeholder="Select dataset" />
                </SelectTrigger>
                <SelectContent>
                  {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {dataset && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Location Column</label>
                  <Select value={locationCol || 'none'} onValueChange={v => setLocationCol(v === 'none' ? '' : v)}>
                    <SelectTrigger className="bg-muted/50 border-border">
                      <SelectValue placeholder="e.g. city/country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select column</SelectItem>
                      {dataset.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Value Column</label>
                  <Select value={valueCol || 'none'} onValueChange={v => setValueCol(v === 'none' ? '' : v)}>
                    <SelectTrigger className="bg-muted/50 border-border">
                      <SelectValue placeholder="Numeric" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select column</SelectItem>
                      {dataset.columns.filter(c => c.type === 'number').map(c =>
                        <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {geoData.length > 0 && (
              <div className="pt-2 border-t border-border/50 space-y-2">
                <p className="text-xs text-muted-foreground">Summary</p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Locations</span><span className="font-semibold text-foreground">{geoData.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold text-foreground">{totalValue.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Top</span><span className="font-semibold text-primary">{geoData[0]?.name}</span></div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Visualization */}
        <motion.div className="lg:col-span-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          {geoData.length === 0 ? (
            <div className="bg-card rounded-xl p-16 border border-border shadow-card text-center">
              <Globe className="w-20 h-20 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Configure your map</h3>
              <p className="text-muted-foreground">Select a dataset, location column, and value column to visualize</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <Tabs value={tab} onValueChange={v => setTab(v as 'map' | 'bar')}>
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{valueCol} by {locationCol}</p>
                  <TabsList className="h-8">
                    <TabsTrigger value="map" className="h-6 text-xs gap-1">
                      <Map className="w-3 h-3" /> Bubble Map
                    </TabsTrigger>
                    <TabsTrigger value="bar" className="h-6 text-xs gap-1">
                      <BarChart2 className="w-3 h-3" /> Bar Chart
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="map" className="p-4 m-0">
                  {/* BUG-H1 FIX: Interactive SVG Bubble Map — no external dep */}
                  <BubbleMap data={geoData} />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Bubble size = relative value. Hover for exact number.
                  </p>
                </TabsContent>

                <TabsContent value="bar" className="p-4 m-0">
                  <div style={{ height: 420 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={geoData} layout="vertical" margin={{ left: 80, right: 24, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={78}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                          formatter={(v: number) => [v.toLocaleString(), valueCol]}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {geoData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Top regions legend */}
          {geoData.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {geoData.slice(0, 6).map((d, i) => (
                <div key={d.name} className="bg-card rounded-lg p-3 border border-border/50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground">{d.value.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
