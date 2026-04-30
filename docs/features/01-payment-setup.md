# Payment System — External Setup Steps

> Companion to `docs/features/01-payment-system-design.md`. The code is in:
>   - `supabase/migrations/202605010001_payments_subscriptions.sql`
>   - `supabase/functions/_shared/entitlements.ts`
>   - `supabase/functions/subscription-webhook/`
>   - `apps/mobile/hooks/useEntitlement.ts`
>   - `apps/mobile/lib/purchases.ts`
>   - `apps/mobile/app/upgrade.tsx`
>
> Everything below requires action you (the operator) must take outside the
> repo. Code merges and migrations are not enough on their own.

---

## 1. Accounts you must sign up for

| Service | Purpose | Plan to start with |
|---------|---------|--------------------|
| **Apple Developer Program** | iOS in-app purchase | Paid ($99/yr) — required for IAP |
| **Google Play Console** | Android in-app purchase | Paid ($25 one-time) — required for IAP |
| **RevenueCat** | Unified IAP/Stripe receipt validation, subscriber state, webhooks | Free tier (≤ $2.5k MTR), then 1% rev share |
| **Stripe** | Web checkout fallback (post-launch) | Standard account; pay-as-you-go |
| **Supabase** | Already in use — no action |  — |

---

## 2. Apple App Store Connect

1. Sign into App Store Connect → My Apps → Harpa.
2. **Agreements, Tax & Banking** → complete the **Paid Applications** agreement (required before any IAP product becomes purchasable).
3. **App Store** → **Subscriptions** → create a new Subscription Group, e.g. `Harpa Memberships`.
4. Add four auto-renewing subscriptions (product IDs **must match exactly**):

   | Product ID | Reference Name | Duration | Price |
   |------------|---------------|----------|-------|
   | `harpa_pro_monthly` | Harpa Pro Monthly | 1 Month | $14.99 |
   | `harpa_pro_yearly` | Harpa Pro Yearly | 1 Year | $149.99 |
   | `harpa_team_monthly` | Harpa Team Monthly | 1 Month | $49.99 |
   | `harpa_team_yearly` | Harpa Team Yearly | 1 Year | $499.99 |

5. For each: set localised display name + description, mark as "Cleared for Sale", and submit for review (must be in "Approved" or "Ready to Submit" before TestFlight purchases work).
6. (Optional) Configure a 7-day **Introductory Offer → Free Trial** on `harpa_pro_monthly` and `harpa_pro_yearly`.
7. **Users and Access → Keys → In-App Purchase** → create a new key. Save the `.p8` file, the **Key ID**, and your **Issuer ID**. RevenueCat needs all three.

---

## 3. Google Play Console

1. Play Console → Harpa → **Monetization → Subscriptions**.
2. Create the same four subscription products with the **same product IDs** as Apple (`harpa_pro_monthly`, etc.). Set base plans + offers.
3. **Setup → API access** → link a Google Cloud project (or create one).
4. In Google Cloud Console for that project: enable the **Google Play Android Developer API**.
5. **Setup → API access → Service accounts** → create a service account, download the JSON credentials, and grant it **View financial data + Manage orders and subscriptions** in Play Console.
6. Save the JSON; RevenueCat needs it.

---

## 4. RevenueCat dashboard

1. Sign up at <https://app.revenuecat.com>.
2. Create a project: **Harpa**.
3. **Apps**:
   - Add iOS app → bundle ID matches the one in `apps/mobile/app.json`. Upload the App Store Connect `.p8` key + key ID + issuer ID.
   - Add Android app → package name matches `app.json`. Upload the Google service account JSON.
4. **Products** → import all four IAP products from each store (RC will pull them automatically once credentials are in).
5. **Entitlements** → create:
   - `pro` → attach `harpa_pro_monthly`, `harpa_pro_yearly`
   - `team` → attach `harpa_team_monthly`, `harpa_team_yearly`
6. **Offerings** → create offering `default`. Add packages: Monthly Pro, Yearly Pro, Monthly Team, Yearly Team. Mark `default` as the current offering.
7. **API Keys** → copy:
   - **Public Apple SDK key** → `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
   - **Public Google SDK key** → `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
8. **Integrations → Webhooks → Add webhook**:
   - URL: `https://<your-supabase-project-ref>.supabase.co/functions/v1/subscription-webhook`
   - Authorization Header Value: a long random string you generate (e.g. `openssl rand -hex 32`). Save it as `REVENUECAT_WEBHOOK_SECRET` in Supabase.
   - Send test event → confirm 200 from Supabase.
9. (Post-launch) **Apps → add Web (Stripe)** → connect your Stripe account → import Stripe products. The same webhook handler covers Stripe events.

---

## 5. Stripe (only if/when you ship the web fallback)

