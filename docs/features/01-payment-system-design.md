# Payment System Design

> Status: **Draft** · Last updated: April 2026

## 1. Overview

### Goals

- Monetise Harpa Pro with a tiered subscription model (Free → Pro → Team)
- Support **In-App Purchase (IAP)** on iOS and Android as the primary billing channel
- Optional **Stripe** web checkout to bypass App Store commission for web-originated signups
- Enforce per-plan quotas on report generation and AI token usage at the edge function layer
- Maintain an immutable, auditable subscription state history
- Handle offline/spotty connectivity gracefully — construction site reality

### Non-Goals

- One-time purchases or credit packs (may revisit later)
- Enterprise self-serve billing (handled via sales for now)
- Multi-currency display in the app (Apple/Google handle localised pricing)
- Family Sharing (excluded — this is a B2B tool)

---

## 2. Plan Tiers

### Feature Matrix

| Feature | Free | Pro ($14.99/mo · $149.99/yr) | Team ($49.99/mo · $499.99/yr) |
|---------|------|-----|------|
| Projects | 2 | Unlimited | Unlimited |
| Reports / month | 10 | 100 | 500 |
| AI token budget / month | 200k | 2M | 10M |
| AI provider | Gemini Flash Lite only | All providers (default: Kimi) | All providers (default: GPT-4o) |
| Report types | Daily only | All 6 types | All 6 types |
| PDF export | ✓ | ✓ | ✓ |
| Team members per project | — | — | 10 |
| Priority support | — | Email | Email + Chat |
| Report image attachments | 3 / report | 20 / report | 50 / report |
| Data retention | 90 days | Unlimited | Unlimited |
| Custom report branding | — | — | Company logo + header |

### Cost Justification

A typical report uses ~2k input + ~2k output tokens.

| Provider | Cost per report | Pro (100 reports) | Team (500 reports) |
|----------|---------------:|------------------:|-------------------:|
| Gemini Flash Lite | $0.0009 | $0.09 | $0.45 |
| Kimi (default) | $0.0055 | $0.55 | $2.75 |
| GPT-4o-mini | $0.0015 | $0.15 | $0.75 |
| Claude Sonnet | $0.036 | $3.60 | $18.00 |

After Apple's 15–30% cut, Pro nets ~$10–12.75/mo, Team nets ~$35–42.50/mo. Comfortable margins at all tiers except heavy Claude Sonnet usage on Team — mitigated by defaulting Team to GPT-4o, not Claude.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Mobile App                                 │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ RevenueCat   │  │ Subscription │  │ Report Generation         │  │
│  │ SDK          │  │ Paywall UI   │  │ (quota-aware)             │  │
│  └──────┬───────┘  └──────────────┘  └──────────┬────────────────┘  │
│         │                                       │                   │
└─────────┼───────────────────────────────────────┼───────────────────┘
          │                                       │
          ▼                                       ▼
┌──────────────────┐              ┌──────────────────────────────────┐
│   RevenueCat     │              │        Supabase Backend          │
│   Backend        │              │                                  │
│                  │──webhooks──▶ │  ┌─────────────────────────────┐ │
│  • Apple IAP     │              │  │ subscription-webhook (new)  │ │
│  • Google Play   │              │  │ • Validates & persists      │ │
│  • Stripe (web)  │              │  │ • Updates entitlements      │ │
│                  │              │  └─────────────────────────────┘ │
│                  │              │                                  │
└──────────────────┘              │  ┌─────────────────────────────┐ │
                                  │  │ check-entitlement (new)     │ │
                                  │  │ • Called before AI calls    │ │
                                  │  │ • Checks plan + quota       │ │
                                  │  └─────────────────────────────┘ │
                                  │                                  │
                                  │  ┌─────────────────────────────┐ │
                                  │  │ generate-report (existing)  │ │
                                  │  │ • Calls check-entitlement   │ │
                                  │  │ • Enforces provider limits  │ │
                                  │  └─────────────────────────────┘ │
                                  │                                  │
                                  │  ┌──────────────────────┐       │
                                  │  │ PostgreSQL            │       │
                                  │  │ • subscriptions       │       │
                                  │  │ • subscription_events │       │
                                  │  │ • plans               │       │
                                  │  │ • entitlements (view) │       │
                                  │  │ • token_usage (exist) │       │
                                  │  └──────────────────────┘       │
                                  └──────────────────────────────────┘
