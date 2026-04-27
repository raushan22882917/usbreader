import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useUsb } from "@/context/UsbContext";
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
  purple: "#9333EA",
  orange: "#FF9811",
};

interface Cmd {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
}

const QUICK: Cmd[] = [
  { label: "STATUS", value: "STATUS\r\n", icon: "info", color: C.blue },
  { label: "RESET", value: "RESET\r\n", icon: "refresh-cw", color: C.red },
  { label: "PING", value: "PING\r\n", icon: "radio", color: C.green },
  { label: "HELP", value: "HELP\r\n", icon: "help-circle", color: C.yellow },
  { label: "LED ON", value: "LED:ON\r\n", icon: "sun", color: C.yellow },
  { label: "LED OFF", value: "LED:OFF\r\n", icon: "moon", color: C.muted },
  { label: "READ ADC", value: "READ:ADC\r\n", icon: "cpu", color: C.green },
  { label: "READ ALL", value: "READ:ALL\r\n", icon: "download", color: C.blue },
  { label: "BAUD 9600", value: "BAUD:9600\r\n", icon: "settings", color: C.orange },
  { label: "BAUD 115200", value: "BAUD:115200\r\n", icon: "zap", color: C.orange },
  { label: "MOTOR RPM", value: "MOTOR:RPM\r\n", icon: "activity", color: C.purple },
  { label: "BATTERY", value: "BMS:STATUS\r\n", icon: "battery", color: C.green },
];

