import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, Platform, Alert
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import GlobalUsbStatusBar from './GlobalUsbStatusBar';

// DOM type declarations for web support
declare const document: any;
interface FileList {
  length: number;
  item(index: number): File | null;
  [index: number]: File;
}

// ── Types ────────────────────────────────────────────────────
type TabType = 'logs' | 'status';

interface ConversionResult {
  fileName: string;
  originalSize: number;
  paddedSize: number;
  crc32: string;
  hexOutput: string;
  timestamp: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

// ── Constants ─────────────────────────────────────────────────
const FLASH_SIZE = 131072;
const BYTES_PER_LINE = 16;

// ── CRC32 Implementation ──────────────────────────────────────
function makeCrcTable(): number[] {
  let c: number;
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  }
  return (~crc) >>> 0;
}

// ── Binary to Hex Converter ───────────────────────────────────
function convertBinToHex(fileName: string, arrayBuffer: ArrayBuffer): ConversionResult {
  const bytes = new Uint8Array(arrayBuffer);
  const originalSize = bytes.length;

  // Pad to FLASH_SIZE with 0xFF
  const paddedBytes = new Uint8Array(FLASH_SIZE);
  paddedBytes.fill(0xFF);
  paddedBytes.set(bytes);

  const crc = crc32(paddedBytes);
  const baseName = fileName.replace(/\.bin$/i, '');
  const varName = `${baseName}_pattern`;

  // Generate C header content
  const lines: string[] = [];
  lines.push(`const uint8_t ${varName}[${FLASH_SIZE}] = {`);

  for (let i = 0; i < paddedBytes.length; i += BYTES_PER_LINE) {
    const chunk = paddedBytes.slice(i, i + BYTES_PER_LINE);
    const hexValues = Array.from(chunk).map(b => `0x${b.toString(16).padStart(2, '0')}`);
    lines.push(`    ${hexValues.join(', ')},`);
  }

  lines.push('};');

  const hexOutput = lines.join('\r\n');

  return {
    fileName,
    originalSize,
    paddedSize: FLASH_SIZE,
    crc32: `0x${crc.toString(16).toUpperCase().padStart(8, '0')}`,
    hexOutput,
    timestamp: new Date().toISOString(),
  };
}

// ── Components ────────────────────────────────────────────────

interface UploadPanelProps {
  onFilesSelected: (files: { name: string; data: ArrayBuffer }[]) => void;
  isProcessing: boolean;
}

// Web-only drop zone component
interface WebDropZoneProps {
  onFilesSelected: (files: FileList | null) => void;
  isProcessing: boolean;
  onClick: () => void;
}

const WebDropZone: React.FC<WebDropZoneProps> = ({ onFilesSelected, isProcessing, onClick }) => {
  const handleDrop = useCallback((e: any) => {
    e.preventDefault();
    if (isProcessing) return;
    const files = e.dataTransfer?.files;
    onFilesSelected(files);
  }, [isProcessing, onFilesSelected]);

  const handleDragOver = useCallback((e: any) => {
    e.preventDefault();
  }, []);

  return (
    <View
      style={[s.dropZone, isProcessing && s.dropZoneDisabled]}
      // @ts-ignore - web-only props
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <TouchableOpacity onPress={onClick} disabled={isProcessing} style={s.dropZoneInner}>
        <MaterialCommunityIcons name="upload" size={48} color="#6EDCA1" />
        <Text style={s.uploadText}>Drop .bin files here or click to upload</Text>
        <Text style={s.uploadSubtext}>Supports multiple files • Auto-converts to hex</Text>
      </TouchableOpacity>
    </View>
  );
};

