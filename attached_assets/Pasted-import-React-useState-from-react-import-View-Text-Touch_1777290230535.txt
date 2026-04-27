import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVehicleData } from '../context/DataContext';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface HydButton {
  id: string;
  label: string;
  icon: IconName;
}

interface Props {
  visible: boolean;
  button: HydButton | null;
  onClose: () => void;
}

const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={s.row}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={[s.rowValue, color ? { color } : null]}>{value}</Text>
  </View>
);

const Divider = () => <View style={s.divider} />;

const StatusDot = ({ label, active }: { label: string; active: boolean }) => (
  <View style={s.dotRow}>
    <View style={[s.dot, { backgroundColor: active ? '#6EDCA1' : 'rgba(55,60,62,1)' }]} />
    <Text style={[s.dotLabel, active && { color: 'rgba(200,201,201,1)' }]}>{label}</Text>
  </View>
);

const fmt = (v: number, dec = 1) => (v === 0 ? '—' : v.toFixed(dec));

const HydDialog: React.FC<Props> = ({ visible, button, onClose }) => {
  const { data } = useVehicleData();
  const [active, setActive] = useState(false);

  if (!button || !data) return null;

  const { bms, motor } = data;
  const dcdc    = (data as any).dcdc    ?? { voltage_v:0, current_a:0, temp_c:0 };
  const charger = (data as any).charger ?? { status:'—', voltage_v:0, current_a:0 };
  const relays  = (data as any).relays  ?? {};
  const socColor = bms.soc > 60 ? '#6EDCA1' : bms.soc > 30 ? '#FFC832' : '#FF503C';

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} onPress={onClose} activeOpacity={1} />

        <View style={s.panel}>
          {/* Header */}
          <View style={s.header}>
            <MaterialCommunityIcons name={button.icon} size={26} color="#6EDCA1" />
            <Text style={s.title}>{button.label} — DIAGNOSTICS</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={16} color="rgba(160,162,162,1)" />
            </TouchableOpacity>
          </View>

          {/* Status badge */}
          <View style={[s.statusBadge, active ? s.badgeOn : s.badgeOff]}>
            <View style={[s.dot, { backgroundColor: active ? '#6EDCA1' : '#FF503C' }]} />
            <Text style={[s.statusText, { color: active ? '#6EDCA1' : '#FF503C' }]}>
              {active ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
            {/* BMS */}
            <Text style={s.section}>BMS</Text>
            <Row label="SOC" value={bms.soc ? `${bms.soc}%` : '—'} color={socColor} />
            <Row label="Pack Voltage" value={fmt(bms.pack_voltage_v)} />
            <Row label="Pack Current" value={fmt(bms.pack_current_a)} />
            <Row label="Pack Temp" value={`${fmt(bms.pack_temp_c)} °C`} />
            <Divider />

            {/* DC-DC */}
            <Text style={s.section}>DC-DC</Text>
            <Row label="Voltage" value={`${fmt(dcdc.voltage_v)} V`} />
            <Row label="Current" value={`${fmt(dcdc.current_a)} A`} />
            <Row label="Temp" value={`${fmt(dcdc.temp_c)} °C`} />
            <Divider />

            {/* Motor */}
            <Text style={s.section}>Motor</Text>
            <Row label="RPM" value={motor.rpm ? String(motor.rpm) : '—'} />
            <Row label="Temp" value={`${fmt(motor.temp_c)} °C`} />
            <Row
              label="Runtime"
              value={motor.runtime ? `${Math.floor(motor.runtime / 3600)}h ${Math.floor((motor.runtime % 3600) / 60)}m` : '—'}
            />
            <Divider />

            {/* Charger */}
            <Text style={s.section}>Charger</Text>
            <Row label="Status" value={charger.status} color={charger.status === 'Not charging' ? '#FFC832' : '#6EDCA1'} />
            <Row label="Voltage" value={`${fmt(charger.voltage_v)} V`} />
            <Row label="Current" value={`${fmt(charger.current_a)} A`} />
            <Divider />

            {/* Relays */}
            <Text style={s.section}>Relays</Text>
            <View style={s.dotGrid}>
              {Object.entries(relays).map(([k, v]) => (
                <StatusDot key={k} label={k.replace('_', ' ')} active={v as boolean} />
              ))}
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.btn, active ? s.btnDeactivate : s.btnActivate]}
              onPress={() => setActive((p) => !p)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={active ? 'stop-circle' : 'play-circle'}
                size={18}
                color={active ? '#FF503C' : '#15191B'}
              />
              <Text style={[s.btnText, active && s.btnTextRed]}>
                {active ? 'DEACTIVATE' : 'ACTIVATE'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnClose} onPress={onClose} activeOpacity={0.8}>
              <Text style={s.btnCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  panel: {
    width: 340, maxHeight: '80%',
    backgroundColor: 'rgba(26,30,32,1)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(51,56,58,1)',
    padding: 18, zIndex: 1,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { flex: 1, color: '#D2D3D3', fontFamily: 'Oswald', fontSize: 16, fontWeight: 'bold' },
  closeBtn: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: 'rgba(45,49,51,1)',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 14, borderWidth: 1,
  },
  badgeOn:  { backgroundColor: 'rgba(110,220,161,0.08)', borderColor: 'rgba(110,220,161,0.3)' },
  badgeOff: { backgroundColor: 'rgba(255,80,60,0.08)',  borderColor: 'rgba(255,80,60,0.3)' },
  statusText: { fontFamily: 'Oswald', fontSize: 13, fontWeight: 'bold' },
  scroll: { marginBottom: 14 },
  section: {
    color: 'rgba(100,102,102,1)', fontFamily: 'Oswald',
    fontSize: 11, fontWeight: 'bold', letterSpacing: 1,
    marginBottom: 4, marginTop: 2,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(40,44,46,1)',
  },
  rowLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 12 },
  rowValue: { color: 'rgba(210,211,211,1)', fontFamily: 'Oswald', fontSize: 12, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: 'rgba(51,56,58,1)', marginVertical: 8 },
  dotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 80 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLabel: { color: 'rgba(120,122,122,1)', fontFamily: 'Oswald', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 10, paddingVertical: 11, borderWidth: 1,
  },
  btnActivate:   { backgroundColor: 'rgba(110,220,161,1)', borderColor: 'rgba(110,220,161,1)' },
  btnDeactivate: { backgroundColor: 'rgba(255,80,60,0.1)', borderColor: 'rgba(255,80,60,0.5)' },
  btnText:    { fontFamily: 'Oswald', fontSize: 13, fontWeight: 'bold', color: '#15191B' },
  btnTextRed: { color: '#FF503C' },
  btnClose: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 11,
    backgroundColor: 'rgba(45,49,51,1)', borderWidth: 1, borderColor: 'rgba(55,60,62,1)',
  },
  btnCloseText: { fontFamily: 'Oswald', fontSize: 13, fontWeight: 'bold', color: 'rgba(160,162,162,1)' },
});

export default HydDialog;
