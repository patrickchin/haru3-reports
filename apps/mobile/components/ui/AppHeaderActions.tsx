import { View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CircleUserRound } from "lucide-react-native";
import { Button } from "@/components/ui/Button";

function isActivePath(pathname: string, segment: string) {
  return pathname === segment || pathname.endsWith(segment);
}

// The (tabs) group exposes two routes ("/projects" and "/profile") plus the
// root login screen. When the profile button is tapped from one of these the
// user is still inside the original (tabs) entry, so we want to just switch
// the active tab rather than push a duplicate (tabs) entry on the parent
// stack. From any deeper screen (e.g. /projects/[id]/reports/[reportId]) we
// push instead so the iOS swipe-back gesture returns the user to where they
// came from.
function isOnTabsRoot(pathname: string) {
  return pathname === "/" || pathname === "/projects" || pathname === "/profile";
}

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
          if (isOnTabsRoot(pathname)) {
            // Same (tabs) entry — just switch tabs so a single back press
            // returns us to the previous tab without leaving a duplicate
            // (tabs) entry on the parent stack.
            router.navigate("/(tabs)/profile");
          } else {
            // Deep screen (project detail, report, etc). Push so the parent
            // stack keeps the originating screen and swipe-back returns to
            // it instead of unwinding straight to Projects.
            router.push("/(tabs)/profile");
          }
        }}
      >
        <View className="items-center justify-center">
          <CircleUserRound size={16} color="#1a1a2e" />
        </View>
      </Button>
    </View>
  );
}
