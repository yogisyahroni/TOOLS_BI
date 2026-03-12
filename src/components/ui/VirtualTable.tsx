/**
 * VirtualTable — high-performance table for large datasets (1 000–100 000+ rows)
 *
 * Uses @tanstack/react-virtual to render only the rows visible in the viewport.
 * Drops from O(N) DOM nodes to O(visible_rows), keeping the browser fast even
 * when a dataset has tens of thousands of rows.
 *
 * Usage:
 *   <VirtualTable columns={cols} data={rows} />
 *
 * Columns shape:
 *   { key: string; header: string; width?: number; render?: (value, row) => ReactNode }
 */
import { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface VirtualTableColumn<T = Record<string, unknown>> {
  key: string;
  header: string;
  /** Pixel width (default 160) */
  width?: number;
  className?: string;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
}

interface VirtualTableProps<T = Record<string, unknown>> {
  columns: VirtualTableColumn<T>[];
  data: T[];
  /** Height of each row in pixels (default 40) */
  rowHeight?: number;
  /** Max height of the scrollable container (default 600) */
  maxHeight?: number;
  className?: string;
  /** Show zebra striping */
  striped?: boolean;
  /** Callback when a row is clicked */
  onRowClick?: (row: T, index: number) => void;
  /** Shown when data is empty */
  emptyMessage?: string;
}

export function VirtualTable<T = Record<string, unknown>>({
  columns,
  data,
  rowHeight = 40,
  maxHeight = 600,
  className,
  striped = true,
  onRowClick,
  emptyMessage = "No data available",
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Total horizontal width — used so sticky headers stay aligned
  const totalWidth = useMemo(
    () => columns.reduce((acc, col) => acc + (col.width ?? 160), 0),
    [columns]
  );

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10, // pre-render 10 rows outside viewport for smooth scrolling
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg border border-border bg-muted/40 py-16 text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div
        className="overflow-x-auto bg-muted/50 border-b border-border"
        style={{ minWidth: totalWidth }}
      >
        <div className="flex" style={{ minWidth: totalWidth }}>
          {columns.map((col) => (
            <div
              key={col.key}
              className={cn(
                "flex-shrink-0 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none",
                col.className
              )}
              style={{ width: col.width ?? 160, minWidth: col.width ?? 160 }}
            >
              {col.header}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight, minWidth: totalWidth }}
      >
        {/* Spacer to preserve scroll height */}
        <div style={{ height: totalHeight, width: "100%", position: "relative" }}>
          {virtualItems.map((virtualRow) => {
            const row = data[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={cn(
                  "absolute top-0 left-0 flex w-full items-center border-b border-border/60 transition-colors",
                  striped && virtualRow.index % 2 === 1 && "bg-muted/20",
                  onRowClick && "cursor-pointer hover:bg-accent/40"
                )}
                style={{
                  height: rowHeight,
                  transform: `translateY(${virtualRow.start}px)`,
                  minWidth: totalWidth,
                }}
                onClick={() => onRowClick?.(row, virtualRow.index)}
              >
                {columns.map((col) => {
                  const value = (row as Record<string, unknown>)[col.key];
                  return (
                    <div
                      key={col.key}
                      className={cn(
                        "flex-shrink-0 px-3 text-sm truncate",
                        col.className
                      )}
                      style={{ width: col.width ?? 160, minWidth: col.width ?? 160 }}
                      title={String(value ?? "")}
                    >
                      {col.render
                        ? col.render(value, row, virtualRow.index)
                        : (value == null ? "—" : String(value))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        {data.length.toLocaleString()} rows
      </div>
    </div>
  );
}

export default VirtualTable;
