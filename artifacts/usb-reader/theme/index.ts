/**
 * Industrial Tech OS — Design System
 * Single source of truth for all colors, typography, spacing, and radii.
 */

// ─── Color Palette ────────────────────────────────────────────────────────────
export const Colors = {
  // Surfaces
  surface:                '#131314',
  surfaceDim:             '#131314',
  surfaceBright:          '#39393a',
  surfaceContainerLowest: '#0e0e0f',
  surfaceContainerLow:    '#1b1b1c',
  surfaceContainer:       '#1f1f20',
  surfaceContainerHigh:   '#2a2a2b',
  surfaceContainerHighest:'#353436',

  // On-surface
  onSurface:              '#e5e2e3',
  onSurfaceVariant:       '#e4bebc',
  inverseSurface:         '#e5e2e3',
  inverseOnSurface:       '#303031',

  // Outlines
  outline:                '#ab8987',
  outlineVariant:         '#5b403f',

  // Primary (Metallic Red)
  surfaceTint:            '#ffb3b1',
  primary:                '#ffb3b1',
  onPrimary:              '#680011',
  primaryContainer:       '#ff535b',
  onPrimaryContainer:     '#5b000e',
  inversePrimary:         '#bb152c',
  primaryFixed:           '#ffdad8',
  primaryFixedDim:        '#ffb3b1',
  onPrimaryFixed:         '#410007',
  onPrimaryFixedVariant:  '#92001c',

  // Secondary (Technical Blue)
  secondary:              '#94ccff',
  onSecondary:            '#003352',
  secondaryContainer:     '#0378b7',
  onSecondaryContainer:   '#f5f8ff',
  secondaryFixed:         '#cde5ff',
  secondaryFixedDim:      '#94ccff',
  onSecondaryFixed:       '#001d32',
  onSecondaryFixedVariant:'#004b74',

  // Tertiary (Muted Green-Grey)
  tertiary:               '#c0c9be',
  onTertiary:             '#2a322b',
  tertiaryContainer:      '#8a9389',
  onTertiaryContainer:    '#242c24',
  tertiaryFixed:          '#dce5d9',
  tertiaryFixedDim:       '#c0c9be',
  onTertiaryFixed:        '#161d16',
  onTertiaryFixedVariant: '#404940',

  // Error
  error:                  '#ffb4ab',
  onError:                '#690005',
  errorContainer:         '#93000a',
  onErrorContainer:       '#ffdad6',

  // Background
  background:             '#131314',
  onBackground:           '#e5e2e3',
  surfaceVariant:         '#353436',

  // Semantic aliases (used throughout components)
  /** Deep terminal / code background */
  terminal:               '#0a0a0b',
  /** Dim text / disabled */
  dim:                    '#5b403f',
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────
export const Typography = {
  headlineLg: {
    fontFamily: 'SpaceGrotesk_700Bold' as const,
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
    letterSpacing: -0.48,
  },
  headlineMd: {
    fontFamily: 'SpaceGrotesk_600SemiBold' as const,
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  bodyMd: {
    fontFamily: 'Inter_400Regular' as const,
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  labelCaps: {
    fontFamily: 'SpaceGrotesk_700Bold' as const,
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 16,
    letterSpacing: 0.88,
    textTransform: 'uppercase' as const,
  },
  dataMono: {
    fontFamily: 'SpaceGrotesk_500Medium' as const,
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 20,
    letterSpacing: 0.32,
  },
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const Spacing = {
  unit:         4,
  xs:           4,
  sm:           8,
  md:           12,
  gutter:       16,
  lg:           20,
  margin:       24,
  panelPadding: 12,
} as const;

// ─── Shape ────────────────────────────────────────────────────────────────────
/** Industrial Tech OS uses sharp (0px) corners everywhere except circular gauges */
export const Radius = {
  none:   0,
  /** Only for circular status LEDs / gauges */
  full:   9999,
} as const;

// ─── Elevation / Borders ─────────────────────────────────────────────────────
export const Border = {
  width:      1,
  widthThick: 2,
  color:      Colors.outlineVariant,
  colorMuted: Colors.surfaceContainerHigh,
} as const;
