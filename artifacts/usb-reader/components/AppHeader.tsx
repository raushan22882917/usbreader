import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useUsb } from "@/context/UsbContext";

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const C = {
  bg:     "rgba(26,30,32,1)",
  border: "rgba(51,56,58,1)",
  text:   "rgba(220,221,221,1)",
  muted:  "rgba(120,122,122,1)",
  dim:    "rgba(60,62,62,1)",
  green:  "#6EDCA1",
  yellow: "#FFC832",
  red:    "#FF503C",
  blue:   "#50B4FF",
};

interface AppHeaderProps {
  title: string;
  icon?: MCIcon;
  iconColor?: string;
  right?: React.ReactNode;
}

export function AppHeader({ title, icon = "circle-small", iconColor = C.muted, right }: AppHeaderProps) {
  const {
    selectedDevice, connectionStatus, isScanning, isConnecting,
    scanForDevices, connectDevice, disconnectDevice, devices,
  } = useUsb();

  const isConnected = connectionStatus === "connected";
  const isActive    = isConnected || isConnecting || isScanning;

  const handleUsbPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isConnected) {
      disconnectDevice();
    } else if (devices.length > 0) {
      connectDevice(devices[0]);
    } else {
      scanForDevices();
    }
  };

  return (
    <View style={s.bar}>
      {/* Back button */}
      <Pressable
        style={s.backBtn}
        onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/index" as any); }}
      >
        <MaterialCommunityIcons name="arrow-left" size={18} color={C.muted} />
      </Pressable>

      {/* Icon + title */}
      <MaterialCommunityIcons name={icon} size={16} color={iconColor} />
      <Text style={s.title}>{title}</Text>

      {/* Device chip */}
      <View style={[s.deviceChip, { borderColor: isConnected ? "rgba(110,220,161,0.3)" : C.border }]}>
        <MaterialCommunityIcons name="usb" size={11} color={isConnected ? C.green : C.dim} />
        <Text style={[s.deviceName, { color: isConnected ? C.text : C.dim }]} numberOfLines={1}>
          {selectedDevice?.name ?? (isConnected ? "USB Device" : "No device")}
        </Text>
        {selectedDevice && (
          <Text style={s.deviceVid}>
            VID:{selectedDevice.vendorId?.toString(16).toUpperCase() ?? "—"}
          </Text>
        )}
      </View>

      {/* Extra right slot */}
      {right}

      {/* USB connect pill */}
      <Pressable
        style={[s.connBtn, {
          backgroundColor: isConnected
            ? "rgba(110,220,161,0.12)"
            : isActive
            ? "rgba(255,200,50,0.1)"
            : "rgba(255,80,60,0.1)",
          borderColor: isConnected
            ? "rgba(110,220,161,0.45)"
            : isActive
            ? "rgba(255,200,50,0.4)"
            : "rgba(255,80,60,0.35)",
        }]}
        onPress={handleUsbPress}
        disabled={isConnecting || isScanning}
      >
        {(isConnecting || isScanning) ? (
          <ActivityIndicator size="small" color={C.yellow} />
        ) : (
          <View style={[s.dot, {
            backgroundColor: isConnected ? C.green : isActive ? C.yellow : C.red,
          }]} />
        )}
        <Text style={[s.connTxt, {
          color: isConnected ? C.green : isActive ? C.yellow : C.red,
        }]}>
          {isScanning ? "SCANNING" : isConnecting ? "LINKING" : isConnected ? "USB ON" : "USB OFF"}
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(32,36,38,1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  title: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  deviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(32,36,38,1)",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 200,
  },
  deviceName: {
    fontSize: 10,
    fontWeight: "600",
  },
  deviceVid: {
    color: C.dim,
    fontSize: 9,
  },
  connBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 82,
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connTxt: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
