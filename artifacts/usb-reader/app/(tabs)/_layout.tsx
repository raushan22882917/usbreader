import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

const C = {
  bg:      "rgba(18,22,24,1)",
  active:  "#6EDCA1",
  inactive: "rgba(120,122,122,1)",
  border:  "rgba(51,56,58,1)",
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.active,
        tabBarInactiveTintColor: C.inactive,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: C.bg,
          borderTopWidth: 1,
          borderTopColor: C.border,
          elevation: 0,
          height: Platform.OS === "ios" ? 72 : Platform.OS === "web" ? 54 : 56,
          paddingBottom: Platform.OS === "ios" ? 14 : 6,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontFamily: "Inter_600SemiBold",
          letterSpacing: 0.5,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          title: "Monitor",
          tabBarIcon: ({ color, size }) => <Feather name="activity" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: "Write",
          tabBarIcon: ({ color, size }) => <Feather name="terminal" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="decoder"
        options={{
          title: "Decoder",
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Feather name="settings" size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}
