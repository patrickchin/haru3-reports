import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { eq, desc, lt, sql } from 'drizzle-orm';
import { auth } from '../middleware/auth.js';
import { getDb } from '../db/instance.js';
import { profiles as profilesTable, tokenUsage } from '../db/schema.js';
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

app.openapi(getProfile, async (c) => {
  const userId = c.get('user').sub;
  const db = getDb();

  const rows = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);

  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'Profile not found' });
  }

  return c.json({ data: rows[0] }, 200);
});

app.openapi(updateProfile, async (c) => {
  const userId = c.get('user').sub;
  const body = c.req.valid('json');
  const db = getDb();

  const rows = await db
    .update(profilesTable)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(profilesTable.id, userId))
    .returning();

  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'Profile not found' });
  }

  return c.json({ data: rows[0] }, 200);
});

app.openapi(getUsage, async (c) => {
  const userId = c.get('user').sub;
  const db = getDb();

  const [result] = await db
    .select({
      totalInputTokens: sql<number>`coalesce(sum(${tokenUsage.inputTokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${tokenUsage.outputTokens}), 0)::int`,
      totalCachedTokens: sql<number>`coalesce(sum(${tokenUsage.cachedTokens}), 0)::int`,
    })
    .from(tokenUsage)
    .where(eq(tokenUsage.userId, userId));

  return c.json({ data: result }, 200);
});

app.openapi(getUsageHistory, async (c) => {
  const userId = c.get('user').sub;
  const { cursor, limit } = c.req.valid('query');
  const db = getDb();

  let query = db
    .select()
    .from(tokenUsage)
    .where(eq(tokenUsage.userId, userId))
    .orderBy(desc(tokenUsage.createdAt))
    .limit(limit + 1);

  if (cursor) {
    const decoded = Buffer.from(cursor, 'base64url').toString();
    query = db
      .select()
      .from(tokenUsage)
      .where(sql`${tokenUsage.userId} = ${userId} AND ${tokenUsage.createdAt} < ${decoded}`)
      .orderBy(desc(tokenUsage.createdAt))
      .limit(limit + 1);
  }

  const rows = await query;
  const hasNext = rows.length > limit;
  if (hasNext) rows.pop();

  const nextCursor = hasNext && rows.length > 0
    ? Buffer.from(rows[rows.length - 1].createdAt).toString('base64url')
    : null;

  return c.json(
    { data: rows, meta: { hasNext, nextCursor, count: rows.length } },
    200,
  );
});

export { app as profiles };
export { getProfile, updateProfile, getUsage, getUsageHistory };
