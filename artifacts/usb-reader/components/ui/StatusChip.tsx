/**
 * StatusChip
 * Small rectangular status indicator with optional pulse animation for live states.
 * Sharp corners per Industrial Tech OS spec.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme';

interface StatusChipProps {
  label: string;
  color?: string;
  bgColor?: string;
  pulse?: boolean;
  dot?: boolean;
  style?: ViewStyle;
}

export function StatusChip({
  label,
  color = Colors.secondary,
  bgColor,
  pulse = false,
  dot = true,
  style,
}: StatusChipProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) {
      opacity.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const resolvedBg = bgColor ?? `${color}18`;

  return (
    <View style={[s.chip, { backgroundColor: resolvedBg, borderColor: `${color}55` }, style]}>
      {dot && (
        <Animated.View style={[s.dot, { backgroundColor: color, opacity }]} />
      )}
      <Text style={[s.label, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    // Sharp corners — no borderRadius
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3, // LED dot stays circular
  },
  label: {
    ...Typography.labelCaps,
    fontSize: 9,
  },
});
