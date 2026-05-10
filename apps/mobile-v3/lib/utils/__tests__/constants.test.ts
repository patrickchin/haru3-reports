import { describe, it, expect } from 'vitest';
import { APP_NAME, QUERY_STALE_TIME, QUERY_GC_TIME } from '../../constants';

describe('constants', () => {
  it('APP_NAME is defined', () => {
    expect(APP_NAME).toBe('Harpa Pro');
  });

  it('QUERY_STALE_TIME is 30s', () => {
    expect(QUERY_STALE_TIME).toBe(30_000);
  });

  it('QUERY_GC_TIME is 5min', () => {
    expect(QUERY_GC_TIME).toBe(5 * 60_000);
  });
});
