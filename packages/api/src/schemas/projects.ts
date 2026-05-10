import { z } from '@hono/zod-openapi';
import { PROJECT_STATUSES, MEMBER_ROLES, PROJECT_ROLES } from '@harpa/api-contract';

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  clientName: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  role: z.enum(PROJECT_ROLES).openapi({ description: 'Current user role in this project' }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('Project');

export const ProjectDetailSchema = ProjectSchema.openapi('ProjectDetail');

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  clientName: z.string().max(200).optional(),
}).openapi('CreateProject');

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  clientName: z.string().max(200).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
}).openapi('UpdateProject');

export const ProjectListQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ProjectMemberSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(MEMBER_ROLES),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string().datetime(),
}).openapi('ProjectMember');

export const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(MEMBER_ROLES),
}).openapi('AddMember');

export const UpdateMemberRoleSchema = z.object({
  role: z.enum(MEMBER_ROLES),
}).openapi('UpdateMemberRole');
