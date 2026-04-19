import { describe, expect, it } from "vitest";
import { getGenerateReportTabLabel } from "./generate-report-ui";

describe("getGenerateReportTabLabel", () => {
  it("formats the notes tab with its note count", () => {
    expect(getGenerateReportTabLabel("notes", 3)).toBe("Notes (3)");
  });

  it("keeps the report tab label plain", () => {
    expect(getGenerateReportTabLabel("report", 87)).toBe("Report");
  });
});
