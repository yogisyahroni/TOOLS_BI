/**
 * src/lib/graphql/client.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Lightweight GraphQL fetch client for DataLens.
 *
 * Design decisions:
 *  - NO Apollo / urql — avoids bundle bloat. Raw fetch is < 1 KB.
 *  - Reuses the SAME in-memory access token from lib/api.ts (XSS-safe).
 *  - Sends credentials: "include" so the httpOnly refresh cookie is forwarded,
 *    matching the Axios instance's withCredentials: true behaviour.
 *  - Returns typed data or throws a structured GraphQLError on failure.
 *
 * Security:
 *  - JWT injected from memory (never localStorage).
 *  - No token is embedded in the URL or logged.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { getAccessToken, API_BASE } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

export class GraphQLError extends Error {
  public readonly errors: Array<{ message: string; path?: string[] }>;

  constructor(errors: Array<{ message: string; path?: string[] }>) {
    super(errors.map((e) => e.message).join('\n'));
    this.name = 'GraphQLError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// GraphQL endpoint — derived from existing API_BASE to avoid duplication.
// e.g. "https://datalens-backend.onrender.com/api/v1" → "/graphql" (same host)
// ---------------------------------------------------------------------------
function getGraphQLEndpoint(): string {
  try {
    const url = new URL(API_BASE);
    // Strip /api/v1 suffix — GraphQL lives at /graphql
    return `${url.protocol}//${url.host}/graphql`;
  } catch {
    return '/graphql'; // fallback for tests / SSR
  }
}

export const GQL_ENDPOINT = getGraphQLEndpoint();

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Execute a GraphQL query or mutation against the DataLens backend.
 *
 * @param query     GraphQL document string (query / mutation).
 * @param variables Optional variables object.
 * @returns         Typed `data` portion of the response.
 * @throws          `GraphQLError` if the server returns `errors`.
 * @throws          `Error` for network failures or non-200 HTTP responses.
 */
export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept:         'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(GQL_ENDPOINT, {
    method:      'POST',
    headers,
    credentials: 'include', // sends httpOnly refresh_token cookie automatically
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL HTTP error ${res.status}: ${res.statusText}`);
  }

  const json: GraphQLResponse<T> = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new GraphQLError(json.errors);
  }

  if (json.data === undefined) {
    throw new Error('GraphQL response contained no data');
  }

  return json.data;
}
