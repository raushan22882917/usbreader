import {
  base64ToBytes,
  parseCanLogBytes,
  rowsToCsv,
  buildCsvFromLines,
  formatCanId,
  DEFAULT_RECORD_SIZE,
  isCsvLogAck,
  isCsvLogLine,
  parseCsvLogAck,
} from "../lib/canCsvLog";

function putU32LE(buf: Uint8Array, off: number, v: number) {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
  buf[off + 2] = (v >> 16) & 0xff;
  buf[off + 3] = (v >> 24) & 0xff;
}

function makeRecord18(
  timeMs: number,
  id: number,
  dlc: number,
  flags: number,
  data: number[],
): Uint8Array {
  const rec = new Uint8Array(18);
  putU32LE(rec, 0, timeMs);
  putU32LE(rec, 4, id);
  rec[8] = flags;
  rec[9] = dlc;
  for (let i = 0; i < data.length && i < 8; i++) rec[10 + i] = data[i];
  return rec;
}

describe("canCsvLog", () => {
  it("detects csvlog ack and log lines", () => {
    expect(
      isCsvLogAck({
        status: "ok",
        mode: "csvlog",
        record_size: 18,
        fmt: "b64bin",
      }),
    ).toBe(true);
    expect(isCsvLogLine({ log: "AQID" })).toBe(true);
    expect(parseCsvLogAck({ status: "ok", mode: "csvlog", record_size: 18, fmt: "b64bin" }).recordSize).toBe(18);
  });

  it("formats standard and extended IDs", () => {
    expect(formatCanId(0x69, false)).toBe("0x00000069");
    expect(formatCanId(0x18a10002, true)).toBe("0x18A10002");
  });

  it("parses 18-byte records", () => {
    const r0 = makeRecord18(765, 0x69, 1, 0x00, [0x69]);
    const r1 = makeRecord18(
      799,
      0x0ab12345,
      8,
      0x01,
      [0x4c, 0, 0, 0, 0, 0, 0, 0],
    );
    const bytes = new Uint8Array(36);
    bytes.set(r0, 0);
    bytes.set(r1, 18);
    const { rows, nextIndex } = parseCanLogBytes(bytes, DEFAULT_RECORD_SIZE, 0);
    expect(rows).toHaveLength(2);
    expect(nextIndex).toBe(2);
    expect(rows[0].index).toBe(0);
    expect(rows[0].direction).toBe("Rx");
    expect(rows[0].type).toBe("Standard");
    expect(rows[0].length).toBe(1);
    expect(rows[0].dataHex).toBe("69 00 00 00 00 00 00 00");
    expect(rows[1].type).toBe("Extend");
    expect(rows[1].length).toBe(8);
    expect(rows[1].dataHex).toBe("4c 00 00 00 00 00 00 00");
  });

  it("builds CSV with expected headers", () => {
    const session = new Date("2026-05-27T13:10:36.000Z");
    const { rows } = parseCanLogBytes(
      makeRecord18(0, 0x69, 1, 0, [0x69]),
      18,
      0,
    );
    const csv = rowsToCsv(rows, session);
    expect(csv.split("\n")[0]).toBe(
      "Index,Direction,Time,Alias,Id(Align Right),Format,Type,Length,Data(HEX)",
    );
    expect(csv).toContain("0x00000069");
  });

  it("buildCsvFromLines joins buffered rows", () => {
    const csv = buildCsvFromLines(["0,Rx,00:00:00:000,,0x1,Data,Standard,8,aa bb"]);
    expect(csv.split("\n").length).toBe(2);
  });

  it("round-trips base64", () => {
    const raw = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const b64 = Buffer.from(raw).toString("base64");
    expect(Array.from(base64ToBytes(b64))).toEqual([0, 1, 2, 3]);
  });
});
