import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError, ZodIssueCode } from 'zod';
import { errorHandler } from '../error.js';

function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  // Route that throws whatever error is passed via query
  app.get('/zod-error', () => {
    throw new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: 'string',
        received: 'number',
        path: ['email'],
        message: 'Expected string, received number',
      },
    ]);
  });
  app.get('/http-error', () => {
    throw new HTTPException(404, { message: 'Not found' });
  });
  app.get('/generic-error', () => {
    throw new Error('Something broke');
  });
  return app;
}

describe('error middleware', () => {
  const app = buildApp();

  it('handles ZodError with 422 and field details', async () => {
    const res = await app.request('/zod-error');
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details).toHaveLength(1);
    expect(body.error.details[0].field).toBe('email');
  });

  it('handles HTTPException with the correct status', async () => {
    const res = await app.request('/http-error');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('http_error');
    expect(body.error.message).toBe('Not found');
  });

  it('handles generic errors with 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await app.request('/generic-error');
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error.code).toBe('internal_error');

    vi.restoreAllMocks();
  });

  it('hides error details in production', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const res = await app.request('/generic-error');
      const body = await res.json();
      expect(body.error.message).toBe('An unexpected error occurred');
    } finally {
      if (saved) process.env.NODE_ENV = saved;
      else delete process.env.NODE_ENV;
      vi.restoreAllMocks();
    }
  });

  it('exposes error string in non-production', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const res = await app.request('/generic-error');
      const body = await res.json();
      expect(body.error.message).toContain('Something broke');
    } finally {
      if (saved) process.env.NODE_ENV = saved;
      else delete process.env.NODE_ENV;
      vi.restoreAllMocks();
    }
  });
});
