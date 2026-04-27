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

  // Board supply
  vccV: number;
  boardTempC: number;

  // Motor
  motorRpm: number;
  motorTempC: number;
  motorLoadPct: number;

  // DC-DC converter
  dcdcVoltV: number;
  dcdcCurrentA: number;
  dcdcTempC: number;

  // Charger
  chrgrStatus: string;
  chrgrVoltV: number;
  chrgrCurrentA: number;

  // Relays (true = energised)
  relayMain: boolean;
  relayFan: boolean;
  relayChrg: boolean;
  relayPack: boolean;

  // System
  uptimeSec: number;
  heartbeat: number;

  lastPacketData: string;
  lastPacketTime: string;
}

const DEFAULTS: ParsedUsbData = {
  dataRateKbps: 0, packetsPerSec: 0,
  totalRxBytes: 0, totalTxBytes: 0, totalBytes: 0,
  rxCount: 0, txCount: 0,
  soc: 0, packVoltageV: 0, packCurrentA: 0, packTempC: 0,
  vccV: 0, boardTempC: 0,
  motorRpm: 0, motorTempC: 0, motorLoadPct: 0,
  dcdcVoltV: 0, dcdcCurrentA: 0, dcdcTempC: 0,
  chrgrStatus: "—", chrgrVoltV: 0, chrgrCurrentA: 0,
  relayMain: false, relayFan: false, relayChrg: false, relayPack: false,
  uptimeSec: 0, heartbeat: 0,
  lastPacketData: "", lastPacketTime: "",
};

function parsePackets(packets: DataPacket[]): ParsedUsbData {
  const r = { ...DEFAULTS };
  const rxPkts = packets.filter((p) => p.direction === "read");
  const txPkts = packets.filter((p) => p.direction === "write");

  r.rxCount = rxPkts.length;
  r.txCount = txPkts.length;
  r.totalRxBytes = rxPkts.reduce((s, p) => s + p.byteLength, 0);
  r.totalTxBytes = txPkts.reduce((s, p) => s + p.byteLength, 0);
  r.totalBytes = r.totalRxBytes + r.totalTxBytes;

  const now = Date.now();
  const recent3s = rxPkts.filter((p) => now - p.timestamp.getTime() < 3000);
  r.dataRateKbps = recent3s.reduce((s, p) => s + p.byteLength, 0) / 3 / 1024;
  r.packetsPerSec = recent3s.length / 3;

  if (packets.length > 0) {
    const last = packets[packets.length - 1];
    r.lastPacketData = last.data;
    r.lastPacketTime = last.timestamp.toLocaleTimeString([], { hour12: false });
  }

  for (const pkt of rxPkts.slice(-16)) {
    const d = pkt.data;

    // STATUS:OK VCC:3.28V TEMP:23.0C
    const vccM = d.match(/VCC:([\d.]+)V/i);
    if (vccM) r.vccV = parseFloat(vccM[1]);
    const tmpM = d.match(/TEMP:([\d.]+)C/i);
    if (tmpM) r.boardTempC = parseFloat(tmpM[1]);

    // RPM:800 CURR:12.4A SOC:78%
    const rpmM = d.match(/^RPM:([\d.]+)/);
    if (rpmM) r.motorRpm = parseFloat(rpmM[1]);
    const currM = d.match(/CURR:([\d.]+)A/i);
    if (currM) r.packCurrentA = parseFloat(currM[1]);
    const socM = d.match(/SOC:([\d.]+)%/i);
    if (socM) r.soc = parseFloat(socM[1]);

    // BMS JSON
    if (d.startsWith("{")) {
      try {
        const bms = JSON.parse(d).bms;
        if (bms) {
          if (bms.soc != null) r.soc = bms.soc;
          if (bms.pack_voltage_v != null) r.packVoltageV = bms.pack_voltage_v;
          if (bms.pack_current_a != null) r.packCurrentA = bms.pack_current_a;
          if (bms.pack_temp_c != null) r.packTempC = bms.pack_temp_c;
        }
      } catch {}
    }

    // HEARTBEAT / UPTIME
    const hbM = d.match(/HEARTBEAT:([\d]+)/i);
    if (hbM) r.heartbeat = parseInt(hbM[1]);
    const upM = d.match(/UPTIME:([\d]+)s/i);
    if (upM) r.uptimeSec = parseInt(upM[1]);

    // MOTOR:RPM=1200 TEMP=45C LOAD=40%
    const mRpmM = d.match(/MOTOR:RPM=([\d.]+)/i);
    if (mRpmM) r.motorRpm = parseFloat(mRpmM[1]);
    const mTmpM = d.match(/MOTOR:.*?TEMP=([\d.]+)C/i);
    if (mTmpM) r.motorTempC = parseFloat(mTmpM[1]);
    const mLdM = d.match(/LOAD=([\d.]+)%/i);
    if (mLdM) r.motorLoadPct = parseFloat(mLdM[1]);

    // DCDC:VOLT=12.8V CURR=2.1A TEMP=38C
    const dcV = d.match(/DCDC:VOLT=([\d.]+)V/i);
    if (dcV) r.dcdcVoltV = parseFloat(dcV[1]);
    const dcC = d.match(/DCDC:.*?CURR=([\d.]+)A/i);
    if (dcC) r.dcdcCurrentA = parseFloat(dcC[1]);
    const dcT = d.match(/DCDC:.*?TEMP=([\d.]+)C/i);
    if (dcT) r.dcdcTempC = parseFloat(dcT[1]);

    // RELAY:MAIN=1 FAN=0 CHRG=0 PACK=1
    const rMain = d.match(/RELAY:.*?MAIN=([01])/i);
    if (rMain) r.relayMain = rMain[1] === "1";
    const rFan = d.match(/FAN=([01])/i);
    if (rFan) r.relayFan = rFan[1] === "1";
    const rChrg = d.match(/CHRG=([01])/i);
    if (rChrg) r.relayChrg = rChrg[1] === "1";
    const rPack = d.match(/PACK=([01])/i);
    if (rPack) r.relayPack = rPack[1] === "1";

    // CHRG:STATUS=Idle VOLT=0.0V CURR=0.0A
    const csM = d.match(/CHRG:STATUS=([^\s]+)/i);
    if (csM) r.chrgrStatus = csM[1];
    const cvM = d.match(/CHRG:.*?VOLT=([\d.]+)V/i);
    if (cvM) r.chrgrVoltV = parseFloat(cvM[1]);
    const ccM = d.match(/CHRG:.*?CURR=([\d.]+)A/i);
    if (ccM) r.chrgrCurrentA = parseFloat(ccM[1]);
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
