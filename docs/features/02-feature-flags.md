# Feature Flags, A/B Testing, and Dev Settings

## ADR Summary

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Build vs Buy | **Build (Supabase-native)** | Free, no new infra, shared client for mobile + edge, instant kill-switches via DB |
| 2 | Storage | **PostgreSQL table + in-memory cache** | Sub-ms evaluation, real-time updates via Supabase Realtime, fits existing stack |
| 3 | Dev settings | **Flags with `environment: 'development'` audience** | One system, no special-casing |
| 4 | A/B testing | **Built-in experiment assignment with deterministic hashing** | Simple, stateless, no external dependency |
| 5 | Analytics | **Defer to PostHog** (add later) | Keep Phase 1 zero-dependency; PostHog free tier covers future needs |

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mobile App                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ <FlagProvider>                                             │  │
│  │   • Fetches flags on mount via supabase.rpc('get_flags')  │  │
│  │   • Subscribes to Realtime on `feature_flags` table       │  │
│  │   • Caches in memory (React context) + AsyncStorage       │  │
│  │   • Exposes useFlag('key'), useExperiment('key') hooks    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Components:                                                    │
│    {flag('new_onboarding') && <NewOnboarding />}                │
│    {variant === 'b' && <PricingB />}                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │  supabase.rpc('get_flags')
                        │  + Realtime subscription
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Backend                            │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │  feature_flags   │  │  experiment_assignments              │ │
│  │  (PostgreSQL)    │  │  (PostgreSQL)                        │ │
│  │                  │  │                                      │ │
│  │  key, value,     │  │  user_id, experiment_key,            │ │
│  │  rules[], type,  │  │  variant, assigned_at                │ │
│  │  enabled         │  │                                      │ │
│  └────────┬─────────┘  └──────────────────────────────────────┘ │
│           │                                                     │
│  ┌────────┴─────────┐                                           │
│  │  get_flags()     │  ← Postgres function: evaluates rules,   │
│  │  (RPC)           │    returns resolved flags for the caller  │
│  └──────────────────┘                                           │
│                                                                 │
│  Edge Functions:                                                │
│    import { getFlag } from '../_shared/flags.ts'                │
│    const enabled = await getFlag('quota_enforcement')           │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **App boot**: `FlagProvider` calls `supabase.rpc('get_flags')` which returns all flags resolved for the current user.
2. **Real-time updates**: A Supabase Realtime subscription on `feature_flags` triggers a re-fetch when any flag changes. This gives kill-switches ~1s propagation.
3. **Edge functions**: Import `_shared/flags.ts` which queries the `feature_flags` table directly (service role). Results are cached in a module-level `Map` with a 60s TTL.
4. **Offline / startup**: `AsyncStorage` persists the last known flag set so the app has flags before the network round-trip completes.

---

## 2. Flag Storage — Database Schema

### `feature_flags` table

```sql
CREATE TABLE public.feature_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  description   text NOT NULL DEFAULT '',
  flag_type     text NOT NULL DEFAULT 'boolean'
                  CHECK (flag_type IN ('boolean', 'string', 'number', 'json')),
  enabled       boolean NOT NULL DEFAULT false,
  default_value jsonb NOT NULL DEFAULT 'false'::jsonb,
  rules         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- rules schema: [{ "audience": {...}, "value": <jsonb>, "percentage": 0-100 }]
  environment   text NOT NULL DEFAULT 'all'
                  CHECK (environment IN ('all', 'development', 'production')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### `experiment_assignments` table

```sql
CREATE TABLE public.experiment_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  experiment_key  text NOT NULL,
  variant         text NOT NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, experiment_key)
);
```

### Rules Schema

The `rules` JSONB column holds an array of targeting rules evaluated top-to-bottom:

```typescript
type FlagRule = {
  // Audience filter — all conditions must match (AND)
  audience?: {
    user_ids?: string[];        // explicit user allowlist
    environments?: string[];    // 'development' | 'production'
    app_version_gte?: string;   // minimum app version (semver)
    plan?: string[];            // 'free' | 'pro' | 'team'
    percentage?: number;        // 0–100, sticky via hash(user_id + flag_key)
  };
  // Value to return when this rule matches
  value: boolean | string | number | Record<string, unknown>;
};
```

Example flag row:

```json
{
  "key": "ai_provider_kill_switch",
  "flag_type": "json",
  "enabled": true,
  "default_value": { "disabled_providers": [] },
  "rules": [
    {
      "audience": {},
      "value": { "disabled_providers": ["openai"] }
    }
  ]
}
```

---

## 3. Client SDK Design

### File: `apps/mobile/lib/flags.tsx`

Start as a single file in the mobile app. Extract to a shared package if/when `apps/web` needs flags.

```typescript
import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { backend } from "@/lib/backend";

