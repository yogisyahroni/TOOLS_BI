import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  GitBranch, Plus, Play, Trash2, Filter, Shuffle, Layers,
  ArrowRight, CheckCircle, AlertCircle, Clock, Settings2,
  ChevronDown, ChevronUp, Download, Save,
} from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AIChatPanel } from '@/components/AIChatPanel';
import type { ETLPipeline as ETLPipelineType, ETLStep } from '@/types/data';
import { cn } from '@/lib/utils';
import { HelpTooltip } from '@/components/HelpTooltip';

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const stepTypes = [
  { value: 'filter', label: 'Filter', icon: Filter, description: 'Filter rows based on conditions' },
  { value: 'transform', label: 'Transform', icon: Shuffle, description: 'Transform column values' },
  { value: 'aggregate', label: 'Aggregate', icon: Layers, description: 'Group and aggregate data' },
  { value: 'select', label: 'Select Columns', icon: CheckCircle, description: 'Select specific columns' },
  { value: 'sort', label: 'Sort', icon: ArrowRight, description: 'Sort data by column' },
];

// Execute ETL pipeline on data
function executePipeline(data: Record<string, any>[], steps: ETLStep[]): Record<string, any>[] {
  let result = [...data];

  for (const step of steps) {
    const { type, config } = step;

    switch (type) {
      case 'filter': {
        const { column, operator, value } = config;
        if (!column || !operator) break;
        result = result.filter(row => {
          const rowVal = row[column];
          const cmpVal = isNaN(Number(value)) ? value : Number(value);
          const rowNum = Number(rowVal);
          switch (operator) {
            case '=': return String(rowVal) === String(value);
            case '!=': return String(rowVal) !== String(value);
            case '>': return rowNum > Number(cmpVal);
            case '<': return rowNum < Number(cmpVal);
            case '>=': return rowNum >= Number(cmpVal);
            case '<=': return rowNum <= Number(cmpVal);
            case 'contains': return String(rowVal).toLowerCase().includes(String(value).toLowerCase());
            default: return true;
          }
        });
        break;
      }
      case 'transform': {
        const { column, operation, newColumn, operand } = config;
        if (!column || !operation) break;
        const targetCol = newColumn || column;
        result = result.map(row => {
          const val = row[column];
          let newVal = val;
          switch (operation) {
            case 'uppercase': newVal = String(val).toUpperCase(); break;
            case 'lowercase': newVal = String(val).toLowerCase(); break;
            case 'trim': newVal = String(val).trim(); break;
            case 'round': newVal = Math.round(Number(val)); break;
            case 'abs': newVal = Math.abs(Number(val)); break;
            case 'add': newVal = Number(val) + Number(operand || 0); break;
            case 'multiply': newVal = Number(val) * Number(operand || 1); break;
          }
          return { ...row, [targetCol]: newVal };
        });
        break;
      }
      case 'aggregate': {
        const { groupBy, aggregations } = config;
        if (!groupBy || !aggregations?.length) break;
        const groups = new Map<string, Record<string, any>[]>();
        result.forEach(row => {
          const key = String(row[groupBy]);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        });
        result = Array.from(groups.entries()).map(([key, rows]) => {
          const aggRow: Record<string, any> = { [groupBy]: key };
          for (const agg of aggregations) {
            const vals = rows.map(r => Number(r[agg.column])).filter(n => !isNaN(n));
            const alias = agg.alias || `${agg.function}_${agg.column}`;
            switch (agg.function) {
              case 'sum': aggRow[alias] = vals.reduce((a: number, b: number) => a + b, 0); break;
              case 'avg': aggRow[alias] = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0; break;
              case 'count': aggRow[alias] = rows.length; break;
              case 'min': aggRow[alias] = vals.length ? Math.min(...vals) : 0; break;
              case 'max': aggRow[alias] = vals.length ? Math.max(...vals) : 0; break;
            }
          }
          return aggRow;
        });
        break;
      }
      case 'select': {
        const { columns } = config;
        if (!columns?.length) break;
        result = result.map(row => {
          const newRow: Record<string, any> = {};
          columns.forEach((c: string) => { if (c in row) newRow[c] = row[c]; });
          return newRow;
        });
        break;
      }
      case 'sort': {
        const { column, direction } = config;
        if (!column) break;
        result.sort((a, b) => {
          const av = a[column], bv = b[column];
          const cmp = typeof av === 'number' ? av - Number(bv) : String(av).localeCompare(String(bv));
          return direction === 'desc' ? -cmp : cmp;
        });
        break;
      }
    }
  }

  return result;
}

