import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// Regression test for "double swipe back from Profile".
//
// The user reported that after logging in, going to /projects, then tapping
// the profile button in the header, swiping back from the iOS edge required
// two swipes to return to /projects. Root cause: AppHeaderActions was using
// router.navigate("/(tabs)/profile") when on a (tabs) root, which switches
// tabs without pushing a stack entry — leaving nothing for the first
// swipe-back to pop. Fix: always router.push so a single swipe pops back.

const pushMock = vi.fn();
const navigateMock = vi.fn();
const routerMock = { push: pushMock, navigate: navigateMock };
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

// Capture the Button so we can find it by testID and invoke its onPress.
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
      // The Button stub forwards props verbatim, so testID is on its props.
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

describe("AppHeaderActions — profile button swipe-back fix", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    pushMock.mockClear();
    navigateMock.mockClear();
  });
  afterEach(() => {
    pushMock.mockReset();
    navigateMock.mockReset();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("pushes (not navigates) the profile route from /projects so a single edge-swipe returns the user", () => {
    const tree = render("/projects");
    const onPress = findOnPress(tree.root);
    expect(onPress).toBeTypeOf("function");
    onPress!();

    // The bug: router.navigate switched the active tab without leaving a
    // stack entry to pop, so the iOS swipe-back gesture required two swipes.
    expect(navigateMock).not.toHaveBeenCalled();

    // The fix: always push so the parent stack has the originating screen
    // recorded, and a single swipe-back pops it.
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/(tabs)/profile");
  });

  it("pushes the profile route from a deep screen too", () => {
    const tree = render("/projects/abc-123");
    const onPress = findOnPress(tree.root);
    onPress!();

    expect(navigateMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/(tabs)/profile");
  });

  it("does nothing when already on the profile screen", () => {
    const tree = render("/profile");
    const onPress = findOnPress(tree.root);
    onPress!();

    expect(pushMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does nothing when on /account (treated as profile-active)", () => {
    const tree = render("/account");
    const onPress = findOnPress(tree.root);
    onPress!();

    expect(pushMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
