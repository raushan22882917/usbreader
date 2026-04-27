import React, { useState } from "react";
import {
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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { useUsb } from "@/context/UsbContext";

const QUICK_COMMANDS = [
  { label: "STATUS", value: "STATUS\r\n", icon: "info" as const },
  { label: "RESET", value: "RESET\r\n", icon: "refresh-cw" as const },
  { label: "LED ON", value: "LED:ON\r\n", icon: "sun" as const },
  { label: "LED OFF", value: "LED:OFF\r\n", icon: "moon" as const },
  { label: "READ ADC", value: "READ:ADC\r\n", icon: "cpu" as const },
  { label: "PING", value: "PING\r\n", icon: "radio" as const },
  { label: "HELP", value: "HELP\r\n", icon: "help-circle" as const },
  { label: "BAUD 9600", value: "BAUD:9600\r\n", icon: "settings" as const },
  { label: "BAUD 115200", value: "BAUD:115200\r\n", icon: "zap" as const },
  { label: "READ ALL", value: "READ:ALL\r\n", icon: "download" as const },
];

export default function WriteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedDevice, connectionStatus, writeData, packets } = useUsb();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const isConnected = connectionStatus === "connected";
  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 60;

  const sentPackets = packets.filter((p) => p.direction === "write").slice().reverse().slice(0, 12);

  async function handleSend(value?: string) {
    const data = value ?? input.trim();
    if (!data || !isConnected) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await writeData(data);
      setLastSent(data);
      if (!value) setInput("");
    } finally {
      setSending(false);
    }
  }

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingLeft: leftPad, paddingRight: rightPad },
      ]}
    >
      {/* ── LEFT: Quick commands ── */}
      <View
        style={[
          styles.leftPane,
          { backgroundColor: colors.navBackground, borderRightColor: colors.border },
        ]}
      >
        <View style={[styles.paneHeader, { paddingTop: topPad + 8 }]}>
          <Feather name="terminal" size={14} color={colors.primary} />
          <Text style={[styles.paneTitle, { color: colors.foreground }]}>Quick Commands</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPad + 10, paddingHorizontal: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {QUICK_COMMANDS.map((cmd) => (
            <Pressable
              key={cmd.label}
              style={[
                styles.cmdBtn,
                {
                  backgroundColor:
                    lastSent === cmd.value
                      ? colors.success + "22"
                      : colors.card,
                  borderColor:
                    lastSent === cmd.value ? colors.success : colors.border,
                  borderRadius: colors.radius - 2,
                  opacity: isConnected ? 1 : 0.4,
                },
              ]}
              onPress={() => handleSend(cmd.value)}
              disabled={!isConnected || sending}
            >
              <View
                style={[
                  styles.cmdIcon,
                  {
                    backgroundColor:
                      lastSent === cmd.value ? colors.success + "33" : colors.secondary,
                    borderRadius: 6,
                  },
                ]}
              >
                <Feather
                  name={cmd.icon}
                  size={13}
                  color={lastSent === cmd.value ? colors.success : colors.primary}
                />
              </View>
              <Text style={[styles.cmdLabel, { color: colors.foreground }]}>
                {cmd.label}
              </Text>
              {lastSent === cmd.value && (
                <Feather name="check" size={12} color={colors.success} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── RIGHT: Compose + history ── */}
      <KeyboardAwareScrollView
        style={[styles.rightPane, { paddingTop: topPad }]}
        contentContainerStyle={[styles.rightContent, { paddingBottom: bottomPad + 10 }]}
        bottomOffset={60}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Connection status banner */}
        <View
          style={[
            styles.banner,
            {
              backgroundColor: isConnected ? colors.success + "18" : colors.destructive + "15",
              borderColor: isConnected ? colors.success + "40" : colors.destructive + "40",
              borderRadius: colors.radius - 2,
            },
          ]}
        >
          <View
            style={[
              styles.bannerDot,
              { backgroundColor: isConnected ? colors.success : colors.destructive },
            ]}
          />
          <Text style={[styles.bannerText, { color: isConnected ? colors.success : colors.destructive }]}>
            {isConnected
              ? `Connected to ${selectedDevice?.name ?? "device"} — ready to write`
              : "No device connected — connect a USB device first"}
          </Text>
        </View>

        {/* Compose area */}
        <View
          style={[
            styles.composeCard,
            {
              backgroundColor: "#020810",
              borderColor: isConnected ? colors.primary + "50" : colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.composeHeader}>
            <Text style={[styles.composeLabel, { color: colors.mutedForeground }]}>
              WRITE DATA →
            </Text>
            <Text style={[styles.composeHint, { color: colors.mutedForeground }]}>
              {input.length} chars
            </Text>
          </View>
          <TextInput
            style={[
              styles.composeInput,
              {
                color: isConnected ? colors.primary : colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder={isConnected ? "Type data to transmit..." : "Connect a device first"}
            placeholderTextColor={colors.mutedForeground}
            multiline
            editable={isConnected}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
          />
          <View style={styles.composeFoot}>
            <Pressable
              style={[
                styles.clearBtn,
                { opacity: input.length > 0 ? 1 : 0.3 },
              ]}
              onPress={() => setInput("")}
              disabled={!input}
            >
              <Feather name="x" size={13} color={colors.mutedForeground} />
              <Text style={[styles.clearBtnText, { color: colors.mutedForeground }]}>Clear</Text>
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    isConnected && input.trim() ? colors.primary : colors.secondary,
                  borderRadius: colors.radius - 2,
                  opacity: isConnected && input.trim() && !sending ? 1 : 0.5,
                },
              ]}
              onPress={() => handleSend()}
              disabled={!isConnected || !input.trim() || sending}
            >
              <Feather name="send" size={15} color={isConnected && input.trim() ? "#fff" : colors.mutedForeground} />
              <Text
                style={[
                  styles.sendBtnText,
                  { color: isConnected && input.trim() ? "#fff" : colors.mutedForeground },
                ]}
              >
                Transmit
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Sent history */}
        {sentPackets.length > 0 && (
          <View>
            <Text style={[styles.histLabel, { color: colors.mutedForeground }]}>
              TRANSMISSION LOG
            </Text>
            <View
              style={[
                styles.histCard,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              {sentPackets.map((pkt, i) => (
                <Pressable
                  key={pkt.id}
                  style={[
                    styles.histRow,
                    {
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    setInput(pkt.data);
                    Haptics.selectionAsync();
                  }}
                >
                  <Feather name="arrow-up-circle" size={13} color={colors.success} />
                  <View style={styles.histRowInfo}>
                    <Text style={[styles.histData, { color: colors.foreground }]} numberOfLines={1}>
                      {pkt.data.replace("\r\n", "↵")}
                    </Text>
                    <Text style={[styles.histMeta, { color: colors.mutedForeground }]}>
                      {pkt.byteLength}B · {new Date(pkt.timestamp).toLocaleTimeString([], { hour12: false })}
                    </Text>
                  </View>
                  <Feather name="corner-up-left" size={12} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  leftPane: {
    width: 200,
    borderRightWidth: 1,
  },
  paneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginBottom: 4,
  },
  paneTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  cmdBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
  },
  cmdIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  cmdLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  rightPane: {
    flex: 1,
  },
  rightContent: {
    padding: 16,
    gap: 14,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
  },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bannerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  composeCard: {
    borderWidth: 1.5,
    overflow: "hidden",
  },
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  composeLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  composeHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  composeInput: {
    fontSize: 15,
    minHeight: 100,
    maxHeight: 180,
    paddingHorizontal: 14,
    paddingBottom: 10,
    lineHeight: 24,
  },
  composeFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#1a2a42",
    gap: 8,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clearBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  histLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 8,
  },
  histCard: {
    borderWidth: 1,
    overflow: "hidden",
  },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  histRowInfo: {
    flex: 1,
    gap: 2,
  },
  histData: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  histMeta: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
