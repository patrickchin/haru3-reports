import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { ReportEditForm } from "../ReportEditForm";
import type { GeneratedSiteReport } from "@/lib/generated-report";

// ── Mocks for native deps not available in node test env ───────

vi.mock("lucide-react-native", () => ({
  Plus: () => null,
  Trash2: () => null,
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement("Card", { testID }, children),
}));

vi.mock("@/components/ui/SectionHeader", () => ({
  SectionHeader: ({ title }: { title: string }) =>
    React.createElement("SectionHeader", { title }),
}));

// AppDialogSheet that auto-renders action buttons when visible — tests can
// click "Remove" to confirm.
vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: (props: {
    visible: boolean;
    title: string;
    actions: { label: string; onPress: () => void }[];
  }) =>
    props.visible
      ? React.createElement(
          "AppDialogSheet",
          { testID: "dialog-sheet" },
          props.actions.map((a) =>
            React.createElement(
              "Pressable",
              {
                key: a.label,
                testID: `dialog-action-${a.label}`,
                onPress: a.onPress,
              },
              React.createElement("Text", null, a.label),
            ),
          ),
        )
      : null,
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: Record<string, unknown>) {
      return React.createElement(
        name,
        props,
        (props.children as React.ReactNode) ?? null,
      );
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", props, children ?? null),
    TextInput: (props: Record<string, unknown>) =>
      React.createElement("TextInput", props),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("ScrollView", props, children ?? null),
  };
});

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── Fixture ────────────────────────────────────────────────────

function makeReport(): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: "Daily Progress Report",
        reportType: "daily",
        summary: "Summary text",
        visitDate: "2026-04-20",
      },
      weather: {
        conditions: "Sunny",
        temperature: "22C",
        wind: "10kph",
        impact: "None",
      },
      workers: {
        totalWorkers: 5,
        workerHours: "8",
        notes: "Crew on site",
        roles: [{ role: "Carpenter", count: 2, notes: "Framing" }],
      },
      materials: [
        {
          name: "Lumber",
          quantity: "200",
          quantityUnit: "bf",
          condition: "good",
          status: "delivered",
          notes: null,
        },
      ],
      issues: [
        {
          title: "Crack in wall",
          category: "structural",
          severity: "high",
          status: "open",
          details: "Visible crack along east wall",
          actionRequired: "Inspect",
          sourceNoteIndexes: [],
        },
      ],
      nextSteps: ["Pour foundation"],
      sections: [{ title: "Overview", content: "Body", sourceNoteIndexes: [] }],
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────

function findByAccessibilityLabel(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  return root.findAll(
    (n) => n.props && n.props.accessibilityLabel === label,
  )[0]!;
}

// ── Tests ──────────────────────────────────────────────────────

describe("ReportEditForm", () => {
  it("renders all 7 section cards from a populated fixture", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    const ids = [
      "edit-section-meta",
      "edit-section-weather",
      "edit-section-workers",
      "edit-section-materials",
      "edit-section-issues",
      "edit-section-next-steps",
      "edit-section-sections",
    ];
    for (const id of ids) {
      expect(tree.root.findAllByProps({ testID: id }).length).toBeGreaterThan(0);
    }
  });

  it("editing the title field calls onChange with title updated and rest unchanged", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    const input = findByAccessibilityLabel(tree.root, "Report title");
    act(() => {
      input.props.onChangeText("New Title");
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next: GeneratedSiteReport = onChange.mock.calls[0][0];
    expect(next.report.meta.title).toBe("New Title");
    expect(next.report.meta.summary).toBe(report.report.meta.summary);
    expect(next.report.workers).toEqual(report.report.workers);
  });

  it("editing a worker role count converts string to number", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    const countInput = findByAccessibilityLabel(tree.root, "Role 1 count");
    act(() => {
      countInput.props.onChangeText("7");
    });
    const next: GeneratedSiteReport = onChange.mock.calls[0][0];
    expect(next.report.workers?.roles[0]?.count).toBe(7);
  });

  it("empty role count input clears to null", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    const countInput = findByAccessibilityLabel(tree.root, "Role 1 count");
    act(() => {
      countInput.props.onChangeText("");
    });
    const next: GeneratedSiteReport = onChange.mock.calls[0][0];
    expect(next.report.workers?.roles[0]?.count).toBeNull();
  });

  it("Add role button appends a blank role", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    const addBtn = findByAccessibilityLabel(tree.root, "Add role");
    act(() => {
      addBtn.props.onPress();
    });
    const next: GeneratedSiteReport = onChange.mock.calls[0][0];
    expect(next.report.workers?.roles.length).toBe(2);
    expect(next.report.workers?.roles[1]).toEqual({
      role: "",
      count: null,
      notes: null,
    });
  });

  it("removing a worker role row requires confirmation, then drops it", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    // Press the "Remove" button on the only role row.
    const removeBtn = findByAccessibilityLabel(tree.root, "Remove role 1");
    act(() => {
      removeBtn.props.onPress();
    });
    // No mutation yet — only the dialog opens.
    expect(onChange).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: "dialog-sheet" }).length).toBe(1);

    // Confirm.
    const confirm = tree.root.findByProps({ testID: "dialog-action-Remove" });
    act(() => {
      confirm.props.onPress();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next: GeneratedSiteReport = onChange.mock.calls[0][0];
    expect(next.report.workers?.roles.length).toBe(0);
  });

  it("cancelling the remove dialog leaves the report untouched", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    const removeBtn = findByAccessibilityLabel(tree.root, "Remove role 1");
    act(() => {
      removeBtn.props.onPress();
    });
    const cancel = tree.root.findByProps({ testID: "dialog-action-Cancel" });
    act(() => {
      cancel.props.onPress();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows empty-state placeholders when lists are empty", () => {
    const empty: GeneratedSiteReport = {
      report: {
        meta: {
          title: "T",
          reportType: "daily",
          summary: "",
          visitDate: null,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    };
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, {
          report: empty,
          onChange: vi.fn(),
        }),
      );
    });
    const allText = tree.root
      .findAll((n) => n.type === ("Text" as unknown as React.ElementType))
      .map((n) => {
        const c = n.props.children;
        return typeof c === "string" ? c : "";
      })
      .join("|");
    expect(allText).toContain("No roles yet");
    expect(allText).toContain("No materials yet");
    expect(allText).toContain("No issues yet");
    expect(allText).toContain("No next steps yet");
    expect(allText).toContain("No summary sections yet");
  });

  it("Add material button appends a blank material", () => {
    const report = makeReport();
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, { report, onChange }),
      );
    });
    const add = findByAccessibilityLabel(tree.root, "Add material");
    act(() => {
      add.props.onPress();
    });
    const next: GeneratedSiteReport = onChange.mock.calls[0][0];
    expect(next.report.materials.length).toBe(2);
    expect(next.report.materials[1]?.name).toBe("");
  });

  it("editing weather conditions on a null-weather report seeds a weather slice", () => {
    const empty: GeneratedSiteReport = {
      report: {
        meta: {
          title: "T",
          reportType: "daily",
          summary: "",
          visitDate: null,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    };
    const onChange = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(ReportEditForm, {
          report: empty,
          onChange,
        }),
      );
    });
    const conds = findByAccessibilityLabel(tree.root, "Weather conditions");
    act(() => {
      conds.props.onChangeText("Cloudy");
    });
    const next: GeneratedSiteReport = onChange.mock.calls[0][0];
    expect(next.report.weather?.conditions).toBe("Cloudy");
  });
});
