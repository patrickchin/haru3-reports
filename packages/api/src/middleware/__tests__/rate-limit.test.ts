import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { rateLimit, _resetRateLimitStore } from '../rate-limit.js';

function createTestApp(limit = 3, windowMs = 60_000) {
  const app = new Hono();
  app.use('*', rateLimit({ limit, windowMs }));
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimit middleware', () => {
  beforeEach(() => {
    _resetRateLimitStore();
  });

  it('sets rate limit headers on success', async () => {
    const app = createTestApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('2');
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });

  it('decrements remaining count', async () => {
    const app = createTestApp();
    await app.request('/test');
    const res = await app.request('/test');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('1');
  });

  it('returns 429 when limit exceeded', async () => {
    const app = createTestApp(2);
    await app.request('/test');
    await app.request('/test');
    const res = await app.request('/test');
    expect(res.status).toBe(429);
  });

  it('sets Retry-After header on 429', async () => {
    const app = createTestApp(1);
    await app.request('/test');
    const res = await app.request('/test');
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('returns error body on 429', async () => {
    const app = createTestApp(1);
    // Need error handler to convert HTTPException to JSON
    app.onError((err, c) => {
      if ('status' in err) {
        return c.json({ error: { message: (err as any).message } }, (err as any).status);
      }
      return c.json({ error: { message: 'unknown' } }, 500);
    });
    await app.request('/test');
    const res = await app.request('/test');
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.message).toBe('Rate limit exceeded');
  });

  it('isolates rate limits by path', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ limit: 1, windowMs: 60_000 }));
    app.get('/a', (c) => c.json({ ok: true }));
    app.get('/b', (c) => c.json({ ok: true }));

    await app.request('/a');
    const res = await app.request('/b');
    expect(res.status).toBe(200);
  });
});
