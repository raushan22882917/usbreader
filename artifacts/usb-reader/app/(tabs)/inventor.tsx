import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, FlatList, Alert, ActivityIndicator,
  useWindowDimensions, Platform, NativeModules, Modal, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useUsb } from '../../context/UsbContext';
import USBSerialService from '../../USBSerialService';
import { Header } from '../../components/Header';
import { BottomNav } from '../../components/BottomNav';
import { UsbConnectionBar } from '../../components/UsbConnectionBar';
import { Colors, Typography, Spacing, Border } from '../../theme';

// ─── Default profile ──────────────────────────────────────────────────────────
const DEFAULT_PROFILE = {
  profileName: 'No Profile Loaded',
  controller: '',
  parameters: [] as any[],
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Parameter {
  code: string; name: string; group: string;
  file_value: any; current_value: any; override_value: any; final_value: any;
  unit: string; status: string; addr?: string; scale?: number;
}
interface USBWriteCommand {
  cmd: string; node: number; seq: number;
  params: { addr: string; val: number; scale: number }[];
}
interface USBReadCommand {
  cmd: string; node: number; seq: number;
  params: { addr: string; scale: number }[];
}
interface USBResponse {
  status: string; seq: number; ts: number;
  params: { addr: string; val: number; raw: number; ok: boolean }[];
}

// ─── Status colours (Industrial Tech OS palette) ──────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; row: string }> = {
  'Same':         { bg: `${Colors.tertiary}18`,          text: Colors.tertiary,          row: Colors.onTertiaryContainer },
  'Changed':      { bg: `${Colors.primaryFixedDim}18`,   text: Colors.primaryFixedDim,   row: Colors.onPrimaryContainer  },
  'Override':     { bg: `${Colors.secondary}18`,         text: Colors.secondary,         row: Colors.onSecondaryContainer},
  'Pending Read': { bg: `${Colors.onSurfaceVariant}12`,  text: Colors.onSurfaceVariant,  row: Colors.surfaceContainerLow },
};

