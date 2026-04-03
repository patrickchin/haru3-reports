import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Users, FileText, BarChart3, AlertTriangle,
  Building2, TrendingUp, Activity,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { fetchAnalytics, fetchReports } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, reportTypeVariant, statusVariant } from '@/components/ui/Badge'
import { PageLoader, ErrorState } from '@/components/ui/Spinner'
import { formatDate, confidenceColor } from '@/lib/utils'

const DAY_OPTIONS = [7, 14, 30, 90]

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

export function DashboardPage() {
  const [days, setDays] = useState(30)

  const { data: analyticsResp, isLoading, error } = useQuery({
    queryKey: ['admin-analytics', days],
    queryFn: () => fetchAnalytics(days),
  })

  const { data: lowConfResp, isLoading: lowConfLoading } = useQuery({
    queryKey: ['admin-reports', 'low-confidence'],
    queryFn: () => fetchReports({ low_confidence: true, limit: 8 }),
  })

  const stats = analyticsResp?.data?.summary
  const reportsByDay = analyticsResp?.data?.reportsByDay ?? []
  const reportsByType = analyticsResp?.data?.reportsByType ?? []
  const aiStats = analyticsResp?.data?.aiStats
  const topUsers = analyticsResp?.data?.topUsers ?? []
  const lowConfReports = lowConfResp?.data ?? []

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState message="Failed to load analytics." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Dashboard"
          subtitle={`Showing data for last ${days} days`}
        />
        <div className="flex gap-1.5 bg-white border border-gray-200 rounded-lg p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                days === d
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers?.toLocaleString() ?? null}
          subtitle={`+${stats?.newUsers ?? 0} new this period`}
          icon={<Users size={18} />}
        />
        <StatCard
          title="Total Reports"
          value={stats?.totalReports?.toLocaleString() ?? null}
          subtitle={`${stats?.reportsInWindow ?? 0} in last ${days}d`}
          icon={<FileText size={18} />}
        />
        <StatCard
          title="Avg Confidence"
          value={stats?.avgConfidence != null ? `${stats.avgConfidence}%` : '—'}
          subtitle={`${stats?.lowConfidenceCount ?? 0} low confidence reports`}
          icon={<TrendingUp size={18} />}
          valueColor={stats?.avgConfidence != null ? confidenceColor(stats.avgConfidence) : 'text-gray-900'}
        />
        <StatCard
          title="AI Calls"
          value={aiStats?.totalCalls?.toLocaleString() ?? null}
          subtitle={aiStats?.avgLatencyMs != null ? `Avg ${aiStats.avgLatencyMs}ms` : 'No data'}
          icon={<Activity size={18} />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Reports over time */}
        <Card className="col-span-2">
          <CardHeader title="Reports Over Time" />
          <div className="px-4 pt-4 pb-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reportsByDay} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="reportGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(v: number) => [v, 'Reports']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#reportGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Report type distribution */}
        <Card>
          <CardHeader title="By Type" />
          <div className="flex items-center justify-center py-4 h-52">
            {reportsByType.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportsByType}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    outerRadius={64}
                  >
                    {reportsByType.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    formatter={(v: string) => <span style={{ fontSize: 11 }}>{v}</span>}
                  />
                  <Tooltip formatter={(v: number) => [v, 'reports']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400">No data</p>
            )}
          </div>
        </Card>
      </div>

      {/* Bottom row: low confidence + top users */}
      <div className="grid grid-cols-3 gap-4">
        {/* Low confidence reports */}
        <Card className="col-span-2">
          <CardHeader
            title="Low Confidence Reports"
            subtitle="Reports with < 60% AI confidence"
            action={
              <Link to="/reports?low_confidence=true" className="text-xs text-brand-600 hover:underline">
                View all
              </Link>
            }
          />
          <div className="divide-y divide-gray-100">
            {lowConfLoading ? (
              <p className="px-6 py-4 text-sm text-gray-400">Loading…</p>
            ) : lowConfReports.length === 0 ? (
              <div className="flex items-center gap-2 px-6 py-4">
                <AlertTriangle size={14} className="text-green-500" />
                <p className="text-sm text-gray-500">No low confidence reports. Great!</p>
              </div>
            ) : (
              lowConfReports.map((r) => (
                <Link
                  key={r.id}
                  to={`/reports/${r.id}`}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {r.title || 'Untitled report'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.profiles?.full_name ?? r.profiles?.phone ?? 'Unknown'} ·{' '}
                      {r.projects?.name ?? 'Unknown project'} · {formatDate(r.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={reportTypeVariant(r.report_type)}>{r.report_type}</Badge>
                    <span className={`text-sm font-bold ${confidenceColor(r.confidence)}`}>
                      {r.confidence ?? '—'}%
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Top users */}
        <Card>
          <CardHeader
            title="Top Users"
            subtitle="By reports this period"
            action={
              <Link to="/users" className="text-xs text-brand-600 hover:underline">View all</Link>
            }
          />
          <div className="divide-y divide-gray-100">
            {topUsers.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No data</p>
            ) : (
              topUsers.slice(0, 8).map((u, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-6 w-6 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm text-gray-800 truncate max-w-[120px]">{u.name}</p>
                  </div>
                  <Badge variant="info">{u.count}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* AI stats summary */}
      {aiStats && (
        <Card>
          <CardHeader title="AI Generation Stats" subtitle={`Last ${days} days`} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-gray-100">
            {[
              { label: 'Total Calls', value: aiStats.totalCalls.toLocaleString() },
              {
                label: 'Input Tokens',
                value: (aiStats.totalInputTokens / 1000).toFixed(1) + 'K',
              },
              {
                label: 'Output Tokens',
                value: (aiStats.totalOutputTokens / 1000).toFixed(1) + 'K',
              },
              {
                label: 'Avg Latency',
                value: aiStats.avgLatencyMs != null ? `${aiStats.avgLatencyMs}ms` : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} className="px-6 py-4">
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
            ))}
          </div>
          {aiStats.byProvider.length > 0 && (
            <div className="px-6 pb-4 flex items-center gap-3">
              <p className="text-xs text-gray-500">Providers:</p>
              {aiStats.byProvider.map(({ provider, count }) => (
                <Badge key={provider} variant="info">
                  {provider}: {count}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
