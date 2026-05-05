/**
 * CORS middleware.
 *
 * Mobile (React Native fetch) does not send Origin headers, so CORS is
 * a no-op for the app. Browser clients (the playground at
 * `apps/playground` deployed to Vercel) send Origin and need an
 * allowlist driven by `ALLOWED_ORIGINS` env.
 */
import { cors } from "hono/cors";
import { getEnv } from "../env.js";

export const corsMiddleware = () => {
  const env = getEnv();
  return cors({
    origin: (incoming) => {
      // No Origin header → mobile client; allow.
      if (!incoming) return incoming;
      return env.ALLOWED_ORIGINS.includes(incoming) ? incoming : null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-Request-Id",
      "X-Playground-Key",
      "X-Idempotency-Key",
    ],
    exposeHeaders: ["X-Request-Id"],
    credentials: false,
    maxAge: 86400,
  });
};
