import React, { useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUsb } from "@/context/UsbContext";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";

// KeyboardAwareScrollView removed — use standard ScrollView

import { Colors, Typography, Spacing, Border } from "@/theme";

const C = {
  bg:     Colors.background,
  panel:  Colors.surfaceContainerLow,
  card:   Colors.surfaceContainer,
  border: Colors.outlineVariant,
  text:   Colors.onSurface,
  muted:  Colors.onSurfaceVariant,
  dim:    Colors.dim,
  green:  Colors.tertiary,
  yellow: Colors.primaryFixedDim,
  orange: Colors.primary,
  red:    Colors.error,
  blue:   Colors.secondary,
  purple: Colors.inversePrimary,
  term:   Colors.terminal,
};

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface QuickCmd { label: string; cmd: string; icon: MCIcon; color: string; desc: string; }

const QUICK_CMDS: QuickCmd[] = [
  { label: "STATUS",    cmd: "STATUS\n",         icon: "information-outline",     color: C.blue,   desc: "Request device status" },
  { label: "RESET",     cmd: "RESET\n",           icon: "restart",                 color: C.red,    desc: "Soft reset device" },
  { label: "PING",      cmd: "PING\n",            icon: "broadcast",               color: C.green,  desc: "Check connection" },
  { label: "LED ON",    cmd: "LED ON\n",          icon: "led-on",                  color: C.yellow, desc: "Turn LED on" },
  { label: "LED OFF",   cmd: "LED OFF\n",         icon: "led-off",                 color: C.dim,    desc: "Turn LED off" },
  { label: "READ ADC",  cmd: "READ ADC\n",        icon: "sine-wave",               color: C.orange, desc: "Read ADC values" },
  { label: "MOTOR RPM", cmd: "MOTOR RPM\n",       icon: "engine",                  color: C.yellow, desc: "Query motor speed" },
  { label: "BMS STATUS",cmd: "BMS STATUS\n",      icon: "battery-charging-high",   color: C.green,  desc: "Battery management" },
  { label: "HV RAILS",  cmd: "HV RAILS\n",        icon: "flash",                   color: C.orange, desc: "HV bus voltage" },
  { label: "TEMP ALL",  cmd: "TEMP ALL\n",        icon: "thermometer",             color: C.red,    desc: "All temperature sensors" },
  { label: "RELAYS",    cmd: "RELAY STATUS\n",    icon: "electric-switch",         color: C.purple, desc: "Relay states" },
  { label: "INVERTER",  cmd: "INVERTER STATUS\n", icon: "cog-outline",             color: C.blue,   desc: "Inverter diagnostics" },
];

function CmdButton({ cmd, onPress, disabled }: { cmd: QuickCmd; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      style={[cb.btn, { backgroundColor: `${cmd.color}10`, borderColor: `${cmd.color}35` }, disabled && cb.disabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <MaterialCommunityIcons name={cmd.icon} size={18} color={disabled ? C.dim : cmd.color} />
      <Text style={[cb.label, { color: disabled ? C.dim : cmd.color }]}>{cmd.label}</Text>
      <Text style={cb.desc} numberOfLines={1}>{cmd.desc}</Text>
    </Pressable>
  );
}
const cb = StyleSheet.create({
  btn: { flex: 1, minWidth: 90, borderRadius: 8, borderWidth: 1, padding: 10, alignItems: "center", gap: 4 },
  label: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", textAlign: "center" },
  desc: { color: C.dim, fontSize: 8, textAlign: "center" },
  disabled: { opacity: 0.4 },
});

// ── TX Log row ────────────────────────────────────────────────
function TxRow({ data, time, onResend, disabled }: { data: string; time: string; onResend: () => void; disabled: boolean }) {
  return (
    <Pressable style={tx.row} onPress={() => { Haptics.selectionAsync(); onResend(); }} disabled={disabled}>
      <MaterialCommunityIcons name="arrow-up-circle" size={12} color={C.green} />
      <Text style={tx.time}>{time}</Text>
      <Text style={tx.data} numberOfLines={1}>{data.replace(/\n/g, "↵")}</Text>
      <MaterialCommunityIcons name="refresh" size={11} color={C.dim} />
    </Pressable>
  );
}
const tx = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)" },
  time: { color: C.dim, fontSize: 9, width: 56 },
  data: { flex: 1, color: C.text, fontSize: 10 },
});

