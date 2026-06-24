import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { usePathname } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { useDiagnosisTelemetryData } from "@/hooks/useDiagnosisTelemetryData";
import { useDeviceScale } from "@/hooks/useDeviceScale";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";
import { sendCsvCmd as sendCsvCmdLine } from "@/lib/usbCdc";
import {
  validateDiagnosisTelemetry,
} from "@/lib/diagnosisTelemetry";

import { Colors, Typography, Spacing, Border } from "@/theme";

const DIAG_LOG_MAX = 48;

function summarizeTelemetryRx(t: Record<string, unknown>): string {
  const bms = t.bms as Record<string, unknown> | undefined;
  const ts = t.ts;
  return (
    `ts=${ts} soc=${bms?.soc ?? "?"}% ` +
    `V=${bms?.pack_voltage_v ?? "?"} I=${bms?.pack_current_a ?? "?"}A`
  );
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

/** Format integer decimal values (RPM, SOC %, error codes, cell IDs). */
function fmtInt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return String(Math.round(v));
}

function show(isConnected: boolean, text: string): string {
  return isConnected ? text : "—";
}

function showNum(isConnected: boolean, v: number, unit = ""): string {
  return isConnected ? `${fmtN(v)}${unit}` : "—";
}

function showInt(isConnected: boolean, v: number, unit = ""): string {
  return isConnected ? `${fmtInt(v)}${unit}` : "—";
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

/** Cumulative motor runtime from CAN (seconds) — matches main.cpp motor.runtime. */
function fmtMotorRuntime(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  return String(sec);
}

function hasLiveMotor(isConnected: boolean, timestamp: number): boolean {
  return isConnected && timestamp > 0;
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
  const { icon: iconScale } = useDeviceScale();
  const iconSize = iconScale(16, 12);
  const iconBox = Math.round(iconSize * 1.9);
  return (
    <View style={[mc.card, { borderColor: `${color}35` }]}>
      <View style={[mc.icon, { backgroundColor: bg, width: iconBox, height: iconBox }]}>
        <MaterialCommunityIcons name={icon} size={iconSize} color={color} />
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
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { icon } = useDeviceScale();
  const iconSm = icon(13, 10);
  const iconMd = icon(16, 12);
  const iconLg = icon(18, 14);
  const isCompact = screenW < 768;
  const isLandscape = screenW > screenH;

  const { connectionStatus, quickConnect, writeData } = useUsb();
  const isConnected = connectionStatus === "connected";
  const isFocused = usePathname().includes("diagnostics");
  const { p, rawTelemetry, csvLogAck, resetTs, resetTelemetry } =
    useDiagnosisTelemetryData(isConnected);

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
  /** Like main.cpp `csvLogMode` — ESP32 streams CAN log while active. */
  const csvModeRef = useRef(false);
  const lastLoggedTsRef = useRef(-1);
  const firstFrameValidatedRef = useRef(false);
  const ackLoggedRef = useRef(false);
  const connectAtRef = useRef<number | null>(null);
  const autoRequestedRef = useRef(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const log = useCallback((msg: string) => {
    setDiagLog((prev) => [...prev.slice(-(DIAG_LOG_MAX - 1)), msg]);
  }, []);

  const sendCsvCmd = useCallback(async () => {
    await sendCsvCmdLine(writeData, connectionRef.current === "connected");
  }, [writeData]);

  // On disconnect: reset csv session state.
  useEffect(() => {
    if (!isConnected) {
      connectAtRef.current = null;
      autoRequestedRef.current = false;
      csvModeRef.current = false;
      firstFrameValidatedRef.current = false;
      ackLoggedRef.current = false;
      lastLoggedTsRef.current = -1;
      resetTs();
      setDiagStatus("idle");
      setDiagMsg("Disconnected");
      return;
    }
    connectAtRef.current = Date.now();
    autoRequestedRef.current = false;
    setDiagStatus("idle");
    setDiagMsg('Waiting for live data… will send {"cmd":"csv"} when connected');
  }, [isConnected, resetTs]);

  // Show live telemetry if already streaming.
  useEffect(() => {
    if (!isConnected || !isFocused || csvModeRef.current) return;
    if (p.timestamp <= 0) return;
    csvModeRef.current = true;
    setDiagStatus("ok");
    setDiagMsg(`Live data — ts ${p.timestamp}`);
  }, [isConnected, isFocused, p.timestamp]);

  const startCsvLog = useCallback(
    async (source: "auto" | "manual" = "manual") => {
      if (sendingRef.current) return;

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

      try {
        await requireUsb();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`✗ ${msg}`);
        setDiagStatus("error");
        setDiagMsg(msg);
        return;
      }

      const restarting = csvModeRef.current;
      csvModeRef.current = true;
      setDiagStatus("running");

      if (!restarting) {
        if (source === "manual") {
          resetTelemetry();
          setDiagLog([]);
        }
        firstFrameValidatedRef.current = false;
        ackLoggedRef.current = false;
        lastLoggedTsRef.current = -1;
        log(">> CSV log started");
      } else {
        ackLoggedRef.current = false;
      }

      const tag = source === "auto" ? " (auto)" : restarting ? " (restart)" : "";
      log(`→ {"cmd":"csv"}${tag}`);
      setDiagMsg(`→ {"cmd":"csv"}${tag}`);

      setSending(true);
      sendingRef.current = true;
      try {
        await sendCsvCmd();
        setDiagMsg("Listening for CAN csvlog stream…");
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [quickConnect, sendCsvCmd, log, resetTelemetry],
  );

  // Auto-send csv when this tab is focused and USB is connected.
  useEffect(() => {
    if (!isConnected || !isFocused || autoRequestedRef.current || csvModeRef.current) return;
    const t0 = connectAtRef.current ?? Date.now();
    const waitMs = 800;
    const remaining = waitMs - (Date.now() - t0);
    const id = setTimeout(() => {
      if (!isConnected || !isFocused || autoRequestedRef.current || csvModeRef.current) return;
      autoRequestedRef.current = true;
      startCsvLog("auto").catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        log(`✗ auto send failed: ${msg}`);
        setDiagStatus("error");
        setDiagMsg(msg);
      });
    }, Math.max(0, remaining));
    return () => clearTimeout(id);
  }, [isConnected, isFocused, startCsvLog, log]);

  // Log csvlog ack once.
  useEffect(() => {
    if (!csvLogAck || ackLoggedRef.current) return;
    ackLoggedRef.current = true;
    log("← csvlog ack");
    setDiagStatus("ok");
  }, [csvLogAck, log]);

  // First telemetry frame: validate once and log a single summary line.
  useEffect(() => {
    if (!isConnected || !csvModeRef.current || p.timestamp <= 0) return;
    if (firstFrameValidatedRef.current || !rawTelemetry) return;
    firstFrameValidatedRef.current = true;

    const check = validateDiagnosisTelemetry(rawTelemetry);
    if (check.ok) {
      log(`✓ ${summarizeTelemetryRx(rawTelemetry)}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      log(`⚠ format issues (${check.errors.length}) — ${summarizeTelemetryRx(rawTelemetry)}`);
    }
    setDiagStatus("ok");
    setDiagMsg(`Live — ts ${p.timestamp}, SOC ${fmtInt(p.soc)}%`);
    lastLoggedTsRef.current = p.timestamp;
  }, [isConnected, p.timestamp, p.soc, rawTelemetry, log]);

  // Live status line — update at most once per new `ts`.
  useEffect(() => {
    if (!isConnected || !csvModeRef.current || p.timestamp <= 0) return;
    if (p.timestamp === lastLoggedTsRef.current) return;
    lastLoggedTsRef.current = p.timestamp;
    setDiagStatus("ok");
    setDiagMsg(`Live — ts ${p.timestamp}, SOC ${fmtInt(p.soc)}%`);
  }, [isConnected, p.timestamp, p.soc]);

  const toggle = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubsystemOn((prev) => ({ ...prev, [tab]: !prev[tab] }));
  };

  const isOn = subsystemOn[activeTab];
  const ac   = TABS.find((t) => t.id === activeTab)!;

  const diagStatusColor =
    diagStatus === "ok" ? C.green :
    diagStatus === "error" ? C.red :
    diagStatus === "running" ? C.yellow :
    C.muted;

  const diagStatusText =
    diagStatus === "idle"
      ? isConnected
        ? "Live telemetry — auto updates when data arrives"
        : "Connect USB for live diagnostics"
      : diagStatus === "running"
        ? diagMsg
        : diagStatus === "ok"
          ? diagMsg || "Live — continuous csvlog stream"
          : diagMsg || "Failed";

  const openLog = useCallback(() => {
    Haptics.selectionAsync();
    setLogModalVisible(true);
  }, []);

  const toolbarActions = (
    <View style={ha.row}>
      <Pressable
        style={({ pressed }) => [ha.logBtn, pressed && ha.pressed]}
        onPress={openLog}
        accessibilityLabel="Open diagnosis log"
      >
        <MaterialCommunityIcons name="text-box-outline" size={iconSm} color={C.blue} />
        <Text style={ha.logBtnTxt}>LOG</Text>
        {diagLog.length > 0 && (
          <View style={ha.logBadge}>
            <Text style={ha.logBadgeTxt}>{diagLog.length > 99 ? "99+" : diagLog.length}</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          ha.runBtn,
          !isConnected && ha.runBtnDisabled,
          pressed && isConnected && ha.pressed,
        ]}
        disabled={!isConnected || sending}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          startCsvLog("manual").catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            log(`✗ ${msg}`);
            setDiagStatus("error");
            setDiagMsg(msg);
          });
        }}
        accessibilityLabel="Start CSV log"
      >
        {sending || (diagStatus === "running" && p.timestamp <= 0) ? (
          <ActivityIndicator size="small" color={Colors.onPrimary} />
        ) : (
          <>
            <MaterialCommunityIcons
              name={diagStatus === "ok" ? "refresh" : "play-circle-outline"}
              size={iconSm}
              color={Colors.onPrimary}
            />
            <Text style={ha.runBtnTxt}>{diagStatus === "ok" ? "RESTART" : "RUN"}</Text>
          </>
        )}
      </Pressable>
    </View>
  );

  return (
    <View style={s.root}>
      <Header />
      <UsbConnectionBar compact trailing={toolbarActions} />

      {isCompact && !isLandscape && (
        <View style={s.rotateBanner}>
          <MaterialCommunityIcons name="phone-rotate-landscape" size={iconLg} color={C.blue} />
          <Text style={s.rotateBannerTxt}>
            Rotate your phone horizontally for the best diagnostics view
          </Text>
        </View>
      )}

     
      <Modal
        visible={logModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLogModalVisible(false)}
      >
        <View style={dl.modalOverlay}>
          <Pressable style={dl.modalDismissArea} onPress={() => setLogModalVisible(false)} />
          <View style={dl.modalBox}>
            <View style={dl.modalHandle} />
            <View style={dl.modalHead}>
              <MaterialCommunityIcons name="text-box-multiple-outline" size={iconMd} color={C.green} />
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
                  {diagStatus === "running" ? "● LISTENING" :
                   diagStatus === "ok" ? "● LIVE" :
                   diagStatus === "error" ? "✗ ERROR" : "IDLE"}
                </Text>
              </View>
              <Pressable style={dl.modalClose} onPress={() => setLogModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={iconLg} color={C.muted} />
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, isCompact && s.bodyCompact]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Metrics Row - 6 Cards */}
        <View style={[s.topMetricsRow, isCompact && s.topMetricsRowCompact]}>
          {/* Pack Voltage */}
          <View style={[s.metricCard, isCompact && s.metricCardCompact]}>
            <Text style={s.metricLabel}>PACK VOLTAGE</Text>
            <View style={[s.metricDivider, { backgroundColor: "#92ccff" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, isCompact && s.metricValueCompact]}>{showNum(isConnected, p.packVoltageV)}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* Pack Current */}
          <View style={[s.metricCard, isCompact && s.metricCardCompact]}>
            <Text style={s.metricLabel}>PACK CURRENT</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#54e98a" }, isCompact && s.metricValueCompact]}>{showNum(isConnected, p.packCurrentA)}</Text>
              <Text style={s.metricUnit}>A</Text>
            </View>
          </View>

          {/* Pack Temp */}
          <View style={[s.metricCard, isCompact && s.metricCardCompact]}>
            <Text style={s.metricLabel}>PACK TEMP</Text>
            <View style={[s.metricDivider, { backgroundColor: "#58e5c2" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#58e5c2" }, isCompact && s.metricValueCompact]}>{showNum(isConnected, p.packTempC)}</Text>
              <Text style={s.metricUnit}>°C</Text>
            </View>
          </View>

          {/* Min Cell */}
          <View style={[s.metricCard, isCompact && s.metricCardCompact]}>
            <Text style={s.metricLabel}>MIN CELL</Text>
            <View style={[s.metricDivider, { backgroundColor: "#92ccff" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, isCompact && s.metricValueCompact]}>{showNum(isConnected, p.minV)}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* Max Cell */}
          <View style={[s.metricCard, isCompact && s.metricCardCompact]}>
            <Text style={s.metricLabel}>MAX CELL</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, isCompact && s.metricValueCompact]}>{showNum(isConnected, p.maxV)}</Text>
              <Text style={s.metricUnit}>V</Text>
            </View>
          </View>

          {/* SOC */}
          <View style={[s.metricCard, isCompact && s.metricCardCompact]}>
            <Text style={s.metricLabel}>SOC</Text>
            <View style={[s.metricDivider, { backgroundColor: "#54e98a" }]} />
            <View style={s.metricValueRow}>
              <Text style={[s.metricValue, { color: "#54e98a" }, isCompact && s.metricValueCompact]}>{showInt(isConnected, p.soc)}</Text>
              <Text style={s.metricUnit}>%</Text>
            </View>
          </View>
        </View>

        {/* Main Grid - 3 Cards */}
        <View style={[s.mainGrid, isCompact && s.mainGridCompact]}>
          {/* HV + EVCC Card */}
          <View style={[s.mainCard, isCompact && s.mainCardCompact]}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="lightning-bolt" size={iconMd} color="#92ccff" />
                <Text style={s.cardHeaderText}>HV + EVCC</Text>
              </View>
            </View>
            <View style={[s.cardContent, isCompact && s.cardContentCompact]}>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>HV BAT+ VOLTAGE</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.batPlusV, " V")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>HV FC VOLTAGE</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.fcV, " V")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>HV DCDC VOLTAGE</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.dcdcHV, " V")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>HV DSG VOLTAGE</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.dsgV, " V")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>HV SC VOLTAGE</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.scV, " V")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>HV PCHG VOLTAGE</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.pchgV, " V")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>EVCC MSG</Text>
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: isConnected ? "#54e98a" : "#37393d" }]} />
                  <Text style={[s.statusText, { color: isConnected ? "#54e98a" : "#64748b" }]}>
                    {isConnected ? (p.evccLastMsgCode || "WAITING") : "WAITING"}
                  </Text>
                </View>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>EVCC CAN ID</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{isConnected ? (p.evccLastCanId || "—") : "—"}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>EVCC DESC</Text>
                <Text style={[s.dataValue, s.dataValueSmall, isCompact && s.dataValueCompact]} numberOfLines={3}>
                  {isConnected ? (p.evccDescription || "—") : "—"}
                </Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>INSULATION</Text>
                <Text style={[s.dataValue, { color: p.faultISO ? "#ffb4ab" : "#54e98a" }, isCompact && s.dataValueRowCompact]}>
                  {p.faultISO ? "FAULT" : "OK"}
                </Text>
              </View>
            </View>
          </View>

          {/* DC-DC + Charger Card */}
          <View style={[s.mainCard, isCompact && s.mainCardCompact]}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="ev-station" size={iconMd} color="#54e98a" />
                <Text style={s.cardHeaderText}>DC-DC + CHARGER</Text>
              </View>
            </View>
            <View style={[s.cardContent, isCompact && s.cardContentCompact]}>
              <View style={[s.dcdcGrid, isCompact && s.dcdcGridCompact]}>
                <View style={[s.dcdcItem, isCompact && s.dcdcItemCompact]}>
                  <Text style={s.dcdcLabel}>DCDC OUT</Text>
                  <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdcVoltV, " V")}</Text>
                </View>
                <View style={[s.dcdcItem, isCompact && s.dcdcItemCompact]}>
                  <Text style={s.dcdcLabel}>DCDC LOAD</Text>
                  <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdcCurrentA, " A")}</Text>
                </View>
                <View style={[s.dcdcItem, isCompact && s.dcdcItemCompact]}>
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
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>CHARGER VOLTAGE</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.chrgrVoltV, " V")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>CHARGER CURRENT</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.chrgrCurrentA, " A")}</Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>CHARGER ERROR</Text>
                <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showInt(isConnected, p.chrgrErrorCode)}</Text>
              </View>
              <View style={s.dcdc2Section}>
                <Text style={s.dcdc2Title}>DC-DC 2 (0x18F8622B)</Text>
                <View style={[s.dcdcGrid, isCompact && s.dcdcGridCompact]}>
                  <View style={[s.dcdcItem, isCompact && s.dcdcItemCompact]}>
                    <Text style={s.dcdcLabel}>DCDC2 OUT</Text>
                    <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdc2VoltV, " V")}</Text>
                  </View>
                  <View style={[s.dcdcItem, isCompact && s.dcdcItemCompact]}>
                    <Text style={s.dcdcLabel}>DCDC2 LOAD</Text>
                    <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdc2CurrentA, " A")}</Text>
                  </View>
                  <View style={[s.dcdcItem, isCompact && s.dcdcItemCompact]}>
                    <Text style={s.dcdcLabel}>DCDC2 TEMP</Text>
                    <Text style={s.dcdcValue}>{showNum(isConnected, p.dcdc2TempC, " °C")}</Text>
                  </View>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>WORK STATE</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{show(isConnected, p.dcdc2WorkState)}</Text>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>FAULT LEVEL</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{show(isConnected, p.dcdc2FaultLevel)}</Text>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>SYS STATE</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{show(isConnected, p.dcdc2SysState)}</Text>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>ERR FLAGS</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showInt(isConnected, p.dcdc2ErrFlags)}</Text>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>VERSION</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showInt(isConnected, p.dcdc2Version)}</Text>
                </View>
                <Text style={[s.dcdc2Title, { marginTop: 8 }]}>DC-DC 2 CMD (0x10262B27)</Text>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>CMD MODE</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{show(isConnected, p.dcdc2CmdMode)}</Text>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>V SET</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.dcdc2CmdVset, " V")}</Text>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>I SET</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{showNum(isConnected, p.dcdc2CmdIset, " A")}</Text>
                </View>
                <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                  <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>RESET</Text>
                  <Text style={[s.dataValue, isCompact && s.dataValueRowCompact]}>{show(isConnected, p.dcdc2CmdReset)}</Text>
                </View>
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
          <View style={[s.mainCard, isCompact && s.mainCardCompact]}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="cog" size={iconMd} color="#58e5c2" />
                <Text style={s.cardHeaderText}>MOTOR + RELAYS</Text>
              </View>
            </View>
            <View style={[s.cardContent, isCompact && s.cardContentCompact]}>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR RPM</Text>
                  <Text style={s.motorValue}>
                    {hasLiveMotor(isConnected, p.timestamp) ? fmtInt(p.motorRpm) : "—"}
                  </Text>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: hasLiveMotor(isConnected, p.timestamp) ? `${Math.min((p.motorRpm / 3000) * 100, 100)}%` : "0%" }]} />
                </View>
              </View>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR TEMP</Text>
                  <Text style={[s.motorValue, { color: "#58e5c2" }]}>
                    {hasLiveMotor(isConnected, p.timestamp) ? `${fmtN(p.motorTempC)} °C` : "—"}
                  </Text>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { backgroundColor: "#58e5c2", width: hasLiveMotor(isConnected, p.timestamp) ? `${Math.min((p.motorTempC / 80) * 100, 100)}%` : "0%" }]} />
                </View>
              </View>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR RUNTIME</Text>
                  <Text style={s.motorValue}>
                    {hasLiveMotor(isConnected, p.timestamp) ? fmtMotorRuntime(p.motorRuntime) : "—"}
                  </Text>
                </View>
              </View>
              <View style={s.motorSection}>
                <View style={s.motorHeader}>
                  <Text style={s.motorLabel}>MOTOR LOAD</Text>
                  <Text style={s.motorValue}>
                    {hasLiveMotor(isConnected, p.timestamp) ? `${fmtInt(p.motorLoadPct)} %` : "—"}
                  </Text>
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
        <View style={[s.bottomGrid, isCompact && s.bottomGridCompact]}>
          <View style={[s.mainCard, isCompact && s.mainCardCompact]}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="battery-heart" size={iconMd} color={C.green} />
                <Text style={s.cardHeaderText}>CELLS</Text>
              </View>
              {isConnected && p.timestamp > 0 && (
                <Text style={s.liveBadge}>LIVE · ts {p.timestamp}</Text>
              )}
            </View>
            <View style={[s.cardContent, isCompact && s.cardContentCompact]}>
              <View style={[s.cellsSummaryRow, isCompact && s.cellsSummaryRowCompact]}>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>TOTAL CELLS</Text>
                  <Text style={s.cellsSummaryValue}>
                    {isConnected ? fmtInt(p.totalCells) : "—"}
                  </Text>
                </View>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>CYCLE</Text>
                  <Text style={s.cellsSummaryValue}>
                    {isConnected ? fmtInt(p.cycle) : "—"}
                  </Text>
                </View>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>MIN CELL</Text>
                  <Text style={s.cellsSummaryValue}>
                    {showNum(isConnected, p.minV, " V")}
                  </Text>
                  <Text style={s.cellsSummarySub}>
                    ID {isConnected ? fmtInt(p.minCellId) : "—"}
                  </Text>
                </View>
                <View style={s.cellsSummaryItem}>
                  <Text style={s.cellsSummaryLabel}>MAX CELL</Text>
                  <Text style={s.cellsSummaryValue}>
                    {showNum(isConnected, p.maxV, " V")}
                  </Text>
                  <Text style={s.cellsSummarySub}>
                    ID {isConnected ? fmtInt(p.maxCellId) : "—"}
                  </Text>
                </View>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>CELL VOLTAGES (V)</Text>
                <Text style={[s.dataValue, s.dataValueSmall, isCompact && s.dataValueCompact]} numberOfLines={4}>
                  {isConnected ? fmtCellList(p.cellVoltages) : "—"}
                </Text>
              </View>
              <View style={[s.dataRow, isCompact && s.dataRowCompact]}>
                <Text style={[s.dataLabel, isCompact && s.dataLabelCompact]}>CELL TEMPS (°C)</Text>
                <Text style={[s.dataValue, s.dataValueSmall, isCompact && s.dataValueCompact]} numberOfLines={4}>
                  {isConnected ? fmtCellList(p.cellTemperatures) : "—"}
                </Text>
              </View>
            </View>
          </View>

          <View style={[s.mainCard, isCompact && s.mainCardCompact]}>
            <View style={s.cardHeader}>
              <View style={s.cardHeaderLeft}>
                <MaterialCommunityIcons name="alert-circle-outline" size={iconMd} color="#ffb4ab" />
                <Text style={s.cardHeaderText}>BMS FAULTS</Text>
              </View>
            </View>
            <View style={[s.cardContent, isCompact && s.cardContentCompact]}>
              <View style={[s.faultPillGrid, isCompact && s.faultPillGridCompact]}>
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

const ha = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pressed: { opacity: 0.85 },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(80,180,255,0.35)",
    backgroundColor: "rgba(80,180,255,0.1)",
    position: "relative",
  },
  logBtnTxt: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  logBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.orange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  logBadgeTxt: {
    color: Colors.onPrimary,
    fontSize: 8,
    fontWeight: "800",
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
    backgroundColor: Colors.primary,
    minWidth: 52,
    justifyContent: "center",
  },
  runBtnDisabled: { opacity: 0.45 },
  runBtnTxt: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});

const dl = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalDismissArea: { flex: 1 },
  modalBox: {
    backgroundColor: "rgba(14,18,20,1)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: "88%",
    minHeight: "50%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 8,
    marginBottom: 4,
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
  bodyCompact: { padding: 10, gap: 10, paddingBottom: 24 },

  rotateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(80,180,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(80,180,255,0.25)",
  },
  rotateBannerTxt: {
    flex: 1,
    color: C.blue,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  statusStrip: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1C1F23",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: 2,
  },
  statusStripCompact: {
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusStripTitle: {
    color: "#E8EAED",
    fontSize: 12,
    fontWeight: "600",
  },
  statusStripSub: {
    fontSize: 11,
    color: "#9AA0A6",
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
  cellsSummaryRowCompact: {
    gap: 6,
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
  faultPillGridCompact: {
    gap: 6,
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
  topMetricsRowCompact: {
    marginBottom: 8,
    gap: 6,
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
  metricCardCompact: {
    minWidth: "47%",
    padding: 10,
  },
  metricValueCompact: {
    fontSize: 20,
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
  mainGridCompact: {
    flexDirection: "column",
    gap: 10,
    marginBottom: 10,
  },
  mainCard: {
    flex: 1,
    backgroundColor: "#1C1F23",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
  },
  mainCardCompact: {
    flex: undefined,
    width: "100%",
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
  cardContentCompact: {
    padding: 10,
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
  dataRowCompact: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    paddingVertical: 6,
  },
  dataLabel: {
    color: "#bbcbbb",
    fontSize: 11,
    fontWeight: "500",
  },
  dataLabelCompact: {
    fontSize: 10,
  },
  dataValue: {
    color: "#e2e2e6",
    fontSize: 14,
    fontWeight: "500",
  },
  dataValueRowCompact: {
    fontSize: 13,
    alignSelf: "stretch",
    textAlign: "left",
  },
  dataValueSmall: {
    fontSize: 10,
    maxWidth: 160,
    textAlign: "right",
  },
  dataValueCompact: {
    maxWidth: undefined,
    textAlign: "left",
    alignSelf: "stretch",
    fontSize: 10,
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
  dcdcGridCompact: {
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  dcdcItem: {
    flex: 1,
    backgroundColor: "#1e2023",
    padding: 12,
    borderRadius: 6,
  },
  dcdcItemCompact: {
    minWidth: "30%",
    flexGrow: 1,
    padding: 8,
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
  dcdc2Section: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: 4,
  },
  dcdc2Title: {
    color: "#92ccff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
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
  bottomGridCompact: {
    flexDirection: "column",
    gap: 10,
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
