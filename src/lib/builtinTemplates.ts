import type { ReportTemplate } from '@/types/data';

function id() { return Math.random().toString(36).substring(2, 10); }

export const builtinTemplates: ReportTemplate[] = [
  {
    id: 'tpl-performance-summary',
    name: 'Performance Summary Dashboard',
    description: 'Executive KPI overview with trend analysis, performance by region/PIC, SLA aging table. Inspired by Power BI OTS dashboards.',
    category: 'performance',
    source: 'builtin',
    pages: [
      {
        id: id(), title: 'Summary Performance', subtitle: 'Overall KPI & Trend',
        filters: ['PERIODE', 'REGIONAL', 'ORIGIN', 'ZONA', 'CUSTOMER NAME', 'STATUS'],
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Key Metrics', width: 'full', config: { cards: [{ label: 'Total', aggregation: 'count', color: 'primary' }, { label: 'Solved', aggregation: 'count', filter: 'status=solved', color: 'success' }, { label: 'Open', aggregation: 'count', filter: 'status=open', color: 'destructive' }] } },
          { id: id(), type: 'bar_chart', title: 'Performance by Period', width: 'half', height: 'md', config: { xAxis: 'period', yAxis: 'percentage', showValues: true, color: 'primary' } },
          { id: id(), type: 'trend_line', title: 'Trend Total', width: 'half', height: 'md', config: { xAxis: 'period', yAxis: 'count', showMarkers: true } },
          { id: id(), type: 'horizontal_bar', title: 'Top 10 by Origin', width: 'quarter', height: 'lg', config: { xAxis: 'count', yAxis: 'origin', limit: 10, sort: 'desc' } },
          { id: id(), type: 'horizontal_bar', title: 'Top 10 by Feedback Origin', width: 'quarter', height: 'lg', config: { xAxis: 'count', yAxis: 'origin', filter: 'sla_h0_h1', limit: 10 } },
          { id: id(), type: 'horizontal_bar', title: 'Top 10 by Customer', width: 'quarter', height: 'lg', config: { xAxis: 'count', yAxis: 'customer', limit: 10, sort: 'desc' } },
          { id: id(), type: 'horizontal_bar', title: 'Top 10 by Region', width: 'quarter', height: 'lg', config: { xAxis: 'count', yAxis: 'regional', limit: 10, sort: 'desc' } },
          { id: id(), type: 'pivot_table', title: 'SLA Aging Status', width: 'full', height: 'lg', config: { rows: ['status'], columns: ['H+0', 'H+1', 'H+2', 'H+3', 'Lebih H+3', 'ONGOING'], values: ['connote', 'percentage'], showTotals: true } },
        ],
      },
      {
        id: id(), title: 'Performance by Regional', subtitle: 'Regional breakdown',
        filters: ['PERIODE', 'REGIONAL', 'ORIGIN', 'ZONA'],
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Key Metrics', width: 'full', config: { cards: [{ label: 'Total', aggregation: 'count' }, { label: 'Solved', aggregation: 'count', filter: 'solved' }, { label: 'Open', aggregation: 'count', filter: 'open' }] } },
          { id: id(), type: 'bar_chart', title: 'Performance by Regional', width: 'half', height: 'md', config: { xAxis: 'regional', yAxis: 'percentage', showValues: true } },
          { id: id(), type: 'donut_chart', title: 'Status Distribution', width: 'half', height: 'md', config: { groupBy: 'status', showPercentage: true } },
          { id: id(), type: 'pivot_table', title: 'SLA Aging by Month', width: 'full', height: 'lg', config: { rows: ['month'], columns: ['H+0', 'H+1', 'H+2', 'H+3', 'Lebih H+3', 'ONGOING'], values: ['connote', 'percentage'] } },
          { id: id(), type: 'pivot_table', title: 'SLA Aging by Regional', width: 'full', height: 'lg', config: { rows: ['regional'], columns: ['H+0', 'H+1', 'H+2', 'H+3', 'Lebih H+3', 'ONGOING'], values: ['connote', 'percentage'] } },
        ],
      },
      {
        id: id(), title: 'Performance by PIC', subtitle: 'Individual PIC performance',
        filters: ['PERIODE', 'REGIONAL', 'ORIGIN', 'ZONA', 'CUSTOMER NAME', 'STATUS'],
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Key Metrics', width: 'full', config: { cards: [{ label: 'Total', aggregation: 'count' }, { label: 'Solved', aggregation: 'count' }, { label: 'Open', aggregation: 'count' }] } },
          { id: id(), type: 'bar_chart', title: 'Performance per PIC', width: 'half', height: 'md', config: { xAxis: 'pic', yAxis: 'percentage', showValues: true } },
          { id: id(), type: 'donut_chart', title: 'Status Overview', width: 'half', height: 'md', config: { groupBy: 'status' } },
          { id: id(), type: 'pivot_table', title: 'SLA Aging by PIC', width: 'full', height: 'lg', config: { rows: ['pic'], columns: ['H+0', 'H+1', 'H+2', 'H+3', 'Lebih H+3', 'ONGOING'], values: ['connote', 'percentage'] } },
          { id: id(), type: 'table', title: 'Status by PIC', width: 'full', height: 'md', config: { columns: ['PIC', 'ONGOING', 'SOLVED', 'Total'], showPercentage: true } },
        ],
      },
    ],
    colorScheme: { primary: '#1e3a5f', secondary: '#f0c929', accent: '#4a90d9', background: '#ffffff' },
    createdAt: new Date(),
    isDefault: true,
  },
  {
    id: 'tpl-logistics-pickup',
    name: 'Logistics Pickup Order',
    description: 'Pickup order tracking with load distribution, SLA lead time, regional/type breakdown, and cancel order analysis. Inspired by JNE Express dashboards.',
    category: 'logistics',
    source: 'builtin',
    pages: [
      {
        id: id(), title: 'Load Pickup Order', subtitle: 'Order distribution overview',
        filters: ['PERIODE'],
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Key Stats', width: 'full', config: { cards: [{ label: 'Total Cnote', aggregation: 'count', icon: 'package' }, { label: 'Titik Pickup Seller', aggregation: 'distinct', column: 'pickup_point' }, { label: 'Total Seller', aggregation: 'distinct', column: 'seller' }] } },
          { id: id(), type: 'bar_chart', title: 'Load by Regional', width: 'full', height: 'md', config: { xAxis: 'regional', yAxis: 'percentage', showValues: true, sort: 'desc' } },
          { id: id(), type: 'bar_chart', title: 'Load by Service Type', width: 'full', height: 'md', config: { xAxis: 'service_type', yAxis: 'percentage', showValues: true } },
        ],
      },
      {
        id: id(), title: 'Performance Pickup by Type', subtitle: 'SLA first attempt & lead time by customer',
        filters: ['PERIODE'],
        sections: [
          { id: id(), type: 'stacked_bar', title: 'Status Pickup First Attempt', width: 'full', height: 'md', config: { xAxis: 'status_code', yAxis: 'percentage', stackBy: 'attempt' } },
          { id: id(), type: 'pivot_table', title: '1st Attempt by Customer', width: 'full', height: 'md', config: { rows: ['customer_name'], columns: ['01.S01', '02.F01', '03.F02', '04.F03', '05.F04', '06.F05'], values: ['cnote', 'percentage'] } },
          { id: id(), type: 'bar_chart', title: 'Lead Time Pickup (SLA)', width: 'half', height: 'md', config: { xAxis: 'lead_time', yAxis: 'percentage' } },
          { id: id(), type: 'pie_chart', title: 'Status Pickup Final', width: 'half', height: 'md', config: { groupBy: 'final_status' } },
        ],
      },
      {
        id: id(), title: 'Performance Pickup by Regional', subtitle: 'Regional breakdown with SLA',
        filters: ['PERIODE'],
        sections: [
          { id: id(), type: 'stacked_bar', title: 'Status Pickup First Attempt', width: 'full', height: 'md', config: { xAxis: 'status_code', yAxis: 'percentage' } },
          { id: id(), type: 'pivot_table', title: '1st Attempt by Regional', width: 'full', height: 'md', config: { rows: ['regional'], columns: ['01.S01', '02.F01', '03.F02', '04.F03', '05.F04', '06.F05'], values: ['cnote', 'percentage'] } },
          { id: id(), type: 'bar_chart', title: 'Lead Time Pickup (SLA)', width: 'half', height: 'md', config: { xAxis: 'lead_time_days', yAxis: 'percentage' } },
          { id: id(), type: 'pie_chart', title: 'Status Pickup Final', width: 'half', height: 'md', config: { groupBy: 'final_status' } },
          { id: id(), type: 'pivot_table', title: 'Lead Time by Regional', width: 'half', height: 'md', config: { rows: ['regional'], columns: ['0', '1', '2', 'LEBIH H+2'], values: ['cnote', 'percentage'] } },
          { id: id(), type: 'pivot_table', title: 'Final Status by Regional', width: 'half', height: 'md', config: { rows: ['regional'], columns: ['CANCEL ORDER', 'SUCCESS'], values: ['cnote', 'percentage'] } },
        ],
      },
      {
        id: id(), title: 'Top Shipment Not Ready & Cancel', subtitle: 'Top problematic sellers and cities',
        filters: ['PERIODE'],
        sections: [
          { id: id(), type: 'pivot_table', title: 'Result by Seller', width: 'half', height: 'md', config: { rows: ['seller_name'], columns: ['CANCEL ORDER', 'SHIPMENT NOT READY', 'Total'], values: ['qty', 'percentage'] } },
          { id: id(), type: 'horizontal_bar', title: 'Top 10 Seller Cancel & Not Ready', width: 'half', height: 'md', config: { xAxis: 'percentage', yAxis: 'seller', limit: 10 } },
          { id: id(), type: 'pivot_table', title: 'Result by City', width: 'half', height: 'md', config: { rows: ['city'], columns: ['CANCEL ORDER', 'SHIPMENT NOT READY'], values: ['qty', 'percentage'] } },
          { id: id(), type: 'horizontal_bar', title: 'Top 10 City Cancel & Not Ready', width: 'half', height: 'md', config: { xAxis: 'percentage', yAxis: 'city', limit: 10 } },
        ],
      },
    ],
    colorScheme: { primary: '#d32027', secondary: '#003366', accent: '#0066cc', background: '#ffffff' },
    createdAt: new Date(),
    isDefault: true,
  },
  {
    id: 'tpl-executive-summary',
    name: 'Executive Summary Report',
    description: 'High-level executive report with KPIs, trend analysis, key decisions, and strategic recommendations. Suitable for board presentations.',
    category: 'executive',
    source: 'builtin',
    pages: [
      {
        id: id(), title: 'Executive Overview',
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Key Performance Indicators', width: 'full', config: { cards: [{ label: 'Revenue', aggregation: 'sum', format: 'currency' }, { label: 'Growth', aggregation: 'pct_change', format: 'percent' }, { label: 'Customers', aggregation: 'distinct', format: 'number' }, { label: 'Satisfaction', aggregation: 'avg', format: 'percent' }] } },
          { id: id(), type: 'line_chart', title: 'Revenue Trend', width: 'half', height: 'md', config: { xAxis: 'period', yAxis: 'revenue' } },
          { id: id(), type: 'bar_chart', title: 'Performance by Department', width: 'half', height: 'md', config: { xAxis: 'department', yAxis: 'performance' } },
          { id: id(), type: 'text', title: 'AI Insights & Recommendations', width: 'full', config: { content: 'ai_generated', sections: ['key_findings', 'decisions', 'recommendations'] } },
        ],
      },
    ],
    colorScheme: { primary: '#1a1a2e', secondary: '#16213e', accent: '#0f3460', background: '#f8f9fa' },
    createdAt: new Date(),
    isDefault: true,
  },
  {
    id: 'tpl-sales-analysis',
    name: 'Sales Analysis Dashboard',
    description: 'Comprehensive sales report with revenue breakdown, top products, regional analysis, and sales funnel visualization.',
    category: 'sales',
    source: 'builtin',
    pages: [
      {
        id: id(), title: 'Sales Overview',
        filters: ['PERIOD', 'REGION', 'PRODUCT CATEGORY'],
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Sales KPIs', width: 'full', config: { cards: [{ label: 'Total Revenue', aggregation: 'sum' }, { label: 'Orders', aggregation: 'count' }, { label: 'Avg Order Value', aggregation: 'avg' }, { label: 'Conversion Rate', aggregation: 'ratio' }] } },
          { id: id(), type: 'line_chart', title: 'Revenue Trend', width: 'half', height: 'md', config: { xAxis: 'month', yAxis: 'revenue', showArea: true } },
          { id: id(), type: 'pie_chart', title: 'Revenue by Category', width: 'half', height: 'md', config: { groupBy: 'category' } },
          { id: id(), type: 'horizontal_bar', title: 'Top 10 Products', width: 'half', height: 'lg', config: { xAxis: 'revenue', yAxis: 'product', limit: 10 } },
          { id: id(), type: 'bar_chart', title: 'Sales by Region', width: 'half', height: 'lg', config: { xAxis: 'region', yAxis: 'revenue' } },
          { id: id(), type: 'table', title: 'Sales Detail', width: 'full', height: 'lg', config: { columns: ['Product', 'Region', 'Qty', 'Revenue', 'Margin'] } },
        ],
      },
    ],
    colorScheme: { primary: '#2d6a4f', secondary: '#40916c', accent: '#52b788', background: '#ffffff' },
    createdAt: new Date(),
    isDefault: true,
  },
  {
    id: 'tpl-operational-report',
    name: 'Operational Report',
    description: 'Day-to-day operational monitoring with SLA tracking, queue management, and process efficiency metrics.',
    category: 'operational',
    source: 'builtin',
    pages: [
      {
        id: id(), title: 'Operations Dashboard',
        filters: ['DATE', 'DEPARTMENT', 'STATUS'],
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Operational KPIs', width: 'full', config: { cards: [{ label: 'Total Tasks', aggregation: 'count' }, { label: 'Completed', aggregation: 'count', filter: 'completed' }, { label: 'SLA Met %', aggregation: 'ratio' }, { label: 'Avg Resolution Time', aggregation: 'avg', format: 'duration' }] } },
          { id: id(), type: 'stacked_bar', title: 'Tasks by Status & Department', width: 'full', height: 'md', config: { xAxis: 'department', yAxis: 'count', stackBy: 'status' } },
          { id: id(), type: 'line_chart', title: 'Daily Throughput', width: 'half', height: 'md', config: { xAxis: 'date', yAxis: 'count' } },
          { id: id(), type: 'donut_chart', title: 'Priority Distribution', width: 'half', height: 'md', config: { groupBy: 'priority' } },
          { id: id(), type: 'table', title: 'Pending Items', width: 'full', height: 'lg', config: { columns: ['ID', 'Task', 'Priority', 'Assignee', 'SLA', 'Status'], filter: 'status!=completed' } },
        ],
      },
    ],
    colorScheme: { primary: '#e76f51', secondary: '#f4a261', accent: '#2a9d8f', background: '#ffffff' },
    createdAt: new Date(),
    isDefault: true,
  },
  {
    id: 'tpl-financial-report',
    name: 'Financial Report',
    description: 'Financial overview with P&L summary, cash flow trends, expense breakdown, and budget vs actual comparison.',
    category: 'financial',
    source: 'builtin',
    pages: [
      {
        id: id(), title: 'Financial Overview',
        filters: ['PERIOD', 'DEPARTMENT', 'ACCOUNT'],
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Financial KPIs', width: 'full', config: { cards: [{ label: 'Revenue', format: 'currency' }, { label: 'Expenses', format: 'currency' }, { label: 'Net Income', format: 'currency' }, { label: 'Margin', format: 'percent' }] } },
          { id: id(), type: 'line_chart', title: 'Revenue vs Expenses Trend', width: 'half', height: 'md', config: { xAxis: 'month', yAxis: ['revenue', 'expenses'], multiLine: true } },
          { id: id(), type: 'bar_chart', title: 'Budget vs Actual', width: 'half', height: 'md', config: { xAxis: 'department', yAxis: ['budget', 'actual'], grouped: true } },
          { id: id(), type: 'pie_chart', title: 'Expense Breakdown', width: 'half', height: 'md', config: { groupBy: 'category' } },
          { id: id(), type: 'table', title: 'P&L Statement', width: 'half', height: 'md', config: { columns: ['Account', 'Budget', 'Actual', 'Variance', 'Variance %'], showTotals: true } },
        ],
      },
    ],
    colorScheme: { primary: '#003f5c', secondary: '#58508d', accent: '#bc5090', background: '#ffffff' },
    createdAt: new Date(),
    isDefault: true,
  },
  {
    id: 'tpl-client-presentation',
    name: 'Client Presentation Report',
    description: 'Clean, professional multi-page report designed for client-facing presentations. Includes cover page, analysis sections, and recommendations.',
    category: 'client',
    source: 'builtin',
    pages: [
      {
        id: id(), title: 'Project Overview', subtitle: 'Client Delivery Report',
        sections: [
          { id: id(), type: 'text', title: 'Cover Page', width: 'full', height: 'lg', config: { content: 'cover', fields: ['project_name', 'client_name', 'date', 'prepared_by'] } },
        ],
      },
      {
        id: id(), title: 'Analysis & Results',
        sections: [
          { id: id(), type: 'kpi_cards', title: 'Project Metrics', width: 'full', config: { cards: [{ label: 'Delivered' }, { label: 'On-Time %' }, { label: 'Quality Score' }, { label: 'Satisfaction' }] } },
          { id: id(), type: 'bar_chart', title: 'Milestone Performance', width: 'half', height: 'md', config: {} },
          { id: id(), type: 'line_chart', title: 'Progress Over Time', width: 'half', height: 'md', config: {} },
          { id: id(), type: 'text', title: 'Key Findings', width: 'full', config: { content: 'ai_generated', sections: ['findings', 'analysis'] } },
        ],
      },
      {
        id: id(), title: 'Recommendations & Next Steps',
        sections: [
          { id: id(), type: 'text', title: 'Strategic Recommendations', width: 'full', height: 'lg', config: { content: 'ai_generated', sections: ['recommendations', 'next_steps', 'timeline'] } },
        ],
      },
    ],
    colorScheme: { primary: '#2c3e50', secondary: '#3498db', accent: '#e74c3c', background: '#ffffff' },
    createdAt: new Date(),
    isDefault: true,
  },
];
