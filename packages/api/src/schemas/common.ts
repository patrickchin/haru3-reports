import { z } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Shared parameter schemas
// ---------------------------------------------------------------------------

export const UuidParamSchema = z.object({
  id: z.string().uuid().openapi({ description: 'Resource UUID', example: '550e8400-e29b-41d4-a716-446655440000' }),
});

export const ProjectIdParamSchema = z.object({
  projectId: z.string().uuid().openapi({ description: 'Project UUID' }),
});

export const ReportIdParamSchema = z.object({
  reportId: z.string().uuid().openapi({ description: 'Report UUID' }),
});

export const MemberParamSchema = z.object({
  id: z.string().uuid().openapi({ description: 'Project UUID' }),
  userId: z.string().uuid().openapi({ description: 'User UUID' }),
});

export const NoteParamSchema = z.object({
  reportId: z.string().uuid().openapi({ description: 'Report UUID' }),
  id: z.string().uuid().openapi({ description: 'Note UUID' }),
});

export const FileIdParamSchema = z.object({
  fileId: z.string().uuid().openapi({ description: 'File UUID' }),
});

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

export const CursorQuerySchema = z.object({
  cursor: z.string().optional().openapi({ description: 'Base64-encoded cursor' }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ description: 'Items per page' }),
});

export const CursorMetaSchema = z.object({
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
  count: z.number().int(),
}).openapi('CursorMeta');

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

export const FieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(FieldErrorSchema).optional(),
    requestId: z.string().optional(),
  }),
}).openapi('ErrorResponse');

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

export const timestampFields = {
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
} as const;

// ---------------------------------------------------------------------------
// Reusable response helpers
// ---------------------------------------------------------------------------

export function dataResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema });
}

export function listResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: z.array(schema),
    meta: CursorMetaSchema,
  });
}

// ---------------------------------------------------------------------------
// Common response definitions for OpenAPI routes
// ---------------------------------------------------------------------------

export const errorResponses = {
  400: {
    content: { 'application/json': { schema: ErrorResponseSchema } },
    description: 'Bad request',
  },
  401: {
    content: { 'application/json': { schema: ErrorResponseSchema } },
    description: 'Unauthorized',
  },
  403: {
    content: { 'application/json': { schema: ErrorResponseSchema } },
    description: 'Forbidden',
  },
  404: {
    content: { 'application/json': { schema: ErrorResponseSchema } },
    description: 'Not found',
  },
  422: {
    content: { 'application/json': { schema: ErrorResponseSchema } },
    description: 'Validation error',
  },
} as const;
