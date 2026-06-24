/**
 * CAN CSV log — ESP32 csvlog protocol (b64bin, 18 bytes/record):
 *
 *   Android → {"cmd":"csv"}
 *   ESP32   → {"status":"ok","mode":"csvlog","record_size":18,"fmt":"b64bin"}
 *   ESP32   → {"log":"<base64>"}  every ~100ms while csvlog mode is active
 *
 * Android buffers CSV rows in memory during the session.
 * Tap Download CSV to export all captured rows so far.
 *
 * Record layout (little-endian, record_size=18):
 *   [0..3]   time_ms since session start
 *   [4..7]   CAN id
 *   [8]      flags: bit0=extended, bit1=remote, bit2=tx (1=Tx, 0=Rx)
 *   [9]      dlc (0–8)
 *   [10..17] data bytes (always 8 bytes in export; valid count = dlc)
 */

export const DEFAULT_RECORD_SIZE = 18;

export const CSV_HEADERS = [
  "Index",
  "Direction",
  "Time",
  "Alias",
  "Id(Align Right)",
  "Format",
  "Type",
  "Length",
  "Data(HEX)",
] as const;

export interface CanLogRow {
  index: number;
  direction: "Rx" | "Tx";
  timeMs: number;
  alias: string;
  idHex: string;
  format: string;
  type: "Standard" | "Extend";
  length: number;
  dataHex: string;
}

export interface CsvLogSessionInfo {
  recordSize: number;
  mode: string;
  fmt: string;
}

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/[\s=]/g, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const idx = B64_CHARS.indexOf(s[i]);
    if (idx < 0) continue;
    buf = (buf << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function readU32LE(buf: Uint8Array, off: number): number {
  return (
    buf[off] |
    (buf[off + 1] << 8) |
    (buf[off + 2] << 16) |
    (buf[off + 3] << 24)
  ) >>> 0;
}

export function formatCanId(id: number, extended: boolean): string {
  const hex = id.toString(16).toUpperCase();
  return `0x${hex.padStart(8, "0")}`;
}

/** HH:mm:ss:mmm (CANalyzer-style). */
export function formatLogTime(sessionStart: Date, timeMs: number): string {
  const t = new Date(sessionStart.getTime() + timeMs);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const ss = String(t.getSeconds()).padStart(2, "0");
  const ms = String(t.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}:${ms}`;
}

/** Always format 8 CAN data bytes (spreadsheet style). */
export function formatDataHex8(data: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const b = i < data.length ? data[i] : 0;
    parts.push(b.toString(16).padStart(2, "0").toLowerCase());
  }
  return parts.join(" ");
}

function resolveDlcAndFlags(rec: Uint8Array): { dlc: number; flags: number } {
  const b8 = rec[8];
  const b9 = rec[9];
  // Controller: [8]=flags (0–7), [9]=dlc (0–8)
  if (b9 <= 8 && b8 <= 7) {
    return { flags: b8, dlc: b9 };
  }
  // Legacy: [8]=dlc, [9]=flags
  if (b8 <= 8 && b9 <= 7) {
    return { dlc: b8, flags: b9 };
  }
  // Frame-info nibble in byte 8
  const dlcNibble = b8 & 0x0f;
  if (dlcNibble <= 8) {
    return { dlc: dlcNibble, flags: b9 };
  }
  return { dlc: Math.min(8, b9), flags: b8 };
}

export interface CanLogFrame {
  timeMs: number;
  id: number;
  extended: boolean;
  remote: boolean;
  direction: "Rx" | "Tx";
  dlc: number;
  data: Uint8Array;
}

export function parseCanLogFrames(
  bytes: Uint8Array,
  recordSize: number,
): CanLogFrame[] {
  const frames: CanLogFrame[] = [];
  const n = Math.floor(bytes.length / recordSize);

  for (let i = 0; i < n; i++) {
    const off = i * recordSize;
    const rec = bytes.subarray(off, off + recordSize);
    if (rec.length < recordSize) break;

    const timeMs = readU32LE(rec, 0);
    const id = readU32LE(rec, 4);
    const { dlc: rawDlc, flags } = resolveDlcAndFlags(rec);
    const dlc = rawDlc <= 8 ? rawDlc : 8;
    const extended = (flags & 0x01) !== 0;
    const remote = (flags & 0x02) !== 0;
    const direction: "Rx" | "Tx" = (flags & 0x04) !== 0 ? "Tx" : "Rx";
    const data = rec.subarray(10, Math.min(18, recordSize));
    const padded = new Uint8Array(8);
    padded.set(data.subarray(0, 8));

    frames.push({ timeMs, id, extended, remote, direction, dlc, data: padded });
  }

  return frames;
}

export function parseCanLogBytes(
  bytes: Uint8Array,
  recordSize: number,
  startIndex: number,
): { rows: CanLogRow[]; nextIndex: number } {
  const rows: CanLogRow[] = [];
  let idx = startIndex;

  for (const frame of parseCanLogFrames(bytes, recordSize)) {
    rows.push({
      index: idx++,
      direction: frame.direction,
      timeMs: frame.timeMs,
      alias: "",
      idHex: formatCanId(frame.id, frame.extended),
      format: frame.remote ? "Remote" : "Data",
      type: frame.extended ? "Extend" : "Standard",
      length: frame.dlc > 0 ? frame.dlc : 8,
      dataHex: formatDataHex8(frame.data),
    });
  }

  return { rows, nextIndex: idx };
}

function csvEscape(val: string): string {
  if (/[",\n\r]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function rowToCsvLine(row: CanLogRow, sessionStart: Date): string {
  return [
    String(row.index),
    row.direction,
    formatLogTime(sessionStart, row.timeMs),
    row.alias,
    row.idHex,
    row.format,
    row.type,
    String(row.length),
    row.dataHex,
  ]
    .map(csvEscape)
    .join(",");
}

export function rowsToCsv(rows: CanLogRow[], sessionStart: Date): string {
  return buildCsvFromLines(rows.map((r) => rowToCsvLine(r, sessionStart)));
}

/** Join pre-built data lines (high frame-rate logging). Chunks to limit peak memory. */
export function buildCsvFromLines(dataLines: string[]): string {
  if (!dataLines.length) {
    return CSV_HEADERS.join(",") + "\n";
  }
  const CHUNK = 8000;
  let out = CSV_HEADERS.join(",") + "\n";
  for (let i = 0; i < dataLines.length; i += CHUNK) {
    const slice = dataLines.slice(i, i + CHUNK);
    out += slice.join("\n");
    if (i + CHUNK < dataLines.length) out += "\n";
  }
  return out;
}

export function isCsvLogAck(obj: Record<string, unknown>): boolean {
  return (
    obj.status === "ok" &&
    obj.mode === "csvlog" &&
    typeof obj.record_size === "number"
  );
}

export function parseCsvLogAck(obj: Record<string, unknown>): CsvLogSessionInfo {
  return {
    recordSize:
      typeof obj.record_size === "number"
        ? obj.record_size
        : DEFAULT_RECORD_SIZE,
    mode: String(obj.mode ?? "csvlog"),
    fmt: String(obj.fmt ?? "b64bin"),
  };
}

export function isCsvLogLine(obj: Record<string, unknown>): boolean {
  return typeof obj.log === "string" && obj.log.length > 0;
}

export function extractJsonObjects(raw: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
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
          results.push(JSON.parse(raw.slice(start, i + 1)) as Record<string, unknown>);
        } catch {
          // skip malformed
        }
        start = -1;
      }
    }
  }
  return results;
}
