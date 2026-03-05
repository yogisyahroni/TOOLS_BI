import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, addEdge,
  MarkerType, type Connection, type Edge, type Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Database, Maximize } from 'lucide-react';
import { useDataStore } from '@/stores/dataStore';
import { Button } from '@/components/ui/button';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useToast } from '@/hooks/use-toast';
import TableNode from '@/components/diagram/TableNode';
import { useRelationships, useCreateRelationship, useDeleteRelationship } from '@/hooks/useApi';

const nodeTypes = { tableNode: TableNode };

export default function DBDiagram() {
  const { dataSets } = useDataStore();
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

  // Re-sync when data changes
  useMemo(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges]);

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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl p-16 border border-border shadow-card text-center">
          <Database className="w-20 h-20 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Belum ada dataset</h3>
          <p className="text-muted-foreground mb-4">Upload dataset terlebih dahulu untuk melihat diagram database</p>
          <Button onClick={() => window.location.href = '/upload'}>Upload Data</Button>
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
