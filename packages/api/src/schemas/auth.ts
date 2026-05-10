import { z } from '@hono/zod-openapi';

// Note: Auth is handled by Supabase Auth SDK on the client.
// These schemas are for any auth-adjacent API endpoints the server exposes.

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number().int(),
}).openapi('TokenResponse');
