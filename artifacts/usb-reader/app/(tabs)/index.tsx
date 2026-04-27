import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Svg, {
  Path,
  Circle,
  G,
  Line,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
  Rect,
} from "react-native-svg";
import { useUsb } from "@/context/UsbContext";

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:       "#16181a",
  panel:    "#1e2124",
  border:   "#2b2d30",
  text:     "#ffffff",
  muted:    "#888b8e",
  dim:      "#555759",
  green:    "#4ade80",
  greenDk:  "#166534",
  yellow:   "#FFC832",
  orange:   "#ff9500",
  red:      "#ff453a",
  blue:     "#0a84ff",
  blueDk:   "#1e3a5f",
  cyan:     "#50B4FF",
  teal:     "#6EDCA1",
};

// ─── Speedometer ─────────────────────────────────────────────────────────────
function Speedometer({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) {
  const cx = 70, cy = 72, R_outer = 58, R_mid = 44, R_inner = 32;
  const startA = -220, endA = 40; // total 260deg arc
  const pct = Math.min(value / max, 1);
  const valA = startA + pct * (endA - startA);

  function polar(r: number, deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arc(r: number, a1: number, a2: number, sweep = 1) {
    const s = polar(r, a1);
    const e = polar(r, a2);
    const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
  }

  // Color zones for outer arc (startA to endA is 260 deg)
  const zones = [
    { from: startA, to: startA + 0.45 * 260, color: "#4ade80" },
    { from: startA + 0.45 * 260, to: startA + 0.72 * 260, color: T.yellow },
    { from: startA + 0.72 * 260, to: startA + 0.87 * 260, color: T.orange },
    { from: startA + 0.87 * 260, to: endA, color: T.red },
  ];

  // Needle tip
  const needleTip = polar(R_mid - 2, valA);
  const needleBase1 = polar(6, valA + 90);
  const needleBase2 = polar(6, valA - 90);

  // Tick marks
  const ticks: React.ReactElement[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = startA + (i / 20) * (endA - startA);
    const isMajor = i % 5 === 0;
    const inner = polar(R_outer - (isMajor ? 9 : 5), a);
    const outer = polar(R_outer - 1, a);
    ticks.push(
      <Line
        key={i}
        x1={inner.x} y1={inner.y}
        x2={outer.x} y2={outer.y}
        stroke={isMajor ? T.text : T.dim}
        strokeWidth={isMajor ? 1.5 : 0.8}
      />
    );
  }

  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text style={spd.label}>{label}</Text>
      <Svg width={140} height={148}>
        {/* Dark background circle */}
        <Circle cx={cx} cy={cy} r={R_outer + 6} fill="#0d0f11" />

        {/* Outer ring colored zones */}
        {zones.map((z, i) => (
          <Path key={i} d={arc(R_outer, z.from, z.to)} stroke={z.color} strokeWidth={6} fill="none" strokeLinecap="round" />
        ))}

        {/* Blue inner arc */}
        <Path d={arc(R_mid + 3, startA, endA)} stroke="#1e3a5f" strokeWidth={8} fill="none" />
        <Path d={arc(R_mid + 3, startA, valA)} stroke={T.blue} strokeWidth={8} fill="none" strokeLinecap="round" />

        {/* Tick marks */}
        {ticks}

        {/* Needle */}
        <Path
          d={`M ${needleBase1.x} ${needleBase1.y} L ${needleTip.x} ${needleTip.y} L ${needleBase2.x} ${needleBase2.y} Z`}
          fill={T.green}
        />
        <Circle cx={cx} cy={cy} r={6} fill="#222" stroke={T.green} strokeWidth={2} />

        {/* Center value */}
        <SvgText x={cx} y={cy + 2} textAnchor="middle" fill={T.text} fontSize={20} fontWeight="700">{value.toFixed(1)}</SvgText>
        <SvgText x={cx} y={cy + 16} textAnchor="middle" fill={T.muted} fontSize={9}>{unit}</SvgText>
      </Svg>
    </View>
  );
}
const spd = StyleSheet.create({
  label: { color: T.muted, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
});

// ─── Gear Grid ────────────────────────────────────────────────────────────────
type GearButton = { label: string; active?: boolean; span?: number };
function GearGrid({ title, rows, activeGear, onSelect }: { title: string; rows: GearButton[][]; activeGear: string; onSelect: (l: string) => void }) {
  return (
    <View style={gg.root}>
      <Text style={gg.title}>{title}</Text>
      {rows.map((row, ri) => (
        <View key={ri} style={gg.row}>
          {row.map(({ label, span }) => {
            const isActive = label === activeGear;
            return (
              <Pressable
                key={label}
                style={[
                  gg.btn,
                  isActive && gg.btnActive,
                  span === 2 && { flex: 2 },
                ]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(label); }}
              >
                <Text style={[gg.btnTxt, isActive && gg.btnTxtActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
const gg = StyleSheet.create({
  root: { gap: 4 },
  title: { color: T.muted, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, marginBottom: 2 },
  row: { flexDirection: "row", gap: 4 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: "#252729", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.border },
  btnActive: { backgroundColor: T.greenDk, borderColor: T.green },
  btnTxt: { color: T.muted, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  btnTxtActive: { color: T.green },
});

// ─── Compass ──────────────────────────────────────────────────────────────────
function Compass({ heading, label }: { heading: number; label: string }) {
  const cx = 48, cy = 48, R = 40;
  const headRad = ((heading - 90) * Math.PI) / 180;
  const nx = cx + R * 0.55 * Math.cos(headRad);
  const ny = cy + R * 0.55 * Math.sin(headRad);
  const tx = cx - R * 0.55 * Math.cos(headRad);
  const ty = cy - R * 0.55 * Math.sin(headRad);

  const cardinals = [
    { label: "N", a: -90 },
    { label: "E", a: 0 },
    { label: "S", a: 90 },
    { label: "W", a: 180 },
  ];

  return (
    <View style={cmp.root}>
      <Text style={cmp.title}>Direction</Text>
      <View style={cmp.row}>
        <Svg width={96} height={96}>
          <Circle cx={cx} cy={cy} r={R + 4} fill={T.blueDk} />
          <Circle cx={cx} cy={cy} r={R} fill="#122038" />
          {/* Tick marks */}
          {Array.from({ length: 32 }).map((_, i) => {
            const a = (i / 32) * 360 - 90;
            const rad = (a * Math.PI) / 180;
            const isMaj = i % 8 === 0;
            const r1 = R - 3;
            const r2 = R - (isMaj ? 9 : 5);
            return (
              <Line key={i}
                x1={cx + r1 * Math.cos(rad)} y1={cy + r1 * Math.sin(rad)}
                x2={cx + r2 * Math.cos(rad)} y2={cy + r2 * Math.sin(rad)}
                stroke={isMaj ? "#4488cc" : "#1a4060"} strokeWidth={isMaj ? 1.5 : 0.8}
              />
            );
          })}
          {/* Cardinal labels */}
          {cardinals.map(({ label: cl, a }) => {
            const rad = (a * Math.PI) / 180;
            const r = R - 14;
            return (
              <SvgText key={cl} x={cx + r * Math.cos(rad)} y={cy + r * Math.sin(rad) + 3.5}
                textAnchor="middle" fill="#4488cc" fontSize={8} fontWeight="700">
                {cl}
              </SvgText>
            );
          })}
          {/* Needle tail (blue) */}
          <Path d={`M ${cx} ${cy} L ${tx} ${ty}`} stroke="#4488cc" strokeWidth={3} strokeLinecap="round" />
          {/* Needle head (red) */}
          <Path d={`M ${cx} ${cy} L ${nx} ${ny}`} stroke={T.red} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={cx} cy={cy} r={4} fill="#333" stroke={T.muted} strokeWidth={1} />
        </Svg>
        <View style={cmp.vals}>
          <Text style={cmp.deg}>{heading}</Text>
          <Text style={cmp.degUnit}>°</Text>
          <Text style={cmp.dirLabel}>{label}</Text>
        </View>
      </View>
    </View>
  );
}
const cmp = StyleSheet.create({
  root: { gap: 2 },
  title: { color: T.muted, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  deg: { color: T.orange, fontSize: 28, fontFamily: "Inter_700Bold", lineHeight: 30 },
  degUnit: { color: T.muted, fontSize: 12 },
  dirLabel: { color: T.green, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  vals: { gap: 2 },
});

// ─── Live Data Stream (replaces satellite map) ────────────────────────────────
function LiveHexStream({ packets, connected }: { packets: any[]; connected: boolean }) {
  const [frame, setFrame] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [packets.length]);

  const fakeRows: string[][] = [];
  const recentPkts = [...packets].slice(-60);

  for (const pkt of recentPkts) {
    const hex = pkt.hexView ?? "";
    const pairs = hex.match(/.{1,2}/g) ?? [];
    for (let i = 0; i < pairs.length; i += 16) {
      fakeRows.push(pairs.slice(i, i + 16));
    }
  }

  // If empty, generate filler rows
  if (fakeRows.length === 0) {
    for (let r = 0; r < 8; r++) {
      fakeRows.push(Array.from({ length: 16 }, (_, i) => ((r * 16 + i) & 0xff).toString(16).padStart(2, "0")));
    }
  }

  const displayRows = fakeRows.slice(-28);

  return (
    <View style={lhs.root}>
      <ScrollView ref={scrollRef} style={lhs.scroll} showsVerticalScrollIndicator={false}>
        {displayRows.map((row, ri) => {
          const isLast = ri === displayRows.length - 1;
          const offset = ri * 16;
          return (
            <View key={ri} style={lhs.row}>
              <Text style={lhs.offset}>{offset.toString(16).padStart(4, "0")}</Text>
              <View style={lhs.bytes}>
                {Array.from({ length: 16 }).map((_, bi) => {
                  const b = row[bi];
                  const val = b ? parseInt(b, 16) : 0;
                  const color = !b ? T.dim : val === 0 ? "#2a3a2a" : val > 200 ? T.red : val > 100 ? T.yellow : T.teal;
                  return (
                    <Text key={bi} style={[lhs.byte, { color, opacity: isLast && bi === row.length - 1 && frame % 2 === 0 ? 0.2 : 1 }]}>
                      {b ?? "  "}
                    </Text>
                  );
                })}
              </View>
              <Text style={lhs.ascii}>
                {row.map((b) => {
                  const v = parseInt(b, 16);
                  return v >= 32 && v < 127 ? String.fromCharCode(v) : "·";
                }).join("")}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Status bar at bottom of stream */}
      <View style={lhs.footer}>
        <View style={[lhs.statusDot, { backgroundColor: connected ? T.green : T.dim }]} />
        <Text style={lhs.footerTxt}>
          {connected ? "● LIVE · USB DATA STREAM" : "○ READY · CONNECT DEVICE TO START"}
        </Text>
        <Text style={lhs.footerRight}>{packets.length} pkts</Text>
      </View>
    </View>
  );
}
const lhs = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080c08", borderWidth: 1, borderColor: T.border, borderRadius: 4, overflow: "hidden" },
  scroll: { flex: 1, padding: 6 },
  row: { flexDirection: "row", gap: 6, marginBottom: 1.5 },
  offset: { color: "#3a5a3a", fontSize: 8.5, fontFamily: "Inter_400Regular", width: 30 },
  bytes: { flexDirection: "row", gap: 3, flex: 1 },
  byte: { fontSize: 8.5, fontFamily: "Inter_400Regular", width: 14, textAlign: "center" },
  ascii: { color: "#3a6a3a", fontSize: 8, fontFamily: "Inter_400Regular", width: 90 },
  footer: { flexDirection: "row", alignItems: "center", backgroundColor: "#0d160d", paddingHorizontal: 6, paddingVertical: 3, borderTopWidth: 1, borderTopColor: "#1a2a1a", gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  footerTxt: { color: "#3a7a3a", fontSize: 8, fontFamily: "Inter_500Medium", flex: 1, letterSpacing: 0.3 },
  footerRight: { color: "#3a7a3a", fontSize: 8, fontFamily: "Inter_400Regular" },
});

// ─── Progress bar row ─────────────────────────────────────────────────────────
function LoadBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={lb.row}>
      <Text style={lb.label}>{label}</Text>
      <View style={lb.track}>
        <View style={[lb.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[lb.pct, { color }]}>{Math.round(pct)}%</Text>
    </View>
  );
}
const lb = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { color: T.muted, fontSize: 10, fontFamily: "Inter_500Medium", width: 68 },
  track: { flex: 1, height: 5, backgroundColor: "#222", borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  pct: { fontSize: 10, fontFamily: "Inter_600SemiBold", width: 26, textAlign: "right" },
});

// ─── Stat row (detail rows at bottom of power panel) ─────────────────────────
function StatRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={sr.row}>
      <Text style={sr.label}>{label}</Text>
      <Text style={sr.value}>{value}{unit ? <Text style={sr.unit}> {unit}</Text> : null}</Text>
    </View>
  );
}
const sr = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: "#1e2124" },
  label: { color: T.muted, fontSize: 10, fontFamily: "Inter_500Medium" },
  value: { color: T.text, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  unit: { color: T.muted, fontSize: 9 },
});

// ─── Battery SVG icon ─────────────────────────────────────────────────────────
function BatteryIcon({ pct, color }: { pct: number; color: string }) {
  return (
    <Svg width={48} height={74}>
      <Rect x={6} y={4} width={36} height={64} rx={5} fill="none" stroke={T.dim} strokeWidth={2} />
      <Rect x={17} y={0} width={14} height={6} rx={2} fill={T.dim} />
      <Rect x={8} y={6 + (1 - pct) * 58} width={32} height={pct * 58} rx={3} fill={color} />
      <SvgText x={24} y={44} textAnchor="middle" fill={T.text} fontSize={13} fontWeight="700">⚡</SvgText>
    </Svg>
  );
}

// ─── Bottom Tab Bar ───────────────────────────────────────────────────────────
type TabItem = {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  route?: string;
  active?: boolean;
  danger?: boolean;
  special?: boolean;
};

function BottomTabs({ currentRoute, connected, onToggleUsb }: { currentRoute: string; connected: boolean; onToggleUsb: () => void }) {
  const tabs: TabItem[] = [
    { icon: "activity",    label: "MONITOR",  route: "/(tabs)/monitor" },
    { icon: "list",        label: "PACKETS",  route: "/(tabs)/monitor" },
    { icon: "terminal",    label: "WRITE",    route: "/(tabs)/write" },
    { icon: "file-text",   label: "DECODER",  route: "/(tabs)/decoder" },
    { icon: "bar-chart-2", label: "STATS",    route: "/(tabs)/monitor" },
    { icon: "zap",         label: "SIGNALS",  route: "/(tabs)/settings" },
    { icon: "menu",        label: "MENU",     route: "/(tabs)/settings" },
    { icon: "home",        label: "HOME",     route: "/(tabs)/index", active: true },
    { icon: "cpu",         label: connected ? "USB ON" : "USB OFF", danger: !connected, special: true },
  ];
  return (
    <View style={bt.bar}>
      {tabs.map((tab, i) => {
        const isHome = tab.active;
        const isUsb = tab.special;
        const bg = isHome ? T.greenDk : isUsb && !connected ? "#3a0a0a" : isUsb ? "#0a2a0a" : "transparent";
        const fg = isHome ? T.green : isUsb && !connected ? T.red : isUsb ? T.green : T.muted;
        return (
          <Pressable
            key={i}
            style={[bt.tab, { backgroundColor: bg }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (tab.special) { onToggleUsb(); }
              else if (tab.route && tab.route !== "/(tabs)/index") { router.push(tab.route as any); }
            }}
          >
            <Feather name={tab.icon} size={18} color={fg} />
            <Text style={[bt.tabLabel, { color: fg }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const bt = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.border, height: 62 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabLabel: { fontSize: 8, fontFamily: "Inter_500Medium", letterSpacing: 0.2, textAlign: "center" },
});

// ─── Coord pill ───────────────────────────────────────────────────────────────
function Pill({ children }: { children: string }) {
  return (
    <View style={pill.root}>
      <Text style={pill.txt}>{children}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  root: { backgroundColor: "#252729", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: T.border },
  txt: { color: T.muted, fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
});

// ─── DIRECTION labels ─────────────────────────────────────────────────────────
function headingLabel(h: number) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(h / 45) % 8];
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const {
    devices, selectedDevice, connectionStatus, packets,
    scanForDevices, connectDevice, disconnectDevice, isScanning, isConnecting,
  } = useUsb();

  const isConnected = connectionStatus === "connected";

  // Simulated live data values
  const [dataRate, setDataRate] = useState(0.0);    // KB/s
  const [heading, setHeading] = useState(248);
  const [sessionSec, setSessionSec] = useState(0);
  const [activeGear, setActiveGear] = useState("2");
  const [activeMode, setActiveMode] = useState("N");
  const [activeSpeed, setActiveSpeed] = useState("N");

  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");
  const totalBytes = packets.reduce((s, p) => s + p.byteLength, 0);
  const rxBytes = rxPkts.reduce((s, p) => s + p.byteLength, 0);
  const txBytes = txPkts.reduce((s, p) => s + p.byteLength, 0);
  const rxPct = Math.min((rxBytes / Math.max(totalBytes, 1)) * 100, 100);
  const txPct = Math.min((txBytes / Math.max(totalBytes, 1)) * 100, 100);
  const loadPct = Math.min((packets.length / 50) * 100, 100);
  const voltage = isConnected ? 4.97 : 0.0;
  const current = rxPkts.length > 0 ? (rxPkts.length * 0.08).toFixed(2) : "0.0";
  const baudRate = activeGear === "1" ? 9600 : activeGear === "2" ? 115200 : activeGear === "3" ? 460800 : 1000000;

  useEffect(() => {
    if (!isConnected) { setDataRate(0); return; }
    const t = setInterval(() => {
      setDataRate((prev) => {
        const target = 0.5 + Math.random() * 8;
        return +(prev * 0.7 + target * 0.3).toFixed(1);
      });
      setHeading((h) => (h + (Math.random() * 4 - 2) + 360) % 360);
    }, 600);
    return () => clearInterval(t);
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) { setSessionSec(0); return; }
    const t = setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isConnected]);

  const sessionHMS = `${Math.floor(sessionSec / 3600)}h ${Math.floor((sessionSec % 3600) / 60)}m`;
  const estRange = isConnected ? Math.floor(rxBytes / 1024) : 0;

  const padL = Platform.OS === "web" ? 0 : insets.left;
  const padR = Platform.OS === "web" ? 0 : insets.right;

  const handleToggleUsb = () => {
    if (isConnected) { disconnectDevice(); }
    else if (selectedDevice) { connectDevice(selectedDevice); }
    else { scanForDevices(); }
  };

  // Last packet's VCC/voltage from demo BMS data
  const lastBmsPkt = [...packets].reverse().find((p) => p.data.includes("VCC") || p.data.includes("vcc"));
  const packVoltage = lastBmsPkt
    ? (parseFloat(lastBmsPkt.data.match(/VCC[:\s]+([0-9.]+)/i)?.[1] ?? "0") || voltage).toFixed(1)
    : voltage.toFixed(1);

  return (
    <View style={[s.root, { paddingLeft: padL, paddingRight: padR }]}>
      {/* ── Status bar strip ── */}
      <View style={s.statusBar}>
        <Text style={s.sbTime}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        <Text style={s.sbTitle}>{selectedDevice?.name ?? "USB Data Logger"}</Text>
        <View style={[s.gpsBadge, { backgroundColor: isConnected ? T.greenDk : "#2a2a2a", borderColor: isConnected ? T.green : T.border }]}>
          <View style={[s.gpsDot, { backgroundColor: isConnected ? T.green : T.dim }]} />
          <Text style={[s.gpsText, { color: isConnected ? T.green : T.muted }]}>
            {isConnected ? "USB Locked" : "Disconnected"}
          </Text>
        </View>
      </View>

      {/* ── Four-panel body ── */}
      <View style={s.body}>

        {/* ══ LEFT PANEL: Speed / Gear / Direction ══ */}
        <View style={s.leftPanel}>
          <Speedometer value={dataRate} max={20} label="Speed" unit="KB/s" />

          <GearGrid
            title="Gear"
            rows={[
              [{ label: "1" }, { label: "2" }, { label: "3" }, { label: "4" }],
              [{ label: "F" }, { label: "N" }, { label: "R" }],
              [{ label: "H" }, { label: "N" }, { label: "L" }],
            ]}
            activeGear={activeGear}
            onSelect={(l) => {
              if (["1","2","3","4"].includes(l)) setActiveGear(l);
              else if (["F","R","H","L"].includes(l)) { setActiveMode(l); setActiveSpeed(l); }
              else { setActiveMode("N"); setActiveSpeed("N"); }
            }}
          />

          <Compass heading={Math.round(heading)} label={headingLabel(heading)} />
        </View>

        {/* ══ CENTER PANEL: Header + Data stream + Temps ══ */}
        <View style={s.centerPanel}>
          {/* Header */}
          <View style={s.centerHead}>
            <Text style={s.devTitle}>{selectedDevice?.name ?? "Field Navigation"}</Text>
            <Text style={s.devAddr} numberOfLines={1}>
              {selectedDevice?.manufacturerName ?? "81, USB OTG · Android / iOS · WebUSB API"}
            </Text>
            <View style={s.pillRow}>
              <Pill>{`VID ${selectedDevice?.vendorId?.toString(16).toUpperCase().padStart(4,"0") ?? "----"}`}</Pill>
              <Pill>{`PID ${selectedDevice?.productId?.toString(16).toUpperCase().padStart(4,"0") ?? "----"}`}</Pill>
              <Pill>{`BAUD ${baudRate}`}</Pill>
            </View>
          </View>

          {/* Live hex stream (map area) */}
          <LiveHexStream packets={packets} connected={isConnected} />

          {/* Temps row */}
          <View style={s.tempsRow}>
            <View style={s.tempBlock}>
              <Text style={s.tempLabel}>Bus Voltage</Text>
              <Text style={s.tempVal}>{packVoltage} V</Text>
              <View style={s.tempBar}>
                <View style={[s.tempBarFill, { width: `${Math.min(parseFloat(packVoltage) / 5.5 * 100, 100)}%`, backgroundColor: T.teal }]} />
              </View>
            </View>
            <View style={[s.tempBlock, { borderLeftWidth: 1, borderLeftColor: T.border, paddingLeft: 18 }]}>
              <Text style={s.tempLabel}>Pack Temp</Text>
              <Text style={s.tempVal}>{isConnected ? "38.4°C" : "0.0°C"}</Text>
              <View style={s.tempBar}>
                <View style={[s.tempBarFill, { width: isConnected ? "42%" : "0%", backgroundColor: T.yellow }]} />
              </View>
            </View>
          </View>
        </View>

        {/* ══ BATTERY PANEL: RX Data ══ */}
        <View style={s.battPanel}>
          <Text style={s.panelTitle}>Battery</Text>

          {/* Large SOC */}
          <View style={s.socRow}>
            <Text style={[s.socPct, { color: rxPct > 70 ? T.teal : rxPct > 40 ? T.yellow : T.orange }]}>
              {Math.round(rxPct)}%
            </Text>
          </View>
          <Text style={s.socLabel}>SOC</Text>

          <View style={s.battIconRow}>
            <BatteryIcon pct={rxPct / 100} color={rxPct > 50 ? T.teal : rxPct > 25 ? T.yellow : T.orange} />
            <View style={s.battStats}>
              <Text style={s.battStatVal}>{current} A</Text>
              <Text style={s.battStatLabel}>Current</Text>
              <Text style={s.battStatVal}>{voltage.toFixed(1)}°C</Text>
              <Text style={s.battStatLabel}>Pack Temp</Text>
            </View>
          </View>

          <View style={s.rangRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.rangVal}>{estRange} KB</Text>
              <Text style={s.rangLabel}>Est. Range</Text>
            </View>
            <View style={[{ flex: 1, borderLeftWidth: 1, borderLeftColor: T.border, paddingLeft: 8 }]}>
              <Text style={s.rangVal}>{sessionHMS}</Text>
              <Text style={s.rangLabel}>Work Time</Text>
            </View>
          </View>
        </View>

        {/* ══ POWER PANEL: TX / Throughput ══ */}
        <View style={s.powerPanel}>
          <Text style={s.panelTitle}>Power</Text>

          {/* Big TX rate */}
          <View style={s.powerBig}>
            <Text style={s.powerVal}>{dataRate.toFixed(1)}</Text>
            <Text style={s.powerUnit}>kB/s</Text>
          </View>
          <Text style={s.powerSub}>USB Throughput</Text>

          <View style={s.loadBars}>
            <LoadBar label="TX Load" pct={txPct} color={T.teal} />
            <LoadBar label="RX Load" pct={rxPct} color={T.cyan} />
          </View>

          <View style={s.divider} />

          <View style={s.statRows}>
            <StatRow label="Bus Voltage" value={`${voltage.toFixed(1)} V`} unit={`${parseFloat(current).toFixed(2)} A`} />
            <StatRow label="Baud Rate" value={baudRate.toLocaleString()} />
            <StatRow label="Signal" value={isConnected ? "5 dBm" : "0.0°C"} />
            <StatRow label="Runtime" value={sessionHMS} />
          </View>
        </View>
      </View>

      {/* ── Bottom Tab Bar ── */}
      <BottomTabs currentRoute="/(tabs)/index" connected={isConnected} onToggleUsb={handleToggleUsb} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, flexDirection: "column" },

  // Status bar
  statusBar: { height: 34, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  sbTime: { color: T.muted, fontSize: 11, fontFamily: "Inter_500Medium", width: 42 },
  sbTitle: { color: T.text, fontSize: 12, fontFamily: "Inter_700Bold", flex: 1 },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  gpsDot: { width: 5, height: 5, borderRadius: 3 },
  gpsText: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },

  // Four panels
  body: { flex: 1, flexDirection: "row" },

  // Left panel
  leftPanel: { width: 160, borderRightWidth: 1, borderRightColor: T.border, padding: 10, justifyContent: "space-between", backgroundColor: "#171a1c" },

  // Center panel
  centerPanel: { flex: 1, borderRightWidth: 1, borderRightColor: T.border, flexDirection: "column" },
  centerHead: { padding: 10, borderBottomWidth: 1, borderBottomColor: T.border, gap: 4 },
  devTitle: { color: T.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  devAddr: { color: T.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
  pillRow: { flexDirection: "row", gap: 5, marginTop: 2 },

  // Temps row
  tempsRow: { flexDirection: "row", padding: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border, gap: 0 },
  tempBlock: { flex: 1, gap: 3 },
  tempLabel: { color: T.muted, fontSize: 10, fontFamily: "Inter_500Medium" },
  tempVal: { color: T.text, fontSize: 20, fontFamily: "Inter_700Bold" },
  tempBar: { height: 3, backgroundColor: "#222", borderRadius: 2, overflow: "hidden" },
  tempBarFill: { height: "100%", borderRadius: 2 },

  // Battery panel
  battPanel: { width: 170, borderRightWidth: 1, borderRightColor: T.border, padding: 10, gap: 4 },
  panelTitle: { color: T.muted, fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },
  socRow: { marginTop: 4 },
  socPct: { fontSize: 48, fontFamily: "Inter_700Bold", lineHeight: 52 },
  socLabel: { color: T.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  battIconRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  battStats: { gap: 4 },
  battStatVal: { color: T.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  battStatLabel: { color: T.muted, fontSize: 9, fontFamily: "Inter_400Regular" },
  rangRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8, marginTop: 4 },
  rangVal: { color: T.text, fontSize: 16, fontFamily: "Inter_700Bold" },
  rangLabel: { color: T.muted, fontSize: 9, fontFamily: "Inter_400Regular" },

  // Power panel
  powerPanel: { width: 200, padding: 10, gap: 6 },
  powerBig: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 },
  powerVal: { color: T.text, fontSize: 44, fontFamily: "Inter_700Bold", lineHeight: 50 },
  powerUnit: { color: T.text, fontSize: 16, fontFamily: "Inter_400Regular", paddingBottom: 6 },
  powerSub: { color: T.muted, fontSize: 10, fontFamily: "Inter_400Regular" },
  loadBars: { gap: 6, marginTop: 4 },
  divider: { height: 1, backgroundColor: T.border, marginVertical: 4 },
  statRows: { gap: 2 },
});
