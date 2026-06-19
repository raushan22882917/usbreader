/**
 * BMS diagnosis CAN decode — mirrors parseDiagnosisCanFrame() in main.cpp.
 * Converts raw CAN data bytes into scaled decimal telemetry values.
 */

export interface DiagnosisDecodeState {
  soc: number;
  packVoltageV: number;
  packCurrentA: number;
  packTempC: number;
  cellV: number[];
  cellT: number[];
  cycle: number;
  rpm: number;
  motorTempC: number;
  motorRuntime: number;

  faultUv: boolean;
  faultOv: boolean;
  faultOtc: boolean;
  faultUtc: boolean;
  faultOcd1: boolean;
  faultOcd2: boolean;
  faultSc: boolean;
  faultIso: boolean;

  totalCells: number;
  minV: number;
  maxV: number;
  minCellId: number;
  maxCellId: number;

  batPlusV: number;
  fcV: number;
  scV: number;
  pchgV: number;
  dsgV: number;
  dcdcHV: number;

  relayDsg: boolean;
  relayPchg: boolean;
  relayFc: boolean;
  relaySc: boolean;
  relayDcdc: boolean;
  relayOut: boolean;
  relayNegEnb: boolean;
  relayPosEnb: boolean;

  dcdcVoltV: number;
  dcdcCurrentA: number;
  dcdcTempC: number;
  dcdcReady: boolean;
  dcdcWorking: boolean;
  dcdcHvilErr: boolean;
  dcdcOverTemp: boolean;

  dcdc2VoltageV: number;
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

  chargerStatus: string;
  chargerVoltageV: number;
  chargerCurrentA: number;
  chargerErrorCode: number;

  evccLastMsgCode: string;
  evccLastCanId: string;
  evccDescription: string;
}

export const DIAGNOSIS_DECODE_DEFAULTS: DiagnosisDecodeState = {
  soc: 0,
  packVoltageV: 0,
  packCurrentA: 0,
  packTempC: 0,
  cellV: [0, 0, 0],
  cellT: [0, 0, 0],
  cycle: 0,
  rpm: 0,
  motorTempC: 0,
  motorRuntime: 0,
  faultUv: false,
  faultOv: false,
  faultOtc: false,
  faultUtc: false,
  faultOcd1: false,
  faultOcd2: false,
  faultSc: false,
  faultIso: false,
  totalCells: 0,
  minV: 0,
  maxV: 0,
  minCellId: 0,
  maxCellId: 0,
  batPlusV: 0,
  fcV: 0,
  scV: 0,
  pchgV: 0,
  dsgV: 0,
  dcdcHV: 0,
  relayDsg: false,
  relayPchg: false,
  relayFc: true,
  relaySc: false,
  relayDcdc: true,
  relayOut: true,
  relayNegEnb: true,
  relayPosEnb: true,
  dcdcVoltV: 0,
  dcdcCurrentA: 0,
  dcdcTempC: 0,
  dcdcReady: true,
  dcdcWorking: true,
  dcdcHvilErr: false,
  dcdcOverTemp: false,
  dcdc2VoltageV: 0,
  dcdc2CurrentA: 0,
  dcdc2TempC: 0,
  dcdc2WorkState: "Stop",
  dcdc2FaultLevel: "Level 1 (Highest)",
  dcdc2SysState: "Ready",
  dcdc2ErrFlags: 0,
  dcdc2Version: 0,
  dcdc2CmdMode: "Disable Working",
  dcdc2CmdVset: 0,
  dcdc2CmdIset: 0,
  dcdc2CmdReset: "No reset",
  chargerStatus: "Idle",
  chargerVoltageV: 0,
  chargerCurrentA: 0,
  chargerErrorCode: 0,
  evccLastMsgCode: "",
  evccLastCanId: "",
  evccDescription: "",
};

