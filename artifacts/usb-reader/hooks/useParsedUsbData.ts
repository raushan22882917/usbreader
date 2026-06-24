import { useMemo, useEffect, useState } from "react";
import { DataPacket } from "@/context/UsbContext";
import { extractJsonObjects } from "@/lib/diagnosisTelemetry";
import {
  coerceBytesToDecimal,
  coerceNumArray,
  DiagnosisDecodeState,
} from "@/lib/diagnosisCanDecode";

export interface ParsedUsbData {
  dataRateKbps: number;
  packetsPerSec: number;
  totalRxBytes: number;
  totalTxBytes: number;
  totalBytes: number;
  rxCount: number;
  txCount: number;

  // BMS / Battery
  soc: number;
  packVoltageV: number;
  packCurrentA: number;
  packTempC: number;

  // Cells
  minV: number;
  maxV: number;
  minCellId: number;
  maxCellId: number;
  totalCells: number;
  cellVoltages: number[];
  cellTemperatures: number[];
  cycle: number;

  // HV
  batPlusV: number;
  fcV: number;
  dcdcHV: number;
  dsgV: number;
  scV: number;
  pchgV: number;

  // Relays
  relayDSG: boolean;
  relayPCHG: boolean;
  relayFC: boolean;
  relaySC: boolean;
  relayDCDC: boolean;
  relayOUT: boolean;
  relayNEG_ENB: boolean;
  relayPOS_ENB: boolean;

  // Board supply
  vccV: number;
  boardTempC: number;

  // Motor
  motorRpm: number;
  motorTempC: number;
  motorLoadPct: number;
  motorRuntime: number;

  // DC-DC
  dcdcVoltV: number;
  dcdcCurrentA: number;
  dcdcTempC: number;
  dcdcReady: boolean;
  dcdcWorking: boolean;
  dcdcHvilErr: boolean;
  dcdcOverTemp: boolean;

  // DC-DC 2 (0x18F8622B / 0x10262B27)
  dcdc2VoltV: number;
  dcdc2CurrentA: number;
  dcdc2TempC: number;
  dcdc2WorkState: string;
  dcdc2FaultLevel: string;
  dcdc2SysState: string;
  dcdc2ErrFlags: number;
  dcdc2Version: number;
  dcdc2CmdMode: string;
  dcdc2CmdVset: number;
  dcdc2CmdIset: number;
  dcdc2CmdReset: string;

  // Charger
  chrgrStatus: string;
  chrgrVoltV: number;
  chrgrCurrentA: number;
  chrgrErrorCode: number;

  // EVCC
  evccLastMsgCode: string;
  evccLastCanId: string;
  evccDescription: string;

  // Faults
  faultUV: boolean;
  faultOV: boolean;
  faultOTC: boolean;
  faultUTC: boolean;
  faultOCD1: boolean;
  faultOCD2: boolean;
  faultSC: boolean;
  faultISO: boolean;

  // System
  uptimeSec: number;
  heartbeat: number;
  timestamp: number;

  lastPacketData: string;
  lastPacketTime: string;
}

