import React, { useRef, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Svg, {
  Path, Circle, Rect, Text as SvgText, Defs, LinearGradient, Stop, G, Line,
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

// ── Health ring ───────────────────────────────────────────────
const HealthRing = ({ pct, label, color, size = 90 }: { pct: number; label: string; color: string; size?: number }) => {
  const cx = size / 2, cy = size / 2, R = size / 2 - 8, stroke = 7;
  const fillEnd = -135 + 270 * Math.min(pct, 1);
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`hr${label}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.4" />
            <Stop offset="1" stopColor={color} />
          </LinearGradient>
        </Defs>
        <Path d={arcPath(cx, cy, R, -135, 135)} stroke="rgba(51,56,58,1)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {pct > 0 && <Path d={arcPath(cx, cy, R, -135, fillEnd)} stroke={`url(#hr${label})`} strokeWidth={stroke} fill="none" strokeLinecap="round" />}
        <SvgText x={cx} y={cy + 5} textAnchor="middle" fill="rgba(235,235,235,1)" fontSize={16} fontWeight="bold" fontFamily="Oswald">{Math.round(pct * 100)}%</SvgText>
      </Svg>
      <Text style={{ color, fontFamily: 'Oswald', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>{label}</Text>
    </View>
  );
};

// ── Pulse dot (animated) ──────────────────────────────────────
const PulseDot = ({ color }: { color: string }) => {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: anim }} />;
};

// ── CAN log entry ─────────────────────────────────────────────
const CanEntry = ({ code, desc, canId }: { code: string; desc: string; canId: string }) => (
  <View style={can.row}>
    <View style={can.idBadge}>
      <Text style={can.idText}>{canId || '—'}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={can.code}>{code || '—'}</Text>
      <Text style={can.desc} numberOfLines={1}>{desc || 'No description'}</Text>
    </View>
    <PulseDot color="#50B4FF" />
  </View>
);
const can = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(40,44,46,1)' },
  idBadge: { backgroundColor: 'rgba(80,180,255,0.15)', borderWidth: 1, borderColor: 'rgba(80,180,255,0.4)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  idText: { color: '#50B4FF', fontFamily: 'Oswald', fontSize: 10, fontWeight: 'bold' },
  code: { color: 'rgba(235,235,235,1)', fontFamily: 'Oswald', fontSize: 12, fontWeight: 'bold' },
  desc: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 10 },
});

// ── Charger status card ───────────────────────────────────────
const ChargerCard = ({ status, voltage, current, errorCode }: {
  status: string; voltage: number; current: number; errorCode: number;
}) => {
  const isCharging = status === 'Charging';
  const hasError = errorCode > 0;
  const color = hasError ? '#FF503C' : isCharging ? '#50B4FF' : '#6EDCA1';
  const power = (voltage * current).toFixed(0);
  return (
    <View style={[ch.card, { borderColor: color + '55' }]}>
      <View style={ch.top}>
        <MaterialCommunityIcons name={isCharging ? 'battery-charging' : 'battery'} size={28} color={color} />
        <View style={{ flex: 1 }}>
          <Text style={[ch.status, { color }]}>{status}</Text>
          {hasError && <Text style={ch.error}>Error code: {errorCode}</Text>}
        </View>
        <PulseDot color={color} />
      </View>
      <View style={ch.stats}>
        <View style={ch.stat}>
          <Text style={ch.statLabel}>Voltage</Text>
          <Text style={[ch.statVal, { color: '#50B4FF' }]}>{voltage.toFixed(1)} V</Text>
        </View>
        <View style={ch.stat}>
          <Text style={ch.statLabel}>Current</Text>
          <Text style={[ch.statVal, { color: '#FFC832' }]}>{current.toFixed(1)} A</Text>
        </View>
        <View style={ch.stat}>
          <Text style={ch.statLabel}>Power</Text>
          <Text style={[ch.statVal, { color: '#6EDCA1' }]}>{power} W</Text>
        </View>
      </View>
    </View>
  );
};
const ch = StyleSheet.create({
  card: { backgroundColor: 'rgba(28,32,34,1)', borderRadius: 12, padding: 14, borderWidth: 1, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { fontFamily: 'Oswald', fontSize: 18, fontWeight: 'bold' },
  error: { color: '#FF503C', fontFamily: 'Oswald', fontSize: 11 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: 'rgba(35,39,41,1)', borderRadius: 8, padding: 8, alignItems: 'center' },
  statLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 10 },
  statVal: { fontFamily: 'Oswald', fontSize: 16, fontWeight: 'bold' },
});

