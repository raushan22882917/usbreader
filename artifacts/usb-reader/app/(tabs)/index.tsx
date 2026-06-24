import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, Linking } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Svg, { Path, Circle, ClipPath, Defs, LinearGradient, Stop, Text as SvgText, G } from "react-native-svg";
import { useUsb } from "@/context/UsbContext";
import { useParsedUsbData } from "@/hooks/useParsedUsbData";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { UsbConnectionBar } from "@/components/UsbConnectionBar";
import MotorIcon from "../components/MotorIcon";

import { useDeviceScale } from "@/hooks/useDeviceScale";
import { Colors, Spacing, Typography, Border } from "@/theme";

// ─── Theme alias (maps old names → design system) ─────────────
const T = {
  bg:      Colors.background,
  panel:   Colors.surfaceContainerLow,
  card:    Colors.surfaceContainer,
  border:  Colors.outlineVariant,
  text:    Colors.onSurface,
  muted:   Colors.onSurfaceVariant,
  dim:     Colors.dim,
  green:   Colors.tertiary,
  greenDk: Colors.onTertiaryContainer,
  yellow:  Colors.primaryFixedDim,
  orange:  Colors.primary,
  red:     Colors.error,
  blue:    Colors.secondary,
  blueDk:  Colors.onSecondary,
};

