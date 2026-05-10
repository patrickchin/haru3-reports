import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq, and, isNull, lt, desc } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { auth } from '../middleware/auth.js';
import { getDb } from '../db/instance.js';
import {
  projects as projectsTable,
  projectMembers,
  profiles,
} from '../db/schema.js';
import {
  ProjectSchema,
  ProjectDetailSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectListQuerySchema,
  ProjectMemberSchema,
  AddMemberSchema,
  UpdateMemberRoleSchema,
} from '../schemas/projects.js';
import {
  UuidParamSchema,
  MemberParamSchema,
  dataResponse,
  listResponse,
  CursorMetaSchema,
  errorResponses,
} from '../schemas/common.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Helper: decode/encode cursor (base64url-encoded ISO timestamp)
// ---------------------------------------------------------------------------

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString();
}

function encodeCursor(timestamp: string): string {
  return Buffer.from(timestamp).toString('base64url');
}

// ---------------------------------------------------------------------------
// Helper: get user's membership for a project (returns null if not a member)
// ---------------------------------------------------------------------------

async function getUserMembership(projectId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

const listProjectsRoute = createRoute({
  method: 'get',
  path: '/api/v1/projects',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: { query: ProjectListQuerySchema },
  responses: {
    200: {
      content: {
        'application/json': { schema: listResponse(ProjectSchema) },
      },
      description: 'List of projects',
    },
    ...errorResponses,
  },
});

const createProjectRoute = createRoute({
  method: 'post',
  path: '/api/v1/projects',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: CreateProjectSchema } },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': { schema: dataResponse(ProjectSchema) },
      },
      description: 'Created project',
    },
    ...errorResponses,
  },
});

const getProjectRoute = createRoute({
  method: 'get',
  path: '/api/v1/projects/{id}',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: {
        'application/json': { schema: dataResponse(ProjectDetailSchema) },
      },
      description: 'Project detail',
    },
    ...errorResponses,
  },
});

const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/api/v1/projects/{id}',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: {
    params: UuidParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateProjectSchema } },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: dataResponse(ProjectSchema) },
      },
      description: 'Updated project',
    },
    ...errorResponses,
  },
});

const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/api/v1/projects/{id}',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Soft-deleted project',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Project Members
// ---------------------------------------------------------------------------

const listMembersRoute = createRoute({
  method: 'get',
  path: '/api/v1/projects/{id}/members',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: dataResponse(z.array(ProjectMemberSchema)),
        },
      },
      description: 'List of members',
    },
    ...errorResponses,
  },
});

const addMemberRoute = createRoute({
  method: 'post',
  path: '/api/v1/projects/{id}/members',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: {
    params: UuidParamSchema,
    body: {
      content: { 'application/json': { schema: AddMemberSchema } },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': { schema: dataResponse(ProjectMemberSchema) },
      },
      description: 'Added member',
    },
    ...errorResponses,
  },
});

const updateMemberRoleRoute = createRoute({
  method: 'patch',
  path: '/api/v1/projects/{id}/members/{userId}',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: {
    params: MemberParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateMemberRoleSchema } },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: dataResponse(ProjectMemberSchema) },
      },
      description: 'Updated member',
    },
    ...errorResponses,
  },
});

const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/api/v1/projects/{id}/members/{userId}',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: { params: MemberParamSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Removed member',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

app.use('/api/v1/projects/*', auth);
app.use('/api/v1/projects', auth);

// -- List Projects ----------------------------------------------------------

app.openapi(listProjectsRoute, async (c) => {
  const user = c.get('user');
  const { status, cursor, limit } = c.req.valid('query');
  const db = getDb();

  const conditions = [
    eq(projectMembers.userId, user.sub),
    isNull(projectsTable.deletedAt),
  ];

  if (status) {
    conditions.push(eq(projectsTable.status, status));
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    conditions.push(lt(projectsTable.createdAt, decoded));
  }

  const rows = await db
    .select({
      id: projectsTable.id,
      ownerId: projectsTable.ownerId,
      name: projectsTable.name,
      address: projectsTable.address,
      clientName: projectsTable.clientName,
      status: projectsTable.status,
      createdAt: projectsTable.createdAt,
      updatedAt: projectsTable.updatedAt,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projectsTable, eq(projectMembers.projectId, projectsTable.id))
    .where(and(...conditions))
    .orderBy(desc(projectsTable.createdAt))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasNext && data.length > 0
      ? encodeCursor(data[data.length - 1].createdAt)
      : null;

  return c.json(
    { data, meta: { hasNext, nextCursor, count: data.length } },
    200,
  );
});

// -- Create Project ---------------------------------------------------------

app.openapi(createProjectRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projectsTable)
      .values({
        ownerId: user.sub,
        name: body.name,
        address: body.address ?? null,
        clientName: body.clientName ?? null,
      })
      .returning();

    await tx.insert(projectMembers).values({
      projectId: project.id,
      userId: user.sub,
      role: 'admin',
    });

    return project;
  });

  return c.json(
    {
      data: {
        id: result.id,
        ownerId: result.ownerId,
        name: result.name,
        address: result.address,
        clientName: result.clientName,
        status: result.status,
        role: 'admin' as const,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
    },
    201,
  );
});

// -- Get Project ------------------------------------------------------------