const EVCC_MSGS: { id: number; code: string; desc: string }[] = [
  { id: 0x1826f456, code: "CHM", desc: "Charger handshake" },
  { id: 0x182756f4, code: "BHM", desc: "Vehicle handshake" },
  { id: 0x1801f456, code: "CRM", desc: "Charger recognition" },
  { id: 0x1c0256f4, code: "BRM", desc: "BMS and vehicle identification" },
  { id: 0x1c0656f4, code: "BCP", desc: "Battery charging parameters" },
  { id: 0x1807f456, code: "CTS", desc: "Charger time sync" },
  { id: 0x1808f456, code: "CML", desc: "Charger max output capability" },
  { id: 0x100956f4, code: "BRO", desc: "Battery charging ready state" },
  { id: 0x100af456, code: "CRO", desc: "Charger output ready state" },
  { id: 0x181056f4, code: "BCL", desc: "Battery charging demand" },
  { id: 0x1c1156f4, code: "BCS", desc: "Overall battery charging status" },
  { id: 0x1812f456, code: "CCS", desc: "Charger charging status" },
  { id: 0x181356f4, code: "BSM", desc: "Power storage battery status" },
  { id: 0x101956f4, code: "BST", desc: "BMS suspending charge" },
  { id: 0x101af456, code: "CST", desc: "Charger suspending charge" },
  { id: 0x181c56f4, code: "BSD", desc: "BMS statistical data" },
  { id: 0x181df456, code: "CSD", desc: "Charger statistical data" },
  { id: 0x181e56f4, code: "BEM", desc: "BMS error message" },
  { id: 0x181ff456, code: "CEM", desc: "Charger error message" },
  { id: 0x1c1556f4, code: "BMV", desc: "Single battery voltage" },
  { id: 0x1c1656f4, code: "BMT", desc: "Battery temperature" },
  { id: 0x1c1756f4, code: "BSP", desc: "Reserved battery message" },
];

function u16be(d: Uint8Array, off: number): number {
  return ((d[off] << 8) | d[off + 1]) >>> 0;
}

function s16be(d: Uint8Array, off: number): number {
  const v = u16be(d, off);
  return v > 0x7fff ? v - 0x10000 : v;
}

function u16le(d: Uint8Array, off: number): number {
  return (d[off] | (d[off + 1] << 8)) >>> 0;
}

function s16le(d: Uint8Array, off: number): number {
  const v = u16le(d, off);
  return v > 0x7fff ? v - 0x10000 : v;
}

function dcdc2WorkLabel(v: number): string {
  if (v === 0) return "Stop";
  if (v === 1) return "Charging";
  if (v === 2) return "Charging completed";
  return "Reserved";
}

function dcdc2FaultLabel(v: number): string {
  if (v === 0) return "Level 1 (Highest)";
  if (v === 1) return "Level 2";
  if (v === 2) return "Level 3";
  return "Level 4 (Lowest)";
}

function dcdc2SysLabel(v: number): string {
  if (v === 0) return "Ready";
  if (v === 1 || v === 4) return "Power Up";
  if (v === 5) return "Error";
  if (v === 7) return "Diag_Cali";
  return `State ${v}`;
}

function dcdc2CmdModeLabel(v: number): string {
  if (v === 0) return "Disable Working";
  if (v === 1) return "Enable Working";
  return "Reserved";
}

function dcdc2CmdResetLabel(v: number): string {
  if (v === 0) return "No reset";
  if (v === 1) return "Reset";
  return "Reserved";
}

function updateEvccInfo(state: DiagnosisDecodeState, id: number): void {
  const msg = EVCC_MSGS.find((m) => m.id === id);
  if (!msg) return;
  state.evccLastMsgCode = msg.code;
  state.evccDescription = msg.desc;
  state.evccLastCanId = `0x${id.toString(16).toUpperCase().padStart(8, "0")}`;
}

