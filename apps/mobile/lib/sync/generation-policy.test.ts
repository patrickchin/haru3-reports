import { describe, it, expect } from "vitest";

import {
  shouldRunNow,
  type GenerationContext,
} from "./generation-policy";

const base: GenerationContext = {
  mode: "auto_wifi",
  net: { reachable: true, type: "wifi" },
  battery: { level: 0.8, charging: false },
  appState: "active",
  budget: { spentToday: 0, limit: 10 },
  userInitiated: false,
};

describe("shouldRunNow", () => {
  it("runs when all auto_wifi conditions met", () => {
    expect(shouldRunNow(base)).toBe("run");
  });

  it("waits when offline (auto)", () => {
    expect(shouldRunNow({ ...base, net: { reachable: false, type: "none" } })).toBe(
      "wait",
    );
  });

  it("waits on cellular when mode=auto_wifi", () => {
    expect(
      shouldRunNow({ ...base, net: { reachable: true, type: "cellular" } }),
    ).toBe("wait");
  });

  it("runs on cellular when mode=auto_any", () => {
    expect(
      shouldRunNow({
        ...base,
        mode: "auto_any",
        net: { reachable: true, type: "cellular" },
      }),
    ).toBe("run");
  });

  it("waits on low battery when not charging", () => {
    expect(
      shouldRunNow({ ...base, battery: { level: 0.1, charging: false } }),
    ).toBe("wait");
  });

  it("runs on low battery when charging", () => {
    expect(
      shouldRunNow({ ...base, battery: { level: 0.1, charging: true } }),
    ).toBe("run");
  });

  it("waits when app is backgrounded", () => {
    expect(shouldRunNow({ ...base, appState: "background" })).toBe("wait");
  });

  it("returns skip-needs-user when mode=manual without userInitiated", () => {
    expect(shouldRunNow({ ...base, mode: "manual" })).toBe("skip-needs-user");
  });

  it("runs when manual + userInitiated + reachable", () => {
    expect(
      shouldRunNow({ ...base, mode: "manual", userInitiated: true }),
    ).toBe("run");
  });

  it("waits when userInitiated but offline", () => {
    expect(
      shouldRunNow({
        ...base,
        userInitiated: true,
        net: { reachable: false, type: "none" },
      }),
    ).toBe("wait");
  });

  it("userInitiated overrides battery and app-state gates", () => {
    expect(
      shouldRunNow({
        ...base,
        userInitiated: true,
        appState: "background",
        battery: { level: 0.05, charging: false },
        net: { reachable: true, type: "cellular" },
      }),
    ).toBe("run");
  });

  it("budget hard-cap returns skip-needs-user even when userInitiated", () => {
    expect(
      shouldRunNow({
        ...base,
        userInitiated: true,
        budget: { spentToday: 10, limit: 10 },
      }),
    ).toBe("skip-needs-user");
  });
});
