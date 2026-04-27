import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, usePathname } from "expo-router";
import { useUsb } from "@/context/UsbContext";

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const C = {
  panel:  "rgba(26,30,32,1)",
  border: "rgba(51,56,58,1)",
  muted:  "rgba(120,122,122,1)",
  dim:    "rgba(45,48,50,1)",
  green:  "#6EDCA1",
  yellow: "#FFC832",
  red:    "#FF503C",
  blue:   "#50B4FF",
  orange: "#FF9811",
};

interface TabDef {
  icon: MCIcon;
  activeIcon: MCIcon;
  label: string;
  href: string;
  color: string;
  isHome?: boolean;
}

const TABS: TabDef[] = [
  {
    icon: "home-outline",
    activeIcon: "home",
    label: "Home",
    href: "/",
    color: C.green,
    isHome: true,
  },
  {
    icon: "water-outline",
    activeIcon: "water",
    label: "Hydraulic",
    href: "/diagnostics",
    color: C.orange,
  },
  {
    icon: "code-braces",
    activeIcon: "code-braces",
    label: "Decoder",
    href: "/decoder",
    color: C.blue,
  },
  {
    icon: "cog-outline",
    activeIcon: "cog",
    label: "Settings",
    href: "/settings",
    color: C.muted,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { connectionStatus } = useUsb();
  const isConnected = connectionStatus === "connected";

  return (
    <View style={s.bar}>
      {TABS.map((tab) => {
        const isActive = tab.isHome
          ? pathname === "/" || pathname === ""
          : pathname === tab.href;

        return (
          <Link key={tab.href} href={tab.href as any} style={s.tabLink}>
            <View
              style={[
                s.tab,
                isActive && {
                  backgroundColor: `${tab.color}18`,
                  borderColor:     `${tab.color}55`,
                },
              ]}
            >
              {/* USB live dot anchored to Home icon */}
              <View style={s.iconWrap}>
                <MaterialCommunityIcons
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={20}
                  color={isActive ? tab.color : C.muted}
                />
                {tab.isHome && (
                  <View
                    style={[
                      s.liveDot,
                      { backgroundColor: isConnected ? C.green : "rgba(50,53,55,1)" },
                    ]}
                  />
                )}
              </View>
              <Text style={[s.label, { color: isActive ? tab.color : C.muted }]}>
                {tab.label}
              </Text>
            </View>
          </Link>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: 64,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  tabLink: {
    flex: 1,
    textDecorationLine: "none",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 3,
    paddingVertical: 5,
  },
  iconWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  liveDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.panel,
  },
  label: { fontSize: 9, fontWeight: "700", letterSpacing: 0.2 },
});
