import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, useWindowDimensions, PixelRatio } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Svg, { Rect, Defs, LinearGradient, Stop, Polygon, Circle, Text as SvgText } from 'react-native-svg';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { useVehicleData } from '../context/DataContext';

const BAR_H = 8;
const BAR_R = 4;

// ── Temp bar ──────────────────────────────────────────────────
const TempBar = ({ value, max, hot, width }: { value: number; max: number; hot: boolean; width: number }) => {
  const fillW = width * Math.min(value / max, 1);
  return (
    <View style={[styles.barWrapper, { width }]}>
      {width > 0 && (
        <Svg width={width} height={BAR_H}>
          <Defs>
            <LinearGradient id="hotGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#6EDCA1" />
              <Stop offset="0.5" stopColor="#FFC832" />
              <Stop offset="1" stopColor="#FF503C" />
            </LinearGradient>
            <LinearGradient id="coolGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#6EDCA1" />
              <Stop offset="1" stopColor="#50B4FF" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={BAR_H} rx={BAR_R} fill="rgba(51,56,58,1)" />
          <Rect x={0} y={0} width={fillW} height={BAR_H} rx={BAR_R} fill={`url(#${hot ? 'hotGrad' : 'coolGrad'})`} />
        </Svg>
      )}
    </View>
  );
};

// ── Compass dial ──────────────────────────────────────────────
const CompassDial = ({ heading, size }: { heading: number; size: number }) => {
  const S = size;
  const cx = S / 2;
  const cy = S / 2;
  const r = S / 2 - 3;
  // needle tip & tail in polar, rotated by heading
  const toXY = (angleDeg: number, radius: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };
  const tip = toXY(heading, r - 4);
  const tail = toXY(heading + 180, r - 10);
  const leftN = toXY(heading - 12, r - 18);
  const rightN = toXY(heading + 12, r - 18);
  const leftS = toXY(heading + 168, r - 18);
  const rightS = toXY(heading + 192, r - 18);

  const cardinals = ['N', 'E', 'S', 'W'];
  const cardAngles = [0, 90, 180, 270];

  return (
    <Svg width={S} height={S}>
      {/* Outer ring */}
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(51,56,58,1)" strokeWidth={1.5} fill="rgba(21,25,27,0.9)" />
      {/* Cardinal labels */}
      {cardinals.map((c, i) => {
        const pos = toXY(cardAngles[i], r - S * 0.12);
        return (
          <SvgText
            key={c}
            x={pos.x}
            y={pos.y + S * 0.07}
            textAnchor="middle"
            fill={c === 'N' ? '#FF503C' : 'rgba(140,142,142,1)'}
            fontSize={S * 0.14}
            fontWeight="bold"
            fontFamily="Oswald"
          >
            {c}
          </SvgText>
        );
      })}
      {/* North needle (red) */}
      <Polygon
        points={`${tip.x},${tip.y} ${leftN.x},${leftN.y} ${tail.x},${tail.y} ${rightN.x},${rightN.y}`}
        fill="#FF503C"
        opacity={0.9}
      />
      {/* South needle (grey) */}
      <Polygon
        points={`${tail.x},${tail.y} ${leftS.x},${leftS.y} ${tip.x},${tip.y} ${rightS.x},${rightS.y}`}
        fill="rgba(100,102,102,1)"
        opacity={0.9}
      />
      {/* Center dot */}
      <Circle cx={cx} cy={cy} r={3} fill="rgba(235,235,235,1)" />
    </Svg>
  );
};

