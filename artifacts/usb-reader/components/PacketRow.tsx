import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  LayoutAnimation,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { DataPacket } from "@/context/UsbContext";

interface PacketRowProps {
  packet: DataPacket;
  viewMode: "text" | "hex" | "ascii";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour12: false });
}

function toAscii(hex: string): string {
  return hex
    .split(" ")
    .map((h) => {
      const code = parseInt(h, 16);
      if (code >= 32 && code < 127) return String.fromCharCode(code);
      return ".";
    })
    .join("");
}

export function PacketRow({ packet, viewMode }: PacketRowProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const isRead = packet.direction === "read";
  const accentColor = isRead ? colors.primary : colors.success;

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }

  const displayData =
    viewMode === "hex"
      ? packet.hexView
      : viewMode === "ascii"
      ? toAscii(packet.hexView)
      : packet.data;

  return (
    <Pressable
      style={[
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius - 4,
          borderLeftColor: accentColor,
        },
      ]}
      onPress={toggle}
    >
      <View style={styles.header}>
        <View style={styles.left}>
          <Feather
            name={isRead ? "arrow-down-circle" : "arrow-up-circle"}
            size={15}
            color={accentColor}
          />
          <Text style={[styles.direction, { color: accentColor }]}>
            {isRead ? "RX" : "TX"}
          </Text>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>
            {formatTime(packet.timestamp)}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.bytes, { color: colors.mutedForeground }]}>
            {packet.byteLength}B
          </Text>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.mutedForeground}
          />
        </View>
      </View>

      {!expanded && (
        <Text
          style={[styles.preview, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {displayData}
        </Text>
      )}

      {expanded && (
        <View
          style={[
            styles.expandedBox,
            {
              backgroundColor: colors.muted,
              borderRadius: colors.radius - 6,
            },
          ]}
        >
          <Text
            style={[
              styles.fullData,
              {
                color: colors.foreground,
                fontFamily: viewMode === "hex" ? "Inter_400Regular" : undefined,
              },
            ]}
            selectable
          >
            {displayData}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  direction: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  bytes: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  preview: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  expandedBox: {
    padding: 10,
    marginTop: 4,
  },
  fullData: {
    fontSize: 12,
    lineHeight: 18,
  },
});
