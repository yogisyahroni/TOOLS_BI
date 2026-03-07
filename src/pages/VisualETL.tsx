import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node,
  BackgroundVariant, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Workflow, Play, Save, Trash2, Plus,
  Database, Filter, Shuffle, Layers, ArrowUpDown, Columns3, FileOutput, Code2, GitMerge, Eraser, Split,
  Loader2,
} from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { HelpTooltip } from '@/components/HelpTooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import ETLNode from '@/components/etl/ETLNodes';
import { useCreatePipeline, useRunPipeline, useDatasets, useDatasetData } from '@/hooks/useApi';
import { evaluatePipelinePreview } from '@/lib/etlEvaluator';

const nodeTypes = { etlNode: ETLNode };

const NODE_PALETTE = [
  { type: 'source', label: 'Data Source', icon: Database, desc: 'Dataset input' },
  { type: 'filter', label: 'Filter', icon: Filter, desc: 'Filter rows by condition' },
  { type: 'transform', label: 'Transform', icon: Shuffle, desc: 'Rename, cast, compute' },
  { type: 'aggregate', label: 'Aggregate', icon: Layers, desc: 'Group & aggregate' },
  { type: 'sort', label: 'Sort', icon: ArrowUpDown, desc: 'Sort by column' },
  { type: 'select', label: 'Select', icon: Columns3, desc: 'Pick/reorder columns' },
  { type: 'join', label: 'Join', icon: GitMerge, desc: 'Join two datasets' },
  { type: 'deduplicate', label: 'Deduplicate', icon: Eraser, desc: 'Remove duplicates' },
  { type: 'split', label: 'Split', icon: Split, desc: 'Split into branches' },
  { type: 'custom', label: 'Custom Code', icon: Code2, desc: 'JS/TS expression' },
  { type: 'output', label: 'Output', icon: FileOutput, desc: 'Save result as dataset' },
];

let nodeId = 0;
function genNodeId() { return `etl_node_${++nodeId}_${Date.now()}`; }

