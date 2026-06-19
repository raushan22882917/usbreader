import { useCallback, useEffect, useRef, useState } from "react";
import USBSerialService from "@/USBSerialService";
import {
  CanLogRow,
  CsvLogSessionInfo,
  DEFAULT_RECORD_SIZE,
  CSV_HEADERS,
  buildCsvFromLines,
  extractJsonObjects,
  isCsvLogAck,
  isCsvLogLine,
  parseCanLogBytes,
  parseCsvLogAck,
  rowToCsvLine,
  base64ToBytes,
} from "@/lib/canCsvLog";

const RX_STREAM_MAX = 262144;
const LIVE_ROWS_MAX = 120;
const CSV_PREVIEW_LINES = 80;
/** ~25 min @ 163 fps; oldest rows dropped when full */
const MAX_CSV_LINES = 250_000;
const UI_FLUSH_MS = 300;

export const CAPTURE_DURATION_SEC = 30;
export type CapturePhase = "idle" | "running" | "stopped" | "saving";

function hexToString(hex: string): string {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  }
  return out;
}

function trimCsvBuffer(lines: string[], max: number): void {
  if (lines.length <= max) return;
  const drop = lines.length - max;
  lines.splice(0, drop);
}

export function useCanCsvLog(isConnected: boolean) {
  const [liveRows, setLiveRows] = useState<CanLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [recordedCount, setRecordedCount] = useState(0);
  const [framesPerSec, setFramesPerSec] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [sessionInfo, setSessionInfo] = useState<CsvLogSessionInfo | null>(null);
  const [bufferTrimmed, setBufferTrimmed] = useState(0);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(CAPTURE_DURATION_SEC);
  const [csvPreviewLines, setCsvPreviewLines] = useState<string[]>([]);

  const csvLinesRef = useRef<string[]>([]);
  const captureEndsAtRef = useRef<number | null>(null);
  const livePendingRef = useRef<CanLogRow[]>([]);
  const isRecordingRef = useRef(true);
  const rxStreamRef = useRef("");
  const sessionStartRef = useRef<Date | null>(null);
  const recordSizeRef = useRef(DEFAULT_RECORD_SIZE);
  const nextIndexRef = useRef(0);
  const fpsCountRef = useRef(0);
  const fpsWindowStartRef = useRef(Date.now());
  const uiDirtyRef = useRef(false);

  const reset = useCallback(() => {
    csvLinesRef.current = [];
    livePendingRef.current = [];
    setLiveRows([]);
    setTotalCount(0);
    setRecordedCount(0);
    setFramesPerSec(0);
    setBufferTrimmed(0);
    setCapturePhase("idle");
    setSecondsLeft(CAPTURE_DURATION_SEC);
    setCsvPreviewLines([]);
    captureEndsAtRef.current = null;
    setIsStreaming(false);
    setSessionStart(null);
    setSessionInfo(null);
    sessionStartRef.current = null;
    recordSizeRef.current = DEFAULT_RECORD_SIZE;
    nextIndexRef.current = 0;
    fpsCountRef.current = 0;
    fpsWindowStartRef.current = Date.now();
    rxStreamRef.current = "";
    uiDirtyRef.current = false;
  }, []);

  const setRecording = useCallback((on: boolean) => {
    isRecordingRef.current = on;
    if (!on) {
      setCapturePhase((p) => (p === "running" ? "stopped" : p));
    }
  }, []);

  const startCaptureWindow = useCallback(() => {
    isRecordingRef.current = true;
    captureEndsAtRef.current = Date.now() + CAPTURE_DURATION_SEC * 1000;
    setCapturePhase("running");
    setSecondsLeft(CAPTURE_DURATION_SEC);
  }, []);

  const stopCapture = useCallback(() => {
    isRecordingRef.current = false;
    captureEndsAtRef.current = null;
    setCapturePhase((p) => (p === "saving" ? "saving" : "stopped"));
  }, []);

  const markSaving = useCallback(() => {
    setCapturePhase("saving");
  }, []);

  const getCsvForExport = useCallback((): string => {
    return buildCsvFromLines(csvLinesRef.current);
  }, []);

  const getExportLineCount = useCallback(() => csvLinesRef.current.length, []);

  const flushUi = useCallback(() => {
    if (!uiDirtyRef.current) return;
    uiDirtyRef.current = false;

    if (livePendingRef.current.length > 0) {
      setLiveRows([...livePendingRef.current]);
    }
    setTotalCount(nextIndexRef.current);
    const bufLen = csvLinesRef.current.length;
    setRecordedCount(bufLen);

    const tail = csvLinesRef.current;
    const previewStart = Math.max(0, tail.length - CSV_PREVIEW_LINES);
    setCsvPreviewLines(tail.slice(previewStart));

    const elapsed = Date.now() - fpsWindowStartRef.current;
    if (elapsed >= 500) {
      const fps = Math.round((fpsCountRef.current * 1000) / elapsed);
      setFramesPerSec(fps);
      fpsCountRef.current = 0;
      fpsWindowStartRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (!isConnected || capturePhase !== "running") return;

    const tick = () => {
      const end = captureEndsAtRef.current;
      if (!end) return;
      const left = Math.ceil((end - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) {
        stopCapture();
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [isConnected, capturePhase, stopCapture]);

  const beginSession = useCallback((info: CsvLogSessionInfo) => {
    const now = new Date();
    sessionStartRef.current = now;
    recordSizeRef.current = info.recordSize;
    nextIndexRef.current = 0;
    fpsCountRef.current = 0;
    fpsWindowStartRef.current = Date.now();
    csvLinesRef.current = [];
    livePendingRef.current = [];
    setCsvPreviewLines([]);
    setSessionStart(now);
    setSessionInfo(info);
    setIsStreaming(true);
    startCaptureWindow();
  }, [startCaptureWindow]);

  const ingestLogB64 = useCallback(
    (b64: string) => {
      if (!sessionStartRef.current) {
        beginSession({
          recordSize: recordSizeRef.current,
          mode: "csvlog",
          fmt: "b64bin",
        });
      }

      const bytes = base64ToBytes(b64);
      const { rows, nextIndex } = parseCanLogBytes(
        bytes,
        recordSizeRef.current,
        nextIndexRef.current,
      );
      if (!rows.length) return;

      nextIndexRef.current = nextIndex;
      fpsCountRef.current += rows.length;

      const start = sessionStartRef.current!;
      if (isRecordingRef.current) {
        const buf = csvLinesRef.current;
        for (let i = 0; i < rows.length; i++) {
          buf.push(rowToCsvLine(rows[i], start));
        }
        if (buf.length > MAX_CSV_LINES) {
          const drop = buf.length - MAX_CSV_LINES;
          buf.splice(0, drop);
          setBufferTrimmed((t) => t + drop);
        }
      }

      livePendingRef.current = [
        ...livePendingRef.current,
        ...rows,
      ].slice(-LIVE_ROWS_MAX);

      uiDirtyRef.current = true;
    },
    [beginSession],
  );

  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(flushUi, UI_FLUSH_MS);
    return () => clearInterval(id);
  }, [isConnected, flushUi]);

  useEffect(() => {
    if (!isConnected) {
      reset();
      return;
    }

    const unsub = USBSerialService.onData((hexData) => {
      const chunk = hexToString(hexData);
      if (!chunk) return;

      rxStreamRef.current += chunk;
      if (rxStreamRef.current.length > RX_STREAM_MAX) {
        rxStreamRef.current = rxStreamRef.current.slice(-RX_STREAM_MAX);
      }

      const objs = extractJsonObjects(rxStreamRef.current);
      for (const obj of objs) {
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

  const getCsvPreviewText = useCallback(() => {
    const lines = csvLinesRef.current;
    if (!lines.length) {
      return CSV_HEADERS.join(",") + "\n(waiting for frames…)";
    }
    const tail = lines.slice(-CSV_PREVIEW_LINES);
    return [CSV_HEADERS.join(","), ...tail].join("\n");
  }, []);

  return {
    liveRows,
    totalCount,
    recordedCount,
    framesPerSec,
    bufferTrimmed,
    isStreaming,
    sessionStart,
    sessionInfo,
    capturePhase,
    secondsLeft,
    csvPreviewLines,
    setRecording,
    startCaptureWindow,
    stopCapture,
    markSaving,
    getCsvForExport,
    getExportLineCount,
    getCsvPreviewText,
    reset,
    beginSession,
  };
}
