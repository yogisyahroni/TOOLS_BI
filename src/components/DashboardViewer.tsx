import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import { format, parseISO, isValid } from 'date-fns';
import { API_BASE } from '@/lib/api';
import { Loader2, Zap } from 'lucide-react';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { DashboardConfig as Dashboard, Widget } from '@/types/data';

const AnyResponsiveGridLayout = ResponsiveGridLayout as any;

// Helper hook to fetch dataset data anonymously via token
function useEmbedDatasetData(token: string, datasetId: string) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!token || !datasetId) return;
        setLoading(true);
        axios.get(`${API_BASE}/embed/view/${token}/data/${datasetId}`)
            .then(res => {
                setData(res.data.data || []);
            })
            .catch(err => {
                console.error('Error fetching embed dataset', err);
                setData([]);
            })
            .finally(() => setLoading(false));
    }, [token, datasetId]);

    return { data, isLoading: loading };
}

const COLORS = [
    'hsl(174, 72%, 46%)', 'hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)',
    'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 82%, 52%)',
    'hsl(210, 80%, 55%)', 'hsl(30, 90%, 55%)', 'hsl(160, 60%, 45%)',
    'hsl(0, 70%, 55%)', 'hsl(45, 85%, 50%)', 'hsl(260, 50%, 60%)',
];

const formatValue = (value: any) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
        // Check if it's an ISO date string (YYYY-MM-DDTHH:mm:ss...)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            const date = parseISO(value);
            if (isValid(date)) {
                return format(date, 'dd MMM yyyy'); // matches ChartRenderer
            }
        }
    }
    return String(value);
};