export const PARSED_USB_DEFAULTS: ParsedUsbData = {
  dataRateKbps: 0, packetsPerSec: 0,
  totalRxBytes: 0, totalTxBytes: 0, totalBytes: 0,
  rxCount: 0, txCount: 0,
  soc: 0, packVoltageV: 0, packCurrentA: 0, packTempC: 0,
  minV: 0, maxV: 0, minCellId: 0, maxCellId: 0, totalCells: 0,
  cellVoltages: [], cellTemperatures: [], cycle: 0,
  batPlusV: 0, fcV: 0, dcdcHV: 0, dsgV: 0, scV: 0, pchgV: 0,
  relayDSG: false, relayPCHG: false, relayFC: false, relaySC: false,
  relayDCDC: false, relayOUT: false, relayNEG_ENB: false, relayPOS_ENB: false,
  vccV: 0, boardTempC: 0,
  motorRpm: 0, motorTempC: 0, motorLoadPct: 0, motorRuntime: 0,
  dcdcVoltV: 0, dcdcCurrentA: 0, dcdcTempC: 0,
  dcdcReady: false, dcdcWorking: false, dcdcHvilErr: false, dcdcOverTemp: false,
  dcdc2VoltV: 0, dcdc2CurrentA: 0, dcdc2TempC: 0,
  dcdc2WorkState: "—", dcdc2FaultLevel: "—", dcdc2SysState: "—",
  dcdc2ErrFlags: 0, dcdc2Version: 0,
  dcdc2CmdMode: "—", dcdc2CmdVset: 0, dcdc2CmdIset: 0, dcdc2CmdReset: "—",
  chrgrStatus: "—", chrgrVoltV: 0, chrgrCurrentA: 0, chrgrErrorCode: 0,
  evccLastMsgCode: "", evccLastCanId: "", evccDescription: "",
  faultUV: false, faultOV: false, faultOTC: false, faultUTC: false,
  faultOCD1: false, faultOCD2: false, faultSC: false, faultISO: false,
  uptimeSec: 0, heartbeat: 0, timestamp: 0,
  lastPacketData: "", lastPacketTime: "",
};

function pickNum(value: unknown, mode: Parameters<typeof coerceBytesToDecimal>[1]): number | null {
  return coerceBytesToDecimal(value, mode);
}

