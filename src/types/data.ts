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
  upsertKey?: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  error?: string;
  lastRun?: Date;
}

export interface ETLStep {
  id: string;
  type: 'filter' | 'transform' | 'aggregate' | 'join' | 'sort' | 'select' | 'deduplicate' | 'parse_date' | 'json_extract' | 'cast' | 'data_cleansing';
  config: Record<string, any>;
  order: number;
}

export interface Report {
  id: string;
  userId: string;
  datasetId?: string;
  title: string;
  content: string;
  story: string;
  decisions: string[];
  recommendations: string[];
  chartConfigs: ChartConfig[];
  createdAt: string | Date;
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
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'radar' | 'funnel' | 'treemap' | 'gauge' | 'sunburst' | 'sankey' | 'combo' | 'pivot_table' | 'bullet';
  dataSetId: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
}

export type WidgetType = 'bar' | 'line' | 'pie' | 'area' | 'stat' | 'text' | 'action' | 'scatter' | 'radar' | 'funnel' | 'treemap' | 'waterfall' | 'heatmap' | 'boxplot' | 'horizontal_bar' | 'gauge' | 'sunburst' | 'sankey' | 'combo' | 'pivot_table' | 'bullet';

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  dataSetId: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string; // Menambahkan groupBy opsional (banyak digunakan di Heatmap dsb)
  limit?: number; // Menambahkan batasan data opsional
  sortOrder?: 'asc' | 'desc' | 'none'; // Menambahkan opsi sorting opsional
  width: 'half' | 'full' | 'third'; // Legacy fallback
  htmlContent?: string; // Menyimpan raw HTML untuk RTF Tiptap

  // React Grid Layout properties
  x?: number;
  y?: number;
  w?: number;
  h?: number;

  // Phase 14: Action Widgets
  actionConfig?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: { key: string; value: string }[];
    bodyTemplate?: string;
  };

  // AI Persistence
  chartId?: string; // Reference to SavedChart ID
  config?: Record<string, any>; // Arbitrary metadata (AI flags, original query, etc.)
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

/**
 * SlideWidget — unit chart atau konten dalam satu slide AI Story.
 * Digunakan oleh AI Story Generator untuk menyimpan chart per-section template.
 */
export interface SlideWidget {
  id: string;
  type: WidgetType;
  title: string;
  chartId?: string;      // Reference ke SavedChart yang sudah disimpan di Chart Builder
  datasetId?: string;    // Dataset sumber data
  xAxis?: string;        // Kolom X / Category
  yAxis?: string;        // Kolom Y / Value
  groupBy?: string;      // Kolom grouping
  limit?: number;        // Batasan jumlah data
  sortOrder?: 'asc' | 'desc' | 'none';
  insight?: string;      // Narasi AI untuk widget ini
  width: 'full' | 'half' | 'third' | 'quarter'; // Lebar kolom dalam grid slide
  height?: 'sm' | 'md' | 'lg';
  htmlContent?: string;  // Untuk type 'text' atau 'kpi_cards'
  fallbackText?: string; // Fallback jika AI tidak bisa buat chart
}

export interface StorySlide {
  id: string;
  title: string;
  subtitle?: string;
  widgets: Widget[];
  slideWidgets?: SlideWidget[]; // AI Story Generator widgets (charts + narasi)
  layout?: any[]; // Menyimpan konfigurasi layout grid untuk react-grid-layout
}

export interface DataStory {
  id: string;
  userId: string;
  datasetId?: string;
  title: string;
  content: string; // Legacy text content — JSON.stringify(Slide[]) atau plain markdown
  slides?: StorySlide[]; // Structured slides for Layout-Aware reports
  insights: string[];
  charts: any[]; // Legacy charts
  createdAt: string | Date;
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