// ─── Helpers ─────────────────────────────────────────────────
function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}
function fmtUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${ss}s` : `${ss}s`;
}

// ─── Speedometer (exact reference style) ─────────────────────
function Speedometer({ value, max, label, unit, size = 120 }: { value: number; max: number; label: string; unit: string; size?: number }) {
  const pct = Math.min(value / max, 1);
  const needleAngle = -60 + pct * 120;
  const cx = 130, cy = 130, nr = 65;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip = { x: cx + nr * Math.cos(rad), y: cy + nr * Math.sin(rad) };
  const b1  = { x: cx + 5 * Math.cos(rad + Math.PI / 2), y: cy + 5 * Math.sin(rad + Math.PI / 2) };
  const b2  = { x: cx + 5 * Math.cos(rad - Math.PI / 2), y: cy + 5 * Math.sin(rad - Math.PI / 2) };
  const valueFont = size < 90 ? 20 : 28;
  const unitFont = size < 90 ? 10 : 12;

  return (
    <View style={{ alignItems: "center" }}>
      <Text style={[ss.label, size < 90 && ss.labelCompact]}>{label}</Text>
      <Svg width={size} height={size} viewBox="0 0 260 260">
        <Path d="M73,32 L130,130 L187,32 Z" fill="#FF9811" />
        <Path d="M130,130 L0,130 L73,32 Z" fill="#FFDA44" />
        <Path d="M130,130 L260,130 L187,32 Z" fill="#FF5023" />
        <Path d="M130,0 L130,32 C183.518,32 226,74.482 226,130 C226,185.518 183.518,228 130,228 L130,260 C202.091,260 260,202.091 260,130 C260,57.909 202.091,0 130,0 Z" fill="#006DF0" />
        <Path d="M32,130 C32,74.482 74.482,32 130,32 L130,0 C57.909,0 0,57.909 0,130 C0,202.091 57.909,260 130,260 L130,228 C74.482,228 32,185.518 32,130 Z" fill="#0052B4" />
        <Circle cx={130} cy={130} r={67} fill="rgba(21,25,27,1)" />
        <Defs>
          <LinearGradient id="ng" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={T.green} />
            <Stop offset="1" stopColor={T.yellow} />
          </LinearGradient>
        </Defs>
        <Path d={`M${tip.x},${tip.y} L${b1.x},${b1.y} L${b2.x},${b2.y}Z`} fill="url(#ng)" />
        <Circle cx={130} cy={130} r={8} fill="rgba(21,25,27,1)" stroke={T.green} strokeWidth={2} />
        <SvgText x={130} y={166} textAnchor="middle" fill={T.text} fontSize={valueFont} fontWeight="bold">
          {value < 10 ? value.toFixed(1) : Math.round(value).toString()}
        </SvgText>
        <SvgText x={130} y={182} textAnchor="middle" fill={T.muted} fontSize={unitFont}>{unit}</SvgText>
      </Svg>
    </View>
  );
}
const ss = StyleSheet.create({
  label: { color: T.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 },
  labelCompact: { fontSize: 9, marginBottom: 0 },
});

// ─── Gear Grid ───────────────────────────────────────────────
const GEAR_ROWS = [["1", "2", "3", "4"], ["F", "N", "R"], ["H", "N", "L"]];
/** 4×3 shifter grid: speed | direction | range */
const GEAR_GRID: (string | null)[][] = [
  ["1", "F", "H"],
  ["2", "N", "N"],
  ["3", "R", "L"],
  ["4", null, null],
];

function GearGrid({
  active,
  onSelect,
  compact,
  scale = 1,
  columnLayout = false,
}: {
  active: string;
  onSelect: (g: string) => void;
  compact?: boolean;
  scale?: number;
  columnLayout?: boolean;
}) {
  const btnMinH = compact ? Math.max(22, Math.round(26 * scale)) : 30;
  const btnPadH = compact ? Math.max(8, Math.round(10 * scale)) : 12;
  const fontSize = compact ? Math.max(11, Math.round(12 * scale)) : 13;

  if (columnLayout) {
    return (
      <View style={gg.wrap}>
        <Text style={[ss.label, compact && ss.labelCompact]}>Gear</Text>
        <View style={gg.grid}>
          {GEAR_GRID.map((row, ri) => (
            <View key={ri} style={gg.gridRow}>
              {row.map((g, ci) => (
                g ? (
                  <Pressable
                    key={`${ri}-${ci}-${g}`}
                    style={[
                      gg.gridBtn,
                      { minHeight: btnMinH, paddingHorizontal: btnPadH },
                      g === active && gg.on,
                    ]}
                    onPress={() => { Haptics.selectionAsync(); onSelect(g); }}
                  >
                    <Text style={[gg.txt, { fontSize }, g === active && gg.txtOn]}>{g}</Text>
                  </Pressable>
                ) : (
                  <View key={`${ri}-${ci}-sp`} style={gg.gridSpacer} />
                )
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const btnPad = compact ? Math.max(5, Math.round(6 * scale)) : 7;
  return (
    <View style={gg.wrap}>
      <Text style={[ss.label, compact && ss.labelCompact]}>Gear</Text>
      {GEAR_ROWS.map((row, ri) => (
        <View key={ri} style={gg.row}>
          {row.map((g) => {
            const on = g === active;
            return (
              <Pressable
                key={`${ri}-${g}`}
                style={[gg.btn, { paddingVertical: btnPad, minHeight: btnMinH }, on && gg.on]}
                onPress={() => { Haptics.selectionAsync(); onSelect(g); }}
              >
                <Text style={[gg.txt, { fontSize }, on && gg.txtOn]}>{g}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
const gg = StyleSheet.create({
  wrap: { gap: 4, alignItems: "stretch", width: "100%" },
  row: { flexDirection: "row", gap: 4 },
  btn: {
    flex: 1,
    backgroundColor: "rgba(35,39,41,1)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
  },
  grid: { gap: 3 },
  gridRow: { flexDirection: "row", gap: 4 },
  gridBtn: {
    flex: 1,
    backgroundColor: "rgba(35,39,41,1)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
  },
  gridSpacer: { flex: 1 },
  on: { backgroundColor: T.green, borderColor: T.green },
  txt: { color: T.muted, fontWeight: "700" },
  txtOn: { color: "rgba(21,25,27,1)" },
});

// ─── Compass ─────────────────────────────────────────────────
function Compass({ heading, size = 80 }: { heading: number; size?: number }) {
  const S = size, cx = size / 2, cy = size / 2, r = size * 0.4125;
  const toXY = (a: number, radius: number) => ({
    x: cx + radius * Math.cos(((a - 90) * Math.PI) / 180),
    y: cy + radius * Math.sin(((a - 90) * Math.PI) / 180),
  });
  const tip  = toXY(heading, r - 6);
  const tail = toXY(heading + 180, r - 12);
  const lN   = toXY(heading - 12, r - 16);
  const rN   = toXY(heading + 12, r - 16);
  const lS   = toXY(heading + 168, r - 16);
  const rS   = toXY(heading + 192, r - 16);
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  const card = dirs[Math.round(heading / 45) % 8];
  return (
    <View style={cp.wrap}>
      <Text style={[ss.label, size < 64 && ss.labelCompact]}>Heading</Text>
      <View style={cp.row}>
        <Svg width={S} height={S}>
          <Circle cx={cx} cy={cy} r={r} stroke={T.border} strokeWidth={1.5} fill="rgba(21,25,27,0.9)" />
          {["N","E","S","W"].map((c, i) => {
            const p = toXY(i * 90, r - S * 0.12);
            return <SvgText key={c} x={p.x} y={p.y + S * 0.075} textAnchor="middle"
              fill={c === "N" ? T.red : T.muted} fontSize={S * 0.14} fontWeight="bold">{c}</SvgText>;
          })}
          <Path d={`M${tip.x},${tip.y} L${lN.x},${lN.y} L${tail.x},${tail.y} L${rN.x},${rN.y}Z`} fill={T.red} />
          <Path d={`M${tail.x},${tail.y} L${lS.x},${lS.y} L${tip.x},${tip.y} L${rS.x},${rS.y}Z`} fill="rgba(100,102,102,1)" />
          <Circle cx={cx} cy={cy} r={3} fill="rgba(235,235,235,1)" />
        </Svg>
        <View style={{ gap: 1 }}>
          <Text style={[cp.deg, size < 64 && cp.degCompact]}>{Math.round(heading)}°</Text>
          <Text style={[cp.card, size < 64 && cp.cardCompact]}>{card}</Text>
        </View>
      </View>
    </View>
  );
}
const cp = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  deg: { color: T.red, fontSize: 22, fontWeight: "700" },
  degCompact: { fontSize: 16 },
  card: { color: T.green, fontSize: 12, fontWeight: "700" },
  cardCompact: { fontSize: 10 },
});

// ─── Satellite Map ────────────────────────────────────────────
function buildMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html><html style="margin:0;padding:0;height:100%;background:#0a0c0a">
<head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body,html{margin:0;padding:0;height:100%;overflow:hidden}#map{width:100%;height:100%;background:#0a0c0a}.leaflet-control-attribution{display:none}</style>
</head><body><div id="map"></div>
<script>
try{
  var map=L.map('map',{center:[${lat.toFixed(6)},${lng.toFixed(6)}],zoom:18,zoomControl:false,attributionControl:false});
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}).addTo(map);
  var mk=L.circleMarker([${lat.toFixed(6)},${lng.toFixed(6)}],{radius:9,fillColor:'#6EDCA1',color:'#fff',weight:2.5,fillOpacity:0.92}).addTo(map);
  L.circle([${lat.toFixed(6)},${lng.toFixed(6)}],{radius:20,color:'rgba(110,220,161,0.5)',fillOpacity:0.08,weight:1.5}).addTo(map);
  window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.lat&&d.lng){mk.setLatLng([d.lat,d.lng]);map.panTo([d.lat,d.lng],{animate:true,duration:0.8});}}catch(err){}});
}catch(e){}
</script></body></html>`;
}

