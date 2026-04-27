import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface StatusBarProps {
  status: "idle" | "connected" | "disconnected" | "error";
  deviceName?: string;
  packetCount: number;
}

export function UsbStatusBar({ status, deviceName, packetCount }: StatusBarProps) {
  const colors = useColors();

  const config = {
    idle: {
      icon: "wifi-off" as const,
      label: "No device connected",
      bg: colors.muted,
      fg: colors.mutedForeground,
    },
    connected: {
      icon: "zap" as const,
      label: `Connected: ${deviceName ?? "Unknown"}`,
      bg: colors.success + "22",
      fg: colors.success,
    },
    disconnected: {
      icon: "wifi-off" as const,
      label: "Device disconnected",
      bg: colors.warning + "22",
      fg: colors.warning,
    },
    error: {
      icon: "alert-triangle" as const,
      label: "Connection error",
      bg: colors.destructive + "22",
      fg: colors.destructive,
    },
  }[status];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: config.bg, borderRadius: colors.radius - 4 },
      ]}
    >
      <Feather name={config.icon} size={14} color={config.fg} />
      <Text style={[styles.label, { color: config.fg }]}>{config.label}</Text>
      {status === "connected" && (
        <View style={styles.badge}>
          <Text style={[styles.badgeText, { color: config.fg }]}>
            {packetCount} packets
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 14,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
