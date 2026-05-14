import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// Regression test for "swipe-back from Profile requires two swipes".
//
// Profile used to live inside the (tabs) Tabs navigator. Both router.navigate
// and router.push were tried, neither worked reliably:
//   • navigate: switched tabs without a parent-stack entry, so the first
//     edge-swipe had nothing to pop and required a second swipe.
//   • push: pushed a parent-stack entry, but the Tabs navigator's *singleton*
//     state (active tab) is shared across stack entries — popping the entry
//     left "profile" still active, so the user appeared stuck on Profile.
//
// Fix: profile was promoted to a root-level Stack screen (`app/profile.tsx`),
// so push/pop are perfectly symmetric and a single swipe always works. This
// suite locks in the new behavior.

const pushMock = vi.fn();
const navigateMock = vi.fn();
const replaceMock = vi.fn();
const backMock = vi.fn();
const routerMock = {
  push: pushMock,
  navigate: navigateMock,
  replace: replaceMock,
  back: backMock,
  canGoBack: () => true,
};
let pathnameValue = "/projects";

function makeStub(name: string) {
  return function Stub(
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) {
    return React.createElement(name, props as object, props.children ?? null);
  };
}

vi.mock("react-native", () => ({
  View: makeStub("View"),
}));

vi.mock("expo-router", () => ({
  useRouter: () => routerMock,
  usePathname: () => pathnameValue,
}));

vi.mock("lucide-react-native", () => ({
  CircleUserRound: () => null,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: makeStub("Button"),
}));

vi.mock("@/lib/design-tokens/colors", () => ({
  colors: { foreground: "#000" },
}));

import { AppHeaderActions } from "@/components/ui/AppHeaderActions";

function findOnPress(testInstance: TestRenderer.ReactTestInstance): (() => void) | undefined {
  const buttons = testInstance.findAll(
    (node) =>
      typeof node.type !== "string" &&
      (node.props as { testID?: string }).testID === "btn-open-profile",
  );
  if (buttons.length === 0) return undefined;
  return (buttons[0].props as { onPress?: () => void }).onPress;
}

function render(pathname: string) {
  pathnameValue = pathname;
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AppHeaderActions />);
  });
  return renderer;
}

describe("AppHeaderActions — profile button targets root /profile", () => {
  beforeEach(() => {
    pushMock.mockClear();
    navigateMock.mockClear();
    replaceMock.mockClear();
    backMock.mockClear();
  });
  afterEach(() => {
    pushMock.mockReset();
    navigateMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
  });

  it("pushes the root /profile route from /projects (not the old /(tabs)/profile)", () => {
    const tree = render("/projects");
    findOnPress(tree.root)!();

    // Old buggy targets — both must be gone.
    expect(navigateMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalledWith("/(tabs)/profile");

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/profile");
  });

  it("pushes /profile from a deep project screen", () => {
    const tree = render("/projects/abc-123");
    findOnPress(tree.root)!();

    expect(pushMock).toHaveBeenCalledWith("/profile");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("pushes /profile from a deeply nested report screen", () => {
    const tree = render("/projects/abc-123/reports/r-9");
    findOnPress(tree.root)!();

    expect(pushMock).toHaveBeenCalledWith("/profile");
  });

  it.each([
    ["/profile"],
    ["/account"],
    ["/usage"],
  ])("is a no-op when already on a profile-active path: %s", (path) => {
    const tree = render(path);
    findOnPress(tree.root)!();

    expect(pushMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
