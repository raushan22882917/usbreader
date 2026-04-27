import React from "react";
import {
  ActivityIndicator,
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
import { useUsb } from "@/context/UsbContext";
import { DeviceCard } from "@/components/DeviceCard";
import { UsbStatusBar } from "@/components/StatusBar";

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

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

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
        <View style={styles.headerContent}>
          <View>
            <Text style={[styles.headerTitle, { color: "#fff" }]}>
              USB Manager
            </Text>
            <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.6)" }]}>
              {devices.length} device{devices.length !== 1 ? "s" : ""} found
            </Text>
          </View>
          <Pressable
            style={[
              styles.scanBtn,
              { backgroundColor: colors.primary, borderRadius: colors.radius - 4 },
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
              <>
                <Feather name="search" size={16} color="#fff" />
                <Text style={styles.scanBtnText}>Scan</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              Platform.OS === "web" ? 100 : insets.bottom + 90,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <UsbStatusBar
          status={connectionStatus}
          deviceName={selectedDevice?.name}
          packetCount={packets.length}
        />

        {lastError ? (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: colors.destructive + "15",
                borderColor: colors.destructive + "40",
                borderRadius: colors.radius - 4,
              },
            ]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {lastError}
            </Text>
          </View>
        ) : null}

        {devices.length === 0 ? (
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: colors.muted, borderRadius: 999 },
              ]}
            >
              <Feather name="hard-drive" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No USB devices
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Tap Scan to detect connected USB devices
            </Text>
            {Platform.OS === "web" && (
              <Text
                style={[styles.emptyDesc, { color: colors.mutedForeground, marginTop: 8, fontSize: 12 }]}
              >
                Requires Chrome or Edge for WebUSB support
              </Text>
            )}
          </View>
        ) : (
          <>
            <Text
              style={[styles.sectionLabel, { color: colors.mutedForeground }]}
            >
              DETECTED DEVICES
            </Text>
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                isSelected={selectedDevice?.id === device.id}
                isConnecting={
                  isConnecting && selectedDevice?.id === device.id
                }
                onSelect={() => selectDevice(device)}
                onConnect={() => connectDevice(device)}
                onDisconnect={disconnectDevice}
              />
            ))}
          </>
        )}

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.infoRow}>
            <Feather
              name={Platform.OS === "android" ? "check-circle" : "info"}
              size={15}
              color={
                Platform.OS === "android" ? colors.success : colors.primary
              }
            />
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>
              {Platform.OS === "android"
                ? "Android USB OTG"
                : Platform.OS === "ios"
                ? "iOS MFi Accessories"
                : "WebUSB (Chrome/Edge)"}
            </Text>
          </View>
          <Text style={[styles.infoDesc, { color: colors.mutedForeground }]}>
            {Platform.OS === "android"
              ? "Full USB OTG support. Connect devices via USB-C/micro-USB adapter."
              : Platform.OS === "ios"
              ? "iOS supports USB accessories through Apple MFi-certified hardware."
              : "WebUSB allows browser-based communication with USB devices."}
          </Text>
        </View>
      </ScrollView>
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
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 80,
    justifyContent: "center",
  },
  scanBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
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
    paddingHorizontal: 30,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  infoCard: {
    padding: 14,
    borderWidth: 1,
    marginTop: 18,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  infoDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
