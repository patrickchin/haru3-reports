/**
 * Centralised error handler.
 *
 * Maps:
 *   - HTTPException → its configured status + message
 *   - ZodError      → 422 with field-level issues
 *   - everything else → 500 (with logging)
 *
 * Never leaks stack traces or internal messages to the client.
 */
import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { getLogger } from "../logger.js";

export type ErrorResponse = {
  error: string;
  message: string;
  requestId?: string | undefined;
  details?: unknown;
};

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId" as never) as string | undefined;
  const logger = getLogger();

  if (err instanceof HTTPException) {
    return c.json<ErrorResponse>(
      {
        error: errorCodeForStatus(err.status),
        message: err.message,
        requestId,
      },
      err.status,
    );
  }

  if (err instanceof ZodError) {
    return c.json<ErrorResponse>(
      {
        error: "validation_failed",
        message: "Request payload failed validation",
        requestId,
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
          message: i.message,
        })),
      },
      422,
    );
  }

  logger.error(
    { err, requestId, path: c.req.path },
    "unhandled error in route handler",
  );

  return c.json<ErrorResponse>(
    {
      error: "internal_error",
      message: "An unexpected error occurred",
      requestId,
    },
    500,
  );
};

function errorCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 413:
      return "payload_too_large";
    case 422:
      return "validation_failed";
    case 429:
      return "rate_limited";
    case 503:
      return "service_unavailable";
    default:
      return status >= 500 ? "internal_error" : "error";
  }
}

/** Re-export for tests / route handlers that need to throw. */
export { HTTPException } from "hono/http-exception";
export type { Context };
