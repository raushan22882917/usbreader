import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, PixelRatio } from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient, Stop, ClipPath, G } from 'react-native-svg';
import { useVehicleData } from '../context/DataContext';

// SOC → color
function socColor(soc: number) {
  if (soc > 60) return { top: '#6EDCA1', bottom: '#3AB87A' }; // green
  if (soc > 30) return { top: '#FFC832', bottom: '#E6A800' }; // yellow
  return { top: '#FF503C', bottom: '#CC2A1A' };               // red
}

// Battery SVG icon: viewBox 0 0 512 512
// Fill rect rises from bottom based on SOC (inside the body: y=40 to y=512)
const BODY_TOP = 40;
const BODY_BOT = 512;
const BODY_H = BODY_BOT - BODY_TOP; // 472

const BatteryIcon = ({ soc, size }: { soc: number; size: number }) => {
  const fillH = (soc / 100) * BODY_H;
  const fillY = BODY_BOT - fillH;
  const { top, bottom } = socColor(soc);
  const width = size;
  const height = size * 2;

  return (
    <Svg width={width} height={height} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
        {/* clip to battery body area */}
        <ClipPath id="bodyClip">
          <Rect x={91} y={BODY_TOP} width={330} height={BODY_H} />
        </ClipPath>
      </Defs>

      {/* Battery body outline (dark shell) */}
      <Path
        d="M420.457,46.9v458.886c0,3.448-2.759,6.207-6.131,6.207H97.674c-3.372,0-6.131-2.759-6.131-6.207V46.9c0-3.449,2.759-6.207,6.131-6.207h68.051V6.207C165.725,2.835,168.484,0,171.932,0h168.136c3.449,0,6.207,2.835,6.207,6.207v34.485h68.051C417.698,40.693,420.457,43.451,420.457,46.9z"
        fill="rgba(30,34,36,1)"
        stroke="rgba(70,75,77,1)"
        strokeWidth={6}
      />

      {/* SOC fill — clipped to body, rises from bottom */}
      <Rect
        x={91} y={fillY}
        width={330} height={fillH}
        fill="url(#fillGrad)"
        clipPath="url(#bodyClip)"
      />

      {/* Lightning bolt overlay */}
      <G clipPath="url(#bodyClip)">
        <Path
          d="M207.805,147.876 L317.749,149.381 L271.058,232.212 L328.287,229.196 L190.029,393.062 L228.887,277.391 L183.714,275.887 Z"
          fill="rgba(255,255,255,0.9)"
        />
      </G>
    </Svg>
  );
};

const BatterySection: React.FC = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  const scale = PixelRatio.getFontScale();
  const isSmallScreen = screenWidth < 600;
  
  // Responsive sizing
  const batteryIconSize = isLandscape ? Math.min(screenWidth * 0.06, 80) : Math.min(screenWidth * 0.15, 90);
  const fontSize = (base: number) => base / scale;
  const { data } = useVehicleData();
  
  // Show "No Data" when no vehicle data is available
  const hasData = data !== null;
  const soc = hasData ? data?.bms?.soc ?? 0 : 0;
  const pack_current_a = hasData ? data?.bms?.pack_current_a ?? 0 : 0;
  const pack_temp_c = hasData ? data?.bms?.pack_temp_c ?? 0 : 0;
  const estRange = hasData ? Math.round(soc * 0.5) : 0;
  const workHrs = hasData ? ((soc / 100) * 6).toFixed(1) : "0.0";
  const colors = hasData ? socColor(soc) : { top: '#6b7280', bottom: '#4b5563' };
  const { top } = colors;

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { fontSize: fontSize(isSmallScreen ? 18 : 22) }]}>Battery</Text>

      {/* Battery icon + SOC value side by side */}
      <View style={[styles.gaugeRow, { gap: isSmallScreen ? 10 : 16 }]}>
        <BatteryIcon soc={soc} size={batteryIconSize} />
        <View style={styles.socBox}>
          <Text style={[styles.socValue, { color: top, fontSize: fontSize(isSmallScreen ? 40 : 52) }]}>
            {hasData ? `${soc}%` : 'No Data'}
          </Text>
          <Text style={[styles.socLabel, { fontSize: fontSize(18) }]}>SOC</Text>
          <Text style={[styles.currentVal, { fontSize: fontSize(20) }]}>
            {hasData ? `${pack_current_a.toFixed(1)} A` : 'No Data'}
          </Text>
          <Text style={[styles.currentLabel, { fontSize: fontSize(12) }]}>Current</Text>
          <Text style={[styles.currentVal, { fontSize: fontSize(20) }]}>
            {hasData ? `${pack_temp_c.toFixed(1)}°C` : 'No Data'}
          </Text>
          <Text style={[styles.currentLabel, { fontSize: fontSize(12) }]}>Pack Temp</Text>
        </View>
      </View>

      <View style={styles.dividerH} />

      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={[styles.infoValue, { fontSize: fontSize(isSmallScreen ? 22 : 26) }]}>
            {hasData ? `${estRange} km` : 'No Data'}
          </Text>
          <Text style={[styles.infoLabel, { fontSize: fontSize(13) }]}>Est. Range</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoItem}>
          <Text style={[styles.infoValue, { fontSize: fontSize(isSmallScreen ? 22 : 26) }]}>
            {hasData ? `${workHrs} hrs` : 'No Data'}
          </Text>
          <Text style={[styles.infoLabel, { fontSize: fontSize(13) }]}>Work Time</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(21,25,27,1)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(51,56,58,1)',
  },
  title: {
    color: 'rgba(162,163,163,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginBottom: 14,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  socBox: {
    flex: 1,
    gap: 2,
  },
  socValue: {
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    lineHeight: 56,
  },
  socLabel: {
    color: 'rgba(140,142,142,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  currentVal: {
    color: 'rgba(210,211,211,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
  currentLabel: {
    color: 'rgba(120,122,122,1)',
    fontFamily: 'Oswald',
    marginBottom: 6,
  },
  dividerH: {
    height: 1,
    backgroundColor: 'rgba(51,56,58,1)',
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(51,56,58,1)',
  },
  infoValue: {
    color: 'rgba(220,221,221,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
  infoLabel: {
    color: 'rgba(120,122,122,1)',
    fontFamily: 'Oswald',
  },
});

export default BatterySection;
