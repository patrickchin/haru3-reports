import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { auth } from '../middleware/auth.js';
import {
  FileMetadataSchema,
  CreateFileMetadataSchema,
  PresignRequestSchema,
  PresignResponseSchema,
  FileListQuerySchema,
} from '../schemas/files.js';
import {
  UuidParamSchema,
  ProjectIdParamSchema,
  FileIdParamSchema,
  dataResponse,
  listResponse,
  errorResponses,
} from '../schemas/common.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// List files for project
// ---------------------------------------------------------------------------

const listFiles = createRoute({
  method: 'get',
  path: '/api/v1/projects/{projectId}/files',
  tags: ['Files'],
  security: [{ bearerAuth: [] }],
  request: {
    params: ProjectIdParamSchema,
    query: FileListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponse(FileMetadataSchema) } },
      description: 'List of files',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Get presigned upload URL
// ---------------------------------------------------------------------------

const presignUpload = createRoute({
  method: 'post',
  path: '/api/v1/uploads/presign',
  tags: ['Files'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: PresignRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(PresignResponseSchema) } },
      description: 'Presigned upload URL',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Create file metadata record
// ---------------------------------------------------------------------------

const createFile = createRoute({
  method: 'post',
  path: '/api/v1/files',
  tags: ['Files'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateFileMetadataSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: dataResponse(FileMetadataSchema) } },
      description: 'Created file metadata',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Get file detail
// ---------------------------------------------------------------------------

const getFile = createRoute({
  method: 'get',
  path: '/api/v1/files/{id}',
  tags: ['Files'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(FileMetadataSchema) } },
      description: 'File detail with signed URL',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Delete file
// ---------------------------------------------------------------------------

const deleteFile = createRoute({
  method: 'delete',
  path: '/api/v1/files/{id}',
  tags: ['Files'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Soft-deleted file',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Voice note operations
// ---------------------------------------------------------------------------

const transcribeVoiceNote = createRoute({
  method: 'post',
  path: '/api/v1/voice-notes/{fileId}/transcribe',
  tags: ['Voice Notes'],
  security: [{ bearerAuth: [] }],
  request: { params: FileIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(FileMetadataSchema) } },
      description: 'File with transcription',
    },
    ...errorResponses,
  },
});

const summarizeVoiceNote = createRoute({
  method: 'post',
  path: '/api/v1/voice-notes/{fileId}/summarize',
  tags: ['Voice Notes'],
  security: [{ bearerAuth: [] }],
  request: { params: FileIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(FileMetadataSchema) } },
      description: 'File with summary',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

app.use('/api/v1/projects/*/files*', auth);
app.use('/api/v1/uploads/*', auth);
app.use('/api/v1/uploads/presign', auth);
app.use('/api/v1/files/*', auth);
app.use('/api/v1/files', auth);
app.use('/api/v1/voice-notes/*', auth);

app.openapi(listFiles, (c) => {
  return c.json({ data: [], meta: { hasNext: false, nextCursor: null, count: 0 } }, 200);
});

app.openapi(presignUpload, (c) => {
  return c.json({ data: { signedUrl: '', storagePath: '' } }, 200);
});

app.openapi(createFile, (c) => {
  return c.json({ data: {} as any }, 201);
});

app.openapi(getFile, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(deleteFile, (c) => {
  return c.json({ success: true }, 200);
});

app.openapi(transcribeVoiceNote, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(summarizeVoiceNote, (c) => {
  return c.json({ data: {} as any }, 200);
});

export { app as files };
export {
  listFiles, presignUpload, createFile, getFile, deleteFile,
  transcribeVoiceNote, summarizeVoiceNote,
};
