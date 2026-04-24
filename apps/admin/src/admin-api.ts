const STORAGE_KEY = "harpa-admin-session";

type Nullable<T> = T | null;

export type InternalAdmin = {
  username: string;
  displayName: string;
  issuedAt: string;
  expiresAt: string;
};

export type AdminSession = {
  token: string;
  admin: InternalAdmin;
};

export type AdminBootstrap = {
  admin: InternalAdmin;
  stats: {
    users: number;
    sites: number;
    reports: number;
  };
};

export type AdminAnalytics = {
  overview: {
    totalUsers: number;
    accounts: number;
    activeSites: number;
    delayedSites: number;
    completedSites: number;
    totalReports: number;
    draftReports: number;
    finalReports: number;
    monthlyTokens: number;
    memberAssignments: number;
  };
  timeline: Array<{
    date: string;
    reports: number;
    tokens: number;
    generations: number;
  }>;
  providers: Array<{
    provider: string;
    model: string;
    runs: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    cacheRatio: number;
  }>;
  reportTypes: Array<{ key: string; count: number }>;
  siteStatuses: Array<{ key: string; count: number }>;
  attention: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
    createdAt: string;
  }>;
  activity: Array<{
    id: string;
    kind: string;
    title: string;
    detail: string;
    createdAt: string;
  }>;
  sites: Array<{
    id: string;
    name: string;
    status: string;
    ownerName: string;
    reportCount: number;
    draftCount: number;
    memberCount: number;
    lastActivity: string | null;
    tokenCount: number;
    avgConfidence: number | null;
  }>;
};

export type AdminUserRow = {
  id: string;
  phone: string;
  full_name: string | null;
  company_name: string | null;
  created_at: string;
  updated_at: string;
  project_count: number;
  report_count: number;
  member_count: number;
  roles: string[];
  total_tokens: number;
  last_activity: string | null;
};

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  max_seats: number;
  created_at: string;
  owner_name: string | null;
  member_count: number;
  site_count: number;
  active_site_count: number;
  report_count: number;
  token_count: number;
  cached_tokens: number;
};

export type AdminSiteRow = {
  id: string;
  name: string;
  address: string | null;
  client_name: string | null;
  status: "active" | "delayed" | "completed" | "archived";
  owner_id: string;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
  owner: {
    id: string;
    full_name: string | null;
    company_name: string | null;
  } | null;
  member_count: number;
  report_count: number;
  draft_count: number;
  final_count: number;
  avg_confidence: number | null;
  token_count: number;
  cached_tokens: number;
  last_report: string | null;
};

export type AdminSiteDetail = {
  site: Record<string, unknown>;
  reports: Array<{
    id: string;
    title: string;
    status: string;
    report_type: string;
    confidence: number | null;
    created_at: string;
    visit_date: string | null;
  }>;
  usage: Array<{
    id: string;
    user_id: string;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    provider: string;
    model: string;
    created_at: string;
    report_id: string | null;
  }>;
  members: Array<Record<string, unknown>>;
};

export type AdminReportRow = {
  id: string;
  title: string;
  report_type: string;
  status: string;
  visit_date: string | null;
  confidence: number | null;
  created_at: string;
  profiles: { id: string; full_name: string | null; phone: string | null } | null;
  projects: { id: string; name: string } | null;
};

export type AdminReportDetail = {
  report: Record<string, unknown>;
  usageEvents: Array<{
    id: string;
    user_id: string;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    provider: string;
    model: string;
    created_at: string;
  }>;
};

export type AdminActivityRow = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type AdminAuditRow = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    company_name: string | null;
  } | null;
};

type ListResponse<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
};

function getSupabaseUrl() {
  return import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") ?? "";
}

function getAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
}

function assertConfigured() {
  if (!getSupabaseUrl() || !getAnonKey()) {
    throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured.");
  }
}

