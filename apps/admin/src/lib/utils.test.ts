import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  clamp,
  confidenceColor,
  capitalize,
  buildQueryString,
} from './utils'

describe('formatDate', () => {
  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })

  it('returns dash for empty string', () => {
    expect(formatDate('')).toBe('—')
  })

  it('formats a valid ISO date', () => {
    const result = formatDate('2026-03-15T10:00:00Z')
    expect(result).toMatch(/Mar/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2026/)
  })
})

describe('formatDateTime', () => {
  it('returns dash for null', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })

  it('formats a valid ISO date with time', () => {
    const result = formatDateTime('2026-03-15T10:30:00Z')
    expect(result).toMatch(/Mar/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2026/)
  })
})

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('clamps to min when below', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  it('clamps to max when above', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0)
  })

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('confidenceColor', () => {
  it('returns gray for null', () => {
    expect(confidenceColor(null)).toBe('text-gray-400')
  })

  it('returns gray for undefined', () => {
    expect(confidenceColor(undefined)).toBe('text-gray-400')
  })

  it('returns green for high confidence (>=80)', () => {
    expect(confidenceColor(80)).toBe('text-green-600')
    expect(confidenceColor(95)).toBe('text-green-600')
    expect(confidenceColor(100)).toBe('text-green-600')
  })

  it('returns yellow for medium confidence (60-79)', () => {
    expect(confidenceColor(60)).toBe('text-yellow-600')
    expect(confidenceColor(70)).toBe('text-yellow-600')
    expect(confidenceColor(79)).toBe('text-yellow-600')
  })

  it('returns red for low confidence (<60)', () => {
    expect(confidenceColor(0)).toBe('text-red-600')
    expect(confidenceColor(30)).toBe('text-red-600')
    expect(confidenceColor(59)).toBe('text-red-600')
  })
})

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A')
  })

  it('handles already capitalized', () => {
    expect(capitalize('Hello')).toBe('Hello')
  })

  it('handles empty string', () => {
    expect(capitalize('')).toBe('')
  })
})

describe('buildQueryString', () => {
  it('returns empty string for empty params', () => {
    expect(buildQueryString({})).toBe('')
  })

  it('builds query string from params', () => {
    const result = buildQueryString({ page: 1, limit: 10 })
    expect(result).toBe('?page=1&limit=10')
  })

  it('omits null values', () => {
    const result = buildQueryString({ page: 1, search: null })
    expect(result).toBe('?page=1')
  })

  it('omits undefined values', () => {
    const result = buildQueryString({ page: 1, search: undefined })
    expect(result).toBe('?page=1')
  })

  it('omits empty string values', () => {
    const result = buildQueryString({ page: 1, search: '' })
    expect(result).toBe('?page=1')
  })

  it('handles boolean values', () => {
    const result = buildQueryString({ disabled: true })
    expect(result).toBe('?disabled=true')
  })

  it('handles string values', () => {
    const result = buildQueryString({ search: 'test' })
    expect(result).toBe('?search=test')
  })
})
