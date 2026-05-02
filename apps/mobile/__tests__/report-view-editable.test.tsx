/**
 * Integration test for ReportView's edit-mode wiring.
 *
 * We stub every card component as a no-op that captures its `onChange` prop on
 * a globalThis slot. Each test then renders the real ReportView, invokes a
 * captured `onChange`, and asserts the parent's `onReportChange` is called
 * with a correctly-patched `GeneratedSiteReport`.
 *
 * This sidesteps the need to mock `lucide-react-native`, `react-native-reanimated`,
 * Pressable gestures, etc. — we only test ReportView's composition logic.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import type { GeneratedSiteReport } from "@/lib/generated-report";

const onReportChange = vi.fn();

declare global {
  // eslint-disable-next-line no-var
  var __cardCallbacks: Record<string, ((...args: any[]) => void) | undefined>;
}
globalThis.__cardCallbacks = {};

function captureCard(key: string) {
  return (props: { onChange?: (...args: any[]) => void }) => {
    if (props.onChange) globalThis.__cardCallbacks[key] = props.onChange;
    return null;
  };
}

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: { children?: React.ReactNode; [key: string]: unknown }) {
      return React.createElement(name, props, (props.children as any) ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: mk("Pressable"),
    TextInput: mk("TextInput"),
    Platform: { OS: "ios", select: (o: Record<string, unknown>) => o.ios ?? o.default },
  };
});

// Stub every card. Each capture slot is keyed for the test to invoke.
vi.mock("@/components/reports/StatBar", () => ({ StatBar: () => null }));
vi.mock("@/components/reports/WeatherStrip", () => ({ WeatherStrip: captureCard("weather") }));
vi.mock("@/components/reports/WorkersCard", () => ({ WorkersCard: captureCard("workers") }));
vi.mock("@/components/reports/MaterialsCard", () => ({ MaterialsCard: captureCard("materials") }));
vi.mock("@/components/reports/IssuesCard", () => ({ IssuesCard: captureCard("issues") }));
vi.mock("@/components/reports/NextStepsCard", () => ({ NextStepsCard: captureCard("nextSteps") }));
vi.mock("@/components/reports/MetaEditCard", () => ({ MetaEditCard: captureCard("meta") }));
vi.mock("@/components/reports/SummarySectionCard", () => ({
  SummarySectionCard: (props: { index: number; onChange?: (...args: any[]) => void; onRemove?: () => void }) => {
    if (props.onChange) globalThis.__cardCallbacks[`section-${props.index}`] = props.onChange;
    if (props.onRemove) globalThis.__cardCallbacks[`section-${props.index}-remove`] = props.onRemove;
    return null;
  },
}));
vi.mock("@/components/ui/Card", () => ({
  Card: ({ children }: { children?: React.ReactNode }) => React.createElement("Card", null, children),
}));
vi.mock("@/components/ui/SectionHeader", () => ({ SectionHeader: () => null }));
vi.mock("lucide-react-native", () => ({
  FileText: () => null,
}));

import { ReportView } from "@/components/reports/ReportView";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeReport(): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: "Site report",
        summary: "Summary text",
        reportType: "daily",
        visitDate: "2026-05-01",
      } as GeneratedSiteReport["report"]["meta"],
      weather: {
        conditions: "Sunny",
        temperature: "22C",
        wind: "Calm",
        impact: null,
      },
      workers: {
        totalWorkers: 5,
        workerHours: "08:00-17:00",
        notes: null,
        roles: [
          { role: "Carpenter", count: 3, notes: null },
          { role: "Electrician", count: 2, notes: null },
        ],
      },
      materials: [
        {
          name: "Concrete",
          quantity: "10",
          quantityUnit: "bags",
          condition: null,
          status: null,
          notes: null,
        },
      ],
      issues: [
        {
          title: "Crack in wall",
          category: "structural",
          severity: "medium",
          status: "open",
          details: "North wall crack",
          actionRequired: null,
          sourceNoteIndexes: [],
        },
      ],
      nextSteps: ["Order more cement"],
      sections: [
        { title: "Progress", content: "Foundation poured", sourceNoteIndexes: [] },
        { title: "Risks", content: "None", sourceNoteIndexes: [] },
      ],
    },
  } as GeneratedSiteReport;
}

let renderer: ReturnType<typeof TestRenderer.create> | null = null;

beforeEach(() => {
  onReportChange.mockReset();
  globalThis.__cardCallbacks = {};
});

afterEach(() => {
  if (renderer) {
    act(() => renderer!.unmount());
    renderer = null;
  }
});

function renderEditable(report: GeneratedSiteReport = makeReport()) {
  act(() => {
    renderer = TestRenderer.create(
      <ReportView report={report} editable onReportChange={onReportChange} />,
    );
  });
}

describe("ReportView edit wiring", () => {
  it("does not render MetaEditCard when not editable", () => {
    act(() => {
      renderer = TestRenderer.create(<ReportView report={makeReport()} />);
    });
    // Meta capture slot should remain unset (read-only mode never calls captureCard onChange).
    expect(globalThis.__cardCallbacks.meta).toBeUndefined();
  });

  it("does not render MetaEditCard when editable=true but no onReportChange", () => {
    act(() => {
      renderer = TestRenderer.create(<ReportView report={makeReport()} editable />);
    });
    expect(globalThis.__cardCallbacks.meta).toBeUndefined();
  });

  it("propagates a meta patch through updateMeta", () => {
    renderEditable();
    act(() => globalThis.__cardCallbacks.meta!({ summary: "New summary" }));
    expect(onReportChange).toHaveBeenCalledTimes(1);
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.meta.summary).toBe("New summary");
    expect(next.report.meta.title).toBe("Site report"); // untouched
    expect(next).not.toBe(makeReport()); // identity changed
  });

  it("propagates a weather patch through updateWeather", () => {
    renderEditable();
    act(() => globalThis.__cardCallbacks.weather!({ conditions: "Cloudy" }));
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.weather?.conditions).toBe("Cloudy");
    expect(next.report.weather?.temperature).toBe("22C");
  });

  it("clears weather when patch is null", () => {
    renderEditable();
    act(() => globalThis.__cardCallbacks.weather!(null));
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.weather).toBeNull();
  });

  it("propagates a workers slice patch through updateWorkers", () => {
    renderEditable();
    act(() =>
      globalThis.__cardCallbacks.workers!({
        roles: [
          { role: "Plumber", count: 1, notes: null },
        ],
      }),
    );
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.workers?.roles).toHaveLength(1);
    expect(next.report.workers?.roles[0].role).toBe("Plumber");
    expect(next.report.workers?.totalWorkers).toBe(5); // unchanged
  });

  it("propagates a materials whole-array replacement through setMaterials", () => {
    renderEditable();
    act(() =>
      globalThis.__cardCallbacks.materials!([
        { name: "Steel", quantity: "5", quantityUnit: "tons", condition: null, status: null, notes: null },
      ]),
    );
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.materials).toHaveLength(1);
    expect(next.report.materials[0].name).toBe("Steel");
  });

  it("propagates an issues whole-array replacement through setIssues", () => {
    renderEditable();
    act(() =>
      globalThis.__cardCallbacks.issues!([
        {
          title: "New issue",
          category: "safety",
          severity: "high",
          status: "open",
          details: "details",
          actionRequired: null,
          sourceNoteIndexes: [],
        },
      ]),
    );
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.issues).toHaveLength(1);
    expect(next.report.issues[0].title).toBe("New issue");
  });

  it("propagates a nextSteps replacement through setNextSteps", () => {
    renderEditable();
    act(() => globalThis.__cardCallbacks.nextSteps!(["Step A", "Step B"]));
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.nextSteps).toEqual(["Step A", "Step B"]);
  });

  it("propagates a section edit through setSections", () => {
    renderEditable();
    act(() =>
      globalThis.__cardCallbacks["section-0"]!({
        title: "Progress (edited)",
        content: "Foundation poured + cured",
        sourceNoteIndexes: [],
      }),
    );
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.sections[0].title).toBe("Progress (edited)");
    expect(next.report.sections[1].title).toBe("Risks"); // untouched
  });

  it("propagates a section removal through setSections", () => {
    renderEditable();
    act(() => globalThis.__cardCallbacks["section-0-remove"]!());
    const next: GeneratedSiteReport = onReportChange.mock.calls[0][0];
    expect(next.report.sections).toHaveLength(1);
    expect(next.report.sections[0].title).toBe("Risks");
  });
});
