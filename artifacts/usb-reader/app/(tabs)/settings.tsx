import React, { useState, useMemo } from "react";
import {
  ActivityIndicator, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { BAUD_RATES, type BaudRate } from "@/context/UsbContext";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";

import { Colors, Typography, Spacing, Border } from "@/theme";

const C = {
  bg:       Colors.background,
  panel:    Colors.surfaceContainerLow,
  card:     Colors.surfaceContainer,
  border:   Colors.outlineVariant,
  text:     Colors.onSurface,
  muted:    Colors.onSurfaceVariant,
  dim:      Colors.dim,
  dimBg:    Colors.surfaceContainerHigh,
  green:    Colors.tertiary,
  yellow:   Colors.primaryFixedDim,
  orange:   Colors.primary,
  red:      Colors.error,
  blue:     Colors.secondary,
  purple:   Colors.inversePrimary,
  terminal: Colors.terminal,
};

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type LogFilter = "all";

// ─── Arc gauge ────────────────────────────────────────────────
function ArcGauge({ value, max, size, color, label, unit }: {
  value: number; max: number; size: number; color: string; label: string; unit: string;
}) {
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
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
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
function SectionCard({ title, icon, color, right, children }: {
  title: string; icon: MCIcon; color: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <View style={sc.card}>
      <View style={sc.head}>
        <View style={[sc.iconBox, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={icon} size={14} color={color} />
        </View>
        <Text style={sc.title}>{title}</Text>
        {right}
        <View style={[sc.bar, { backgroundColor: color }]} />
      </View>
      {children}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: Border.width, borderColor: Border.color, overflow: "hidden", marginBottom: Spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.panelPadding, paddingVertical: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Border.color },
  iconBox: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  title: { ...Typography.labelCaps, color: C.text, fontSize: 10, flex: 1 },
  bar: { width: 3, height: 14 },
});

// ─── Info row ─────────────────────────────────────────────────
function InfoRow({ icon, label, value, color, mono, last }: {
  icon: MCIcon; label: string; value: string; color?: string; mono?: boolean; last?: boolean;
}) {
  return (
    <View style={[rw.wrap, last && { borderBottomWidth: 0 }]}>
      <MaterialCommunityIcons name={icon} size={13} color={color ?? C.muted} />
      <Text style={rw.label}>{label}</Text>
      <Text style={[rw.value, color ? { color } : {}, mono ? { fontFamily: "monospace", fontSize: 10 } : {}]}>{value}</Text>
    </View>
  );
}
const rw = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.panelPadding, paddingVertical: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Colors.surfaceContainerHigh },
  label: { ...Typography.labelCaps, flex: 1, color: C.muted, fontSize: 10 },
  value: { ...Typography.bodyMd, color: C.text, fontSize: 11, fontWeight: "600", maxWidth: "55%" },
});

