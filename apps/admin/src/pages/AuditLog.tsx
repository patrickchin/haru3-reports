import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditLog, type AuditEntry } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'
import { Search } from 'lucide-react'

const TARGET_TYPES = ['', 'user', 'organization', 'report']

function actionVariant(action: string): 'danger' | 'info' | 'warning' | 'success' | 'default' {
  if (action.includes('disable')) return 'danger'
  if (action.includes('enable')) return 'success'
  if (action.includes('create')) return 'info'
  if (action.includes('update')) return 'warning'
  return 'default'
}

export function AuditLogPage() {
  const [action, setAction] = useState('')
  const [actionInput, setActionInput] = useState('')
  const [targetType, setTargetType] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-audit', action, targetType, page],
    queryFn: () =>
      fetchAuditLog({
        ...(action ? { action } : {}),
        ...(targetType ? { target_type: targetType } : {}),
        page,
        limit: 25,
      }),
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setAction(actionInput)
    setPage(1)
  }

  const columns = [
    {
      key: 'action',
      header: 'Action',
      render: (e: AuditEntry) => <Badge variant={actionVariant(e.action)}>{e.action}</Badge>,
    },
    {
      key: 'admin',
      header: 'By',
      render: (e: AuditEntry) => (
        <span className="text-gray-700">
          {e.profiles?.full_name ?? e.profiles?.phone ?? 'System'}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (e: AuditEntry) =>
        e.target_type ? (
          <div>
            <p className="text-xs font-medium text-gray-600 uppercase">{e.target_type}</p>
            <p className="text-xs text-gray-400 font-mono">{e.target_id?.slice(0, 8)}…</p>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'metadata',
      header: 'Details',
      render: (e: AuditEntry) => {
        const keys = Object.keys(e.metadata ?? {})
        if (keys.length === 0) return <span className="text-gray-400">—</span>
        return (
          <span className="text-xs text-gray-500 font-mono">
            {keys.slice(0, 3).map((k) => `${k}: ${JSON.stringify(e.metadata[k])}`).join(', ')}
          </span>
        )
      },
    },
    {
      key: 'date',
      header: 'Date',
      render: (e: AuditEntry) => (
        <span className="text-gray-500 text-xs">{formatDateTime(e.created_at)}</span>
      ),
    },
  ]

  if (error) return <ErrorState message="Failed to load audit log." />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        subtitle={`${data?.meta?.total ?? 0} entries — immutable record of all admin actions`}
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            placeholder="Filter by action (e.g. user.disable)…"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            className="h-9 w-64"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Search size={14} />
          </Button>
        </form>

        <select
          value={targetType}
          onChange={(e) => { setTargetType(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>{t || 'All target types'}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(e) => String(e.id)}
        isLoading={isLoading}
        total={data?.meta?.total}
        page={page}
        limit={25}
        onPageChange={setPage}
        emptyMessage="No audit log entries found."
      />
    </div>
  )
}
