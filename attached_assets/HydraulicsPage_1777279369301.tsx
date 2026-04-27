import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';
import { VehicleData, useVehicleData } from '../context/DataContext';
import HydDialog from './HydDialog';
import GlobalUsbStatusBar from './GlobalUsbStatusBar';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const CENTER_BUTTONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'diagnostics', label: 'DIAGNOSTICS', icon: 'wrench' },
  { id: 'settings', label: 'SETTINGS', icon: 'cog' },
  { id: 'maintenance', label: 'MAINTENANCE', icon: 'tools' },
];

const fmt = (v: number | undefined, dec = 1) =>
  v === undefined ? '—' : v.toFixed(dec);

const BAR_COLORS: Record<string, string> = {
  blue: '#4A90E2', yellow: '#FFC832', green: '#6EDCA1',
  orange: '#FF9811', pink: '#FF6EB4', cyan: '#50D8D7',
};

// ── Primitives ────────────────────────────────────────────────
const MetricCard = ({ label, value, unit = '', barColor }: {
  label: string; value: string; unit?: string; barColor: string;
}) => (
  <View style={s.metricCard}>
    <Text style={s.metricLabel}>{label}</Text>
    <View style={[s.metricBar, { backgroundColor: barColor }]} />
    <Text style={s.metricValue}>{value}{value !== '—' && unit ? ` ${unit}` : ''}</Text>
  </View>
);

const DataRow = ({ label, value, unit = '', color }: {
  label: string; value: string; unit?: string; color?: string;
}) => (
  <View style={s.dataRow}>
    <Text style={s.dataLabel}>{label}</Text>
    <Text style={[s.dataValue, color ? { color } : null]}>
      {value}{value !== '—' && unit ? ` ${unit}` : ''}
    </Text>
  </View>
);

const UnderlineBar = ({ color }: { color: string }) => (
  <View style={[s.underline, { backgroundColor: color }]} />
);

const Card = ({ children, flex = 1 }: { children: React.ReactNode; flex?: number }) => (
  <View style={[s.card, { flex }]}>{children}</View>
);

const CardTitle = ({ title, icon }: { title: string; icon?: IconName }) => (
  <View style={s.cardTitleContainer}>
    {icon && <MaterialCommunityIcons name={icon} size={20} color="#6EDCA1" style={s.cardTitleIcon} />}
    <Text style={s.cardTitle}>{title}</Text>
  </View>
);

const Divider = () => <View style={s.divider} />;

const StatusDot = ({ label, active }: { label: string; active: boolean }) => (
  <View style={s.dotRow}>
    <View style={[s.dot, { backgroundColor: active ? '#6EDCA1' : 'rgba(55,60,62,1)' }]} />
    <Text style={[s.dotLabel, active && s.dotLabelActive]}>{label}</Text>
  </View>
);

const FaultPill = ({ label, active }: { label: string; active: boolean }) => (
  <View style={[s.faultPill, active && s.faultPillActive]}>
    <View style={[s.dot, { backgroundColor: active ? '#FF503C' : 'rgba(55,60,62,1)' }]} />
    <Text style={[s.faultLabel, active && s.faultLabelActive]}>{label}</Text>
  </View>
);

const MiniBar = ({ value, max, color }: { value: number; max: number; color: string }) => {
  const [w, setW] = useState(0);
  const fillW = w * Math.min(value / max, 1);
  return (
    <View style={{ flex: 1, height: 6 }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={6}>
          <Rect x={0} y={0} width={w} height={6} rx={3} fill="rgba(51,56,58,1)" />
          <Rect x={0} y={0} width={fillW} height={6} rx={3} fill={color} />
        </Svg>
      )}
    </View>
  );
};