// Step config editor component
function StepConfigEditor({
  step,
  columns,
  onUpdate,
}: {
  step: ETLStep;
  columns: { name: string; type: string }[];
  onUpdate: (config: Record<string, any>) => void;
}) {
  const config = step.config;

  switch (step.type) {
    case 'filter':
      return (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Column</Label>
            <Select value={config.column || ''} onValueChange={v => onUpdate({ ...config, column: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Operator</Label>
            <Select value={config.operator || ''} onValueChange={v => onUpdate({ ...config, operator: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Op" /></SelectTrigger>
              <SelectContent>
                {['=', '!=', '>', '<', '>=', '<=', 'contains'].map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Value</Label>
            <Input value={config.value || ''} onChange={e => onUpdate({ ...config, value: e.target.value })} className="bg-muted/50 border-border h-8 text-xs" />
          </div>
        </div>
      );

    case 'transform':
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Column</Label>
            <Select value={config.column || ''} onValueChange={v => onUpdate({ ...config, column: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Operation</Label>
            <Select value={config.operation || ''} onValueChange={v => onUpdate({ ...config, operation: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Operation" /></SelectTrigger>
              <SelectContent>
                {['uppercase', 'lowercase', 'trim', 'round', 'abs', 'add', 'multiply'].map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New Column</Label>
            <Input value={config.newColumn || ''} onChange={e => onUpdate({ ...config, newColumn: e.target.value })} placeholder="Optional" className="bg-muted/50 border-border h-8 text-xs" />
          </div>
          {['add', 'multiply'].includes(config.operation) && (
            <div>
              <Label className="text-xs text-muted-foreground">Operand</Label>
              <Input type="number" value={config.operand || ''} onChange={e => onUpdate({ ...config, operand: Number(e.target.value) })} className="bg-muted/50 border-border h-8 text-xs" />
            </div>
          )}
        </div>
      );

    case 'aggregate':
      return (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Group By</Label>
            <Select value={config.groupBy || ''} onValueChange={v => onUpdate({ ...config, groupBy: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Group by column" /></SelectTrigger>
              <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Agg Column</Label>
              <Select value={config._aggCol || ''} onValueChange={v => onUpdate({ ...config, _aggCol: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
                <SelectContent>{columns.filter(c => c.type === 'number').map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Function</Label>
              <Select value={config._aggFunc || ''} onValueChange={v => onUpdate({ ...config, _aggFunc: v })}>
                <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Function" /></SelectTrigger>
                <SelectContent>
                  {['sum', 'avg', 'count', 'min', 'max'].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                if (!config._aggCol || !config._aggFunc) return;
                const aggs = config.aggregations || [];
                onUpdate({
                  ...config,
                  aggregations: [...aggs, { column: config._aggCol, function: config._aggFunc, alias: `${config._aggFunc}_${config._aggCol}` }],
                  _aggCol: '', _aggFunc: '',
                });
              }}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          </div>
          {config.aggregations?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {config.aggregations.map((a: any, i: number) => (
                <span key={i} className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
                  {a.function}({a.column})
                  <button onClick={() => onUpdate({ ...config, aggregations: config.aggregations.filter((_: any, j: number) => j !== i) })}>
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      );

    case 'select':
      return (
        <div>
          <Label className="text-xs text-muted-foreground">Select Columns</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {columns.map(c => {
              const selected = (config.columns || []).includes(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => {
                    const cols = config.columns || [];
                    onUpdate({ ...config, columns: selected ? cols.filter((x: string) => x !== c.name) : [...cols, c.name] });
                  }}
                  className={cn(
                    'text-[10px] px-2 py-1 rounded-full border transition-colors',
                    selected ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground'
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      );

    case 'sort':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Column</Label>
            <Select value={config.column || ''} onValueChange={v => onUpdate({ ...config, column: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Direction</Label>
            <Select value={config.direction || 'asc'} onValueChange={v => onUpdate({ ...config, direction: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default function ETLPipelinePage() {
  const { dataSets, pipelines, addPipeline, updatePipeline, removePipeline, addDataSet } = useDataStore();
  const { toast } = useToast();
  const [newPipelineName, setNewPipelineName] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<Record<string, Record<string, any>[]>>({});

  const createPipeline = () => {
    if (!newPipelineName.trim() || !selectedSource) {
      toast({ title: 'Missing information', description: 'Please provide a pipeline name and select a source dataset.', variant: 'destructive' });
      return;
    }
    const pipeline: ETLPipelineType = {
      id: generateId(), name: newPipelineName, steps: [], sourceDataSetId: selectedSource, status: 'idle',
    };
    addPipeline(pipeline);
    setNewPipelineName('');
    setSelectedSource('');
    toast({ title: 'Pipeline created', description: `${pipeline.name} has been created.` });
  };

  const addStep = (pipelineId: string, type: ETLStep['type']) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const newStep: ETLStep = { id: generateId(), type, config: {}, order: pipeline.steps.length };
    updatePipeline(pipelineId, { steps: [...pipeline.steps, newStep] });
    setExpandedSteps(prev => new Set(prev).add(newStep.id));
  };

  const updateStepConfig = (pipelineId: string, stepId: string, config: Record<string, any>) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    updatePipeline(pipelineId, {
      steps: pipeline.steps.map(s => s.id === stepId ? { ...s, config } : s),
    });
  };

  const removeStep = (pipelineId: string, stepId: string) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    updatePipeline(pipelineId, { steps: pipeline.steps.filter(s => s.id !== stepId) });
  };

  const runPipeline = (pipelineId: string) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const sourceDs = dataSets.find(ds => ds.id === pipeline.sourceDataSetId);
    if (!sourceDs) {
      toast({ title: 'Error', description: 'Source dataset not found', variant: 'destructive' });
      return;
    }

    updatePipeline(pipelineId, { status: 'running' });

    try {
      const result = executePipeline(sourceDs.data, pipeline.steps);
      setPreviewData(prev => ({ ...prev, [pipelineId]: result }));
      updatePipeline(pipelineId, { status: 'completed', lastRun: new Date() });
      toast({ title: 'Pipeline completed', description: `${result.length} rows output.` });
    } catch (err: any) {
      updatePipeline(pipelineId, { status: 'error' });
      toast({ title: 'Pipeline error', description: err.message, variant: 'destructive' });
    }
  };

  const saveOutput = (pipelineId: string) => {
    const data = previewData[pipelineId];
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!data || !pipeline) return;

    const cols = data.length > 0 ? Object.keys(data[0]) : [];
    addDataSet({
      id: generateId(),
      name: `${pipeline.name}_output`,
      fileName: `${pipeline.name}_output.csv`,
      columns: cols.map(c => ({
        name: c,
        type: typeof data[0]?.[c] === 'number' ? 'number' as const : 'string' as const,
        nullable: false,
      })),
      data,
      uploadedAt: new Date(),
      rowCount: data.length,
      size: JSON.stringify(data).length,
    });
    toast({ title: 'Output saved', description: `Saved as "${pipeline.name}_output" dataset.` });
  };

  const handleAIResponse = (response: string) => {
    try {
      // Try to parse JSON array of steps from AI
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;
      const steps: any[] = JSON.parse(jsonMatch[0]);
      
      // Find the last pipeline or create message
      if (pipelines.length === 0) {
        toast({ title: 'Create a pipeline first', description: 'Please create a pipeline then AI will add steps.', variant: 'destructive' });
        return;
      }

      const lastPipeline = pipelines[pipelines.length - 1];
      const newSteps: ETLStep[] = steps.map((s, i) => ({
        id: generateId(),
        type: s.type,
        config: s.config || {},
        order: lastPipeline.steps.length + i,
      }));

      updatePipeline(lastPipeline.id, { steps: [...lastPipeline.steps, ...newSteps] });
      toast({ title: 'AI Steps Added', description: `${newSteps.length} steps added to ${lastPipeline.name}` });
    } catch {
      // AI responded with text, not steps - that's OK
    }
  };

  const getStatusIcon = (status: ETLPipelineType['status']) => {
    switch (status) {
      case 'running': return <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-success" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Build system prompt for AI
  const getAIPrompt = () => {
    const dsInfo = dataSets.map(ds => `"${ds.name}" (${ds.columns.map(c => `${c.name}:${c.type}`).join(', ')})`).join('; ');
    return `You are an ETL pipeline assistant for DataLens. Available datasets: ${dsInfo || 'none'}.

Generate ETL pipeline steps as a JSON array. Each step has: type (filter|transform|aggregate|select|sort), and config object.

Step configs:
- filter: { "column": "col", "operator": "=|!=|>|<|>=|<=|contains", "value": "val" }
- transform: { "column": "col", "operation": "uppercase|lowercase|trim|round|abs|add|multiply", "newColumn": "new_col", "operand": number }
- aggregate: { "groupBy": "col", "aggregations": [{ "column": "col", "function": "sum|avg|count|min|max", "alias": "name" }] }
- select: { "columns": ["col1", "col2"] }
- sort: { "column": "col", "direction": "asc|desc" }

When the user asks in natural language, generate the appropriate steps. Return JSON array wrapped in your explanation.`;
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <GitBranch className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">ETL Pipeline <HelpTooltip text="Buat pipeline data: tambah step Filter, Transform, Aggregate, Select, atau Sort. Run untuk proses data, lalu simpan output sebagai dataset baru." /></h1>
            <p className="text-muted-foreground">Extract, Transform, and Load your data</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Create Pipeline */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-6 border border-border shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Create New Pipeline</h3>
            <div className="flex flex-col md:flex-row gap-4">
              <Input placeholder="Pipeline name" value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)} className="flex-1 bg-muted/50 border-border" />
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-full md:w-[200px] bg-muted/50 border-border"><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={createPipeline} className="gradient-primary text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" /> Create
              </Button>
            </div>
          </motion.div>

          {/* Pipelines List */}
          {pipelines.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-12 border border-border shadow-card text-center">
              <GitBranch className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No pipelines yet</h3>
              <p className="text-muted-foreground">Create your first ETL pipeline or ask AI to build one for you</p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {pipelines.map((pipeline, index) => {
                const sourceDs = dataSets.find(ds => ds.id === pipeline.sourceDataSetId);
                const sourceColumns = sourceDs?.columns.map(c => ({ name: c.name, type: c.type })) || [];
                const preview = previewData[pipeline.id];

                return (
                  <motion.div key={pipeline.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                    {/* Pipeline Header */}
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg gradient-secondary flex items-center justify-center">
                          <GitBranch className="w-4 h-4 text-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{pipeline.name}</h3>
                          <p className="text-xs text-muted-foreground">Source: {sourceDs?.name || 'Unknown'} • {pipeline.steps.length} steps</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(pipeline.status)}
                        <Button size="sm" onClick={() => runPipeline(pipeline.id)} disabled={pipeline.status === 'running' || pipeline.steps.length === 0} className="gradient-primary text-primary-foreground">
                          <Play className="w-4 h-4 mr-1" /> Run
                        </Button>
                        {preview && (
                          <Button size="sm" variant="outline" onClick={() => saveOutput(pipeline.id)}>
                            <Save className="w-4 h-4 mr-1" /> Save Output
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => removePipeline(pipeline.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Add Steps Buttons */}
                    <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                      {stepTypes.map(st => (
                        <Button key={st.value} variant="outline" size="sm" className="text-xs h-7" onClick={() => addStep(pipeline.id, st.value as ETLStep['type'])}>
                          <st.icon className="w-3 h-3 mr-1" /> {st.label}
                        </Button>
                      ))}
                    </div>

                    {/* Steps */}
                    {pipeline.steps.length > 0 && (
                      <div className="border-t border-border">
                        {pipeline.steps.map((step, si) => {
                          const StepIcon = stepTypes.find(t => t.value === step.type)?.icon || Filter;
                          const isExpanded = expandedSteps.has(step.id);
                          return (
                            <div key={step.id} className="border-b border-border last:border-b-0">
                              <div
                                className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/20"
                                onClick={() => {
                                  const next = new Set(expandedSteps);
                                  isExpanded ? next.delete(step.id) : next.add(step.id);
                                  setExpandedSteps(next);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground w-5">{si + 1}.</span>
                                  <StepIcon className="w-4 h-4 text-primary" />
                                  <span className="text-sm font-medium text-foreground capitalize">{step.type}</span>
                                  {Object.keys(step.config).filter(k => !k.startsWith('_')).length > 0 && (
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">configured</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button onClick={e => { e.stopPropagation(); removeStep(pipeline.id, step.id); }} className="text-muted-foreground hover:text-destructive p-1">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="px-4 pb-3 pl-11">
                                  <StepConfigEditor
                                    step={step}
                                    columns={sourceColumns}
                                    onUpdate={config => updateStepConfig(pipeline.id, step.id, config)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Preview */}
                    {preview && (
                      <div className="border-t border-border p-4">
                        <h4 className="text-sm font-semibold text-foreground mb-2">Output Preview ({preview.length} rows)</h4>
                        <div className="overflow-auto max-h-[200px] rounded-lg border border-border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/30">
                                {preview.length > 0 && Object.keys(preview[0]).map(col => (
                                  <th key={col} className="px-2 py-1.5 text-left text-muted-foreground font-mono">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.slice(0, 20).map((row, i) => (
                                <tr key={i} className="border-t border-border hover:bg-muted/10">
                                  {Object.values(row).map((val, j) => (
                                    <td key={j} className="px-2 py-1 font-mono text-foreground">{String(val)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* AI Chat Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <AIChatPanel
              systemPrompt={getAIPrompt()}
              title="AI ETL Assistant"
              placeholder="e.g., Filter rows where sales > 1000 then sort by date descending..."
              onAIResponse={handleAIResponse}
              className="h-fit"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
