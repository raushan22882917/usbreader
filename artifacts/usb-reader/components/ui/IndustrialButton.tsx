/**
 * IndustrialButton
 * Rectangular button with 1px solid border.
 * Active state: border color bleeds into background (glow effect).
 * Sharp corners per Industrial Tech OS spec.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme';

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface IndustrialButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  color?: string;
  textColor?: string;
  ghost?: boolean;
  small?: boolean;
  loading?: boolean;
  icon?: MCIcon;
  badge?: number;
  style?: ViewStyle;
}

export function IndustrialButton({
  label,
  color = Colors.secondary,
  textColor,
  ghost = false,
  small = false,
  loading = false,
  icon,
  badge,
  disabled,
  style,
  ...rest
}: IndustrialButtonProps) {
  const isDisabled = disabled || loading;
  const resolvedTextColor = textColor ?? (ghost ? color : Colors.onSurface);

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        ghost
          ? {
              backgroundColor: pressed ? `${color}18` : 'transparent',
              borderColor: isDisabled ? Colors.outlineVariant : color,
            }
          : {
              backgroundColor: pressed
                ? `${color}cc`
                : isDisabled
                ? Colors.surfaceContainerHigh
                : `${color}22`,
              borderColor: isDisabled ? Colors.outlineVariant : color,
            },
        isDisabled && s.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <>
          {icon && (
            <MaterialCommunityIcons
              name={icon}
              size={small ? 12 : 14}
              color={isDisabled ? Colors.outlineVariant : resolvedTextColor}
            />
          )}
          <Text
            style={[
              s.label,
              small && s.labelSmall,
              { color: isDisabled ? Colors.outlineVariant : resolvedTextColor },
            ]}
          >
            {label}
          </Text>
          {!!badge && badge > 0 && (
            <View style={[s.badge, { backgroundColor: color }]}>
              <Text style={s.badgeText}>{badge}</Text>
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    // No borderRadius — sharp corners
  },
  btnSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...Typography.labelCaps,
    fontSize: 10,
  },
  labelSmall: {
    fontSize: 9,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: Colors.onPrimary,
    fontSize: 9,
    fontWeight: '800',
  },
});
