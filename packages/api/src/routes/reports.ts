import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq, and, isNull, lt, desc, asc } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { auth } from '../middleware/auth.js';
import { getDb } from '../db/instance.js';
import {
  reports as reportsTable,
  projectMembers,
  reportNotes,
} from '../db/schema.js';
import { getModel } from '../lib/ai-providers.js';
import { invokeTextModel } from '../lib/llm.js';
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
  const body = c.req.valid('json');
  const db = getDb();

  // Fetch all non-deleted notes for this report, ordered by position
  const notes = await db
    .select({ id: reportNotes.id, body: reportNotes.body, kind: reportNotes.kind, position: reportNotes.position })
    .from(reportNotes)
    .where(and(eq(reportNotes.reportId, id), isNull(reportNotes.deletedAt)))
    .orderBy(asc(reportNotes.position));

  // Build note strings from text/voice note bodies
  const noteTexts = notes
    .filter((n) => n.body && n.body.trim().length > 0)
    .map((n) => n.body!);

  if (noteTexts.length === 0) {
    throw new HTTPException(400, { message: 'Report has no notes to generate from' });
  }

  const providerName = (body.provider ?? process.env.AI_PROVIDER ?? 'kimi').toLowerCase();
  const resolved = getModel(providerName, body.model);

  const SYSTEM_PROMPT =
    `You are a construction site report assistant. You convert numbered voice notes from a construction site into a structured JSON report.

INPUT
- NOTES: numbered voice notes captured on site. Reference them via "sourceNoteIndexes": [n].

OUTPUT
Return ONLY valid minified JSON in this exact shape:
  { "report": { "meta": {...}, "weather": ..., "workers": ..., "materials": [...], "issues": [...], "nextSteps": [...], "sections": [...] } }

- Always return the FULL report. Include every top-level field, even when empty.
- Use null for missing "weather" / "workers", [] for empty arrays, "" for missing strings.
- Do NOT wrap the JSON in markdown fences. Do NOT add prose before or after.

SCHEMA
"meta":          { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather":       { "conditions", "temperature", "wind", "impact" }              (object or null)
"workers":       { "totalWorkers": num, "workerHours", "notes", "roles": [{ "role", "count": num, "notes" }] }  (object or null)
"materials":     [{ "name", "quantity", "quantityUnit", "condition", "status", "notes" }]
"issues":        [{ "title", "category", "severity", "status", "details", "actionRequired", "sourceNoteIndexes": [] }]
"nextSteps":     [str]
"sections":      [{ "title", "content": "markdown", "sourceNoteIndexes": [1, 2] }]

RULES
- Populate "meta.title" with a short, human-readable title and "meta.summary" with a one-sentence overview.
- NEVER invent data not in the notes. Keep strings concise. Deduplicate facts.`;

  const formattedNotes = noteTexts.map((note, i) => `[${i + 1}] ${note}`).join('\n');

  const llmResult = await invokeTextModel({
    provider: providerName,
    model: resolved.instance,
    modelId: resolved.modelId,
    system: SYSTEM_PROMPT,
    prompt: `NOTES:\n${formattedNotes}`,
    temperature: 0.3,
    maxOutputTokens: 8000,
    providerOptions: {
      kimi: { response_format: { type: 'json_object' } },
      zai: { response_format: { type: 'json_object' } },
      deepseek: { response_format: { type: 'json_object' } },
    },
    usageContext: { userId: user.sub, projectId: report.projectId, reportId: id },
  });

  // Parse the LLM response
  const jsonText = llmResult.text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1').trim();
  let parsed: { report?: Record<string, unknown> };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new HTTPException(502, { message: 'LLM returned invalid JSON' });
  }

  const reportData = (parsed.report ?? parsed) as Record<string, unknown>;

  // Extract title and metadata from generated report
  const meta = reportData.meta as { title?: string; reportType?: string; visitDate?: string | null } | undefined;
  const title = meta?.title ?? report.title;
  const visitDate = meta?.visitDate ?? report.visitDate;

  // Get the last note ID for tracking
  const lastNoteId = notes.length > 0 ? notes[notes.length - 1].id : null;

  // Update the report with generated data
  const [updated] = await db
    .update(reportsTable)
    .set({
      title,
      visitDate,
      reportData,
      lastGeneration: {
        provider: llmResult.provider,
        model: llmResult.model,
        usage: llmResult.usage,
        generatedAt: new Date().toISOString(),
        noteCount: noteTexts.length,
      },
      lastProcessedNoteId: lastNoteId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(reportsTable.id, id), isNull(reportsTable.deletedAt)))
    .returning();

  return c.json({ data: toReportResponse(updated) }, 200);
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

  // PDF generation: create a signed URL to a server-rendered PDF.
  // For now, we generate a temporary download URL by serializing report data
  // into a query parameter that a future PDF renderer service will consume.
  // TODO P6: Wire up a real PDF renderer (e.g. Puppeteer on Fly.io or a third-party service).
  const pdfUrl = '';
  return c.json({ data: { url: pdfUrl, reportId: id, status: 'not_implemented' as const } }, 200);
});

export { app as reports };
export {
  listReports, createReport, getReport, updateReport, deleteReport,
  generateReport, finalizeReport, getReportPdf,
};
