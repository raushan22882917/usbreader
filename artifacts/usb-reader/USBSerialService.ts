/**
 * USBSerialService
 *
 * Bridges the Android native UsbSerialModule to JS.
 * On Android: uses NativeModules.UsbSerialModule + NativeEventEmitter.
 * On other platforms: no-op stubs so the app still compiles.
 */
import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';

const { UsbSerialModule } = NativeModules;

// Only create the emitter when the native module is present (Android)
const emitter: NativeEventEmitter | null =
  Platform.OS === 'android' && UsbSerialModule
    ? new NativeEventEmitter(UsbSerialModule)
    : null;

export interface UsbNativeDevice {
  deviceId: number;
  vendorId: number;
  productId: number;
  name: string;
  productName: string;
  manufacturerName: string;
  serialNumber: string;
}

class USBSerialService {
  private static dataListeners: ((hexData: string) => void)[] = [];
  private static attachListeners: ((device: UsbNativeDevice) => void)[] = [];
  private static detachListeners: ((device: UsbNativeDevice) => void)[] = [];

  // Native event subscriptions (kept alive for the app lifetime)
  private static nativeDataSub:   EmitterSubscription | null = null;
  private static nativeAttachSub: EmitterSubscription | null = null;
  private static nativeDetachSub: EmitterSubscription | null = null;

  static init() {
    if (!emitter) return;

    // Forward native data events to all JS listeners
    this.nativeDataSub = emitter.addListener('UsbSerialDataReceived', (hexData: string) => {
      this.dataListeners.forEach(cb => {
        try { cb(hexData); } catch (e) { console.error('USBSerialService data listener error:', e); }
      });
    });

    this.nativeAttachSub = emitter.addListener('UsbDeviceAttached', (device: UsbNativeDevice) => {
      this.attachListeners.forEach(cb => {
        try { cb(device); } catch (e) { console.error('USBSerialService attach listener error:', e); }
      });
    });

    this.nativeDetachSub = emitter.addListener('UsbDeviceDetached', (device: UsbNativeDevice) => {
      this.detachListeners.forEach(cb => {
        try { cb(device); } catch (e) { console.error('USBSerialService detach listener error:', e); }
      });
    });
  }

  // ── Subscribe to incoming data ──────────────────────────────────────────────
  static onData(callback: (hexData: string) => void): () => void {
    this.dataListeners.push(callback);
    return () => {
      const i = this.dataListeners.indexOf(callback);
      if (i > -1) this.dataListeners.splice(i, 1);
    };
  }

  // ── Subscribe to device attach/detach ───────────────────────────────────────
  static onDeviceAttached(callback: (device: UsbNativeDevice) => void): () => void {
    this.attachListeners.push(callback);
    return () => {
      const i = this.attachListeners.indexOf(callback);
      if (i > -1) this.attachListeners.splice(i, 1);
    };
  }

  static onDeviceDetached(callback: (device: UsbNativeDevice) => void): () => void {
    this.detachListeners.push(callback);
    return () => {
      const i = this.detachListeners.indexOf(callback);
      if (i > -1) this.detachListeners.splice(i, 1);
    };
  }

  // ── Native API wrappers ─────────────────────────────────────────────────────

  /** List all connected USB devices */
  static async listDevices(): Promise<UsbNativeDevice[]> {
    if (!UsbSerialModule) return [];
    return UsbSerialModule.listDevices();
  }

  /** Request USB permission for a device */
  static async requestPermission(deviceId: number): Promise<UsbNativeDevice> {
    if (!UsbSerialModule) throw new Error('UsbSerialModule not available');
    return UsbSerialModule.requestPermission(deviceId);
  }

  /** Open a connection to a USB device */
  static async connect(deviceId: number, baudRate = 9600): Promise<UsbNativeDevice> {
    if (!UsbSerialModule) throw new Error('UsbSerialModule not available');
    return UsbSerialModule.connect(deviceId, baudRate);
  }

  /** Write hex-encoded data to the connected device */
  static async write(hexData: string): Promise<number> {
    if (!UsbSerialModule) throw new Error('UsbSerialModule not available');
    return UsbSerialModule.write(hexData);
  }

  /** Disconnect from the current device */
  static async disconnect(): Promise<void> {
    if (!UsbSerialModule) return;
    return UsbSerialModule.disconnect();
  }

  // ── Test helpers (non-Android / dev) ───────────────────────────────────────
  static simulateData(hexData: string): void {
    this.dataListeners.forEach(cb => {
      try { cb(hexData); } catch (e) { console.error(e); }
    });
  }

  static simulateResponse(response: object): void {
    const jsonStr = JSON.stringify(response);
    const hex = Array.from(jsonStr)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
    this.simulateData(hex);
  }
}

// Boot the native event bridge immediately
USBSerialService.init();

export default USBSerialService;
