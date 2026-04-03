import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { fetchOrgs, createOrg, type AdminOrg } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { DataTable } from '@/components/ui/DataTable'
import { Badge, planVariant } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function OrganizationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newPlan, setNewPlan] = useState<'free' | 'pro' | 'enterprise'>('free')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-orgs', search, page],
    queryFn: () => fetchOrgs({ search, page, limit: 25 }),
  })

  const createMutation = useMutation({
    mutationFn: () => createOrg({ name: newName, slug: newSlug, plan: newPlan, max_seats: 5 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-orgs'] })
      setShowCreate(false)
      setNewName('')
      setNewSlug('')
      setNewPlan('free')
    },
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  function handleNameChange(name: string) {
    setNewName(name)
    setNewSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (o: AdminOrg) => (
        <div>
          <p className="font-medium text-gray-900">{o.name}</p>
          <p className="text-xs text-gray-500">{o.slug}</p>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (o: AdminOrg) => <Badge variant={planVariant(o.plan)}>{o.plan}</Badge>,
    },
    {
      key: 'members',
      header: 'Members',
      render: (o: AdminOrg) => (
        <span className="text-gray-700">{o.member_count} / {o.max_seats}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (o: AdminOrg) => <span className="text-gray-500">{formatDate(o.created_at)}</span>,
    },
  ]

  if (error) return <ErrorState message="Failed to load organizations." />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Organizations"
        subtitle={`${data?.meta?.total ?? 0} organizations`}
        action={
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={14} /> New Org
          </Button>
        }
      />

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Create Organization</h3>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Name"
              value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corp"
            />
            <Input
              label="Slug"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="acme-corp"
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Plan</label>
              <select
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value as typeof newPlan)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create'}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" isLoading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Create
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-sm">
        <Input
          placeholder="Search name or slug…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-9"
        />
        <Button type="submit" variant="secondary" size="sm">
          <Search size={14} />
        </Button>
      </form>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(o) => o.id}
        isLoading={isLoading}
        total={data?.meta?.total}
        page={page}
        limit={25}
        onPageChange={setPage}
        onRowClick={(o) => navigate(`/organizations/${o.id}`)}
        emptyMessage="No organizations found."
      />
    </div>
  )
}
