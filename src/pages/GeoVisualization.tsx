import React from 'react';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe, Map as MapIcon, BarChart2, Layers } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { HelpTooltip } from '@/components/HelpTooltip';

// Deck.GL & MapLibre Integrations
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import MapGL from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDatasets, useDatasetData } from '@/hooks/useApi';

const PALETTE = [
  'hsl(199 89% 48%)', 'hsl(142 76% 36%)', 'hsl(38 92% 50%)', 'hsl(0 72% 51%)',
  'hsl(262 83% 58%)', 'hsl(180 70% 45%)', 'hsl(330 80% 55%)', 'hsl(45 93% 47%)',
];

// Parse HSL to RGB array for deck.gl
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
};

const PALETTE_RGB = [
  hslToRgb(199, 89, 48), hslToRgb(142, 76, 36), hslToRgb(38, 92, 50), hslToRgb(0, 72, 51),
  hslToRgb(262, 83, 58), hslToRgb(180, 70, 45), hslToRgb(330, 80, 55), hslToRgb(45, 93, 47)
];


const CARTO_POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// DeckGL Map Component overlaying MapLibre
function DeckGLMap({
  data,
}: {
  data: { name: string; position: [number, number]; value: number; color: [number, number, number] }[];
}) {
  const max = data.length > 0 ? Math.max(...data.map(d => d.value)) : 1;

  const layer = new ScatterplotLayer({
    id: 'scatterplot-layer',
    data,
    pickable: true,
    opacity: 0.8,
    stroked: true,
    filled: true,
    radiusScale: 100, // Basis for radius
    radiusMinPixels: 4,
    radiusMaxPixels: 60,
    lineWidthMinPixels: 1,
    getPosition: d => d.position,
    // Size scaling based on relative value
    getRadius: d => Math.max(10, (d.value / max) * 1000),
    getFillColor: d => d.color,
    getLineColor: [255, 255, 255],
  });

  return (
    <div className="relative w-full rounded-md overflow-hidden bg-muted/20" style={{ height: 420 }}>
      {data.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground z-10 pointer-events-none">
          <MapIcon className="w-12 h-12 mb-3 opacity-20" />
          <p>No valid coordinate data points found.</p>
        </div>
      ) : null}
      <DeckGL
        initialViewState={{
          longitude: 0,
          latitude: 20,
          zoom: 1.5,
          pitch: 0,
          bearing: 0
        }}
        controller={true}
        layers={[layer]}
        getTooltip={({ object }) =>
          object && {
            html: `<b>${object.name}</b><br/>Value: ${object.value.toLocaleString()}`,
            style: {
              backgroundColor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              padding: '8px',
              fontSize: '12px',
              fontFamily: 'Inter, sans-serif'
            }
          }
        }
      >
        <MapGL
          mapStyle={CARTO_POSITRON}
          attributionControl={false}
        />
      </DeckGL>
    </div>
  );
}

