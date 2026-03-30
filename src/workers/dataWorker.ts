export type WorkerMessageType = 'PIVOT' | 'FILTER_SORT' | 'EXECUTE_ETL';

export interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload: any;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;

  try {
    let result;
    switch (type) {
      case 'PIVOT':
        result = handlePivot(payload);
        break;
      case 'FILTER_SORT':
        result = handleFilterSort(payload);
        break;
      case 'EXECUTE_ETL':
        result = handleEtl(payload);
        break;
      default:
        throw new Error(`Unknown worker message type: ${type}`);
    }

    self.postMessage({ id, "success": true, data: result });
  } catch (error: any) {
    self.postMessage({ id, "success": false, error: error.message });
  }
};

function handleFilterSort({ dataset, searchTerm, sortColumn, sortDir, filterCol, filterVal }: any) {
  if (!dataset) return { filteredData: [], columnStats: [] };
  let data = [...dataset.data];

  // Global search
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    data = data.filter(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(term))
    );
  }

  // Column filter
  if (filterCol && filterVal) {
    data = data.filter(row =>
      String(row[filterCol] ?? '').toLowerCase().includes(filterVal.toLowerCase())
    );
  }

  // Sort
  if (sortColumn) {
    data.sort((a, b) => {
      const av = a[sortColumn], bv = b[sortColumn];
      const cmp = typeof av === 'number' ? av - Number(bv) : String(av).localeCompare(String(bv));
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }

  // Column stats
  const columnStats = dataset.columns.map((col: any) => {
    const values = dataset.data.map((r: any) => r[col.name]).filter((v: any) => v != null);
    const numVals = values.map(Number).filter((n: any) => !isNaN(n));
    const uniqueCount = new Set(values.map(String)).size;
    const nullCount = dataset.data.length - values.length;
    
    return {
      name: col.name,
      type: col.type,
      unique: uniqueCount,
      nulls: nullCount,
      min: numVals.length ? Math.min(...numVals) : null,
      max: numVals.length ? Math.max(...numVals) : null,
      mean: numVals.length ? numVals.reduce((a: number, b: number) => a + b, 0) / numVals.length : null,
    };
  });

  return { filteredData: data, columnStats };
}

function handlePivot({ dataset, rowField, colField, valueField, aggFunc }: any) {
  if (!dataset || !rowField || !valueField) return null;

  const rows = new Set<string>();
  const cols = new Set<string>();
  const cells: Record<string, number[]> = {};

  dataset.data.forEach((row: any) => {
    const r = String(row[rowField] ?? 'N/A');
    const c = colField ? String(row[colField] ?? 'N/A') : 'Value';
    const v = Number(row[valueField]) || 0;
    rows.add(r);
    cols.add(c);
    const key = `${r}__${c}`;
    if (!cells[key]) cells[key] = [];
    cells[key].push(v);
  });

  const rowKeys = Array.from(rows).sort();
  const colKeys = Array.from(cols).sort();

  const aggregate = (vals: number[]) => {
    if (!vals || vals.length === 0) return 0;
    switch (aggFunc) {
      case 'sum': return vals.reduce((a, b) => a + b, 0);
      case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length;
      case 'count': return vals.length;
      case 'min': return Math.min(...vals);
      case 'max': return Math.max(...vals);
      default: return 0;
    }
  };

  const tableData = rowKeys.map(r => {
    const row: Record<string, any> = { _row: r };
    let rowTotal = 0;
    colKeys.forEach(c => {
      const val = aggregate(cells[`${r}__${c}`] || []);
      row[c] = val;
      rowTotal += val;
    });
    row._total = rowTotal;
    return row;
  });

  // Grand totals
  const grandTotals: Record<string, number> = {};
  colKeys.forEach(c => {
    grandTotals[c] = tableData.reduce((sum, row) => sum + (row[c] || 0), 0);
  });
  grandTotals._total = Object.values(grandTotals).reduce((a, b) => a + b, 0);

  return { rowKeys, colKeys, tableData, grandTotals };
}

function handleEtl({ data, steps }: any) {
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
        if (!columns || !Array.isArray(columns) || !columns.length) break;
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
      case 'deduplicate': {
        const { columns } = config;
        const seen = new Set<string>();
        
        if (!columns || !Array.isArray(columns) || columns.length === 0) {
          // SUB-ROUTINE BETA: Deduplicate by entire row. 
          // JSON.stringify is slow but necessary for full-row comparison.
          // Optimized by checking existence before stringifying (not possible naturally with Set)
          // But we can avoid double work.
          result = result.filter(row => {
            const str = JSON.stringify(row);
            if (seen.has(str)) return false;
            seen.add(str);
            return true;
          });
        } else {
          // SUB-ROUTINE ALPHA: Deduplicate by specific columns.
          // Very fast because we only join the relevant column values.
          result = result.filter(row => {
            let key = '';
            for (let i = 0; i < columns.length; i++) {
              key += (row[columns[i]] ?? 'NULL') + '|';
            }
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        break;
      }
      case 'parse_date': {
        const { column, newColumn, extract } = config;
        if (!column) break;
        const targetCol = newColumn || column;
        result = result.map(row => {
          const date = new Date(row[column]);
          if (isNaN(date.getTime())) return row;

          let newVal: string | number = date.toISOString();
          if (extract === 'year') newVal = date.getFullYear();
          else if (extract === 'month') newVal = date.getMonth() + 1;
          else if (extract === 'day') newVal = date.getDate();
          else if (extract === 'iso') newVal = date.toISOString();

          return { ...row, [targetCol]: newVal };
        });
        break;
      }
      case 'json_extract': {
        const { column, newColumn, jsonPath } = config;
        if (!column || !jsonPath) break;
        const targetCol = newColumn || `${column}_extracted`;
        result = result.map(row => {
          try {
            const parsed = typeof row[column] === 'string' ? JSON.parse(row[column]) : row[column];
            const newVal = parsed ? parsed[jsonPath] : null;
            return { ...row, [targetCol]: newVal };
          } catch {
            return { ...row, [targetCol]: null };
          }
        });
        break;
      }
      case 'cast': {
        const { column, newColumn, targetType } = config;
        if (!column || !targetType) break;
        const targetCol = newColumn || column;
        result = result.map(row => {
          let newVal = row[column];
          if (targetType === 'number') {
            newVal = Number(newVal);
            if (isNaN(newVal)) newVal = null;
          } else if (targetType === 'string') {
            newVal = newVal !== null && newVal !== undefined ? String(newVal) : '';
          } else if (targetType === 'boolean') {
            newVal = Boolean(newVal);
          }
          return { ...row, [targetCol]: newVal };
        });
        break;
      }
      case 'data_cleansing': {
        const { column, action, fillValue } = config;
        if (!column || !action) break;

        if (action === 'drop_null') {
          result = result.filter(row => row[column] !== null && row[column] !== undefined && row[column] !== '');
        } else if (action === 'fill_null') {
          result = result.map(row => {
            if (row[column] === null || row[column] === undefined || row[column] === '') {
              const fill = isNaN(Number(fillValue)) ? fillValue : Number(fillValue);
              return { ...row, [column]: fill };
            }
            return row;
          });
        }
        break;
      }
    }
  }
  return result;
}
