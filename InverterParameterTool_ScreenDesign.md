# Screen Design Specification: InverterParameterTool

## Visual Layout Overview

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back    Autonxt Inverter Parameter Tool    ● Connected │
├─────────────────────────────────────────────────────────────┤
│ Profile: [Sample Profile.json]           [Load JSON]       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Paste JSON profile here... {"profileName": "..."}      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ USB: [Dev 1] [Dev 2] [Scan] Node: [1] [Connect] [Read] [Apply] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────────────────────────────────┐ │
│ │ Groups      │ │ Parameter Comparison                    │ │
│ │ ┌─────────┐ │ │ ┌─────────────────────────────────────┐ │ │
│ │ │Search   │ │ │ │ Code │ Name │ File │ Curr │ Ovr │ Final │ │ │
│ │ └─────────┘ │ │ ├─────────────────────────────────────┤ │ │
│ │ ● All       │ │ │ F01.01│Run cmd│ 1    │ 1   │     │ 1     │ │ │
│ │ ○ F01 Run   │ │ │ F01.10│Max Freq│90   │85   │90   │90     │ │ │
│ │ ○ F02 Motor │ │ │ F02.01│Motor Type│2   │2    │     │2     │ │ │
│ │ ○ F03...    │ │ └─────────────────────────────────────┘ │ │
│ └─────────────┘ │ ┌─────────────────────────────────────┐ │ │
│                 │ │ Selected: F01.01 | Run command      │ │ │
│                 │ │ File: 1 | Current: 1 | Override: -   │ │ │
│                 │ └─────────────────────────────────────┘ │ │
│                 └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Manual Override: Code: [F01.01] Value: [1] [Add] [Clear] [Write] │
├─────────────────────────────────────────────────────────────┤
│ Status: Read successful: 3 parameter(s) updated              │
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
SafeAreaView (Container)
├── ScrollView (Main Content)
│   ├── Header Section
│   │   ├── Title Row
│   │   │   ├── Title Text
│   │   │   └── Status Badge
│   │   ├── Profile Row
│   │   │   ├── Label
│   │   │   ├── File Input (disabled)
│   │   │   └── Load JSON Button
│   │   ├── JSON Input Area
│   │   └── Connection Controls Row
│   │       ├── USB Device Selector
│   │       ├── Scan Button
│   │       ├── Node Input
│   │       ├── Connect/Disconnect Button
│   │       ├── Read Button
│   │       └── Apply Button
│   ├── Main Content Area
│   │   ├── Left Panel (Groups)
│   │   │   ├── Section Title
│   │   │   ├── Search Input
│   │   │   └── Groups List
│   │   │       ├── "All" Item
│   │   │       └── Dynamic Group Items
│   │   └── Right Panel (Parameters)
│   │       ├── Section Title
│   │       ├── Table Container
│   │       │   ├── Table Header
│   │       │   └── Parameter List
│   │       └── Detail Box
│   ├── Override Section
│   │   ├── Section Title
│   │   └── Override Controls
│   └── Status Bar
├── Back Button (Floating)
├── Loading Overlay (Conditional)
└── JSON Sidebar (Conditional)
```

## Detailed Layout Specifications

### Screen Dimensions & Breakpoints

```typescript
// Responsive breakpoints
const breakpoints = {
  small: { width: '< 400px' },    // Compact phones
  medium: { width: '400px - 768px' }, // Phones to tablets
  large: { width: '> 768px' }     // Tablets and above
};

