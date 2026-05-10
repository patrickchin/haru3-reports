import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { auth } from '../middleware/auth.js';
import {
  ProfileSchema,
  UpdateProfileSchema,
  UsageSummarySchema,
  UsageHistoryItemSchema,
} from '../schemas/profiles.js';
import {
  dataResponse,
  listResponse,
  CursorQuerySchema,
  CursorMetaSchema,
  errorResponses,
} from '../schemas/common.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// GET /api/v1/profile
// ---------------------------------------------------------------------------
const getProfile = createRoute({
  method: 'get',
  path: '/api/v1/profile',
  tags: ['Profile'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ProfileSchema) } },
      description: 'Current user profile',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/profile
// ---------------------------------------------------------------------------
const updateProfile = createRoute({
  method: 'patch',
  path: '/api/v1/profile',
  tags: ['Profile'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: UpdateProfileSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ProfileSchema) } },
      description: 'Updated profile',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/profile/usage
// ---------------------------------------------------------------------------
const getUsage = createRoute({
  method: 'get',
  path: '/api/v1/profile/usage',
  tags: ['Profile'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(UsageSummarySchema) } },
      description: 'Token usage summary',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// GET /api/v1/profile/usage/history
// ---------------------------------------------------------------------------
const getUsageHistory = createRoute({
  method: 'get',
  path: '/api/v1/profile/usage/history',
  tags: ['Profile'],
  security: [{ bearerAuth: [] }],
  request: { query: CursorQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponse(UsageHistoryItemSchema) } },
      description: 'Paginated usage history',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Register routes with stub handlers
// ---------------------------------------------------------------------------

app.use('/api/v1/profile/*', auth);
app.use('/api/v1/profile', auth);

app.openapi(getProfile, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(updateProfile, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(getUsage, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(getUsageHistory, (c) => {
  return c.json({ data: [], meta: { hasNext: false, nextCursor: null, count: 0 } }, 200);
});

export { app as profiles };
export { getProfile, updateProfile, getUsage, getUsageHistory };