app.openapi(getProjectRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const db = getDb();

  const rows = await db
    .select({
      id: projectsTable.id,
      ownerId: projectsTable.ownerId,
      name: projectsTable.name,
      address: projectsTable.address,
      clientName: projectsTable.clientName,
      status: projectsTable.status,
      createdAt: projectsTable.createdAt,
      updatedAt: projectsTable.updatedAt,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projectsTable, eq(projectMembers.projectId, projectsTable.id))
    .where(
      and(
        eq(projectsTable.id, id),
        eq(projectMembers.userId, user.sub),
        isNull(projectsTable.deletedAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  return c.json({ data: rows[0] }, 200);
});

// -- Update Project ---------------------------------------------------------

app.openapi(updateProjectRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb();

  const membership = await getUserMembership(id, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }
  if (membership.role === 'viewer') {
    throw new HTTPException(403, { message: 'Insufficient permissions' });
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.address !== undefined) updates.address = body.address;
  if (body.clientName !== undefined) updates.clientName = body.clientName;
  if (body.status !== undefined) updates.status = body.status;

  const [updated] = await db
    .update(projectsTable)
    .set(updates)
    .where(and(eq(projectsTable.id, id), isNull(projectsTable.deletedAt)))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  return c.json(
    {
      data: {
        id: updated.id,
        ownerId: updated.ownerId,
        name: updated.name,
        address: updated.address,
        clientName: updated.clientName,
        status: updated.status,
        role: membership.role,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    },
    200,
  );
});

// -- Delete Project (soft) --------------------------------------------------

app.openapi(deleteProjectRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const db = getDb();

  const membership = await getUserMembership(id, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }
  if (membership.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only admins can delete projects' });
  }

  const [deleted] = await db
    .update(projectsTable)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(projectsTable.id, id), isNull(projectsTable.deletedAt)))
    .returning({ id: projectsTable.id });

  if (!deleted) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  return c.json({ success: true }, 200);
});

// -- List Members -----------------------------------------------------------

app.openapi(listMembersRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const db = getDb();

  const membership = await getUserMembership(id, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  const members = await db
    .select({
      id: projectMembers.id,
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      role: projectMembers.role,
      createdAt: projectMembers.createdAt,
      fullName: profiles.fullName,
      phone: profiles.phone,
    })
    .from(projectMembers)
    .innerJoin(profiles, eq(projectMembers.userId, profiles.id))
    .where(eq(projectMembers.projectId, id));

  return c.json({ data: members }, 200);
});

// -- Add Member -------------------------------------------------------------

app.openapi(addMemberRoute, async (c) => {
  const user = c.get('user');
  const { id: projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb();

  const membership = await getUserMembership(projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }
  if (membership.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only admins can add members' });
  }

  const [member] = await db
    .insert(projectMembers)
    .values({
      projectId,
      userId: body.userId,
      role: body.role,
      invitedBy: user.sub,
    })
    .returning();

  const [profile] = await db
    .select({ fullName: profiles.fullName, phone: profiles.phone })
    .from(profiles)
    .where(eq(profiles.id, body.userId))
    .limit(1);

  return c.json(
    {
      data: {
        id: member.id,
        projectId: member.projectId,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        fullName: profile?.fullName ?? null,
        phone: profile?.phone ?? null,
      },
    },
    201,
  );
});

// -- Update Member Role -----------------------------------------------------

app.openapi(updateMemberRoleRoute, async (c) => {
  const user = c.get('user');
  const { id: projectId, userId: targetUserId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = getDb();

  const membership = await getUserMembership(projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }
  if (membership.role !== 'admin') {
    throw new HTTPException(403, {
      message: 'Only admins can update member roles',
    });
  }

  const [updated] = await db
    .update(projectMembers)
    .set({ role: body.role, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: 'Member not found' });
  }

  const [profile] = await db
    .select({ fullName: profiles.fullName, phone: profiles.phone })
    .from(profiles)
    .where(eq(profiles.id, targetUserId))
    .limit(1);

  return c.json(
    {
      data: {
        id: updated.id,
        projectId: updated.projectId,
        userId: updated.userId,
        role: updated.role,
        createdAt: updated.createdAt,
        fullName: profile?.fullName ?? null,
        phone: profile?.phone ?? null,
      },
    },
    200,
  );
});

// -- Remove Member ----------------------------------------------------------

app.openapi(removeMemberRoute, async (c) => {
  const user = c.get('user');
  const { id: projectId, userId: targetUserId } = c.req.valid('param');
  const db = getDb();

  const membership = await getUserMembership(projectId, user.sub);
  if (!membership) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  // Allow self-removal or admin removal
  const isSelfRemoval = user.sub === targetUserId;
  if (!isSelfRemoval && membership.role !== 'admin') {
    throw new HTTPException(403, {
      message: 'Only admins can remove members',
    });
  }

  // Prevent removing the last admin
  if (targetUserId === user.sub && membership.role === 'admin') {
    const adminCount = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, 'admin'),
        ),
      );

    if (adminCount.length <= 1) {
      throw new HTTPException(400, {
        message: 'Cannot remove the last admin',
      });
    }
  }

  const deleted = await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId),
      ),
    )
    .returning({ id: projectMembers.id });

  if (deleted.length === 0) {
    throw new HTTPException(404, { message: 'Member not found' });
  }

  return c.json({ success: true }, 200);
});

export { app as projects };
export {
  listProjectsRoute as listProjects,
  createProjectRoute as createProject,
  getProjectRoute as getProject,
  updateProjectRoute as updateProject,
  deleteProjectRoute as deleteProject,
  listMembersRoute as listMembers,
  addMemberRoute as addMember,
  updateMemberRoleRoute as updateMemberRole,
  removeMemberRoute as removeMember,
};
