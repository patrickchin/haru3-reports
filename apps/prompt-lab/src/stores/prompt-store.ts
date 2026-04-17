import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Variable } from '../types'
import { extractVariableKeys } from '../lib/template-engine'

const DEFAULT_SYSTEM_PROMPT = `You are a construction site report assistant. You build and update structured JSON reports from voice notes.

You will receive:
1. The current report JSON (under "CURRENT REPORT") — this may be empty for the first set of notes
2. ALL field notes so far (under "ALL NOTES")

Return ONLY valid JSON with the key "patch" containing the fields that need to change or be added.

The report schema has these top-level keys:

"meta": { "title": "...", "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": "...", "visitDate": "YYYY-MM-DD" or null }

"weather": { "conditions": "...", "temperature": "...", "wind": "...", "impact": "..." } or null

"manpower": { "totalWorkers": number, "workerHours": "...", "workersCostPerDay": "...", "workersCostCurrency": "...", "notes": "...", "roles": [{ "role": "...", "count": number, "notes": "..." }] } or null

"siteConditions": [{ "topic": "...", "details": "..." }]

"activities": [ Main backbone of the report. Each has:
  { "name": "...", "description": "...", "location": "...", "status": "...", "summary": "...",
    "contractors": "...", "engineers": "...", "visitors": "...",
    "startDate": "YYYY-MM-DD" or null, "endDate": "YYYY-MM-DD" or null,
    "sourceNoteIndexes": [1, 2],
    "manpower": same structure as top-level manpower or null,
    "materials": [{ "name": "...", "quantity": "...", "quantityUnit": "...", "unitCost": "...", "unitCostCurrency": "...", "totalCost": "...", "totalCostCurrency": "...", "condition": "...", "status": "...", "notes": "..." }],
    "equipment": [{ "name": "...", "quantity": "...", "cost": "...", "costCurrency": "...", "condition": "...", "ownership": "...", "status": "...", "hoursUsed": "...", "notes": "..." }],
    "issues": [{ "title": "...", "category": "...", "severity": "...", "status": "...", "details": "...", "actionRequired": "...", "sourceNoteIndexes": [] }],
    "observations": ["..."]
  }
]

"issues": [ Top-level issues not tied to activities. Same structure as activity issues. ]

"nextSteps": ["..."]

"sections": [{ "title": "...", "content": "markdown string", "sourceNoteIndexes": [1, 2] }]

Rules for the patch:
- For scalar fields (meta.summary, weather.temperature, etc.): include the new value to replace the old one.
- For array items (activities, issues, materials, equipment, siteConditions, sections):
  - To UPDATE an existing item: include it with the same "name"/"title"/"topic" and the changed fields.
  - To ADD a new item: include the full new item in the array.
  - NEVER remove items. Only include items that are new or changed.
- For string arrays (nextSteps, observations): include only NEW strings to add.
- For sourceNoteIndexes: include only NEW indexes to add (they will be merged).
- Omit any field that hasn't changed.
- NEVER invent data that isn't in the notes.
- Keep the patch as small as possible — only what's new or changed.
- Omit fields whose value is null or an empty array — they waste tokens and are treated as absent.
- Build activities as the main structured backbone of the report.
- Keep strings concise.
- Materials/equipment go inside their relevant activity.
- Extract ALL materials mentioned in notes into the materials array — concrete mixes, steel/reo, timber, pipes, membranes, fixings, windows, etc. If a note mentions a material by name, spec, or quantity it belongs in materials.
- Extract ALL equipment/plant mentioned — excavators, cranes, rollers, pumps, etc. Include hours, condition, and operator if noted.
- Always populate meta.title and meta.summary even for small note sets. Title should be a short descriptive label for the day's work.
- sourceNoteIndexes reference the [n] numbers from input.
- Deduplicate repeated facts.

Example patch format:
{
  "patch": {
    "meta": { "summary": "Updated summary including new info" },
    "activities": [
      { "name": "Existing Activity", "status": "completed", "summary": "Updated summary" },
      { "name": "Brand New Activity", "status": "in_progress", "summary": "...", "sourceNoteIndexes": [5] }
    ],
    "nextSteps": ["New step to add"]
  }
}`

const DEFAULT_USER_MESSAGE = `CURRENT REPORT:
{{currentReport}}

ALL NOTES:
{{notes}}`

const DEFAULT_EMPTY_REPORT = JSON.stringify({
  report: {
    meta: { title: "", reportType: "site_visit", summary: "", visitDate: null },
    weather: null,
    manpower: null,
    siteConditions: [],
    activities: [],
    issues: [],
    nextSteps: [],
    sections: [],
  },
}, null, 2)

const DEFAULT_NOTES = `[1] alright so just got on site its about 6:45, still pretty dark out. weather looks ok for now but theres meant to be rain this arvo
[2] ok so the concreters are already here setting up for the slab pour in zone B. think theres about 6 of them plus the pump truck just rolled in
[3] sparky's not here yet, was supposed to be here at 6:30 to finish the conduit runs before the pour. gonna give him a call
[4] site temp is about 12 degrees, overcast. wind is pretty calm maybe 5-10 kph from the west
[5] crane operator Johnno is doing his pre-start checks now. we need the crane for lifting the precast panels on level 2 this morning
[6] delivery truck just showed up with the precast panels. 8 panels total for the north and east walls. 5 north 3 east
[7] concrete pump is set up and ready. formwork fixed. starting the pour now, about 8:15. mix is 32 MPA as speced
[8] plumber just came up to me saying he needs access to zone C for the rough-in but theres materials stacked everywhere
[9] had about 22 workers on site today total. good productive day. need to order more 12mm reo for next weeks column pours, running low`

interface PromptState {
  systemPrompt: string
  variables: Variable[]
  userMessage: string
  setSystemPrompt: (prompt: string) => void
  setUserMessage: (msg: string) => void
  addVariable: (key?: string) => void
  updateVariable: (index: number, field: 'key' | 'value', val: string) => void
  removeVariable: (index: number) => void
  syncVariablesFromTemplate: () => void
}

export const usePromptStore = create(
  immer<PromptState>((set, get) => ({
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    variables: [
      { key: 'currentReport', value: DEFAULT_EMPTY_REPORT },
      { key: 'notes', value: DEFAULT_NOTES },
    ],
    userMessage: DEFAULT_USER_MESSAGE,

    setSystemPrompt: (prompt) =>
      set((draft) => {
        draft.systemPrompt = prompt
      }),

    setUserMessage: (msg) =>
      set((draft) => {
        draft.userMessage = msg
      }),

    addVariable: (key = '') =>
      set((draft) => {
        draft.variables.push({ key, value: '' })
      }),

    updateVariable: (index, field, val) =>
      set((draft) => {
        draft.variables[index][field] = val
      }),

    removeVariable: (index) =>
      set((draft) => {
        draft.variables.splice(index, 1)
      }),

    syncVariablesFromTemplate: () => {
      const { systemPrompt, variables } = get()
      const keys = extractVariableKeys(systemPrompt)
      const existing = new Map(variables.map((v) => [v.key, v.value]))
      set((draft) => {
        draft.variables = keys.map((k) => ({ key: k, value: existing.get(k) ?? '' }))
      })
    },
  })),
)
