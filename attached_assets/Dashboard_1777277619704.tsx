import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { DataProvider } from '../context/DataContext';
import StatusSection from './StatusSection';
import SpeedDisplay from './SpeedDisplay';
import FieldNavSection from './FieldNavSection';
import BatterySection from './BatterySection';
import PowerSection from './PowerSection';
import NavigationButtons from './NavigationButtons';
import UsbConnectDialog from './UsbConnectDialog';
import HydraulicsPage from './HydraulicsPage';
import BatteryDetailPage from './BatteryDetailPage';
import MotorDiagPage from './MotorDiagPage';
import SystemStatusPage from './SystemStatusPage';
import TractorNavPage from './TractorNavPage';
import InverterParameterTool from './InverterParameterTool';
import GlobalUsbStatusBar from './GlobalUsbStatusBar';
import UsbTestComponent from './UsbTestComponent';

type Screen = 'dashboard' | 'hydraulics' | 'battery' | 'motor' | 'system' | 'tractornav' | 'inverter';

const DashboardInner = () => {
  const [usbOpen, setUsbOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  const isSmallScreen = screenWidth < 600;

  if (screen === 'hydraulics') {
    return <HydraulicsPage onBack={() => setScreen('dashboard')} />;
  }
  if (screen === 'battery') {
    return <BatteryDetailPage onBack={() => setScreen('dashboard')} />;
  }
  if (screen === 'motor') {
    return <MotorDiagPage onBack={() => setScreen('dashboard')} />;
  }
  if (screen === 'system') {
    return <SystemStatusPage onBack={() => setScreen('dashboard')} />;
  }
  if (screen === 'tractornav') {
    return <TractorNavPage onBack={() => setScreen('dashboard')} />;
  }
  if (screen === 'inverter') {
    return <InverterParameterTool onBack={() => setScreen('dashboard')} />;
  }

  return (
    <View style={styles.root}>
      <UsbTestComponent />
      <GlobalUsbStatusBar />
      <StatusSection />

      <View style={[styles.mainRow, isLandscape && styles.mainRowLandscape, isSmallScreen && styles.mainRowSmall]}>
        <View style={[styles.section, styles.speedSection]}>
          <SpeedDisplay />
        </View>
        <View style={[styles.section, styles.navSection]}>
          <FieldNavSection />
        </View>
        <View style={[styles.section, styles.batterySection]}>
          <BatterySection />
        </View>
        <View style={[styles.section, styles.powerSection]}>
          <PowerSection />
        </View>
      </View>

      <NavigationButtons
        onUsbPress={() => setUsbOpen(true)}
        onHydPress={() => setScreen('hydraulics')}
        onBatteryPress={() => setScreen('battery')}
        onMotorPress={() => setScreen('motor')}
        onSystemPress={() => setScreen('system')}
        onTractorNavPress={() => setScreen('tractornav')}
        onInverterPress={() => setScreen('inverter')}
      />

      {/* Sidebar rendered at root so it overlays the full screen */}
      <UsbConnectDialog visible={usbOpen} onClose={() => setUsbOpen(false)} />
    </View>
  );
};

const Dashboard = () => (
  <DataProvider>
    <DashboardInner />
  </DataProvider>
);

const styles = StyleSheet.create({
  root: { 
    flex: 1, 
    backgroundColor: 'rgba(21,25,27,1)', 
    flexDirection: 'column' 
  },
  mainRow: { 
    flex: 1, 
    flexDirection: 'row',
    minHeight: 300,
    paddingHorizontal: 8,
    gap: 8,
  },
  mainRowLandscape: { 
    minHeight: 250,
    paddingHorizontal: 12,
    gap: 10,
  },
  mainRowSmall: {
    minHeight: 200,
    paddingHorizontal: 4,
    gap: 4,
  },
  section: {
    flex: 1,
    minWidth: 80,
  },
  speedSection: {
    flex: 0.9,
  },
  navSection: {
    flex: 1.4,
  },
  batterySection: {
    flex: 0.9,
  },
  powerSection: {
    flex: 1.0,
  },
});

export default Dashboard;
