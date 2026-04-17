import { describe, it, expect } from 'vitest'
import {
  toTitleCase,
  formatDate,
  formatSourceNotes,
  getManpowerLines,
  getWeatherLines,
  getIssueMeta,
  getItemMeta,
  getActivitySummaryChips,
  getReportCompleteness,
} from './report-helpers'
import type {
  GeneratedReportManpower,
  GeneratedReportIssue,
  GeneratedReportActivity,
  GeneratedSiteReport,
} from './generated-report'

// ── toTitleCase ────────────────────────────────────────────────

describe('toTitleCase', () => {
  it('converts snake_case to Title Case', () => {
    expect(toTitleCase('in_progress')).toBe('In Progress')
  })

  it('converts kebab-case to Title Case', () => {
    expect(toTitleCase('on-hold')).toBe('On Hold')
  })

  it('handles single word', () => {
    expect(toTitleCase('completed')).toBe('Completed')
  })

  it('collapses multiple spaces', () => {
    expect(toTitleCase('hello    world')).toBe('Hello World')
  })

  it('trims whitespace', () => {
    expect(toTitleCase('  hello  ')).toBe('Hello')
  })

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('')
  })
})

// ── formatDate ─────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('')
  })

  it('formats ISO date string', () => {
    const result = formatDate('2026-04-15T10:00:00Z')
    expect(result).toMatch(/Apr/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2026/)
  })
})

// ── formatSourceNotes ──────────────────────────────────────────

describe('formatSourceNotes', () => {
  it('returns formatted string for non-empty indexes', () => {
    expect(formatSourceNotes([1, 3])).toBe('Source notes: 1, 3')
  })

  it('returns null for empty array', () => {
    expect(formatSourceNotes([])).toBeNull()
  })

  it('handles single index', () => {
    expect(formatSourceNotes([5])).toBe('Source notes: 5')
  })
})

// ── getManpowerLines ───────────────────────────────────────────

describe('getManpowerLines', () => {
  it('returns empty array for null', () => {
    expect(getManpowerLines(null)).toEqual([])
  })

  it('includes total workers line', () => {
    const manpower: GeneratedReportManpower = {
      totalWorkers: 12,
      workerHours: null,
      notes: null,
      roles: [],
    }
    const lines = getManpowerLines(manpower)
    expect(lines).toContain('12 workers recorded on site.')
  })

  it('includes worker hours', () => {
    const manpower: GeneratedReportManpower = {
      totalWorkers: null,
      workerHours: '96 hours',
      notes: null,
      roles: [],
    }
    const lines = getManpowerLines(manpower)
    expect(lines).toContain('Worker hours: 96 hours')
  })

  it('includes notes', () => {
    const manpower: GeneratedReportManpower = {
      totalWorkers: null,
      workerHours: null,
      notes: 'Short staffed today',
      roles: [],
    }
    const lines = getManpowerLines(manpower)
    expect(lines).toContain('Short staffed today')
  })

  it('formats roles with count and notes', () => {
    const manpower: GeneratedReportManpower = {
      totalWorkers: null,
      workerHours: null,
      notes: null,
      roles: [
        { role: 'Electricians', count: 4, notes: 'Level 2' },
        { role: 'Labourers', count: null, notes: null },
      ],
    }
    const lines = getManpowerLines(manpower)
    expect(lines).toContain('4 Electricians - Level 2')
    expect(lines).toContain('Labourers')
  })

  it('handles all fields populated', () => {
    const manpower: GeneratedReportManpower = {
      totalWorkers: 8,
      workerHours: '64 hours',
      notes: 'Good progress',
      roles: [{ role: 'Crew', count: 8, notes: null }],
    }
    const lines = getManpowerLines(manpower)
    expect(lines).toHaveLength(4)
  })
})

// ── getWeatherLines ────────────────────────────────────────────

describe('getWeatherLines', () => {
  it('returns empty array when weather is null', () => {
    const report = makeReport({ weather: null })
    expect(getWeatherLines(report)).toEqual([])
  })

  it('includes conditions', () => {
    const report = makeReport({
      weather: { conditions: 'Sunny', temperature: null, wind: null, impact: null },
    })
    expect(getWeatherLines(report)).toEqual(['Sunny'])
  })

  it('includes all weather fields', () => {
    const report = makeReport({
      weather: {
        conditions: 'Overcast',
        temperature: '22°C',
        wind: 'Light breeze',
        impact: 'No impact on work',
      },
    })
    const lines = getWeatherLines(report)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('Overcast')
    expect(lines[1]).toBe('Temperature: 22°C')
    expect(lines[2]).toBe('Wind: Light breeze')
    expect(lines[3]).toBe('Impact: No impact on work')
  })

  it('filters out null fields', () => {
    const report = makeReport({
      weather: {
        conditions: 'Rain',
        temperature: null,
        wind: null,
        impact: 'Delayed exterior work',
      },
    })
    const lines = getWeatherLines(report)
    expect(lines).toEqual(['Rain', 'Impact: Delayed exterior work'])
  })
})

