/**
 * Header — Industrial Tech OS
 * Slim global status bar. Sharp corners, no shadows.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDeviceScale } from '@/hooks/useDeviceScale';
import { Colors, Spacing, Border } from '../theme';

interface HeaderProps {
  showBackButton?: boolean;
  backRoute?: string;
  trailing?: React.ReactNode;
}

export function Header({ showBackButton = false, backRoute, trailing }: HeaderProps) {
  const router = useRouter();
  const { icon, scale } = useDeviceScale();
  const backIconSize = icon(18, 14);
  const logoHeight = Math.round(28 * Math.min(1, scale + 0.08));

  const handleBack = () => {
    if (backRoute) router.push(backRoute as any);
    else router.back();
  };

  return (
    <View style={s.header}>
      {showBackButton && (
        <Pressable onPress={handleBack} style={s.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={backIconSize} color={Colors.onSurfaceVariant} />
        </Pressable>
      )}
      <View style={[s.logoWrap, (showBackButton || trailing) && s.logoWrapOffset]}>
        <Image
          source={require('@/assets/full-logo-white.png')}
          style={[s.logo, { height: logoHeight, maxWidth: Math.round(180 * Math.min(1, scale + 0.08)) }]}
          resizeMode="contain"
        />
      </View>
      {trailing ? <View style={s.trailing}>{trailing}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: Spacing.gutter,
    backgroundColor: Colors.surfaceContainerLowest,
    borderBottomWidth: Border.width,
    borderBottomColor: Border.color,
  },
  backBtn: {
    position: 'absolute',
    left: Spacing.gutter,
    zIndex: 1,
  },
  logoWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapOffset: {
    paddingHorizontal: 72,
  },
  logo: {
    height: 28,
    maxWidth: 180,
  },
  trailing: {
    position: 'absolute',
    right: Spacing.gutter,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
