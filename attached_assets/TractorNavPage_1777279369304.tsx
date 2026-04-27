import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, {
  Path, Circle, Rect, Ellipse, Line, Polygon,
  Text as SvgText, Defs, LinearGradient, Stop, G, ClipPath,
} from 'react-native-svg';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVehicleData } from '../context/DataContext';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import GlobalUsbStatusBar from './GlobalUsbStatusBar';

// ── Dummy route data ──────────────────────────────────────────
const DUMMY_ROUTE = [
  { latitude: 37.7749, longitude: -122.4194 },
  { latitude: 37.7760, longitude: -122.4180 },
  { latitude: 37.7775, longitude: -122.4175 },
  { latitude: 37.7790, longitude: -122.4160 },
  { latitude: 37.7800, longitude: -122.4140 },
  { latitude: 37.7810, longitude: -122.4120 },
];
const DUMMY_DEST = { latitude: 37.7810, longitude: -122.4120 };
const DUMMY_SPEED = 28.4;
const DUMMY_HEADING = 42;
const DUMMY_SOC = 80;
const DUMMY_DIST = '645m';
const DUMMY_INSTRUCTION = 'In 645m take turning right';

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

// ── SVG Tractor top-view ──────────────────────────────────────
const TractorSvg = ({ heading }: { heading: number }) => (
  <Svg width={180} height={220} viewBox="0 0 180 220">
    <Defs>
      <LinearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#5A8A5A" />
        <Stop offset="1" stopColor="#3A6A3A" />
      </LinearGradient>
      <LinearGradient id="hoodGrad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#4A7A4A" />
        <Stop offset="1" stopColor="#2A5A2A" />
      </LinearGradient>
      <LinearGradient id="wheelGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#2A2A2A" />
        <Stop offset="1" stopColor="#111" />
      </LinearGradient>
      <LinearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#888" />
        <Stop offset="1" stopColor="#555" />
      </LinearGradient>
    </Defs>

    {/* ── Rear large wheels ── */}
    <Ellipse cx={28} cy={148} rx={26} ry={30} fill="url(#wheelGrad)" />
    <Ellipse cx={28} cy={148} rx={18} ry={21} fill="url(#rimGrad)" />
    <Ellipse cx={28} cy={148} rx={8}  ry={9}  fill="#222" />
    {/* tread lines */}
    {[-20,-10,0,10,20].map(a => {
      const p1 = polar(28, 148, 24, a);
      const p2 = polar(28, 148, 26, a);
      return <Line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#111" strokeWidth={3} />;
    })}

    <Ellipse cx={152} cy={148} rx={26} ry={30} fill="url(#wheelGrad)" />
    <Ellipse cx={152} cy={148} rx={18} ry={21} fill="url(#rimGrad)" />
    <Ellipse cx={152} cy={148} rx={8}  ry={9}  fill="#222" />
    {[-20,-10,0,10,20].map(a => {
      const p1 = polar(152, 148, 24, a);
      const p2 = polar(152, 148, 26, a);
      return <Line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#111" strokeWidth={3} />;
    })}

    {/* ── Front small wheels ── */}
    <Ellipse cx={38}  cy={62} rx={16} ry={18} fill="url(#wheelGrad)" />
    <Ellipse cx={38}  cy={62} rx={10} ry={12} fill="url(#rimGrad)" />
    <Ellipse cx={38}  cy={62} rx={4}  ry={5}  fill="#222" />

    <Ellipse cx={142} cy={62} rx={16} ry={18} fill="url(#wheelGrad)" />
    <Ellipse cx={142} cy={62} rx={10} ry={12} fill="url(#rimGrad)" />
    <Ellipse cx={142} cy={62} rx={4}  ry={5}  fill="#222" />

    {/* ── Main body ── */}
    <Rect x={50} y={90} width={80} height={80} rx={8} fill="url(#bodyGrad)" />

    {/* ── Hood / engine ── */}
    <Rect x={60} y={40} width={60} height={60} rx={6} fill="url(#hoodGrad)" />
    {/* hood vents */}
    {[50,58,66].map(y => (
      <Rect key={y} x={68} y={y} width={44} height={4} rx={2} fill="rgba(0,0,0,0.3)" />
    ))}

    {/* ── Cab / roof ── */}
    <Rect x={55} y={95} width={70} height={50} rx={6} fill="#4A7A4A" />
    {/* cab windows */}
    <Rect x={62} y={100} width={56} height={30} rx={4} fill="rgba(80,180,255,0.25)" stroke="rgba(80,180,255,0.5)" strokeWidth={1} />
    {/* cab roof */}
    <Rect x={58} y={92} width={64} height={10} rx={4} fill="#3A6A3A" />

    {/* ── Exhaust pipe ── */}
    <Rect x={100} y={28} width={8} height={20} rx={3} fill="#555" />
    <Ellipse cx={104} cy={28} rx={5} ry={3} fill="#333" />

    {/* ── Steering wheel hint ── */}
    <Circle cx={90} cy={118} r={10} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
    <Circle cx={90} cy={118} r={3}  fill="rgba(255,255,255,0.3)" />

    {/* ── Front implement (yellow) ── */}
    <Rect x={52} y={18} width={76} height={14} rx={4} fill="#D4A017" />
    {[60,72,84,96,108,118].map(x => (
      <Rect key={x} x={x} y={12} width={6} height={10} rx={2} fill="#B8860B" />
    ))}

    {/* ── Heading arrow overlay ── */}
    <G opacity={0.85}>
      <Path
        d={`M 90,8 L 82,22 L 88,22 L 88,32 L 92,32 L 92,22 L 98,22 Z`}
        fill="#50B4FF"
      />
    </G>
  </Svg>
);