type FlagValue = boolean | string | number | Record<string, unknown>;
type ResolvedFlags = Record<string, FlagValue>;

type FlagContextValue = {
  flags: ResolvedFlags;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

const STORAGE_KEY = "feature_flags_cache";
const FlagContext = createContext<FlagContextValue | undefined>(undefined);

export function FlagProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<ResolvedFlags>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      const { data, error } = await backend.rpc("get_flags", {
        p_environment: __DEV__ ? "development" : "production",
      });
      if (error) throw error;

      const resolved: ResolvedFlags = {};
      for (const row of data ?? []) {
        resolved[row.key] = row.resolved_value;
      }
      setFlags(resolved);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
    } catch (err) {
      console.warn("flags: fetch failed, using cache", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((cached) => {
      if (cached) {
        try { setFlags(JSON.parse(cached)); } catch { /* ignore corrupt cache */ }
      }
      fetchFlags();
    });
  }, [fetchFlags]);

  // Realtime subscription for instant kill-switch propagation
  useEffect(() => {
    const channel = backend
      .channel("feature_flags_changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "feature_flags" },
        () => { fetchFlags(); }
      )
      .subscribe();
    return () => { backend.removeChannel(channel); };
  }, [fetchFlags]);

  const value = useMemo(
    () => ({ flags, isLoading, refetch: fetchFlags }),
    [flags, isLoading, fetchFlags]
  );

  return <FlagContext.Provider value={value}>{children}</FlagContext.Provider>;
}

// ── Hooks ──────────────────────────────────────────────────────

export function useFlags(): ResolvedFlags {
  const ctx = useContext(FlagContext);
  if (!ctx) throw new Error("useFlags must be used within <FlagProvider>");
  return ctx.flags;
}

export function useFlag(key: string): FlagValue | undefined {
  return useFlags()[key];
}

export function useBooleanFlag(key: string, fallback = false): boolean {
  const val = useFlag(key);
  return typeof val === "boolean" ? val : fallback;
}

export function useStringFlag(key: string, fallback = ""): string {
  const val = useFlag(key);
  return typeof val === "string" ? val : fallback;
}

export function useJsonFlag<T = Record<string, unknown>>(key: string, fallback: T): T {
  const val = useFlag(key);
  return (typeof val === "object" && val !== null ? val : fallback) as T;
}

export function useExperiment(
  key: string,
  variants: string[] = ["control", "variant"]
): { variant: string; isLoading: boolean } {
  const flags = useFlags();
  const ctx = useContext(FlagContext);
  const variant = flags[`experiment:${key}`];
  return {
    variant: typeof variant === "string" ? variant : variants[0],
    isLoading: ctx?.isLoading ?? true,
  };
}

// ── Test helper ────────────────────────────────────────────────

export function FlagOverrideProvider({
  overrides, children,
}: { overrides: ResolvedFlags; children: ReactNode }) {
  const value = useMemo(
    () => ({ flags: overrides, isLoading: false, refetch: async () => {} }),
    [overrides]
  );
  return <FlagContext.Provider value={value}>{children}</FlagContext.Provider>;
}
```

### Caching Strategy

```
┌──────────────┐    boot     ┌──────────────┐    fetch    ┌───────────┐
│ AsyncStorage │ ──────────► │ React State  │ ◄────────── │ Supabase  │
│ (persistent) │             │ (in-memory)  │             │ RPC       │
└──────────────┘             └──────────────┘             └───────────┘
                                    ▲
                                    │ Realtime (< 1s)
                              ┌─────┴─────┐
                              │ Supabase  │
                              │ Realtime  │
                              └───────────┘