```

### Component Breakdown

| Component | Responsibility |
|-----------|---------------|
| **RevenueCat SDK** (mobile) | Present paywalls, manage purchases, restore purchases, cache entitlements offline |
| **RevenueCat Backend** | Unified Apple/Google/Stripe receipt validation, subscription lifecycle management, webhook dispatch |
| **subscription-webhook** (edge fn) | Receive RevenueCat webhooks, upsert subscription state, append to audit log |
| **check-entitlement** (shared module) | Query current plan + monthly usage, return allow/deny + remaining quota |
| **generate-report** (existing, modified) | Call check-entitlement before AI provider, enforce provider restrictions per plan |
| **plans** (DB table) | Plan definitions with limits (source of truth for quota values) |
| **subscriptions** (DB table) | Per-user active subscription state |
| **subscription_events** (DB table) | Immutable audit log of all state transitions |

---

## 4. Database Schema

### 4.1 `plans` — Plan Definitions

```sql
-- Plans are seed data, not user-managed
CREATE TABLE plans (
    id              text PRIMARY KEY,  -- 'free', 'pro', 'team'
    display_name    text NOT NULL,
    monthly_price   integer NOT NULL DEFAULT 0,  -- cents USD
    yearly_price    integer NOT NULL DEFAULT 0,  -- cents USD
    max_projects    integer,           -- NULL = unlimited
    max_reports_mo  integer NOT NULL,
    max_tokens_mo   bigint NOT NULL,
    max_team_members integer NOT NULL DEFAULT 0,
    allowed_providers text[] NOT NULL DEFAULT '{}',
    default_provider text,
    max_images_per_report integer NOT NULL DEFAULT 3,
    allowed_report_types text[] NOT NULL DEFAULT '{"daily"}',
    data_retention_days integer,       -- NULL = unlimited
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed data
INSERT INTO plans (id, display_name, monthly_price, yearly_price, max_projects, max_reports_mo, max_tokens_mo, max_team_members, allowed_providers, default_provider, max_images_per_report, allowed_report_types, data_retention_days) VALUES
    ('free',  'Free',  0,     0,      2,    10,  200000,   0,  '{"google"}',                                   'google',  3,  '{"daily"}',                                                      90),
    ('pro',   'Pro',   1499,  14999,  NULL, 100, 2000000,  0,  '{"google","openai","anthropic","kimi","deepseek","qwen"}', 'kimi', 20, '{"daily","safety","incident","inspection","site_visit","progress"}', NULL),
    ('team',  'Team',  4999,  49999,  NULL, 500, 10000000, 10, '{"google","openai","anthropic","kimi","deepseek","qwen"}', 'openai',   50, '{"daily","safety","incident","inspection","site_visit","progress"}', NULL);

-- Everyone can read plans
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select_all" ON plans FOR SELECT USING (true);
```

### 4.2 `subscriptions` — Active Subscription State

```sql
CREATE TABLE subscriptions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id             text NOT NULL REFERENCES plans(id),
    status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'grace_period', 'billing_retry', 'paused', 'cancelled', 'expired')),
    platform            text NOT NULL CHECK (platform IN ('apple', 'google', 'stripe', 'manual')),
    rc_customer_id      text,          -- RevenueCat customer ID
    rc_entitlement_id   text,          -- RevenueCat entitlement identifier
    store_product_id    text,          -- App Store / Play Store product ID
    store_transaction_id text,         -- Original transaction ID from store
    current_period_start timestamptz NOT NULL DEFAULT now(),
    current_period_end   timestamptz,
    cancel_at           timestamptz,   -- Scheduled cancellation date
    cancelled_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- No table-level unique on user_id: historical rows are preserved.
    -- A partial unique index (below) enforces one *active* sub per user.
);