export default function GeoVisualization() {
  const { data: dataSets = [] } = useDatasets();
  const [selectedDataSet, setSelectedDataSet] = useState('');

  // Coordinate config
  const [latCol, setLatCol] = useState('');
  const [lngCol, setLngCol] = useState('');
  const [valueCol, setValueCol] = useState('');
  const [nameCol, setNameCol] = useState('');

  const [tab, setTab] = useState<'map' | 'bar'>('map');

  const { data: __datasetDataRes, isLoading: __isDataLoading } = useDatasetData(selectedDataSet || '', { limit: 10000 });
  const dataset = React.useMemo(() => {
    const meta = dataSets.find(ds => ds.id === selectedDataSet);
    if (!meta) return null;
    return { ...meta, data: __datasetDataRes?.data || [] };
  }, [dataSets, selectedDataSet, __datasetDataRes]);

  const geoData = useMemo(() => {
    if (!dataset || !latCol || !lngCol || !valueCol) return [];

    // Attempt to aggregate by combination of Lat/Lng to merge identical points
    const grouped: Record<string, { lat: number, lng: number, val: number, names: Set<string> }> = {};

    dataset.data.forEach(row => {
      const lat = Number(row[latCol]);
      const lng = Number(row[lngCol]);
      const val = Number(row[valueCol]) || 0;
      const name = nameCol ? String(row[nameCol] || 'Unknown') : `${lat}, ${lng}`;

      if (isNaN(lat) || isNaN(lng)) return; // skip missing/invalid coordinates

      const key = `${lat.toFixed(4)}_${lng.toFixed(4)}`; // group nearby
      if (!grouped[key]) {
        grouped[key] = { lat, lng, val: 0, names: new Set() };
      }
      grouped[key].val += val;
      if (nameCol) grouped[key].names.add(name);
    });

    const results = Object.values(grouped).map((g, i) => ({
      name: nameCol ? Array.from(g.names).join(' / ') : `Point ${i + 1}`,
      position: [g.lng, g.lat] as [number, number], // DeckGL uses [longitude, latitude]
      value: g.val,
      color: PALETTE_RGB[i % PALETTE_RGB.length] as [number, number, number]
    }));

    return results.sort((a, b) => b.value - a.value);
  }, [dataset, latCol, lngCol, valueCol, nameCol]);

  // Transform data for barchart (using highest values)
  const barChartData = useMemo(() => {
    return geoData.slice(0, 30).map((d, i) => ({
      name: d.name,
      value: d.value,
      fill: PALETTE[i % PALETTE.length]
    }));
  }, [geoData]);

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
              Geo-Spatial WebGL
              <HelpTooltip text="Visualisasikan jutaan data poin geografis dalam performa tinggi berkat akselerasi GPU Deck.GL." />
            </h1>
            <p className="text-muted-foreground">High-performance 3D mapping overlay powered by WebGL</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Controls */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="bg-card rounded-xl p-5 border border-border shadow-card space-y-4 sticky top-4">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Map Configuration
            </h3>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
              <Select value={selectedDataSet} onValueChange={v => {
                setSelectedDataSet(v); setLatCol(''); setLngCol(''); setValueCol(''); setNameCol('');
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Latitude</label>
                    <Select value={latCol || 'none'} onValueChange={v => setLatCol(v === 'none' ? '' : v)}>
                      <SelectTrigger className="bg-muted/50 border-border h-8 text-xs">
                        <SelectValue placeholder="e.g. lat" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {dataset.columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Longitude</label>
                    <Select value={lngCol || 'none'} onValueChange={v => setLngCol(v === 'none' ? '' : v)}>
                      <SelectTrigger className="bg-muted/50 border-border h-8 text-xs">
                        <SelectValue placeholder="e.g. lng" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {dataset.columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Value (Size/Metric)</label>
                  <Select value={valueCol || 'none'} onValueChange={v => setValueCol(v === 'none' ? '' : v)}>
                    <SelectTrigger className="bg-muted/50 border-border">
                      <SelectValue placeholder="Numeric metric" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select column</SelectItem>
                      {dataset.columns.filter(c => c.type === 'number').map(c =>
                        <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Point Name / Label (Optional)</label>
                  <Select value={nameCol || 'none'} onValueChange={v => setNameCol(v === 'none' ? '' : v)}>
                    <SelectTrigger className="bg-muted/50 border-border">
                      <SelectValue placeholder="Text label" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Auto-generate</SelectItem>
                      {dataset.columns.filter(c => c.type === 'string').map(c =>
                        <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="pt-2 border-t border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground">Deck.GL Status</p>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Plotted Points</span><span className="font-semibold text-foreground">{geoData.length.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Aggregated Value</span><span className="font-semibold text-foreground">{totalValue.toLocaleString()}</span></div>
                {geoData.length > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Top Coord</span><span className="font-semibold text-primary">{geoData[0]?.position.map(n => n.toFixed(2)).join(', ')}</span></div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Visualization */}
        <motion.div className="lg:col-span-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          {!latCol || !lngCol || !valueCol ? (
            <div className="bg-card rounded-xl p-16 border border-border shadow-card text-center">
              <Globe className="w-20 h-20 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Awaiting Geodata</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">Please select a dataset along with Latitude, Longitude, and a Metric column to render the 3D Map.</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <Tabs value={tab} onValueChange={v => setTab(v as 'map' | 'bar')}>
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{valueCol} distributed by Coords</p>
                  <TabsList className="h-8">
                    <TabsTrigger value="map" className="h-6 text-xs gap-1">
                      <MapIcon className="w-3 h-3" /> 3D WebGL
                    </TabsTrigger>
                    <TabsTrigger value="bar" className="h-6 text-xs gap-1">
                      <BarChart2 className="w-3 h-3" /> Top 30 Chart
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="map" className="p-0 m-0">
                  <DeckGLMap data={geoData} />
                  <div className="p-3 bg-muted/20 border-t border-border flex items-center gap-3">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">
                      Powered by MapLibre & Deck.gl. Interactive panning, zooming, and tilting (Ctrl + drag) are fully supported.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="bar" className="p-4 m-0">
                  <div style={{ height: 420 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} layout="vertical" margin={{ left: 100, right: 24, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={98}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                          formatter={(v: number) => [v.toLocaleString(), valueCol]}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {barChartData.map((d, i) => (
                            <Cell key={i} fill={d.fill} fillOpacity={0.85} />
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
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {geoData.slice(0, 12).map((d, i) => (
                <div key={`${d.name}-${i}`} className="bg-card rounded-lg p-2.5 border border-border/50 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: `rgb(${d.color[0]}, ${d.color[1]}, ${d.color[2]})` }} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-foreground truncate">{d.name}</p>
                    <p className="text-[9px] text-muted-foreground font-mono">{d.value.toLocaleString()}</p>
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
