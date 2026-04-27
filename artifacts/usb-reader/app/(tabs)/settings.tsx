import React, { useState, useMemo } from "react";
import {
  ActivityIndicator, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";

const C = {
  bg:     "rgba(21,25,27,1)",
  panel:  "rgba(26,30,32,1)",
  card:   "rgba(32,36,38,1)",
  border: "rgba(51,56,58,1)",
  text:   "rgba(220,221,221,1)",
  muted:  "rgba(120,122,122,1)",
  dim:    "rgba(60,62,62,1)",
  dimBg:  "rgba(28,32,34,1)",
  green:  "#6EDCA1",
  yellow: "#FFC832",
  orange: "#FF9811",
  red:    "#FF503C",
  blue:   "#50B4FF",
  purple: "#A78BFA",
  terminal: "#020810",
};

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type LogFilter = "all" | "rx" | "tx";

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
  card: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: "hidden", marginBottom: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  iconBox: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  title: { color: C.text, fontSize: 12, fontWeight: "700", flex: 1 },
  bar: { width: 3, height: 16, borderRadius: 2 },
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
  wrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)" },
  label: { flex: 1, color: C.muted, fontSize: 11 },
  value: { color: C.text, fontSize: 11, fontWeight: "600", maxWidth: "55%" },
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
  row: { paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,0.6)" },
  topLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  indexBox: { width: 28, alignItems: "flex-end" },
  index: { color: "rgba(45,48,50,1)", fontSize: 9, fontWeight: "700", fontFamily: "monospace" },
  dirBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  dirTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  time: { color: C.muted, fontSize: 8, fontFamily: "monospace", width: 68 },
  bytes: { color: C.dim, fontSize: 8, fontWeight: "600", width: 26 },
  data: { flex: 1, color: "rgba(140,220,170,1)", fontSize: 9, fontFamily: "monospace" },
  expandBox: { marginTop: 6, backgroundColor: "rgba(10,14,16,1)", borderRadius: 6, padding: 8, gap: 4 },
  expandRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  expandLabel: { color: C.dim, fontSize: 8, fontWeight: "700", width: 28, paddingTop: 1 },
  expandVal: { flex: 1, color: C.text, fontSize: 9 },
});

