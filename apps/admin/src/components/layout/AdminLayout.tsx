import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/contexts/auth'
import { PageLoader } from '@/components/ui/Spinner'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function AdminLayout() {
  const { isLoading, session, isAdmin } = useAuth()

  // DEV ONLY: skip auth checks
  if (import.meta.env.DEV) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-xl mx-auto px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <PageLoader />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-50">
        <p className="text-lg font-semibold text-gray-800">Access Denied</p>
        <p className="text-sm text-gray-500">Your account does not have admin privileges.</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-screen-xl mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