// ── Apply one parsed JSON object to the result ────────────────────────────────
function applyJson(r: ParsedUsbData, data: any): void {
  const bms     = data.bms;
  const cells   = data.cells;
  const hv      = data.hv;
  const relays  = data.relays;
  const dcdc    = data.dcdc;
  const dcdc2   = data.dcdc2;
  const charger = data.charger;
  const motor   = data.motor;
  const evcc    = data.evcc;

  if (bms) {
    const soc = pickNum(bms.soc, "u8");
    if (soc != null) r.soc = soc;
    const pv = pickNum(bms.pack_voltage_v, "u16be_div100");
    if (pv != null) r.packVoltageV = pv;
    const pc = pickNum(bms.pack_current_a, "s16be_div100");
    if (pc != null) r.packCurrentA = pc;
    const pt = pickNum(bms.pack_temp_c, "s16be_div10");
    if (pt != null) r.packTempC = pt;
    if (bms.faults) {
      r.faultUV   = !!bms.faults.UV;
      r.faultOV   = !!bms.faults.OV;
      r.faultOTC  = !!bms.faults.OTC;
      r.faultUTC  = !!bms.faults.UTC;
      r.faultOCD1 = !!bms.faults.OCD1;
      r.faultOCD2 = !!bms.faults.OCD2;
      r.faultSC   = !!bms.faults.SC;
      r.faultISO  = !!bms.faults.ISO;
    }
  }

  if (cells) {
    const minV = pickNum(cells.min_v, "u16be_div1000");
    if (minV != null) r.minV = minV;
    const maxV = pickNum(cells.max_v, "u16be_div1000");
    if (maxV != null) r.maxV = maxV;
    const minId = pickNum(cells.min_cell_id, "raw");
    if (minId != null) r.minCellId = minId;
    const maxId = pickNum(cells.max_cell_id, "raw");
    if (maxId != null) r.maxCellId = maxId;
    const total = pickNum(cells.total_cells, "u8");
    if (total != null) r.totalCells = total;
    const cycle = pickNum(cells.cycle, "u8");
    if (cycle != null) r.cycle = cycle;
    if (Array.isArray(cells.voltages)) {
      const decoded = coerceNumArray(cells.voltages, "u16be_div1000");
      if (decoded.length) r.cellVoltages = decoded;
      else r.cellVoltages = cells.voltages.filter((x: unknown) => typeof x === "number");
    }
    if (Array.isArray(cells.temperatures)) {
      const decoded = coerceNumArray(cells.temperatures, "s16be_div10");
      if (decoded.length) r.cellTemperatures = decoded;
      else r.cellTemperatures = cells.temperatures.filter((x: unknown) => typeof x === "number");
    }
  }

  if (hv) {
    const bat = pickNum(hv.bat_plus_v, "u16be_div100");
    if (bat != null) r.batPlusV = bat;
    const fc = pickNum(hv.fc_v, "u16be_div100");
    if (fc != null) r.fcV = fc;
    const dcdcHv = pickNum(hv.dcdc_v, "u16be_div100");
    if (dcdcHv != null) r.dcdcHV = dcdcHv;
    const dsg = pickNum(hv.dsg_v, "u16be_div100");
    if (dsg != null) r.dsgV = dsg;
    const sc = pickNum(hv.sc_v, "u16be_div100");
    if (sc != null) r.scV = sc;
    const pchg = pickNum(hv.pchg_v, "u16be_div100");
    if (pchg != null) r.pchgV = pchg;
  }

  if (relays) {
    r.relayDSG     = !!relays["DSG+"];
    r.relayPCHG    = !!relays["PCHG+"];
    r.relayFC      = !!relays["FC+"];
    r.relaySC      = !!relays["SC+"];
    r.relayDCDC    = !!relays["DC-DC+"];
    r.relayOUT     = !!relays["OUT-"];
    r.relayNEG_ENB = !!relays["NEG_ENB"];
    r.relayPOS_ENB = !!relays["POS_ENB"];
  }

  if (dcdc) {
    const dv = pickNum(dcdc.voltage_v, "u16be_div10");
    if (dv != null) r.dcdcVoltV = dv;
    const da = pickNum(dcdc.current_a, "u16be_div10");
    if (da != null) r.dcdcCurrentA = da;
    const dt = pickNum(dcdc.temp_c, "u8_minus40");
    if (dt != null) r.dcdcTempC = dt;
    r.dcdcReady    = !!dcdc.ready;
    r.dcdcWorking  = !!dcdc.working;
    r.dcdcHvilErr  = !!dcdc.hvil_err;
    r.dcdcOverTemp = !!dcdc.over_temperature;
  }

  if (dcdc2) {
    const v2 = pickNum(dcdc2.voltage_v, "u16le_mul005");
    if (v2 != null) r.dcdc2VoltV = v2;
    const a2 = pickNum(dcdc2.current_a, "u16le_mul005");
    if (a2 != null) r.dcdc2CurrentA = a2;
    const t2 = pickNum(dcdc2.temp_c, "u8_minus40");
    if (t2 != null) r.dcdc2TempC = t2;
    if (dcdc2.work_state != null) r.dcdc2WorkState = String(dcdc2.work_state);
    if (dcdc2.fault_level != null) r.dcdc2FaultLevel = String(dcdc2.fault_level);
    if (dcdc2.sys_state != null) r.dcdc2SysState = String(dcdc2.sys_state);
    const err = pickNum(dcdc2.err_flags, "u8");
    if (err != null) r.dcdc2ErrFlags = err;
    const ver = pickNum(dcdc2.version, "u8");
    if (ver != null) r.dcdc2Version = ver;
    const cmd = dcdc2.cmd;
    if (cmd && typeof cmd === "object") {
      if (cmd.mode != null) r.dcdc2CmdMode = String(cmd.mode);
      const vset = pickNum(cmd.v_set, "u16le_div10");
      if (vset != null) r.dcdc2CmdVset = vset;
      const iset = pickNum(cmd.i_set, "u16le_div10");
      if (iset != null) r.dcdc2CmdIset = iset;
      if (cmd.reset != null) r.dcdc2CmdReset = String(cmd.reset);
    }
  }

  if (charger) {
    if (charger.status != null) r.chrgrStatus = String(charger.status);
    const cv = pickNum(charger.voltage_v, "u16be_div10");
    if (cv != null) r.chrgrVoltV = cv;
    const ca = pickNum(charger.current_a, "u16be_div10");
    if (ca != null) r.chrgrCurrentA = ca;
    const ce = pickNum(charger.error_code, "u8");
    if (ce != null) r.chrgrErrorCode = ce;
  }

  if (motor) {
    const rpm = pickNum(motor.rpm, "u16le");
    if (rpm != null) r.motorRpm = rpm;
    const mt = pickNum(motor.temp_c, "s16le_div10");
    if (mt != null) r.motorTempC = mt;
    const load = pickNum(motor.load_pct ?? motor.load, "raw");
    if (load != null) r.motorLoadPct = load;
    const rt = pickNum(motor.runtime, "u16le");
    if (rt != null) r.motorRuntime = rt;
  }

  if (evcc) {
    if (evcc.last_msg_code != null) r.evccLastMsgCode = evcc.last_msg_code;
    if (evcc.last_can_id   != null) r.evccLastCanId   = evcc.last_can_id;
    if (evcc.description   != null) r.evccDescription = evcc.description;
  }

  if (data.heartbeat != null) r.heartbeat = data.heartbeat;
  if (data.uptime_s  != null) r.uptimeSec = data.uptime_s;
  if (data.ts        != null) r.timestamp = data.ts;
}

