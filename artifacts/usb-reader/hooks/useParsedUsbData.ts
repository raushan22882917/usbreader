import { useMemo, useEffect, useState } from "react";
import { DataPacket } from "@/context/UsbContext";

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

const DEFAULTS: ParsedUsbData = {
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
  chrgrStatus: "—", chrgrVoltV: 0, chrgrCurrentA: 0, chrgrErrorCode: 0,
  evccLastMsgCode: "", evccLastCanId: "", evccDescription: "",
  faultUV: false, faultOV: false, faultOTC: false, faultUTC: false,
  faultOCD1: false, faultOCD2: false, faultSC: false, faultISO: false,
  uptimeSec: 0, heartbeat: 0, timestamp: 0,
  lastPacketData: "", lastPacketTime: "",
};

// ── Extract all complete JSON objects from a raw string ───────────────────────
// Handles the case where JSON is split across multiple 512-byte USB packets.
function extractJsonObjects(raw: string): any[] {
  const results: any[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          results.push(JSON.parse(raw.slice(start, i + 1)));
        } catch {
          // partial / malformed — skip
        }
        start = -1;
      }
    }
  }
  return results;
}

// ── Apply one parsed JSON object to the result ────────────────────────────────
function applyJson(r: ParsedUsbData, data: any): void {
  const bms     = data.bms;
  const cells   = data.cells;
  const hv      = data.hv;
  const relays  = data.relays;
  const dcdc    = data.dcdc;
  const charger = data.charger;
  const motor   = data.motor;
  const evcc    = data.evcc;

  if (bms) {
    if (bms.soc            != null) r.soc          = bms.soc;
    if (bms.pack_voltage_v != null) r.packVoltageV = bms.pack_voltage_v;
    if (bms.pack_current_a != null) r.packCurrentA = bms.pack_current_a;
    if (bms.pack_temp_c    != null) r.packTempC    = bms.pack_temp_c;
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
    if (cells.min_v        != null) r.minV        = cells.min_v;
    if (cells.max_v        != null) r.maxV        = cells.max_v;
    if (cells.min_cell_id  != null) r.minCellId   = cells.min_cell_id;
    if (cells.max_cell_id  != null) r.maxCellId   = cells.max_cell_id;
    if (cells.total_cells  != null) r.totalCells  = cells.total_cells;
    if (cells.cycle        != null) r.cycle       = cells.cycle;
    if (Array.isArray(cells.voltages))     r.cellVoltages     = cells.voltages;
    if (Array.isArray(cells.temperatures)) r.cellTemperatures = cells.temperatures;
  }

  if (hv) {
    if (hv.bat_plus_v != null) r.batPlusV = hv.bat_plus_v;
    if (hv.fc_v       != null) r.fcV      = hv.fc_v;
    if (hv.dcdc_v     != null) r.dcdcHV   = hv.dcdc_v;
    if (hv.dsg_v      != null) r.dsgV     = hv.dsg_v;
    if (hv.sc_v       != null) r.scV      = hv.sc_v;
    if (hv.pchg_v     != null) r.pchgV    = hv.pchg_v;
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
    if (dcdc.voltage_v != null) r.dcdcVoltV    = dcdc.voltage_v;
    if (dcdc.current_a != null) r.dcdcCurrentA = dcdc.current_a;
    if (dcdc.temp_c    != null) r.dcdcTempC    = dcdc.temp_c;
    r.dcdcReady    = !!dcdc.ready;
    r.dcdcWorking  = !!dcdc.working;
    r.dcdcHvilErr  = !!dcdc.hvil_err;
    r.dcdcOverTemp = !!dcdc.over_temperature;
  }

  if (charger) {
    if (charger.status    != null) r.chrgrStatus    = charger.status;
    if (charger.voltage_v != null) r.chrgrVoltV     = charger.voltage_v;
    if (charger.current_a != null) r.chrgrCurrentA  = charger.current_a;
    if (charger.error_code!= null) r.chrgrErrorCode = charger.error_code;
  }

  if (motor) {
    if (motor.rpm     != null) r.motorRpm     = motor.rpm;
    if (motor.temp_c  != null) r.motorTempC   = motor.temp_c;
    if (motor.load_pct!= null) r.motorLoadPct = motor.load_pct;
    else if (motor.load != null) r.motorLoadPct = motor.load;
    if (motor.runtime != null) r.motorRuntime = motor.runtime;
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
function parsePackets(packets: DataPacket[]): ParsedUsbData {
  const r = { ...DEFAULTS };
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

export function useParsedUsbData(packets: DataPacket[]): ParsedUsbData {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 800);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => parsePackets(packets), [packets, tick]);
}
