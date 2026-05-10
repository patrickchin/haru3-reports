import { z } from '@hono/zod-openapi';
import { FILE_CATEGORIES, UPLOAD_STATUSES, STORAGE_BUCKETS } from '@harpa/api-contract';

export const FileMetadataSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  uploadedBy: z.string().uuid(),
  bucket: z.enum(STORAGE_BUCKETS),
  storagePath: z.string(),
  category: z.enum(FILE_CATEGORIES),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  durationMs: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  thumbnailPath: z.string().nullable(),
  blurhash: z.string().nullable(),
  voiceTitle: z.string().nullable(),
  voiceSummary: z.string().nullable(),
  uploadStatus: z.enum(UPLOAD_STATUSES),
  signedUrl: z.string().optional().openapi({ description: 'Temporary signed download URL' }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('FileMetadata');

export const CreateFileMetadataSchema = z.object({
  projectId: z.string().uuid(),
  storagePath: z.string().min(1),
  category: z.enum(FILE_CATEGORIES),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  durationMs: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
}).openapi('CreateFileMetadata');

export const PresignRequestSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  category: z.enum(FILE_CATEGORIES),
}).openapi('PresignRequest');

export const PresignResponseSchema = z.object({
  signedUrl: z.string().url(),
  storagePath: z.string(),
}).openapi('PresignResponse');

export const FileListQuerySchema = z.object({
  category: z.enum(FILE_CATEGORIES).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