// ── Section cards ─────────────────────────────────────────────
const HvEvccCard = ({ data }: { data: VehicleData }) => {
  const hv = data.hv ?? { bat_plus_v:0, fc_v:0, sc_v:0, pchg_v:0, dcdc_v:0, out_minus_v:0, dsg_v:0 };
  const { evcc } = data;
  return (
    <Card>
      <CardTitle title="HV + EVCC" icon="flash" />
      <UnderlineBar color={BAR_COLORS.blue} />
      <View style={s.twoCol}>
        <View style={s.col}>
          <DataRow label="HV BAT+" value={fmt(hv.bat_plus_v)} unit="V" />
          <DataRow label="HV FC" value={fmt(hv.fc_v)} unit="V" />
          <DataRow label="HV SC" value={fmt(hv.sc_v)} unit="V" />
          <DataRow label="HV PCHG" value={fmt(hv.pchg_v)} unit="V" />
          <Divider />
          <DataRow label="EVCC Msg" value={evcc?.last_msg_code || 'WAITING'} color={evcc?.last_msg_code ? '#D2D3D3' : '#FFC832'} />
          <DataRow label="Meaning" value={evcc?.description || 'Waiting for EVCC frames'} />
        </View>
        <View style={s.col}>
          <DataRow label="HV DC-DC" value={fmt(hv.dcdc_v)} unit="V" />
          <DataRow label="HV OUT-" value={fmt(hv.out_minus_v)} unit="V" />
          <DataRow label="HV DSG" value={fmt(hv.dsg_v)} unit="V" />
          <View style={{ flex: 1 }} />
          <DataRow label="CAN ID" value={evcc?.last_can_id || '—'} />
        </View>
      </View>
    </Card>
  );
};

const DcdcChargerCard = ({ data }: { data: VehicleData }) => {
  const dcdc    = data.dcdc    ?? { voltage_v:0, current_a:0, temp_c:0, ready:false, working:false, hvil_err:false, can_error:false, hard_fault:false, over_temperature:false };
  const charger = data.charger ?? { status:'—', voltage_v:0, current_a:0, error_code:0 };
  return (
    <Card>
      <CardTitle title="DC-DC + Charger" icon="battery-charging" />
      <UnderlineBar color={BAR_COLORS.yellow} />
      <View style={s.twoCol}>
        <View style={s.col}>
          <DataRow label="DC-DC Vout" value={fmt(dcdc.voltage_v)} unit="V" />
          <DataRow label="DC-DC Temp" value={fmt(dcdc.temp_c)} unit="°C" />
          <Divider />
          <DataRow label="Charger" value={charger.status} color={charger.status === 'Not charging' ? '#FFC832' : '#6EDCA1'} />
          <DataRow label="Chg Current" value={fmt(charger.current_a)} unit="A" />
        </View>
        <View style={s.col}>
          <DataRow label="DC-DC Iout" value={fmt(dcdc.current_a)} unit="A" />
          <DataRow label="DC-DC State" value={dcdc.working ? 'Working' : dcdc.ready ? 'Ready' : '—'} />
          <Divider />
          <DataRow label="Chg Voltage" value={fmt(charger.voltage_v)} unit="V" />
          <DataRow label="Chg Err" value={charger.error_code ? String(charger.error_code) : '—'} color={charger.error_code ? '#FF503C' : undefined} />
        </View>
      </View>
      <Divider />
      <View style={s.dotGrid}>
        <StatusDot label="Ready" active={dcdc.ready} />
        <StatusDot label="Working" active={dcdc.working} />
        <StatusDot label="HVIL Err" active={dcdc.hvil_err} />
        <StatusDot label="CAN Err" active={dcdc.can_error} />
        <StatusDot label="Hard Fault" active={dcdc.hard_fault} />
        <StatusDot label="Over Temp" active={dcdc.over_temperature} />
      </View>
    </Card>
  );
};

const MotorRelaysCard = ({ data }: { data: VehicleData }) => {
  const { motor } = data;
  const relays = data.relays ?? {};
  const runtime = `${Math.floor(motor.runtime / 3600)}h ${Math.floor((motor.runtime % 3600) / 60)}m`;
  return (
    <Card>
      <CardTitle title="Motor + Relays" icon="engine" />
      <UnderlineBar color={BAR_COLORS.orange} />
      <View style={s.twoCol}>
        <View style={s.col}>
          <DataRow label="RPM" value={motor.rpm ? String(motor.rpm) : '—'} />
        </View>
        <View style={s.col}>
          <DataRow label="Motor Temp" value={fmt(motor.temp_c)} unit="°C" />
        </View>
      </View>
      <DataRow label="Run Time" value={motor.runtime ? runtime : '—'} />
      <Divider />
      <View style={s.dotGrid}>
        {Object.entries(relays).map(([k, v]) => (
          <StatusDot key={k} label={k.replace('_', ' ')} active={v as boolean} />
        ))}
      </View>
    </Card>
  );
};

