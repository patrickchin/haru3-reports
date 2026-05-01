import { View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CircleUserRound } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/design-tokens/colors";

function isActivePath(pathname: string, segment: string) {
  return pathname === segment || pathname.endsWith(segment);
}

// Push /profile onto the root Stack so a single iOS edge-swipe pops it.
//
// Profile used to live inside the (tabs) Tabs navigator, which made
// router.push push a parent-Stack entry while the underlying Tabs navigator
// (a singleton instance shared across stack entries) kept "profile" as the
// active tab. Popping the stack entry didn't change which tab was active, so
// the user appeared stuck and had to swipe a second time. Promoting profile
// to a root Stack screen eliminates that nested-navigator state-sharing trap
// — push/pop are now perfectly symmetric.

export function AppHeaderActions() {
  const router = useRouter();
  const pathname = usePathname();
  const isProfileActive =
    isActivePath(pathname, "/profile") || isActivePath(pathname, "/account") || isActivePath(pathname, "/usage");

  return (
    <View className="flex-row items-center">
      <Button
        variant={isProfileActive ? "secondary" : "outline"}
        size="default"
        className="px-4"
        testID="btn-open-profile"
        accessibilityLabel="Open profile"
        onPress={() => {
          if (isProfileActive) return;
          router.push("/profile");
        }}
      >
        <View className="items-center justify-center">
          <CircleUserRound size={16} color={colors.foreground} />
        </View>
      </Button>
    </View>
  );
}
