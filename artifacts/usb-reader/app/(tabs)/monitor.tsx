import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb, DataPacket } from "@/context/UsbContext";
import { GlobalStatusBar } from "@/components/StatusBar";

const C = {
  bg: "rgba(21,25,27,1)",
  card: "rgba(28,32,34,1)",
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

function toAscii(hex: string): string {
  return hex
    .split(" ")
    .filter(Boolean)
    .map((h) => {
      const code = parseInt(h, 16);
      return code >= 32 && code < 127 ? String.fromCharCode(code) : ".";
    })
    .join("");
}

function formatTs(d: Date): string {
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function HexDump({ hexStr }: { hexStr: string }) {
  const bytes = hexStr.split(" ").filter(Boolean);
  const rows: string[][] = [];
  for (let i = 0; i < bytes.length; i += 16) rows.push(bytes.slice(i, i + 16));
  return (
    <View style={{ gap: 1 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={hd.row}>
          <Text style={hd.offset}>{(ri * 16).toString(16).padStart(4, "0")}</Text>
          <Text style={hd.sep}>│</Text>
          <View style={hd.bytesWrap}>
            {Array.from({ length: 16 }).map((_, bi) => {
              const b = row[bi];
              const isNull = !b || b === "00";
              return (
                <Text key={bi} style={[hd.byte, { color: isNull ? "rgba(51,56,58,1)" : C.blue }]}>
                  {b ?? "  "}
                </Text>
              );
            })}
          </View>
          <Text style={hd.sep}>│</Text>
          <Text style={hd.ascii} numberOfLines={1}>{toAscii(row.join(" "))}</Text>
        </View>
      ))}
    </View>
  );
}

const hd = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  offset: { color: "rgba(100,102,102,1)", fontSize: 10, fontFamily: "Inter_400Regular", width: 34, marginRight: 4 },
  sep: { color: "rgba(51,56,58,1)", fontSize: 10, fontFamily: "Inter_400Regular", marginHorizontal: 4 },
  bytesWrap: { flexDirection: "row", gap: 3, width: 208 },
  byte: { fontSize: 10, fontFamily: "Inter_400Regular", width: 13 },
  ascii: { color: C.green, fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 },
});

