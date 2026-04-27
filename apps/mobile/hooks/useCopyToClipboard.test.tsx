import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { useCopyToClipboard } from "./useCopyToClipboard";

declare global {
  // React 19 act() requires this flag on globalThis to opt the test
  // environment into act warnings.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const setStringAsyncMock = vi.fn<(value: string) => Promise<void>>();
const showMock = vi.fn();

vi.mock("expo-clipboard", () => ({
  setStringAsync: (value: string) => setStringAsyncMock(value),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  ToastAndroid: {
    show: (...args: unknown[]) => showMock(...args),
    SHORT: 0,
    LONG: 1,
  },
}));

type HookHandle = ReturnType<typeof useCopyToClipboard>;

const HookProbe = forwardRef<HookHandle>((_, ref) => {
  const value = useCopyToClipboard();
  useImperativeHandle(ref, () => value, [value]);
  return null;
});
HookProbe.displayName = "HookProbe";

function renderHook() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = React.createRef<HookHandle>();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HookProbe ref={ref} />);
  });
  return {
    get current() {
      if (!ref.current) throw new Error("hook not mounted");
      return ref.current;
    },
    rerender: () => act(() => renderer.update(<HookProbe ref={ref} />)),
    unmount: () => act(() => renderer.unmount()),
  };
}

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    setStringAsyncMock.mockReset();
    setStringAsyncMock.mockResolvedValue(undefined);
    showMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the value to the clipboard and flips isCopied for ~1.5s", async () => {
    const hook = renderHook();

    await act(async () => {
      await hook.current.copy("hello world");
    });

    expect(setStringAsyncMock).toHaveBeenCalledWith("hello world");
    expect(hook.current.isCopied("hello world")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(hook.current.isCopied("hello world")).toBe(false);

    hook.unmount();
  });

  it("uses the provided key when supplied so callers can disambiguate values", async () => {
    const hook = renderHook();

    await act(async () => {
      await hook.current.copy("Acme Corp", { key: "client" });
    });

    expect(hook.current.isCopied("client")).toBe(true);
    expect(hook.current.isCopied("Acme Corp")).toBe(false);

    hook.unmount();
  });

  it("returns false and skips clipboard work for empty values", async () => {
    const hook = renderHook();

    let result: boolean | undefined;
    await act(async () => {
      result = await hook.current.copy(null);
    });

    expect(result).toBe(false);
    expect(setStringAsyncMock).not.toHaveBeenCalled();
    expect(hook.current.copiedKey).toBeNull();

    await act(async () => {
      result = await hook.current.copy("");
    });
    expect(result).toBe(false);

    hook.unmount();
  });

  it("does not show a Toast on iOS", async () => {
    const hook = renderHook();

    await act(async () => {
      await hook.current.copy("hi");
    });

    expect(showMock).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("resets the previous timer when copy() is called again", async () => {
    const hook = renderHook();

    await act(async () => {
      await hook.current.copy("first");
    });
    expect(hook.current.isCopied("first")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await act(async () => {
      await hook.current.copy("second");
    });
    expect(hook.current.isCopied("second")).toBe(true);
    expect(hook.current.isCopied("first")).toBe(false);

    // The original timer would have fired at 1500ms total — make sure
    // advancing past that point does NOT clear "second" early.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(hook.current.isCopied("second")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook.current.isCopied("second")).toBe(false);

    hook.unmount();
  });
});

describe("useCopyToClipboard on Android", () => {
  beforeEach(() => {
    setStringAsyncMock.mockReset();
    setStringAsyncMock.mockResolvedValue(undefined);
    showMock.mockReset();
    vi.useFakeTimers();
    vi.resetModules();
    vi.doMock("react-native", () => ({
      Platform: { OS: "android" },
      ToastAndroid: {
        show: (...args: unknown[]) => showMock(...args),
        SHORT: 0,
        LONG: 1,
      },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("react-native");
  });

  it("shows a Toast with the default label, or a custom one when provided", async () => {
    const { useCopyToClipboard: useHookAndroid } = await import(
      "./useCopyToClipboard"
    );

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const ref = React.createRef<ReturnType<typeof useHookAndroid>>();
    const Probe = forwardRef<ReturnType<typeof useHookAndroid>>((_, r) => {
      const v = useHookAndroid();
      useImperativeHandle(r, () => v, [v]);
      return null;
    });
    Probe.displayName = "ProbeAndroid";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Probe ref={ref} />);
    });

    await act(async () => {
      await ref.current!.copy("hi");
    });
    expect(showMock).toHaveBeenLastCalledWith("Copied", 0);

    await act(async () => {
      await ref.current!.copy("hi", { toast: "Address copied" });
    });
    expect(showMock).toHaveBeenLastCalledWith("Address copied", 0);

    act(() => renderer.unmount());
  });
});