const UploadPanel: React.FC<UploadPanelProps> = ({ onFilesSelected, isProcessing }) => {
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (file) fileArray.push(file);
    }

    const filePromises = fileArray
      .filter((f) => f.name.toLowerCase().endsWith('.bin'))
      .map((file) =>
        file.arrayBuffer().then((buffer) => ({ name: file.name, data: buffer }))
      );

    const result = await Promise.all(filePromises);
    onFilesSelected(result);
  }, [onFilesSelected]);

  // Web-specific file input using native DOM API
  const openWebFilePicker = useCallback(() => {
    if (typeof document === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bin';
    input.multiple = true;
    input.onchange = (e: any) => {
      const files = e.target?.files;
      handleFiles(files);
    };
    input.click();
  }, [handleFiles]);

  // Native file picker using expo-document-picker
  const openNativeFilePicker = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const files = result.assets || [];
      const binFiles = files.filter(f => f.name.toLowerCase().endsWith('.bin'));

      if (binFiles.length === 0) {
        Alert.alert('No .bin files', 'Please select .bin files only.');
        return;
      }

      // Read files - handle both file:// and content:// URIs
      const filePromises = binFiles.map(async (file) => {
        console.log('[FilePicker] File:', file.name, 'URI type:', file.uri?.substring(0, 20));
        
        let fileUri = file.uri;
        
        // For content:// URIs on Android, we need to copy to cache first
        if (file.uri?.startsWith('content://')) {
          try {
            const cacheFilePath = (FileSystem as any).cacheDirectory + file.name;
            await FileSystem.copyAsync({
              from: file.uri,
              to: cacheFilePath,
            });
            fileUri = cacheFilePath;
            console.log('[FilePicker] Copied to cache:', cacheFilePath);
          } catch (copyError) {
            console.log('[FilePicker] Copy failed:', (copyError as Error).message);
            throw new Error(`Cannot access file ${file.name}. Please try a different file.`);
          }
        }
        
        // Now read the file (should be file:// URI)
        try {
          const base64 = await FileSystem.readAsStringAsync(fileUri, {
            encoding: 'base64',
          });
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          console.log('[FilePicker] Read success:', file.name, 'size:', bytes.length);
          return { name: file.name, data: bytes.buffer };
        } catch (readError) {
          console.log('[FilePicker] Read failed:', (readError as Error).message);
          throw new Error(`Failed to read file ${file.name}: ${(readError as Error).message}`);
        }
      });

      const convertedFiles = await Promise.all(filePromises);
      console.log('[FilePicker] All files read:', convertedFiles.length);
      onFilesSelected(convertedFiles);
    } catch (err) {
      console.error('[FilePicker] Error:', err);
      Alert.alert('Error', 'Failed to read files: ' + (err as Error).message);
    }
  }, [onFilesSelected]);

  const openFilePicker = Platform.OS === 'web' ? openWebFilePicker : openNativeFilePicker;

  return (
    <View style={s.uploadPanel}>
      <Text style={s.panelTitle}>.BIN to .HEX Converter</Text>

      {Platform.OS === 'web' ? (
        <WebDropZone onFilesSelected={handleFiles} isProcessing={isProcessing} onClick={openFilePicker} />
      ) : (
        <TouchableOpacity
          style={[s.dropZone, isProcessing && s.dropZoneDisabled]}
          onPress={openFilePicker}
          disabled={isProcessing}
        >
          <MaterialCommunityIcons name="upload" size={48} color="#6EDCA1" />
          <Text style={s.uploadText}>Tap to upload .bin files from device</Text>
          <Text style={s.uploadSubtext}>Select .bin files • Auto-converts to hex</Text>
        </TouchableOpacity>
      )}

      {isProcessing && (
        <View style={s.processingContainer}>
          <ActivityIndicator size="small" color="#6EDCA1" />
          <Text style={s.processingText}>Converting...</Text>
        </View>
      )}

      <View style={s.infoContainer}>
        <Text style={s.infoTitle}>Conversion Details</Text>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Flash Size:</Text>
          <Text style={s.infoValue}>{FLASH_SIZE.toLocaleString()} bytes (128 KB)</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Padding:</Text>
          <Text style={s.infoValue}>0xFF to fill to flash size</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Output:</Text>
          <Text style={s.infoValue}>C header file (.h)</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>CRC32:</Text>
          <Text style={s.infoValue}>Calculated on padded data</Text>
        </View>
      </View>
    </View>
  );
};

interface TabButtonProps {
  active: boolean;
  onPress: () => void;
  icon: string;
  label: string;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onPress, icon, label }) => (
  <TouchableOpacity
    style={[s.tabButton, active && s.tabButtonActive]}
    onPress={onPress}
  >
    <MaterialCommunityIcons name={icon as any} size={16} color={active ? '#6EDCA1' : 'rgba(150,151,152,1)'} />
    <Text style={[s.tabButtonText, active && s.tabButtonTextActive]}>{label}</Text>
  </TouchableOpacity>
);

interface LogsPanelProps {
  logs: LogEntry[];
}

const LogsPanel: React.FC<LogsPanelProps> = ({ logs }) => {
  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return '#6EDCA1';
      case 'error': return '#FF503C';
      case 'warning': return '#FFC832';
      default: return '#50B4FF';
    }
  };

  const renderLog = ({ item }: { item: LogEntry }) => (
    <View style={s.logRow}>
      <Text style={s.logTime}>{item.timestamp.split('T')[1].slice(0, 8)}</Text>
      <Text style={[s.logType, { color: getLogColor(item.type) }]}>[{item.type.toUpperCase()}]</Text>
      <Text style={s.logMessage} numberOfLines={2}>{item.message}</Text>
    </View>
  );

  return (
    <View style={s.panelContainer}>
      <Text style={s.panelTitle}>Conversion Logs</Text>
      {logs.length === 0 ? (
        <View style={s.emptyContainer}>
          <MaterialCommunityIcons name="text-box-outline" size={32} color="rgba(100,102,102,1)" />
          <Text style={s.emptyText}>No logs yet. Upload .bin files to see conversion logs.</Text>
        </View>
      ) : (
        <FlatList
          data={[...logs].reverse()}
          renderItem={renderLog}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.logsList}
          showsVerticalScrollIndicator={true}
        />
      )}
    </View>
  );
};