// ── Arc Speedometer ───────────────────────────────────────────
const ArcSpeedometer = ({ speed, maxSpeed = 60 }: { speed: number; maxSpeed?: number }) => {
  const S = 200, cx = 100, cy = 110, R = 80, stroke = 14;
  const pct = Math.min(speed / maxSpeed, 1);
  const startDeg = -210, endDeg = 30, totalDeg = endDeg - startDeg;
  const fillEnd = startDeg + totalDeg * pct;
  const needleAngle = startDeg + totalDeg * pct;
  const needleTip = polar(cx, cy, R - 20, needleAngle);
  const needleBase = polar(cx, cy, 12, needleAngle + 180);

  const color = pct < 0.5 ? '#50B4FF' : pct < 0.8 ? '#6EDCA1' : '#FF503C';

  // tick marks
  const ticks = Array.from({ length: 13 }, (_, i) => i);

  return (
    <Svg width={S} height={S * 0.7}>
      <Defs>
        <LinearGradient id="speedArcGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor="#50B4FF" />
          <Stop offset="0.5" stopColor="#6EDCA1" />
          <Stop offset="1"   stopColor="#FF503C" />
        </LinearGradient>
        <LinearGradient id="speedNeedle" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" />
          <Stop offset="1" stopColor={color} />
        </LinearGradient>
      </Defs>

      {/* Track */}
      <Path d={arcPath(cx, cy, R, startDeg, endDeg)} stroke="rgba(40,44,46,1)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
      {/* Colored fill */}
      {pct > 0 && (
        <Path d={arcPath(cx, cy, R, startDeg, fillEnd)} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" />
      )}

      {/* Tick marks */}
      {ticks.map(i => {
        const a = startDeg + (totalDeg / 12) * i;
        const isMajor = i % 3 === 0;
        const inner = polar(cx, cy, R - (isMajor ? 10 : 6), a);
        const outer = polar(cx, cy, R + (isMajor ? 6 : 3), a);
        return (
          <Line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke={isMajor ? 'rgba(200,201,201,0.6)' : 'rgba(100,102,102,0.5)'}
            strokeWidth={isMajor ? 2 : 1} />
        );
      })}

      {/* Speed labels */}
      {[0, 20, 40, 60].map((v, i) => {
        const a = startDeg + (totalDeg / 3) * i;
        const pos = polar(cx, cy, R - 22, a);
        return (
          <SvgText key={v} x={pos.x} y={pos.y + 4} textAnchor="middle"
            fill="rgba(140,142,142,1)" fontSize={10} fontFamily="Oswald">{v}</SvgText>
        );
      })}

      {/* Needle */}
      <Line x1={needleBase.x} y1={needleBase.y} x2={needleTip.x} y2={needleTip.y}
        stroke="url(#speedNeedle)" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={8} fill="rgba(21,25,27,1)" stroke={color} strokeWidth={2} />

      {/* Value */}
      <SvgText x={cx} y={cy + 22} textAnchor="middle" fill="rgba(248,248,248,1)"
        fontSize={32} fontWeight="bold" fontFamily="Oswald">{speed.toFixed(1)}</SvgText>
      <SvgText x={cx} y={cy + 38} textAnchor="middle" fill="rgba(140,142,142,1)"
        fontSize={12} fontFamily="Oswald">km/h</SvgText>
    </Svg>
  );
};

