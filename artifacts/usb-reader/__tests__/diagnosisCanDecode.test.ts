import {
  coerceBytesToDecimal,
  parseDiagnosisCanFrame,
  DIAGNOSIS_DECODE_DEFAULTS,
} from "../lib/diagnosisCanDecode";

describe("diagnosisCanDecode", () => {
  it("coerces scaled numbers from raw byte pairs", () => {
    expect(coerceBytesToDecimal(48.5, "u16be_div100")).toBe(48.5);
    expect(coerceBytesToDecimal([0x13, 0x88], "u16be_div100")).toBeCloseTo(50.0);
    expect(coerceBytesToDecimal([0x01, 0xf4], "s16be_div100")).toBeCloseTo(5.0);
    expect(coerceBytesToDecimal([0x01, 0x2c], "s16be_div10")).toBeCloseTo(30.0);
    expect(coerceBytesToDecimal([0x64], "u8")).toBe(100);
  });

  it("parses pack voltage/current CAN frame", () => {
    const state = { ...DIAGNOSIS_DECODE_DEFAULTS, cellV: [...DIAGNOSIS_DECODE_DEFAULTS.cellV], cellT: [...DIAGNOSIS_DECODE_DEFAULTS.cellT] };
    // 50.00 V, 5.00 A
    const data = new Uint8Array([0x13, 0x88, 0x01, 0xf4, 0, 0, 0, 0]);
    parseDiagnosisCanFrame(state, 0x18a11b02, true, 4, data);
    expect(state.packVoltageV).toBeCloseTo(50.0);
    expect(state.packCurrentA).toBeCloseTo(5.0);
  });

  it("parses dcdc2 status frame", () => {
    const state = { ...DIAGNOSIS_DECODE_DEFAULTS, cellV: [...DIAGNOSIS_DECODE_DEFAULTS.cellV], cellT: [...DIAGNOSIS_DECODE_DEFAULTS.cellT] };
    const data = new Uint8Array([0x0a, 0x50, 0x64, 0x00, 0x32, 0x00, 0x03, 0x07]);
    parseDiagnosisCanFrame(state, 0x18f8622b, true, 8, data);
    expect(state.dcdc2TempC).toBe(40); // 0x50 - 40
    expect(state.dcdc2VoltageV).toBeCloseTo(5.0); // 100 * 0.05
    expect(state.dcdc2CurrentA).toBeCloseTo(2.5); // 50 * 0.05
    expect(state.dcdc2ErrFlags).toBe(3);
    expect(state.dcdc2Version).toBe(7);
  });
});
