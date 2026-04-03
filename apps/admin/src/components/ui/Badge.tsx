type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

interface BadgeProps {
  variant?: Variant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Map common status/plan strings to badge variants. */
export function planVariant(plan: string): Variant {
  const map: Record<string, Variant> = {
    free: 'default',
    pro: 'info',
    enterprise: 'purple',
  }
  return map[plan] ?? 'default'
}

export function statusVariant(status: string): Variant {
  const map: Record<string, Variant> = {
    active: 'success',
    delayed: 'warning',
    completed: 'info',
    archived: 'default',
    draft: 'warning',
    final: 'success',
  }
  return map[status] ?? 'default'
}

export function reportTypeVariant(type: string): Variant {
  const map: Record<string, Variant> = {
    daily: 'info',
    safety: 'warning',
    incident: 'danger',
    inspection: 'purple',
    site_visit: 'default',
    progress: 'success',
  }
  return map[type] ?? 'default'
}
