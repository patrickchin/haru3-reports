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

  it("renders editable inputs even when weather is null", async () => {
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
    expect(() => findHost(renderer, "weather-temperature")).not.toThrow();
    expect(() => findHost(renderer, "weather-conditions")).not.toThrow();
    expect(() => findHost(renderer, "weather-wind")).not.toThrow();
    expect(() => findHost(renderer, "weather-impact")).not.toThrow();
    expect(() => findHost(renderer, "weather-clear")).not.toThrow();
  });

  it("editing temperature calls onChange with patch", async () => {
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
    act(() => findHost(renderer, "weather-temperature").props.onPress());
    act(() =>
      findHost(renderer, "weather-temperature-input").props.onChangeText("28"),
    );
    act(() => findHost(renderer, "weather-temperature-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({ temperature: "28" });
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
    act(() => findHost(renderer, "weather-clear").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith(null);
  });

  it("clearing a string field via empty input passes null in patch", async () => {
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
    act(() => findHost(renderer, "weather-conditions").props.onPress());
    act(() =>
      findHost(renderer, "weather-conditions-input").props.onChangeText("   "),
    );
    act(() => findHost(renderer, "weather-conditions-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({ conditions: null });
  });
});
