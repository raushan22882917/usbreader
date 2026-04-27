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
import { router } from "expo-router";
import { useUsb, UsbDevice } from "@/context/UsbContext";
import { GlobalStatusBar } from "@/components/StatusBar";
import { DiskPlatterSvg, ArcGauge } from "@/components/SvgGauges";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const C = {
  bg:     "rgba(21,25,27,1)",
  card:   "rgba(28,32,34,1)",
  row:    "rgba(35,39,41,1)",
  border: "rgba(51,56,58,1)",
  text:   "rgba(220,221,221,1)",
  muted:  "rgba(120,122,122,1)",
  mid:    "rgba(160,162,162,1)",
  green:  "#6EDCA1",
  yellow: "#FFC832",
  red:    "#FF503C",
  blue:   "#50B4FF",
  purple: "#9333EA",
  orange: "#FF9811",
};

// ── Mini Spark line ──────────────────────────────────────────
function SparkLine({ data, color, width = 100, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - (v / max) * (height - 4) - 2,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const fill = `${path} L ${width} ${height} L 0 ${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`spark_${color}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>
      <Path d={fill} fill={`url(#spark_${color})`} />
      <Path d={path} stroke={color} strokeWidth={1.5} fill="none" />
      <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={color} />
    </Svg>
  );
}

