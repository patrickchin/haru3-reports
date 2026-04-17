import { describe, it, expect } from 'vitest'
import { normalizeGeneratedReportPayload } from './generated-report'

// ── normalizeGeneratedReportPayload ────────────────────────────

describe('normalizeGeneratedReportPayload', () => {
  it('returns null for non-object input', () => {
    expect(normalizeGeneratedReportPayload(null)).toBeNull()
    expect(normalizeGeneratedReportPayload(undefined)).toBeNull()
    expect(normalizeGeneratedReportPayload('string')).toBeNull()
    expect(normalizeGeneratedReportPayload(42)).toBeNull()
    expect(normalizeGeneratedReportPayload([])).toBeNull()
  })

  it('returns null when report key is missing', () => {
    expect(normalizeGeneratedReportPayload({})).toBeNull()
    expect(normalizeGeneratedReportPayload({ data: {} })).toBeNull()
  })

  it('returns null when meta is missing', () => {
    expect(normalizeGeneratedReportPayload({ report: {} })).toBeNull()
    expect(normalizeGeneratedReportPayload({ report: { meta: 'nope' } })).toBeNull()
  })

  it('returns null when title is empty', () => {
    const input = {
      report: {
        meta: { title: '', reportType: 'daily', summary: 'Summary' },
      },
    }
    expect(normalizeGeneratedReportPayload(input)).toBeNull()
  })

  it('returns null when summary is empty', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: '' },
      },
    }
    expect(normalizeGeneratedReportPayload(input)).toBeNull()
  })

  it('normalizes a minimal valid report', () => {
    const input = {
      report: {
        meta: { title: 'My Report', reportType: 'daily', summary: 'A summary' },
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result).not.toBeNull()
    expect(result!.report.meta.title).toBe('My Report')
    expect(result!.report.meta.reportType).toBe('daily')
    expect(result!.report.meta.summary).toBe('A summary')
    expect(result!.report.meta.visitDate).toBeNull()
    expect(result!.report.weather).toBeNull()
    expect(result!.report.manpower).toBeNull()
    expect(result!.report.activities).toEqual([])
    expect(result!.report.issues).toEqual([])
    expect(result!.report.siteConditions).toEqual([])
    expect(result!.report.nextSteps).toEqual([])
    expect(result!.report.sections).toEqual([])
  })

  it('defaults reportType to site_visit when empty', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: '', summary: 'Summary' },
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.meta.reportType).toBe('site_visit')
  })

  it('trims string values', () => {
    const input = {
      report: {
        meta: { title: '  Title  ', reportType: '  daily  ', summary: '  Summary  ' },
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.meta.title).toBe('Title')
    expect(result!.report.meta.summary).toBe('Summary')
  })

  it('normalizes weather data', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        weather: {
          conditions: 'Sunny',
          temperature: '25°C',
          wind: null,
          impact: null,
        },
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.weather).toEqual({
      conditions: 'Sunny',
      temperature: '25°C',
      wind: null,
      impact: null,
    })
  })

  it('normalizes manpower data with roles', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        manpower: {
          totalWorkers: 10,
          workerHours: '80h',
          notes: 'All hands on deck',
          roles: [
            { role: 'Electricians', count: 4, notes: null },
            { role: '', count: 2, notes: null }, // invalid: empty role
          ],
        },
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.manpower!.totalWorkers).toBe(10)
    expect(result!.report.manpower!.roles).toHaveLength(1)
    expect(result!.report.manpower!.roles[0].role).toBe('Electricians')
  })

  it('coerces string numbers for totalWorkers', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        manpower: {
          totalWorkers: '5',
          workerHours: null,
          notes: null,
          roles: [],
        },
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.manpower!.totalWorkers).toBe(5)
  })

  it('normalizes activities, skipping invalid ones', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        activities: [
          { name: 'Good Activity', summary: 'Did stuff' },
          { name: '', summary: 'Missing name' }, // skipped
          { name: 'No summary', summary: '' }, // skipped
          'not an object', // skipped
        ],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.activities).toHaveLength(1)
    expect(result!.report.activities[0].name).toBe('Good Activity')
    expect(result!.report.activities[0].status).toBe('reported')
  })

  it('normalizes issues, skipping incomplete ones', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        issues: [
          { title: 'Valid Issue', details: 'Something happened', severity: 'high' },
          { title: '', details: 'No title' }, // skipped
          { title: 'No details', details: '' }, // skipped
        ],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.issues).toHaveLength(1)
    expect(result!.report.issues[0].title).toBe('Valid Issue')
    expect(result!.report.issues[0].severity).toBe('high')
    expect(result!.report.issues[0].category).toBe('other')
  })

  it('normalizes sections, skipping incomplete', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        sections: [
          { title: 'Work Progress', content: 'Good progress' },
          { title: '', content: 'No title' }, // skipped
          { title: 'No Content', content: '' }, // skipped
        ],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.sections).toHaveLength(1)
    expect(result!.report.sections[0].title).toBe('Work Progress')
  })

  it('normalizes site conditions', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        siteConditions: [
          { topic: 'Access', details: 'Road works nearby' },
          { topic: '', details: 'Missing topic' }, // skipped
        ],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.siteConditions).toHaveLength(1)
  })

  it('normalizes nextSteps as string array', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        nextSteps: ['Step 1', '', 42, 'Step 2'],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.nextSteps).toEqual(['Step 1', 'Step 2'])
  })

  it('normalizes sourceNoteIndexes, deduplicating and sorting', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        activities: [{
          name: 'Activity',
          summary: 'Summary',
          sourceNoteIndexes: [3, 1, 3, '2', 0, -1],
        }],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.activities[0].sourceNoteIndexes).toEqual([1, 2, 3])
  })

  it('normalizes materials within activities', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        activities: [{
          name: 'Activity',
          summary: 'Summary',
          materials: [
            { name: 'Concrete', quantity: '10 m³', status: 'delivered' },
            { name: '', quantity: '5' }, // skipped
          ],
        }],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.activities[0].materials).toHaveLength(1)
    expect(result!.report.activities[0].materials[0].name).toBe('Concrete')
  })

  it('normalizes equipment within activities', () => {
    const input = {
      report: {
        meta: { title: 'Title', reportType: 'daily', summary: 'Summary' },
        activities: [{
          name: 'Activity',
          summary: 'Summary',
          equipment: [
            { name: 'Crane', quantity: '1', status: 'operational' },
            { name: '' }, // skipped
          ],
        }],
      },
    }
    const result = normalizeGeneratedReportPayload(input)
    expect(result!.report.activities[0].equipment).toHaveLength(1)
    expect(result!.report.activities[0].equipment[0].name).toBe('Crane')
  })

  it('handles a full realistic report', () => {
    const input = {
      report: {
        meta: {
          title: 'Daily Site Report',
          reportType: 'daily',
          summary: 'Productive day with good weather. Concrete pour completed.',
          visitDate: '2026-04-15',
        },
        weather: {
          conditions: 'Sunny',
          temperature: '22°C',
          wind: 'Light',
          impact: null,
        },
        manpower: {
          totalWorkers: 15,
          workerHours: '120h',
          notes: null,
          roles: [
            { role: 'Concrete crew', count: 8, notes: 'Zone A' },
            { role: 'Labourers', count: 7, notes: null },
          ],
        },
        siteConditions: [
          { topic: 'Access', details: 'All clear' },
        ],
        activities: [
          {
            name: 'Concrete Pour',
            location: 'Zone A',
            status: 'completed',
            summary: 'Poured 40m³ of concrete.',
            sourceNoteIndexes: [1],
            materials: [{ name: 'Concrete', quantity: '40 m³' }],
            equipment: [{ name: 'Pump truck', status: 'operational' }],
            issues: [],
            observations: ['Good finish quality'],
          },
        ],
        issues: [
          {
            title: 'Delayed rebar delivery',
            category: 'schedule',
            severity: 'medium',
            status: 'open',
            details: 'Rebar arrived 2 hours late.',
            actionRequired: 'Follow up with supplier.',
            sourceNoteIndexes: [2],
          },
        ],
        nextSteps: ['Continue concrete pour Zone B', 'Follow up rebar supplier'],
        sections: [
          { title: 'Work Progress', content: 'Concrete pour completed in Zone A.', sourceNoteIndexes: [1] },
        ],
      },
    }

    const result = normalizeGeneratedReportPayload(input)
    expect(result).not.toBeNull()
    expect(result!.report.meta.title).toBe('Daily Site Report')
    expect(result!.report.activities).toHaveLength(1)
    expect(result!.report.issues).toHaveLength(1)
    expect(result!.report.manpower!.roles).toHaveLength(2)
    expect(result!.report.nextSteps).toHaveLength(2)
  })
})
