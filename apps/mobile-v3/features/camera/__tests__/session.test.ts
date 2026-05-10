import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCameraSession,
  commitCameraSession,
  cancelCameraSession,
} from '../session';

describe('camera session registry', () => {
  it('creates a session with unique ID', () => {
    const s1 = createCameraSession();
    const s2 = createCameraSession();
    expect(s1.sessionId).toBeTruthy();
    expect(s2.sessionId).toBeTruthy();
    expect(s1.sessionId).not.toBe(s2.sessionId);
    // Clean up
    cancelCameraSession(s1.sessionId);
    cancelCameraSession(s2.sessionId);
  });

  it('returns a promise that resolves on commit', async () => {
    const { sessionId, promise } = createCameraSession();
    const uris = ['file:///photo1.jpg', 'file:///photo2.jpg'];

    commitCameraSession(sessionId, uris);

    const result = await promise;
    expect(result).toEqual(uris);
  });

  it('returns empty array on cancel', async () => {
    const { sessionId, promise } = createCameraSession();

    cancelCameraSession(sessionId);

    const result = await promise;
    expect(result).toEqual([]);
  });

  it('commit is idempotent (no-op after first commit)', async () => {
    const { sessionId, promise } = createCameraSession();

    commitCameraSession(sessionId, ['file:///a.jpg']);
    // Second commit should no-op (session already deleted)
    commitCameraSession(sessionId, ['file:///b.jpg']);

    const result = await promise;
    expect(result).toEqual(['file:///a.jpg']);
  });

  it('cancel is idempotent', async () => {
    const { sessionId, promise } = createCameraSession();

    cancelCameraSession(sessionId);
    cancelCameraSession(sessionId); // no-op

    const result = await promise;
    expect(result).toEqual([]);
  });

  it('commit on unknown session is a no-op', () => {
    // Should not throw
    expect(() => commitCameraSession('nonexistent', ['x'])).not.toThrow();
  });

  it('cancel on unknown session is a no-op', () => {
    expect(() => cancelCameraSession('nonexistent')).not.toThrow();
  });

  it('handles multiple concurrent sessions', async () => {
    const s1 = createCameraSession();
    const s2 = createCameraSession();
    const s3 = createCameraSession();

    commitCameraSession(s2.sessionId, ['file:///s2.jpg']);
    cancelCameraSession(s3.sessionId);
    commitCameraSession(s1.sessionId, ['file:///s1a.jpg', 'file:///s1b.jpg']);

    expect(await s1.promise).toEqual(['file:///s1a.jpg', 'file:///s1b.jpg']);
    expect(await s2.promise).toEqual(['file:///s2.jpg']);
    expect(await s3.promise).toEqual([]);
  });

  it('session ID contains timestamp prefix', () => {
    const { sessionId } = createCameraSession();
    expect(sessionId).toMatch(/^cam_\d+_\d+$/);
    cancelCameraSession(sessionId);
  });
});
