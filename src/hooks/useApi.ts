/**
 * TanStack Query hooks for DataLens API.
 * Covers: datasets, dashboards, reports, stories, KPIs, alerts, cron jobs.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    datasetApi,
    dashboardApi,
    reportApi,
    storyApi,
    kpiApi,
    alertApi,
    cronApi,
    aiApi,
    type DataQueryParams,
    type KPICreate,
    type AlertCreate,
    type CronJobCreate,
} from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Datasets
// ─────────────────────────────────────────────────────────────────────────────
export function useDatasets() {
    return useQuery({
        queryKey: ['datasets'],
        queryFn: () => datasetApi.list().then((r) => r.data.data),
        staleTime: 1000 * 60, // 1 min
    });
}

export function useDataset(id: string) {
    return useQuery({
        queryKey: ['datasets', id],
        queryFn: () => datasetApi.get(id).then((r) => r.data),
        enabled: !!id,
    });
}

export function useDatasetData(id: string, params?: DataQueryParams) {
    return useQuery({
        queryKey: ['datasets', id, 'data', params],
        queryFn: () => datasetApi.data(id, params).then((r) => r.data),
        enabled: !!id,
    });
}

export function useDatasetStats(id: string) {
    return useQuery({
        queryKey: ['datasets', id, 'stats'],
        queryFn: () => datasetApi.stats(id).then((r) => r.data),
        enabled: !!id,
    });
}

export function useUploadDataset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (formData: FormData) => datasetApi.upload(formData).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
    });
}

export function useDeleteDataset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => datasetApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboards
// ─────────────────────────────────────────────────────────────────────────────
export function useDashboards() {
    return useQuery({
        queryKey: ['dashboards'],
        queryFn: () => dashboardApi.list().then((r) => r.data.data),
    });
}

export function useDashboard(id: string) {
    return useQuery({
        queryKey: ['dashboards', id],
        queryFn: () => dashboardApi.get(id).then((r) => r.data),
        enabled: !!id,
    });
}

export function useCreateDashboard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: dashboardApi.create,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
    });
}

export function useDeleteDashboard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => dashboardApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────
export function useReports() {
    return useQuery({
        queryKey: ['reports'],
        queryFn: () => reportApi.list().then((r) => r.data.data),
    });
}

export function useDeleteReport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => reportApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
    });
}

export function useGenerateReport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ datasetId, prompt }: { datasetId: string; prompt?: string }) =>
            reportApi.generate(datasetId, prompt).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Stories
// ─────────────────────────────────────────────────────────────────────────────
export function useStories() {
    return useQuery({
        queryKey: ['stories'],
        queryFn: () => storyApi.list().then((r) => r.data.data),
    });
}

export function useCreateStory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: storyApi.create,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['stories'] }),
    });
}

export function useDeleteStory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => storyApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['stories'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────
export function useKPIs() {
    return useQuery({
        queryKey: ['kpis'],
        queryFn: () => kpiApi.list().then((r) => r.data.data),
    });
}

export function useCreateKPI() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: KPICreate) => kpiApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['kpis'] }),
    });
}

export function useDeleteKPI() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => kpiApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['kpis'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────────────────────────────────────
export function useAlerts() {
    return useQuery({
        queryKey: ['alerts'],
        queryFn: () => alertApi.list().then((r) => r.data.data),
    });
}

export function useCreateAlert() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: AlertCreate) => alertApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    });
}

export function useToggleAlert() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => alertApi.toggle(id).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    });
}

export function useDeleteAlert() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => alertApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Jobs
// ─────────────────────────────────────────────────────────────────────────────
export function useCronJobs() {
    return useQuery({
        queryKey: ['cron-jobs'],
        queryFn: () => cronApi.list().then((r) => r.data.data),
    });
}

export function useCreateCronJob() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: CronJobCreate) => cronApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['cron-jobs'] }),
    });
}

export function useRunCronJob() {
    return useMutation({
        mutationFn: (id: string) => cronApi.run(id),
    });
}

export function useDeleteCronJob() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => cronApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['cron-jobs'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────────────────────────────────────
export function useAskData() {
    return useMutation({
        mutationFn: ({ question, datasetId }: { question: string; datasetId: string }) =>
            aiApi.askData(question, datasetId).then((r) => r.data),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved Charts
// ─────────────────────────────────────────────────────────────────────────────
import { chartApi, pipelineApi, connectionApi, type SavedChartCreate, type PipelineCreate, type ConnectionCreate } from '@/lib/api';

export function useCharts(datasetId?: string) {
    return useQuery({
        queryKey: ['charts', datasetId],
        queryFn: () => chartApi.list(datasetId).then((r) => r.data.data),
        staleTime: 1000 * 60,
    });
}

export function useCreateChart() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: SavedChartCreate) => chartApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['charts'] }),
    });
}

export function useDeleteChart() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => chartApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['charts'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ETL Pipelines
// ─────────────────────────────────────────────────────────────────────────────
export function usePipelines() {
    return useQuery({
        queryKey: ['pipelines'],
        queryFn: () => pipelineApi.list().then((r) => r.data.data),
    });
}

export function useCreatePipeline() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: PipelineCreate) => pipelineApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
    });
}

export function useRunPipeline() {
    return useMutation({
        mutationFn: (id: string) => pipelineApi.run(id).then((r) => r.data),
    });
}

export function useDeletePipeline() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => pipelineApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// DB Connections
// ─────────────────────────────────────────────────────────────────────────────
export function useConnections() {
    return useQuery({
        queryKey: ['connections'],
        queryFn: () => connectionApi.list().then((r) => r.data.data),
    });
}

export function useCreateConnection() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: ConnectionCreate) => connectionApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
    });
}

export function useDeleteConnection() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => connectionApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
    });
}
