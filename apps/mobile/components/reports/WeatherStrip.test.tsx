import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  Cloud: () => React.createElement("CloudIcon"),
  Thermometer: () => React.createElement("ThermometerIcon"),
  Wind: () => React.createElement("WindIcon"),
  X: () => React.createElement("XIcon"),
  Pencil: () => React.createElement("PencilIcon"),
  Check: () => React.createElement("CheckIcon"),
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: { children?: React.ReactNode; [key: string]: unknown }) {
      return React.createElement(name, props, props.children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", props, children ?? null),
    TextInput: (props: Record<string, unknown>) =>
      React.createElement("TextInput", props),
  };
});

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Card", props, children ?? null),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function findHost(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
) {
  const matches = renderer.root.findAllByProps({ testID });
  const host = matches.find((m) => typeof m.type === "string");
  if (!host) throw new Error(`No host node with testID=${testID}`);
  return host;
}

function makeReport(weather: any) {
  return {
    report: {
      meta: { title: "", reportType: "site_visit", summary: "", visitDate: null },
      weather,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  } as any;
}

describe("WeatherStrip", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
  });
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("returns null read-only when weather is null", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WeatherStrip report={makeReport(null)} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders read-only weather summary", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeatherStrip
          report={makeReport({
            conditions: "Sunny",
            temperature: "25C",
            wind: "Light",
            impact: null,
          })}
        />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sunny");
    expect(json).toContain("25C");
    expect(json).toContain("Light");
    expect(json).not.toContain("TextInput");
  });

  it("editable mode shows pencil and read-only display by default", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeatherStrip
          report={makeReport({
            conditions: "Sunny",
            temperature: "25C",
            wind: null,
            impact: null,
          })}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    expect(() => findHost(renderer, "weather-edit")).not.toThrow();
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("TextInput");
    expect(json).toContain("Sunny");
  });

  it("tapping pencil enters edit mode and reveals TextInputs", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeatherStrip
          report={makeReport(null)}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => findHost(renderer, "weather-edit").props.onPress());
    expect(() => findHost(renderer, "weather-temperature-input")).not.toThrow();
    expect(() => findHost(renderer, "weather-conditions-input")).not.toThrow();
    expect(() => findHost(renderer, "weather-wind-input")).not.toThrow();
    expect(() => findHost(renderer, "weather-impact-input")).not.toThrow();
    expect(() => findHost(renderer, "weather-save")).not.toThrow();
    expect(() => findHost(renderer, "weather-cancel")).not.toThrow();
  });

  it("editing + save calls onChange with patch including all fields", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeatherStrip
          report={makeReport({
            conditions: null,
            temperature: null,
            wind: null,
            impact: null,
          })}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => findHost(renderer, "weather-edit").props.onPress());
    act(() =>
      findHost(renderer, "weather-temperature-input").props.onChangeText("28"),
    );
    act(() =>
      findHost(renderer, "weather-conditions-input").props.onChangeText("Sunny"),
    );
    act(() => findHost(renderer, "weather-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith({
      temperature: "28",
      conditions: "Sunny",
      wind: null,
      impact: null,
    });
  });

  it("cancel reverts the draft and exits edit mode without calling onChange", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeatherStrip
          report={makeReport({
            conditions: "Sunny",
            temperature: null,
            wind: null,
            impact: null,
          })}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => findHost(renderer, "weather-edit").props.onPress());
    act(() =>
      findHost(renderer, "weather-conditions-input").props.onChangeText("Cloudy"),
    );
    act(() => findHost(renderer, "weather-cancel").props.onPress());
    expect(onChangeMock).not.toHaveBeenCalled();
    // back to read-only — no inputs
    expect(() => findHost(renderer, "weather-conditions-input")).toThrow();
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sunny");
    expect(json).not.toContain("Cloudy");
  });

  it("Clear weather button calls onChange(null)", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeatherStrip
          report={makeReport({
            conditions: "Cloudy",
            temperature: null,
            wind: null,
            impact: null,
          })}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => findHost(renderer, "weather-edit").props.onPress());
    act(() => findHost(renderer, "weather-clear").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith(null);
  });

  it("trimming whitespace-only field commits null in patch", async () => {
    const { WeatherStrip } = await import("./WeatherStrip");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WeatherStrip
          report={makeReport({
            conditions: "Sunny",
            temperature: null,
            wind: null,
            impact: null,
          })}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => findHost(renderer, "weather-edit").props.onPress());
    act(() =>
      findHost(renderer, "weather-conditions-input").props.onChangeText("   "),
    );
    act(() => findHost(renderer, "weather-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({
      conditions: null,
      temperature: null,
      wind: null,
      impact: null,
    });
  });
});
