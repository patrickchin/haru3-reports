/**
 * Smoke test for ReportEditForm — validates it renders without crashing.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react-native";
import { ReportEditForm } from "../report-edit-form";
import { createEmptyReport } from "../../report-edit-helpers";

describe("ReportEditForm", () => {
  it("renders without crashing", () => {
    const report = createEmptyReport();
    const onChange = () => {};
    const { getByText } = render(<ReportEditForm report={report} onChange={onChange} />);
    expect(getByText("Project Details")).toBeTruthy();
  });

  it("displays meta section", () => {
    const report = createEmptyReport();
    const onChange = () => {};
    const { getByText } = render(<ReportEditForm report={report} onChange={onChange} />);
    expect(getByText("Title")).toBeTruthy();
  });
});
