import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { UsbDevice } from "@/context/UsbContext";

interface DeviceCardProps {
  device: UsbDevice;
  isSelected: boolean;
  isConnecting: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function DeviceCard({
  device,
  isSelected,
  isConnecting,
  onSelect,
  onConnect,
  onDisconnect,
}: DeviceCardProps) {
  const colors = useColors();

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect();
  }

  function handleConnect() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (device.connected) {
      onDisconnect();
    } else {
      onConnect();
    }
  }

  const platformIcon =
    device.platform === "ios"
      ? "smartphone"
      : device.platform === "web"
      ? "globe"
      : "tablet";

  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isSelected ? colors.primary : colors.border,
          borderRadius: colors.radius,
        },
      ]}
      onPress={handlePress}
      android_ripple={{ color: colors.muted }}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: device.connected
                ? colors.accent
                : colors.secondary,
              borderRadius: colors.radius - 4,
            },
          ]}
        >
          <Feather
            name="cpu"
            size={22}
            color={device.connected ? colors.primary : colors.mutedForeground}
          />
        </View>

        <View style={styles.info}>
          <Text
            style={[styles.name, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {device.name}
          </Text>
          {device.manufacturerName ? (
            <Text
              style={[styles.manufacturer, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {device.manufacturerName}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Feather
              name={platformIcon}
              size={11}
              color={colors.mutedForeground}
            />
            {device.vendorId != null ? (
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {" "}
                VID:{device.vendorId.toString(16).toUpperCase().padStart(4, "0")}{" "}
                PID:{device.productId?.toString(16).toUpperCase().padStart(4, "0")}
              </Text>
            ) : null}
          </View>
        </View>

        <Pressable
          style={[
            styles.connectBtn,
            {
              backgroundColor: device.connected
                ? colors.destructive
                : colors.primary,
              borderRadius: colors.radius - 4,
              opacity: isConnecting ? 0.6 : 1,
            },
          ]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting && isSelected ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather
              name={device.connected ? "x" : "zap"}
              size={16}
              color="#fff"
            />
          )}
        </Pressable>
      </View>

      {device.connected && (
        <View
          style={[
            styles.connectedBadge,
            { backgroundColor: colors.success + "22" },
          ]}
        >
          <View
            style={[styles.dot, { backgroundColor: colors.success }]}
          />
          <Text style={[styles.connectedText, { color: colors.success }]}>
            Connected
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  manufacturer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  meta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  connectBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectedText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
