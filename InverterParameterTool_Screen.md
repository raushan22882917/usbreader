import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { useUsb } from "@/context/UsbContext";
import { useParsedUsbData } from "@/hooks/useParsedUsbData";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";
import USBSerialService from "@/USBSerialService";

import { Colors } from "@/theme";

const C = {
  bg:       Colors.background,
  card:     Colors.surfaceContainer,
  row:      Colors.surfaceContainerHigh,
  border:   Colors.outlineVariant,
  text:     Colors.onSurface,
  muted:    Colors.onSurfaceVariant,
  mid:      Colors.onSurface,
  green:    Colors.tertiary,
  yellow:   Colors.primaryFixedDim,
  red:      Colors.error,
  blue:     Colors.secondary,
  orange:   Colors.primary,
  terminal: Colors.terminal,
};

// ── Flash / OTA constants ─────────────────────────────────────
const FLASH_SIZE       = 131072;    // 128 KB
const DATA_PER_FRAME   = 4;
const N_FRAMES         = FLASH_SIZE / DATA_PER_FRAME; // 32768
// ESP32 firmware BATCH_SIZE = 64. startSeq = batchIndex * 64.
// The firmware must call Serial.setRxBufferSize(4096) before Serial.begin()
// to handle the ~1100-byte JSON per batch (default buffer is only 256 bytes).
const FRAMES_PER_BATCH = 64;
const N_BATCHES        = N_FRAMES / FRAMES_PER_BATCH; // 512

// Timeouts (ms)
const TIMEOUT_READY_MS  = 5000;   // wait for {"status":"ready"} after start
const TIMEOUT_BATCH_MS  = 8000;   // wait for batch ACK JSON
const TIMEOUT_VERIFY_MS = 12000;  // wait for {"status":"complete"}

// Retry limits
const MAX_BATCH_RETRIES   = 3;
const MAX_SESSION_RETRIES = 2;
const MAX_STEP_RETRIES    = 3;

// ── CRC32 — matches Python's binascii.crc32 ──────────────────
function crc32(buf: Uint8Array): number {
  let c = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? ((c >>> 1) ^ 0xEDB88320) >>> 0 : (c >>> 1) >>> 0;
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Encode a UTF-8 string to a lowercase hex string ──────────
// UsbContext.writeData() expects a hex-encoded byte string (e.g. "7b22636d64...").
// ESP32 Serial.readStringUntil('\n') reads raw bytes, so we encode the JSON
// text + newline terminator as hex before handing it to writeData().
function strToHex(str: string): string {
  let hex = "";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

type ViewMode = "hex" | "binary" | "decimal" | "ascii";

interface FileInfo {
  name: string;
  origSize: number;   // original file size before padding
  size: number;       // padded/trimmed size (= FLASH_SIZE)
  bytes: Uint8Array;
  crc32: number;
  isPadded: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function byteToMode(b: number, mode: ViewMode): string {
  switch (mode) {
    case "hex":      return b.toString(16).padStart(2, "0").toUpperCase();
    case "binary":   return b.toString(2).padStart(8, "0");
    case "decimal":  return b.toString(10).padStart(3, "0");
    case "ascii":    return b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
  }
}

function byteToAscii(b: number): string {
  return b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
}

// ── Parse loaded file — matches Python load_firmware() ───────
function parseFirmware(name: string, raw: Uint8Array): Uint8Array {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  let bytes: Uint8Array;

  if (ext === "h") {
    // Extract 0xXX tokens like Python re.findall(r"0[xX][0-9A-Fa-f]{2}", text)
    const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
    const tokens = text.match(/0[xX][0-9A-Fa-f]{2}/g) ?? [];
    bytes = new Uint8Array(tokens.map((t) => parseInt(t, 16)));
  } else {
    bytes = raw;
  }

  // Pad to FLASH_SIZE with 0xFF, or trim if larger — matches Python exactly
  if (bytes.length < FLASH_SIZE) {
    const padded = new Uint8Array(FLASH_SIZE).fill(0xFF);
    padded.set(bytes);
    return padded;
  }
  if (bytes.length > FLASH_SIZE) {
    return bytes.slice(0, FLASH_SIZE);
  }
  return bytes;
}

const BYTES_PER_ROW = 16;
const VISIBLE_ROWS = 200;

function HexTable({ bytes, mode, searchQuery, jumpOffset }: {
  bytes: Uint8Array; mode: ViewMode; searchQuery: string; jumpOffset: number;
}) {
  const totalRows = Math.ceil(bytes.length / BYTES_PER_ROW);
  const rows: number[][] = [];
  for (let i = 0; i < Math.min(totalRows, VISIBLE_ROWS); i++) {
    const row: number[] = [];
    for (let j = 0; j < BYTES_PER_ROW; j++) {
      const idx = i * BYTES_PER_ROW + j;
      if (idx < bytes.length) row.push(bytes[idx]);
    }
    rows.push(row);
  }

  const colW = mode === "binary" ? 64 : mode === "decimal" ? 28 : mode === "ascii" ? 12 : 22;

  return (
    <View style={ht.root}>
      <View style={ht.headerRow}>
        <Text style={ht.offsetCell}>Offset</Text>
        <View style={ht.sep} />
        <View style={ht.bytesRow}>
          {Array.from({ length: BYTES_PER_ROW }).map((_, i) => (
            <Text key={i} style={[ht.headerByte, { width: colW }]}>
              {i.toString(16).toUpperCase().padStart(2, "0")}
            </Text>
          ))}
        </View>
        {mode !== "ascii" && (
          <>
            <View style={ht.sep} />
            <Text style={ht.asciiHeader}>ASCII</Text>
          </>
        )}
      </View>

      {rows.map((row, ri) => {
        const offset = ri * BYTES_PER_ROW;
        return (
          <View key={ri} style={[ht.dataRow, ri % 2 === 0 ? null : { backgroundColor: "rgba(255,255,255,0.015)" }]}>
            <Text style={ht.offsetCell}>{offset.toString(16).padStart(8, "0")}</Text>
            <View style={ht.sep} />
            <View style={ht.bytesRow}>
              {Array.from({ length: BYTES_PER_ROW }).map((_, bi) => {
                const b = row[bi];
                const isNull = b === undefined || b === 0;
                const str = b !== undefined ? byteToMode(b, mode) : (mode === "ascii" ? " " : "  ");
                return (
                  <Text key={bi} style={[ht.dataByte, { width: colW, color: isNull ? "rgba(51,56,58,1)" : (mode === "ascii" ? C.green : C.blue) }]}>
                    {str}
                  </Text>
                );
              })}
            </View>
            {mode !== "ascii" && (
              <>
                <View style={ht.sep} />
                <Text style={ht.asciiRow}>{row.map((b) => byteToAscii(b)).join("")}</Text>
              </>
            )}
          </View>
        );
      })}

      {totalRows > VISIBLE_ROWS && (
        <View style={ht.truncNote}>
          <MaterialCommunityIcons name="information-outline" size={12} color={C.yellow} />
          <Text style={ht.truncTxt}>
            Showing first {VISIBLE_ROWS * BYTES_PER_ROW} bytes of {bytes.length} total
          </Text>
        </View>
      )}
    </View>
  );
}

const ht = StyleSheet.create({
  root: { gap: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "rgba(35,39,41,1)", borderBottomWidth: 1, borderBottomColor: C.border },
  dataRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3, paddingHorizontal: 10 },
  offsetCell: { color: "rgba(100,102,102,1)", fontSize: 10, width: 70 },
  sep: { width: 1, height: 14, backgroundColor: C.border, marginHorizontal: 8 },
  bytesRow: { flexDirection: "row" },
  headerByte: { color: C.muted, fontSize: 9, textAlign: "center" },
  dataByte: { fontSize: 10, textAlign: "center" },
  asciiHeader: { color: C.muted, fontSize: 9, flex: 1 },
  asciiRow: { color: C.green, fontSize: 10, flex: 1 },
  truncNote: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: C.border },
  truncTxt: { color: C.yellow, fontSize: 11 },
});

// ── Live data ticker (same as Dashboard) ─────────────────────
function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}
function DataTicker({ data, time }: { data: string; time: string }) {
  return (
    <View style={dtk.row}>
      <View style={dtk.dot} />
      <Text style={dtk.time}>{time}</Text>
      <Text style={dtk.data} numberOfLines={1}>{data || "—"}</Text>
    </View>
  );
}
const dtk = StyleSheet.create({
  row:  { flexDirection: "row", alignItems: "center", gap: 6 },
  dot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: C.green },
  time: { color: C.muted, fontSize: 9, width: 54 },
  data: { flex: 1, color: "rgba(140,220,170,1)", fontSize: 9, fontFamily: "monospace" },
});

