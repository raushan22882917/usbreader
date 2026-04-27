import React from "react";
import Svg, {
  Path,
  Circle,
  Rect,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  G,
  ClipPath,
} from "react-native-svg";

// ── helpers ─────────────────────────────────────────────────────────────────
export function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function arcPath(
  cx: number,
  cy: number,
  r: number,
  a1: number,
  a2: number
): string {
  const s = polar(cx, cy, r, a1);
  const e = polar(cx, cy, r, a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

// ── Arc gauge (used for data rate, health, etc.) ────────────────────────────
export interface ArcGaugeProps {
  value: number;
  max: number;
  size: number;
  color: string;
  label: string;
  unit?: string;
  startAngle?: number;
  endAngle?: number;
}

export function ArcGauge({
  value,
  max,
  size,
  color,
  label,
  unit = "",
  startAngle = -135,
  endAngle = 135,
}: ArcGaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 10;
  const stroke = size * 0.07;
  const pct = Math.min(value / max, 1);
  const fillEnd = startAngle + (endAngle - startAngle) * pct;
  const gradId = `ag_${label}`;

  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.5" />
          <Stop offset="1" stopColor={color} />
        </LinearGradient>
      </Defs>
      <Path
        d={arcPath(cx, cy, R, startAngle, endAngle)}
        stroke="rgba(51,56,58,1)"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
      />
      {pct > 0.01 && (
        <Path
          d={arcPath(cx, cy, R, startAngle, fillEnd)}
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />
      )}
      <SvgText
        x={cx}
        y={cy - size * 0.04}
        textAnchor="middle"
        fill="rgba(235,235,235,1)"
        fontSize={size * 0.18}
        fontWeight="bold"
        fontFamily="Inter"
      >
        {typeof value === "number" ? value.toFixed(0) : value}
      </SvgText>
      {unit ? (
        <SvgText
          x={cx}
          y={cy + size * 0.12}
          textAnchor="middle"
          fill="rgba(140,142,142,1)"
          fontSize={size * 0.1}
          fontFamily="Inter"
        >
          {unit}
        </SvgText>
      ) : null}
      <SvgText
        x={cx}
        y={size - 4}
        textAnchor="middle"
        fill={color}
        fontSize={size * 0.09}
        fontFamily="Inter"
        fontWeight="bold"
      >
        {label}
      </SvgText>
    </Svg>
  );
}

// ── Disk platter (big animated disk graphic) ────────────────────────────────
export interface DiskPlatterProps {
  size: number;
  active: boolean;
  activity?: number; // 0-1
  color?: string;
  rotation?: number;
}

export function DiskPlatterSvg({
  size,
  active,
  activity = 0,
  color = "#3b82f6",
  rotation = 0,
}: DiskPlatterProps) {
  const cx = size / 2;
  const cy = size / 2;
  const rings = [0.85, 0.7, 0.55, 0.4];
  const trackColor = active ? color : "rgba(51,56,58,1)";

  // Arm angle based on activity
  const armAngle = -30 + activity * 60;
  const armRad = ((armAngle - 90) * Math.PI) / 180;
  const armTip = {
    x: cx + (size * 0.38) * Math.cos(armRad),
    y: cy + (size * 0.38) * Math.sin(armRad),
  };
  const armBase = {
    x: cx + (size * 0.1) * Math.cos(armRad + 0.4),
    y: cy + (size * 0.1) * Math.sin(armRad + 0.4),
  };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="diskFill" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="rgba(30,34,36,1)" />
          <Stop offset="1" stopColor="rgba(20,24,26,1)" />
        </LinearGradient>
        <LinearGradient id="diskGlow" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.6" />
          <Stop offset="1" stopColor={color} />
        </LinearGradient>
        <ClipPath id="diskClip">
          <Circle cx={cx} cy={cy} r={size * 0.44} />
        </ClipPath>
      </Defs>

      {/* Outer glow ring */}
      {active && (
        <Circle
          cx={cx}
          cy={cy}
          r={size * 0.47}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.3}
        />
      )}

      {/* Disk body */}
      <Circle cx={cx} cy={cy} r={size * 0.44} fill="url(#diskFill)" />

      {/* Track rings */}
      {rings.map((r, i) => (
        <Circle
          key={r}
          cx={cx}
          cy={cy}
          r={size * r * 0.44}
          fill="none"
          stroke={trackColor}
          strokeWidth={1.5}
          strokeOpacity={active ? 0.5 - i * 0.08 : 0.3}
        />
      ))}

      {/* Sector highlights (if active) */}
      {active && (
        <G clipPath="url(#diskClip)">
          {[0, 60, 120, 180, 240, 300].map((angle, i) => {
            const a1 = angle;
            const a2 = angle + 40;
            const s = polar(cx, cy, size * 0.44, a1);
            const e = polar(cx, cy, size * 0.44, a2);
            return (
              <Path
                key={i}
                d={`M ${cx} ${cy} L ${s.x} ${s.y} A ${size * 0.44} ${size * 0.44} 0 0 1 ${e.x} ${e.y} Z`}
                fill={color}
                fillOpacity={activity * 0.08}
              />
            );
          })}
        </G>
      )}

      {/* Center hub */}
      <Circle cx={cx} cy={cy} r={size * 0.1} fill="rgba(35,39,41,1)" stroke="rgba(51,56,58,1)" strokeWidth={1} />
      <Circle
        cx={cx}
        cy={cy}
        r={size * 0.04}
        fill={active ? color : "rgba(51,56,58,1)"}
      />

      {/* Read arm */}
      <Line
        x1={armBase.x}
        y1={armBase.y}
        x2={armTip.x}
        y2={armTip.y}
        stroke={active ? color : "rgba(80,82,82,1)"}
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Arm head (the read head) */}
      <Circle
        cx={armTip.x}
        cy={armTip.y}
        r={4}
        fill={active ? color : "rgba(80,82,82,1)"}
      />

      {/* Arm pivot */}
      <Circle cx={armBase.x} cy={armBase.y} r={5} fill="rgba(51,56,58,1)" stroke={active ? color : "rgba(60,62,62,1)"} strokeWidth={1} />
    </Svg>
  );
}