// ── Nav button ───────────────────────────────────────────────
function NavButton({
  icon, label, color, route, badge,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  color: string;
  route: string;
  badge?: number;
}) {
  return (
    <Pressable
      style={[styles.navBtn, { backgroundColor: `${color}0F`, borderColor: `${color}35` }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(route as any); }}
    >
      <View style={[styles.navBtnIcon, { backgroundColor: `${color}20` }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.navBtnLabel, { color }]}>{label.toUpperCase()}</Text>
      {badge != null && badge > 0 && (
        <View style={[styles.navBtnBadge, { backgroundColor: color }]}>
          <Text style={styles.navBtnBadgeTxt}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Device list card ─────────────────────────────────────────
function DeviceCard({ device, isSelected, onPress }: { device: UsbDevice; isSelected: boolean; onPress: () => void }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (device.connected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0.4);
    }
  }, [device.connected]);
  return (
    <Pressable
      style={[
        styles.devCard,
        {
          backgroundColor: isSelected ? (device.connected ? "rgba(110,220,161,0.08)" : "rgba(59,130,246,0.08)") : C.card,
          borderColor: isSelected ? (device.connected ? "rgba(110,220,161,0.4)" : "rgba(59,130,246,0.35)") : C.border,
        },
      ]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <Animated.View style={[styles.devDot, { backgroundColor: device.connected ? C.green : C.muted, opacity: device.connected ? pulseAnim : 0.4 }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.devName} numberOfLines={1}>{device.name}</Text>
        <Text style={styles.devMfr} numberOfLines={1}>
          {device.manufacturerName ?? `VID ${device.vendorId?.toString(16).toUpperCase() ?? "—"}`}
        </Text>
      </View>
      <Text style={[styles.devStatusTxt, { color: device.connected ? C.green : C.muted }]}>
        {device.connected ? "LIVE" : "IDLE"}
      </Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const {
    devices, selectedDevice, connectionStatus, isScanning, isConnecting, lastError, packets,
    scanForDevices, connectDevice, disconnectDevice, selectDevice,
  } = useUsb();

  const [sparkData, setSparkData] = useState<number[]>([0, 0, 0, 0, 0]);
  const [diskRot, setDiskRot] = useState(0);
  const isConnected = connectionStatus === "connected";

  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const bottomPad = Platform.OS === "web" ? 54 : insets.bottom + 60;

  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");
  const totalBytes = packets.reduce((s, p) => s + p.byteLength, 0);
  const activityPct = Math.min(packets.length / 50, 1);

  // Keep spark data updated
  useEffect(() => {
    setSparkData((prev) => {
      const next = [...prev, rxPkts.length];
      return next.slice(-16);
    });
  }, [rxPkts.length]);

  // Disk rotation
  useEffect(() => {
    if (!isConnected) return;
    const t = setInterval(() => setDiskRot((r) => (r + 5) % 360), 60);
    return () => clearInterval(t);
  }, [isConnected]);

  const lastPacket = [...packets].reverse()[0] ?? null;

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <GlobalStatusBar />

      <View style={styles.body}>
        {/* ─── LEFT SIDEBAR ─── */}
        <View style={styles.sidebar}>
          {/* App logo */}
          <View style={styles.sideHead}>
            <View style={[styles.sideLogoBox, { backgroundColor: C.blue }]}>
              <Feather name="hard-drive" size={14} color="#fff" />
            </View>
            <View>
              <Text style={styles.sideTitle}>USB Manager</Text>
              <Text style={styles.sideSub}>v1.0 · {Platform.OS}</Text>
            </View>
          </View>

          {/* Scan button */}
          <Pressable
            style={[
              styles.scanBtn,
              { backgroundColor: isScanning ? C.row : "rgba(110,220,161,0.12)", borderColor: isScanning ? C.border : "rgba(110,220,161,0.4)" },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); scanForDevices(); }}
            disabled={isScanning}
          >
            {isScanning ? <ActivityIndicator size="small" color={C.green} /> : <Feather name="refresh-cw" size={13} color={C.green} />}
            <Text style={[styles.scanBtnTxt, { color: isScanning ? C.muted : C.green }]}>
              {isScanning ? "Scanning..." : "Scan Devices"}
            </Text>
          </Pressable>

          {/* Device list */}
          <Text style={styles.sideLabel}>DRIVES ({devices.length})</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 5, paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
            {devices.length === 0 ? (
              <View style={styles.emptyDevs}>
                <Feather name="inbox" size={20} color={C.muted} />
                <Text style={styles.emptyDevsTxt}>No devices found</Text>
              </View>
            ) : (
              devices.map((d) => (
                <DeviceCard key={d.id} device={d} isSelected={selectedDevice?.id === d.id} onPress={() => selectDevice(d)} />
              ))
            )}
          </ScrollView>

          {/* Sidebar mini-stats */}
          <View style={[styles.sideStats, { borderTopColor: C.border }]}>
            {[
              { icon: "database" as const, val: packets.length, color: C.yellow },
              { icon: "arrow-down-circle" as const, val: rxPkts.length, color: C.blue },
              { icon: "arrow-up-circle" as const, val: txPkts.length, color: C.green },
            ].map(({ icon, val, color }) => (
              <View key={icon} style={styles.sideStatItem}>
                <Feather name={icon} size={12} color={color} />
                <Text style={[styles.sideStatVal, { color }]}>{val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ─── MAIN PANEL ─── */}
        <View style={[styles.main, { paddingBottom: bottomPad }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {selectedDevice ? (
              <>
                {/* ── Hero row: disk + info + gauges ── */}
                <View style={styles.heroRow}>
                  {/* Disk visual */}
                  <View style={styles.diskCol}>
                    <DiskPlatterSvg size={150} active={isConnected} activity={activityPct} color={isConnected ? C.green : C.blue} rotation={diskRot} />
                    <Pressable
                      style={[
                        styles.connectBtn,
                        {
                          backgroundColor: isConnected ? "rgba(255,80,60,0.1)" : "rgba(110,220,161,0.1)",
                          borderColor: isConnected ? "rgba(255,80,60,0.4)" : "rgba(110,220,161,0.4)",
                        },
                      ]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); isConnected ? disconnectDevice() : connectDevice(selectedDevice); }}
                      disabled={isConnecting}
                    >
                      {isConnecting
                        ? <ActivityIndicator size="small" color={C.green} />
                        : <>
                          <Feather name={isConnected ? "x-circle" : "zap"} size={13} color={isConnected ? C.red : C.green} />
                          <Text style={[styles.connectBtnTxt, { color: isConnected ? C.red : C.green }]}>
                            {isConnected ? "DISCONNECT" : "CONNECT"}
                          </Text>
                        </>}
                    </Pressable>
                  </View>

                  {/* Device details */}
                  <View style={styles.deviceDetail}>
                    {/* Status badge */}
                    <View style={[styles.statusBadge, { backgroundColor: isConnected ? "rgba(110,220,161,0.1)" : C.row, borderColor: isConnected ? "rgba(110,220,161,0.4)" : C.border }]}>
                      <View style={[styles.statusDotLive, { backgroundColor: isConnected ? C.green : C.muted }]} />
                      <Text style={[styles.statusBadgeTxt, { color: isConnected ? C.green : C.muted }]}>
                        {isConnected ? "● CONNECTED" : "○ OFFLINE"}
                      </Text>
                    </View>
                    <Text style={styles.devBigName}>{selectedDevice.name}</Text>
                    {selectedDevice.manufacturerName && (
                      <Text style={styles.devBigMfr}>{selectedDevice.manufacturerName}</Text>
                    )}

                    {/* ID grid */}
                    <View style={styles.idGrid}>
                      {[
                        { k: "Vendor ID", v: selectedDevice.vendorId != null ? `0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4, "0")}` : "—", c: C.blue },
                        { k: "Product ID", v: selectedDevice.productId != null ? `0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4, "0")}` : "—", c: C.blue },
                        { k: "Serial", v: selectedDevice.serialNumber ?? "—", c: C.muted },
                        { k: "Platform", v: selectedDevice.platform.toUpperCase(), c: C.yellow },
                        { k: "Protocol", v: Platform.OS === "web" ? "WebUSB" : Platform.OS === "android" ? "OTG" : "MFi", c: C.green },
                        { k: "Mode", v: isConnected ? "ACTIVE" : "IDLE", c: isConnected ? C.green : C.muted },
                      ].map(({ k, v, c }) => (
                        <View key={k} style={styles.idCell}>
                          <Text style={styles.idKey}>{k}</Text>
                          <Text style={[styles.idVal, { color: c }]}>{v}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Gauges column */}
                  <View style={styles.gaugesCol}>
                    <ArcGauge value={rxPkts.length} max={Math.max(rxPkts.length + 1, 30)} size={96} color={C.blue} label="RX" unit="pkts" />
                    <ArcGauge value={txPkts.length} max={Math.max(txPkts.length + 1, 30)} size={96} color={C.green} label="TX" unit="pkts" />
                  </View>
                </View>

                {/* ── Metric strip ── */}
                <View style={styles.metricStrip}>
                  {[
                    { label: "Total Packets", val: packets.length, icon: "layers" as const, color: C.yellow },
                    { label: "Total Bytes", val: totalBytes, icon: "hard-drive" as const, color: C.blue },
                    { label: "RX Bytes", val: rxPkts.reduce((s, p) => s + p.byteLength, 0), icon: "arrow-down-circle" as const, color: C.blue },
                    { label: "TX Bytes", val: txPkts.reduce((s, p) => s + p.byteLength, 0), icon: "arrow-up-circle" as const, color: C.green },
                    { label: "Session Time", val: isConnected ? "LIVE" : "--", icon: "clock" as const, color: C.muted },
                  ].map(({ label, val, icon, color }) => (
                    <View key={label} style={[styles.metricCard, { borderColor: C.border }]}>
                      <View style={[styles.metricIcon, { backgroundColor: `${color}15` }]}>
                        <Feather name={icon} size={12} color={color} />
                      </View>
                      <Text style={[styles.metricVal, { color }]}>{val}</Text>
                      <Text style={styles.metricLabel}>{label}</Text>
                    </View>
                  ))}
                </View>

                {/* ── Two-column row: Spark chart + Live feed ── */}
                <View style={styles.twoCol}>
                  {/* Spark chart */}
                  <View style={[styles.chartCard, { borderColor: C.border }]}>
                    <Text style={styles.cardTitle}>RX ACTIVITY</Text>
                    <View style={styles.chartArea}>
                      <SparkLine data={sparkData} color={C.blue} width={280} height={60} />
                    </View>
                    <View style={styles.chartFoot}>
                      <Text style={styles.chartFootTxt}>{rxPkts.length} packets received</Text>
                      <View style={[styles.livePill, { backgroundColor: isConnected ? "rgba(110,220,161,0.1)" : C.row, borderColor: isConnected ? "rgba(110,220,161,0.4)" : C.border }]}>
                        <View style={[styles.liveDot, { backgroundColor: isConnected ? C.green : C.muted }]} />
                        <Text style={[styles.livePillTxt, { color: isConnected ? C.green : C.muted }]}>
                          {isConnected ? "LIVE" : "IDLE"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Last packet */}
                  {lastPacket && (
                    <View style={[styles.lastPktCard, { borderColor: lastPacket.direction === "read" ? "rgba(80,180,255,0.3)" : "rgba(110,220,161,0.3)" }]}>
                      <View style={styles.lastPktHead}>
                        <View style={[styles.lastPktDir, {
                          backgroundColor: lastPacket.direction === "read" ? "rgba(80,180,255,0.12)" : "rgba(110,220,161,0.12)",
                        }]}>
                          <Feather
                            name={lastPacket.direction === "read" ? "arrow-down-circle" : "arrow-up-circle"}
                            size={13}
                            color={lastPacket.direction === "read" ? C.blue : C.green}
                          />
                          <Text style={[styles.lastPktDirTxt, { color: lastPacket.direction === "read" ? C.blue : C.green }]}>
                            {lastPacket.direction.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.lastPktTime}>{lastPacket.timestamp.toLocaleTimeString([], { hour12: false })}</Text>
                        <Text style={styles.lastPktBytes}>{lastPacket.byteLength}B</Text>
                      </View>
                      <Text style={styles.cardTitle}>LAST PACKET</Text>
                      <Text style={styles.lastPktData} numberOfLines={3}>{lastPacket.data}</Text>
                      <Text style={styles.lastPktHex} numberOfLines={1}>{lastPacket.hexView}</Text>
                    </View>
                  )}
                </View>

                {/* ── Recent packets ── */}
                {packets.length > 0 && (
                  <View style={[styles.recentCard, { borderColor: C.border }]}>
                    <View style={styles.recentHead}>
                      <Text style={styles.cardTitle}>RECENT PACKETS</Text>
                      <Pressable
                        style={styles.viewAllBtn}
                        onPress={() => { router.push("/(tabs)/monitor" as any); }}
                      >
                        <Text style={[styles.viewAllTxt, { color: C.blue }]}>View All →</Text>
                      </Pressable>
                    </View>
                    {[...packets].reverse().slice(0, 6).map((pkt) => {
                      const isRx = pkt.direction === "read";
                      return (
                        <View key={pkt.id} style={[styles.recentRow, { borderLeftColor: isRx ? C.blue : C.green }]}>
                          <Text style={[styles.recentDir, { color: isRx ? C.blue : C.green }]}>{isRx ? "RX" : "TX"}</Text>
                          <Text style={styles.recentTime}>{pkt.timestamp.toLocaleTimeString([], { hour12: false })}</Text>
                          <Text style={styles.recentData} numberOfLines={1}>{pkt.data}</Text>
                          <Text style={styles.recentBytes}>{pkt.byteLength}B</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {lastError && (
                  <View style={styles.errorBox}>
                    <Feather name="alert-triangle" size={13} color={C.red} />
                    <Text style={styles.errorTxt}>{lastError}</Text>
                  </View>
                )}
              </>
            ) : (
              /* ── No device selected ── */
              <View style={styles.noDev}>
                <DiskPlatterSvg size={110} active={false} color={C.muted} />
                <Text style={styles.noDevTitle}>No Drive Selected</Text>
                <Text style={styles.noDevSub}>Scan for USB devices and select one from the sidebar to begin</Text>
                <Pressable
                  style={[styles.noDevBtn, { borderColor: "rgba(110,220,161,0.4)" }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); scanForDevices(); }}
                  disabled={isScanning}
                >
                  {isScanning ? <ActivityIndicator size="small" color={C.green} /> : <>
                    <Feather name="search" size={13} color={C.green} />
                    <Text style={[styles.noDevBtnTxt, { color: C.green }]}>SCAN DEVICES</Text>
                  </>}
                </Pressable>
              </View>
            )}

            {/* ── Navigation buttons ── */}
            <View style={styles.navSection}>
              <Text style={styles.navSectionTitle}>TOOLS</Text>
              <View style={styles.navGrid}>
                <NavButton icon="activity" label="Monitor" color={C.blue} route="/(tabs)/monitor" badge={packets.filter(p=>p.direction==="read").length} />
                <NavButton icon="send" label="Write" color={C.green} route="/(tabs)/write" />
                <NavButton icon="file-text" label="BIN Decoder" color={C.yellow} route="/(tabs)/decoder" />
                <NavButton icon="settings" label="Settings" color={C.mid} route="/(tabs)/settings" />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, flexDirection: "row" },

  // Sidebar
  sidebar: { width: 200, backgroundColor: "rgba(18,22,24,1)", borderRightWidth: 1, borderRightColor: C.border, padding: 10 },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 },
  sideLogoBox: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sideTitle: { color: C.text, fontSize: 13, fontFamily: "Inter_700Bold" },
  sideSub: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular" },
  scanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 8, borderWidth: 1, padding: 9, marginBottom: 10 },
  scanBtnTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sideLabel: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 7 },

  // Device card
  devCard: { borderRadius: 7, borderWidth: 1, padding: 9, flexDirection: "row", alignItems: "center", gap: 7 },
  devDot: { width: 8, height: 8, borderRadius: 4 },
  devName: { color: C.text, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  devMfr: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular" },
  devStatusTxt: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  emptyDevs: { alignItems: "center", paddingTop: 30, gap: 8 },
  emptyDevsTxt: { color: C.muted, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Sidebar stats
  sideStats: { flexDirection: "row", borderTopWidth: 1, paddingTop: 10, gap: 4 },
  sideStatItem: { flex: 1, alignItems: "center", gap: 3 },
  sideStatVal: { fontSize: 14, fontFamily: "Inter_700Bold" },

  // Main
  main: { flex: 1, padding: 14 },

  // Hero
  heroRow: { flexDirection: "row", gap: 16, marginBottom: 14, alignItems: "flex-start" },
  diskCol: { alignItems: "center", gap: 8 },
  connectBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 7 },
  connectBtnTxt: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  deviceDetail: { flex: 1, gap: 6 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  statusDotLive: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeTxt: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  devBigName: { color: C.text, fontSize: 19, fontFamily: "Inter_700Bold", lineHeight: 24 },
  devBigMfr: { color: C.muted, fontSize: 12, fontFamily: "Inter_400Regular" },
  idGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  idCell: { minWidth: 90, gap: 2 },
  idKey: { color: C.muted, fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },
  idVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  gaugesCol: { flexDirection: "row", gap: 6, alignItems: "center" },

  // Metric strip
  metricStrip: { flexDirection: "row", gap: 8, marginBottom: 12 },
  metricCard: { flex: 1, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, padding: 10, gap: 4, alignItems: "center" },
  metricIcon: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  metricVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  metricLabel: { color: C.muted, fontSize: 8, fontFamily: "Inter_500Medium", letterSpacing: 0.4, textTransform: "uppercase", textAlign: "center" },

  // Two-col
  twoCol: { flexDirection: "row", gap: 10, marginBottom: 12 },
  chartCard: { flex: 1.5, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, padding: 12 },
  cardTitle: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8 },
  chartArea: { alignItems: "flex-start" },
  chartFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  chartFootTxt: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  livePillTxt: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  lastPktCard: { flex: 1, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, padding: 12, gap: 6 },
  lastPktHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 },
  lastPktDir: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  lastPktDirTxt: { fontSize: 9, fontFamily: "Inter_700Bold" },
  lastPktTime: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular", flex: 1 },
  lastPktBytes: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular" },
  lastPktData: { color: C.text, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 17 },
  lastPktHex: { color: C.blue, fontSize: 9, fontFamily: "Inter_400Regular", opacity: 0.7 },

  // Recent packets
  recentCard: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, padding: 12, marginBottom: 12, gap: 4 },
  recentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  viewAllBtn: {},
  viewAllTxt: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingVertical: 5, borderLeftWidth: 2, borderRadius: 2 },
  recentDir: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.3, width: 18 },
  recentTime: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular", width: 60 },
  recentData: { flex: 1, color: C.text, fontSize: 10, fontFamily: "Inter_400Regular" },
  recentBytes: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular" },

  // Error
  errorBox: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,80,60,0.1)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,80,60,0.3)", padding: 10, marginBottom: 12 },
  errorTxt: { color: C.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  // No device
  noDev: { alignItems: "center", paddingTop: 20, paddingBottom: 24, gap: 10 },
  noDevTitle: { color: C.text, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  noDevSub: { color: C.muted, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 220 },
  noDevBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  noDevBtnTxt: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  // Navigation grid
  navSection: { marginBottom: 8 },
  navSectionTitle: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8 },
  navGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  navBtn: { flex: 1, minWidth: 80, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 8, position: "relative" },
  navBtnIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  navBtnLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5, textAlign: "center" },
  navBtnBadge: { position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  navBtnBadgeTxt: { color: "#000", fontSize: 8, fontFamily: "Inter_700Bold" },
});
