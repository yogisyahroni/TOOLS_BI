export interface DataColumn {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  nullable: boolean;
}

export interface DataSet {
  id: string;
  name: string;
  fileName: string;
  columns: DataColumn[];
  data: Record<string, any>[];
  uploadedAt: Date;
  rowCount: number;
  size: number;
}

export interface ETLPipeline {
  id: string;
  name: string;
  steps: ETLStep[];
  sourceDataSetId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  lastRun?: Date;
}

export interface ETLStep {
  id: string;
  type: 'filter' | 'transform' | 'aggregate' | 'join' | 'sort' | 'select';
  config: Record<string, any>;
  order: number;
}

export interface Report {
  id: string;
  title: string;
  content: string;
  story: string;
  decisions: string[];
  recommendations: string[];
  dataSetId: string;
  createdAt: Date;
  chartConfigs?: ChartConfig[];
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter';
  title: string;
  xAxis: string;
  yAxis: string;
  data: any[];
}

export interface DataPrivacySettings {
  maskSensitiveData: boolean;
  excludeColumns: string[];
  anonymizeData: boolean;
  dataRetentionDays: number;
  encryptAtRest: boolean;
}

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'nvidia' | 'moonshot' | 'groq' | 'together' | 'mistral' | 'cohere' | 'deepseek';

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
}

export interface SavedChart {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'radar' | 'funnel' | 'treemap';
  dataSetId: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
}

export type WidgetType = 'bar' | 'line' | 'pie' | 'area' | 'stat' | 'text';

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  dataSetId: string;
  xAxis: string;
  yAxis: string;
  width: 'half' | 'full' | 'third';
}

export interface DashboardConfig {
  id: string;
  name: string;
  widgets: Widget[];
  createdAt: Date;
}

// KPI Scorecard
export interface KPI {
  id: string;
  name: string;
  dataSetId: string;
  column: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'last';
  target?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  createdAt: Date;
}

// Data Alerts
export interface DataAlert {
  id: string;
  name: string;
  dataSetId: string;
  column: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'change_pct';
  threshold: number;
  enabled: boolean;
  triggered: boolean;
  lastChecked?: Date;
  createdAt: Date;
}

// Data Story
export interface DataStory {
  id: string;
  title: string;
  dataSetId: string;
  narrative: string;
  insights: string[];
  charts: { type: string; title: string; xAxis: string; yAxis: string }[];
  createdAt: Date;
}

// Data Relationship
export interface DataRelationship {
  id: string;
  sourceDataSetId: string;
  targetDataSetId: string;
  sourceColumn: string;
  targetColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  createdAt: Date;
}

// Bookmark / Saved View
export interface Bookmark {
  id: string;
  name: string;
  dataSetId: string;
  filters: { column: string; value: string }[];
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  createdAt: Date;
}

// Calculated Field
export interface CalculatedField {
  id: string;
  dataSetId: string;
  name: string;
  formula: string;
  createdAt: Date;
}

// Report Template
export type TemplateSource = 'builtin' | 'powerbi' | 'tableau' | 'metabase' | 'pptx' | 'custom';
export type TemplateCategory = 'executive' | 'operational' | 'client' | 'performance' | 'financial' | 'logistics' | 'sales' | 'custom';

export interface TemplateSection {
  id: string;
  type: 'kpi_cards' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'donut_chart' | 'table' | 'pivot_table' | 'text' | 'filter_panel' | 'stacked_bar' | 'horizontal_bar' | 'trend_line' | 'geo_map';
  title: string;
  width: 'full' | 'half' | 'third' | 'quarter';
  height?: 'sm' | 'md' | 'lg';
  config: Record<string, any>;
}

export interface TemplatePage {
  id: string;
  title: string;
  subtitle?: string;
  sections: TemplateSection[];
  filters?: string[]; // column names usable as filters
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  source: TemplateSource;
  thumbnail?: string;
  pages: TemplatePage[];
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  createdAt: Date;
  isDefault?: boolean;
}
