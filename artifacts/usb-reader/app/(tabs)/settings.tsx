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
import { useUsb } from "@/context/UsbContext";
import { GlobalStatusBar } from "@/components/StatusBar";
import { ArcGauge } from "@/components/SvgGauges";

const C = {
  bg: "rgba(21,25,27,1)",
  card: "rgba(28,32,34,1)",
  row: "rgba(35,39,41,1)",
  border: "rgba(51,56,58,1)",
  text: "rgba(220,221,221,1)",
  muted: "rgba(120,122,122,1)",
  mid: "rgba(160,162,162,1)",
  green: "#6EDCA1",
  yellow: "#FFC832",
  red: "#FF503C",
  blue: "#50B4FF",
};

function InfoRow({
  icon,
  label,
  value,
  destructive,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value?: string;
  destructive?: boolean;
  color?: string;
  onPress?: () => void;
}) {
  const accent = destructive ? C.red : (color ?? C.blue);
  return (
    <Pressable
      style={[styles.infoRow, { borderBottomColor: C.border }]}
      onPress={onPress}
      android_ripple={{ color: "rgba(51,56,58,0.5)" }}
    >
      <View style={[styles.infoIcon, { backgroundColor: `${accent}18` }]}>
        <Feather name={icon} size={14} color={accent} />
      </View>
      <Text style={[styles.infoLabel, { color: destructive ? C.red : C.text }]}>{label}</Text>
      {value ? (
        <Text style={styles.infoValue}>{value}</Text>
      ) : onPress ? (
        <Feather name="chevron-right" size={13} color={C.muted} />
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { selectedDevice, connectionStatus, disconnectDevice, clearPackets, packets } = useUsb();

  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const bottomPad = Platform.OS === "web" ? 54 : insets.bottom + 60;
  const isConnected = connectionStatus === "connected";

  const rxCount = packets.filter((p) => p.direction === "read").length;
  const txCount = packets.filter((p) => p.direction === "write").length;
  const totalBytes = packets.reduce((s, p) => s + p.byteLength, 0);

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <GlobalStatusBar />

      <View style={styles.body}>
        {/* ── LEFT PANEL ── */}
        <View style={styles.leftPane}>
          {/* Connection status */}
          <View style={[
            styles.connCard,
            {
              backgroundColor: isConnected ? "rgba(110,220,161,0.08)" : C.card,
              borderColor: isConnected ? "rgba(110,220,161,0.4)" : C.border,
            },
          ]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View style={[styles.connDot, { backgroundColor: isConnected ? C.green : C.muted }]} />
              <Text style={[styles.connStatus, { color: isConnected ? C.green : C.muted }]}>
                {isConnected ? "CONNECTED" : "DISCONNECTED"}
              </Text>
            </View>
            {selectedDevice && (
              <Text style={styles.connDevName} numberOfLines={2}>{selectedDevice.name}</Text>
            )}
          </View>

          {/* Gauges */}
          <View style={styles.gaugesRow}>
            <ArcGauge value={rxCount} max={Math.max(rxCount + 1, 20)} size={80} color={C.blue} label="RX" />
            <ArcGauge value={txCount} max={Math.max(txCount + 1, 20)} size={80} color={C.green} label="TX" />
          </View>

          {/* Mini stats */}
          <View style={styles.miniStats}>
            {[
              { icon: "database" as const, label: "Total Packets", value: packets.length, color: C.yellow },
              { icon: "arrow-down-circle" as const, label: "Bytes RX", value: rxCount, color: C.blue },
              { icon: "arrow-up-circle" as const, label: "Bytes TX", value: txCount, color: C.green },
              { icon: "hard-drive" as const, label: "Total Bytes", value: totalBytes, color: C.muted },
            ].map(({ icon, label, value, color }) => (
              <View key={label} style={[styles.miniStat, { borderColor: C.border }]}>
                <Feather name={icon} size={12} color={color} />
                <Text style={[styles.miniStatVal, { color }]}>{value}</Text>
                <Text style={styles.miniStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── RIGHT PANEL ── */}
        <ScrollView
          style={styles.rightPane}
          contentContainerStyle={[styles.rightContent, { paddingBottom: bottomPad + 10 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Device section */}
          {selectedDevice && (
            <>
              <Text style={styles.section}>DEVICE</Text>
              <View style={[styles.card, { borderColor: C.border }]}>
                <InfoRow icon="cpu" label="Name" value={selectedDevice.name} color={C.blue} />
                {selectedDevice.manufacturerName && (
                  <InfoRow icon="briefcase" label="Manufacturer" value={selectedDevice.manufacturerName} color={C.blue} />
                )}
                <InfoRow
                  icon="hash"
                  label="Vendor ID"
                  value={selectedDevice.vendorId != null ? `0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4, "0")}` : "—"}
                  color={C.blue}
                />
                <InfoRow
                  icon="hash"
                  label="Product ID"
                  value={selectedDevice.productId != null ? `0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4, "0")}` : "—"}
                  color={C.blue}
                />
                {selectedDevice.serialNumber && (
                  <InfoRow icon="tag" label="Serial" value={selectedDevice.serialNumber} color={C.blue} />
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

          {/* Data */}
          <Text style={styles.section}>DATA</Text>
          <View style={[styles.card, { borderColor: C.border }]}>
            <InfoRow icon="database" label="Stored Packets" value={packets.length.toString()} color={C.yellow} />
            <InfoRow icon="bar-chart-2" label="Total Bytes" value={totalBytes.toString()} color={C.blue} />
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

          {/* Platform */}
          <Text style={styles.section}>PLATFORM</Text>
          <View style={[styles.card, { borderColor: C.border }]}>
            <InfoRow
              icon="smartphone"
              label="Platform"
              value={Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}
              color={C.green}
            />
            <InfoRow
              icon="shield"
              label="USB Protocol"
              value={Platform.OS === "web" ? "WebUSB API" : Platform.OS === "android" ? "USB OTG" : "MFi Accessory"}
              color={C.green}
            />
            <InfoRow icon="info" label="App Version" value="1.0.0" color={C.muted} />
          </View>

          {/* Info box */}
          <View style={[styles.infoBox, { borderColor: "rgba(80,180,255,0.3)" }]}>
            <Feather name="terminal" size={16} color={C.blue} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.infoBoxTitle}>
                {Platform.OS === "android" ? "Android USB OTG"
                  : Platform.OS === "ios" ? "iOS MFi Protocol"
                  : "WebUSB API"}
              </Text>
              <Text style={styles.infoBoxBody}>
                {Platform.OS === "android"
                  ? "Full USB OTG support. Connect USB serial devices (Arduino, ESP32, FTDI, CP210x) via USB-C or micro-USB OTG adapter. The app will auto-detect the device."
                  : Platform.OS === "ios"
                  ? "iOS requires MFi-certified accessories. Standard USB serial adapters are not supported without an Apple-approved hardware bridge."
                  : "WebUSB requires Chrome or Edge on desktop. The browser will prompt for device access. HTTPS is required in production. Compatible with most USB serial adapters."}
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, flexDirection: "row" },

  // Left pane
  leftPane: {
    width: 200,
    backgroundColor: "rgba(18,22,24,1)",
    borderRightWidth: 1,
    borderRightColor: C.border,
    padding: 12,
    gap: 12,
  },
  connCard: { borderRadius: 8, borderWidth: 1, padding: 12, gap: 6 },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  connStatus: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  connDevName: { color: C.text, fontSize: 12, fontFamily: "Inter_600SemiBold", lineHeight: 17 },
  gaugesRow: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  miniStats: { gap: 6 },
  miniStat: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 7, borderWidth: 1, padding: 8 },
  miniStatVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  miniStatLabel: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 },

  // Right pane
  rightPane: { flex: 1 },
  rightContent: { paddingHorizontal: 16, gap: 0 },
  section: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  card: { borderRadius: 8, borderWidth: 1, overflow: "hidden", marginBottom: 4 },

  // Info row
  infoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12, borderBottomWidth: 1 },
  infoIcon: { width: 30, height: 30, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  infoLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  infoValue: { color: C.muted, fontSize: 12, fontFamily: "Inter_400Regular" },

  // Info box
  infoBox: { flexDirection: "row", gap: 12, padding: 14, marginTop: 18, borderRadius: 8, borderWidth: 1, backgroundColor: "rgba(80,180,255,0.05)" },
  infoBoxTitle: { color: C.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  infoBoxBody: { color: C.muted, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
