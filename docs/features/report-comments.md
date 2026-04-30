# Report Comments — Design

> Written 22 Apr 2026.
> Status: proposed, not yet implemented.

Adds a flat, chronological comment thread to each report so project members can discuss findings, flag issues, and approve work directly within the app.

---

## 1. Goals & Non-Goals

**Goals (MVP)**
- Any project member (owner, admin, editor, **viewer**) can read and post comments on reports they can access.
- Flat, chronological comment list — no threading.
- Edit and soft-delete own comments; owner/admin can moderate (soft-delete others).
- "Edited" indicator when body is changed after creation.
- Plain text, 2000-character limit.
- Consistent with existing patterns: RLS via `user_has_project_access()`, PostgREST via `supabase-js`, TanStack Query hooks.

**Non-goals (deferred)**
- Threading / nested replies.
- @mentions and mention-resolver UI.
- Push notifications or in-app notification badges.
- Realtime (Supabase Realtime subscription) — poll on focus / pull-to-refresh is sufficient for construction field use.
- Reactions / emoji.
- Attachments or rich text.
- Web client support.

---

## 2. Why Reports Only

The core collaboration unit is the **report**. A foreman walks a site, records voice notes, and the AI generates a structured report. Teammates review and discuss that specific report — "Did you check the rebar spacing?" or "Weather pushed the pour to Thursday."

Project-level discussion has no natural anchor. The planned **Project Activity Feed** (see TODO) handles project-level events (audit log), which is the right shape for that layer.

## 3. Why Viewers Can Comment

Viewers are typically clients, inspectors, or PMs invited to see reports. Commenting is the one action that makes sense for them — "Approved", "Please re-check the north wall measurements", "Inspector on-site Thursday." A viewer who can't respond is just an email recipient and defeats the purpose of the members system.

---

## 4. Data Model

### Table: `public.report_comments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, `gen_random_uuid()` | |
| `report_id` | `uuid` | NOT NULL, FK → `reports(id)` ON DELETE CASCADE | |
| `project_id` | `uuid` | NOT NULL, FK → `projects(id)` ON DELETE CASCADE | Denormalized for RLS |
| `author_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE | |
| `body` | `text` | NOT NULL, `CHECK (char_length(trim(body)) BETWEEN 1 AND 2000)` | Plain text |
| `edited_at` | `timestamptz` | nullable | Set explicitly on body edit |
| `deleted_at` | `timestamptz` | nullable | Soft delete |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Trigger-managed |

### Indexes

```sql
CREATE INDEX report_comments_report_id_idx ON report_comments (report_id, created_at);
CREATE INDEX report_comments_author_id_idx ON report_comments (author_id);
```

### `project_id` Consistency Trigger

A BEFORE INSERT trigger copies `project_id` from the parent report row, overriding any client-supplied value. This prevents mismatches between `report_id` and `project_id`.

```sql
CREATE FUNCTION set_report_comment_project_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.project_id := (SELECT project_id FROM public.reports WHERE id = NEW.report_id);
  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'Report % not found', NEW.report_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_report_comment_project_id
  BEFORE INSERT ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION set_report_comment_project_id();
```

### Decisions

| Decision | Rationale |
|----------|-----------|
| **Denormalized `project_id`** | Reuses `user_has_project_access()` and `user_project_role()` directly in RLS without joining to `reports`. Same pattern as the `reports` table. |
| **2000-char limit** | Field comments, not essays. ~300 words is plenty for review feedback. |
| **No `parent_id`** | Flat list. Column can be added later if threading is ever needed. |
| **Soft delete** | Consistent with reports/projects. Shows "[Deleted]" placeholder so chronological flow isn't broken. |
| **`edited_at` ≠ `updated_at`** | `updated_at` fires on any column change (including soft delete). `edited_at` is set only on user body edits, so the UI can show an "edited" badge accurately. |

---

## 5. RLS Policies

Reuses helpers from `202604210001_project_members.sql`:

| Operation | Policy |
|-----------|--------|
| **SELECT** | `deleted_at IS NULL AND user_has_project_access(project_id, auth.uid())` |
| **INSERT** | `author_id = auth.uid() AND user_has_project_access(project_id, auth.uid())` |
| **UPDATE** | `author_id = auth.uid()` (own comments only) |
| **DELETE** | `author_id = auth.uid() OR user_project_role(project_id, auth.uid()) IN ('owner', 'admin')` |

UPDATE is used for body edits and soft-deletes. Hard DELETE is available to owner/admin for moderation.

---

## 6. API Access (PostgREST via supabase-js)

No edge function needed — matches how every other table is accessed.

```ts
// List
supabase.from('report_comments')
  .select('*, author:profiles(id, full_name)')
  .eq('report_id', reportId)
  .is('deleted_at', null)
  .order('created_at', { ascending: true })

