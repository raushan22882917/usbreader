import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, usePathname } from "expo-router";
import { useUsb } from "@/context/UsbContext";

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const C = {
  bg:     "rgba(21,25,27,1)",
  panel:  "rgba(26,30,32,1)",
  border: "rgba(51,56,58,1)",
  muted:  "rgba(120,122,122,1)",
  dim:    "rgba(50,52,52,1)",
  green:  "#6EDCA1",
  yellow: "#FFC832",
  red:    "#FF503C",
  blue:   "#50B4FF",
  orange: "#FF9811",
};

interface TabItem {
  icon: MCIcon;
  label: string;
  route: string;
  color: string;
}

const TABS: TabItem[] = [
  { icon: "chart-timeline-variant", label: "Monitor",  route: "/(tabs)/monitor",  color: C.blue },
  { icon: "console-line",           label: "Write",    route: "/(tabs)/write",    color: C.green },
  { icon: "home",                   label: "Home",     route: "/(tabs)/index",    color: C.green },
  { icon: "file-code-outline",      label: "Decoder",  route: "/(tabs)/decoder",  color: C.yellow },
  { icon: "cog-outline",            label: "Settings", route: "/(tabs)/settings", color: C.muted },
];

export function BottomNav() {
  const pathname = usePathname();
  const { connectionStatus, packets } = useUsb();
  const isConnected = connectionStatus === "connected";
  const rxCount = packets.filter((p) => p.direction === "read").length;

  return (
    <View style={s.bar}>
      {TABS.map((tab) => {
        const isActive = pathname === tab.route || (tab.route === "/(tabs)/index" && pathname === "/");
        const isHome = tab.route === "/(tabs)/index";

        return (
          <Pressable
            key={tab.route}
            style={[
              s.tab,
              {
                backgroundColor: isActive
                  ? isHome
                    ? "rgba(110,220,161,0.12)"
                    : `${tab.color}10`
                  : "transparent",
                borderColor: isActive ? `${tab.color}45` : C.border,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(tab.route as any);
            }}
          >
            <View style={s.iconWrap}>
              <MaterialCommunityIcons
                name={tab.icon}
                size={18}
                color={isActive ? tab.color : C.muted}
              />
              {/* Badge for monitor tab — shows packet count */}
              {tab.route === "/(tabs)/monitor" && rxCount > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>{rxCount > 99 ? "99+" : rxCount}</Text>
                </View>
              )}
              {/* USB dot for home */}
              {isHome && (
                <View style={[s.usbDot, { backgroundColor: isConnected ? C.green : C.dim }]} />
              )}
            </View>
            <Text style={[s.label, { color: isActive ? tab.color : C.muted }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: 58,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    paddingVertical: 4,
  },
  iconWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -8,
    backgroundColor: C.blue,
    borderRadius: 7,
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 14,
    alignItems: "center",
  },
  badgeTxt: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "800",
  },
  usbDot: {
    position: "absolute",
    top: -3,
    right: -5,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: C.panel,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
