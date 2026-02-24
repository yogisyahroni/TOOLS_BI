import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutGrid, Plus, Trash2, GripVertical, BarChart3, LineChart, PieChart,
  AreaChart, Save, Eye, Settings2, X
} from 'lucide-react';
import {
  BarChart, Bar, LineChart as ReLineChart, Line,
  PieChart as RePieChart, Pie, Cell,
  AreaChart as ReAreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const COLORS = [
  'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
];

type WidgetType = 'bar' | 'line' | 'pie' | 'area' | 'stat' | 'text';

interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  dataSetId: string;
  xAxis: string;
  yAxis: string;
  width: 'half' | 'full' | 'third';
}

interface DashboardConfig {
  id: string;
  name: string;
  widgets: Widget[];
  createdAt: Date;
}

export default function DashboardBuilder() {
  const { dataSets } = useDataStore();
  const { toast } = useToast();
  const [dashboards, setDashboards] = useState<DashboardConfig[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<DashboardConfig | null>(null);
  const [newDashName, setNewDashName] = useState('');
  const [addingWidget, setAddingWidget] = useState(false);

  // Widget form
  const [wType, setWType] = useState<WidgetType>('bar');
  const [wTitle, setWTitle] = useState('');
  const [wDataSet, setWDataSet] = useState('');
  const [wXAxis, setWXAxis] = useState('');
  const [wYAxis, setWYAxis] = useState('');
  const [wWidth, setWWidth] = useState<'half' | 'full' | 'third'>('half');

  const createDashboard = () => {
    if (!newDashName) return;
    const dash: DashboardConfig = {
      id: Date.now().toString(), name: newDashName, widgets: [], createdAt: new Date()
    };
    setDashboards(prev => [...prev, dash]);
    setActiveDashboard(dash);
    setNewDashName('');
    toast({ title: 'Dashboard created', description: newDashName });
  };

  const addWidget = () => {
    if (!activeDashboard || !wTitle || !wDataSet) return;
    const widget: Widget = {
      id: Date.now().toString(), type: wType, title: wTitle,
      dataSetId: wDataSet, xAxis: wXAxis, yAxis: wYAxis, width: wWidth,
    };
    const updated = { ...activeDashboard, widgets: [...activeDashboard.widgets, widget] };
    setActiveDashboard(updated);
    setDashboards(prev => prev.map(d => d.id === updated.id ? updated : d));
    setAddingWidget(false);
    setWTitle(''); setWDataSet(''); setWXAxis(''); setWYAxis('');
    toast({ title: 'Widget added' });
  };

  const removeWidget = (widgetId: string) => {
    if (!activeDashboard) return;
    const updated = { ...activeDashboard, widgets: activeDashboard.widgets.filter(w => w.id !== widgetId) };
    setActiveDashboard(updated);
    setDashboards(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  const getChartData = (widget: Widget) => {
    const ds = dataSets.find(d => d.id === widget.dataSetId);
    if (!ds || !widget.xAxis || !widget.yAxis) return [];
    const agg = new Map<string, number>();
    ds.data.forEach(row => {
      const key = String(row[widget.xAxis] || 'Unknown');
      agg.set(key, (agg.get(key) || 0) + (Number(row[widget.yAxis]) || 0));
    });
    return Array.from(agg.entries()).map(([name, value]) => ({ name, value })).slice(0, 30);
  };

  const renderWidgetChart = (widget: Widget) => {
    const data = getChartData(widget);
    if (!data.length) return <p className="text-muted-foreground text-sm text-center mt-8">No data</p>;

    const tooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' };

    switch (widget.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ReLineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} /></ReLineChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ReAreaChart data={data}>
              <defs><linearGradient id={`wg-${widget.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill={`url(#wg-${widget.id})`} />
            </ReAreaChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart><Pie data={data} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name }) => name}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></RePieChart>
          </ResponsiveContainer>
        );
      default:
        return <p className="text-muted-foreground text-center mt-8">Chart type not supported in widget</p>;
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
            <h1 className="text-3xl font-bold text-foreground">Dashboard Builder</h1>
            <p className="text-muted-foreground">Create custom dashboards with drag-and-drop widgets</p>
          </div>
        </div>
      </motion.div>

      {/* Dashboard selector / creator */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Select Dashboard</Label>
            <Select value={activeDashboard?.id || ''} onValueChange={id => setActiveDashboard(dashboards.find(d => d.id === id) || null)}>
              <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select or create a dashboard" /></SelectTrigger>
              <SelectContent>
                {dashboards.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.widgets.length} widgets)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">New Dashboard</Label>
              <Input value={newDashName} onChange={e => setNewDashName(e.target.value)} placeholder="Dashboard name" className="bg-muted/50 border-border" />
            </div>
            <Button onClick={createDashboard} className="gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Active Dashboard */}
      {activeDashboard ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">{activeDashboard.name}</h2>
            <Dialog open={addingWidget} onOpenChange={setAddingWidget}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Add Widget</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader><DialogTitle className="text-foreground">Add Widget</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Widget Title</Label>
                    <Input value={wTitle} onChange={e => setWTitle(e.target.value)} className="bg-muted/50 border-border" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Chart Type</Label>
                    <Select value={wType} onValueChange={v => setWType(v as WidgetType)}>
                      <SelectTrigger className="bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bar">Bar Chart</SelectItem>
                        <SelectItem value="line">Line Chart</SelectItem>
                        <SelectItem value="area">Area Chart</SelectItem>
                        <SelectItem value="pie">Pie Chart</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Dataset</Label>
                    <Select value={wDataSet} onValueChange={v => { setWDataSet(v); setWXAxis(''); setWYAxis(''); }}>
                      <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedDs && (
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
                  <Button onClick={addWidget} className="w-full gradient-primary text-primary-foreground">Add Widget</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {activeDashboard.widgets.length === 0 ? (
            <div className="bg-card rounded-xl p-12 border border-border border-dashed text-center">
              <LayoutGrid className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Empty Dashboard</h3>
              <p className="text-muted-foreground mb-4">Click "Add Widget" to start building your dashboard</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeDashboard.widgets.map(widget => (
                <motion.div
                  key={widget.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`bg-card rounded-xl border border-border shadow-card overflow-hidden ${
                    widget.width === 'full' ? 'md:col-span-2 lg:col-span-3' :
                    widget.width === 'half' ? 'lg:col-span-2' : ''
                  }`}
                >
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <span className="font-semibold text-foreground text-sm">{widget.title}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeWidget(widget.id)}>
                      <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                  <div className="h-[250px] p-4">
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