```

- **Cold start**: AsyncStorage → render immediately with cached flags (stale but fast).
- **Warm start**: RPC fetch completes in ~50–100ms, updates state.
- **Live updates**: Realtime subscription triggers re-fetch within ~1s of any flag change.
- **Offline**: Last cached values used. App never blocks on flag loading.

---

## 4. Server SDK Design

### File: `supabase/functions/_shared/flags.ts`

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

type FlagValue = boolean | string | number | Record<string, unknown>;
type CacheEntry = { value: FlagValue; expiresAt: number };

const FLAG_TTL_MS = 60_000; // 60s cache
const cache = new Map<string, CacheEntry>();

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function getFlag(key: string, fallback: FlagValue = false): Promise<FlagValue> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const client = getServiceClient();
    const { data, error } = await client
      .from("feature_flags")
      .select("enabled, default_value, rules")
      .eq("key", key)
      .single();

    if (error || !data) return fallback;
    if (!data.enabled) return fallback;

    const value = evaluateRules(data.rules, data.default_value);
    cache.set(key, { value, expiresAt: now + FLAG_TTL_MS });
    return value;
  } catch {
    return fallback;
  }
}

export async function getAllFlags(): Promise<Record<string, FlagValue>> {
  const client = getServiceClient();
  const { data, error } = await client
    .from("feature_flags")
    .select("key, enabled, default_value, rules")
    .eq("enabled", true);

  if (error || !data) return {};

  const result: Record<string, FlagValue> = {};
  for (const row of data) {
    result[row.key] = evaluateRules(row.rules, row.default_value);
    cache.set(row.key, { value: result[row.key], expiresAt: Date.now() + FLAG_TTL_MS });
  }
  return result;
}

function evaluateRules(rules: unknown[], defaultValue: FlagValue): FlagValue {
  if (!Array.isArray(rules)) return defaultValue;
  for (const rule of rules) {
    const r = rule as { audience?: Record<string, unknown>; value: FlagValue };
    if (!r.audience || Object.keys(r.audience).length === 0) {
      return r.value;
    }
  }
  return defaultValue;
}

export function invalidateCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
```

### Usage in Edge Functions

```typescript
// supabase/functions/generate-report/index.ts
import { getFlag } from "../_shared/flags.ts";

// Kill-switch: check if a provider is disabled
const killSwitch = await getFlag("ai_provider_kill_switch", { disabled_providers: [] });
const disabledProviders = (killSwitch as { disabled_providers: string[] }).disabled_providers;

if (disabledProviders.includes(selectedProvider)) {
  const fallback = getAvailableProviders().find(p => !disabledProviders.includes(p));
  if (!fallback) return new Response("All AI providers disabled", { status: 503 });
  selectedProvider = fallback;
}

// Quota enforcement
const quotaEnabled = await getFlag("enable_quota_enforcement", false);
if (quotaEnabled) {
  // ... checkEntitlement logic
}
```

---

## 5. Dev Settings

Dev settings are **regular flags** with `environment: 'development'`. The `get_flags` RPC receives the client environment and filters accordingly.

### Migrating Existing Dev-Only Patterns

| Current Pattern | New Flag Key | Type | Environment |
|---|---|---|---|
| `isDevPhoneAuthEnabled` | `dev_phone_auth` | boolean | development |
| AI provider picker in profile | `dev_ai_provider_picker` | boolean | development |
| `__DEV__` checks in generate screen | `dev_debug_panel` | boolean | development |
| `SEED_CREDENTIALS` visibility | `dev_seed_accounts` | boolean | development |

After migration:

```typescript
// apps/mobile/lib/auth.tsx
import { useBooleanFlag } from "@/lib/flags";

// In a component:
const showDevPhoneAuth = useBooleanFlag("dev_phone_auth");
const showSeedAccounts = useBooleanFlag("dev_seed_accounts");
```

