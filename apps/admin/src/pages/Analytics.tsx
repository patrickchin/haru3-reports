import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { fetchAnalytics } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PageLoader, ErrorState } from '@/components/ui/Spinner'
import { Users, FileText, Activity, TrendingUp, Cpu } from 'lucide-react'
import { confidenceColor } from '@/lib/utils'

const DAY_OPTIONS = [7, 14, 30, 90]
const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

export function AnalyticsPage() {
  const [days, setDays] = useState(30)

  const { data: resp, isLoading, error } = useQuery({
    queryKey: ['admin-analytics-full', days],
    queryFn: () => fetchAnalytics(days),
  })

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState message="Failed to load analytics." />

  const d = resp?.data
  if (!d) return <ErrorState message="No data returned." />

  const { summary, reportsByDay, reportsByType, aiStats, topUsers } = d

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Analytics" subtitle={`Last ${days} days`} />
        <div className="flex gap-1.5 bg-white border border-gray-200 rounded-lg p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                days === d ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={summary.totalUsers.toLocaleString()} icon={<Users size={18} />} />
        <StatCard
          title={`New Users (${days}d)`}
          value={summary.newUsers.toLocaleString()}
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          title="Total Reports"
          value={summary.totalReports.toLocaleString()}
          icon={<FileText size={18} />}
        />
        <StatCard
          title="Avg Confidence"
          value={summary.avgConfidence != null ? `${summary.avgConfidence}%` : '—'}
          icon={<Activity size={18} />}
          valueColor={confidenceColor(summary.avgConfidence)}
        />
      </div>

      {/* Reports over time + by type */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader title="Reports Per Day" />
          <div className="px-4 pt-4 pb-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reportsByDay} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v: number) => [v, 'Reports']} />
                <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#grad2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="By Report Type" />
          <div className="flex items-center justify-center py-2 h-56">
            {reportsByType.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reportsByType} dataKey="count" nameKey="type" cx="50%" cy="45%" outerRadius={68}>
                    {reportsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend formatter={(v: string) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  <Tooltip formatter={(v: number) => [v, 'reports']} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400">No data</p>}
          </div>
        </Card>
      </div>

      {/* AI stats */}
      <Card>
        <CardHeader
          title="AI Generation"
          subtitle={`${aiStats.totalCalls.toLocaleString()} calls in last ${days} days`}
          action={<Cpu size={15} className="text-gray-400" />}
        />
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: 'Total Calls', value: aiStats.totalCalls.toLocaleString() },
            { label: 'Input Tokens', value: (aiStats.totalInputTokens / 1000).toFixed(1) + 'K' },
            { label: 'Output Tokens', value: (aiStats.totalOutputTokens / 1000).toFixed(1) + 'K' },
            { label: 'Avg Latency', value: aiStats.avgLatencyMs != null ? `${aiStats.avgLatencyMs}ms` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="px-6 py-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
        {aiStats.byProvider.length > 0 && (
          <div className="px-4 py-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aiStats.byProvider} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="provider" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v, 'calls']} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Top users */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title={`Top Users by Reports (${days}d)`} />
          <div className="px-4 py-4 h-52">
            {topUsers.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={topUsers.slice(0, 8)}
                  margin={{ top: 0, right: 16, left: 10, bottom: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} width={90} />
                  <Tooltip formatter={(v: number) => [v, 'reports']} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 px-2">No data</p>}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Report Quality Overview</p>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Low confidence reports (&lt;60%)</span>
              <span className="font-semibold text-red-600">{summary.lowConfidenceCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Reports in window</span>
              <span className="font-semibold text-gray-900">{summary.reportsInWindow}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Average confidence</span>
              <span className={`font-semibold ${confidenceColor(summary.avgConfidence)}`}>
                {summary.avgConfidence != null ? `${summary.avgConfidence}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total projects</span>
              <span className="font-semibold text-gray-900">{summary.totalProjects}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
