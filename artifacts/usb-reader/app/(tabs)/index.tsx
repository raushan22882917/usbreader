import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useUsb, UsbDevice } from "@/context/UsbContext";
import { GlobalStatusBar } from "@/components/StatusBar";
import { DiskPlatterSvg, ArcGauge, HBar } from "@/components/SvgGauges";

const C = {
  bg: "rgba(21,25,27,1)",
  card: "rgba(28,32,34,1)",
  border: "rgba(51,56,58,1)",
  text: "rgba(220,221,221,1)",
  muted: "rgba(120,122,122,1)",
  mid: "rgba(160,162,162,1)",
  green: "#6EDCA1",
  yellow: "#FFC832",
  red: "#FF503C",
  blue: "#50B4FF",
  primary: "#3b82f6",
};

function DeviceListCard({
  device,
  isSelected,
  onPress,
}: {
  device: UsbDevice;
  isSelected: boolean;
  onPress: () => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (device.connected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [device.connected]);

  return (
    <Pressable
      style={[
        styles.listCard,
        {
          backgroundColor: isSelected
            ? device.connected ? "rgba(110,220,161,0.08)" : "rgba(59,130,246,0.1)"
            : C.card,
          borderColor: isSelected
            ? device.connected ? "rgba(110,220,161,0.45)" : "rgba(59,130,246,0.45)"
            : C.border,
        },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={styles.listCardLeft}>
        <View style={[styles.diskDot, { backgroundColor: device.connected ? C.green : C.border }]}>
          {device.connected && (
            <Animated.View
              style={[
                styles.diskPulse,
                { backgroundColor: C.green, opacity: pulseAnim.interpolate({ inputRange: [1, 1.6], outputRange: [0.5, 0] }), transform: [{ scale: pulseAnim }] },
              ]}
            />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.listCardName} numberOfLines={1}>{device.name}</Text>
          <Text style={styles.listCardMfr} numberOfLines={1}>
            {device.manufacturerName ?? `VID ${device.vendorId?.toString(16).toUpperCase().padStart(4, "0")}`}
          </Text>
        </View>
      </View>
      <View style={[styles.listCardStatus, {
        backgroundColor: device.connected ? "rgba(110,220,161,0.15)" : "rgba(51,56,58,0.5)",
        borderRadius: 4,
      }]}>
        <Text style={[styles.listCardStatusTxt, { color: device.connected ? C.green : C.muted }]}>
          {device.connected ? "LIVE" : "OFF"}
        </Text>
      </View>
    </Pressable>
  );
}

function StatCard({ label, value, color, bar }: { label: string; value: string; color: string; bar?: number }) {
  return (
    <View style={[styles.statCard, { borderColor: C.border }]}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {bar !== undefined && (
        <View style={{ marginTop: 6 }}>
          <HBar pct={bar} color={color} width={90} height={5} />
        </View>
      )}
    </View>
  );
}

export default function DevicesScreen() {
  const insets = useSafeAreaInsets();
  const {
    devices, selectedDevice, connectionStatus,
    isScanning, isConnecting, lastError, packets,
    scanForDevices, connectDevice, disconnectDevice, selectDevice,
  } = useUsb();

  const [diskRot, setDiskRot] = useState(0);
  const isConnected = connectionStatus === "connected";
  const bottomPad = Platform.OS === "web" ? 54 : insets.bottom + 60;
  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;

  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");
  const totalBytes = packets.reduce((s, p) => s + p.byteLength, 0);
  const activityPct = Math.min(packets.length / 50, 1);

  useEffect(() => {
    if (!isConnected) return;
    const t = setInterval(() => setDiskRot((r) => (r + 6) % 360), 50);
    return () => clearInterval(t);
  }, [isConnected]);

  const diskSize = 160;

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <GlobalStatusBar />

      <View style={styles.body}>
        {/* ── LEFT SIDEBAR ── */}
        <View style={styles.sidebar}>
          {/* Header */}
          <View style={styles.sideHead}>
            <View style={styles.logoRow}>
              <View style={[styles.logoBox, { backgroundColor: C.primary }]}>
                <Feather name="hard-drive" size={12} color="#fff" />
              </View>
              <Text style={styles.logoText}>USB Manager</Text>
            </View>
            <Pressable
              style={[styles.scanBtn, { backgroundColor: isScanning ? "rgba(51,56,58,1)" : C.primary }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); scanForDevices(); }}
              disabled={isScanning}
            >
              {isScanning
                ? <ActivityIndicator size="small" color={C.primary} />
                : <Feather name="refresh-cw" size={12} color="#fff" />}
            </Pressable>
          </View>

          <Text style={styles.sideLabel}>DRIVES ({devices.length})</Text>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: bottomPad, gap: 6 }}
            showsVerticalScrollIndicator={false}
          >
            {devices.length === 0 ? (
              <View style={styles.emptyDrives}>
                <Feather name="inbox" size={22} color={C.muted} />
                <Text style={styles.emptyDrivesTxt}>Tap scan to detect devices</Text>
              </View>
            ) : (
              devices.map((d) => (
                <DeviceListCard
                  key={d.id}
                  device={d}
                  isSelected={selectedDevice?.id === d.id}
                  onPress={() => selectDevice(d)}
                />
              ))
            )}
          </ScrollView>
        </View>

        {/* ── MAIN PANEL ── */}
        <View style={[styles.main, { paddingBottom: bottomPad }]}>
          {selectedDevice ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Top row: Disk graphic + device detail */}
              <View style={styles.heroRow}>
                {/* Disk platter */}
                <View style={styles.diskWrap}>
                  <DiskPlatterSvg
                    size={diskSize}
                    active={isConnected}
                    activity={activityPct}
                    color={isConnected ? C.green : C.blue}
                    rotation={diskRot}
                  />
                  <View style={[styles.diskStatus, {
                    backgroundColor: isConnected ? "rgba(110,220,161,0.12)" : "rgba(51,56,58,0.5)",
                    borderColor: isConnected ? "rgba(110,220,161,0.4)" : C.border,
                  }]}>
                    <View style={[styles.diskStatusDot, { backgroundColor: isConnected ? C.green : C.muted }]} />
                    <Text style={[styles.diskStatusTxt, { color: isConnected ? C.green : C.muted }]}>
                      {isConnected ? "CONNECTED" : "OFFLINE"}
                    </Text>
                  </View>
                </View>

                {/* Device info */}
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{selectedDevice.name}</Text>
                  {selectedDevice.manufacturerName ? (
                    <Text style={styles.deviceMfr}>{selectedDevice.manufacturerName}</Text>
                  ) : null}

                  <View style={styles.idGrid}>
                    {[
                      { k: "VID", v: selectedDevice.vendorId != null ? `0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4, "0")}` : "—" },
                      { k: "PID", v: selectedDevice.productId != null ? `0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4, "0")}` : "—" },
                      { k: "Serial", v: selectedDevice.serialNumber ?? "—" },
                      { k: "Platform", v: selectedDevice.platform.toUpperCase() },
                    ].map(({ k, v }) => (
                      <View key={k} style={styles.idCell}>
                        <Text style={styles.idKey}>{k}</Text>
                        <Text style={styles.idVal}>{v}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Connect button */}
                  <Pressable
                    style={[
                      styles.connectBtn,
                      { backgroundColor: isConnected ? "rgba(255,80,60,0.12)" : "rgba(110,220,161,0.12)", borderColor: isConnected ? "rgba(255,80,60,0.5)" : "rgba(110,220,161,0.5)" },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      isConnected ? disconnectDevice() : connectDevice(selectedDevice);
                    }}
                    disabled={isConnecting}
                  >
                    {isConnecting
                      ? <ActivityIndicator size="small" color={C.green} />
                      : <>
                        <Feather name={isConnected ? "x-circle" : "zap"} size={14} color={isConnected ? C.red : C.green} />
                        <Text style={[styles.connectBtnTxt, { color: isConnected ? C.red : C.green }]}>
                          {isConnected ? "DISCONNECT" : "CONNECT"}
                        </Text>
                      </>}
                  </Pressable>
                </View>

                {/* Arc gauges */}
                <View style={styles.gaugesCol}>
                  <ArcGauge
                    value={rxPkts.length}
                    max={Math.max(rxPkts.length + 1, 20)}
                    size={90}
                    color={C.blue}
                    label="RX"
                    unit="pkts"
                  />
                  <ArcGauge
                    value={txPkts.length}
                    max={Math.max(txPkts.length + 1, 20)}
                    size={90}
                    color={C.green}
                    label="TX"
                    unit="pkts"
                  />
                </View>
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <StatCard label="Total Packets" value={packets.length.toString()} color={C.yellow} bar={activityPct} />
                <StatCard label="Bytes RX" value={rxPkts.reduce((s, p) => s + p.byteLength, 0).toString()} color={C.blue} />
                <StatCard label="Bytes TX" value={txPkts.reduce((s, p) => s + p.byteLength, 0).toString()} color={C.green} />
                <StatCard label="Total Bytes" value={totalBytes.toString()} color={C.muted} />
              </View>

              {/* Recent packets strip */}
              {packets.length > 0 && (
                <View style={styles.recentCard}>
                  <Text style={styles.recentTitle}>RECENT PACKETS</Text>
                  {[...packets].reverse().slice(0, 5).map((pkt) => {
                    const isRx = pkt.direction === "read";
                    return (
                      <View
                        key={pkt.id}
                        style={[
                          styles.recentRow,
                          { borderLeftColor: isRx ? C.blue : C.green, borderLeftWidth: 2 },
                        ]}
                      >
                        <Text style={[styles.recentDir, { color: isRx ? C.blue : C.green }]}>
                          {isRx ? "RX" : "TX"}
                        </Text>
                        <Text style={styles.recentTime}>
                          {pkt.timestamp.toLocaleTimeString([], { hour12: false })}
                        </Text>
                        <Text style={styles.recentData} numberOfLines={1}>{pkt.data}</Text>
                        <Text style={styles.recentBytes}>{pkt.byteLength}B</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {lastError ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-triangle" size={14} color={C.red} />
                  <Text style={styles.errorTxt}>{lastError}</Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            /* No device selected */
            <View style={styles.noSel}>
              <DiskPlatterSvg size={120} active={false} color={C.muted} />
              <Text style={styles.noSelTitle}>No Drive Selected</Text>
              <Text style={styles.noSelSub}>Scan for USB devices and select one from the list</Text>
              <Pressable
                style={[styles.noSelBtn, { borderColor: "rgba(110,220,161,0.5)" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); scanForDevices(); }}
                disabled={isScanning}
              >
                {isScanning
                  ? <ActivityIndicator size="small" color={C.green} />
                  : <>
                    <Feather name="search" size={13} color={C.green} />
                    <Text style={[styles.noSelBtnTxt, { color: C.green }]}>SCAN DEVICES</Text>
                  </>}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, flexDirection: "row" },

  // Sidebar
  sidebar: { width: 210, backgroundColor: "rgba(18,22,24,1)", borderRightWidth: 1, borderRightColor: C.border },
  sideHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  logoBox: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  logoText: { color: C.text, fontSize: 13, fontFamily: "Inter_700Bold" },
  scanBtn: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  sideLabel: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  emptyDrives: { paddingTop: 40, alignItems: "center", gap: 8 },
  emptyDrivesTxt: { color: C.muted, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Device list card
  listCard: { marginHorizontal: 8, borderRadius: 8, borderWidth: 1, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listCardLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  diskDot: { width: 10, height: 10, borderRadius: 5, position: "relative" },
  diskPulse: { position: "absolute", width: 10, height: 10, borderRadius: 5, top: 0, left: 0 },
  listCardName: { color: C.text, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  listCardMfr: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
  listCardStatus: { paddingHorizontal: 5, paddingVertical: 2 },
  listCardStatusTxt: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  // Main panel
  main: { flex: 1, padding: 16 },

  // Hero row
  heroRow: { flexDirection: "row", gap: 20, marginBottom: 16, alignItems: "flex-start" },
  diskWrap: { alignItems: "center", gap: 8 },
  diskStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  diskStatusDot: { width: 6, height: 6, borderRadius: 3 },
  diskStatusTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },

  // Device info
  deviceInfo: { flex: 1, gap: 6 },
  deviceName: { color: C.text, fontSize: 20, fontFamily: "Inter_700Bold" },
  deviceMfr: { color: C.muted, fontSize: 12, fontFamily: "Inter_400Regular" },
  idGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  idCell: { minWidth: 80, gap: 2 },
  idKey: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },
  idVal: { color: C.text, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  connectBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start", marginTop: 6 },
  connectBtnTxt: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },

  // Gauges column
  gaugesCol: { flexDirection: "row", gap: 8, alignItems: "center" },

  // Stats row
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, padding: 10, alignItems: "center", gap: 3 },
  statVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { color: C.muted, fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },

  // Recent packets
  recentCard: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 12, gap: 6 },
  recentTitle: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 4 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingVertical: 4, borderRadius: 3 },
  recentDir: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5, width: 18 },
  recentTime: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
  recentData: { flex: 1, color: C.text, fontSize: 11, fontFamily: "Inter_400Regular" },
  recentBytes: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular" },

  // Error
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,80,60,0.1)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,80,60,0.3)", padding: 10 },
  errorTxt: { color: C.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  // No selection
  noSel: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  noSelTitle: { color: C.text, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  noSelSub: { color: C.muted, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 220 },
  noSelBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  noSelBtnTxt: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
});
