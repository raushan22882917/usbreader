import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, {
  Path, Circle, Rect, Text as SvgText, Defs, LinearGradient, Stop, G, Line, Polygon,
} from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVehicleData } from '../context/DataContext';
import GlobalUsbStatusBar from './GlobalUsbStatusBar';

// ── helpers ───────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx: number, cy: number, r: number, a1: number, a2: number) {
  const s = polar(cx, cy, r, a1);
  const e = polar(cx, cy, r, a2);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

// ── RPM Gauge (Speedometer-style) ─────────────────────────────
const RpmGauge = ({ rpm }: { rpm: number }) => {
  const MAX = 3000;
  const pct = Math.min(rpm / MAX, 1);
  const needleAngle = -60 + pct * 120;
  const cx = 160, cy = 160, nr = 68;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip   = { x: cx + nr * Math.cos(rad), y: cy + nr * Math.sin(rad) };
  const b1    = { x: cx + 8 * Math.cos(rad + Math.PI / 2), y: cy + 8 * Math.sin(rad + Math.PI / 2) };
  const b2    = { x: cx + 8 * Math.cos(rad - Math.PI / 2), y: cy + 8 * Math.sin(rad - Math.PI / 2) };
  const color = pct < 0.6 ? '#6EDCA1' : pct < 0.85 ? '#FFC832' : '#FF503C';

  // tick marks at 0, 500, 1000, 1500, 2000, 2500, 3000
  const ticks = [0, 500, 1000, 1500, 2000, 2500, 3000];

  return (
    <Svg width={170} height={170} viewBox="0 0 320 320">
      <Defs>
        <LinearGradient id="rpmNeedle" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6EDCA1" />
          <Stop offset="1" stopColor={color} />
        </LinearGradient>
        <LinearGradient id="rpmBg1" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1A3A2A" />
          <Stop offset="1" stopColor="#0F2018" />
        </LinearGradient>
      </Defs>
      {/* Segments */}
      <Path d="M90,40 L160,160 L230,40 Z" fill="#6EDCA1" opacity={0.7} />
      <Path d="M160,160 L0,160 L90,40 Z" fill="#FFC832" opacity={0.7} />
      <Path d="M160,160 L320,160 L230,40 Z" fill="#FF503C" opacity={0.7} />
      <Path d="M160,0 L160,40 C226.273,40 280,93.726 280,160 C280,226.274 226.273,280 160,280 L160,320 C248.365,320 320,248.366 320,160 C320,71.635 248.365,0 160,0 Z" fill="#1A3A2A" />
      <Path d="M40,160 C40,93.726 93.727,40 160,40 L160,0 C71.635,0 0,71.634 0,160 C0,248.366 71.635,320 160,320 L160,280 C93.727,280 40,226.274 40,160 Z" fill="#0F2018" />
      <Circle cx={cx} cy={cy} r={80} fill="rgba(21,25,27,1)" />
      {/* Tick marks */}
      {ticks.map(v => {
        const a = -60 + (v / MAX) * 120;
        const pi = polar(cx, cy, 58, a);
        const po = polar(cx, cy, 72, a);
        return <Line key={v} x1={pi.x} y1={pi.y} x2={po.x} y2={po.y} stroke="rgba(80,82,82,1)" strokeWidth={2} />;
      })}
      {/* Needle */}
      <Path d={`M ${tip.x} ${tip.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`} fill="url(#rpmNeedle)" opacity={0.95} />
      <Circle cx={cx} cy={cy} r={10} fill="rgba(21,25,27,1)" stroke={color} strokeWidth={2} />
      {/* Labels */}
      <SvgText x={160} y={210} textAnchor="middle" fill="rgba(248,248,248,1)" fontSize={36} fontWeight="bold" fontFamily="Oswald">{rpm}</SvgText>
      <SvgText x={160} y={232} textAnchor="middle" fill="rgba(140,142,142,1)" fontSize={14} fontFamily="Oswald">RPM</SvgText>
    </Svg>
  );
};

