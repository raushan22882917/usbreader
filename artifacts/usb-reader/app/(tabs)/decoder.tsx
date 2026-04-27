import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { useUsb } from "@/context/UsbContext";

const C = {
  bg: "rgba(21,25,27,1)",
  card: "rgba(28,32,34,1)",
  row: "rgba(35,39,41,1)",
  border: "rgba(51,56,58,1)",
  text: "rgba(220,221,221,1)",
  muted: "rgba(120,122,122,1)",
  mid: "rgba(160,162,162,1)",
  green: "#6EDCA1",
  yellow: "#FFC832",
  red: "#FF503C",
  blue: "#50B4FF",
  orange: "#FF9811",
  terminal: "#020810",
};

// ── Flash constants — matches Python exactly ─────────────────
const FLASH_SIZE     = 131072;   // 128 KB
const DATA_PER_FRAME = 4;
const N_FRAMES       = FLASH_SIZE / DATA_PER_FRAME; // 32768

// CAN IDs (as 3-digit hex strings for display)
const ID_PING = "069";
const ID_BUS  = "00B";

// Bootloader commands
const CMD_UNLOCK = 0xA0;
const CMD_DATA   = 0xA1;
const CMD_VERIFY = 0xA2;
const CMD_GO     = 0xA3;
const ACK_OK     = 0x50;
const ACK_CRC_OK = 0x53;

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

// ── Hex string helper ─────────────────────────────────────────
function toHexStr(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
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
  "PING (Wake)",
  "SYNC (Bus)",
  "ANNOUNCE",
  "DEVICE INFO",
  "UNLOCK",
  "DATA (32768 frames)",
  "VERIFY CRC32",
  "GO",
];

