import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Database, Filter, Shuffle, Layers, ArrowUpDown, Columns3, FileOutput, Code2, GitMerge, Eraser, Split } from 'lucide-react';

const nodeStyles: Record<string, { icon: any; color: string; bg: string }> = {
  source: { icon: Database, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/30' },
  filter: { icon: Filter, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/30' },
  transform: { icon: Shuffle, color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/30' },
  aggregate: { icon: Layers, color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/30' },
  sort: { icon: ArrowUpDown, color: 'text-cyan-500', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  select: { icon: Columns3, color: 'text-teal-500', bg: 'bg-teal-500/10 border-teal-500/30' },
  join: { icon: GitMerge, color: 'text-pink-500', bg: 'bg-pink-500/10 border-pink-500/30' },
  deduplicate: { icon: Eraser, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  split: { icon: Split, color: 'text-indigo-500', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  custom: { icon: Code2, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30' },
  output: { icon: FileOutput, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30' },
};

export interface ETLNodeData {
  label: string;
  nodeType: string;
  config?: Record<string, any>;
  preview?: any[];
  status?: 'idle' | 'running' | 'done' | 'error';
  [key: string]: unknown;
}

function ETLNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ETLNodeData;
  const style = nodeStyles[nodeData.nodeType] || nodeStyles.custom;
  const Icon = style.icon;
  const status = nodeData.status || 'idle';
  const statusColors: Record<string, string> = {
    idle: 'bg-muted-foreground/30',
    running: 'bg-yellow-500 animate-pulse',
    done: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <div className={`border-2 rounded-xl shadow-lg min-w-[180px] overflow-hidden transition-all ${style.bg} ${selected ? 'ring-2 ring-primary shadow-glow' : ''}`}>
      {/* Input handle */}
      {nodeData.nodeType !== 'source' && (
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
      )}

      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${style.bg}`}>
          <Icon className={`w-4 h-4 ${style.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{nodeData.label}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{nodeData.nodeType}</p>
        </div>
        <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
      </div>

      {/* Config preview */}
      {nodeData.config && Object.keys(nodeData.config).length > 0 && (
        <div className="px-3 pb-1.5 border-t border-border/30">
          {Object.entries(nodeData.config).slice(0, 3).map(([k, v]) => (
            <p key={k} className="text-[10px] text-muted-foreground truncate">
              <span className="font-medium">{k}:</span> {String(v)}
            </p>
          ))}
        </div>
      )}

      {/* Data preview */}
      {nodeData.preview && nodeData.preview.length > 0 && (
        <div className="px-3 pb-2 border-t border-border/30 mt-1">
          <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Preview ({nodeData.preview.length} rows)</p>
          <div className="bg-card/50 rounded p-1 max-h-[60px] overflow-hidden">
            {nodeData.preview.slice(0, 2).map((row, i) => (
              <p key={i} className="text-[9px] text-muted-foreground truncate">{JSON.stringify(row).slice(0, 60)}</p>
            ))}
          </div>
        </div>
      )}

      {/* Output handle */}
      {nodeData.nodeType !== 'output' && (
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
      )}
    </div>
  );
}

export default memo(ETLNode);