// ─── Inline action button (uses design-system tokens) ────────────────────────
function Btn({
  label, onPress, color, ghost = false, small = false, badge, disabled = false, loading = false,
}: {
  label: string; onPress: () => void; color?: string;
  ghost?: boolean; small?: boolean; badge?: number;
  disabled?: boolean; loading?: boolean;
}) {
  const c = color ?? Colors.secondary;
  const isOff = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isOff}
      activeOpacity={0.75}
      style={[
        s.btn,
        small && s.btnSm,
        ghost
          ? { backgroundColor: 'transparent', borderWidth: Border.width, borderColor: isOff ? Colors.outlineVariant : c }
          : { backgroundColor: isOff ? Colors.surfaceContainerHigh : `${c}22`, borderWidth: Border.width, borderColor: isOff ? Colors.outlineVariant : c },
        isOff && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.btnTxt, small && s.btnTxtSm, { color: isOff ? Colors.outlineVariant : (ghost ? c : Colors.onSurface) }]}>
        {label}
      </Text>
      {!!badge && badge > 0 && (
        <View style={[s.badge, { backgroundColor: c }]}>
          <Text style={s.badgeTxt}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const InverterParameterTool: React.FC = () => {
  const { width: sw, height: sh } = useWindowDimensions();
  const isLandscape = sw > sh;

  const { connectionStatus, writeData: write } = useUsb();
  const isConnected = connectionStatus === 'connected';

  // column widths
  const colW = useCallback(() => {
    const b = Math.max(sw * (isLandscape ? 0.07 : 0.11), 56);
    return { code: b, name: b * 2.2, value: b * 1.1, unit: b * 0.75, status: b * 1.1 };
  }, [sw, isLandscape]);

  // state
  const [currentGroup,  setCurrentGroup]  = useState('All');
  const [filePath,      setFilePath]       = useState(DEFAULT_PROFILE.profileName);
  const [paramRows,     setParamRows]      = useState<Parameter[]>([]);
  const [searchText,    setSearchText]     = useState('');
  const [selectedParam, setSelectedParam]  = useState<Parameter | null>(null);
  const [overrideCode,  setOverrideCode]   = useState('');
  const [overrideValue, setOverrideValue]  = useState('');
  const [jsonInput,     setJsonInput]      = useState('');
  const [jsonModalOpen, setJsonModalOpen]  = useState(false);
  const [nodeId,        setNodeId]         = useState('1');
  const [loading,       setLoading]        = useState(false);
  const [loadingMsg,    setLoadingMsg]     = useState('Working…');
  const [statusMsg,     setStatusMsg]      = useState('Profile loaded — connect USB to begin.');
  const [statusOk,      setStatusOk]       = useState(true);
  const [lastTxJson,    setLastTxJson]     = useState('');
  const [lastRxJson,    setLastRxJson]     = useState('');
  const [cmdLogOpen,    setCmdLogOpen]     = useState(false);
  const [confirmModal,  setConfirmModal]   = useState<{ title: string; body: string; onOk: () => void } | null>(null);

  const seqRef        = useRef(1);
  const paramRowsRef  = useRef<Parameter[]>([]);
  const pendingSeqRef = useRef<number | null>(null);
  const pendingOpRef  = useRef<'read' | 'write' | null>(null);

  useEffect(() => { paramRowsRef.current = paramRows; }, [paramRows]);
  useEffect(() => { loadProfileIntoRows(DEFAULT_PROFILE); }, []);

  // helpers
  const setStatus = (msg: string, ok = true) => { setStatusMsg(msg); setStatusOk(ok); };

  const codeToAddr = (code: string): string => {
    const n = code.replace(/[^0-9]/g, '');
    if (n.length === 0) return '';
    return `0x${n.length >= 3 ? n.substring(0, 3) : n.padStart(3, '0')}`;
  };

  const hexToString = (hex: string) => {
    let out = '';
    for (let i = 0; i < hex.length; i += 2)
      out += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    return out;
  };

  const stringToHex = (str: string) => {
    let h = '';
    for (let i = 0; i < str.length; i++)
      h += str.charCodeAt(i).toString(16).padStart(2, '0');
    return h;
  };

  const recomputeFinal = (row: Parameter) => {
    row.final_value = String(row.override_value).trim() !== '' ? row.override_value : row.file_value;
    const cur = String(row.current_value).trim();
    const fin = String(row.final_value).trim();
    const ov  = String(row.override_value).trim();
    if (cur === '')       row.status = 'Pending Read';
    else if (ov !== '')   row.status = 'Override';
    else if (cur === fin) row.status = 'Same';
    else                  row.status = 'Changed';
  };

  const loadProfileIntoRows = (profile: any) => {
    const params = Array.isArray(profile) ? profile : (profile.parameters || []);
    const rows: Parameter[] = [];
    for (const p of params) {
      const code = String(p.code || p.parameter || p.parameter_code || '').trim();
      if (!code) continue;
      const row: Parameter = {
        code,
        name:           String(p.name || p.parameter_name || p.description || code).trim(),
        group:          String(p.group || p.parameter_group || 'Ungrouped').trim() || 'Ungrouped',
        file_value:     p.value ?? p.std_value ?? p.default_value ?? p.file_value ?? '',
        current_value:  p.current_value ?? p.actual_value ?? '',
        override_value: '',
        final_value:    '',
        unit:           String(p.unit || p.units || '').trim(),
        status:         'Pending Read',
        addr:           p.addr || p.address || codeToAddr(code),
        scale:          p.scale || p.scaling_factor || 1,
      };
      recomputeFinal(row);
      rows.push(row);
    }
    setParamRows(rows);
  };

  const getFilteredRows = () => {
    const q = searchText.trim().toLowerCase();
    return paramRows.filter(r => {
      if (currentGroup !== 'All' && r.group !== currentGroup) return false;
      if (q) return `${r.code} ${r.name} ${r.group} ${r.file_value} ${r.current_value}`.toLowerCase().includes(q);
      return true;
    });
  };

  const getGroups = () => {
    const set = new Set<string>();
    paramRows.forEach(r => set.add(r.group));
    return Array.from(set).sort();
  };

  const changedCount = paramRows.filter(r => r.status === 'Changed' || r.status === 'Override').length;

  // USB response handler
  const handleUSBResponse = (hexData: string) => {
    try {
      const jsonStr = hexToString(hexData);
      setLastRxJson(JSON.stringify(JSON.parse(jsonStr), null, 2));
      const resp: USBResponse = JSON.parse(jsonStr);
      const op  = pendingOpRef.current;
      const seq = pendingSeqRef.current;
      if (resp.status === 'ok' && resp.params) {
        if (op === 'read' && seq === resp.seq) {
          const updated = paramRowsRef.current.map(row => {
            const m = resp.params.find(p => p.addr.toLowerCase() === (row.addr || '').toLowerCase());
            if (!m) return row;
            const nr = { ...row, current_value: m.val };
            recomputeFinal(nr);
            return nr;
          });
          setParamRows(updated);
          setStatus(`✓ Read OK — seq ${resp.seq}, ts ${resp.ts} — ${resp.params.length} param(s) updated`);
        } else if (op === 'write' && seq === resp.seq) {
          const ok  = resp.params.filter(p => p.ok).length;
          const bad = resp.params.length - ok;
          const detail = resp.params.map(p => `${p.addr}=${p.val} raw=${p.raw} ${p.ok ? '✓' : '✗'}`).join('  ');
          setStatus(
            `✓ Write OK — seq ${resp.seq}, ts ${resp.ts} — ${ok}/${resp.params.length} written` +
            (bad > 0 ? `  ⚠ ${bad} failed` : '') + `  |  ${detail}`,
            bad === 0,
          );
          setTimeout(() => readCurrentValues(), 700);
        }
      } else {
        setStatus(`⚠ Response error: status=${resp.status} seq=${resp.seq}`, false);
      }
    } catch (e) {
      setStatus(`⚠ Parse error: ${String(e)}`, false);
    } finally {
      setLoading(false);
      pendingSeqRef.current = null;
      pendingOpRef.current  = null;
    }
  };

  useEffect(() => {
    const unsub = USBSerialService.onData(handleUSBResponse);
    return () => unsub();
  }, []);

  // actions
  const readCurrentValues = async () => {
    if (!isConnected) { Alert.alert('Not Connected', 'Connect to USB controller first.'); return; }
    if (paramRowsRef.current.length === 0) { Alert.alert('No Parameters', 'Load a JSON profile first.'); return; }
    setLoading(true); setLoadingMsg('Reading…');
    const seq = seqRef.current++;
    pendingSeqRef.current = seq;
    pendingOpRef.current  = 'read';
    const cmd: USBReadCommand = {
      cmd: 'read', node: parseInt(nodeId) || 1, seq,
      params: paramRowsRef.current.map(r => ({ addr: r.addr || codeToAddr(r.code), scale: r.scale || 1 })),
    };
    setLastTxJson(JSON.stringify(cmd, null, 2));
    try {
      await write(stringToHex(JSON.stringify(cmd)));
      setStatus(`→ Read sent — seq ${seq}, ${cmd.params.length} param(s)…`);
    } catch (e) {
      setLoading(false); pendingSeqRef.current = null; pendingOpRef.current = null;
      setStatus(`✗ Send error: ${String(e)}`, false);
      Alert.alert('Send Error', String(e));
    }
  };

  const writeSelected = async () => {
    const code = overrideCode.trim();
    if (!code) { Alert.alert('Missing Code', 'Select a parameter first.'); return; }
    if (!isConnected) { Alert.alert('Not Connected', 'Connect to USB controller first.'); return; }
    const target = paramRowsRef.current.find(r => r.code.toUpperCase() === code.toUpperCase());
    if (!target) { Alert.alert('Not Found', `Parameter ${code} not found.`); return; }
    setLoading(true); setLoadingMsg('Writing…');
    const seq = seqRef.current++;
    pendingSeqRef.current = seq;
    pendingOpRef.current  = 'write';
    const cmd: USBWriteCommand = {
      cmd: 'write', node: parseInt(nodeId) || 1, seq,
      params: [{ addr: target.addr || codeToAddr(target.code), val: parseFloat(target.final_value) || 0, scale: target.scale || 1 }],
    };
    setLastTxJson(JSON.stringify(cmd, null, 2));
    try {
      await write(stringToHex(JSON.stringify(cmd)));
      setStatus(`→ Write sent — seq ${seq}: ${code} = ${target.final_value}`);
    } catch (e) {
      setLoading(false); pendingSeqRef.current = null; pendingOpRef.current = null;
      setStatus(`✗ Send error: ${String(e)}`, false);
      Alert.alert('Send Error', String(e));
    }
  };

  const applyChanged = async () => {
    const rows = paramRowsRef.current.filter(r => r.status === 'Changed' || r.status === 'Override');
    if (!rows.length) { Alert.alert('No Changes', 'No changed or overridden parameters.'); return; }
    if (!isConnected) { Alert.alert('Not Connected', 'Connect to USB controller first.'); return; }
    setConfirmModal({
      title: `Apply ${rows.length} Change${rows.length > 1 ? 's' : ''}?`,
      body: rows.slice(0, 8).map(r => `${r.code}  →  ${r.final_value} ${r.unit}`).join('\n') +
            (rows.length > 8 ? `\n…and ${rows.length - 8} more` : ''),
      onOk: async () => {
        setConfirmModal(null);
        setLoading(true); setLoadingMsg('Applying…');
        const seq = seqRef.current++;
        pendingSeqRef.current = seq;
        pendingOpRef.current  = 'write';
        const cmd: USBWriteCommand = {
          cmd: 'write', node: parseInt(nodeId) || 1, seq,
          params: rows.map(r => ({ addr: r.addr || codeToAddr(r.code), val: parseFloat(r.final_value) || 0, scale: r.scale || 1 })),
        };
        setLastTxJson(JSON.stringify(cmd, null, 2));
        try {
          await write(stringToHex(JSON.stringify(cmd)));
          const preview = rows.slice(0, 3).map(r => `${r.code}=${r.final_value}`).join(', ');
          setStatus(`→ Apply sent — seq ${seq}: ${preview}${rows.length > 3 ? ` +${rows.length - 3} more` : ''}`);
        } catch (e) {
          setLoading(false); pendingSeqRef.current = null; pendingOpRef.current = null;
          setStatus(`✗ Send error: ${String(e)}`, false);
          Alert.alert('Send Error', String(e));
        }
      },
    });
  };

  const addOverride = () => {
    const code = overrideCode.trim(), value = overrideValue.trim();
    if (!code)  { Alert.alert('Missing Code',  'Enter a parameter code.'); return; }
    if (!value) { Alert.alert('Missing Value', 'Enter an override value.'); return; }
    let found = false;
    const updated = paramRows.map(r => {
      if (r.code.toUpperCase() !== code.toUpperCase()) return r;
      found = true;
      const nr = { ...r, override_value: value };
      recomputeFinal(nr);
      return nr;
    });
    if (!found) { Alert.alert('Not Found', `Parameter ${code} not found.`); return; }
    setParamRows(updated);
    const sel = updated.find(r => r.code.toUpperCase() === code.toUpperCase());
    if (sel) setSelectedParam(sel);
    setStatus(`Override set: ${code} = ${value}`);
  };

  const clearOverride = () => {
    const code = overrideCode.trim();
    if (!code) { Alert.alert('Missing Code', 'Enter a parameter code to clear.'); return; }
    let found = false;
    const updated = paramRows.map(r => {
      if (r.code.toUpperCase() !== code.toUpperCase()) return r;
      found = true;
      const nr = { ...r, override_value: '' };
      recomputeFinal(nr);
      return nr;
    });
    if (!found) { Alert.alert('Not Found', `Parameter ${code} not found.`); return; }
    setParamRows(updated);
    setOverrideValue('');
    const sel = updated.find(r => r.code.toUpperCase() === code.toUpperCase());
    if (sel) setSelectedParam(sel);
    setStatus(`Override cleared: ${code}`);
  };

  const clearAllOverrides = () => {
    const hasAny = paramRows.some(r => String(r.override_value).trim() !== '');
    if (!hasAny) { Alert.alert('Nothing to Clear', 'No overrides are set.'); return; }
    setConfirmModal({
      title: 'Clear All Overrides?',
      body: 'This will remove all override values and revert final values to file values.',
      onOk: () => {
        setConfirmModal(null);
        const updated = paramRows.map(r => { const nr = { ...r, override_value: '' }; recomputeFinal(nr); return nr; });
        setParamRows(updated);
        setOverrideValue('');
        if (selectedParam) {
          const sel = updated.find(r => r.code === selectedParam.code);
          if (sel) setSelectedParam(sel);
        }
        setStatus('All overrides cleared.');
      },
    });
  };

  const handleParseJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const parameters = Array.isArray(parsed) ? parsed : (parsed.parameters || []);
      if (!parameters.length) { Alert.alert('Empty Profile', 'No parameters found in JSON.'); return; }
      const profile = { profileName: parsed.profileName || 'Imported Profile', controller: parsed.controller || '', parameters };
      loadProfileIntoRows(profile);
      setFilePath(profile.profileName);
      setJsonModalOpen(false);
      setCurrentGroup('All');
      setSelectedParam(null);
      setStatus(`✓ Loaded "${profile.profileName}" — ${parameters.length} parameters`);
    } catch {
      Alert.alert('Parse Error', 'Invalid JSON. Check the format and try again.');
    }
  };

  const handleLoadSample = () => { setJsonInput(JSON.stringify(DEFAULT_PROFILE, null, 2)); };

  const handleUploadFile = async () => {
    const { FilePickerModule } = NativeModules;
    if (!FilePickerModule) {
      Alert.alert('Not Available', 'File picker is not available on this build.\nPaste JSON manually instead.');
      return;
    }
    try {
      const fp = await FilePickerModule.pickFile('application/json');
      if (fp) {
        const content = await FilePickerModule.readFile(fp);
        setJsonInput(content);
        setStatus(`File loaded: ${fp.split('/').pop()} — tap Parse JSON`);
      }
    } catch (e: any) {
      if (e?.code === 'CANCELLED' || e?.message === 'File picker cancelled') return;
      Alert.alert('File Error', String(e?.message || e));
    }
  };

  const handleParamSelect = (param: Parameter) => {
    setSelectedParam(param);
    setOverrideCode(param.code);
    setOverrideValue(String(param.override_value) !== '' ? String(param.override_value) : '');
    setStatus(`Selected: ${param.code} — ${param.name}`);
  };

  // render helpers
  const cw = colW();

  const renderRow = ({ item }: { item: Parameter }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS['Pending Read'];
    const isSel = selectedParam?.code === item.code;
    return (
      <TouchableOpacity
        style={[s.paramRow, { backgroundColor: sc.row }, isSel && s.paramRowSel]}
        onPress={() => handleParamSelect(item)}
        activeOpacity={0.8}
      >
        <Text style={[s.cell, { width: cw.code, color: Colors.secondary, fontWeight: '600' }]}>{item.code}</Text>
        <Text style={[s.cell, { width: cw.name, color: Colors.onSurface }]} numberOfLines={1}>{item.name || '—'}</Text>
        <Text style={[s.cell, s.cellC, { width: cw.value, color: Colors.onSurfaceVariant }]}>
          {item.file_value !== '' && item.file_value !== undefined ? String(item.file_value) : '—'}
        </Text>
        <Text style={[s.cell, s.cellC, { width: cw.value, color: item.current_value !== '' ? Colors.tertiary : Colors.outlineVariant }]}>
          {item.current_value !== '' && item.current_value !== undefined ? String(item.current_value) : '—'}
        </Text>
        <Text style={[s.cell, s.cellC, { width: cw.value, color: item.override_value !== '' ? Colors.primaryFixedDim : Colors.outlineVariant }]}>
          {item.override_value !== '' ? String(item.override_value) : '—'}
        </Text>
        <Text style={[s.cell, s.cellC, { width: cw.value, color: Colors.onSurface, fontWeight: '700' }]}>
          {item.final_value !== '' && item.final_value !== undefined ? String(item.final_value) : '—'}
        </Text>
        <Text style={[s.cell, { width: cw.unit, color: Colors.onSurfaceVariant }]}>{item.unit || '—'}</Text>
        <View style={[s.statusPill, { backgroundColor: sc.bg, borderColor: `${sc.text}44`, width: cw.status }]}>
          <Text style={[s.statusPillTxt, { color: sc.text }]}>{item.status}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* ── Global Header (logo bar) ── */}
      <Header />

      {/* ── USB Connection Bar ── */}
      <UsbConnectionBar showNodeId nodeId={nodeId} onNodeIdChange={setNodeId} />

      {/* ── Screen title + profile + action row ── */}
      <View style={s.toolbar}>
        {/* Title + profile pill */}
        <View style={s.toolbarTop}>
          <MaterialCommunityIcons name="tune-variant" size={16} color={Colors.onSurfaceVariant} />
          <Text style={s.screenTitle}>Inverter Parameters</Text>
          <View style={s.profilePill}>
            <MaterialCommunityIcons name="file-code-outline" size={11} color={Colors.secondary} />
            <Text style={s.profileName} numberOfLines={1}>{filePath}</Text>
            {paramRows.length > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countBadgeTxt}>{paramRows.length}</Text>
              </View>
            )}
          </View>
          <Btn label="Load JSON" onPress={() => setJsonModalOpen(true)} color={Colors.secondary} small />
        </View>

        {/* Action row */}
        <View style={s.actionRow}>
          <Btn
            label="Read All"
            onPress={readCurrentValues}
            color={Colors.secondary}
            disabled={!isConnected || paramRows.length === 0}
            loading={loading && loadingMsg === 'Reading…'}
          />
          <Btn
            label="Apply Changes"
            onPress={applyChanged}
            color={Colors.onSurfaceVariant}
            disabled={!isConnected || changedCount === 0}
            badge={changedCount}
          />
          <Btn label="Clear Overrides" onPress={clearAllOverrides} ghost color={Colors.primaryFixedDim} small />
          <Btn
            label={cmdLogOpen ? 'Hide Log' : 'CMD Log'}
            onPress={() => setCmdLogOpen(v => !v)}
            ghost
            color={cmdLogOpen ? Colors.secondary : Colors.outlineVariant}
            small
          />
        </View>
      </View>

      {/* ── Status strip ── */}
      <View style={[s.statusStrip, { borderLeftColor: statusOk ? Colors.tertiary : Colors.error }]}>
        <View style={[s.statusDot, { backgroundColor: statusOk ? Colors.tertiary : Colors.error }]} />
        <Text style={[s.statusTxt, { color: statusOk ? Colors.secondary : Colors.error }]} numberOfLines={1}>
          {statusMsg}
        </Text>
        {loading && <ActivityIndicator size="small" color={Colors.secondary} style={{ marginLeft: Spacing.sm }} />}
      </View>

      {/* ── Main body ── */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Groups + Table */}
        <View style={[s.mainRow, isLandscape && { minHeight: 340 }]}>

          {/* Left: group list */}
          <View style={[s.leftPanel, isLandscape ? { flex: 0.22, maxWidth: 200 } : { flex: 0.28, minWidth: 90 }]}>
            {/* Panel title bar */}
            <View style={s.panelHead}>
              <View style={[s.panelAccent, { backgroundColor: Colors.tertiary }]} />
              <Text style={s.panelTitle}>Groups</Text>
            </View>
            <TextInput
              style={s.searchBox}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search…"
              placeholderTextColor={Colors.outlineVariant}
              clearButtonMode="while-editing"
            />
            <ScrollView style={{ flex: 1 }}>
              {['All', ...getGroups()].map(g => {
                const active = currentGroup === g;
                return (
                  <TouchableOpacity
                    key={g}
                    style={[s.groupItem, active && { backgroundColor: `${Colors.secondary}18`, borderLeftColor: Colors.secondary }]}
                    onPress={() => { setCurrentGroup(g); setStatus(`Group: ${g}`); }}
                  >
                    <Text style={[s.groupTxt, active && { color: Colors.secondary }]} numberOfLines={2}>{g}</Text>
                    {g !== 'All' && (
                      <Text style={s.groupCount}>{paramRows.filter(r => r.group === g).length}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Right: parameter table */}
          <View style={[s.rightPanel, isLandscape ? { flex: 0.78 } : { flex: 0.72 }]}>
            {/* Table header bar */}
            <View style={s.panelHead}>
              <View style={[s.panelAccent, { backgroundColor: Colors.secondary }]} />
              <Text style={s.panelTitle}>
                Parameters
                <Text style={s.panelCount}> ({getFilteredRows().length})</Text>
              </Text>
              {/* Legend */}
              <View style={s.legendRow}>
                {Object.entries(STATUS_COLORS).map(([k, v]) => (
                  <View key={k} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: v.text }]} />
                    <Text style={s.legendTxt}>{k}</Text>
                  </View>
                ))}
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator style={s.tableScroll}>
              <View>
                {/* Column headers */}
                <View style={s.tableHead}>
                  {[['Code', cw.code], ['Name', cw.name], ['File', cw.value], ['Current', cw.value],
                    ['Override', cw.value], ['Final', cw.value], ['Unit', cw.unit], ['Status', cw.status],
                  ].map(([label, w]) => (
                    <Text key={label as string} style={[s.headCell, { width: w as number }]}>{label as string}</Text>
                  ))}
                </View>
                {/* Rows */}
                <FlatList
                  data={getFilteredRows()}
                  renderItem={renderRow}
                  keyExtractor={item => item.code}
                  scrollEnabled={false}
                  ListEmptyComponent={
                    <View style={s.emptyTable}>
                      <MaterialCommunityIcons name="table-off" size={28} color={Colors.outlineVariant} />
                      <Text style={s.emptyTxt}>
                        {paramRows.length === 0 ? 'Load a JSON profile to see parameters.' : 'No parameters match the filter.'}
                      </Text>
                    </View>
                  }
                />
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Detail + Override */}
        <View style={[s.bottomRow, isLandscape && { flexDirection: 'row', gap: Spacing.sm }]}>

          {/* Selected parameter detail */}
          <View style={[s.card, isLandscape && { flex: 1 }]}>
            <View style={s.panelHead}>
              <View style={[s.panelAccent, { backgroundColor: Colors.onSurfaceVariant }]} />
              <Text style={s.panelTitle}>Selected Parameter</Text>
            </View>
            {selectedParam ? (
              <View style={s.detailGrid}>
                {([
                  ['Code',     selectedParam.code,                          Colors.secondary],
                  ['Name',     selectedParam.name,                          Colors.onSurface],
                  ['Group',    selectedParam.group,                         Colors.onSurfaceVariant],
                  ['Unit',     selectedParam.unit || '—',                   Colors.onSurfaceVariant],
                  ['Addr',     selectedParam.addr || '—',                   Colors.onSurfaceVariant],
                  ['Scale',    String(selectedParam.scale ?? 1),            Colors.onSurfaceVariant],
                  ['File',     String(selectedParam.file_value),            Colors.onSurface],
                  ['Current',  String(selectedParam.current_value) || '—',  Colors.tertiary],
                  ['Override', String(selectedParam.override_value) || '—', Colors.primaryFixedDim],
                  ['Final',    String(selectedParam.final_value),           Colors.onSurface],
                  ['Status',   selectedParam.status,                        STATUS_COLORS[selectedParam.status]?.text || Colors.onSurfaceVariant],
                ] as [string, string, string][]).map(([k, v, col]) => (
                  <View key={k} style={s.detailCell}>
                    <Text style={s.detailKey}>{k}</Text>
                    <Text style={[s.detailVal, { color: col }]}>{v}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={s.emptyTable}>
                <MaterialCommunityIcons name="cursor-default-click-outline" size={22} color={Colors.outlineVariant} />
                <Text style={s.emptyTxt}>Tap a row to inspect a parameter.</Text>
              </View>
            )}
          </View>

          {/* Manual override */}
          <View style={[s.card, isLandscape && { flex: 1 }]}>
            <View style={s.panelHead}>
              <View style={[s.panelAccent, { backgroundColor: Colors.primaryFixedDim }]} />
              <Text style={s.panelTitle}>Manual Override</Text>
            </View>
            <View style={s.overrideForm}>
              <View style={s.overrideField}>
                <Text style={s.lbl}>Code</Text>
                <TextInput
                  style={s.overrideInput}
                  value={overrideCode}
                  onChangeText={setOverrideCode}
                  placeholder="F01.01"
                  placeholderTextColor={Colors.outlineVariant}
                  autoCapitalize="characters"
                />
              </View>
              <View style={s.overrideField}>
                <Text style={s.lbl}>Value</Text>
                <TextInput
                  style={s.overrideInput}
                  value={overrideValue}
                  onChangeText={setOverrideValue}
                  placeholder="e.g. 90"
                  placeholderTextColor={Colors.outlineVariant}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={s.overrideBtns}>
              <Btn label="Set Override"    onPress={addOverride}    color={Colors.secondary}       disabled={!overrideCode.trim() || !overrideValue.trim()} />
              <Btn label="Clear"           onPress={clearOverride}  color={Colors.primaryFixedDim} ghost disabled={!overrideCode.trim()} />
              <Btn label="Write to Device" onPress={writeSelected}  color={Colors.onSurfaceVariant} disabled={!isConnected || !overrideCode.trim()} />
            </View>
            {selectedParam && (
              <View style={s.hintBox}>
                <Text style={s.hintTxt}>
                  {selectedParam.code}: file={String(selectedParam.file_value)}  current={String(selectedParam.current_value) || '—'}  final={String(selectedParam.final_value)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* CMD Log */}
        {cmdLogOpen && (
          <View style={s.cmdLog}>
            <View style={s.cmdLogHead}>
              <View style={[s.panelAccent, { backgroundColor: Colors.secondary }]} />
              <Text style={s.cmdLogTitle}>Command Log</Text>
              <Btn label="Clear" onPress={() => { setLastTxJson(''); setLastRxJson(''); }} ghost color={Colors.outlineVariant} small />
              <Btn label="Close" onPress={() => setCmdLogOpen(false)} ghost color={Colors.error} small />
            </View>
            <View style={s.cmdLogCols}>
              <View style={{ flex: 1 }}>
                <Text style={s.cmdLogLbl}>▲ TX — Sent</Text>
                <ScrollView style={s.cmdLogBox} nestedScrollEnabled>
                  <Text style={s.cmdLogTx}>{lastTxJson || '— nothing sent yet —'}</Text>
                </ScrollView>
              </View>
              <View style={s.cmdLogDiv} />
              <View style={{ flex: 1 }}>
                <Text style={[s.cmdLogLbl, { color: Colors.tertiary }]}>▼ RX — Received</Text>
                <ScrollView style={s.cmdLogBox} nestedScrollEnabled>
                  <Text style={s.cmdLogRx}>{lastRxJson || '— no response yet —'}</Text>
                </ScrollView>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: Spacing.lg }} />
      </ScrollView>

      {/* Loading overlay */}
      {loading && (
        <View style={s.overlay}>
          <View style={s.overlayCard}>
            <ActivityIndicator size="large" color={Colors.secondary} />
            <Text style={s.overlayTxt}>{loadingMsg}</Text>
          </View>
        </View>
      )}

      {/* JSON Modal */}
      <Modal visible={jsonModalOpen} animationType="slide" transparent onRequestClose={() => setJsonModalOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <MaterialCommunityIcons name="file-code-outline" size={16} color={Colors.secondary} />
              <Text style={s.modalTitle}>Load JSON Profile</Text>
              <Pressable onPress={() => setJsonModalOpen(false)} style={s.modalCloseBtn} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={16} color={Colors.onSurfaceVariant} />
              </Pressable>
            </View>
            <Text style={s.modalHint}>
              Paste a JSON profile or upload a file.{'\n'}Format: {`{ "profileName": "...", "parameters": [...] }`}
            </Text>
            <TextInput
              style={s.jsonArea}
              value={jsonInput}
              onChangeText={setJsonInput}
              placeholder={'{\n  "profileName": "MyProfile",\n  "parameters": [\n    { "code": "F01.01", ... }\n  ]\n}'}
              placeholderTextColor={Colors.outlineVariant}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
            />
            <View style={s.modalBtns}>
              <Btn label="Upload File"   onPress={handleUploadFile}              color={Colors.tertiary} />
              <Btn label="Load Sample"   onPress={handleLoadSample}              color={Colors.onSurfaceVariant} />
              <Btn label="Parse & Import" onPress={handleParseJson}             color={Colors.secondary} disabled={!jsonInput.trim()} />
              <Btn label="Cancel"        onPress={() => setJsonModalOpen(false)} ghost color={Colors.outlineVariant} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Modal */}
      <Modal visible={!!confirmModal} animationType="fade" transparent onRequestClose={() => setConfirmModal(null)}>
        <View style={s.modalBg}>
          <View style={[s.modalCard, { maxWidth: 400 }]}>
            <View style={s.modalHead}>
              <MaterialCommunityIcons name="alert-outline" size={16} color={Colors.primaryFixedDim} />
              <Text style={s.modalTitle}>{confirmModal?.title}</Text>
            </View>
            <Text style={s.confirmBody}>{confirmModal?.body}</Text>
            <View style={s.modalBtns}>
              <Btn label="Cancel"  onPress={() => setConfirmModal(null)}  ghost color={Colors.outlineVariant} />
              <Btn label="Confirm" onPress={() => confirmModal?.onOk()}   color={Colors.secondary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Nav */}
      <BottomNav />
    </View>
  );
};

export default InverterParameterTool;

// ─── Styles (Industrial Tech OS) ─────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.background, flexDirection: 'column' },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: Spacing.lg },

  // ── Toolbar (title + actions) ──
  toolbar: {
    backgroundColor: Colors.surfaceContainerLow,
    borderBottomWidth: Border.width,
    borderBottomColor: Border.color,
    paddingHorizontal: Spacing.panelPadding,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  toolbarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  screenTitle: {
    ...Typography.labelCaps,
    color: Colors.onSurface,
    fontSize: 12,
    flex: 1,
  },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: Border.width,
    borderColor: Border.color,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: 220,
  },
  profileName: {
    ...Typography.bodyMd,
    color: Colors.onSurface,
    fontSize: 10,
    flex: 1,
  },
  countBadge: {
    backgroundColor: `${Colors.secondary}22`,
    borderWidth: Border.width,
    borderColor: `${Colors.secondary}55`,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  countBadgeTxt: {
    ...Typography.labelCaps,
    color: Colors.secondary,
    fontSize: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },

  // ── Status strip ──
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.panelPadding,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surfaceContainerLowest,
    borderBottomWidth: Border.width,
    borderBottomColor: Border.color,
    borderLeftWidth: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  statusTxt: {
    ...Typography.bodyMd,
    fontSize: 10,
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // ── Buttons ──
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.panelPadding,
    paddingVertical: Spacing.sm,
    borderWidth: Border.width,
    // Sharp corners
  },
  btnSm: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  btnTxt: {
    ...Typography.labelCaps,
    fontSize: 10,
  },
  btnTxtSm: {
    fontSize: 9,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: {
    color: Colors.onPrimary,
    fontSize: 9,
    fontWeight: '800',
  },

  // ── Layout ──
  mainRow:    { flexDirection: 'row', margin: Spacing.sm, gap: Spacing.sm, minHeight: 280 },
  leftPanel:  { backgroundColor: Colors.surfaceContainerLow, borderWidth: Border.width, borderColor: Border.color, gap: Spacing.sm },
  rightPanel: { backgroundColor: Colors.surfaceContainerLow, borderWidth: Border.width, borderColor: Border.color, flex: 1 },

  // ── Panel header ──
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.panelPadding,
    paddingVertical: Spacing.sm,
    borderBottomWidth: Border.width,
    borderBottomColor: Border.color,
    backgroundColor: Colors.surfaceContainer,
  },
  panelAccent: {
    width: 3,
    height: 14,
  },
  panelTitle: {
    ...Typography.labelCaps,
    color: Colors.onSurface,
    fontSize: 10,
    flex: 1,
  },
  panelCount: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    fontSize: 9,
  },

  // ── Search ──
  searchBox: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: Border.width,
    borderColor: Border.color,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    color: Colors.onSurface,
    fontSize: 11,
    margin: Spacing.sm,
    // Sharp corners
  },

  // ── Group list ──
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.panelPadding,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    marginVertical: 1,
  },
  groupTxt:   { ...Typography.bodyMd, color: Colors.onSurfaceVariant, fontSize: 10, flex: 1 },
  groupCount: { ...Typography.labelCaps, color: Colors.outlineVariant, fontSize: 9, marginLeft: Spacing.xs },

  // ── Legend ──
  legendRow:  { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot:  { width: 6, height: 6, borderRadius: 3 },
  legendTxt:  { ...Typography.labelCaps, color: Colors.onSurfaceVariant, fontSize: 8 },

  // ── Table ──
  tableScroll: { flex: 1 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: Border.widthThick,
    borderBottomColor: Border.color,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.panelPadding,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  headCell: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    fontSize: 9,
    paddingHorizontal: Spacing.xs,
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.panelPadding,
    borderBottomWidth: Border.width,
    borderBottomColor: Colors.surfaceContainerHigh,
  },
  paramRowSel: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.secondary,
  },
  cell:    { ...Typography.bodyMd, fontSize: 10, paddingHorizontal: Spacing.xs },
  cellC:   { textAlign: 'center' },
  statusPill: {
    borderWidth: Border.width,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Sharp corners
  },
  statusPillTxt: { ...Typography.labelCaps, fontSize: 8 },
  emptyTable: { padding: Spacing.margin, alignItems: 'center', gap: Spacing.sm },
  emptyTxt:   { ...Typography.bodyMd, color: Colors.onSurfaceVariant, fontSize: 11, textAlign: 'center' },

  // ── Bottom row ──
  bottomRow: { margin: Spacing.sm, marginTop: 0, gap: Spacing.sm },
  card: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: Border.width,
    borderColor: Border.color,
    gap: Spacing.sm,
  },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, padding: Spacing.panelPadding },
  detailCell: { minWidth: 90, marginRight: Spacing.sm, marginBottom: Spacing.sm },
  detailKey:  { ...Typography.labelCaps, color: Colors.onSurfaceVariant, fontSize: 9, marginBottom: 2 },
  detailVal:  { ...Typography.dataMono, fontSize: 12 },

  // ── Override ──
  overrideForm:  { flexDirection: 'row', gap: Spacing.panelPadding, flexWrap: 'wrap', padding: Spacing.panelPadding, paddingTop: 0 },
  overrideField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  lbl:           { ...Typography.labelCaps, color: Colors.onSurfaceVariant, fontSize: 9, minWidth: 36 },
  overrideInput: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: Border.width,
    borderColor: Border.color,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    color: Colors.onSurface,
    fontSize: 12,
    minWidth: 90,
    // Sharp corners
  },
  overrideBtns: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', paddingHorizontal: Spacing.panelPadding, paddingBottom: Spacing.sm },
  hintBox:      { backgroundColor: Colors.surfaceContainerLowest, borderTopWidth: Border.width, borderTopColor: Border.color, padding: Spacing.sm },
  hintTxt:      { ...Typography.bodyMd, color: Colors.onSurfaceVariant, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // ── CMD Log ──
  cmdLog: {
    backgroundColor: Colors.surfaceContainerLowest,
    margin: Spacing.sm,
    marginTop: 0,
    borderWidth: Border.width,
    borderColor: Border.color,
    padding: Spacing.panelPadding,
    gap: Spacing.sm,
  },
  cmdLogHead:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cmdLogTitle: { ...Typography.labelCaps, color: Colors.secondary, fontSize: 10, flex: 1 },
  cmdLogCols:  { flexDirection: 'row', gap: Spacing.sm, minHeight: 160 },
  cmdLogDiv:   { width: Border.width, backgroundColor: Border.color },
  cmdLogLbl:   { ...Typography.labelCaps, color: Colors.secondary, fontSize: 9, marginBottom: Spacing.sm },
  cmdLogBox:   { maxHeight: 200, backgroundColor: Colors.terminal, padding: Spacing.sm },
  cmdLogTx:    { color: Colors.secondary, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 16 },
  cmdLogRx:    { color: Colors.tertiary,  fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 16 },

  // ── Loading overlay ──
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  overlayCard: { backgroundColor: Colors.surfaceContainer, borderWidth: Border.width, borderColor: Border.color, padding: Spacing.margin, alignItems: 'center', gap: Spacing.gutter, minWidth: 180 },
  overlayTxt:  { ...Typography.bodyMd, color: Colors.onSurface, fontSize: 13 },

  // ── Modals ──
  modalBg:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: Spacing.gutter },
  modalCard:    { backgroundColor: Colors.surfaceContainerLow, borderWidth: Border.width, borderColor: Border.color, padding: Spacing.gutter, width: '100%', maxWidth: 520, gap: Spacing.panelPadding },
  modalHead:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  modalTitle:   { ...Typography.headlineMd, color: Colors.onSurface, fontSize: 15, flex: 1 },
  modalCloseBtn:{ padding: Spacing.xs },
  modalHint:    { ...Typography.bodyMd, color: Colors.onSurfaceVariant, fontSize: 10 },
  jsonArea: {
    backgroundColor: Colors.terminal,
    borderWidth: Border.width,
    borderColor: Border.color,
    padding: Spacing.panelPadding,
    color: Colors.secondary,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    minHeight: 200,
    textAlignVertical: 'top',
    // Sharp corners
  },
  modalBtns:   { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  confirmBody: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 20 },
});
