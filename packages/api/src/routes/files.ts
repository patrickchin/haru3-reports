import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq, and, isNull, desc, lt } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { auth } from '../middleware/auth.js';
import { getDb } from '../db/instance.js';
import { fileMetadata, projectMembers } from '../db/schema.js';
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

function fileRow(row: typeof fileMetadata.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    uploadedBy: row.uploadedBy,
    bucket: row.bucket,
    storagePath: row.storagePath,
    category: row.category,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    durationMs: row.durationMs,
    width: row.width,
    height: row.height,
    thumbnailPath: row.thumbnailPath,
    blurhash: row.blurhash,
    voiceTitle: row.voiceTitle,
    voiceSummary: row.voiceSummary,
    uploadStatus: row.uploadStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

app.use('/api/v1/projects/*/files*', auth);
app.use('/api/v1/uploads/*', auth);
app.use('/api/v1/uploads/presign', auth);
app.use('/api/v1/files/*', auth);
app.use('/api/v1/files', auth);
app.use('/api/v1/voice-notes/*', auth);

// -- List Files -------------------------------------------------------------

app.openapi(listFiles, async (c) => {
  const user = c.get('user');
  const { projectId } = c.req.valid('param');
  const { category, cursor, limit } = c.req.valid('query');
  const db = getDb();

  const membership = await getUserMembership(projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  const conditions = [
    eq(fileMetadata.projectId, projectId),
    isNull(fileMetadata.deletedAt),
  ];

  if (category) {
    conditions.push(eq(fileMetadata.category, category));
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    conditions.push(lt(fileMetadata.createdAt, decoded));
  }

  const rows = await db
    .select()
    .from(fileMetadata)
    .where(and(...conditions))
    .orderBy(desc(fileMetadata.createdAt))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasNext && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt)
      : null;

  return c.json(
    { data: data.map(fileRow), meta: { hasNext, nextCursor, count: data.length } },
    200,
  );
});

// -- Presign Upload ---------------------------------------------------------

app.openapi(presignUpload, async (c) => {
  const body = c.req.valid('json');
  const storagePath = `uploads/${randomUUID()}/${body.fileName}`;

  // TODO: Integrate with Supabase Storage presigned URLs
  const signedUrl = `https://storage.example.com/${storagePath}`;

  return c.json({ data: { signedUrl, storagePath } }, 200);
});

// -- Create File ------------------------------------------------------------

app.openapi(createFile, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const db = getDb();

  const membership = await getUserMembership(body.projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  const [created] = await db
    .insert(fileMetadata)
    .values({
      projectId: body.projectId,
      uploadedBy: user.sub,
      bucket: 'project-files',
      storagePath: body.storagePath,
      category: body.category,
      filename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      durationMs: body.durationMs ?? null,
      width: body.width ?? null,
      height: body.height ?? null,
    })
    .returning();

  return c.json({ data: fileRow(created) }, 201);
});

// -- Get File ---------------------------------------------------------------

app.openapi(getFile, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const db = getDb();

  const rows = await db
    .select()
    .from(fileMetadata)
    .where(and(eq(fileMetadata.id, id), isNull(fileMetadata.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  const file = rows[0];

  const membership = await getUserMembership(file.projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  // TODO: Generate real signed URL from Supabase Storage
  const signedUrl = `https://storage.example.com/${file.storagePath}`;

  return c.json({ data: { ...fileRow(file), signedUrl } }, 200);
});

// -- Delete File ------------------------------------------------------------

app.openapi(deleteFile, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const db = getDb();

  const rows = await db
    .select()
    .from(fileMetadata)
    .where(and(eq(fileMetadata.id, id), isNull(fileMetadata.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  const file = rows[0];

  const membership = await getUserMembership(file.projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'File not found' });
  }
  if (membership.role === 'viewer') {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  await db
    .update(fileMetadata)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(fileMetadata.id, id));

  return c.json({ success: true }, 200);
});

// -- Transcribe Voice Note --------------------------------------------------

app.openapi(transcribeVoiceNote, async (c) => {
  const user = c.get('user');
  const { fileId } = c.req.valid('param');
  const db = getDb();

  const rows = await db
    .select()
    .from(fileMetadata)
    .where(and(eq(fileMetadata.id, fileId), isNull(fileMetadata.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  const file = rows[0];

  if (file.category !== 'voice-note') {
    throw new HTTPException(400, { message: 'File is not a voice note' });
  }

  const membership = await getUserMembership(file.projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  // TODO P1.6.1: Implement transcription via AI provider

  return c.json({ data: fileRow(file) }, 200);
});

// -- Summarize Voice Note ---------------------------------------------------

app.openapi(summarizeVoiceNote, async (c) => {
  const user = c.get('user');
  const { fileId } = c.req.valid('param');
  const db = getDb();

  const rows = await db
    .select()
    .from(fileMetadata)
    .where(and(eq(fileMetadata.id, fileId), isNull(fileMetadata.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  const file = rows[0];

  const membership = await getUserMembership(file.projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  // TODO P1.6.2: Implement summarization via AI provider

  return c.json({ data: fileRow(file) }, 200);
});

export { app as files };
export {
  listFiles, presignUpload, createFile, getFile, deleteFile,
  transcribeVoiceNote, summarizeVoiceNote,
};
