import { z } from '@hono/zod-openapi';

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  phone: z.string(),
  fullName: z.string().nullable(),
  companyName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('Profile');

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  companyName: z.string().max(200).optional(),
  avatarUrl: z.string().url().optional(),
}).openapi('UpdateProfile');

export const UsageSummarySchema = z.object({
  totalInputTokens: z.number().int(),
  totalOutputTokens: z.number().int(),
  totalCachedTokens: z.number().int(),
}).openapi('UsageSummary');

export const UsageHistoryItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  reportId: z.string().uuid().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cachedTokens: z.number().int(),
  model: z.string(),
  provider: z.string(),
  createdAt: z.string().datetime(),
}).openapi('UsageHistoryItem');
