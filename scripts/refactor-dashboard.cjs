const fs = require('fs');

const path = 'src/pages/DashboardBuilder.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('import { ChartRenderer }')) {
  content = content.replace(
    "import { HelpTooltip } from '@/components/HelpTooltip';",
    "import { HelpTooltip } from '@/components/HelpTooltip';\nimport { ChartRenderer } from '../components/ChartRenderer';"
  );
}

content = content.replace(/import ReactECharts from 'echarts-for-react';[\s\S]*?from 'recharts';/m, '');

const startString = `  const getStandardChartData = `;
const endStringPattern = /<ReactECharts[\s\S]*?\/>\s*\);\s*};\s*/;

const startIndex = content.indexOf(startString);
const match = content.match(endStringPattern);

if (startIndex !== -1 && match) {
  const endIndex = match.index + match[0].length;
  
  const replacement = `  const renderWidgetChart = (widget: Widget, ds: any, isLoading: boolean) => {
    if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    if (!ds) return <p className="text-muted-foreground text-center mt-8 text-sm">Dataset not found</p>;

    if (widget.type === 'action') {
      const isExecuting = executeActionMut.isPending;
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 overflow-auto space-y-4 bg-muted/10 rounded-lg">
          <Zap className="w-12 h-12 text-primary opacity-80" />
          <p className="text-sm font-medium text-center">{widget.title || "Action Button"}</p>
          <Button
            size="lg"
            className="w-full max-w-[200px] shadow-lg shadow-primary/20"
            disabled={!widget.actionConfig?.url || isExecuting}
            onClick={(e) => {
              e.stopPropagation();
              if (!widget.actionConfig?.url) return toast({ title: 'URL Not Configured', variant: 'destructive' });

              let parsedBody = widget.actionConfig.bodyTemplate || '';
              params.forEach(p => {
                const ref = \`{{\${p.name}}}\`;
                if (parsedBody.includes(ref)) {
                  parsedBody = parsedBody.split(ref).join(p.defaultValue);
                }
              });

              executeActionMut.mutate({
                url: widget.actionConfig.url,
                method: widget.actionConfig.method || 'POST',
                headers: (widget.actionConfig.headers || []).filter(h => h.key && h.value).reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {}),
                body: parsedBody
              }, {
                onSuccess: (data) => {
                  toast({ title: 'Action Executed', description: \`Status: \${data.status}\` });
                },
                onError: (err) => {
                  toast({ title: 'Action Failed', description: err.message, variant: 'destructive' });
                }
              });
            }}
          >
            {isExecuting ? 'Executing...' : 'Trigger Action'}
          </Button>
          {!widget.actionConfig?.url && <p className="text-xs text-destructive">URL not configured.</p>}
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

    const filteredData = processData(widget, ds);
    const filteredDataset = { ...ds, data: filteredData };
    
    const numericColumns = ds.columns?.filter((c: any) => c.type && ['number', 'numeric', 'int', 'integer', 'float', 'decimal', 'double precision'].some(val => c.type.toLowerCase().includes(val))) || [];
    const categoricalColumns = ds.columns?.filter((c: any) => !numericColumns.includes(c)) || [];

    return (
      <div className="w-full h-full relative" onClick={() => {
          // Wrapped with click handler
          handleChartClick(widget, { activePayload: [] });
      }}>
        <ChartRenderer
          chartTitle={widget.title}
          chartType={widget.type}
          xAxis={getWidgetXAxis(widget, widget.dataSetId)}
          yAxis={widget.yAxis}
          groupBy={widget.groupBy}
          dataLimit={String(widget.limit || 50)}
          dataset={filteredDataset}
          numericColumns={numericColumns}
          categoricalColumns={categoricalColumns}
          sortOrder={widget.sortOrder || 'none'}
        />
      </div>
    );
  };
`;
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync(path, content, 'utf8');
  console.log('DashboardBuilder.tsx refactored successfully.');
} else {
  console.error('Pattern not found. startIndex:', startIndex, 'match:', !!match);
}
