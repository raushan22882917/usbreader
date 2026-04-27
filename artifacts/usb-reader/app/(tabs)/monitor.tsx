import React, { useRef } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useUsb } from "@/context/UsbContext";
import { PacketRow } from "@/components/PacketRow";

export default function MonitorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { packets, connectionStatus, selectedDevice, viewMode, setViewMode, clearPackets } =
    useUsb();

  const flatListRef = useRef<FlatList>(null);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const rxCount = packets.filter((p) => p.direction === "read").length;
  const txCount = packets.filter((p) => p.direction === "write").length;

  const modes: ("text" | "hex" | "ascii")[] = ["text", "hex", "ascii"];

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
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, { color: "#fff" }]}>Monitor</Text>
            <Text
              style={[styles.headerSub, { color: "rgba(255,255,255,0.6)" }]}
            >
              {selectedDevice?.name ?? "No device"}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              clearPackets();
            }}
          >
            <Feather name="trash-2" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View
            style={[
              styles.statPill,
              { backgroundColor: colors.primary + "33" },
            ]}
          >
            <Feather name="arrow-down" size={11} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.primary }]}>
              RX {rxCount}
            </Text>
          </View>
          <View
            style={[
              styles.statPill,
              { backgroundColor: colors.success + "33" },
            ]}
          >
            <Feather name="arrow-up" size={11} color={colors.success} />
            <Text style={[styles.statText, { color: colors.success }]}>
              TX {txCount}
            </Text>
          </View>

          <View style={styles.modeSwitcher}>
            {modes.map((m) => (
              <Pressable
                key={m}
                style={[
                  styles.modeBtn,
                  {
                    backgroundColor:
                      viewMode === m
                        ? colors.primary
                        : "rgba(255,255,255,0.12)",
                    borderRadius: 6,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setViewMode(m);
                }}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    {
                      color:
                        viewMode === m ? "#fff" : "rgba(255,255,255,0.7)",
                    },
                  ]}
                >
                  {m.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {packets.length === 0 ? (
        <View style={styles.empty}>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: colors.muted, borderRadius: 999 },
            ]}
          >
            <Feather name="activity" size={32} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No packets yet
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            {connectionStatus === "connected"
              ? "Waiting for data from connected device..."
              : "Connect a USB device to see data here"}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={[...packets].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PacketRow packet={item} viewMode={viewMode} />
          )}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom:
                Platform.OS === "web" ? 100 : insets.bottom + 90,
            },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  modeSwitcher: {
    flexDirection: "row",
    gap: 4,
    marginLeft: "auto",
  },
  modeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  modeBtnText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  listContent: {
    padding: 14,
  },
});
