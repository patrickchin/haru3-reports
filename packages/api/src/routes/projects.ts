import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { auth } from '../middleware/auth.js';
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
// Projects CRUD
// ---------------------------------------------------------------------------

const listProjects = createRoute({
  method: 'get',
  path: '/api/v1/projects',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: { query: ProjectListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: listResponse(ProjectSchema) } },
      description: 'List of projects',
    },
    ...errorResponses,
  },
});

const createProject = createRoute({
  method: 'post',
  path: '/api/v1/projects',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateProjectSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: dataResponse(ProjectSchema) } },
      description: 'Created project',
    },
    ...errorResponses,
  },
});

const getProject = createRoute({
  method: 'get',
  path: '/api/v1/projects/{id}',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ProjectDetailSchema) } },
      description: 'Project detail',
    },
    ...errorResponses,
  },
});

const updateProject = createRoute({
  method: 'patch',
  path: '/api/v1/projects/{id}',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: {
    params: UuidParamSchema,
    body: { content: { 'application/json': { schema: UpdateProjectSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ProjectSchema) } },
      description: 'Updated project',
    },
    ...errorResponses,
  },
});

const deleteProject = createRoute({
  method: 'delete',
  path: '/api/v1/projects/{id}',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Soft-deleted project',
    },
    ...errorResponses,
  },
});

// ---------------------------------------------------------------------------
// Project Members
// ---------------------------------------------------------------------------

const listMembers = createRoute({
  method: 'get',
  path: '/api/v1/projects/{id}/members',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: { params: UuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(z.array(ProjectMemberSchema)) } },
      description: 'List of members',
    },
    ...errorResponses,
  },
});

const addMember = createRoute({
  method: 'post',
  path: '/api/v1/projects/{id}/members',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: {
    params: UuidParamSchema,
    body: { content: { 'application/json': { schema: AddMemberSchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: dataResponse(ProjectMemberSchema) } },
      description: 'Added member',
    },
    ...errorResponses,
  },
});

const updateMemberRole = createRoute({
  method: 'patch',
  path: '/api/v1/projects/{id}/members/{userId}',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: {
    params: MemberParamSchema,
    body: { content: { 'application/json': { schema: UpdateMemberRoleSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: dataResponse(ProjectMemberSchema) } },
      description: 'Updated member',
    },
    ...errorResponses,
  },
});

const removeMember = createRoute({
  method: 'delete',
  path: '/api/v1/projects/{id}/members/{userId}',
  tags: ['Project Members'],
  security: [{ bearerAuth: [] }],
  request: { params: MemberParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
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

app.openapi(listProjects, (c) => {
  return c.json({ data: [], meta: { hasNext: false, nextCursor: null, count: 0 } }, 200);
});

app.openapi(createProject, (c) => {
  return c.json({ data: {} as any }, 201);
});

app.openapi(getProject, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(updateProject, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(deleteProject, (c) => {
  return c.json({ success: true }, 200);
});

app.openapi(listMembers, (c) => {
  return c.json({ data: [] }, 200);
});

app.openapi(addMember, (c) => {
  return c.json({ data: {} as any }, 201);
});

app.openapi(updateMemberRole, (c) => {
  return c.json({ data: {} as any }, 200);
});

app.openapi(removeMember, (c) => {
  return c.json({ success: true }, 200);
});

export { app as projects };
export {
  listProjects, createProject, getProject, updateProject, deleteProject,
  listMembers, addMember, updateMemberRole, removeMember,
};
