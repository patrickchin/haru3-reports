/**
 * Unit tests for the shared entitlement check.
 *
 * Pure function tests with a stubbed Supabase client. No DB required.
 */
import { assert, assertEquals } from "jsr:@std/assert";
import {
  checkEntitlement,
  denialResponse,
  type EntitlementSnapshot,
} from "./entitlements.ts";

function snapshotFrom(
  overrides: Partial<EntitlementSnapshot> = {},
): EntitlementSnapshot {
  return {
    user_id: "11111111-1111-1111-1111-111111111111",
    plan_id: "free",
    plan_name: "Free",
    subscription_status: "active",
    max_projects: 2,
    max_reports_mo: 10,
    max_tokens_mo: 200_000,
    allowed_providers: ["google"],
    default_provider: "google",
    allowed_report_types: ["daily"],
    reports_used_mo: 0,
    tokens_used_mo: 0,
    reports_remaining_mo: 10,
    tokens_remaining_mo: 200_000,
    ...overrides,
  };
}

function fakeClient(snapshot: EntitlementSnapshot | null, error?: Error) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (error) return { data: null, error };
                  return { data: snapshot, error: null };
                },
              };
            },
          };
        },
      };
    },
  // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("allows when usage well under limits", async () => {
  const result = await checkEntitlement(
    "u",
    {},
    { client: fakeClient(snapshotFrom()) },
  );
  assert(result.allowed);
  assertEquals(result.reason, "ok");
});

Deno.test("denies on report limit", async () => {
  const result = await checkEntitlement(
    "u",
    {},
    {
      client: fakeClient(
        snapshotFrom({ reports_remaining_mo: 0, reports_used_mo: 10 }),
      ),
    },
  );
  assert(!result.allowed);
  assertEquals(result.reason, "report_limit");
});

Deno.test("denies on token limit", async () => {
  const result = await checkEntitlement(
    "u",
    { estimatedTokens: 50_000 },
    {
      client: fakeClient(snapshotFrom({ tokens_remaining_mo: 1_000 })),
    },
  );
  assert(!result.allowed);
  assertEquals(result.reason, "token_limit");
});

Deno.test("denies disallowed report type", async () => {
  const result = await checkEntitlement(
    "u",
    { reportType: "incident" },
    { client: fakeClient(snapshotFrom()) },
  );
  assert(!result.allowed);
  assertEquals(result.reason, "report_type_not_allowed");
});

Deno.test("soft-downgrades disallowed provider to plan default", async () => {
  const result = await checkEntitlement(
    "u",
    { provider: "anthropic" },
    { client: fakeClient(snapshotFrom()) },
  );
  assert(result.allowed);
  assertEquals(result.effective_provider, "google");
});

Deno.test("keeps requested provider when allowed", async () => {
  const result = await checkEntitlement(
    "u",
    { provider: "openai" },
    {
      client: fakeClient(
        snapshotFrom({
          plan_id: "pro",
          allowed_providers: ["google", "openai", "anthropic"],
          default_provider: "kimi",
        }),
      ),
    },
  );
  assert(result.allowed);
  assertEquals(result.effective_provider, "openai");
});

Deno.test("fails closed when lookup errors", async () => {
  const result = await checkEntitlement(
    "u",
    {},
    { client: fakeClient(null, new Error("boom")) },
  );
  assert(!result.allowed);
  assertEquals(result.reason, "lookup_failed");
});

Deno.test("denialResponse shapes a 403 with quota fields", () => {
  const { status, body } = denialResponse({
    allowed: false,
    reason: "report_limit",
    snapshot: snapshotFrom({ reports_used_mo: 10 }),
  });
  assertEquals(status, 403);
  assertEquals(body.error, "quota_exceeded");
  assertEquals(body.reason, "report_limit");
  assertEquals(body.plan_id, "free");
  assertEquals(body.reports_used, 10);
});
