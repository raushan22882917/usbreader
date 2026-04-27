import { useMemo, useEffect, useState } from "react";
import { DataPacket } from "@/context/UsbContext";

export interface ParsedUsbData {
  // Connection / signal quality
  dataRateKbps: number;        // KB/s in last 3 seconds
  packetsPerSec: number;       // packets/s in last 3 seconds
  totalRxBytes: number;
  totalTxBytes: number;
  totalBytes: number;
  rxCount: number;
  txCount: number;

  // BMS / Battery
  soc: number;                 // 0-100 %
  packVoltageV: number;        // volts
  packCurrentA: number;        // amps
  packTempC: number;           // celsius

  // VCC / supply
  vccV: number;                // volts (e.g. 3.28)
  boardTempC: number;          // celsius

  // Motor
  motorRpm: number;
  motorTempC: number;
  motorLoadPct: number;

  // System
  uptimeSec: number;
  heartbeat: number;

  // Last raw packet
  lastPacketData: string;
  lastPacketTime: string;
}

const DEFAULTS: ParsedUsbData = {
  dataRateKbps: 0,
  packetsPerSec: 0,
  totalRxBytes: 0,
  totalTxBytes: 0,
  totalBytes: 0,
  rxCount: 0,
  txCount: 0,
  soc: 0,
  packVoltageV: 0,
  packCurrentA: 0,
  packTempC: 0,
  vccV: 0,
  boardTempC: 0,
  motorRpm: 0,
  motorTempC: 0,
  motorLoadPct: 0,
  uptimeSec: 0,
  heartbeat: 0,
  lastPacketData: "",
  lastPacketTime: "",
};

/** Parses the latest USB packets into structured telemetry */
function parsePackets(packets: DataPacket[]): ParsedUsbData {
  const result = { ...DEFAULTS };

  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");

  result.rxCount = rxPkts.length;
  result.txCount = txPkts.length;
  result.totalRxBytes = rxPkts.reduce((s, p) => s + p.byteLength, 0);
  result.totalTxBytes = txPkts.reduce((s, p) => s + p.byteLength, 0);
  result.totalBytes = result.totalRxBytes + result.totalTxBytes;

  // Data rate — bytes received in the last 3 seconds
  const now = Date.now();
  const recent3s = rxPkts.filter((p) => now - p.timestamp.getTime() < 3000);
  const recentBytes = recent3s.reduce((s, p) => s + p.byteLength, 0);
  result.dataRateKbps = recentBytes / 3 / 1024;
  result.packetsPerSec = recent3s.length / 3;

  if (packets.length > 0) {
    const last = packets[packets.length - 1];
    result.lastPacketData = last.data;
    result.lastPacketTime = last.timestamp.toLocaleTimeString([], { hour12: false });
  }

  // Parse each recent RX packet for telemetry fields
  const recentRx = rxPkts.slice(-12); // look at last 12 packets
  for (const pkt of recentRx) {
    const d = pkt.data;

    // STATUS:OK VCC:3.28V TEMP:23.0C
    const vccM = d.match(/VCC:([\d.]+)V/i);
    if (vccM) result.vccV = parseFloat(vccM[1]);

    const tmpM = d.match(/TEMP:([\d.]+)C/i);
    if (tmpM) result.boardTempC = parseFloat(tmpM[1]);

    // RPM:800 CURR:12.4A SOC:78%
    const rpmM = d.match(/^RPM:([\d.]+)/);
    if (rpmM) result.motorRpm = parseFloat(rpmM[1]);

    const currM = d.match(/CURR:([\d.]+)A/i);
    if (currM) result.packCurrentA = parseFloat(currM[1]);

    const socM = d.match(/SOC:([\d.]+)%/i);
    if (socM) result.soc = parseFloat(socM[1]);

    // BMS JSON  {"bms":{"soc":78,"pack_voltage_v":320.1,"pack_current_a":15.0,"pack_temp_c":28.0}}
    if (d.startsWith("{")) {
      try {
        const parsed = JSON.parse(d);
        const bms = parsed.bms;
        if (bms) {
          if (bms.soc != null) result.soc = bms.soc;
          if (bms.pack_voltage_v != null) result.packVoltageV = bms.pack_voltage_v;
          if (bms.pack_current_a != null) result.packCurrentA = bms.pack_current_a;
          if (bms.pack_temp_c != null) result.packTempC = bms.pack_temp_c;
        }
      } catch {}
    }

    // HEARTBEAT:5 UPTIME:15s OK
    const hbM = d.match(/HEARTBEAT:([\d]+)/i);
    if (hbM) result.heartbeat = parseInt(hbM[1]);

    const upM = d.match(/UPTIME:([\d]+)s/i);
    if (upM) result.uptimeSec = parseInt(upM[1]);

    // MOTOR:RPM=1200 TEMP=45C LOAD=40%
    const mRpmM = d.match(/MOTOR:RPM=([\d.]+)/i);
    if (mRpmM) result.motorRpm = parseFloat(mRpmM[1]);

    const mTmpM = d.match(/MOTOR:.*?TEMP=([\d.]+)C/i);
    if (mTmpM) result.motorTempC = parseFloat(mTmpM[1]);

    const mLdM = d.match(/LOAD=([\d.]+)%/i);
    if (mLdM) result.motorLoadPct = parseFloat(mLdM[1]);
  }

  return result;
}

/** Hook: re-parses every 800 ms when packets change */
export function useParsedUsbData(packets: DataPacket[]): ParsedUsbData {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 800);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => parsePackets(packets), [packets, tick]);
}
