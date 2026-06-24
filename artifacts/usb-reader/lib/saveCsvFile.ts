import { Alert, Linking, NativeModules, Platform, Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

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

async function writeCsvToCache(filename: string, csv: string): Promise<string> {
  const fileUri = FileSystem.cacheDirectory + filename;
  // Use the highly stable legacy writeAsStringAsync method
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: 'utf8',
  });
  return fileUri;
}

/** Build CSV file from current buffer and open share/save sheet. */
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
      if (__DEV__) {
        console.warn("[saveCsv] native failed:", msg);
      }
    }
  }

  const fileUri = await writeCsvToCache(filename, csv);

  try {
    if (Platform.OS === "android") {
      try {
        const contentUri = await FileSystem.getContentUriAsync(fileUri);
        const result = await Share.share({
          title: filename,
          message: filename,
          url: contentUri,
        });
        if (result.action === Share.dismissedAction) {
          return { ok: false, message: "Share cancelled" };
        }
        return {
          ok: true,
          path: fileUri,
          message: "CSV ready — pick Save or Drive",
        };
      } catch {
        // fall through
      }
    }

    const result = await Share.share({
      title: filename,
      url: fileUri,
    });
    if (result.action === Share.dismissedAction) {
      return { ok: false, message: "Share cancelled" };
    }
    return {
      ok: true,
      path: fileUri,
      message: "CSV ready",
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
    "Could not save export",
    message +
      "\n\nRebuild the app if this is the first time using Save to Downloads:\nnpx expo run:android --variant release",
  );
}
