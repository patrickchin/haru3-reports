import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { auth } from '../middleware/auth.js';
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

app.openapi(listReports, (c) => {
  return c.json({ data: [], meta: { hasNext: false, nextCursor: null, count: 0 } }, 200);
});

app.openapi(createReport, (c) => {
  return c.json({ data: {} as any }, 201);
});

app.openapi(getReport, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(updateReport, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(deleteReport, (c) => {
  return c.json({ success: true }, 200);
});

app.openapi(generateReport, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(finalizeReport, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(getReportPdf, (c) => {
  return c.json({ data: { url: '' } }, 200);
});

export { app as reports };
export {
  listReports, createReport, getReport, updateReport, deleteReport,
  generateReport, finalizeReport, getReportPdf,
};
