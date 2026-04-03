import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, AlertTriangle } from 'lucide-react'
import { fetchReports, type AdminReport } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { DataTable } from '@/components/ui/DataTable'
import { Badge, reportTypeVariant, statusVariant } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Spinner'
import { formatDate, confidenceColor } from '@/lib/utils'

const REPORT_TYPES = ['', 'daily', 'safety', 'incident', 'inspection', 'site_visit', 'progress']
const STATUSES = ['', 'draft', 'final']

export function ReportsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [reportType, setReportType] = useState('')
  const [status, setStatus] = useState('')
  const [lowConfidence, setLowConfidence] = useState(
    searchParams.get('low_confidence') === 'true',
  )
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-reports', search, reportType, status, lowConfidence, page],
    queryFn: () =>
      fetchReports({
        search,
        ...(reportType ? { report_type: reportType } : {}),
        ...(status ? { status } : {}),
        ...(lowConfidence ? { low_confidence: true } : {}),
        page,
        limit: 25,
      }),
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const columns = [
    {
      key: 'title',
      header: 'Report',
      render: (r: AdminReport) => (
        <div>
          <p className="font-medium text-gray-900 truncate max-w-[200px]">
            {r.title || 'Untitled'}
          </p>
          <p className="text-xs text-gray-500">{r.projects?.name ?? 'Unknown project'}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (r: AdminReport) => (
        <span className="text-gray-700">
          {r.profiles?.full_name ?? r.profiles?.phone ?? '—'}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r: AdminReport) => (
        <Badge variant={reportTypeVariant(r.report_type)}>{r.report_type}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: AdminReport) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (r: AdminReport) =>
        r.confidence != null ? (
          <span className={`font-semibold ${confidenceColor(r.confidence)}`}>
            {r.confidence < 60 && <AlertTriangle size={12} className="inline mr-1" />}
            {r.confidence}%
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'date',
      header: 'Visit Date',
      render: (r: AdminReport) => (
        <span className="text-gray-500">{formatDate(r.visit_date)}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (r: AdminReport) => (
        <span className="text-gray-500">{formatDate(r.created_at)}</span>
      ),
    },
  ]

  if (error) return <ErrorState message="Failed to load reports." />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle={`${data?.meta?.total ?? 0} total reports`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            placeholder="Search report title…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 w-52"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Search size={14} />
          </Button>
        </form>

        <select
          value={reportType}
          onChange={(e) => { setReportType(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {REPORT_TYPES.map((t) => (
            <option key={t} value={t}>{t || 'All types'}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={lowConfidence}
            onChange={(e) => { setLowConfidence(e.target.checked); setPage(1) }}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Low confidence only
        </label>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        total={data?.meta?.total}
        page={page}
        limit={25}
        onPageChange={setPage}
        onRowClick={(r) => navigate(`/reports/${r.id}`)}
        emptyMessage="No reports found."
      />
    </div>
  )
}
