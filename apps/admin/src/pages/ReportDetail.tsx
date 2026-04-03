import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Cpu } from 'lucide-react'
import { fetchReportDetail } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, reportTypeVariant, statusVariant } from '@/components/ui/Badge'
import { PageLoader, ErrorState } from '@/components/ui/Spinner'
import { formatDate, confidenceColor } from '@/lib/utils'

export function ReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-report', reportId],
    queryFn: () => fetchReportDetail(reportId!),
    enabled: !!reportId,
  })

  if (isLoading) return <PageLoader />
  if (error || !data?.data) return <ErrorState message="Failed to load report." />

  const { report, generationLog } = data.data
  const meta = (report.report_data as Record<string, { meta?: Record<string, unknown> }>)?.report?.meta as Record<string, string> | undefined

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <Link to="/reports" className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <PageHeader
          title={report.title || 'Untitled Report'}
          subtitle={`${report.projects?.name ?? 'Unknown project'} · ${formatDate(report.visit_date)}`}
        />
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={reportTypeVariant(report.report_type)}>{report.report_type}</Badge>
        <Badge variant={statusVariant(report.status)}>{report.status}</Badge>
        {report.confidence != null && (
          <span className={`text-sm font-bold ${confidenceColor(report.confidence)}`}>
            Confidence: {report.confidence}%
          </span>
        )}
        <span className="text-sm text-gray-500">
          by{' '}
          <Link to={`/users/${report.profiles?.id}`} className="text-brand-600 hover:underline">
            {report.profiles?.full_name ?? report.profiles?.phone ?? 'Unknown'}
          </Link>
        </span>
        <span className="text-xs text-gray-400">Created: {formatDate(report.created_at)}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Summary */}
        <Card className="col-span-2">
          <CardHeader title="Report Summary" />
          <div className="px-6 py-4 space-y-3">
            {meta?.summary ? (
              <p className="text-sm text-gray-700 leading-relaxed">{meta.summary}</p>
            ) : (
              <p className="text-sm text-gray-400">No summary available</p>
            )}

            {/* Notes list */}
            {Array.isArray(report.notes) && report.notes.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  Voice Notes ({report.notes.length})
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  {(report.notes as string[]).map((note, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      {note}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Card>

        {/* Metadata panel */}
        <Card className="p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Project</p>
            <p className="text-sm font-medium text-gray-900">{report.projects?.name ?? '—'}</p>
            {report.projects?.address && (
              <p className="text-xs text-gray-500 mt-0.5">{report.projects.address}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">User</p>
            <p className="text-sm font-medium text-gray-900">
              {report.profiles?.full_name ?? report.profiles?.phone ?? '—'}
            </p>
            {report.profiles?.company_name && (
              <p className="text-xs text-gray-500 mt-0.5">{report.profiles.company_name}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Visit Date</p>
            <p className="text-sm text-gray-700">{formatDate(report.visit_date)}</p>
          </div>
        </Card>
      </div>

      {/* Generation log */}
      {generationLog.length > 0 && (
        <Card>
          <CardHeader
            title="AI Generation History"
            subtitle={`${generationLog.length} calls`}
            action={<Cpu size={15} className="text-gray-400" />}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['#', 'Provider', 'Model', 'In Tokens', 'Out Tokens', 'Latency', 'Confidence', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {generationLog.map((l, i) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
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
      )}

      {/* Raw data (collapsed) */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <span className="group-open:hidden">▶</span>
          <span className="hidden group-open:inline">▼</span>
          Raw report_data JSON
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-800 text-gray-100 p-4 text-xs leading-relaxed">
          {JSON.stringify(report.report_data, null, 2)}
        </pre>
      </details>
    </div>
  )
}