// ── getIssueMeta ───────────────────────────────────────────────

describe('getIssueMeta', () => {
  it('joins category, severity, and status', () => {
    const issue: GeneratedReportIssue = {
      title: 'Test',
      category: 'safety',
      severity: 'high',
      status: 'open',
      details: 'Details',
      actionRequired: null,
      sourceNoteIndexes: [],
    }
    expect(getIssueMeta(issue)).toBe('Safety • High • Open')
  })

  it('filters out empty strings', () => {
    const issue: GeneratedReportIssue = {
      title: 'Test',
      category: '',
      severity: 'medium',
      status: 'open',
      details: 'Details',
      actionRequired: null,
      sourceNoteIndexes: [],
    }
    expect(getIssueMeta(issue)).toBe('Medium • Open')
  })
})

// ── getItemMeta ────────────────────────────────────────────────

describe('getItemMeta', () => {
  it('joins non-null values with bullet', () => {
    expect(getItemMeta(['A', 'B', 'C'])).toBe('A • B • C')
  })

  it('filters out null values', () => {
    expect(getItemMeta(['A', null, 'C'])).toBe('A • C')
  })

  it('returns empty string for all nulls', () => {
    expect(getItemMeta([null, null])).toBe('')
  })
})

// ── getActivitySummaryChips ────────────────────────────────────

describe('getActivitySummaryChips', () => {
  it('includes title-cased status, location, and worker count', () => {
    const activity: GeneratedReportActivity = {
      name: 'Concrete pour',
      location: 'Zone A',
      status: 'in_progress',
      summary: 'Pouring concrete.',
      sourceNoteIndexes: [],
      manpower: {
        totalWorkers: 5,
        workerHours: null,
        notes: null,
        roles: [],
      },
      materials: [],
      equipment: [],
      issues: [],
      observations: [],
    }
    const chips = getActivitySummaryChips(activity)
    expect(chips).toEqual(['In Progress', 'Zone A', '5 workers'])
  })

  it('omits null location and null manpower', () => {
    const activity: GeneratedReportActivity = {
      name: 'Inspection',
      location: null,
      status: 'completed',
      summary: 'All clear.',
      sourceNoteIndexes: [],
      manpower: null,
      materials: [],
      equipment: [],
      issues: [],
      observations: [],
    }
    const chips = getActivitySummaryChips(activity)
    expect(chips).toEqual(['Completed'])
  })
})

// ── getReportCompleteness ──────────────────────────────────────

describe('getReportCompleteness', () => {
  it('returns 0 for a completely empty report', () => {
    const report = makeReport({})
    expect(getReportCompleteness(report)).toBe(0)
  })

  it('returns 100 for a fully populated report', () => {
    const report = makeReport({
      meta: {
        title: 'Full Report',
        reportType: 'daily',
        summary: 'A summary.',
        visitDate: '2026-04-15',
      },
      weather: { conditions: 'Sunny', temperature: null, wind: null, impact: null },
      manpower: { totalWorkers: 10, workerHours: null, notes: null, roles: [] },
      activities: [{
        name: 'Work',
        location: null,
        status: 'completed',
        summary: 'Done.',
        sourceNoteIndexes: [],
        manpower: null,
        materials: [],
        equipment: [],
        issues: [],
        observations: [],
      }],
      siteConditions: [{ topic: 'Access', details: 'Open' }],
      nextSteps: ['Continue'],
    })
    expect(getReportCompleteness(report)).toBe(100)
  })

  it('returns partial score for partially filled report', () => {
    const report = makeReport({
      meta: {
        title: 'Partial',
        reportType: 'daily',
        summary: 'Some summary.',
        visitDate: null,
      },
    })
    // title, summary, reportType are checked — 2 of 8 checks pass (title != "", summary != "")
    // Actually: title!="", summary!="", visitDate is null (false), weather null (false),
    // manpower null (false), activities empty (false), siteConditions empty (false), nextSteps empty (false)
    // = 2/8 = 25%
    expect(getReportCompleteness(report)).toBe(25)
  })
})

// ── Test helpers ───────────────────────────────────────────────

function makeReport(
  overrides: Partial<GeneratedSiteReport['report']> = {},
): GeneratedSiteReport {
  return {
    report: {
      meta: overrides.meta ?? {
        title: '',
        reportType: '',
        summary: '',
        visitDate: null,
      },
      weather: overrides.weather ?? null,
      manpower: overrides.manpower ?? null,
      siteConditions: overrides.siteConditions ?? [],
      activities: overrides.activities ?? [],
      issues: overrides.issues ?? [],
      nextSteps: overrides.nextSteps ?? [],
      sections: overrides.sections ?? [],
    },
  }
}
