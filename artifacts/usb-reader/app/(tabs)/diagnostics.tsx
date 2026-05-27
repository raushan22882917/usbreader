import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { useDiagnosisTelemetryData } from "@/hooks/useDiagnosisTelemetryData";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";
import USBSerialService from "@/USBSerialService";
import {
  extractJsonObjects,
  findLatestDiagnosisTelemetry,
  isDiagnosisTelemetry,
  validateDiagnosisTelemetry,
} from "@/lib/diagnosisTelemetry";

import { Colors, Typography, Spacing, Border } from "@/theme";

const CDC_RX_LINE_MAX = 20480;
const TIMEOUT_TELEMETRY_MS = 15000;
const DIAG_LOG_MAX = 200;

function summarizeTelemetryRx(t: Record<string, unknown>): string {
  const bms = t.bms as Record<string, unknown> | undefined;
  const ts = t.ts;
  return (
    `ts=${ts} soc=${bms?.soc ?? "?"}% ` +
    `V=${bms?.pack_voltage_v ?? "?"} I=${bms?.pack_current_a ?? "?"}A`
  );
}

function strToHex(str: string): string {
  let hex = "";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

type DiagRunStatus = "idle" | "running" | "ok" | "error";

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
const DEC = 3;

/** Format numeric telemetry to 3 decimal places (shows 0.000 when value is zero). */
function fmtN(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(DEC);
}

function show(isConnected: boolean, text: string): string {
  return isConnected ? text : "—";
}

function showNum(isConnected: boolean, v: number, unit = ""): string {
  return isConnected ? `${fmtN(v)}${unit}` : "—";
}

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

function fmtRelay(v: boolean) {
  return v ? "CLOSED" : "OPEN";
}

function fmtFault(active: boolean) {
  return active ? "FAULT" : "OK";
}

function fmtCellList(nums: number[], max = 6): string {
  if (!nums.length) return "—";
  const head = nums.slice(0, max).map((n) => fmtN(n)).join(", ");
  return nums.length > max ? `${head} … (+${nums.length - max})` : head;
}

// ─── Status dot ────────────────────────────────────────────────
function StatusDot({ label, active, faultMode }: { label: string; active: boolean; faultMode?: boolean }) {
  const dotColor = faultMode
    ? (active ? C.red : C.green)
    : (active ? C.green : C.dimBg);
  return (
    <View style={sd.wrap}>
      <View style={[sd.dot, { backgroundColor: dotColor }]} />
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
  const { connectionStatus, quickConnect, writeData } = useUsb();
  const isConnected = connectionStatus === "connected";
  const { p, packetsRef, resetTs } = useDiagnosisTelemetryData(isConnected);

  const connectionRef = useRef(connectionStatus);
  useEffect(() => {
    connectionRef.current = connectionStatus;
  }, [connectionStatus]);

  const [activeTab, setActiveTab] = useState<Tab>("bms");
  const [subsystemOn, setSubsystemOn] = useState<Record<Tab, boolean>>({
    bms: true, motor: false, dcdc: false, charger: false, system: true,
  });
  const [diagStatus, setDiagStatus] = useState<DiagRunStatus>("idle");
  const [diagMsg, setDiagMsg] = useState("");
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const abortRef = useRef(false);
  const runningRef = useRef(false);
  const lastLoggedTsRef = useRef(-1);
  const connectAtRef = useRef<number | null>(null);
  const autoRequestedRef = useRef(false);

  const log = useCallback((msg: string) => {
    setDiagLog((prev) => [...prev.slice(-(DIAG_LOG_MAX - 1)), msg]);
  }, []);

  const sendDiagnosisCmd = useCallback(async () => {
    if (connectionRef.current !== "connected") return;
    const line = JSON.stringify({ cmd: "diagnosis" }) + "\n";
    const hex = strToHex(line);
    const chunkHex = 512;
    for (let i = 0; i < hex.length; i += chunkHex) {
      await writeData(hex.slice(i, i + chunkHex));
      if (i + chunkHex < hex.length) await new Promise((r) => setTimeout(r, 1));
    }
  }, [writeData]);

  // Auto mode: if telemetry is already streaming, show it immediately.
  // If not streaming yet, send {"cmd":"diagnosis"} once after connect.
  useEffect(() => {
    if (!isConnected) {
      connectAtRef.current = null;
      autoRequestedRef.current = false;
      return;
    }
    connectAtRef.current = Date.now();
    autoRequestedRef.current = false;
    setDiagStatus("idle");
    setDiagMsg('Auto: waiting for data… (will send {"cmd":"diagnosis"} if needed)');
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || runningRef.current) return;

    // If data is already present, just mark live.
    if (p.timestamp > 0) {
      if (diagStatus !== "ok") setDiagStatus("ok");
      setDiagMsg(`Live data — ts ${p.timestamp}`);
      return;
    }

    // No telemetry yet: auto-send once after a short grace period.
    if (autoRequestedRef.current) return;
    const t0 = connectAtRef.current ?? Date.now();
    const waitMs = 900;
    const remaining = waitMs - (Date.now() - t0);
    const id = setTimeout(() => {
      if (!isConnected || runningRef.current) return;
      if (p.timestamp > 0) return;
      autoRequestedRef.current = true;
      log('→ {"cmd":"diagnosis"} (auto)');
      setDiagMsg('→ {"cmd":"diagnosis"} (auto)');
      sendDiagnosisCmd().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        log(`✗ auto send failed: ${msg}`);
      });
    }, Math.max(0, remaining));
    return () => clearTimeout(id);
  }, [isConnected, p.timestamp, diagStatus, log, sendDiagnosisCmd]);

  // Log only when BMS sends a new telemetry frame (new `ts`), not on every USB packet.
  useEffect(() => {
    if (!isConnected || runningRef.current || p.timestamp <= 0) return;
    const ts = p.timestamp;
    if (ts === lastLoggedTsRef.current) return;
    lastLoggedTsRef.current = ts;
    const latest = findLatestDiagnosisTelemetry(packetsRef.current);
    if (!latest) return;
    const check = validateDiagnosisTelemetry(latest);
    log(`← ${summarizeTelemetryRx(latest)} · format ${check.ok ? "OK" : "BAD"}`);
  }, [p.timestamp, isConnected, log, packetsRef]);

  useEffect(() => {
    if (!isConnected) {
      lastLoggedTsRef.current = -1;
      resetTs();
    }
  }, [isConnected, resetTs]);

  const toggle = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubsystemOn((prev) => ({ ...prev, [tab]: !prev[tab] }));
  };

  const isOn = subsystemOn[activeTab];
  const ac   = TABS.find((t) => t.id === activeTab)!;

  const runDiagnosis = useCallback(async () => {
    if (runningRef.current) return;

    const isUsbConnected = () => connectionRef.current === "connected";

    const requireUsb = async () => {
      if (isUsbConnected()) return;
      await quickConnect();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (isUsbConnected()) return;
      }
      throw new Error("USB not connected — connect the ESP32 using the connection bar.");
    };

    abortRef.current = false;
    runningRef.current = true;
    setDiagStatus("running");
    setDiagLog([]);
    lastLoggedTsRef.current = -1;
    resetTs();
    log(">> Diagnosis started");
    setDiagMsg('→ {"cmd":"diagnosis"}');

    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const sendCdcLine = async (obj: Record<string, unknown>) => {
      if (!isUsbConnected()) throw new Error("USB disconnected");
      const line = JSON.stringify(obj) + "\n";
      if (line.length > CDC_RX_LINE_MAX) {
        throw new Error(`CDC line too long (${line.length} B)`);
      }
      log(`→ ${line.trim()} (${line.length} B)`);
      setDiagMsg(`→ ${line.trim()}`);
      const hex = strToHex(line);
      const chunkHex = 512;
      for (let i = 0; i < hex.length; i += chunkHex) {
        await writeData(hex.slice(i, i + chunkHex));
        if (i + chunkHex < hex.length) await delay(1);
      }
      await delay(Math.max(8, Math.ceil(line.length / 120)));
    };

    let sessionRxText = "";

    let lastSessionTs = -1;

    const appendSessionRx = (text: string) => {
      sessionRxText += text;
      if (sessionRxText.length > CDC_RX_LINE_MAX) {
        sessionRxText = sessionRxText.slice(-CDC_RX_LINE_MAX);
      }
      const objs = extractJsonObjects(sessionRxText);
      for (let i = objs.length - 1; i >= 0; i--) {
        if (!isDiagnosisTelemetry(objs[i])) continue;
        const ts = objs[i].ts as number;
        if (ts !== lastSessionTs) {
          lastSessionTs = ts;
          log(`← ${summarizeTelemetryRx(objs[i])}`);
        }
        break;
      }
    };

    const findTelemetry = (): Record<string, unknown> | null => {
      const fromPackets = findLatestDiagnosisTelemetry(packetsRef.current);
      if (fromPackets) return fromPackets;
      const objs = extractJsonObjects(sessionRxText);
      for (let i = objs.length - 1; i >= 0; i--) {
        if (isDiagnosisTelemetry(objs[i])) return objs[i];
      }
      return null;
    };

    const onSessionCdcHex = (hexData: string) => {
      if (abortRef.current) return;
      let chunk = "";
      for (let i = 0; i < hexData.length; i += 2) {
        chunk += String.fromCharCode(parseInt(hexData.substring(i, i + 2), 16));
      }
      appendSessionRx(chunk);
    };

    const sessionUnsub = USBSerialService.onData(onSessionCdcHex);

    try {
      log("Connecting USB…");
      await requireUsb();
      log("✓ USB connected");

      log("Listening for BMS JSON (bms, cells, hv, relays, …)…");
      await sendCdcLine({ cmd: "diagnosis" });
      setDiagMsg("Listening for BMS JSON stream…");

      const deadline = Date.now() + TIMEOUT_TELEMETRY_MS;
      let telemetry: Record<string, unknown> | null = null;
      let waitTicks = 0;
      while (Date.now() < deadline) {
        if (abortRef.current) throw new Error("Aborted");
        telemetry = findTelemetry();
        if (telemetry) break;
        waitTicks++;
        if (waitTicks % 50 === 0) {
          log(`   … waiting (${Math.round((deadline - Date.now()) / 1000)}s left)`);
        }
        await delay(100);
      }

      if (!telemetry) {
        log(`✗ No diagnosis JSON (${TIMEOUT_TELEMETRY_MS / 1000}s timeout)`);
        throw new Error(`No diagnosis JSON received (${TIMEOUT_TELEMETRY_MS / 1000}s)`);
      }

      log(`   Got telemetry: ${summarizeTelemetryRx(telemetry)}`);
      const check = validateDiagnosisTelemetry(telemetry);
      if (!check.ok) {
        log(`✗ Format mismatch (${check.errors.length} issues)`);
        for (const err of check.errors.slice(0, 8)) log(`   · ${err}`);
        if (check.errors.length > 8) log(`   · … +${check.errors.length - 8} more`);
        const detail = check.errors.slice(0, 4).join("; ");
        const more = check.errors.length > 4 ? ` (+${check.errors.length - 4} more)` : "";
        throw new Error(`Format mismatch: ${detail}${more}`);
      }

      const bms = telemetry.bms as Record<string, unknown>;
      const ts = telemetry.ts as number;
      log("✓ Format matches expected diagnosis schema");
      log(`   bms.soc=${bms.soc}% pack=${bms.pack_voltage_v}V`);
      log(`   cells: ${(telemetry.cells as Record<string, unknown>)?.total_cells ?? "?"} cells`);
      log(`   evcc: ${(telemetry.evcc as Record<string, unknown>)?.last_msg_code ?? "?"}`);
      setDiagStatus("ok");
      setDiagMsg(
        `✓ Format matches — ts ${ts}, SOC ${typeof bms.soc === "number" ? (bms.soc as number).toFixed(1) : "?"}%`,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ ${msg}`);
      setDiagStatus("error");
      setDiagMsg(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      sessionUnsub();
      runningRef.current = false;
      log(">> Diagnosis ended");
    }
  }, [quickConnect, writeData, log, resetTs]);

  const diagStatusColor =
    diagStatus === "ok" ? C.green :
    diagStatus === "error" ? C.red :
    diagStatus === "running" ? C.yellow :
    C.muted;

  return (
    <View style={s.root}>
      <Header />
      {/* Shared USB connection bar */}
      <UsbConnectionBar compact />

      <View style={s.diagBar}>
        <View style={s.diagBarText}>
          <Text style={s.diagBarTitle}>BMS diagnostics</Text>
          <Text style={[s.diagBarSub, { color: diagStatusColor }]}>
            {diagStatus === "idle"
              ? isConnected
                ? "Live telemetry — auto updates when data arrives"
                : "Connect USB for live diagnostics"
              : diagStatus === "running"
                ? diagMsg
                : diagMsg || (diagStatus === "ok" ? "Ready" : "Failed")}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            s.diagBtn,
            (!isConnected || diagStatus === "running") && s.diagBtnDisabled,
            pressed && isConnected && diagStatus !== "running" && { opacity: 0.85 },
          ]}
          disabled={!isConnected || diagStatus === "running"}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            runDiagnosis();
          }}
        >
          {diagStatus === "running" ? (
            <ActivityIndicator size="small" color={Colors.onPrimary} />
          ) : (
            <>
              <MaterialCommunityIcons name="play-circle-outline" size={20} color={Colors.onPrimary} />
              <Text style={s.diagBtnLabel}>Run diagnosis</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Diagnosis log preview */}
      <View style={dl.wrap}>
        <View style={dl.head}>
          <MaterialCommunityIcons name="text-box-outline" size={14} color={C.blue} />
          <Text style={dl.headTitle}>DIAGNOSIS LOG</Text>
          <Text style={dl.headCount}>{diagLog.length} lines</Text>
          <Pressable
            style={dl.viewBtn}
            onPress={() => {
              Haptics.selectionAsync();
              setLogModalVisible(true);
            }}
          >
            <Text style={dl.viewBtnTxt}>VIEW FULL</Text>
          </Pressable>
        </View>
        <View style={dl.logBox}>
          {diagLog.length === 0 ? (
            <Text style={dl.logEmpty}>Connect USB and run diagnosis — TX/RX logged here</Text>
          ) : (
            diagLog.slice(-5).map((line, i) => (
              <Text
                key={`${diagLog.length - 5 + i}-${line.slice(0, 24)}`}
                style={[
                  dl.logLine,
                  line.includes("✗") || line.includes("FATAL") ? { color: C.red } :
                  line.includes("✓") ? { color: C.green } :
                  line.startsWith(">>") ? { color: C.yellow } :
                  line.startsWith("→") ? { color: C.blue } :
                  undefined,
                ]}
                numberOfLines={2}
              >
                {line}
              </Text>
            ))
          )}
        </View>
      </View>

      <Modal
        visible={logModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLogModalVisible(false)}
      >
        <View style={dl.modalOverlay}>
          <View style={dl.modalBox}>
            <View style={dl.modalHead}>
              <MaterialCommunityIcons name="text-box-multiple-outline" size={16} color={C.green} />
              <Text style={dl.modalTitle}>DIAGNOSIS LOG</Text>
              <Text style={dl.modalCount}>{diagLog.length} lines</Text>
              <View style={{ flex: 1 }} />
              <View style={[dl.modalBadge, {
                backgroundColor:
                  diagStatus === "ok" ? "rgba(110,220,161,0.15)" :
                  diagStatus === "error" ? "rgba(255,80,60,0.12)" :
                  diagStatus === "running" ? "rgba(255,200,50,0.12)" :
                  "rgba(80,180,255,0.1)",
                borderColor:
                  diagStatus === "ok" ? "rgba(110,220,161,0.5)" :
                  diagStatus === "error" ? "rgba(255,80,60,0.4)" :
                  diagStatus === "running" ? "rgba(255,200,50,0.4)" :
                  "rgba(80,180,255,0.3)",
              }]}>
                <Text style={[dl.modalBadgeTxt, { color: diagStatusColor }]}>
                  {diagStatus === "running" ? "● RUNNING" :
                   diagStatus === "ok" ? "✓ OK" :
                   diagStatus === "error" ? "✗ ERROR" : "IDLE"}
                </Text>
              </View>
              <Pressable style={dl.modalClose} onPress={() => setLogModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color={C.muted} />
              </Pressable>
            </View>

            <ScrollView
              style={dl.modalScroll}
              contentContainerStyle={dl.modalScrollContent}
              showsVerticalScrollIndicator
            >
              {diagLog.length === 0 ? (
                <Text style={dl.modalEmpty}>No log entries yet.</Text>
              ) : (
                diagLog.map((line, i) => {
                  const isError = line.includes("✗") || line.includes("FATAL");
                  const isOk = line.includes("✓");
                  const isStep = line.startsWith(">>");
                  const isTx = line.startsWith("→");
                  const color =
                    isError ? C.red : isOk ? C.green : isStep ? C.yellow : isTx ? C.blue : "rgba(140,220,170,1)";
                  return (
                    <Text key={i} style={[dl.modalLogLine, { color }]}>
                      <Text style={dl.modalLineNum}>{String(i + 1).padStart(3, " ")}  </Text>
                      {line}
                    </Text>
                  );
                })
              )}
            </ScrollView>

            <View style={dl.modalFoot}>
              <Text style={dl.modalFootTxt} numberOfLines={2}>
                {diagMsg || (isConnected ? "USB connected" : "Not connected")}
              </Text>
              <Pressable
                style={dl.modalClearBtn}
                onPress={() => {
                  setDiagLog([]);
                  lastLoggedTsRef.current = -1;
                  log("Log cleared");
                }}
              >
                <Text style={dl.modalClearBtnTxt}>CLEAR</Text>
              </Pressable>
              <Pressable style={dl.modalCloseBtn} onPress={() => setLogModalVisible(false)}>
                <Text style={dl.modalCloseBtnTxt}>CLOSE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {/* Top Metrics Row - 6 Cards */}
        <View style={s.topMetricsRow}>
          {/* Pack Voltage */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>PACK VOLTAGE</Text>
            <View style={[s.metricDivider, { backgroundColor: "#92ccff" }]} />
            <View style={s.metricValueRow}>
              <Text style={s.metricValue}>{showNum(isConnected, p.packVoltageV)}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* Pack Current */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>PACK CURRENT</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#54e98a" }]}>{showNum(isConnected, p.packCurrentA)}</Text>
              <Text style={s.metricUnit}>A</Text>
            </View>
          </View>

          {/* Pack Temp */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>PACK TEMP</Text>
            <View style={[s.metricDivider, { backgroundColor: "#58e5c2" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#58e5c2" }]}>{showNum(isConnected, p.packTempC)}</Text>
              <Text style={s.metricUnit}>°C</Text>
            </View>
          </View>

          {/* Min Cell */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>MIN CELL</Text>
            <View style={[s.metricDivider, { backgroundColor: "#92ccff" }]} />
            <View style={s.metricValueRow}>
              <Text style={s.metricValue}>{showNum(isConnected, p.minV)}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* Max Cell */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>MAX CELL</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={s.metricValue}>{showNum(isConnected, p.maxV)}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* SOC */}
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>SOC</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#54e98a" }]}>{showNum(isConnected, p.soc)}</Text>
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
                <Text style={s.dataValue}>{showNum(isConnected, p.batPlusV, " V")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV FC VOLTAGE</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.fcV, " V")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV DCDC VOLTAGE</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.dcdcHV, " V")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV DSG VOLTAGE</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.dsgV, " V")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV SC VOLTAGE</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.scV, " V")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>HV PCHG VOLTAGE</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.pchgV, " V")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>EVCC MSG</Text>
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: isConnected ? "#54e98a" : "#37393d" }]} />
                  <Text style={[s.statusText, { color: isConnected ? "#54e98a" : "#64748b" }]}>
                    {isConnected ? (p.evccLastMsgCode || "WAITING") : "WAITING"}
                  </Text>
                </View>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>EVCC CAN ID</Text>
                <Text style={s.dataValue}>{isConnected ? (p.evccLastCanId || "—") : "—"}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>EVCC DESC</Text>
                <Text style={[s.dataValue, s.dataValueSmall]} numberOfLines={2}>
                  {isConnected ? (p.evccDescription || "—") : "—"}
                </Text>
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
                  <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdcVoltV, " V")}</Text>
                </View>
                <View style={s.dcdcItem}>
                  <Text style={s.dcdcLabel}>DCDC LOAD</Text>
                  <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdcCurrentA, " A")}</Text>
                </View>
                <View style={s.dcdcItem}>
                  <Text style={s.dcdcLabel}>DCDC TEMP</Text>
                  <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdcTempC, " °C")}</Text>
                </View>
              </View>
              <View style={s.chargingStatus}>
                <Text style={s.chargingStatusText}>CHARGING STATUS</Text>
                <Text style={s.chargingStatusValue}>
                  {isConnected ? (p.chrgrStatus || "—") : "OFFLINE"}
                </Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>CHARGER VOLTAGE</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.chrgrVoltV, " V")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>CHARGER CURRENT</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.chrgrCurrentA, " A")}</Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>CHARGER ERROR</Text>
                <Text style={s.dataValue}>{showNum(isConnected, p.chrgrErrorCode)}</Text>
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
                  <Text style={s.motorValue}>{showNum(isConnected, p.motorRpm)}</Text>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: isConnected ? `${Math.min((p.motorRpm / 3000) * 100, 100)}%` : "0%" }]} />
                </View>
              </View>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR TEMP</Text>
                  <Text style={[s.motorValue, { color: "#58e5c2" }]}>{showNum(isConnected, p.motorTempC, " °C")}</Text>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { backgroundColor: "#58e5c2", width: isConnected ? `${Math.min((p.motorTempC / 80) * 100, 100)}%` : "0%" }]} />
                </View>
              </View>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR RUNTIME</Text>
                  <Text style={s.motorValue}>{isConnected ? fmtUptime(p.motorRuntime) : "—"}</Text>
                </View>
              </View>
              <View style={s.relayGrid}>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>DSG+ RELAY</Text>
                  <Text style={[s.relayStatus, { color: p.relayDSG ? "#54e98a" : "#64748b" }]}>
                    {p.relayDSG ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>PCHG+ RELAY</Text>
                  <Text style={[s.relayStatus, { color: p.relayPCHG ? "#54e98a" : "#64748b" }]}>
                    {p.relayPCHG ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>SC+ RELAY</Text>
                  <Text style={[s.relayStatus, { color: p.relaySC ? "#54e98a" : "#64748b" }]}>
                    {p.relaySC ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
                <View style={s.relayItem}>
                  <Text style={s.relayLabel}>OUT- RELAY</Text>
                  <Text style={[s.relayStatus, { color: p.relayOUT ? "#54e98a" : "#64748b" }]}>
                    {p.relayOUT ? "CLOSED" : "OPEN"}
                  </Text>
                </View>
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

        {/* Bottom Grid - Cells + BMS Faults */}
        <View style={s.bottomGrid}>
          <View style={s.mainCard}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="battery-heart" size={16} color={C.green} />
                <Text style={s.cardHeaderText}>CELLS</Text>
              </View>
              {isConnected && p.timestamp > 0 && (
                <Text style={s.liveBadge}>LIVE · ts {p.timestamp}</Text>
              )}
            </View>
            <View style={s.cardContent}>
              <View style={s.cellsSummaryRow}>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>TOTAL CELLS</Text>
                  <Text style={s.cellsSummaryValue}>
                    {isConnected ? String(p.totalCells) : "—"}
                  </Text>
                </View>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>CYCLE</Text>
                  <Text style={s.cellsSummaryValue}>
                    {isConnected ? String(p.cycle) : "—"}
                  </Text>
                </View>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>MIN CELL</Text>
                  <Text style={s.cellsSummaryValue}>
                    {showNum(isConnected, p.minV, " V")}
                  </Text>
                  <Text style={s.cellsSummarySub}>
                    ID {isConnected ? String(p.minCellId) : "—"}
                  </Text>
                </View>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>MAX CELL</Text>
                  <Text style={s.cellsSummaryValue}>
                    {showNum(isConnected, p.maxV, " V")}
                  </Text>
                  <Text style={s.cellsSummarySub}>
                    ID {isConnected ? String(p.maxCellId) : "—"}
                  </Text>
                </View>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>CELL VOLTAGES (V)</Text>
                <Text style={[s.dataValue, s.dataValueSmall]} numberOfLines={3}>
                  {isConnected ? fmtCellList(p.cellVoltages) : "—"}
                </Text>
              </View>
              <View style={s.dataRow}>
                <Text style={s.dataLabel}>CELL TEMPS (°C)</Text>
                <Text style={[s.dataValue, s.dataValueSmall]} numberOfLines={3}>
                  {isConnected ? fmtCellList(p.cellTemperatures) : "—"}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.mainCard}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#ffb4ab" />
                <Text style={s.cardHeaderText}>BMS FAULTS</Text>
              </View>
            </View>
            <View style={s.cardContent}>
              <View style={s.faultPillGrid}>
                {(
                  [
                    ["UV", p.faultUV],
                    ["OV", p.faultOV],
                    ["OTC", p.faultOTC],
                    ["UTC", p.faultUTC],
                    ["OCD1", p.faultOCD1],
                    ["OCD2", p.faultOCD2],
                    ["SC", p.faultSC],
                    ["ISO", p.faultISO],
                  ] as const
                ).map(([name, active]) => (
                  <View key={name} style={s.faultPillItem}>
                    <StatusDot label={name} active={active} faultMode />
                    <Text style={[s.faultPillState, { color: active ? C.red : C.green }]}>
                      {isConnected ? fmtFault(active) : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <BottomNav />
    </View>
  );
}

const dl = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#1C1F23",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 10,
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  headTitle: { color: C.text, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  headCount: { color: C.muted, fontSize: 10, flex: 1 },
  viewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(80,180,255,0.35)",
    backgroundColor: "rgba(80,180,255,0.1)",
  },
  viewBtnTxt: { color: C.blue, fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  logBox: {
    backgroundColor: "rgba(10,14,16,1)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
    minHeight: 72,
    maxHeight: 96,
    gap: 2,
  },
  logEmpty: { color: C.muted, fontSize: 9, fontStyle: "italic" },
  logLine: { color: "rgba(140,220,170,1)", fontSize: 9, fontFamily: "monospace", lineHeight: 13 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalBox: {
    backgroundColor: "rgba(14,18,20,1)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: "85%",
    minHeight: "55%",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: { color: C.text, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  modalCount: { color: C.muted, fontSize: 10 },
  modalBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  modalBadgeTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  modalClose: { padding: 4 },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 12, gap: 1 },
  modalEmpty: { color: C.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 40 },
  modalLogLine: { fontSize: 10, fontFamily: "monospace", lineHeight: 16 },
  modalLineNum: { color: "rgba(60,62,62,1)", fontSize: 9 },
  modalFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  modalFootTxt: { flex: 1, color: C.muted, fontSize: 9 },
  modalClearBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalClearBtnTxt: { color: C.muted, fontSize: 10, fontWeight: "700" },
  modalCloseBtn: { backgroundColor: C.orange, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  modalCloseBtnTxt: { color: "rgba(21,25,27,1)", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
});

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#111316", flexDirection: "column" },
  body:   { padding: 16, gap: 16 },

  diagBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#1C1F23",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  diagBarText: { flex: 1, gap: 4 },
  diagBarTitle: {
    color: "#E8EAED",
    fontSize: 14,
    fontWeight: "600",
  },
  diagBarSub: {
    fontSize: 12,
    color: "#9AA0A6",
  },
  diagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
    justifyContent: "center",
  },
  diagBtnDisabled: { opacity: 0.45 },
  diagBtnLabel: {
    color: Colors.onPrimary,
    fontSize: 13,
    fontWeight: "600",
  },

  liveBadge: {
    color: C.green,
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  cellsSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  cellsSummaryItem: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  cellsSummaryLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cellsSummaryValue: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  cellsSummarySub: {
    color: C.muted,
    fontSize: 9,
    marginTop: 2,
  },
  faultPillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  faultPillItem: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  faultPillState: {
    fontSize: 10,
    fontWeight: "700",
  },

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
  dataValueSmall: {
    fontSize: 10,
    maxWidth: 160,
    textAlign: "right",
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
