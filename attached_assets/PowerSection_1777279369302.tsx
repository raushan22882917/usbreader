import React from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, useWindowDimensions, PixelRatio } from 'react-native';
import Svg, { Rect, Path, Circle, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useVehicleData } from '../context/DataContext';

const MAX_KW = 150;

// ── Helpers ───────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ── Power Dial — same visual language as Speedometer ─────────
const PowerDial = ({ valueKw, size, hasData }: { valueKw: number; size: number; hasData: boolean }) => {
  const pct = Math.min(valueKw / MAX_KW, 1);
  // Needle sweeps -60° → +60° (same as speedometer)
  const needleAngle = -60 + pct * 120;
  const cx = 160, cy = 160, nr = 68;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip   = { x: cx + nr * Math.cos(rad),                          y: cy + nr * Math.sin(rad) };
  const base1 = { x: cx + 8 * Math.cos(rad + Math.PI / 2),            y: cy + 8 * Math.sin(rad + Math.PI / 2) };
  const base2 = { x: cx + 8 * Math.cos(rad - Math.PI / 2),            y: cy + 8 * Math.sin(rad - Math.PI / 2) };

  return (
    <Svg width={size} height={size} viewBox="0 0 320 320">
      <Defs>
        {/* Needle gradient: green → yellow (matches PowerSection palette) */}
        <LinearGradient id="pwrNeedleGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6EDCA1" />
          <Stop offset="1" stopColor="#FFC832" />
        </LinearGradient>
      </Defs>

      {/* ── Segment polygons (same layout as Speedometer) ── */}
      {/* Top: green (low power) */}
      <Path d="M90,40 L160,160 L230,40 Z" fill="#6EDCA1" />
      {/* Left: yellow-green */}
      <Path d="M160,160 L0,160 L90,40 Z" fill="#FFC832" />
      {/* Right: red (high power) */}
      <Path d="M160,160 L320,160 L230,40 Z" fill="#FF5023" />
      {/* Right arc: dark teal */}
      <Path
        d="M160,0 L160,40 C226.273,40 280,93.726 280,160 C280,226.274 226.273,280 160,280 L160,320 C248.365,320 320,248.366 320,160 C320,71.635 248.365,0 160,0 Z"
        fill="#1A4A3A"
      />
      {/* Left arc: darker teal */}
      <Path
        d="M40,160 C40,93.726 93.727,40 160,40 L160,0 C71.635,0 0,71.634 0,160 C0,248.366 71.635,320 160,320 L160,280 C93.727,280 40,226.274 40,160 Z"
        fill="#0F3028"
      />
      {/* Dark center circle (background) */}
      <Circle cx={cx} cy={cy} r={80} fill="rgba(21,25,27,1)" />

      {/* Live needle */}
      <Path
        d={`M ${tip.x} ${tip.y} L ${base1.x} ${base1.y} L ${base2.x} ${base2.y} Z`}
        fill="url(#pwrNeedleGrad)"
        opacity={0.95}
      />
      <Circle cx={cx} cy={cy} r={10} fill="rgba(21,25,27,1)" stroke="#6EDCA1" strokeWidth={2} />

      {/* Value */}
      <SvgText
        x={160} y={210}
        textAnchor="middle"
        fill={hasData ? "rgba(248,248,248,1)" : "rgba(107,114,128,1)"}
        fontSize={hasData ? 36 : 24}
        fontWeight="bold"
        fontFamily="Oswald"
      >
        {hasData ? valueKw.toFixed(1) : "No Data"}
      </SvgText>
      <SvgText
        x={160} y={232}
        textAnchor="middle"
        fill="rgba(140,142,142,1)"
        fontSize={14}
        fontFamily="Oswald"
      >
        kW  HV Power
      </SvgText>
    </Svg>
  );
};

// ── Status indicator pill ─────────────────────────────────────
type PillVariant = 'ok' | 'warn' | 'fault' | 'off';
const Pill = ({ label, variant }: { label: string; variant: PillVariant }) => {
  const colors: Record<PillVariant, { bg: string; border: string; text: string }> = {
    ok:    { bg: 'rgba(110,220,161,0.12)', border: 'rgba(110,220,161,0.5)', text: '#6EDCA1' },
    warn:  { bg: 'rgba(255,200,60,0.12)',  border: 'rgba(255,200,60,0.5)',  text: '#FFC83C' },
    fault: { bg: 'rgba(255,80,60,0.15)',   border: 'rgba(255,80,60,0.5)',   text: '#FF503C' },
    off:   { bg: 'rgba(51,56,58,0.4)',     border: 'rgba(51,56,58,0.8)',    text: 'rgba(100,102,102,1)' },
  };
  const c = colors[variant];
  return (
    <View style={[pillStyles.pill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <View style={[pillStyles.dot, { backgroundColor: c.text }]} />
      <Text style={[pillStyles.label, { color: c.text }]}>{label}</Text>
    </View>
  );
};
const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  label: { fontFamily: 'Oswald', fontSize: 10, fontWeight: 'bold' },
});

const BAR_H = 10;
const BAR_R = 5;

const MotorBar = ({ label, value, fontSize }: { label: string; value: number; fontSize: number }) => {
  const [width, setWidth] = React.useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const fillW = width * (value / 100);

  return (
    <View style={styles.motorRow}>
      <Text style={[styles.motorLabel, { fontSize }]}>{label}</Text>
      <View style={styles.barWrapper} onLayout={onLayout}>
        {width > 0 && (
          <Svg width={width} height={BAR_H}>
            <Rect x={0} y={0} width={width} height={BAR_H} rx={BAR_R} fill="rgba(51,56,58,1)" />
            <Rect x={0} y={0} width={fillW} height={BAR_H} rx={BAR_R} fill="rgba(110,220,161,1)" />
          </Svg>
        )}
      </View>
      <Text style={[styles.motorPct, { fontSize }]}>{value}%</Text>
    </View>
  );
};

