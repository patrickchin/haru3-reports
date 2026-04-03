import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { AuthProvider } from '@/contexts/auth'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { UsersPage } from '@/pages/Users'
import { UserDetailPage } from '@/pages/UserDetail'
import { OrganizationsPage } from '@/pages/Organizations'
import { OrgDetailPage } from '@/pages/OrgDetail'
import { ReportsPage } from '@/pages/Reports'
import { ReportDetailPage } from '@/pages/ReportDetail'
import { AnalyticsPage } from '@/pages/Analytics'
import { AuditLogPage } from '@/pages/AuditLog'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/:userId" element={<UserDetailPage />} />
              <Route path="organizations" element={<OrganizationsPage />} />
              <Route path="organizations/:orgId" element={<OrgDetailPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="reports/:reportId" element={<ReportDetailPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="audit" element={<AuditLogPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