---

## 6. A/B Testing

### Experiment Assignment

Experiments are flags with `flag_type: 'string'` whose `rules` contain variant definitions with percentages. Assignment is **deterministic**: `hash(user_id + experiment_key) % variant_count` determines the bucket. Once assigned, the variant is persisted in `experiment_assignments` for stable reporting.

### Client-Side Usage

```typescript
function OnboardingScreen() {
  const { variant } = useExperiment("onboarding_v2", ["control", "streamlined"]);

  if (variant === "streamlined") {
    return <StreamlinedOnboarding />;
  }
  return <ClassicOnboarding />;
}
```

### Analytics — Conversion Rate by Variant

```sql
SELECT
  ea.variant,
  COUNT(DISTINCT ea.user_id) AS users,
  COUNT(DISTINCT r.id) AS reports_generated,
  ROUND(COUNT(DISTINCT r.id)::numeric / NULLIF(COUNT(DISTINCT ea.user_id), 0), 3) AS conversion
FROM public.experiment_assignments ea
LEFT JOIN public.reports r ON r.owner_id = ea.user_id
  AND r.created_at >= ea.assigned_at
WHERE ea.experiment_key = 'onboarding_v2'
GROUP BY ea.variant;
```

---

## 7. Admin Interface

### Phase 1: SQL + Supabase Dashboard (recommended for now)

No custom admin UI. Flags are managed via:

1. **Supabase Table Editor** — click-to-edit in the dashboard
2. **SQL seed scripts** — version-controlled flag definitions in migrations
3. **Emergency SQL** — direct `UPDATE` for kill-switches

### Phase 2 (Future): Admin Edge Function → Slack slash command or web UI

---

## 8. Migration Path

| # | Current | After | Breaking? |
|---|---------|-------|-----------|
| 1 | `EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH` env var | `dev_phone_auth` flag (environment=development) | No — keep env var working in parallel during transition |
| 2 | `__DEV__` checks in UI components | `dev_*` flags | No — `__DEV__` still works, flags add server-control |
| 3 | `AI_PROVIDER` env var (edge function default) | Keep as-is; add `ai_provider_kill_switch` flag for disabling providers | No |
| 4 | `ENABLE_QUOTA_ENFORCEMENT` (not yet built) | `enable_quota_enforcement` flag (enabled=false) | N/A |

---

## 9. Testing Strategy

### Unit Tests (Vitest)

Use the `FlagOverrideProvider` to inject flag values:

```typescript
import { render, screen } from "@testing-library/react-native";
import { FlagOverrideProvider } from "@/lib/flags";

test("shows new onboarding when flag is enabled", () => {
  render(
    <FlagOverrideProvider overrides={{ onboarding_v2: true }}>
      <OnboardingScreen />
    </FlagOverrideProvider>
  );
  expect(screen.getByText("Welcome!")).toBeTruthy();
});
```

### E2E (Maestro)

Local Supabase seed includes flag seeds, so `supabase db reset` gives a clean starting point with all dev flags enabled.

### RLS Tests

```sql
-- authenticated user can read flags
SET request.jwt.claims = '{"sub": "user-uuid-1", "role": "authenticated"}';
SET ROLE authenticated;
SELECT count(*) FROM feature_flags;  -- should return rows

-- authenticated user cannot insert flags
INSERT INTO feature_flags (key, description) VALUES ('hack', 'nope');
-- should fail with RLS violation
```

---

## 10. Vendor Evaluation — Build vs Buy

| Criteria | Weight | **Custom (Supabase)** | **PostHog** | **Statsig** | **LaunchDarkly** |
|----------|--------|-----------------------|-------------|-------------|------------------|
| Cost (free tier) | 5 | **$0** | $0 (1M events) | $0 (1M events) | $0 (14 days only) |
| Setup complexity | 4 | **Low** — SQL + ~200 LOC | Medium | Medium | Medium |
| Supabase integration | 5 | **Native** | Separate service | Separate service | Separate service |
| Edge Function support | 5 | **Native** — direct DB query | REST API (adds latency) | REST API | REST API |
| Kill-switch speed | 5 | **~1s** (Realtime) | ~30s (polling) | ~10s (streaming) | ~10s (streaming) |
| A/B testing | 3 | Basic (deterministic hash) | **Full** (stats engine) | **Full** | **Full** |
| New infrastructure | 5 | **None** | New service + SDK | New service + SDK | New service + SDK |
| **Weighted Score** | | **44/49** | **34/49** | **33/49** | **27/49** |