-- At most one active/grace/retry subscription per user; expired rows kept for history.
CREATE UNIQUE INDEX idx_subscriptions_active_user
    ON subscriptions(user_id)
    WHERE status IN ('active', 'grace_period', 'billing_retry');

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_rc_customer ON subscriptions(rc_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on every change
CREATE TRIGGER subscriptions_set_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Users can read their own subscription
CREATE POLICY "subscriptions_select_own" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Only service role (edge functions) can insert/update
CREATE POLICY "subscriptions_service_insert" ON subscriptions
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "subscriptions_service_update" ON subscriptions
    FOR UPDATE USING (auth.role() = 'service_role');
```

### 4.3 `subscription_events` — Immutable Audit Log

```sql
CREATE TABLE subscription_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id uuid NOT NULL REFERENCES subscriptions(id),
    event_type      text NOT NULL,
    -- e.g.: 'initial_purchase', 'renewal', 'cancellation', 'billing_issue',
    --       'grace_period_start', 'grace_period_end', 'expiration',
    --       'product_change', 'refund', 'restored'
    old_plan_id     text REFERENCES plans(id),
    new_plan_id     text REFERENCES plans(id),
    platform        text,
    rc_event_id     text,              -- RevenueCat event ID for dedup
    metadata        jsonb DEFAULT '{}', -- Raw webhook payload excerpt
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_events_user ON subscription_events(user_id);
CREATE INDEX idx_sub_events_sub ON subscription_events(subscription_id);
CREATE UNIQUE INDEX idx_sub_events_rc ON subscription_events(rc_event_id);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own events
CREATE POLICY "sub_events_select_own" ON subscription_events
    FOR SELECT USING (auth.uid() = user_id);

-- Only service role can write
CREATE POLICY "sub_events_service_insert" ON subscription_events
    FOR INSERT WITH CHECK (auth.role() = 'service_role');
```

### 4.4 `entitlements` — Convenience View

```sql
CREATE OR REPLACE VIEW user_entitlements AS
SELECT
    p.id AS user_id,
    COALESCE(s.plan_id, 'free') AS plan_id,
    pl.display_name AS plan_name,
    COALESCE(s.status, 'active') AS subscription_status,
    pl.max_projects,
    pl.max_reports_mo,
    pl.max_tokens_mo,
    pl.max_team_members,
    pl.allowed_providers,
    pl.default_provider,
    pl.max_images_per_report,
    pl.allowed_report_types,
    pl.data_retention_days,
    s.current_period_end,
    -- Monthly usage counters
    COALESCE(r.report_count, 0) AS reports_used_mo,
    COALESCE(t.tokens_used, 0) AS tokens_used_mo,
    -- Remaining
    pl.max_reports_mo - COALESCE(r.report_count, 0) AS reports_remaining_mo,
    pl.max_tokens_mo - COALESCE(t.tokens_used, 0) AS tokens_remaining_mo
FROM profiles p
LEFT JOIN subscriptions s ON s.user_id = p.id
    AND s.status IN ('active', 'grace_period')
LEFT JOIN plans pl ON pl.id = COALESCE(s.plan_id, 'free')
LEFT JOIN LATERAL (
    SELECT count(*) AS report_count
    FROM reports
    WHERE owner_id = p.id
      AND created_at >= date_trunc('month', now())
      AND deleted_at IS NULL
) r ON true
LEFT JOIN LATERAL (
    -- Only count input + output; cached_tokens are excluded from budget
    -- since providers like Anthropic don't charge for them.
    SELECT COALESCE(sum(input_tokens + output_tokens), 0) AS tokens_used
    FROM token_usage
    WHERE user_id = p.id
      AND created_at >= date_trunc('month', now())
) t ON true;
```

### 4.5 Add `plan_id` to `profiles` (Cache)

```sql
-- Fast-path plan check without joining subscriptions
ALTER TABLE profiles ADD COLUMN plan_id text NOT NULL DEFAULT 'free' REFERENCES plans(id);
```

### 4.6 Performance Indexes

```sql
-- Speed up the monthly report count in user_entitlements
CREATE INDEX idx_reports_owner_created ON reports(owner_id, created_at)
    WHERE deleted_at IS NULL;

-- Speed up the monthly token sum in user_entitlements
-- (token_usage already has token_usage_created_at_idx — add composite)
CREATE INDEX idx_token_usage_user_created ON token_usage(user_id, created_at);
```

### 4.7 `webhook_failures` — Dead Letter Table

```sql
CREATE TABLE webhook_failures (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    text,              -- RC event ID for correlation
    payload     jsonb NOT NULL,    -- Full webhook body for replay
    error       text NOT NULL,
    retries     integer NOT NULL DEFAULT 0,
    resolved_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;
-- Admin-only — no user access
CREATE POLICY "webhook_failures_service_only" ON webhook_failures
    FOR ALL USING (auth.role() = 'service_role');
```

### 4.8 Transactional Webhook Handler (RPC)

```sql
-- All subscription state changes in a single transaction to prevent
-- profiles.plan_id going stale if the webhook handler partially fails.
CREATE OR REPLACE FUNCTION process_subscription_event(
    p_user_id           uuid,
    p_plan_id           text,
    p_status            text,
    p_platform          text,
    p_rc_customer_id    text,
    p_store_product_id  text,
    p_store_txn_id      text,
    p_period_start      timestamptz,
    p_period_end        timestamptz,
    p_event_type        text,
    p_old_plan_id       text,
    p_rc_event_id       text,
    p_metadata          jsonb DEFAULT '{}'
) RETURNS void AS $$
DECLARE
    v_sub_id uuid;
BEGIN
    -- 1. Upsert subscription
    INSERT INTO subscriptions (
        user_id, plan_id, status, platform, rc_customer_id,
        store_product_id, store_transaction_id,
        current_period_start, current_period_end
    ) VALUES (
        p_user_id, p_plan_id, p_status, p_platform, p_rc_customer_id,
        p_store_product_id, p_store_txn_id,
        p_period_start, p_period_end
    )
    ON CONFLICT (user_id) WHERE status IN ('active','grace_period','billing_retry')
    DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = now()
    RETURNING id INTO v_sub_id;

    -- 2. Immutable audit log
    INSERT INTO subscription_events (
        user_id, subscription_id, event_type,
        old_plan_id, new_plan_id, platform,
        rc_event_id, metadata
    ) VALUES (
        p_user_id, v_sub_id, p_event_type,
        p_old_plan_id, p_plan_id, p_platform,
        p_rc_event_id, p_metadata
    );

    -- 3. Update profile cache
    UPDATE profiles SET plan_id = p_plan_id WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. Edge Function Design

### 5.1 New: `subscription-webhook`

Receives RevenueCat webhook events. Deployed **without JWT verification** (uses webhook secret instead).

```
POST /functions/v1/subscription-webhook
Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
Content-Type: application/json
```

**Responsibilities:**
1. Validate webhook signature / bearer token
2. Idempotency check via `rc_event_id`
3. Map RevenueCat event to internal state transition
4. Upsert `subscriptions` row
5. Append to `subscription_events` log
6. Update `profiles.plan_id` cache column

**RevenueCat Event → Internal State Mapping:**

| RevenueCat Event | Internal Action |
|-----------------|-----------------|
| `INITIAL_PURCHASE` | Create subscription (status: active) |
| `RENEWAL` | Update period_end (status: active) |
| `PRODUCT_CHANGE` | Update plan_id, log old→new |
| `CANCELLATION` | Set cancel_at, status stays active until period end |
| `BILLING_ISSUE` | Status → billing_retry |
| `SUBSCRIBER_ALIAS` | Update rc_customer_id mapping |
| `EXPIRATION` | Status → expired, clear plan cache |
| `TRANSFER` | Reassign user_id (**admin-only** — old user reverts to free, log both sides) |

> **Note:** Steps 4–6 are executed atomically via the `process_subscription_event` RPC function (§4.8) to prevent `profiles.plan_id` going stale on partial failure. Failed webhooks are logged to `webhook_failures` (§4.7) before returning 500 so they can be replayed.

### 5.2 New: `_shared/entitlements.ts` (Shared Module)

```typescript
interface EntitlementCheck {
  allowed: boolean;
  plan_id: string;
  reason?: string;           // 'ok' | 'report_limit' | 'token_limit' | 'provider_not_allowed' | 'report_type_not_allowed'
  reports_remaining: number;
  tokens_remaining: number;
  allowed_providers: string[];
  default_provider: string;
}

async function checkEntitlement(
  supabase: SupabaseClient,
  userId: string,
  opts?: { provider?: string; reportType?: string }
): Promise<EntitlementCheck>
```

**Logic:**
1. Query `user_entitlements` view for the user
2. Check `reports_remaining_mo > 0`
3. Check `tokens_remaining_mo > estimated_tokens` (estimate ~5k per call)
4. If `opts.provider` specified, check it's in `allowed_providers`
5. If `opts.reportType` specified, check it's in `allowed_report_types`
6. Return structured result

### 5.3 Modified: `generate-report`

Add entitlement check at the top of the handler:

```typescript
// Before AI call
const entitlement = await checkEntitlement(supabase, userId, {
  provider: requestedProvider,
  reportType: reportType,
});

if (!entitlement.allowed) {
  return new Response(
    JSON.stringify({
      error: 'quota_exceeded',
      reason: entitlement.reason,
      plan_id: entitlement.plan_id,
      upgrade_url: 'harpa://upgrade',
    }),
    { status: 403 }
  );
}

// Override provider if user's plan doesn't allow their selection
const provider = entitlement.allowed_providers.includes(requestedProvider)
  ? requestedProvider
  : entitlement.default_provider;
```

---

## 6. IAP Integration — RevenueCat

### 6.1 Why RevenueCat (Not Native SDKs)

| Factor | RevenueCat | Native StoreKit 2 + Play Billing |
|--------|-----------|--------------------------------|
| Cross-platform parity | Single SDK, unified API | Two completely different APIs |
| Receipt validation | Handled server-side by RC | Must build our own validation server |
| Webhook unification | Single webhook format | Two different webhook systems |
| Stripe integration | Built-in (web fallback) | Must integrate separately |
| Offline entitlement caching | Built-in SDK cache | Must build ourselves |
| Subscription analytics | Dashboard included | Must build from scratch |
| Cost | Free up to $2.5k MTR, then 1% | Free but significant dev time |
| Expo support | `react-native-purchases` | `expo-in-app-purchases` (less mature) |

**Recommendation: Use RevenueCat.** The cross-platform unification, built-in Stripe support, and offline caching eliminate months of engineering work. The 1% revenue share above $2.5k MTR is far cheaper than building and maintaining our own receipt validation infrastructure.

### 6.2 RevenueCat Setup

**Products (configured in App Store Connect / Google Play Console):**

| Product ID | Platform | Price | Duration |
|-----------|----------|-------|----------|
| `harpa_pro_monthly` | iOS + Android | $14.99 | 1 month |
| `harpa_pro_yearly` | iOS + Android | $149.99 | 1 year |
| `harpa_team_monthly` | iOS + Android | $49.99 | 1 month |
| `harpa_team_yearly` | iOS + Android | $499.99 | 1 year |

**Entitlements (RevenueCat):**

| Entitlement | Grants Access To | Products |
|------------|-----------------|----------|
| `pro` | Pro tier features | `harpa_pro_monthly`, `harpa_pro_yearly` |
| `team` | Team tier features | `harpa_team_monthly`, `harpa_team_yearly` |

**Offerings (RevenueCat):**
- `default` — shown to all users (Pro monthly/yearly, Team monthly/yearly)

### 6.3 Mobile SDK Integration

```typescript
// app/_layout.tsx — initialise on app start
import Purchases from 'react-native-purchases';

Purchases.configure({
  apiKey: Platform.OS === 'ios'
    ? REVENUECAT_IOS_KEY
    : REVENUECAT_ANDROID_KEY,
  appUserID: supabaseUserId,  // Link RC customer to Supabase user
});
```

---

## 7. Receipt Validation

RevenueCat handles all receipt validation server-side. The flow:

```
Mobile App                  RevenueCat              Apple/Google
    │                           │                        │
    │  purchase(product)        │                        │
    │──────────────────────────▶│                        │
    │                           │  validate receipt      │
    │                           │───────────────────────▶│
    │                           │◀───────────────────────│
    │                           │                        │
    │  entitlements updated     │                        │
    │◀──────────────────────────│                        │
    │                           │                        │
    │                           │  webhook to Supabase   │
    │                           │────────┐               │
    │                           │        ▼               │
    │                           │  subscription-webhook  │
    │                           │  (edge function)       │
```

**We never touch raw receipts.** RevenueCat validates with Apple/Google, caches entitlements in their SDK, and sends us normalised webhook events.

---

## 8. Webhook Handling

### 8.1 RevenueCat → Supabase

RevenueCat sends a single unified webhook format regardless of store:

```
POST https://<project>.supabase.co/functions/v1/subscription-webhook
Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
```

### 8.2 Webhook Processing Flow

```
subscription-webhook edge function
    │
    ├─ 1. Verify Authorization header matches REVENUECAT_WEBHOOK_SECRET
    │
    ├─ 2. Parse event body
    │     • Extract: event_type, app_user_id, product_id, expiration_at
    │
    ├─ 3. Idempotency check
    │     • Query subscription_events for rc_event_id
    │     • If exists → return 200 OK (already processed)
    │
    ├─ 4. Map event to plan_id
    │     • harpa_pro_monthly / harpa_pro_yearly → 'pro'
    │     • harpa_team_monthly / harpa_team_yearly → 'team'
    │     • EXPIRATION / CANCELLATION (expired) → 'free'
    │
    ├─ 5. Upsert subscriptions table (single active sub per user)
    │
    ├─ 6. Insert subscription_events row (immutable log)
    │
    ├─ 7. Update profiles.plan_id cache
    │
    └─ 8. Return 200 OK
```

### 8.3 Retry Handling

RevenueCat retries failed webhooks with exponential backoff. Edge function must:
- Return **200** for successfully processed events (including duplicates)
- Return **401** for invalid auth (RC will not retry)
- Return **500** only for transient failures (RC will retry)

---

## 9. Stripe Web Fallback

For users who discover Harpa Pro on the web (`apps/web`), offer Stripe Checkout to bypass the 15–30% App Store commission.

### Flow

```
Web (apps/web)              Stripe                   Supabase
    │                         │                         │
    │  Click "Subscribe"      │                         │
    │  (pre-auth'd user)      │                         │
    │────────────────────────▶│                         │
    │                         │  Checkout Session       │
    │◀────────────────────────│                         │
    │  redirect to checkout   │                         │
    │────────────────────────▶│                         │
    │                         │  payment success        │
    │                         │  webhook ──────────────▶│
    │                         │                         │  subscription-webhook
    │                         │                         │  (same handler, platform='stripe')
    │◀─────── redirect ───────│                         │
```

**Implementation:** RevenueCat has native Stripe integration. Configure Stripe as a "Web" store in RevenueCat. The same webhook handler processes Stripe events — we just set `platform = 'stripe'`.

**Key detail:** If a user subscribes via web (Stripe) and later opens the mobile app, RevenueCat's SDK will correctly show them as subscribed via the linked `appUserID`. No double-billing risk.

---

## 10. Quota Enforcement

### 10.1 Enforcement Points

| Check | Where | When |
|-------|-------|------|
| Report count | `generate-report` edge fn | Before AI call |
| Token budget | `generate-report` edge fn | Before AI call |
| Provider restriction | `generate-report` edge fn | Before selecting provider |
| Report type restriction | `generate-report` edge fn | Before AI call |
| Project limit | Mobile app + `projects` RLS | On project creation |
| Image limit | Mobile app | On image attachment |

### 10.2 Race Condition Mitigation (TOCTOU)

The quota check and AI call are not atomic. Two concurrent requests can both pass the check before either inserts a `token_usage` row. With Team at 500 reports/month and multiple team members this is realistic.

**Approach: Advisory lock per user.**

```sql
-- Inside checkEntitlement, wrap in a short transaction:
SELECT pg_advisory_xact_lock(hashtext(p_user_id::text));
-- Then check quota and insert a "reservation" row in token_usage
-- with estimated tokens. Update with actuals after AI call completes.
```

This serialises concurrent requests per-user (~1–3ms overhead) and prevents any over-quota leakage. A 5% soft tolerance is acceptable as a temporary fallback during initial rollout.

### 10.2 Quota Check Sequence

```
Mobile App                    generate-report              PostgreSQL
    │                              │                           │
    │  POST /generate-report       │                           │
    │  { notes, provider, type }   │                           │
    │─────────────────────────────▶│                           │
    │                              │  SELECT * FROM            │
    │                              │  user_entitlements         │
    │                              │  WHERE user_id = $1        │
    │                              │──────────────────────────▶│
    │                              │◀──────────────────────────│
    │                              │                           │
    │                              │  reports_remaining > 0?   │
    │                              │  tokens_remaining > 5000? │
    │                              │  provider in allowed?     │
    │                              │  report_type in allowed?  │
    │                              │                           │
    │                              │  [IF DENIED]              │
    │  403 { error, reason,        │                           │
    │        upgrade_url }         │                           │
    │◀─────────────────────────────│                           │
    │                              │                           │
    │                              │  [IF ALLOWED]             │
    │                              │  Call AI provider...      │
    │                              │                           │
```

### 10.3 Project Limit Enforcement (RLS)

```sql
-- Add to projects RLS policies
CREATE POLICY "projects_insert_within_limit" ON projects
    FOR INSERT WITH CHECK (
        auth.uid() = owner_id
        AND (
            (SELECT max_projects FROM user_entitlements WHERE user_id = auth.uid()) IS NULL
            OR (SELECT count(*) FROM projects WHERE owner_id = auth.uid() AND deleted_at IS NULL)
                < (SELECT max_projects FROM user_entitlements WHERE user_id = auth.uid())
        )
    );
```

### 10.4 Offline Handling

RevenueCat SDK caches entitlements locally. The mobile app can:
1. Check cached entitlement to show/hide UI (paywall, provider selector)
2. If offline, allow draft creation (drafts don't consume quota)
3. Quota enforcement happens server-side in `generate-report` — if the user is offline, they can't call the edge function anyway

---

## 11. Migration Plan

### Existing Users → Free Tier

1. Deploy `plans` table + seed data
2. Deploy `subscriptions` and `subscription_events` tables
3. Add `plan_id` column to `profiles` (default: `'free'`)
4. All existing users automatically become Free tier (no action needed)
5. Deploy entitlement checks in `generate-report` (behind feature flag initially)
6. Enable feature flag after verifying in staging

### Staged Rollout

| Phase | Action | Risk |
|-------|--------|------|
| 1 | Deploy schema + tables (no enforcement) | None — tables are unused |
| 2 | Deploy `subscription-webhook` edge function | None — no webhooks sent yet |
| 3 | Integrate RevenueCat SDK in mobile app (paywall hidden) | Low — SDK init only |
| 4 | Enable paywall UI + purchases in TestFlight / internal track | Medium — test with real purchases |
| 5 | Enable quota enforcement in `generate-report` (feature flag) | Medium — may block users |
| 6 | Public launch: remove feature flag, submit to App Store / Play Store | High — revenue impact |

### Grace Period for Active Users

Users who were active in the 30 days before launch get a one-time bonus:
- 30 extra reports credited to their first month
- Notification explaining the new tiers with an upgrade CTA

---

## 12. Mobile Client Integration

### 12.1 RevenueCat SDK Setup

**Package:** `react-native-purchases` (Expo Config Plugin available)

```bash
pnpm --filter mobile add react-native-purchases
```

**Expo config plugin** in `app.config.ts`:
```typescript
plugins: [
  // ... existing plugins
  'react-native-purchases',
],
```

### 12.2 Paywall UI

Use RevenueCat's **Paywalls** feature for native paywall rendering, or build a custom paywall screen:

**Recommended: Custom paywall screen** — better control over branding and UX for construction industry users.

```
app/
  upgrade.tsx           ← Paywall / upgrade screen
  hooks/
    useEntitlement.ts   ← Hook wrapping RevenueCat + server state
```

### 12.3 `useEntitlement` Hook

```typescript
function useEntitlement() {
  // 1. Read RevenueCat cached entitlement (instant, works offline)
  // 2. Background-sync with user_entitlements view (server truth)
  // Returns: { planId, isProOrAbove, quotas, loading }
}
```

### 12.4 UI Integration Points

| Screen | Change |
|--------|--------|
| Generate Report | Check quota before starting; show upgrade CTA if at limit |
| Provider Selector | Grey out providers not in `allowed_providers`; show lock icon |
| Report Type Picker | Grey out types not in `allowed_report_types` |
| Project List | Show "Upgrade to create more projects" when at limit |
| Usage Screen | Show plan name, quota bars, upgrade CTA |
| Settings / Account | Show current plan, manage subscription link |
| Tab Bar / Header | Pro/Team badge next to user avatar |

---

## 13. Security Considerations

### 13.1 Receipt & Subscription Fraud

| Threat | Mitigation |
|--------|------------|
| Fake receipt submission | RevenueCat validates all receipts server-side with Apple/Google |
| Receipt replay | Idempotency via `rc_event_id` in `subscription_events` |
| Client-side entitlement spoofing | Quota enforcement is server-side in edge functions; client UI is cosmetic only |
| Webhook spoofing | Bearer token validation on `subscription-webhook` |
| Shared account abuse | One subscription per `user_id` constraint; RevenueCat device tracking |
| Refund abuse | RevenueCat sends `CANCELLATION` webhook on refund; plan reverts to free |

### 13.2 RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `plans` | All users | Service role only | Service role only | Never |
| `subscriptions` | Own row | Service role | Service role | Never (soft-delete via status) |
| `subscription_events` | Own rows | Service role | Never (immutable) | Never |

### 13.3 Webhook Security

```typescript
// subscription-webhook edge function
import { timingSafeEqual } from "node:crypto";

const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')!;
const authHeader = req.headers.get('Authorization') ?? '';
const expected = `Bearer ${webhookSecret}`;

const a = new TextEncoder().encode(authHeader);
const b = new TextEncoder().encode(expected);
if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
  return new Response('Unauthorized', { status: 401 });
}
```

### 13.4 Secrets Required

| Secret | Where | Purpose |
|--------|-------|---------|
| `REVENUECAT_WEBHOOK_SECRET` | Supabase edge fn secrets | Webhook auth |
| `REVENUECAT_API_KEY` | Supabase edge fn secrets | Server-side RC API calls (optional, for admin tools) |
| RevenueCat iOS API Key | Mobile app config (public) | SDK init (safe to embed — only talks to RC) |
| RevenueCat Android API Key | Mobile app config (public) | SDK init |
| Stripe Secret Key | RevenueCat dashboard | RC → Stripe integration (never in our code) |

---

## 14. Sequence Diagrams

### 14.1 Initial Purchase Flow

```
User            App              RevenueCat         Apple/Google       Supabase
 │               │                   │                   │                │
 │  Tap "Pro"    │                   │                   │                │
 │──────────────▶│                   │                   │                │
 │               │  purchase(sku)    │                   │                │
 │               │──────────────────▶│                   │                │
 │               │                   │  Initiate IAP     │                │
 │               │                   │──────────────────▶│                │
 │               │                   │                   │                │
 │  Native purchase dialog          │                   │                │
 │◀──────────────────────────────────────────────────────│                │
 │  Confirm (FaceID/fingerprint)    │                   │                │
 │──────────────────────────────────────────────────────▶│                │
 │               │                   │  Receipt          │                │
 │               │                   │◀──────────────────│                │
 │               │                   │  Validate         │                │
 │               │                   │──────────────────▶│                │
 │               │                   │◀──────────────────│                │
 │               │  Entitlement ✓    │                   │                │
 │               │◀──────────────────│                   │                │
 │               │                   │                   │                │
 │  "Welcome to Pro!"               │  Webhook          │                │
 │◀──────────────│                   │─────────────────────────────────▶│
 │               │                   │                   │   Upsert sub  │
 │               │                   │                   │   Log event   │
 │               │                   │                   │   Update plan │
```

### 14.2 Quota Check + Report Generation

```
User            App              generate-report       PostgreSQL
 │               │                     │                    │
 │  "Generate"   │                     │                    │
 │──────────────▶│                     │                    │
 │               │  POST /generate     │                    │
 │               │  { notes, provider, │                    │
 │               │    reportType }     │                    │
 │               │────────────────────▶│                    │
 │               │                     │                    │
 │               │                     │  SELECT FROM       │
 │               │                     │  user_entitlements │
 │               │                     │───────────────────▶│
 │               │                     │◀───────────────────│
 │               │                     │                    │
 │               │                     │  ┌──────────────┐  │
 │               │                     │  │ Quota OK?    │  │
 │               │                     │  │ Provider OK? │  │
 │               │                     │  │ Type OK?     │  │
 │               │                     │  └──────┬───────┘  │
 │               │                     │         │          │
 │               │                     │    [YES]│          │
 │               │                     │         ▼          │
 │               │                     │  Call AI provider  │
 │               │                     │  Record tokens     │
 │               │                     │───────────────────▶│
 │               │  200 { report }     │                    │
 │               │◀────────────────────│                    │
 │  Show report  │                     │                    │
 │◀──────────────│                     │                    │
 │               │                     │                    │
 │               │                     │    [NO]            │
 │               │  403 { reason,      │                    │
 │               │    upgrade_url }    │                    │
 │               │◀────────────────────│                    │
 │  Show paywall │                     │                    │
 │◀──────────────│                     │                    │
```

### 14.3 Subscription Renewal

```
Apple/Google           RevenueCat             subscription-webhook      PostgreSQL
     │                      │                         │                      │
     │  Auto-renew charge   │                         │                      │
     │─────────────────────▶│                         │                      │
     │                      │  Validate               │                      │
     │◀─────────────────────│                         │                      │
     │  Receipt ✓           │                         │                      │
     │─────────────────────▶│                         │                      │
     │                      │                         │                      │
     │                      │  RENEWAL webhook        │                      │
     │                      │────────────────────────▶│                      │
     │                      │                         │  Idempotency check   │
     │                      │                         │─────────────────────▶│
     │                      │                         │◀─────────────────────│
     │                      │                         │                      │
     │                      │                         │  Update period_end   │
     │                      │                         │─────────────────────▶│
     │                      │                         │                      │
     │                      │                         │  Log RENEWAL event   │
     │                      │                         │─────────────────────▶│
     │                      │                         │                      │
     │                      │  200 OK                 │                      │
     │                      │◀────────────────────────│                      │
```

---

## 15. Open Questions / Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **RevenueCat pricing tier** | Free (up to $2.5k MTR) vs Starter ($99/mo) | Start Free, upgrade when revenue exceeds $2.5k/mo |
| 2 | **Annual discount** | 2 months free (17%) vs 3 months free (25%) | 2 months free (~17% discount) — shown above |
| 3 | **Trial period** | None vs 7-day vs 14-day free trial for Pro | 7-day free trial for Pro only (configured in App Store Connect) |
| 4 | **Stripe web launch timing** | Same time as IAP vs post-launch | Post-launch — reduces initial scope |
| 5 | **Team billing** | Per-seat vs flat rate | Flat rate (simpler, shown above) — revisit if enterprise requests per-seat |
| 6 | **Grandfathering** | Lock free users into current limits vs grace period | 30-day grace period with bonus reports (see Migration Plan) |
| 7 | **Feature flag system** | Environment variable vs Supabase remote config vs LaunchDarkly | Environment variable (`ENABLE_QUOTA_ENFORCEMENT=true`) — simplest |
| 8 | **Data retention enforcement** | Hard delete after 90 days vs archive to cold storage | Archive to separate schema — preserves recoverability on upgrade |
| 9 | **Provider override for paying users** | Allow Claude on Pro (expensive) vs Team-only | Allow on Pro but warn about faster token burn — no hard block |
| 10 | **Refund handling** | Immediate downgrade vs end-of-period | Immediate downgrade to free on refund (Apple/Google refund policy) |
| 11 | **Team quota model** | Per-owner pooled vs per-user | Per-owner pooled makes business sense for flat-rate; needs `billing_owner_id` concept |
| 12 | **`billing_retry` entitlement** | Keep access vs deny | Keep access for ~16 days (Apple/Google grace period), then deny |
| 13 | **Feature flag for emergency rollback** | Env var vs DB table | DB `settings` table (avoids redeployment); env var acceptable for Phase 5 |

---

## Appendix A: Architecture Review

> Reviewed April 2026. All CRITICAL issues have been addressed in this document.

### Resolved Issues

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| C1 | CRITICAL | `user_entitlements` view used `prompt_tokens`/`completion_tokens` — actual columns are `input_tokens`/`output_tokens` | Fixed column names; excluded `cached_tokens` from budget |
| C2 | CRITICAL | TOCTOU race condition on concurrent quota checks | Added advisory lock design in §10.2 |
| C3 | CRITICAL | `subscription_events.subscription_id` was nullable | Made `NOT NULL` |
| C4 | CRITICAL | Webhook auth used timing-unsafe string comparison | Replaced with `timingSafeEqual` |
| H1 | HIGH | `user_entitlements` LATERAL subqueries slow at scale | Added performance indexes in §4.6 |
| H2 | HIGH | `profiles.plan_id` cache stale on partial webhook failure | Added transactional RPC `process_subscription_event` in §4.8 |
| H3 | HIGH | `UNIQUE(user_id)` on subscriptions prevented history | Replaced with partial unique index on active status |
| H4 | HIGH | Provider naming mismatch (`moonshot` vs `kimi`) | Fixed plans seed data to use `kimi` (matches edge function) |
| H5 | HIGH | No dead-letter queue for webhook failures | Added `webhook_failures` table in §4.7 |

### Remaining Items (to address during implementation)

| ID | Severity | Issue | Notes |
|----|----------|-------|-------|
| H6 | HIGH | Project limit RLS calls full `user_entitlements` view | Use simpler dedicated functions for project count check |
| M3 | MEDIUM | Team quota is per-user, not pooled per-team | Open question #11 — decide before Team plan launch |
| M4 | MEDIUM | `data_retention_days` enforcement not designed | Open question #8 — needs cron job or archive strategy |
| M5 | MEDIUM | Feature flag via env var requires redeployment | Open question #13 — consider DB-backed flags |
| M6 | MEDIUM | `billing_retry` entitlement behaviour unspecified | Open question #12 — keep access ~16 days then deny |
| M7 | MEDIUM | `TRANSFER` event needs careful multi-user handling | Admin-only with explicit logging (noted in §5.1) |
