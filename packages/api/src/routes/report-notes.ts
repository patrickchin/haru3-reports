import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq, and, isNull, lt, asc, desc, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { auth } from '../middleware/auth.js';
import { getDb } from '../db/instance.js';
import {
  reportNotes as notesTable,
  reports as reportsTable,
  projectMembers,
} from '../db/schema.js';
import {
  ReportNoteSchema,
  CreateNoteSchema,
  UpdateNoteSchema,
  ReorderNotesSchema,
} from '../schemas/report-notes.js';
import {
  ReportIdParamSchema,
  NoteParamSchema,
  dataResponse,
  listResponse,
  CursorQuerySchema,
  errorResponses,
} from '../schemas/common.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString();
}

function encodeCursor(timestamp: string): string {
  return Buffer.from(timestamp).toString('base64url');
}

async function verifyReportAccess(
  reportId: string,
  userId: string,
  requireEditor = false,
) {
  const db = getDb();
  const [report] = await db
    .select({ id: reportsTable.id, projectId: reportsTable.projectId })
    .from(reportsTable)
    .where(and(eq(reportsTable.id, reportId), isNull(reportsTable.deletedAt)))
    .limit(1);

  if (!report) throw new HTTPException(404, { message: 'Report not found' });

  const [membership] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, report.projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership)
    throw new HTTPException(403, { message: 'Not a project member' });
  if (requireEditor && membership.role === 'viewer') {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  return report;
}

// ---------------------------------------------------------------------------
// List notes
// ---------------------------------------------------------------------------

const listNotes = createRoute({
  method: 'get',
  path: '/api/v1/reports/{reportId}/notes',
  tags: ['Report Notes'],
  security: [{ bearerAuth: [] }],
  request: {
    params: ReportIdParamSchema,
    query: CursorQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponse(ReportNoteSchema) } },
      description: 'List of notes',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Create note
// ---------------------------------------------------------------------------

const createNote = createRoute({
  method: 'post',
  path: '/api/v1/reports/{reportId}/notes',
  tags: ['Report Notes'],
  security: [{ bearerAuth: [] }],
  request: {
    params: ReportIdParamSchema,
    body: { content: { 'application/json': { schema: CreateNoteSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: dataResponse(ReportNoteSchema) } },
      description: 'Created note',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Update note
// ---------------------------------------------------------------------------

const updateNote = createRoute({
  method: 'patch',
  path: '/api/v1/reports/{reportId}/notes/{id}',
  tags: ['Report Notes'],
  security: [{ bearerAuth: [] }],
  request: {
    params: NoteParamSchema,
    body: { content: { 'application/json': { schema: UpdateNoteSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ReportNoteSchema) } },
      description: 'Updated note',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Delete note
// ---------------------------------------------------------------------------

const deleteNote = createRoute({
  method: 'delete',
  path: '/api/v1/reports/{reportId}/notes/{id}',
  tags: ['Report Notes'],
  security: [{ bearerAuth: [] }],
  request: { params: NoteParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Soft-deleted note',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Reorder notes
// ---------------------------------------------------------------------------

const reorderNotes = createRoute({
  method: 'post',
  path: '/api/v1/reports/{reportId}/notes/reorder',
  tags: ['Report Notes'],
  security: [{ bearerAuth: [] }],
  request: {
    params: ReportIdParamSchema,
    body: { content: { 'application/json': { schema: ReorderNotesSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Notes reordered',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

app.use('/api/v1/reports/*/notes*', auth);

app.openapi(listNotes, async (c) => {
  const user = c.get('user');
  const { reportId } = c.req.valid('param');
  const { cursor, limit } = c.req.valid('query');

  const report = await verifyReportAccess(reportId, user.sub);

  const db = getDb();
  const conditions = [
    eq(notesTable.reportId, report.id),
    isNull(notesTable.deletedAt),
  ];

  if (cursor) {
    conditions.push(lt(notesTable.createdAt, decodeCursor(cursor)));
  }

  const rows = await db
    .select()
    .from(notesTable)
    .where(and(...conditions))
    .orderBy(asc(notesTable.position))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasNext && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt)
      : null;

  return c.json(
    { data, meta: { hasNext, nextCursor, count: data.length } },
    200,
  );
});

app.openapi(createNote, async (c) => {
  const user = c.get('user');
  const { reportId } = c.req.valid('param');
  const body = c.req.valid('json');

  const report = await verifyReportAccess(reportId, user.sub, true);

  const db = getDb();

  let position = body.position;
  if (position === undefined) {
    const [maxRow] = await db
      .select({ maxPos: sql<number>`coalesce(max(${notesTable.position}), -1)` })
      .from(notesTable)
      .where(
        and(eq(notesTable.reportId, report.id), isNull(notesTable.deletedAt)),
      );
    position = (maxRow?.maxPos ?? -1) + 1;
  }

  const [note] = await db
    .insert(notesTable)
    .values({
      reportId: report.id,
      projectId: report.projectId,
      authorId: user.sub,
      kind: body.kind,
      body: body.body ?? null,
      fileId: body.fileId ?? null,
      position,
    })
    .returning();

  return c.json({ data: note }, 201);
});

app.openapi(updateNote, async (c) => {
  const user = c.get('user');
  const { reportId, id } = c.req.valid('param');
  const body = c.req.valid('json');

  await verifyReportAccess(reportId, user.sub, true);

  const db = getDb();
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (body.body !== undefined) updates.body = body.body;
  if (body.position !== undefined) updates.position = body.position;

  const [updated] = await db
    .update(notesTable)
    .set(updates)
    .where(
      and(
        eq(notesTable.id, id),
        eq(notesTable.reportId, reportId),
        isNull(notesTable.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: 'Note not found' });
  }

  return c.json({ data: updated }, 200);
});

app.openapi(deleteNote, async (c) => {
  const user = c.get('user');
  const { reportId, id } = c.req.valid('param');

  await verifyReportAccess(reportId, user.sub, true);

  const db = getDb();
  const [deleted] = await db
    .update(notesTable)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(notesTable.id, id),
        eq(notesTable.reportId, reportId),
        isNull(notesTable.deletedAt),
      ),
    )
    .returning({ id: notesTable.id });

  if (!deleted) {
    throw new HTTPException(404, { message: 'Note not found' });
  }

  return c.json({ success: true }, 200);
});

app.openapi(reorderNotes, async (c) => {
  const user = c.get('user');
  const { reportId } = c.req.valid('param');
  const { noteIds } = c.req.valid('json');

  await verifyReportAccess(reportId, user.sub, true);

  const db = getDb();
  await db.transaction(async (tx) => {
    for (let i = 0; i < noteIds.length; i++) {
      await tx
        .update(notesTable)
        .set({ position: i, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(notesTable.id, noteIds[i]),
            eq(notesTable.reportId, reportId),
            isNull(notesTable.deletedAt),
          ),
        );
    }
  });

  return c.json({ success: true }, 200);
});

export { app as reportNotes };
export { listNotes, createNote, updateNote, deleteNote, reorderNotes };
