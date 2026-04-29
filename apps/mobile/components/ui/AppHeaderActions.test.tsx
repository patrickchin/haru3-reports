import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const navigateMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();
let pathnameValue = "/(tabs)/projects";

vi.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({
    navigate: navigateMock,
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => pathnameValue,
}));

vi.mock("react-native", () => {
  const React = require("react");
  const mk = (name: string) =>
    function Stub(props: Record<string, unknown> & { children?: React.ReactNode }) {
      return React.createElement(name, props as object, props.children ?? null);
    };
  return { View: mk("View") };
});

vi.mock("lucide-react-native", () => ({
  CircleUserRound: () => null,
}));

vi.mock("@/components/ui/Button", () => {
  const React = require("react");
  return {
    Button: function Button(
      props: Record<string, unknown> & { children?: React.ReactNode },
    ) {
      return React.createElement("Button", props as object, props.children ?? null);
    },
  };
});

import { create, act } from "react-test-renderer";
import { AppHeaderActions } from "./AppHeaderActions";

function findButton(tree: ReturnType<typeof create>) {
  const root = tree.root;
  return root.findByProps({ testID: "btn-open-profile" });
}

describe("AppHeaderActions", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    pathnameValue = "/(tabs)/projects";
  });

  it("uses router.navigate (not push) when opening profile so a single back press unwinds", () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<AppHeaderActions />);
    });

    const button = findButton(tree);
    act(() => {
      (button.props as { onPress: () => void }).onPress();
    });

    // Regression: previously used router.push, which stacked a duplicate
    // (tabs) entry and required two back presses to fully exit the profile
    // screen back to the projects tab.
    expect(pushMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/(tabs)/profile");
  });

  it("does not navigate when already on the profile screen", () => {
    pathnameValue = "/(tabs)/profile";

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<AppHeaderActions />);
    });

    const button = findButton(tree);
    act(() => {
      (button.props as { onPress: () => void }).onPress();
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