function WidgetChartRenderer({ widget, token }: { widget: Widget, token: string }) {
    const dsId = widget.dataSetId || (widget as any).datasetId || '';
    const { data: rawData, isLoading } = useEmbedDatasetData(token, dsId);

    if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

    if (widget.type === 'action') {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto space-y-4 bg-muted/10 rounded-lg">
                <Zap className="w-12 h-12 text-primary opacity-80" />
                <p className="text-sm font-medium text-center">{widget.title || "Action Button"}</p>
                <button
                    className="w-full max-w-[200px] shadow-lg shadow-primary/20 bg-primary text-primary-foreground h-10 px-4 py-2 rounded-md"
                    disabled
                >
                    Cannot trigger in Embed
                </button>
            </div>
        );
    }

    if (widget.type === 'text') {
        return (
            <div className="w-full h-full p-4 overflow-auto">
                {widget.htmlContent ? (
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none break-words"
                    dangerouslySetInnerHTML={{ __html: widget.htmlContent }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-center text-sm">{widget.title}</p>
                  </div>
                )}
            </div>
        );
    }

    if (!rawData || rawData.length === 0) return <p className="text-muted-foreground text-center mt-8 text-sm">No data available</p>;

    if (widget.type === 'pivot_table') {
        const rowField = widget.xAxis;
        const colField = widget.groupBy;
        const [aggFunc, valueField] = (widget.yAxis || '').split(':');
        
        if (!rowField || !valueField) return <p className="text-muted-foreground text-center mt-8 text-sm">Incomplete Pivot Configuration</p>;

        const pivotData: Record<string, Record<string, number[]>> = {};
        const colSet = new Set<string>();

        rawData.forEach((row: any) => {
            const rVal = String(row[rowField] || 'Unknown');
            const cVal = colField ? String(row[colField] || 'Unknown') : 'Total';
            const vVal = Number(row[valueField]) || 0;

            if (!pivotData[rVal]) pivotData[rVal] = {};
            if (!pivotData[rVal][cVal]) pivotData[rVal][cVal] = [];
            
            pivotData[rVal][cVal].push(vVal);
            if (colField) colSet.add(cVal);
        });

        const cols = colField ? Array.from(colSet).sort() : ['Total'];
        const rows = Object.keys(pivotData).sort();

        const getAgg = (vals: number[]) => {
            if (!vals || vals.length === 0) return null;
            const sum = vals.reduce((a, b) => a + b, 0);
            switch (aggFunc) {
                case 'sum': return sum;
                case 'avg': return sum / vals.length;
                case 'min': return Math.min(...vals);
                case 'max': return Math.max(...vals);
                case 'count': return vals.length;
                default: return sum;
            }
        };

        const formatVal = (val: number | null) => {
            if (val === null) return '-';
            return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val);
        };

        return (
            <div className="w-full h-full overflow-auto text-sm">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr>
                    <th className="p-2 border border-border text-left font-semibold">{rowField}</th>
                    {cols.map(c => (
                      <th key={c} className="p-2 border border-border text-right font-semibold">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r} className="hover:bg-muted/50">
                      <td className="p-2 border border-border font-medium">{r}</td>
                      {cols.map(c => {
                        const vals = pivotData[r]?.[c] || [];
                        const agg = getAgg(vals);
                        return (
                          <td key={c} className="p-2 border border-border text-right text-muted-foreground">
                            {formatVal(agg)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        );
    }

    // Basic standard chart
    const getStandardChartData = () => {
        if (!widget.xAxis || !widget.yAxis) return [];
        const agg = new Map<string, number>();
        rawData.forEach((row: any) => {
            const key = String(row[widget.xAxis] || 'Unknown');
            agg.set(key, (agg.get(key) || 0) + (Number(row[widget.yAxis]) || 0));
        });
        return Array.from(agg.entries()).map(([name, value]) => ({ name, value })).slice(0, 50);
    };

    const getGroupedChartData = () => {
        if (!widget.xAxis || !widget.yAxis || !widget.groupBy) {
            return { categories: [], groups: [], matrix: [] };
        }
        const xSet = new Set<string>();
        const gSet = new Set<string>();
        const map = new Map<string, number>();

        rawData.forEach((row: any) => {
            const x = formatValue(row[widget.xAxis!] || 'Unknown');
            const g = String(row[widget.groupBy!] || 'Unknown');
            const v = Number(row[widget.yAxis!]) || 0;
            xSet.add(x);
            gSet.add(g);
            const key = `${x}__${g}`;
            map.set(key, (map.get(key) || 0) + v);
        });

        const categories = Array.from(xSet);
        const groups = Array.from(gSet);

        const matrix = categories.map(x => {
            const obj: any = { name: x };
            groups.forEach(g => {
                obj[g] = map.get(`${x}__${g}`) || 0;
            });
            return obj;
        });

        return { categories, groups, matrix };
    };

    if (widget.type === 'stat') {
        const sum = rawData.map(r => Number(r[widget.yAxis])).filter(n => !isNaN(n)).reduce((a, b) => a + b, 0);
        const count = rawData.map(r => Number(r[widget.yAxis])).filter(n => !isNaN(n)).length;
        const avg = count > 0 ? sum / count : 0;
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <p className="text-4xl font-bold text-primary">{sum.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">Sum of {widget.yAxis}</p>
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                    <span>Count: {count.toLocaleString()}</span>
                    <span>Avg: {avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
            </div>
        );
    }

    const data = getStandardChartData();
    if (!data.length) return <p className="text-muted-foreground text-sm text-center mt-8">Incomplete configuration</p>;

    const isHorizontal = widget.type === 'horizontal_bar';
    const categoryNames = data.map(d => formatValue(d.name));
    const seriesData = data.map((d, i) => ({
        value: Number(d.value) || 0,
        name: formatValue(d.name),
        itemStyle: {
            color: COLORS[i % COLORS.length]
        }
    }));

    const axisLabelStyle = { fontSize: 10, color: '#9ca3af' }; // text-muted-foreground
    const splitLineStyle = { lineStyle: { color: '#374151', type: 'dashed' as const } }; // border

    let option: any = {
        grid: { top: 30, right: 20, bottom: 30, left: isHorizontal ? 80 : 40, containLabel: true },
        tooltip: {
            trigger: 'item',
            backgroundColor: '#1e293b', // popover
            borderColor: '#334155', // border
            textStyle: { color: '#f8fafc', fontSize: 12 }, // popover-foreground
            borderRadius: 8
        },
    };

    if (['bar', 'line', 'area', 'scatter', 'horizontal_bar', 'waterfall'].includes(widget.type)) {
        option.xAxis = isHorizontal
            ? { type: 'value', axisLabel: axisLabelStyle, splitLine: splitLineStyle }
            : { type: 'category', data: categoryNames, axisLabel: { ...axisLabelStyle, interval: 0, rotate: categoryNames.length > 5 ? 45 : 0 } };
        option.yAxis = isHorizontal
            ? { type: 'category', data: categoryNames, axisLabel: { ...axisLabelStyle, width: 60, overflow: 'truncate' } }
            : { type: 'value', axisLabel: axisLabelStyle, splitLine: splitLineStyle };
    }

    switch (widget.type) {
        case 'bar':
        case 'horizontal_bar':
            option.series = [{ data: seriesData, type: 'bar', itemStyle: { borderRadius: isHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] } }];
            break;
        case 'line':
            option.series = [{ data: seriesData, type: 'line', symbolSize: 6, lineStyle: { width: 3 }, itemStyle: { color: '#0ea5e9' } }];
            break;
        case 'area':
            option.series = [{ data: seriesData, type: 'line', areaStyle: { opacity: 0.2 }, symbolSize: 6, lineStyle: { width: 2 }, itemStyle: { color: '#0ea5e9' } }];
            break;
        case 'pie':
            option.series = [{ data: seriesData, type: 'pie', radius: ['45%', '75%'], center: ['50%', '50%'], label: { show: false }, itemStyle: { borderRadius: 4, borderColor: '#0f172a', borderWidth: 2 } }];
            option.tooltip.formatter = '{b}: {c} ({d}%)';
            break;
        case 'scatter':
            option.xAxis = { type: 'category', data: categoryNames, axisLabel: axisLabelStyle };
            option.series = [{ data: data.map((d, i) => ({ value: [d.name, d.value], itemStyle: { color: COLORS[i % COLORS.length] } })), type: 'scatter', symbolSize: 12 }];
            break;
        case 'radar': {
            const maxVal = Math.max(...data.map(v => Number(v.value) || 0)) * 1.1;
            option.radar = { indicator: data.map(d => ({ name: String(d.name), max: maxVal })), axisName: { color: '#9ca3af', fontSize: 10 } };
            option.series = [{ type: 'radar', data: [{ value: data.map(d => d.value), name: widget.yAxis }], areaStyle: { opacity: 0.3 }, itemStyle: { color: '#0ea5e9' }, lineStyle: { color: '#0ea5e9', width: 2 } }];
            break;
        }
        case 'funnel':
            option.series = [{ type: 'funnel', left: '10%', top: 20, bottom: 20, width: '80%', data: seriesData.sort((a, b) => b.value - a.value), label: { show: true, position: 'inside', formatter: '{b}' }, itemStyle: { borderColor: '#0f172a', borderWidth: 2 } }];
            break;
        case 'treemap':
            option.series = [{ type: 'treemap', data: seriesData, roam: false, label: { show: true, formatter: '{b}\n{c}' }, itemStyle: { borderColor: '#0f172a' } }];
            break;
        case 'bullet': {
            const grouped = getGroupedChartData();
            if (!grouped.categories.length || grouped.groups.length < 1) {
                return <p className="text-muted-foreground text-sm text-center mt-8">Incomplete bullet configuration</p>;
            }
            const actualGroup = grouped.groups[0];
            const targetGroup = grouped.groups[1] || 'Target'; // Handle cases where only 1 group exists
            
            option = {
                backgroundColor: 'transparent',
                grid: { top: 30, right: 30, bottom: 50, left: 80, containLabel: true },
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { data: [targetGroup, actualGroup], textStyle: { color: '#9ca3af' }, bottom: 0 },
                yAxis: { type: 'category', data: grouped.categories, axisLabel: { color: '#9ca3af', fontSize: 10 } },
                xAxis: { type: 'value', axisLabel: { color: '#9ca3af', fontSize: 10 }, splitLine: { lineStyle: { color: '#374151', type: 'dashed' } } },
                series: [
                    { 
                        name: targetGroup, 
                        type: 'bar', 
                        barWidth: '60%', 
                        data: grouped.matrix.map(row => row[targetGroup] || 0), 
                        itemStyle: { color: '#334155' } 
                    },
                    { 
                        name: actualGroup, 
                        type: 'bar', 
                        barGap: '-80%', 
                        barWidth: '30%', 
                        data: grouped.matrix.map(row => row[actualGroup] || 0), 
                        itemStyle: { color: COLORS[0] } 
                    }
                ]
            };
            break;
        }
        case 'waterfall': {
            let running = 0;
            const wfData = data.map(d => {
                const start = running;
                running += d.value;
                return { ...d, start, end: running };
            });
            const baseSeries = wfData.map(d => ({ value: d.start, itemStyle: { color: 'transparent' } }));
            const valSeries = wfData.map((d, i) => ({ value: Number(d.value) || 0, itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [3, 3, 0, 0] } }));
            option.series = [
                { type: 'bar', stack: 'total', data: baseSeries, tooltip: { show: false } },
                { type: 'bar', stack: 'total', data: valSeries }
            ];

            option.tooltip.formatter = (params: any) => {
                const dataIndex = params[params.length - 1].dataIndex;
                const d = wfData[dataIndex];
                return `<b>${d.name}</b><br/>Value: ${d.value >= 0 ? '+' : ''}${d.value}<br/>Total: ${d.end}`;
            };
            break;
        }
        case 'gauge': {
            const sum = rawData.map(r => Number(r[widget.yAxis])).filter(n => !isNaN(n)).reduce((a, b) => a + b, 0);
            const gaugeMax = sum > 0 ? Math.pow(10, Math.ceil(Math.log10(sum))) : 100;
            option = {
                tooltip: { formatter: '{a} <br/>{b} : {c}' },
                series: [{
                    name: widget.title || 'KPI',
                    type: 'gauge',
                    max: gaugeMax,
                    progress: { show: true, width: 18, itemStyle: { color: '#0ea5e9' } },
                    axisLine: { lineStyle: { width: 18, color: [[1, '#334155']] } },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: { show: false },
                    detail: { valueAnimation: true, fontSize: 30, color: '#f8fafc', formatter: '{value}' },
                    data: [{ value: sum, name: widget.yAxis }]
                }]
            };
            break;
        }
        default:
            return <p className="text-muted-foreground text-center mt-8">Chart type {widget.type} simple-mode not supported in embed view yet</p>;
    }

    return (
        <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
        />
    );
}

export function DashboardViewer({ dashboard, token }: { dashboard: Dashboard, token: string }) {
    const [containerWidth, setContainerWidth] = useState(1200);
    const gridContainerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!gridContainerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            if (entries[0]) {
                setContainerWidth(entries[0].contentRect.width);
            }
        });
        observer.observe(gridContainerRef.current);
        return () => observer.disconnect();
    }, []);

    const gridLayouts = React.useMemo(() => ({
        lg: (dashboard.widgets || []).map((w: any) => ({
            i: w.id,
            x: w.x ?? 0,
            y: w.y ?? Infinity,
            w: w.w ?? (w.width === 'full' ? 12 : w.width === 'half' ? 6 : 4),
            h: w.h ?? (w.type === 'stat' || w.type === 'text' || w.type === 'action' ? 2 : 4)
        }))
    }), [dashboard.widgets]);

    if (!dashboard.widgets || dashboard.widgets.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <p className="text-lg font-medium">No Widgets on this Dashboard</p>
            </div>
        );
    }

    return (
        <div ref={gridContainerRef} className="w-full">
            <AnyResponsiveGridLayout
                className="layout"
                width={containerWidth}
                layouts={gridLayouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={80}
                margin={[24, 24]}
                isDraggable={false}
                isResizable={false}
                useCSSTransforms={true}
            >
                {dashboard.widgets.map((widget) => (
                    <div key={widget.id} className="rounded-xl border shadow-sm overflow-hidden bg-card flex flex-col">
                        <div className="p-3 border-b flex items-center justify-between border-border bg-muted/20 shrink-0">
                            <span className="font-semibold text-foreground text-sm truncate">{widget.title || 'Untitled'}</span>
                        </div>
                        <div className="flex-1 min-h-0 relative">
                            <div className="absolute inset-0 p-4">
                                <WidgetChartRenderer widget={widget} token={token} />
                            </div>
                        </div>
                    </div>
                ))}
            </AnyResponsiveGridLayout>
        </div>
    );
}
