import React, { useState } from "react";
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { useParsedUsbData } from "@/hooks/useParsedUsbData";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";

// ─── Theme ─────────────────────────────────────────────────────
const C = {
  bg:      "rgba(21,25,27,1)",
  panel:   "rgba(26,30,32,1)",
  card:    "rgba(32,36,38,1)",
  row:     "rgba(28,32,34,1)",
  border:  "rgba(51,56,58,1)",
  rowDiv:  "rgba(40,44,46,1)",
  text:    "rgba(220,221,221,1)",
  muted:   "rgba(120,122,122,1)",
  dim:     "rgba(60,62,62,1)",
  dimBg:   "rgba(35,39,41,1)",
  green:   "#6EDCA1",
  yellow:  "#FFC832",
  red:     "#FF503C",
  orange:  "#FF9811",
  blue:    "#50B4FF",
};

// ─── Helpers ───────────────────────────────────────────────────
const fmt = (v: number, dec = 1) =>
  v === 0 ? "—" : v.toFixed(dec);

function socColor(s: number) {
  return s > 60 ? C.green : s > 30 ? C.yellow : C.red;
}
function tempColor(t: number, warn = 50, err = 70) {
  return t > err ? C.red : t > warn ? C.orange : C.blue;
}
function fmtUptime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${ss}s` : `${ss}s`;
}

// ─── Row ───────────────────────────────────────────────────────
function Row({
  label, value, color, last,
}: { label: string; value: string; color?: string; last?: boolean }) {
  return (
    <View style={[r.row, last && { borderBottomWidth: 0 }]}>
      <Text style={r.label}>{label}</Text>
      <Text style={[r.value, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}
const r = StyleSheet.create({
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.rowDiv,
  },
  label: { color: C.muted, fontSize: 11 },
  value: { color: C.text, fontSize: 12, fontWeight: "700" },
});

// ─── Section header ────────────────────────────────────────────
function Section({ title }: { title: string }) {
  return <Text style={sec.t}>{title}</Text>;
}
const sec = StyleSheet.create({
  t: {
    color: C.dim, fontSize: 9, fontWeight: "700", letterSpacing: 1.2,
    textTransform: "uppercase", marginTop: 14, marginBottom: 4,
  },
});

// ─── Status dot ────────────────────────────────────────────────
function StatusDot({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={sd.wrap}>
      <View style={[sd.dot, { backgroundColor: active ? C.green : C.dimBg }]} />
      <Text style={[sd.lbl, active && { color: "rgba(200,201,201,1)" }]}>{label}</Text>
    </View>
  );
}
const sd = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 90 },
  dot:  { width: 9, height: 9, borderRadius: 5 },
  lbl:  { color: C.muted, fontSize: 10, fontWeight: "600" },
});

// ─── Big metric card ───────────────────────────────────────────
function MetricCard({
  icon, label, value, unit, color, bg,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string; value: string; unit: string; color: string; bg: string;
}) {
  return (
    <View style={[mc.card, { borderColor: `${color}35` }]}>
      <View style={[mc.icon, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name={icon} size={16} color={color} />
      </View>
      <Text style={[mc.val, { color }]}>{value}</Text>
      <Text style={mc.unit}>{unit}</Text>
      <Text style={mc.lbl}>{label}</Text>
    </View>
  );
}
const mc = StyleSheet.create({
  card: {
    flex: 1, alignItems: "center", backgroundColor: C.card,
    borderRadius: 10, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, gap: 3,
  },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  val:  { fontSize: 22, fontWeight: "700" },
  unit: { color: C.muted, fontSize: 9 },
  lbl:  { color: C.muted, fontSize: 9, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
});

// ─── Subsystem tabs ────────────────────────────────────────────
type Tab = "bms" | "motor" | "dcdc" | "charger" | "system";
const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; color: string }[] = [
  { id: "bms",     label: "BMS",     icon: "battery-high",          color: C.green  },
  { id: "motor",   label: "Motor",   icon: "engine",                color: C.yellow },
  { id: "dcdc",    label: "DC-DC",   icon: "electric-switch",       color: C.blue   },
  { id: "charger", label: "Charger", icon: "ev-plug-type2",         color: C.orange },
  { id: "system",  label: "System",  icon: "chip",                  color: C.muted  },
];

// ─── MAIN SCREEN ───────────────────────────────────────────────
export default function DiagnosticsScreen() {
  const { packets, connectionStatus, quickConnect, disconnectDevice } = useUsb();
  const p = useParsedUsbData(packets);
  const isConnected = connectionStatus === "connected";

  const [activeTab, setActiveTab] = useState<Tab>("bms");
  const [subsystemOn, setSubsystemOn] = useState<Record<Tab, boolean>>({
    bms: true, motor: false, dcdc: false, charger: false, system: true,
  });

  const toggle = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubsystemOn((prev) => ({ ...prev, [tab]: !prev[tab] }));
  };

  const isOn = subsystemOn[activeTab];
  const ac   = TABS.find((t) => t.id === activeTab)!;

  // ── Per-subsystem big cards ──
  const bigCards: {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
    label: string; value: string; unit: string; color: string; bg: string;
  }[] = activeTab === "bms" ? [
    { icon: "battery-high",    label: "SOC",       value: isConnected ? Math.round(p.soc).toString() : "—",   unit: "%",  color: socColor(p.soc),          bg: `${socColor(p.soc)}20` },
    { icon: "lightning-bolt",  label: "Voltage",   value: isConnected ? fmt(p.packVoltageV) : "—",            unit: "V",  color: C.blue,                   bg: "rgba(80,180,255,0.12)" },
    { icon: "current-ac",      label: "Current",   value: isConnected ? fmt(p.packCurrentA) : "—",            unit: "A",  color: C.yellow,                 bg: "rgba(255,200,50,0.12)" },
    { icon: "thermometer",     label: "Pack Temp", value: isConnected ? fmt(p.packTempC) : "—",               unit: "°C", color: tempColor(p.packTempC),   bg: `${tempColor(p.packTempC)}18` },
  ] : activeTab === "motor" ? [
    { icon: "engine",          label: "RPM",       value: isConnected ? Math.round(p.motorRpm).toString() : "—", unit: "rpm", color: C.yellow,             bg: "rgba(255,200,50,0.12)" },
    { icon: "speedometer",     label: "Load",      value: isConnected ? Math.round(p.motorLoadPct).toString() : "—", unit: "%", color: p.motorLoadPct > 80 ? C.red : C.green, bg: "rgba(110,220,161,0.12)" },
    { icon: "thermometer",     label: "Temp",      value: isConnected ? fmt(p.motorTempC) : "—",              unit: "°C", color: tempColor(p.motorTempC,55,75), bg: `${tempColor(p.motorTempC,55,75)}18` },
    { icon: "timer-outline",   label: "Uptime",    value: isConnected && p.uptimeSec > 0 ? fmtUptime(p.uptimeSec) : "—", unit: "", color: C.muted,       bg: "rgba(120,122,122,0.1)" },
  ] : activeTab === "dcdc" ? [
    { icon: "lightning-bolt",  label: "Output V",  value: isConnected ? fmt(p.dcdcVoltV) : "—",               unit: "V",  color: C.blue,                   bg: "rgba(80,180,255,0.12)" },
    { icon: "current-dc",      label: "Current",   value: isConnected ? fmt(p.dcdcCurrentA) : "—",            unit: "A",  color: C.green,                  bg: "rgba(110,220,161,0.12)" },
    { icon: "thermometer",     label: "Temp",      value: isConnected ? fmt(p.dcdcTempC) : "—",               unit: "°C", color: tempColor(p.dcdcTempC),   bg: `${tempColor(p.dcdcTempC)}18` },
    { icon: "transfer",        label: "Efficiency", value: isConnected && p.dcdcVoltV > 0 && p.packVoltageV > 0 ? `${Math.round((p.dcdcVoltV * p.dcdcCurrentA) / (p.packVoltageV * 0.05) * 100)}` : "—", unit: "%", color: C.muted, bg: "rgba(120,122,122,0.1)" },
  ] : activeTab === "charger" ? [
    { icon: "ev-plug-type2",   label: "Status",    value: isConnected ? p.chrgrStatus : "—",                  unit: "",   color: p.chrgrStatus === "Charging" ? C.green : C.muted, bg: "rgba(110,220,161,0.12)" },
    { icon: "lightning-bolt",  label: "Chgr V",    value: isConnected ? fmt(p.chrgrVoltV) : "—",             unit: "V",  color: C.blue,                   bg: "rgba(80,180,255,0.12)" },
    { icon: "current-ac",      label: "Chgr I",    value: isConnected ? fmt(p.chrgrCurrentA) : "—",          unit: "A",  color: C.yellow,                 bg: "rgba(255,200,50,0.12)" },
    { icon: "battery-charging-high", label: "Pack SOC", value: isConnected ? `${Math.round(p.soc)}` : "—",  unit: "%",  color: socColor(p.soc),          bg: `${socColor(p.soc)}20` },
  ] : [
    { icon: "heartbeat",       label: "Heartbeat", value: isConnected ? p.heartbeat.toString() : "—",         unit: "#",  color: C.green,                  bg: "rgba(110,220,161,0.12)" },
    { icon: "counter",         label: "Packets",   value: isConnected ? p.rxCount.toString() : "—",           unit: "rx", color: C.blue,                   bg: "rgba(80,180,255,0.12)" },
    { icon: "database",        label: "RX Bytes",  value: isConnected ? `${(p.totalRxBytes/1024).toFixed(1)}` : "—", unit: "KB", color: C.muted,         bg: "rgba(120,122,122,0.1)" },
    { icon: "wifi",            label: "Data Rate", value: isConnected ? fmt(p.dataRateKbps, 2) : "—",         unit: "KB/s", color: C.orange,             bg: "rgba(255,152,17,0.12)" },
  ];

  return (
    <View style={s.root}>
      <AppHeader title="Diagnostics" icon="stethoscope" iconColor={C.green} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {/* ── USB connection banner ── */}
        <Pressable
          style={[s.connBanner, {
            backgroundColor: isConnected ? "rgba(110,220,161,0.07)" : "rgba(255,80,60,0.06)",
            borderColor: isConnected ? "rgba(110,220,161,0.3)" : "rgba(255,80,60,0.25)",
          }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); isConnected ? disconnectDevice() : quickConnect(); }}
        >
          <View style={[s.connDot, { backgroundColor: isConnected ? C.green : C.red }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.connTitle, { color: isConnected ? C.green : C.red }]}>
              {isConnected ? "● USB CONNECTED — Real-time telemetry active" : "○ USB OFFLINE — Tap to connect"}
            </Text>
            {isConnected && (
              <Text style={s.connSub}>
                {p.rxCount} packets · {(p.totalRxBytes / 1024).toFixed(1)} KB received · {p.dataRateKbps.toFixed(2)} KB/s
              </Text>
            )}
          </View>
          <MaterialCommunityIcons
            name={isConnected ? "link" : "link-off"}
            size={18}
            color={isConnected ? C.green : C.red}
          />
        </Pressable>

        {/* ── Subsystem tab bar ── */}
        <View style={s.tabRow}>
          {TABS.map((t) => {
            const sel = t.id === activeTab;
            return (
              <Pressable
                key={t.id}
                style={[s.tab, sel && { backgroundColor: `${t.color}18`, borderColor: `${t.color}45` }]}
                onPress={() => { Haptics.selectionAsync(); setActiveTab(t.id); }}
              >
                <MaterialCommunityIcons name={t.icon} size={14} color={sel ? t.color : C.muted} />
                <Text style={[s.tabLbl, { color: sel ? t.color : C.muted }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Active / Inactive badge ── */}
        <View style={[s.badge, isOn
          ? { backgroundColor: "rgba(110,220,161,0.08)", borderColor: "rgba(110,220,161,0.3)" }
          : { backgroundColor: "rgba(255,80,60,0.08)",  borderColor: "rgba(255,80,60,0.3)" },
        ]}>
          <MaterialCommunityIcons name={ac.icon} size={18} color={isOn ? C.green : C.red} />
          <Text style={s.badgeTitle}>{ac.label} — DIAGNOSTICS</Text>
          <View style={{ flex: 1 }} />
          <View style={[s.badgeDot, { backgroundColor: isOn ? C.green : C.red }]} />
          <Text style={[s.badgeState, { color: isOn ? C.green : C.red }]}>
            {isOn ? "ACTIVE" : "INACTIVE"}
          </Text>
        </View>

        {/* ── Big metric cards ── */}
        <View style={s.cardRow}>
          {bigCards.slice(0, 2).map((c) => (
            <MetricCard key={c.label} {...c} />
          ))}
        </View>
        <View style={[s.cardRow, { marginTop: 6 }]}>
          {bigCards.slice(2, 4).map((c) => (
            <MetricCard key={c.label} {...c} />
          ))}
        </View>

        {/* ── Divider ── */}
        <View style={s.div} />

        {/* ── Detailed rows per tab ── */}
        {activeTab === "bms" && (
          <>
            <Section title="Battery Pack" />
            <Row label="State of Charge" value={isConnected ? `${Math.round(p.soc)}%` : "—"} color={socColor(p.soc)} />
            <Row label="Pack Voltage" value={isConnected ? `${fmt(p.packVoltageV)} V` : "—"} />
            <Row label="Pack Current" value={isConnected ? `${fmt(p.packCurrentA)} A` : "—"} />
            <Row label="Pack Temperature" value={isConnected ? `${fmt(p.packTempC)} °C` : "—"} color={tempColor(p.packTempC)} />
            <Row label="Supply Voltage (VCC)" value={isConnected ? `${p.vccV.toFixed(2)} V` : "—"} />
            <Row label="Board Temp" value={isConnected ? `${fmt(p.boardTempC)} °C` : "—"} last />
            <Section title="Relay Status" />
            <View style={s.dotGrid}>
              <StatusDot label="Main Relay" active={p.relayMain} />
              <StatusDot label="Fan"        active={p.relayFan} />
              <StatusDot label="Charger"    active={p.relayChrg} />
              <StatusDot label="Pack"       active={p.relayPack} />
            </View>
          </>
        )}

        {activeTab === "motor" && (
          <>
            <Section title="Motor Drive" />
            <Row label="Speed" value={isConnected ? `${Math.round(p.motorRpm)} RPM` : "—"} color={C.yellow} />
            <Row label="Load" value={isConnected ? `${Math.round(p.motorLoadPct)} %` : "—"} color={p.motorLoadPct > 80 ? C.red : C.green} />
            <Row label="Motor Temperature" value={isConnected ? `${fmt(p.motorTempC)} °C` : "—"} color={tempColor(p.motorTempC, 55, 75)} />
            <Row label="Uptime" value={isConnected && p.uptimeSec > 0 ? fmtUptime(p.uptimeSec) : "—"} />
            <Row label="Heartbeat Count" value={isConnected ? p.heartbeat.toString() : "—"} last />
          </>
        )}

        {activeTab === "dcdc" && (
          <>
            <Section title="DC-DC Converter" />
            <Row label="Output Voltage" value={isConnected ? `${fmt(p.dcdcVoltV)} V` : "—"} color={C.blue} />
            <Row label="Output Current" value={isConnected ? `${fmt(p.dcdcCurrentA)} A` : "—"} color={C.green} />
            <Row label="Converter Temp" value={isConnected ? `${fmt(p.dcdcTempC)} °C` : "—"} color={tempColor(p.dcdcTempC)} />
            <Row label="Input (Pack) Voltage" value={isConnected ? `${fmt(p.packVoltageV)} V` : "—"} />
            <Row label="Status" value={isConnected && p.dcdcVoltV > 0 ? "Running" : "Standby"} color={isConnected && p.dcdcVoltV > 0 ? C.green : C.muted} last />
          </>
        )}

        {activeTab === "charger" && (
          <>
            <Section title="Charger" />
            <Row label="Status" value={isConnected ? p.chrgrStatus : "—"} color={p.chrgrStatus === "Charging" ? C.green : C.yellow} />
            <Row label="Charger Voltage" value={isConnected ? `${fmt(p.chrgrVoltV)} V` : "—"} color={C.blue} />
            <Row label="Charger Current" value={isConnected ? `${fmt(p.chrgrCurrentA)} A` : "—"} color={C.green} />
            <Row label="Battery SOC" value={isConnected ? `${Math.round(p.soc)} %` : "—"} color={socColor(p.soc)} />
            <Row label="Pack Voltage" value={isConnected ? `${fmt(p.packVoltageV)} V` : "—"} last />
          </>
        )}

        {activeTab === "system" && (
          <>
            <Section title="Communication" />
            <Row label="RX Packets" value={isConnected ? p.rxCount.toString() : "—"} color={C.blue} />
            <Row label="TX Packets" value={isConnected ? p.txCount.toString() : "—"} color={C.green} />
            <Row label="Data Rate" value={isConnected ? `${p.dataRateKbps.toFixed(2)} KB/s` : "—"} />
            <Row label="Total Received" value={isConnected ? `${(p.totalRxBytes / 1024).toFixed(1)} KB` : "—"} />
            <Row label="Heartbeat" value={isConnected ? p.heartbeat.toString() : "—"} last />
            <Section title="Last Packet" />
            <View style={s.packetBox}>
              <Text style={s.packetTime}>{p.lastPacketTime || "—"}</Text>
              <Text style={s.packetData} numberOfLines={3}>{p.lastPacketData || "No data received"}</Text>
            </View>
          </>
        )}

        {/* ── Activate / Deactivate ── */}
        <View style={s.div} />
        <View style={s.actions}>
          <Pressable
            style={[s.actBtn, isOn ? s.actDeactivate : s.actActivate]}
            onPress={() => toggle(activeTab)}
          >
            <MaterialCommunityIcons
              name={isOn ? "stop-circle-outline" : "play-circle-outline"}
              size={18}
              color={isOn ? C.red : C.bg}
            />
            <Text style={[s.actTxt, isOn && { color: C.red }]}>
              {isOn ? `DEACTIVATE ${ac.label.toUpperCase()}` : `ACTIVATE ${ac.label.toUpperCase()}`}
            </Text>
          </Pressable>
        </View>

        <View style={{ height: 12 }} />
      </ScrollView>

      <BottomNav />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg, flexDirection: "column" },
  body:   { padding: 12, gap: 0 },

  connBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12,
  },
  connDot:   { width: 8, height: 8, borderRadius: 4 },
  connTitle: { fontSize: 11, fontWeight: "700" },
  connSub:   { color: C.muted, fontSize: 9, marginTop: 2 },

  tabRow: { flexDirection: "row", gap: 5, marginBottom: 10 },
  tab: {
    flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center",
    paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.panel, gap: 2,
  },
  tabLbl: { fontSize: 8, fontWeight: "700", letterSpacing: 0.3 },

  badge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12,
  },
  badgeTitle:  { color: C.text, fontSize: 13, fontWeight: "700" },
  badgeDot:    { width: 7, height: 7, borderRadius: 4 },
  badgeState:  { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  cardRow: { flexDirection: "row", gap: 6 },

  div: { height: 1, backgroundColor: C.border, marginVertical: 14 },

  dotGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4,
  },

  packetBox: {
    backgroundColor: C.card, borderRadius: 8, borderWidth: 1,
    borderColor: C.border, padding: 10, gap: 4,
  },
  packetTime: { color: C.dim, fontSize: 9 },
  packetData: { color: "rgba(140,220,170,1)", fontSize: 10, fontFamily: "monospace" },

  actions: { gap: 8 },
  actBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 10, paddingVertical: 13, borderWidth: 1,
  },
  actActivate:   { backgroundColor: C.green, borderColor: C.green },
  actDeactivate: { backgroundColor: "rgba(255,80,60,0.08)", borderColor: "rgba(255,80,60,0.4)" },
  actTxt: { color: C.bg, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
});
