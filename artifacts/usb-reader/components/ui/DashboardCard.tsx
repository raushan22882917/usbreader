/**
 * DashboardCard
 * Every card in the Industrial Tech OS has:
 *  - A title bar with label-caps font
 *  - A left accent bar in the card's color
 *  - An optional right slot (e.g. fullscreen toggle, badge)
 *  - Sharp (0px) corners
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Border } from '../../theme';

interface DashboardCardProps {
  title: string;
  accentColor?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  onFullscreen?: () => void;
}

export function DashboardCard({
  title,
  accentColor = Colors.secondary,
  right,
  children,
  style,
  contentStyle,
  onFullscreen,
}: DashboardCardProps) {
  return (
    <View style={[s.card, style]}>
      {/* Title bar */}
      <View style={s.titleBar}>
        {/* Left accent bar */}
        <View style={[s.accentBar, { backgroundColor: accentColor }]} />
        <Text style={s.title}>{title}</Text>
        {right}
        {onFullscreen && (
          <Pressable onPress={onFullscreen} style={s.fullscreenBtn} hitSlop={8}>
            <MaterialCommunityIcons
              name="fullscreen"
              size={14}
              color={Colors.onSurfaceVariant}
            />
          </Pressable>
        )}
      </View>
      {/* Content */}
      <View style={[s.content, contentStyle]}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: Border.width,
    borderColor: Border.color,
    overflow: 'hidden',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.panelPadding,
    paddingVertical: Spacing.sm,
    borderBottomWidth: Border.width,
    borderBottomColor: Border.color,
    backgroundColor: Colors.surfaceContainer,
  },
  accentBar: {
    width: 3,
    height: 14,
    marginRight: 2,
  },
  title: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    flex: 1,
  },
  fullscreenBtn: {
    padding: 2,
  },
  content: {
    padding: Spacing.panelPadding,
  },
});
