/**
 * BMS diagnosis telemetry JSON — streamed over USB CDC, e.g.:
 * { bms, cells, hv, relays, dcdc, charger, motor, evcc, ts }
 */

const BMS_FAULT_KEYS = ["UV", "OV", "OTC", "UTC", "OCD1", "OCD2", "SC", "ISO"] as const;
const RELAY_KEYS = ["DSG+", "PCHG+", "FC+", "SC+", "DC-DC+", "OUT-", "NEG_ENB", "POS_ENB"] as const;

function isNum(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}
function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNumArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === "number" && !Number.isNaN(x));
}

export function isDiagnosisTelemetry(obj: unknown): obj is Record<string, unknown> {
  return !!obj && typeof obj === "object" && !Array.isArray(obj) && (obj as Record<string, unknown>).bms != null;
}

/** Extract complete JSON objects from a raw RX stream (may span USB packets). */
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
          // malformed — skip
        }
        start = -1;
      }
    }
  }
  return results;
}

export function validateDiagnosisTelemetry(data: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["root must be a JSON object"] };
  }
  const o = data as Record<string, unknown>;

  const bms = o.bms;
  if (!bms || typeof bms !== "object" || Array.isArray(bms)) {
    errors.push("bms: required object");
  } else {
    const b = bms as Record<string, unknown>;
    if (!isNum(b.soc)) errors.push("bms.soc: number required");
    if (!isNum(b.pack_voltage_v)) errors.push("bms.pack_voltage_v: number required");
    if (!isNum(b.pack_current_a)) errors.push("bms.pack_current_a: number required");
    if (!isNum(b.pack_temp_c)) errors.push("bms.pack_temp_c: number required");
    const faults = b.faults;
    if (!faults || typeof faults !== "object" || Array.isArray(faults)) {
      errors.push("bms.faults: required object");
    } else {
      const f = faults as Record<string, unknown>;
      for (const k of BMS_FAULT_KEYS) {
        if (!isBool(f[k])) errors.push(`bms.faults.${k}: boolean required`);
      }
    }
  }

  const cells = o.cells;
  if (!cells || typeof cells !== "object" || Array.isArray(cells)) {
    errors.push("cells: required object");
  } else {
    const c = cells as Record<string, unknown>;
    if (!isNum(c.total_cells)) errors.push("cells.total_cells: number required");
    if (!isNum(c.cycle)) errors.push("cells.cycle: number required");
    if (!isNum(c.min_v)) errors.push("cells.min_v: number required");
    if (!isNum(c.max_v)) errors.push("cells.max_v: number required");
    if (!isNum(c.min_cell_id)) errors.push("cells.min_cell_id: number required");
    if (!isNum(c.max_cell_id)) errors.push("cells.max_cell_id: number required");
    if (!isNumArray(c.voltages)) errors.push("cells.voltages: number[] required");
    if (!isNumArray(c.temperatures)) errors.push("cells.temperatures: number[] required");
  }

  const hv = o.hv;
  if (!hv || typeof hv !== "object" || Array.isArray(hv)) {
    errors.push("hv: required object");
  } else {
    const h = hv as Record<string, unknown>;
    for (const k of ["bat_plus_v", "fc_v", "dcdc_v", "dsg_v", "sc_v", "pchg_v"] as const) {
      if (!isNum(h[k])) errors.push(`hv.${k}: number required`);
    }
  }

  const relays = o.relays;
  if (!relays || typeof relays !== "object" || Array.isArray(relays)) {
    errors.push("relays: required object");
  } else {
    const r = relays as Record<string, unknown>;
    for (const k of RELAY_KEYS) {
      if (!isBool(r[k])) errors.push(`relays["${k}"]: boolean required`);
    }
  }

  const dcdc = o.dcdc;
  if (!dcdc || typeof dcdc !== "object" || Array.isArray(dcdc)) {
    errors.push("dcdc: required object");
  } else {
    const d = dcdc as Record<string, unknown>;
    if (!isNum(d.voltage_v)) errors.push("dcdc.voltage_v: number required");
    if (!isNum(d.current_a)) errors.push("dcdc.current_a: number required");
    if (!isNum(d.temp_c)) errors.push("dcdc.temp_c: number required");
    for (const k of ["ready", "working", "hvil_err", "over_temperature"] as const) {
      if (!isBool(d[k])) errors.push(`dcdc.${k}: boolean required`);
    }
  }

  const charger = o.charger;
  if (!charger || typeof charger !== "object" || Array.isArray(charger)) {
    errors.push("charger: required object");
  } else {
    const ch = charger as Record<string, unknown>;
    if (!isStr(ch.status)) errors.push("charger.status: string required");
    if (!isNum(ch.voltage_v)) errors.push("charger.voltage_v: number required");
    if (!isNum(ch.current_a)) errors.push("charger.current_a: number required");
    if (!isNum(ch.error_code)) errors.push("charger.error_code: number required");
  }

  const motor = o.motor;
  if (!motor || typeof motor !== "object" || Array.isArray(motor)) {
    errors.push("motor: required object");
  } else {
    const m = motor as Record<string, unknown>;
    if (!isNum(m.rpm)) errors.push("motor.rpm: number required");
    if (!isNum(m.temp_c)) errors.push("motor.temp_c: number required");
    if (!isNum(m.runtime)) errors.push("motor.runtime: number required");
  }

  const evcc = o.evcc;
  if (!evcc || typeof evcc !== "object" || Array.isArray(evcc)) {
    errors.push("evcc: required object");
  } else {
    const e = evcc as Record<string, unknown>;
    if (!isStr(e.last_msg_code)) errors.push("evcc.last_msg_code: string required");
    if (!isStr(e.last_can_id)) errors.push("evcc.last_can_id: string required");
    if (!isStr(e.description)) errors.push("evcc.description: string required");
  }

  if (!isNum(o.ts)) errors.push("ts: number required");

  return { ok: errors.length === 0, errors };
}

export function findLatestDiagnosisTelemetry(
  packets: { direction: string; data: string }[],
): Record<string, unknown> | null {
  const rxPkts = packets.filter((p) => p.direction === "read");
  const stream = rxPkts.slice(-32).map((p) => p.data).join("");
  const objs = extractJsonObjects(stream);
  for (let i = objs.length - 1; i >= 0; i--) {
    if (isDiagnosisTelemetry(objs[i])) return objs[i];
  }
  return null;
}
