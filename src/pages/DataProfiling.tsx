import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, CheckCircle, BarChart3, Hash, Type, Calendar, ToggleLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDataStore } from '@/stores/dataStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { HelpTooltip } from '@/components/HelpTooltip';
import { Progress } from '@/components/ui/progress';

interface ColumnProfile {
  name: string;
  type: string;
  totalCount: number;
  nullCount: number;
  uniqueCount: number;
  nullPct: number;
  uniquePct: number;
  // numeric
  min?: number; max?: number; mean?: number; median?: number; stddev?: number;
  q1?: number; q3?: number;
  // distribution
  distribution?: { name: string; value: number }[];
  // outliers
  outliers?: number[];
  topValues?: { value: string; count: number }[];
}

function computeProfile(data: Record<string, any>[], colName: string, colType: string): ColumnProfile {
  const values = data.map(r => r[colName]);
  const total = values.length;
  const nulls = values.filter(v => v === null || v === undefined || v === '').length;
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  const uniqueSet = new Set(nonNull.map(String));

  const profile: ColumnProfile = {
    name: colName, type: colType, totalCount: total, nullCount: nulls,
    uniqueCount: uniqueSet.size, nullPct: total ? (nulls / total) * 100 : 0,
    uniquePct: total ? (uniqueSet.size / total) * 100 : 0,
  };

  if (colType === 'number') {
    const nums = nonNull.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (nums.length) {
      profile.min = nums[0];
      profile.max = nums[nums.length - 1];
      profile.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      profile.median = nums[Math.floor(nums.length / 2)];
      profile.q1 = nums[Math.floor(nums.length * 0.25)];
      profile.q3 = nums[Math.floor(nums.length * 0.75)];
      const variance = nums.reduce((acc, v) => acc + (v - profile.mean!) ** 2, 0) / nums.length;
      profile.stddev = Math.sqrt(variance);

      // Outliers (IQR method)
      const iqr = profile.q3! - profile.q1!;
      const lower = profile.q1! - 1.5 * iqr;
      const upper = profile.q3! + 1.5 * iqr;
      profile.outliers = nums.filter(n => n < lower || n > upper).slice(0, 20);

      // Distribution (histogram)
      const buckets = 10;
      const range = profile.max - profile.min || 1;
      const step = range / buckets;
      const hist = Array.from({ length: buckets }, (_, i) => ({
        name: `${(profile.min! + i * step).toFixed(1)}`,
        value: 0,
      }));
      nums.forEach(n => {
        const idx = Math.min(Math.floor((n - profile.min!) / step), buckets - 1);
        hist[idx].value++;
      });
      profile.distribution = hist;
    }
  } else {
    // Top values for categorical
    const counts = new Map<string, number>();
    nonNull.forEach(v => { const s = String(v); counts.set(s, (counts.get(s) || 0) + 1); });
    profile.topValues = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));
    profile.distribution = profile.topValues.map(tv => ({ name: tv.value.slice(0, 15), value: tv.count }));
  }

  return profile;
}

