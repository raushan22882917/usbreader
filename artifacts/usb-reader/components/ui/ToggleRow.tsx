/**
 * ToggleRow
 * Heavy-duty toggle switch row.
 * Green = ON, neutral grey = OFF.
 */
import React from 'react';
import { StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, Border } from '../../theme';

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface ToggleRowProps {
  icon?: MCIcon;
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  style?: ViewStyle;
}

export function ToggleRow({
  icon,
  label,
  desc,
  value,
  onChange,
  last = false,
  style,
}: ToggleRowProps) {
  return (
    <View style={[s.row, last && s.last, style]}>
      {icon && (
        <MaterialCommunityIcons name={icon} size={14} color={Colors.onSurfaceVariant} />
      )}
      <View style={s.text}>
        <Text style={s.label}>{label}</Text>
        {desc && <Text style={s.desc}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChange(v);
        }}
        trackColor={{
          false: Colors.surfaceContainerHigh,
          true:  `${Colors.tertiary}66`,
        }}
        thumbColor={value ? Colors.tertiary : Colors.onSurfaceVariant}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: Border.width,
    borderBottomColor: Colors.surfaceContainerHigh,
  },
  last: {
    borderBottomWidth: 0,
  },
  text: {
    flex: 1,
  },
  label: {
    ...Typography.labelCaps,
    color: Colors.onSurface,
    fontSize: 10,
    marginBottom: 1,
  },
  desc: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
    fontSize: 9,
  },
});