**Recommendation**: Build with Supabase tables for Phase 1. Migrate to PostHog when statistical A/B testing or rich segmentation is needed.

---

## 11. Phased Rollout Plan

### Phase 1 — Foundation (1–2 days)

- [ ] Migration: `feature_flags` table, `experiment_assignments` table, `get_flags` RPC, `evaluate_flag_rule` helper
- [ ] Seed data: `dev_phone_auth`, `dev_ai_provider_picker`, `dev_debug_panel`, `ai_provider_kill_switch`
- [ ] `_shared/flags.ts` for Edge Functions
- [ ] `lib/flags.tsx` for mobile (provider, hooks, test helper)
- [ ] Wire `FlagProvider` into `app/_layout.tsx`
- [ ] Unit tests for flag evaluation logic

### Phase 2 — Migrate Existing Flags (1 day)

- [ ] Replace `isDevPhoneAuthEnabled` with `useBooleanFlag("dev_phone_auth")`
- [ ] Replace AI provider picker `__DEV__` guard with `useBooleanFlag("dev_ai_provider_picker")`
- [ ] Replace `__DEV__` guards in generate screen with `useBooleanFlag("dev_debug_panel")`
- [ ] Add `ai_provider_kill_switch` check in `generate-report` edge function
- [ ] Remove `EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH` env var
- [ ] Update Maestro seed data

### Phase 3 — Quota Enforcement Flag (with Payment System)

- [ ] Add `enable_quota_enforcement` flag (enabled=false)
- [ ] Use `getFlag("enable_quota_enforcement")` in `generate-report` instead of env var
- [ ] Toggle on per-environment via Supabase dashboard

### Phase 4 — Server-Driven Config

- [ ] `ai_default_provider` (string flag) — replace `AI_PROVIDER` env var for runtime switching
- [ ] `ai_prompt_version` (string flag) — select prompt variant without redeploy
- [ ] `ai_max_output_tokens` (number flag) — tune generation limits remotely
- [ ] `rate_limit_reports_per_hour` (number flag) — adjustable rate limits

### Phase 5 — A/B Testing (when needed)

- [ ] Implement `assign_experiment` RPC
- [ ] Add `useExperiment` hook
- [ ] First experiment: onboarding flow A/B test
- [ ] Analysis queries for experiment results

### Phase 6 — PostHog Migration (when analytics needed)

- [ ] Integrate `posthog-react-native` SDK
- [ ] Keep `useFlag()` / `useBooleanFlag()` API, swap provider to PostHog
- [ ] Migrate experiment tracking to PostHog experiments

---

## 12. Database Migration SQL

Full migration at `supabase/migrations/202604230002_feature_flags.sql`.

---

## Appendix: Emergency Runbook

### Kill-switch an AI provider (< 30 seconds)

```sql
UPDATE feature_flags
SET rules = '[{"audience": {}, "value": {"disabled_providers": ["openai"]}}]'::jsonb
WHERE key = 'ai_provider_kill_switch';
```

Mobile apps pick up the change within ~1s via Realtime. Edge functions pick it up within 60s (cache TTL).

### Disable a feature for all users

```sql
UPDATE feature_flags SET enabled = false WHERE key = 'some_feature';
```

### Enable a feature for a specific user (testing in production)

```sql
UPDATE feature_flags
SET rules = '[{"audience": {"user_ids": ["uuid-of-tester"]}, "value": true}]'::jsonb
WHERE key = 'new_feature';
```

### Gradual rollout to 10% of users

```sql
UPDATE feature_flags
SET rules = '[{"audience": {"percentage": 10}, "value": true}]'::jsonb,
    enabled = true
WHERE key = 'new_feature';
```
