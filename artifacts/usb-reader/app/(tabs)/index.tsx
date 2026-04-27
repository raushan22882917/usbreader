import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Svg, { Path, Circle, ClipPath, Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { useUsb } from "@/context/UsbContext";
import { useParsedUsbData } from "@/hooks/useParsedUsbData";
import { BottomNav } from "@/components/BottomNav";

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
  const SIZE = 148;
  const pct = Math.min(value / max, 1);
  const needleAngle = -60 + pct * 120;
  const cx = 160, cy = 160, nr = 78;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip = { x: cx + nr * Math.cos(rad), y: cy + nr * Math.sin(rad) };
  const b1  = { x: cx + 5 * Math.cos(rad + Math.PI / 2), y: cy + 5 * Math.sin(rad + Math.PI / 2) };
  const b2  = { x: cx + 5 * Math.cos(rad - Math.PI / 2), y: cy + 5 * Math.sin(rad - Math.PI / 2) };

  return (
    <View style={{ alignItems: "center" }}>
      <Text style={ss.label}>{label}</Text>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 320 320">
        <Path d="M90,40 L160,160 L230,40 Z" fill="#FF9811" />
        <Path d="M160,160 L0,160 L90,40 Z" fill="#FFDA44" />
        <Path d="M160,160 L320,160 L230,40 Z" fill="#FF5023" />
        <Path d="M160,0 L160,40 C226.273,40 280,93.726 280,160 C280,226.274 226.273,280 160,280 L160,320 C248.365,320 320,248.366 320,160 C320,71.635 248.365,0 160,0 Z" fill="#006DF0" />
        <Path d="M40,160 C40,93.726 93.727,40 160,40 L160,0 C71.635,0 0,71.634 0,160 C0,248.366 71.635,320 160,320 L160,280 C93.727,280 40,226.274 40,160 Z" fill="#0052B4" />
        <Circle cx={160} cy={160} r={82} fill="rgba(21,25,27,1)" />
        <Defs>
          <LinearGradient id="ng" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={T.green} />
            <Stop offset="1" stopColor={T.yellow} />
          </LinearGradient>
        </Defs>
        <Path d={`M${tip.x},${tip.y} L${b1.x},${b1.y} L${b2.x},${b2.y}Z`} fill="url(#ng)" />
        <Circle cx={160} cy={160} r={10} fill="rgba(21,25,27,1)" stroke={T.green} strokeWidth={2} />
        <SvgText x={160} y={204} textAnchor="middle" fill={T.text} fontSize={34} fontWeight="bold">
          {value < 10 ? value.toFixed(1) : Math.round(value).toString()}
        </SvgText>
        <SvgText x={160} y={224} textAnchor="middle" fill={T.muted} fontSize={14}>{unit}</SvgText>
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
  track: { height: 5, backgroundColor: T.border, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
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
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "rgba(35,39,41,1)" },
  label: { flex: 1, color: T.muted, fontSize: 10 },
  value: { color: T.text, fontSize: 11, fontWeight: "700" },
  unit: { color: T.muted, fontSize: 9, fontWeight: "400" },
});

