import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { useParsedUsbData } from "@/hooks/useParsedUsbData";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";

import { Colors, Typography, Spacing, Border } from "@/theme";

// ─── Theme alias ───────────────────────────────────────────────
const C = {
  bg:      Colors.background,
  panel:   Colors.surfaceContainerLow,
  card:    Colors.surfaceContainer,
  row:     Colors.surfaceContainerLow,
  border:  Colors.outlineVariant,
  rowDiv:  Colors.surfaceContainerHigh,
  text:    Colors.onSurface,
  muted:   Colors.onSurfaceVariant,
  dim:     Colors.dim,
  dimBg:   Colors.surfaceContainerHigh,
  green:   Colors.tertiary,
  yellow:  Colors.primaryFixedDim,
  red:     Colors.error,
  orange:  Colors.primary,
  blue:    Colors.secondary,
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

  
  return (
    <View style={s.root}>
      <Header />
      {/* Shared USB connection bar */}
      <UsbConnectionBar compact />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {/* Top Metrics Row - 6 Cards */}
        <View style={s.topMetricsRow}>
          {/* Pack Voltage */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>PACK VOLTAGE</Text>
            <View style={[s.metricDivider, { backgroundColor: "#92ccff" }]} />
            <View style={s.metricValueRow}>
              <Text style={s.metricValue}>{isConnected ? fmt(p.packVoltageV) : "—"}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* Pack Current */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>PACK CURRENT</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#54e98a" }]}>{isConnected ? fmt(p.packCurrentA) : "—"}</Text>
              <Text style={s.metricUnit}>A</Text>
            </View>
          </View>

          {/* Pack Temp */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>PACK TEMP</Text>
            <View style={[s.metricDivider, { backgroundColor: "#58e5c2" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#58e5c2" }]}>{isConnected ? fmt(p.packTempC) : "—"}</Text>
              <Text style={s.metricUnit}>°C</Text>
            </View>
          </View>

          {/* Min Cell */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>MIN CELL</Text>
            <View style={[s.metricDivider, { backgroundColor: "#92ccff" }]} />
            <View style={s.metricValueRow}>
              <Text style={s.metricValue}>{isConnected ? fmt(p.minV) : "—"}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* Max Cell */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>MAX CELL</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={s.metricValue}>{isConnected ? fmt(p.maxV) : "—"}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* SOC */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>SOC</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#54e98a" }]}>{isConnected ? Math.round(p.soc).toString() : "—"}</Text>
              <Text style={s.metricUnit}>%</Text>
            </View>
          </View>
        </View>

        {/* Main Grid - 3 Cards */}
        <View style={s.mainGrid}>
          {/* HV + EVCC Card */}
          <View style={s.mainCard}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="lightning-bolt" size={16} color="#92ccff" />
                <Text style={s.cardHeaderText}>HV + EVCC</Text>
              </View>
            </View>
            <View style={s.cardContent}>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV BAT+ VOLTAGE</Text>
                <Text style={s.dataValue}>{isConnected ? fmt(p.batPlusV) : "—"} V</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV FC VOLTAGE</Text>
                <Text style={s.dataValue}>{isConnected ? fmt(p.fcV) : "—"} V</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV SC VOLTAGE</Text>
                <Text style={s.dataValue}>{isConnected ? fmt(p.scV) : "—"} V</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>EVCC MSG</Text>
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: isConnected ? "#54e98a" : "#37393d" }]} />
                  <Text style={[s.statusText, { color: isConnected ? "#54e98a" : "#64748b" }]}>
                    {isConnected ? p.evccLastMsgCode : "WAITING"}
                  </Text>
                </View>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>INSULATION</Text>
                <Text style={[s.dataValue, { color: p.faultISO ? "#ffb4ab" : "#54e98a" }]}>
                  {p.faultISO ? "FAULT" : "OK"}
                </Text>
              </View>
            </View>
          </View>

          {/* DC-DC + Charger Card */}
          <View style={s.mainCard}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="ev-station" size={16} color="#54e98a" />
                <Text style={s.cardHeaderText}>DC-DC + CHARGER</Text>
              </View>
            </View>
            <View style={s.cardContent}>
              <View style={s.dcdcGrid}>
                <View style={s.dcdcItem}>
                  <Text style={s.dcdcLabel}>DCDC OUT</Text>
                  <Text style={s.dcdcValue}>{isConnected ? fmt(p.dcdcVoltV) : "—"} V</Text>
                </View>
                <View style={s.dcdcItem}>
                  <Text style={s.dcdcLabel}>DCDC LOAD</Text>
                  <Text style={s.dcdcValue}>{isConnected ? fmt(p.dcdcCurrentA) : "—"} A</Text>
                </View>
              </View>
              <View style={s.chargingStatus}>
                <Text style={s.chargingStatusText}>CHARGING STATUS</Text>
                <Text style={s.chargingStatusValue}>
                  {isConnected ? p.chrgrStatus : "NOT CHARGING"}
                </Text>
              </View>
              <View style={s.statusGrid}>
                <View style={s.statusItem}>
                  <View style={[s.statusIndicator, { backgroundColor: isConnected && p.dcdcReady ? "#54e98a" : "#37393d" }]} />
                  <Text style={[s.statusText, { color: isConnected && p.dcdcReady ? "#e2e2e6" : "#64748b" }]}>READY</Text>
                </View>
                <View style={s.statusItem}>
                  <View style={[s.statusIndicator, { backgroundColor: isConnected && p.dcdcWorking ? "#54e98a" : "#37393d" }]} />
                  <Text style={[s.statusText, { color: isConnected && p.dcdcWorking ? "#e2e2e6" : "#64748b" }]}>WORKING</Text>
                </View>
                <View style={s.statusItem}>
                  <View style={[s.statusIndicator, { backgroundColor: p.dcdcHvilErr ? "#ffb4ab" : "#37393d" }]} />
                  <Text style={[s.statusText, { color: p.dcdcHvilErr ? "#ffb4ab" : "#64748b" }]}>HVIL ERR</Text>
                </View>
                <View style={s.statusItem}>
                  <View style={[s.statusIndicator, { backgroundColor: p.dcdcOverTemp ? "#ffb4ab" : "#37393d" }]} />
                  <Text style={[s.statusText, { color: p.dcdcOverTemp ? "#ffb4ab" : "#64748b" }]}>OVERTEMP</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Motor + Relays Card */}
          <View style={s.mainCard}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="cog" size={16} color="#58e5c2" />
                <Text style={s.cardHeaderText}>MOTOR + RELAYS</Text>
              </View>
            </View>
            <View style={s.cardContent}>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR RPM</Text>
                  <Text style={s.motorValue}>{isConnected ? Math.round(p.motorRpm).toString() : "—"}</Text>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: isConnected ? `${Math.min((p.motorRpm / 3000) * 100, 100)}%` : "0%" }]} />
                </View>
              </View>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR TEMP</Text>
                  <Text style={[s.motorValue, { color: "#58e5c2" }]}>{isConnected ? fmt(p.motorTempC) : "—"}°C</Text>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { backgroundColor: "#58e5c2", width: isConnected ? `${Math.min((p.motorTempC / 80) * 100, 100)}%` : "0%" }]} />
                </View>
              </View>
              <View style={s.relayGrid}>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>POSITIVE CONTACTOR</Text>
                  <Text style={[s.relayStatus, { color: p.relayPOS_ENB ? "#54e98a" : "#64748b" }]}>
                    {p.relayPOS_ENB ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>NEGATIVE CONTACTOR</Text>
                  <Text style={[s.relayStatus, { color: p.relayNEG_ENB ? "#54e98a" : "#64748b" }]}>
                    {p.relayNEG_ENB ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>FC+ RELAY</Text>
                  <Text style={[s.relayStatus, { color: p.relayFC ? "#54e98a" : "#64748b" }]}>
                    {p.relayFC ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>DC-DC+ RELAY</Text>
                  <Text style={[s.relayStatus, { color: p.relayDCDC ? "#54e98a" : "#64748b" }]}>
                    {p.relayDCDC ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Bottom Grid - 2 Cards */}
        <View style={s.bottomGrid}>
          {/* Thermal Efficiency */}
          <View style={s.bottomCard}>
            <View style={s.bottomCardHeader}>
              <View>
                <Text style={s.bottomCardTitle}>THERMAL EFFICIENCY</Text>
                <Text style={s.bottomCardSubtitle}>LIVE COOLANT FLOW DIAGRAM</Text>
              </View>
              <MaterialCommunityIcons name="snowflake" size={20} color="#54e98a" />
            </View>
            <View style={s.thermalContent}>
              <View style={s.thermalDisplay}>
                <Text style={s.thermalValue}>
                  {isConnected ? `${Math.round(95 + (p.soc / 100) * 4)}%` : "—"}
                </Text>
                <Text style={s.thermalLabel}>
                  {isConnected ? (p.packTempC < 50 ? "OPTIMAL FLOW" : "ELEVATED TEMP") : "NO DATA"}
                </Text>
              </View>
            </View>
          </View>

          {/* BMS Faults */}
          <View style={s.bottomCard}>
            <View style={s.bottomCardHeader}>
              <View>
                <Text style={s.bottomCardTitle}>BMS FAULTS</Text>
                <Text style={s.bottomCardSubtitle}>ACTIVE SYSTEM DIAGNOSTICS</Text>
              </View>
              <MaterialCommunityIcons name="alert" size={20} color="#ffb4ab" />
            </View>
            <View style={s.faultsList}>
              {p.faultUV && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>CRITICAL: UNDERVOLTAGE</Text>
                    <Text style={s.faultDescription}>CELL UNDERVOLTAGE DETECTED</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {p.faultOV && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>CRITICAL: OVERVOLTAGE</Text>
                    <Text style={s.faultDescription}>CELL OVERVOLTAGE DETECTED</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {p.faultOTC && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>WARNING: OVER TEMPERATURE CHARGE</Text>
                    <Text style={s.faultDescription}>PACK TEMP TOO HIGH FOR CHARGING</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {p.faultUTC && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>WARNING: OVER TEMPERATURE DISCHARGE</Text>
                    <Text style={s.faultDescription}>PACK TEMP TOO HIGH FOR DISCHARGE</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {p.faultOCD1 && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>CRITICAL: OVER CURRENT DISCHARGE 1</Text>
                    <Text style={s.faultDescription}>DISCHARGE CURRENT LIMIT EXCEEDED</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {p.faultOCD2 && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>CRITICAL: OVER CURRENT DISCHARGE 2</Text>
                    <Text style={s.faultDescription}>DISCHARGE CURRENT LIMIT EXCEEDED</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {p.faultSC && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>CRITICAL: SHORT CIRCUIT</Text>
                    <Text style={s.faultDescription}>SHORT CIRCUIT DETECTED</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {p.faultISO && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>CRITICAL: INSULATION FAULT</Text>
                    <Text style={s.faultDescription}>INSULATION RESISTANCE TOO LOW</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {!isConnected && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitle}>INFO: NO CONNECTION</Text>
                    <Text style={s.faultDescription}>WAITING FOR USB DEVICE</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
              {isConnected && !p.faultUV && !p.faultOV && !p.faultOTC && !p.faultUTC && !p.faultOCD1 && !p.faultOCD2 && !p.faultSC && !p.faultISO && (
                <View style={s.faultItem}>
                  <View style={s.faultContent}>
                    <Text style={s.faultTitleInfo}>INFO: SYSTEM NORMAL</Text>
                    <Text style={s.faultDescription}>ALL SYSTEMS OPERATIONAL</Text>
                  </View>
                  <Text style={s.faultTime}>{new Date().toLocaleTimeString()}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <BottomNav />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#111316", flexDirection: "column" },
  body:   { padding: 16, gap: 16 },

  
  // Top Metrics Row
  topMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#1C1F23",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    padding: 12,
  },
  metricLabel: {
    color: "#bbcbbb",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  metricDivider: {
    height: 2,
    width: 32,
    marginBottom: 8,
    borderRadius: 1,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  metricValue: {
    color: "#e2e2e6",
    fontSize: 24,
    fontWeight: "600",
  },
  metricUnit: {
    color: "#bbcbbb",
    fontSize: 12,
  },

  // Main Grid
  mainGrid: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  mainCard: {
    flex: 1,
    backgroundColor: "#1C1F23",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardHeaderText: {
    color: "#e2e2e6",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  cardContent: {
    padding: 12,
  },

  // Data Rows
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  dataLabel: {
    color: "#bbcbbb",
    fontSize: 11,
    fontWeight: "500",
  },
  dataValue: {
    color: "#e2e2e6",
    fontSize: 14,
    fontWeight: "500",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // DC-DC Section
  dcdcGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  dcdcItem: {
    flex: 1,
    backgroundColor: "#1e2023",
    padding: 12,
    borderRadius: 6,
  },
  dcdcLabel: {
    color: "#bbcbbb",
    fontSize: 10,
    marginBottom: 4,
  },
  dcdcValue: {
    color: "#e2e2e6",
    fontSize: 16,
    fontWeight: "500",
  },
  chargingStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 180, 171, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 180, 171, 0.2)",
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  chargingStatusText: {
    color: "#ffb4ab",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  chargingStatusValue: {
    color: "#ffb4ab",
    fontSize: 11,
    fontWeight: "600",
  },

  // Status Grid
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: "45%",
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Motor Section
  motorSection: {
    marginBottom: 16,
  },
  motorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  motorLabel: {
    color: "#bbcbbb",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  motorValue: {
    color: "#e2e2e6",
    fontSize: 20,
    fontWeight: "600",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#282a2d",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#54e98a",
    borderRadius: 2,
  },

  // Relay Grid
  relayGrid: {
    gap: 8,
  },
  relayItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1e2023",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    padding: 8,
    borderRadius: 4,
  },
  relayLabel: {
    color: "#bbcbbb",
    fontSize: 11,
  },
  relayStatus: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Bottom Grid
  bottomGrid: {
    flexDirection: "row",
    gap: 8,
  },
  fieldNavigationCard: {
    backgroundColor: "#1C1F23",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#37393d",
    padding: 16,
    marginBottom: 16,
  },
  fieldNavHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  fieldNavTitle: {
    color: "#e2e2e6",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  fieldNavContent: {
    alignItems: "center",
  },
  googleMapsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#37393d",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: "100%",
  },
  googleMapsText: {
    color: "#e2e2e6",
    fontSize: 14,
    fontWeight: "600",
  },
  bottomCard: {
    flex: 1,
    backgroundColor: "#1C1F23",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    padding: 20,
    minHeight: 200,
  },
  bottomCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  bottomCardTitle: {
    color: "#e2e2e6",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  bottomCardSubtitle: {
    color: "#bbcbbb",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
  },

  // Thermal Content
  thermalContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  thermalDisplay: {
    alignItems: "center",
  },
  thermalValue: {
    color: "rgba(84, 233, 138, 0.8)",
    fontSize: 48,
    fontWeight: "900",
    marginBottom: 8,
  },
  thermalLabel: {
    color: "#bbcbbb",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
  },

  // Faults List
  faultsList: {
    gap: 8,
  },
  faultItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 6,
  },
  faultContent: {
    flex: 1,
  },
  faultTitle: {
    color: "#ffb4ab",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  faultTitleInfo: {
    color: "#e2e2e6",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  faultDescription: {
    color: "#bbcbbb",
    fontSize: 10,
  },
  faultTime: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 10,
    fontFamily: "monospace",
  },
});
