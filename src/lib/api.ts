/**
 * DataLens API Client
 * Axios instance with:
 * - Automatic JWT Bearer token injection
 * - 401 → silent refresh → retry
 * - Consistent error shape
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';

// ---------------------------------------------------------------------------
// Token helpers (stored in memory + localStorage for refresh)
// ---------------------------------------------------------------------------
let accessToken: string | null = localStorage.getItem('access_token');

export function setAccessToken(token: string) {
    accessToken = token;
    localStorage.setItem('access_token', token);
}

export function clearTokens() {
    accessToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
}

export function getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
}

export function setRefreshToken(token: string) {
    localStorage.setItem('refresh_token', token);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
export const api = axios.create({
    baseURL: API_BASE,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
});

// REQUEST: Inject Authorization header
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});

// RESPONSE: Handle 401 → refresh → retry once
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

        const rToken = getRefreshToken();
        if (!rToken) {
            clearTokens();
            window.location.href = '/login';
            return Promise.reject(error);
        }

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
            const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
                refreshToken: rToken,
            });
            setAccessToken(data.accessToken);
            if (data.refreshToken) setRefreshToken(data.refreshToken);
            processQueue(null, data.accessToken);
            original.headers.Authorization = `Bearer ${data.accessToken}`;
            return api(original);
        } catch (err) {
            processQueue(err, null);
            clearTokens();
            window.location.href = '/login';
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
        api.post<DatasetItem>('/datasets/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
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
    get: (id: string) => api.get<Report>(`/reports/${id}`),
    generate: (datasetId: string, prompt?: string) =>
        api.post<{ title: string; content: string }>('/reports/generate', { datasetId, prompt }),
    delete: (id: string) => api.delete(`/reports/${id}`),
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
    test: (id: string) => api.post<{ status: string; latencyMs: number }>(`/connections/${id}/test`),
    schema: (id: string) => api.get<{ data: unknown[] }>(`/connections/${id}/schema`),
    sync: (id: string) => api.post(`/connections/${id}/sync`),
    query: (id: string, sql: string, limit?: number) =>
        api.post<{ columns: string[]; data: Record<string, unknown>[]; rowCount: number }>(
            `/connections/${id}/query`, { sql, limit: limit ?? 100 }
        ),
    delete: (id: string) => api.delete(`/connections/${id}`),
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
}

export interface DataQueryResult {
    data: Record<string, unknown>[];
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

export interface Report {
    id: string;
    title: string;
    content: string;
    insights?: string[];
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

// ── Parser / Import types ─────────────────────────────────────────────────────
export interface ParsedVisual {
    type: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    columns?: string[];
}

export interface ParsedPage {
    name: string;
    index: number;
    width?: number;
    height?: number;
    visuals: ParsedVisual[];
    rawNotes?: string;
}

export interface DataSource {
    name: string;
    type: string;
    connection: string;
}

export interface ParsedReport {
    title: string;
    sourceType: string;
    pages: ParsedPage[];
    dataSources: DataSource[];
    metadata?: Record<string, unknown>;
    parsedAt: string;
}


// ── API helpers ───────────────────────────────────────────────────────────────

export const importApi = {
    supported: () => api.get<{ formats: string[] }>('/import/supported'),
    parse: (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return api.post<{ parsed: ParsedReport; filename: string; sizeBytes: number }>('/import/parse', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    confirm: (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return api.post<{ template: { id: string; name: string }; reports: unknown[]; parsed: ParsedReport; message: string }>('/import/confirm', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
};

