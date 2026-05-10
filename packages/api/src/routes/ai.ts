import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { AI_PROVIDERS, PROVIDER_MODELS, DEFAULT_PROVIDER } from '@harpa/api-contract';
import type { AiProvider } from '@harpa/api-contract';
import { auth } from '../middleware/auth.js';
import {
  AiProviderInfoSchema,
  AiSettingsSchema,
  UpdateAiSettingsSchema,
} from '../schemas/ai.js';
import { dataResponse, errorResponses } from '../schemas/common.js';

const PROVIDER_DISPLAY_NAMES: Record<AiProvider, string> = {
  kimi: 'Kimi (Moonshot)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  zai: 'ZAI',
};

const PROVIDER_INFO = AI_PROVIDERS.map((id) => ({
  id,
  name: PROVIDER_DISPLAY_NAMES[id],
  models: PROVIDER_MODELS[id].available.map((modelId) => ({
    id: modelId,
    isDefault: modelId === PROVIDER_MODELS[id].default,
  })),
}));

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// GET /api/v1/ai/providers
// ---------------------------------------------------------------------------

const listProviders = createRoute({
  method: 'get',
  path: '/api/v1/ai/providers',
  tags: ['AI'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(z.array(AiProviderInfoSchema)) } },
      description: 'Available AI providers and models',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/ai/settings
// ---------------------------------------------------------------------------

const getAiSettings = createRoute({
  method: 'get',
  path: '/api/v1/ai/settings',
  tags: ['AI'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(AiSettingsSchema) } },
      description: 'User AI settings',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// PUT /api/v1/ai/settings
// ---------------------------------------------------------------------------

const updateAiSettings = createRoute({
  method: 'put',
  path: '/api/v1/ai/settings',
  tags: ['AI'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: UpdateAiSettingsSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(AiSettingsSchema) } },
      description: 'Updated AI settings',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

app.use('/api/v1/ai/*', auth);

app.openapi(listProviders, (c) => {
  return c.json({ data: PROVIDER_INFO }, 200);
});

app.openapi(getAiSettings, (c) => {
  // TODO: Store AI settings per-user in profiles or a separate table
  const defaultModel = PROVIDER_MODELS[DEFAULT_PROVIDER].default;
  return c.json({ data: { provider: DEFAULT_PROVIDER, model: defaultModel } }, 200);
});

app.openapi(updateAiSettings, (c) => {
  const body = c.req.valid('json');

  // Validate provider exists
  const providerInfo = PROVIDER_INFO.find((p) => p.id === body.provider);
  if (!providerInfo) {
    throw new HTTPException(422, { message: `Invalid provider: ${body.provider}` });
  }

  // Validate model exists for this provider
  const modelExists = providerInfo.models.some((m) => m.id === body.model);
  if (!modelExists) {
    throw new HTTPException(422, {
      message: `Invalid model "${body.model}" for provider "${body.provider}"`,
    });
  }

  // TODO: Persist AI settings per-user
  return c.json({ data: { provider: body.provider, model: body.model } }, 200);
});

export { app as ai };
export { listProviders, getAiSettings, updateAiSettings };
