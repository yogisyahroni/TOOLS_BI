/**
 * src/hooks/useGraphQLDashboard.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * TanStack Query hooks for GraphQL-backed dashboard data.
 *
 * Why GraphQL here?
 *   The DashboardBuilder currently fires 3 REST round-trips on load:
 *     1. GET /api/v1/dashboards         → list of all dashboards
 *     2. GET /api/v1/datasets           → list of all datasets
 *     3. GET /api/v1/charts             → list of all saved charts
 *
 *   Additionally, each widget fires:
 *     4..N. GET /api/v1/datasets/:id/data  (one per widget)
 *
 *   With `dashboardBundle(id)`:
 *     • A single POST /graphql returns dashboard + its charts + dataset schemas.
 *     • The backend resolves them in one DB round-trip via DataLoader.
 *
 * Usage in DashboardBuilder:
 *   const { data, isLoading } = useGraphQLDashboardBundle(activeDashboardId);
 *   // data.id, data.name, data.widgets, data.charts, data.datasets
 *
 * Fallback strategy:
 *   If the backend's /graphql is unreachable (e.g., Render cold-start), the
 *   component continues to work via the existing REST hooks — no removal needed.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { useQuery } from '@tanstack/react-query';
import { gqlFetch } from '@/lib/graphql/client';

// ---------------------------------------------------------------------------
// Types — mirror the GraphQL schema types (schema.graphqls Phase 37)
// ---------------------------------------------------------------------------

export interface GQLDataset {
  id: string;
  userId: string;
  name: string;
  fileName: string;
  rowCount: number;
  sizeBytes: number;
  columns: unknown;      // JSON scalar — array of ColumnDef
  dataTableName: string;
  createdAt: string;
  updatedAt: string;
}

export interface GQLSavedChart {
  id: string;
  userId: string;
  datasetId: string;
  title: string;
  type: string;
  xAxis: string;
  yAxis: string;
  groupBy: string;
  annotations: unknown; // JSON scalar
  createdAt: string;
  dataset?: GQLDataset | null;
}

export interface GQLDashboardBundle {
  id: string;
  name: string;
  isPublic: boolean;
  version: number;
  widgets: unknown;       // JSON scalar — array of Widget
  charts: GQLSavedChart[];
  datasets: GQLDataset[];
  createdAt: string;
  updatedAt: string;
}

export interface GQLDashboard {
  id: string;
  userId: string;
  name: string;
  isPublic: boolean;
  version: number;
  widgets: unknown;       // JSON scalar
  createdAt: string;
  updatedAt: string;
}

export interface GQLDashboardsResult {
  items: GQLDashboard[];
  pageInfo: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface GQLDatasetsResult {
  items: GQLDataset[];
  pageInfo: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// GraphQL Documents
// ---------------------------------------------------------------------------

/** Fetch a single dashboard's full bundle — charts + dataset schemas. */
const DASHBOARD_BUNDLE_QUERY = /* GraphQL */ `
  query DashboardBundle($id: ID!) {
    dashboardBundle(id: $id) {
      id
      name
      isPublic
      version
      widgets
      createdAt
      updatedAt
      charts {
        id
        datasetId
        title
        type
        xAxis
        yAxis
        groupBy
        annotations
        createdAt
      }
      datasets {
        id
        name
        fileName
        rowCount
        sizeBytes
        columns
        dataTableName
        createdAt
        updatedAt
      }
    }
  }
`;

/** Fetch paginated list of dashboards. */
const DASHBOARDS_QUERY = /* GraphQL */ `
  query Dashboards($page: Int, $limit: Int) {
    dashboards(page: $page, limit: $limit) {
      items {
        id
        userId
        name
        isPublic
        version
        widgets
        createdAt
        updatedAt
      }
      pageInfo {
        total
        page
        limit
        totalPages
      }
    }
  }
`;

/** Fetch paginated list of datasets. */
const DATASETS_QUERY = /* GraphQL */ `
  query Datasets($page: Int, $limit: Int) {
    datasets(page: $page, limit: $limit) {
      items {
        id
        name
        fileName
        rowCount
        sizeBytes
        columns
        dataTableName
        createdAt
        updatedAt
      }
      pageInfo {
        total
        page
        limit
        totalPages
      }
    }
  }
`;

/** Health ping — no auth required. Useful for connectivity checks. */
const PING_QUERY = /* GraphQL */ `
  query Ping {
    ping
  }
`;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * `useGraphQLDashboardBundle`
 *
 * Fetches the complete dashboard bundle (meta + charts + dataset schemas) in a
 * single GraphQL request. Primary optimisation target for DashboardBuilder.
 *
 * Integration pattern (non-breaking):
 *   1. Call this hook in addition to existing `useDashboards()`.
 *   2. When `bundle.data` resolves, seed the query cache with the individual
 *      dataset schemas so widget renderers can read from cache without extra
 *      REST fetches.
 *
 * Cache key: `['gql', 'dashboardBundle', id]`
 */
export function useGraphQLDashboardBundle(id: string | null | undefined) {
  return useQuery<GQLDashboardBundle | null>({
    queryKey: ['gql', 'dashboardBundle', id],
    queryFn: async () => {
      if (!id) return null;
      const res = await gqlFetch<{ dashboardBundle: GQLDashboardBundle | null }>(
        DASHBOARD_BUNDLE_QUERY,
        { id },
      );
      return res.dashboardBundle;
    },
    enabled:   !!id,
    staleTime: 1000 * 45,  // 45 s — dashboard config doesn't update in real-time
    retry:     1,           // one retry on network failure; fall back to REST on second fail
  });
}

/**
 * `useGraphQLDashboards`
 *
 * Paginated dashboard list via GraphQL.  Mirrors `useDashboards()` shape so
 * components can opt-in without breaking changes.
 *
 * Cache key: `['gql', 'dashboards', page, limit]`
 */
export function useGraphQLDashboards(page = 1, limit = 100) {
  return useQuery<GQLDashboardsResult>({
    queryKey: ['gql', 'dashboards', page, limit],
    queryFn:  async () => {
      const res = await gqlFetch<{ dashboards: GQLDashboardsResult }>(
        DASHBOARDS_QUERY,
        { page, limit },
      );
      return res.dashboards;
    },
    staleTime: 1000 * 60, // 1 min
    retry: 1,
  });
}

/**
 * `useGraphQLDatasets`
 *
 * Paginated dataset list via GraphQL. Returns `items` + `pageInfo`.
 *
 * Cache key: `['gql', 'datasets', page, limit]`
 */
export function useGraphQLDatasets(page = 1, limit = 100) {
  return useQuery<GQLDatasetsResult>({
    queryKey: ['gql', 'datasets', page, limit],
    queryFn:  async () => {
      const res = await gqlFetch<{ datasets: GQLDatasetsResult }>(
        DATASETS_QUERY,
        { page, limit },
      );
      return res.datasets;
    },
    staleTime: 1000 * 60,
    retry: 1,
  });
}

/**
 * `useGraphQLPing`
 *
 * Health check — resolves to `"pong"` when the GraphQL endpoint is reachable.
 * Useful for feature flagging: if ping fails, fall back to REST hooks.
 *
 * Cache key: `['gql', 'ping']`
 */
export function useGraphQLPing() {
  return useQuery<string>({
    queryKey: ['gql', 'ping'],
    queryFn:  async () => {
      const res = await gqlFetch<{ ping: string }>(PING_QUERY);
      return res.ping;
    },
    staleTime:      1000 * 60 * 5, // 5 min
    retry:          false,          // ping failure = graceful fallback
    refetchOnMount: false,
  });
}
