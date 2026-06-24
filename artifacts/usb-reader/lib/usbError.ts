/**
 * Format native / JS USB errors for display and logging.
 * React Native rejects often carry `code` + `message`; message alone is often empty or generic.
 */
export interface UsbErrorInfo {
  code?: string;
  message: string;
  /** Full text for UI + alerts */
  detail: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function formatUsbError(error: unknown): UsbErrorInfo {
  if (error == null) {
    return { message: 'Unknown error', detail: 'Unknown error' };
  }

  if (typeof error === 'string') {
    const trimmed = error.trim() || 'Unknown error';
    return { message: trimmed, detail: trimmed };
  }

  const e = error as Record<string, unknown>;
  const code = typeof e.code === 'string' && e.code.trim() ? e.code.trim() : undefined;

  let message = '';
  if (typeof e.message === 'string' && e.message.trim()) {
    message = e.message.trim();
  } else if (typeof e.userInfo === 'string' && e.userInfo.trim()) {
    message = e.userInfo.trim();
  } else if (code) {
    message = code;
  } else {
    message = String(error);
  }

  const detailParts = [code ? `[${code}]` : null, message].filter(Boolean) as string[];
  let detail = detailParts.join(' ');

  if (typeof e.nativeStackAndroid === 'string' && e.nativeStackAndroid.trim()) {
    detail += `\n${e.nativeStackAndroid.trim()}`;
  }

  if (isRecord(e.userInfo) && Object.keys(e.userInfo).length > 0) {
    try {
      detail += `\n${JSON.stringify(e.userInfo)}`;
    } catch {
      // ignore
    }
  }

  return { code, message, detail };
}

/** Log to console and return formatted detail for UI state */
export function logUsbError(context: string, error: unknown): string {
  const info = formatUsbError(error);
  console.error(`[USB] ${context}:`, info.detail);
  if (error != null && typeof error === 'object') {
    console.error(`[USB] ${context} raw:`, error);
  }
  return info.detail;
}