1. Sign up / log in at <https://dashboard.stripe.com>.
2. Create four recurring **Products** with the same names. Use the same prices.
3. RevenueCat → **Apps → Stripe** → connect via OAuth → map Stripe products to the existing Pro/Team entitlements.
4. No Supabase changes needed — events route through the same webhook.

---

## 6. Supabase configuration

### Apply the migration

```bash
# From repo root
supabase db push                 # against linked project, OR
psql "$DATABASE_URL" -f supabase/migrations/202605010001_payments_subscriptions.sql
```

### Set edge function secrets

```bash
supabase secrets set \
  REVENUECAT_WEBHOOK_SECRET="<value from RevenueCat dashboard>" \
  ENABLE_QUOTA_ENFORCEMENT="false"   # flip to "true" after staged rollout
```

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the
> Supabase runtime — do **not** set them yourself.

### Deploy edge functions

```bash
# Webhook must skip JWT verification (it uses a shared secret instead).
supabase functions deploy subscription-webhook --no-verify-jwt

# generate-report is already deployed; redeploy to pick up entitlement check.
supabase functions deploy generate-report
```

### Verify in DB

```sql
select id, display_name, monthly_price, max_reports_mo from public.plans;
-- Expect 3 rows: free, pro, team

select * from public.user_entitlements limit 1;
-- Should join cleanly; every existing user defaults to plan_id='free'.
```

---

## 7. Mobile app changes

### Install the SDK

```bash
pnpm --filter mobile add react-native-purchases
```

### Update `apps/mobile/app.config.ts`

Add the config plugin to `baseConfig.plugins`:

```ts
plugins: [
  ...(baseConfig.plugins ?? []),
  "react-native-purchases",
],
```

### Set env vars

In `apps/mobile/.env.local` (and any `.env.prod`, EAS secrets, etc.):

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_XXXXXXXXXXXXXXXXXXXX
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_XXXXXXXXXXXXXXXXXXXX
```

> `EXPO_PUBLIC_*` is inlined at Metro bundle time — you must rebuild
> (`pnpm ios` / `pnpm android` / new EAS build) after changing these.

### Native rebuild

`react-native-purchases` ships native code. After install:

```bash
cd apps/mobile
npx expo prebuild --clean    # only if you don't manage ios/android folders manually
pnpm ios                     # or pnpm android
```

For TestFlight / internal track testing, submit a fresh EAS build.

---

## 8. Testing checklist

### Local (no real money)

- Schema applied locally: `supabase db reset` → migration runs cleanly.
- Edge function unit tests: `cd supabase/functions/_shared && deno test -A entitlements.test.ts`
- Webhook unit tests: `cd supabase/functions/subscription-webhook && deno test -A`
- Mobile suite: `pnpm test:mobile`

### Sandbox / TestFlight

1. Create a sandbox tester in App Store Connect → Users and Access → Sandbox Testers.
2. Sign out of the App Store on your device, run a TestFlight build, attempt a purchase. The receipt is sandbox-only; no money charged.
3. Verify in Supabase:

   ```sql
   select * from public.subscriptions where user_id = '<your uid>';
   select * from public.subscription_events order by created_at desc limit 5;
   ```

   Expect a fresh row with `platform='apple'`, `plan_id='pro'`, `status='active'`.

4. RevenueCat dashboard → **Customers** → search by your user id; verify the active entitlement.

### Staged rollout sequence

1. **Now (this PR):** schema + edge functions + paywall code shipped, but `ENABLE_QUOTA_ENFORCEMENT=false`. No user-visible change.
2. Add RevenueCat SDK install + plugin (separate native rebuild).
3. Test purchases in TestFlight / Play internal testing track.
4. Set `ENABLE_QUOTA_ENFORCEMENT=true` in Supabase → quotas now enforced. Watch error rates.
5. Submit App Store / Play Store update with paywall UI surfaced.

---

## 9. Things to keep an eye on after launch

- **Webhook failures**: `select * from public.webhook_failures where resolved_at is null;` — investigate any rows.
- **Refund storms**: `select event_type, count(*) from public.subscription_events where created_at > now() - interval '24 hours' group by event_type;`
- **Quota lockouts**: spike in `quota_exceeded` 403s from `generate-report` logs may mean limits are too tight.
- **TOCTOU at scale**: if `tokens_used_mo` ever exceeds `max_tokens_mo` by more than ~5%, implement the advisory-lock change documented in the design doc §10.2.

---

## 10. Open decisions still to make

These are flagged in `docs/features/01-payment-system-design.md` §15. You
(the operator) need to commit to a choice before launch:

- Annual discount %, free trial length, grace period for existing users.
- Whether to expose Claude Sonnet on Pro tier (cost risk).
- Per-team pooled quota vs. per-member quota for Team plan.
- Data retention enforcement strategy (cron + archive vs. hard delete).
