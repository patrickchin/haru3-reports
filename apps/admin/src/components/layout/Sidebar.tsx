import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  BarChart3,
  Shield,
  LogOut,
  HardHat,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/organizations', icon: Building2, label: 'Organizations' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/audit', icon: Shield, label: 'Audit Log' },
]

export function Sidebar() {
  const { signOut, user } = useAuth()
  const location = useLocation()

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <HardHat size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-none">Harpa Pro</p>
          <p className="text-xs text-brand-600 font-medium">Admin</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, exact }) => {
          const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className={`
                flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-gray-100 px-3 py-3">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
            {(user?.email ?? 'A').charAt(0).toUpperCase()}
          </div>
          <p className="text-xs text-gray-600 truncate flex-1">{user?.email}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
