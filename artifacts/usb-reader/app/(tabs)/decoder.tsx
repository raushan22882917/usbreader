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
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { GlobalStatusBar } from "@/components/StatusBar";

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
  terminal: "#020810",
};

type ViewMode = "hex" | "binary" | "decimal" | "ascii";

interface FileInfo {
  name: string;
  size: number;
  bytes: Uint8Array;
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

const BYTES_PER_ROW = 16;
const VISIBLE_ROWS = 200; // virtualize to avoid huge render

function HexTable({
  bytes,
  mode,
  searchQuery,
  jumpOffset,
}: {
  bytes: Uint8Array;
  mode: ViewMode;
  searchQuery: string;
  jumpOffset: number;
}) {
  // Build rows
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
      {/* Column header */}
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

      {/* Data rows */}
      {rows.map((row, ri) => {
        const offset = ri * BYTES_PER_ROW;
        return (
          <View key={ri} style={[ht.dataRow, ri % 2 === 0 ? null : { backgroundColor: "rgba(255,255,255,0.015)" }]}>
            <Text style={ht.offsetCell}>
              {offset.toString(16).padStart(8, "0")}
            </Text>
            <View style={ht.sep} />
            <View style={ht.bytesRow}>
              {Array.from({ length: BYTES_PER_ROW }).map((_, bi) => {
                const b = row[bi];
                const isNull = b === undefined || b === 0;
                const str = b !== undefined ? byteToMode(b, mode) : (mode === "ascii" ? " " : "  ");
                return (
                  <Text
                    key={bi}
                    style={[
                      ht.dataByte,
                      { width: colW, color: isNull ? "rgba(51,56,58,1)" : (mode === "ascii" ? C.green : C.blue) },
                    ]}
                  >
                    {str}
                  </Text>
                );
              })}
            </View>
            {mode !== "ascii" && (
              <>
                <View style={ht.sep} />
                <Text style={ht.asciiRow}>
                  {row.map((b) => byteToAscii(b)).join("")}
                </Text>
              </>
            )}
          </View>
        );
      })}

      {totalRows > VISIBLE_ROWS && (
        <View style={ht.truncNote}>
          <Feather name="info" size={12} color={C.yellow} />
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(35,39,41,1)",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  offsetCell: {
    color: "rgba(100,102,102,1)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    width: 70,
  },
  sep: {
    width: 1,
    height: 14,
    backgroundColor: C.border,
    marginHorizontal: 8,
  },
  bytesRow: { flexDirection: "row" },
  headerByte: {
    color: C.muted,
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  dataByte: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  asciiHeader: { color: C.muted, fontSize: 9, fontFamily: "Inter_700Bold", flex: 1 },
  asciiRow: { color: C.green, fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 },
  truncNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  truncTxt: { color: C.yellow, fontSize: 11, fontFamily: "Inter_400Regular" },
});

// ── Web file reader ───────────────────────────────────────────
function readFileWeb(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      resolve(new Uint8Array(buf));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

// ── Stats sidebar item ────────────────────────────────────────
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
  label: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 2 },
  value: { fontSize: 13, fontFamily: "Inter_700Bold" },
});

