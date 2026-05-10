import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react-native";
import { UsageSummary } from "../usage-summary";
import type { TokenUsageMonthly } from "@/infra/db-types";

const mockUsageData: TokenUsageMonthly = {
  user_id: "user-1",
  month: "2026-05-01T00:00:00Z",
  input_tokens: 1500,
  output_tokens: 750,
  cached_tokens: 200,
  generation_count: 5,
};

describe("UsageSummary", () => {
  it("shows loading state", () => {
    render(<UsageSummary data={null} isLoading={true} />);

    const summary = screen.getByTestId("usage:summary");
    expect(summary).toBeTruthy();
  });

  it("shows empty state when no data", () => {
    render(<UsageSummary data={null} isLoading={false} />);

    const emptyState = screen.getByTestId("usage:empty-state");
    expect(emptyState).toBeTruthy();
    expect(screen.getByText(/No Usage This Month/i)).toBeTruthy();
  });

  it("displays usage data when available", () => {
    render(<UsageSummary data={mockUsageData} isLoading={false} />);

    const summary = screen.getByTestId("usage:summary");
    expect(summary).toBeTruthy();

    expect(screen.getByText("This Month")).toBeTruthy();
    expect(screen.getByTestId("usage:summary-reports")).toBeTruthy();
    expect(screen.getByTestId("usage:summary-input-tokens")).toBeTruthy();
    expect(screen.getByTestId("usage:summary-output-tokens")).toBeTruthy();
  });

  it("formats token counts correctly", () => {
    const largeUsage: TokenUsageMonthly = {
      user_id: "user-1",
      month: "2026-05-01T00:00:00Z",
      input_tokens: 1_500_000,
      output_tokens: 750_000,
      cached_tokens: 200_000,
      generation_count: 100,
    };

    render(<UsageSummary data={largeUsage} isLoading={false} />);

    // Should format large numbers with M/K suffixes
    expect(screen.getByText("1.5M")).toBeTruthy();
    expect(screen.getByText("750.0K")).toBeTruthy();
    expect(screen.getByText("200.0K")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("handles undefined data", () => {
    render(<UsageSummary data={undefined} isLoading={false} />);

    const emptyState = screen.getByTestId("usage:empty-state");
    expect(emptyState).toBeTruthy();
  });
});