// ── Main parser ───────────────────────────────────────────────────────────────
export function parsePackets(packets: DataPacket[]): ParsedUsbData {
  const r = { ...PARSED_USB_DEFAULTS };
  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");

  r.rxCount      = rxPkts.length;
  r.txCount      = txPkts.length;
  r.totalRxBytes = rxPkts.reduce((s, p) => s + p.byteLength, 0);
  r.totalTxBytes = txPkts.reduce((s, p) => s + p.byteLength, 0);
  r.totalBytes   = r.totalRxBytes + r.totalTxBytes;

  const now = Date.now();
  const recent3s = rxPkts.filter((p) => now - p.timestamp.getTime() < 3000);
  r.dataRateKbps  = recent3s.reduce((s, p) => s + p.byteLength, 0) / 3 / 1024;
  r.packetsPerSec = recent3s.length / 3;

  if (packets.length > 0) {
    const last = packets[packets.length - 1];
    r.lastPacketData = last.data;
    r.lastPacketTime = last.timestamp.toLocaleTimeString([], { hour12: false });
  }

  // ── Step 1: Concatenate the last N rx packets into one stream ─────────────
  // JSON objects are often split across multiple 512-byte USB transfers.
  // We join the last 32 packets (covers ~16 KB) to reassemble them.
  const WINDOW = 32;
  const recentRx = rxPkts.slice(-WINDOW);
  const stream = recentRx.map((p) => p.data).join("");

  // ── Step 2: Extract all complete JSON objects from the stream ─────────────
  const jsonObjects = extractJsonObjects(stream);
  for (const obj of jsonObjects) {
    applyJson(r, obj);
  }

  // ── Step 3: Legacy text-format fallback (for non-JSON devices) ───────────
  // Only run if no JSON was found
  if (jsonObjects.length === 0) {
    for (const pkt of recentRx) {
      const d = pkt.data;

      const vccM  = d.match(/VCC:([\d.]+)V/i);   if (vccM)  r.vccV        = parseFloat(vccM[1]);
      const tmpM  = d.match(/TEMP:([\d.]+)C/i);   if (tmpM)  r.boardTempC  = parseFloat(tmpM[1]);
      const rpmM  = d.match(/^RPM:([\d.]+)/);      if (rpmM)  r.motorRpm    = parseFloat(rpmM[1]);
      const currM = d.match(/CURR:([\d.]+)A/i);   if (currM) r.packCurrentA= parseFloat(currM[1]);
      const socM  = d.match(/SOC:([\d.]+)%/i);    if (socM)  r.soc         = parseFloat(socM[1]);
      const hbM   = d.match(/HEARTBEAT:([\d]+)/i);if (hbM)   r.heartbeat   = parseInt(hbM[1]);
      const upM   = d.match(/UPTIME:([\d]+)s/i);  if (upM)   r.uptimeSec   = parseInt(upM[1]);

      const mRpmM = d.match(/MOTOR:RPM=([\d.]+)/i);       if (mRpmM) r.motorRpm    = parseFloat(mRpmM[1]);
      const mTmpM = d.match(/MOTOR:.*?TEMP=([\d.]+)C/i);  if (mTmpM) r.motorTempC  = parseFloat(mTmpM[1]);
      const mLdM  = d.match(/LOAD=([\d.]+)%/i);           if (mLdM)  r.motorLoadPct= parseFloat(mLdM[1]);

      const dcV = d.match(/DCDC:VOLT=([\d.]+)V/i);        if (dcV) r.dcdcVoltV    = parseFloat(dcV[1]);
      const dcC = d.match(/DCDC:.*?CURR=([\d.]+)A/i);     if (dcC) r.dcdcCurrentA = parseFloat(dcC[1]);

      const csM = d.match(/CHRG:STATUS=([^\s]+)/i);       if (csM) r.chrgrStatus  = csM[1];
    }
  }

  return r;
}

