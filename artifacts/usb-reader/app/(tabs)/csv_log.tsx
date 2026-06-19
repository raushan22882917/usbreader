import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";
import {
  CAPTURE_DURATION_SEC,
  useCanCsvLog,
} from "@/hooks/useCanCsvLog";
import { useDeviceScale } from "@/hooks/useDeviceScale";
import { CanLogRow, CSV_HEADERS, formatLogTime } from "@/lib/canCsvLog";
import { openSavedPath, saveCsvToDevice, showSaveError } from "@/lib/saveCsvFile";
import { Colors, Spacing, Border } from "@/theme";

const C = {
  bg: Colors.background,
  panel: Colors.surfaceContainerLow,
  card: Colors.surfaceContainer,
  border: Colors.outlineVariant,
  text: Colors.onSurface,
  muted: Colors.onSurfaceVariant,
  dim: Colors.dim,
  green: Colors.tertiary,
  yellow: Colors.primaryFixedDim,
  red: Colors.error,
  blue: Colors.secondary,
  term: Colors.terminal,
};

function strToHex(str: string): string {
  let hex = "";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

async function sendCdcLine(
  writeData: (hex: string) => Promise<void>,
  obj: Record<string, unknown>,
): Promise<void> {
  const line = JSON.stringify(obj) + "\n";
  const hex = strToHex(line);
  const chunkHex = 512;
  for (let i = 0; i < hex.length; i += chunkHex) {
    await writeData(hex.slice(i, i + chunkHex));
    if (i + chunkHex < hex.length) await new Promise((r) => setTimeout(r, 1));
  }
}

function LogRow({
  row,
  sessionStart,
}: {
  row: CanLogRow;
  sessionStart: Date | null;
}) {
  const time =
    sessionStart != null ? formatLogTime(sessionStart, row.timeMs) : "—";
  return (
    <View style={lr.row}>
      <Text style={[lr.cell, lr.idx]}>{row.index}</Text>
      <Text style={[lr.cell, lr.dir, row.direction === "Tx" && lr.dirTx]}>
        {row.direction}
      </Text>
      <Text style={[lr.cell, lr.time]} numberOfLines={1}>
        {time}
      </Text>
      <Text style={[lr.cell, lr.id]} numberOfLines={1}>
        {row.idHex}
      </Text>
      <Text style={[lr.cell, lr.typ]}>{row.type}</Text>
      <Text style={[lr.cell, lr.len]}>{row.length}</Text>
      <Text style={[lr.cell, lr.data]} numberOfLines={1}>
        {row.dataHex || "—"}
      </Text>
    </View>
  );
}

const lr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 4,
  },
  cell: { color: C.text, fontSize: 9, fontFamily: "monospace" },
  idx: { width: 32, color: C.muted },
  dir: { width: 24, color: C.green },
  dirTx: { color: C.yellow },
  time: { width: 76, color: C.blue },
  id: { flex: 1, minWidth: 72, color: C.yellow },
  typ: { width: 44, color: C.muted },
  len: { width: 20, textAlign: "center", color: C.muted },
  data: { flex: 1, minWidth: 88, color: C.green },
});

function PanelHead({
  title,
  icon,
  color,
  sub,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  color: string;
  sub?: string;
}) {
  const { icon: iconScale } = useDeviceScale();
  return (
    <View style={ph.wrap}>
      <MaterialCommunityIcons name={icon} size={iconScale(13, 10)} color={color} />
      <Text style={ph.title}>{title}</Text>
      {sub ? <Text style={ph.sub}>{sub}</Text> : null}
    </View>
  );
}

const ph = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  title: { color: C.text, fontSize: 11, fontWeight: "700", flex: 1 },
  sub: { color: C.muted, fontSize: 9 },
});

