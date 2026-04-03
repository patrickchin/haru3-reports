import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Users, FolderOpen } from 'lucide-react'
import { fetchOrgDetail, updateOrg } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, planVariant, statusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoader, ErrorState } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import { useState } from 'react'

export function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const qc = useQueryClient()
  const [editPlan, setEditPlan] = useState<string | null>(null)
  const [editSeats, setEditSeats] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-org', orgId],
    queryFn: () => fetchOrgDetail(orgId!),
    enabled: !!orgId,
  })

  const updateMutation = useMutation({
    mutationFn: (changes: Record<string, unknown>) => updateOrg(orgId!, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-org', orgId] }),
  })

  if (isLoading) return <PageLoader />
  if (error || !data?.data) return <ErrorState message="Failed to load organization." />

  const { org, members, projects, projectCount } = data.data

  function handleSave() {
    const changes: Record<string, unknown> = {}
    if (editPlan !== null) changes.plan = editPlan
    if (editSeats !== null) changes.max_seats = editSeats
    if (Object.keys(changes).length > 0) {
      updateMutation.mutate(changes)
    }
    setEditPlan(null)
    setEditSeats(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <Link to="/organizations" className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <PageHeader title={org.name} subtitle={org.slug} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Org details */}
        <Card className="p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Plan</p>
            {editPlan !== null ? (
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant={planVariant(org.plan)}>{org.plan}</Badge>
                <button onClick={() => setEditPlan(org.plan)} className="text-xs text-brand-600 hover:underline">edit</button>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Seats</p>
            {editSeats !== null ? (
              <Input
                type="number"
                value={editSeats}
                onChange={(e) => setEditSeats(parseInt(e.target.value))}
                min={1}
                className="h-8 text-sm"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {members.length} / {org.max_seats} used
                </span>
                <button onClick={() => setEditSeats(org.max_seats)} className="text-xs text-brand-600 hover:underline">edit</button>
              </div>
            )}
          </div>

          {(editPlan !== null || editSeats !== null) && (
            <div className="flex gap-2">
              <Button size="sm" isLoading={updateMutation.isPending} onClick={handleSave}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setEditPlan(null); setEditSeats(null) }}>
                Cancel
              </Button>
            </div>
          )}

          <div className="border-t border-gray-100 pt-3 text-xs text-gray-400 space-y-1">
            <p>Projects: {projectCount ?? 0}</p>
            <p>Created: {formatDate(org.created_at)}</p>
          </div>
        </Card>

        {/* Members */}
        <Card className="col-span-2">
          <CardHeader
            title="Members"
            subtitle={`${members.length} member${members.length !== 1 ? 's' : ''}`}
            action={<Users size={15} className="text-gray-400" />}
          />
          <div className="divide-y divide-gray-100">
            {members.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No members</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
                      {(m.profiles?.full_name ?? m.profiles?.phone ?? 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {m.profiles?.full_name ?? m.profiles?.phone ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">{m.profiles?.company_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.role === 'owner' ? 'purple' : m.role === 'admin' ? 'info' : 'default'}>
                      {m.role}
                    </Badge>
                    <span className="text-xs text-gray-400">{formatDate(m.joined_at)}</span>
                    {m.profiles?.id && (
                      <Link to={`/users/${m.profiles.id}`} className="text-xs text-brand-600 hover:underline">
                        View
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Recent projects */}
      <Card>
        <CardHeader
          title="Projects"
          subtitle={`${projectCount ?? 0} total`}
          action={<FolderOpen size={15} className="text-gray-400" />}
        />
        <div className="divide-y divide-gray-100">
          {projects?.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-400">No projects assigned to this organization</p>
          ) : (
            projects?.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-6 py-3">
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                  <span className="text-xs text-gray-400">{formatDate(p.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
