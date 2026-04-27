import React, { useRef, useState } from "react";
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
import { useColors } from "@/hooks/useColors";
import { useUsb, DataPacket } from "@/context/UsbContext";

function toAscii(hex: string): string {
  return hex
    .split(" ")
    .map((h) => {
      const code = parseInt(h, 16);
      if (code >= 32 && code < 127) return String.fromCharCode(code);
      return ".";
    })
    .join("");
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function HexGrid({ hexString }: { hexString: string }) {
  const colors = useColors();
  const bytes = hexString.split(" ").filter(Boolean);
  const rows: string[][] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    rows.push(bytes.slice(i, i + 16));
  }
  return (
    <View style={hexStyles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={hexStyles.row}>
          <Text style={[hexStyles.offset, { color: colors.mutedForeground }]}>
            {(ri * 16).toString(16).padStart(4, "0")}
          </Text>
          <View style={hexStyles.bytes}>
            {row.map((b, bi) => (
              <Text
                key={bi}
                style={[
                  hexStyles.byte,
                  {
                    color: parseInt(b, 16) === 0 ? colors.mutedForeground : colors.primary,
                  },
                ]}
              >
                {b}
              </Text>
            ))}
          </View>
          <Text style={[hexStyles.ascii, { color: colors.success }]}>
            {toAscii(row.join(" "))}
          </Text>
        </View>
      ))}
    </View>
  );
}

