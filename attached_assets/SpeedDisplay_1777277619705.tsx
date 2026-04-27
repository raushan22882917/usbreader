import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, PixelRatio } from 'react-native';
import Svg, {
  Path, Circle, Line, Text as SvgText, G, Defs, LinearGradient, Stop, Rect,
} from 'react-native-svg';
import { useVehicleData } from '../context/DataContext';
import { useDeviceLocation } from '../hooks/useDeviceLocation';

const GEARS_ROW1 = ['1', '2', '3', '4'];
const GEARS_ROW2 = ['F', 'N', 'R'];
const GEARS_ROW3 = ['H', 'N', 'L'];
const MAX_SPEED = 40;

// ── Helpers (used by Speedometer needle) ─────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ── Speedometer (SVG icon + live speed overlay) ──────────────
const Speedometer = ({ speed, size, hasData }: { speed: number; size: number; hasData: boolean }) => {
  const pct = Math.min(speed / MAX_SPEED, 1);
  const needleAngle = -60 + pct * 120;
  const cx = 160, cy = 160, nr = 68;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip = { x: cx + nr * Math.cos(rad), y: cy + nr * Math.sin(rad) };
  const base1 = { x: cx + 8 * Math.cos(rad + Math.PI / 2), y: cy + 8 * Math.sin(rad + Math.PI / 2) };
  const base2 = { x: cx + 8 * Math.cos(rad - Math.PI / 2), y: cy + 8 * Math.sin(rad - Math.PI / 2) };

  return (
    <Svg width={size} height={size} viewBox="0 0 320 320">
      {/* ── icon polygons ── */}
      <Defs>
        <LinearGradient id="needleGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6EDCA1" />
          <Stop offset="1" stopColor="#FFC832" />
        </LinearGradient>
      </Defs>

      {/* orange top triangle */}
      <Path d="M90,40 L160,160 L230,40 Z" fill="#FF9811" />
      {/* yellow left triangle */}
      <Path d="M160,160 L0,160 L90,40 Z" fill="#FFDA44" />
      {/* red right triangle */}
      <Path d="M160,160 L320,160 L230,40 Z" fill="#FF5023" />
      {/* blue right arc */}
      <Path
        d="M160,0 L160,40 C226.273,40 280,93.726 280,160 C280,226.274 226.273,280 160,280 L160,320 C248.365,320 320,248.366 320,160 C320,71.635 248.365,0 160,0 Z"
        fill="#006DF0"
      />
      {/* dark blue left arc */}
      <Path
        d="M40,160 C40,93.726 93.727,40 160,40 L160,0 C71.635,0 0,71.634 0,160 C0,248.366 71.635,320 160,320 L160,280 C93.727,280 40,226.274 40,160 Z"
        fill="#0052B4"
      />
      {/* white center circle */}
      <Circle cx={160} cy={160} r={80} fill="rgba(21,25,27,1)" />

      {/* blue needle shape (original) — hidden, replaced by live needle */}

      {/* Live needle */}
      <Path
        d={`M ${tip.x} ${tip.y} L ${base1.x} ${base1.y} L ${base2.x} ${base2.y} Z`}
        fill="url(#needleGrad)"
        opacity={0.95}
      />
      <Circle cx={cx} cy={cy} r={10} fill="rgba(21,25,27,1)" stroke="#6EDCA1" strokeWidth={2} />

      {/* Speed value */}
      <SvgText
        x={160} y={210}
        textAnchor="middle"
        fill={hasData ? "rgba(248,248,248,1)" : "rgba(107,114,128,1)"}
        fontSize={hasData ? 36 : 24}
        fontWeight="bold"
        fontFamily="Oswald"
      >
        {hasData ? speed.toFixed(1) : "No Data"}
      </SvgText>
      <SvgText
        x={160} y={232}
        textAnchor="middle"
        fill="rgba(140,142,142,1)"
        fontSize={14}
        fontFamily="Oswald"
      >
        km/h
      </SvgText>
    </Svg>
  );
};