// ── Status pill row ───────────────────────────────────────────
const StatusPills = ({ soc, heading, rpm }: { soc: number; heading: number; rpm: number }) => {
  const socColor = soc > 30 ? '#6EDCA1' : soc > 15 ? '#FFC832' : '#FF503C';
  return (
    <View style={pill.row}>
      <View style={[pill.item, { borderColor: socColor + '66' }]}>
        <MaterialCommunityIcons name="battery-charging-high" size={14} color={socColor} />
        <Text style={[pill.val, { color: socColor }]}>{soc}%</Text>
      </View>
      <View style={[pill.item, { borderColor: '#FFC83266' }]}>
        <MaterialCommunityIcons name="engine" size={14} color="#FFC832" />
        <Text style={[pill.val, { color: '#FFC832' }]}>{rpm} rpm</Text>
      </View>
      <View style={[pill.item, { borderColor: '#50B4FF66' }]}>
        <MaterialCommunityIcons name="compass" size={14} color="#50B4FF" />
        <Text style={[pill.val, { color: '#50B4FF' }]}>{Math.round(heading)}°</Text>
      </View>
    </View>
  );
};
const pill = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(35,39,41,1)' },
  val: { fontFamily: 'Oswald', fontSize: 11, fontWeight: 'bold' },
});

