import { z } from '@hono/zod-openapi';
import { REPORT_TYPES, REPORT_STATUSES, AI_PROVIDERS } from '@harpa/api-contract';

export const ReportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string(),
  reportType: z.enum(REPORT_TYPES),
  status: z.enum(REPORT_STATUSES),
  visitDate: z.string().nullable(),
  confidence: z.number().int().nullable(),
  reportData: z.record(z.any()).openapi({ description: 'Generated report JSON structure' }),
  lastGeneration: z.record(z.any()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('Report');

export const CreateReportSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  reportType: z.enum(REPORT_TYPES).default('daily'),
  visitDate: z.string().optional().openapi({ description: 'YYYY-MM-DD format' }),
}).openapi('CreateReport');

export const UpdateReportSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  reportData: z.record(z.any()).optional(),
  visitDate: z.string().nullable().optional(),
}).openapi('UpdateReport');

export const GenerateReportSchema = z.object({
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().optional(),
}).openapi('GenerateReport');

export const ReportListQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
