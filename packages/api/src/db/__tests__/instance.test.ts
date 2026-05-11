import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// We must mock the client module so that getDb doesn't actually connect to postgres
vi.mock('../client.js', () => ({
  createDb: vi.fn().mockReturnValue({ mock: true }),
}));

describe('db/instance', () => {
  const savedUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    else delete process.env.DATABASE_URL;
  });

  it('throws when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;

    // Re-mock after resetModules
    vi.doMock('../client.js', () => ({
      createDb: vi.fn().mockReturnValue({ mock: true }),
    }));

    const { getDb } = await import('../instance.js');
    expect(() => getDb()).toThrow('DATABASE_URL not configured');
  });

  it('returns a db instance when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';

    vi.doMock('../client.js', () => ({
      createDb: vi.fn().mockReturnValue({ mock: true }),
    }));

    const { getDb } = await import('../instance.js');
    const db = getDb();
    expect(db).toBeDefined();
  });

  it('returns the same singleton on subsequent calls', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';

    vi.doMock('../client.js', () => ({
      createDb: vi.fn().mockReturnValue({ mock: true }),
    }));

    const { getDb } = await import('../instance.js');
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });
});
