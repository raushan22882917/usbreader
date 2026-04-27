import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useVehicleData } from '../context/DataContext';

const GlobalUsbStatusBar: React.FC = () => {
  const { isConnected: connected, data } = useVehicleData();
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    if (data?.ts) {
      const ms = data.ts > 1e12 ? data.ts : data.ts * 1000;
      setLastUpdate(new Date(ms).toLocaleTimeString());
    }
  }, [data]);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* USB status */}
        <View style={styles.pill}>
          <View style={[styles.dot, { backgroundColor: connected ? '#6EDCA1' : '#444' }]} />
          <Text style={[styles.pillText, { color: connected ? '#6EDCA1' : '#666' }]}>
            {connected ? 'USB ON' : 'USB OFF'}
          </Text>
        </View>

        {/* SOC */}
        {data?.bms && (
          <View style={styles.pill}>
            <MaterialCommunityIcons name="battery" size={13} color="#FFC832" />
            <Text style={[styles.pillText, { color: '#FFC832' }]}>
              {data.bms.soc.toFixed(0)}%
            </Text>
          </View>
        )}

        {/* Last update */}
        {lastUpdate ? <Text style={styles.timeText}>{lastUpdate}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(18,22,24,0.97)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(110,220,161,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(26,30,32,1)', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(51,56,58,1)',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 10, fontWeight: 'bold' },
  timeText: { color: '#555', fontSize: 10, marginLeft: 'auto' },
});

export default GlobalUsbStatusBar;
