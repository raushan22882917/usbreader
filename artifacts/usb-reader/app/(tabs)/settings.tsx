import React, { useState } from "react";
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useUsb } from "@/context/UsbContext";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const C = {
  bg:     "rgba(21,25,27,1)",
  panel:  "rgba(26,30,32,1)",
  card:   "rgba(32,36,38,1)",
  border: "rgba(51,56,58,1)",
  text:   "rgba(220,221,221,1)",
  muted:  "rgba(120,122,122,1)",
  dim:    "rgba(60,62,62,1)",
  green:  "#6EDCA1",
  yellow: "#FFC832",
  orange: "#FF9811",
  red:    "#FF503C",
  blue:   "#50B4FF",
  purple: "#A78BFA",
};

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

// ─── Arc gauge ────────────────────────────────────────────────
function ArcGauge({ value, max, size, color, label, unit }: { value: number; max: number; size: number; color: string; label: string; unit: string }) {
  const cx = size / 2, cy = size / 2, R = size * 0.38, stroke = size * 0.1;
  const pct = Math.min(value / max, 1);
  const startA = -135, endA = 135, range = 270;
  const fillEnd = startA + range * pct;

  function polar(r: number, deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arc(r: number, a1: number, a2: number) {
    const s = polar(r, a1); const e = polar(r, a2);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${Math.abs(a2-a1)>180?1:0} 1 ${e.x} ${e.y}`;
  }

  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`ag${label}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.5" />
            <Stop offset="1" stopColor={color} />
          </LinearGradient>
        </Defs>
        <Path d={arc(R, startA, endA)} stroke="rgba(51,56,58,1)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {pct > 0 && <Path d={arc(R, startA, fillEnd)} stroke={`url(#ag${label})`} strokeWidth={stroke} fill="none" strokeLinecap="round" />}
        <Circle cx={cx} cy={cy} r={R - stroke - 2} fill="rgba(18,22,24,1)" />
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 16, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color, fontSize: size * 0.18, fontWeight: "700" }}>{value}</Text>
        <Text style={{ color: C.muted, fontSize: size * 0.1 }}>{unit}</Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 10, fontWeight: "600", marginTop: -size + 8 }}>{label}</Text>
    </View>
  );
}

// ─── Section card ─────────────────────────────────────────────
function SectionCard({ title, icon, color, children }: { title: string; icon: MCIcon; color: string; children: React.ReactNode }) {
  return (
    <View style={sc.card}>
      <View style={sc.head}>
        <View style={[sc.iconBox, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={icon} size={14} color={color} />
        </View>
        <Text style={sc.title}>{title}</Text>
        <View style={[sc.bar, { backgroundColor: color }]} />
      </View>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: "hidden", marginBottom: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  iconBox: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  title: { color: C.text, fontSize: 12, fontWeight: "700", flex: 1 },
  bar: { width: 3, height: 16, borderRadius: 2 },
});

// ─── Info row ─────────────────────────────────────────────────
function InfoRow({ icon, label, value, color, last }: { icon: MCIcon; label: string; value: string; color?: string; last?: boolean }) {
  return (
    <View style={[row.wrap, last && { borderBottomWidth: 0 }]}>
      <MaterialCommunityIcons name={icon} size={13} color={color ?? C.muted} />
      <Text style={row.label}>{label}</Text>
      <Text style={[row.value, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}
const row = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)" },
  label: { flex: 1, color: C.muted, fontSize: 11 },
  value: { color: C.text, fontSize: 11, fontWeight: "600" },
});

// ─── Toggle row ───────────────────────────────────────────────
function ToggleRow({ icon, label, desc, value, onChange }: { icon: MCIcon; label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[row.wrap, { paddingVertical: 10 }]}>
      <MaterialCommunityIcons name={icon} size={14} color={C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[row.label, { flex: 0, color: C.text, fontSize: 11, marginBottom: 1 }]}>{label}</Text>
        <Text style={{ color: C.dim, fontSize: 9 }}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(v); }}
        trackColor={{ false: C.border, true: "rgba(110,220,161,0.4)" }}
        thumbColor={value ? C.green : C.muted}
      />
    </View>
  );
}

