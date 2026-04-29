import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, Dimensions, Linking } from "react-native";
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

import { Colors, Typography, Spacing, Border } from "@/theme";

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
function Speedometer({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) {
  const SIZE = 120;
  const pct = Math.min(value / max, 1);
  const needleAngle = -60 + pct * 120;
  const cx = 130, cy = 130, nr = 65;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip = { x: cx + nr * Math.cos(rad), y: cy + nr * Math.sin(rad) };
  const b1  = { x: cx + 5 * Math.cos(rad + Math.PI / 2), y: cy + 5 * Math.sin(rad + Math.PI / 2) };
  const b2  = { x: cx + 5 * Math.cos(rad - Math.PI / 2), y: cy + 5 * Math.sin(rad - Math.PI / 2) };

  return (
    <View style={{ alignItems: "center" }}>
      <Text style={ss.label}>{label}</Text>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 260 260">
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
        <SvgText x={130} y={166} textAnchor="middle" fill={T.text} fontSize={28} fontWeight="bold">
          {value < 10 ? value.toFixed(1) : Math.round(value).toString()}
        </SvgText>
        <SvgText x={130} y={182} textAnchor="middle" fill={T.muted} fontSize={12}>{unit}</SvgText>
      </Svg>
    </View>
  );
}
const ss = StyleSheet.create({
  label: { color: T.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 },
});

// ─── Gear Grid ───────────────────────────────────────────────
const GEAR_ROWS = [["1","2","3","4"],["F","N","R"],["H","N","L"]];
function GearGrid({ active, onSelect }: { active: string; onSelect: (g: string) => void }) {
  return (
    <View style={gg.wrap}>
      <Text style={ss.label}>Gear</Text>
      {GEAR_ROWS.map((row, ri) => (
        <View key={ri} style={gg.row}>
          {row.map((g) => {
            const on = g === active;
            return (
              <Pressable key={`${ri}-${g}`} style={[gg.btn, on && gg.on]}
                onPress={() => { Haptics.selectionAsync(); onSelect(g); }}>
                <Text style={[gg.txt, on && gg.txtOn]}>{g}</Text>
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
  row: { flexDirection: "row", gap: 3 },
  btn: { flex: 1, backgroundColor: "rgba(35,39,41,1)", borderRadius: 5, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center", paddingVertical: 7 },
  on: { backgroundColor: T.green, borderColor: T.green },
  txt: { color: T.muted, fontSize: 13, fontWeight: "700" },
  txtOn: { color: "rgba(21,25,27,1)" },
});

// ─── Compass ─────────────────────────────────────────────────
function Compass({ heading }: { heading: number }) {
  const S = 80, cx = 40, cy = 40, r = 33;
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
      <Text style={ss.label}>Heading</Text>
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
          <Text style={cp.deg}>{Math.round(heading)}°</Text>
          <Text style={cp.card}>{card}</Text>
        </View>
      </View>
    </View>
  );
}
const cp = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  deg: { color: T.red, fontSize: 22, fontWeight: "700" },
  card: { color: T.green, fontSize: 12, fontWeight: "700" },
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

function MapPanel({ lat, lng }: { lat: number; lng: number }) {
  const iframeRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !iframeRef.current) return;
    try { iframeRef.current.contentWindow?.postMessage(JSON.stringify({ lat, lng }), "*"); } catch {}
  }, [lat, lng]);

  if (Platform.OS !== "web") {
    return (
      <View style={mp.fallback}>
        <MaterialCommunityIcons name="map-marker-radius" size={28} color={T.muted} />
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
function StatRow({ icon, label, value, color, unit }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; label: string; value: string; color?: string; unit?: string }) {
  return (
    <View style={sr.row}>
      <MaterialCommunityIcons name={icon} size={12} color={color ?? T.muted} />
      <Text style={sr.label}>{label}</Text>
      <Text style={[sr.value, color ? { color } : {}]}>{value}{unit ? <Text style={sr.unit}> {unit}</Text> : null}</Text>
    </View>
  );
}
const sr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)" },
  label: { flex: 1, color: T.muted, fontSize: 8 },
  value: { color: T.text, fontSize: 9, fontWeight: "700" },
  unit: { color: T.muted, fontSize: 7, fontWeight: "400" },
});

// ─── Responsive Design Hook ───────────────────────────────────
function useResponsiveLayout() {
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  
  useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);
  
  const { width, height } = screenData;
  const isSmallScreen = width < 768;
  const isMediumScreen = width >= 768 && width < 1024;
  const isLargeScreen = width >= 1024;
  
  return {
    width,
    height,
    isSmallScreen,
    isMediumScreen,
    isLargeScreen,
    shouldStackRight: width < 900,
    rightSectionWidth: isSmallScreen ? '100%' : isMediumScreen ? 350 : 400
  };
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────
export default function DashboardScreen() {
  const { selectedDevice, connectionStatus, packets, quickConnect, disconnectDevice } = useUsb();
  const parsed = useParsedUsbData(packets);
  const isConnected = connectionStatus === "connected";
  const { isSmallScreen, isMediumScreen, shouldStackRight } = useResponsiveLayout();

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

  return (
    <View style={s.root}>
      <Header />
      {/* ── Status bar ── */}
      <View style={s.statusBar}>
        <Text style={s.sbTime}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        <MaterialCommunityIcons name="usb" size={14} color={isConnected ? T.green : T.muted} />
        <Text style={s.sbTitle}>{selectedDevice?.name ?? "USB Data Logger"}</Text>
        {selectedDevice && (
          <Text style={s.sbVid}>VID:{selectedDevice.vendorId?.toString(16).toUpperCase()}</Text>
        )}

        {/* GPS badge */}
        <View style={[s.gpsBadge, { backgroundColor: gpsFix ? "rgba(110,220,161,0.12)" : "rgba(255,80,60,0.1)", borderColor: gpsFix ? "rgba(110,220,161,0.45)" : "rgba(255,80,60,0.4)" }]}>
          <View style={[s.gpsDot, { backgroundColor: gpsFix ? T.green : T.red }]} />
          <Text style={[s.gpsTxt, { color: gpsFix ? T.green : T.red }]}>{gpsFix ? "GPS OK" : "No Fix"}</Text>
        </View>

        {/* Shared USB connection bar (compact) */}
        <UsbConnectionBar compact />
      </View>

      {/* ── Left, Center, Right Sections ── */}
      <View style={s.mainContainer}>
        {/* ══ LEFT SECTION: Speed + Gear + Heading ══ */}
        <View style={s.leftSection}>
          <View style={s.sec}>
            <Speedometer value={dataRate} max={12} label="Data Rate" unit="KB/s" />
          </View>
          <View style={s.divH} />
          <View style={s.sec}>
            <GearGrid active={activeGear} onSelect={setActiveGear} />
          </View>
          <View style={s.divH} />
          <View style={s.sec}>
            <Compass heading={heading} />
          </View>
        </View>

        {/* ══ CENTER SECTION: Field Navigation + Map + Stream ══ */}
        <View style={s.centerSection}>
          {/* Nav header */}
          <View style={s.navHead}>
            <View style={s.navTitleRow}>
              <MaterialCommunityIcons name="map-marker-radius" size={16} color={T.blue} />
              <Text style={s.navTitle}>Field Navigation</Text>
              <View style={[s.badge2, { backgroundColor: isConnected ? "rgba(110,220,161,0.12)" : "rgba(255,80,60,0.08)", borderColor: isConnected ? "rgba(110,220,161,0.4)" : "rgba(255,80,60,0.3)" }]}>
                <Text style={[s.badge2Txt, { color: isConnected ? T.green : T.red }]}>{isConnected ? "● LIVE" : "○ OFFLINE"}</Text>
              </View>
              <Pressable style={s.mapsBtn} onPress={openGoogleMaps}>
                <MaterialCommunityIcons name="google-maps" size={14} color="#4285F4" />
                <Text style={s.mapsBtnTxt}>Maps</Text>
              </Pressable>
            </View>
            <View style={s.chipRow}>
              {[`LAT ${lat.toFixed(5)}`, `LNG ${lng.toFixed(5)}`, `HDG ${Math.round(heading)}°`, `PKT/s ${pktRate}`].map((c) => (
                <View key={c} style={s.chip}><Text style={s.chipTxt}>{c}</Text></View>
              ))}
            </View>
          </View>

          {/* Satellite map */}
          <View style={s.mapBox}>
            <MapPanel lat={lat} lng={lng} />
          </View>

          {/* Live data stream from packets */}
          <View style={s.streamBox}>
            <View style={s.streamHead}>
              <MaterialCommunityIcons name="broadcast" size={12} color={T.green} />
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

        {/* ══ RIGHT SECTION: Responsive Layout ══ */}
        <View style={[s.rightSection, shouldStackRight && { flexDirection: 'column', minWidth: 160, maxWidth: 200 }]}>
          {/* Battery Panel */}
          <View style={[s.rightTopPart, shouldStackRight && { marginBottom: 8, marginRight: 0 }]}>
            <View style={s.battPanel}>
              <Text style={s.panelTitle}>Battery</Text>

              {/* Big SOC */}
              <Text style={[s.socBig, { color: socColor }]}>{soc}<Text style={s.socUnit}>%</Text></Text>
              <Bar pct={socBarPct} color={socColor} />
              <Text style={s.socLabel}>State of Charge</Text>

              <View style={{ height: 6 }} />

              <View style={s.battRow}>
                <View style={{ flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <BatteryIcon soc={soc} size={shouldStackRight ? 136 : 142} />
                  <MaterialCommunityIcons name="lightning-bolt" size={shouldStackRight ? 16 : 20} color={socColor} />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MaterialCommunityIcons name="flash" size={14} color={T.blue} />
                      <View>
                        <Text style={s.battVal}>{voltage} V</Text>
                        <Text style={s.battSub}>Pack Voltage</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MaterialCommunityIcons name="current-ac" size={14} color={T.green} />
                      <View>
                        <Text style={s.battVal}>{current} A</Text>
                        <Text style={s.battSub}>Current</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={s.divH} />

              <StatRow icon="thermometer" label="Pack Temp" value={packTemp} color={parseFloat(packTemp) > 45 ? T.orange : T.blue} unit="°C" />
              <Bar pct={tempBarPct} color={parseFloat(packTemp) > 45 ? T.orange : T.blue} />

              <View style={{ height: 4 }} />
              <StatRow icon="database" label="RX Total" value={fmtBytes(rxBytes)} color={T.blue} />
              <StatRow icon="upload" label="TX Total" value={fmtBytes(txBytes)} color={T.green} />

              <View style={s.divH} />

              <View style={s.rangeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rangeVal}>{fmtBytes(parsed.totalRxBytes)}</Text>
                  <Text style={s.rangeLbl}>Total Received</Text>
                </View>
                <View style={s.rangeDiv} />
                <View style={{ flex: 1, paddingLeft: 8 }}>
                  <Text style={s.rangeVal}>{fmtUptime(parsed.uptimeSec || sessionSec)}</Text>
                  <Text style={s.rangeLbl}>Uptime</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Power Panel */}
          <View style={[s.rightBottomPart, shouldStackRight && { marginLeft: 0 }]}>
            <View style={s.powerPanel}>
              <Text style={s.panelTitle}>Motor & Power</Text>

 {/* Motor Load & Data Rate in row format like battery */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="gauge" size={14} color={loadColor} />
                  <View>
                    <Text style={s.battVal}>{Math.round(motorLoad)}%</Text>
                    <Text style={s.battSub}>Motor Load</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="speedometer" size={14} color={T.blue} />
                  <View>
                    <Text style={s.battVal}>{dataRate.toFixed(2)} KB/s</Text>
                    <Text style={s.battSub}>Data Rate</Text>
                  </View>
                </View>
              </View>

              {/* Big RPM with Motor Icon */}
              <View style={{ flexDirection: "column", alignItems: "center", marginBottom: 8 }}>
                <MotorIcon 
                  motorRpm={motorRpm}
                  motorLoad={motorLoad}
                  motorTemp={motorTemp}
                  isRunning={motorRpm > 0}
                />
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 6 }}>
                  <Text style={s.powerVal}>{motorRpm}</Text>
                  <Text style={s.powerUnit}>RPM</Text>
                </View>
                <Text style={s.powerSub}>Motor Speed</Text>
              </View>

              <View style={{ height: 6 }} />

             
              <View style={s.divH} />

              <StatRow icon="thermometer" label="Motor Temp" value={`${motorTemp}°C`} color={motorTemp > "60" ? T.red : T.orange} />
              <Bar pct={parseFloat(motorTemp) / 120 * 100} color={motorTemp > "60" ? T.red : T.orange} />

              <View style={{ height: 4 }} />
              <StatRow icon="flash" label="HV Voltage" value={`${voltage} V`} color={T.blue} />
              <StatRow icon="current-ac" label="Pack Current" value={`${current} A`} color={T.green} />
              <StatRow icon="counter" label="Heartbeat" value={parsed.heartbeat.toString()} color={T.muted} />
              <StatRow icon="clock-outline" label="Session" value={fmtUptime(sessionSec)} color={T.muted} />
            </View>
          </View>
        </View>
      </View>

      {/* ── Bottom Nav ── */}
      <BottomNav />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, flexDirection: "column" },

  statusBar: { height: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.gutter, gap: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Border.color, backgroundColor: Colors.surfaceContainerLowest },
  sbTime:    { ...Typography.labelCaps, color: T.muted, fontSize: 10 },
  sbTitle:   { ...Typography.labelCaps, color: T.text, fontSize: 11, flex: 1 },
  sbVid:     { ...Typography.labelCaps, color: T.blue, fontSize: 8 },
  gpsBadge:  { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderWidth: Border.width },
  gpsDot:    { width: 5, height: 5, borderRadius: 3 },
  gpsTxt:    { ...Typography.labelCaps, fontSize: 8 },
  usbBtn:    { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderWidth: Border.width },
  usbTxt:    { ...Typography.labelCaps, fontSize: 8 },

  mainContainer: { flex: 1, flexDirection: "row", padding: Spacing.xs },

  leftSection: { flex: 1, minWidth: 140, maxWidth: 160, borderRightWidth: Border.width, borderRightColor: Border.color, padding: Spacing.sm, backgroundColor: T.panel },

  centerSection: { flex: 2, minWidth: 200, flexDirection: "column", borderRightWidth: Border.width, borderRightColor: Border.color },

  rightSection: { flex: 1, minWidth: 300, maxWidth: 400, flexDirection: "row", padding: Spacing.xs, gap: Spacing.sm },

  rightTopPart: { flex: 1, marginRight: 3 },

  rightBottomPart: { flex: 1, marginLeft: 3 },

  divH: { height: Border.width, backgroundColor: Border.color, marginVertical: Spacing.sm },
  sec:  { flex: 1, justifyContent: "center" },

  navHead: { paddingHorizontal: Spacing.panelPadding, paddingTop: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: Border.width, borderBottomColor: Border.color, gap: Spacing.sm },
  navTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  navTitle: { ...Typography.headlineMd, color: T.text, fontSize: 14, flex: 1 },
  badge2: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderWidth: Border.width },
  badge2Txt: { ...Typography.labelCaps, fontSize: 8 },
  mapsBtn: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, backgroundColor: "rgba(66,133,244,0.12)", borderWidth: Border.width, borderColor: "rgba(66,133,244,0.35)", paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  mapsBtnTxt: { ...Typography.labelCaps, color: "#4285F4", fontSize: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  chip: { backgroundColor: Colors.surfaceContainerHigh, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  chipTxt: { ...Typography.labelCaps, color: T.muted, fontSize: 8 },
  mapBox: { flex: 1, overflow: "hidden" },
  streamBox: { borderTopWidth: Border.width, borderTopColor: Border.color, padding: Spacing.panelPadding, gap: Spacing.xs },
  streamHead: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  streamTitle: { ...Typography.labelCaps, flex: 1, color: T.muted, fontSize: 8 },
  streamCount: { ...Typography.labelCaps, color: T.dim, fontSize: 8 },
  streamEmpty: { ...Typography.bodyMd, color: T.dim, fontSize: 10, fontStyle: "italic" },

  battPanel: { flex: 1, backgroundColor: T.panel, padding: Spacing.sm, borderWidth: Border.width, borderColor: Border.color, minHeight: 200 },
  panelTitle: { ...Typography.labelCaps, color: T.muted, fontSize: 9, marginBottom: Spacing.sm },
  socBig: { ...Typography.headlineLg, lineHeight: 32 },
  socUnit: { ...Typography.headlineMd, fontSize: 12 },
  socLabel: { ...Typography.labelCaps, color: T.muted, fontSize: 8, marginTop: 2, marginBottom: Spacing.sm },
  battRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.xs },
  battVal: { ...Typography.dataMono, color: T.text, fontSize: 16 },
  battSub: { ...Typography.bodyMd, color: T.muted, fontSize: 9 },
  rangeRow: { flexDirection: "row", alignItems: "center" },
  rangeDiv: { width: Border.width, height: 32, backgroundColor: Border.color },
  rangeVal: { ...Typography.dataMono, color: T.text, fontSize: 13 },
  rangeLbl: { ...Typography.labelCaps, color: T.muted, fontSize: 8 },

  powerPanel: { flex: 1, backgroundColor: T.panel, padding: Spacing.sm, borderWidth: Border.width, borderColor: Border.color, minHeight: 200 },
  powerBig: { flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 2, marginBottom: 2 },
  powerVal: { ...Typography.dataMono, color: T.text, fontSize: 24, lineHeight: 28 },
  powerUnit: { ...Typography.labelCaps, color: T.muted, fontSize: 9, paddingBottom: 2 },
  powerSub: { ...Typography.labelCaps, color: T.muted, fontSize: 8, marginBottom: Spacing.xs },
  loadRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  loadLabel: { ...Typography.labelCaps, flex: 1, color: T.muted, fontSize: 8 },
  loadPct: { ...Typography.dataMono, fontSize: 9 },
});