// Layout calculations
const layout = {
  margins: {
    portrait: { horizontal: 10, vertical: 10 },
    landscape: { horizontal: 12, vertical: 8 }
  },
  panelSpacing: 8,
  buttonGap: 6,
  rowHeight: 40
};
```

### Header Section Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header Container (height: auto, padding: 12px)              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Title Row (flex-direction: row, justify: space-between)│ │
│ │ ┌─────────────────────┐ ┌─────────────────────────────┐ │ │
│ │ │ Autonxt Inverter... │ │ ● USB Connected             │ │ │
│ │ └─────────────────────┘ └─────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Profile Row (flex-direction: row, gap: 8px)            │ │
│ │ ┌──────┐ ┌─────────────────┐ ┌─────────────┐           │ │
│ │ │Label │ │ File Input      │ │ Load JSON   │           │ │
│ │ └──────┘ └─────────────────┘ └─────────────┘           │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ JSON Input (height: 50px, multiline)                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Connection Row (flex-wrap: wrap, gap: 6px)             │ │
│ │ ┌─────────┐ ┌─────┐ ┌─────┐ ┌─────────┐ ┌─────┐ ┌─────┐ │ │
│ │ │Devices  │ │Scan │ │Node │ │Connect  │ │Read │ │Apply│ │ │
│ │ └─────────┘ └─────┘ └─────┘ └─────────┘ └─────┘ └─────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Main Content Layout

#### Portrait Mode
```
┌─────────────────────────────────────────────────────────────┐
│ Main Content (flex-direction: row, height: 400px)          │
│ ┌─────────────┐ ┌─────────────────────────────────────────┐ │
│ │ Groups Panel│ │ Parameters Panel                        │ │
│ │ (30% width) │ │ (70% width)                            │ │
│ │ ┌─────────┐ │ │ ┌─────────────────────────────────────┐ │ │
│ │ │Search   │ │ │ │ Table (horizontal scroll)          │ │ │
│ │ └─────────┘ │ │ └─────────────────────────────────────┘ │ │
│ │ ● All       │ │ ┌─────────────────────────────────────┐ │ │
│ │ ○ Group 1   │ │ │ Detail Box (2x2 grid)               │ │ │
│ │ ○ Group 2   │ │ └─────────────────────────────────────┘ │ │
│ │ ...         │ │                                         │ │
│ └─────────────┘ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Landscape Mode
```
┌─────────────────────────────────────────────────────────────┐
│ Main Content (flex-direction: row, height: 300px)          │
│ ┌─────────────┐ ┌─────────────────────────────────────────┐ │
│ │ Groups Panel│ │ Parameters Panel                        │ │
│ │ (25% width) │ │ (75% width)                            │ │
│ │ max: 220px  │ │ min: 250px                             │ │
│ │ ┌─────────┐ │ │ ┌─────────────────────────────────────┐ │ │
│ │ │Search   │ │ │ │ Table (horizontal scroll)          │ │ │
│ │ └─────────┘ │ │ └─────────────────────────────────────┘ │ │
│ │ ● All       │ │ ┌─────────────────────────────────────┐ │ │
│ │ ○ Group 1   │ │ │ Detail Box (flexible layout)        │ │ │
│ │ ○ Group 2   │ │ └─────────────────────────────────────┘ │ │
│ │ ...         │ │                                         │ │
│ └─────────────┘ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Parameter Table Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Table Container (horizontal scroll)                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Header Row (height: 30px, border-bottom)               │ │
│ │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │ │
│ │ │Code │Name │File │Curr │Ovr  │Final│Unit │Status│ │ │
│ │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Parameter Rows (height: 28px each)                     │ │
│ │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │ │
│ │ │F01.01│Run cmd│ 1  │ 1  │     │ 1  │    │Same │ │ │
│ │ │(green)      │    │    │     │    │    │     │ │ │
│ │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │ │
│ │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │ │
│ │ │F01.10│Max Freq│90  │85  │90   │90  │Hz  │Changed│ │ │
│ │ │(yellow)     │    │    │90   │    │    │     │ │ │
│ │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Detail Box Layout

#### Portrait Mode (2x2 Grid)
```
┌─────────────────────────────────────────────────────────────┐
│ Detail Box (padding: 12px)                                 │
│ ┌─────────────────┐ ┌─────────────────┐                     │
│ │ Selected Code   │ │ Selected Name   │                     │
│ │ F01.01          │ │ Run command     │                     │
│ └─────────────────┘ └─────────────────┘                     │
│ ┌─────────────────┐ ┌─────────────────┐                     │
│ │ File Value      │ │ Current Value   │                     │
│ │ 1               │ │ 1               │                     │
│ └─────────────────┘ └─────────────────┘                     │
│ ┌─────────────────┐ ┌─────────────────┐                     │
│ │ Override Value  │ │ Final Value     │                     │
│ │ -               │ │ 1               │                     │
│ └─────────────────┘ └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

#### Landscape Mode (Flexible Layout)
```
┌─────────────────────────────────────────────────────────────┐
│ Detail Box (flex-direction: row, flex-wrap: wrap)          │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│ │ Selected:   │ │ File: 1     │ │ Current: 1   │ │ Final: 1│ │
│ │ F01.01      │ │             │ │             │ │         │ │
│ │ Run command │ │ Override: - │ │             │ │         │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Visual Design System

### Color Palette
```css
/* Background Colors */
--bg-primary: #0b1020;        /* Main screen background */
--bg-panel: #111827;          /* Panel backgrounds */
--bg-input: #0b1220;          /* Input field backgrounds */
--bg-overlay: rgba(0,0,0,0.7);/* Loading overlay */

/* Status Colors */
--status-connected: #22c55e;  /* Green for connected */
--status-disconnected: #f87171; /* Red for disconnected */
--status-same: #0f2f1f;       /* Green background for same values */
--status-changed: #3a2f0b;    /* Yellow background for changed */
--status-override: #0f2742;    /* Blue background for override */

/* Action Colors */
--primary: #2563eb;            /* Primary buttons */
--success: #059669;            /* Success actions (Scan) */
--secondary: #475569;          /* Secondary buttons */
--ghost: #1e293b;             /* Ghost buttons */

/* Text Colors */
--text-primary: #f8fafc;       /* Main titles */
--text-secondary: #e5e7eb;     /* Regular text */
--text-muted: #94a3b8;         /* Labels and hints */
--text-disabled: #6b7280;      /* Disabled text */

/* Border Colors */
--border-default: #1f2937;     /* Panel borders */
--border-input: #334155;       /* Input borders */
--border-focus: #3b82f6;       /* Focus states */
```

### Typography Scale
```css
/* Font Sizes */
--font-xs: 10px;    /* Table text */
--font-sm: 11px;    /* Button text, status */
--font-base: 12px;  /* Labels, inputs */
--font-md: 13px;    /* Section titles */
--font-lg: 16px;    /* Sidebar titles */
--font-xl: 18px;    /* Main title */

