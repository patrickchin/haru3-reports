import { describe, expect, it } from "vitest";
import {
  getCanonicalPhoneNumber,
  INVALID_PHONE_NUMBER_MESSAGE,
  isValidPhoneNumber,
  normalizePhoneNumber,
  requireCanonicalPhoneNumber,
} from "./phone";

describe("normalizePhoneNumber", () => {
  it("normalizes formatted international numbers to canonical E.164", () => {
    expect(normalizePhoneNumber(" +1 (555) 123-4567 ")).toBe("+15551234567");
  });

  it("adds a leading plus when the country code digits are present", () => {
    expect(normalizePhoneNumber("15551234567")).toBe("+15551234567");
  });

  it("does not guess a country code for local-format numbers", () => {
    expect(normalizePhoneNumber("(555) 123-4567")).toBe("5551234567");
  });

  it("returns an empty string when there are no digits", () => {
    expect(normalizePhoneNumber("  () -  ")).toBe("");
  });
});

describe("isValidPhoneNumber", () => {
  it("accepts canonical E.164 numbers", () => {
    expect(isValidPhoneNumber("+15551234567")).toBe(true);
  });

  it("rejects invalid E.164 numbers", () => {
    expect(isValidPhoneNumber("+0123456789")).toBe(false);
    expect(isValidPhoneNumber("15551234567")).toBe(false);
  });
});

describe("getCanonicalPhoneNumber", () => {
  it("returns a canonical phone number for valid input", () => {
    expect(getCanonicalPhoneNumber("(555) 123-4567")).toBeNull();
    expect(getCanonicalPhoneNumber("1 555 123 4567")).toBe("+15551234567");
  });
});

describe("requireCanonicalPhoneNumber", () => {
  it("throws the shared validation message for invalid input", () => {
    expect(() => requireCanonicalPhoneNumber("0412345678")).toThrow(
      INVALID_PHONE_NUMBER_MESSAGE,
    );
  });
});
