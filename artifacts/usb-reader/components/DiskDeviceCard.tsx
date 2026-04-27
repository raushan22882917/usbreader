import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { UsbDevice } from "@/context/UsbContext";

interface DiskDeviceCardProps {
  device: UsbDevice;
  isSelected: boolean;
  onPress: () => void;
}

export function DiskDeviceCard({ device, isSelected, onPress }: DiskDeviceCardProps) {
  const colors = useColors();
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (device.connected) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      spinAnim.stopAnimation();
      pulseAnim.stopAnimation();
      spinAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [device.connected]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: isSelected ? colors.accent : colors.card,
          borderColor: isSelected ? colors.primary : colors.border,
          borderRadius: colors.radius,
        },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      {/* Disk platter graphic */}
      <View style={styles.diskArea}>
        <Animated.View
          style={[
            styles.diskOuter,
            {
              borderColor: device.connected ? colors.primary + "60" : colors.border,
              transform: [{ rotate: spin }],
            },
          ]}
        >
          <View
            style={[
              styles.diskInner,
              { borderColor: device.connected ? colors.primary + "40" : colors.muted },
            ]}
          >
            <Animated.View
              style={[
                styles.diskCore,
                {
                  backgroundColor: device.connected ? colors.primary : colors.secondary,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
          </View>
          {/* Disk tracks */}
          <View style={[styles.diskTrack, { top: 8, borderColor: device.connected ? colors.primary + "25" : colors.border + "40" }]} />
          <View style={[styles.diskTrack, { top: 14, borderColor: device.connected ? colors.primary + "15" : colors.border + "25" }]} />
        </Animated.View>

        {/* Read arm */}
        <View
          style={[
            styles.arm,
            { backgroundColor: device.connected ? colors.primary : colors.mutedForeground },
          ]}
        />
        <View
          style={[
            styles.armHead,
            { backgroundColor: device.connected ? colors.primary : colors.mutedForeground },
          ]}
        />
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {device.name}
          </Text>
          {device.connected && (
            <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          )}
        </View>
        {device.manufacturerName ? (
          <Text style={[styles.mfr, { color: colors.mutedForeground }]} numberOfLines={1}>
            {device.manufacturerName}
          </Text>
        ) : null}
        <View style={styles.idRow}>
          <Text style={[styles.idText, { color: colors.mutedForeground }]}>
            {device.vendorId != null
              ? `VID ${device.vendorId.toString(16).toUpperCase().padStart(4, "0")}`
              : "—"}
          </Text>
          <Text style={[styles.idSep, { color: colors.border }]}>·</Text>
          <Text style={[styles.idText, { color: colors.mutedForeground }]}>
            {device.productId != null
              ? `PID ${device.productId.toString(16).toUpperCase().padStart(4, "0")}`
              : "—"}
          </Text>
        </View>

        {/* Status bar */}
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: device.connected
                ? colors.success + "22"
                : isSelected
                ? colors.primary + "22"
                : colors.muted,
              borderRadius: 4,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: device.connected
                  ? colors.success
                  : isSelected
                  ? colors.primary
                  : colors.mutedForeground,
              },
            ]}
          >
            {device.connected ? "ACTIVE" : isSelected ? "SELECTED" : "IDLE"}
          </Text>
        </View>
      </View>

      {/* Slot detail */}
      <View style={[styles.slot, { backgroundColor: colors.muted }]}>
        <View style={[styles.slotLine, { backgroundColor: colors.border }]} />
        <View style={[styles.slotLine, { backgroundColor: colors.border }]} />
        <View style={[styles.slotLine, { backgroundColor: colors.border }]} />
        <Feather
          name="cpu"
          size={16}
          color={device.connected ? colors.primary : colors.mutedForeground}
        />
        <View style={[styles.slotLine, { backgroundColor: colors.border }]} />
        <View style={[styles.slotLine, { backgroundColor: colors.border }]} />
        <View style={[styles.slotLine, { backgroundColor: colors.border }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    gap: 12,
  },
  diskArea: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  diskOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  diskTrack: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: 4,
    top: 4,
    borderRadius: 100,
    borderWidth: 1,
  },
  diskInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  diskCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  arm: {
    position: "absolute",
    right: -2,
    top: 12,
    width: 22,
    height: 2,
    borderRadius: 1,
    transformOrigin: "right center",
    transform: [{ rotate: "-30deg" }],
  },
  armHead: {
    position: "absolute",
    right: -2,
    top: 9,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  mfr: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  idText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  idSep: {
    fontSize: 10,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  statusText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  slot: {
    width: 28,
    height: 64,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  slotLine: {
    width: 14,
    height: 1.5,
    borderRadius: 1,
  },
});