function withParams(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function saveSession(session: Nullable<AdminSession>) {
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function readStoredSession(): Nullable<AdminSession> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function signOutAdmin() {
  saveSession(null);
}

async function callAdminFunction<T>(
  path: string,
  init?: RequestInit,
  session?: AdminSession,
): Promise<T> {
  assertConfigured();
  const response = await fetch(`${getSupabaseUrl()}/functions/v1/${path}`, {
    ...init,
    headers: {
      apikey: getAnonKey(),
      "Content-Type": "application/json",
      ...(session
        ? {
          Authorization: `Bearer ${session.token}`,
        }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }

  return body as T;
}

export async function signInAdmin(username: string, password: string) {
  const result = await callAdminFunction<{ data: { token: string; admin: InternalAdmin } }>(
    "admin-login",
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
  );

  const session: AdminSession = {
    token: result.data.token,
    admin: result.data.admin,
  };
  saveSession(session);
  return session;
}

export async function restoreAdminSession(session: AdminSession) {
  const result = await callAdminFunction<{ data: AdminBootstrap }>(
    "admin-bootstrap",
    undefined,
    session,
  );
  const nextSession = {
    ...session,
    admin: result.data.admin,
  };
  saveSession(nextSession);
  return nextSession;
}

export async function fetchAdminBootstrap(session: AdminSession) {
  const result = await callAdminFunction<{ data: AdminBootstrap }>(
    "admin-bootstrap",
    undefined,
    session,
  );
  return result.data;
}

export async function fetchAdminAnalytics(session: AdminSession) {
  const result = await callAdminFunction<{ data: AdminAnalytics }>(
    "admin-analytics",
    undefined,
    session,
  );
  return result.data;
}

export async function fetchAdminUsers(
  session: AdminSession,
  params: { page?: number; limit?: number; search?: string },
) {
  return callAdminFunction<ListResponse<AdminUserRow>>(
    withParams("admin-users", params),
    undefined,
    session,
  );
}

export async function fetchAdminOrgs(
  session: AdminSession,
  params: { page?: number; limit?: number; search?: string; plan?: string },
) {
  return callAdminFunction<ListResponse<AdminOrgRow>>(
    withParams("admin-orgs", params),
    undefined,
    session,
  );
}

export async function updateAdminOrg(
  session: AdminSession,
  orgId: string,
  updates: Partial<Pick<AdminOrgRow, "name" | "slug" | "plan" | "max_seats">>,
) {
  return callAdminFunction<{ data: AdminOrgRow }>(
    `admin-orgs/${orgId}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
    session,
  );
}

export async function fetchAdminSites(
  session: AdminSession,
  params: { page?: number; limit?: number; search?: string; status?: string },
) {
  return callAdminFunction<ListResponse<AdminSiteRow>>(
    withParams("admin-sites", params),
    undefined,
    session,
  );
}

export async function fetchAdminSiteDetail(session: AdminSession, siteId: string) {
  const result = await callAdminFunction<{ data: AdminSiteDetail }>(
    `admin-sites/${siteId}`,
    undefined,
    session,
  );
  return result.data;
}

export async function updateAdminSite(
  session: AdminSession,
  siteId: string,
  updates: { status?: string; archive?: boolean; restore?: boolean },
) {
  return callAdminFunction<{ data: Record<string, unknown> }>(
    `admin-sites/${siteId}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
    session,
  );
}

export async function fetchAdminReports(
  session: AdminSession,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    report_type?: string;
    status?: string;
    low_confidence?: boolean;
  },
) {
  return callAdminFunction<ListResponse<AdminReportRow>>(
    withParams("admin-reports", params),
    undefined,
    session,
  );
}

export async function fetchAdminReportDetail(session: AdminSession, reportId: string) {
  const result = await callAdminFunction<{ data: AdminReportDetail }>(
    `admin-reports/${reportId}`,
    undefined,
    session,
  );
  return result.data;
}

export async function fetchAdminActivity(
  session: AdminSession,
  params: { page?: number; limit?: number; kind?: string },
) {
  return callAdminFunction<ListResponse<AdminActivityRow>>(
    withParams("admin-activity", params),
    undefined,
    session,
  );
}

export async function fetchAdminAudit(
  session: AdminSession,
  params: { page?: number; limit?: number; action?: string; target_type?: string },
) {
  return callAdminFunction<ListResponse<AdminAuditRow>>(
    withParams("admin-audit", params),
    undefined,
    session,
  );
}

export function compactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
