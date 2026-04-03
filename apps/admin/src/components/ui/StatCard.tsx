import type { ReactNode } from 'react'

interface StatCardProps {
  title: string
  value: string | number | null
  subtitle?: string
  icon?: ReactNode
  valueColor?: string
}

export function StatCard({ title, value, subtitle, icon, valueColor = 'text-gray-900' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-start gap-4">
      {icon && (
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
        <p className={`mt-1 text-2xl font-bold ${valueColor}`}>
          {value ?? '—'}
        </p>
        {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
  )
}
