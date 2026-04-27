import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVehicleData } from '../context/DataContext';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const StatusSection: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { isConnected, error, data } = useVehicleData();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDateTime = (date: Date) =>
    date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

  const getUsbStatus = (): { icon: IconName; color: string } => {
    if (error) return { icon: 'close-circle', color: '#FF503C' };
    if (isConnected && data) return { icon: 'check-circle', color: '#6EDCA1' };
    return { icon: 'close-circle-outline', color: '#808080' };
  };

  const usbStatus = getUsbStatus();

  return (
    <View style={styles.container}>
      <Text style={styles.dateTime}>{formatDateTime(currentTime)}</Text>
      <View style={styles.icons}>
        <MaterialCommunityIcons name={usbStatus.icon} size={18} color={usbStatus.color} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 30,
    backgroundColor: 'rgba(21,25,27,1)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  dateTime: {
    color: '#C8C9C9',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default StatusSection;
