import { Alert, Linking, NativeModules, Platform, Share } from "react-native";

type SaveResult = { uri?: string; path?: string };

const CsvExportModule = NativeModules.CsvExportModule as
  | {
      saveToDownloads: (fileName: string, content: string) => Promise<SaveResult | string>;
    }
  | undefined;

function parseNativeResult(raw: SaveResult | string): { path: string } {
  if (typeof raw === "string") {
    return { path: raw };
  }
  return { path: raw.path ?? raw.uri ?? "Downloads/USBReader" };
}

export async function saveCsvToDevice(
  csv: string,
  filename: string,
): Promise<{ ok: boolean; path?: string; message: string }> {
  if (!csv || csv.length < 10) {
    return { ok: false, message: "No CSV data to save" };
  }

  if (Platform.OS === "android" && CsvExportModule?.saveToDownloads) {
    try {
      const raw = await CsvExportModule.saveToDownloads(filename, csv);
      const { path } = parseNativeResult(raw);
      return {
        ok: true,
        path,
        message: `Saved: ${path}`,
      };
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      const msg = err?.message ?? err?.code ?? String(e);
      // fall through to share
      if (__DEV__) {
        console.warn("[saveCsv] native failed:", msg);
      }
    }
  }

  // Fallback: share sheet with full CSV text
  try {
    const result = await Share.share({
      message: csv,
      title: filename,
    });
    if (result.action === Share.dismissedAction) {
      return { ok: false, message: "Share cancelled" };
    }
    return {
      ok: true,
      message:
        "Opened share menu — pick “Save to Files” or Drive to store the CSV.",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function openSavedPath(path: string): Promise<void> {
  if (!path.startsWith("content://") && !path.startsWith("file://")) {
    return;
  }
  try {
    await Linking.openURL(path);
  } catch {
    // optional
  }
}

export function showSaveError(message: string): void {
  Alert.alert(
    "Could not save CSV",
    message +
      "\n\nRebuild the app if this is the first time using Save to Downloads:\nnpx expo run:android --variant release",
  );
}
