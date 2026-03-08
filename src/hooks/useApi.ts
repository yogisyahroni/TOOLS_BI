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
    bookmarkApi,
    annotationApi,
    reportTemplateApi,
    relationshipApi,
    parameterApi,
    rlsApi,
    formatRuleApi,
    calcFieldApi,
    drillConfigApi,
    embedApi,
    settingsApi,
    type DataQueryParams,
    type KPICreate,
    type AlertCreate,
    type CronJobCreate,
    type BookmarkCreate,
    type AnnotationCreate,
    type UserReportTemplateCreate,
    type RelationshipCreate,
    type DashboardParameterCreate,
    type RLSRuleCreate,
    type FormatRuleCreate,
    type CalcFieldCreate,
    type Dashboard,
    type Report
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
        queryFn: () => dashboardApi.list().then((r) => r.data.data || []),
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

export function useUpdateDashboard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<Dashboard> }) => dashboardApi.update(id, payload),
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

export function useReport(id: string) {
    return useQuery({
        queryKey: ['report', id],
        queryFn: () => reportApi.get(id).then((r) => r.data),
        enabled: !!id,
    });
}

export function useCreateReport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: Partial<Report>) => reportApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
    });
}

export function useDeleteReport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => reportApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
    });
}

// Settings
export function useAIConfig() {
    return useQuery({
        queryKey: ['ai-config'],
        queryFn: () => settingsApi.getAIConfig().then(r => r.data),
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

export function useUpdateChart() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<SavedChartCreate> }) => chartApi.update(id, payload).then((r) => r.data),
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

export function useUpdatePipeline() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<PipelineCreate> }) =>
            pipelineApi.update(id, payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
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

// ─────────────────────────────────────────────────────────────────────────────
// P1 Hooks — Bookmarks (BUG-H5)
// ─────────────────────────────────────────────────────────────────────────────
export function useBookmarks() {
    return useQuery({
        queryKey: ['bookmarks'],
        queryFn: () => bookmarkApi.list().then((r) => r.data.data),
    });
}

export function useCreateBookmark() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: BookmarkCreate) => bookmarkApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
    });
}

export function useDeleteBookmark() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => bookmarkApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P1 Hooks — Chart Annotations (BUG-H6)
// ─────────────────────────────────────────────────────────────────────────────
export function useAnnotations(datasetId?: string) {
    return useQuery({
        queryKey: ['annotations', datasetId],
        queryFn: () => annotationApi.list(datasetId).then((r) => r.data.data),
    });
}

export function useCreateAnnotation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: AnnotationCreate) => annotationApi.create(payload).then((r) => r.data),
        onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['annotations', vars.datasetId] }),
    });
}

export function useDeleteAnnotation(datasetId?: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => annotationApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['annotations', datasetId] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P1 Hooks — Report Templates (BUG-H4)
// ─────────────────────────────────────────────────────────────────────────────
export function useReportTemplates() {
    return useQuery({
        queryKey: ['report-templates'],
        queryFn: () => reportTemplateApi.list().then((r) => r.data.data),
    });
}

export function useCreateReportTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: UserReportTemplateCreate) => reportTemplateApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
    });
}

export function useDeleteReportTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => reportTemplateApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['report-templates'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P1 Hooks — Dataset Relationships (BUG-H2)
// ─────────────────────────────────────────────────────────────────────────────
export function useRelationships() {
    return useQuery({
        queryKey: ['relationships'],
        queryFn: () => relationshipApi.list().then((r) => r.data.data),
    });
}

export function useCreateRelationship() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: RelationshipCreate) => relationshipApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['relationships'] }),
    });
}

export function useDeleteRelationship() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => relationshipApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['relationships'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 Hooks — Parameters (BUG-M1)
// ─────────────────────────────────────────────────────────────────────────────
export function useParameters(datasetId?: string) {
    return useQuery({
        queryKey: ['parameters', datasetId],
        queryFn: () => parameterApi.list(datasetId).then((r) => (r.data as any).data ?? []),
        staleTime: 1000 * 30,
    });
}

export function useCreateParameter() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: DashboardParameterCreate) => parameterApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['parameters'] }),
    });
}

export function useUpdateParameter() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<DashboardParameterCreate> }) => parameterApi.update(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['parameters'] }),
    });
}

export function useDeleteParameter() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => parameterApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['parameters'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 Hooks — RLS Rules (BUG-M6)
// ─────────────────────────────────────────────────────────────────────────────
export function useRLSRules(datasetId?: string) {
    return useQuery({
        queryKey: ['rls-rules', datasetId],
        queryFn: () => rlsApi.list(datasetId).then((r) => (r.data as any).data ?? []),
        staleTime: 1000 * 30,
    });
}

export function useCreateRLSRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: RLSRuleCreate) => rlsApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['rls-rules'] }),
    });
}

export function useToggleRLSRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => rlsApi.toggle(id, enabled),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['rls-rules'] }),
    });
}

