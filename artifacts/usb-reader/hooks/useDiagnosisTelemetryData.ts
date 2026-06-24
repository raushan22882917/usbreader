import { useCallback, useEffect, useRef, useState } from "react";
import USBSerialService from "@/USBSerialService";
import {
  ingestJsonLines,
  isDiagnosisAck,
  isDiagnosisTelemetry,
} from "@/lib/diagnosisTelemetry";
import {
  base64ToBytes,
  DEFAULT_RECORD_SIZE,
  isCsvLogAck,
  isCsvLogLine,
  parseCanLogFrames,
  parseCsvLogAck,
} from "@/lib/canCsvLog";
import {
  DIAGNOSIS_DECODE_DEFAULTS,
  DiagnosisDecodeState,
  parseDiagnosisCanFrame,
} from "@/lib/diagnosisCanDecode";
import {
  PARSED_USB_DEFAULTS,
  ParsedUsbData,
  parsedFromDiagnosisDecodeState,
  parsedFromTelemetryJson,
  telemetryJsonFromDecodeState,
} from "@/hooks/useParsedUsbData";

export type { ParsedUsbData };

const UI_FLUSH_MS = 250;

function hexToString(hex: string): string {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return out;
}

function freshDecodeState(): DiagnosisDecodeState {
  return {
    ...DIAGNOSIS_DECODE_DEFAULTS,
    cellV: [...DIAGNOSIS_DECODE_DEFAULTS.cellV],
    cellT: [...DIAGNOSIS_DECODE_DEFAULTS.cellT],
  };
}

/**
 * Listens to USB RX directly. Accepts diagnosis JSON or csvlog CAN frames.
 * Updates UI when new telemetry arrives (JSON `ts` or decoded CAN batch).
 */
export function useDiagnosisTelemetryData(isConnected: boolean) {
  const [p, setP] = useState<ParsedUsbData>(PARSED_USB_DEFAULTS);
  const [diagnosisAck, setDiagnosisAck] = useState(false);
  const [csvLogAck, setCsvLogAck] = useState(false);
  const [rawTelemetry, setRawTelemetry] = useState<Record<string, unknown> | null>(null);

  const lastTsRef = useRef<number | null>(null);
  const lineBufRef = useRef("");
  const pendingRef = useRef<ParsedUsbData | null>(null);
  const pendingRawRef = useRef<Record<string, unknown> | null>(null);
  const flushScheduledRef = useRef(false);
  const decodeStateRef = useRef<DiagnosisDecodeState>(freshDecodeState());
  const recordSizeRef = useRef(DEFAULT_RECORD_SIZE);
  const csvSessionActiveRef = useRef(false);
  const lastUiFlushRef = useRef(0);

  const scheduleFlush = useCallback(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    setTimeout(() => {
      flushScheduledRef.current = false;
      const next = pendingRef.current;
      const nextRaw = pendingRawRef.current;
      if (next) {
        pendingRef.current = null;
        setP(next);
      }
      if (nextRaw) {
        pendingRawRef.current = null;
        setRawTelemetry(nextRaw);
      }
    }, 0);
  }, []);

  const queueDecodedUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUiFlushRef.current < UI_FLUSH_MS) return;
    lastUiFlushRef.current = now;
    lastTsRef.current = now;

    const state = decodeStateRef.current;
    pendingRef.current = parsedFromDiagnosisDecodeState(state, now);
    pendingRawRef.current = telemetryJsonFromDecodeState(state, now);
    scheduleFlush();
  }, [scheduleFlush]);

  const ingestCanLogB64 = useCallback(
    (b64: string) => {
      if (!csvSessionActiveRef.current) return;

      const frames = parseCanLogFrames(
        base64ToBytes(b64),
        recordSizeRef.current,
      );
      if (!frames.length) return;

      const state = decodeStateRef.current;
      for (const frame of frames) {
        if (frame.direction === "Tx") continue;
        parseDiagnosisCanFrame(
          state,
          frame.id,
          frame.extended,
          frame.dlc,
          frame.data,
        );
      }
      queueDecodedUpdate();
    },
    [queueDecodedUpdate],
  );

  useEffect(() => {
    if (!isConnected) {
      lastTsRef.current = null;
      lineBufRef.current = "";
      pendingRef.current = null;
      pendingRawRef.current = null;
      flushScheduledRef.current = false;
      csvSessionActiveRef.current = false;
      lastUiFlushRef.current = 0;
      decodeStateRef.current = freshDecodeState();
      recordSizeRef.current = DEFAULT_RECORD_SIZE;
      setDiagnosisAck(false);
      setCsvLogAck(false);
      setRawTelemetry(null);
      setP(PARSED_USB_DEFAULTS);
      return;
    }

    const unsub = USBSerialService.onData((hexData) => {
      const chunk = hexToString(hexData);
      if (!chunk) return;

      const { buffer, objects } = ingestJsonLines(lineBufRef.current, chunk);
      lineBufRef.current = buffer;
      if (!objects.length) return;

      let diagAck = false;
      let csvAck = false;
      let latestRaw: Record<string, unknown> | null = null;
      let latestParsed: ParsedUsbData | null = null;

      for (const obj of objects) {
        if (isCsvLogAck(obj)) {
          csvAck = true;
          const info = parseCsvLogAck(obj);
          recordSizeRef.current = info.recordSize;
          csvSessionActiveRef.current = true;
          decodeStateRef.current = freshDecodeState();
          lastTsRef.current = null;
          continue;
        }
        if (isCsvLogLine(obj)) {
          ingestCanLogB64(obj.log as string);
          continue;
        }
        if (isDiagnosisAck(obj)) {
          diagAck = true;
          continue;
        }
        if (!isDiagnosisTelemetry(obj)) continue;
        const ts = obj.ts as number;
        if (typeof ts !== "number" || ts === lastTsRef.current) continue;
        lastTsRef.current = ts;
        latestRaw = obj;
        latestParsed = parsedFromTelemetryJson(obj);
      }

      if (csvAck) setCsvLogAck(true);
      if (diagAck) setDiagnosisAck(true);
      if (latestRaw) setRawTelemetry(latestRaw);
      if (latestParsed) {
        pendingRef.current = latestParsed;
        scheduleFlush();
      }
    });

    return unsub;
  }, [isConnected, scheduleFlush, ingestCanLogB64]);

  const resetTs = useCallback(() => {
    lastTsRef.current = null;
  }, []);

  const resetTelemetry = useCallback(() => {
    lastTsRef.current = null;
    lineBufRef.current = "";
    pendingRef.current = null;
    pendingRawRef.current = null;
    flushScheduledRef.current = false;
    csvSessionActiveRef.current = false;
    lastUiFlushRef.current = 0;
    decodeStateRef.current = freshDecodeState();
    recordSizeRef.current = DEFAULT_RECORD_SIZE;
    setDiagnosisAck(false);
    setCsvLogAck(false);
    setRawTelemetry(null);
    setP(PARSED_USB_DEFAULTS);
  }, []);

  return {
    p,
    rawTelemetry,
    diagnosisAck,
    csvLogAck,
    lastTs: lastTsRef.current,
    resetTs,
    resetTelemetry,
  };
}