/** Coerce JSON field that may be a number or raw byte(s) into a decimal number. */
export function coerceBytesToDecimal(
  value: unknown,
  mode:
    | "raw"
    | "u8"
    | "u16be_div100"
    | "u16be_div10"
    | "s16be_div100"
    | "s16be_div10"
    | "s16le_div10"
    | "u16be_div1000"
    | "u16le_mul005"
    | "u16le_div10"
    | "u16le"
    | "u8_minus40",
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value) || value.length === 0) return null;

  const bytes = new Uint8Array(
    value.map((b) => {
      const n = typeof b === "number" ? b : parseInt(String(b), 10);
      return Number.isFinite(n) ? n & 0xff : 0;
    }),
  );

  switch (mode) {
    case "raw":
    case "u8":
      return bytes[0];
    case "u16be_div100":
      return bytes.length >= 2 ? u16be(bytes, 0) / 100 : bytes[0];
    case "u16be_div10":
      return bytes.length >= 2 ? u16be(bytes, 0) / 10 : bytes[0] / 10;
    case "s16be_div100":
      return bytes.length >= 2 ? s16be(bytes, 0) / 100 : bytes[0];
    case "s16be_div10":
      return bytes.length >= 2 ? s16be(bytes, 0) / 10 : bytes[0];
    case "s16le_div10":
      return bytes.length >= 2 ? s16le(bytes, 0) / 10 : bytes[0];
    case "u16be_div1000":
      return bytes.length >= 2 ? u16be(bytes, 0) / 1000 : bytes[0];
    case "u16le_mul005":
      return bytes.length >= 2 ? u16le(bytes, 0) * 0.05 : bytes[0] * 0.05;
    case "u16le_div10":
      return bytes.length >= 2 ? u16le(bytes, 0) / 10 : bytes[0] / 10;
    case "u16le":
      return bytes.length >= 2 ? u16le(bytes, 0) : bytes[0];
    case "u8_minus40":
      return bytes[0] - 40;
    default:
      return null;
  }
}

export function coerceNumArray(values: unknown, mode: Parameters<typeof coerceBytesToDecimal>[1]): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => coerceBytesToDecimal(v, mode))
    .filter((n): n is number => n != null);
}