// ── Main ──────────────────────────────────────────────────────
const FieldNavSection: React.FC = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  const scale = PixelRatio.getFontScale();
  const isSmallScreen = screenWidth < 600;
  
  // Responsive sizing
  const compassSize = isLandscape ? Math.min(screenWidth * 0.06, 56) : Math.min(screenWidth * 0.12, 60);
  const fontSize = (base: number) => base / scale;
  const [barWidth, setBarWidth] = useState(100);
  
  const { data } = useVehicleData();
  const deviceLoc = useDeviceLocation();
  const mapRef = useRef<MapView>(null);

  const hasData = data !== null;
  const gps = data?.gps;
  const lat = deviceLoc.fix ? deviceLoc.lat : (gps?.lat ?? 37.7749);
  const lng = deviceLoc.fix ? deviceLoc.lng : (gps?.lng ?? -122.4194);
  const heading = deviceLoc.fix ? deviceLoc.heading : (gps?.heading ?? 0);

  const gpsFix = deviceLoc.fix ? 'GPS Locked' : gps?.fix ? 'GPS Fix' : 'No Fix';
  const radiatorTemp = data?.motor?.temp_c ?? 0;
  const batteryTemp = data?.bms?.pack_temp_c ?? 0;

  // Animate map camera to follow position + heading
  useEffect(() => {
    if (deviceLoc.fix && mapRef.current) {
      mapRef.current.animateCamera(
        { center: { latitude: lat, longitude: lng }, heading, pitch: 0, zoom: 17 },
        { duration: 800 }
      );
    }
  }, [lat, lng, heading, deviceLoc.fix]);

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.navTitle, { fontSize: fontSize(isSmallScreen ? 16 : 20) }]}>Field Navigation</Text>
        <View style={[styles.badge, !deviceLoc.fix && styles.badgeNoFix]}>
          <Text style={[styles.badgeText, { fontSize: fontSize(12) }, !deviceLoc.fix && styles.badgeTextNoFix]}>{gpsFix}</Text>
        </View>
      </View>

      {/* Coords + heading row */}
      <View style={styles.infoRow}>
        <Text style={[styles.infoChip, { fontSize: fontSize(11) }]}>LAT {lat.toFixed(5)}</Text>
        <Text style={[styles.infoChip, { fontSize: fontSize(11) }]}>LNG {lng.toFixed(5)}</Text>
        <Text style={[styles.infoChip, { fontSize: fontSize(11) }]}>HDG {Math.round(heading)}°</Text>
      </View>

      {/* Map + compass overlay */}
      <View style={styles.mapBox}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialCamera={{
            center: { latitude: lat, longitude: lng },
            heading,
            pitch: 0,
            zoom: 17,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          rotateEnabled
          mapType="satellite"
        >
          <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={heading}
          />
        </MapView>

        {/* Compass overlay */}
        <View style={styles.compassOverlay}>
          <CompassDial heading={heading} size={compassSize} />
          <Text style={[styles.compassDeg, { fontSize: fontSize(10) }]}>{Math.round(heading)}°</Text>
        </View>
      </View>

      {/* Temperatures */}
      <Text style={[styles.tempTitle, { fontSize: fontSize(isSmallScreen ? 14 : 16) }]}>Temperatures</Text>
      <View style={styles.tempRow} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width / 2 - 18)}>
        <View style={styles.tempItem}>
          <Text style={[styles.tempLabel, { fontSize: fontSize(13) }]}>Radiator</Text>
          <Text style={[styles.tempValue, { fontSize: fontSize(isSmallScreen ? 24 : 30) }]}>
            {hasData ? `${radiatorTemp.toFixed(1)}°C` : 'No Data'}
          </Text>
          <TempBar value={hasData ? radiatorTemp : 0} max={120} hot={true} width={barWidth} />
        </View>
        <View style={styles.tempDivider} />
        <View style={styles.tempItem}>
          <Text style={[styles.tempLabel, { fontSize: fontSize(13) }]}>Battery</Text>
          <Text style={[styles.tempValue, { fontSize: fontSize(isSmallScreen ? 24 : 30) }]}>
            {hasData ? `${batteryTemp.toFixed(1)}°C` : 'No Data'}
          </Text>
          <TempBar value={hasData ? batteryTemp : 0} max={60} hot={false} width={barWidth} />
        </View>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1.5,
    backgroundColor: 'rgba(21,25,27,1)',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(51,56,58,1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  navTitle: {
    color: 'rgba(200,201,201,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
  badge: {
    backgroundColor: 'rgba(110,220,161,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(110,220,161,0.5)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeNoFix: {
    backgroundColor: 'rgba(255,80,60,0.12)',
    borderColor: 'rgba(255,80,60,0.4)',
  },
  badgeText: {
    color: '#6EDCA1',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
  },
  badgeTextNoFix: {
    color: '#FF503C',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  infoChip: {
    color: 'rgba(140,142,142,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    backgroundColor: 'rgba(35,39,41,1)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  mapBox: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 8,
    marginBottom: 10,
  },
  map: {
    flex: 1,
  },
  compassOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(21,25,27,0.75)',
    borderRadius: 8,
    padding: 4,
  },
  compassDeg: {
    color: 'rgba(200,201,201,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginTop: 2,
  },
  tempTitle: {
    color: 'rgba(147,148,149,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  tempRow: { flexDirection: 'row', alignItems: 'flex-start' },
  tempItem: { flex: 1 },
  tempDivider: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(51,56,58,1)',
    marginHorizontal: 12,
  },
  tempLabel: {
    color: 'rgba(140,142,142,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  tempValue: {
    color: 'rgba(225,226,225,1)',
    fontFamily: 'Oswald',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  barWrapper: { width: '100%', height: BAR_H },
});

export default FieldNavSection;
