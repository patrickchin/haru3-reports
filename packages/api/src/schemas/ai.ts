import { z } from '@hono/zod-openapi';
import { AI_PROVIDERS } from '@harpa/api-contract';

export const AiProviderInfoSchema = z.object({
  id: z.enum(AI_PROVIDERS),
  name: z.string(),
  models: z.array(z.object({
    id: z.string(),
    isDefault: z.boolean(),
  })),
}).openapi('AiProviderInfo');

export const AiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string(),
}).openapi('AiSettings');

export const UpdateAiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1),
}).openapi('UpdateAiSettings');