function readFileWeb(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(new Uint8Array(e.target?.result as ArrayBuffer));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={si.row}>
      <Text style={si.label}>{label}</Text>
      <Text style={[si.value, { color }]}>{value}</Text>
    </View>
  );
}
const si = StyleSheet.create({
  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { color: C.muted, fontSize: 9, letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
});

// ── Flash step row ────────────────────────────────────────────
type StepState = "idle" | "active" | "done" | "error";
function FlashStep({ index, label, state }: { index: number; label: string; state: StepState }) {
  const col = state === "done" ? C.green : state === "active" ? C.yellow : state === "error" ? C.red : C.muted;
  const icon =
    state === "done"   ? "check-circle"       :
    state === "active" ? "loading"             :
    state === "error"  ? "close-circle"        :
                         "circle-outline";
  return (
    <View style={fs.row}>
      <View style={[fs.numBox, { borderColor: col + "55", backgroundColor: col + "18" }]}>
        <Text style={[fs.num, { color: col }]}>{index}</Text>
      </View>
      <MaterialCommunityIcons name={icon as any} size={13} color={col} />
      <Text style={[fs.lbl, { color: state === "idle" ? C.muted : col }]}>{label}</Text>
    </View>
  );
}
const fs = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  numBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  num: { fontSize: 9, fontWeight: "800" },
  lbl: { flex: 1, fontSize: 10, fontWeight: "600" },
});

const FLASH_STEPS = [
  "START → ESP32 init",
  "ESP32: PING (Wake BMS)",
  "ESP32: SYNC + ANNOUNCE",
  "ESP32: DEVICE INFO",
  "ESP32: UNLOCK → Ready",
  "DATA (512 batches × 64 frames)",
  "VERIFY CRC32",
  "COMPLETE (Activated)",
];