export default function CsvLogScreen() {
  const { width, height } = useWindowDimensions();
  const { icon } = useDeviceScale();
  const iconSm = icon(13, 10);
  const iconMd = icon(16, 12);
  const splitRow = width >= height && width >= 520;
  const isCompact = width < 900 || height < 500;

  const { connectionStatus, writeData } = useUsb();
  const isConnected = connectionStatus === "connected";

  const {
    liveRows,
    totalCount,
    recordedCount,
    isStreaming,
    sessionStart,
    sessionInfo,
    framesPerSec,
    bufferTrimmed,
    capturePhase,
    secondsLeft,
    csvPreviewLines,
    setRecording,
    stopCapture,
    markSaving,
    getCsvForExport,
    getExportLineCount,
    reset,
  } = useCanCsvLog(isConnected);

  const [statusMsg, setStatusMsg] = useState(
    `Connect USB — auto ${CAPTURE_DURATION_SEC}s capture + save`,
  );
  const [saving, setSaving] = useState(false);

  const autoRequestedRef = useRef(false);
  const autoSavedRef = useRef(false);
  const connectAtRef = useRef<number | null>(null);
  const previewScrollRef = useRef<ScrollView>(null);

  const sendCsvCmd = useCallback(async () => {
    if (connectionStatus !== "connected") return;
    setStatusMsg('→ {"cmd":"csv"}');
    await sendCdcLine(writeData, { cmd: "csv" });
  }, [connectionStatus, writeData]);

  const saveAndDownload = useCallback(
    async (automatic = false) => {
      const lineCount = getExportLineCount();
      if (lineCount === 0) {
        if (!automatic) {
          Alert.alert("Nothing to Save", "No CAN frames captured in this session.");
        }
        return;
      }

      setSaving(true);
      markSaving();
      setStatusMsg(`Building CSV (${lineCount.toLocaleString()} rows)…`);
      if (!automatic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      await new Promise((r) => setTimeout(r, 50));

      try {
        const csv = getCsvForExport();
        const stamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const filename = `can_log_${stamp}.csv`;

        const result = await saveCsvToDevice(csv, filename);

        if (result.ok) {
          const title = automatic ? "Auto-saved CSV" : "CSV Saved";
          Alert.alert(
            title,
            `${result.message}\n\n${lineCount.toLocaleString()} rows (${CAPTURE_DURATION_SEC}s capture).`,
            result.path
              ? [{ text: "OK" }, { text: "Open", onPress: () => openSavedPath(result.path!) }]
              : [{ text: "OK" }],
          );
          setStatusMsg(`✓ ${result.message} (${lineCount.toLocaleString()} rows)`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (!automatic && result.message !== "Share cancelled") {
          showSaveError(result.message);
        } else if (automatic) {
          showSaveError(result.message);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!automatic) showSaveError(msg);
        else setStatusMsg(`Auto-save failed: ${msg}`);
      } finally {
        setSaving(false);
      }
    },
    [getExportLineCount, getCsvForExport, markSaving],
  );

  useEffect(() => {
    if (!isConnected) {
      connectAtRef.current = null;
      autoRequestedRef.current = false;
      autoSavedRef.current = false;
      setStatusMsg("Disconnected");
      return;
    }
    connectAtRef.current = Date.now();
    autoRequestedRef.current = false;
    autoSavedRef.current = false;
    reset();
    setStatusMsg(
      `Waiting for stream… ${CAPTURE_DURATION_SEC}s auto-capture will start on csvlog ack`,
    );
  }, [isConnected, reset]);

  useEffect(() => {
    if (!isConnected || autoRequestedRef.current) return;
    const t0 = connectAtRef.current ?? Date.now();
    const waitMs = 800;
    const remaining = waitMs - (Date.now() - t0);
    const id = setTimeout(() => {
      if (!isConnected || autoRequestedRef.current) return;
      autoRequestedRef.current = true;
      sendCsvCmd().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setStatusMsg(`Send failed: ${msg}`);
      });
    }, Math.max(0, remaining));
    return () => clearTimeout(id);
  }, [isConnected, sendCsvCmd]);

  // After 30s window ends → stop buffering and auto-save
  useEffect(() => {
    if (capturePhase !== "stopped" || saving || autoSavedRef.current) return;
    autoSavedRef.current = true;
    setRecording(false);
    setStatusMsg(`${CAPTURE_DURATION_SEC}s complete — saving CSV…`);
    void saveAndDownload(true);
  }, [capturePhase, saving, saveAndDownload, setRecording]);

  useEffect(() => {
    if (sessionInfo && isStreaming) {
      const fps = framesPerSec > 0 ? ` · ~${framesPerSec}/s` : "";
      const trim = bufferTrimmed > 0 ? ` · dropped ${bufferTrimmed}` : "";
      if (capturePhase === "running") {
        setStatusMsg(
          `Recording ${secondsLeft}s left · ${recordedCount.toLocaleString()} rows buffered${fps}${trim}`,
        );
      } else if (capturePhase === "saving") {
        setStatusMsg("Saving CSV to Downloads…");
      } else if (capturePhase === "stopped") {
        setStatusMsg(`Stopped · ${recordedCount.toLocaleString()} rows${fps}`);
      }
    }
  }, [
    isStreaming,
    sessionInfo,
    recordedCount,
    framesPerSec,
    bufferTrimmed,
    capturePhase,
    secondsLeft,
  ]);

  // Scroll CSV preview to bottom as new lines arrive
  useEffect(() => {
    if (csvPreviewLines.length > 0) {
      previewScrollRef.current?.scrollToEnd({ animated: false });
    }
  }, [csvPreviewLines.length]);

  const countdownLabel =
    capturePhase === "running"
      ? `0:${String(secondsLeft).padStart(2, "0")}`
      : capturePhase === "saving"
        ? "SAVE"
        : capturePhase === "stopped"
          ? "DONE"
          : "—";

  const connectActions = (
    <View style={ca.row}>
      <Pressable
        style={[ca.btn, ca.btnPrimary]}
        onPress={() => saveAndDownload(false)}
        disabled={saving || recordedCount === 0}
      >
        {saving ? (
          <ActivityIndicator size="small" color={C.bg} />
        ) : (
          <MaterialCommunityIcons name="download" size={iconSm} color={C.bg} />
        )}
        <Text style={[ca.btnTxt, ca.btnPrimaryTxt]}>Save Now</Text>
      </Pressable>
      <Pressable
        style={ca.btn}
        onPress={() => {
          stopCapture();
          setRecording(false);
          void saveAndDownload(false);
        }}
        disabled={saving || capturePhase !== "running"}
      >
        <MaterialCommunityIcons name="stop-circle-outline" size={iconSm} color={C.red} />
        <Text style={ca.btnTxt}>Stop & Save</Text>
      </Pressable>
      <Pressable
        style={ca.btn}
        onPress={() => {
          autoSavedRef.current = false;
          autoRequestedRef.current = true;
          reset();
          sendCsvCmd();
        }}
        disabled={!isConnected || saving}
      >
        <MaterialCommunityIcons name="refresh" size={iconSm} color={C.blue} />
        <Text style={ca.btnTxt}>New Session</Text>
      </Pressable>
    </View>
  );

  const logPanel = (
    <View style={s.panel}>
      <PanelHead
        title="CAN Log (live)"
        icon="lan-connect"
        color={C.green}
        sub={`${totalCount.toLocaleString()} rx`}
      />
      <View style={s.miniHead}>
        <Text style={[s.headCell, { width: 32 }]}>#</Text>
        <Text style={[s.headCell, { width: 24 }]}>Dir</Text>
        <Text style={[s.headCell, { width: 76 }]}>Time</Text>
        <Text style={[s.headCell, { flex: 1 }]}>Id</Text>
        <Text style={[s.headCell, { width: 44 }]}>Type</Text>
        <Text style={[s.headCell, { width: 20 }]}>L</Text>
        <Text style={[s.headCell, { flex: 1 }]}>Data</Text>
      </View>
      <FlatList
        style={s.list}
        data={[...liveRows].reverse()}
        keyExtractor={(item, i) => `log-${item.index}-${i}`}
        renderItem={({ item }) => (
          <LogRow row={item} sessionStart={sessionStart} />
        )}
        ListEmptyComponent={
          <Text style={s.emptyTxt}>
            {isConnected ? "Waiting for CAN frames…" : "Connect USB"}
          </Text>
        }
      />
    </View>
  );

  const csvPanel = (
    <View style={s.panel}>
      <PanelHead
        title="CSV preview (saved buffer)"
        icon="file-delimited"
        color={C.blue}
        sub={`${recordedCount.toLocaleString()} rows`}
      />
      <ScrollView
        ref={previewScrollRef}
        style={s.previewScroll}
        contentContainerStyle={s.previewContent}
      >
        <Text style={s.previewLine} selectable>
          {CSV_HEADERS.join(",")}
        </Text>
        {csvPreviewLines.map((line, i) => (
          <Text key={`csv-${i}-${line.slice(0, 12)}`} style={s.previewLine} numberOfLines={1}>
            {line}
          </Text>
        ))}
        {csvPreviewLines.length === 0 && (
          <Text style={s.previewHint}>
            Rows appear here as they are buffered for export…
          </Text>
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={s.root}>
      <Header />
      <UsbConnectionBar compact trailing={connectActions} />

      <View style={[s.toolbar, isCompact && s.toolbarCompact]}>
        <MaterialCommunityIcons name="file-delimited-outline" size={iconMd} color={C.blue} />
        <Text style={[s.title, isCompact && s.titleCompact]} numberOfLines={1}>
          CAN CSV Log
        </Text>
        <View
          style={[
            s.countdownPill,
            capturePhase === "running" && { borderColor: `${C.red}88` },
            capturePhase === "stopped" && { borderColor: `${C.green}88` },
          ]}
        >
          <Text style={s.countdownTxt}>{countdownLabel}</Text>
          <Text style={s.countdownSub}>/{CAPTURE_DURATION_SEC}s</Text>
        </View>
        <View style={[s.pill, { borderColor: isConnected ? `${C.green}55` : `${C.red}55` }]}>
          <View style={[s.dot, { backgroundColor: isConnected ? C.green : C.red }]} />
          <Text style={[s.pillTxt, { color: isConnected ? C.green : C.red }]}>
            {capturePhase === "running"
              ? "REC"
              : capturePhase === "saving"
                ? "SAVE"
                : isConnected
                  ? "USB"
                  : "OFF"}
          </Text>
        </View>
      </View>

      <View style={[s.statsRow, isCompact && s.statsRowCompact]}>
        <Text style={s.stat}>Rx: {totalCount.toLocaleString()}</Text>
        <Text style={s.stat}>CSV: {recordedCount.toLocaleString()}</Text>
        {framesPerSec > 0 && <Text style={s.statFps}>~{framesPerSec}/s</Text>}
        <Text style={s.statMsg} numberOfLines={2}>
          {statusMsg}
        </Text>
      </View>

      <View style={[s.split, splitRow ? s.splitRow : s.splitCol]}>
        {logPanel}
        <View style={splitRow ? s.splitDividerV : s.splitDividerH} />
        {csvPanel}
      </View>

      <BottomNav />
    </View>
  );
}

const ca = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    flexShrink: 0,
  },
  btnPrimary: { backgroundColor: C.green, borderColor: C.green },
  btnTxt: { color: C.text, fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
  btnPrimaryTxt: { color: C.bg },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: Border.width,
    borderBottomColor: C.border,
    backgroundColor: C.panel,
    flexShrink: 0,
  },
  toolbarCompact: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  title: { color: C.text, fontSize: 13, fontWeight: "700", flex: 1 },
  titleCompact: { fontSize: 12 },
  countdownPill: {
    flexDirection: "row",
    alignItems: "baseline",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: C.card,
    flexShrink: 0,
  },
  countdownTxt: { color: C.yellow, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
  countdownSub: { color: C.muted, fontSize: 9, marginLeft: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  statsRowCompact: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stat: { color: C.blue, fontSize: 10, fontWeight: "700" },
  statFps: { color: C.green, fontSize: 10, fontWeight: "800" },
  statMsg: { flex: 1, color: C.muted, fontSize: 10, minWidth: 120 },
  split: { flex: 1 },
  splitRow: { flexDirection: "row" },
  splitCol: { flexDirection: "column" },
  splitDividerV: { width: 1, backgroundColor: C.border },
  splitDividerH: { height: 1, backgroundColor: C.border },
  panel: { flex: 1, minHeight: 120 },
  miniHead: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: C.panel,
    gap: 4,
  },
  headCell: { color: C.muted, fontSize: 8, fontWeight: "700", fontFamily: "monospace" },
  list: { flex: 1, backgroundColor: C.term },
  emptyTxt: { color: C.dim, fontSize: 11, textAlign: "center", padding: 24 },
  previewScroll: { flex: 1, backgroundColor: "#0a0e10" },
  previewContent: { padding: 8, paddingBottom: 16 },
  previewLine: {
    color: C.green,
    fontSize: 9,
    fontFamily: "monospace",
    lineHeight: 14,
  },
  previewHint: { color: C.dim, fontSize: 10, fontStyle: "italic", marginTop: 8 },
});
