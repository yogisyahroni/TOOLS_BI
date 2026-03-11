import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  GitBranch, Plus, Play, Trash2, Filter, Shuffle, Layers,
  ArrowRight, CheckCircle, AlertCircle, Clock, Settings2,
  ChevronDown, ChevronUp, Download, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AIChatPanel } from '@/components/AIChatPanel';
import type { ETLPipeline as ETLPipelineType, ETLStep } from '@/types/data';
import { cn } from '@/lib/utils';
import { HelpTooltip } from '@/components/HelpTooltip';
import Papa from 'papaparse';
import { useDataWorker } from '@/hooks/useDataWorker';
import {
  useDatasets,
  usePipelines,
  useCreatePipeline,
  useUpdatePipeline,
  useDeletePipeline,
  useRunPipeline,
  useUploadDataset
} from '@/hooks/useApi';
import { datasetApi } from '@/lib/api';

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const stepTypes = [
  { value: 'filter', label: 'Filter', icon: Filter, description: 'Filter rows based on conditions' },
  { value: 'transform', label: 'Transform', icon: Shuffle, description: 'Transform column values' },
  { value: 'aggregate', label: 'Aggregate', icon: Layers, description: 'Group and aggregate data' },
  { value: 'select', label: 'Select Columns', icon: CheckCircle, description: 'Select specific columns' },
  { value: 'sort', label: 'Sort', icon: ArrowRight, description: 'Sort data by column' },
  { value: 'deduplicate', label: 'Remove Duplicates', icon: Layers, description: 'Remove duplicate rows' },
  { value: 'parse_date', label: 'Parse Date', icon: Clock, description: 'Format and extract dates' },
  { value: 'json_extract', label: 'JSON Extractor', icon: Layers, description: 'Extract value from JSON string' },
  { value: 'cast_type', label: 'Type Casting', icon: Shuffle, description: 'Convert data types (e.g. String to Number)' },
  { value: 'data_cleansing', label: 'Data Cleansing', icon: AlertCircle, description: 'Handle missing or null values' },
];

