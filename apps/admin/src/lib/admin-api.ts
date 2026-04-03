import { supabase } from './supabase'

type AdminResponse<T> = {
  data: T
  meta?: { total: number; page: number; limit: number }
  error?: string
}

async function invokeAdminFunction<T>(
  fnName: string,
  options: { method?: string; path?: string; params?: Record<string, string | number | boolean>; body?: unknown } = {},
): Promise<AdminResponse<T>> {
  const { method = 'GET' as const, path = '', params, body } = options
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''
  const url = `${fnName}${path ? `/${path}` : ''}${qs}`

  const { data, error } = await supabase.functions.invoke<AdminResponse<T>>(url, {
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body: body ? JSON.stringify(body) : undefined,
  })

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Empty response')
  return data
}

// ── Users ──────────────────────────────────────────────────────
export type AdminUser = {
  id: string
  phone: string
  full_name: string | null
  company_name: string | null
  disabled_at: string | null
  created_at: string
  updated_at: string
  user_roles: Array<{ role: string }>
  org_members: Array<{
    organization_id: string
    role: string
    organizations: { name: string; slug: string } | null
  }>
}

export type AdminUserDetail = {
  profile: AdminUser
  projects: Array<{ id: string; name: string; status: string; created_at: string }>
  reports: Array<{ id: string; title: string; report_type: string; status: string; confidence: number | null; created_at: string }>
  genLogs: Array<{ id: number; provider: string; model: string; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; confidence: number | null; created_at: string }>
}

export async function fetchUsers(params: Record<string, string | number | boolean> = {}) {
  return invokeAdminFunction<AdminUser[]>('admin-users', { params })
}

export async function fetchUserDetail(userId: string) {
  return invokeAdminFunction<AdminUserDetail>('admin-users', { path: userId })
}

export async function updateUser(userId: string, changes: Record<string, unknown>) {
  return invokeAdminFunction<{ success: boolean }>('admin-users', {
    method: 'PATCH',
    path: userId,
    body: changes,
  })
}

// ── Organizations ──────────────────────────────────────────────
export type AdminOrg = {
  id: string
  name: string
  slug: string
  plan: string
  max_seats: number
  created_at: string
  updated_at: string
  member_count: number
}

export type AdminOrgDetail = {
  org: AdminOrg
  members: Array<{
    id: string
    role: string
    joined_at: string
    profiles: { id: string; full_name: string | null; phone: string; company_name: string | null } | null
  }>
  projects: Array<{ id: string; name: string; status: string; created_at: string }>
  projectCount: number
}

export async function fetchOrgs(params: Record<string, string | number | boolean> = {}) {
  return invokeAdminFunction<AdminOrg[]>('admin-orgs', { params })
}

export async function fetchOrgDetail(orgId: string) {
  return invokeAdminFunction<AdminOrgDetail>('admin-orgs', { path: orgId })
}

export async function createOrg(body: { name: string; slug: string; plan: string; max_seats: number }) {
  return invokeAdminFunction<AdminOrg>('admin-orgs', { method: 'POST', body })
}

export async function updateOrg(orgId: string, changes: Record<string, unknown>) {
  return invokeAdminFunction<{ success: boolean }>('admin-orgs', {
    method: 'PATCH',
    path: orgId,
    body: changes,
  })
}

// ── Reports ────────────────────────────────────────────────────
export type AdminReport = {
  id: string
  title: string
  report_type: string
  status: string
  visit_date: string | null
  confidence: number | null
  created_at: string
  profiles: { id: string; full_name: string | null; phone: string } | null
  projects: { id: string; name: string } | null
}

export type AdminReportDetail = {
  report: AdminReport & {
    notes: string[]
    report_data: Record<string, unknown>
    projects: { id: string; name: string; address: string | null } | null
    profiles: { id: string; full_name: string | null; phone: string; company_name: string | null } | null
  }
  generationLog: Array<{ id: number; provider: string; model: string; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; confidence: number | null; created_at: string }>
}

export async function fetchReports(params: Record<string, string | number | boolean> = {}) {
  return invokeAdminFunction<AdminReport[]>('admin-reports', { params })
}

export async function fetchReportDetail(reportId: string) {
  return invokeAdminFunction<AdminReportDetail>('admin-reports', { path: reportId })
}

// ── Analytics ──────────────────────────────────────────────────
export type AnalyticsData = {
  summary: {
    totalUsers: number
    newUsers: number
    totalProjects: number
    totalReports: number
    reportsInWindow: number
    avgConfidence: number | null
    lowConfidenceCount: number
    windowDays: number
  }
  reportsByDay: Array<{ date: string; count: number }>
  aiStats: {
    totalCalls: number
    totalInputTokens: number
    totalOutputTokens: number
    avgLatencyMs: number | null
    byProvider: Array<{ provider: string; count: number }>
  }
  reportsByType: Array<{ type: string; count: number }>
  topUsers: Array<{ name: string; count: number }>
}

export async function fetchAnalytics(days = 30) {
  return invokeAdminFunction<AnalyticsData>('admin-analytics', { params: { days } })
}

// ── Audit Log ──────────────────────────────────────────────────
export type AuditEntry = {
  id: number
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  profiles: { id: string; full_name: string | null; phone: string } | null
}

export async function fetchAuditLog(params: Record<string, string | number | boolean> = {}) {
  return invokeAdminFunction<AuditEntry[]>('admin-audit', { params })
}
