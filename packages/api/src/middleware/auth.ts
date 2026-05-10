import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { jwtVerify } from 'jose';

export interface AuthUser {
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export const auth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization');

  if (!header?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing authorization token' });
  }

  const token = header.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;

  if (!secret) {
    throw new HTTPException(500, { message: 'JWT secret not configured' });
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );

    c.set('user', {
      sub: payload.sub as string,
      email: payload.email as string | undefined,
      phone: payload.phone as string | undefined,
      role: payload.role as string | undefined,
    });

    await next();
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }
};
