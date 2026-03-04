import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutGrid, Plus, Trash2, GripVertical, BarChart3, X, Move, Maximize2, Minimize2
} from 'lucide-react';
import {
  BarChart, Bar, LineChart as ReLineChart, Line,
  PieChart as RePieChart, Pie, Cell,
  AreaChart as ReAreaChart, Area,
  ScatterChart, Scatter,
  RadarChart, Radar as ReRadar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { WidgetType, Widget, DashboardConfig } from '@/types/data';
import { HelpTooltip } from '@/components/HelpTooltip';

const COLORS = [
  'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
];

const WIDGET_TYPES: { id: WidgetType; label: string; desc: string }[] = [
  { id: 'bar', label: 'Bar Chart', desc: 'Compare values across categories' },
  { id: 'line', label: 'Line Chart', desc: 'Show trends over time' },
  { id: 'area', label: 'Area Chart', desc: 'Filled line chart' },
  { id: 'pie', label: 'Pie Chart', desc: 'Show proportions' },
  { id: 'stat', label: 'Stat Card', desc: 'Single metric display' },
  { id: 'text', label: 'Text Note', desc: 'Rich text annotation' },
];

export default function DashboardBuilder() {
  const { dataSets, dashboards, addDashboard, updateDashboard, removeDashboard } = useDataStore();
  const { toast } = useToast();
  const [activeDashboardId, setActiveDashboardId] = useState('');
  const [newDashName, setNewDashName] = useState('');
  const [addingWidget, setAddingWidget] = useState(false);
  const [activeFilter, setActiveFilter] = useState<{ column: string; value: string } | null>(null);

  // Widget form
  const [wType, setWType] = useState<WidgetType>('bar');
  const [wTitle, setWTitle] = useState('');
  const [wDataSet, setWDataSet] = useState('');
  const [wXAxis, setWXAxis] = useState('');
  const [wYAxis, setWYAxis] = useState('');
  const [wWidth, setWWidth] = useState<'half' | 'full' | 'third'>('half');

  const activeDashboard = dashboards.find(d => d.id === activeDashboardId) || null;

  const createDashboard = () => {
    if (!newDashName) return;
    const dash: DashboardConfig = {
      id: Date.now().toString(), name: newDashName, widgets: [], createdAt: new Date()
    };
    addDashboard(dash);
    setActiveDashboardId(dash.id);
    setNewDashName('');
    toast({ title: 'Dashboard created', description: newDashName });
  };

  const handleAddWidget = () => {
    if (!activeDashboard || !wTitle) return;
    const widget: Widget = {
      id: Date.now().toString(), type: wType, title: wTitle,
      dataSetId: wDataSet, xAxis: wXAxis, yAxis: wYAxis, width: wWidth,
    };
    updateDashboard(activeDashboard.id, { widgets: [...activeDashboard.widgets, widget] });
    setAddingWidget(false);
    setWTitle(''); setWDataSet(''); setWXAxis(''); setWYAxis('');
    toast({ title: 'Widget added' });
  };

  const removeWidget = (widgetId: string) => {
    if (!activeDashboard) return;
    updateDashboard(activeDashboard.id, { widgets: activeDashboard.widgets.filter(w => w.id !== widgetId) });
  };

  const toggleWidgetWidth = (widgetId: string) => {
    if (!activeDashboard) return;
    const widths: ('third' | 'half' | 'full')[] = ['third', 'half', 'full'];
    updateDashboard(activeDashboard.id, {
      widgets: activeDashboard.widgets.map(w => {
        if (w.id !== widgetId) return w;
        const idx = widths.indexOf(w.width);
        return { ...w, width: widths[(idx + 1) % widths.length] };
      })
    });
  };

  const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
    if (!activeDashboard) return;
    const widgets = [...activeDashboard.widgets];
    const idx = widgets.findIndex(w => w.id === widgetId);
    if (direction === 'up' && idx > 0) [widgets[idx - 1], widgets[idx]] = [widgets[idx], widgets[idx - 1]];
    if (direction === 'down' && idx < widgets.length - 1) [widgets[idx], widgets[idx + 1]] = [widgets[idx + 1], widgets[idx]];
    updateDashboard(activeDashboard.id, { widgets });
  };

  const handleDeleteDashboard = (id: string) => {
    removeDashboard(id);
    if (activeDashboardId === id) setActiveDashboardId('');
    toast({ title: 'Dashboard deleted' });
  };

  const getChartData = (widget: Widget) => {
    const ds = dataSets.find(d => d.id === widget.dataSetId);
    if (!ds || !widget.xAxis || !widget.yAxis) return [];
    let filteredData = ds.data;
    // Apply cross-filter
    if (activeFilter) {
      filteredData = filteredData.filter(row => String(row[activeFilter.column]) === activeFilter.value);
    }
    const agg = new Map<string, number>();
    filteredData.forEach(row => {
      const key = String(row[widget.xAxis] || 'Unknown');
      agg.set(key, (agg.get(key) || 0) + (Number(row[widget.yAxis]) || 0));
    });
    return Array.from(agg.entries()).map(([name, value]) => ({ name, value })).slice(0, 30);
  };

  const getStatValue = (widget: Widget) => {
    const ds = dataSets.find(d => d.id === widget.dataSetId);
    if (!ds || !widget.yAxis) return { value: 0, count: 0 };
    const nums = ds.data.map(r => Number(r[widget.yAxis])).filter(n => !isNaN(n));
    const sum = nums.reduce((a, b) => a + b, 0);
    return { value: sum, count: nums.length, avg: nums.length ? sum / nums.length : 0 };
  };

  // Click-to-filter handler
  const handleChartClick = (widget: Widget, data: any) => {
    if (data?.activePayload?.[0]?.payload?.name) {
      const clickedValue = data.activePayload[0].payload.name;
      if (activeFilter?.column === widget.xAxis && activeFilter?.value === clickedValue) {
        setActiveFilter(null); // Toggle off
      } else {
        setActiveFilter({ column: widget.xAxis, value: clickedValue });
        toast({ title: 'Filter applied', description: `Filtering by ${widget.xAxis} = "${clickedValue}". Click again to clear.` });
      }
    }
  };

  const renderWidgetChart = (widget: Widget) => {
    if (widget.type === 'stat') {
      const stat = getStatValue(widget);
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-4xl font-bold text-primary">{stat.value.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">Sum of {widget.yAxis}</p>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span>Count: {stat.count}</span>
            <span>Avg: {stat.avg?.toFixed(1)}</span>
          </div>
        </div>
      );
    }

    if (widget.type === 'text') {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <p className="text-muted-foreground text-center text-sm">{widget.title}</p>
        </div>
      );
    }

    const data = getChartData(widget);
    if (!data.length) return <p className="text-muted-foreground text-sm text-center mt-8">No data</p>;
    const tooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' };

    switch (widget.type) {
      case 'bar':
        return (<ResponsiveContainer width="100%" height="100%"><BarChart data={data} onClick={(d) => handleChartClick(widget, d)}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} cursor="pointer">{data.map((d, i) => <Cell key={i} fill={activeFilter?.value === d.name ? COLORS[3] : 'hsl(var(--primary))'} />)}</Bar></BarChart></ResponsiveContainer>);
      case 'line':
        return (<ResponsiveContainer width="100%" height="100%"><ReLineChart data={data} onClick={(d) => handleChartClick(widget, d)}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} cursor="pointer" /></ReLineChart></ResponsiveContainer>);
      case 'area':
        return (<ResponsiveContainer width="100%" height="100%"><ReAreaChart data={data} onClick={(d) => handleChartClick(widget, d)}><defs><linearGradient id={`wg-${widget.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill={`url(#wg-${widget.id})`} cursor="pointer" /></ReAreaChart></ResponsiveContainer>);
      case 'pie':
        return (<ResponsiveContainer width="100%" height="100%"><RePieChart><Pie data={data} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name }) => name} cursor="pointer">{data.map((d, i) => <Cell key={i} fill={activeFilter?.value === d.name ? COLORS[3] : COLORS[i % COLORS.length]} stroke={activeFilter?.value === d.name ? 'hsl(var(--foreground))' : 'none'} strokeWidth={activeFilter?.value === d.name ? 2 : 0} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></RePieChart></ResponsiveContainer>);
      default:
        return <p className="text-muted-foreground text-center mt-8">Chart type not supported</p>;
    }
  };

  const selectedDs = dataSets.find(d => d.id === wDataSet);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <LayoutGrid className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">Dashboard Builder <HelpTooltip text="Buat dashboard kustom. Klik chart untuk cross-filter antar widget. Resize widget dengan tombol expand/collapse. Reorder dengan tombol move." /></h1>
            <p className="text-muted-foreground">Interactive dashboards with click-to-filter</p>
          </div>
        </div>
      </motion.div>

      {/* Dashboard selector / creator */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Select Dashboard</Label>
            <Select value={activeDashboardId || "none"} onValueChange={id => setActiveDashboardId(id === "none" ? "" : id)}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select or create a dashboard" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Select --</SelectItem>
                {dashboards.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.widgets.length} widgets)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">New Dashboard</Label>
              <Input value={newDashName} onChange={e => setNewDashName(e.target.value)} placeholder="Dashboard name" className="bg-muted/50 border-border" onKeyDown={e => e.key === 'Enter' && createDashboard()} />
            </div>
            <Button onClick={createDashboard} className="gradient-primary text-primary-foreground" disabled={!newDashName.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Active filter indicator */}
      {activeFilter && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-primary font-medium">
            🔍 Cross-filter active: <strong>{activeFilter.column}</strong> = "{activeFilter.value}"
          </span>
          <Button variant="ghost" size="sm" onClick={() => setActiveFilter(null)} className="text-primary hover:text-primary">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        </motion.div>
      )}

      {/* Active Dashboard */}
      {activeDashboard ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">{activeDashboard.name}</h2>
            <div className="flex gap-2">
              <Dialog open={addingWidget} onOpenChange={setAddingWidget}>
                <DialogTrigger asChild>
                  <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Add Widget</Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader><DialogTitle className="text-foreground">Add Widget</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Widget Title</Label>
                      <Input value={wTitle} onChange={e => setWTitle(e.target.value)} className="bg-muted/50 border-border" placeholder="e.g., Sales Overview" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Widget Type</Label>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        {WIDGET_TYPES.map(wt => (
                          <button key={wt.id} onClick={() => setWType(wt.id)}
                            className={`p-2 rounded-lg border text-left transition-all ${wType === wt.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/50 hover:bg-muted'}`}>
                            <p className="text-xs font-medium text-foreground">{wt.label}</p>
                            <p className="text-[10px] text-muted-foreground">{wt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    {wType !== 'text' && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Dataset</Label>
                        <Select value={wDataSet} onValueChange={v => { setWDataSet(v); setWXAxis(''); setWYAxis(''); }}>
                          <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>{dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {selectedDs && wType !== 'stat' && wType !== 'text' && (
                      <>
                        <div>
                          <Label className="text-xs text-muted-foreground">X-Axis</Label>
                          <Select value={wXAxis} onValueChange={setWXAxis}>
                            <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{selectedDs.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Y-Axis</Label>
                          <Select value={wYAxis} onValueChange={setWYAxis}>
                            <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>{selectedDs.columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {selectedDs && wType === 'stat' && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Metric Column</Label>
                        <Select value={wYAxis} onValueChange={setWYAxis}>
                          <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>{selectedDs.columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">Width</Label>
                      <Select value={wWidth} onValueChange={v => setWWidth(v as any)}>
                        <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="third">1/3</SelectItem>
                          <SelectItem value="half">1/2</SelectItem>
                          <SelectItem value="full">Full</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleAddWidget} className="w-full gradient-primary text-primary-foreground" disabled={!wTitle}>Add Widget</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="destructive" size="sm" onClick={() => handleDeleteDashboard(activeDashboard.id)}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </div>
          </div>

          {activeDashboard.widgets.length === 0 ? (
            <div className="bg-card rounded-xl p-12 border border-border border-dashed text-center">
              <LayoutGrid className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Empty Dashboard</h3>
              <p className="text-muted-foreground mb-4">Click "Add Widget" to add charts, stats, or text notes</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeDashboard.widgets.map((widget, idx) => (
                <motion.div key={widget.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className={`bg-card rounded-xl border border-border shadow-card overflow-hidden group ${widget.width === 'full' ? 'md:col-span-2 lg:col-span-3' : widget.width === 'half' ? 'lg:col-span-2' : ''}`}>
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground text-sm">{widget.title}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground capitalize">{widget.type}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveWidget(widget.id, 'up')} disabled={idx === 0}>
                        <Move className="w-3 h-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleWidgetWidth(widget.id)}>
                        {widget.width === 'full' ? <Minimize2 className="w-3 h-3 text-muted-foreground" /> : <Maximize2 className="w-3 h-3 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeWidget(widget.id)}>
                        <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className={`p-4 ${widget.type === 'stat' ? 'h-[180px]' : widget.type === 'text' ? 'h-[100px]' : 'h-[250px]'}`}>
                    {renderWidgetChart(widget)}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
          <LayoutGrid className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Dashboard Selected</h3>
          <p className="text-muted-foreground">Create a new dashboard or select an existing one</p>
        </motion.div>
      )}
    </div>
  );
}