// ─── MAIN ────────────────────────────────────────────────────
export default function SettingsScreen() {
  const {
    devices, selectedDevice, connectionStatus, packets,
    isScanning, isConnecting, scanForDevices, connectDevice,
    disconnectDevice, clearPackets, quickConnect,
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
  const [logFilter, setLogFilter]   = useState<LogFilter>("all");
  const [showHex, setShowHex]       = useState(false);

  const filteredPackets = useMemo(() => {
    const list = logFilter === "rx" ? rxPkts : logFilter === "tx" ? txPkts : [...packets];
    return list.slice().reverse().slice(0, 200);
  }, [packets, logFilter]);

  return (
    <View style={s.root}>
      <AppHeader title="Settings" icon="cog-outline" iconColor={C.muted} />

      <View style={s.body}>
        {/* ── LEFT SIDEBAR ── */}
        <View style={s.sidebar}>
          {/* Connection card */}
          <View style={s.connCard}>
            <View style={s.connCardHead}>
              <MaterialCommunityIcons name="connection" size={14} color={C.blue} />
              <Text style={s.connCardTitle}>Connection</Text>
            </View>
            <View style={[s.connStatus, {
              backgroundColor: isConnected ? "rgba(110,220,161,0.08)" : "rgba(255,80,60,0.06)",
              borderColor:     isConnected ? "rgba(110,220,161,0.35)" : "rgba(255,80,60,0.3)",
            }]}>
              <View style={[s.connStatusDot, { backgroundColor: isConnected ? C.green : C.red }]} />
              <Text style={[s.connStatusTxt, { color: isConnected ? C.green : C.red }]}>
                {isConnected ? "● CONNECTED" : "○ OFFLINE"}
              </Text>
            </View>
            {selectedDevice && (
              <View style={{ gap: 4, marginTop: 4 }}>
                <Text style={s.devName}>{selectedDevice.name}</Text>
                <Text style={s.devMfr}>{selectedDevice.manufacturerName ?? "Unknown manufacturer"}</Text>
                <Text style={s.devVid}>
                  VID {selectedDevice.vendorId?.toString(16).toUpperCase() ?? "—"} · PID {selectedDevice.productId?.toString(16).toUpperCase() ?? "—"}
                </Text>
                {selectedDevice.serialNumber && (
                  <Text style={s.devVid}>SN: {selectedDevice.serialNumber}</Text>
                )}
              </View>
            )}
            <View style={s.connBtns}>
              <Pressable
                style={[s.connBtn, { backgroundColor: "rgba(80,180,255,0.1)", borderColor: "rgba(80,180,255,0.35)" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); scanForDevices(); }}
                disabled={isScanning}
              >
                {isScanning
                  ? <ActivityIndicator size="small" color={C.blue} />
                  : <MaterialCommunityIcons name="magnify" size={13} color={C.blue} />}
                <Text style={[s.connBtnTxt, { color: C.blue }]}>{isScanning ? "Scanning..." : "Scan"}</Text>
              </Pressable>
              <Pressable
                style={[s.connBtn, {
                  backgroundColor: isConnected ? "rgba(255,80,60,0.1)" : "rgba(110,220,161,0.1)",
                  borderColor:     isConnected ? "rgba(255,80,60,0.35)" : "rgba(110,220,161,0.35)",
                }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  if (isConnected) disconnectDevice();
                  else if (selectedDevice) connectDevice(selectedDevice);
                  else quickConnect();
                }}
                disabled={isConnecting}
              >
                {isConnecting
                  ? <ActivityIndicator size="small" color={C.green} />
                  : <MaterialCommunityIcons name={isConnected ? "link-off" : "link"} size={13} color={isConnected ? C.red : C.green} />}
                <Text style={[s.connBtnTxt, { color: isConnected ? C.red : C.green }]}>
                  {isConnected ? "Disconnect" : "Connect"}
                </Text>
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
                {(["all", "rx", "tx"] as LogFilter[]).map((f) => (
                  <Pressable
                    key={f}
                    style={[log.filterBtn, logFilter === f && {
                      backgroundColor: f === "rx" ? "rgba(80,180,255,0.18)" : f === "tx" ? "rgba(110,220,161,0.18)" : "rgba(255,200,50,0.12)",
                      borderColor:     f === "rx" ? "rgba(80,180,255,0.5)"  : f === "tx" ? "rgba(110,220,161,0.5)"  : "rgba(255,200,50,0.4)",
                    }]}
                    onPress={() => setLogFilter(f)}
                  >
                    <Text style={[log.filterTxt, {
                      color: logFilter === f ? (f === "rx" ? C.blue : f === "tx" ? C.green : C.yellow) : C.muted,
                    }]}>
                      {f.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
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

const log = StyleSheet.create({
  filters: { flexDirection: "row", gap: 4, alignItems: "center" },
  filterBtn: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  filterTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },

  statBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)", backgroundColor: "rgba(18,22,24,1)" },
  statPill: { flexDirection: "row", alignItems: "center", gap: 5 },
  statDot:  { width: 6, height: 6, borderRadius: 3 },
  statTxt:  { color: C.muted, fontSize: 9, fontWeight: "600" },
  statRate: { color: C.orange, fontSize: 9, fontWeight: "700" },

  empty: { padding: 32, alignItems: "center", gap: 10 },
  emptyTitle: { color: C.muted, fontSize: 14, fontWeight: "700" },
  emptySub: { color: C.dim, fontSize: 10, textAlign: "center", maxWidth: 240 },
  connectBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9, marginTop: 6 },
  connectBtnTxt: { color: C.bg, fontSize: 12, fontWeight: "800" },

  truncBar: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: C.border },
  truncTxt: { color: C.yellow, fontSize: 10 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, flexDirection: "column" },
  body: { flex: 1, flexDirection: "row" },

  sidebar: { width: 220, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.panel, padding: 10, gap: 8 },

  connCard: { backgroundColor: C.card, borderRadius: 9, borderWidth: 1, borderColor: C.border, padding: 10, gap: 8 },
  connCardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  connCardTitle: { color: C.text, fontSize: 12, fontWeight: "700" },
  connStatus: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  connStatusDot: { width: 6, height: 6, borderRadius: 3 },
  connStatusTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  devName: { color: C.text, fontSize: 12, fontWeight: "700" },
  devMfr:  { color: C.muted, fontSize: 10 },
  devVid:  { color: C.blue, fontSize: 9, fontWeight: "600" },
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
