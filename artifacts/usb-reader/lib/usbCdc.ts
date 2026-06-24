/** Send one JSON line to ESP32 over USB CDC (hex-encoded writes). */

export function strToHex(str: string): string {
  let hex = "";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

export async function sendCdcLine(
  writeData: (hex: string) => Promise<void>,
  obj: Record<string, unknown>,
): Promise<void> {
  const line = JSON.stringify(obj) + "\n";
  const hex = strToHex(line);
  const chunkHex = 512;
  for (let i = 0; i < hex.length; i += chunkHex) {
    await writeData(hex.slice(i, i + chunkHex));
    if (i + chunkHex < hex.length) await new Promise((r) => setTimeout(r, 1));
  }
}

export async function sendCsvCmd(
  writeData: (hex: string) => Promise<void>,
  isConnected: boolean,
): Promise<void> {
  if (!isConnected) return;
  await sendCdcLine(writeData, { cmd: "csv" });
}
