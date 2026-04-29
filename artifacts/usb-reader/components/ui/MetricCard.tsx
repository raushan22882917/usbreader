/**
 * MetricCard
 * Compact telemetry metric tile.
 * Uses data-mono for the value, label-caps for the label.
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Border } from '../../theme';

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface MetricCardProps {
  icon?: MCIcon;
  label: string;
  value: string;
  unit?: string;
  color?: string;
  style?: ViewStyle;
}

export function MetricCard({
  icon,
  label,
  value,
  unit,
  color = Colors.secondary,
  style,
}: MetricCardProps) {
  return (
    <View style={[s.card, { borderColor: `${color}40` }, style]}>
      {/* Top accent line */}
      <View style={[s.topLine, { backgroundColor: color }]} />
      {icon && (
        <View style={[s.iconBox, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={icon} size={14} color={color} />
        </View>
      )}
      <View style={s.valueRow}>
        <Text style={[s.value, { color }]}>{value}</Text>
        {unit && <Text style={s.unit}>{unit}</Text>}
      </View>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: Border.width,
    padding: Spacing.panelPadding,
    gap: Spacing.xs,
    alignItems: 'flex-start',
    // Sharp corners
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  iconBox: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  value: {
    ...Typography.dataMono,
    fontSize: 22,
    fontWeight: '700',
  },
  unit: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    fontSize: 10,
  },
  label: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    fontSize: 9,
  },
});