/** Build display state from one diagnosis telemetry JSON object. */
export function parsedFromTelemetryJson(data: Record<string, unknown>): ParsedUsbData {
  const r = { ...PARSED_USB_DEFAULTS };
  applyJson(r, data);
  return r;
}

/** Map CAN-decode state (from csvlog frames) into UI display values. */
export function parsedFromDiagnosisDecodeState(
  state: DiagnosisDecodeState,
  timestamp: number,
): ParsedUsbData {
  const r = { ...PARSED_USB_DEFAULTS };
  r.soc = state.soc;
  r.packVoltageV = state.packVoltageV;
  r.packCurrentA = state.packCurrentA;
  r.packTempC = state.packTempC;
  r.minV = state.minV;
  r.maxV = state.maxV;
  r.minCellId = state.minCellId;
  r.maxCellId = state.maxCellId;
  r.totalCells = state.totalCells;
  r.cellVoltages = [...state.cellV];
  r.cellTemperatures = [...state.cellT];
  r.cycle = state.cycle;
  r.batPlusV = state.batPlusV;
  r.fcV = state.fcV;
  r.dcdcHV = state.dcdcHV;
  r.dsgV = state.dsgV;
  r.scV = state.scV;
  r.pchgV = state.pchgV;
  r.relayDSG = state.relayDsg;
  r.relayPCHG = state.relayPchg;
  r.relayFC = state.relayFc;
  r.relaySC = state.relaySc;
  r.relayDCDC = state.relayDcdc;
  r.relayOUT = state.relayOut;
  r.relayNEG_ENB = state.relayNegEnb;
  r.relayPOS_ENB = state.relayPosEnb;
  r.motorRpm = state.rpm;
  r.motorTempC = state.motorTempC;
  r.motorRuntime = state.motorRuntime;
  r.motorLoadPct =
    state.rpm > 0 ? Math.min(Math.round((state.rpm / 3000) * 100), 100) : 0;
  r.dcdcVoltV = state.dcdcVoltV;
  r.dcdcCurrentA = state.dcdcCurrentA;
  r.dcdcTempC = state.dcdcTempC;
  r.dcdcReady = state.dcdcReady;
  r.dcdcWorking = state.dcdcWorking;
  r.dcdcHvilErr = state.dcdcHvilErr;
  r.dcdcOverTemp = state.dcdcOverTemp;
  r.dcdc2VoltV = state.dcdc2VoltageV;
  r.dcdc2CurrentA = state.dcdc2CurrentA;
  r.dcdc2TempC = state.dcdc2TempC;
  r.dcdc2WorkState = state.dcdc2WorkState;
  r.dcdc2FaultLevel = state.dcdc2FaultLevel;
  r.dcdc2SysState = state.dcdc2SysState;
  r.dcdc2ErrFlags = state.dcdc2ErrFlags;
  r.dcdc2Version = state.dcdc2Version;
  r.dcdc2CmdMode = state.dcdc2CmdMode;
  r.dcdc2CmdVset = state.dcdc2CmdVset;
  r.dcdc2CmdIset = state.dcdc2CmdIset;
  r.dcdc2CmdReset = state.dcdc2CmdReset;
  r.chrgrStatus = state.chargerStatus;
  r.chrgrVoltV = state.chargerVoltageV;
  r.chrgrCurrentA = state.chargerCurrentA;
  r.chrgrErrorCode = state.chargerErrorCode;
  r.evccLastMsgCode = state.evccLastMsgCode;
  r.evccLastCanId = state.evccLastCanId;
  r.evccDescription = state.evccDescription;
  r.faultUV = state.faultUv;
  r.faultOV = state.faultOv;
  r.faultOTC = state.faultOtc;
  r.faultUTC = state.faultUtc;
  r.faultOCD1 = state.faultOcd1;
  r.faultOCD2 = state.faultOcd2;
  r.faultSC = state.faultSc;
  r.faultISO = state.faultIso;
  r.timestamp = timestamp;
  return r;
}

