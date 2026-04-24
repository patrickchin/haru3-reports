import { describe, expect, it } from "vitest";
import { getLoginPhoneHint } from "./login-phone-hint";

describe("getLoginPhoneHint", () => {
  it("prioritizes the verification-code hint once a code is sent", () => {
    expect(
      getLoginPhoneHint({
        codeSent: true,
        rememberedPhone: "+15550000000",
        phoneMatchesRemembered: true,
      }),
    ).toBe("Code sent. Enter the 6-digit verification code from your text message.");
  });

  it("acknowledges a remembered number when the input still matches it", () => {
    expect(
      getLoginPhoneHint({
        codeSent: false,
        rememberedPhone: "+15550000000",
        phoneMatchesRemembered: true,
      }),
    ).toBe("Signed in recently with this number on this device.");
  });

  it("falls back to formatting guidance when the user is entering a different number", () => {
    expect(
      getLoginPhoneHint({
        codeSent: false,
        rememberedPhone: "+15550000000",
        phoneMatchesRemembered: false,
      }),
    ).toBe(
      "Start with + and your country code so we can text your code (e.g. +1 555 123 4567).",
    );
  });

  it("falls back to formatting guidance when nothing is remembered", () => {
    expect(
      getLoginPhoneHint({
        codeSent: false,
        rememberedPhone: null,
        phoneMatchesRemembered: false,
      }),
    ).toBe(
      "Start with + and your country code so we can text your code (e.g. +1 555 123 4567).",
    );
  });
});
