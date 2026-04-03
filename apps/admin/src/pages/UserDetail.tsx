import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, UserX, UserCheck, Building2, FileText, Cpu } from 'lucide-react'
import { fetchUserDetail, updateUser } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, reportTypeVariant, statusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageLoader, ErrorState } from '@/components/ui/Spinner'
import { formatDate, formatDateTime, confidenceColor } from '@/lib/utils'

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => fetchUserDetail(userId!),
    enabled: !!userId,
  })

  const toggleDisable = useMutation({
    mutationFn: (disabled: boolean) => updateUser(userId!, { disabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', userId] })
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  if (isLoading) return <PageLoader />
  if (error || !data?.data) return <ErrorState message="Failed to load user." />

  const { profile, projects, reports, genLogs } = data.data
  const isDisabled = !!profile.disabled_at
  const role = profile.user_roles?.[0]?.role ?? 'user'
  const org = profile.org_members?.[0]?.organizations

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <Link to="/users" className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <PageHeader
          title={profile.full_name ?? profile.phone}
          subtitle={profile.company_name ?? undefined}
          action={
            <Button
              variant={isDisabled ? 'secondary' : 'danger'}
              size="sm"
              isLoading={toggleDisable.isPending}
              onClick={() => toggleDisable.mutate(!isDisabled)}
            >
              {isDisabled ? <><UserCheck size={14} /> Enable</> : <><UserX size={14} /> Disable</>}
            </Button>
          }
        />
      </div>

      {/* Profile overview */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-1 p-5">
          <div className="flex flex-col gap-3">
            <div className="h-14 w-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-2xl font-bold">
              {(profile.full_name ?? profile.phone).charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">{profile.full_name ?? '—'}</p>
              <p className="text-sm text-gray-500">{profile.phone}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isDisabled ? 'danger' : 'success'}>
                {isDisabled ? 'Disabled' : 'Active'}
              </Badge>
              <Badge variant={role === 'admin' || role === 'super_admin' ? 'purple' : 'default'}>
                {role}
              </Badge>
            </div>
            {org && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building2 size={13} />
                <Link to={`/organizations/${profile.org_members[0].organization_id}`} className="hover:text-brand-600">
                  {org.name}
                </Link>
              </div>
            )}
            <div className="text-xs text-gray-400 pt-1">
              <p>Joined: {formatDate(profile.created_at)}</p>
              <p>Updated: {formatDate(profile.updated_at)}</p>
              {isDisabled && <p className="text-red-500">Disabled: {formatDate(profile.disabled_at!)}</p>}
            </div>
          </div>
        </Card>

        <Card className="col-span-2">
          <CardHeader
            title="Generation Log"
            subtitle="Recent AI report generations"
            action={<Cpu size={16} className="text-gray-400" />}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  {['Provider', 'Model', 'In Tokens', 'Out Tokens', 'Latency', 'Confidence', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {genLogs?.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No generation logs</td></tr>
                ) : genLogs?.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2"><Badge variant="info">{l.provider}</Badge></td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{l.model}</td>
                    <td className="px-4 py-2 text-gray-700">{l.input_tokens ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-700">{l.output_tokens ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-700">{l.latency_ms != null ? `${l.latency_ms}ms` : '—'}</td>
                    <td className={`px-4 py-2 font-semibold ${confidenceColor(l.confidence)}`}>
                      {l.confidence != null ? `${l.confidence}%` : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Projects + Reports */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Recent Projects" action={<Building2 size={15} className="text-gray-400" />} />
          <div className="divide-y divide-gray-100">
            {projects?.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No projects</p>
            ) : projects?.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-medium text-gray-900 truncate flex-1">{p.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                  <span className="text-xs text-gray-400">{formatDate(p.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent Reports" action={<FileText size={15} className="text-gray-400" />} />
          <div className="divide-y divide-gray-100">
            {reports?.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No reports</p>
            ) : reports?.map((r) => (
              <Link
                key={r.id}
                to={`/reports/${r.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 truncate flex-1">
                  {r.title || 'Untitled'}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant={reportTypeVariant(r.report_type)}>{r.report_type}</Badge>
                  {r.confidence != null && (
                    <span className={`text-xs font-bold ${confidenceColor(r.confidence)}`}>
                      {r.confidence}%
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