interface StatusPanelProps {
  results: ConversionResult[];
}

const StatusPanel: React.FC<StatusPanelProps> = ({ results }) => {
  const renderResult = ({ item }: { item: ConversionResult }) => (
    <View style={s.resultCard}>
      <View style={s.resultHeader}>
        <MaterialCommunityIcons name="file-check" size={20} color="#6EDCA1" />
        <Text style={s.resultFileName} numberOfLines={1}>{item.fileName}</Text>
      </View>
      <View style={s.resultStats}>
        <View style={s.resultStat}>
          <Text style={s.resultStatLabel}>Original</Text>
          <Text style={s.resultStatValue}>{item.originalSize.toLocaleString()} B</Text>
        </View>
        <View style={s.resultStat}>
          <Text style={s.resultStatLabel}>Padded</Text>
          <Text style={s.resultStatValue}>{item.paddedSize.toLocaleString()} B</Text>
        </View>
        <View style={s.resultStat}>
          <Text style={s.resultStatLabel}>CRC32</Text>
          <Text style={[s.resultStatValue, { color: '#FFC832', fontSize: 11 }]}>{item.crc32}</Text>
        </View>
      </View>
      <Text style={s.resultTimestamp}>
        {new Date(item.timestamp).toLocaleString()}
      </Text>
    </View>
  );

  return (
    <View style={s.panelContainer}>
      <Text style={s.panelTitle}>Conversion Status</Text>
      {results.length === 0 ? (
        <View style={s.emptyContainer}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={32} color="rgba(100,102,102,1)" />
          <Text style={s.emptyText}>No conversions yet. Upload .bin files to see status.</Text>
        </View>
      ) : (
        <FlatList
          data={[...results].reverse()}
          renderItem={renderResult}
          keyExtractor={(item, index) => `${item.fileName}-${index}`}
          contentContainerStyle={s.resultsList}
          showsVerticalScrollIndicator={true}
        />
      )}
    </View>
  );
};

