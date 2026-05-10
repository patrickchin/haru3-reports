import { describe, expect, it, beforeEach } from "vitest";
import {
  createCameraSession,
  commitCameraSession,
  consumeCameraSession,
  getCameraSession,
  __resetCameraSessionsForTests,
} from "./camera-session-registry";

beforeEach(() => __resetCameraSessionsForTests());

describe("camera-session-registry", () => {
  it("creates unique sessions and exposes their context", () => {
    const a = createCameraSession({ returnTo: "/x", context: { p: 1 } });
    const b = createCameraSession({ returnTo: "/y" });
    expect(a).not.toBe(b);
    expect(getCameraSession(a)?.context).toEqual({ p: 1 });
    expect(getCameraSession(b)?.returnTo).toBe("/y");
  });

  it("commit + consume returns the URIs and removes the entry", () => {
    const id = createCameraSession({ returnTo: "/x" });
    commitCameraSession(id, ["file:///a.jpg", "file:///b.jpg"]);
    expect(consumeCameraSession(id)).toEqual(["file:///a.jpg", "file:///b.jpg"]);
    // Second consume yields undefined (single-use).
    expect(consumeCameraSession(id)).toBeUndefined();
    expect(getCameraSession(id)).toBeUndefined();
  });

  it("consume on an uncommitted session (user cancelled) returns undefined and clears", () => {
    const id = createCameraSession({ returnTo: "/x" });
    expect(consumeCameraSession(id)).toBeUndefined();
    expect(getCameraSession(id)).toBeUndefined();
  });

  it("commit on an unknown session is a no-op (does not throw)", () => {
    expect(() => commitCameraSession("ghost", ["x"])).not.toThrow();
  });
});
