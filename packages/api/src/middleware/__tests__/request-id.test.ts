import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requestId } from '../request-id.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createTestApp() {
  const app = new Hono();
  app.use('*', requestId);
  app.get('/ping', (c) => c.json({ requestId: c.get('requestId') }));
  return app;
}

describe('requestId middleware', () => {
  it('sets X-Request-Id response header', async () => {
    const app = createTestApp();
    const res = await app.request('/ping');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('returns a valid UUID', async () => {
    const app = createTestApp();
    const res = await app.request('/ping');
    const id = res.headers.get('X-Request-Id')!;
    expect(id).toMatch(UUID_RE);
  });

  it('stores requestId in context', async () => {
    const app = createTestApp();
    const res = await app.request('/ping');
    const body = await res.json();
    const headerId = res.headers.get('X-Request-Id');
    expect(body.requestId).toBe(headerId);
  });

  it('generates unique ids per request', async () => {
    const app = createTestApp();
    const [r1, r2] = await Promise.all([
      app.request('/ping'),
      app.request('/ping'),
    ]);
    expect(r1.headers.get('X-Request-Id')).not.toBe(
      r2.headers.get('X-Request-Id'),
    );
  });
});
