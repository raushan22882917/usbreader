import React, { useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useUsb, DataPacket } from "@/context/UsbContext";

const C = {
  bg:     "rgba(21,25,27,1)",
  panel:  "rgba(26,30,32,1)",
  card:   "rgba(32,36,38,1)",
  border: "rgba(51,56,58,1)",
  text:   "rgba(220,221,221,1)",
  muted:  "rgba(120,122,122,1)",
  dim:    "rgba(60,62,62,1)",
  green:  "#6EDCA1",
  yellow: "#FFC832",
  red:    "#FF503C",
  blue:   "#50B4FF",
  term:   "#020810",
};

type ViewMode = "TEXT" | "HEX" | "ASCII";

// ── Packet row ────────────────────────────────────────────────
function PacketRow({ pkt, isSelected, onPress }: { pkt: DataPacket; isSelected: boolean; onPress: () => void }) {
  const isRx = pkt.direction === "read";
  const color = isRx ? C.blue : C.green;
  const icon = isRx ? "arrow-down-circle" : "arrow-up-circle";

  return (
    <Pressable
      style={[pr.row, { borderLeftColor: color, backgroundColor: isSelected ? `${color}15` : "transparent" }]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
    >
      <MaterialCommunityIcons name={icon} size={13} color={color} />
      <Text style={[pr.dir, { color }]}>{isRx ? "RX" : "TX"}</Text>
      <Text style={pr.time}>{pkt.timestamp.toLocaleTimeString([], { hour12: false })}</Text>
      <Text style={pr.data} numberOfLines={1}>{pkt.data}</Text>
      <Text style={pr.bytes}>{pkt.byteLength}B</Text>
    </Pressable>
  );
}
const pr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderLeftWidth: 2 },
  dir: { fontSize: 9, fontWeight: "700", width: 18 },
  time: { color: C.muted, fontSize: 9, width: 60 },
  data: { flex: 1, color: C.text, fontSize: 10 },
  bytes: { color: C.muted, fontSize: 9 },
});

