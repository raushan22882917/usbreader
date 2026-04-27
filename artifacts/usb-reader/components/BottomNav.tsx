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
  label: string;
  href: string;
  color: string;
  isHome?: boolean;
}

const TABS: TabDef[] = [
  { icon: "chart-timeline-variant", label: "Monitor",  href: "/monitor",      color: C.blue   },
  { icon: "console-line",           label: "Write",    href: "/write",        color: C.green  },
  { icon: "home",                   label: "Home",     href: "/",             color: C.green, isHome: true },
  { icon: "stethoscope",            label: "Diag",     href: "/diagnostics",  color: C.orange },
  { icon: "cog-outline",            label: "Settings", href: "/settings",     color: C.muted  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { connectionStatus, packets } = useUsb();
  const isConnected = connectionStatus === "connected";
  const rxCount = packets.filter((p) => p.direction === "read").length;

  return (
    <View style={s.bar}>
      {TABS.map((tab) => {
        const isActive =
          tab.isHome
            ? pathname === "/" || pathname === ""
            : pathname === tab.href;

        return (
          <Link key={tab.href} href={tab.href as any} style={s.tabLink}>
            <View
              style={[
                s.tab,
                {
                  backgroundColor: isActive ? `${tab.color}18` : "transparent",
                  borderColor:     isActive ? `${tab.color}50` : C.border,
                },
              ]}
            >
              <View style={s.iconWrap}>
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={17}
                  color={isActive ? tab.color : C.muted}
                />
                {/* RX packet badge on Monitor */}
                {tab.href === "/monitor" && rxCount > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeTxt}>{rxCount > 99 ? "99+" : rxCount}</Text>
                  </View>
                )}
                {/* USB live dot on Home */}
                {tab.isHome && (
                  <View style={[s.usbDot, { backgroundColor: isConnected ? C.green : C.dim }]} />
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
    height: 60,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 5,
    paddingVertical: 5,
    gap: 3,
  },
  tabLink: {
    flex: 1,
    textDecorationLine: "none",
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
  iconWrap: { position: "relative" },
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
  badgeTxt: { color: "#fff", fontSize: 7, fontWeight: "800" },
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
  label: { fontSize: 8, fontWeight: "700", letterSpacing: 0.2 },
});
