import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { usePathname } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";
import { useCanCsvLog } from "@/hooks/useCanCsvLog";
import { useDeviceScale } from "@/hooks/useDeviceScale";
import { CanLogRow, CSV_HEADERS, formatLogTime } from "@/lib/canCsvLog";
import { openSavedPath, saveCsvToDevice, showSaveError } from "@/lib/saveCsvFile";
import { sendCdcLine } from "@/lib/usbCdc";
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
  const isFocused = usePathname().includes("csv_log");

  const [statusMsg, setStatusMsg] = useState(
    "Connect USB — tap Download CSV to export current data",
  );
  const [saving, setSaving] = useState(false);

  const autoRequestedRef = useRef(false);
  const connectAtRef = useRef<number | null>(null);
  const previewScrollRef = useRef<ScrollView>(null);

  const sendCommand = useCallback(
    async (obj: Record<string, unknown>) => {
      if (connectionStatus !== "connected") return;
      await sendCdcLine(writeData, obj);
    },
    [connectionStatus, writeData],
  );

  const sendCsvCmd = useCallback(async () => {
    if (connectionStatus !== "connected") return;
    setStatusMsg('→ {"cmd":"csv"}');
    await sendCommand({ cmd: "csv" });
  }, [connectionStatus, sendCommand]);

  const {
    liveRows,
    totalCount,
    recordedCount,
    isStreaming,
    sessionStart,
    sessionInfo,
    framesPerSec,
    capturePhase,
    csvPreviewLines,
    markSaving,
    getCurrentCsv,
    getRecordedCount,
    startRecording,
    stopRecording,
    reset,
  } = useCanCsvLog(isConnected, sendCommand);

  const downloadCsv = useCallback(async () => {
    const rowCount = getRecordedCount();
    if (rowCount === 0) {
      Alert.alert("Nothing to Save", "No CAN frames captured yet.");
      return;
    }

    setSaving(true);
    markSaving(true);
    stopRecording(); // Stop recording when generating the final CSV
    setStatusMsg(`Preparing CSV (${rowCount.toLocaleString()} rows)…`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    await new Promise((r) => setTimeout(r, 50));

    try {
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `can_log_${stamp}.csv`;
      const csv = getCurrentCsv();

      const result = await saveCsvToDevice(csv, filename);

      if (result.ok) {
        Alert.alert(
          "CSV Ready",
          `${result.message}\n\n${rowCount.toLocaleString()} rows exported.`,
          result.path
            ? [{ text: "OK" }, { text: "Open", onPress: () => openSavedPath(result.path!) }]
            : [{ text: "OK" }],
        );
        setStatusMsg(`✓ ${result.message}`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result.message !== "Share cancelled") {
        showSaveError(result.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showSaveError(msg);
    } finally {
      setSaving(false);
      markSaving(false);
    }
  }, [getRecordedCount, getCurrentCsv, markSaving, stopRecording]);

  const recordingStatus = useMemo(() => {
    if (!sessionInfo || !isStreaming) return null;
    const fps = framesPerSec > 0 ? ` · ~${framesPerSec}/s` : "";
    if (capturePhase === "running") {
      return `Recording · ${recordedCount.toLocaleString()} rows${fps}`;
    }
    if (capturePhase === "saving") {
      return "Preparing CSV…";
    }
    return null;
  }, [sessionInfo, isStreaming, capturePhase, recordedCount, framesPerSec]);

  const displayStatus = recordingStatus ?? statusMsg;

  useEffect(() => {
    if (!isConnected) {
      connectAtRef.current = null;
      autoRequestedRef.current = false;
      setStatusMsg("Disconnected");
      return;
    }
    connectAtRef.current = Date.now();
    autoRequestedRef.current = false;
    reset();
    setStatusMsg("Waiting for stream… csvlog will start on connect ack");
  }, [isConnected, reset]);

  useEffect(() => {
    if (!isConnected || !isFocused || autoRequestedRef.current) return;
    const t0 = connectAtRef.current ?? Date.now();
    const waitMs = 800;
    const remaining = waitMs - (Date.now() - t0);
    const id = setTimeout(() => {
      if (!isConnected || !isFocused || autoRequestedRef.current) return;
      autoRequestedRef.current = true;
      sendCsvCmd().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setStatusMsg(`Send failed: ${msg}`);
      });
    }, Math.max(0, remaining));
    return () => clearTimeout(id);
  }, [isConnected, isFocused, sendCsvCmd]);

  const lastPreviewScrollRef = useRef(0);
  useEffect(() => {
    if (csvPreviewLines.length === 0) return;
    const now = Date.now();
    if (now - lastPreviewScrollRef.current < 800) return;
    lastPreviewScrollRef.current = now;
    previewScrollRef.current?.scrollToEnd({ animated: false });
  }, [csvPreviewLines.length]);

  const renderLogRow = useCallback(
    ({ item }: { item: CanLogRow }) => (
      <LogRow row={item} sessionStart={sessionStart} />
    ),
    [sessionStart],
  );

  const keyExtractor = useCallback(
    (item: CanLogRow, i: number) => `log-${item.index}-${i}`,
    [],
  );

  const statusLabel =
    capturePhase === "running"
      ? "REC"
      : capturePhase === "saving"
        ? "SAVE"
        : "—";

  const connectActions = (
    <View style={ca.row}>
      {capturePhase === "running" ? (
        <Pressable
          style={[ca.btn, ca.btnPrimary, { backgroundColor: C.red, borderColor: C.red }]}
          onPress={() => void downloadCsv()}
          disabled={saving || recordedCount === 0}
        >
          {saving ? (
            <ActivityIndicator size="small" color={C.bg} />
          ) : (
            <MaterialCommunityIcons name="stop" size={iconSm} color={C.bg} />
          )}
          <Text style={[ca.btnTxt, ca.btnPrimaryTxt]}>Download CSV</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[ca.btn, ca.btnPrimary, { backgroundColor: C.green, borderColor: C.green }]}
          onPress={() => startRecording()}
          disabled={!isConnected || saving}
        >
          <MaterialCommunityIcons name="play" size={iconSm} color={C.bg} />
          <Text style={[ca.btnTxt, ca.btnPrimaryTxt]}>Start Record</Text>
        </Pressable>
      )}
      <Pressable
        style={ca.btn}
        onPress={() => {
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
        inverted
        data={liveRows}
        keyExtractor={keyExtractor}
        renderItem={renderLogRow}
        removeClippedSubviews
        maxToRenderPerBatch={12}
        windowSize={7}
        initialNumToRender={16}
        updateCellsBatchingPeriod={100}
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
        title="CSV preview"
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
            Rows appear here as they are captured…
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
          ]}
        >
          <Text style={s.countdownTxt}>{statusLabel}</Text>
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
        <Text style={s.stat}>Rows: {recordedCount.toLocaleString()}</Text>
        {framesPerSec > 0 && <Text style={s.statFps}>~{framesPerSec}/s</Text>}
        <Text style={s.statMsg} numberOfLines={2}>
          {displayStatus}
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