// ── Main ─────────────────────────────────────────────────────
export default function DecoderScreen() {
  const insets = useSafeAreaInsets();
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("hex");
  const [search, setSearch] = useState("");
  const [jumpTo, setJumpTo] = useState("");
  const [jumpOffset, setJumpOffset] = useState(0);
  const webInputRef = useRef<HTMLInputElement | null>(null);

  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const bottomPad = Platform.OS === "web" ? 54 : insets.bottom + 60;

  const handlePickNative = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) { setLoading(false); return; }
      const asset = res.assets[0];
      // Use fetch to read the file as array buffer (works with file:// URIs on native)
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setFileInfo({ name: asset.name, size: bytes.length, bytes });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePickWeb = useCallback(() => {
    if (!webInputRef.current) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "*/*";
      input.onchange = async (ev: Event) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
          const bytes = await readFileWeb(file);
          setFileInfo({ name: file.name, size: bytes.length, bytes });
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Failed to read file");
        } finally {
          setLoading(false);
        }
      };
      input.click();
    }
  }, []);

  const handlePick = Platform.OS === "web" ? handlePickWeb : handlePickNative;

  // Byte frequency analysis
  const byteFreq = React.useMemo(() => {
    if (!fileInfo) return { zeros: 0, printable: 0, nonPrint: 0, unique: 0 };
    let zeros = 0, printable = 0, nonPrint = 0;
    const seen = new Set<number>();
    for (const b of fileInfo.bytes) {
      seen.add(b);
      if (b === 0) zeros++;
      else if (b >= 32 && b < 127) printable++;
      else nonPrint++;
    }
    return { zeros, printable, nonPrint, unique: seen.size };
  }, [fileInfo]);

  const handleJump = () => {
    const offset = parseInt(jumpTo, 16);
    if (!isNaN(offset)) setJumpOffset(offset);
  };

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <GlobalStatusBar />

      <View style={styles.body}>
        {/* ── LEFT SIDEBAR ── */}
        <View style={styles.sidebar}>
          {/* Header */}
          <View style={styles.sideHead}>
            <View style={[styles.sideIcon, { backgroundColor: "rgba(255,200,50,0.18)" }]}>
              <Feather name="file-text" size={14} color={C.yellow} />
            </View>
            <View>
              <Text style={styles.sideTitle}>BIN Decoder</Text>
              <Text style={styles.sideSub}>Binary File Inspector</Text>
            </View>
          </View>

          {/* Pick file */}
          <Pressable
            style={[
              styles.pickBtn,
              { borderColor: fileInfo ? "rgba(110,220,161,0.4)" : "rgba(255,200,50,0.4)" },
            ]}
            onPress={handlePick}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={C.yellow} />
              : <>
                <Feather name="upload" size={15} color={fileInfo ? C.green : C.yellow} />
                <Text style={[styles.pickBtnTxt, { color: fileInfo ? C.green : C.yellow }]}>
                  {fileInfo ? "Load New File" : "Open .bin File"}
                </Text>
              </>}
          </Pressable>

          {/* File info */}
          {fileInfo && (
            <View style={styles.fileInfo}>
              <View style={styles.fileIconRow}>
                <View style={[styles.fileIcon, { backgroundColor: "rgba(255,200,50,0.12)" }]}>
                  <Feather name="file" size={20} color={C.yellow} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={2}>{fileInfo.name}</Text>
                  <Text style={styles.fileSize}>{formatSize(fileInfo.size)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Stats */}
          {fileInfo && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <Text style={styles.statsTitle}>BYTE ANALYSIS</Text>
              <StatItem label="TOTAL BYTES" value={fileInfo.size.toLocaleString()} color={C.blue} />
              <StatItem label="UNIQUE VALUES" value={byteFreq.unique.toString()} color={C.yellow} />
              <StatItem label="NULL BYTES" value={byteFreq.zeros.toLocaleString()} color={C.muted} />
              <StatItem label="PRINTABLE ASCII" value={byteFreq.printable.toLocaleString()} color={C.green} />
              <StatItem label="NON-PRINTABLE" value={byteFreq.nonPrint.toLocaleString()} color={C.red} />
              <StatItem
                label="ENTROPY"
                value={`${Math.min(byteFreq.unique / 2.56, 100).toFixed(1)}%`}
                color={C.yellow}
              />
            </ScrollView>
          )}

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Feather name="alert-triangle" size={12} color={C.red} />
              <Text style={styles.errorTxt}>{error}</Text>
            </View>
          )}
        </View>

        {/* ── MAIN: Hex viewer ── */}
        <View style={styles.main}>
          {/* Toolbar */}
          <View style={styles.toolbar}>
            {/* Mode buttons */}
            <View style={styles.modeRow}>
              {(["hex", "binary", "decimal", "ascii"] as ViewMode[]).map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.modeBtn,
                    { backgroundColor: mode === m ? "rgba(255,200,50,0.15)" : "rgba(35,39,41,1)", borderColor: mode === m ? "rgba(255,200,50,0.5)" : C.border },
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setMode(m); }}
                >
                  <Text style={[styles.modeTxt, { color: mode === m ? C.yellow : C.muted }]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Jump to offset */}
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
                <Feather name="arrow-right" size={12} color={C.blue} />
              </Pressable>
            </View>
          </View>

          {/* Content */}
          {fileInfo ? (
            <ScrollView
              style={[styles.hexArea, { backgroundColor: C.terminal }]}
              contentContainerStyle={[styles.hexContent, { paddingBottom: bottomPad }]}
              horizontal={false}
              showsVerticalScrollIndicator
            >
              {/* File header */}
              <View style={styles.hexFileHeader}>
                <View style={styles.hexFileHeaderLeft}>
                  <Feather name="file" size={12} color={C.yellow} />
                  <Text style={styles.hexFileHeaderName}>{fileInfo.name}</Text>
                </View>
                <Text style={styles.hexFileHeaderSize}>{formatSize(fileInfo.size)} · {fileInfo.size} bytes</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator>
                <HexTable
                  bytes={fileInfo.bytes}
                  mode={mode}
                  searchQuery={search}
                  jumpOffset={jumpOffset}
                />
              </ScrollView>
            </ScrollView>
          ) : (
            <View style={styles.emptyHex}>
              {/* Drop zone visual */}
              <View style={styles.dropZone}>
                <View style={styles.dropZoneInner}>
                  <Feather name="upload-cloud" size={36} color={C.muted} />
                  <Text style={styles.dropTitle}>No File Loaded</Text>
                  <Text style={styles.dropSub}>Open any binary file — .bin, .hex, .fw, .img, .rom, .elf, .bin</Text>
                  <Pressable
                    style={styles.dropBtn}
                    onPress={handlePick}
                    disabled={loading}
                  >
                    {loading
                      ? <ActivityIndicator size="small" color={C.yellow} />
                      : <>
                        <Feather name="folder" size={14} color={C.yellow} />
                        <Text style={styles.dropBtnTxt}>Open File</Text>
                      </>}
                  </Pressable>
                </View>
              </View>

              {/* Feature list */}
              <View style={styles.featureGrid}>
                {[
                  { icon: "code" as const, label: "Hex View", desc: "16-byte rows with offset column", color: C.blue },
                  { icon: "align-left" as const, label: "ASCII Decode", desc: "View printable characters inline", color: C.green },
                  { icon: "cpu" as const, label: "Binary Mode", desc: "Bit-level binary representation", color: C.yellow },
                  { icon: "bar-chart-2" as const, label: "Byte Stats", desc: "Entropy & frequency analysis", color: C.red },
                ].map(({ icon, label, desc, color }) => (
                  <View key={label} style={[styles.featureCard, { borderColor: `${color}30` }]}>
                    <View style={[styles.featureIcon, { backgroundColor: `${color}15` }]}>
                      <Feather name={icon} size={16} color={color} />
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
            <View style={[styles.statusDot, { backgroundColor: fileInfo ? C.green : C.muted }]} />
            <Text style={styles.statusTxt}>
              {fileInfo ? `${fileInfo.name} · ${formatSize(fileInfo.size)} · Mode: ${mode.toUpperCase()}` : "No file loaded"}
            </Text>
            {fileInfo && (
              <Text style={styles.statusRight}>
                {Math.min(fileInfo.size, VISIBLE_ROWS * BYTES_PER_ROW)} / {fileInfo.size} bytes displayed
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, flexDirection: "row" },

  // Sidebar
  sidebar: { width: 220, backgroundColor: "rgba(18,22,24,1)", borderRightWidth: 1, borderRightColor: C.border, padding: 12, gap: 10 },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sideIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sideTitle: { color: C.text, fontSize: 14, fontFamily: "Inter_700Bold" },
  sideSub: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },

  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 10,
    justifyContent: "center",
  },
  pickBtnTxt: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  fileInfo: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 10 },
  fileIconRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  fileIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fileName: { color: C.text, fontSize: 12, fontFamily: "Inter_600SemiBold", lineHeight: 16 },
  fileSize: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },

  statsTitle: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 4 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,80,60,0.1)", borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,80,60,0.3)", padding: 8 },
  errorTxt: { color: C.red, fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },

  // Main
  main: { flex: 1, flexDirection: "column" },

  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  modeRow: { flexDirection: "row", gap: 5 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  modeTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  jumpRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  jumpLabel: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  jumpInput: { backgroundColor: C.row, borderRadius: 5, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 3, color: C.blue, fontSize: 11, fontFamily: "Inter_400Regular", width: 60 },
  jumpBtn: { backgroundColor: "rgba(80,180,255,0.15)", borderRadius: 5, padding: 5, borderWidth: 1, borderColor: "rgba(80,180,255,0.3)" },

  hexArea: { flex: 1 },
  hexContent: { padding: 10, gap: 8 },
  hexFileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(35,39,41,1)", borderRadius: 6, padding: 8, marginBottom: 4 },
  hexFileHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  hexFileHeaderName: { color: C.text, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  hexFileHeaderSize: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },

  // Empty state
  emptyHex: { flex: 1, padding: 20, gap: 20, alignItems: "center", justifyContent: "center" },
  dropZone: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(51,56,58,1)",
    overflow: "hidden",
  },
  dropZoneInner: { padding: 32, alignItems: "center", gap: 12 },
  dropTitle: { color: C.text, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  dropSub: { color: C.muted, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 300 },
  dropBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,200,50,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,200,50,0.5)",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 4,
  },
  dropBtnTxt: { color: C.yellow, fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  featureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 440 },
  featureCard: { width: 160, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, padding: 12, gap: 6 },
  featureIcon: { width: 32, height: 32, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  featureLabel: { color: C.text, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  featureDesc: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 14 },

  // Status strip
  statusStrip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card, gap: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { color: C.muted, fontSize: 10, fontFamily: "Inter_500Medium", flex: 1, letterSpacing: 0.3 },
  statusRight: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
});