// ── Battery column ───────────────────────────────────────────────────────────
const BODY_TOP = 40;
const BODY_BOT = 512;
const BODY_H = BODY_BOT - BODY_TOP;

function socColor(soc: number) {
  if (soc > 60) return { top: "#6EDCA1", bottom: "#3AB87A" };
  if (soc > 30) return { top: "#FFC832", bottom: "#E6A800" };
  return { top: "#FF503C", bottom: "#CC2A1A" };
}

export function BatterySvg({ soc, width, height }: { soc: number; width: number; height: number }) {
  const fillH = (soc / 100) * BODY_H;
  const fillY = BODY_BOT - fillH;
  const { top, bottom } = socColor(soc);
  return (
    <Svg width={width} height={height} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="batFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
        <ClipPath id="batClip">
          <Rect x={91} y={BODY_TOP} width={330} height={BODY_H} />
        </ClipPath>
      </Defs>
      <Path
        d="M420.457,46.9v458.886c0,3.448-2.759,6.207-6.131,6.207H97.674c-3.372,0-6.131-2.759-6.131-6.207V46.9c0-3.449,2.759-6.207,6.131-6.207h68.051V6.207C165.725,2.835,168.484,0,171.932,0h168.136c3.449,0,6.207,2.835,6.207,6.207v34.485h68.051C417.698,40.693,420.457,43.451,420.457,46.9z"
        fill="rgba(30,34,36,1)"
        stroke="rgba(70,75,77,1)"
        strokeWidth={6}
      />
      <Rect
        x={91} y={fillY}
        width={330} height={fillH}
        fill="url(#batFill)"
        clipPath="url(#batClip)"
      />
      <G clipPath="url(#batClip)">
        <Path
          d="M207.805,147.876 L317.749,149.381 L271.058,232.212 L328.287,229.196 L190.029,393.062 L228.887,277.391 L183.714,275.887 Z"
          fill="rgba(255,255,255,0.9)"
        />
      </G>
    </Svg>
  );
}

