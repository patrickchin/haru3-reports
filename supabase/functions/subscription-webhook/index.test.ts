/**
 * Unit tests for the subscription-webhook edge function.
 *
 * Tests cover:
 *   - mapRcEvent: pure mapping from RC event payload → internal state
 *   - createHandler: auth, idempotency, RPC routing, dead-letter
 *
 * No network or DB calls — RPC + failure recorder are dep-injected.
 */
import { assert, assertEquals } from "jsr:@std/assert";
import { createHandler, mapRcEvent } from "./index.ts";

const SECRET = "test-secret";
const USER_ID = "11111111-1111-1111-1111-111111111111";

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    api_version: "1.0",
    event: {
      id: "ev_123",
      type: "INITIAL_PURCHASE",
      app_user_id: USER_ID,
      product_id: "harpa_pro_monthly",
      store: "APP_STORE",
      purchased_at_ms: 1_714_521_600_000,
      expiration_at_ms: 1_717_113_600_000,
      ...overrides,
    },
  };
}

Deno.test("mapRcEvent: INITIAL_PURCHASE → active pro plan", () => {
  const m = mapRcEvent(buildEvent())!;
  assertEquals(m.plan_id, "pro");
  assertEquals(m.status, "active");
  assertEquals(m.platform, "apple");
  assertEquals(m.event_type, "INITIAL_PURCHASE");
  assertEquals(m.rc_event_id, "ev_123");
});

Deno.test("mapRcEvent: team yearly product → team plan", () => {
  const m = mapRcEvent(
    buildEvent({ product_id: "harpa_team_yearly", store: "PLAY_STORE" }),
  )!;
  assertEquals(m.plan_id, "team");
  assertEquals(m.platform, "google");
});

Deno.test("mapRcEvent: EXPIRATION → free + expired", () => {
  const m = mapRcEvent(buildEvent({ type: "EXPIRATION" }))!;
  assertEquals(m.plan_id, "free");
  assertEquals(m.status, "expired");
});

Deno.test("mapRcEvent: BILLING_ISSUE keeps paid plan but billing_retry", () => {
  const m = mapRcEvent(buildEvent({ type: "BILLING_ISSUE" }))!;
  assertEquals(m.plan_id, "pro");
  assertEquals(m.status, "billing_retry");
});

Deno.test("mapRcEvent: CANCELLATION before period end keeps plan active", () => {
  const m = mapRcEvent(
    buildEvent({
      type: "CANCELLATION",
      expiration_at_ms: Date.now() + 86_400_000, // 1 day in the future
    }),
  )!;
  assertEquals(m.plan_id, "pro");
  assertEquals(m.status, "active");
});

Deno.test("mapRcEvent: CANCELLATION with past expiration → cancelled + free", () => {
  const m = mapRcEvent(
    buildEvent({
      type: "CANCELLATION",
      expiration_at_ms: Date.now() - 86_400_000,
    }),
  )!;
  assertEquals(m.plan_id, "free");
  assertEquals(m.status, "cancelled");
});

Deno.test("mapRcEvent: TRANSFER is flagged as ignored (identity event)", () => {
  const m = mapRcEvent(buildEvent({ type: "TRANSFER" }))!;
  assertEquals(m.ignore, true);
  assertEquals(m.ignore_reason, "identity_event_no_state_change");
});

Deno.test("mapRcEvent: unknown event type is ignored", () => {
  const m = mapRcEvent(buildEvent({ type: "FROBNICATE" }))!;
  assertEquals(m.ignore, true);
  assert(typeof m.ignore_reason === "string");
});

Deno.test("mapRcEvent: missing app_user_id returns null", () => {
  const m = mapRcEvent({
    event: { type: "INITIAL_PURCHASE", product_id: "harpa_pro_monthly" },
  });
  assertEquals(m, null);
});

// ── handler ────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, auth = `Bearer ${SECRET}`) {
  return new Request("http://localhost/functions/v1/subscription-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
}

Deno.test("handler: rejects missing/wrong auth", async () => {
  const handler = createHandler({
    webhookSecret: SECRET,
    rpcFn: () => Promise.resolve({ error: null }),
  });
  const res = await handler(makeRequest(buildEvent(), "Bearer wrong"));
  assertEquals(res.status, 401);
});

Deno.test("handler: returns 200 and calls RPC on valid event", async () => {
  let rpcCalled = 0;
  const handler = createHandler({
    webhookSecret: SECRET,
    rpcFn: () => {
      rpcCalled++;
      return Promise.resolve({ error: null });
    },
  });
  const res = await handler(makeRequest(buildEvent()));
  assertEquals(res.status, 200);
  assertEquals(rpcCalled, 1);
});

Deno.test("handler: ignored events skip RPC and return 200", async () => {
  let rpcCalled = 0;
  const handler = createHandler({
    webhookSecret: SECRET,
    rpcFn: () => {
      rpcCalled++;
      return Promise.resolve({ error: null });
    },
  });
  const res = await handler(makeRequest(buildEvent({ type: "TRANSFER" })));
  assertEquals(res.status, 200);
  assertEquals(rpcCalled, 0);
});

Deno.test("handler: RPC error returns 500 and records failure", async () => {
  let failureRecorded = false;
  const handler = createHandler({
    webhookSecret: SECRET,
    rpcFn: () =>
      Promise.resolve({ error: new Error("db down") }),
    recordFailureFn: () => {
      failureRecorded = true;
      return Promise.resolve();
    },
  });
  const res = await handler(makeRequest(buildEvent()));
  assertEquals(res.status, 500);
  assert(failureRecorded);
});

Deno.test("handler: bad JSON returns 400", async () => {
  const handler = createHandler({
    webhookSecret: SECRET,
    rpcFn: () => Promise.resolve({ error: null }),
  });
  const req = new Request("http://localhost/functions/v1/subscription-webhook", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}` },
    body: "{not-json",
  });
  const res = await handler(req);
  assertEquals(res.status, 400);
});
