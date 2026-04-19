import { useEffect, useRef, useCallback } from "react";
import { BackHandler, ToastAndroid, Platform } from "react-native";
import { Tabs, useNavigation } from "expo-router";
import { FolderOpen, User } from "lucide-react-native";

export default function TabLayout() {
  const navigation = useNavigation();
  const lastBackPress = useRef(0);

  const handleBackPress = useCallback(() => {
    if (Platform.OS !== "android") return false;

    // If the navigator can go back, let default behavior handle it
    if (navigation.canGoBack()) return false;

    // We're at the root — require double-press to exit
    const now = Date.now();
    if (now - lastBackPress.current < 2000) {
      return false; // let the app close
    }
    lastBackPress.current = now;
    ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
    return true; // prevent default (closing the app)
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
    return () => sub.remove();
  }, [handleBackPress]);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1a1a2e",
        tabBarInactiveTintColor: "#5c5c6e",
        tabBarStyle: {
          backgroundColor: "#f8f6f1",
          borderTopColor: "#c2bfb5",
          borderTopWidth: 1,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarButtonTestID: "tab-projects",
          tabBarIcon: ({ color, size }) => (
            <FolderOpen size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarButtonTestID: "tab-profile",
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
