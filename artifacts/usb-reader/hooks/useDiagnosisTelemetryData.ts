import { useCallback, useEffect, useRef, useState } from "react";
import { DataPacket } from "@/context/UsbContext";
import USBSerialService from "@/USBSerialService";
import {
  extractJsonObjects,
  isDiagnosisTelemetry,
} from "@/lib/diagnosisTelemetry";
import {
  PARSED_USB_DEFAULTS,
  ParsedUsbData,
  parsedFromTelemetryJson,
} from "@/hooks/useParsedUsbData";

export type { ParsedUsbData };

const RX_STREAM_MAX = 20480;
const RX_CHUNK_WINDOW = 32;

function hexToString(hex: string): string {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return out;
}

/**
 * Listens to USB RX directly. Updates UI only when BMS sends a new `ts`
 * (new telemetry frame). Avoids re-rendering on every duplicate USB packet.
 */
export function useDiagnosisTelemetryData(isConnected: boolean) {
  const [p, setP] = useState<ParsedUsbData>(PARSED_USB_DEFAULTS);
  const lastTsRef = useRef<number | null>(null);
  const rxStreamRef = useRef("");
  const packetsRef = useRef<DataPacket[]>([]);

  useEffect(() => {
    if (!isConnected) {
      lastTsRef.current = null;
      rxStreamRef.current = "";
      packetsRef.current = [];
      setP(PARSED_USB_DEFAULTS);
      return;
    }

    const unsub = USBSerialService.onData((hexData) => {
      const chunk = hexToString(hexData);
      if (!chunk) return;

      rxStreamRef.current += chunk;
      if (rxStreamRef.current.length > RX_STREAM_MAX) {
        rxStreamRef.current = rxStreamRef.current.slice(-RX_STREAM_MAX);
      }

      packetsRef.current = [
        ...packetsRef.current,
        {
          id: String(Date.now()),
          timestamp: new Date(),
          direction: "read",
          data: chunk,
          hexView: hexData,
          byteLength: chunk.length,
          deviceId: "diag",
        },
      ].slice(-RX_CHUNK_WINDOW);

      const objs = extractJsonObjects(rxStreamRef.current);
      for (let i = objs.length - 1; i >= 0; i--) {
        if (!isDiagnosisTelemetry(objs[i])) continue;
        const ts = objs[i].ts as number;
        if (ts === lastTsRef.current) return;
        lastTsRef.current = ts;
        setP(parsedFromTelemetryJson(objs[i]));
        return;
      }
    });

    return unsub;
  }, [isConnected]);

  const resetTs = useCallback(() => {
    lastTsRef.current = null;
  }, []);

  const resetTelemetry = useCallback(() => {
    lastTsRef.current = null;
    rxStreamRef.current = "";
    packetsRef.current = [];
    setP(PARSED_USB_DEFAULTS);
  }, []);

  return { p, packetsRef, lastTs: lastTsRef.current, resetTs, resetTelemetry };
}