const hexStyles = StyleSheet.create({
  grid: { gap: 2, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  offset: { fontSize: 10, fontFamily: "Inter_400Regular", width: 36 },
  bytes: { flexDirection: "row", flexWrap: "nowrap", gap: 4, flex: 1 },
  byte: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ascii: { fontSize: 11, fontFamily: "Inter_400Regular", minWidth: 80 },
});

export default function MonitorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { packets, connectionStatus, selectedDevice, viewMode, setViewMode, clearPackets } = useUsb();
  const [selectedPacket, setSelectedPacket] = useState<DataPacket | null>(null);

  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 60;

  const rxCount = packets.filter((p) => p.direction === "read").length;
  const txCount = packets.filter((p) => p.direction === "write").length;
  const isConnected = connectionStatus === "connected";

  const modes: ("text" | "hex" | "ascii")[] = ["text", "hex", "ascii"];

  const displayPacket = selectedPacket ?? (packets.length > 0 ? [...packets].reverse()[0] : null);
  const displayData = displayPacket
    ? viewMode === "hex"
      ? displayPacket.hexView
      : viewMode === "ascii"
      ? toAscii(displayPacket.hexView)
      : displayPacket.data
    : null;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingLeft: leftPad, paddingRight: rightPad },
      ]}
    >
      {/* ── LEFT: Packet log ── */}
      <View
        style={[
          styles.logPane,
          { backgroundColor: colors.navBackground, borderRightColor: colors.border },
        ]}
      >
        {/* Log header */}
        <View style={[styles.logHeader, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <Text style={[styles.logTitle, { color: colors.foreground }]}>Packet Log</Text>
          <View style={styles.logMeta}>
            <View style={[styles.statChip, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.statChipText, { color: colors.primary }]}>
                ↓ {rxCount}
              </Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: colors.success + "22" }]}>
              <Text style={[styles.statChipText, { color: colors.success }]}>
                ↑ {txCount}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                clearPackets();
                setSelectedPacket(null);
              }}
            >
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {packets.length === 0 ? (
          <View style={styles.emptyLog}>
            <Feather name="activity" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyLogText, { color: colors.mutedForeground }]}>
              {isConnected ? "Listening..." : "No device"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={[...packets].reverse()}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: bottomPad + 10, paddingHorizontal: 8, paddingTop: 6 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isRx = item.direction === "read";
              const isActive = displayPacket?.id === item.id;
              return (
                <Pressable
                  style={[
                    styles.logRow,
                    {
                      backgroundColor: isActive ? (isRx ? colors.primary + "22" : colors.success + "22") : "transparent",
                      borderRadius: 6,
                      borderLeftWidth: 2.5,
                      borderLeftColor: isRx ? colors.primary : colors.success,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedPacket(item);
                  }}
                >
                  <View style={styles.logRowTop}>
                    <Text
                      style={[
                        styles.logDir,
                        { color: isRx ? colors.primary : colors.success },
                      ]}
                    >
                      {isRx ? "RX" : "TX"}
                    </Text>
                    <Text style={[styles.logTime, { color: colors.mutedForeground }]}>
                      {formatTime(item.timestamp)}
                    </Text>
                    <Text style={[styles.logBytes, { color: colors.mutedForeground }]}>
                      {item.byteLength}B
                    </Text>
                  </View>
                  <Text
                    style={[styles.logPreview, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.data}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* ── RIGHT: Data viewer ── */}
      <View style={[styles.viewer, { paddingTop: topPad }]}>
        {/* Viewer toolbar */}
        <View style={[styles.viewerToolbar, { borderBottomColor: colors.border }]}>
          <View style={styles.viewerTitleRow}>
            <View
              style={[
                styles.termDot,
                { backgroundColor: displayPacket?.direction === "read" ? colors.primary : colors.success },
              ]}
            />
            <Text style={[styles.viewerTitle, { color: colors.foreground }]}>
              {displayPacket
                ? `${displayPacket.direction.toUpperCase()} — ${formatTime(displayPacket.timestamp)}`
                : "Data Viewer"}
            </Text>
            <Text style={[styles.viewerBytes, { color: colors.mutedForeground }]}>
              {displayPacket ? `${displayPacket.byteLength} bytes` : "—"}
            </Text>
          </View>

          <View style={styles.modeRow}>
            {modes.map((m) => (
              <Pressable
                key={m}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: viewMode === m ? colors.primary : colors.secondary,
                    borderRadius: 5,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setViewMode(m);
                }}
              >
                <Text
                  style={[
                    styles.modeText,
                    { color: viewMode === m ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  {m.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Terminal area */}
        <ScrollView
          style={[styles.terminal, { backgroundColor: "#020810" }]}
          contentContainerStyle={[styles.terminalContent, { paddingBottom: bottomPad + 10 }]}
          showsVerticalScrollIndicator={false}
        >
          {displayPacket ? (
            <>
              {/* Header info bar */}
              <View
                style={[
                  styles.termHeader,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius - 4,
                  },
                ]}
              >
                <View style={styles.termInfoCell}>
                  <Text style={[styles.termInfoKey, { color: colors.mutedForeground }]}>DIRECTION</Text>
                  <Text
                    style={[
                      styles.termInfoVal,
                      {
                        color:
                          displayPacket.direction === "read" ? colors.primary : colors.success,
                      },
                    ]}
                  >
                    {displayPacket.direction.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.termInfoCell}>
                  <Text style={[styles.termInfoKey, { color: colors.mutedForeground }]}>TIMESTAMP</Text>
                  <Text style={[styles.termInfoVal, { color: colors.foreground }]}>
                    {formatTime(displayPacket.timestamp)}
                  </Text>
                </View>
                <View style={styles.termInfoCell}>
                  <Text style={[styles.termInfoKey, { color: colors.mutedForeground }]}>BYTES</Text>
                  <Text style={[styles.termInfoVal, { color: colors.foreground }]}>
                    {displayPacket.byteLength}
                  </Text>
                </View>
                <View style={styles.termInfoCell}>
                  <Text style={[styles.termInfoKey, { color: colors.mutedForeground }]}>DEVICE</Text>
                  <Text style={[styles.termInfoVal, { color: colors.foreground }]} numberOfLines={1}>
                    {selectedDevice?.name ?? "—"}
                  </Text>
                </View>
              </View>

              {/* Hex grid or text */}
              {viewMode === "hex" ? (
                <HexGrid hexString={displayPacket.hexView} />
              ) : (
                <Text
                  style={[
                    styles.termText,
                    { color: viewMode === "ascii" ? colors.success : colors.primary },
                  ]}
                  selectable
                >
                  {displayData}
                </Text>
              )}
            </>
          ) : (
            <View style={styles.termEmpty}>
              <Text style={[styles.termCursor, { color: colors.primary }]}>
                █ READY
              </Text>
              <Text style={[styles.termEmptyText, { color: colors.mutedForeground }]}>
                {isConnected
                  ? "Waiting for data stream..."
                  : "Connect a USB device to start receiving data"}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Status bar */}
        <View
          style={[
            styles.statusBar,
            { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(8, insets.bottom) },
          ]}
        >
          <View style={[styles.statusDot2, { backgroundColor: isConnected ? colors.success : colors.mutedForeground }]} />
          <Text style={[styles.statusBarText, { color: colors.mutedForeground }]}>
            {isConnected ? `LIVE — ${selectedDevice?.name ?? "device"}` : "STANDBY"}
          </Text>
          <Text style={[styles.statusBarRight, { color: colors.mutedForeground }]}>
            {packets.length} packets captured
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  logPane: {
    width: 220,
    borderRightWidth: 1,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  logTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  logMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statChipText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  emptyLog: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyLogText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  logRow: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 3,
    gap: 2,
  },
  logRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logDir: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  logTime: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  logBytes: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
  },
  logPreview: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  viewer: {
    flex: 1,
    flexDirection: "column",
  },
  viewerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  viewerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  termDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  viewerTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  viewerBytes: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  modeRow: {
    flexDirection: "row",
    gap: 4,
  },
  modeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  terminal: {
    flex: 1,
  },
  terminalContent: {
    padding: 14,
    gap: 12,
  },
  termHeader: {
    flexDirection: "row",
    padding: 10,
    gap: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  termInfoCell: {
    gap: 3,
    flex: 1,
  },
  termInfoKey: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  termInfoVal: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  termText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  termEmpty: {
    flex: 1,
    paddingTop: 40,
    gap: 12,
  },
  termCursor: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  termEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  statusDot2: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBarText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    flex: 1,
    letterSpacing: 0.5,
  },
  statusBarRight: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
