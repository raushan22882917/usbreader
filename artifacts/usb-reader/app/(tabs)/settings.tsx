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

interface RowProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value?: string;
  chevron?: boolean;
  destructive?: boolean;
  onPress?: () => void;
}

function SettingsRow({ icon, label, value, chevron, destructive, onPress }: RowProps) {
  const colors = useColors();
  const color = destructive ? colors.destructive : colors.foreground;
  return (
    <Pressable
      style={[styles.settingsRow, { borderColor: colors.border }]}
      onPress={onPress}
      android_ripple={{ color: colors.muted }}
    >
      <Feather name={icon} size={18} color={destructive ? colors.destructive : colors.primary} />
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
          {value}
        </Text>
      ) : null}
      {chevron && (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedDevice, connectionStatus, disconnectDevice, clearPackets, packets } =
    useUsb();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.navBackground,
            paddingTop: topPadding + 12,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: "#fff" }]}>Settings</Text>
        <Text
          style={[styles.headerSub, { color: "rgba(255,255,255,0.6)" }]}
        >
          App & device configuration
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 90,
          },
        ]}
      >
        {selectedDevice && (
          <>
            <Text
              style={[styles.sectionLabel, { color: colors.mutedForeground }]}
            >
              CONNECTED DEVICE
            </Text>
            <View
              style={[
                styles.section,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <SettingsRow
                icon="cpu"
                label="Device Name"
                value={selectedDevice.name}
              />
              {selectedDevice.manufacturerName ? (
                <SettingsRow
                  icon="briefcase"
                  label="Manufacturer"
                  value={selectedDevice.manufacturerName}
                />
              ) : null}
              {selectedDevice.vendorId != null ? (
                <SettingsRow
                  icon="hash"
                  label="Vendor ID"
                  value={`0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4, "0")}`}
                />
              ) : null}
              {selectedDevice.productId != null ? (
                <SettingsRow
                  icon="hash"
                  label="Product ID"
                  value={`0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4, "0")}`}
                />
              ) : null}
              {selectedDevice.serialNumber ? (
                <SettingsRow
                  icon="tag"
                  label="Serial Number"
                  value={selectedDevice.serialNumber}
                />
              ) : null}
              <SettingsRow
                icon="wifi-off"
                label="Disconnect"
                destructive
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  disconnectDevice();
                }}
              />
            </View>
          </>
        )}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
          DATA
        </Text>
        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <SettingsRow
            icon="database"
            label="Stored Packets"
            value={`${packets.length}`}
          />
          <SettingsRow
            icon="trash-2"
            label="Clear All Packets"
            destructive
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              clearPackets();
            }}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
          PLATFORM
        </Text>
        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <SettingsRow
            icon="smartphone"
            label="Platform"
            value={Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}
          />
          <SettingsRow
            icon="shield"
            label="USB Protocol"
            value={Platform.OS === "web" ? "WebUSB" : Platform.OS === "android" ? "USB OTG" : "MFi"}
          />
          <SettingsRow
            icon="info"
            label="App Version"
            value="1.0.0"
          />
        </View>

        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
              marginTop: 24,
            },
          ]}
        >
          <Feather name="info" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>
              Platform Notes
            </Text>
            <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
              {Platform.OS === "android"
                ? "Android supports USB OTG for full read/write access to USB serial devices. Enable USB debugging if needed."
                : Platform.OS === "ios"
                ? "iOS requires MFi-certified accessories for USB communication. Standard USB devices may not work without a licensed accessory."
                : "WebUSB requires Chrome or Edge. HTTPS is required in production. The browser will prompt for device permission on first connect."}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  section: {
    borderWidth: 1,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 1,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  rowValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  infoBox: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  infoBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
