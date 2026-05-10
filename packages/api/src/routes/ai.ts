import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { auth } from '../middleware/auth.js';
import {
  AiProviderInfoSchema,
  AiSettingsSchema,
  UpdateAiSettingsSchema,
} from '../schemas/ai.js';
import { dataResponse, errorResponses } from '../schemas/common.js';

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
  return c.json({ data: [] }, 200);
});

app.openapi(getAiSettings, (c) => {
  return c.json({ data: { provider: 'kimi' as const, model: 'kimi-k2-0905-preview' } }, 200);
});

app.openapi(updateAiSettings, (c) => {
  return c.json({ data: { provider: 'kimi' as const, model: 'kimi-k2-0905-preview' } }, 200);
});

export { app as ai };
export { listProviders, getAiSettings, updateAiSettings };
