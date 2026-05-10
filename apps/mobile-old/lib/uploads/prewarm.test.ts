import { describe, expect, it, vi } from "vitest";

// Stub the RN + uploads surfaces so the test doesn't drag in the real
// native modules. We're only verifying the scheduling contract here.
vi.mock("react-native", () => ({
  InteractionManager: { runAfterInteractions: (cb: () => void) => cb() },
}));
vi.mock("@/lib/uploads", () => ({ getUploadQueue: () => undefined }));

import { schedulePrewarmUploadQueue } from "./prewarm";

describe("schedulePrewarmUploadQueue", () => {
  it("does NOT call prewarm synchronously — it must defer via the scheduler", () => {
    const prewarm = vi.fn();
    let scheduled: (() => void) | null = null;
    schedulePrewarmUploadQueue({
      schedule: (cb) => {
        scheduled = cb;
      },
      prewarm,
    });

    // Regression: PR-7 made `generate.tsx` call `getUploadQueue()` during
    // render, which synchronously required notifee + expo-file-system +
    // the supabase client and blocked the JS thread on every cold open
    // of a report (perceived as "notes load slowly"). The pre-warm MUST
    // be queued — not executed inline — so it never lands on a screen's
    // render-commit critical path.
    expect(prewarm).not.toHaveBeenCalled();
    expect(scheduled).toBeTypeOf("function");

    scheduled!();
    expect(prewarm).toHaveBeenCalledTimes(1);
  });

  it("swallows pre-warm failures so a missing native module never crashes the app", () => {
    const prewarm = vi.fn(() => {
      throw new Error("notifee not linked");
    });
    let scheduled: (() => void) | null = null;
    schedulePrewarmUploadQueue({
      schedule: (cb) => {
        scheduled = cb;
      },
      prewarm,
    });
    expect(() => scheduled!()).not.toThrow();
    expect(prewarm).toHaveBeenCalledTimes(1);
  });
});