export default function WriteScreen() {
  const insets = useSafeAreaInsets();
  const { selectedDevice, connectionStatus, writeData, packets } = useUsb();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const isConnected = connectionStatus === "connected";
  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const bottomPad = Platform.OS === "web" ? 54 : insets.bottom + 60;
  const sentPackets = packets.filter((p) => p.direction === "write").slice().reverse().slice(0, 10);

  async function handleSend(value?: string) {
    const data = (value ?? input).trim();
    if (!data || !isConnected) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await writeData(value ?? input);
      setLastSent(value ?? input);
      if (!value) setInput("");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.root, { paddingLeft: leftPad, paddingRight: rightPad }]}>
      <GlobalStatusBar />

      <View style={styles.body}>
        {/* ── LEFT: Quick commands ── */}
        <View style={styles.cmdPane}>
          <View style={styles.cmdHead}>
            <Feather name="terminal" size={13} color={C.green} />
            <Text style={styles.cmdHeadTxt}>Quick Commands</Text>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: bottomPad + 10, gap: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {QUICK.map((cmd) => {
              const isSent = lastSent === cmd.value;
              return (
                <Pressable
                  key={cmd.label}
                  style={[
                    styles.cmdBtn,
                    {
                      backgroundColor: isSent ? `${cmd.color}15` : C.row,
                      borderColor: isSent ? `${cmd.color}60` : C.border,
                      opacity: isConnected ? 1 : 0.35,
                    },
                  ]}
                  onPress={() => handleSend(cmd.value)}
                  disabled={!isConnected || sending}
                >
                  <View style={[styles.cmdIcon, { backgroundColor: `${cmd.color}18` }]}>
                    <Feather name={cmd.icon} size={12} color={cmd.color} />
                  </View>
                  <Text style={[styles.cmdLabel, { color: isSent ? cmd.color : C.mid }]}>
                    {cmd.label}
                  </Text>
                  {isSent && <Feather name="check" size={10} color={cmd.color} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── RIGHT: Compose + history ── */}
        <KeyboardAwareScrollView
          style={[styles.rightPane, { paddingTop: 0 }]}
          contentContainerStyle={[styles.rightContent, { paddingBottom: bottomPad + 10 }]}
          bottomOffset={60}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Status banner */}
          <View style={[
            styles.banner,
            {
              backgroundColor: isConnected ? "rgba(110,220,161,0.08)" : "rgba(255,80,60,0.08)",
              borderColor: isConnected ? "rgba(110,220,161,0.4)" : "rgba(255,80,60,0.4)",
            },
          ]}>
            <View style={[styles.bannerDot, { backgroundColor: isConnected ? C.green : C.red }]} />
            <Text style={[styles.bannerTxt, { color: isConnected ? C.green : C.red }]}>
              {isConnected
                ? `Ready to write · ${selectedDevice?.name ?? "device"}`
                : "No device connected — connect first"}
            </Text>
          </View>

          {/* Compose terminal */}
          <View style={[
            styles.compose,
            { borderColor: isConnected ? "rgba(110,220,161,0.4)" : C.border },
          ]}>
            <View style={styles.composeTop}>
              <Text style={styles.composeTopLabel}>TX ── WRITE BUFFER</Text>
              <Text style={styles.composeTopHint}>{input.length} chars</Text>
            </View>
            <TextInput
              style={[styles.composeInput, { color: isConnected ? C.green : C.muted }]}
              value={input}
              onChangeText={setInput}
              placeholder={isConnected ? "> type data to transmit..." : "> connect a device first"}
              placeholderTextColor="rgba(80,82,82,1)"
              multiline
              editable={isConnected}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
            />
            <View style={[styles.composeFoot, { borderTopColor: C.border }]}>
              <Pressable
                style={[styles.clearBtn, { opacity: input.length > 0 ? 1 : 0.3 }]}
                onPress={() => setInput("")}
                disabled={!input}
              >
                <Feather name="x" size={12} color={C.muted} />
                <Text style={styles.clearTxt}>Clear</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: isConnected && input.trim() ? "rgba(110,220,161,0.12)" : C.row,
                    borderColor: isConnected && input.trim() ? "rgba(110,220,161,0.5)" : C.border,
                    opacity: isConnected && input.trim() && !sending ? 1 : 0.4,
                  },
                ]}
                onPress={() => handleSend()}
                disabled={!isConnected || !input.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator size="small" color={C.green} />
                  : <>
                    <Feather name="send" size={13} color={isConnected && input.trim() ? C.green : C.muted} />
                    <Text style={[styles.sendTxt, { color: isConnected && input.trim() ? C.green : C.muted }]}>
                      TRANSMIT
                    </Text>
                  </>}
              </Pressable>
            </View>
          </View>

          {/* Transmission log */}
          {sentPackets.length > 0 && (
            <View style={styles.histCard}>
              <Text style={styles.histTitle}>TX LOG</Text>
              {sentPackets.map((pkt, i) => (
                <Pressable
                  key={pkt.id}
                  style={[styles.histRow, { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }]}
                  onPress={() => { setInput(pkt.data); Haptics.selectionAsync(); }}
                >
                  <Feather name="arrow-up-circle" size={13} color={C.green} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.histData} numberOfLines={1}>{pkt.data.replace(/\r\n/g, "↵")}</Text>
                    <Text style={styles.histMeta}>
                      {pkt.byteLength}B · {pkt.timestamp.toLocaleTimeString([], { hour12: false })}
                    </Text>
                  </View>
                  <Feather name="corner-up-left" size={11} color={C.muted} />
                </Pressable>
              ))}
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, flexDirection: "row" },

  // CMD pane
  cmdPane: { width: 190, backgroundColor: "rgba(18,22,24,1)", borderRightWidth: 1, borderRightColor: C.border },
  cmdHead: { flexDirection: "row", alignItems: "center", gap: 7, padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  cmdHeadTxt: { color: C.text, fontSize: 12, fontFamily: "Inter_700Bold" },
  cmdBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 7, borderWidth: 1, padding: 9 },
  cmdIcon: { width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  cmdLabel: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },

  // Right pane
  rightPane: { flex: 1 },
  rightContent: { padding: 14, gap: 12 },

  // Banner
  banner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 7, borderWidth: 1, padding: 10 },
  bannerDot: { width: 7, height: 7, borderRadius: 4 },
  bannerTxt: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },

  // Compose
  compose: { borderRadius: 8, borderWidth: 1.5, backgroundColor: "#020810", overflow: "hidden" },
  composeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  composeTopLabel: { color: C.muted, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  composeTopHint: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
  composeInput: { fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 90, maxHeight: 160, paddingHorizontal: 14, paddingBottom: 8, lineHeight: 22 },
  composeFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderTopWidth: 1, gap: 8 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearTxt: { color: C.muted, fontSize: 11, fontFamily: "Inter_500Medium" },
  sendBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 7, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  sendTxt: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  // History
  histCard: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  histTitle: { color: C.muted, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, padding: 10, paddingBottom: 6 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  histData: { color: C.text, fontSize: 12, fontFamily: "Inter_400Regular" },
  histMeta: { color: C.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
});
