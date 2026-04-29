# Industrial Tech OS — Design System Migration Guide

## ✅ Completed

### 1. Theme System (`theme/index.ts`)
- **Colors**: Full Industrial Tech OS palette with semantic aliases
- **Typography**: Space Grotesk + Inter with 5 predefined styles
- **Spacing**: 4px baseline grid
- **Radius**: Sharp (0px) corners everywhere except circular LEDs
- **Border**: 1px and 2px widths with proper colors

### 2. UI Component Library (`components/ui/`)
- **DashboardCard**: Title bar with accent bar, label-caps font, optional fullscreen toggle
- **StatusChip**: Rectangular status indicator with optional pulse animation
- **IndustrialButton**: Sharp-cornered button with glow effect on active state
- **DataRow**: Telemetry row with icon + label + value (label-caps + data-mono)
- **ToggleRow**: Heavy-duty toggle switch (green ON / grey OFF)
- **MetricCard**: Compact metric tile with top accent line
- **SectionDivider**: Horizontal rule with optional label

### 3. Shared Components (Rewritten)
- **Header**: Slim global status bar, sharp corners
- **BottomNav**: Utility footer with 7 tabs, active indicator line at top
- **UsbConnectionBar**: Full + compact modes, sharp corners, status chips

## 🔄 Migration Steps for Screens

### Replace Theme Object
**Before:**
```typescript
const T = {
  bg: "rgba(21,25,27,1)",
  panel: "rgba(26,30,32,1)",
  // ...
};
```

**After:**
```typescript
import { Colors, Typography, Spacing, Border } from '@/theme';
```

### Color Mapping
| Old | New |
|-----|-----|
| `T.bg` | `Colors.background` |
| `T.panel` | `Colors.surfaceContainerLow` |
| `T.card` | `Colors.surfaceContainer` |
| `T.border` | `Colors.outlineVariant` or `Border.color` |
| `T.text` | `Colors.onSurface` |
| `T.muted` | `Colors.onSurfaceVariant` |
| `T.dim` | `Colors.dim` |
| `T.green` | `Colors.tertiary` |
| `T.yellow` | `Colors.primaryFixedDim` |
| `T.orange` | `Colors.primary` |
| `T.red` | `Colors.error` |
| `T.blue` | `Colors.secondary` |
| `T.purple` | `Colors.inversePrimary` |
| `T.terminal` | `Colors.terminal` |

### Typography Mapping
| Old | New |
|-----|-----|
| `fontSize: 24, fontWeight: '700'` | `...Typography.headlineLg` |
| `fontSize: 18, fontWeight: '600'` | `...Typography.headlineMd` |
| `fontSize: 14, fontWeight: '400'` | `...Typography.bodyMd` |
| `fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase'` | `...Typography.labelCaps` |
| `fontSize: 16, fontWeight: '500', fontFamily: 'monospace'` | `...Typography.dataMono` |

### Spacing Mapping
| Old | New |
|-----|-----|
| `4` | `Spacing.xs` or `Spacing.unit` |
| `8` | `Spacing.sm` |
| `12` | `Spacing.md` or `Spacing.panelPadding` |
| `16` | `Spacing.gutter` |
| `20` | `Spacing.lg` |
| `24` | `Spacing.margin` |

### Border Mapping
| Old | New |
|-----|-----|
| `borderWidth: 1` | `borderWidth: Border.width` |
| `borderWidth: 2` | `borderWidth: Border.widthThick` |
| `borderColor: "rgba(51,56,58,1)"` | `borderColor: Border.color` |
| `borderRadius: 6` | Remove (sharp corners) |
| `borderRadius: 8` | Remove (sharp corners) |
| `borderRadius: 10` | Remove (sharp corners) |

### Component Replacements

#### Cards
**Before:**
```typescript
<View style={styles.card}>
  <Text style={styles.cardTitle}>Title</Text>
  {children}
</View>
```

