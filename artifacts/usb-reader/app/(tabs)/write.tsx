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
  { label: "Status", value: "STATUS\r\n" },
  { label: "Reset", value: "RESET\r\n" },
  { label: "LED ON", value: "LED:ON\r\n" },
  { label: "LED OFF", value: "LED:OFF\r\n" },
  { label: "Read ADC", value: "READ:ADC\r\n" },
  { label: "Ping", value: "PING\r\n" },
  { label: "Help", value: "HELP\r\n" },
  { label: "Baud 9600", value: "BAUD:9600\r\n" },
];

export default function WriteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedDevice, connectionStatus, writeData, packets } = useUsb();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const isConnected = connectionStatus === "connected";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const sentPackets = packets
    .filter((p) => p.direction === "write")
    .slice()
    .reverse()
    .slice(0, 20);

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.navBackground,
            paddingTop: topPadding + 12,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: "#fff" }]}>Write</Text>
        <Text
          style={[styles.headerSub, { color: "rgba(255,255,255,0.6)" }]}
        >
          {selectedDevice?.name ?? "No device connected"}
        </Text>
      </View>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 90,
          },
        ]}
        bottomOffset={60}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!isConnected && (
          <View
            style={[
              styles.warningBox,
              {
                backgroundColor: colors.warning + "22",
                borderColor: colors.warning + "44",
                borderRadius: colors.radius - 4,
              },
            ]}
          >
            <Feather name="alert-triangle" size={15} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              Connect a USB device first to send data
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          QUICK COMMANDS
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickScroll}
          contentContainerStyle={styles.quickScrollContent}
        >
          {QUICK_COMMANDS.map((cmd) => (
            <Pressable
              key={cmd.label}
              style={[
                styles.quickBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius - 4,
                  opacity: isConnected ? 1 : 0.4,
                },
              ]}
              onPress={() => handleSend(cmd.value)}
              disabled={!isConnected || sending}
            >
              <Text
                style={[styles.quickBtnText, { color: colors.foreground }]}
              >
                {cmd.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text
          style={[
            styles.sectionLabel,
            { color: colors.mutedForeground, marginTop: 18 },
          ]}
        >
          CUSTOM MESSAGE
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              { color: colors.foreground, fontFamily: "Inter_400Regular" },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder="Type data to send..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            editable={isConnected}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
          />
          <Pressable
            style={[
              styles.sendBtn,
              {
                backgroundColor: isConnected ? colors.primary : colors.muted,
                borderRadius: colors.radius - 4,
              },
            ]}
            onPress={() => handleSend()}
            disabled={!isConnected || !input.trim() || sending}
          >
            <Feather
              name="send"
              size={18}
              color={isConnected ? "#fff" : colors.mutedForeground}
            />
          </Pressable>
        </View>

        {lastSent && (
          <View
            style={[
              styles.lastSentBox,
              {
                backgroundColor: colors.success + "15",
                borderColor: colors.success + "40",
                borderRadius: colors.radius - 4,
              },
            ]}
          >
            <Feather name="check-circle" size={13} color={colors.success} />
            <Text style={[styles.lastSentText, { color: colors.success }]}>
              Sent: <Text style={{ fontFamily: "Inter_600SemiBold" }}>{lastSent.replace("\r\n", "↵")}</Text>
            </Text>
          </View>
        )}

        {sentPackets.length > 0 && (
          <>
            <Text
              style={[
                styles.sectionLabel,
                { color: colors.mutedForeground, marginTop: 22 },
              ]}
            >
              SENT HISTORY
            </Text>
            {sentPackets.map((pkt) => (
              <Pressable
                key={pkt.id}
                style={[
                  styles.historyRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius - 4,
                  },
                ]}
                onPress={() => {
                  setInput(pkt.data);
                  Haptics.selectionAsync();
                }}
              >
                <Feather
                  name="clock"
                  size={12}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[styles.historyText, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {pkt.data.replace("\r\n", "↵")}
                </Text>
                <Feather
                  name="corner-up-left"
                  size={12}
                  color={colors.mutedForeground}
                />
              </Pressable>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    marginBottom: 18,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  quickScroll: {
    marginHorizontal: -16,
  },
  quickScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  quickBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1.5,
    padding: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    minHeight: 44,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  lastSentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  lastSentText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
  },
  historyText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
