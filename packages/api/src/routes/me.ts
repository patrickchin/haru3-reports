/**
 * Demo / smoke route used in P1 to validate the auth middleware end
 * to end. Will be removed in P2 when real sync routes are added.
 */
import { Hono } from "hono";
import { authMiddleware, type AuthVariables } from "../middleware/auth.js";

export const meRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", authMiddleware())
  .get("/", (c) =>
    c.json({
      userId: c.get("userId"),
      jwt: {
        iat: c.get("jwtPayload").iat,
        exp: c.get("jwtPayload").exp,
      },
    }),
  );