export default function MonitorScreen() {
  const insets = useSafeAreaInsets();
  const { packets, connectionStatus, selectedDevice, viewMode, setViewMode, clearPackets } = useUsb();
  const [selectedPkt, setSelectedPkt] = useState<DataPacket | null>(null);

  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const bottomPad = Platform.OS === "web" ? 54 : insets.bottom + 60;
  const isConnected = connectionStatus === "connected";

  const rxCount = packets.filter((p) => p.direction === "read").length;
  const txCount = packets.filter((p) => p.direction === "write").length;

  const displayPkt = selectedPkt ?? ([...packets].reverse()[0] ?? null);
  const displayData = displayPkt
    ? viewMode === "hex" ? displayPkt.hexView
    : viewMode === "ascii" ? toAscii(displayPkt.hexView)
    : displayPkt.data
    : null;

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <GlobalStatusBar />

      <View style={styles.body}>
        {/* ── LEFT: Packet list ── */}
        <View style={styles.logPane}>
          <View style={[styles.logHead, { borderBottomColor: C.border }]}>
            <Text style={styles.logTitle}>Packet Log</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={[styles.chip, { backgroundColor: "rgba(80,180,255,0.15)" }]}>
                <Text style={[styles.chipTxt, { color: C.blue }]}>↓{rxCount}</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: "rgba(110,220,161,0.15)" }]}>
                <Text style={[styles.chipTxt, { color: C.green }]}>↑{txCount}</Text>
              </View>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); clearPackets(); setSelectedPkt(null); }}>
                <Feather name="trash-2" size={13} color={C.muted} />
              </Pressable>
            </View>
          </View>

          {packets.length === 0 ? (
            <View style={styles.logEmpty}>
              <Feather name="activity" size={22} color={C.muted} />
              <Text style={styles.logEmptyTxt}>{isConnected ? "Listening..." : "No data"}</Text>
            </View>
          ) : (
            <FlatList
              data={[...packets].reverse()}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingVertical: 4, paddingHorizontal: 6, paddingBottom: bottomPad, gap: 2 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: pkt }) => {
                const isRx = pkt.direction === "read";
                const isActive = displayPkt?.id === pkt.id;
                return (
                  <Pressable
                    style={[
                      styles.logRow,
                      {
                        backgroundColor: isActive
                          ? isRx ? "rgba(80,180,255,0.12)" : "rgba(110,220,161,0.12)"
                          : "transparent",
                        borderLeftWidth: 2,
                        borderLeftColor: isRx ? C.blue : C.green,
                      },
                    ]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedPkt(pkt); }}
                  >
                    <View style={styles.logRowTop}>
                      <Text style={[styles.logDir, { color: isRx ? C.blue : C.green }]}>
                        {isRx ? "RX" : "TX"}
                      </Text>
                      <Text style={styles.logTime}>{formatTs(pkt.timestamp)}</Text>
                      <Text style={styles.logBytes}>{pkt.byteLength}B</Text>
                    </View>
                    <Text style={styles.logData} numberOfLines={1}>{pkt.data}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {/* ── RIGHT: Hex viewer ── */}
        <View style={styles.viewer}>
          {/* Toolbar */}
          <View style={[styles.viewerBar, { borderBottomColor: C.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <View style={[styles.termDot, { backgroundColor: displayPkt?.direction === "read" ? C.blue : C.green }]} />
              <Text style={styles.viewerTitle}>
                {displayPkt
                  ? `${displayPkt.direction.toUpperCase()} · ${formatTs(displayPkt.timestamp)} · ${displayPkt.byteLength}B`
                  : "Data Viewer"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {(["text", "hex", "ascii"] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.modeBtn,
                    { backgroundColor: viewMode === m ? C.blue : "rgba(35,39,41,1)", borderColor: viewMode === m ? C.blue : C.border },
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setViewMode(m); }}
                >
                  <Text style={[styles.modeTxt, { color: viewMode === m ? "#fff" : C.muted }]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Terminal area */}
          <ScrollView
            style={[styles.terminal, { backgroundColor: C.terminal }]}
            contentContainerStyle={[styles.termContent, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
          >
            {displayPkt ? (
              <>
                {/* Packet info header */}
                <View style={styles.pktHeader}>
                  {[
                    { k: "DIRECTION", v: displayPkt.direction.toUpperCase(), c: displayPkt.direction === "read" ? C.blue : C.green },
                    { k: "TIMESTAMP", v: formatTs(displayPkt.timestamp), c: C.text },
                    { k: "BYTES", v: displayPkt.byteLength.toString(), c: C.yellow },
                    { k: "DEVICE", v: selectedDevice?.name ?? "—", c: C.muted },
                  ].map(({ k, v, c }) => (
                    <View key={k} style={styles.pktCell}>
                      <Text style={styles.pktCellKey}>{k}</Text>
                      <Text style={[styles.pktCellVal, { color: c }]} numberOfLines={1}>{v}</Text>
                    </View>
                  ))}
                </View>

                {/* Data */}
                {viewMode === "hex" ? (
                  <HexDump hexStr={displayPkt.hexView} />
                ) : (
                  <Text
                    style={[styles.termText, { color: viewMode === "ascii" ? C.green : C.blue }]}
                    selectable
                  >
                    {displayData}
                  </Text>
                )}
              </>
            ) : (
              <View style={{ paddingTop: 36, gap: 10 }}>
                <Text style={[styles.termCursor, { color: C.blue }]}>█ READY</Text>
                <Text style={styles.termEmptyTxt}>
                  {isConnected ? "Waiting for data stream from device..." : "Connect a USB device to start capturing data"}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Status bar */}
          <View style={[styles.termStatus, { paddingBottom: Math.max(8, insets.bottom) }]}>
            <View style={[styles.liveIndicator, { backgroundColor: isConnected ? C.green : C.muted }]} />
            <Text style={styles.termStatusTxt}>
              {isConnected ? `LIVE · ${selectedDevice?.name ?? ""}` : "STANDBY"}
            </Text>
            <Text style={styles.termStatusRight}>{packets.length} packets captured</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, flexDirection: "row" },

  // Log pane
  logPane: { width: 210, backgroundColor: "rgba(18,22,24,1)", borderRightWidth: 1, borderRightColor: C.border },
  logHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderBottomWidth: 1 },
  logTitle: { color: C.text, fontSize: 12, fontFamily: "Inter_700Bold" },
  chip: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  chipTxt: { fontSize: 9, fontFamily: "Inter_700Bold" },
  logEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  logEmptyTxt: { color: C.muted, fontSize: 11, fontFamily: "Inter_400Regular" },
  logRow: { paddingVertical: 6, paddingRight: 6, paddingLeft: 8, borderRadius: 4, gap: 2 },
  logRowTop: { flexDirection: "row", alignItems: "center", gap: 4 },
  logDir: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.3, width: 16 },
  logTime: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular", flex: 1 },
  logBytes: { color: C.muted, fontSize: 9, fontFamily: "Inter_400Regular" },
  logData: { color: C.text, fontSize: 10, fontFamily: "Inter_400Regular" },

  // Viewer
  viewer: { flex: 1, flexDirection: "column" },
  viewerBar: { flexDirection: "row", alignItems: "center", padding: 10, borderBottomWidth: 1, gap: 10 },
  termDot: { width: 7, height: 7, borderRadius: 4 },
  viewerTitle: { color: C.text, fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  modeBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  modeTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

  // Terminal
  terminal: { flex: 1 },
  termContent: { padding: 12, gap: 10 },
  pktHeader: { flexDirection: "row", gap: 12, backgroundColor: "rgba(28,32,34,1)", borderRadius: 6, padding: 10, marginBottom: 8 },
  pktCell: { flex: 1, gap: 3 },
  pktCellKey: { color: C.muted, fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  pktCellVal: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  termText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20 },
  termCursor: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  termEmptyTxt: { color: C.muted, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },

  // Status strip
  termStatus: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: "rgba(28,32,34,1)",
    gap: 7,
  },
  liveIndicator: { width: 6, height: 6, borderRadius: 3 },
  termStatusTxt: { color: C.muted, fontSize: 10, fontFamily: "Inter_500Medium", flex: 1, letterSpacing: 0.3 },
  termStatusRight: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
});
