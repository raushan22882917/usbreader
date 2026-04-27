import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useUsb } from "@/context/UsbContext";

const C = {
  bg: "rgba(21,25,27,1)",
  border: "rgba(51,56,58,1)",
  text: "rgba(200,201,201,1)",
  muted: "rgba(120,122,122,1)",
  green: "#6EDCA1",
  red: "#FF503C",
};

export function GlobalStatusBar() {
  const [time, setTime] = useState(new Date());
  const { connectionStatus, selectedDevice, packets } = useUsb();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isConnected = connectionStatus === "connected";
  const rxCount = packets.filter((p) => p.direction === "read").length;
  const txCount = packets.filter((p) => p.direction === "write").length;

  return (
    <View style={styles.bar}>
      <Text style={styles.time}>
        {time.toLocaleDateString()} {time.toLocaleTimeString([], { hour12: false })}
      </Text>
      <View style={styles.center}>
        {selectedDevice ? (
          <Text style={styles.devName} numberOfLines={1}>{selectedDevice.name}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {isConnected && (
          <>
            <View style={[styles.chip, { backgroundColor: "rgba(80,180,255,0.15)" }]}>
              <Text style={[styles.chipTxt, { color: "#50B4FF" }]}>↓ {rxCount}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: "rgba(110,220,161,0.15)" }]}>
              <Text style={[styles.chipTxt, { color: C.green }]}>↑ {txCount}</Text>
            </View>
          </>
        )}
        <Feather
          name={isConnected ? "check-circle" : "x-circle"}
          size={13}
          color={isConnected ? C.green : C.red}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 32,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  time: { color: C.text, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center" },
  devName: { color: C.muted, fontSize: 11, fontFamily: "Inter_400Regular" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  chipTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
});
