/** Format ISO date strings to a readable local date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Format ISO date strings to date + time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Return Tailwind color class for a confidence score. */
export function confidenceColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400'
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

/** Capitalize the first letter of a string. */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** Build a query string from an object (omits null/empty values). */
export function buildQueryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val !== null && val !== undefined && val !== '') {
      qs.set(key, String(val))
    }
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}
