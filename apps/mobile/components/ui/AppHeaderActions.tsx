import { View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { Button } from "@/components/ui/Button";

function isActivePath(pathname: string, segment: string) {
  return pathname === segment || pathname.endsWith(segment);
}

export function AppHeaderActions() {
  const router = useRouter();
  const pathname = usePathname();
  const isSettingsActive =
    isActivePath(pathname, "/profile") || isActivePath(pathname, "/account");

  return (
    <View className="flex-row items-center">
      <Button
        variant={isSettingsActive ? "secondary" : "outline"}
        size="default"
        className="px-4"
        accessibilityLabel="Open settings"
        onPress={() => {
          if (isSettingsActive) return;
          router.push("/(tabs)/profile");
        }}
      >
        <View className="items-center justify-center">
          <Settings size={16} color="#1a1a2e" />
        </View>
      </Button>
    </View>
  );
}
