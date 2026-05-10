import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: err.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        },
      },
      422,
    );
  }

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          code: 'http_error',
          message: err.message,
        },
      },
      err.status,
    );
  }

  console.error('Unhandled error:', err);

  return c.json(
    {
      error: {
        code: 'internal_error',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : String(err),
      },
    },
    500,
  );
};
