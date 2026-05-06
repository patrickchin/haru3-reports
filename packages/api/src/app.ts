/**
 * Hono application factory.
 *
 * The factory pattern (vs a singleton) makes tests deterministic —
 * each test can mount a fresh app with its own env.
 */
import { Hono } from "hono";
import { getSql } from "./db/sql.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestId } from "./middleware/request-id.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { createReportsGenerateRoutes } from "./routes/reports/generate.js";
import { createTranscribeRoutes } from "./routes/audio/transcribe.js";
import { createPlaygroundRoutes } from "./routes/playground/generate.js";
import { createAdminRoutes } from "./routes/admin/backfill-thumbnails.js";
import type { Sql } from "./db/sql.js";

export type AppVariables = {
  requestId: string;
};

export type App = Hono<{ Variables: AppVariables }>;

export interface CreateAppOptions {
  /** Override SQL client (e.g. for tests). Defaults to lazy `getSql()`. */
  readonly getSql?: () => Sql;
}

export function createApp(options: CreateAppOptions = {}): App {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestId());
  app.use("*", corsMiddleware());

  app.route("/v1/health", healthRoutes);
  app.route("/v1/me", meRoutes);
  app.route(
    "/v1/reports",
    createReportsGenerateRoutes({ getSql: options.getSql ?? getSql }),
  );
  app.route("/v1/audio", createTranscribeRoutes());
  app.route("/v1/playground", createPlaygroundRoutes());
  app.route("/v1/admin", createAdminRoutes());

  app.notFound((c) =>
    c.json(
      {
        error: "not_found",
        message: `No route for ${c.req.method} ${c.req.path}`,
        requestId: c.get("requestId"),
      },
      404,
    ),
  );

  app.onError(errorHandler);

  return app;
}