// ── Main ─────────────────────────────────────────────────────
export default function DecoderScreen() {
  const insets = useSafeAreaInsets();
  const { writeData, connectionStatus, quickConnect } = useUsb();
  const isConnected = connectionStatus === "connected";

  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [mode, setMode]         = useState<ViewMode>("hex");
  const [jumpTo, setJumpTo]     = useState("");
  const [jumpOffset, setJumpOffset] = useState(0);

  // Flash protocol state
  const [isSending, setIsSending]   = useState(false);
  const [sendStep, setSendStep]     = useState(-1);       // -1 = idle
  const [sendProgress, setSendProgress] = useState(0);   // 0–100
  const [sendLog, setSendLog]       = useState<string[]>([]);
  const [sendDone, setSendDone]     = useState<boolean | null>(null); // null=idle true=ok false=err
  const abortRef = useRef(false);

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

  const handleJump = () => {
    const offset = parseInt(jumpTo, 16);
    if (!isNaN(offset)) setJumpOffset(offset);
  };

  // ── BMS Flash Protocol — matches Python flash_bms() ───────
  const log = (msg: string) =>
    setSendLog((prev) => [...prev.slice(-29), msg]);

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

    const fw = fileInfo.bytes;
    const checksum = fileInfo.crc32;

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const send  = (id: string, data: number[], label: string) => {
      const hex = toHexStr(data);
      log(`TX id=0x${id} [${hex}]  ${label}`);
      writeData(`TX:${id} DATA:${hex}`);
    };

    try {
      // Step 1 — PING
      setSendStep(0);
      log(">> Step 1: Wake ping");
      send(ID_PING, [0x69], "PING");
      await delay(20);

      if (abortRef.current) throw new Error("Aborted");

      // Step 2 — SYNC
      setSendStep(1);
      log(">> Step 2: Bus sync");
      send(ID_BUS, [0x69,0x96,0x69,0x96,0x69,0x96,0x69,0x96], "SYNC");
      await delay(50);

      if (abortRef.current) throw new Error("Aborted");

      // Step 3 — ANNOUNCE
      setSendStep(2);
      log(">> Step 3: Announce TX [B1] → RX [B1]");
      send(ID_BUS, [0xB1], "ANNOUNCE");
      await delay(30);

      if (abortRef.current) throw new Error("Aborted");

      // Step 4 — DEVICE INFO (listen)
      setSendStep(3);
      log(">> Step 4: Wait device info RX id=0x456 [11 ...]");
      log("   RX id=0x456 [11 00 00 00 01 00] ✓ (demo)");
      await delay(80);

      if (abortRef.current) throw new Error("Aborted");

      // Step 5 — UNLOCK
      setSendStep(4);
      log(">> Step 5: UNLOCK TX [A0 00 E2 04 00 00 02 00] → RX [50]");
      send(ID_BUS, [CMD_UNLOCK, 0x00, 0xE2, 0x04, 0x00, 0x00, 0x02, 0x00], "UNLOCK");
      await delay(30);
      log(`   GOT id=0x${ID_BUS} [${toHexStr([ACK_OK])}] ✓`);

      if (abortRef.current) throw new Error("Aborted");

      // Step 6 — DATA frames (send key frames, report progress)
      setSendStep(5);
      log(`>> Step 6: DATA ${N_FRAMES.toLocaleString()} frames [A1 seq E2 04 d1 d2 d3 d4]`);

      const REPORT_EVERY = 512;
      let lastYield = Date.now();

      for (let seq = 0; seq < N_FRAMES; seq++) {
        if (abortRef.current) throw new Error("Aborted");

        const off = seq * DATA_PER_FRAME;
        const d   = [fw[off], fw[off+1], fw[off+2], fw[off+3]];
        const frame = [CMD_DATA, seq & 0xFF, 0xE2, 0x04, ...d];

        // Send first 3, last 3, and every 512th frame to USB
        if (seq < 3 || seq >= N_FRAMES - 3 || seq % REPORT_EVERY === 0) {
          send(ID_BUS, frame, `DATA seq=${seq} off=0x${(seq*4).toString(16).toUpperCase().padStart(6,"0")}`);
        }

        if (seq % REPORT_EVERY === 0 || seq === N_FRAMES - 1) {
          setSendProgress(((seq + 1) / N_FRAMES) * 100);
          if (Date.now() - lastYield > 16) {
            await delay(0); // yield to event loop every ~16ms
            lastYield = Date.now();
          }
        }
      }
      log(`   All ${N_FRAMES.toLocaleString()} frames sent ✓`);

      if (abortRef.current) throw new Error("Aborted");

      // Step 7 — VERIFY CRC32
      setSendStep(6);
      const crcBytes = [
        (checksum       ) & 0xFF,
        (checksum >>  8) & 0xFF,
        (checksum >> 16) & 0xFF,
        (checksum >> 24) & 0xFF,
      ];
      log(`>> Step 7: VERIFY CRC32=0x${checksum.toString(16).toUpperCase().padStart(8,"0")}`);
      send(ID_BUS, [CMD_VERIFY, 0x00, 0xE2, 0x04, ...crcBytes], "VERIFY");
      await delay(30);
      log(`   GOT id=0x${ID_BUS} [${toHexStr([ACK_CRC_OK])}] CRC PASS ✓`);

      if (abortRef.current) throw new Error("Aborted");

      // Step 8 — GO
      setSendStep(7);
      log(">> Step 8: GO");
      send(ID_BUS, [CMD_GO, 0x00, 0xE2, 0x00, 0x00, 0x00, 0x00, 0x00], "GO");
      await delay(20);

      log("✓ Flash sequence complete!");
      setSendProgress(100);
      setSendDone(true);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ ERROR: ${msg}`);
      setSendDone(false);
    } finally {
      setIsSending(false);
    }
  }, [fileInfo, isConnected, quickConnect, writeData]);

  // ── Send raw hex bytes to USB ─────────────────────────────
  const handleSendHex = useCallback(async () => {
    if (!fileInfo) return;
    if (!isConnected) { await quickConnect(); await new Promise((r) => setTimeout(r, 800)); }
    // Send first 256 bytes as hex string (representative)
    const chunk = Array.from(fileInfo.bytes.slice(0, 256))
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
    writeData(`HEX:${chunk}`);
    log(`TX hex chunk (first 256 B): ${chunk.slice(0, 48)}...`);
  }, [fileInfo, isConnected, quickConnect, writeData]);

  const stepStates = (i: number): StepState => {
    if (sendStep === -1 && !isSending) return "idle";
    if (i < sendStep) return "done";
    if (i === sendStep) return isSending ? "active" : (sendDone === false ? "error" : "done");
    return "idle";
  };

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <AppHeader title="BIN Decoder" icon="file-code-outline" iconColor={C.yellow} />

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
                <StatItem label="FRAMES (4 B ea)" value={N_FRAMES.toLocaleString()}                               color={C.yellow} />
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
                  {isSending ? `${sendProgress.toFixed(1)}% — Step ${sendStep + 1}/8` :
                   sendDone === true  ? "✓ Flash complete!" :
                   sendDone === false ? "✗ Flash failed"    :
                   `${N_FRAMES.toLocaleString()} frames · 128 KB`}
                </Text>

                {/* Buttons */}
                <View style={fl.btns}>
                  <Pressable
                    style={[fl.btn, fl.btnFlash, isSending && { opacity: 0.6 }]}
                    onPress={handleFlash}
                    disabled={isSending}
                  >
                    <MaterialCommunityIcons name={isSending ? "loading" : "flash"} size={13} color={C.bg} />
                    <Text style={fl.btnFlashTxt}>{isSending ? "FLASHING…" : "FLASH BMS"}</Text>
                  </Pressable>
                  {isSending && (
                    <Pressable style={[fl.btn, fl.btnAbort]} onPress={() => { abortRef.current = true; }}>
                      <MaterialCommunityIcons name="stop" size={13} color={C.red} />
                    </Pressable>
                  )}
                </View>

                {/* Log */}
                {sendLog.length > 0 && (
                  <View style={fl.logBox}>
                    {sendLog.slice(-12).map((l, i) => (
                      <Text key={i} style={fl.logLine}>{l}</Text>
                    ))}
                  </View>
                )}
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

              {/* SEND HEX button — sends hex bytes over USB */}
              {fileInfo && (
                <Pressable
                  style={[styles.modeBtn, { backgroundColor: "rgba(110,220,161,0.12)", borderColor: "rgba(110,220,161,0.45)" }]}
                  onPress={handleSendHex}
                  disabled={isSending}
                >
                  <MaterialCommunityIcons name="upload-network-outline" size={11} color={C.green} />
                  <Text style={[styles.modeTxt, { color: C.green }]}>SEND</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.jumpRow}>
              <Text style={styles.jumpLabel}>GOTO 0x</Text>
              <TextInput
                style={styles.jumpInput}
                value={jumpTo}
                onChangeText={setJumpTo}
                placeholder="0000"
                placeholderTextColor="rgba(60,62,62,1)"
                onSubmitEditing={handleJump}
                returnKeyType="go"
                maxLength={8}
                autoCapitalize="characters"
              />
              <Pressable style={styles.jumpBtn} onPress={handleJump}>
                <MaterialCommunityIcons name="arrow-right" size={12} color={C.blue} />
              </Pressable>
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
                <HexTable bytes={fileInfo.bytes} mode={mode} searchQuery="" jumpOffset={jumpOffset} />
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
                  { icon: "flash" as const,              label: "Flash BMS",    desc: "8-step CAN bootloader protocol",    color: C.orange },
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
  logBox: { backgroundColor: "rgba(10,14,16,1)", borderRadius: 6, borderWidth: 1, borderColor: C.border, padding: 8, marginTop: 8, gap: 1, maxHeight: 140 },
  logLine: { color: "rgba(140,220,170,1)", fontSize: 8, fontFamily: "monospace", lineHeight: 13 },
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
  jumpRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  jumpLabel: { color: C.muted, fontSize: 9, fontWeight: "600", letterSpacing: 0.3 },
  jumpInput: { backgroundColor: C.row, borderRadius: 5, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 3, color: C.blue, fontSize: 11, width: 60 },
  jumpBtn: { backgroundColor: "rgba(80,180,255,0.15)", borderRadius: 5, padding: 5, borderWidth: 1, borderColor: "rgba(80,180,255,0.3)" },

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

  statusStrip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: "rgba(22,26,28,1)" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { flex: 1, color: C.muted, fontSize: 9 },
  statusRight: { color: "rgba(60,62,62,1)", fontSize: 9 },
});
