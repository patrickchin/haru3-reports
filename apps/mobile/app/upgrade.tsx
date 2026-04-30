/**
 * Upgrade / paywall screen.
 *
 * Shown when:
 *   - User taps an upgrade CTA from quota-limit dialogs
 *   - User selects a locked provider / report type
 *   - User explicitly opens "Manage subscription" from Account
 *
 * Quota numbers are read from `useEntitlement()` (server-authoritative).
 * Purchase actions go through RevenueCat via `lib/purchases`.
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useEntitlement, type PlanId } from "@/hooks/useEntitlement";
import {
  fetchOfferings,
  purchase,
  restorePurchases,
  type RcOffering,
  type ProductId,
} from "@/lib/purchases";

interface PlanCopy {
  id: PlanId;
  title: string;
  bullets: string[];
  monthlyProductId?: ProductId;
  yearlyProductId?: ProductId;
}

const PLANS: PlanCopy[] = [
  {
    id: "free",
    title: "Free",
    bullets: [
      "2 projects",
      "10 reports per month",
      "Daily reports only",
      "Gemini Flash Lite",
    ],
  },
  {
    id: "pro",
    title: "Pro",
    bullets: [
      "Unlimited projects",
      "100 reports per month",
      "All 6 report types",
      "All AI providers",
      "20 images per report",
    ],
    monthlyProductId: "harpa_pro_monthly",
    yearlyProductId: "harpa_pro_yearly",
  },
  {
    id: "team",
    title: "Team",
    bullets: [
      "Up to 10 team members",
      "500 reports per month",
      "Priority support",
      "50 images per report",
      "Custom report branding",
    ],
    monthlyProductId: "harpa_team_monthly",
    yearlyProductId: "harpa_team_yearly",
  },
];

export default function UpgradeScreen() {
  const router = useRouter();
  const { server, planId, refetch } = useEntitlement();
  const [offerings, setOfferings] = useState<RcOffering[]>([]);
  const [busyProductId, setBusyProductId] = useState<ProductId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOfferings()
      .then((o) => {
        if (!cancelled) setOfferings(o);
      })
      .catch(() => {
        if (!cancelled) setOfferings([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceFor = (productId?: ProductId): string => {
    if (!productId) return "";
    return offerings.find((o) => o.productId === productId)?.priceString ?? "";
  };

  const handlePurchase = async (productId: ProductId) => {
    setError(null);
    setBusyProductId(productId);
    try {
      const ok = await purchase(productId);
      if (ok) {
        await refetch();
        router.back();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusyProductId(null);
    }
  };

  const handleRestore = async () => {
    setError(null);
    setBusyProductId(null);
    try {
      await restorePurchases();
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScreenHeader
        title="Upgrade Harpa"
        onBack={() => router.back()}
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-20">
        {server ? (
          <Card>
            <View className="gap-1 p-4">
              <Text className="text-sm text-muted">Current plan</Text>
              <Text className="text-2xl font-bold text-foreground">
                {server.plan_name}
              </Text>
              <Text className="text-sm text-muted">
                {server.reports_used_mo} / {server.max_reports_mo} reports this
                month · {Math.round(server.tokens_used_mo / 1000)}k /{" "}
                {Math.round(server.max_tokens_mo / 1000)}k tokens
              </Text>
            </View>
          </Card>
        ) : null}

        {PLANS.map((plan) => {
          const isCurrent = plan.id === planId;
          const monthlyPrice = priceFor(plan.monthlyProductId);
          const yearlyPrice = priceFor(plan.yearlyProductId);
          return (
            <Card key={plan.id}>
              <View className="gap-3 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xl font-bold text-foreground">
                    {plan.title}
                  </Text>
                  {isCurrent ? (
                    <Text className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      Current
                    </Text>
                  ) : null}
                </View>

                <View className="gap-1.5">
                  {plan.bullets.map((bullet) => (
                    <View
                      key={bullet}
                      className="flex-row items-center gap-2"
                    >
                      <Check size={14} color="#1a1a2e" />
                      <Text className="text-sm text-foreground">{bullet}</Text>
                    </View>
                  ))}
                </View>

                {!isCurrent && plan.id !== "free" ? (
                  <View className="gap-2 pt-2">
                    {plan.monthlyProductId ? (
                      <Button
                        variant="secondary"
                        size="lg"
                        disabled={busyProductId !== null}
                        onPress={() =>
                          handlePurchase(plan.monthlyProductId as ProductId)
                        }
                      >
                        {busyProductId === plan.monthlyProductId
                          ? "Processing…"
                          : `Monthly${monthlyPrice ? ` · ${monthlyPrice}` : ""}`}
                      </Button>
                    ) : null}
                    {plan.yearlyProductId ? (
                      <Button
                        variant="hero"
                        size="lg"
                        disabled={busyProductId !== null}
                        onPress={() =>
                          handlePurchase(plan.yearlyProductId as ProductId)
                        }
                      >
                        {busyProductId === plan.yearlyProductId
                          ? "Processing…"
                          : `Yearly${yearlyPrice ? ` · ${yearlyPrice}` : ""} · save 17%`}
                      </Button>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })}

        {error ? (
          <Text className="text-center text-sm text-danger">{error}</Text>
        ) : null}

        <Pressable
          onPress={handleRestore}
          className="self-center px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel="Restore previous purchases"
        >
          <Text className="text-sm text-muted underline">
            Restore purchases
          </Text>
        </Pressable>

        <Text className="px-4 text-center text-xs text-muted">
          Subscriptions auto-renew until cancelled. Manage or cancel anytime
          in your App Store / Google Play account settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
