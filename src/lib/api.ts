/**
 * DataLens API Client
 * Axios instance with:
 * - JWT Bearer token injected from memory (NOT localStorage — XSS-safe)
 * - 401 → silent refresh via httpOnly cookie → retry
 * - withCredentials: true so browser sends refresh_token cookie automatically
 * - Consistent error shape
 *
 * BUG-07 fix: Refresh token is now stored in an httpOnly cookie set by the backend.
 * The frontend never reads or writes the refresh token — it's invisible to JS.
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { Report } from '@/types/data';
export type { Report };

const rawApiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://datalens-backend-8eph.onrender.com/api/v1';
export const API_BASE = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase;

export function getWsUrl() {
    try {
        const url = new URL(API_BASE);
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${url.host}/ws`;
    } catch {
        return import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    }
}

// ---------------------------------------------------------------------------
// Access token: kept in memory only (never in localStorage — XSS-safe).
// On page reload the user re-authenticates OR the silent refresh endpoint
// is hit first with the httpOnly cookie. See useAuth hook for bootstrap logic.
// ---------------------------------------------------------------------------
let accessToken: string | null = null;
let refreshToken: string | null = null;

export function getAccessToken() {
    return accessToken;
}

export function setAccessToken(token: string) {
    accessToken = token;
}

export function getRefreshToken() {
    return refreshToken;
}

export function setRefreshToken(token: string | null) {
    refreshToken = token;
    // BUG-07: Refresh token is stored in httpOnly cookie.
    // For local dev/debugging we keep it in memory if needed, but NOT in localStorage.
}

export function clearTokens() {
    accessToken = null;
    refreshToken = null;
    // Also clear old zustand state to prevent conflicts for existing users
    localStorage.removeItem('datalens-auth');
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
export const api = axios.create({
    baseURL: API_BASE,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
    // BUG-07: Must be true for browser to send httpOnly refresh_token cookie
    withCredentials: true,
});

// REQUEST: Inject Authorization header from in-memory access token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});

// RESPONSE: Handle 401 → silent refresh via httpOnly cookie → retry once
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
    failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
    failedQueue = [];
}

api.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
        const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status !== 401 || original._retry) {
            return Promise.reject(error);
        }

        // BUG-07: Don't read refresh token from localStorage.
        // The browser will send the httpOnly cookie automatically with withCredentials: true.

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((token) => {
                original.headers.Authorization = `Bearer ${token}`;
                return api(original);
            });
        }

        original._retry = true;
        isRefreshing = true;

        try {
            // BUG-07 Fix: We no longer send refreshToken in the body.
            // The browser sends it automatically in the 'refresh_token' httpOnly cookie
            // because of 'withCredentials: true'.
            const { data } = await axios.post(`${API_BASE}/auth/refresh`, {}, {
                withCredentials: true,
            });
            setAccessToken(data.accessToken);
            // No need to setRefreshToken manually; backend will set it via cookie if rotated.
            processQueue(null, data.accessToken);
            original.headers.Authorization = `Bearer ${data.accessToken}`;
            return api(original);
        } catch (err) {
            processQueue(err, null);
            clearTokens();
            // Prevent infinite reload loops if loadMe fails while already on public auth pages
            // Also bypass redirect for public embed views
            const currentPath = window.location.pathname;
            if (currentPath !== '/login' && currentPath !== '/register' && !currentPath.startsWith('/embed/view/')) {
                window.location.href = '/login';
            }
            return Promise.reject(err);
        } finally {
            isRefreshing = false;
        }
    }
);

// ---------------------------------------------------------------------------
// Typed API methods
// ---------------------------------------------------------------------------

// Auth
export const authApi = {
    register: (payload: { email: string; password: string; displayName: string }) =>
        api.post('/auth/register', payload),
    login: (email: string, password: string) =>
        api.post<{ accessToken: string; refreshToken: string; user: UserProfile }>(
            '/auth/login',
            { email, password }
        ),
    // BUG-07: logout clears httpOnly cookie via backend (no token needed in body)
    logout: () => api.post('/auth/logout'),
    me: () => api.get<UserProfile>('/auth/me'),
    forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
    resetPassword: (token: string, password: string) =>
        api.put('/auth/reset-password', { token, password }),
};

// Datasets
export const datasetApi = {
    list: () => api.get<{ data: DatasetItem[] }>('/datasets'),
    upload: (formData: FormData) =>
        api.post<DatasetItem>('/datasets/upload', formData),
    get: (id: string) => api.get<DatasetItem>(`/datasets/${id}`),
    data: (id: string, params?: DataQueryParams) =>
        api.get<DataQueryResult>(`/datasets/${id}/data`, { params }),
    stats: (id: string) => api.get<DatasetStats>(`/datasets/${id}/stats`),
    delete: (id: string) => api.delete(`/datasets/${id}`),
    updateRefreshConfig: (id: string, config: RefreshConfig) =>
        api.put(`/datasets/${id}/refresh-config`, config),
};

// Dashboards
export const dashboardApi = {
    list: () => api.get<{ data: Dashboard[] }>('/dashboards'),
    create: (payload: Partial<Dashboard>) => api.post<Dashboard>('/dashboards', payload),
    get: (id: string) => api.get<Dashboard>(`/dashboards/${id}`),
    update: (id: string, payload: Partial<Dashboard>) =>
        api.put<Dashboard>(`/dashboards/${id}`, payload),
    delete: (id: string) => api.delete(`/dashboards/${id}`),
    generateEmbed: (id: string) =>
        api.post<{ embedToken: string; embedUrl: string }>(`/dashboards/${id}/embed`),
};

// Reports
export const reportApi = {
    list: () => api.get<{ data: Report[] }>('/reports'),
    create: (payload: Partial<Report>) => api.post<Report>('/reports', payload),
    get: (id: string) => api.get<Report>(`/reports/${id}`),
    generate: (datasetId: string, prompt?: string) =>
        api.post<{ title: string; content: string }>('/reports/generate', { datasetId, prompt }),
    delete: (id: string) => api.delete(`/reports/${id}`),
};

// Settings
export const settingsApi = {
    getAIConfig: () => api.get<any>('/settings/ai-config'),
};

// Data Stories
export const storyApi = {
    list: () => api.get<{ data: DataStory[] }>('/stories'),
    create: (payload: { title: string; content: string; datasetId?: string }) =>
        api.post<DataStory>('/stories/manual', payload),
    get: (id: string) => api.get<DataStory>(`/stories/${id}`),
    delete: (id: string) => api.delete(`/stories/${id}`),
};

// KPIs
export const kpiApi = {
    list: () => api.get<{ data: KPI[] }>('/kpis'),
    create: (payload: KPICreate) => api.post<KPI>('/kpis', payload),
    update: (id: string, payload: Partial<KPICreate>) => api.put<KPI>(`/kpis/${id}`, payload),
    delete: (id: string) => api.delete(`/kpis/${id}`),
};

// Alerts
export const alertApi = {
    list: () => api.get<{ data: DataAlert[] }>('/alerts'),
    create: (payload: AlertCreate) => api.post<DataAlert>('/alerts', payload),
    update: (id: string, payload: Partial<AlertCreate>) =>
        api.put<DataAlert>(`/alerts/${id}`, payload),
    delete: (id: string) => api.delete(`/alerts/${id}`),
    toggle: (id: string) => api.post<{ enabled: boolean }>(`/alerts/${id}/toggle`),
};

// Cron Jobs
export const cronApi = {
    list: () => api.get<{ data: CronJob[] }>('/cron-jobs'),
    create: (payload: CronJobCreate) => api.post<CronJob>('/cron-jobs', payload),
    get: (id: string) => api.get<CronJob>(`/cron-jobs/${id}`),
    update: (id: string, payload: Partial<CronJobCreate>) =>
        api.put<CronJob>(`/cron-jobs/${id}`, payload),
    delete: (id: string) => api.delete(`/cron-jobs/${id}`),
    run: (id: string) => api.post(`/cron-jobs/${id}/run`),
    history: (id: string) => api.get(`/cron-jobs/${id}/history`),
};

// AI
export const aiApi = {
    askData: (question: string, datasetId: string) =>
        api.post<AskDataResult>('/ask-data', { question, datasetId }),
    generateReport: (datasetId: string, prompt?: string) =>
        api.post<{ title: string; content: string }>('/reports/generate', { datasetId, prompt }),
};

// Charts
export const chartApi = {
    list: (datasetId?: string) =>
        api.get<{ data: SavedChart[] }>('/charts', { params: datasetId ? { datasetId } : undefined }),
    create: (payload: SavedChartCreate) => api.post<SavedChart>('/charts', payload),
    get: (id: string) => api.get<SavedChart>(`/charts/${id}`),
    update: (id: string, payload: Partial<SavedChartCreate>) => api.patch<SavedChart>(`/charts/${id}`, payload),
    delete: (id: string) => api.delete(`/charts/${id}`),
    duplicate: (id: string) => api.post<SavedChart>(`/charts/${id}/duplicate`),
};

// ETL Pipelines
export const pipelineApi = {
    list: () => api.get<{ data: ETLPipeline[] }>('/pipelines'),
    create: (payload: PipelineCreate) => api.post<ETLPipeline>('/pipelines', payload),
    get: (id: string) => api.get<ETLPipeline>(`/pipelines/${id}`),
    update: (id: string, payload: Partial<PipelineCreate>) => api.patch<ETLPipeline>(`/pipelines/${id}`, payload),
    delete: (id: string) => api.delete(`/pipelines/${id}`),
    run: (id: string) => api.post<{ runId: string; status: string; startedAt: string }>(`/pipelines/${id}/run`),
    runs: (id: string) => api.get<{ data: PipelineRun[] }>(`/pipelines/${id}/runs`),
};

// DB Connections
export const connectionApi = {
    list: () => api.get<{ data: DBConnection[] }>('/connections'),
    create: (payload: ConnectionCreate) => api.post<DBConnection>('/connections', payload),
    token: (id: string) => api.get<{ token: string }>(`/connections/${id}/token`).then((res) => res.data),
    test: (id: string) => api.post<{ status: string; latencyMs: number }>(`/connections/${id}/test`).then((res) => res.data),
    schema: (id: string) => api.get<{ data: unknown[] }>(`/connections/${id}/schema`),
    sync: (id: string) =>
        api.post(`/connections/${id}/sync`).then((res) => res.data),
    createDataset: (id: string, payload: { tableName: string; schemaName: string }) =>
        api.post(`/connections/${id}/create-dataset`, payload).then((res) => res.data),
    query: (id: string, payload: { sql: string; limit?: number }) =>
        api.post<{ columns: string[]; data: Record<string, unknown>[]; rowCount: number }>(`/connections/${id}/query`, payload).then((res) => res.data),
    delete: (id: string) => api.delete(`/connections/${id}`).then((res) => res.data),
};

// BUG-H5: Bookmarks
export const bookmarkApi = {
    list: () => api.get<{ data: Bookmark[] }>('/bookmarks'),
    create: (payload: BookmarkCreate) => api.post<Bookmark>('/bookmarks', payload),
    delete: (id: string) => api.delete(`/bookmarks/${id}`),
};

// BUG-H6: Chart Annotations
export const annotationApi = {
    list: (datasetId?: string) => api.get<{ data: AnnotationItem[] }>('/annotations', { params: datasetId ? { datasetId } : undefined }),
    create: (payload: AnnotationCreate) => api.post<AnnotationItem>('/annotations', payload),
    delete: (id: string) => api.delete(`/annotations/${id}`),
};

// BUG-H4: Report Templates
export const reportTemplateApi = {
    list: () => api.get<{ data: UserReportTemplate[] }>('/report-templates'),
    create: (payload: UserReportTemplateCreate) => api.post<UserReportTemplate>('/report-templates', payload),
    delete: (id: string) => api.delete(`/report-templates/${id}`),
    import: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post<UserReportTemplate>('/templates/import', formData);
    },
};

// BUG-H2: Dataset Relationships (DB Diagram)
export const relationshipApi = {
    list: () => api.get<{ data: DataRelationship[] }>('/relationships'),
    create: (payload: RelationshipCreate) => api.post<DataRelationship>('/relationships', payload),
    delete: (id: string) => api.delete(`/relationships/${id}`),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UserProfile {
    id: string;
    email: string;
    displayName: string;
    role: string;
    avatarUrl?: string;
    createdAt: string;
}

export interface DatasetItem {
    id: string;
    name: string;
    fileName: string;
    columns: ColumnDef[];
    rowCount: number;
    size: number;
    dataTableName: string;
    createdAt: string;
    updatedAt: string;
}

export interface ColumnDef {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    nullable: boolean;
}

export interface DataQueryParams {
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    filters?: string; // JSON-encoded
    dateCol?: string;
    startDate?: string;
    endDate?: string;
}

export interface DataQueryResult {
    data: Record<string, unknown>[];
    columns?: ColumnDef[]; // Array of columns metadata returned from backend
    metadata?: {
        columns: ColumnDef[];
    };
    total: number;
    page: number;
    limit: number;
}

export interface DatasetStats {
    stats: Record<string, ColumnStat>;
}

export interface ColumnStat {
    count: number;
    nullCount: number;
    min?: number;
    max?: number;
    mean?: number;
    stddev?: number;
    unique?: number;
    topValues?: Array<{ value: string; count: number }>;
}

export interface RefreshConfig {
    schedule?: string;
    timezone?: string;
}

export interface Dashboard {
    id: string;
    name: string;
    widgets: unknown[];
    isPublic: boolean;
    embedToken?: string;
    createdAt: string;
}


export interface DataStory {
    id: string;
    title: string;
    content: string;
    createdAt: string;
}

export interface KPI {
    id: string;
    name: string;
    datasetId: string;
    columnName: string;
    aggregation: string;
    target?: number;
    unit?: string;
    createdAt: string;
}

export interface KPICreate {
    name: string;
    datasetId: string;
    columnName: string;
    aggregation: string;
    target?: number;
    unit?: string;
}

export interface DataAlert {
    id: string;
    name: string;
    datasetId: string;
    columnName: string;
    condition: string;
    threshold: number;
    notifyVia: string;
    enabled: boolean;
    createdAt: string;
}

export interface AlertCreate {
    name: string;
    datasetId: string;
    columnName: string;
    condition: string;
    threshold: number;
    notifyVia?: string;
}

export interface CronJob {
    id: string;
    name: string;
    type: string;
    schedule: string;
    timezone: string;
    enabled: boolean;
    lastStatus?: string;
    lastRunAt?: string;
    nextRunAt?: string;
    createdAt: string;
}

export interface CronJobCreate {
    name: string;
    type: string;
    schedule: string;
    timezone?: string;
    targetId?: string;
}

export interface AskDataResult {
    question: string;
    sql: string;
    data: Record<string, unknown>[];
    rowCount: number;
}

// Chart types
export interface SavedChart {
    id: string;
    userId: string;
    datasetId: string;
    title: string;
    type: string;
    xAxis: string;
    yAxis: string;
    groupBy: string;
    annotations?: unknown[];
    createdAt: string;
}

export interface SavedChartCreate {
    title: string;
    datasetId: string;
    type: string;
    xAxis?: string;
    yAxis?: string;
    groupBy?: string;
}

// ETL Pipeline types
export interface ETLPipeline {
    id: string;
    userId: string;
    name: string;
    sourceDatasetId: string;
    outputDatasetId?: string;
    steps: unknown[];
    status: string;
    lastRunAt?: string;
    error?: string;
    createdAt: string;
}

export interface PipelineCreate {
    name: string;
    sourceDatasetId: string;
    steps?: Record<string, unknown>[];
}

export interface PipelineRun {
    id: string;
    pipelineId: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    outputRows?: number;
    error?: string;
    triggeredBy: string;
}


// DB Connection types
export interface DBConnection {
    id: string;
    userId: string;
    name: string;
    dbType: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    sslMode: string;
    schemaName: string;
    isActive: boolean;
    lastSyncedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ConnectionCreate {
    name: string;
    dbType: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    password: string;
    sslMode?: string;
    schemaName?: string;
}



// ── P1 Types ──────────────────────────────────────────────────────────────────

export interface Bookmark {
    id: string;
    userId: string;
    datasetId: string;
    name: string;
    filters: { column: string; value: string }[];
    sortColumn: string;
    sortDirection: string;
    createdAt: string;
}

export interface BookmarkCreate {
    name: string;
    datasetId: string;
    filters: { column: string; value: string }[];
    sortColumn?: string;
    sortDirection?: string;
}

export interface AnnotationItem {
    id: string;
    userId: string;
    datasetId: string;
    xCol: string;
    yCol: string;
    label: string;
    value: number;
    color: string;
    type: string;
    createdAt: string;
}

export interface AnnotationCreate {
    datasetId: string;
    xCol?: string;
    yCol?: string;
    label: string;
    value: number;
    color?: string;
    type?: string;
}

export interface UserReportTemplate {
    id: string;
    userId: string;
    name: string;
    description: string;
    category: string;
    source: string;
    pages: unknown[];
    colorScheme: Record<string, string>;
    isDefault: boolean;
    createdAt: string;
}

export interface UserReportTemplateCreate {
    name: string;
    description?: string;
    category?: string;
    source?: string;
    pages?: unknown[];
    colorScheme?: Record<string, string>;
}

export interface DataRelationship {
    id: string;
    userId: string;
    sourceDatasetId: string;
    targetDatasetId: string;
    sourceColumn: string;
    targetColumn: string;
    relType: string;
    createdAt: string;
}

export interface RelationshipCreate {
    sourceDatasetId: string;
    targetDatasetId: string;
    sourceColumn?: string;
    targetColumn?: string;
    relType?: string;
}


// ── P2 Types ──────────────────────────────────────────────────────────────────

export interface DashboardParameter {
    id: string;
    userId: string;
    dashboardId: string;
    name: string;
    type: 'number' | 'text' | 'list' | 'date';
    defaultValue: string;
    minVal?: number;
    maxVal?: number;
    createdAt: string;
}

export interface DashboardParameterCreate {
    dashboardId?: string;
    name: string;
    type: 'number' | 'text' | 'list' | 'date';
    defaultValue?: string;
    minVal?: number;
    maxVal?: number;
}

export interface RLSRuleItem {
    id: string;
    userId: string;
    datasetId: string;
    role: string;
    columnName: string;
    allowedValues: string[];
    enabled: boolean;
    createdAt: string;
}

export interface RLSRuleCreate {
    datasetId: string;
    role: string;
    columnName: string;
    allowedValues: string[];
    enabled?: boolean;
}

export interface FormatRuleItem {
    id: string;
    userId: string;
    datasetId: string;
    column: string;
    condition: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'contains' | 'empty';
    value: string;
    bgColor: string;
    textColor: string;
    createdAt: string;
}

export interface FormatRuleCreate {
    datasetId: string;
    column: string;
    condition: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'contains' | 'empty';
    value?: string;
    bgColor?: string;
    textColor?: string;
}

export interface CalcFieldItem {
    id: string;
    userId: string;
    datasetId: string;
    name: string;
    formula: string;
    createdAt: string;
}

export interface CalcFieldCreate {
    datasetId: string;
    name: string;
    formula: string;
}

// ── P2 API Objects ─────────────────────────────────────────────────────────────

export const parameterApi = {
    list: (datasetId?: string) => api.get<DashboardParameter[]>('/parameters', { params: datasetId ? { datasetId } : {} }),
    create: (data: DashboardParameterCreate) => api.post<DashboardParameter>('/parameters', data),
    update: (id: string, data: Partial<DashboardParameterCreate>) => api.put(`/parameters/${id}`, data),
    delete: (id: string) => api.delete(`/parameters/${id}`),
};

export const rlsApi = {
    list: (datasetId?: string) => api.get<RLSRuleItem[]>('/rls-rules', { params: datasetId ? { datasetId } : {} }),
    create: (data: RLSRuleCreate) => api.post<RLSRuleItem>('/rls-rules', data),
    toggle: (id: string, enabled: boolean) => api.patch(`/rls-rules/${id}/toggle`, { enabled }),
    delete: (id: string) => api.delete(`/rls-rules/${id}`),
};

export const formatRuleApi = {
    list: (datasetId?: string) => api.get<FormatRuleItem[]>('/format-rules', { params: datasetId ? { datasetId } : {} }),
    create: (data: FormatRuleCreate) => api.post<FormatRuleItem>('/format-rules', data),
    delete: (id: string) => api.delete(`/format-rules/${id}`),
};

export const calcFieldApi = {
    list: (datasetId?: string) => api.get<CalcFieldItem[]>('/calc-fields', { params: datasetId ? { datasetId } : {} }),
    create: (data: CalcFieldCreate) => api.post<CalcFieldItem>('/calc-fields', data),
    delete: (id: string) => api.delete(`/calc-fields/${id}`),
};

// ── DrillConfig API (BUG-M2) ─────────────────────────────────────────────────
export interface DrillConfig {
    id: string;
    userId: string;
    datasetId: string;
    hierarchy: string[];
    metricCol: string;
    aggFn: 'count' | 'sum' | 'avg';
    createdAt: string;
    updatedAt: string;
}

export interface DrillConfigSave {
    datasetId: string;
    hierarchy: string[];
    metricCol: string;
    aggFn: 'count' | 'sum' | 'avg';
}

export const drillConfigApi = {
    list: (datasetId?: string) => api.get<{ data: DrillConfig[] }>('/drill-configs', { params: datasetId ? { datasetId } : {} }),
    save: (data: DrillConfigSave) => api.post<DrillConfig>('/drill-configs', data),
    delete: (id: string) => api.delete(`/drill-configs/${id}`),
};

// ── EmbedToken API (BUG-M5) ──────────────────────────────────────────────────
export interface EmbedToken {
    id: string;
    userId: string;
    resourceId: string;
    resourceType: 'dashboard' | 'chart';
    showToolbar: boolean;
    width: number;
    height: number;
    expiresAt: string | null;
    accessCount: number;
    revoked: boolean;
    createdAt: string;
}

export interface EmbedTokenGenerate {
    resourceId: string;
    resourceType: 'dashboard' | 'chart';
    showToolbar: boolean;
    width: number;
    height: number;
    expireDays?: number; // undefined = no expiry
}

export const embedApi = {
    generate: (data: EmbedTokenGenerate) => api.post<EmbedToken>('/embed-tokens', data),
    list: () => api.get<{ data: EmbedToken[] }>('/embed-tokens'),
    revoke: (id: string) => api.delete(`/embed-tokens/${id}`),
};

// ── Query Engine API (Phase 10: Auto-Join) ───────────────────────────────────

export interface QueryField {
    datasetId: string;
    column: string;
    aggFn?: 'count' | 'sum' | 'avg' | 'min' | 'max' | string;
}

export interface AutoJoinPayload {
    baseDatasetId: string;
    fields: QueryField[];
    limit?: number;
}

export interface AutoJoinResult {
    data: Record<string, any>[];
    query: string;
}

export const queryApi = {
    autoJoin: (payload: AutoJoinPayload) => api.post<AutoJoinResult>('/query/auto-join', payload),
};

// ── Action / Webhook API (Phase 14) ──────────────────────────────────────────

export interface ActionPayload {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface ConnectorSource {
    sourceDefinitionId: string;
    name: string;
    dockerRepository: string;
    dockerImageTag: string;
    documentationUrl: string;
    icon: string;
}

export interface ActiveConnection {
    connectionId: string;
    sourceId: string;
    sourceName: string;
    status: string;
    syncStatus: string;
    createdAt: string;
}

export interface ConnectionStatus {
    status: string;
    message: string;
}

export interface ExecuteActionResult {
    status: number;
    headers: Record<string, string[]>;
    data: any;
}

export const actionApi = {
    execute: async (payload: ActionPayload) => {
        const { data } = await api.post('/actions/execute', payload);
        return data;
    },
};

export const connectorApi = {
    getCatalog: async () => {
        const { data } = await api.get<ConnectorSource[]>('/connectors/catalog');
        return data;
    },
    getActive: async () => {
        const { data } = await api.get<ActiveConnection[]>('/connectors/active');
        return data;
    },
    setup: async (payload: { sourceId: string; credentials: Record<string, any> }) => {
        const { data } = await api.post<ActiveConnection>('/connectors/setup', payload);
        return data;
    },
    triggerSync: async (connectionId: string) => {
        const { data } = await api.post<ConnectionStatus>(`/connectors/${connectionId}/sync`);
        return data;
    }
};

// ── Comments API (Phase 15) ──────────────────────────────────────────────────

export interface Comment {
    id: string;
    dashboardId: string;
    widgetId?: string;
    userId: string;
    user?: { id: string; username: string; email: string };
    content: string;
    posX?: number;
    posY?: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCommentPayload {
    dashboardId: string;
    widgetId?: string;
    content: string;
    posX?: number;
    posY?: number;
}

export const commentApi = {
    getAll: (dashboardId: string) => api.get<{ data: Comment[] }>(`/comments?dashboardId=${dashboardId}`),
    create: (payload: CreateCommentPayload) => api.post<Comment>('/comments', payload),
    delete: (id: string) => api.delete(`/comments/${id}`),
};
