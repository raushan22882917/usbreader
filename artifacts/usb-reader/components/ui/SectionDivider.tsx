/**
 * SectionDivider
 * Horizontal rule with optional label — used to separate groups in panels.
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, Border } from '../../theme';

interface SectionDividerProps {
  label?: string;
  style?: ViewStyle;
}

export function SectionDivider({ label, style }: SectionDividerProps) {
  if (!label) {
    return <View style={[s.line, style]} />;
  }
  return (
    <View style={[s.row, style]}>
      <View style={s.line} />
      <Text style={s.label}>{label}</Text>
      <View style={s.line} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.sm,
  },
  line: {
    flex: 1,
    height: Border.width,
    backgroundColor: Border.color,
    marginVertical: Spacing.sm,
  },
  label: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    fontSize: 9,
  },
});