const BmsFaultsCard = ({ data }: { data: VehicleData }) => {
  const faults = data.bms.faults;
  return (
    <View style={s.faultsCard}>
      <CardTitle title="BMS Faults" icon="alert" />
      <View style={s.faultGrid}>
        {Object.entries(faults).map(([k, v], i) => (
          <FaultPill key={k} label={`${i + 1}.${k}`} active={v as boolean} />
        ))}
      </View>
    </View>
  );
};

// ── Main Page ─────────────────────────────────────────────────
interface Props { onBack: () => void; }

const HydraulicsPage: React.FC<Props> = ({ onBack }) => {
  const { data, isConnected, error, connect, disconnect } = useVehicleData();
  const [dialogBtn, setDialogBtn] = useState<(typeof CENTER_BUTTONS)[0] | null>(null);

  const defaultData: VehicleData = {
    bms: { soc: 0, pack_voltage_v: 0, pack_current_a: 0, pack_temp_c: 0, faults: {} },
    cells: { total_cells: 0, cycle: 0, min_v: 0, max_v: 0, min_cell_id: 0, max_cell_id: 0, voltages: [], temperatures: [] },
    hv: { bat_plus_v: 0, fc_v: 0, sc_v: 0, pchg_v: 0, dcdc_v: 0, out_minus_v: 0, dsg_v: 0 },
    relays: {},
    dcdc: { voltage_v: 0, current_a: 0, temp_c: 0, ready: false, working: false, hvil_err: false, can_error: false, hard_fault: false, over_temperature: false },
    charger: { status: 'Not charging', current_a: 0, voltage_v: 0, error_code: 0 },
    motor: { rpm: 0, temp_c: 0, runtime: 0 },
    evcc: { last_msg_code: '', description: '', last_can_id: '' },
    gps: { lat: 0, lng: 0, heading: 0, fix: false, speed_kmh: 0 },
    ts: Date.now(),
  };

  const vehicleData = data || defaultData;
  const bms = vehicleData.bms;
  const cells = vehicleData.cells;
  const socColor = bms.soc > 60 ? '#6EDCA1' : bms.soc > 30 ? '#FFC832' : '#FF503C';

  const TOP_METRICS = [
    { label: 'Pack Voltage', value: fmt(bms.pack_voltage_v), unit: 'V',  barColor: BAR_COLORS.blue },
    { label: 'Pack Current', value: fmt(bms.pack_current_a), unit: 'A',  barColor: BAR_COLORS.cyan },
    { label: 'Pack Temp',    value: fmt(bms.pack_temp_c),    unit: '°C', barColor: BAR_COLORS.yellow },
    { label: 'Min Cell',     value: fmt(cells.min_v, 3),     unit: 'V',  barColor: BAR_COLORS.orange },
    { label: 'Max Cell',     value: fmt(cells.max_v, 3),     unit: 'V',  barColor: BAR_COLORS.green },
    { label: 'SOC',          value: bms.soc ? `${bms.soc}%` : '—', unit: '', barColor: BAR_COLORS.pink },
  ];

  return (
    <View style={s.root}>
      <GlobalUsbStatusBar />

      {/* Top nav bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="rgba(160,162,162,1)" />
          <Text style={s.backLabel}>BACK</Text>
        </TouchableOpacity>
        <Text style={s.pageTitle}>HYDRAULICS</Text>
        <View style={s.hydBtns}>
          {CENTER_BUTTONS.map((btn) => (
            <TouchableOpacity key={btn.id} style={s.hydBtn} onPress={() => setDialogBtn(btn)} activeOpacity={0.8}>
              <MaterialCommunityIcons name={btn.icon} size={24} color="#6EDCA1" />
              <Text style={s.hydLabel}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Data source indicator */}
      <View style={s.sourceBar}>
        <View style={[s.sourceDot, { backgroundColor: isConnected ? '#6EDCA1' : '#555' }]} />
        <Text style={[s.sourceTxt, { color: isConnected ? '#6EDCA1' : '#555' }]}>
          {isConnected
            ? '📱 USB LIVE DATA'
            : error
            ? `❌ ${error}`
            : '⏳ WAITING FOR USB…'}
        </Text>
        {data && (
          <Text style={s.sourceTsTxt}>
            {new Date(data.ts > 1e12 ? data.ts : data.ts * 1000).toLocaleTimeString()}
          </Text>
        )}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Row 0: 6 top metric cards ── */}
        <View style={s.metricRow}>
          {TOP_METRICS.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} unit={m.unit} barColor={m.barColor} />
          ))}
        </View>

        {/* ── Row 1: HV+EVCC | DC-DC+Charger | Motor+Relays ── */}
        <View style={s.row}>
          <HvEvccCard data={vehicleData} />
          <DcdcChargerCard data={vehicleData} />
          <MotorRelaysCard data={vehicleData} />
        </View>

        {/* ── Row 2: BMS Faults ── */}
        <BmsFaultsCard data={vehicleData} />

        {/* ── Row 3: SOC bar ── */}
        <View style={s.socCard}>
          <View style={s.socHeader}>
            <Text style={s.socTitle}>State of Charge</Text>
            <Text style={[s.socPct, { color: socColor }]}>{bms.soc}%</Text>
          </View>
          <MiniBar value={bms.soc} max={100} color={socColor} />
        </View>

      </ScrollView>

      <HydDialog visible={dialogBtn !== null} button={dialogBtn} onClose={() => setDialogBtn(null)} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(21,25,27,1)' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(51,56,58,1)',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  backLabel: { color: 'rgba(160,162,162,1)', fontFamily: 'Oswald', fontSize: 16, fontWeight: 'bold' },
  pageTitle: {
    flex: 1, color: 'rgba(210,211,211,1)', fontFamily: 'Oswald',
    fontSize: 22, fontWeight: 'bold', letterSpacing: 2,
  },
  hydBtns: { flexDirection: 'row', gap: 10 },
  hydBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(35,39,41,1)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(110,220,161,0.35)',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  hydLabel: { color: '#6EDCA1', fontFamily: 'Oswald', fontSize: 14, fontWeight: 'bold' },

  sourceBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: 'rgba(26,30,32,1)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(51,56,58,1)',
  },
  sourceDot: { width: 7, height: 7, borderRadius: 4 },
  sourceTxt: { fontFamily: 'Oswald', fontSize: 11, fontWeight: 'bold', flex: 1 },
  sourceTsTxt: { color: '#555', fontFamily: 'Oswald', fontSize: 10 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  metricRow: { flexDirection: 'row', gap: 12 },
  metricCard: {
    flex: 1, backgroundColor: 'rgba(26,30,32,1)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(51,56,58,1)',
    padding: 18, minHeight: 110,
  },
  metricLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 14, marginBottom: 8 },
  metricBar: { height: 3, borderRadius: 1.5, width: '100%', marginBottom: 12 },
  metricValue: { color: 'rgba(210,211,211,1)', fontFamily: 'Oswald', fontSize: 22, fontWeight: 'bold' },

  row: { flexDirection: 'row', gap: 12 },

  card: {
    backgroundColor: 'rgba(26,30,32,1)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(51,56,58,1)', padding: 18,
  },
  cardTitle: { color: 'rgba(200,201,201,1)', fontFamily: 'Oswald', fontSize: 17, fontWeight: 'bold', marginBottom: 8 },
  cardTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitleIcon: { marginRight: 4 },
  underline: { height: 3, borderRadius: 1.5, marginBottom: 12, width: 40 },
  divider: { height: 1, backgroundColor: 'rgba(51,56,58,1)', marginVertical: 10 },

  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },

  dataRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(40,44,46,1)',
  },
  dataLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 14 },
  dataValue: { color: 'rgba(210,211,211,1)', fontFamily: 'Oswald', fontSize: 14, fontWeight: 'bold' },

  dotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 12 },
  dotLabelActive: { color: 'rgba(200,201,201,1)' },

  faultsCard: {
    backgroundColor: 'rgba(26,30,32,1)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(51,56,58,1)', padding: 18,
  },
  faultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  faultPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(35,39,41,1)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(55,60,62,1)',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  faultPillActive: { backgroundColor: 'rgba(255,80,60,0.1)', borderColor: 'rgba(255,80,60,0.5)' },
  faultLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 12 },
  faultLabelActive: { color: '#FF503C' },

  socCard: {
    backgroundColor: 'rgba(26,30,32,1)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(51,56,58,1)',
    padding: 18, gap: 12,
  },
  socHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  socTitle: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 15 },
  socPct: { fontFamily: 'Oswald', fontSize: 24, fontWeight: 'bold' },
});

export default HydraulicsPage;
