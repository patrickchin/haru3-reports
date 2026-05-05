/**
 * Sync apply endpoint.
 *
 *   POST /v1/sync/:entity   { client_op_id, op, id, base_version, fields }
 *
 * `:entity` ∈ {project, report, file_metadata, report_note}.
 *
 * Body matches what the existing apply RPCs expect (kept identical so
 * the mobile push-engine adapter only swaps transports).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authMiddleware, type AuthVariables } from "../middleware/auth.js";
import {
  APPLIABLE_ENTITIES,
  applyMutation,
  isApplyEntity,
  type ApplyEntity,
  type Sql,
} from "../services/sync-apply.js";

const payloadSchema = z.object({
  client_op_id: z.string().uuid(),
  op: z.enum(["insert", "update", "delete"]),
  id: z.string().uuid(),
  base_version: z.string().nullable(),
  fields: z.record(z.unknown()),
});

export interface SyncApplyDeps {
  readonly getSql: () => Sql;
}

export function createSyncApplyRoutes(
  deps: SyncApplyDeps,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware());

  app.post("/:entity", async (c) => {
    const entityParam = c.req.param("entity");
    if (!isApplyEntity(entityParam)) {
      throw new HTTPException(404, {
        message: `Unknown sync entity: ${entityParam}`,
      });
    }
    const entity: ApplyEntity = entityParam;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new HTTPException(422, { message: "Body must be valid JSON" });
    }

    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(422, {
        message: "Invalid mutation payload",
        cause: parsed.error,
      });
    }

    const response = await applyMutation({
      sql: deps.getSql(),
      userId: c.get("userId"),
      entity,
      payload: parsed.data,
    });

    return c.json(response);
  });

  return app;
}

export { APPLIABLE_ENTITIES };