function VisualETLInner() {
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [configDialog, setConfigDialog] = useState<{ open: boolean; nodeId: string; nodeType: string; config: Record<string, any> }>({
    open: false, nodeId: '', nodeType: '', config: {},
  });
  const [pipelineName, setPipelineName] = useState('Untitled Pipeline');
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // BUG-C3 FIX: track the backend pipeline id after save
  const [savedPipelineId, setSavedPipelineId] = useState<string | null>(null);

  const createPipelineMut = useCreatePipeline();
  const runPipelineMut = useRunPipeline();

  // Fetch metadata `columns` from the loaded datasets instead of doing another data fetch
  const sourceNode = nodes.find((n) => (n.data as any).nodeType === 'source');
  const sourceDatasetId = (sourceNode?.data as any)?.config?.dataSetId ?? '';
  const selectedDataset = dataSets.find((ds: any) => ds.id === sourceDatasetId);
  const { data: sourceDataRaw } = useDatasetData(sourceDatasetId, { limit: 10 });

  let datasetColumns: any[] = [];
  try {
    if (typeof selectedDataset?.columns === 'string') {
      datasetColumns = JSON.parse(selectedDataset.columns);
    } else if (Array.isArray(selectedDataset?.columns)) {
      datasetColumns = selectedDataset.columns;
    }
  } catch (err) {
    datasetColumns = [];
  }

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
    }, eds));
  }, [setEdges]);

  const addNode = useCallback((type: string) => {
    const id = genNodeId();
    const paletteItem = NODE_PALETTE.find(p => p.type === type);
    const newNode: Node = {
      id,
      type: 'etlNode',
      position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 },
      data: {
        label: paletteItem?.label || type,
        nodeType: type,
        config: {},
        preview: [],
        status: 'idle',
      },
    };
    setNodes(nds => [...nds, newNode]);
    // Open config dialog immediately
    setConfigDialog({ open: true, nodeId: id, nodeType: type, config: {} });
  }, [setNodes]);

  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    const d = node.data as any;
    setConfigDialog({ open: true, nodeId: node.id, nodeType: d.nodeType, config: d.config || {} });
  }, []);

  const updateNodeConfig = useCallback((config: Record<string, any>) => {
    setNodes(nds => nds.map(n =>
      n.id === configDialog.nodeId
        ? { ...n, data: { ...n.data, config } }
        : n
    ));
    setConfigDialog(prev => ({ ...prev, open: false }));
    toast({ title: 'Node configured' });
  }, [configDialog.nodeId, setNodes, toast]);

  const deleteSelected = useCallback(() => {
    setNodes(nds => nds.filter(n => !n.selected));
    setEdges(eds => eds.filter(e => !e.selected));
  }, [setNodes, setEdges]);

  // Evaluator Effect for Live Preview
  const configDeps = JSON.stringify(nodes.map(n => ({ id: n.id, config: (n.data as any).config, type: (n.data as any).nodeType })));
  const edgeDeps = JSON.stringify(edges);
  const sourceRows = sourceDataRaw?.data || [];

  useEffect(() => {
    if (!isRunning || !sourceRows.length) return;

    try {
      const parsedNodes = JSON.parse(configDeps).map((n: any) => ({
        id: n.id,
        data: { nodeType: n.type, config: n.config }
      }));
      const parsedEdges = JSON.parse(edgeDeps);

      const previewMap = evaluatePipelinePreview(parsedNodes, parsedEdges, sourceRows);

      setNodes(nds => {
        let changed = false;
        const newNodes = nds.map(n => {
          const newPreview = previewMap.get(n.id) || [];
          if (JSON.stringify(n.data.preview) !== JSON.stringify(newPreview)) {
            changed = true;
            return { ...n, data: { ...n.data, preview: newPreview, status: 'done' } };
          }
          return n;
        });
        return changed ? newNodes : nds;
      });
    } catch (err) {
      console.error("Preview evaluation failed", err);
    }
  }, [configDeps, edgeDeps, sourceRows, isRunning, setNodes]);

  // BUG-C3 FIX: Save pipeline definition to backend, then run it
  const savePipeline = useCallback(async () => {
    if (nodes.length === 0) {
      toast({ title: 'No nodes', description: 'Add nodes to the pipeline first' });
      return null;
    }

    // Build steps from non-source nodes
    const steps = nodes
      .filter((n) => (n.data as any).nodeType !== 'source')
      .map((n) => ({ id: n.id, type: (n.data as any).nodeType, config: (n.data as any).config ?? {} }));

    setIsSaving(true);
    try {
      const result = await createPipelineMut.mutateAsync({
        name: pipelineName,
        sourceDatasetId,
        steps,
      });
      setSavedPipelineId(result.id);
      toast({ title: 'Pipeline saved', description: `"${pipelineName}" saved to backend (ID: ${result.id.slice(0, 8)}…)` });
      return result.id;
    } catch {
      toast({ title: 'Save failed', description: 'Could not save pipeline to backend', variant: 'destructive' });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [nodes, pipelineName, createPipelineMut, toast, sourceDatasetId]);

  const togglePreview = useCallback(() => {
    if (nodes.length === 0) { toast({ title: 'No nodes', description: 'Add nodes to the pipeline first' }); return; }

    setIsRunning(prev => {
      const next = !prev;
      if (!next) {
        // Stop preview: clear preview data and reset status
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, preview: [], status: 'idle' } })));
        toast({ title: 'Preview Stopped', description: 'Live data preview is now off.' });
      } else {
        toast({ title: 'Preview Started', description: 'Live data preview is active globally.' });
      }
      return next;
    });
  }, [nodes.length, setNodes, toast]);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Workflow className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                Visual ETL
                <HelpTooltip text="Drag-and-drop ETL pipeline builder. Tambahkan node dari palette, hubungkan dengan garis, konfigurasi tiap node dengan double-click, lalu jalankan pipeline." />
              </h1>
              <p className="text-muted-foreground">Build data pipelines visually — no SQL needed</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input value={pipelineName} onChange={e => setPipelineName(e.target.value)} className="w-48 text-sm" />
            <Button variant="outline" size="sm" onClick={deleteSelected}><Trash2 className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={savePipeline} disabled={isSaving || nodes.length === 0}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
            <Button size="sm" onClick={togglePreview} variant={isRunning ? 'destructive' : 'default'} disabled={nodes.length === 0}>
              {isRunning ? <Filter className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              {isRunning ? 'Stop Preview' : 'Run Preview'}
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-4">
        {/* Node Palette */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="bg-card rounded-xl border border-border shadow-card p-3 space-y-1.5 w-[180px] flex-shrink-0 self-start">
          <p className="text-xs font-semibold text-foreground mb-2">Node Palette</p>
          {NODE_PALETTE.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.type} onClick={() => addNode(item.type)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-left group">
                <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <div>
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* Canvas & Bottom Panel Container */}
        <div className="flex-1 flex flex-col gap-4 h-[calc(100vh-140px)]">
          {/* Main Visual Node Canvas */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            ref={reactFlowWrapper}
            className="bg-card rounded-xl border border-border shadow-card overflow-hidden flex-1 relative"
            style={{ minHeight: '300px' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
              <Controls showInteractive={false} className="!bg-card !border-border !shadow-card [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
              <MiniMap nodeColor="hsl(var(--primary) / 0.3)" maskColor="hsl(var(--background) / 0.8)" className="!bg-card !border-border" />
              <Panel position="top-right" className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{nodes.length} nodes</span>
                  <span>{edges.length} connections</span>
                  {isRunning && <span className="text-yellow-500 animate-pulse">● Live Preview Active</span>}
                </div>
              </Panel>
            </ReactFlow>
          </motion.div>

          {/* Bottom Table Data Preview Panel */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-card rounded-xl border border-border shadow-card flex flex-col overflow-hidden shrink-0"
            style={{ height: '35vh', minHeight: '250px' }}>

            <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Data Preview {nodes.find(n => n.selected) ? `— ${(nodes.find(n => n.selected)?.data as any)?.label}` : ''}
              </h3>
              {nodes.find(n => n.selected) && (nodes.find(n => n.selected)?.data as any)?.preview?.length > 0 && (
                <span className="text-xs text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {(nodes.find(n => n.selected)?.data as any).preview.length} rows loaded
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto bg-background/50">
              {!nodes.find(n => n.selected) ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Layers className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Select a node to view its data preview</p>
                </div>
              ) : !(nodes.find(n => n.selected)?.data as any)?.preview || (nodes.find(n => n.selected)?.data as any).preview.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Database className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No preview data available. Click <strong className="text-foreground">Run Preview</strong> to generate data.</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-2 font-medium border-b border-border/50 text-center w-12">#</th>
                      {Object.keys((nodes.find(n => n.selected)?.data as any).preview[0]).map(key => (
                        <th key={key} className="px-4 py-2 font-semibold border-b border-border/50 text-foreground">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {(nodes.find(n => n.selected)?.data as any).preview.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground text-center text-xs border-r border-border/20">{i + 1}</td>
                        {Object.values(row).map((val: any, j: number) => (
                          <td key={j} className="px-4 py-2 text-foreground/80">{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Node Config Dialog */}
      <Dialog open={configDialog.open} onOpenChange={open => setConfigDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure {NODE_PALETTE.find(p => p.type === configDialog.nodeType)?.label || 'Node'}</DialogTitle>
            <DialogDescription className="sr-only">Configure {NODE_PALETTE.find(p => p.type === configDialog.nodeType)?.label || 'Node'} properties.</DialogDescription>
          </DialogHeader>
          <NodeConfigForm
            nodeType={configDialog.nodeType}
            config={configDialog.config}
            dataSets={dataSets}
            columns={datasetColumns}
            onSave={updateNodeConfig}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Dynamic config form based on node type
function NodeConfigForm({ nodeType, config, dataSets, columns = [], onSave }: { nodeType: string; config: Record<string, any>; dataSets: any[]; columns?: any[]; onSave: (c: Record<string, any>) => void }) {
  const [form, setForm] = useState<Record<string, any>>(config);

  const fields = useMemo(() => {
    switch (nodeType) {
      case 'source': return [{ key: 'dataSetId', label: 'Dataset', type: 'dataset' }];
      case 'filter': return [
        { key: 'column', label: 'Column', type: 'column' },
        { key: 'operator', label: 'Operator', type: 'select', options: ['=', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith'] },
        { key: 'value', label: 'Value', type: 'text' },
      ];
      case 'transform': return [
        { key: 'column', label: 'Column', type: 'column' },
        { key: 'operation', label: 'Operation', type: 'select', options: ['uppercase', 'lowercase', 'trim', 'round', 'abs', 'toNumber', 'toString', 'toDate'] },
      ];
      case 'aggregate': return [
        { key: 'groupBy', label: 'Group By', type: 'column' },
        { key: 'column', label: 'Aggregate Column', type: 'column' },
        { key: 'function', label: 'Function', type: 'select', options: ['sum', 'avg', 'count', 'min', 'max', 'median'] },
      ];
      case 'sort': return [
        { key: 'column', label: 'Column', type: 'column' },
        { key: 'direction', label: 'Direction', type: 'select', options: ['asc', 'desc'] },
      ];
      case 'select': return [{ key: 'columns', label: 'Columns (comma-separated)', type: 'text' }];
      case 'join': return [
        { key: 'targetDataSetId', label: 'Join Dataset', type: 'dataset' },
        { key: 'joinType', label: 'Join Type', type: 'select', options: ['inner', 'left', 'right', 'full'] },
        { key: 'leftKey', label: 'Left Key', type: 'column' },
        { key: 'rightKey', label: 'Right Key (Target)', type: 'text' },
      ];
      case 'deduplicate': return [{ key: 'columns', label: 'Columns (comma-separated)', type: 'text' }];
      case 'split': return [
        { key: 'column', label: 'Split Column', type: 'column' },
        { key: 'condition', label: 'Condition', type: 'text' },
      ];
      case 'custom': return [{ key: 'expression', label: 'JS Expression', type: 'textarea' }];
      case 'output': return [{ key: 'name', label: 'Output Name', type: 'text' }];
      default: return [];
    }
  }, [nodeType]);

  return (
    <div className="space-y-4">
      {fields.map(field => (
        <div key={field.key}>
          <Label>{field.label}</Label>
          {field.type === 'text' && (
            <Input value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
          )}
          {field.type === 'textarea' && (
            <textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3}
              value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
          )}
          {field.type === 'select' && (
            <Select value={form[field.key] || ''} onValueChange={v => setForm({ ...form, [field.key]: v })}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {field.type === 'column' && (
            <Select value={form[field.key] || ''} onValueChange={v => setForm({ ...form, [field.key]: v })}>
              <SelectTrigger><SelectValue placeholder="Select column..." /></SelectTrigger>
              <SelectContent>
                {columns?.map((col: any) => {
                  const val = col.name || col.id || col.accessorKey || col.key || (typeof col === 'string' ? col : '');
                  const label = col.name || col.header || (typeof col === 'string' ? col : val);
                  if (!val) return null;
                  return <SelectItem key={val} value={val}>{label}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          )}
          {field.type === 'dataset' && (
            <Select value={form[field.key] || ''} onValueChange={v => setForm({ ...form, [field.key]: v })}>
              <SelectTrigger><SelectValue placeholder="Select dataset..." /></SelectTrigger>
              <SelectContent>
                {dataSets.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
      <Button onClick={() => onSave(form)} className="w-full">Save Configuration</Button>
    </div>
  );
}

export default function VisualETL() {
  return (
    <ReactFlowProvider>
      <VisualETLInner />
    </ReactFlowProvider>
  );
}