// Execute ETL pipeline on data moved to Web Worker

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
                <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
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

    case 'deduplicate':
      return (
        <div>
          <Label className="text-xs text-muted-foreground">Columns to Check (Leave empty to check entire row)</Label>
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

    case 'parse_date':
      return (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Date Column</Label>
            <Select value={config.column || ''} onValueChange={v => onUpdate({ ...config, column: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Extract</Label>
            <Select value={config.extract || 'iso'} onValueChange={v => onUpdate({ ...config, extract: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="iso">Full ISO Date</SelectItem>
                <SelectItem value="year">Year Only</SelectItem>
                <SelectItem value="month">Month Only</SelectItem>
                <SelectItem value="day">Day Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New Column</Label>
            <Input value={config.newColumn || ''} onChange={e => onUpdate({ ...config, newColumn: e.target.value })} placeholder="Replace Original" className="bg-muted/50 border-border h-8 text-xs" />
          </div>
        </div>
      );

    case 'json_extract':
      return (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">JSON Column</Label>
            <Select value={config.column || ''} onValueChange={v => onUpdate({ ...config, column: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>{columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">JSON Key / Path</Label>
            <Input value={config.jsonPath || ''} onChange={e => onUpdate({ ...config, jsonPath: e.target.value })} placeholder="e.g. details.id" className="bg-muted/50 border-border h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New Column</Label>
            <Input value={config.newColumn || ''} onChange={e => onUpdate({ ...config, newColumn: e.target.value })} placeholder="Default: [Col]_extracted" className="bg-muted/50 border-border h-8 text-xs" />
          </div>
        </div>
      );

    case 'cast_type':
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
            <Label className="text-xs text-muted-foreground">Target Type</Label>
            <Select value={config.targetType || 'string'} onValueChange={v => onUpdate({ ...config, targetType: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="string">Text (String)</SelectItem>
                <SelectItem value="number">Number (Float/Int)</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New Column</Label>
            <Input value={config.newColumn || ''} onChange={e => onUpdate({ ...config, newColumn: e.target.value })} placeholder="Replace Original" className="bg-muted/50 border-border h-8 text-xs" />
          </div>
        </div>
      );

    case 'data_cleansing':
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
            <Label className="text-xs text-muted-foreground">Action</Label>
            <Select value={config.action || 'drop_null'} onValueChange={v => onUpdate({ ...config, action: v })}>
              <SelectTrigger className="bg-muted/50 border-border h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="drop_null">Drop Row if Null/Empty</SelectItem>
                <SelectItem value="fill_null">Fill Null/Empty with Value</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {config.action === 'fill_null' && (
            <div>
              <Label className="text-xs text-muted-foreground">Fill Value</Label>
              <Input value={config.fillValue || ''} onChange={e => onUpdate({ ...config, fillValue: e.target.value })} placeholder="e.g. 0 or N/A" className="bg-muted/50 border-border h-8 text-xs" />
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

export default function ETLPipelinePage() {
  const { runWorker } = useDataWorker();
  const { data: pipelinesData = [] } = usePipelines();
  const pipelines = pipelinesData as any[];
  const createPipelineMut = useCreatePipeline();
  const updatePipelineMut = useUpdatePipeline();
  const deletePipelineMut = useDeletePipeline();
  const runPipelineMut = useRunPipeline();
  const uploadDatasetMut = useUploadDataset();

  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();
  const [newPipelineName, setNewPipelineName] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<Record<string, Record<string, any>[]>>({});

  const createPipeline = async () => {
    if (!newPipelineName.trim() || !selectedSource) {
      toast({ title: 'Missing information', description: 'Please provide a pipeline name and select a source dataset.', variant: 'destructive' });
      return;
    }
    try {
      await createPipelineMut.mutateAsync({
        name: newPipelineName,
        sourceDatasetId: selectedSource,
        steps: [],
      } as any);
      setNewPipelineName('');
      setSelectedSource('');
      toast({ title: 'Pipeline created', description: `${newPipelineName} has been created.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to create pipeline', variant: 'destructive' });
    }
  };

  const addStep = async (pipelineId: string, type: ETLStep['type']) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const currentSteps = (pipeline.steps as ETLStep[]) || [];
    const newStep: ETLStep = { id: generateId(), type, config: {}, order: currentSteps.length };
    const newSteps = [...currentSteps, newStep];
    try {
      await updatePipelineMut.mutateAsync({ id: pipelineId, payload: { steps: newSteps as any } });
      setExpandedSteps(prev => new Set(prev).add(newStep.id));
    } catch {
      toast({ title: 'Error', description: 'Failed to add step', variant: 'destructive' });
    }
  };

  const updateStepConfig = async (pipelineId: string, stepId: string, config: Record<string, any>) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const currentSteps = (pipeline.steps as ETLStep[]) || [];
    const newSteps = currentSteps.map(s => s.id === stepId ? { ...s, config } : s);
    try {
      await updatePipelineMut.mutateAsync({ id: pipelineId, payload: { steps: newSteps as any } });
    } catch {
      toast({ title: 'Error', description: 'Failed to update step config', variant: 'destructive' });
    }
  };

  const removeStep = async (pipelineId: string, stepId: string) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const currentSteps = (pipeline.steps as ETLStep[]) || [];
    const newSteps = currentSteps.filter(s => s.id !== stepId);
    try {
      await updatePipelineMut.mutateAsync({ id: pipelineId, payload: { steps: newSteps as any } });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove step', variant: 'destructive' });
    }
  };

  const handleRemovePipeline = async (pipelineId: string) => {
    try {
      await deletePipelineMut.mutateAsync(pipelineId);
      toast({ title: 'Pipeline deleted', description: 'The pipeline has been removed.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete pipeline', variant: 'destructive' });
    }
  };

  const runPipeline = async (pipelineId: string) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const sourceDatasetId = pipeline.sourceDataSetId || pipeline.sourceDatasetId;
    const sourceDs = dataSets.find(ds => ds.id === sourceDatasetId);
    if (!sourceDs) {
      toast({ title: 'Error', description: 'Source dataset not found', variant: 'destructive' });
      return;
    }

    try {
      // 1. Run pipeline on backend
      await runPipelineMut.mutateAsync(pipelineId);

      // 2. Run local executePipeline to get preview output data on frontend
      const response = await datasetApi.data(sourceDs.id, { limit: 50000 });
      const sourceData = response.data.data || [];
      const result = await runWorker<Record<string, any>[]>('EXECUTE_ETL', { data: sourceData, steps: (pipeline.steps as ETLStep[]) || [] });
      setPreviewData(prev => ({ ...prev, [pipelineId]: result }));

      toast({ title: 'Pipeline completed', description: `${result.length} rows processed via backend.` });
    } catch (err: any) {
      toast({ title: 'Pipeline error', description: err.message || 'An error occurred during execution', variant: 'destructive' });
    }
  };

  const saveOutput = async (pipelineId: string) => {
    const data = previewData[pipelineId];
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!data || !pipeline || data.length === 0) return;

    try {
      // 1. Generate CSV from JSON data, removing internal backend fields
      const cleanData = data.map((row: any) => {
        const { _row_id, ...rest } = row;
        return rest;
      });
      const csvStr = Papa.unparse(cleanData);

      // 2. Create a Blob and File from CSV string
      const blob = new Blob([csvStr], { type: 'text/csv' });
      const cleanName = pipeline.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      const filename = `${cleanName.replace(/\s+/g, '_').toLowerCase()}_output.csv`;
      const file = new File([blob], filename, { type: 'text/csv' });

      // 3. Prepare FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', `${pipeline.name} (Output)`); // Set a nice name for the dataset

      // 4. Upload to backend
      await uploadDatasetMut.mutateAsync(formData);

      toast({ title: 'Output saved', description: `Saved as dataset "${pipeline.name} (Output)". It is now available for reports and charts.` });
    } catch (error) {
      toast({ title: 'Failed to save', description: 'Could not upload the processed dataset.', variant: 'destructive' });
    }
  };

  const handleAIResponse = async (response: string) => {
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
      const currentSteps = (lastPipeline.steps as ETLStep[]) || [];
      const newSteps: ETLStep[] = steps.map((s, i) => ({
        id: generateId(),
        type: s.type,
        config: s.config || {},
        order: currentSteps.length + i,
      }));

      const finalSteps = [...currentSteps, ...newSteps];
      await updatePipelineMut.mutateAsync({ id: lastPipeline.id, payload: { steps: finalSteps as any } });
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

Generate ETL pipeline steps as a JSON array. Each step has: type (filter|transform|aggregate|select|sort|deduplicate|parse_date|json_extract|cast_type|data_cleansing), and config object.

Step configs:
- filter: { "column": "col", "operator": "=|!=|>|<|>=|<=|contains", "value": "val" }
- transform: { "column": "col", "operation": "uppercase|lowercase|trim|round|abs|add|multiply", "newColumn": "new_col", "operand": number }
- aggregate: { "groupBy": "col", "aggregations": [{ "column": "col", "function": "sum|avg|count|min|max", "alias": "name" }] }
- select: { "columns": ["col1", "col2"] }
- sort: { "column": "col", "direction": "asc|desc" }
- deduplicate: { "columns": ["col1", "col2"] } (leave columns empty to deduplicate whole row)
- parse_date: { "column": "col", "extract": "iso|year|month|day", "newColumn": "new_col" }
- json_extract: { "column": "col", "jsonPath": "path.to.key", "newColumn": "new_col" }
- cast_type: { "column": "col", "targetType": "string|number|boolean", "newColumn": "new_col" }
- data_cleansing: { "column": "col", "action": "drop_null|fill_null", "fillValue": "val" }

When the user asks in natural language, generate the appropriate steps. Return ONLY the JSON array.`;
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
              {pipelines.map((pipeline: any, index: number) => {
                const sourceDatasetId = pipeline.sourceDataSetId || pipeline.sourceDatasetId;
                const sourceDs = dataSets.find(ds => ds.id === sourceDatasetId);
                const sourceColumns = sourceDs?.columns.map(c => ({ name: c.name, type: c.type })) || [];
                const preview = previewData[pipeline.id];
                const pipelineSteps = (pipeline.steps as ETLStep[]) || [];

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
                          <p className="text-xs text-muted-foreground">Source: {sourceDs?.name || 'Unknown'} • {pipelineSteps.length} steps</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(pipeline.status)}
                        <Button size="sm" onClick={() => runPipeline(pipeline.id)} disabled={pipeline.status === 'running' || pipelineSteps.length === 0} className="gradient-primary text-primary-foreground">
                          <Play className="w-4 h-4 mr-1" /> Run
                        </Button>
                        {preview && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => saveOutput(pipeline.id)}>
                            <Save className="w-4 h-4 mr-1" /> Save Output
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => handleRemovePipeline(pipeline.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Add Steps Buttons */}
                    <div className="px-4 pb-3">
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">Available Actions</h4>
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {stepTypes.map(st => (
                          <Button
                            key={st.value}
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 shrink-0 whitespace-nowrap bg-muted/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
                            onClick={() => addStep(pipeline.id, st.value as ETLStep['type'])}
                          >
                            <st.icon className="w-3 h-3 mr-1" /> {st.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Steps */}
                    {pipelineSteps.length > 0 && (
                      <div className="border-t border-border">
                        {pipelineSteps.map((step, si) => {
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
