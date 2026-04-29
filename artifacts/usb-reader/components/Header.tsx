/**
 * Header — Industrial Tech OS
 * Slim global status bar. Sharp corners, no shadows.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Border } from '../theme';

interface HeaderProps {
  showBackButton?: boolean;
  backRoute?: string;
}

export function Header({ showBackButton = false, backRoute }: HeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backRoute) router.push(backRoute as any);
    else router.back();
  };

  return (
    <View style={s.header}>
      {showBackButton && (
        <Pressable onPress={handleBack} style={s.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={Colors.onSurfaceVariant} />
        </Pressable>
      )}
      <View style={s.logoWrap}>
        <Image
          source={require('@/assets/full-logo-white.png')}
          style={s.logo}
          resizeMode="contain"
        />
      </View>
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
  logo: {
    height: 28,
    maxWidth: 180,
  },
});
