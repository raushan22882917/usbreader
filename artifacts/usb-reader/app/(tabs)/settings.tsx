import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useUsb } from "@/context/UsbContext";

function InfoRow({
  icon,
  label,
  value,
  destructive,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={[styles.infoRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      android_ripple={{ color: colors.muted }}
    >
      <View
        style={[
          styles.infoIcon,
          { backgroundColor: (destructive ? colors.destructive : colors.primary) + "22", borderRadius: 7 },
        ]}
      >
        <Feather name={icon} size={14} color={destructive ? colors.destructive : colors.primary} />
      </View>
      <Text style={[styles.infoLabel, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.infoValue, { color: colors.mutedForeground }]}>{value}</Text>
      ) : null}
      {onPress && !value && (
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedDevice, connectionStatus, disconnectDevice, clearPackets, packets } = useUsb();

  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 60;
  const isConnected = connectionStatus === "connected";

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingLeft: leftPad, paddingRight: rightPad },
      ]}
    >
      {/* ── LEFT PANEL ── */}
      <View
        style={[
          styles.leftPane,
          { backgroundColor: colors.navBackground, borderRightColor: colors.border },
        ]}
      >
        <View style={[styles.paneHeader, { paddingTop: topPad + 8 }]}>
          <View style={[styles.paneIconWrap, { backgroundColor: colors.primary + "22", borderRadius: 8 }]}>
            <Feather name="settings" size={16} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.paneName, { color: colors.foreground }]}>Settings</Text>
            <Text style={[styles.paneSub, { color: colors.mutedForeground }]}>Configuration</Text>
          </View>
        </View>

        {/* Connection summary card */}
        <View
          style={[
            styles.connCard,
            {
              backgroundColor: isConnected ? colors.success + "18" : colors.card,
              borderColor: isConnected ? colors.success + "44" : colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.connCardRow}>
            <View
              style={[
                styles.connDot,
                { backgroundColor: isConnected ? colors.success : colors.mutedForeground },
              ]}
            />
            <Text style={[styles.connStatus, { color: isConnected ? colors.success : colors.mutedForeground }]}>
              {isConnected ? "CONNECTED" : "DISCONNECTED"}
            </Text>
          </View>
          {selectedDevice && (
            <Text style={[styles.connDeviceName, { color: colors.foreground }]} numberOfLines={2}>
              {selectedDevice.name}
            </Text>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsList}>
          {[
            { label: "Total Packets", value: packets.length.toString(), icon: "database" as const },
            { label: "RX", value: packets.filter((p) => p.direction === "read").length.toString(), icon: "arrow-down-circle" as const },
            { label: "TX", value: packets.filter((p) => p.direction === "write").length.toString(), icon: "arrow-up-circle" as const },
          ].map(({ label, value, icon }) => (
            <View
              key={label}
              style={[
                styles.miniStat,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 2 },
              ]}
            >
              <Feather name={icon} size={13} color={colors.primary} />
              <View>
                <Text style={[styles.miniStatValue, { color: colors.foreground }]}>{value}</Text>
                <Text style={[styles.miniStatLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ── RIGHT PANEL ── */}
      <ScrollView
        style={styles.rightPane}
        contentContainerStyle={[styles.rightContent, { paddingTop: topPad, paddingBottom: bottomPad + 10 }]}
        showsVerticalScrollIndicator={false}
      >
        {selectedDevice && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DEVICE</Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <InfoRow icon="cpu" label="Name" value={selectedDevice.name} />
              {selectedDevice.manufacturerName && (
                <InfoRow icon="briefcase" label="Manufacturer" value={selectedDevice.manufacturerName} />
              )}
              {selectedDevice.vendorId != null && (
                <InfoRow
                  icon="hash"
                  label="Vendor ID"
                  value={`0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4, "0")}`}
                />
              )}
              {selectedDevice.productId != null && (
                <InfoRow
                  icon="hash"
                  label="Product ID"
                  value={`0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4, "0")}`}
                />
              )}
              {selectedDevice.serialNumber && (
                <InfoRow icon="tag" label="Serial Number" value={selectedDevice.serialNumber} />
              )}
              <InfoRow
                icon="wifi-off"
                label="Disconnect Device"
                destructive
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  disconnectDevice();
                }}
              />
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DATA MANAGEMENT</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <InfoRow icon="database" label="Stored Packets" value={packets.length.toString()} />
          <InfoRow
            icon="trash-2"
            label="Clear All Packets"
            destructive
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              clearPackets();
            }}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PLATFORM</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <InfoRow
            icon="smartphone"
            label="Platform"
            value={Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}
          />
          <InfoRow
            icon="shield"
            label="USB Protocol"
            value={Platform.OS === "web" ? "WebUSB" : Platform.OS === "android" ? "USB OTG" : "MFi"}
          />
          <InfoRow icon="info" label="App Version" value="1.0.0" />
        </View>

        {/* Platform info box */}
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: colors.accent + "33",
              borderColor: colors.primary + "44",
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="terminal" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoBoxTitle, { color: colors.foreground }]}>
              {Platform.OS === "android"
                ? "Android USB OTG"
                : Platform.OS === "ios"
                ? "iOS MFi Protocol"
                : "WebUSB API"}
            </Text>
            <Text style={[styles.infoBoxBody, { color: colors.mutedForeground }]}>
              {Platform.OS === "android"
                ? "Full USB OTG support. Connect USB serial devices (Arduino, ESP32, FTDI, etc.) via USB-C or micro-USB OTG adapter."
                : Platform.OS === "ios"
                ? "iOS requires MFi-certified accessories. Standard serial adapters are not supported without an approved accessory."
                : "WebUSB requires Chrome or Edge browser. The browser will prompt for device access permission. HTTPS required in production."}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  leftPane: {
    width: 220,
    borderRightWidth: 1,
    padding: 12,
    gap: 12,
  },
  paneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paneIconWrap: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  paneName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  paneSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  connCard: {
    padding: 12,
    borderWidth: 1,
    gap: 6,
  },
  connCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connStatus: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  connDeviceName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  statsList: {
    gap: 6,
  },
  miniStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  miniStatValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  miniStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  rightPane: {
    flex: 1,
  },
  rightContent: {
    paddingHorizontal: 20,
    gap: 0,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  infoIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  infoValue: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  infoBox: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    marginTop: 18,
    borderWidth: 1,
  },
  infoBoxTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  infoBoxBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
