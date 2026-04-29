/**
 * DataRow
 * A single telemetry row: icon + label + value.
 * No vertical lines; subtle horizontal divider.
 * Uses label-caps for label, data-mono for value.
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Border } from '../../theme';

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface DataRowProps {
  icon?: MCIcon;
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  last?: boolean;
  style?: ViewStyle;
}

export function DataRow({
  icon,
  label,
  value,
  valueColor,
  mono = false,
  last = false,
  style,
}: DataRowProps) {
  return (
    <View style={[s.row, last && s.last, style]}>
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={12}
          color={valueColor ?? Colors.onSurfaceVariant}
          style={s.icon}
        />
      )}
      <Text style={s.label}>{label}</Text>
      <Text
        style={[
          mono ? s.valueMono : s.value,
          valueColor ? { color: valueColor } : {},
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: Border.width,
    borderBottomColor: Colors.surfaceContainerHigh,
    gap: Spacing.sm,
  },
  last: {
    borderBottomWidth: 0,
  },
  icon: {
    width: 14,
  },
  label: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    flex: 1,
    fontSize: 10,
  },
  value: {
    ...Typography.bodyMd,
    color: Colors.onSurface,
    fontSize: 11,
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },
  valueMono: {
    ...Typography.dataMono,
    color: Colors.onSurface,
    fontSize: 11,
    maxWidth: '55%',
    textAlign: 'right',
  },
});
