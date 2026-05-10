import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { auth } from '../middleware/auth.js';
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

app.openapi(listNotes, (c) => {
  return c.json({ data: [], meta: { hasNext: false, nextCursor: null, count: 0 } }, 200);
});

app.openapi(createNote, (c) => {
  return c.json({ data: {} as any }, 201);
});

app.openapi(updateNote, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(deleteNote, (c) => {
  return c.json({ success: true }, 200);
});

app.openapi(reorderNotes, (c) => {
  return c.json({ success: true }, 200);
});

export { app as reportNotes };
export { listNotes, createNote, updateNote, deleteNote, reorderNotes };