// ── Temp arc gauge ────────────────────────────────────────────
const TempGauge = ({ temp, max, label, color }: { temp: number; max: number; label: string; color: string }) => {
  const S = 110, cx = 55, cy = 55, R = 42, stroke = 9;
  const pct = Math.min(temp / max, 1);
  const fillEnd = -135 + 270 * pct;
  return (
    <Svg width={S} height={S}>
      <Defs>
        <LinearGradient id={`tg${label}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.5" />
          <Stop offset="1" stopColor={color} />
        </LinearGradient>
      </Defs>
      <Path d={arcPath(cx, cy, R, -135, 135)} stroke="rgba(51,56,58,1)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
      {pct > 0 && <Path d={arcPath(cx, cy, R, -135, fillEnd)} stroke={`url(#tg${label})`} strokeWidth={stroke} fill="none" strokeLinecap="round" />}
      <SvgText x={cx} y={cy - 4} textAnchor="middle" fill="rgba(235,235,235,1)" fontSize={18} fontWeight="bold" fontFamily="Oswald">{temp.toFixed(0)}</SvgText>
      <SvgText x={cx} y={cy + 12} textAnchor="middle" fill="rgba(140,142,142,1)" fontSize={10} fontFamily="Oswald">°C</SvgText>
      <SvgText x={cx} y={cy + 26} textAnchor="middle" fill={color} fontSize={9} fontFamily="Oswald">{label}</SvgText>
    </Svg>
  );
};

// ── HV Rail bar ───────────────────────────────────────────────
const HvBar = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => {
  const pct = Math.min(value / max, 1);
  return (
    <View style={hv.row}>
      <Text style={hv.label}>{label}</Text>
      <View style={hv.track}>
        <View style={[hv.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[hv.val, { color }]}>{value.toFixed(1)}V</Text>
    </View>
  );
};
const hv = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { color: 'rgba(140,142,142,1)', fontFamily: 'Oswald', fontSize: 11, width: 52 },
  track: { flex: 1, height: 8, backgroundColor: 'rgba(51,56,58,1)', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  val: { fontFamily: 'Oswald', fontSize: 12, fontWeight: 'bold', width: 48, textAlign: 'right' },
});

// ── Relay grid ────────────────────────────────────────────────
const RelayGrid = ({ relays }: { relays: Record<string, boolean> }) => {
  const entries = Object.entries(relays);
  if (!entries.length) return <Text style={{ color: 'rgba(100,102,102,1)', fontFamily: 'Oswald', fontSize: 12 }}>No relay data</Text>;
  return (
    <View style={rg.grid}>
      {entries.map(([k, v]) => (
        <View key={k} style={[rg.cell, v ? rg.cellOn : rg.cellOff]}>
          <Svg width={16} height={16}>
            <Circle cx={8} cy={8} r={6} fill={v ? '#6EDCA1' : 'rgba(51,56,58,1)'} />
            {v && <Circle cx={8} cy={8} r={3} fill="rgba(21,25,27,1)" />}
          </Svg>
          <Text style={[rg.label, v ? rg.labelOn : rg.labelOff]}>{k.replace(/_/g, '\n').toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
};
const rg = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: 72, alignItems: 'center', gap: 4, borderRadius: 8, padding: 8, borderWidth: 1 },
  cellOn: { backgroundColor: 'rgba(110,220,161,0.1)', borderColor: 'rgba(110,220,161,0.4)' },
  cellOff: { backgroundColor: 'rgba(35,39,41,1)', borderColor: 'rgba(51,56,58,1)' },
  label: { fontFamily: 'Oswald', fontSize: 9, textAlign: 'center' },
  labelOn: { color: '#6EDCA1' },
  labelOff: { color: 'rgba(100,102,102,1)' },
});

// ── Runtime ring ──────────────────────────────────────────────
const RuntimeRing = ({ runtime }: { runtime: number }) => {
  const h = Math.floor(runtime / 3600);
  const m = Math.floor((runtime % 3600) / 60);
  const MAX_H = 500;
  const pct = Math.min(h / MAX_H, 1);
  const S = 100, cx = 50, cy = 50, R = 38, stroke = 8;
  const fillEnd = -135 + 270 * pct;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Svg width={S} height={S}>
        <Defs>
          <LinearGradient id="rtGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#50B4FF" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#50B4FF" />
          </LinearGradient>
        </Defs>
        <Path d={arcPath(cx, cy, R, -135, 135)} stroke="rgba(51,56,58,1)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {pct > 0 && <Path d={arcPath(cx, cy, R, -135, fillEnd)} stroke="url(#rtGrad)" strokeWidth={stroke} fill="none" strokeLinecap="round" />}
        <SvgText x={cx} y={cy - 4} textAnchor="middle" fill="rgba(235,235,235,1)" fontSize={16} fontWeight="bold" fontFamily="Oswald">{h}h</SvgText>
        <SvgText x={cx} y={cy + 12} textAnchor="middle" fill="rgba(140,142,142,1)" fontSize={10} fontFamily="Oswald">{m}m</SvgText>
      </Svg>
      <Text style={{ color: '#50B4FF', fontFamily: 'Oswald', fontSize: 10 }}>RUNTIME</Text>
    </View>
  );
};

// ── Main ──────────────────────────────────────────────────────
const MotorDiagPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { data } = useVehicleData();
  const motor = data?.motor ?? { rpm: 0, temp_c: 0, runtime: 0 };
  const dcdc  = data?.dcdc  ?? { voltage_v: 0, current_a: 0, temp_c: 0, ready: false, working: false, hvil_err: false, can_error: false, hard_fault: false, over_temperature: false };
  const hvRails = data?.hv  ?? { bat_plus_v: 0, fc_v: 0, sc_v: 0, pchg_v: 0, dcdc_v: 0, out_minus_v: 0, dsg_v: 0 };
  const relays  = data?.relays ?? {};

  const motorLoadPct = Math.min(Math.round((motor.rpm / 3000) * 100), 100);

  return (
    <View style={s.root}>
      <GlobalUsbStatusBar />
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFC832" />
        </TouchableOpacity>
        <Text style={s.title}>Motor & Drive</Text>
        <View style={[s.badge, { borderColor: motor.rpm > 0 ? '#6EDCA1' : 'rgba(51,56,58,1)' }]}>
          <Text style={[s.badgeText, { color: motor.rpm > 0 ? '#6EDCA1' : 'rgba(100,102,102,1)' }]}>
            {motor.rpm > 0 ? 'RUNNING' : 'IDLE'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* RPM + temps */}
        <View style={s.row}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Motor RPM</Text>
            <View style={{ alignItems: 'center' }}>
              <RpmGauge rpm={motor.rpm} />
            </View>
            <View style={{ alignItems: 'center', marginTop: -8 }}>
              <Text style={s.loadLabel}>Load: <Text style={{ color: motorLoadPct > 80 ? '#FF503C' : '#6EDCA1' }}>{motorLoadPct}%</Text></Text>
            </View>
          </View>
          <View style={[s.card, { gap: 12 }]}>
            <Text style={s.cardTitle}>Temperatures</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 }}>
              <TempGauge temp={motor.temp_c} max={120} label="Motor" color="#FF9811" />
              <TempGauge temp={dcdc.temp_c}  max={90}  label="DC-DC" color="#50B4FF" />
            </View>
            <RuntimeRing runtime={motor.runtime} />
          </View>
        </View>

        {/* HV Rails */}
        <View style={s.card}>
          <Text style={s.cardTitle}>HV Bus Rails</Text>
          <HvBar label="BAT+"   value={hvRails.bat_plus_v}  max={500} color="#6EDCA1" />
          <HvBar label="FC"     value={hvRails.fc_v}        max={500} color="#50B4FF" />
          <HvBar label="SC"     value={hvRails.sc_v}        max={500} color="#FFC832" />
          <HvBar label="PCHG"   value={hvRails.pchg_v}      max={500} color="#FF9811" />
          <HvBar label="DC-DC"  value={hvRails.dcdc_v}      max={60}  color="#FF6EB4" />
          <HvBar label="OUT-"   value={hvRails.out_minus_v} max={500} color="#A78BFA" />
          <HvBar label="DSG"    value={hvRails.dsg_v}       max={500} color="#50D8D7" />
        </View>

        {/* DC-DC status */}
        <View style={s.card}>
          <Text style={s.cardTitle}>DC-DC Converter</Text>
          <View style={s.dcdcRow}>
            <View style={s.dcdcStat}>
              <Text style={s.dcdcLabel}>Voltage</Text>
              <Text style={[s.dcdcVal, { color: '#50B4FF' }]}>{dcdc.voltage_v.toFixed(1)} V</Text>
            </View>
            <View style={s.dcdcStat}>
              <Text style={s.dcdcLabel}>Current</Text>
              <Text style={[s.dcdcVal, { color: '#FFC832' }]}>{dcdc.current_a.toFixed(1)} A</Text>
            </View>
            <View style={s.dcdcStat}>
              <Text style={s.dcdcLabel}>Power</Text>
              <Text style={[s.dcdcVal, { color: '#6EDCA1' }]}>{(dcdc.voltage_v * dcdc.current_a).toFixed(0)} W</Text>
            </View>
          </View>
          <View style={s.flagRow}>
            {[
              { k: 'Ready',    v: dcdc.ready,            ok: true  },
              { k: 'Working',  v: dcdc.working,          ok: true  },
              { k: 'HVIL Err', v: dcdc.hvil_err,         ok: false },
              { k: 'CAN Err',  v: dcdc.can_error,        ok: false },
              { k: 'Hard Flt', v: dcdc.hard_fault,       ok: false },
              { k: 'Over Tmp', v: dcdc.over_temperature, ok: false },
            ].map(({ k, v, ok }) => {
              const active = v;
              const color = ok ? (active ? '#6EDCA1' : 'rgba(80,82,82,1)') : (active ? '#FF503C' : '#6EDCA1');
              return (
                <View key={k} style={[s.flag, { borderColor: color + '66', backgroundColor: color + '18' }]}>
                  <View style={[s.flagDot, { backgroundColor: color }]} />
                  <Text style={[s.flagLabel, { color }]}>{k}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Relay grid */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Relay States</Text>
          <RelayGrid relays={relays} />
        </View>

      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(21,25,27,1)' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(51,56,58,1)', gap: 12 },
  backBtn: { padding: 4 },
  title: { flex: 1, color: 'rgba(235,235,235,1)', fontFamily: 'Oswald', fontSize: 22, fontWeight: 'bold' },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: 'Oswald', fontSize: 12, fontWeight: 'bold' },
  scroll: { padding: 14, gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, backgroundColor: 'rgba(28,32,34,1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(51,56,58,1)' },
  cardTitle: { color: 'rgba(200,201,201,1)', fontFamily: 'Oswald', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  loadLabel: { color: 'rgba(160,162,162,1)', fontFamily: 'Oswald', fontSize: 13 },
  dcdcRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dcdcStat: { flex: 1, backgroundColor: 'rgba(35,39,41,1)', borderRadius: 8, padding: 10, alignItems: 'center' },
  dcdcLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 10 },
  dcdcVal: { fontFamily: 'Oswald', fontSize: 18, fontWeight: 'bold' },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  flagDot: { width: 6, height: 6, borderRadius: 3 },
  flagLabel: { fontFamily: 'Oswald', fontSize: 10, fontWeight: 'bold' },
});

export default MotorDiagPage;
