/**
 * USB Test Screen
 *
 * Full real-device test flow:
 *   1. Scan  — lists all connected USB devices via UsbManager
 *   2. Select — tap a device chip to target it
 *   3. Connect — requests permission then opens bulk-transfer connection
 *   4. Read  — live hex stream from the device shown in a scrolling log
 *   5. Write — send raw hex or ASCII text to the device
 *   6. Disconnect
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useUsb, UsbDevice, DataPacket } from "../../context/UsbContext";
import { BottomNav } from "../../components/BottomNav";
import { Colors, Typography, Spacing, Border } from "../../theme";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg:     Colors.background,
  panel:  Colors.surfaceContainerLow,
  border: Colors.outlineVariant,
  text:   Colors.onSurface,
  muted:  Colors.onSurfaceVariant,
  green:  Colors.tertiary,
  red:    Colors.error,
  blue:   Colors.secondary,
  yellow: Colors.primaryFixedDim,
  purple: Colors.inversePrimary,
  cyan:   Colors.tertiaryFixed,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function asciiToHex(str: string): string {
  return Array.from(str)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

function hexToAscii(hex: string): string {
  let s = "";
  for (let i = 0; i < hex.length - 1; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    s += code >= 32 && code < 127 ? String.fromCharCode(code) : ".";
  }
  return s;
}

function formatHex(raw: string): string {
  return (raw.match(/.{1,2}/g) ?? []).join(" ").toUpperCase();
}

function ts(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// ── Log entry type ────────────────────────────────────────────────────────────
interface LogEntry {
  id: string;
  time: string;
  dir: "rx" | "tx" | "info" | "error";
  hex: string;
  ascii: string;
  bytes: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function UsbTestScreen() {
  const {
    devices,
    selectedDevice,
    connectionStatus,
    isScanning,
    isConnecting,
    lastError,
    scanForDevices,
    connectDevice,
    disconnectDevice,
    writeData,
    packets,
    baudRate: contextBaudRate,
    setBaudRate: setContextBaudRate,
  } = useUsb();

  const isConnected = connectionStatus === "connected";
  const isWorking   = isScanning || isConnecting;

  // Local state
  const [localSelected, setLocalSelected] = useState<UsbDevice | null>(null);
  const [log,           setLog]           = useState<LogEntry[]>([]);
  const [writeInput,    setWriteInput]    = useState("");
  const [writeMode,     setWriteMode]     = useState<"hex" | "ascii">("ascii");
  // baudRate mirrors the context so the chip init uses the right value
  const [baudRate,      setBaudRate]      = useState(String(contextBaudRate));
  const [autoScroll,    setAutoScroll]    = useState(true);

  const listRef    = useRef<FlatList>(null);
  const seenIds    = useRef<Set<string>>(new Set());

  // ── Sync selectedDevice from context ────────────────────────────────────────
  useEffect(() => {
    if (selectedDevice) setLocalSelected(selectedDevice);
  }, [selectedDevice]);

  // Auto-select first device after scan
  useEffect(() => {
    if (devices.length > 0 && !localSelected) {
      setLocalSelected(devices[0]);
    }
  }, [devices]);

  // ── Mirror incoming packets into local log ───────────────────────────────────
  useEffect(() => {
    const newEntries: LogEntry[] = [];
    for (const pkt of packets) {
      if (seenIds.current.has(pkt.id)) continue;
      seenIds.current.add(pkt.id);
      const rawHex = pkt.hexView.replace(/\s/g, "").toLowerCase();
      newEntries.push({
        id:    pkt.id,
        time:  new Date(pkt.timestamp).toLocaleTimeString("en-US", { hour12: false }),
        dir:   pkt.direction === "read" ? "rx" : "tx",
        hex:   formatHex(rawHex),
        ascii: hexToAscii(rawHex),
        bytes: pkt.byteLength,
      });
    }
    if (newEntries.length > 0) {
      setLog(prev => [...prev, ...newEntries].slice(-500));
    }
  }, [packets]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && log.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [log, autoScroll]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const addInfo = useCallback((msg: string, dir: "info" | "error" = "info") => {
    setLog(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      time: ts(), dir, hex: "", ascii: msg, bytes: 0,
    }].slice(-500));
  }, []);

  const handleScan = async () => {
    addInfo("Scanning for USB devices…");
    await scanForDevices();
  };

  const handleConnect = async () => {
    if (isConnected) {
      disconnectDevice();
      addInfo("Disconnected.");
      return;
    }
    const target = localSelected ?? devices[0];
    if (!target) { addInfo("No device selected. Scan first.", "error"); return; }

    addInfo(`Connecting to ${target.name} @ ${baudRate} baud…`);
    try {
      // Sync local baud rate selection into context before connecting
      const numBaud = parseInt(baudRate, 10);
      if (!isNaN(numBaud)) setContextBaudRate(numBaud as any);
      await connectDevice(target);
      addInfo(`✓ Connected to ${target.name}`);
    } catch (e: any) {
      addInfo(`✗ ${e?.message ?? String(e)}`, "error");
    }
  };

  const handleWrite = async () => {
    const raw = writeInput.trim();
    if (!raw) return;
    if (!isConnected) { addInfo("Not connected.", "error"); return; }

    let hexPayload: string;
    if (writeMode === "ascii") {
      hexPayload = asciiToHex(raw);
    } else {
      // Validate hex
      const clean = raw.replace(/\s/g, "");
      if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
        addInfo("Invalid hex — must be even-length hex string (e.g. 0D0A)", "error");
        return;
      }
      hexPayload = clean.toLowerCase();
    }

    try {
      await writeData(hexPayload);
      // TX packet will appear via the packets effect; just log intent
      addInfo(`→ Sent ${hexPayload.length / 2} byte(s): ${formatHex(hexPayload)}`);
      setWriteInput("");
    } catch (e: any) {
      addInfo(`✗ Write failed: ${e?.message ?? String(e)}`, "error");
    }
  };

  const handleClearLog = () => {
    setLog([]);
    seenIds.current.clear();
  };

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderLogItem = ({ item }: { item: LogEntry }) => {
    const dirColor =
      item.dir === "rx"    ? C.green  :
      item.dir === "tx"    ? C.blue   :
      item.dir === "error" ? C.red    : C.muted;

    const dirLabel =
      item.dir === "rx"    ? "RX" :
      item.dir === "tx"    ? "TX" :
      item.dir === "error" ? "!!" : "··";

    return (
      <View style={styles.logRow}>
        <Text style={[styles.logDir, { color: dirColor }]}>{dirLabel}</Text>
        <Text style={styles.logTime}>{item.time}</Text>
        {item.bytes > 0 && (
          <Text style={styles.logBytes}>{item.bytes}B</Text>
        )}
        <View style={styles.logContent}>
          {item.hex ? (
            <>
              <Text style={[styles.logHex, { color: dirColor }]}>{item.hex}</Text>
              <Text style={styles.logAscii}>{item.ascii}</Text>
            </>
          ) : (
            <Text style={[styles.logAscii, { color: dirColor }]}>{item.ascii}</Text>
          )}
        </View>
      </View>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >

          {/* ── HEADER ── */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <MaterialCommunityIcons name="usb" size={18} color={C.blue} />
              <Text style={styles.title}>USB Test</Text>
              <View style={[styles.statusPill, {
                backgroundColor: isConnected ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.1)",
                borderColor:     isConnected ? "rgba(63,185,80,0.4)"  : "rgba(248,81,73,0.3)",
              }]}>
                <View style={[styles.dot, { backgroundColor: isConnected ? C.green : C.red }]} />
                <Text style={[styles.statusTxt, { color: isConnected ? C.green : C.red }]}>
                  {isConnected
                    ? (selectedDevice?.name ?? "Connected")
                    : connectionStatus === "error" ? "Error"
                    : "Offline"}
                </Text>
              </View>
            </View>

            {/* Error banner */}
            {lastError && (
              <View style={styles.errorBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={12} color={C.red} />
                <Text style={styles.errorTxt} numberOfLines={2}>{lastError}</Text>
              </View>
            )}
          </View>

          {/* ── STEP 1: SCAN ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>① Scan for Devices</Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.btn, styles.btnBlue, isWorking && styles.btnDisabled]}
                onPress={handleScan}
                disabled={isWorking}
              >
                {isScanning
                  ? <ActivityIndicator size="small" color="white" />
                  : <MaterialCommunityIcons name="magnify" size={14} color="white" />}
                <Text style={styles.btnTxt}>{isScanning ? "Scanning…" : "Scan USB"}</Text>
              </Pressable>
              <Text style={styles.hint}>
                {devices.length === 0
                  ? "Connect device via OTG cable, then tap Scan"
                  : `${devices.length} device${devices.length > 1 ? "s" : ""} found`}
              </Text>
            </View>

            {/* Device chips */}
            {devices.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {devices.map(d => {
                  const sel = localSelected?.id === d.id;
                  return (
                    <Pressable
                      key={d.id}
                      style={[styles.devChip, sel && styles.devChipSel]}
                      onPress={() => setLocalSelected(d)}
                    >
                      <MaterialCommunityIcons
                        name="usb-flash-drive-outline"
                        size={12}
                        color={sel ? C.blue : C.muted}
                      />
                      <View>
                        <Text style={[styles.devName, sel && { color: C.blue }]} numberOfLines={1}>
                          {d.name}
                        </Text>
                        <Text style={styles.devMeta}>
                          VID:{d.vendorId?.toString(16).toUpperCase() ?? "?"} ·{" "}
                          PID:{d.productId?.toString(16).toUpperCase() ?? "?"}
                          {d.serialNumber ? ` · S/N:${d.serialNumber}` : ""}
                        </Text>
                      </View>
                      {sel && (
                        <MaterialCommunityIcons name="check-circle" size={12} color={C.blue} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ── STEP 2: CONNECT ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>② Connect</Text>
            <View style={styles.row}>
              {/* Baud rate */}
              <Text style={styles.lbl}>Baud</Text>
              <View style={styles.baudRow}>
                {["9600", "19200", "38400", "57600", "115200"].map(b => (
                  <Pressable
                    key={b}
                    style={[styles.baudChip, baudRate === b && styles.baudChipSel]}
                    onPress={() => setBaudRate(b)}
                  >
                    <Text style={[styles.baudTxt, baudRate === b && { color: C.yellow }]}>{b}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <Pressable
                style={[
                  styles.btn,
                  isConnected ? styles.btnRed : styles.btnGreen,
                  (isWorking || (!localSelected && !isConnected)) && styles.btnDisabled,
                ]}
                onPress={handleConnect}
                disabled={isWorking || (!localSelected && !isConnected)}
              >
                {isConnecting
                  ? <ActivityIndicator size="small" color="white" />
                  : <MaterialCommunityIcons
                      name={isConnected ? "link-off" : "link"}
                      size={14}
                      color="white"
                    />}
                <Text style={styles.btnTxt}>
                  {isConnecting ? "Connecting…" : isConnected ? "Disconnect" : "Connect"}
                </Text>
              </Pressable>

              {localSelected && !isConnected && (
                <Text style={styles.hint} numberOfLines={1}>
                  → {localSelected.name}
                </Text>
              )}
              {isConnected && selectedDevice && (
                <Text style={[styles.hint, { color: C.green }]} numberOfLines={1}>
                  ✓ {selectedDevice.name}
                </Text>
              )}
            </View>
          </View>

          {/* ── STEP 3: WRITE ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>③ Write to Device</Text>
            <View style={styles.row}>
              {/* Mode toggle */}
              {(["ascii", "hex"] as const).map(m => (
                <Pressable
                  key={m}
                  style={[styles.modeChip, writeMode === m && styles.modeChipSel]}
                  onPress={() => setWriteMode(m)}
                >
                  <Text style={[styles.modeTxt, writeMode === m && { color: C.purple }]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
              <Text style={styles.hint}>
                {writeMode === "ascii"
                  ? "Type text — will be sent as UTF-8 bytes"
                  : "Enter hex bytes e.g. 0D0A or 68 65 6C 6C 6F"}
              </Text>
            </View>

            <View style={styles.writeRow}>
              <TextInput
                style={styles.writeInput}
                value={writeInput}
                onChangeText={setWriteInput}
                placeholder={writeMode === "ascii" ? "Hello device…" : "0D 0A"}
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleWrite}
                returnKeyType="send"
              />
              <Pressable
                style={[styles.sendBtn, (!isConnected || !writeInput.trim()) && styles.btnDisabled]}
                onPress={handleWrite}
                disabled={!isConnected || !writeInput.trim()}
              >
                <MaterialCommunityIcons name="send" size={16} color="white" />
              </Pressable>
            </View>

            {/* Quick-send presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
              {[
                { label: "CR+LF",  hex: "0d0a" },
                { label: "AT",     hex: asciiToHex("AT\r\n") },
                { label: "Ping",   hex: asciiToHex("ping\r\n") },
                { label: "Status", hex: asciiToHex("status\r\n") },
                { label: "0x00",   hex: "00" },
                { label: "0xFF",   hex: "ff" },
              ].map(p => (
                <Pressable
                  key={p.label}
                  style={[styles.presetChip, !isConnected && styles.btnDisabled]}
                  onPress={async () => {
                    if (!isConnected) return;
                    try {
                      await writeData(p.hex);
                      addInfo(`→ Preset "${p.label}": ${formatHex(p.hex)}`);
                    } catch (e: any) {
                      addInfo(`✗ ${e?.message}`, "error");
                    }
                  }}
                  disabled={!isConnected}
                >
                  <Text style={styles.presetTxt}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* ── STEP 4: READ LOG ── */}
          <View style={[styles.section, { flex: 1 }]}>
            <View style={styles.logHeader}>
              <Text style={styles.sectionTitle}>④ Live Read Log</Text>
              <View style={styles.row}>
                <Pressable
                  style={[styles.miniBtn, autoScroll && styles.miniBtnActive]}
                  onPress={() => setAutoScroll(v => !v)}
                >
                  <MaterialCommunityIcons
                    name="arrow-collapse-down"
                    size={11}
                    color={autoScroll ? C.cyan : C.muted}
                  />
                  <Text style={[styles.miniBtnTxt, autoScroll && { color: C.cyan }]}>Auto</Text>
                </Pressable>
                <Pressable style={styles.miniBtn} onPress={handleClearLog}>
                  <MaterialCommunityIcons name="delete-outline" size={11} color={C.muted} />
                  <Text style={styles.miniBtnTxt}>Clear</Text>
                </Pressable>
                <Text style={styles.logCount}>{log.length} entries</Text>
              </View>
            </View>

            {log.length === 0 ? (
              <View style={styles.emptyLog}>
                <MaterialCommunityIcons name="antenna" size={28} color={C.border} />
                <Text style={styles.emptyTxt}>
                  {isConnected
                    ? "Waiting for data from device…"
                    : "Connect to a device to see live data"}
                </Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={log}
                keyExtractor={item => item.id}
                renderItem={renderLogItem}
                style={styles.logList}
                contentContainerStyle={{ paddingBottom: 8 }}
                onScrollBeginDrag={() => setAutoScroll(false)}
                showsVerticalScrollIndicator
                initialNumToRender={30}
                maxToRenderPerBatch={20}
              />
            )}
          </View>

        </KeyboardAvoidingView>
      </SafeAreaView>
      <BottomNav />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: C.text, fontSize: 16, fontWeight: "700", flex: 1 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: "700" },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(248,81,73,0.08)",
    borderRadius: 6, borderWidth: 1, borderColor: "rgba(248,81,73,0.25)",
    paddingHorizontal: 8, paddingVertical: 5,
  },
  errorTxt: { color: C.red, fontSize: 11, flex: 1 },

  section: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  sectionTitle: {
    color: C.muted, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.5, textTransform: "uppercase",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  lbl: { color: C.muted, fontSize: 10, fontWeight: "700" },
  hint: { color: C.muted, fontSize: 10, flex: 1 },

  btn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 7, paddingHorizontal: 12, paddingVertical: 7,
  },
  btnBlue:     { backgroundColor: "rgba(88,166,255,0.2)",  borderWidth: 1, borderColor: "rgba(88,166,255,0.5)" },
  btnGreen:    { backgroundColor: "rgba(63,185,80,0.2)",   borderWidth: 1, borderColor: "rgba(63,185,80,0.5)" },
  btnRed:      { backgroundColor: "rgba(248,81,73,0.2)",   borderWidth: 1, borderColor: "rgba(248,81,73,0.5)" },
  btnDisabled: { opacity: 0.35 },
  btnTxt:      { color: C.text, fontSize: 12, fontWeight: "700" },

  chipScroll: { marginTop: 2 },
  devChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(22,27,34,1)",
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 10, paddingVertical: 7, marginRight: 6,
  },
  devChipSel: { borderColor: "rgba(88,166,255,0.6)", backgroundColor: "rgba(88,166,255,0.08)" },
  devName: { color: C.text, fontSize: 11, fontWeight: "600", maxWidth: 160 },
  devMeta: { color: C.muted, fontSize: 9, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },

  baudRow: { flexDirection: "row", gap: 4 },
  baudChip: {
    borderRadius: 5, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: "rgba(22,27,34,1)",
  },
  baudChipSel: { borderColor: "rgba(210,153,34,0.6)", backgroundColor: "rgba(210,153,34,0.1)" },
  baudTxt: { color: C.muted, fontSize: 10, fontWeight: "600" },

  writeRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  writeInput: {
    flex: 1,
    backgroundColor: "rgba(13,17,23,1)",
    borderWidth: 1, borderColor: C.border, borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 8,
    color: C.text, fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 8,
    backgroundColor: "rgba(88,166,255,0.25)",
    borderWidth: 1, borderColor: "rgba(88,166,255,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  presetScroll: { marginTop: 2 },
  presetChip: {
    borderRadius: 5, borderWidth: 1, borderColor: "rgba(188,140,255,0.35)",
    backgroundColor: "rgba(188,140,255,0.08)",
    paddingHorizontal: 9, paddingVertical: 4, marginRight: 5,
  },
  presetTxt: { color: C.purple, fontSize: 10, fontWeight: "600" },

  modeChip: {
    borderRadius: 5, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: "rgba(22,27,34,1)",
  },
  modeChipSel: { borderColor: "rgba(188,140,255,0.5)", backgroundColor: "rgba(188,140,255,0.1)" },
  modeTxt: { color: C.muted, fontSize: 10, fontWeight: "700" },

  logHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 4,
  },
  logCount: { color: C.muted, fontSize: 9 },
  miniBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 5, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: "rgba(22,27,34,1)",
  },
  miniBtnActive: { borderColor: "rgba(57,211,83,0.4)", backgroundColor: "rgba(57,211,83,0.08)" },
  miniBtnTxt: { color: C.muted, fontSize: 9, fontWeight: "600" },

  logList: { flex: 1, backgroundColor: "rgba(13,17,23,1)", borderRadius: 6 },
  logRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: "rgba(48,54,61,0.5)",
  },
  logDir:   { fontSize: 9, fontWeight: "800", width: 18, marginTop: 1, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  logTime:  { color: C.muted, fontSize: 9, width: 60, marginTop: 1, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  logBytes: { color: "rgba(88,166,255,0.5)", fontSize: 9, width: 28, marginTop: 1, textAlign: "right" },
  logContent: { flex: 1, gap: 1 },
  logHex:   { fontSize: 10, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", letterSpacing: 0.3 },
  logAscii: { color: C.muted, fontSize: 9, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },

  emptyLog: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 30 },
  emptyTxt: { color: C.muted, fontSize: 12, textAlign: "center" },
});