/** Parse one CAN frame into diagnosis state (main.cpp parseDiagnosisCanFrame). */
export function parseDiagnosisCanFrame(
  state: DiagnosisDecodeState,
  id: number,
  isExt: boolean,
  dlc: number,
  data: Uint8Array,
): void {
  const d = data;

  if (isExt) {
    if (id === 0x18a10002) {
      if (dlc >= 2) {
        const word = u16le(d, 0);
        state.faultUv = (word & (1 << 0)) !== 0;
        state.faultOv = (word & (1 << 1)) !== 0;
        state.faultUtc = (word & (1 << 2)) !== 0;
        state.faultOtc = (word & (1 << 3)) !== 0;
        state.faultOcd1 = (word & (1 << 9)) !== 0;
        state.faultOcd2 = (word & (1 << 10)) !== 0;
        state.faultSc = (word & (1 << 11)) !== 0;
        state.faultIso = (word & (1 << 15)) !== 0;
      }
      if (dlc >= 7 && d[6] > 0) state.totalCells = d[6];
      if (dlc >= 8) state.soc = d[7];
    } else if (id === 0x18a11b02 && dlc >= 4) {
      state.packVoltageV = u16be(d, 0) / 100;
      state.packCurrentA = s16be(d, 2) / 100;
    } else if (id === 0x18a11d02 && dlc >= 2) {
      state.packTempC = s16be(d, 0) / 10;
    } else if (id === 0x18a10f02 && dlc > 0) {
      state.cycle = d[dlc - 1];
      if (state.cycle < 1) state.cycle = 1;
    } else if (id === 0x18a11c02 && dlc >= 8) {
      state.maxV = u16be(d, 0) / 1000;
      state.minV = u16be(d, 2) / 1000;
      state.maxCellId = u16be(d, 4);
      state.minCellId = u16be(d, 6);
    } else if (id === 0x18a10102 && dlc >= 8) {
      state.batPlusV = u16be(d, 0) / 100;
      state.fcV = u16be(d, 2) / 100;
      state.scV = u16be(d, 4) / 100;
      state.pchgV = u16be(d, 6) / 100;
    } else if (id === 0x18a10202 && dlc >= 8) {
      state.dcdcHV = u16be(d, 0) / 100;
      state.dsgV = u16be(d, 4) / 100;
      const relayByte = d[7];
      state.relayDsg = (relayByte & (1 << 0)) !== 0;
      state.relayPchg = (relayByte & (1 << 1)) !== 0;
      state.relayFc = (relayByte & (1 << 2)) !== 0;
      state.relaySc = (relayByte & (1 << 3)) !== 0;
      state.relayDcdc = (relayByte & (1 << 4)) !== 0;
      state.relayOut = (relayByte & (1 << 5)) !== 0;
      state.relayNegEnb = (relayByte & (1 << 6)) !== 0;
      state.relayPosEnb = (relayByte & (1 << 7)) !== 0;
    } else if (id === 0x18ff50e5 && dlc >= 5) {
      state.chargerVoltageV = u16be(d, 0) / 10;
      state.chargerCurrentA = u16be(d, 2) / 10;
      state.chargerErrorCode = d[4];
      state.chargerStatus = state.chargerCurrentA > 0.1 ? "Charging" : "Idle";
    } else if (id === 0x1801d08f && dlc >= 8) {
      state.dcdcVoltV = u16be(d, 0) / 10;
      state.dcdcCurrentA = u16be(d, 2) / 10;
      state.dcdcTempC = d[7] - 40;
      const b4 = d[4];
      const b5 = d[5];
      state.dcdcHvilErr = (b4 & (1 << 7)) !== 0;
      state.dcdcWorking = (b4 & (1 << 1)) !== 0;
      state.dcdcReady = (b4 & (1 << 0)) !== 0;
      state.dcdcOverTemp = (b5 & (1 << 1)) !== 0;
    } else if (id === 0x18f8622b && dlc >= 8) {
      const b0 = d[0];
      state.dcdc2TempC = d[1] - 40;
      state.dcdc2VoltageV = u16le(d, 2) * 0.05;
      state.dcdc2CurrentA = u16le(d, 4) * 0.05;
      state.dcdc2ErrFlags = d[6];
      state.dcdc2Version = d[7];
      state.dcdc2WorkState = dcdc2WorkLabel((b0 >> 1) & 0x03);
      state.dcdc2FaultLevel = dcdc2FaultLabel((b0 >> 3) & 0x03);
      state.dcdc2SysState = dcdc2SysLabel((b0 >> 5) & 0x07);
    } else if (id === 0x10262b27 && dlc >= 8) {
      state.dcdc2CmdMode = dcdc2CmdModeLabel(d[0] & 0x03);
      state.dcdc2CmdVset = u16le(d, 1) * 0.1;
      state.dcdc2CmdIset = u16le(d, 3) * 0.1;
      state.dcdc2CmdReset = dcdc2CmdResetLabel(d[7] & 0x03);
    } else if (id >= 0x18a12402 && id <= 0x18a14102) {
      const offset = Math.floor((id - 0x18a12402) / 0x100);
      const das = Math.floor(offset / 3);
      const frameInDas = offset % 3;
      for (let k = 0; k < 4; k++) {
        const cellInDas = frameInDas * 4 + k;
        const cellIdx = das * 12 + cellInDas;
        if (cellIdx >= 0 && cellIdx < 3) {
          const a = 2 * k;
          if (a + 1 < dlc) state.cellV[cellIdx] = u16be(d, a) / 1000;
        }
      }
    } else if (id >= 0x18a14202 && id <= 0x18a14b02) {
      const das = Math.floor((id - 0x18a14202) / 0x100);
      const temps: number[] = [];
      for (let k = 0; k < 4; k++) {
        const a = 2 * k;
        if (a + 1 < dlc) temps.push(s16be(d, a) / 10);
      }
      if (temps.length > 0) {
        const avg = temps.reduce((s, t) => s + t, 0) / temps.length;
        const baseCell = das * 12;
        for (let i = 0; i < 12; i++) {
          const cellIdx = baseCell + i;
          if (cellIdx >= 0 && cellIdx < 3) state.cellT[cellIdx] = avg;
        }
      }
    }
    updateEvccInfo(state, id);
  } else if (id === 0x581 && dlc >= 4) {
    if (d[0] === 0x4b && d[1] === 0x21 && d[2] === 0x20 && d[3] === 0x06) {
      if (dlc >= 6) state.rpm = u16le(d, 4);
    } else if (d[0] === 0x4b && d[1] === 0x23 && d[2] === 0x20 && d[3] === 0x1e) {
      if (dlc >= 6) state.motorTempC = s16le(d, 4) / 10;
    } else if (d[0] === 0x4b && d[1] === 0x21 && d[2] === 0x20 && d[3] === 0x19) {
      if (dlc >= 6) state.motorRuntime = u16le(d, 4);
    }
  }
}