// ─── Toggle row ───────────────────────────────────────────────
function ToggleRow({ icon, label, desc, value, onChange }: {
  icon: MCIcon; label: string; desc: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={[rw.wrap, { paddingVertical: 10 }]}>
      <MaterialCommunityIcons name={icon} size={14} color={C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 11, fontWeight: "600", marginBottom: 1 }}>{label}</Text>
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

// ─── Packet log row ───────────────────────────────────────────
function PacketRow({ direction, data, hex, byteLength, timestamp, index }: {
  direction: "read" | "write";
  data: string; hex: string; byteLength: number;
  timestamp: Date; index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRx = direction === "read";
  const col  = isRx ? C.blue : C.green;
  const bg   = isRx ? "rgba(80,180,255,0.07)" : "rgba(110,220,161,0.07)";
  const tag  = isRx ? "RX" : "TX";
  const time = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const ms   = timestamp.getMilliseconds().toString().padStart(3, "0");

  return (
    <Pressable
      style={[pk.row, { backgroundColor: expanded ? bg : "transparent" }]}
      onPress={() => setExpanded((e) => !e)}
    >
      {/* Top line */}
      <View style={pk.topLine}>
        <View style={[pk.indexBox]}>
          <Text style={pk.index}>{index}</Text>
        </View>
        <View style={[pk.dirBadge, { backgroundColor: `${col}20`, borderColor: `${col}45` }]}>
          <Text style={[pk.dirTxt, { color: col }]}>{tag}</Text>
        </View>
        <Text style={pk.time}>{time}.{ms}</Text>
        <Text style={pk.bytes}>{byteLength}B</Text>
        <Text style={pk.data} numberOfLines={1}>{data}</Text>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={13}
          color={C.muted}
        />
      </View>

      {/* Expanded hex view */}
      {expanded && (
        <View style={pk.expandBox}>
          <View style={pk.expandRow}>
            <Text style={pk.expandLabel}>RAW</Text>
            <Text style={pk.expandVal}>{data}</Text>
          </View>
          <View style={pk.expandRow}>
            <Text style={pk.expandLabel}>HEX</Text>
            <Text style={[pk.expandVal, { color: C.yellow, fontFamily: "monospace" }]} numberOfLines={3}>
              {hex}
            </Text>
          </View>
          <View style={pk.expandRow}>
            <Text style={pk.expandLabel}>SIZE</Text>
            <Text style={[pk.expandVal, { color: col }]}>{byteLength} bytes</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
const pk = StyleSheet.create({
  row: { paddingHorizontal: Spacing.panelPadding, paddingVertical: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Colors.surfaceContainerHigh },
  topLine: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  indexBox: { width: 28, alignItems: "flex-end" },
  index: { ...Typography.labelCaps, color: Colors.surfaceContainerHighest, fontSize: 9 },
  dirBadge: { paddingHorizontal: 5, paddingVertical: 1, borderWidth: Border.width },
  dirTxt: { ...Typography.labelCaps, fontSize: 8 },
  time: { ...Typography.labelCaps, color: C.muted, fontSize: 8, width: 68 },
  bytes: { ...Typography.labelCaps, color: C.dim, fontSize: 8, width: 26 },
  data: { flex: 1, color: Colors.tertiary, fontSize: 9, fontFamily: "monospace" },
  expandBox: { marginTop: Spacing.sm, backgroundColor: Colors.surfaceContainerLowest, padding: Spacing.sm, gap: Spacing.xs },
  expandRow: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
  expandLabel: { ...Typography.labelCaps, color: C.dim, fontSize: 8, width: 28, paddingTop: 1 },
  expandVal: { flex: 1, ...Typography.bodyMd, color: C.text, fontSize: 9 },
});

// ─── MAIN ────────────────────────────────────────────────────
export default function SettingsScreen() {
  const {
    devices, selectedDevice, connectionStatus, packets,
    isScanning, isConnecting, scanForDevices, connectDevice,
    disconnectDevice, clearPackets, quickConnect,
    baudRate, setBaudRate,
  } = useUsb();

  const isConnected = connectionStatus === "connected";
  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");
  const rxBytes = rxPkts.reduce((s, p) => s + p.byteLength, 0);
  const txBytes = txPkts.reduce((s, p) => s + p.byteLength, 0);
  const totalBytes = rxBytes + txBytes;

  const now = Date.now();
  const recent3s = rxPkts.filter((p) => now - p.timestamp.getTime() < 3000);
  const dataRateKbps = (recent3s.reduce((s, p) => s + p.byteLength, 0) / 3 / 1024).toFixed(2);
  const pktRate = (recent3s.length / 3).toFixed(1);

  const sessionStart = packets.length > 0 ? packets[0].timestamp : null;
  const sessionSec   = sessionStart ? Math.floor((now - sessionStart.getTime()) / 1000) : 0;
  const fmtUptime    = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h > 0 ? `${h}h ${m}m ${ss}s` : m > 0 ? `${m}m ${ss}s` : `${ss}s`;
  };

  // Settings toggles
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [darkMode, setDarkMode]           = useState(true);
  const [hexDisplay, setHexDisplay]       = useState(true);
  const [vibration, setVibration]         = useState(true);
  const [logAll, setLogAll]               = useState(false);

  // Log filter
  const [showHex, setShowHex]       = useState(false);

  const filteredPackets = useMemo(() => {
    const list = [...packets];
    return list.slice().reverse().slice(0, 200);
  }, [packets]);

  return (
    <View style={s.root}>
      <Header />

      <View style={s.body}>
        {/* ── LEFT SIDEBAR ── */}
        <View style={s.sidebar}>
          {/* Shared USB connection bar */}
          <UsbConnectionBar />

          {/* Mini stats */}
          {[
            { icon: "layers-triple"  as MCIcon, label: "Total Packets", value: packets.length.toString(),                                                    color: C.yellow },
            { icon: "download"       as MCIcon, label: "RX Bytes",      value: rxBytes > 1024 ? `${(rxBytes/1024).toFixed(1)} KB` : `${rxBytes} B`,          color: C.blue   },
            { icon: "upload"         as MCIcon, label: "TX Bytes",      value: txBytes > 1024 ? `${(txBytes/1024).toFixed(1)} KB` : `${txBytes} B`,          color: C.green  },
            { icon: "speedometer"    as MCIcon, label: "Data Rate",     value: `${dataRateKbps} KB/s`,                                                        color: C.orange },
            { icon: "counter"        as MCIcon, label: "Pkt/s",         value: pktRate,                                                                       color: C.muted  },
            { icon: "clock-outline"  as MCIcon, label: "Session",       value: fmtUptime(sessionSec),                                                         color: C.muted  },
            { icon: "cellphone-link" as MCIcon, label: "Platform",      value: Platform.OS.toUpperCase(),                                                     color: C.muted  },
          ].map(({ icon, label, value, color }) => (
            <View key={label} style={s.miniStat}>
              <MaterialCommunityIcons name={icon} size={13} color={color} />
              <Text style={s.miniStatLabel}>{label}</Text>
              <Text style={[s.miniStatVal, { color }]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* ── RIGHT PANEL ── */}
        <ScrollView style={s.main} contentContainerStyle={s.mainContent} showsVerticalScrollIndicator={false}>

          {/* ══ USB ACTIVITY LOG ══ */}
          <SectionCard
            title="USB Activity Log"
            icon="format-list-bulleted"
            color={C.blue}
            right={
              <View style={log.filters}>
                <Pressable
                  style={[log.filterBtn, { borderColor: "rgba(255,80,60,0.4)", backgroundColor: "rgba(255,80,60,0.08)" }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); clearPackets(); }}
                >
                  <MaterialCommunityIcons name="delete-sweep-outline" size={11} color={C.red} />
                </Pressable>
              </View>
            }
          >
            {/* Stats header inside log */}
            <View style={log.statBar}>
              <View style={log.statPill}>
                <View style={[log.statDot, { backgroundColor: C.blue }]} />
                <Text style={log.statTxt}>RX {rxPkts.length} pkts · {rxBytes > 1024 ? `${(rxBytes/1024).toFixed(1)} KB` : `${rxBytes} B`}</Text>
              </View>
              <View style={log.statPill}>
                <View style={[log.statDot, { backgroundColor: C.green }]} />
                <Text style={log.statTxt}>TX {txPkts.length} pkts · {txBytes > 1024 ? `${(txBytes/1024).toFixed(1)} KB` : `${txBytes} B`}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Text style={log.statRate}>{dataRateKbps} KB/s</Text>
            </View>

            {/* Packet list */}
            {filteredPackets.length === 0 ? (
              <View style={log.empty}>
                <MaterialCommunityIcons name="usb-port" size={28} color={C.dim} />
                <Text style={log.emptyTitle}>No Packets</Text>
                <Text style={log.emptySub}>
                  {isConnected ? "Waiting for data from USB device…" : "Connect a USB device to see live data"}
                </Text>
                {!isConnected && (
                  <Pressable
                    style={log.connectBtn}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); quickConnect(); }}
                  >
                    <MaterialCommunityIcons name="usb" size={14} color={C.bg} />
                    <Text style={log.connectBtnTxt}>Connect USB</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View>
                {filteredPackets.map((pkt, i) => (
                  <PacketRow
                    key={pkt.id}
                    index={filteredPackets.length - i}
                    direction={pkt.direction}
                    data={pkt.data}
                    hex={pkt.hexView}
                    byteLength={pkt.byteLength}
                    timestamp={pkt.timestamp}
                  />
                ))}
                {packets.length > 200 && (
                  <View style={log.truncBar}>
                    <MaterialCommunityIcons name="information-outline" size={12} color={C.yellow} />
                    <Text style={log.truncTxt}>Showing latest 200 of {packets.length} total packets</Text>
                  </View>
                )}
              </View>
            )}
          </SectionCard>

          {/* ══ DEVICE INFORMATION ══ */}
          <SectionCard title="Device Information" icon="chip" color={C.blue}>
            <InfoRow icon="identifier"    label="Device Name"     value={selectedDevice?.name ?? "—"} />
            <InfoRow icon="factory"       label="Manufacturer"    value={selectedDevice?.manufacturerName ?? "—"} />
            <InfoRow icon="barcode"       label="Serial Number"   value={selectedDevice?.serialNumber ?? "—"} mono />
            <InfoRow icon="chip"          label="Vendor ID"       value={selectedDevice?.vendorId  != null ? `0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4,"0")}`  : "—"} color={C.blue} mono />
            <InfoRow icon="chip"          label="Product ID"      value={selectedDevice?.productId != null ? `0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4,"0")}` : "—"} color={C.blue} mono />
            <InfoRow icon="connection"    label="Connection"      value={isConnected ? "Active" : connectionStatus.toUpperCase()} color={isConnected ? C.green : C.muted} last />
          </SectionCard>

          {/* ══ PROTOCOL & TRANSPORT ══ */}
          <SectionCard title="Protocol & Transport" icon="lan" color={C.green}>
            <InfoRow icon="ethernet"         label="Protocol"       value={Platform.OS === "web" ? "WebUSB API" : Platform.OS === "android" ? "USB OTG Serial" : "MFi Accessory"} color={C.green} />
            <InfoRow icon="server-network"   label="Platform"       value={Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} />
            <InfoRow icon="speedometer"      label="Data Rate"      value={`${dataRateKbps} KB/s`}           color={C.orange} />
            <InfoRow icon="counter"          label="Pkt Rate"       value={`${pktRate} pkt/s`}               color={C.blue} />
            <InfoRow icon="clock-outline"    label="Session Time"   value={fmtUptime(sessionSec)}            color={C.muted} />
            <InfoRow icon="database"         label="Total Bytes"    value={totalBytes > 1024 ? `${(totalBytes/1024).toFixed(2)} KB` : `${totalBytes} B`} last />
          </SectionCard>

          {/* ══ DATA SETTINGS ══ */}
          <SectionCard title="Data & Display" icon="chart-bar" color={C.yellow}>
            <ToggleRow icon="hexadecimal"           label="Hex Display Mode"   desc="Show data as hexadecimal values"        value={hexDisplay}      onChange={setHexDisplay} />
            <ToggleRow icon="file-document-outline" label="Log All Packets"    desc="Keep full history in memory"            value={logAll}          onChange={setLogAll} />
          </SectionCard>

          {/* ══ CONNECTION SETTINGS ══ */}
          <SectionCard title="Connection" icon="connection" color={C.orange}>
            <ToggleRow icon="refresh-auto"    label="Auto Reconnect"    desc="Reconnect automatically on disconnect"    value={autoReconnect}   onChange={setAutoReconnect} />
            {/* Baud rate selector */}
            <View style={[rw.wrap, { paddingVertical: 10, flexWrap: "wrap", gap: 6 }]}>
              <MaterialCommunityIcons name="speedometer" size={14} color={C.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 11, fontWeight: "600", marginBottom: 4 }}>Baud Rate</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                  {BAUD_RATES.map((rate) => (
                    <Pressable
                      key={rate}
                      style={[
                        bd.chip,
                        baudRate === rate && bd.chipActive,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setBaudRate(rate as BaudRate);
                      }}
                    >
                      <Text style={[bd.chipTxt, baudRate === rate && bd.chipTxtActive]}>
                        {rate >= 1000 ? `${rate / 1000}k` : rate}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </SectionCard>

          {/* ══ APP SETTINGS ══ */}
          <SectionCard title="App Settings" icon="tune" color={C.purple}>
            <ToggleRow icon="theme-light-dark" label="Dark Mode"           desc="Always use dark interface"             value={darkMode}        onChange={setDarkMode} />
            <ToggleRow icon="vibrate"          label="Haptic Feedback"     desc="Vibration on button press"             value={vibration}       onChange={setVibration} />
          </SectionCard>

          {/* ══ ABOUT ══ */}
          <SectionCard title="About" icon="information-outline" color={C.muted}>
            <InfoRow icon="application-cog"   label="App Version"    value="1.0.0" />
            <InfoRow icon="code-tags"         label="Build"          value="Expo SDK 54" />
            <InfoRow icon="cellphone-link"    label="USB API"        value={Platform.OS === "web" ? "WebUSB W3C" : "Native USB"} last />
          </SectionCard>

          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
      <BottomNav />
    </View>
  );
}

const bd = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderWidth: Border.width, borderColor: Border.color,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  chipActive: {
    borderColor: `${Colors.primary}66`,
    backgroundColor: `${Colors.primary}18`,
  },
  chipTxt: { ...Typography.labelCaps, color: C.muted, fontSize: 9 },
  chipTxtActive: { color: C.orange },
});

const log = StyleSheet.create({
  filters: { flexDirection: "row", gap: Spacing.xs, alignItems: "center" },
  filterBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderWidth: Border.width, borderColor: Border.color, alignItems: "center", justifyContent: "center" },
  filterTxt: { ...Typography.labelCaps, fontSize: 8 },

  statBar: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.panelPadding, paddingVertical: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Colors.surfaceContainerHigh, backgroundColor: Colors.surfaceContainerLowest },
  statPill: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  statDot:  { width: 6, height: 6, borderRadius: 3 },
  statTxt:  { ...Typography.labelCaps, color: C.muted, fontSize: 8 },
  statRate: { ...Typography.labelCaps, color: C.orange, fontSize: 8 },

  empty: { padding: Spacing.margin, alignItems: "center", gap: Spacing.sm },
  emptyTitle: { ...Typography.headlineMd, color: C.muted, fontSize: 13 },
  emptySub: { ...Typography.bodyMd, color: C.dim, fontSize: 10, textAlign: "center", maxWidth: 240 },
  connectBtn: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: C.green, paddingHorizontal: Spacing.gutter, paddingVertical: Spacing.sm, marginTop: Spacing.sm },
  connectBtnTxt: { ...Typography.labelCaps, color: C.bg, fontSize: 11 },

  truncBar: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.panelPadding, borderTopWidth: Border.width, borderTopColor: Border.color },
  truncTxt: { ...Typography.bodyMd, color: C.yellow, fontSize: 10 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, flexDirection: "column" },
  body: { flex: 1, flexDirection: "row" },

  sidebar: { width: 220, borderRightWidth: Border.width, borderRightColor: Border.color, backgroundColor: C.panel, padding: Spacing.panelPadding, gap: Spacing.sm },

  connCard: { backgroundColor: C.card, borderWidth: Border.width, borderColor: Border.color, padding: Spacing.panelPadding, gap: Spacing.sm },
  connCardHead: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  connCardTitle: { ...Typography.labelCaps, color: C.text, fontSize: 11 },
  connStatus: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, borderWidth: Border.width, paddingHorizontal: Spacing.panelPadding, paddingVertical: Spacing.sm },
  connStatusDot: { width: 6, height: 6, borderRadius: 3 },
  connStatusTxt: { ...Typography.labelCaps, fontSize: 9 },
  devName: { ...Typography.headlineMd, color: C.text, fontSize: 12 },
  devMfr:  { ...Typography.bodyMd, color: C.muted, fontSize: 10 },
  devVid:  { ...Typography.labelCaps, color: C.blue, fontSize: 8 },
  connBtns: { flexDirection: "row", gap: Spacing.sm },
  connBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.xs, borderWidth: Border.width, paddingVertical: Spacing.sm },
  connBtnTxt: { ...Typography.labelCaps, fontSize: 10 },

  gaugeRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: Spacing.xs },
  miniStat: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Border.color },
  miniStatLabel: { ...Typography.labelCaps, flex: 1, color: C.muted, fontSize: 9 },
  miniStatVal: { ...Typography.dataMono, fontSize: 11 },

  main: { flex: 1 },
  mainContent: { padding: Spacing.gutter },
});
