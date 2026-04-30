import { describe, expect, it, vi } from "vitest";
import { createLogger, scrubString, scrubValue } from "@/lib/logger";

describe("scrubString", () => {
  it("redacts phone numbers", () => {
    expect(scrubString("user +1 555-123-4567 signed in")).toBe(
      "user [phone] signed in",
    );
  });

  it("redacts email addresses", () => {
    expect(scrubString("from alice@example.com")).toBe("from [email]");
  });

  it("redacts UUIDs", () => {
    expect(
      scrubString("user 550e8400-e29b-41d4-a716-446655440000 logged in"),
    ).toBe("user [uuid] logged in");
  });

  it("redacts bearer tokens", () => {
    expect(scrubString("Authorization: Bearer eyJabc.def.ghi")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("redacts IPs", () => {
    expect(scrubString("from 192.168.1.10")).toBe("from [ip]");
  });
});

describe("scrubValue", () => {
  it("redacts sensitive keys", () => {
    expect(
      scrubValue({
        token: "abc",
        password: "p",
        access_key: "k",
        api_key: "k",
        nested: { jwt: "x", ok: 1 },
      }),
    ).toEqual({
      token: "[redacted]",
      password: "[redacted]",
      access_key: "[redacted]",
      api_key: "[redacted]",
      nested: { jwt: "[redacted]", ok: 1 },
    });
  });

  it("scrubs Error objects without leaking stack", () => {
    const err = new Error("contact alice@example.com");
    expect(scrubValue(err)).toEqual({
      name: "Error",
      message: "contact [email]",
    });
  });

  it("limits recursion depth", () => {
    const a: any = {};
    a.self = a;
    expect(JSON.stringify(scrubValue(a))).toContain("truncated");
  });
});

describe("createLogger", () => {
  it("scrubs message and context before forwarding to sink", () => {
    const sink = { log: vi.fn() };
    const logger = createLogger(sink);
    logger.error("login failed for +1 555-000-0001", new Error("x"), {
      user_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(sink.log).toHaveBeenCalledWith(
      "error",
      "login failed for [phone]",
      expect.objectContaining({ user_id: "[uuid]" }),
    );
  });
});
