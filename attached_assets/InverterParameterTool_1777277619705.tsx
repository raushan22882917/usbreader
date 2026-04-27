import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  NativeModules
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVehicleData } from '../context/DataContext';
import USBSerialService from '../USBSerialService';

const DEFAULT_PROFILE = {
  profileName: "",
  controller: "",
  parameters: [] as any[]
};

interface Parameter {
  code: string;
  name: string;
  group: string;
  file_value: any;
  current_value: any;
  override_value: any;
  final_value: any;
  unit: string;
  status: string;
  addr?: string;
  scale?: number;
}

interface USBWriteCommand {
  cmd: string;
  node: number;
  seq: number;
  params: {
    addr: string;
    val: number;
    scale: number;
  }[];
}

interface USBReadCommand {
  cmd: string;
  node: number;
  seq: number;
  params: {
    addr: string;
    scale: number;
  }[];
}

interface USBResponse {
  status: string;
  seq: number;
  params: {
    addr: string;
    val: number;
    raw: number;
    ok: boolean;
  }[];
  ts: number;
}

const InverterParameterTool: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  
  // Use shared DataContext for USB connection
  const { isConnected, data: vehicleData, connect, disconnect, devices, scanDevices, write } = useVehicleData();
  
  const getColumnWidths = useCallback(() => {
    // Responsive column widths based on screen size
    const baseWidth = Math.max(screenWidth * (isLandscape ? 0.08 : 0.12), 60);
    return {
      code: baseWidth,
      name: baseWidth * 2,
      value: baseWidth * 1.2,
      unit: baseWidth * 0.8,
      status: baseWidth
    };
  }, [screenWidth, isLandscape]);

  const [currentGroup, setCurrentGroup] = useState("All");
  const [currentParamCode, setCurrentParamCode] = useState<string | null>(null);
  const [filePath, setFilePath] = useState("");
  const [profileData, setProfileData] = useState(DEFAULT_PROFILE);
  const [paramRows, setParamRows] = useState<Parameter[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedParam, setSelectedParam] = useState<Parameter | null>(null);
  const [overrideCode, setOverrideCode] = useState("");
  const [overrideValue, setOverrideValue] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [jsonSidebarOpen, setJsonSidebarOpen] = useState(false);
  
  const [nodeId, setNodeId] = useState("1");
  const [deviceId, setDeviceId] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [pendingSeq, setPendingSeq] = useState<number | null>(null);
  const [pendingOperation, setPendingOperation] = useState<'read' | 'write' | null>(null);

  const seqRef = useRef(1);

  useEffect(() => {
    const unsubscribe = USBSerialService.onData((hexData: string) => {
      handleUSBResponse(hexData);
    });
    scanDevices();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadProfileIntoRows(profileData);
  }, []);

  const loadProfileIntoRows = (profile: any) => {
    const rows: Parameter[] = [];
    // Handle both formats: array of objects or object with parameters array
    const params = Array.isArray(profile) ? profile : (profile.parameters || []);
    
    for (const p of params) {
      // Map alternative field names to standard ones - handle actual parameter names
      const code = String(p.code || p.parameter || p.parameter_code || "").trim();
      const name = String(p.name || p.parameter_name || p.remarks || p.description || code).trim();
      const fileValue = p.value ?? p.std_value ?? p.default_value ?? p.file_value ?? "";
      const currentValue = p.current_value ?? p.actual_value ?? p.live_value ?? "";
      const unit = String(p.unit || p.units || "").trim();
      const group = String(p.group || p.parameter_group || "Ungrouped").trim() || "Ungrouped";
      const addr = p.addr || p.address || codeToAddr(code);
      const scale = p.scale || p.scaling_factor || 1;

      if (!code) continue; // Skip entries without a valid code

      rows.push({
        code,
        name,
        group,
        file_value: fileValue,
        current_value: currentValue,
        override_value: "",
        final_value: currentValue || fileValue,
        unit,
        status: currentValue ? (currentValue === fileValue ? "Same" : "Changed") : "Pending Read",
        addr,
        scale
      });
    }
    setParamRows(rows);
  };

  const codeToAddr = (code: string): string => {
    const clean = code.replace(/[^0-9]/g, '');
    if (clean.length >= 4) {
      return `0xF${clean.substring(0, 3)}`;
    }
    return `0xF${clean.padStart(3, '0')}`;
  };

  const recomputeFinalValue = (row: Parameter) => {
    if (String(row.override_value).trim() !== "") {
      row.final_value = row.override_value;
    } else {
      row.final_value = row.file_value;
    }

    const current = String(row.current_value).trim();
    const finalv = String(row.final_value).trim();
    const override = String(row.override_value).trim();

    if (current === "") {
      row.status = "Pending Read";
    } else if (override !== "") {
      row.status = "Override";
    } else if (current === finalv) {
      row.status = "Same";
    } else {
      row.status = "Changed";
    }
  };

  const getFilteredRows = () => {
    const search = searchText.trim().toLowerCase();
    let rows = [...paramRows];

    if (currentGroup !== "All") {
      rows = rows.filter(row => row.group === currentGroup);
    }

    if (search) {
      rows = rows.filter(row => {
        const blob = `${row.code} ${row.name} ${row.group} ${row.file_value} ${row.current_value}`.toLowerCase();
        return blob.includes(search);
      });
    }

    return rows;
  };

  const getGroups = () => {
    const groups = new Set<string>();
    paramRows.forEach(row => groups.add(row.group));
    return Array.from(groups).sort();
  };

  const handleUSBResponse = (hexData: string) => {
    try {
      const jsonStr = hexToString(hexData);
      const response: USBResponse = JSON.parse(jsonStr);
      
      if (response.status === "ok" && response.params) {
        if (pendingOperation === 'read' && pendingSeq === response.seq) {
          const updatedRows = paramRows.map(row => {
            const matchingParam = response.params.find(p => 
              p.addr.toLowerCase() === (row.addr || '').toLowerCase()
            );
            if (matchingParam) {
              const newRow = { ...row };
              newRow.current_value = matchingParam.val;
              recomputeFinalValue(newRow);
              return newRow;
            }
            return row;
          });
          setParamRows(updatedRows);
          setStatusMessage(`Read successful: ${response.params.length} parameter(s) updated`);
        } else if (pendingOperation === 'write' && pendingSeq === response.seq) {
          const successCount = response.params.filter(p => p.ok).length;
          setStatusMessage(`Write complete: ${successCount}/${response.params.length} successful`);
          setTimeout(() => readCurrentValues(), 500);
        }
      }
    } catch (error) {
      console.log('USB response parse error:', error);
    } finally {
      setLoading(false);
      setPendingSeq(null);
      setPendingOperation(null);
    }
  };

  const hexToString = (hex: string): string => {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
  };

  const stringToHex = (str: string): string => {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  };

  const handleConnect = async () => {
    if (!deviceId) {
      Alert.alert("No Device", "No USB device available. Please connect a USB device.");
      return;
    }

    setLoading(true);
    try {
      await connect(deviceId);
      setStatusMessage(`Connected: USB Device ${deviceId}`);
    } catch (error) {
      Alert.alert("Connection Failed", String(error));
      setStatusMessage("Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const readCurrentValues = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Connect to USB controller first.");
      return;
    }

    if (paramRows.length === 0) {
      Alert.alert("No Parameters", "Load a JSON profile first.");
      return;
    }

    setLoading(true);
    const seq = seqRef.current++;
    setPendingSeq(seq);
    setPendingOperation('read');

    const readCmd: USBReadCommand = {
      cmd: "read",
      node: parseInt(nodeId) || 1,
      seq: seq,
      params: paramRows.map(row => ({
        addr: row.addr || codeToAddr(row.code),
        scale: row.scale || 1
      }))
    };

    try {
      const hexData = stringToHex(JSON.stringify(readCmd));
      await write(hexData);
      setStatusMessage("Reading current values from controller...");
    } catch (error) {
      setLoading(false);
      setPendingSeq(null);
      setPendingOperation(null);
      Alert.alert("Write Error", String(error));
    }
  };

  const handleGroupSelect = (group: string) => {
    setCurrentGroup(group);
    setStatusMessage(`Selected group: ${group}`);
  };

  const handleParamSelect = (param: Parameter) => {
    setCurrentParamCode(param.code);
    setSelectedParam(param);
    setOverrideCode(param.code);
    setOverrideValue(String(param.override_value) !== "" ? String(param.override_value) : "");
    setStatusMessage(`Selected parameter: ${param.code}`);
  };

  const addOverride = () => {
    const code = overrideCode.trim();
    const value = overrideValue.trim();

    if (!code) {
      Alert.alert("Missing Code", "Enter parameter code.");
      return;
    }
    if (value === "") {
      Alert.alert("Missing Value", "Enter override value.");
      return;
    }

    const updatedRows = paramRows.map(row => {
      if (row.code.toUpperCase() === code.toUpperCase()) {
        const newRow = { ...row };
        newRow.override_value = value;
        recomputeFinalValue(newRow);
        return newRow;
      }
      return row;
    });

    const found = updatedRows.some(row => row.code.toUpperCase() === code.toUpperCase());
    if (!found) {
      Alert.alert("Not Found", `Parameter ${code} not found in loaded JSON.`);
      return;
    }

    setParamRows(updatedRows);
    setStatusMessage(`Override applied: ${code} = ${value}`);
  };

  const clearOverride = () => {
    const code = overrideCode.trim();

    if (!code) {
      Alert.alert("Missing Code", "Enter parameter code to clear.");
      return;
    }

    const updatedRows = paramRows.map(row => {
      if (row.code.toUpperCase() === code.toUpperCase()) {
        const newRow = { ...row };
        newRow.override_value = "";
        recomputeFinalValue(newRow);
        return newRow;
      }
      return row;
    });

    const found = updatedRows.some(row => row.code.toUpperCase() === code.toUpperCase());
    if (!found) {
      Alert.alert("Not Found", `Parameter ${code} not found.`);
      return;
    }

    setParamRows(updatedRows);
    setOverrideValue("");
    setStatusMessage(`Override cleared: ${code}`);
  };

  const writeSelected = async () => {
    const code = overrideCode.trim();

    if (!code) {
      Alert.alert("Missing Code", "Select or enter a parameter code.");
      return;
    }

    if (!isConnected) {
      Alert.alert("Not Connected", "Connect to USB controller first.");
      return;
    }

    const target = paramRows.find(row => row.code.toUpperCase() === code.toUpperCase());
    if (!target) {
      Alert.alert("Not Found", `Parameter ${code} not found.`);
      return;
    }

    setLoading(true);
    const seq = seqRef.current++;
    setPendingSeq(seq);
    setPendingOperation('write');

    const writeCmd: USBWriteCommand = {
      cmd: "write",
      node: parseInt(nodeId) || 1,
      seq: seq,
      params: [{
        addr: target.addr || codeToAddr(target.code),
        val: parseFloat(target.final_value) || 0,
        scale: target.scale || 1
      }]
    };

    try {
      const hexData = stringToHex(JSON.stringify(writeCmd));
      await write(hexData);
      setStatusMessage(`Writing: ${code} = ${target.final_value}`);
    } catch (error) {
      setLoading(false);
      setPendingSeq(null);
      setPendingOperation(null);
      Alert.alert("Write Error", String(error));
    }
  };

  const applyChanged = async () => {
    const changedRows = paramRows.filter(row => row.status === "Changed" || row.status === "Override");
    if (!changedRows.length) {
      Alert.alert("No Changes", "No changed/override parameters to apply.");
      return;
    }

    if (!isConnected) {
      Alert.alert("Not Connected", "Connect to USB controller first.");
      return;
    }

    setLoading(true);
    const seq = seqRef.current++;
    setPendingSeq(seq);
    setPendingOperation('write');

    const writeCmd: USBWriteCommand = {
      cmd: "write",
      node: parseInt(nodeId) || 1,
      seq: seq,
      params: changedRows.map(row => ({
        addr: row.addr || codeToAddr(row.code),
        val: parseFloat(row.final_value) || 0,
        scale: row.scale || 1
      }))
    };

    try {
      const hexData = stringToHex(JSON.stringify(writeCmd));
      await write(hexData);
      const summary = changedRows.slice(0, 5).map(r => `${r.code} = ${r.final_value}`).join(', ');
      const moreText = changedRows.length > 5 ? ` and ${changedRows.length - 5} more...` : "";
      setStatusMessage(`Applying ${changedRows.length} change(s): ${summary}${moreText}`);
    } catch (error) {
      setLoading(false);
      setPendingSeq(null);
      setPendingOperation(null);
      Alert.alert("Write Error", String(error));
    }
  };

  const loadJsonFile = () => {
    setJsonSidebarOpen(true);
  };

  const handleLoadSample = () => {
    const sampleJson = JSON.stringify({
      profileName: "Sample Profile",
      controller: "AC310",
      parameters: [
        { code: "F01.01", name: "Run command channel", value: 1, unit: "", group: "F01 Run Control", addr: "0xF001", scale: 1 },
        { code: "F01.10", name: "Maximum frequency", value: 90, unit: "Hz", group: "F01 Run Control", addr: "0xF010", scale: 0.01 },
        { code: "F01.22", name: "Acceleration time 1", value: 5, unit: "s", group: "F01 Run Control", addr: "0xF016", scale: 0.1 },
      ]
    }, null, 2);
    setJsonInput(sampleJson);
  };

  const handleParseJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      // Handle both: array of params OR object with parameters array
      const parameters = Array.isArray(parsed) ? parsed : (parsed.parameters || []);
      const profileName = parsed.profileName || (Array.isArray(parsed) ? 'Imported Profile' : 'Custom Profile');
      
      const profileData = {
        profileName: profileName,
        controller: parsed.controller || '',
        parameters: parameters
      };
      
      setProfileData(profileData);
      loadProfileIntoRows(profileData);
      setFilePath(profileName);
      setStatusMessage(`Loaded: ${profileName} with ${parameters.length} parameters`);
      setJsonSidebarOpen(false);
    } catch (e) {
      Alert.alert("Parse Error", "Invalid JSON format");
    }
  };

  const handleUploadFromDevice = async () => {
    try {
      console.log('Checking for FilePickerModule...');
      console.log('Available NativeModules:', Object.keys(NativeModules));
      
      const { FilePickerModule } = NativeModules;
      
      if (!FilePickerModule) {
        console.log('FilePickerModule not found');
        Alert.alert(
          "Native Module Not Found",
          "FilePickerModule is not available. Please:\n\n1. Rebuild the Android app:\n   cd android && ./gradlew clean && cd .. && npx react-native run-android\n\n2. Or paste JSON content manually"
        );
        return;
      }
      
      console.log('FilePickerModule found, calling pickFile...');
      const filePath = await FilePickerModule.pickFile('application/json');
      
      if (filePath) {
        console.log('File selected:', filePath);
        const content = await FilePickerModule.readFile(filePath);
        setJsonInput(content);
        setStatusMessage(`File loaded: ${filePath.split('/').pop()}`);
        Alert.alert("Success", "File loaded! Click 'Parse JSON' to import.");
      }
    } catch (error: any) {
      console.error('File picker error:', error);
      // Don't show error if user just cancelled the picker
      if (error?.message === 'File picker cancelled' || error?.code === 'CANCELLED') {
        setStatusMessage('File picker cancelled');
        return;
      }
      Alert.alert(
        "File Upload Error", 
        `Error: ${error?.message || String(error)}\n\nPlease rebuild the app with:\ncd android && ./gradlew clean && cd .. && npx react-native run-android`
      );
    }
  };

  const getRowBackgroundColor = (status: string) => {
    switch (status) {
      case "Same": return "#0f2f1f";
      case "Changed": return "#3a2f0b";
      case "Override": return "#0f2742";
      default: return "#111827";
    }
  };

  const columnWidths = getColumnWidths();

  const renderParameterRow = ({ item, index }: { item: Parameter; index: number }) => (
    <TouchableOpacity
      style={[
        styles.paramRow,
        { backgroundColor: getRowBackgroundColor(item.status) }
      ]}
      onPress={() => handleParamSelect(item)}
    >
      <Text style={[styles.paramCell, { width: columnWidths.code }]}>{item.code}</Text>
      <Text style={[styles.paramCell, { width: columnWidths.name }]} numberOfLines={1}>{item.name || '-'}</Text>
      <Text style={[styles.paramCell, styles.centerCell, { width: columnWidths.value, color: item.file_value ? '#e5e7eb' : '#6b7280' }]}>
        {item.file_value !== '' && item.file_value !== undefined ? String(item.file_value) : '-'}
      </Text>
      <Text style={[styles.paramCell, styles.centerCell, { width: columnWidths.value, color: item.current_value ? '#22c55e' : '#6b7280' }]}>
        {item.current_value !== '' && item.current_value !== undefined ? String(item.current_value) : '-'}
      </Text>
      <Text style={[styles.paramCell, styles.centerCell, { width: columnWidths.value, color: item.override_value ? '#f59e0b' : '#6b7280' }]}>
        {item.override_value !== '' && item.override_value !== undefined ? String(item.override_value) : '-'}
      </Text>
      <Text style={[styles.paramCell, styles.centerCell, { width: columnWidths.value, fontWeight: '600' }]}>
        {item.final_value !== '' && item.final_value !== undefined ? String(item.final_value) : '-'}
      </Text>
      <Text style={[styles.paramCell, { width: columnWidths.unit }]}>{item.unit || '-'}</Text>
      <Text style={[styles.paramCell, { width: columnWidths.status, fontWeight: '600' }]}>{item.status}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Autonxt Inverter Parameter Tool</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(248, 113, 113, 0.1)' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: isConnected ? '#22c55e' : '#f87171' }
              ]}>
                ● {isConnected ? 'USB Connected' : 'Disconnected'}
              </Text>
            </View>
          </View>
          
          <View style={styles.fileRow}>
            <Text style={styles.label}>Profile</Text>
            <TextInput
              style={styles.fileInput}
              value={filePath}
              placeholder="Paste JSON below and load..."
              placeholderTextColor="#6b7280"
              editable={false}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={loadJsonFile}>
              <Text style={styles.buttonText}>Load JSON</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.jsonInput}
            value={jsonInput}
            onChangeText={setJsonInput}
            placeholder='Paste JSON profile here... {"profileName": "...", "parameters": [...]}'
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={2}
          />

          <View style={styles.connectionRow}>
            <Text style={styles.label}>USB</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {devices.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {devices.map((device: any) => (
                      <TouchableOpacity
                        key={device.deviceId}
                        style={[
                          styles.deviceButton,
                          deviceId === device.deviceId && styles.deviceButtonSelected
                        ]}
                        onPress={() => setDeviceId(device.deviceId)}
                      >
                        <Text style={[
                          styles.deviceButtonText,
                          deviceId === device.deviceId && styles.deviceButtonTextSelected
                        ]} numberOfLines={1}>
                          {device.name || `Dev ${device.deviceId}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <Text style={[styles.selectInput, { flex: 1, color: '#6b7280' }]}>
                  No USB devices found
                </Text>
              )}
              <TouchableOpacity style={styles.scanButton} onPress={scanDevices}>
                <Text style={styles.scanButtonText}>Scan</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Node</Text>
            <TextInput
              style={[styles.selectInput, styles.nodeInput]}
              value={nodeId}
              onChangeText={setNodeId}
              keyboardType="numeric"
            />
            
            <TouchableOpacity
              style={[styles.primaryButton, isConnected && { backgroundColor: '#dc2626' }]}
              onPress={isConnected ? () => {
                disconnect();
                setStatusMessage("Disconnected");
              } : handleConnect}
            >
              <Text style={styles.buttonText}>{isConnected ? 'Disconnect' : 'Connect'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={readCurrentValues}
            >
              <Text style={styles.ghostButtonText}>Read</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={applyChanged}
            >
              <Text style={styles.ghostButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.mainContent, isLandscape && styles.mainContentLandscape]}>
          <View style={[styles.leftPanel, isLandscape ? styles.leftPanelLandscape : styles.leftPanelPortrait]}>
            <Text style={styles.sectionTitle}>Parameter Groups</Text>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search..."
              placeholderTextColor="#6b7280"
            />
            
            <ScrollView style={styles.groupsList}>
              <TouchableOpacity
                style={[styles.groupItem, currentGroup === "All" && styles.groupItemSelected]}
                onPress={() => handleGroupSelect("All")}
              >
                <Text style={styles.groupItemText}>All</Text>
              </TouchableOpacity>
              
              {getGroups().map(group => (
                <TouchableOpacity
                  key={group}
                  style={[styles.groupItem, currentGroup === group && styles.groupItemSelected]}
                  onPress={() => handleGroupSelect(group)}
                >
                  <Text style={styles.groupItemText} numberOfLines={1}>{group}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.rightPanel, isLandscape ? styles.rightPanelLandscape : styles.rightPanelPortrait]}>
            <Text style={styles.sectionTitle}>Parameter Comparison</Text>
            
            <ScrollView horizontal style={styles.tableContainer} showsHorizontalScrollIndicator={true}>
              <View>
                <View style={styles.tableHeader}>
                  <Text style={[styles.headerCell, { width: columnWidths.code }]}>Code</Text>
                  <Text style={[styles.headerCell, { width: columnWidths.name }]}>Name</Text>
                  <Text style={[styles.headerCell, { width: columnWidths.value }]}>File</Text>
                  <Text style={[styles.headerCell, { width: columnWidths.value }]}>Current</Text>
                  <Text style={[styles.headerCell, { width: columnWidths.value }]}>Override</Text>
                  <Text style={[styles.headerCell, { width: columnWidths.value }]}>Final</Text>
                  <Text style={[styles.headerCell, { width: columnWidths.unit }]}>Unit</Text>
                  <Text style={[styles.headerCell, { width: columnWidths.status }]}>Status</Text>
                </View>
                
                <FlatList
                  data={getFilteredRows()}
                  renderItem={renderParameterRow}
                  keyExtractor={(item) => item.code}
                  style={styles.tableBody}
                  scrollEnabled={false}
                />
              </View>
            </ScrollView>

            <View style={[styles.detailBox, isLandscape && styles.detailBoxLandscape]}>
              <View style={[styles.detailRow, isLandscape && styles.detailRowLandscape]}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Selected Code</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>{selectedParam?.code || '-'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Selected Name</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>{selectedParam?.name || '-'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>File Value</Text>
                  <Text style={styles.detailValue}>{selectedParam ? String(selectedParam.file_value) : '-'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Current Value</Text>
                  <Text style={styles.detailValue}>{selectedParam ? String(selectedParam.current_value) : '-'}</Text>
                </View>
              </View>
              <View style={[styles.detailRow, isLandscape && styles.detailRowLandscape]}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Override</Text>
                  <Text style={styles.detailValue}>{selectedParam ? String(selectedParam.override_value) : '-'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Final Value</Text>
                  <Text style={styles.detailValue}>{selectedParam ? String(selectedParam.final_value) : '-'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.overrideSection}>
          <Text style={styles.sectionTitle}>Manual Override</Text>
          <View style={styles.overrideRow}>
            <Text style={styles.label}>Code</Text>
            <TextInput
              style={styles.overrideInput}
              value={overrideCode}
              onChangeText={setOverrideCode}
              placeholder="F01.01"
              placeholderTextColor="#6b7280"
            />
            
            <Text style={styles.label}>Value</Text>
            <TextInput
              style={styles.overrideInput}
              value={overrideValue}
              onChangeText={setOverrideValue}
              placeholder="1"
              placeholderTextColor="#6b7280"
              keyboardType="numeric"
            />
            
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={addOverride}
            >
              <Text style={styles.buttonText}>Add</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={clearOverride}
            >
              <Text style={styles.ghostButtonText}>Clear</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={writeSelected}
            >
              <Text style={styles.ghostButtonText}>Write</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={[styles.backButton, isLandscape && styles.backButtonLandscape]} onPress={onBack}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}

      {jsonSidebarOpen && (
        <View style={styles.jsonSidebar}>
          <View style={styles.jsonSidebarHeader}>
            <Text style={styles.jsonSidebarTitle}>Load JSON Profile</Text>
            <TouchableOpacity onPress={() => setJsonSidebarOpen(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.jsonSidebarLabel}>Paste JSON content:</Text>
          <TextInput
            style={styles.jsonSidebarInput}
            value={jsonInput}
            onChangeText={setJsonInput}
            placeholder='{"profileName": "...", "parameters": [...]}'
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={10}
          />
          
          <View style={styles.jsonSidebarButtons}>
            <TouchableOpacity style={styles.uploadButton} onPress={handleUploadFromDevice}>
              <Text style={styles.uploadButtonText}>📁 Upload File</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.secondaryButton} onPress={handleLoadSample}>
              <Text style={styles.secondaryButtonText}>Load Sample</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.primaryButton} onPress={handleParseJson}>
              <Text style={styles.buttonText}>Parse JSON</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.ghostButton} onPress={() => setJsonSidebarOpen(false)}>
              <Text style={styles.ghostButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    backgroundColor: '#111827',
    margin: 10,
    marginBottom: 6,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 90,
  },
  statusText: {
    fontWeight: '700',
    fontSize: 11,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
    flexWrap: 'wrap',
  },
  label: {
    color: '#e5e7eb',
    fontSize: 12,
    minWidth: 40,
  },
  fileInput: {
    flex: 1,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 8,
    color: '#e5e7eb',
  },
  jsonInput: {
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 6,
    color: '#e5e7eb',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    maxHeight: 50,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 11,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  selectInput: {
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 6,
    color: '#e5e7eb',
    minWidth: 70,
    fontSize: 12,
  },
  nodeInput: {
    width: 50,
  },
  ghostButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  ghostButtonText: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 11,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    marginHorizontal: 8,
    gap: 8,
  },
  mainContentLandscape: {
    marginHorizontal: 12,
    gap: 10,
  },
  leftPanel: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 10,
  },
  leftPanelLandscape: {
    flex: 0.25,
    maxWidth: 220,
    minWidth: 140,
  },
  leftPanelPortrait: {
    flex: 0.3,
    minWidth: 100,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 6,
    color: '#e5e7eb',
    marginBottom: 8,
    fontSize: 12,
  },
  groupsList: {
    flex: 1,
  },
  groupItem: {
    padding: 6,
    marginVertical: 2,
    borderRadius: 8,
  },
  groupItemSelected: {
    backgroundColor: '#1e40af',
  },
  groupItemText: {
    color: '#e5e7eb',
    fontSize: 12,
  },
  rightPanel: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 10,
  },
  rightPanelLandscape: {
    flex: 0.75,
    minWidth: 250,
  },
  rightPanelPortrait: {
    flex: 0.7,
    minWidth: 200,
  },
  tableContainer: {
    flex: 1,
    minHeight: 100,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    paddingBottom: 8,
    marginBottom: 4,
  },
  headerCell: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 11,
  },
  tableBody: {
    flex: 1,
  },
  paramRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  paramCell: {
    color: '#e5e7eb',
    fontSize: 10,
    paddingHorizontal: 3,
  },
  centerCell: {
    textAlign: 'center',
  },
  detailBox: {
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  detailItem: {
    marginRight: 12,
    marginBottom: 4,
    minWidth: 70,
  },
  detailBoxLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailRowLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    color: '#94a3b8',
    fontSize: 10,
    marginBottom: 2,
  },
  detailValue: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '500',
    minWidth: 60,
  },
  overrideSection: {
    backgroundColor: '#111827',
    margin: 10,
    marginTop: 6,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  overrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  overrideInput: {
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 6,
    color: '#e5e7eb',
    minWidth: 80,
    width: 80,
    fontSize: 12,
  },
  scanButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scanButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 11,
  },
  deviceButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 60,
  },
  deviceButtonSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#3b82f6',
  },
  deviceButtonText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
  },
  deviceButtonTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  statusBar: {
    backgroundColor: '#111827',
    margin: 10,
    marginTop: 0,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  backButtonLandscape: {
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  backButtonText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#e5e7eb',
    marginTop: 10,
  },
  jsonSidebar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 320,
    backgroundColor: '#111827',
    borderLeftWidth: 1,
    borderLeftColor: '#1f2937',
    padding: 16,
    zIndex: 100,
  },
  jsonSidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  jsonSidebarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  closeButtonText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  jsonSidebarLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 8,
  },
  jsonSidebarInput: {
    flex: 1,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#e5e7eb',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  jsonSidebarButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    backgroundColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 11,
  },
  uploadButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 11,
  },
});

export default InverterParameterTool;
