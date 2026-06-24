import { useCallback, useEffect, useRef, useState } from "react";
import USBSerialService from "@/USBSerialService";
import { ingestJsonLines } from "@/lib/diagnosisTelemetry";
import {
  CanLogRow,
  CsvLogSessionInfo,
  DEFAULT_RECORD_SIZE,
  buildCsvFromLines,
  isCsvLogAck,
  isCsvLogLine,
  parseCanLogBytes,
  parseCsvLogAck,
  rowToCsvLine,
  base64ToBytes,
} from "@/lib/canCsvLog";

const LIVE_ROWS_MAX = 120;
const CSV_PREVIEW_LINES = 40;
const UI_FLUSH_MS = 500;

export type CapturePhase = "idle" | "running" | "saving";

type SendCommand = (obj: Record<string, unknown>) => Promise<void>;

function hexToString(hex: string): string {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return out;
}

function appendLiveRows(buf: CanLogRow[], rows: CanLogRow[]): void {
  for (let i = 0; i < rows.length; i++) buf.push(rows[i]);
  if (buf.length > LIVE_ROWS_MAX) {
    buf.splice(0, buf.length - LIVE_ROWS_MAX);
  }
}

export function useCanCsvLog(
  isConnected: boolean,
  sendCommand?: SendCommand,
) {
  const [liveRows, setLiveRows] = useState<CanLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [recordedCount, setRecordedCount] = useState(0);
  const [framesPerSec, setFramesPerSec] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [sessionInfo, setSessionInfo] = useState<CsvLogSessionInfo | null>(null);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("idle");
  const [csvPreviewLines, setCsvPreviewLines] = useState<string[]>([]);

  const csvLinesRef = useRef<string[]>([]);
  const previewLinesRef = useRef<string[]>([]);
  const livePendingRef = useRef<CanLogRow[]>([]);
  const isRecordingRef = useRef(false);
  const lineBufRef = useRef("");
  
  // Timestamps:
  // sessionStartRef points to the time the serial connection was established.
  const sessionStartRef = useRef<Date | null>(null);
  // recordingStartWallClockRef points to the wall clock time when the user clicked "Start Recording".
  const recordingStartWallClockRef = useRef<Date | null>(null);
  // recordingStartDeviceTimeRef points to the device-side timeMs of the first frame received during the recording.
  const recordingStartDeviceTimeRef = useRef<number | null>(null);

  const recordSizeRef = useRef(DEFAULT_RECORD_SIZE);
  const nextIndexRef = useRef(0);
  const fpsCountRef = useRef(0);
  const fpsWindowStartRef = useRef(Date.now());
  const uiDirtyRef = useRef(false);

  const reset = useCallback(() => {
    csvLinesRef.current = [];
    previewLinesRef.current = [];
    livePendingRef.current = [];
    lineBufRef.current = "";
    setLiveRows([]);
    setTotalCount(0);
    setRecordedCount(0);
    setFramesPerSec(0);
    setCapturePhase("idle");
    setCsvPreviewLines([]);
    setIsStreaming(false);
    setSessionStart(null);
    setSessionInfo(null);
    sessionStartRef.current = null;
    recordingStartWallClockRef.current = null;
    recordingStartDeviceTimeRef.current = null;
    recordSizeRef.current = DEFAULT_RECORD_SIZE;
    nextIndexRef.current = 0;
    fpsCountRef.current = 0;
    fpsWindowStartRef.current = Date.now();
    uiDirtyRef.current = false;
    isRecordingRef.current = false;
  }, []);

  const startRecording = useCallback(() => {
    csvLinesRef.current = [];
    previewLinesRef.current = [];
    setCsvPreviewLines([]);
    setRecordedCount(0);
    recordingStartWallClockRef.current = new Date();
    recordingStartDeviceTimeRef.current = null;
    isRecordingRef.current = true;
    setCapturePhase("running");
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setCapturePhase("idle");
  }, []);

  const markSaving = useCallback((on: boolean) => {
    setCapturePhase(on ? "saving" : "running");
  }, []);

  const getCurrentCsv = useCallback(() => {
    return buildCsvFromLines(csvLinesRef.current);
  }, []);

  const getRecordedCount = useCallback(() => {
    return csvLinesRef.current.length;
  }, []);

  const flushUi = useCallback(() => {
    if (!uiDirtyRef.current) return;
    uiDirtyRef.current = false;

    if (livePendingRef.current.length > 0) {
      setLiveRows([...livePendingRef.current]);
    }
    setTotalCount(nextIndexRef.current);
    setRecordedCount(csvLinesRef.current.length);
    setCsvPreviewLines([...previewLinesRef.current]);

    const elapsed = Date.now() - fpsWindowStartRef.current;
    if (elapsed >= 500) {
      const fps = Math.round((fpsCountRef.current * 1000) / elapsed);
      setFramesPerSec(fps);
      fpsCountRef.current = 0;
      fpsWindowStartRef.current = Date.now();
    }
  }, []);

  const beginSession = useCallback((info: CsvLogSessionInfo) => {
    const now = new Date();
    sessionStartRef.current = now;
    recordSizeRef.current = info.recordSize;
    nextIndexRef.current = 0;
    fpsCountRef.current = 0;
    fpsWindowStartRef.current = Date.now();
    csvLinesRef.current = [];
    previewLinesRef.current = [];
    livePendingRef.current = [];
    lineBufRef.current = "";
    setCsvPreviewLines([]);
    setSessionStart(now);
    setSessionInfo(info);
    setIsStreaming(true);
    // Note: We do NOT start recording automatically on session ack.
    // The user will click "Start Recording" explicitly.
    setCapturePhase("idle");
    isRecordingRef.current = false;
  }, []);

  const ingestLogB64 = useCallback((b64: string) => {
    if (!sessionStartRef.current) return;

    const bytes = base64ToBytes(b64);
    const { rows, nextIndex } = parseCanLogBytes(
      bytes,
      recordSizeRef.current,
      nextIndexRef.current,
    );
    if (!rows.length) return;

    nextIndexRef.current = nextIndex;
    fpsCountRef.current += rows.length;

    // Check if recording is currently active
    if (isRecordingRef.current) {
      // Initialize the device-side starting timestamp for the recording if not already set
      if (recordingStartDeviceTimeRef.current === null && rows.length > 0) {
        recordingStartDeviceTimeRef.current = rows[0].timeMs;
      }

      const startDeviceTime = recordingStartDeviceTimeRef.current ?? 0;
      const startWallClock = recordingStartWallClockRef.current ?? new Date();
      const buf = csvLinesRef.current;

      for (let i = 0; i < rows.length; i++) {
        // Compute elapsed milliseconds relative to the start of this recording
        const elapsedMs = Math.max(0, rows[i].timeMs - startDeviceTime);
        
        // Clone and adjust the row to have the relative time offset
        const adjustedRow = {
          ...rows[i],
          timeMs: elapsedMs,
        };

        const line = rowToCsvLine(adjustedRow, startWallClock);
        buf.push(line);
        previewLinesRef.current.push(line);
        if (previewLinesRef.current.length > CSV_PREVIEW_LINES) {
          previewLinesRef.current.splice(
            0,
            previewLinesRef.current.length - CSV_PREVIEW_LINES,
          );
        }
      }
    }

    appendLiveRows(livePendingRef.current, rows);
    uiDirtyRef.current = true;
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    const uiId = setInterval(flushUi, UI_FLUSH_MS);
    return () => clearInterval(uiId);
  }, [isConnected, flushUi]);

  useEffect(() => {
    if (!isConnected) {
      reset();
      return;
    }

    const unsub = USBSerialService.onData((hexData) => {
      const chunk = hexToString(hexData);
      if (!chunk) return;

      const { buffer, objects } = ingestJsonLines(lineBufRef.current, chunk);
      lineBufRef.current = buffer;
      if (!objects.length) return;

      for (const obj of objects) {
        if (isCsvLogAck(obj)) {
          beginSession(parseCsvLogAck(obj));
          continue;
        }
        if (isCsvLogLine(obj)) {
          ingestLogB64(obj.log as string);
        }
      }
    });

    return unsub;
  }, [isConnected, reset, beginSession, ingestLogB64]);

  return {
    liveRows,
    totalCount,
    recordedCount,
    framesPerSec,
    isStreaming,
    sessionStart,
    sessionInfo,
    capturePhase,
    csvPreviewLines,
    markSaving,
    getCurrentCsv,
    getRecordedCount,
    startRecording,
    stopRecording,
    reset,
  };
}
