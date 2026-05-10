// Auth routes are intentionally minimal — Supabase Auth handles
// OTP/refresh on the client side. This file is a placeholder for
// any future server-side auth endpoints.

import { OpenAPIHono } from '@hono/zod-openapi';

const app = new OpenAPIHono();

export { app as auth };