function qualityScore(profiles: ColumnProfile[]): number {
  if (!profiles.length) return 0;
  const scores = profiles.map(p => {
    let s = 100;
    s -= p.nullPct * 0.5; // penalize nulls
    if (p.uniquePct < 1 && p.type !== 'boolean') s -= 10; // low cardinality warning
    if (p.outliers && p.outliers.length > 0) s -= Math.min(p.outliers.length * 2, 15);
    return Math.max(0, Math.min(100, s));
  });
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

const typeIcons: Record<string, any> = { number: Hash, string: Type, date: Calendar, boolean: ToggleLeft };

export default function DataProfiling() {
  const { dataSets } = useDataStore();
  const [selectedId, setSelectedId] = useState('');

  const dataset = dataSets.find(d => d.id === selectedId);

  const profiles = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.map(col => computeProfile(dataset.data, col.name, col.type));
  }, [dataset]);

  const qScore = useMemo(() => qualityScore(profiles), [profiles]);

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--popover-foreground))',
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                Data Profiling
                <HelpTooltip text="Analisis otomatis kualitas data: distribusi, outlier, missing values, statistik per kolom, dan skor kualitas keseluruhan." />
              </h1>
              <p className="text-muted-foreground">Auto-detect distribution, outliers, and data quality</p>
            </div>
          </div>
          <div className="w-64">
            <Label className="text-xs text-muted-foreground">Dataset</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name} ({ds.rowCount} rows)</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {!dataset ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-16 border border-border shadow-card text-center">
          <Activity className="w-20 h-20 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Select a dataset to profile</h3>
          <p className="text-muted-foreground">Auto-detect stats, distributions, outliers, and quality score</p>
        </motion.div>
      ) : (
        <>
          {/* Quality Score */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl p-6 border border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground text-lg">Data Quality Score</h3>
                <p className="text-sm text-muted-foreground">{dataset.name} • {dataset.rowCount} rows • {dataset.columns.length} columns</p>
              </div>
              <div className={`text-4xl font-bold ${qScore >= 80 ? 'text-green-500' : qScore >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                {qScore}%
              </div>
            </div>
            <Progress value={qScore} className="h-3" />
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{profiles.filter(p => p.nullPct === 0).length}</p>
                <p className="text-xs text-muted-foreground">Complete Columns</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{profiles.filter(p => p.nullPct > 0).length}</p>
                <p className="text-xs text-muted-foreground">Has Missing</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{profiles.filter(p => (p.outliers?.length || 0) > 0).length}</p>
                <p className="text-xs text-muted-foreground">Has Outliers</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{profiles.filter(p => p.uniquePct === 100).length}</p>
                <p className="text-xs text-muted-foreground">All Unique</p>
              </div>
            </div>
          </motion.div>

          {/* Column Profiles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {profiles.map((prof, i) => {
              const TypeIcon = typeIcons[prof.type] || Type;
              return (
                <motion.div key={prof.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                  {/* Column header */}
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TypeIcon className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-foreground">{prof.name}</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{prof.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {prof.nullPct > 0 && (
                        <span className="text-xs flex items-center gap-1 text-yellow-500">
                          <AlertTriangle className="w-3 h-3" /> {prof.nullPct.toFixed(1)}% null
                        </span>
                      )}
                      {prof.nullPct === 0 && (
                        <span className="text-xs flex items-center gap-1 text-green-500">
                          <CheckCircle className="w-3 h-3" /> Complete
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-muted/50 rounded p-2">
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-semibold text-foreground">{prof.totalCount}</p>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <p className="text-muted-foreground">Unique</p>
                        <p className="font-semibold text-foreground">{prof.uniqueCount} ({prof.uniquePct.toFixed(0)}%)</p>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <p className="text-muted-foreground">Missing</p>
                        <p className="font-semibold text-foreground">{prof.nullCount}</p>
                      </div>
                    </div>

                    {/* Numeric stats */}
                    {prof.type === 'number' && prof.mean !== undefined && (
                      <div className="grid grid-cols-5 gap-1 text-xs">
                        {[
                          ['Min', prof.min], ['Q1', prof.q1], ['Median', prof.median],
                          ['Q3', prof.q3], ['Max', prof.max],
                        ].map(([label, val]) => (
                          <div key={String(label)} className="bg-primary/5 rounded p-1.5 text-center">
                            <p className="text-muted-foreground text-[10px]">{label}</p>
                            <p className="font-semibold text-foreground">{Number(val).toFixed(1)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {prof.type === 'number' && prof.mean !== undefined && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-muted-foreground">Mean</p>
                          <p className="font-semibold text-foreground">{prof.mean.toFixed(2)}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-muted-foreground">Std Dev</p>
                          <p className="font-semibold text-foreground">{prof.stddev?.toFixed(2)}</p>
                        </div>
                      </div>
                    )}

                    {/* Outliers */}
                    {prof.outliers && prof.outliers.length > 0 && (
                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                        <p className="text-xs font-medium text-yellow-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {prof.outliers.length} outliers detected
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {prof.outliers.slice(0, 5).map(o => o.toFixed(1)).join(', ')}
                          {prof.outliers.length > 5 ? '...' : ''}
                        </p>
                      </div>
                    )}

                    {/* Distribution chart */}
                    {prof.distribution && prof.distribution.length > 0 && (
                      <div className="h-[100px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={prof.distribution} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <XAxis dataKey="name" tick={false} axisLine={false} />
                            <YAxis hide />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} fillOpacity={0.7} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Top values for categorical */}
                    {prof.topValues && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">Top values</p>
                        {prof.topValues.slice(0, 5).map(tv => (
                          <div key={tv.value} className="flex items-center gap-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-foreground truncate">{tv.value}</span>
                                <span className="text-muted-foreground ml-2">{tv.count}</span>
                              </div>
                              <Progress value={(tv.count / prof.totalCount) * 100} className="h-1 mt-0.5" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