const PowerSection: React.FC = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  const scale = PixelRatio.getFontScale();
  const isSmallScreen = screenWidth < 600;
  
  // Responsive sizing
  const dialSize = isLandscape ? Math.min(screenWidth * 0.12, 140) : Math.min(screenWidth * 0.25, 150);
  const fontSize = (base: number) => base / scale;

  const { data } = useVehicleData();
  
  // Show "No Data" when no vehicle data is available
  const hasData = data !== null;
  const motor = data?.motor ?? { rpm: 0, temp_c: 0, runtime: 0 };
  const dcdc = data?.dcdc ?? { voltage_v: 0, current_a: 0, temp_c: 0, ready: false, working: false, hvil_err: false, can_error: false, hard_fault: false, over_temperature: false };
  const bms = data?.bms ?? { soc: 0, pack_voltage_v: 0, pack_current_a: 0, pack_temp_c: 0, faults: {} };
  const charger = data?.charger ?? { status: 'Unknown', voltage_v: 0, current_a: 0, error_code: 0 };

  // Real power from HV bus: bat voltage * current (negative = discharging)
  const powerKw = hasData ? Math.abs((bms.pack_voltage_v * bms.pack_current_a) / 1000).toFixed(1) : "0.0";
  const dcVoltage = dcdc.voltage_v;
  const dcCurrent = dcdc.current_a;

  // Motor load % from rpm (max ~3000rpm)
  const motorLoadPct = hasData ? Math.min(Math.round((motor.rpm / 3000) * 100), 100) : 0;

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { fontSize: fontSize(isSmallScreen ? 20 : 24) }]}>Power</Text>

      <View style={styles.dialWrapper}>
        <PowerDial valueKw={parseFloat(powerKw)} size={dialSize} hasData={hasData} />
      </View>

      {/* Status indicators */}
      <View style={[styles.pillRow, { gap: isSmallScreen ? 3 : 5 }]}>
        <Pill label="DCDC RDY"  variant={dcdc.ready            ? 'ok'    : 'off'}   />
        <Pill label="DCDC WORK" variant={dcdc.working          ? 'ok'    : 'off'}   />
        <Pill label="HVIL"      variant={dcdc.hvil_err         ? 'fault' : 'ok'}    />
        <Pill label="CAN"       variant={dcdc.can_error        ? 'fault' : 'ok'}    />
      </View>
      <View style={[styles.pillRow, { gap: isSmallScreen ? 3 : 5 }]}>
        <Pill label="HARD FLT"  variant={dcdc.hard_fault       ? 'fault' : 'ok'}    />
        <Pill label="OVER TEMP" variant={dcdc.over_temperature ? 'warn'  : 'ok'}    />
        <Pill label="CHARGER"   variant={charger.error_code > 0 ? 'fault' : charger.status === 'Charging' ? 'ok' : 'off'} />
        <Pill label={`SOC ${bms.soc}%`} variant={bms.soc < 15 ? 'fault' : bms.soc < 30 ? 'warn' : 'ok'} />
      </View>

      <View style={styles.dividerH} />
      <MotorBar label="Motor Load" value={motorLoadPct} fontSize={fontSize(isSmallScreen ? 14 : 16)} />
      <MotorBar label="DC-DC Load" value={Math.min(Math.round((dcCurrent / 20) * 100), 100)} fontSize={fontSize(isSmallScreen ? 14 : 16)} />

      <View style={styles.dividerH} />
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { fontSize: fontSize(13) }]}>DC-DC</Text>
        <Text style={[styles.infoValue, { fontSize: fontSize(13) }]}>
          {hasData ? `${dcVoltage.toFixed(1)} V  ${dcCurrent.toFixed(1)} A` : 'No Data'}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { fontSize: fontSize(13) }]}>Motor RPM</Text>
        <Text style={[styles.infoValue, { fontSize: fontSize(13) }]}>
          {hasData ? String(motor.rpm) : 'No Data'}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { fontSize: fontSize(13) }]}>Motor Temp</Text>
        <Text style={[styles.infoValue, { fontSize: fontSize(13) }]}>
          {hasData ? `${motor.temp_c.toFixed(1)}°C` : 'No Data'}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { fontSize: fontSize(13) }]}>Runtime</Text>
        <Text style={[styles.infoValue, { fontSize: fontSize(13) }]}>
          {hasData ? `${Math.floor(motor.runtime / 3600)}h ${Math.floor((motor.runtime % 3600) / 60)}m` : 'No Data'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(21,25,27,1)',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: {
    color: 'rgba(162,163,163,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  dialWrapper: {
    alignItems: 'center',
    marginBottom: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 5,
  },
  dividerH: {
    height: 1,
    backgroundColor: 'rgba(51,56,58,1)',
    marginVertical: 10,
  },
  motorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  motorLabel: {
    color: 'rgba(185,186,185,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
  barWrapper: {
    flex: 1,
    height: BAR_H,
    justifyContent: 'center',
  },
  motorPct: {
    color: 'rgba(185,186,185,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    textAlign: 'right',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoLabel: {
    color: 'rgba(120,122,122,1)',
    fontFamily: 'Oswald',
  },
  infoValue: {
    color: 'rgba(210,211,211,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
});

export default PowerSection;
