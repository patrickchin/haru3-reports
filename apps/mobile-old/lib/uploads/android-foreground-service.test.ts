import { describe, expect, it, vi } from "vitest";
import {
  createUploadForegroundService,
  registerUploadForegroundTask,
  UPLOAD_CHANNEL_ID,
  UPLOAD_NOTIFICATION_ID,
  type NotifeeLike,
} from "./android-foreground-service";

function makeNotifee(overrides: Partial<NotifeeLike> = {}): NotifeeLike & {
  spy: {
    register: ReturnType<typeof vi.fn>;
    requestPermission: ReturnType<typeof vi.fn>;
    createChannel: ReturnType<typeof vi.fn>;
    displayNotification: ReturnType<typeof vi.fn>;
    stopForegroundService: ReturnType<typeof vi.fn>;
  };
} {
  const register = vi.fn();
  const requestPermission = vi
    .fn()
    .mockResolvedValue({ authorizationStatus: 1 });
  const createChannel = vi.fn().mockResolvedValue("ch");
  const displayNotification = vi.fn().mockResolvedValue("n");
  const stopForegroundService = vi.fn().mockResolvedValue(undefined);
  return {
    registerForegroundService: register,
    requestPermission,
    createChannel,
    displayNotification,
    stopForegroundService,
    ...overrides,
    spy: {
      register,
      requestPermission,
      createChannel,
      displayNotification,
      stopForegroundService,
    },
  };
}

describe("createUploadForegroundService", () => {
  it("is a no-op on iOS", async () => {
    const notifee = makeNotifee();
    const svc = createUploadForegroundService({ notifee, platform: "ios" });
    await svc.notifyActive({ active: 3, progress: 0.5 });
    await svc.stop();
    expect(notifee.spy.requestPermission).not.toHaveBeenCalled();
    expect(notifee.spy.displayNotification).not.toHaveBeenCalled();
    expect(notifee.spy.stopForegroundService).not.toHaveBeenCalled();
  });

  it("requests permission + creates channel exactly once on first notifyActive", async () => {
    const notifee = makeNotifee();
    const svc = createUploadForegroundService({ notifee, platform: "android" });

    await svc.notifyActive({ active: 1 });
    await svc.notifyActive({ active: 2, progress: 0.3 });
    await svc.notifyActive({ active: 3, progress: 0.6 });

    expect(notifee.spy.requestPermission).toHaveBeenCalledTimes(1);
    expect(notifee.spy.createChannel).toHaveBeenCalledTimes(1);
    expect(notifee.spy.createChannel.mock.calls[0]?.[0]).toMatchObject({
      id: UPLOAD_CHANNEL_ID,
    });
    expect(notifee.spy.displayNotification).toHaveBeenCalledTimes(3);
  });

  it("renders pluralized titles and percent body when progress is known", async () => {
    const notifee = makeNotifee();
    const svc = createUploadForegroundService({ notifee, platform: "android" });

    await svc.notifyActive({ active: 1, progress: 0.42 });
    const single = notifee.spy.displayNotification.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(single.id).toBe(UPLOAD_NOTIFICATION_ID);
    expect(single.title).toBe("Uploading 1 file");
    expect(single.body).toBe("42% complete");
    expect((single.android as Record<string, unknown>).asForegroundService).toBe(
      true,
    );
    expect(
      (single.android as Record<string, unknown>).channelId,
    ).toBe(UPLOAD_CHANNEL_ID);

    await svc.notifyActive({ active: 4 });
    const many = notifee.spy.displayNotification.mock.calls[1]?.[0] as Record<
      string,
      unknown
    >;
    expect(many.title).toBe("Uploading 4 files");
    expect(many.body).toBeUndefined();
    expect(
      (many.android as { progress: { indeterminate: boolean } }).progress
        .indeterminate,
    ).toBe(true);
  });

  it("does nothing when active is 0", async () => {
    const notifee = makeNotifee();
    const svc = createUploadForegroundService({ notifee, platform: "android" });
    await svc.notifyActive({ active: 0 });
    expect(notifee.spy.displayNotification).not.toHaveBeenCalled();
  });

  it("stop tears down the service only after a successful start", async () => {
    const notifee = makeNotifee();
    const svc = createUploadForegroundService({ notifee, platform: "android" });

    await svc.stop();
    expect(notifee.spy.stopForegroundService).not.toHaveBeenCalled();

    await svc.notifyActive({ active: 1 });
    await svc.stop();
    expect(notifee.spy.stopForegroundService).toHaveBeenCalledTimes(1);

    // Idempotent.
    await svc.stop();
    expect(notifee.spy.stopForegroundService).toHaveBeenCalledTimes(1);
  });

  it("swallows notifee errors so an upload still proceeds when permission is denied", async () => {
    const notifee = makeNotifee({
      requestPermission: vi.fn().mockRejectedValue(new Error("denied")),
      displayNotification: vi.fn().mockRejectedValue(new Error("no perm")),
    });
    const svc = createUploadForegroundService({ notifee, platform: "android" });
    await expect(svc.notifyActive({ active: 1 })).resolves.toBeUndefined();
  });
});

describe("registerUploadForegroundTask", () => {
  it("registers a runner whose promise stays pending (keeps the service alive)", async () => {
    const notifee = makeNotifee();
    registerUploadForegroundTask(notifee);

    expect(notifee.spy.register).toHaveBeenCalledTimes(1);
    const runner = notifee.spy.register.mock.calls[0]?.[0] as (
      n: { id: string },
    ) => Promise<void>;

    let resolved = false;
    void runner({ id: "x" }).then(() => {
      resolved = true;
    });
    // Flush microtasks; the promise should NOT resolve.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
  });
});
