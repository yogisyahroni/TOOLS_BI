import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DataSet, ETLPipeline, Report, DataPrivacySettings, AIConfig,
  SavedChart, DashboardConfig, KPI, DataAlert, DataStory,
  DataRelationship, Bookmark, CalculatedField, ReportTemplate
} from '@/types/data';

interface DataStore {
  dataSets: DataSet[];
  pipelines: ETLPipeline[];
  reports: Report[];
  savedCharts: SavedChart[];
  dashboards: DashboardConfig[];
  kpis: KPI[];
  alerts: DataAlert[];
  stories: DataStory[];
  relationships: DataRelationship[];
  bookmarks: Bookmark[];
  calculatedFields: CalculatedField[];
  templates: ReportTemplate[];
  privacySettings: DataPrivacySettings;
  aiConfig: AIConfig | null;

  // Data operations
  addDataSet: (dataSet: DataSet) => void;
  removeDataSet: (id: string) => void;
  getDataSet: (id: string) => DataSet | undefined;

  // Pipeline operations
  addPipeline: (pipeline: ETLPipeline) => void;
  updatePipeline: (id: string, updates: Partial<ETLPipeline>) => void;
  removePipeline: (id: string) => void;

  // Report operations
  addReport: (report: Report) => void;
  removeReport: (id: string) => void;

  // Chart operations
  addSavedChart: (chart: SavedChart) => void;
  removeSavedChart: (id: string) => void;

  // Dashboard operations
  addDashboard: (dashboard: DashboardConfig) => void;
  updateDashboard: (id: string, updates: Partial<DashboardConfig>) => void;
  removeDashboard: (id: string) => void;

  // KPI operations
  addKPI: (kpi: KPI) => void;
  updateKPI: (id: string, updates: Partial<KPI>) => void;
  removeKPI: (id: string) => void;

  // Alert operations
  addAlert: (alert: DataAlert) => void;
  updateAlert: (id: string, updates: Partial<DataAlert>) => void;
  removeAlert: (id: string) => void;

  // Story operations
  addStory: (story: DataStory) => void;
  removeStory: (id: string) => void;

  // Relationship operations
  addRelationship: (rel: DataRelationship) => void;
  removeRelationship: (id: string) => void;

  // Bookmark operations
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: string) => void;

  // Calculated field operations
  addCalculatedField: (field: CalculatedField) => void;
  removeCalculatedField: (id: string) => void;

  // Template operations
  addTemplate: (template: ReportTemplate) => void;
  removeTemplate: (id: string) => void;

  // Settings
  updatePrivacySettings: (settings: Partial<DataPrivacySettings>) => void;
  setAIConfig: (config: AIConfig | null) => void;
}

export const useDataStore = create<DataStore>()(
  persist(
    (set, get) => ({
      dataSets: [],
      pipelines: [],
      reports: [],
      savedCharts: [],
      dashboards: [],
      kpis: [],
      alerts: [],
      stories: [],
      relationships: [],
      bookmarks: [],
      calculatedFields: [],
      templates: [],
      privacySettings: {
        maskSensitiveData: true,
        excludeColumns: [],
        anonymizeData: false,
        dataRetentionDays: 30,
        encryptAtRest: true,
      },
      aiConfig: null,

      addDataSet: (dataSet) => set((s) => ({ dataSets: [...s.dataSets, dataSet] })),
      removeDataSet: (id) => set((s) => ({ dataSets: s.dataSets.filter((d) => d.id !== id) })),
      getDataSet: (id) => get().dataSets.find((d) => d.id === id),

      addPipeline: (pipeline) => set((s) => ({ pipelines: [...s.pipelines, pipeline] })),
      updatePipeline: (id, updates) => set((s) => ({
        pipelines: s.pipelines.map((p) => p.id === id ? { ...p, ...updates } : p),
      })),
      removePipeline: (id) => set((s) => ({ pipelines: s.pipelines.filter((p) => p.id !== id) })),

      addReport: (report) => set((s) => ({ reports: [...s.reports, report] })),
      removeReport: (id) => set((s) => ({ reports: s.reports.filter((r) => r.id !== id) })),

      addSavedChart: (chart) => set((s) => ({ savedCharts: [...s.savedCharts, chart] })),
      removeSavedChart: (id) => set((s) => ({ savedCharts: s.savedCharts.filter((c) => c.id !== id) })),

      addDashboard: (dashboard) => set((s) => ({ dashboards: [...s.dashboards, dashboard] })),
      updateDashboard: (id, updates) => set((s) => ({
        dashboards: s.dashboards.map((d) => d.id === id ? { ...d, ...updates } : d),
      })),
      removeDashboard: (id) => set((s) => ({ dashboards: s.dashboards.filter((d) => d.id !== id) })),

      addKPI: (kpi) => set((s) => ({ kpis: [...s.kpis, kpi] })),
      updateKPI: (id, updates) => set((s) => ({
        kpis: s.kpis.map((k) => k.id === id ? { ...k, ...updates } : k),
      })),
      removeKPI: (id) => set((s) => ({ kpis: s.kpis.filter((k) => k.id !== id) })),

      addAlert: (alert) => set((s) => ({ alerts: [...s.alerts, alert] })),
      updateAlert: (id, updates) => set((s) => ({
        alerts: s.alerts.map((a) => a.id === id ? { ...a, ...updates } : a),
      })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

      addStory: (story) => set((s) => ({ stories: [...s.stories, story] })),
      removeStory: (id) => set((s) => ({ stories: s.stories.filter((st) => st.id !== id) })),

      addRelationship: (rel) => set((s) => ({ relationships: [...s.relationships, rel] })),
      removeRelationship: (id) => set((s) => ({ relationships: s.relationships.filter((r) => r.id !== id) })),

      addBookmark: (bookmark) => set((s) => ({ bookmarks: [...s.bookmarks, bookmark] })),
      removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

      addCalculatedField: (field) => set((s) => ({ calculatedFields: [...s.calculatedFields, field] })),
      removeCalculatedField: (id) => set((s) => ({ calculatedFields: s.calculatedFields.filter((f) => f.id !== id) })),

      addTemplate: (template) => set((s) => ({ templates: [...s.templates, template] })),
      removeTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      updatePrivacySettings: (settings) => set((s) => ({
        privacySettings: { ...s.privacySettings, ...settings },
      })),
      setAIConfig: (config) => set({ aiConfig: config }),
    }),
    { name: 'analytics-data-store' }
  )
);