// ── Direction banner ──────────────────────────────────────────
const DirectionBanner = ({ dist, instruction }: { dist: string; instruction: string }) => (
  <View style={db.wrap}>
    <View style={db.iconBox}>
      <MaterialCommunityIcons name="arrow-top-right" size={28} color="#fff" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={db.dist}>{dist}</Text>
      <Text style={db.instr} numberOfLines={1}>{instruction}</Text>
    </View>
  </View>
);
const db = StyleSheet.create({
  wrap: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(18,20,22,0.92)', borderRadius: 14, padding: 12, gap: 12, zIndex: 10, borderWidth: 1, borderColor: 'rgba(80,180,255,0.3)' },
  iconBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(80,180,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  dist: { color: '#fff', fontFamily: 'Oswald', fontSize: 22, fontWeight: 'bold' },
  instr: { color: 'rgba(180,181,181,1)', fontFamily: 'Oswald', fontSize: 12 },
});

// ── Custom map marker (tractor arrow) ────────────────────────
const TractorMarker = ({ heading }: { heading: number }) => (
  <Svg width={36} height={36}>
    <Circle cx={18} cy={18} r={16} fill="rgba(80,180,255,0.9)" />
    <G rotation={heading} origin="18,18">
      <Path d="M18,6 L12,26 L18,22 L24,26 Z" fill="#fff" />
    </G>
  </Svg>
);

// ── Main ──────────────────────────────────────────────────────
const TractorNavPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { data } = useVehicleData();
  const deviceLoc = useDeviceLocation();
  const mapRef = useRef<MapView>(null);

  // Use real data if available, else dummy
  const speed   = deviceLoc.fix ? deviceLoc.speed_kmh : (data?.gps?.speed_kmh ?? DUMMY_SPEED);
  const heading = deviceLoc.fix ? deviceLoc.heading   : (data?.gps?.heading   ?? DUMMY_HEADING);
  const lat     = deviceLoc.fix ? deviceLoc.lat       : (data?.gps?.lat       ?? DUMMY_ROUTE[0].latitude);
  const lng     = deviceLoc.fix ? deviceLoc.lng       : (data?.gps?.lng       ?? DUMMY_ROUTE[0].longitude);
  const soc     = data?.bms?.soc ?? DUMMY_SOC;
  const rpm     = data?.motor?.rpm ?? 1240;

  // Animate map camera
  useEffect(() => {
    mapRef.current?.animateCamera(
      { center: { latitude: lat, longitude: lng }, heading, zoom: 16, pitch: 0 },
      { duration: 800 }
    );
  }, [lat, lng, heading]);

  return (
    <View style={s.root}>
      <GlobalUsbStatusBar />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#50B4FF" />
        </TouchableOpacity>
        <Text style={s.title}>Tractor Navigation</Text>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Main split layout */}
      <View style={s.body}>

        {/* ── LEFT PANEL ── */}
        <View style={s.leftPanel}>

          {/* Tractor SVG */}
          <View style={s.tractorWrap}>
            <TractorSvg heading={heading} />
            {/* Glow ring under tractor */}
            <View style={s.tractorGlow} />
          </View>

          {/* Speedometer */}
          <View style={s.speedWrap}>
            <ArcSpeedometer speed={speed} maxSpeed={60} />
          </View>

          {/* Status pills */}
          <StatusPills soc={soc} heading={heading} rpm={rpm} />

          {/* Gear indicator */}
          <View style={s.gearRow}>
            {['1','2','3','4'].map(g => (
              <View key={g} style={[s.gearBtn, g === '2' && s.gearBtnActive]}>
                <Text style={[s.gearLabel, g === '2' && s.gearLabelActive]}>{g}</Text>
              </View>
            ))}
            <View style={[s.gearBtn, s.gearBtnFwd]}>
              <Text style={[s.gearLabel, { color: '#6EDCA1' }]}>F</Text>
            </View>
          </View>

        </View>

        {/* ── RIGHT PANEL: Map ── */}
        <View style={s.mapPanel}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={s.map}
            initialCamera={{
              center: { latitude: lat, longitude: lng },
              heading,
              zoom: 16,
              pitch: 0,
            }}
            showsUserLocation={false}
            showsCompass={false}
            showsMyLocationButton={false}
            rotateEnabled
            mapType="standard"
            customMapStyle={darkMapStyle}
          >
            {/* Route polyline */}
            <Polyline
              coordinates={DUMMY_ROUTE}
              strokeColor="#50B4FF"
              strokeWidth={4}
              lineDashPattern={undefined}
            />
            {/* Destination marker */}
            <Marker coordinate={DUMMY_DEST} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={s.destMarker}>
                <MaterialCommunityIcons name="map-marker" size={32} color="#FF503C" />
              </View>
            </Marker>
            {/* Tractor position marker */}
            <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading}>
              <TractorMarker heading={0} />
            </Marker>
          </MapView>

          {/* Direction banner overlay */}
          <DirectionBanner dist={DUMMY_DIST} instruction={DUMMY_INSTRUCTION} />

          {/* Speed overlay bottom-left */}
          <View style={s.mapSpeedBadge}>
            <Text style={s.mapSpeedVal}>{speed.toFixed(0)}</Text>
            <Text style={s.mapSpeedUnit}>km/h</Text>
          </View>

          {/* Compass overlay bottom-right */}
          <View style={s.compassOverlay}>
            <Svg width={52} height={52}>
              <Circle cx={26} cy={26} r={24} fill="rgba(18,20,22,0.85)" stroke="rgba(51,56,58,1)" strokeWidth={1} />
              {/* N needle */}
              <G rotation={heading} origin="26,26">
                <Path d="M26,8 L22,26 L26,22 L30,26 Z" fill="#FF503C" />
                <Path d="M26,44 L22,26 L26,30 L30,26 Z" fill="rgba(140,142,142,1)" />
              </G>
              <Circle cx={26} cy={26} r={3} fill="#fff" />
              <SvgText x={26} y={6} textAnchor="middle" fill="#FF503C" fontSize={7} fontWeight="bold" fontFamily="Oswald">N</SvgText>
            </Svg>
            <Text style={s.compassDeg}>{Math.round(heading)}°</Text>
          </View>
        </View>

      </View>
    </View>
  );
};

