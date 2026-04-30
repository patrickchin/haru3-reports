/**
 * Thin wrapper around `react-native-purchases` (RevenueCat SDK).
 *
 * Why a wrapper:
 *   - The SDK is a native module and won't load in Vitest / web preview.
 *     We dynamically import so unit tests can run without it.
 *   - Centralises product-id ↔ plan mapping.
 *   - Gives us one place to swap to a different IAP backend later.
 *
 * Setup steps (see docs/features/01-payment-setup.md):
 *   1. `pnpm --filter mobile add react-native-purchases`
 *   2. Add `react-native-purchases` to `app.config.ts` plugins.
 *   3. Set EXPO_PUBLIC_REVENUECAT_IOS_KEY and ..._ANDROID_KEY in `.env.local`.
 *   4. Configure products & entitlements in App Store Connect / Play Console / RC dashboard.
 */
import { Platform } from "react-native";

export type PlanId = "free" | "pro" | "team";

export const RC_PRODUCTS = {
  pro_monthly: "harpa_pro_monthly",
  pro_yearly: "harpa_pro_yearly",
  team_monthly: "harpa_team_monthly",
  team_yearly: "harpa_team_yearly",
} as const;

export type ProductId = (typeof RC_PRODUCTS)[keyof typeof RC_PRODUCTS];

export const RC_ENTITLEMENTS = {
  pro: "pro",
  team: "team",
} as const;

export interface RcOffering {
  productId: ProductId;
  title: string;
  priceString: string;
  period: "monthly" | "yearly";
  planId: Exclude<PlanId, "free">;
}

interface PurchasesModule {
  default: {
    configure: (opts: { apiKey: string; appUserID?: string }) => void;
    logIn: (appUserID: string) => Promise<unknown>;
    logOut: () => Promise<unknown>;
    getOfferings: () => Promise<unknown>;
    purchasePackage: (pkg: unknown) => Promise<unknown>;
    restorePurchases: () => Promise<unknown>;
    getCustomerInfo: () => Promise<unknown>;
  };
}

let modulePromise: Promise<PurchasesModule | null> | null = null;
let configured = false;

async function loadModule(): Promise<PurchasesModule | null> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("react-native-purchases") as PurchasesModule;
      return mod;
    } catch {
      return null;
    }
  })();
  return modulePromise;
}

function apiKey(): string | null {
  return Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? null
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? null;
}

/**
 * Configure RevenueCat once at app launch. Safe to call before sign-in;
 * pass the user id later via `linkUser`.
 */
export async function configurePurchases(): Promise<boolean> {
  if (configured) return true;
  const mod = await loadModule();
  const key = apiKey();
  if (!mod || !key) {
    console.info(
      "RevenueCat: SDK or API key unavailable; purchases disabled",
    );
    return false;
  }
  mod.default.configure({ apiKey: key });
  configured = true;
  return true;
}

/** Bind the active Supabase user to the RevenueCat customer. */
export async function linkUser(userId: string | null): Promise<void> {
  if (!configured) return;
  const mod = await loadModule();
  if (!mod) return;
  if (userId) {
    await mod.default.logIn(userId).catch(() => {});
  } else {
    await mod.default.logOut().catch(() => {});
  }
}

interface RawOffering {
  current?: {
    availablePackages?: Array<{
      product?: {
        identifier?: string;
        title?: string;
        priceString?: string;
      };
    }>;
  };
}

/** Fetch the active "default" offering and shape it for our paywall. */
export async function fetchOfferings(): Promise<RcOffering[]> {
  if (!configured) return [];
  const mod = await loadModule();
  if (!mod) return [];

  const raw = (await mod.default.getOfferings().catch(() => null)) as
    | RawOffering
    | null;
  if (!raw?.current?.availablePackages) return [];

  const out: RcOffering[] = [];
  for (const pkg of raw.current.availablePackages) {
    const id = pkg.product?.identifier;
    if (!id) continue;
    const planId: Exclude<PlanId, "free"> | null = id.includes("team")
      ? "team"
      : id.includes("pro")
        ? "pro"
        : null;
    if (!planId) continue;
    out.push({
      productId: id as ProductId,
      title: pkg.product?.title ?? id,
      priceString: pkg.product?.priceString ?? "",
      period: id.includes("yearly") ? "yearly" : "monthly",
      planId,
    });
  }
  return out;
}

/**
 * Trigger the native purchase dialog for a given offering.
 * Returns true if the user actively granted (or already had) the entitlement.
 *
 * Side-effects: RevenueCat will fire a webhook to subscription-webhook
 * which writes the subscription row. UI should optimistically refetch
 * `useEntitlement()` after this resolves.
 */
export async function purchase(productId: ProductId): Promise<boolean> {
  if (!configured) return false;
  const mod = await loadModule();
  if (!mod) return false;

  const raw = (await mod.default.getOfferings().catch(() => null)) as
    | RawOffering
    | null;
  const pkg = raw?.current?.availablePackages?.find(
    (p) => p.product?.identifier === productId,
  );
  if (!pkg) return false;

  try {
    const result = (await mod.default.purchasePackage(pkg)) as {
      customerInfo?: {
        entitlements?: { active?: Record<string, unknown> };
      };
    };
    const active = result.customerInfo?.entitlements?.active ?? {};
    return Object.keys(active).length > 0;
  } catch (err) {
    const userCancelled =
      typeof err === "object" &&
      err !== null &&
      "userCancelled" in err &&
      (err as { userCancelled?: boolean }).userCancelled === true;
    if (userCancelled) return false;
    throw err;
  }
}

export async function restorePurchases(): Promise<void> {
  if (!configured) return;
  const mod = await loadModule();
  if (!mod) return;
  await mod.default.restorePurchases().catch(() => {});
}
