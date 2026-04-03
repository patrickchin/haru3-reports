import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, UserX, UserCheck } from 'lucide-react'
import { fetchUsers, updateUser, type AdminUser } from '@/lib/admin-api'
import { PageHeader } from '@/components/layout/AdminLayout'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'

export function UsersPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', search, showDisabled, page],
    queryFn: () =>
      fetchUsers({ search, disabled: showDisabled, page, limit: 25 }),
  })

  const toggleDisable = useMutation({
    mutationFn: ({ userId, disabled }: { userId: string; disabled: boolean }) =>
      updateUser(userId, { disabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (u: AdminUser) => (
        <div>
          <p className="font-medium text-gray-900">{u.full_name ?? '—'}</p>
          <p className="text-xs text-gray-500">{u.phone}</p>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      render: (u: AdminUser) => <span className="text-gray-700">{u.company_name ?? '—'}</span>,
    },
    {
      key: 'org',
      header: 'Organization',
      render: (u: AdminUser) => {
        const org = u.org_members?.[0]?.organizations
        return org ? (
          <span className="text-gray-700">{org.name}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )
      },
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: AdminUser) => {
        const role = u.user_roles?.[0]?.role ?? 'user'
        const variantMap: Record<string, 'default' | 'danger' | 'purple' | 'info'> = {
          user: 'default',
          org_admin: 'info',
          admin: 'purple',
          super_admin: 'danger',
        }
        return <Badge variant={variantMap[role] ?? 'default'}>{role}</Badge>
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (u: AdminUser) =>
        u.disabled_at ? (
          <Badge variant="danger">Disabled</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        ),
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (u: AdminUser) => <span className="text-gray-500">{formatDate(u.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (u: AdminUser) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleDisable.mutate({ userId: u.id, disabled: !u.disabled_at })
          }}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            u.disabled_at
              ? 'text-green-700 bg-green-50 hover:bg-green-100'
              : 'text-red-700 bg-red-50 hover:bg-red-100'
          }`}
        >
          {u.disabled_at ? (
            <><UserCheck size={13} /> Enable</>
          ) : (
            <><UserX size={13} /> Disable</>
          )}
        </button>
      ),
    },
  ]

  if (error) return <ErrorState message="Failed to load users." />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle={`${data?.meta?.total ?? 0} total users`}
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 max-w-sm">
          <Input
            placeholder="Search name, phone, company…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Search size={14} />
          </Button>
        </form>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => { setShowDisabled(e.target.checked); setPage(1) }}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Show disabled
        </label>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(u) => u.id}
        isLoading={isLoading}
        total={data?.meta?.total}
        page={page}
        limit={25}
        onPageChange={setPage}
        onRowClick={(u) => navigate(`/users/${u.id}`)}
        emptyMessage="No users found."
      />
    </div>
  )
}
