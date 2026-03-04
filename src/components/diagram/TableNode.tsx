import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Database, Key, Link2 } from 'lucide-react';
import type { DataColumn } from '@/types/data';

export interface TableNodeData {
  label: string;
  columns: DataColumn[];
  keyColumns: string[];
  fkColumns: string[];
  rowCount: number;
  [key: string]: unknown;
}

function TableNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TableNodeData;
  return (
    <div className={`bg-card border-2 rounded-xl shadow-lg min-w-[220px] overflow-hidden transition-all ${selected ? 'border-primary shadow-glow' : 'border-border'}`}>
      {/* Header */}
      <div className="bg-primary/10 px-4 py-2.5 flex items-center gap-2 border-b border-border">
        <Database className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm text-foreground">{nodeData.label}</span>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{nodeData.rowCount} rows</span>
      </div>
      {/* Columns */}
      <div className="px-2 py-1.5 space-y-0.5 max-h-[300px] overflow-y-auto">
        {nodeData.columns.map((col: DataColumn, idx: number) => {
          const isKey = nodeData.keyColumns?.includes(col.name);
          const isFK = nodeData.fkColumns?.includes(col.name);
          return (
            <div key={col.name} className={`flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted/50 transition-colors ${isKey ? 'bg-primary/5' : ''}`}>
              {isKey ? <Key className="w-3 h-3 text-yellow-500" /> : isFK ? <Link2 className="w-3 h-3 text-primary" /> : <span className="w-3" />}
              <span className={`font-medium ${isKey ? 'text-yellow-600 dark:text-yellow-400' : isFK ? 'text-primary' : 'text-foreground'}`}>{col.name}</span>
              <span className="ml-auto text-muted-foreground opacity-70">{col.type}</span>
              {col.nullable && <span className="text-muted-foreground opacity-50 text-[10px]">NULL</span>}
              {/* Handles per column for precise edge connections */}
              <Handle type="source" position={Position.Right} id={`${col.name}-source`}
                style={{ top: `${56 + idx * 28 + 14}px`, right: -4, width: 8, height: 8, background: isKey || isFK ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
              />
              <Handle type="target" position={Position.Left} id={`${col.name}-target`}
                style={{ top: `${56 + idx * 28 + 14}px`, left: -4, width: 8, height: 8, background: isKey || isFK ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(TableNode);
