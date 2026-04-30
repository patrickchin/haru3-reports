import { View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CircleUserRound } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { colors } from "@/lib/design-tokens/colors";

function isActivePath(pathname: string, segment: string) {
  return pathname === segment || pathname.endsWith(segment);
}

// Always push the profile route onto the parent stack so iOS edge-swipe-back
// pops it in a single gesture. Previously, when tapping the profile button
// from a (tabs) root like /projects, we used router.navigate(...) to switch
// tabs without pushing a stack entry — but that left no entry for the swipe
// gesture to pop on the first swipe, requiring the user to swipe twice.
// Pushing keeps the originating screen on the stack so one swipe returns to
// it, whether we came from /projects or a deep screen.

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
          router.push("/(tabs)/profile");
        }}
      >
        <View className="items-center justify-center">
          <CircleUserRound size={16} color={colors.foreground} />
        </View>
      </Button>
    </View>
  );
}