// ── Hex dump viewer ───────────────────────────────────────────
function HexViewer({ pkt, mode }: { pkt: DataPacket | null; mode: ViewMode }) {
  if (!pkt) {
    return (
      <View style={hv.empty}>
        <MaterialCommunityIcons name="code-braces" size={32} color={C.dim} />
        <Text style={hv.emptyTxt}>Select a packet to inspect</Text>
      </View>
    );
  }

  const hex = pkt.hexView ?? "";
  const bytes = hex.match(/.{1,2}/g) ?? [];

  const rows: string[][] = [];
  for (let i = 0; i < bytes.length; i += 16) rows.push(bytes.slice(i, i + 16));

  return (
    <ScrollView style={hv.scroll} contentContainerStyle={{ padding: 10 }} showsVerticalScrollIndicator>
      {/* Header */}
      <View style={hv.fileHeader}>
        <MaterialCommunityIcons name={pkt.direction === "read" ? "arrow-down-circle" : "arrow-up-circle"}
          size={13} color={pkt.direction === "read" ? C.blue : C.green} />
        <Text style={[hv.fileHeaderTxt, { color: pkt.direction === "read" ? C.blue : C.green }]}>
          {pkt.direction.toUpperCase()} · {pkt.timestamp.toLocaleTimeString()} · {pkt.byteLength} bytes
        </Text>
      </View>

      {mode === "TEXT" && (
        <Text style={hv.rawTxt}>{pkt.data}</Text>
      )}

      {mode === "HEX" && rows.map((row, ri) => (
        <View key={ri} style={[hv.dataRow, { backgroundColor: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }]}>
          <Text style={hv.offset}>{(ri * 16).toString(16).padStart(8, "0")}</Text>
          <View style={hv.bytesWrap}>
            {Array.from({ length: 16 }).map((_, bi) => {
              const b = row[bi];
              const val = b ? parseInt(b, 16) : 0;
              const color = !b ? C.dim : val === 0 ? "rgba(50,52,52,1)" : val > 200 ? C.red : val > 100 ? C.yellow : C.blue;
              return <Text key={bi} style={[hv.byte, { color }]}>{b ?? "  "}</Text>;
            })}
          </View>
          <Text style={hv.ascii}>{row.map((b) => { const v = parseInt(b, 16); return v >= 32 && v < 127 ? String.fromCharCode(v) : "·"; }).join("")}</Text>
        </View>
      ))}

      {mode === "ASCII" && rows.map((row, ri) => (
        <View key={ri} style={hv.dataRow}>
          <Text style={hv.offset}>{(ri * 16).toString(16).padStart(4, "0")}</Text>
          <Text style={hv.asciiOnly}>{row.map((b) => { const v = parseInt(b, 16); return v >= 32 && v < 127 ? String.fromCharCode(v) : "."; }).join("")}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
const hv = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.term },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.term },
  emptyTxt: { color: C.muted, fontSize: 12 },
  fileHeader: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(35,39,41,1)", borderRadius: 6, padding: 8, marginBottom: 8 },
  fileHeaderTxt: { fontSize: 11, fontWeight: "600" },
  rawTxt: { color: C.green, fontSize: 11, fontFamily: "monospace", lineHeight: 18 },
  dataRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  offset: { color: "rgba(60,62,62,1)", fontSize: 9, width: 68 },
  bytesWrap: { flexDirection: "row", gap: 2, flex: 1 },
  byte: { fontSize: 9, width: 17, textAlign: "center" },
  ascii: { color: "rgba(50,150,50,1)", fontSize: 9, width: 96 },
  asciiOnly: { color: C.green, fontSize: 10, flex: 1 },
});

// ── Main ──────────────────────────────────────────────────────
export default function MonitorScreen() {
  const { packets, clearPackets, connectionStatus } = useUsb();
  const [selected, setSelected] = useState<DataPacket | null>(null);
  const [mode, setMode] = useState<ViewMode>("HEX");
  const listRef = useRef<FlatList>(null);

  const isConnected = connectionStatus === "connected";
  const rxCount = packets.filter((p) => p.direction === "read").length;
  const txCount = packets.filter((p) => p.direction === "write").length;

  return (
    <View style={s.root}>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <Pressable style={s.backBtn} onPress={() => router.push("/(tabs)/index" as any)}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={C.muted} />
        </Pressable>
        <MaterialCommunityIcons name="chart-timeline-variant" size={16} color={C.blue} />
        <Text style={s.topTitle}>Packet Monitor</Text>

        <View style={s.topStats}>
          <View style={[s.statPill, { borderColor: "rgba(80,180,255,0.4)" }]}>
            <MaterialCommunityIcons name="arrow-down-circle" size={11} color={C.blue} />
            <Text style={[s.statTxt, { color: C.blue }]}>{rxCount}</Text>
          </View>
          <View style={[s.statPill, { borderColor: "rgba(110,220,161,0.4)" }]}>
            <MaterialCommunityIcons name="arrow-up-circle" size={11} color={C.green} />
            <Text style={[s.statTxt, { color: C.green }]}>{txCount}</Text>
          </View>
        </View>

        <Pressable style={s.clearBtn} onPress={() => { clearPackets(); setSelected(null); }}>
          <MaterialCommunityIcons name="delete-outline" size={16} color={C.red} />
          <Text style={s.clearTxt}>CLEAR</Text>
        </Pressable>

        {/* Live indicator */}
        <View style={[s.livePill, { backgroundColor: isConnected ? "rgba(110,220,161,0.1)" : C.card, borderColor: isConnected ? "rgba(110,220,161,0.4)" : C.border }]}>
          <View style={[s.liveDot, { backgroundColor: isConnected ? C.green : C.muted }]} />
          <Text style={[s.liveTxt, { color: isConnected ? C.green : C.muted }]}>{isConnected ? "LIVE" : "IDLE"}</Text>
        </View>
      </View>

      <View style={s.body}>
        {/* ── LEFT: Packet log ── */}
        <View style={s.leftPanel}>
          <View style={s.lPanelHead}>
            <MaterialCommunityIcons name="format-list-bulleted" size={13} color={C.muted} />
            <Text style={s.lPanelTitle}>Packet Log</Text>
          </View>

          {packets.length === 0 ? (
            <View style={s.emptyLog}>
              <MaterialCommunityIcons name="chart-timeline-variant" size={28} color={C.dim} />
              <Text style={s.emptyLogTxt}>No data</Text>
              <Text style={s.emptyLogSub}>Connect a USB device to start capturing</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={[...packets].reverse()}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <PacketRow
                  pkt={item}
                  isSelected={selected?.id === item.id}
                  onPress={() => setSelected(item)}
                />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              onContentSizeChange={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            />
          )}
        </View>

        {/* ── RIGHT: Hex viewer ── */}
        <View style={s.rightPanel}>
          {/* Viewer toolbar */}
          <View style={s.viewerBar}>
            <View style={[s.statusDotBig, { backgroundColor: selected ? (selected.direction === "read" ? C.blue : C.green) : C.dim }]} />
            <Text style={s.viewerTitle}>
              {selected ? `${selected.direction.toUpperCase()} · ${selected.byteLength} bytes` : "Data Viewer"}
            </Text>
            <View style={s.modeRow}>
              {(["TEXT", "HEX", "ASCII"] as ViewMode[]).map((m) => (
                <Pressable key={m} style={[s.modeBtn, { backgroundColor: mode === m ? "rgba(80,180,255,0.15)" : C.card, borderColor: mode === m ? C.blue : C.border }]}
                  onPress={() => { Haptics.selectionAsync(); setMode(m); }}>
                  <Text style={[s.modeTxt, { color: mode === m ? C.blue : C.muted }]}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Content */}
          {packets.length === 0 ? (
            <View style={[hv.empty, { backgroundColor: C.term }]}>
              <MaterialCommunityIcons name="console-line" size={36} color={C.dim} />
              <Text style={[hv.emptyTxt, { fontSize: 15 }]}>READY</Text>
              <Text style={s.readySub}>Connect a USB device to start capturing data</Text>
            </View>
          ) : (
            <HexViewer pkt={selected} mode={mode} />
          )}

          {/* Status strip */}
          <View style={s.statusStrip}>
            <View style={[s.statusDotBig, { width: 6, height: 6, borderRadius: 3, backgroundColor: isConnected ? C.green : C.dim }]} />
            <Text style={s.statusStripTxt}>
              {isConnected ? `● LIVE · ${packets.length} packets` : "○ IDLE · Waiting for device"}
            </Text>
            {selected && <Text style={s.statusStripRight}>{selected.byteLength} bytes · {mode}</Text>}
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, flexDirection: "column" },

  topBar: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  backBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: C.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  topTitle: { color: C.text, fontSize: 13, fontWeight: "700", flex: 1 },
  topStats: { flexDirection: "row", gap: 5 },
  statPill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  statTxt: { fontSize: 10, fontWeight: "700" },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,80,60,0.1)", borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,80,60,0.4)", paddingHorizontal: 8, paddingVertical: 4 },
  clearTxt: { color: C.red, fontSize: 9, fontWeight: "700" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveTxt: { fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },

  body: { flex: 1, flexDirection: "row" },
  card: { backgroundColor: C.card },

  leftPanel: { width: 210, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.panel },
  lPanelHead: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  lPanelTitle: { color: C.text, fontSize: 12, fontWeight: "700" },
  emptyLog: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, gap: 8 },
  emptyLogTxt: { color: C.muted, fontSize: 13, fontWeight: "500" },
  emptyLogSub: { color: C.dim, fontSize: 10, textAlign: "center" },

  rightPanel: { flex: 1, flexDirection: "column" },
  viewerBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  statusDotBig: { width: 8, height: 8, borderRadius: 4 },
  viewerTitle: { color: C.text, fontSize: 11, fontWeight: "600", flex: 1 },
  modeRow: { flexDirection: "row", gap: 4 },
  modeBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  modeTxt: { fontSize: 9, fontWeight: "700" },
  readySub: { color: C.dim, fontSize: 11, textAlign: "center" },

  statusStrip: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.panel },
  statusStripTxt: { color: C.muted, fontSize: 9, fontWeight: "500", flex: 1 },
  statusStripRight: { color: C.muted, fontSize: 9 },
});
