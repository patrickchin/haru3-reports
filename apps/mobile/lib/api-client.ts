/**
 * Typed REST API client for the haru3-reports backend (`packages/api`).
 *
 * Behavior:
 *   - Reads the bearer token from `backend.auth.getSession()` on every
 *     call. We do not cache tokens locally — supabase-js refreshes
 *     transparently and `getSession()` returns the current value.
 *   - Throws `ApiError` (with `status` and parsed body) on non-2xx.
 *   - Base URL comes from `EXPO_PUBLIC_API_URL` (e.g.
 *     `https://api.haru3.app`); inlined by Metro at bundle time.
 *
 * The mobile app does NOT use this file directly today — it is wired
 * through `bridge-factory.ts`, which switches between the Supabase
 * bridge (default) and REST adapters when
 * `EXPO_PUBLIC_USE_REST_API=1`.
 */
import { backend } from "./backend";

export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  /** Override base URL (tests). */
  baseUrl?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Override session lookup (tests). */
  getAccessToken?: () => Promise<string | null>;
  /** Query-string params (string keys only). */
  query?: Record<string, string | number | undefined>;
  /** Custom headers to merge with auth + content-type. */
  headers?: Record<string, string>;
  /** Abort signal forwarded to fetch. */
  signal?: AbortSignal;
}

async function defaultGetAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await backend.auth.getSession();
  return session?.access_token ?? null;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: RequestOptions["query"] | undefined,
): string {
  if (!baseUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is not set — cannot call REST API");
  }
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  let url = `${trimmedBase}${trimmedPath}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(
  method: string,
  path: string,
  init: RequestInit,
  opts: RequestOptions,
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = opts.baseUrl ?? API_BASE_URL;
  const url = buildUrl(baseUrl, path, opts.query);

  const token = await (opts.getAccessToken ?? defaultGetAccessToken)();
  if (!token) throw new Error("Not authenticated");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(opts.headers ?? {}),
  };

  const finalInit: RequestInit = { ...init, method, headers };
  if (opts.signal !== undefined) finalInit.signal = opts.signal;

  const res = await fetchImpl(url, finalInit);
  const body = await parseBody(res);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error?: unknown }).error ?? `HTTP ${res.status}`)
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export async function apiGet<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  return request<T>("GET", path, {}, opts);
}

export async function apiPostJson<T>(
  path: string,
  body: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const init: RequestInit = {
    body: JSON.stringify(body),
  };
  const merged: RequestOptions = {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  };
  return request<T>("POST", path, init, merged);
}

export async function apiPostForm<T>(
  path: string,
  form: FormData,
  opts: RequestOptions = {},
): Promise<T> {
  // No Content-Type — let fetch set the multipart boundary.
  return request<T>("POST", path, { body: form }, opts);
}