/** Synthetic diagnosis JSON for validation/logging from CAN decode state. */
export function telemetryJsonFromDecodeState(
  state: DiagnosisDecodeState,
  ts: number,
): Record<string, unknown> {
  return {
    bms: {
      soc: state.soc,
      pack_voltage_v: state.packVoltageV,
      pack_current_a: state.packCurrentA,
      pack_temp_c: state.packTempC,
      faults: {
        UV: state.faultUv,
        OV: state.faultOv,
        OTC: state.faultOtc,
        UTC: state.faultUtc,
        OCD1: state.faultOcd1,
        OCD2: state.faultOcd2,
        SC: state.faultSc,
        ISO: state.faultIso,
      },
    },
    cells: {
      total_cells: state.totalCells,
      cycle: state.cycle,
      min_v: state.minV,
      max_v: state.maxV,
      min_cell_id: state.minCellId,
      max_cell_id: state.maxCellId,
      voltages: [...state.cellV],
      temperatures: [...state.cellT],
    },
    hv: {
      bat_plus_v: state.batPlusV,
      fc_v: state.fcV,
      dcdc_v: state.dcdcHV,
      dsg_v: state.dsgV,
      sc_v: state.scV,
      pchg_v: state.pchgV,
    },
    relays: {
      "DSG+": state.relayDsg,
      "PCHG+": state.relayPchg,
      "FC+": state.relayFc,
      "SC+": state.relaySc,
      "DC-DC+": state.relayDcdc,
      "OUT-": state.relayOut,
      "NEG_ENB": state.relayNegEnb,
      "POS_ENB": state.relayPosEnb,
    },
    dcdc: {
      voltage_v: state.dcdcVoltV,
      current_a: state.dcdcCurrentA,
      temp_c: state.dcdcTempC,
      ready: state.dcdcReady,
      working: state.dcdcWorking,
      hvil_err: state.dcdcHvilErr,
      over_temperature: state.dcdcOverTemp,
    },
    dcdc2: {
      voltage_v: state.dcdc2VoltageV,
      current_a: state.dcdc2CurrentA,
      temp_c: state.dcdc2TempC,
      work_state: state.dcdc2WorkState,
      fault_level: state.dcdc2FaultLevel,
      sys_state: state.dcdc2SysState,
      err_flags: state.dcdc2ErrFlags,
      version: state.dcdc2Version,
      cmd: {
        mode: state.dcdc2CmdMode,
        v_set: state.dcdc2CmdVset,
        i_set: state.dcdc2CmdIset,
        reset: state.dcdc2CmdReset,
      },
    },
    charger: {
      status: state.chargerStatus,
      voltage_v: state.chargerVoltageV,
      current_a: state.chargerCurrentA,
      error_code: state.chargerErrorCode,
    },
    motor: {
      rpm: state.rpm,
      temp_c: state.motorTempC,
      runtime: state.motorRuntime,
    },
    evcc: {
      last_msg_code: state.evccLastMsgCode,
      last_can_id: state.evccLastCanId,
      description: state.evccDescription,
    },
    ts,
  };
}

export function useParsedUsbData(
  packets: DataPacket[],
  options?: { pollMs?: number },
): ParsedUsbData {
  const pollMs = options?.pollMs ?? 800;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (pollMs <= 0) return;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);
  return useMemo(() => parsePackets(packets), [packets, tick, pollMs]);
}
