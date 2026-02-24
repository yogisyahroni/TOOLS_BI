import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DataSet, ETLPipeline, Report, DataPrivacySettings, AIConfig, SavedChart, DashboardConfig } from '@/types/data';

interface DataStore {
  dataSets: DataSet[];
  pipelines: ETLPipeline[];
  reports: Report[];
  savedCharts: SavedChart[];
  dashboards: DashboardConfig[];
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
      privacySettings: {
        maskSensitiveData: true,
        excludeColumns: [],
        anonymizeData: false,
        dataRetentionDays: 30,
        encryptAtRest: true,
      },
      aiConfig: null,

      addDataSet: (dataSet) =>
        set((state) => ({ dataSets: [...state.dataSets, dataSet] })),
      
      removeDataSet: (id) =>
        set((state) => ({ dataSets: state.dataSets.filter((ds) => ds.id !== id) })),
      
      getDataSet: (id) => get().dataSets.find((ds) => ds.id === id),

      addPipeline: (pipeline) =>
        set((state) => ({ pipelines: [...state.pipelines, pipeline] })),
      
      updatePipeline: (id, updates) =>
        set((state) => ({
          pipelines: state.pipelines.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
      
      removePipeline: (id) =>
        set((state) => ({ pipelines: state.pipelines.filter((p) => p.id !== id) })),

      addReport: (report) =>
        set((state) => ({ reports: [...state.reports, report] })),
      
      removeReport: (id) =>
        set((state) => ({ reports: state.reports.filter((r) => r.id !== id) })),

      addSavedChart: (chart) =>
        set((state) => ({ savedCharts: [...state.savedCharts, chart] })),
      
      removeSavedChart: (id) =>
        set((state) => ({ savedCharts: state.savedCharts.filter((c) => c.id !== id) })),

      addDashboard: (dashboard) =>
        set((state) => ({ dashboards: [...state.dashboards, dashboard] })),
      
      updateDashboard: (id, updates) =>
        set((state) => ({
          dashboards: state.dashboards.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        })),
      
      removeDashboard: (id) =>
        set((state) => ({ dashboards: state.dashboards.filter((d) => d.id !== id) })),

      updatePrivacySettings: (settings) =>
        set((state) => ({
          privacySettings: { ...state.privacySettings, ...settings },
        })),
      
      setAIConfig: (config) => set({ aiConfig: config }),
    }),
    {
      name: 'analytics-data-store',
    }
  )
);