/* Font Weights */
--weight-normal: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;

/* Line Heights */
--leading-tight: 1.2;
--leading-normal: 1.4;
--leading-relaxed: 1.6;
```

### Spacing System
```css
/* Base spacing unit: 4px */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;

/* Component-specific spacing */
--panel-padding: var(--space-3);
--button-padding: 6px 10px;
--input-padding: 6px 8px;
--gap-xs: var(--space-1);
--gap-sm: var(--space-2);
--gap-md: var(--space-3);
```

### Border Radius
```css
--radius-sm: 8px;   /* Small buttons, inputs */
--radius-md: 10px;  /* Standard buttons, inputs */
--radius-lg: 14px;  /* Detail boxes */
--radius-xl: 16px;  /* Main panels */
```

## Component Specifications

### Button Variants
```css
/* Primary Button */
.btn-primary {
  background: var(--primary);
  color: white;
  padding: var(--button-padding);
  border-radius: var(--radius-md);
  font-weight: var(--weight-semibold);
  font-size: var(--font-sm);
}

/* Ghost Button */
.btn-ghost {
  background: var(--ghost);
  color: var(--text-secondary);
  border: 1px solid var(--border-input);
  padding: var(--button-padding);
  border-radius: var(--radius-md);
  font-weight: var(--weight-semibold);
  font-size: var(--font-sm);
}

/* Success Button */
.btn-success {
  background: var(--success);
  color: white;
  padding: var(--button-padding);
  border-radius: var(--radius-sm);
  font-weight: var(--weight-semibold);
  font-size: var(--font-sm);
}
```

### Input Field Styles
```css
.input-field {
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: var(--radius-md);
  padding: var(--input-padding);
  color: var(--text-secondary);
  font-size: var(--font-base);
}

.input-field:focus {
  border-color: var(--border-focus);
}

.input-field:disabled {
  color: var(--text-disabled);
}
```

### Panel Styles
```css
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--panel-padding);
}

.panel-header {
  font-size: var(--font-md);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}
```

## Responsive Behavior

### Media Queries
```css
/* Portrait Mode */
@media (orientation: portrait) {
  .main-content {
    flex-direction: column;
    height: auto;
  }
  
  .left-panel {
    width: 100%;
    height: 200px;
  }
  
  .right-panel {
    width: 100%;
    height: 400px;
  }
}

/* Landscape Mode */
@media (orientation: landscape) {
  .main-content {
    flex-direction: row;
    height: 300px;
  }
  
  .left-panel {
    width: 25%;
    max-width: 220px;
  }
  
  .right-panel {
    width: 75%;
    min-width: 250px;
  }
}

/* Small Screens */
@media (max-width: 400px) {
  .connection-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .override-row {
    flex-direction: column;
  }
  
  .button {
    width: 100%;
  }
}
```

### Adaptive Column Widths
```typescript
const getColumnWidths = (screenWidth: number, isLandscape: boolean) => {
  const baseWidth = Math.max(
    screenWidth * (isLandscape ? 0.08 : 0.12), 
    60
  );
  
  return {
    code: baseWidth,
    name: baseWidth * 2,
    value: baseWidth * 1.2,
    unit: baseWidth * 0.8,
    status: baseWidth
  };
};
```

## Animation and Transitions

### Loading States
```css
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-overlay);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

### Sidebar Animation
```css
.json-sidebar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-default);
  padding: var(--space-4);
  z-index: 100;
  transform: translateX(100%);
  transition: transform 0.3s ease-in-out;
}

.json-sidebar.open {
  transform: translateX(0);
}
```

### Button Interactions
```css
.button {
  transition: all 0.2s ease;
}

.button:active {
  transform: scale(0.98);
  opacity: 0.8;
}

.button:disabled {
  opacity: 0.5;
  transform: none;
}
```

## Accessibility Specifications

### Touch Targets
- Minimum touch target size: 44px × 44px
- Spacing between touch targets: minimum 8px
- High contrast borders for all interactive elements

### Screen Reader Support
```jsx
// Example accessible button
<TouchableOpacity
  accessible={true}
  accessibilityLabel="Connect to USB device"
  accessibilityRole="button"
  accessibilityState={{ disabled: !deviceId }}
>
  <Text>Connect</Text>
</TouchableOpacity>

// Example accessible table
<FlatList
  accessibilityLabel="Parameter list"
  accessibilityRole="list"
  data={parameters}
  renderItem={({ item }) => (
    <View
      accessible={true}
      accessibilityLabel={`Parameter ${item.code}: ${item.name}, current value ${item.current_value}`}
      accessibilityRole="listitem"
    >
      {/* Parameter content */}
    </View>
  )}
/>
```

### Focus Management
- Logical tab order through all interactive elements
- Visible focus indicators for keyboard navigation
- Focus trapping in modal/sidebar

This comprehensive screen design specification provides complete visual and interaction guidelines for implementing the InverterParameterTool with proper responsive behavior, accessibility, and user experience considerations.
