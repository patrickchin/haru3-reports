import { describe, expect, it } from "vitest";
import { getLoginPhoneHint } from "./login-phone-hint";

describe("getLoginPhoneHint", () => {
  it("prioritizes the verification-code hint once a code is sent", () => {
    expect(
      getLoginPhoneHint({
        codeSent: true,
        rememberedPhone: "+15550000000",
        shouldRememberPhone: true,
      }),
    ).toBe("Code sent. Enter the 6-digit verification code from your text message.");
  });

  it("describes the saved state when a remembered phone number is loaded", () => {
    expect(
      getLoginPhoneHint({
        codeSent: false,
        rememberedPhone: "+15550000000",
        shouldRememberPhone: true,
      }),
    ).toBe("This device already has your phone number saved for faster sign-in.");
  });

  it("describes the pending saved state when remember-phone is enabled", () => {
    expect(
      getLoginPhoneHint({
        codeSent: false,
        rememberedPhone: null,
        shouldRememberPhone: true,
      }),
    ).toBe("Your phone number will be saved on this device after sign-in.");
  });

  it("falls back to the formatting guidance by default", () => {
    expect(
      getLoginPhoneHint({
        codeSent: false,
        rememberedPhone: null,
        shouldRememberPhone: false,
      }),
    ).toBe("Use E.164 format so text verification works reliably.");
  });
});