// ── Dark map style ────────────────────────────────────────────
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a9bb0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3347' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4a6b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e2535' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e2535' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
];

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(14,16,18,1)' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(51,56,58,1)',
    backgroundColor: 'rgba(18,20,22,1)', gap: 12,
  },
  backBtn: { padding: 4 },
  title: { flex: 1, color: 'rgba(235,235,235,1)', fontFamily: 'Oswald', fontSize: 20, fontWeight: 'bold' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(110,220,161,0.1)', borderWidth: 1, borderColor: 'rgba(110,220,161,0.4)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6EDCA1' },
  liveText: { color: '#6EDCA1', fontFamily: 'Oswald', fontSize: 11, fontWeight: 'bold' },
  body: { flex: 1, flexDirection: 'row' },

  // Left panel
  leftPanel: {
    width: 220,
    backgroundColor: 'rgba(18,20,22,1)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(51,56,58,1)',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    justifyContent: 'center',
  },
  tractorWrap: { alignItems: 'center', position: 'relative' },
  tractorGlow: {
    position: 'absolute', bottom: -10, width: 120, height: 20,
    backgroundColor: 'rgba(110,220,161,0.15)',
    borderRadius: 60,
  },
  speedWrap: { alignItems: 'center', marginTop: -8 },
  gearRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  gearBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: 'rgba(35,39,41,1)',
    borderWidth: 1, borderColor: 'rgba(51,56,58,1)',
    alignItems: 'center', justifyContent: 'center',
  },
  gearBtnActive: { backgroundColor: 'rgba(80,180,255,0.2)', borderColor: '#50B4FF' },
  gearBtnFwd: { backgroundColor: 'rgba(110,220,161,0.15)', borderColor: 'rgba(110,220,161,0.5)' },
  gearLabel: { color: 'rgba(140,142,142,1)', fontFamily: 'Oswald', fontSize: 14, fontWeight: 'bold' },
  gearLabelActive: { color: '#50B4FF' },

  // Map panel
  mapPanel: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  destMarker: { alignItems: 'center' },
  mapSpeedBadge: {
    position: 'absolute', bottom: 16, left: 16,
    backgroundColor: 'rgba(18,20,22,0.9)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(80,180,255,0.4)',
  },
  mapSpeedVal: { color: '#fff', fontFamily: 'Oswald', fontSize: 28, fontWeight: 'bold', lineHeight: 30 },
  mapSpeedUnit: { color: 'rgba(140,142,142,1)', fontFamily: 'Oswald', fontSize: 11 },
  compassOverlay: {
    position: 'absolute', bottom: 16, right: 16,
    alignItems: 'center', gap: 2,
  },
  compassDeg: { color: 'rgba(200,201,201,1)', fontFamily: 'Oswald', fontSize: 10, fontWeight: 'bold' },
});

export default TractorNavPage;