**After:**
```typescript
import { DashboardCard } from '@/components/ui';

<DashboardCard title="TITLE" accentColor={Colors.secondary}>
  {children}
</DashboardCard>
```

#### Status Indicators
**Before:**
```typescript
<View style={[styles.badge, { backgroundColor: isConnected ? '#6EDCA1' : '#FF503C' }]}>
  <View style={[styles.dot, { backgroundColor: isConnected ? '#6EDCA1' : '#FF503C' }]} />
  <Text style={styles.badgeText}>{isConnected ? 'LIVE' : 'OFFLINE'}</Text>
</View>
```

**After:**
```typescript
import { StatusChip } from '@/components/ui';

<StatusChip
  label={isConnected ? 'LIVE' : 'OFFLINE'}
  color={isConnected ? Colors.tertiary : Colors.primary}
  pulse={isConnected}
/>
```

#### Buttons
**Before:**
```typescript
<Pressable style={[styles.btn, { backgroundColor: '#50B4FF' }]} onPress={handleAction}>
  <MaterialCommunityIcons name="magnify" size={14} color="white" />
  <Text style={styles.btnText}>Scan</Text>
</Pressable>
```

**After:**
```typescript
import { IndustrialButton } from '@/components/ui';

<IndustrialButton
  label="Scan"
  icon="magnify"
  color={Colors.secondary}
  onPress={handleAction}
/>
```

#### Data Rows
**Before:**
```typescript
<View style={styles.row}>
  <MaterialCommunityIcons name="thermometer" size={12} color="#50B4FF" />
  <Text style={styles.label}>Pack Temp</Text>
  <Text style={styles.value}>{packTemp}°C</Text>
</View>
```

**After:**
```typescript
import { DataRow } from '@/components/ui';

<DataRow
  icon="thermometer"
  label="Pack Temp"
  value={`${packTemp}°C`}
  valueColor={Colors.secondary}
/>
```

## 📋 Screen Update Checklist

For each screen file:
- [ ] Replace theme object import with `import { Colors, Typography, Spacing, Border } from '@/theme';`
- [ ] Update all color references (T.bg → Colors.background, etc.)
- [ ] Update all typography styles (fontSize/fontWeight → ...Typography.headlineLg, etc.)
- [ ] Update all spacing values (8 → Spacing.sm, etc.)
- [ ] Remove all `borderRadius` except for circular elements (LEDs, gauges)
- [ ] Replace custom cards with `<DashboardCard>`
- [ ] Replace custom status badges with `<StatusChip>`
- [ ] Replace custom buttons with `<IndustrialButton>`
- [ ] Replace custom data rows with `<DataRow>`
- [ ] Replace custom toggles with `<ToggleRow>`
- [ ] Update StyleSheet to use theme constants

## 🎨 Design Principles

1. **Sharp Corners**: No borderRadius except circular LEDs/gauges
2. **Functional Color**: Vibrant colors only for actionable elements or status
3. **Label-Caps**: All labels use uppercase with increased letter spacing
4. **Data-Mono**: All numeric data uses monospace font for tabular alignment
5. **Tonal Layers**: Depth via tonal fills, not shadows
6. **1px Borders**: All panels/cards have 1px solid borders
7. **Metallic Accents**: Accent bars use vertical gradients (future enhancement)
8. **High Contrast**: Dark background with bright text for legibility

## 🚀 Next Steps

1. Update all screen files in `app/(tabs)/`:
   - index.tsx (Dashboard)
   - settings.tsx
   - monitor.tsx
   - decoder.tsx
   - diagnostics.tsx
   - inventor.tsx
   - usbtest.tsx
   - write.tsx

2. Test on device to ensure:
   - All colors render correctly
   - Typography is legible
   - Sharp corners are consistent
   - Status chips pulse correctly
   - Buttons have glow effect on press

3. Add Space Grotesk font loading to app.json (currently using Inter only)

4. Consider adding metallic gradient utility for accent bars
