import { describe, expect, it } from "vitest";
import { capabilitiesForRole } from "@/lib/project-permissions";

describe("project permissions matrix", () => {
  it("owner has every capability", () => {
    const can = capabilitiesForRole("owner");
    expect(can.editProject).toBe(true);
    expect(can.deleteProject).toBe(true);
    expect(can.manageMembers).toBe(true);
    expect(can.writeReport).toBe(true);
    expect(can.deleteReport).toBe(true);
  });

  it("admin can manage members + write/delete reports but not edit/delete the project", () => {
    const can = capabilitiesForRole("admin");
    expect(can.manageMembers).toBe(true);
    expect(can.writeReport).toBe(true);
    expect(can.deleteReport).toBe(true);
    expect(can.editProject).toBe(false);
    expect(can.deleteProject).toBe(false);
  });

  it("editor can write reports but not delete or manage members", () => {
    const can = capabilitiesForRole("editor");
    expect(can.writeReport).toBe(true);
    expect(can.manageMembers).toBe(false);
    expect(can.deleteReport).toBe(false);
    expect(can.editProject).toBe(false);
    expect(can.deleteProject).toBe(false);
  });

  it("viewer has view-only access — every write capability is false", () => {
    const can = capabilitiesForRole("viewer");
    expect(can.viewProject).toBe(true);
    const { viewProject: _ignored, ...writes } = can;
    for (const value of Object.values(writes)) {
      expect(value).toBe(false);
    }
  });

  it("null role (loading or non-member) fails closed — every capability false", () => {
    const can = capabilitiesForRole(null);
    for (const value of Object.values(can)) {
      expect(value).toBe(false);
    }
  });

  it("unknown role string falls back to no-access", () => {
    const can = capabilitiesForRole("totally-not-a-role" as never);
    for (const value of Object.values(can)) {
      expect(value).toBe(false);
    }
  });
});
