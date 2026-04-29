/**
 * BottomNav — Industrial Tech OS
 * Utility footer for switching between system views.
 * Sharp corners, label-caps typography, functional color per tab.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useUsb } from '@/context/UsbContext';
import { Colors, Typography, Spacing, Border } from '../theme';

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TabDef {
  icon: MCIcon;
  activeIcon: MCIcon;
  label: string;
  href: string;
  color: string;
  isHome?: boolean;
}

const TABS: TabDef[] = [
  {
    icon: 'view-dashboard-outline',
    activeIcon: 'view-dashboard',
    label: 'Dashboard',
    href: '/',
    color: Colors.tertiary,
    isHome: true,
  },
  {
    icon: 'stethoscope',
    activeIcon: 'stethoscope',
    label: 'Diagnostics',
    href: '/diagnostics',
    color: Colors.primary,
  },
  {
    icon: 'file-code-outline',
    activeIcon: 'file-code',
    label: 'Decoder',
    href: '/decoder',
    color: Colors.secondary,
  },
  {
    icon: 'tune-variant',
    activeIcon: 'tune-variant',
    label: 'Inverter',
    href: '/inventor',
    color: Colors.onSurfaceVariant,
  },
  {
    icon: 'chart-timeline-variant',
    activeIcon: 'chart-timeline-variant',
    label: 'Monitor',
    href: '/monitor',
    color: Colors.secondary,
  },
  {
    icon: 'send-outline',
    activeIcon: 'send',
    label: 'Write',
    href: '/write',
    color: Colors.tertiary,
  },
  {
    icon: 'cog-outline',
    activeIcon: 'cog',
    label: 'Settings',
    href: '/settings',
    color: Colors.onSurfaceVariant,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { connectionStatus } = useUsb();
  const isConnected = connectionStatus === 'connected';

  return (
    <View style={s.bar}>
      {TABS.map((tab) => {
        const isActive = tab.isHome
          ? pathname === '/' || pathname === ''
          : pathname === tab.href;

        return (
          <Pressable
            key={tab.href}
            style={s.tabWrap}
            onPress={() => router.push(tab.href as any)}
          >
            <View
              style={[
                s.tab,
                isActive && {
                  backgroundColor: `${tab.color}18`,
                  borderColor: `${tab.color}55`,
                },
              ]}
            >
              {/* Active indicator line at top */}
              {isActive && (
                <View style={[s.activeBar, { backgroundColor: tab.color }]} />
              )}
              <View style={s.iconWrap}>
                <MaterialCommunityIcons
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={18}
                  color={isActive ? tab.color : Colors.onSurfaceVariant}
                />
                {/* Live connection dot on Dashboard */}
                {tab.isHome && (
                  <View
                    style={[
                      s.liveDot,
                      {
                        backgroundColor: isConnected
                          ? Colors.tertiary
                          : Colors.surfaceContainerHigh,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={[s.label, { color: isActive ? tab.color : Colors.onSurfaceVariant }]}>
                {tab.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 58,
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopWidth: Border.widthThick,
    borderTopColor: Border.color,
    paddingHorizontal: Spacing.xs,
  },
  tabWrap: {
    flex: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: Spacing.xs,
    borderWidth: Border.width,
    borderColor: 'transparent',
    // Sharp corners
  },
  activeBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.surfaceContainerLowest,
  },
  label: {
    ...Typography.labelCaps,
    fontSize: 8,
    letterSpacing: 0.5,
  },
});
