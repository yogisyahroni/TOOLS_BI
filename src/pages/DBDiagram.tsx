import { useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, addEdge,
  MarkerType, type Connection, type Edge, type Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Database, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useToast } from '@/hooks/use-toast';
import TableNode from '@/components/diagram/TableNode';
import { useRelationships, useCreateRelationship, useDeleteRelationship, useDatasets } from '@/hooks/useApi';

const nodeTypes = { tableNode: TableNode };

export default function DBDiagram() {
  const { data: dataSets = [] } = useDatasets();
  const { toast } = useToast();

  // BUG-H2 FIX: load relationships from backend instead of useDataStore local state
  const { data: relationships = [] } = useRelationships();
  const createRelMut = useCreateRelationship();
  const deleteRelMut = useDeleteRelationship();

  // Build nodes from datasets
  const initialNodes: Node[] = useMemo(() => {
    const cols = Math.max(3, Math.ceil(Math.sqrt(dataSets.length)));
    return dataSets.map((ds, i) => {
      const keyColumns = relationships
        .filter(r => r.sourceDatasetId === ds.id)
        .map(r => r.sourceColumn);
      const fkColumns = relationships
        .filter(r => r.targetDatasetId === ds.id)
        .map(r => r.targetColumn);
      return {
        id: ds.id,
        type: 'tableNode',
        position: { x: (i % cols) * 320, y: Math.floor(i / cols) * 350 },
        data: {
          label: ds.name,
          columns: ds.columns,
          keyColumns,
          fkColumns,
          rowCount: ds.rowCount,
        },
      };
    });
  }, [dataSets, relationships]);

  // Build edges from backend relationships
  const initialEdges: Edge[] = useMemo(() =>
    relationships.map(rel => ({
      id: rel.id,
      source: rel.sourceDatasetId,
      target: rel.targetDatasetId,
      sourceHandle: rel.sourceColumn ? `${rel.sourceColumn}-source` : undefined,
      targetHandle: rel.targetColumn ? `${rel.targetColumn}-target` : undefined,
      type: 'smoothstep',
      animated: true,
      label: rel.relType,
      labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
      labelBgStyle: { fill: 'hsl(var(--card))', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))' },
    })),
    [relationships]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Re-sync nodes/edges when underlying data changes (useEffect is correct here, not useMemo)
  // useMemo with setState caused React Error #321 (too many re-renders / infinite loop)
  useEffect(() => { setNodes(initialNodes); }, [initialNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges]);

  // BUG-H2 FIX: persist new connections to backend
  const onConnect = useCallback(async (params: Connection) => {
    // Optimistic UI: add edge immediately
    setEdges(eds => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
    }, eds));

    // Persist to backend
    try {
      await createRelMut.mutateAsync({
        sourceDatasetId: params.source ?? '',
        targetDatasetId: params.target ?? '',
        sourceColumn: params.sourceHandle?.replace('-source', '') ?? '',
        targetColumn: params.targetHandle?.replace('-target', '') ?? '',
        relType: 'one-to-many',
      });
    } catch {
      toast({ title: 'Failed to save relationship', variant: 'destructive' });
    }
  }, [setEdges, createRelMut, toast]);

  // Delete edge → also delete from backend
  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    deletedEdges.forEach(e => {
      // id matches backend relationship id
      deleteRelMut.mutate(e.id);
    });
  }, [deleteRelMut]);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Database className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                DB Diagram
                <HelpTooltip text="Visualisasi skema database. Drag untuk mengatur posisi, hubungkan tabel dengan garis. Relasi tersimpan persisten ke backend." />
              </h1>
              <p className="text-muted-foreground">Visual database schema &amp; relationships — backend persisted</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Maximize className="w-4 h-4 mr-1" /> Auto Layout
            </Button>
          </div>
        </div>
      </motion.div>

      {dataSets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border shadow-card overflow-hidden"
          style={{ height: '70vh' }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-6 relative">
            {/* Animated background grid */}
            <div className="absolute inset-0 opacity-5 pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Pulsing circles */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-primary/20"
                style={{ width: 120 + i * 80, height: 120 + i * 80 }}
                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.1, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 0.8, ease: 'easeInOut' }}
              />
            ))}
            {/* Central icon */}
            <motion.div
              className="relative z-10 w-24 h-24 rounded-2xl gradient-primary flex items-center justify-center shadow-glow"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Database className="w-12 h-12 text-primary-foreground" />
            </motion.div>
            {/* Text */}
            <div className="relative z-10 text-center">
              <motion.h3
                className="text-xl font-semibold text-foreground mb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                No Datasets Yet
              </motion.h3>
              <motion.p
                className="text-muted-foreground mb-5 text-sm max-w-xs mx-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Upload a dataset first, then come back here to visualize your database schema and draw relationships.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
                <Button
                  onClick={() => window.location.href = '/upload'}
                  className="gradient-primary text-primary-foreground shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  Upload Dataset
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border shadow-card overflow-hidden"
          style={{ height: '70vh' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
            <Controls showInteractive={false} className="!bg-card !border-border !shadow-card [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
            <MiniMap
              nodeColor="hsl(var(--primary) / 0.3)"
              maskColor="hsl(var(--background) / 0.8)"
              className="!bg-card !border-border"
            />
            <Panel position="top-right" className="bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Primary Key</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Foreign Key</span>
                <span>{dataSets.length} tables</span>
                <span>{relationships.length} relations</span>
              </div>
            </Panel>
          </ReactFlow>
        </motion.div>
      )}
    </div>
  );
}