export function useDeleteRLSRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => rlsApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['rls-rules'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 Hooks — Format Rules (BUG-M4)
// ─────────────────────────────────────────────────────────────────────────────
export function useFormatRules(datasetId?: string) {
    return useQuery({
        queryKey: ['format-rules', datasetId],
        queryFn: () => formatRuleApi.list(datasetId).then((r) => (r.data as any).data ?? []),
        staleTime: 1000 * 30,
    });
}

export function useCreateFormatRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: FormatRuleCreate) => formatRuleApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['format-rules'] }),
    });
}

export function useDeleteFormatRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => formatRuleApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['format-rules'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 Hooks — Calculated Fields (BUG-M8)
// ─────────────────────────────────────────────────────────────────────────────
export function useCalcFields(datasetId?: string) {
    return useQuery({
        queryKey: ['calc-fields', datasetId],
        // Backend returns { data: [...] } — must access r.data.data to get the array
        // r.data alone is an object, which causes TypeError: d.filter is not a function
        queryFn: () => calcFieldApi.list(datasetId).then((r) => (r.data as any).data ?? []),
        staleTime: 1000 * 30,
    });
}

export function useCreateCalcField() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: CalcFieldCreate) => calcFieldApi.create(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['calc-fields'] }),
    });
}

export function useDeleteCalcField() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => calcFieldApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['calc-fields'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 Hooks — DrillDown Config (BUG-M2)
// ─────────────────────────────────────────────────────────────────────────────
export function useDrillConfig(datasetId?: string) {
    return useQuery({
        queryKey: ['drill-config', datasetId],
        queryFn: () => drillConfigApi.list(datasetId).then((r) => r.data.data ?? []),
        staleTime: 1000 * 60,
        enabled: !!datasetId,
    });
}

export function useSaveDrillConfig() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: Parameters<typeof drillConfigApi.save>[0]) =>
            drillConfigApi.save(payload).then((r) => r.data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['drill-config', vars.datasetId] });
        },
    });
}

export function useDeleteDrillConfig() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => drillConfigApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['drill-config'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 Hooks — Embed Tokens (BUG-M5)
// ─────────────────────────────────────────────────────────────────────────────
export function useEmbedTokens() {
    return useQuery({
        queryKey: ['embed-tokens'],
        queryFn: () => embedApi.list().then((r) => r.data.data ?? []),
        staleTime: 1000 * 30,
    });
}

export function useGenerateEmbedToken() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: Parameters<typeof embedApi.generate>[0]) =>
            embedApi.generate(payload).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['embed-tokens'] }),
    });
}

export function useRevokeEmbedToken() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => embedApi.revoke(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['embed-tokens'] }),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10 Hooks — Auto-Join Query Engine
// ─────────────────────────────────────────────────────────────────────────────
import { queryApi, AutoJoinPayload, actionApi, connectorApi } from '@/lib/api';
import { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';

export function useAutoJoinQuery() {
    return useMutation({
        mutationFn: (payload: AutoJoinPayload) => queryApi.autoJoin(payload).then((r) => r.data),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Action / Webhook API (Phase 14)
// ─────────────────────────────────────────────────────────────────────────────
import { ActionPayload } from '@/lib/api';

export function useExecuteAction(options?: UseMutationOptions<any, Error, any>) {
    return useMutation({
        mutationFn: (payload: any) => actionApi.execute(payload),
        ...options,
    });
}

// ── CONNECTORS HOOKS (Phase 13) ───────────────────────────────────────────────

export function useConnectorCatalog(options?: UseQueryOptions<any, Error>) {
    return useQuery({
        queryKey: ['connectorCatalog'],
        queryFn: () => connectorApi.getCatalog(),
        ...options,
    });
}

export function useActiveConnectors(options?: UseQueryOptions<any, Error>) {
    return useQuery({
        queryKey: ['activeConnectors'],
        queryFn: () => connectorApi.getActive(),
        ...options,
    });
}

export function useSetupConnector(options?: UseMutationOptions<any, Error, { sourceId: string; credentials: Record<string, any> }>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => connectorApi.setup(payload),
        onSuccess: (...args) => {
            queryClient.invalidateQueries({ queryKey: ['activeConnectors'] });
            if (options?.onSuccess) options.onSuccess(...args);
        },
        ...options,
    });
}

export function useSyncConnector(options?: UseMutationOptions<any, Error, string>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (connectionId: string) => connectorApi.triggerSync(connectionId),
        onSuccess: (...args) => {
            queryClient.invalidateQueries({ queryKey: ['activeConnectors'] });
            if (options?.onSuccess) options.onSuccess(...args);
        },
        ...options,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments API (Phase 15)
// ─────────────────────────────────────────────────────────────────────────────
import { commentApi, CreateCommentPayload } from '@/lib/api';

export function useComments(dashboardId: string | null) {
    return useQuery({
        queryKey: ['comments', dashboardId],
        queryFn: () => dashboardId ? commentApi.getAll(dashboardId).then(res => res.data.data) : Promise.resolve([]),
        enabled: !!dashboardId,
    });
}

export function useCreateComment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateCommentPayload) => commentApi.create(payload).then(r => r.data),
        onSuccess: (_, variables) => qc.invalidateQueries({ queryKey: ['comments', variables.dashboardId] }),
    });
}

export function useDeleteComment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => commentApi.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
    });
}
