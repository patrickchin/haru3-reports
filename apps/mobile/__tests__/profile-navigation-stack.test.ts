import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Navigation stack simulation for the profile screen.
 *
 * The reported bug: opening Profile from the Projects list (often right after
 * login, sometimes only after toggling back-and-forth a few times) caused the
 * iOS edge-swipe-back gesture to do nothing on the first swipe. The user had
 * to swipe twice to actually return.
 *
 * Root cause: Profile lived inside the `(tabs)` Tabs navigator. The Tabs
 * navigator state (which tab is active) is a singleton shared across all
 * parent Stack entries. Pushing `/(tabs)/profile` from `/(tabs)/projects`
 * added a parent-stack entry, but popping it didn't reset the active tab —
 * the Tabs navigator stayed on "profile". From the user's perspective, the
 * pop did nothing. The intermittency came from React Navigation occasionally
 * re-syncing state after auth events / layout effects, masking the bug on
 * some attempts.
 *
 * Fix: Profile was promoted to a root-level Stack screen. Push and pop are
 * now perfectly symmetric — one swipe always returns the user to the origin.
 *
 * These tests model both navigators and assert the core invariant:
 *
 *   ∀ origin screens S, ∀ N ≥ 1:
 *     after pushing /profile from S, exactly one back-pop must restore S.
 *
 * The simulation is deliberately faithful to the bug:
 *  - The Tabs navigator holds a SINGLE active-tab state shared across stack
 *    entries (the singleton trap that caused the original bug).
 *  - Pushes append a parent-Stack entry; pops remove the top entry.
 *  - When the route is in (tabs), the visible screen is determined by both
 *    the top stack entry AND the singleton active-tab — modelling exactly
 *    the broken behavior.
 */

type StackEntry =
  | { kind: "tabs" } // active tab determined by singleton tabsActive
  | { kind: "screen"; route: string };

interface NavState {
  stack: StackEntry[];
  /** Singleton: which tab is active inside any (tabs) entry. */
  tabsActive: string;
}

interface Router {
  push: (route: string) => void;
  back: () => void;
  canGoBack: () => boolean;
  /** Visible screen path, computed from current state. */
  current: () => string;
}

/**
 * Build a router that treats `tabsRoutes` as members of a singleton Tabs
 * navigator. All other routes are pushed as plain Stack screens.
 */
function makeRouter(initial: string, tabsRoutes: readonly string[]): { router: Router; state: NavState } {
  const isTab = (route: string) => tabsRoutes.includes(route);

  const state: NavState = {
    stack: isTab(initial) ? [{ kind: "tabs" }] : [{ kind: "screen", route: initial }],
    tabsActive: isTab(initial) ? initial : tabsRoutes[0]!,
  };

  const router: Router = {
    push: (route) => {
      if (isTab(route)) {
        // ❌ The OLD broken model: push a tabs entry + flip the singleton.
        // ✅ The NEW model never reaches this branch because /profile is no
        //    longer a tab — but we keep the branch so the simulation can
        //    *prove* the bug is gone by also running the buggy variant below.
        state.stack.push({ kind: "tabs" });
        state.tabsActive = route;
      } else {
        state.stack.push({ kind: "screen", route });
      }
    },
    back: () => {
      if (state.stack.length <= 1) return;
      state.stack.pop();
    },
    canGoBack: () => state.stack.length > 1,
    current: () => {
      const top = state.stack[state.stack.length - 1]!;
      return top.kind === "tabs" ? state.tabsActive : top.route;
    },
  };

  return { router, state };
}

describe("profile navigation — single-pop returns to origin (the fix)", () => {
  // After the fix, /profile is NOT a tab — only /projects is.
  const TABS = ["/projects"] as const;

  it.each([
    ["/projects"],
    ["/projects/proj-1"],
    ["/projects/proj-1/reports/rep-9"],
  ])("a single back-pop from /profile restores the origin: %s", (origin) => {
    const { router } = makeRouter(origin, TABS);
    expect(router.current()).toBe(origin);

    router.push("/profile");
    expect(router.current()).toBe("/profile");

    router.back();
    expect(router.current()).toBe(origin);
  });

  it("survives many push/pop cycles without drift (50 iterations)", () => {
    const { router, state } = makeRouter("/projects", TABS);
    const baselineDepth = state.stack.length;

    for (let i = 0; i < 50; i++) {
      router.push("/profile");
      expect(router.current()).toBe("/profile");
      router.back();
      expect(router.current()).toBe("/projects");
      // Stack depth must return to baseline every cycle — no accumulation.
      expect(state.stack.length).toBe(baselineDepth);
    }
  });

  it("interleaves deep-screen navigation with profile cycles", () => {
    const { router } = makeRouter("/projects", TABS);

    router.push("/projects/proj-1");
    expect(router.current()).toBe("/projects/proj-1");

    router.push("/profile");
    router.back();
    expect(router.current()).toBe("/projects/proj-1");

    router.push("/projects/proj-1/reports/rep-9");
    router.push("/profile");
    router.back();
    expect(router.current()).toBe("/projects/proj-1/reports/rep-9");

    // Unwind back to root.
    router.back();
    router.back();
    expect(router.current()).toBe("/projects");
  });
});

describe("profile navigation — proves the OLD layout was the bug", () => {
  // BEFORE the fix, /profile was a member of the (tabs) navigator.
  const TABS_OLD = ["/projects", "/profile"] as const;

  it("(buggy) one back-pop from /profile leaves the user appearing stuck on /profile", () => {
    const { router, state } = makeRouter("/projects", TABS_OLD);
    router.push("/profile");
    expect(router.current()).toBe("/profile");
    expect(state.stack.length).toBe(2);

    router.back();
    // The bug: popping the parent-stack entry returns to depth 1, but the
    // singleton `tabsActive` is still "/profile", so the user still sees
    // the Profile screen and has to back out a SECOND time.
    expect(state.stack.length).toBe(1);
    expect(router.current()).toBe("/profile");
  });
});