// ── System timeline bar ───────────────────────────────────────
const TimelineBar = ({ items }: { items: { label: string; color: string; pct: number }[] }) => (
  <View style={{ gap: 6 }}>
    {items.map(({ label, color, pct }) => (
      <View key={label} style={tl.row}>
        <Text style={tl.label}>{label}</Text>
        <View style={tl.track}>
          <View style={[tl.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
        </View>
        <Text style={[tl.pct, { color }]}>{pct}%</Text>
      </View>
    ))}
  </View>
);
const tl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: 'rgba(140,142,142,1)', fontFamily: 'Oswald', fontSize: 11, width: 70 },
  track: { flex: 1, height: 10, backgroundColor: 'rgba(51,56,58,1)', borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  pct: { fontFamily: 'Oswald', fontSize: 11, fontWeight: 'bold', width: 36, textAlign: 'right' },
});

// ── GPS status card ───────────────────────────────────────────
const GpsCard = ({ lat, lng, heading, speed, fix }: {
  lat: number; lng: number; heading: number; speed: number; fix: boolean;
}) => {
  const color = fix ? '#6EDCA1' : '#FF503C';
  return (
    <View style={gps.card}>
      <View style={gps.top}>
        <MaterialCommunityIcons name="satellite-variant" size={24} color={color} />
        <Text style={[gps.status, { color }]}>{fix ? 'GPS LOCKED' : 'NO FIX'}</Text>
        <PulseDot color={color} />
      </View>
      <View style={gps.grid}>
        {[
          { l: 'Latitude',  v: lat.toFixed(5),          c: '#6EDCA1' },
          { l: 'Longitude', v: lng.toFixed(5),          c: '#6EDCA1' },
          { l: 'Heading',   v: `${Math.round(heading)}°`, c: '#FFC832' },
          { l: 'Speed',     v: `${speed.toFixed(1)} km/h`, c: '#50B4FF' },
        ].map(({ l, v, c }) => (
          <View key={l} style={gps.item}>
            <Text style={gps.itemLabel}>{l}</Text>
            <Text style={[gps.itemVal, { color: c }]}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
const gps = StyleSheet.create({
  card: { backgroundColor: 'rgba(28,32,34,1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(51,56,58,1)', gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { flex: 1, fontFamily: 'Oswald', fontSize: 16, fontWeight: 'bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flex: 1, minWidth: 120, backgroundColor: 'rgba(35,39,41,1)', borderRadius: 8, padding: 8 },
  itemLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 10 },
  itemVal: { fontFamily: 'Oswald', fontSize: 14, fontWeight: 'bold' },
});

// ── Main ──────────────────────────────────────────────────────
const SystemStatusPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { data, isConnected } = useVehicleData();
  const bms     = data?.bms     ?? { soc: 0, pack_voltage_v: 0, pack_current_a: 0, pack_temp_c: 0, faults: {} };
  const motor   = data?.motor   ?? { rpm: 0, temp_c: 0, runtime: 0 };
  const dcdc    = data?.dcdc    ?? { voltage_v: 0, current_a: 0, temp_c: 0, ready: false, working: false, hvil_err: false, can_error: false, hard_fault: false, over_temperature: false };
  const charger = data?.charger ?? { status: 'Unknown', voltage_v: 0, current_a: 0, error_code: 0 };
  const evcc    = data?.evcc    ?? { last_msg_code: '', description: '', last_can_id: '' };
  const gpsData = data?.gps     ?? { lat: 0, lng: 0, heading: 0, fix: false, speed_kmh: 0 };

  // Health scores
  const battHealth = Math.max(0, 100 - Object.values(bms.faults).filter(Boolean).length * 20);
  const motorHealth = Math.max(0, 100 - (motor.temp_c > 100 ? 40 : motor.temp_c > 80 ? 20 : 0) - (motor.rpm > 2800 ? 10 : 0));
  const dcdcHealth = Math.max(0, 100 - (dcdc.hvil_err ? 30 : 0) - (dcdc.can_error ? 30 : 0) - (dcdc.hard_fault ? 40 : 0) - (dcdc.over_temperature ? 20 : 0));
  const sysHealth = Math.round((battHealth + motorHealth + dcdcHealth) / 3);

  const timelineItems = [
    { label: 'Battery',  color: bms.soc > 30 ? '#6EDCA1' : '#FF503C', pct: bms.soc },
    { label: 'Motor',    color: motorHealth > 70 ? '#6EDCA1' : '#FFC832', pct: motorHealth },
    { label: 'DC-DC',    color: dcdcHealth > 70 ? '#6EDCA1' : '#FF503C', pct: dcdcHealth },
    { label: 'Charger',  color: charger.error_code > 0 ? '#FF503C' : '#50B4FF', pct: charger.error_code > 0 ? 0 : 100 },
  ];

  return (
    <View style={s.root}>
      <GlobalUsbStatusBar />
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#50B4FF" />
        </TouchableOpacity>
        <Text style={s.title}>System Status</Text>
        <View style={[s.badge, { borderColor: isConnected ? '#6EDCA1' : '#FF503C' }]}>
          <PulseDot color={isConnected ? '#6EDCA1' : '#FF503C'} />
          <Text style={[s.badgeText, { color: isConnected ? '#6EDCA1' : '#FF503C' }]}>
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Overall health rings */}
        <View style={s.card}>
          <Text style={s.cardTitle}>System Health</Text>
          <View style={s.ringsRow}>
            <HealthRing pct={sysHealth / 100}    label="OVERALL"  color={sysHealth > 70 ? '#6EDCA1' : sysHealth > 40 ? '#FFC832' : '#FF503C'} size={100} />
            <HealthRing pct={battHealth / 100}   label="BATTERY"  color="#6EDCA1" />
            <HealthRing pct={motorHealth / 100}  label="MOTOR"    color="#FFC832" />
            <HealthRing pct={dcdcHealth / 100}   label="DC-DC"    color="#50B4FF" />
          </View>
        </View>

        {/* System timeline */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Subsystem Status</Text>
          <TimelineBar items={timelineItems} />
        </View>

        {/* Charger */}
        <ChargerCard
          status={charger.status}
          voltage={charger.voltage_v}
          current={charger.current_a}
          errorCode={charger.error_code}
        />

        {/* EVCC / CAN */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>EVCC / CAN Bus</Text>
            <PulseDot color="#50B4FF" />
          </View>
          <CanEntry code={evcc.last_msg_code} desc={evcc.description} canId={evcc.last_can_id} />
          {!evcc.last_msg_code && (
            <Text style={s.noData}>No CAN messages received</Text>
          )}
        </View>

        {/* GPS */}
        <GpsCard
          lat={gpsData.lat}
          lng={gpsData.lng}
          heading={gpsData.heading}
          speed={gpsData.speed_kmh}
          fix={gpsData.fix}
        />

        {/* Connection info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Connection</Text>
          <View style={s.connRow}>
            <MaterialCommunityIcons name="usb" size={28} color={isConnected ? '#6EDCA1' : '#FF503C'} />
            <View style={{ flex: 1 }}>
              <Text style={[s.connStatus, { color: isConnected ? '#6EDCA1' : '#FF503C' }]}>
                {isConnected ? 'USB Serial Connected' : 'Not Connected'}
              </Text>
              <Text style={s.connSub}>
                {data ? `Last update: ${new Date(data.ts).toLocaleTimeString()}` : 'No data received'}
              </Text>
            </View>
            {isConnected && <PulseDot color="#6EDCA1" />}
          </View>
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
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: 'Oswald', fontSize: 12, fontWeight: 'bold' },
  scroll: { padding: 14, gap: 12 },
  card: { backgroundColor: 'rgba(28,32,34,1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(51,56,58,1)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { color: 'rgba(200,201,201,1)', fontFamily: 'Oswald', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  ringsRow: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 12 },
  noData: { color: 'rgba(100,102,102,1)', fontFamily: 'Oswald', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connStatus: { fontFamily: 'Oswald', fontSize: 15, fontWeight: 'bold' },
  connSub: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 11 },
});

export default SystemStatusPage;