export default function WriteScreen() {
  const { writeData, connectionStatus, packets } = useUsb();
  const [compose, setCompose] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [txLog, setTxLog] = useState<{ data: string; time: string }[]>([]);
  const inputRef = useRef<TextInput>(null);

  const isConnected = connectionStatus === "connected";
  const txPkts = packets.filter((p) => p.direction === "write");

  const doSend = async (data: string) => {
    if (!data.trim() || !isConnected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSending(true);
    try {
      await writeData(data);
      setTxLog((prev) => [{ data, time: new Date().toLocaleTimeString([], { hour12: false }) }, ...prev.slice(0, 49)]);
    } finally {
      setIsSending(false);
    }
  };

  const sendCompose = async () => {
    if (!compose.trim()) return;
    await doSend(compose);
    setCompose("");
  };

  return (
    <View style={s.root}>
      <Header />
      <View style={s.headerExtras}>
        <View style={[s.statPill, { borderColor: isConnected ? "rgba(110,220,161,0.35)" : "rgba(255,80,60,0.3)" }]}>
          <MaterialCommunityIcons name="arrow-up-circle" size={11} color={isConnected ? C.green : C.red} />
          <Text style={[s.statTxt, { color: isConnected ? C.green : C.red }]}>{txPkts.length} TX</Text>
        </View>
        <View style={{ flex: 1 }} />
        <UsbConnectionBar compact />
      </View>

      <View style={s.body}>
        {/* ── LEFT: Quick commands ── */}
        <View style={s.leftPanel}>
          <View style={s.leftHead}>
            <MaterialCommunityIcons name="lightning-bolt" size={14} color={C.yellow} />
            <Text style={s.leftTitle}>Quick Commands</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.cmdGrid}>
            {QUICK_CMDS.map((cmd) => (
              <CmdButton key={cmd.label} cmd={cmd} onPress={() => doSend(cmd.cmd)} disabled={!isConnected || isSending} />
            ))}
          </ScrollView>
        </View>

        {/* ── RIGHT: Compose + TX log ── */}
        <View style={s.rightPanel}>
          {/* TX Log */}
          <View style={s.txLogHead}>
            <MaterialCommunityIcons name="history" size={14} color={C.muted} />
            <Text style={s.txLogTitle}>TX History</Text>
            <Text style={s.txLogCount}>{txLog.length} sent</Text>
          </View>

          <ScrollView style={s.txLogArea} showsVerticalScrollIndicator>
            {txLog.length === 0 ? (
              <View style={s.emptyTx}>
                <MaterialCommunityIcons name="send-outline" size={28} color={C.dim} />
                <Text style={s.emptyTxTxt}>No transmissions yet</Text>
              </View>
            ) : (
              txLog.map((item, i) => (
                <TxRow key={i} data={item.data} time={item.time}
                  onResend={() => doSend(item.data)} disabled={!isConnected || isSending} />
              ))
            )}
          </ScrollView>

          {/* Compose area */}
          <View style={s.composePanel}>
            <View style={s.composeHead}>
              <MaterialCommunityIcons name="pencil" size={13} color={C.green} />
              <Text style={s.composeTitle}>COMPOSE</Text>
              <Text style={s.charCount}>{compose.length} chars</Text>
            </View>
            <View style={s.composeRow}>
              <TextInput
                ref={inputRef}
                style={s.input}
                value={compose}
                onChangeText={setCompose}
                placeholder={isConnected ? "Type command or data..." : "Connect a device to write..."}
                placeholderTextColor="rgba(50,52,52,1)"
                multiline
                editable={isConnected}
                onSubmitEditing={sendCompose}
              />
              <Pressable
                style={[s.sendBtn, { opacity: (!compose.trim() || !isConnected || isSending) ? 0.4 : 1 }]}
                onPress={sendCompose}
                disabled={!compose.trim() || !isConnected || isSending}
              >
                {isSending
                  ? <ActivityIndicator size="small" color="rgba(21,25,27,1)" />
                  : <>
                    <MaterialCommunityIcons name="send" size={16} color="rgba(21,25,27,1)" />
                    <Text style={s.sendTxt}>SEND</Text>
                  </>}
              </Pressable>
            </View>

            {/* Helper shortcuts */}
            <View style={s.shortcuts}>
              {[["\\n", "\n"], ["\\r\\n", "\r\n"], ["CLR", ""]].map(([label, val]) => (
                <Pressable key={label} style={s.shortcutBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (label === "CLR") setCompose("");
                    else setCompose((p) => p + val);
                  }}>
                  <Text style={s.shortcutTxt}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              {!isConnected && (
                <View style={s.offlineNote}>
                  <MaterialCommunityIcons name="usb" size={11} color={C.red} />
                  <Text style={s.offlineNoteTxt}>No device connected</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
      <BottomNav />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, flexDirection: "column" },

  headerExtras: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  statPill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  statTxt: { fontSize: 10, fontWeight: "700" },

  body: { flex: 1, flexDirection: "row" },

  leftPanel: { width: 220, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.panel },
  leftHead: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  leftTitle: { color: C.text, fontSize: 12, fontWeight: "700" },
  cmdGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 8 },

  rightPanel: { flex: 1, flexDirection: "column" },

  txLogHead: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  txLogTitle: { color: C.text, fontSize: 12, fontWeight: "700", flex: 1 },
  txLogCount: { color: C.muted, fontSize: 10 },
  txLogArea: { flex: 1, backgroundColor: C.term },
  emptyTx: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 8 },
  emptyTxTxt: { color: C.dim, fontSize: 12 },

  composePanel: { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.panel },
  composeHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  composeTitle: { color: C.muted, fontSize: 9, fontWeight: "700", letterSpacing: 1, flex: 1 },
  charCount: { color: C.dim, fontSize: 9 },
  composeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  input: { flex: 1, backgroundColor: "rgba(18,22,24,1)", borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.green, fontSize: 12, fontFamily: "monospace", padding: 10, minHeight: 64, maxHeight: 100 },
  sendBtn: { backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", gap: 4 },
  sendTxt: { color: "rgba(21,25,27,1)", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  shortcuts: { flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingBottom: 8, alignItems: "center" },
  shortcutBtn: { backgroundColor: C.card, borderRadius: 5, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 3 },
  shortcutTxt: { color: C.muted, fontSize: 10, fontFamily: "monospace" },
  offlineNote: { flexDirection: "row", alignItems: "center", gap: 4 },
  offlineNoteTxt: { color: C.red, fontSize: 10 },
});