// ── Main Component ────────────────────────────────────────────
const BatteryDetailPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('logs');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<ConversionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      message,
      type,
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  const handleFilesSelected = useCallback(async (files: { name: string; data: ArrayBuffer }[]) => {
    if (files.length === 0) {
      addLog('No valid .bin files selected', 'warning');
      return;
    }

    setIsProcessing(true);
    addLog(`Processing ${files.length} file(s)...`, 'info');

    for (const file of files) {
      try {
        addLog(`Converting ${file.name}...`, 'info');

        const result = convertBinToHex(file.name, file.data);
        setResults(prev => [...prev, result]);

        addLog(`${file.name}: CRC32 ${result.crc32}`, 'success');
        addLog(`${file.name}: ${result.originalSize}B → ${result.paddedSize}B padded`, 'success');

        // Create downloadable blob
        const blob = new (globalThis as any).Blob([result.hexOutput], { type: 'text/plain' });
        const url = (globalThis as any).URL.createObjectURL(blob);
        const a = (globalThis as any).document.createElement('a');
        a.href = url;
        a.download = file.name.replace(/\.bin$/i, '.h');
        (globalThis as any).document.body.appendChild(a);
        a.click();
        (globalThis as any).document.body.removeChild(a);
        (globalThis as any).URL.revokeObjectURL(url);

        addLog(`${file.name}: Downloaded as .h file`, 'success');
      } catch (err) {
        addLog(`${file.name}: Error - ${(err as Error).message}`, 'error');
      }
    }

    setIsProcessing(false);
    addLog('Batch conversion complete', 'info');
  }, [addLog]);

  return (
    <View style={s.root}>
      <GlobalUsbStatusBar />

      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#6EDCA1" />
        </TouchableOpacity>
        <Text style={s.title}>BIN to HEX Converter</Text>
        <View style={[s.badge, { borderColor: '#6EDCA1' }]}>
          <Text style={[s.badgeText, { color: '#6EDCA1' }]}>Ready</Text>
        </View>
      </View>

      <View style={s.content}>
        {/* Left Panel - Upload */}
        <View style={s.leftPanel}>
          <UploadPanel onFilesSelected={handleFilesSelected} isProcessing={isProcessing} />
        </View>

        {/* Right Panel - Tabs */}
        <View style={s.rightPanel}>
          <View style={s.tabBar}>
            <TabButton
              active={activeTab === 'logs'}
              onPress={() => setActiveTab('logs')}
              icon="text-box"
              label="Logs"
            />
            <TabButton
              active={activeTab === 'status'}
              onPress={() => setActiveTab('status')}
              icon="clipboard-check"
              label="Status"
            />
          </View>

          <View style={s.tabContent}>
            {activeTab === 'logs' ? (
              <LogsPanel logs={logs} />
            ) : (
              <StatusPanel results={results} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(21,25,27,1)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51,56,58,1)',
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: {
    flex: 1,
    color: 'rgba(235,235,235,1)',
    fontFamily: 'Oswald',
    fontSize: 22,
    fontWeight: 'bold',
  },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: 'Oswald', fontSize: 12, fontWeight: 'bold' },

  content: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    gap: 14,
  },

  leftPanel: {
    flex: 1,
    minWidth: 300,
  },
  rightPanel: {
    flex: 1,
    minWidth: 350,
    backgroundColor: 'rgba(28,32,34,1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(51,56,58,1)',
    overflow: 'hidden',
  },

  uploadPanel: {
    backgroundColor: 'rgba(28,32,34,1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(51,56,58,1)',
    padding: 16,
    gap: 16,
  },
  panelTitle: {
    color: 'rgba(200,201,201,1)',
    fontFamily: 'Oswald',
    fontSize: 16,
    fontWeight: 'bold',
  },
  uploadText: {
    color: 'rgba(235,235,235,1)',
    fontFamily: 'Oswald',
    fontSize: 14,
    marginTop: 12,
  },
  uploadSubtext: {
    color: 'rgba(120,122,122,1)',
    fontFamily: 'Oswald',
    fontSize: 11,
    marginTop: 4,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(110, 220, 161, 0.4)',
    borderRadius: 12,
    padding: 40,
    backgroundColor: 'rgba(28, 32, 34, 0.5)',
  },
  dropZoneDisabled: {
    opacity: 0.6,
  },
  dropZoneInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  processingText: {
    color: '#6EDCA1',
    fontFamily: 'Oswald',
    fontSize: 14,
  },
  infoContainer: {
    backgroundColor: 'rgba(35,39,41,1)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  infoTitle: {
    color: 'rgba(200,201,201,1)',
    fontFamily: 'Oswald',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: 'rgba(120,122,122,1)',
    fontFamily: 'Oswald',
    fontSize: 12,
  },
  infoValue: {
    color: 'rgba(235,235,235,1)',
    fontFamily: 'Oswald',
    fontSize: 12,
  },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51,56,58,1)',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(110, 220, 161, 0.1)',
    borderBottomWidth: 2,
    borderBottomColor: '#6EDCA1',
  },
  tabButtonText: {
    color: 'rgba(150,151,152,1)',
    fontFamily: 'Oswald',
    fontSize: 13,
  },
  tabButtonTextActive: {
    color: '#6EDCA1',
  },

  tabContent: {
    flex: 1,
    padding: 12,
  },

  panelContainer: {
    flex: 1,
    gap: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyText: {
    color: 'rgba(120,122,122,1)',
    fontFamily: 'Oswald',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  logsList: {
    gap: 4,
  },
  logRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(35,39,41,1)',
    borderRadius: 4,
  },
  logTime: {
    color: 'rgba(100,102,102,1)',
    fontFamily: 'Oswald',
    fontSize: 10,
    width: 55,
  },
  logType: {
    fontFamily: 'Oswald',
    fontSize: 10,
    width: 50,
  },
  logMessage: {
    flex: 1,
    color: 'rgba(200,201,201,1)',
    fontFamily: 'Oswald',
    fontSize: 11,
  },

  resultsList: {
    gap: 10,
  },
  resultCard: {
    backgroundColor: 'rgba(35,39,41,1)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultFileName: {
    flex: 1,
    color: 'rgba(235,235,235,1)',
    fontFamily: 'Oswald',
    fontSize: 13,
    fontWeight: 'bold',
  },
  resultStats: {
    flexDirection: 'row',
    gap: 16,
  },
  resultStat: {
    alignItems: 'center',
  },
  resultStatLabel: {
    color: 'rgba(120,122,122,1)',
    fontFamily: 'Oswald',
    fontSize: 10,
  },
  resultStatValue: {
    color: 'rgba(235,235,235,1)',
    fontFamily: 'Oswald',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resultTimestamp: {
    color: 'rgba(100,102,102,1)',
    fontFamily: 'Oswald',
    fontSize: 10,
  },
});

export default BatteryDetailPage;
