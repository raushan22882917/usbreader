import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useUsb } from "@/context/UsbContext";
import { DiskDeviceCard } from "@/components/DiskDeviceCard";

function StatBox({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof Feather>["name"];
  accent: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        statStyles.box,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={[statStyles.iconWrap, { backgroundColor: accent + "22" }]}>
        <Feather name={icon} size={16} color={accent} />
      </View>
      <Text style={[statStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[statStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  value: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

export default function DevicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    devices,
    selectedDevice,
    connectionStatus,
    isScanning,
    isConnecting,
    lastError,
    packets,
    scanForDevices,
    connectDevice,
    disconnectDevice,
    selectDevice,
  } = useUsb();

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (connectionStatus === "connected") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [connectionStatus]);

  const leftPad = Platform.OS === "web" ? 0 : insets.left;
  const rightPad = Platform.OS === "web" ? 0 : insets.right;
  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 60;

  const rxCount = packets.filter((p) => p.direction === "read").length;
  const txCount = packets.filter((p) => p.direction === "write").length;

  const isConnected = connectionStatus === "connected";

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingLeft: leftPad, paddingRight: rightPad },
      ]}
    >
      {/* ── LEFT SIDEBAR ── */}
      <View
        style={[
          styles.sidebar,
          { backgroundColor: colors.navBackground, borderRightColor: colors.border },
        ]}
      >
        <View style={[styles.sidebarHeader, { paddingTop: topPad + 8 }]}>
          <View style={styles.logoRow}>
            <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
              <Feather name="hard-drive" size={14} color="#fff" />
            </View>
            <Text style={[styles.logoText, { color: colors.foreground }]}>USB Manager</Text>
          </View>
          <Pressable
            style={[
              styles.scanBtn,
              { backgroundColor: colors.primary, borderRadius: colors.radius - 2 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              scanForDevices();
            }}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="refresh-cw" size={14} color="#fff" />
            )}
          </Pressable>
        </View>

        <Text style={[styles.sideLabel, { color: colors.mutedForeground }]}>
          DRIVES ({devices.length})
        </Text>

        <ScrollView
          style={styles.deviceList}
          contentContainerStyle={{ paddingBottom: bottomPad + 10 }}
          showsVerticalScrollIndicator={false}
        >
          {devices.length === 0 ? (
            <View style={styles.emptyList}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyListText, { color: colors.mutedForeground }]}>
                No devices{"\n"}Tap scan
              </Text>
            </View>
          ) : (
            devices.map((d) => (
              <DiskDeviceCard
                key={d.id}
                device={d}
                isSelected={selectedDevice?.id === d.id}
                onPress={() => selectDevice(d)}
              />
            ))
          )}
        </ScrollView>
      </View>

      {/* ── MAIN PANEL ── */}
      <View style={[styles.main, { paddingTop: topPad, paddingBottom: bottomPad }]}>
        {selectedDevice ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Device hero */}
            <View style={styles.heroRow}>
              {/* Big disk visual */}
              <View style={styles.bigDiskWrap}>
                <View
                  style={[
                    styles.bigDiskOuter,
                    {
                      borderColor: isConnected ? colors.primary + "80" : colors.border,
                      shadowColor: colors.primary,
                      shadowOpacity: isConnected ? 0.4 : 0,
                      shadowRadius: 20,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: isConnected ? 12 : 0,
                    },
                  ]}
                >
                  {[48, 36, 24].map((sz, i) => (
                    <View
                      key={sz}
                      style={{
                        position: "absolute",
                        width: sz,
                        height: sz,
                        borderRadius: sz / 2,
                        borderWidth: 1,
                        borderColor: isConnected
                          ? colors.primary + (i === 0 ? "50" : i === 1 ? "35" : "20")
                          : colors.border + "60",
                      }}
                    />
                  ))}
                  <Animated.View
                    style={[
                      styles.bigDiskCore,
                      {
                        backgroundColor: isConnected ? colors.primary : colors.secondary,
                        opacity: isConnected ? glowAnim : 1,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.diskLabel, { color: colors.mutedForeground }]}>
                  {selectedDevice.platform.toUpperCase()} DRIVE
                </Text>
              </View>

              {/* Device info */}
              <View style={styles.deviceInfo}>
                <Text style={[styles.deviceName, { color: colors.foreground }]}>
                  {selectedDevice.name}
                </Text>
                {selectedDevice.manufacturerName ? (
                  <Text style={[styles.deviceMfr, { color: colors.mutedForeground }]}>
                    {selectedDevice.manufacturerName}
                  </Text>
                ) : null}

                <View style={styles.idGrid}>
                  {[
                    { k: "Vendor ID", v: selectedDevice.vendorId != null ? `0x${selectedDevice.vendorId.toString(16).toUpperCase().padStart(4, "0")}` : "—" },
                    { k: "Product ID", v: selectedDevice.productId != null ? `0x${selectedDevice.productId.toString(16).toUpperCase().padStart(4, "0")}` : "—" },
                    { k: "Serial", v: selectedDevice.serialNumber ?? "—" },
                    { k: "Platform", v: selectedDevice.platform.toUpperCase() },
                  ].map(({ k, v }) => (
                    <View key={k} style={styles.idCell}>
                      <Text style={[styles.idKey, { color: colors.mutedForeground }]}>{k}</Text>
                      <Text style={[styles.idVal, { color: colors.foreground }]}>{v}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: isConnected ? colors.destructive : colors.primary,
                        borderRadius: colors.radius - 2,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      if (isConnected) disconnectDevice();
                      else connectDevice(selectedDevice);
                    }}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name={isConnected ? "x-circle" : "zap"} size={15} color="#fff" />
                        <Text style={styles.actionBtnText}>
                          {isConnected ? "Disconnect" : "Connect"}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <View
                    style={[
                      styles.statusChip,
                      {
                        backgroundColor:
                          isConnected ? colors.success + "22" : colors.muted,
                        borderRadius: colors.radius - 2,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: isConnected ? colors.success : colors.mutedForeground,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusLabel,
                        { color: isConnected ? colors.success : colors.mutedForeground },
                      ]}
                    >
                      {isConnected ? "CONNECTED" : "DISCONNECTED"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Stat boxes */}
            <View style={styles.statsRow}>
              <StatBox label="RX Packets" value={rxCount} icon="arrow-down-circle" accent={colors.primary} />
              <StatBox label="TX Packets" value={txCount} icon="arrow-up-circle" accent={colors.success} />
              <StatBox label="Total" value={packets.length} icon="database" accent={colors.warning} />
              <StatBox
                label="Status"
                value={isConnected ? "LIVE" : "IDLE"}
                icon={isConnected ? "zap" : "pause-circle"}
                accent={isConnected ? colors.success : colors.mutedForeground}
              />
            </View>

            {/* Data activity strip */}
            {packets.length > 0 && (
              <View
                style={[
                  styles.activityStrip,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text style={[styles.activityLabel, { color: colors.mutedForeground }]}>
                  RECENT ACTIVITY
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activityScroll}>
                  {[...packets].reverse().slice(0, 8).map((pkt) => (
                    <View
                      key={pkt.id}
                      style={[
                        styles.activityPill,
                        {
                          backgroundColor:
                            pkt.direction === "read"
                              ? colors.primary + "22"
                              : colors.success + "22",
                          borderRadius: 6,
                        },
                      ]}
                    >
                      <Feather
                        name={pkt.direction === "read" ? "arrow-down" : "arrow-up"}
                        size={10}
                        color={pkt.direction === "read" ? colors.primary : colors.success}
                      />
                      <Text
                        style={[
                          styles.activityText,
                          {
                            color: pkt.direction === "read" ? colors.primary : colors.success,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {pkt.data.substring(0, 14)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {lastError ? (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: colors.destructive + "15",
                    borderColor: colors.destructive + "40",
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Feather name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]}>{lastError}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <View style={styles.noSelection}>
            <View
              style={[
                styles.noSelDisk,
                { borderColor: colors.border },
              ]}
            >
              <View style={[styles.noSelRing, { borderColor: colors.border }]} />
              <Feather name="hard-drive" size={28} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.noSelTitle, { color: colors.foreground }]}>
              No Drive Selected
            </Text>
            <Text style={[styles.noSelSub, { color: colors.mutedForeground }]}>
              Scan and select a USB device from the left panel
            </Text>
            <Pressable
              style={[
                styles.noSelBtn,
                { borderColor: colors.primary, borderRadius: colors.radius },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                scanForDevices();
              }}
              disabled={isScanning}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Feather name="search" size={14} color={colors.primary} />
                  <Text style={[styles.noSelBtnText, { color: colors.primary }]}>Scan Now</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 240,
    borderRightWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 0,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  scanBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  sideLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 10,
  },
  deviceList: {
    flex: 1,
  },
  emptyList: {
    alignItems: "center",
    paddingTop: 40,
    gap: 10,
  },
  emptyListText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  main: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heroRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 16,
    alignItems: "center",
  },
  bigDiskWrap: {
    alignItems: "center",
    gap: 8,
  },
  bigDiskOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  bigDiskCore: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  diskLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  deviceInfo: {
    flex: 1,
    gap: 6,
  },
  deviceName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  deviceMfr: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  idGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  idCell: {
    minWidth: 90,
    gap: 2,
  },
  idKey: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  idVal: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  activityStrip: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  activityLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 8,
  },
  activityScroll: {},
  activityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 6,
  },
  activityText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    maxWidth: 100,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  noSelection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  noSelDisk: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  noSelRing: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  noSelTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  noSelSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 240,
  },
  noSelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderWidth: 1.5,
    marginTop: 4,
  },
  noSelBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
