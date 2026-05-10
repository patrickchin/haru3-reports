import { z } from '@hono/zod-openapi';
import { NOTE_KINDS } from '@harpa/api-contract';

export const ReportNoteSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  projectId: z.string().uuid(),
  authorId: z.string().uuid(),
  position: z.number().int(),
  kind: z.enum(NOTE_KINDS),
  body: z.string().nullable(),
  fileId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('ReportNote');

export const CreateNoteSchema = z.object({
  kind: z.enum(NOTE_KINDS).default('text'),
  body: z.string().optional(),
  fileId: z.string().uuid().optional(),
  position: z.number().int().optional(),
}).openapi('CreateNote');

export const UpdateNoteSchema = z.object({
  body: z.string().optional(),
  position: z.number().int().optional(),
}).openapi('UpdateNote');

export const ReorderNotesSchema = z.object({
  noteIds: z.array(z.string().uuid()).min(1).openapi({ description: 'Ordered array of note IDs' }),
}).openapi('ReorderNotes');