// ── Main ─────────────────────────────────────────────────────
export default function DecoderScreen() {
  const insets = useSafeAreaInsets();
  const { writeData, connectionStatus, quickConnect, packets } = useUsb();
  const isConnected = connectionStatus === "connected";
  const parsed = useParsedUsbData(packets);

  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [mode, setMode]         = useState<ViewMode>("hex");

  // Flash / OTA protocol state
  const [isSending, setIsSending]       = useState(false);
  const [sendStep, setSendStep]         = useState(-1);       // -1 = idle
  const [sendProgress, setSendProgress] = useState(0);        // 0–100
  const [sendLog, setSendLog]           = useState<string[]>([]);
  const [sendDone, setSendDone]         = useState<boolean | null>(null);
  const [currentBatch, setCurrentBatch] = useState(0);        // current batch index
  const [sessionRetry, setSessionRetry] = useState(0);        // session retry count
  const [logModalVisible, setLogModalVisible] = useState(false);
  const abortRef    = useRef(false);

  const leftPad   = Platform.OS === "web" ? 0 : insets.left;
  const rightPad  = Platform.OS === "web" ? 0 : insets.right;
  const bottomPad = Platform.OS === "web" ? 54 : insets.bottom + 60;

  // ── File loading ──────────────────────────────────────────
  function processFile(name: string, raw: Uint8Array) {
    const origSize = raw.length;
    const padded   = parseFirmware(name, raw);
    const checksum = crc32(padded);
    setFileInfo({
      name, origSize, size: padded.length,
      bytes: padded, crc32: checksum,
      isPadded: origSize < FLASH_SIZE,
    });
    setSendStep(-1);
    setSendProgress(0);
    setSendLog([]);
    setSendDone(null);
    setCurrentBatch(0);
    setSessionRetry(0);
  }

  const handlePickNative = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) { setLoading(false); return; }
      const asset = res.assets[0];
      const response = await fetch(asset.uri);
      const buffer   = await response.arrayBuffer();
      processFile(asset.name, new Uint8Array(buffer));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePickWeb = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bin,.h,.hex,.fw,.img,.rom,.elf,*/*";
    input.onchange = async (ev: Event) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setLoading(true);
      setError(null);
      try {
        const raw = await readFileWeb(file);
        processFile(file.name, raw);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to read file");
      } finally {
        setLoading(false);
      }
    };
    input.click();
  }, []);

  const handlePick = Platform.OS === "web" ? handlePickWeb : handlePickNative;

  // ── Byte stats ────────────────────────────────────────────
  const byteFreq = React.useMemo(() => {
    if (!fileInfo) return { zeros: 0, printable: 0, nonPrint: 0, unique: 0, ffCount: 0 };
    let zeros = 0, printable = 0, nonPrint = 0, ffCount = 0;
    const seen = new Set<number>();
    for (const b of fileInfo.bytes) {
      seen.add(b);
      if (b === 0) zeros++;
      else if (b === 0xFF) ffCount++;
      else if (b >= 32 && b < 127) printable++;
      else nonPrint++;
    }
    return { zeros, printable, nonPrint, unique: seen.size, ffCount };
  }, [fileInfo]);

  // ── ESP32 BMS Flash Bridge Protocol ─────────────────────
  // Android ──JSON/UART──► ESP32 ──TWAI/CAN──► BMS
  //
  // Android sends JSON only. ESP32 handles all CAN frames autonomously.
  // Frame data sent as [[d0,d1,d2,d3],...] — ESP32 builds [A1,seq,E2,04,d0..d3].
  const log = (msg: string) =>
    setSendLog((prev) => [...prev.slice(-49), msg]);

  const handleFlash = useCallback(async () => {
    if (!fileInfo) return;
    if (!isConnected) {
      await quickConnect();
      await new Promise((r) => setTimeout(r, 800));
    }

    abortRef.current = false;
    setIsSending(true);
    setSendDone(null);
    setSendProgress(0);
    setSendLog([]);
    setCurrentBatch(0);
    setSessionRetry(0);

    const fw       = fileInfo.bytes;
    const checksum = fileInfo.crc32;

    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Send a raw JSON command to ESP32 over UART (newline-terminated).
    // UsbContext.writeData() expects a hex-encoded byte string.
    // ESP32: Serial.readStringUntil('\n') → processJsonCommand()
    //
    // Chunked write: ESP32 hardware UART FIFO is 128 bytes. Sending >128 bytes
    // in one shot can overflow the FIFO before the CPU drains it, causing the
    // firmware's readStringUntil('\n') to receive a truncated string and fail
    // JSON parsing. We split into 64-byte chunks with a 2ms gap between each
    // to give the ESP32 time to drain the FIFO into its software buffer.
    // NOTE: the firmware also needs Serial.setRxBufferSize(4096) before
    //       Serial.begin() so the software buffer can hold a full 64-frame batch.
    const CHUNK_BYTES = 64; // bytes per write chunk (matches UART FIFO size)
    const CHUNK_GAP_MS = 2; // ms between chunks — enough for ESP32 to drain FIFO

    const sendCmd = async (obj: object) => {
      const json = JSON.stringify(obj);
      log(`→ ${json}`);
      const hex = strToHex(json + "\n"); // encode to hex; ESP32 needs \n terminator
      // Split into CHUNK_BYTES-sized hex chunks (each byte = 2 hex chars)
      const hexChunkSize = CHUNK_BYTES * 2;
      for (let i = 0; i < hex.length; i += hexChunkSize) {
        await writeData(hex.slice(i, i + hexChunkSize));
        if (i + hexChunkSize < hex.length) await delay(CHUNK_GAP_MS);
      }
    };

    // ── waitJson: wait for next JSON response from ESP32 ─────────────────────
    // ESP32 sends newline-terminated JSON: {"status":"ready"}\n
    //
    // Uses USBSerialService.onData() directly (same pattern as inventor.tsx)
    // instead of polling React state — avoids render-timing race conditions.
    //
    // Handles partial USB transfers: accumulates hex data into a buffer and
    // extracts complete JSON objects as they arrive.
    //
    // Ignores boot/aborted packets. Falls back to simulation when not connected.
    const IGNORED_STATUSES = new Set(["boot", "aborted"]);

    const waitJson = (timeoutMs: number): Promise<Record<string, unknown>> =>
      new Promise((resolve, reject) => {
        if (abortRef.current) { reject(new Error("Aborted")); return; }

        let rxBuffer = ""; // accumulates decoded text across partial USB transfers
        let settled  = false;
        let timer: ReturnType<typeof setTimeout>;

        const finish = (result: Record<string, unknown> | Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          unsub();
          if (result instanceof Error) reject(result);
          else resolve(result);
        };

        const unsub = USBSerialService.onData((hexData: string) => {
          if (settled) return;
          if (abortRef.current) { finish(new Error("Aborted")); return; }
          // Decode hex → text and append to buffer
          let chunk = "";
          for (let i = 0; i < hexData.length; i += 2)
            chunk += String.fromCharCode(parseInt(hexData.substring(i, i + 2), 16));
          rxBuffer += chunk;

          // Extract all complete JSON objects from the buffer
          let depth = 0, start = -1;
          for (let i = 0; i < rxBuffer.length; i++) {
            const ch = rxBuffer[i];
            if (ch === "{") { if (depth === 0) start = i; depth++; }
            else if (ch === "}") {
              depth--;
              if (depth === 0 && start !== -1) {
                try {
                  const obj = JSON.parse(rxBuffer.slice(start, i + 1)) as Record<string, unknown>;
                  // Trim consumed portion from buffer
                  rxBuffer = rxBuffer.slice(i + 1);
                  // Skip non-protocol messages
                  if (obj.status && IGNORED_STATUSES.has(obj.status as string)) { start = -1; continue; }
                  if (obj.status !== undefined || obj.state !== undefined) {
                    log(`   ← ${JSON.stringify(obj)}`);
                    finish(obj);
                    return;
                  }
                } catch { /* partial/malformed — keep buffering */ }
                start = -1;
              }
            }
          }
        });

        // Timeout handler
        timer = setTimeout(() => {
          if (settled) return;
          if (abortRef.current) { finish(new Error("Aborted")); return; }
          // Not connected — simulate correct response per phase for UI testing
          if (!isConnected) {
            if (timeoutMs === TIMEOUT_READY_MS)  { finish({ status: "ready",    msg: "unlocked" }); return; }
            if (timeoutMs === TIMEOUT_VERIFY_MS) { finish({ status: "complete" }); return; }
            finish({ status: "ok", batch: 0, next: 0, progress: 0 });
            return;
          }
          finish({ status: "error", msg: `Timeout ${timeoutMs}ms — no ESP32 response` });
        }, timeoutMs);
      });

    // ── Phase 1: Start — ESP32 runs init autonomously ────
    // Android sends {"cmd":"start","crc32":N,"total":32768}
    // ESP32 internally runs: ping → sync → announce → unlock
    // ESP32 responds {"status":"ready","msg":"unlocked"}
    const runStart = async (): Promise<boolean> => {
      for (let attempt = 0; attempt <= MAX_STEP_RETRIES; attempt++) {
        if (abortRef.current) throw new Error("Aborted");
        if (attempt > 0) {
          log(`   ↺ START retry ${attempt}/${MAX_STEP_RETRIES}`);
          await delay(500);
        }
        setSendStep(0);
        log(`>> [1/4] START — {"cmd":"start","crc32":${checksum},"total":${N_FRAMES}}`);
        await sendCmd({ cmd: "start", crc32: checksum >>> 0, total: N_FRAMES });

        log(`   ESP32 running: PING(0x069) → SYNC(0x00B) → ANNOUNCE(0xB1) → UNLOCK(0xA0)…`);
        setSendStep(1); await delay(20);
        setSendStep(2); await delay(50);
        setSendStep(3); await delay(80);
        setSendStep(4);

        const resp = await waitJson(TIMEOUT_READY_MS);
        if (resp.status === "ready") {
          log(`   ← {"status":"ready","msg":"unlocked"} ✓`);
          return true;
        }
        if (resp.status === "error") {
          log(`   ✗ ESP32 error: ${resp.msg ?? "unknown"} — retrying`);
          continue;
        }
        log(`   ✗ Expected ready, got: ${JSON.stringify(resp)}`);
      }
      return false;
    };

    // ── Phase 2: Stream batches as JSON ──────────────────
    // Matches ESP32 handleDataBatch():
    //   - receives {"cmd":"data","batch":N,"frames":[[d0,d1,d2,d3],...]}
    //   - startSeq = batchIndex * BATCH_SIZE (64)
    //   - builds CAN frame: [A1, seq_lo, seq_hi, 0x04, d0, d1, d2, d3]
    //   - responds {"status":"ok","batch":N,"next":M,"progress":P}
    //      or     {"status":"retry","batch":N,"from":F} on partial failure
    //      or     {"status":"error","msg":"..."} on hard error
    const sendBatch = async (
      batchIdx: number,
      fromFrame = 0,  // resume from this frame index within the batch (0 = full batch)
    ): Promise<{ ok: boolean; failedFrame: number }> => {
      const startSeq = batchIdx * FRAMES_PER_BATCH;
      let batchRetries = 0;
      // Tracks which frame within the batch to start from on each attempt.
      // On first attempt this is fromFrame (caller-supplied resume point).
      // On retry it becomes the frame index ESP32 reported as failing.
      let currentFrom = fromFrame;

      while (batchRetries <= MAX_BATCH_RETRIES) {
        if (abortRef.current) throw new Error("Aborted");

        if (batchRetries > 0) {
          log(`   ↺ Batch ${batchIdx} retry ${batchRetries}/${MAX_BATCH_RETRIES} from frame ${currentFrom}`);
          await delay(100);
        }

        // Build frames array: [[d0,d1,d2,d3], ...]
        // ESP32 builds CAN frame: [A1, seq_lo, seq_hi, 0x04, d0, d1, d2, d3]
        // where seq = batchIdx * 64 + frameIndex
        const frames: number[][] = [];
        for (let fi = currentFrom; fi < FRAMES_PER_BATCH; fi++) {
          const seq = startSeq + fi;
          const off = seq * DATA_PER_FRAME;
          frames.push([fw[off], fw[off + 1], fw[off + 2], fw[off + 3]]);
        }

        // Log CAN frame preview for first frame of this send
        const previewSeq = startSeq + currentFrom;
        const pf = frames[0];
        const seqLo = (previewSeq & 0xFF).toString(16).padStart(2, "0").toUpperCase();
        const seqHi = ((previewSeq >> 8) & 0xFF).toString(16).padStart(2, "0").toUpperCase();
        log(`→ batch=${batchIdx} frames=${frames.length} from=${currentFrom} | CAN: A1 ${seqLo} ${seqHi} 04 ${pf.map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}`);

        // Send: {"cmd":"data","batch":N,"frames":[[d0,d1,d2,d3],...]}
        // NOTE: no "from" field — ESP32 doesn't use it; startSeq is derived from batch index
        await sendCmd({ cmd: "data", batch: batchIdx, frames });

        // Wait for ESP32 batch response
        const resp = await waitJson(TIMEOUT_BATCH_MS);

        if (resp.status === "ok") {
          const next     = (resp.next     as number) ?? (batchIdx + 1) * FRAMES_PER_BATCH;
          const progress = (resp.progress as number) ?? 0;
          log(`   ← ok batch=${batchIdx} next=${next} progress=${progress.toFixed(1)}%`);
          return { ok: true, failedFrame: -1 };
        }

        if (resp.status === "retry") {
          // ESP32: sendRetry(batchIndex, failAt) — resend from failAt frame next iteration
          const failedFrom = typeof resp.from === "number" ? resp.from : 0;
          log(`   ← retry batch=${batchIdx} from=${failedFrom} — will resend ${FRAMES_PER_BATCH - failedFrom} frames`);
          currentFrom = failedFrom; // resume from the failed frame on next loop iteration
          batchRetries++;
          continue;
        }

        if (resp.status === "error") {
          log(`   ✗ ESP32 error on batch ${batchIdx}: ${resp.msg ?? "unknown"}`);
          currentFrom = 0; // full resend on error
          batchRetries++;
          continue;
        }

        log(`   ✗ Unexpected response: ${JSON.stringify(resp)}`);
        batchRetries++;
      }

      log(`   ✗ Batch ${batchIdx} failed after ${MAX_BATCH_RETRIES} retries`);
      return { ok: false, failedFrame: currentFrom };
    };

    // ── Main OTA loop ─────────────────────────────────────
    let sessionTries = 0;
    let resumeBatch  = 0;
    let resumeFrame  = 0;

    try {
      while (sessionTries <= MAX_SESSION_RETRIES) {
        if (abortRef.current) throw new Error("Aborted");
        if (sessionTries > 0) {
          log(`\n↺ Session retry ${sessionTries}/${MAX_SESSION_RETRIES} — resuming batch ${resumeBatch} frame ${resumeFrame}`);
          setSessionRetry(sessionTries);
          await delay(500);
        }

        // Phase 1 — Start (ESP32 runs init autonomously)
        const startOk = await runStart();
        if (!startOk) {
          sessionTries++;
          log(`   ✗ Start failed — session retry ${sessionTries}`);
          continue;
        }

        // Phase 2 — Stream all batches
        setSendStep(5);
        log(`>> [2/4] DATA — ${N_BATCHES} batches × ${FRAMES_PER_BATCH} frames = ${N_FRAMES.toLocaleString()} total`);

        let dataOk = true;
        for (let b = resumeBatch; b < N_BATCHES; b++) {
          if (abortRef.current) throw new Error("Aborted");
          setCurrentBatch(b);
          setSendProgress((b / N_BATCHES) * 88);

          const result = await sendBatch(b, b === resumeBatch ? resumeFrame : 0);
          if (!result.ok) {
            resumeBatch = b;
            resumeFrame = Math.max(0, result.failedFrame);
            log(`   ✗ Batch ${b} failed at frame ${resumeFrame} — resuming here on retry`);
            dataOk = false;
            break;
          }
          resumeFrame = 0;
        }

        if (!dataOk) { sessionTries++; continue; }

        log(`   ✓ All ${N_BATCHES} batches delivered`);
        setSendProgress(90);

        // Phase 3 — Verify
        // ESP32 handleVerify(): checks framesSent==totalFrames, sends VERIFY+GO to BMS
        // responds {"status":"complete"} on success, {"status":"error"} on failure
        setSendStep(6);
        log(`>> [3/4] VERIFY — CRC32=0x${checksum.toString(16).toUpperCase().padStart(8, "0")}`);
        log(`   ESP32 will send: [A2 00 E2 04 crc0..3] then [A3 00 E2 00 00 00 00 00]`);

        let verifyOk = false;
        for (let attempt = 0; attempt <= MAX_STEP_RETRIES; attempt++) {
          if (abortRef.current) throw new Error("Aborted");
          if (attempt > 0) {
            log(`   ↺ VERIFY retry ${attempt}/${MAX_STEP_RETRIES}`);
            await delay(500);
          }
          await sendCmd({ cmd: "verify" });
          const resp = await waitJson(TIMEOUT_VERIFY_MS);

          if (resp.status === "complete") {
            log(`   ← {"status":"complete"} ✓ — firmware activated`);
            verifyOk = true;
            break;
          }
          if (resp.status === "error") {
            log(`   ✗ Verify error: ${resp.msg ?? "unknown"}`);
            // ESP32 may reject if not all frames sent — restart from batch 0
            if (String(resp.msg).includes("Not all frames")) {
              log(`   ✗ Frame count mismatch — restarting from batch 0`);
              resumeBatch = 0; resumeFrame = 0;
              break;
            }
            continue;
          }
          log(`   ✗ Unexpected verify response: ${JSON.stringify(resp)}`);
        }

        if (!verifyOk) {
          log("   ✗ VERIFY failed — restarting from batch 0");
          resumeBatch = 0; resumeFrame = 0; sessionTries++;
          continue;
        }

        // Phase 4 — Done
        setSendStep(7);
        setSendProgress(100);
        setSendDone(true);
        log(`\n✓ OTA complete! Firmware flashed and activated.`);
        return;
      }

      throw new Error(`OTA failed after ${MAX_SESSION_RETRIES} session retries`);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ FATAL: ${msg}`);
      try { await sendCmd({ cmd: "abort" }); } catch { /* ignore */ }
      setSendDone(false);
    } finally {
      setIsSending(false);
    }
  }, [fileInfo, isConnected, quickConnect, writeData]);

  const stepStates = (i: number): StepState => {
    if (sendStep === -1 && !isSending) return "idle";
    if (i < sendStep) return "done";
    if (i === sendStep) return isSending ? "active" : (sendDone === false ? "error" : "done");
    return "idle";
  };

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <Header />
      {/* Shared USB connection bar */}
      <UsbConnectionBar compact />

      <View style={styles.body}>
        {/* ── LEFT SIDEBAR ── */}
        <View style={styles.sidebar}>
          {/* Header */}
          <View style={styles.sideHead}>
            <View style={[styles.sideIcon, { backgroundColor: "rgba(255,200,50,0.18)" }]}>
              <MaterialCommunityIcons name="file-document-outline" size={14} color={C.yellow} />
            </View>
            <View>
              <Text style={styles.sideTitle}>BIN Decoder</Text>
              <Text style={styles.sideSub}>Binary File Inspector</Text>
            </View>
          </View>

          {/* Pick file */}
          <Pressable
            style={[styles.pickBtn, { borderColor: fileInfo ? "rgba(110,220,161,0.4)" : "rgba(255,200,50,0.4)" }]}
            onPress={handlePick}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={C.yellow} />
              : <>
                <MaterialCommunityIcons name="upload" size={15} color={fileInfo ? C.green : C.yellow} />
                <Text style={[styles.pickBtnTxt, { color: fileInfo ? C.green : C.yellow }]}>
                  {fileInfo ? "Load New File" : "Open .bin / .h File"}
                </Text>
              </>}
          </Pressable>

          {/* File info */}
          {fileInfo && (
            <View style={styles.fileInfo}>
              <View style={styles.fileIconRow}>
                <View style={[styles.fileIcon, { backgroundColor: "rgba(255,200,50,0.12)" }]}>
                  <MaterialCommunityIcons name="file-outline" size={20} color={C.yellow} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={2}>{fileInfo.name}</Text>
                  <Text style={styles.fileSize}>{formatSize(fileInfo.origSize)} → {formatSize(fileInfo.size)}</Text>
                  {fileInfo.isPadded && (
                    <Text style={[styles.fileSize, { color: C.orange }]}>+ padded with 0xFF to 128 KB</Text>
                  )}
                </View>
              </View>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {/* Stats */}
            {fileInfo && (
              <>
                <Text style={styles.statsTitle}>BYTE ANALYSIS</Text>
                <StatItem label="ORIGINAL SIZE"  value={fileInfo.origSize.toLocaleString() + " B"}              color={C.blue} />
                <StatItem label="FLASH SIZE"      value={fileInfo.size.toLocaleString() + " B (128 KB)"}          color={C.blue} />
                <StatItem label="CRC32"           value={"0x" + fileInfo.crc32.toString(16).toUpperCase().padStart(8,"0")} color={C.green} />
                <StatItem label="FRAMES (4 B ea)" value={`${N_FRAMES.toLocaleString()} (${N_BATCHES} batches × ${FRAMES_PER_BATCH})`} color={C.yellow} />
                <StatItem label="UNIQUE BYTES"    value={byteFreq.unique.toString()}                              color={C.yellow} />
                <StatItem label="NULL (0x00)"     value={byteFreq.zeros.toLocaleString()}                         color={C.muted} />
                <StatItem label="FILL (0xFF)"     value={byteFreq.ffCount.toLocaleString()}                       color={C.muted} />
                <StatItem label="PRINTABLE ASCII" value={byteFreq.printable.toLocaleString()}                     color={C.green} />
                <StatItem label="ENTROPY"         value={`${Math.min(byteFreq.unique / 2.56, 100).toFixed(1)}%`}  color={C.yellow} />
              </>
            )}

            {/* ── BMS FLASH PROTOCOL ── */}
            {fileInfo && (
              <>
                <View style={{ height: 12 }} />
                <Text style={styles.statsTitle}>BMS FLASH PROTOCOL</Text>

                {FLASH_STEPS.map((label, i) => (
                  <FlashStep key={i} index={i + 1} label={label} state={stepStates(i)} />
                ))}

                {/* Progress bar */}
                {(isSending || sendDone !== null) && (
                  <View style={fl.progWrap}>
                    <View style={[fl.progBar, {
                      width: `${sendProgress.toFixed(0)}%` as any,
                      backgroundColor: sendDone === false ? C.red : C.green,
                    }]} />
                  </View>
                )}
                <Text style={fl.progTxt}>
                  {isSending
                    ? `${sendProgress.toFixed(1)}% — Step ${sendStep + 1}/8${sendStep === 5 ? ` · Batch ${currentBatch + 1}/${N_BATCHES}` : ""}${sessionRetry > 0 ? ` · Session retry ${sessionRetry}` : ""}`
                    : sendDone === true  ? "✓ OTA complete — firmware activated!"
                    : sendDone === false ? "✗ OTA failed — check log"
                    : `${N_BATCHES} batches · ${N_FRAMES.toLocaleString()} frames · 128 KB`}
                </Text>

                {/* Buttons */}
                <View style={fl.btns}>
                  <Pressable
                    style={[fl.btn, fl.btnFlash, isSending && { opacity: 0.6 }]}
                    onPress={handleFlash}
                    disabled={isSending}
                  >
                    <MaterialCommunityIcons name={isSending ? "loading" : "flash"} size={13} color={C.bg} />
                    <Text style={fl.btnFlashTxt}>{isSending ? "OTA IN PROGRESS…" : "START OTA"}</Text>
                  </Pressable>
                  {isSending && (
                    <Pressable style={[fl.btn, fl.btnAbort]} onPress={() => { abortRef.current = true; }}>
                      <MaterialCommunityIcons name="stop" size={13} color={C.red} />
                    </Pressable>
                  )}
                </View>

                {/* Mini log preview + View Log button */}
                {sendLog.length > 0 && (
                  <>
                    <View style={fl.logBox}>
                      {sendLog.slice(-4).map((l, i) => (
                        <Text key={i} style={fl.logLine}>{l}</Text>
                      ))}
                    </View>
                    <Pressable style={fl.viewLogBtn} onPress={() => setLogModalVisible(true)}>
                      <MaterialCommunityIcons name="text-box-outline" size={11} color={C.blue} />
                      <Text style={fl.viewLogTxt}>VIEW FULL OTA LOG ({sendLog.length} lines)</Text>
                    </Pressable>
                  </>
                )}

                {/* ── OTA Log Modal ── */}
                <Modal
                  visible={logModalVisible}
                  animationType="slide"
                  transparent
                  onRequestClose={() => setLogModalVisible(false)}
                >
                  <View style={fl.modalOverlay}>
                    <View style={fl.modalBox}>
                      {/* Modal header */}
                      <View style={fl.modalHead}>
                        <MaterialCommunityIcons name="text-box-multiple-outline" size={16} color={C.green} />
                        <Text style={fl.modalTitle}>OTA LOG</Text>
                        <Text style={fl.modalCount}>{sendLog.length} lines</Text>
                        <View style={{ flex: 1 }} />
                        {/* Status badge */}
                        <View style={[fl.modalBadge, {
                          backgroundColor: sendDone === true ? "rgba(110,220,161,0.15)" : sendDone === false ? "rgba(255,80,60,0.12)" : "rgba(255,200,50,0.12)",
                          borderColor:     sendDone === true ? "rgba(110,220,161,0.5)"  : sendDone === false ? "rgba(255,80,60,0.4)"  : "rgba(255,200,50,0.4)",
                        }]}>
                          <Text style={[fl.modalBadgeTxt, {
                            color: sendDone === true ? C.green : sendDone === false ? C.red : C.yellow,
                          }]}>
                            {isSending ? "● RUNNING" : sendDone === true ? "✓ COMPLETE" : sendDone === false ? "✗ FAILED" : "IDLE"}
                          </Text>
                        </View>
                        <Pressable style={fl.modalClose} onPress={() => setLogModalVisible(false)}>
                          <MaterialCommunityIcons name="close" size={18} color={C.muted} />
                        </Pressable>
                      </View>

                      {/* Progress bar */}
                      {(isSending || sendDone !== null) && (
                        <View style={fl.modalProgWrap}>
                          <View style={[fl.modalProgBar, {
                            width: `${sendProgress.toFixed(0)}%` as any,
                            backgroundColor: sendDone === false ? C.red : C.green,
                          }]} />
                        </View>
                      )}

                      {/* Scrollable log */}
                      <ScrollView
                        style={fl.modalScroll}
                        contentContainerStyle={fl.modalScrollContent}
                        showsVerticalScrollIndicator
                      >
                        {sendLog.length === 0 ? (
                          <Text style={fl.modalEmpty}>No log entries yet. Start OTA to see output.</Text>
                        ) : (
                          sendLog.map((line, i) => {
                            const isError = line.includes("✗") || line.includes("FATAL") || line.includes("failed");
                            const isOk    = line.includes("✓") || line.includes("OK") || line.includes("complete");
                            const isStep  = line.startsWith(">>");
                            const color   = isError ? C.red : isOk ? C.green : isStep ? C.yellow : "rgba(140,220,170,1)";
                            return (
                              <Text key={i} style={[fl.modalLogLine, { color }]}>
                                <Text style={fl.modalLineNum}>{String(i + 1).padStart(3, " ")}  </Text>
                                {line}
                              </Text>
                            );
                          })
                        )}
                      </ScrollView>

                      {/* Footer */}
                      <View style={fl.modalFoot}>
                        <Text style={fl.modalFootTxt}>
                          {isSending
                            ? `Step ${sendStep + 1}/8 · Batch ${currentBatch + 1}/${N_BATCHES} · ${sendProgress.toFixed(1)}%${sessionRetry > 0 ? ` · Retry ${sessionRetry}` : ""}`
                            : sendDone === true ? "Firmware flashed and activated successfully"
                            : sendDone === false ? "OTA failed — review log above"
                            : "Ready"}
                        </Text>
                        <Pressable style={fl.modalCloseBtn} onPress={() => setLogModalVisible(false)}>
                          <Text style={fl.modalCloseBtnTxt}>CLOSE</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Modal>
              </>
            )}
          </ScrollView>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-outline" size={12} color={C.red} />
              <Text style={styles.errorTxt}>{error}</Text>
            </View>
          )}
        </View>

        {/* ── MAIN: Hex viewer ── */}
        <View style={styles.main}>
          {/* Toolbar */}
          <View style={styles.toolbar}>
            <View style={styles.modeRow}>
              {(["hex", "binary", "decimal", "ascii"] as ViewMode[]).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.modeBtn, { backgroundColor: mode === m ? "rgba(255,200,50,0.15)" : "rgba(35,39,41,1)", borderColor: mode === m ? "rgba(255,200,50,0.5)" : C.border }]}
                  onPress={() => { Haptics.selectionAsync(); setMode(m); }}
                >
                  <Text style={[styles.modeTxt, { color: mode === m ? C.yellow : C.muted }]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              ))}

              {/* SEND button — starts full BMS flash protocol */}
              {fileInfo && (
                <Pressable
                  style={[styles.modeBtn, { backgroundColor: isSending ? "rgba(255,200,50,0.12)" : "rgba(110,220,161,0.12)", borderColor: isSending ? "rgba(255,200,50,0.45)" : "rgba(110,220,161,0.45)" }]}
                  onPress={handleFlash}
                  disabled={isSending}
                >
                  <MaterialCommunityIcons name={isSending ? "loading" : "upload-network-outline"} size={11} color={isSending ? C.yellow : C.green} />
                  <Text style={[styles.modeTxt, { color: isSending ? C.yellow : C.green }]}>{isSending ? "SENDING…" : "SEND"}</Text>
                </Pressable>
              )}
            </View>


          </View>

          {/* Content */}
          {fileInfo ? (
            <ScrollView
              style={[styles.hexArea, { backgroundColor: C.terminal }]}
              contentContainerStyle={[styles.hexContent, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator
            >
              <View style={styles.hexFileHeader}>
                <View style={styles.hexFileHeaderLeft}>
                  <MaterialCommunityIcons name="file-outline" size={12} color={C.yellow} />
                  <Text style={styles.hexFileHeaderName}>{fileInfo.name}</Text>
                </View>
                <Text style={styles.hexFileHeaderSize}>
                  {formatSize(fileInfo.size)} · {fileInfo.size} B · CRC32: 0x{fileInfo.crc32.toString(16).toUpperCase().padStart(8,"0")}
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator>
                <HexTable bytes={fileInfo.bytes} mode={mode} searchQuery="" jumpOffset={0} />
              </ScrollView>
            </ScrollView>
          ) : (
            <View style={styles.emptyHex}>
              <View style={styles.dropZone}>
                <View style={styles.dropZoneInner}>
                  <MaterialCommunityIcons name="cloud-upload-outline" size={36} color={C.muted} />
                  <Text style={styles.dropTitle}>No File Loaded</Text>
                  <Text style={styles.dropSub}>Open any binary file — .bin, .h, .hex, .fw, .img, .rom, .elf</Text>
                  <Pressable style={styles.dropBtn} onPress={handlePick} disabled={loading}>
                    {loading
                      ? <ActivityIndicator size="small" color={C.yellow} />
                      : <>
                        <MaterialCommunityIcons name="folder-open-outline" size={14} color={C.yellow} />
                        <Text style={styles.dropBtnTxt}>Open File</Text>
                      </>}
                  </Pressable>
                </View>
              </View>

              <View style={styles.featureGrid}>
                {[
                  { icon: "code-braces" as const,       label: "Hex View",     desc: "16-byte rows with offset column",  color: C.blue   },
                  { icon: "text-recognition" as const,   label: "ASCII Decode", desc: "View printable characters inline",  color: C.green  },
                  { icon: "chip" as const,               label: "Binary Mode",  desc: "Bit-level binary representation",   color: C.yellow },
                  { icon: "flash" as const,              label: "OTA Update",   desc: "8-step CAN bootloader with retry & resume", color: C.orange },
                ].map(({ icon, label, desc, color }) => (
                  <View key={label} style={[styles.featureCard, { borderColor: `${color}30` }]}>
                    <View style={[styles.featureIcon, { backgroundColor: `${color}15` }]}>
                      <MaterialCommunityIcons name={icon} size={16} color={color} />
                    </View>
                    <Text style={styles.featureLabel}>{label}</Text>
                    <Text style={styles.featureDesc}>{desc}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Live USB stream */}
          <View style={styles.streamBox}>
            <View style={styles.streamHead}>
              <MaterialCommunityIcons name="broadcast" size={12} color={C.green} />
              <Text style={styles.streamTitle}>LIVE USB STREAM</Text>
              <Text style={styles.streamCount}>{packets.length} pkts · {fmtBytes(parsed.totalBytes)}</Text>
            </View>
            {parsed.lastPacketData ? (
              <DataTicker data={parsed.lastPacketData} time={parsed.lastPacketTime} />
            ) : (
              <Text style={styles.streamEmpty}>
                {isConnected ? "Waiting for data…" : "Connect a USB device to see data"}
              </Text>
            )}
          </View>

          {/* Status strip */}
          <View style={[styles.statusStrip, { paddingBottom: Math.max(8, insets.bottom) }]}>
            <View style={[styles.statusDot, { backgroundColor: fileInfo ? (isSending ? C.yellow : C.green) : C.muted }]} />
            <Text style={styles.statusTxt}>
              {fileInfo
                ? `${fileInfo.name} · ${formatSize(fileInfo.size)} · Mode: ${mode.toUpperCase()} · CRC32: 0x${fileInfo.crc32.toString(16).toUpperCase().padStart(8,"0")}`
                : "No file loaded"}
            </Text>
            {fileInfo && (
              <Text style={styles.statusRight}>
                {Math.min(fileInfo.size, VISIBLE_ROWS * BYTES_PER_ROW)} / {fileInfo.size} B shown
              </Text>
            )}
          </View>
        </View>
      </View>
      <BottomNav />
    </View>
  );
}

const fl = StyleSheet.create({
  progWrap: { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: "hidden", marginTop: 6, marginBottom: 4 },
  progBar:  { height: "100%", borderRadius: 3 },
  progTxt:  { color: C.muted, fontSize: 9, fontWeight: "600", letterSpacing: 0.2, marginBottom: 6 },
  btns: { flexDirection: "row", gap: 6, marginTop: 4 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 8, borderWidth: 1, paddingVertical: 8 },
  btnFlash: { backgroundColor: C.orange, borderColor: C.orange },
  btnFlashTxt: { color: "rgba(21,25,27,1)", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  btnAbort: { flex: 0, width: 34, backgroundColor: "rgba(255,80,60,0.1)", borderColor: "rgba(255,80,60,0.4)" },
  logBox: { backgroundColor: "rgba(10,14,16,1)", borderRadius: 6, borderWidth: 1, borderColor: C.border, padding: 8, marginTop: 8, gap: 1, maxHeight: 80 },
  logLine: { color: "rgba(140,220,170,1)", fontSize: 8, fontFamily: "monospace", lineHeight: 13 },
  viewLogBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: "rgba(80,180,255,0.3)", backgroundColor: "rgba(80,180,255,0.08)" },
  viewLogTxt: { color: C.blue, fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },

  // ── OTA Log Modal ──
  modalOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalBox:        { backgroundColor: "rgba(14,18,20,1)", borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderColor: C.border, maxHeight: "85%", minHeight: "60%" },
  modalHead:       { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle:      { color: C.text, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  modalCount:      { color: C.muted, fontSize: 10 },
  modalBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  modalBadgeTxt:   { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  modalClose:      { padding: 4 },
  modalProgWrap:   { height: 3, backgroundColor: C.border, overflow: "hidden" },
  modalProgBar:    { height: "100%" },
  modalScroll:     { flex: 1 },
  modalScrollContent: { padding: 12, gap: 1 },
  modalEmpty:      { color: C.muted, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 40 },
  modalLogLine:    { fontSize: 10, fontFamily: "monospace", lineHeight: 16 },
  modalLineNum:    { color: "rgba(60,62,62,1)", fontSize: 9 },
  modalFoot:       { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  modalFootTxt:    { flex: 1, color: C.muted, fontSize: 9 },
  modalCloseBtn:   { backgroundColor: C.orange, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  modalCloseBtnTxt:{ color: "rgba(21,25,27,1)", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, flexDirection: "row" },

  sidebar: { width: 220, backgroundColor: "rgba(18,22,24,1)", borderRightWidth: 1, borderRightColor: C.border, padding: 12, gap: 10 },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sideIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sideTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
  sideSub: { color: C.muted, fontSize: 10 },

  pickBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 8, padding: 10, justifyContent: "center" },
  pickBtnTxt: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },

  fileInfo: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 10 },
  fileIconRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  fileIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fileName: { color: C.text, fontSize: 12, fontWeight: "600", lineHeight: 16 },
  fileSize: { color: C.muted, fontSize: 10, marginTop: 2 },

  statsTitle: { color: C.muted, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,80,60,0.1)", borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,80,60,0.3)", padding: 8 },
  errorTxt: { color: C.red, fontSize: 11, flex: 1 },

  main: { flex: 1, flexDirection: "column" },

  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  modeRow: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  modeBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  modeTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },

  hexArea: { flex: 1 },
  hexContent: { padding: 10, gap: 8 },
  hexFileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(35,39,41,1)", borderRadius: 6, padding: 8, marginBottom: 4 },
  hexFileHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  hexFileHeaderName: { color: C.text, fontSize: 12, fontWeight: "600" },
  hexFileHeaderSize: { color: C.muted, fontSize: 9 },

  emptyHex: { flex: 1, padding: 20, gap: 20, alignItems: "center", justifyContent: "center" },
  dropZone: { width: "100%", maxWidth: 440, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(51,56,58,1)", overflow: "hidden" },
  dropZoneInner: { padding: 32, alignItems: "center", gap: 12 },
  dropTitle: { color: C.text, fontSize: 18, fontWeight: "600" },
  dropSub: { color: C.muted, fontSize: 11, textAlign: "center" },
  dropBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,200,50,0.12)", borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,200,50,0.4)" },
  dropBtnTxt: { color: C.yellow, fontSize: 13, fontWeight: "700" },

  featureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 440, width: "100%" },
  featureCard: { width: "45%", backgroundColor: C.card, borderRadius: 10, borderWidth: 1, padding: 14, gap: 6, minWidth: 140 },
  featureIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  featureLabel: { color: C.text, fontSize: 12, fontWeight: "700" },
  featureDesc: { color: C.muted, fontSize: 10 },

  streamBox:   { flexDirection: "column", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: "rgba(14,18,20,1)" },
  streamHead:  { flexDirection: "row", alignItems: "center", gap: 6 },
  streamTitle: { color: C.green, fontSize: 9, fontWeight: "700", letterSpacing: 0.8, flex: 1 },
  streamCount: { color: C.muted, fontSize: 9 },
  streamEmpty: { color: C.muted, fontSize: 9, fontStyle: "italic" },

  statusStrip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: "rgba(22,26,28,1)" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { flex: 1, color: C.muted, fontSize: 9 },
  statusRight: { color: "rgba(60,62,62,1)", fontSize: 9 },
});
