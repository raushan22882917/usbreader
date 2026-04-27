import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Svg, {
  Path, Circle, Line, Defs, LinearGradient, Stop,
  Text as SvgText,
} from "react-native-svg";
import { useUsb } from "@/context/UsbContext";

// ─── Theme ────────────────────────────────────────────────────
const T = {
  bg:      "rgba(21,25,27,1)",
  panel:   "rgba(26,30,32,1)",
  card:    "rgba(32,36,38,1)",
  border:  "rgba(51,56,58,1)",
  text:    "rgba(220,221,221,1)",
  muted:   "rgba(120,122,122,1)",
  dim:     "rgba(60,62,62,1)",
  green:   "#6EDCA1",
  greenDk: "rgba(40,60,48,1)",
  yellow:  "#FFC832",
  orange:  "#FF9811",
  red:     "#FF503C",
  blue:    "#50B4FF",
  blueDk:  "#0052B4",
};

type MCIcon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

// ─── Speedometer (exact style from reference SpeedDisplay.tsx) ─
function Speedometer({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) {
  const SIZE = 150;
  const pct = Math.min(value / max, 1);
  const needleAngle = -60 + pct * 120;
  const cx = SIZE / 2, cy = SIZE / 2, nr = SIZE * 0.27;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip = { x: cx + nr * Math.cos(rad), y: cy + nr * Math.sin(rad) };
  const b1  = { x: cx + 4 * Math.cos(rad + Math.PI / 2), y: cy + 4 * Math.sin(rad + Math.PI / 2) };
  const b2  = { x: cx + 4 * Math.cos(rad - Math.PI / 2), y: cy + 4 * Math.sin(rad - Math.PI / 2) };

  const VB = 320;
  const scale = SIZE / VB;

  return (
    <View style={{ alignItems: "center" }}>
      <Text style={ss.label}>{label}</Text>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${VB} ${VB}`}>
        {/* Colored triangle segments — exact from reference */}
        <Path d="M90,40 L160,160 L230,40 Z" fill="#FF9811" />
        <Path d="M160,160 L0,160 L90,40 Z" fill="#FFDA44" />
        <Path d="M160,160 L320,160 L230,40 Z" fill="#FF5023" />
        {/* Blue right arc */}
        <Path d="M160,0 L160,40 C226.273,40 280,93.726 280,160 C280,226.274 226.273,280 160,280 L160,320 C248.365,320 320,248.366 320,160 C320,71.635 248.365,0 160,0 Z" fill="#006DF0" />
        {/* Dark blue left arc */}
        <Path d="M40,160 C40,93.726 93.727,40 160,40 L160,0 C71.635,0 0,71.634 0,160 C0,248.366 71.635,320 160,320 L160,280 C93.727,280 40,226.274 40,160 Z" fill="#0052B4" />
        {/* Dark center */}
        <Circle cx={160} cy={160} r={82} fill="rgba(21,25,27,1)" />
        {/* Needle */}
        <Defs>
          <LinearGradient id="ngrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={T.green} />
            <Stop offset="1" stopColor={T.yellow} />
          </LinearGradient>
        </Defs>
        <Path d={`M ${tip.x} ${tip.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`} fill="url(#ngrad)" opacity={0.95} />
        <Circle cx={160} cy={160} r={10} fill="rgba(21,25,27,1)" stroke={T.green} strokeWidth={2} />
        {/* Value */}
        <SvgText x={160} y={208} textAnchor="middle" fill={T.text} fontSize={36} fontWeight="bold">{value.toFixed(1)}</SvgText>
        <SvgText x={160} y={228} textAnchor="middle" fill={T.muted} fontSize={14}>{unit}</SvgText>
      </Svg>
    </View>
  );
}
const ss = StyleSheet.create({
  label: { color: T.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 },
});

// ─── Gear Grid (exact from SpeedDisplay.tsx reference) ────────
const GEAR_ROWS = [
  ["1", "2", "3", "4"],
  ["F", "N", "R"],
  ["H", "N", "L"],
];

function GearGrid({ activeGear, onSelect }: { activeGear: string; onSelect: (g: string) => void }) {
  return (
    <View style={gg.wrap}>
      <Text style={gg.title}>Gear</Text>
      {GEAR_ROWS.map((row, ri) => (
        <View key={ri} style={gg.row}>
          {row.map((g) => {
            const isActive = g === activeGear;
            return (
              <Pressable key={`${ri}-${g}`} style={[gg.btn, isActive && gg.btnOn]}
                onPress={() => { Haptics.selectionAsync(); onSelect(g); }}>
                <Text style={[gg.btnTxt, isActive && gg.btnTxtOn]}>{g}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
const gg = StyleSheet.create({
  wrap: { gap: 3 },
  title: { color: T.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 3 },
  row: { flexDirection: "row", gap: 3 },
  btn: { flex: 1, backgroundColor: "rgba(35,39,41,1)", borderRadius: 5, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center", paddingVertical: 7 },
  btnOn: { backgroundColor: T.green, borderColor: T.green },
  btnTxt: { color: T.muted, fontSize: 13, fontWeight: "700" },
  btnTxtOn: { color: "rgba(21,25,27,1)" },
});

// ─── Compass (from reference CompassDial) ────────────────────
function Compass({ heading }: { heading: number }) {
  const S = 80, cx = 40, cy = 40, r = 33;
  const toXY = (a: number, radius: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };
  const tip = toXY(heading, r - 6);
  const tail = toXY(heading + 180, r - 12);
  const lN = toXY(heading - 12, r - 16);
  const rN = toXY(heading + 12, r - 16);
  const lS = toXY(heading + 168, r - 16);
  const rS = toXY(heading + 192, r - 16);

  const cardinalLabel = (h: number) => {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(h / 45) % 8];
  };

  return (
    <View style={cp.wrap}>
      <Text style={cp.title}>Direction</Text>
      <View style={cp.row}>
        <Svg width={S} height={S}>
          <Circle cx={cx} cy={cy} r={r} stroke={T.border} strokeWidth={1.5} fill="rgba(21,25,27,0.9)" />
          {["N","E","S","W"].map((c, i) => {
            const p = toXY(i * 90, r - S * 0.12);
            return <SvgText key={c} x={p.x} y={p.y + S * 0.075} textAnchor="middle"
              fill={c === "N" ? T.red : T.muted} fontSize={S * 0.14} fontWeight="bold">{c}</SvgText>;
          })}
          {/* North (red) */}
          <Path d={`M${tip.x},${tip.y} L${lN.x},${lN.y} L${tail.x},${tail.y} L${rN.x},${rN.y}Z`}
            fill={T.red} opacity={0.9} />
          {/* South (grey) */}
          <Path d={`M${tail.x},${tail.y} L${lS.x},${lS.y} L${tip.x},${tip.y} L${rS.x},${rS.y}Z`}
            fill="rgba(100,102,102,1)" opacity={0.9} />
          <Circle cx={cx} cy={cy} r={3} fill="rgba(235,235,235,1)" />
        </Svg>
        <View style={{ gap: 2 }}>
          <Text style={cp.deg}>{Math.round(heading)}</Text>
          <Text style={cp.degUnit}>°</Text>
          <Text style={cp.dir}>{cardinalLabel(heading)}</Text>
        </View>
      </View>
    </View>
  );
}
const cp = StyleSheet.create({
  wrap: { gap: 2 },
  title: { color: T.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  deg: { color: T.red, fontSize: 24, fontWeight: "700", lineHeight: 26 },
  degUnit: { color: T.muted, fontSize: 11 },
  dir: { color: T.green, fontSize: 12, fontWeight: "700" },
});

// ─── Satellite Map via Leaflet iframe ─────────────────────────
function createMapHtml(lat: number, lng: number, heading: number): string {
  return `<!DOCTYPE html><html style="margin:0;padding:0;height:100%;background:#0a0c0a">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  body,html{margin:0;padding:0;height:100%;overflow:hidden}
  #map{width:100%;height:100%;background:#0a0c0a}
  .leaflet-control-attribution{display:none}
  .tractor-marker{background:rgba(80,180,255,0.9);border-radius:50%;width:20px;height:20px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;transform-origin:center center}
</style>
</head>
<body>
<div id="map"></div>
<script>
try{
  var lat=${lat.toFixed(6)},lng=${lng.toFixed(6)},hdg=${Math.round(heading)};
  var map=L.map('map',{center:[lat,lng],zoom:18,zoomControl:false,attributionControl:false});
  
  // Satellite tiles (ESRI World Imagery - free, no API key)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
    maxZoom:19,
    errorTileUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  }).addTo(map);
  
  // Custom marker
  var icon=L.divIcon({
    html:'<div style="width:22px;height:22px;border-radius:50%;background:rgba(110,220,161,0.9);border:2.5px solid #fff;box-shadow:0 0 8px rgba(110,220,161,0.6)"></div>',
    className:'',iconSize:[22,22],iconAnchor:[11,11]
  });
  var marker=L.marker([lat,lng],{icon:icon}).addTo(map);
  
  // Accuracy ring
  var circle=L.circle([lat,lng],{radius:15,color:'rgba(110,220,161,0.5)',fillColor:'rgba(110,220,161,0.1)',fillOpacity:0.3,weight:1.5}).addTo(map);
  
  // Accept updates from parent window
  window.addEventListener('message',function(e){
    try{
      var d=JSON.parse(e.data);
      if(d.lat&&d.lng){
        marker.setLatLng([d.lat,d.lng]);
        circle.setLatLng([d.lat,d.lng]);
        map.panTo([d.lat,d.lng],{animate:true,duration:0.8});
      }
    }catch(err){}
  });
}catch(e){document.body.style.background='#0a0c0a';}
</script>
</body>
</html>`;
}

function MapPanel({ lat, lng, heading }: { lat: number; lng: number; heading: number }) {
  const iframeRef = useRef<any>(null);

  // Update map position
  useEffect(() => {
    if (Platform.OS !== "web" || !iframeRef.current) return;
    try {
      iframeRef.current.contentWindow?.postMessage(JSON.stringify({ lat, lng, heading }), "*");
    } catch (_) {}
  }, [lat, lng, heading]);

  if (Platform.OS !== "web") {
    return (
      <View style={mp.noMap}>
        <MaterialCommunityIcons name="map-marker-radius" size={32} color={T.muted} />
        <Text style={mp.noMapTxt}>Map · {lat.toFixed(4)}°N {Math.abs(lng).toFixed(4)}°E</Text>
      </View>
    );
  }

  const html = createMapHtml(lat, lng, heading);
  const src = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  return React.createElement("iframe", {
    ref: iframeRef,
    src,
    style: { flex: 1, border: "none", width: "100%", height: "100%", display: "block", background: "#0a0c0a" },
    title: "Field Navigation Map",
    sandbox: "allow-scripts allow-same-origin",
  } as any);
}
const mp = StyleSheet.create({
  noMap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0a0c0a" },
  noMapTxt: { color: T.muted, fontSize: 11, fontWeight: "500" },
});

// ─── Temperature bar ──────────────────────────────────────────
function TempBar({ value, max, hot }: { value: number; max: number; hot: boolean }) {
  const pct = Math.min(value / max, 1);
  return (
    <View style={tb.track}>
      <View style={[tb.fill, {
        width: `${pct * 100}%` as any,
        backgroundColor: hot
          ? pct > 0.8 ? T.red : pct > 0.5 ? T.orange : T.green
          : pct > 0.8 ? T.orange : T.blue,
      }]} />
    </View>
  );
}
const tb = StyleSheet.create({
  track: { height: 5, backgroundColor: "rgba(51,56,58,1)", borderRadius: 3, overflow: "hidden", width: "100%" },
  fill: { height: "100%", borderRadius: 3 },
});

// ─── Battery SVG (from BatterySection.tsx reference) ─────────
function BatteryIcon({ soc, size }: { soc: number; size: number }) {
  const color = soc > 60 ? T.green : soc > 30 ? T.yellow : T.red;
  const fillH = Math.round((soc / 100) * 472);
  const fillY = 512 - fillH;
  return (
    <Svg width={size} height={size * 2} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="bfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} />
          <Stop offset="1" stopColor={soc > 60 ? "#3AB87A" : soc > 30 ? "#E6A800" : "#CC2A1A"} />
        </LinearGradient>
        <clipPath id="bc"><Path d="M91,40 h330 v472 h-330 Z" /></clipPath>
      </Defs>
      <Path d="M420.457,46.9v458.886c0,3.448-2.759,6.207-6.131,6.207H97.674c-3.372,0-6.131-2.759-6.131-6.207V46.9c0-3.449,2.759-6.207,6.131-6.207h68.051V6.207C165.725,2.835,168.484,0,171.932,0h168.136c3.449,0,6.207,2.835,6.207,6.207v34.485h68.051C417.698,40.693,420.457,43.451,420.457,46.9z"
        fill="rgba(30,34,36,1)" stroke="rgba(70,75,77,1)" strokeWidth={8} />
      <Path d={`M91 ${fillY} h330 v${fillH} h-330 Z`} fill="url(#bfill)" clipPath="url(#bc)" />
      <Path d="M207.805,147.876 L317.749,149.381 L271.058,232.212 L328.287,229.196 L190.029,393.062 L228.887,277.391 L183.714,275.887 Z"
        fill="rgba(255,255,255,0.85)" clipPath="url(#bc)" />
    </Svg>
  );
}

// ─── Load bar row ─────────────────────────────────────────────
function LoadBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={lob.row}>
      <Text style={lob.label}>{label}</Text>
      <View style={lob.track}><View style={[lob.fill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color }]} /></View>
      <Text style={[lob.pct, { color }]}>{Math.round(pct)}%</Text>
    </View>
  );
}
const lob = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 },
  label: { color: T.muted, fontSize: 10, fontWeight: "600", width: 68 },
  track: { flex: 1, height: 8, backgroundColor: T.border, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  pct: { fontSize: 10, fontWeight: "700", width: 24, textAlign: "right" },
});

// ─── Info row ─────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)" },
  label: { color: T.muted, fontSize: 10, fontWeight: "500" },
  value: { color: T.text, fontSize: 10, fontWeight: "700" },
});

// ─── Bottom Tab Bar (9 buttons, exact from NavigationButtons.tsx) ─
type TabDef = { icon: MCIcon; label: string; route?: string; color?: string; active?: boolean; danger?: boolean };

function BottomTabs({ connected, onToggleUsb }: { connected: boolean; onToggleUsb: () => void }) {
  const tabs: TabDef[] = [
    { icon: "water",              label: "MONITOR",  route: "/(tabs)/monitor",  color: T.muted },
    { icon: "format-list-checks", label: "PACKETS",  route: "/(tabs)/monitor",  color: T.muted },
    { icon: "console-line",       label: "WRITE",    route: "/(tabs)/write",    color: T.muted },
    { icon: "file-code-outline",  label: "DECODER",  route: "/(tabs)/decoder",  color: T.muted },
    { icon: "engine",             label: "MOTOR",    route: "/(tabs)/settings", color: T.yellow },
    { icon: "monitor-dashboard",  label: "SYSTEM",   route: "/(tabs)/settings", color: T.blue },
    { icon: "tractor",            label: "NAV",      route: "/(tabs)/settings", color: T.orange },
    { icon: "home",               label: "HOME",     active: true,              color: T.green },
    { icon: "usb",                label: connected ? "USB ON" : "USB OFF", danger: true, color: connected ? T.green : T.red },
  ];

  return (
    <View style={bt.bar}>
      {tabs.map((tab, i) => {
        const isHome = tab.active;
        const isUsb = tab.danger;
        const bg = isHome ? "rgba(40,60,48,1)" : isUsb && connected ? "rgba(110,220,161,0.08)" : isUsb ? "rgba(255,80,60,0.08)" : "transparent";
        const bc = isHome ? "rgba(110,220,161,0.5)" : isUsb && connected ? "rgba(110,220,161,0.4)" : isUsb ? "rgba(255,80,60,0.4)" : T.border;
        return (
          <Pressable key={i} style={[bt.tab, { backgroundColor: bg, borderWidth: 1, borderColor: bc }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (isUsb) { onToggleUsb(); }
              else if (tab.route && !isHome) { router.push(tab.route as any); }
            }}>
            <MaterialCommunityIcons name={tab.icon} size={20} color={tab.color ?? T.muted} />
            <Text style={[bt.lbl, { color: tab.color ?? T.muted }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const bt = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.border, height: 62, paddingHorizontal: 2 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 6, margin: 3 },
  lbl: { fontSize: 8, fontWeight: "600", letterSpacing: 0.2, textAlign: "center" },
});

// ─── MAIN SCREEN ──────────────────────────────────────────────
export default function DashboardScreen() {
  const { devices, selectedDevice, connectionStatus, packets, scanForDevices, connectDevice, disconnectDevice } = useUsb();
  const isConnected = connectionStatus === "connected";

  const [dataRate, setDataRate] = useState(0.0);
  const [heading, setHeading] = useState(248);
  const [sessionSec, setSessionSec] = useState(0);
  const [activeGear, setActiveGear] = useState("2");
  const [lat, setLat] = useState(19.19234);
  const [lng, setLng] = useState(72.95322);
  const [gpsFix, setGpsFix] = useState(false);

  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");
  const totalBytes = packets.reduce((s, p) => s + p.byteLength, 0);
  const rxBytes = rxPkts.reduce((s, p) => s + p.byteLength, 0);
  const txBytes = txPkts.reduce((s, p) => s + p.byteLength, 0);
  const rxPct = Math.min((rxBytes / Math.max(totalBytes, 1)) * 100, 100);
  const txPct = Math.min((txBytes / Math.max(totalBytes, 1)) * 100, 100);
  const soc = Math.round(rxPct);
  const voltage = isConnected ? 4.97 : 0.0;
  const current = rxPkts.length > 0 ? (rxPkts.length * 0.08).toFixed(1) : "0.0";
  const baudRate = activeGear === "1" ? 9600 : activeGear === "2" ? 115200 : activeGear === "3" ? 460800 : 1000000;
  const powerKw = isConnected ? (voltage * parseFloat(current) / 1000).toFixed(1) : "0.0";
  const motorRpm = isConnected ? Math.round(dataRate * 120) : 0;
  const motorTemp = isConnected ? 38.4 : 0.0;

  // GPS location from browser
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGpsFix(true); },
      () => { setGpsFix(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Live data rate + heading animation
  useEffect(() => {
    if (!isConnected) { setDataRate(0); return; }
    const t = setInterval(() => {
      setDataRate((p) => +(p * 0.7 + (0.5 + Math.random() * 8) * 0.3).toFixed(1));
      setHeading((h) => (h + (Math.random() * 4 - 2) + 360) % 360);
    }, 700);
    return () => clearInterval(t);
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) { setSessionSec(0); return; }
    const t = setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isConnected]);

  const sessionHMS = `${Math.floor(sessionSec / 3600)}h ${Math.floor((sessionSec % 3600) / 60)}m`;
  const estRange = isConnected ? Math.floor(rxBytes / 1024) : 0;

  const handleToggleUsb = () => {
    if (isConnected) disconnectDevice();
    else if (selectedDevice) connectDevice(selectedDevice);
    else scanForDevices();
  };

  const radiatorTemp = isConnected ? dataRate * 4.2 : 0;
  const battTemp = isConnected ? 28.4 : 0.0;

  return (
    <View style={s.root}>
      {/* ── Status bar ── */}
      {/* NOTE: Dashboard is designed for landscape / tablet view — scroll horizontally on small screens */}
      <View style={s.statusBar}>
        <Text style={s.sbTime}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        <MaterialCommunityIcons name="usb" size={14} color={isConnected ? T.green : T.muted} />
        <Text style={s.sbTitle}>{selectedDevice?.name ?? "USB Data Logger"}</Text>
        <View style={[s.gpsBadge, { backgroundColor: gpsFix ? "rgba(110,220,161,0.15)" : "rgba(255,80,60,0.12)", borderColor: gpsFix ? "rgba(110,220,161,0.5)" : "rgba(255,80,60,0.4)" }]}>
          <View style={[s.gpsDot, { backgroundColor: gpsFix ? T.green : T.red }]} />
          <Text style={[s.gpsText, { color: gpsFix ? T.green : T.red }]}>{gpsFix ? "GPS Locked" : "No Fix"}</Text>
        </View>
      </View>

      {/* ── Four panels ── */}
      <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={s.body} showsHorizontalScrollIndicator={false}>

        {/* ══ LEFT: Speed + Gear + Direction ══ */}
        <View style={s.leftPanel}>
          <View style={s.section}>
            <Speedometer value={dataRate} max={20} label="Speed" unit="KB/s" />
          </View>
          <View style={s.divH} />
          <View style={s.section}>
            <GearGrid activeGear={activeGear} onSelect={(g) => setActiveGear(g)} />
          </View>
          <View style={s.divH} />
          <View style={s.section}>
            <Compass heading={heading} />
          </View>
        </View>

        {/* ══ CENTER: Nav header + Map + Temps ══ */}
        <View style={s.centerPanel}>
          {/* Header */}
          <View style={s.centerHead}>
            <View style={s.navTitleRow}>
              <Text style={s.navTitle}>Field Navigation</Text>
              <View style={[s.gpsBadge, { backgroundColor: isConnected ? "rgba(110,220,161,0.15)" : "rgba(255,80,60,0.1)", borderColor: isConnected ? "rgba(110,220,161,0.5)" : "rgba(255,80,60,0.3)" }]}>
                <Text style={[s.gpsText, { color: isConnected ? T.green : T.red }]}>{isConnected ? "USB Locked" : "Disconnected"}</Text>
              </View>
            </View>
            <Text style={s.navAddr} numberOfLines={1}>
              {selectedDevice?.manufacturerName ?? "81, USB OTG · Android / iOS · WebUSB API"}
            </Text>
            <View style={s.chipRow}>
              {[
                `LAT ${lat.toFixed(5)}`,
                `LNG ${lng.toFixed(5)}`,
                `HDG ${Math.round(heading)}°`,
              ].map((c) => <View key={c} style={s.chip}><Text style={s.chipTxt}>{c}</Text></View>)}
            </View>
          </View>

          {/* Satellite Map */}
          <View style={s.mapBox}>
            <MapPanel lat={lat} lng={lng} heading={heading} />
          </View>

          {/* Temperatures */}
          <View style={s.tempsSection}>
            <Text style={s.tempsSectionTitle}>Temperatures</Text>
            <View style={s.tempsRow}>
              <View style={s.tempCol}>
                <Text style={s.tempLabel}>Radiator</Text>
                <Text style={s.tempVal}>{radiatorTemp.toFixed(1)}°C</Text>
                <TempBar value={radiatorTemp} max={120} hot />
              </View>
              <View style={s.tempDiv} />
              <View style={s.tempCol}>
                <Text style={s.tempLabel}>Battery</Text>
                <Text style={s.tempVal}>{battTemp.toFixed(1)}°C</Text>
                <TempBar value={battTemp} max={60} hot={false} />
              </View>
            </View>
          </View>
        </View>

        {/* ══ BATTERY PANEL ══ */}
        <View style={s.battPanel}>
          <Text style={s.panelTitle}>Battery</Text>
          <Text style={[s.socPct, { color: soc > 60 ? T.green : soc > 30 ? T.yellow : T.red }]}>
            {soc}%
          </Text>
          <Text style={s.socLabel}>SOC</Text>
          <View style={s.battRow}>
            <BatteryIcon soc={soc} size={30} />
            <View style={{ gap: 5 }}>
              <Text style={s.battStatVal}>{current} A</Text>
              <Text style={s.battStatLabel}>Current</Text>
              <Text style={s.battStatVal}>{voltage.toFixed(1)}°C</Text>
              <Text style={s.battStatLabel}>Pack Temp</Text>
            </View>
          </View>
          <View style={s.divH} />
          <View style={s.rangeRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.rangeVal}>{estRange} KB</Text>
              <Text style={s.rangeLabel}>Est. Range</Text>
            </View>
            <View style={[s.rangeDivV]} />
            <View style={{ flex: 1, paddingLeft: 10 }}>
              <Text style={s.rangeVal}>{sessionHMS}</Text>
              <Text style={s.rangeLabel}>Work Time</Text>
            </View>
          </View>
        </View>

        {/* ══ POWER PANEL ══ */}
        <View style={s.powerPanel}>
          <Text style={s.panelTitle}>Power</Text>
          <View style={s.powerBig}>
            <Text style={s.powerVal}>{parseFloat(powerKw).toFixed(1)}</Text>
            <Text style={s.powerUnit}>kW</Text>
          </View>
          <Text style={s.powerSub}>HV Power</Text>
          <View style={{ height: 8 }} />
          <LoadBar label="Motor Load" pct={txPct} color={T.green} />
          <LoadBar label="DC-DC Load" pct={rxPct} color={T.blue} />
          <View style={s.divH} />
          <InfoRow label="DC-DC" value={`${voltage.toFixed(1)} V  ${current} A`} />
          <InfoRow label="Motor RPM" value={motorRpm.toString()} />
          <InfoRow label="Motor Temp" value={`${motorTemp.toFixed(1)}°C`} />
          <InfoRow label="Runtime" value={sessionHMS} />
        </View>
      </ScrollView>

      {/* ── Bottom Tabs ── */}
      <BottomTabs connected={isConnected} onToggleUsb={handleToggleUsb} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, flexDirection: "column" },

  statusBar: { height: 32, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 7, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.panel },
  sbTime: { color: T.muted, fontSize: 11, fontWeight: "600" },
  sbTitle: { color: T.text, fontSize: 12, fontWeight: "700", flex: 1 },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  gpsDot: { width: 5, height: 5, borderRadius: 3 },
  gpsText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },

  body: { flexDirection: "row", flexGrow: 1 },
  divH: { height: 1, backgroundColor: T.border, marginVertical: 6 },
  section: { flex: 1, justifyContent: "center" },

  // Left panel
  leftPanel: { width: 158, borderRightWidth: 1, borderRightColor: T.border, padding: 10, backgroundColor: T.panel },

  // Center panel
  centerPanel: { width: 340, flexDirection: "column", borderRightWidth: 1, borderRightColor: T.border },
  centerHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: T.border, gap: 5 },
  navTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navTitle: { color: T.text, fontSize: 16, fontWeight: "700" },
  navAddr: { color: T.muted, fontSize: 10 },
  chipRow: { flexDirection: "row", gap: 5 },
  chip: { backgroundColor: "rgba(35,39,41,1)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chipTxt: { color: T.muted, fontSize: 9, fontWeight: "700" },
  mapBox: { flex: 1, overflow: "hidden" },
  tempsSection: { borderTopWidth: 1, borderTopColor: T.border, padding: 10 },
  tempsSectionTitle: { color: T.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" },
  tempsRow: { flexDirection: "row" },
  tempCol: { flex: 1, gap: 3 },
  tempDiv: { width: 1, backgroundColor: T.border, marginHorizontal: 12 },
  tempLabel: { color: T.muted, fontSize: 10, fontWeight: "600" },
  tempVal: { color: T.text, fontSize: 22, fontWeight: "700" },

  // Battery panel
  battPanel: { width: 170, borderRightWidth: 1, borderRightColor: T.border, padding: 12 },
  panelTitle: { color: T.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  socPct: { fontSize: 46, fontWeight: "700", lineHeight: 52 },
  socLabel: { color: T.text, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  battRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  battStatVal: { color: T.text, fontSize: 14, fontWeight: "700" },
  battStatLabel: { color: T.muted, fontSize: 9 },
  rangeRow: { flexDirection: "row", alignItems: "center" },
  rangeDivV: { width: 1, height: 36, backgroundColor: T.border },
  rangeVal: { color: T.text, fontSize: 16, fontWeight: "700" },
  rangeLabel: { color: T.muted, fontSize: 9 },

  // Power panel
  powerPanel: { width: 195, padding: 12 },
  powerBig: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 },
  powerVal: { color: T.text, fontSize: 42, fontWeight: "700", lineHeight: 48 },
  powerUnit: { color: T.text, fontSize: 15, paddingBottom: 5 },
  powerSub: { color: T.muted, fontSize: 10, marginBottom: 10 },
});