function MapPanel({ lat, lng, iconSize = 28 }: { lat: number; lng: number; iconSize?: number }) {
  const iframeRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !iframeRef.current) return;
    try { iframeRef.current.contentWindow?.postMessage(JSON.stringify({ lat, lng }), "*"); } catch {}
  }, [lat, lng]);

  if (Platform.OS !== "web") {
    return (
      <View style={mp.fallback}>
        <MaterialCommunityIcons name="map-marker-radius" size={iconSize} color={T.muted} />
        <Text style={mp.fallTxt}>{lat.toFixed(5)}°N  {Math.abs(lng).toFixed(5)}°E</Text>
      </View>
    );
  }
  const html = buildMapHtml(lat, lng);
  const src = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  return React.createElement("iframe", {
    ref: iframeRef, src,
    style: { flex: 1, border: "none", width: "100%", height: "100%", display: "block", background: "#0a0c0a" },
    title: "Field Navigation Map", sandbox: "allow-scripts allow-same-origin",
  } as any);
}
const mp = StyleSheet.create({
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0a0c0a" },
  fallTxt: { color: T.muted, fontSize: 11 },
});

// ─── Live data ticker ─────────────────────────────────────────
function DataTicker({ data, time }: { data: string; time: string }) {
  return (
    <View style={dt.row}>
      <View style={dt.dot} />
      <Text style={dt.time}>{time}</Text>
      <Text style={dt.data} numberOfLines={1}>{data || "—"}</Text>
    </View>
  );
}
const dt = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.green },
  time: { color: T.muted, fontSize: 9, width: 54 },
  data: { flex: 1, color: "rgba(140,220,170,1)", fontSize: 9, fontFamily: "monospace" },
});

// ─── Bar (temp / load) ────────────────────────────────────────
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 4, backgroundColor: T.border, borderRadius: 2, overflow: "hidden", marginVertical: 2 },
  fill: { height: "100%", borderRadius: 2 },
});

// ─── Battery SVG ─────────────────────────────────────────────
function BatteryIcon({ soc, size }: { soc: number; size: number }) {
  const color = soc > 60 ? T.green : soc > 30 ? T.yellow : T.red;
  const fillH = Math.max(0, Math.round((soc / 100) * 472));
  const fillY = 512 - fillH;
  return (
    <Svg width={size} height={size * 2} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="bf" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} />
          <Stop offset="1" stopColor={soc > 60 ? "#3AB87A" : soc > 30 ? "#E6A800" : "#CC2A1A"} />
        </LinearGradient>
        <ClipPath id="bc"><Path d="M91,40 h330 v472 h-330 Z" /></ClipPath>
      </Defs>
      <Path d="M420.457,46.9v458.886c0,3.448-2.759,6.207-6.131,6.207H97.674c-3.372,0-6.131-2.759-6.131-6.207V46.9c0-3.449,2.759-6.207,6.131-6.207h68.051V6.207C165.725,2.835,168.484,0,171.932,0h168.136c3.449,0,6.207,2.835,6.207,6.207v34.485h68.051C417.698,40.693,420.457,43.451,420.457,46.9z"
        fill="rgba(30,34,36,1)" stroke="rgba(70,75,77,1)" strokeWidth={8} />
      <Path d={`M91 ${fillY} h330 v${fillH} h-330 Z`} fill="url(#bf)" clipPath="url(#bc)" />
      <Path d="M207.805,147.876 L317.749,149.381 L271.058,232.212 L328.287,229.196 L190.029,393.062 L228.887,277.391 L183.714,275.887 Z"
        fill="rgba(255,255,255,0.85)" clipPath="url(#bc)" />
    </Svg>
  );
}


