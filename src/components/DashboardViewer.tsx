import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import { API_BASE } from '@/lib/api';
import { Loader2, Zap } from 'lucide-react';
import type { DashboardConfig as Dashboard, Widget } from '@/types/data';

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

function WidgetChartRenderer({ widget, token }: { widget: Widget, token: string }) {
    const { data: rawData, isLoading } = useEmbedDatasetData(token, widget.dataSetId || '');

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
            <div className="flex items-center justify-center h-full p-4 overflow-auto">
                <p className="text-muted-foreground text-center text-sm">{widget.title}</p>
            </div>
        );
    }

    if (!rawData || rawData.length === 0) return <p className="text-muted-foreground text-center mt-8 text-sm">No data available</p>;

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
    const categoryNames = data.map(d => String(d.name));
    const seriesData = data.map((d, i) => ({
        value: Number(d.value) || 0,
        name: String(d.name),
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
    if (!dashboard.widgets || dashboard.widgets.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <p className="text-lg font-medium">No Widgets on this Dashboard</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max p-4">
            {dashboard.widgets.map((widget) => (
                <div key={widget.id} className={`rounded-xl border shadow-sm overflow-hidden bg-card ${widget.width === 'full' ? 'md:col-span-2 lg:col-span-3' : widget.width === 'half' ? 'md:col-span-2' : ''}`}>
                    <div className="p-3 border-b flex items-center justify-between border-border bg-muted/20">
                        <span className="font-semibold text-foreground text-sm">{widget.title || 'Untitled'}</span>
                    </div>
                    <div className={`p-4 ${widget.type === 'stat' ? 'h-[160px]' : (widget.type === 'text' || widget.type === 'action') ? 'h-[140px]' : 'h-[250px] md:h-[300px]'}`}>
                        <WidgetChartRenderer widget={widget} token={token} />
                    </div>
                </div>
            ))}
        </div>
    );
}
