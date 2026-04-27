import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVehicleData } from '../context/DataContext';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];


interface NavProps {
  onUsbPress: () => void;
  onHydPress: () => void;
  onBatteryPress: () => void;
  onMotorPress: () => void;
  onSystemPress: () => void;
  onTractorNavPress: () => void;
  onInverterPress: () => void;
}

const NavigationButtons: React.FC<NavProps> = ({ onUsbPress, onHydPress, onBatteryPress, onMotorPress, onSystemPress, onTractorNavPress, onInverterPress }) => {
  const { isConnected } = useVehicleData();
  const { width } = Dimensions.get('window');
  const isLandscape = width > 600;
  const iconSize = isLandscape ? 24 : 28;

  return (
    <View style={styles.container}>
      {/* Row 1: existing buttons */}
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={onHydPress} activeOpacity={0.8}>
          <MaterialCommunityIcons name="water" size={iconSize} color="rgba(160,162,162,1)" />
          <Text style={styles.label}>HYDRAULICS</Text>
        </TouchableOpacity>
        {/* New screens */}
        <TouchableOpacity style={[styles.btn, styles.btnBattery]} onPress={onBatteryPress} activeOpacity={0.8}>
          <MaterialCommunityIcons name="battery-charging-high" size={iconSize} color="#6EDCA1" />
          <Text style={[styles.label, { color: '#6EDCA1' }]}>BATTERY</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnMotor]} onPress={onMotorPress} activeOpacity={0.8}>
          <MaterialCommunityIcons name="engine" size={iconSize} color="#FFC832" />
          <Text style={[styles.label, { color: '#FFC832' }]}>MOTOR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSystem]} onPress={onSystemPress} activeOpacity={0.8}>
          <MaterialCommunityIcons name="monitor-dashboard" size={iconSize} color="#50B4FF" />
          <Text style={[styles.label, { color: '#50B4FF' }]}>SYSTEM</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnTractorNav]} onPress={onTractorNavPress} activeOpacity={0.8}>
          <MaterialCommunityIcons name="tractor" size={iconSize} color="#FF9811" />
          <Text style={[styles.label, { color: '#FF9811' }]}>NAV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnInverter]} onPress={onInverterPress} activeOpacity={0.8}>
          <MaterialCommunityIcons name="cog-outline" size={iconSize} color="#9333EA" />
          <Text style={[styles.label, { color: '#9333EA' }]}>INVERTER</Text>
        </TouchableOpacity>
        {/* Home */}
        <TouchableOpacity style={[styles.btn, styles.btnActive]}>
          <MaterialCommunityIcons name="home" size={iconSize} color="#6EDCA1" />
          <Text style={[styles.label, styles.labelActive]}>HOME</Text>
        </TouchableOpacity>
        {/* USB */}
        <TouchableOpacity
          style={[styles.btn, isConnected ? styles.btnUsbOn : styles.btnUsbOff]}
          onPress={onUsbPress}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="usb" size={iconSize} color={isConnected ? '#6EDCA1' : '#FF503C'} />
          <Text style={[styles.label, { color: isConnected ? '#6EDCA1' : '#FF503C' }]}>
            {isConnected ? 'USB ON' : 'USB OFF'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(21,25,27,1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51,56,58,1)',
    alignItems: 'stretch',
  },
  row: { flex: 1, flexDirection: 'row', gap: 6 },
  group: { flex: 1, flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    backgroundColor: 'rgba(35,39,41,1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(55,60,62,1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 5,
    minWidth: 0,
  },
  btnActive: {
    backgroundColor: 'rgba(40,60,48,1)',
    borderColor: 'rgba(110,220,161,0.5)',
  },
  btnBattery: {
    backgroundColor: 'rgba(110,220,161,0.08)',
    borderColor: 'rgba(110,220,161,0.35)',
  },
  btnMotor: {
    backgroundColor: 'rgba(255,200,50,0.08)',
    borderColor: 'rgba(255,200,50,0.35)',
  },
  btnSystem: {
    backgroundColor: 'rgba(80,180,255,0.08)',
    borderColor: 'rgba(80,180,255,0.35)',
  },
  btnTractorNav: {
    backgroundColor: 'rgba(255,152,17,0.08)',
    borderColor: 'rgba(255,152,17,0.35)',
  },
  btnInverter: {
    backgroundColor: 'rgba(147,51,234,0.08)',
    borderColor: 'rgba(147,51,234,0.35)',
  },
  btnUsbOn: {
    backgroundColor: 'rgba(110,220,161,0.08)',
    borderColor: 'rgba(110,220,161,0.4)',
  },
  btnUsbOff: {
    backgroundColor: 'rgba(255,80,60,0.08)',
    borderColor: 'rgba(255,80,60,0.4)',
  },
  label: {
    color: 'rgba(160,162,162,1)',
    fontFamily: 'Oswald',
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  labelActive: { color: '#6EDCA1' },
});

export default NavigationButtons;