// ─── MAIN DASHBOARD ──────────────────────────────────────────
export default function DashboardScreen() {
  const { selectedDevice, connectionStatus, packets, quickConnect, disconnectDevice } = useUsb();
  const parsed = useParsedUsbData(packets);
  const isConnected = connectionStatus === "connected";

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

  // Slowly rotate heading when connected
  useEffect(() => {
    if (!isConnected) return;
    const t = setInterval(() => setHeading((h) => (h + (Math.random() * 2 - 1) + 360) % 360), 1500);
    return () => clearInterval(t);
  }, [isConnected]);

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

        {/* USB connect / disconnect */}
        <Pressable
          style={[s.usbBtn, { backgroundColor: isConnected ? "rgba(110,220,161,0.12)" : "rgba(255,80,60,0.1)", borderColor: isConnected ? "rgba(110,220,161,0.45)" : "rgba(255,80,60,0.35)" }]}
          onPress={handleToggleUsb}
        >
          <MaterialCommunityIcons name={isConnected ? "link" : "link-off"} size={13} color={isConnected ? T.green : T.red} />
          <Text style={[s.usbTxt, { color: isConnected ? T.green : T.red }]}>{isConnected ? "ONLINE" : "CONNECT"}</Text>
        </Pressable>
      </View>

      {/* ── Four panels ── */}
      <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={s.body} showsHorizontalScrollIndicator={false}>

        {/* ══ LEFT: Speed + Gear + Heading ══ */}
        <View style={s.leftPanel}>
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

        {/* ══ CENTER: Field Navigation + Map + Last packet ══ */}
        <View style={s.centerPanel}>
          {/* Nav header */}
          <View style={s.navHead}>
            <View style={s.navTitleRow}>
              <MaterialCommunityIcons name="map-marker-radius" size={16} color={T.blue} />
              <Text style={s.navTitle}>Field Navigation</Text>
              <View style={[s.badge2, { backgroundColor: isConnected ? "rgba(110,220,161,0.12)" : "rgba(255,80,60,0.08)", borderColor: isConnected ? "rgba(110,220,161,0.4)" : "rgba(255,80,60,0.3)" }]}>
                <Text style={[s.badge2Txt, { color: isConnected ? T.green : T.red }]}>{isConnected ? "● LIVE" : "○ OFFLINE"}</Text>
              </View>
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

        {/* ══ BATTERY PANEL ══ */}
        <View style={s.battPanel}>
          <Text style={s.panelTitle}>Battery</Text>

          {/* Big SOC */}
          <Text style={[s.socBig, { color: socColor }]}>{soc}<Text style={s.socUnit}>%</Text></Text>
          <Bar pct={socBarPct} color={socColor} />
          <Text style={s.socLabel}>State of Charge</Text>

          <View style={{ height: 8 }} />

          <View style={s.battRow}>
            <BatteryIcon soc={soc} size={28} />
            <View style={{ flex: 1, gap: 6 }}>
              <View>
                <Text style={s.battVal}>{voltage} V</Text>
                <Text style={s.battSub}>Pack Voltage</Text>
              </View>
              <View>
                <Text style={s.battVal}>{current} A</Text>
                <Text style={s.battSub}>Current</Text>
              </View>
            </View>
          </View>

          <View style={s.divH} />

          <StatRow icon="thermometer" label="Pack Temp" value={packTemp} color={parseFloat(packTemp) > 45 ? T.orange : T.blue} unit="°C" />
          <Bar pct={tempBarPct} color={parseFloat(packTemp) > 45 ? T.orange : T.blue} />

          <View style={{ height: 6 }} />
          <StatRow icon="database" label="RX Total" value={fmtBytes(rxBytes)} color={T.blue} />
          <StatRow icon="upload" label="TX Total" value={fmtBytes(txBytes)} color={T.green} />

          <View style={s.divH} />

          <View style={s.rangeRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.rangeVal}>{fmtBytes(parsed.totalRxBytes)}</Text>
              <Text style={s.rangeLbl}>Total Received</Text>
            </View>
            <View style={s.rangeDiv} />
            <View style={{ flex: 1, paddingLeft: 10 }}>
              <Text style={s.rangeVal}>{fmtUptime(parsed.uptimeSec || sessionSec)}</Text>
              <Text style={s.rangeLbl}>Uptime</Text>
            </View>
          </View>
        </View>

        {/* ══ POWER / MOTOR PANEL ══ */}
        <View style={s.powerPanel}>
          <Text style={s.panelTitle}>Motor & Power</Text>

          {/* Big RPM */}
          <View style={s.powerBig}>
            <Text style={s.powerVal}>{motorRpm}</Text>
            <Text style={s.powerUnit}>RPM</Text>
          </View>
          <Text style={s.powerSub}>Motor Speed</Text>

          <View style={{ height: 10 }} />

          {/* Motor load bar */}
          <View style={s.loadRow}>
            <Text style={s.loadLabel}>Motor Load</Text>
            <Text style={[s.loadPct, { color: loadColor }]}>{Math.round(motorLoad)}%</Text>
          </View>
          <Bar pct={motorLoad} color={loadColor} />

          <View style={{ height: 6 }} />

          <View style={s.loadRow}>
            <Text style={s.loadLabel}>Data Rate</Text>
            <Text style={[s.loadPct, { color: T.blue }]}>{dataRate.toFixed(2)} KB/s</Text>
          </View>
          <Bar pct={(dataRate / 12) * 100} color={T.blue} />

          <View style={s.divH} />

          <StatRow icon="engine" label="Motor RPM" value={motorRpm.toString()} color={T.yellow} />
          <StatRow icon="thermometer" label="Motor Temp" value={`${motorTemp}°C`} color={motorTemp > "60" ? T.red : T.orange} />
          <StatRow icon="flash" label="HV Voltage" value={`${voltage} V`} color={T.blue} />
          <StatRow icon="current-ac" label="Pack Current" value={`${current} A`} color={T.green} />
          <StatRow icon="counter" label="Heartbeat" value={parsed.heartbeat.toString()} color={T.muted} />
          <StatRow icon="clock-outline" label="Session" value={fmtUptime(sessionSec)} color={T.muted} />
        </View>
      </ScrollView>

      {/* ── Bottom Nav ── */}
      <BottomNav />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, flexDirection: "column" },

  statusBar: { height: 34, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 7, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.panel },
  sbTime:    { color: T.muted, fontSize: 11, fontWeight: "600" },
  sbTitle:   { color: T.text, fontSize: 12, fontWeight: "700", flex: 1 },
  sbVid:     { color: T.blue, fontSize: 9, fontWeight: "600" },
  gpsBadge:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  gpsDot:    { width: 5, height: 5, borderRadius: 3 },
  gpsTxt:    { fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
  usbBtn:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  usbTxt:    { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  body: { flexDirection: "row", flexGrow: 1 },
  divH: { height: 1, backgroundColor: T.border, marginVertical: 6 },
  sec:  { flex: 1, justifyContent: "center" },

  leftPanel: { width: 158, borderRightWidth: 1, borderRightColor: T.border, padding: 10, backgroundColor: T.panel },

  centerPanel: { width: 340, flexDirection: "column", borderRightWidth: 1, borderRightColor: T.border },
  navHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: T.border, gap: 6 },
  navTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  navTitle: { color: T.text, fontSize: 15, fontWeight: "700", flex: 1 },
  badge2: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  badge2Txt: { fontSize: 9, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: { backgroundColor: "rgba(35,39,41,1)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chipTxt: { color: T.muted, fontSize: 8, fontWeight: "700" },
  mapBox: { flex: 1, overflow: "hidden" },
  streamBox: { borderTopWidth: 1, borderTopColor: T.border, padding: 10, gap: 5 },
  streamHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  streamTitle: { flex: 1, color: T.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  streamCount: { color: T.dim, fontSize: 8 },
  streamEmpty: { color: T.dim, fontSize: 10, fontStyle: "italic" },

  battPanel: { width: 172, borderRightWidth: 1, borderRightColor: T.border, padding: 12 },
  panelTitle: { color: T.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  socBig: { fontSize: 48, fontWeight: "700", lineHeight: 52 },
  socUnit: { fontSize: 18, fontWeight: "600" },
  socLabel: { color: T.muted, fontSize: 9, marginTop: 3, marginBottom: 8 },
  battRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  battVal: { color: T.text, fontSize: 15, fontWeight: "700" },
  battSub: { color: T.muted, fontSize: 8 },
  rangeRow: { flexDirection: "row", alignItems: "center" },
  rangeDiv: { width: 1, height: 32, backgroundColor: T.border },
  rangeVal: { color: T.text, fontSize: 13, fontWeight: "700" },
  rangeLbl: { color: T.muted, fontSize: 8 },

  powerPanel: { width: 195, padding: 12 },
  powerBig: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 },
  powerVal: { color: T.text, fontSize: 40, fontWeight: "700", lineHeight: 44 },
  powerUnit: { color: T.muted, fontSize: 13, paddingBottom: 4 },
  powerSub: { color: T.muted, fontSize: 9 },
  loadRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  loadLabel: { flex: 1, color: T.muted, fontSize: 9 },
  loadPct: { fontSize: 10, fontWeight: "700" },
});
