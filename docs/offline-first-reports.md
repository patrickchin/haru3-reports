# Offline-First Report Viewing & Generation

## Current State

| Concern | Online dependency | Offline capability |
|---------|------------------|-------------------|
| Report list | Supabase query via react-query | None — blank screen offline |
| Report detail | Supabase query by ID | None |
| Note capture | None (local state) | Already works offline |
| Speech-to-text | Device STT (expo-speech-recognition) | Already works offline |
| Report generation | Edge function → LLM API | Fundamentally requires network |
| Auto-save | Supabase `.update()` | Silently drops if offline |
| PDF export | expo-print + local filesystem | Already works offline (if report data loaded) |

## Architecture

```
┌────────────────────────────────────────────┐
│  UI (React Query)                          │
│    ↕ reads/writes                          │
│  Local SQLite DB (source of truth)         │
│    ↕ background sync                       │
│  Supabase (authoritative remote)           │
└────────────────────────────────────────────┘
```

### Layer 1 — Local Data Store (SQLite)

Replace in-memory and remote-only report state with `expo-sqlite` as the local source of truth.

**Tables mirrored locally:**

- `reports` — id, project_id, title, report_type, status, visit_date, notes (JSON), report_data (JSON), confidence, synced_at, dirty
- `projects` — id, name, address (read-only cache)

SQLite over AsyncStorage: structured queries, transactional writes, handles large JSON blobs without serialization overhead.

### Layer 2 — Offline Write Queue

A `pending_operations` table tracks mutations that haven't reached Supabase:

| Column | Type | Purpose |
|--------|------|---------|
| id | INTEGER PK | Auto-increment |
| table_name | TEXT | `reports` |
| operation | TEXT | `insert` / `update` / `delete` |
| record_id | TEXT (UUID) | Target row |
| payload | TEXT (JSON) | Serialized mutation |
| created_at | INTEGER | Timestamp |
| retry_count | INTEGER | For exponential backoff |

On connectivity restore, drain the queue in order. Conflict resolution: last-write-wins by `updated_at` (adequate for single-user-per-report).

### Layer 3 — React Query + SQLite Integration

Stale-while-revalidate: read from local SQLite first, background-refresh from Supabase.

### Layer 4 — Offline-Aware Report Generation

1. Notes always captured locally (already the case) — persist to SQLite immediately.
2. If online → call edge function as today. If offline → queue request in `pending_generations`.
3. Create report row locally in `draft` status with `report_data = null`. Report list shows "Pending generation".
4. Process queue on reconnect.

### Layer 5 — Sync Engine

Triggers: App foreground, network restored, pull-to-refresh, after successful generation.

Steps:
1. Drain `pending_operations` queue (writes first)
2. Drain `pending_generations` queue
3. Pull remote changes since `last_sync_at`
4. Merge into local SQLite (remote wins for non-dirty rows)

## Dependencies to Add

| Package | Purpose |
|---------|---------|
| `expo-sqlite` | Local database |
| `@react-native-community/netinfo` | Connectivity detection |

## Implementation Phases

1. **Local cache (read path)** — expo-sqlite, mirror reports/projects, react-query reads local first
2. **Offline writes** — auto-save to SQLite immediately, queue Supabase updates, offline draft creation
3. **Deferred generation** — persist notes to SQLite, queue generation requests, "pending" UI state
4. **Conflict resolution & multi-device** — `updated_at` comparison, conflict UI for edge cases

## Online-Only

- LLM-based report generation (no practical on-device alternative)
- Initial user authentication (session refresh uses persisted tokens)
- Team member operations (server-side RPC validation)