// ─── MAIN ────────────────────────────────────────────────────
export default function SettingsScreen() {
  const {
    devices, selectedDevice, connectionStatus, packets, isScanning, isConnecting,
    scanForDevices, connectDevice, disconnectDevice,
  } = useUsb();

  const isConnected = connectionStatus === "connected";
  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");
  const totalBytes = packets.reduce((s, p) => s + p.byteLength, 0);

  const [autoReconnect, setAutoReconnect] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [hexDisplay, setHexDisplay] = useState(true);
  const [vibration, setVibration] = useState(true);
  const [logAll, setLogAll] = useState(false);

  return (
    <View style={s.root}>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <Pressable style={s.backBtn} onPress={() => router.push("/(tabs)/index" as any)}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={C.muted} />
        </Pressable>
        <MaterialCommunityIcons name="cog-outline" size={16} color={C.muted} />
        <Text style={s.topTitle}>Settings</Text>
        <View style={[s.connBadge, { backgroundColor: isConnected ? "rgba(110,220,161,0.1)" : "rgba(255,80,60,0.08)", borderColor: isConnected ? "rgba(110,220,161,0.4)" : "rgba(255,80,60,0.3)" }]}>
          <MaterialCommunityIcons name="usb" size={11} color={isConnected ? C.green : C.red} />
          <Text style={[s.connTxt, { color: isConnected ? C.green : C.red }]}>{isConnected ? "USB ON" : "USB OFF"}</Text>
        </View>
      </View>

      <View style={s.body}>
        {/* ── LEFT SIDEBAR ── */}
        <View style={s.sidebar}>
          {/* Connection card */}
          <View style={s.connCard}>
            <View style={s.connCardHead}>
              <MaterialCommunityIcons name="connection" size={14} color={C.blue} />
              <Text style={s.connCardTitle}>Connection</Text>
            </View>
            <View style={[s.connStatus, { backgroundColor: isConnected ? "rgba(110,220,161,0.08)" : "rgba(255,80,60,0.06)", borderColor: isConnected ? "rgba(110,220,161,0.35)" : "rgba(255,80,60,0.3)" }]}>
              <View style={[s.connStatusDot, { backgroundColor: isConnected ? C.green : C.red }]} />
              <Text style={[s.connStatusTxt, { color: isConnected ? C.green : C.red }]}>
                {isConnected ? "● CONNECTED" : "○ OFFLINE"}
              </Text>
            </View>
            {selectedDevice && (
              <View style={{ gap: 4, marginTop: 6 }}>
                <Text style={s.devName}>{selectedDevice.name}</Text>
                <Text style={s.devMfr}>{selectedDevice.manufacturerName ?? "Unknown manufacturer"}</Text>
                <Text style={s.devVid}>VID {selectedDevice.vendorId?.toString(16).toUpperCase() ?? "—"} · PID {selectedDevice.productId?.toString(16).toUpperCase() ?? "—"}</Text>
              </View>
            )}
            <View style={s.connBtns}>
              <Pressable
                style={[s.connBtn, { backgroundColor: "rgba(80,180,255,0.1)", borderColor: "rgba(80,180,255,0.35)" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); scanForDevices(); }}
                disabled={isScanning}
              >
                {isScanning ? <ActivityIndicator size="small" color={C.blue} /> : <MaterialCommunityIcons name="magnify" size={13} color={C.blue} />}
                <Text style={[s.connBtnTxt, { color: C.blue }]}>{isScanning ? "Scanning..." : "Scan"}</Text>
              </Pressable>
              <Pressable
                style={[s.connBtn, { backgroundColor: isConnected ? "rgba(255,80,60,0.1)" : "rgba(110,220,161,0.1)", borderColor: isConnected ? "rgba(255,80,60,0.35)" : "rgba(110,220,161,0.35)" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); isConnected ? disconnectDevice() : selectedDevice && connectDevice(selectedDevice); }}
                disabled={isConnecting || (!isConnected && !selectedDevice)}
              >
                {isConnecting ? <ActivityIndicator size="small" color={C.green} /> : <MaterialCommunityIcons name={isConnected ? "link-off" : "link"} size={13} color={isConnected ? C.red : C.green} />}
                <Text style={[s.connBtnTxt, { color: isConnected ? C.red : C.green }]}>{isConnected ? "Disconnect" : "Connect"}</Text>
              </Pressable>
            </View>
          </View>

          {/* Arc gauges */}
          <View style={s.gaugeRow}>
            <ArcGauge value={rxPkts.length} max={Math.max(rxPkts.length, 30)} size={90} color={C.blue} label="RX" unit="pkts" />
            <ArcGauge value={txPkts.length} max={Math.max(txPkts.length, 30)} size={90} color={C.green} label="TX" unit="pkts" />
          </View>

          {/* Mini stats */}
          {[
            { icon: "layers-triple" as MCIcon, label: "Packets", value: packets.length.toString(), color: C.yellow },
            { icon: "database" as MCIcon, label: "Total bytes", value: totalBytes > 1024 ? `${(totalBytes/1024).toFixed(1)} KB` : `${totalBytes} B`, color: C.blue },
            { icon: "clock-outline" as MCIcon, label: "Platform", value: Platform.OS.toUpperCase(), color: C.muted },
          ].map(({ icon, label, value, color }) => (
            <View key={label} style={s.miniStat}>
              <MaterialCommunityIcons name={icon} size={13} color={color} />
              <Text style={s.miniStatLabel}>{label}</Text>
              <Text style={[s.miniStatVal, { color }]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* ── RIGHT: Settings sections ── */}
        <ScrollView style={s.main} contentContainerStyle={s.mainContent} showsVerticalScrollIndicator={false}>

          {/* Device Info */}
          <SectionCard title="Device Information" icon="hard-drive" color={C.blue}>
            <InfoRow icon="identifier" label="Device Name" value={selectedDevice?.name ?? "—"} />
            <InfoRow icon="factory" label="Manufacturer" value={selectedDevice?.manufacturerName ?? "—"} />
            <InfoRow icon="barcode" label="Serial Number" value={selectedDevice?.serialNumber ?? "—"} />
            <InfoRow icon="chip" label="Vendor ID" value={selectedDevice?.vendorId != null ? `0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4,"0")}` : "—"} color={C.blue} />
            <InfoRow icon="chip" label="Product ID" value={selectedDevice?.productId != null ? `0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4,"0")}` : "—"} color={C.blue} last />
          </SectionCard>

          {/* Protocol */}
          <SectionCard title="Protocol & Transport" icon="lan" color={C.green}>
            <InfoRow icon="ethernet" label="Protocol" value={Platform.OS === "web" ? "WebUSB API" : Platform.OS === "android" ? "USB OTG" : "MFi Accessory"} color={C.green} />
            <InfoRow icon="server-network" label="Platform" value={Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} />
            <InfoRow icon="check-circle" label="Status" value={isConnected ? "Active" : "Idle"} color={isConnected ? C.green : C.muted} last />
          </SectionCard>

          {/* Data Settings */}
          <SectionCard title="Data & Display" icon="chart-bar" color={C.yellow}>
            <ToggleRow icon="hexadecimal" label="Hex Display Mode" desc="Show data as hexadecimal values" value={hexDisplay} onChange={setHexDisplay} />
            <ToggleRow icon="file-document-outline" label="Log All Packets" desc="Keep full history in memory" value={logAll} onChange={setLogAll} />
          </SectionCard>

          {/* Connection Settings */}
          <SectionCard title="Connection" icon="connection" color={C.orange}>
            <ToggleRow icon="refresh-auto" label="Auto Reconnect" desc="Reconnect automatically on disconnect" value={autoReconnect} onChange={setAutoReconnect} />
          </SectionCard>

          {/* App Settings */}
          <SectionCard title="App Settings" icon="tune" color={C.purple}>
            <ToggleRow icon="theme-light-dark" label="Dark Mode" desc="Always use dark interface" value={darkMode} onChange={setDarkMode} />
            <ToggleRow icon="vibrate" label="Haptic Feedback" desc="Vibration on button press" value={vibration} onChange={setVibration} />
          </SectionCard>

          {/* About */}
          <SectionCard title="About" icon="information-outline" color={C.muted}>
            <InfoRow icon="application-cog" label="App Version" value="1.0.0" />
            <InfoRow icon="code-tags" label="Build" value="Expo SDK 54" />
            <InfoRow icon="cellphone-link" label="USB API" value={Platform.OS === "web" ? "WebUSB" : "Native USB"} last />
          </SectionCard>

        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, flexDirection: "column" },

  topBar: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  backBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: C.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  topTitle: { color: C.text, fontSize: 13, fontWeight: "700", flex: 1 },
  connBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  connDot: { width: 5, height: 5, borderRadius: 3 },
  connTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },

  body: { flex: 1, flexDirection: "row" },

  sidebar: { width: 220, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.panel, padding: 10, gap: 8 },

  // Connection card
  connCard: { backgroundColor: C.card, borderRadius: 9, borderWidth: 1, borderColor: C.border, padding: 10, gap: 8 },
  connCardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  connCardTitle: { color: C.text, fontSize: 12, fontWeight: "700" },
  connStatus: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  connStatusDot: { width: 6, height: 6, borderRadius: 3 },
  connStatusTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  devName: { color: C.text, fontSize: 12, fontWeight: "700" },
  devMfr: { color: C.muted, fontSize: 10 },
  devVid: { color: C.blue, fontSize: 9, fontWeight: "600" },
  connBtns: { flexDirection: "row", gap: 6 },
  connBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 7, borderWidth: 1, paddingVertical: 7 },
  connBtnTxt: { fontSize: 11, fontWeight: "700" },

  gaugeRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 4 },
  miniStat: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  miniStatLabel: { flex: 1, color: C.muted, fontSize: 10 },
  miniStatVal: { fontSize: 11, fontWeight: "700" },

  main: { flex: 1 },
  mainContent: { padding: 14 },
});