// ─── Stat row ─────────────────────────────────────────────────
function StatRow({ icon, label, value, color, unit, compact, iconSize }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; label: string; value: string; color?: string; unit?: string; compact?: boolean; iconSize?: number }) {
  return (
    <View style={sr.row}>
      <MaterialCommunityIcons name={icon} size={iconSize ?? (compact ? 10 : 12)} color={color ?? T.muted} />
      <Text style={[sr.label, compact && sr.labelCompact]}>{label}</Text>
      <Text style={[sr.value, compact && sr.valueCompact, color ? { color } : {}]}>{value}{unit ? <Text style={sr.unit}> {unit}</Text> : null}</Text>
    </View>
  );
}
const sr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)" },
  label: { flex: 1, color: T.muted, fontSize: 8 },
  labelCompact: { fontSize: 7 },
  value: { color: T.text, fontSize: 9, fontWeight: "700" },
  valueCompact: { fontSize: 8 },
  unit: { color: T.muted, fontSize: 7, fontWeight: "400" },
});

function useDashboardLayout() {
  const d = useDeviceScale();
  const stackPortrait = d.isCompact && !d.isLandscape;
  const stackLandscape = d.isCompact && d.isLandscape;

  const gaugeSize = stackPortrait
    ? Math.round(d.shortSide * 0.2)
    : d.isTight
      ? Math.round(d.shortSide * 0.22)
      : d.svg(120, 70);
  const compassSize = stackPortrait
    ? Math.round(d.shortSide * 0.14)
    : d.isTight
      ? Math.round(d.shortSide * 0.16)
      : d.svg(80, 52);
  const motorSize = stackPortrait
    ? Math.round(d.shortSide * 0.22)
    : d.isTight
      ? Math.round(d.shortSide * 0.28)
      : d.isCompact
        ? d.svg(110, 72)
        : d.svg(132, 88);
  const batterySize = stackPortrait
    ? Math.round(d.shortSide * 0.1)
    : d.isTight
      ? Math.round(d.shortSide * 0.12)
      : d.isCompact
        ? d.svg(100, 64)
        : d.svg(142, 88);

  const font = (base: number, min = 7) =>
    Math.max(min, Math.round(base * d.scale));

  return {
    ...d,
    gaugeSize,
    compassSize,
    motorSize,
    batterySize,
    iconMd: d.icon(16, 12),
    iconSm: d.icon(13, 10),
    fontXs: font(8),
    fontSm: font(9),
    fontMd: font(11),
    fontLg: font(14),
    useStackedRight: stackLandscape,
    useStackedMain: stackPortrait,
    leftHorizontal: stackPortrait,
    rightStacked: stackPortrait || d.isTight,
    leftWidth: stackPortrait
      ? undefined
      : d.isTight
        ? Math.round(d.shortSide * 0.32)
        : d.isCompact
          ? Math.round(d.shortSide * 0.36)
          : 160,
    rightWidth: d.isCompact ? Math.round(d.longSide * 0.38) : 400,
    mapMinHeight: stackPortrait
      ? Math.round(d.longSide * 0.26)
      : d.isTight
        ? 120
        : 0,
  };
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────
export default function DashboardScreen() {
  const { selectedDevice, connectionStatus, packets, quickConnect, disconnectDevice } = useUsb();
  const parsed = useParsedUsbData(packets);
  const isConnected = connectionStatus === "connected";
  const {
    isCompact,
    isLandscape,
    isTight,
    scale,
    gaugeSize,
    compassSize,
    motorSize,
    batterySize,
    iconMd,
    iconSm,
    fontXs,
    fontSm,
    fontMd,
    useStackedRight,
    useStackedMain,
    leftHorizontal,
    rightStacked,
    leftWidth,
    rightWidth,
    mapMinHeight,
  } = useDashboardLayout();

  const [activeGear, setActiveGear]   = useState("N");
  const [heading, setHeading]         = useState(248);
  const [lat, setLat]                 = useState(19.19234);
  const [lng, setLng]                 = useState(72.95322);
  const [gpsFix, setGpsFix]           = useState(false);
  const [sessionSec, setSessionSec]   = useState(0);

  // GPS location from browser
  useEffect(() => {
    if (Platform.OS !== "web" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude); setLng(p.coords.longitude); setGpsFix(true); },
      () => setGpsFix(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Session timer
  useEffect(() => {
    if (!isConnected) { setSessionSec(0); return; }
    const t = setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isConnected]);

  const handleToggleUsb = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isConnected) disconnectDevice();
    else quickConnect();
  };

  // Google Maps API integration
  const openGoogleMaps = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Use current GPS coordinates or fallback to device location
    const latitude = lat;
    const longitude = lng;
    
    try {
      // Try to open in Google Maps app with directions
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      const supported = await Linking.canOpenURL(directionsUrl);
      if (supported) {
        await Linking.openURL(directionsUrl);
      } else {
        // Fallback to web version
        await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
      }
    } catch (error) {
      console.error("Error opening Google Maps:", error);
      // Final fallback to basic Google Maps
      await Linking.openURL("https://maps.google.com");
    }
  };

  // Derive display values from parsed real data
  const soc         = isConnected ? Math.round(parsed.soc || 0) : 0;
  const voltage     = isConnected ? (parsed.packVoltageV || parsed.vccV || 0).toFixed(1) : "0.0";
  const current     = isConnected ? (parsed.packCurrentA || 0).toFixed(1) : "0.0";
  const packTemp    = isConnected ? (parsed.packTempC || parsed.boardTempC || 0).toFixed(1) : "0.0";
  const motorRpm    = isConnected ? Math.round(parsed.motorRpm || 0) : 0;
  const motorTemp   = isConnected ? parsed.motorTempC.toFixed(1) : "0.0";
  const motorLoad   = isConnected ? parsed.motorLoadPct : 0;
  const dataRate    = isConnected ? parsed.dataRateKbps : 0;
  const rxBytes     = parsed.totalRxBytes;
  const txBytes     = parsed.totalTxBytes;
  const pktRate     = isConnected ? parsed.packetsPerSec.toFixed(1) : "0.0";

  const socColor   = soc > 60 ? T.green : soc > 30 ? T.yellow : T.red;
  const loadColor  = motorLoad > 80 ? T.red : motorLoad > 50 ? T.orange : T.green;
  const socBarPct  = soc;
  const tempBarPct = parseFloat(packTemp) / 80 * 100;
  const gearColumnLayout = isCompact || isTight;

  const dashboardBody = (
    <>
        <View style={[
          s.leftSection,
          leftHorizontal && s.leftSectionHorizontal,
          leftWidth != null && { width: leftWidth, maxWidth: leftWidth },
          isTight && !leftHorizontal && s.leftSectionTight,
        ]}>
          {leftHorizontal ? (
            <View style={s.leftRow}>
              <View style={s.leftRowItem}>
                <Speedometer value={dataRate} max={12} label="Data Rate" unit="KB/s" size={gaugeSize} />
              </View>
              <View style={s.leftRowDiv} />
              <View style={s.leftRowItem}>
                <GearGrid active={activeGear} onSelect={setActiveGear} compact scale={scale} columnLayout={gearColumnLayout} />
              </View>
              <View style={s.leftRowDiv} />
              <View style={s.leftRowItem}>
                <Compass heading={heading} size={compassSize} />
              </View>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.leftScroll} nestedScrollEnabled>
              <View style={[s.sec, isTight && s.secTight]}>
                <Speedometer value={dataRate} max={12} label="Data Rate" unit="KB/s" size={gaugeSize} />
              </View>
              <View style={[s.divH, isTight && s.divHTight]} />
              <View style={[s.sec, isTight && s.secTight]}>
                <GearGrid active={activeGear} onSelect={setActiveGear} compact={isCompact} scale={scale} columnLayout={gearColumnLayout} />
              </View>
              <View style={[s.divH, isTight && s.divHTight]} />
              <View style={[s.sec, isTight && s.secTight]}>
                <Compass heading={heading} size={compassSize} />
              </View>
            </ScrollView>
          )}
        </View>

        {/* ══ CENTER SECTION: Field Navigation + Map + Stream ══ */}
        <View style={[s.centerSection, isCompact && s.centerSectionCompact, useStackedMain && s.centerSectionStacked]}>
          <View style={[s.navHead, isCompact && s.navHeadCompact]}>
            <View style={s.navTitleRow}>
              <MaterialCommunityIcons name="map-marker-radius" size={iconMd} color={T.blue} />
              <Text style={[s.navTitle, isCompact && s.navTitleCompact, { fontSize: fontMd }]} numberOfLines={1}>Field Navigation</Text>
              <View style={[s.badge2, { backgroundColor: isConnected ? "rgba(110,220,161,0.12)" : "rgba(255,80,60,0.08)", borderColor: isConnected ? "rgba(110,220,161,0.4)" : "rgba(255,80,60,0.3)" }]}>
                <Text style={[s.badge2Txt, { color: isConnected ? T.green : T.red, fontSize: fontXs }]}>{isConnected ? "● LIVE" : "○ OFFLINE"}</Text>
              </View>
              <Pressable style={s.mapsBtn} onPress={openGoogleMaps}>
                <MaterialCommunityIcons name="google-maps" size={iconSm} color="#4285F4" />
                <Text style={[s.mapsBtnTxt, { fontSize: fontXs }]}>Maps</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} nestedScrollEnabled>
              {[`LAT ${lat.toFixed(5)}`, `LNG ${lng.toFixed(5)}`, `HDG ${Math.round(heading)}°`, `PKT/s ${pktRate}`].map((c) => (
                <View key={c} style={s.chip}><Text style={[s.chipTxt, { fontSize: fontXs }]}>{c}</Text></View>
              ))}
            </ScrollView>
          </View>

          <View style={[s.mapBox, mapMinHeight > 0 && { minHeight: mapMinHeight }, !useStackedMain && s.mapBoxFlex]}>
            <MapPanel lat={lat} lng={lng} iconSize={Math.round(28 * scale)} />
          </View>

          <View style={[s.streamBox, isCompact && s.streamBoxCompact]}>
            <View style={s.streamHead}>
              <MaterialCommunityIcons name="broadcast" size={iconSm} color={T.green} />
              <Text style={s.streamTitle}>LIVE USB STREAM</Text>
              <Text style={s.streamCount}>{packets.length} pkts · {fmtBytes(parsed.totalBytes)}</Text>
            </View>
            {parsed.lastPacketData ? (
              <DataTicker data={parsed.lastPacketData} time={parsed.lastPacketTime} />
            ) : (
              <Text style={s.streamEmpty}>{isConnected ? "Waiting for data…" : "Connect a USB device to see data"}</Text>
            )}
          </View>
        </View>

        <View style={[
          s.rightSection,
          !useStackedMain && { maxWidth: rightWidth },
          (useStackedRight || rightStacked) && s.rightSectionStacked,
        ]}>
          <View style={[s.rightTopPart, (useStackedRight || rightStacked) && s.rightTopPartStacked]}>
            <View style={[s.battPanel, isCompact && s.panelCompact]}>
              <Text style={s.panelTitle}>Battery</Text>

              <Text style={[s.socBig, isCompact && s.socBigCompact, { color: socColor }]}>{soc}<Text style={s.socUnit}>%</Text></Text>
              <Bar pct={socBarPct} color={socColor} />
              <Text style={s.socLabel}>State of Charge</Text>

              <View style={{ height: isCompact ? 2 : 6 }} />

              <View style={s.battRow}>
                <View style={{ flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <BatteryIcon soc={soc} size={batterySize} />
                  <MaterialCommunityIcons name="lightning-bolt" size={Math.round(20 * scale)} color={socColor} />
                  <View style={[s.battMetricsRow, isCompact && s.battMetricsRowCompact]}>
                    <View style={s.battMetricItem}>
                      <MaterialCommunityIcons name="flash" size={iconSm} color={T.blue} />
                      <View style={s.battMetricText}>
                        <Text style={[s.battVal, isCompact && s.battValCompact]}>{voltage} V</Text>
                        <Text style={s.battSub}>Pack Voltage</Text>
                      </View>
                    </View>
                    <View style={s.battMetricItem}>
                      <MaterialCommunityIcons name="current-ac" size={iconSm} color={T.green} />
                      <View style={s.battMetricText}>
                        <Text style={[s.battVal, isCompact && s.battValCompact]}>{current} A</Text>
                        <Text style={s.battSub}>Current</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={[s.divH, isTight && s.divHTight]} />

              <StatRow icon="thermometer" label="Pack Temp" value={packTemp} color={parseFloat(packTemp) > 45 ? T.orange : T.blue} unit="°C" compact={isCompact} iconSize={iconSm} />
              <Bar pct={tempBarPct} color={parseFloat(packTemp) > 45 ? T.orange : T.blue} />

              {!isTight && (
                <>
                  <View style={{ height: 4 }} />
                  <StatRow icon="database" label="RX Total" value={fmtBytes(rxBytes)} color={T.blue} compact={isCompact} iconSize={iconSm} />
                  <StatRow icon="upload" label="TX Total" value={fmtBytes(txBytes)} color={T.green} compact={isCompact} iconSize={iconSm} />

                  <View style={s.divH} />

                  <View style={s.rangeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rangeVal, isCompact && s.rangeValCompact]}>{fmtBytes(parsed.totalRxBytes)}</Text>
                      <Text style={s.rangeLbl}>Total Received</Text>
                    </View>
                    <View style={s.rangeDiv} />
                    <View style={{ flex: 1, paddingLeft: 8 }}>
                      <Text style={[s.rangeVal, isCompact && s.rangeValCompact]}>{fmtUptime(parsed.uptimeSec || sessionSec)}</Text>
                      <Text style={s.rangeLbl}>Uptime</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={[s.rightBottomPart, (useStackedRight || rightStacked) && s.rightBottomPartStacked]}>
            <View style={[s.powerPanel, isCompact && s.panelCompact]}>
              <Text style={s.panelTitle}>Motor & Power</Text>

              <View style={[s.battMetricsRow, isCompact && s.battMetricsRowCompact, { marginTop: 4 }]}>
                <View style={s.battMetricItem}>
                  <MaterialCommunityIcons name="gauge" size={iconSm} color={loadColor} />
                  <View style={s.battMetricText}>
                    <Text style={[s.battVal, isCompact && s.battValCompact]}>{Math.round(motorLoad)}%</Text>
                    <Text style={s.battSub}>Motor Load</Text>
                  </View>
                </View>
                <View style={s.battMetricItem}>
                  <MaterialCommunityIcons name="speedometer" size={iconSm} color={T.blue} />
                  <View style={s.battMetricText}>
                    <Text style={[s.battVal, isCompact && s.battValCompact]}>{dataRate.toFixed(2)} KB/s</Text>
                    <Text style={s.battSub}>Data Rate</Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: "column", alignItems: "center", marginBottom: isCompact ? 4 : 8 }}>
                <MotorIcon
                  size={motorSize}
                  motorRpm={motorRpm}
                  motorLoad={motorLoad}
                  motorTemp={motorTemp}
                  isRunning={motorRpm > 0}
                />
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 }}>
                  <Text style={[s.powerVal, isCompact && s.powerValCompact]}>{motorRpm}</Text>
                  <Text style={s.powerUnit}>RPM</Text>
                </View>
                <Text style={s.powerSub}>Motor Speed</Text>
              </View>

              {!isTight && (
                <>
                  <View style={{ height: 6 }} />
                  <View style={s.divH} />
                  <StatRow icon="thermometer" label="Motor Temp" value={`${motorTemp}°C`} color={motorTemp > "60" ? T.red : T.orange} compact={isCompact} iconSize={iconSm} />
                  <Bar pct={parseFloat(motorTemp) / 120 * 100} color={motorTemp > "60" ? T.red : T.orange} />
                  <View style={{ height: 4 }} />
                  <StatRow icon="flash" label="HV Voltage" value={`${voltage} V`} color={T.blue} compact={isCompact} iconSize={iconSm} />
                  <StatRow icon="current-ac" label="Pack Current" value={`${current} A`} color={T.green} compact={isCompact} iconSize={iconSm} />
                  <StatRow icon="counter" label="Heartbeat" value={parsed.heartbeat.toString()} color={T.muted} compact={isCompact} iconSize={iconSm} />
                  <StatRow icon="clock-outline" label="Session" value={fmtUptime(sessionSec)} color={T.muted} compact={isCompact} iconSize={iconSm} />
                </>
              )}
            </View>
          </View>
        </View>
    </>
  );

  return (
    <View style={s.root}>
      <Header />
      {isCompact && !isLandscape && (
        <View style={s.rotateBanner}>
          <MaterialCommunityIcons name="phone-rotate-landscape" size={iconMd} color={T.blue} />
          <Text style={s.rotateBannerTxt}>
            Rotate your phone horizontally for the best dashboard view
          </Text>
        </View>
      )}

      <View style={[s.statusBar, isCompact && s.statusBarCompact]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.statusBarScroll}
          contentContainerStyle={s.statusBarScrollContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {!isTight && (
            <Text style={[s.sbTime, { fontSize: fontXs }]}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
          )}
          <MaterialCommunityIcons name="usb" size={iconSm} color={isConnected ? T.green : T.muted} />
          <Text style={[s.sbTitle, isCompact && s.sbTitleCompact, { fontSize: fontSm }]} numberOfLines={1}>
            {isTight ? "USB Logger" : (selectedDevice?.name ?? "USB Data Logger")}
          </Text>
          {selectedDevice && !isTight && (
            <Text style={[s.sbVid, { fontSize: fontXs }]}>VID:{selectedDevice.vendorId?.toString(16).toUpperCase()}</Text>
          )}

          <View style={[s.gpsBadge, { backgroundColor: gpsFix ? "rgba(110,220,161,0.12)" : "rgba(255,80,60,0.1)", borderColor: gpsFix ? "rgba(110,220,161,0.45)" : "rgba(255,80,60,0.4)" }]}>
            <View style={[s.gpsDot, { backgroundColor: gpsFix ? T.green : T.red }]} />
            <Text style={[s.gpsTxt, { color: gpsFix ? T.green : T.red, fontSize: fontXs }]}>{gpsFix ? "GPS OK" : "No Fix"}</Text>
          </View>
        </ScrollView>
        <UsbConnectionBar compact embedded />
      </View>

      {useStackedMain ? (
        <ScrollView
          style={s.mainScroll}
          contentContainerStyle={[s.mainContainer, s.mainContainerStacked]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {dashboardBody}
        </ScrollView>
      ) : (
        <View style={s.mainContainer}>
          {dashboardBody}
        </View>
      )}

      {/* ── Bottom Nav ── */}
      <BottomNav />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, flexDirection: "column" },

  rotateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(80,180,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(80,180,255,0.25)",
  },
  rotateBannerTxt: {
    flex: 1,
    color: T.blue,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },

  statusBarScroll: { flex: 1, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  statusBarScrollContent: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingRight: Spacing.sm },
  statusBar: { minHeight: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.gutter, gap: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Border.color, backgroundColor: Colors.surfaceContainerLowest },
  statusBarCompact: { minHeight: 32, paddingHorizontal: 8, gap: 6 },
  sbTime:    { ...Typography.labelCaps, color: T.muted, fontSize: 10 },
  sbTitle:   { ...Typography.labelCaps, color: T.text, fontSize: 11, flexShrink: 1, maxWidth: 180 },
  sbTitleCompact: { fontSize: 10 },
  sbVid:     { ...Typography.labelCaps, color: T.blue, fontSize: 8 },
  gpsBadge:  { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderWidth: Border.width, flexShrink: 0 },
  gpsDot:    { width: 5, height: 5, borderRadius: 3 },
  gpsTxt:    { ...Typography.labelCaps, fontSize: 8 },
  usbBtn:    { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderWidth: Border.width },
  usbTxt:    { ...Typography.labelCaps, fontSize: 8 },

  mainScroll: { flex: 1 },
  mainContainer: { flex: 1, flexDirection: "row", padding: Spacing.xs, minHeight: 0 },
  mainContainerStacked: { flexDirection: "column", flexGrow: 1, paddingBottom: 8 },

  leftSection: { backgroundColor: T.panel, borderRightWidth: Border.width, borderRightColor: Border.color, padding: Spacing.sm, minHeight: 0, flexShrink: 0 },
  leftSectionHorizontal: {
    width: "100%",
    maxWidth: "100%",
    borderRightWidth: 0,
    borderBottomWidth: Border.width,
    borderBottomColor: Border.color,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  leftSectionTight: { padding: 6 },
  leftScroll: { gap: 4, paddingBottom: 4 },
  leftRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-evenly", gap: 4 },
  leftRowItem: { flex: 1, alignItems: "center", minWidth: 0 },
  leftRowDiv: { width: Border.width, alignSelf: "stretch", backgroundColor: Border.color, marginVertical: 4 },

  centerSection: { flex: 2, minWidth: 120, flexDirection: "column", borderRightWidth: Border.width, borderRightColor: Border.color, minHeight: 0 },
  centerSectionCompact: { minWidth: 0 },
  centerSectionStacked: { flex: 0, borderRightWidth: 0, width: "100%" },

  rightSection: { flex: 1, minWidth: 0, flexDirection: "row", padding: Spacing.xs, gap: Spacing.sm, minHeight: 0 },
  rightSectionStacked: { flexDirection: "column", maxWidth: undefined, width: "100%" },

  rightTopPart: { flex: 1, marginRight: 3, minWidth: 0 },
  rightTopPartStacked: { marginRight: 0, marginBottom: 6 },

  rightBottomPart: { flex: 1, marginLeft: 3, minWidth: 0 },
  rightBottomPartStacked: { marginLeft: 0 },

  divH: { height: Border.width, backgroundColor: Border.color, marginVertical: Spacing.sm },
  divHTight: { marginVertical: 4 },
  sec:  { flexShrink: 0, alignItems: "center", justifyContent: "flex-start" },
  secTight: { paddingVertical: 0 },

  navHead: { paddingHorizontal: Spacing.panelPadding, paddingTop: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Border.color, gap: Spacing.sm, flexShrink: 0 },
  navHeadCompact: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, gap: 6 },
  navTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, minWidth: 0, flexWrap: "wrap" },
  navTitle: { ...Typography.headlineMd, color: T.text, fontSize: 14, flex: 1, minWidth: 80 },
  navTitleCompact: { fontSize: 12 },
  badge2: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderWidth: Border.width },
  badge2Txt: { ...Typography.labelCaps, fontSize: 8 },
  mapsBtn: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, backgroundColor: "rgba(66,133,244,0.12)", borderWidth: Border.width, borderColor: "rgba(66,133,244,0.35)", paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  mapsBtnTxt: { ...Typography.labelCaps, color: "#4285F4", fontSize: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  chip: { backgroundColor: Colors.surfaceContainerHigh, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  chipTxt: { ...Typography.labelCaps, color: T.muted, fontSize: 8 },
  mapBox: { overflow: "hidden", minHeight: 0 },
  mapBoxFlex: { flex: 1 },
  streamBox: { borderTopWidth: Border.width, borderTopColor: Border.color, padding: Spacing.panelPadding, gap: Spacing.xs, flexShrink: 0 },
  streamBoxCompact: { padding: 8, gap: 4 },
  streamHead: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  streamTitle: { ...Typography.labelCaps, flex: 1, color: T.muted, fontSize: 8 },
  streamCount: { ...Typography.labelCaps, color: T.dim, fontSize: 8 },
  streamEmpty: { ...Typography.bodyMd, color: T.dim, fontSize: 10, fontStyle: "italic" },

  battPanel: { flex: 1, backgroundColor: T.panel, padding: Spacing.sm, borderWidth: Border.width, borderColor: Border.color, minHeight: 0 },
  panelCompact: { padding: 8 },
  panelTitle: { ...Typography.labelCaps, color: T.muted, fontSize: 9, marginBottom: Spacing.sm },
  socBig: { ...Typography.headlineLg, lineHeight: 32 },
  socBigCompact: { fontSize: 22, lineHeight: 26 },
  socUnit: { ...Typography.headlineMd, fontSize: 12 },
  socLabel: { ...Typography.labelCaps, color: T.muted, fontSize: 8, marginTop: 2, marginBottom: Spacing.sm },
  battRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.xs },
  battMetricsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 4 },
  battMetricsRowCompact: { gap: 8 },
  battMetricItem: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  battMetricText: { minWidth: 0 },
  battVal: { ...Typography.dataMono, color: T.text, fontSize: 16 },
  battValCompact: { fontSize: 13 },
  battSub: { ...Typography.bodyMd, color: T.muted, fontSize: 9 },
  rangeRow: { flexDirection: "row", alignItems: "center" },
  rangeDiv: { width: Border.width, height: 32, backgroundColor: Border.color },
  rangeVal: { ...Typography.dataMono, color: T.text, fontSize: 13 },
  rangeValCompact: { fontSize: 11 },
  rangeLbl: { ...Typography.labelCaps, color: T.muted, fontSize: 8 },

  powerPanel: { flex: 1, backgroundColor: T.panel, padding: Spacing.sm, borderWidth: Border.width, borderColor: Border.color, minHeight: 0 },
  powerBig: { flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 2, marginBottom: 2 },
  powerVal: { ...Typography.dataMono, color: T.text, fontSize: 24, lineHeight: 28 },
  powerValCompact: { fontSize: 18, lineHeight: 22 },
  powerUnit: { ...Typography.labelCaps, color: T.muted, fontSize: 9, paddingBottom: 2 },
  powerSub: { ...Typography.labelCaps, color: T.muted, fontSize: 8, marginBottom: Spacing.xs },
  loadRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  loadLabel: { ...Typography.labelCaps, flex: 1, color: T.muted, fontSize: 8 },
  loadPct: { ...Typography.dataMono, fontSize: 9 },
});