// ── Gear Button Row ───────────────────────────────────────────
const GearRow = ({ items, active, onSelect }: { items: string[]; active: string; onSelect: (g: string) => void }) => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isSmall = width < 375;
  const isMedium = width >= 375 && width < 414;
  const isLarge = width >= 414 && width < 768;
  const isTablet = width >= 768;

  // Compact button sizing - much smaller heights
  const btnHeight = isSmall ? 28 : isMedium ? 32 : isLarge ? 36 : isTablet ? 44 : 34;
  const btnMinWidth = isSmall ? 24 : isMedium ? 28 : isLarge ? 32 : isTablet ? 44 : 30;

  // Tighter spacing
  const gap = isSmall ? 4 : isMedium ? 6 : isLarge ? 8 : 10;

  // Border radius
  const borderRadius = isSmall ? 4 : isTablet ? 10 : 6;

  // Font size
  const fontSize = isSmall ? 12 : isMedium ? 13 : isLarge ? 14 : isTablet ? 18 : 13;

  // Minimal padding
  const paddingH = isSmall ? 2 : isTablet ? 8 : 4;
  const paddingV = isSmall ? 1 : isTablet ? 4 : 2;

  return (
    <View style={[gearRowStyles.row, { gap }]}>
      {items.map((g) => (
        <TouchableOpacity
          key={g}
          style={[
            gearRowStyles.btn,
            g === active && gearRowStyles.btnActive,
            {
              height: btnHeight,
              minWidth: btnMinWidth,
              paddingHorizontal: paddingH,
              paddingVertical: paddingV,
              borderRadius: borderRadius,
            }
          ]}
          onPress={() => onSelect(g)}
          activeOpacity={0.7}
        >
          <Text style={[gearRowStyles.label, g === active && gearRowStyles.labelActive, { fontSize }]}>
            {g}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const gearRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  btn: {
    flex: 1,
    backgroundColor: 'rgba(35,39,41,1)',
    borderWidth: 1,
    borderColor: 'rgba(51,56,58,1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: 'rgba(110,220,161,1)',
    borderColor: 'rgba(110,220,161,1)',
  },
  label: {
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    color: 'rgba(160,162,162,1)',
  },
  labelActive: {
    color: 'rgba(21,25,27,1)',
  },
});

// ── Compass ───────────────────────────────────────────────────
const Compass = ({ heading, size }: { heading: number; size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <G rotation={heading} origin="12,12">
      <Path d="M23 12a11 11 0 1 1 -22 0 11 11 0 1 1 22 0z" fill="#95a5a6" transform="translate(0 1)" />
      <Path d="M23 12a11 11 0 1 1 -22 0 11 11 0 1 1 22 0z" fill="#bdc3c7" />
      <Path d="M20 12a8.5 9 0 1 1 -17 0 8.5 9 0 1 1 17 0z" fill="#3498db" transform="matrix(1.0588 0 0 1 -.17647 0)" />
      <Path d="M16 5l-6 7-2 9 6-7 2-9z" fill="#2980b9" />
      <Path d="M12 3c-4.9706 0-9 4-9 9 0 0.1 0.0218 0.3 0.0312 0.5 0.2651-4.8 4.1698-8.5 8.9688-8.5s8.704 3.7 8.969 8.5c0.009-0.2 0.031-0.4 0.031-0.5 0-5-4.029-9-9-9z" fill="#2980b9" />
      <Path d="M14 13l-4-2 6-7z" fill="#e74c3c" />
      <Path d="M10 11l4 2-6 7z" fill="#ecf0f1" />
      <Path d="M12 1c-6.0751 0-11 4.9-11 11 0 6 4.9249 11 11 11 6.075 0 11-5 11-11 0-6.1-4.925-11-11-11zm0 2c4.971 0 9 4 9 9 0 4.9-4.029 9-9 9-4.9706 0-9-4.1-9-9 0-5 4.0294-9 9-9z" fill="#bdc3c7" />
      <Path d="M16 4l-4 8 2 1z" fill="#c0392b" />
      <Path d="M12 11.6c-0.552 0-1 0.4-1 1h2c0-0.6-0.448-1-1-1z" fill="#bdc3c7" />
      <Path d="M12 12l-4 8 6-7z" fill="#bdc3c7" />
      <Path d="M12 13.4c0.552 0 1-0.5 1-1h-2c0 0.5 0.448 1 1 1z" fill="#7f8c8d" />
    </G>
  </Svg>
);

// ── Main ──────────────────────────────────────────────────────
const SpeedDisplay: React.FC = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  const scale = PixelRatio.getFontScale();
  
  // Responsive sizing
  const isSmallScreen = screenWidth < 600;
  const speedometerSize = isLandscape ? Math.min(screenWidth * 0.12, 140) : Math.min(screenWidth * 0.25, 150);
  const compassSize = isLandscape ? Math.min(screenWidth * 0.08, 100) : Math.min(screenWidth * 0.18, 120);
  const fontSize = (base: number) => base / scale;
  
  const { data } = useVehicleData();
  const deviceLoc = useDeviceLocation();
  const [activeGear, setActiveGear] = React.useState('2');
  const [activeRow2, setActiveRow2] = React.useState('N');
  const [activeRow3, setActiveRow3] = React.useState('N');

  const hasData = data !== null || deviceLoc.fix;
  const speedKmh = deviceLoc.fix
    ? deviceLoc.speed_kmh
    : (data?.gps?.speed_kmh ?? 0);

  const heading = deviceLoc.fix
    ? deviceLoc.heading
    : (data?.gps?.heading ?? 0);

  const cardinalLabel = (h: number) => {
    if (h < 22.5 || h >= 337.5) return 'North';
    if (h < 67.5) return 'NE';
    if (h < 112.5) return 'East';
    if (h < 157.5) return 'SE';
    if (h < 202.5) return 'South';
    if (h < 247.5) return 'SW';
    if (h < 292.5) return 'West';
    return 'NW';
  };

  return (
    <View style={styles.container}>

      {/* Speed - takes more space */}
      <View style={[styles.section, { flex: 2 }]}>
        <Text style={[styles.sectionLabel, { fontSize: fontSize(17) }]}>Speed</Text>
        <View style={styles.centered}>
          <Speedometer speed={speedKmh} size={speedometerSize} hasData={hasData} />
        </View>
      </View>

      <View style={styles.dividerH} />

      {/* Gear - compact, only takes needed space */}
      <View style={[styles.section, { flex: 0, flexShrink: 1 }]}>
        <Text style={[styles.sectionLabel, { fontSize: fontSize(17) }]}>Gear</Text>
        <View style={[styles.gearStack, { gap: isSmallScreen ? 2 : isLandscape ? 4 : 3 }]}>
          <GearRow items={GEARS_ROW1} active={activeGear} onSelect={setActiveGear} />
          <GearRow items={GEARS_ROW2} active={activeRow2} onSelect={setActiveRow2} />
          <GearRow items={GEARS_ROW3} active={activeRow3} onSelect={setActiveRow3} />
        </View>
      </View>

      <View style={styles.dividerH} />

      {/* Direction - takes more space */}
      <View style={[styles.section, { flex: 1.5 }]}>
        <Text style={[styles.sectionLabel, { fontSize: fontSize(17) }]}>Direction</Text>
        <View style={[styles.directionRow, { gap: isSmallScreen ? 8 : 12 }]}>
          <Compass heading={heading} size={compassSize} />
          <View style={styles.directionInfo}>
            <Text style={[styles.headingValue, { fontSize: fontSize(28) }]}>{Math.round(heading)}°</Text>
            <Text style={[styles.headingCardinal, { fontSize: fontSize(16) }]}>{cardinalLabel(heading)}</Text>
          </View>
        </View>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(21,25,27,1)',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(51,56,58,1)',
    justifyContent: 'space-between',
  },
  section: { justifyContent: 'center' },
  centered: { alignItems: 'center' },
  sectionLabel: {
    color: 'rgba(165,166,167,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginBottom: 4,
    fontSize: 13,
  },
  dividerH: {
    height: 1,
    backgroundColor: 'rgba(51,56,58,1)',
    marginVertical: 6,
  },
  gearStack: {
    gap: 6,
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  directionInfo: {
    flex: 1,
  },
  headingValue: {
    color: '#FF503C',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
  headingCardinal: {
    color: '#6EDCA1',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
});

export default SpeedDisplay;
