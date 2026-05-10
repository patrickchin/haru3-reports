import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq, and, isNull, lt, desc } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { auth } from '../middleware/auth.js';
import { getDb } from '../db/instance.js';
import {
  reports as reportsTable,
  projectMembers,
} from '../db/schema.js';
import {
  ReportSchema,
  CreateReportSchema,
  UpdateReportSchema,
  GenerateReportSchema,
  ReportListQuerySchema,
} from '../schemas/reports.js';
import {
  UuidParamSchema,
  ProjectIdParamSchema,
  dataResponse,
  listResponse,
  CursorMetaSchema,
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

async function getUserMembership(projectId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getReportOrThrow(reportId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, reportId), isNull(reportsTable.deletedAt)))
    .limit(1);
  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'Report not found' });
  }
  return rows[0];
}

function requireMembership(
  membership: { role: string } | null,
  requiredRoles?: string[],
) {
  if (!membership) {
    throw new HTTPException(403, { message: 'Not a project member' });
  }
  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }
}

/** Map a DB report row to the API response shape (strip internal fields, fix jsonb types). */
function toReportResponse(row: typeof reportsTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    ownerId: row.ownerId,
    title: row.title,
    reportType: row.reportType,
    status: row.status,
    visitDate: row.visitDate,
    confidence: row.confidence,
    reportData: (row.reportData ?? {}) as Record<string, unknown>,
    lastGeneration: (row.lastGeneration ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// List reports for project
// ---------------------------------------------------------------------------

const listReports = createRoute({
  method: 'get',
  path: '/api/v1/projects/{projectId}/reports',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: {
    params: ProjectIdParamSchema,
    query: ReportListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponse(ReportSchema) } },
      description: 'List of reports',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Create report
// ---------------------------------------------------------------------------

const createReport = createRoute({
  method: 'post',
  path: '/api/v1/projects/{projectId}/reports',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: {
    params: ProjectIdParamSchema,
    body: { content: { 'application/json': { schema: CreateReportSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: dataResponse(ReportSchema) } },
      description: 'Created report',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Get report detail
// ---------------------------------------------------------------------------

const getReport = createRoute({
  method: 'get',
  path: '/api/v1/reports/{id}',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ReportSchema) } },
      description: 'Report detail',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Update report
// ---------------------------------------------------------------------------

const updateReport = createRoute({
  method: 'patch',
  path: '/api/v1/reports/{id}',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: {
    params: UuidParamSchema,
    body: { content: { 'application/json': { schema: UpdateReportSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ReportSchema) } },
      description: 'Updated report',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Delete report
// ---------------------------------------------------------------------------

const deleteReport = createRoute({
  method: 'delete',
  path: '/api/v1/reports/{id}',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Soft-deleted report',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Generate AI report
// ---------------------------------------------------------------------------

const generateReport = createRoute({
  method: 'post',
  path: '/api/v1/reports/{id}/generate',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: {
    params: UuidParamSchema,
    body: { content: { 'application/json': { schema: GenerateReportSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ReportSchema) } },
      description: 'Generated report with AI data',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Finalize report
// ---------------------------------------------------------------------------

const finalizeReport = createRoute({
  method: 'post',
  path: '/api/v1/reports/{id}/finalize',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ReportSchema) } },
      description: 'Finalized report',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Get PDF URL
// ---------------------------------------------------------------------------

const getReportPdf = createRoute({
  method: 'get',
  path: '/api/v1/reports/{id}/pdf',
  tags: ['Reports'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(z.object({ url: z.string().url() })) } },
      description: 'PDF download URL',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

app.use('/api/v1/projects/*/reports*', auth);
app.use('/api/v1/reports/*', auth);
app.use('/api/v1/reports', auth);

// -- List Reports -----------------------------------------------------------

app.openapi(listReports, async (c) => {
  const user = c.get('user');
  const { projectId } = c.req.valid('param');
  const { status, cursor, limit } = c.req.valid('query');
  const db = getDb();

  const membership = await getUserMembership(projectId, user.sub);
  requireMembership(membership);

  const conditions = [
    eq(reportsTable.projectId, projectId),
    isNull(reportsTable.deletedAt),
  ];

  if (status) {
    conditions.push(eq(reportsTable.status, status));
  }

  if (cursor) {
    const cursorDate = decodeCursor(cursor);
    conditions.push(lt(reportsTable.createdAt, cursorDate));
  }

  const rows = await db
    .select()
    .from(reportsTable)
    .where(and(...conditions))
    .orderBy(desc(reportsTable.createdAt))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasNext && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt)
      : null;

  return c.json(
    { data: data.map(toReportResponse), meta: { hasNext, nextCursor, count: data.length } },
    200,
  );
});

// -- Create Report ----------------------------------------------------------

app.openapi(createReport, async (c) => {
  const user = c.get('user');
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb();

  const membership = await getUserMembership(projectId, user.sub);
  requireMembership(membership, ['admin', 'editor']);

  const [report] = await db
    .insert(reportsTable)
    .values({
      projectId,
      ownerId: user.sub,
      title: body.title ?? '',
      reportType: body.reportType ?? 'daily',
      visitDate: body.visitDate ?? null,
    })
    .returning();

  return c.json({ data: toReportResponse(report) }, 201);
});

// -- Get Report -------------------------------------------------------------

app.openapi(getReport, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');

  const report = await getReportOrThrow(id);

  const membership = await getUserMembership(report.projectId, user.sub);
  requireMembership(membership);

  return c.json({ data: toReportResponse(report) }, 200);
});

// -- Update Report ----------------------------------------------------------

app.openapi(updateReport, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb();

  const report = await getReportOrThrow(id);

  const membership = await getUserMembership(report.projectId, user.sub);
  requireMembership(membership, ['admin', 'editor']);

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (body.title !== undefined) updates.title = body.title;
  if (body.status !== undefined) updates.status = body.status;
  if (body.reportData !== undefined) updates.reportData = body.reportData;
  if (body.visitDate !== undefined) updates.visitDate = body.visitDate;

  const [updated] = await db
    .update(reportsTable)
    .set(updates)
    .where(and(eq(reportsTable.id, id), isNull(reportsTable.deletedAt)))
    .returning();

  return c.json({ data: toReportResponse(updated) }, 200);
});

// -- Delete Report (soft) ---------------------------------------------------

app.openapi(deleteReport, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const db = getDb();

  const report = await getReportOrThrow(id);

  const membership = await getUserMembership(report.projectId, user.sub);
  requireMembership(membership, ['admin']);

  await db
    .update(reportsTable)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(reportsTable.id, id));

  return c.json({ success: true }, 200);
});

// -- Generate Report (stub) -------------------------------------------------

app.openapi(generateReport, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  // Consume body so validation runs
  c.req.valid('json');

  const report = await getReportOrThrow(id);

  const membership = await getUserMembership(report.projectId, user.sub);
  requireMembership(membership);

  // TODO P1.3.6: Implement AI generation
  return c.json({ data: toReportResponse(report) }, 200);
});

// -- Finalize Report --------------------------------------------------------

app.openapi(finalizeReport, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const db = getDb();

  const report = await getReportOrThrow(id);

  const membership = await getUserMembership(report.projectId, user.sub);
  requireMembership(membership, ['admin', 'editor']);

  const [updated] = await db
    .update(reportsTable)
    .set({ status: 'final', updatedAt: new Date().toISOString() })
    .where(and(eq(reportsTable.id, id), isNull(reportsTable.deletedAt)))
    .returning();

  return c.json({ data: toReportResponse(updated) }, 200);
});

// -- Get Report PDF (stub) --------------------------------------------------

app.openapi(getReportPdf, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');

  const report = await getReportOrThrow(id);

  const membership = await getUserMembership(report.projectId, user.sub);
  requireMembership(membership);

  // TODO P1.3.8: Generate PDF URL
  return c.json({ data: { url: '' } }, 200);
});

export { app as reports };
export {
  listReports, createReport, getReport, updateReport, deleteReport,
  generateReport, finalizeReport, getReportPdf,
};
