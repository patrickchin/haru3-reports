import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#ea580c",
      }}
    >
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarLabel: "Projects",
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarLabel: "Account",
        }}
      />
    </Tabs>
  );
}