// Create
supabase.from('report_comments')
  .insert({ report_id, project_id, author_id: user.id, body })

// Edit body
supabase.from('report_comments')
  .update({ body, edited_at: new Date().toISOString() })
  .eq('id', commentId)

// Soft delete
supabase.from('report_comments')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', commentId)
```

---

## 7. Mobile UI

### Placement

Comments appear **below the report sections and source notes** on the report detail screen. The source-notes block is a collapsible section that stays closed by default and expands to show the full raw note bodies loaded from `report_notes`, which keeps finalized reports readable while preserving the original inputs. This mirrors "read the report, then discuss" — the natural review flow.

```
┌─────────────────────────────┐
│  Report Header + Actions    │
├─────────────────────────────┤
│  ReportView (sections)      │
├─────────────────────────────┤
│  Source Notes (collapsible)  │
├─────────────────────────────┤
│  Comments (2)               │
│  ┌─────────────────────────┐│
│  │ Sarah Chen · 2h ago     ││
│  │ Rebar spacing looks good││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ Mike Torres · 1h ago    ││
│  │ Weather pushed pour to  ││
│  │ Thursday. Updated notes.││
│  └─────────────────────────┘│
├─────────────────────────────┤
│  Add a comment...      [→]  │  ← sticky composer
└─────────────────────────────┘
```

### New Files

```
apps/mobile/components/comments/
  CommentList.tsx           # Flat list of CommentItem, comment count header
  CommentItem.tsx           # Author name, relative time, body, edit/delete actions
  CommentComposer.tsx       # TextInput + send button, sticky at scroll bottom

apps/mobile/lib/
  report-comments.ts        # TanStack Query hooks: useReportComments, useAddComment, etc.
  report-comments.test.ts   # Unit tests

supabase/migrations/
  202604220001_report_comments.sql
```

### Query Keys

```ts
['report-comments', reportId]   // list
```

Invalidated on create/edit/delete mutations. Optimistic insert with rollback on error.

---

## 8. Permissions Matrix

| Role | Read | Create | Edit own | Soft-delete own | Soft-delete others |
|------|------|--------|----------|-----------------|--------------------|
| Owner | yes | yes | yes | yes | yes |
| Admin | yes | yes | yes | yes | yes |
| Editor | yes | yes | yes | yes | no |
| Viewer | yes | yes | yes | yes | no |

---

## 9. Migration File

Single migration: `supabase/migrations/202604220001_report_comments.sql`

Contents:
1. `CREATE TABLE report_comments` with columns and constraints.
2. `updated_at` trigger (reuses existing `set_current_timestamp_updated_at()`).
3. `set_report_comment_project_id()` trigger for `project_id` consistency.
4. Indexes.
5. `ENABLE ROW LEVEL SECURITY`.
6. RLS policies (SELECT, INSERT, UPDATE, DELETE).

---

## 10. Future Enhancements

| Feature | Trigger to add |
|---------|---------------|
| **One-level threading** | Add `parent_id uuid REFERENCES report_comments(id)` + `parent_id` index. UI: tap-to-reply, collapsible thread below parent. |
| **Realtime** | Subscribe to `report_comments` channel filtered by `report_id`. Add when simultaneous multi-user review becomes common. |
| **@mentions** | Add `mentions uuid[]` column. Mention-picker UI. Requires notification infrastructure. |
| **Push notifications** | "New comment on your report" via Expo push + Supabase webhook or edge function. |
| **Comment count badge** | Show count on report list items. Either a Postgres view or client-side count from cached query. |