// ── Speedometer ──────────────────────────────────────────────────────────────
export function SpeedometerSvg({ value, max, size, color, label }: {
  value: number; max: number; size: number; color: string; label: string;
}) {
  const pct = Math.min(value / max, 1);
  const needleAngle = -60 + pct * 120;
  const cx = 160, cy = 160, nr = 68;
  const rad = ((needleAngle - 90) * Math.PI) / 180;
  const tip = { x: cx + nr * Math.cos(rad), y: cy + nr * Math.sin(rad) };
  const b1 = { x: cx + 8 * Math.cos(rad + Math.PI / 2), y: cy + 8 * Math.sin(rad + Math.PI / 2) };
  const b2 = { x: cx + 8 * Math.cos(rad - Math.PI / 2), y: cy + 8 * Math.sin(rad - Math.PI / 2) };
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];
  return (
    <Svg width={size} height={size} viewBox="0 0 320 320">
      <Defs>
        <LinearGradient id="spdNeedle" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6EDCA1" />
          <Stop offset="1" stopColor={color} />
        </LinearGradient>
      </Defs>
      <Path d="M90,40 L160,160 L230,40 Z" fill={color} opacity={0.6} />
      <Path d="M160,160 L0,160 L90,40 Z" fill="#FFC832" opacity={0.5} />
      <Path d="M160,160 L320,160 L230,40 Z" fill="#FF503C" opacity={0.5} />
      <Path d="M160,0 L160,40 C226.273,40 280,93.726 280,160 C280,226.274 226.273,280 160,280 L160,320 C248.365,320 320,248.366 320,160 C320,71.635 248.365,0 160,0 Z" fill="rgba(25,30,32,1)" />
      <Path d="M40,160 C40,93.726 93.727,40 160,40 L160,0 C71.635,0 0,71.634 0,160 C0,248.366 71.635,320 160,320 L160,280 C93.727,280 40,226.274 40,160 Z" fill="rgba(20,25,27,1)" />
      <Circle cx={cx} cy={cy} r={80} fill="rgba(15,20,22,1)" />
      {ticks.map((t, i) => {
        const a = -60 + t * 120;
        const pi = polar(cx, cy, 58, a);
        const po = polar(cx, cy, 72, a);
        return <Line key={i} x1={pi.x} y1={pi.y} x2={po.x} y2={po.y} stroke="rgba(80,82,82,1)" strokeWidth={2} />;
      })}
      <Path d={`M ${tip.x} ${tip.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`} fill="url(#spdNeedle)" opacity={0.95} />
      <Circle cx={cx} cy={cy} r={10} fill="rgba(15,20,22,1)" stroke={color} strokeWidth={2} />
      <SvgText x={160} y={204} textAnchor="middle" fill="rgba(248,248,248,1)" fontSize={34} fontWeight="bold" fontFamily="Inter">
        {value.toFixed(0)}
      </SvgText>
      <SvgText x={160} y={226} textAnchor="middle" fill="rgba(140,142,142,1)" fontSize={13} fontFamily="Inter">
        {label}
      </SvgText>
    </Svg>
  );
}

// ── HBar ─────────────────────────────────────────────────────────────────────
export function HBar({ pct, color, width = 80, height = 7 }: {
  pct: number; color: string; width?: number; height?: number;
}) {
  const fill = Math.max(0, Math.min(pct, 1)) * width;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`hbar_${color}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="0.6" />
          <Stop offset="1" stopColor={color} />
        </LinearGradient>
        <ClipPath id={`hbClip_${color}`}>
          <Rect x={0} y={0} width={width} height={height} rx={height / 2} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill="rgba(51,56,58,1)" />
      <Rect x={0} y={0} width={fill} height={height} fill={`url(#hbar_${color})`} clipPath={`url(#hbClip_${color})`} />
    </Svg>
  );
}
