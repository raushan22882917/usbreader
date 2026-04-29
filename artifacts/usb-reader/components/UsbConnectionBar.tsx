/**
 * UsbConnectionBar — Industrial Tech OS
 * Shared USB connection component used on every screen.
 * Full mode: device chips + scan + connect/disconnect.
 * Compact mode: single-line pill row for tight headers.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUsb } from '@/context/UsbContext';
import { Colors, Typography, Spacing, Border } from '../theme';
import { StatusChip } from './ui/StatusChip';

interface UsbConnectionBarProps {
  showNodeId?: boolean;
  nodeId?: string;
  onNodeIdChange?: (v: string) => void;
  compact?: boolean;
}

export function UsbConnectionBar({
  showNodeId = false,
  nodeId = '1',
  onNodeIdChange,
  compact = false,
}: UsbConnectionBarProps) {
  const {
    devices, selectedDevice, connectionStatus,
    isScanning, isConnecting,
    scanForDevices, connectDevice, quickConnect, disconnectDevice,
  } = useUsb();

  const isConnected = connectionStatus === 'connected';
  const isWorking   = isScanning || isConnecting;

  const [localDeviceId, setLocalDeviceId] = useState<string | null>(
    selectedDevice?.id ?? null
  );

  useEffect(() => {
    if (selectedDevice) setLocalDeviceId(selectedDevice.id);
  }, [selectedDevice]);

  useEffect(() => {
    if (devices.length > 0 && !localDeviceId) setLocalDeviceId(devices[0].id);
  }, [devices]);

  const handleScan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scanForDevices();
  };

  const handleConnect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isConnected) { disconnectDevice(); return; }
    const target = devices.find((d) => d.id === localDeviceId);
    if (target) connectDevice(target);
    else quickConnect();
  };

  // ── Compact ──────────────────────────────────────────────────
  if (compact) {
    return (
      <View style={s.compactRow}>
        <StatusChip
          label={isConnected ? (selectedDevice?.name ?? 'Connected') : connectionStatus === 'error' ? 'Error' : 'Offline'}
          color={isConnected ? Colors.tertiary : Colors.primary}
          pulse={isConnected}
        />

        <Pressable style={s.iconBtn} onPress={handleScan} disabled={isWorking}>
          {isScanning
            ? <ActivityIndicator size="small" color={Colors.secondary} />
            : <MaterialCommunityIcons name="magnify" size={13} color={Colors.secondary} />}
        </Pressable>

        <Pressable
          style={[
            s.connectBtn,
            {
              backgroundColor: isConnected ? `${Colors.primary}18` : `${Colors.tertiary}18`,
              borderColor:     isConnected ? `${Colors.primary}55` : `${Colors.tertiary}55`,
            },
          ]}
          onPress={handleConnect}
          disabled={isWorking}
        >
          {isConnecting
            ? <ActivityIndicator size="small" color={isConnected ? Colors.primary : Colors.tertiary} />
            : <MaterialCommunityIcons
                name={isConnected ? 'link-off' : 'link'}
                size={13}
                color={isConnected ? Colors.primary : Colors.tertiary}
              />}
          <Text style={[s.connectTxt, { color: isConnected ? Colors.primary : Colors.tertiary }]}>
            {isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Full ─────────────────────────────────────────────────────
  return (
    <View style={s.bar}>
      {/* Row 1: device chips + scan */}
      <View style={s.row}>
        <MaterialCommunityIcons name="usb" size={13} color={Colors.onSurfaceVariant} />
        <Text style={s.lbl}>USB</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={s.chipRow}>
            {devices.length === 0 ? (
              <Text style={s.noDevTxt}>No devices — tap Scan</Text>
            ) : (
              devices.map((d) => {
                const sel = localDeviceId === d.id;
                return (
                  <Pressable
                    key={d.id}
                    style={[s.devChip, sel && s.devChipSel]}
                    onPress={() => { Haptics.selectionAsync(); setLocalDeviceId(d.id); }}
                  >
                    <View style={[s.devDot, { backgroundColor: d.connected ? Colors.tertiary : Colors.onSurfaceVariant }]} />
                    <Text style={[s.devChipTxt, sel && s.devChipTxtSel]} numberOfLines={1}>
                      {d.name || `Dev ${d.id}`}
                    </Text>
                    {d.vendorId != null && (
                      <Text style={s.devVid}>{d.vendorId.toString(16).toUpperCase()}</Text>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>

        <Pressable style={s.scanBtn} onPress={handleScan} disabled={isWorking}>
          {isScanning
            ? <ActivityIndicator size="small" color={Colors.onSurface} />
            : <MaterialCommunityIcons name="magnify" size={12} color={Colors.onSurface} />}
          <Text style={s.scanTxt}>{isScanning ? 'Scanning…' : 'Scan'}</Text>
        </Pressable>
      </View>

      {/* Row 2: status + optional node ID + connect */}
      <View style={s.row}>
        <StatusChip
          label={
            isConnected
              ? (selectedDevice?.name ?? 'Connected')
              : connectionStatus === 'error' ? 'Error'
              : connectionStatus === 'disconnected' ? 'Disconnected'
              : 'Offline'
          }
          color={isConnected ? Colors.tertiary : Colors.primary}
          pulse={isConnected}
        />
        {isConnected && selectedDevice?.vendorId != null && (
          <Text style={s.vidBadge}>
            VID:{selectedDevice.vendorId.toString(16).toUpperCase()}
          </Text>
        )}

        <View style={{ flex: 1 }} />

        {showNodeId && (
          <>
            <Text style={s.lbl}>Node</Text>
            <TextInput
              style={s.nodeInput}
              value={nodeId}
              onChangeText={onNodeIdChange}
              keyboardType="numeric"
              maxLength={3}
              selectTextOnFocus
            />
          </>
        )}

        <Pressable
          style={[
            s.connectBtn,
            {
              backgroundColor: isConnected ? `${Colors.primary}18` : `${Colors.tertiary}18`,
              borderColor:     isConnected ? `${Colors.primary}55` : `${Colors.tertiary}55`,
            },
          ]}
          onPress={handleConnect}
          disabled={isWorking}
        >
          {isConnecting
            ? <ActivityIndicator size="small" color={isConnected ? Colors.primary : Colors.tertiary} />
            : <MaterialCommunityIcons
                name={isConnected ? 'link-off' : 'link'}
                size={13}
                color={isConnected ? Colors.primary : Colors.tertiary}
              />}
          <Text style={[s.connectTxt, { color: isConnected ? Colors.primary : Colors.tertiary }]}>
            {isConnecting ? 'Connecting…' : isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: Colors.surfaceContainerLow,
    borderBottomWidth: Border.width,
    borderBottomColor: Border.color,
    paddingHorizontal: Spacing.panelPadding,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  lbl: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    fontSize: 9,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  noDevTxt: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    fontStyle: 'italic',
  },
  devChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: Border.width,
    borderColor: Border.color,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: 160,
    // Sharp corners
  },
  devChipSel: {
    backgroundColor: `${Colors.secondary}18`,
    borderColor: `${Colors.secondary}55`,
  },
  devDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  devChipTxt: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    fontSize: 9,
    flex: 1,
  },
  devChipTxtSel: {
    color: Colors.secondary,
  },
  devVid: {
    color: Colors.outlineVariant,
    fontSize: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: `${Colors.secondary}18`,
    borderWidth: Border.width,
    borderColor: `${Colors.secondary}55`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    // Sharp corners
  },
  scanTxt: {
    ...Typography.labelCaps,
    color: Colors.secondary,
    fontSize: 9,
  },
  vidBadge: {
    ...Typography.labelCaps,
    color: Colors.secondary,
    fontSize: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  nodeInput: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: Border.width,
    borderColor: Border.color,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    color: Colors.onSurface,
    fontSize: 11,
    width: 42,
    textAlign: 'center',
    // Sharp corners
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: Border.width,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    // Sharp corners
  },
  connectTxt: {
    ...Typography.labelCaps,
    fontSize: 10,
  },

  // Compact
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconBtn: {
    width: 26,
    height: 26,
    borderWidth: Border.width,
    borderColor: `${Colors.secondary}55`,
    backgroundColor: `${Colors.secondary}10`,
    alignItems: 'center',
    justifyContent: 'center',
    // Sharp corners
  },
});
