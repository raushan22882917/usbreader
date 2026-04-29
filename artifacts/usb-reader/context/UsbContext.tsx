/**
 * UsbContext — Android-first USB connection context.
 *
 * On Android: uses the native UsbSerialModule (UsbManager) via USBSerialService.
 * On Web:     falls back to WebUSB.
 * On iOS:     shows an unsupported message.
 */
import React, {
  createContext, useContext, useEffect, useState, useRef, useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import USBSerialService, { UsbNativeDevice } from '../USBSerialService';

// ── WebUSB type shim ──────────────────────────────────────────────────────────
declare global {
  interface Navigator {
    usb?: {
      getDevices(): Promise<any[]>;
      requestDevice(options: { filters: any[] }): Promise<any>;
      addEventListener(type: string, listener: (event: any) => void): void;
      removeEventListener(type: string, listener: (event: any) => void): void;
    };
  }
}

// ── Public types ──────────────────────────────────────────────────────────────
export interface UsbDevice {
  id: string;
  name: string;
  vendorId?: number;
  productId?: number;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  connected: boolean;
  platform: 'android' | 'ios' | 'web';
  /** Android native deviceId (integer) */
  nativeDeviceId?: number;
}

export interface DataPacket {
  id: string;
  timestamp: Date;
  direction: 'read' | 'write';
  data: string;
  hexView: string;
  byteLength: number;
  deviceId: string;
}

export const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600] as const;
export type BaudRate = typeof BAUD_RATES[number];

interface UsbContextType {
  devices: UsbDevice[];
  selectedDevice: UsbDevice | null;
  packets: DataPacket[];
  isScanning: boolean;
  isConnecting: boolean;
  connectionStatus: 'idle' | 'connected' | 'disconnected' | 'error';
  lastError: string | null;
  viewMode: 'text' | 'hex' | 'ascii';
  setViewMode: (mode: 'text' | 'hex' | 'ascii') => void;
  baudRate: BaudRate;
  setBaudRate: (rate: BaudRate) => void;
  scanForDevices: () => Promise<void>;
  connectDevice: (device: UsbDevice) => Promise<void>;
  quickConnect: () => Promise<void>;
  disconnectDevice: () => void;
  writeData: (hexData: string) => Promise<void>;
  clearPackets: () => void;
  selectDevice: (device: UsbDevice) => void;
}

const UsbContext = createContext<UsbContextType | undefined>(undefined);

// ── Helpers ───────────────────────────────────────────────────────────────────
function toHex(str: string): string {
  return Array.from(str)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function nativeToUsbDevice(d: UsbNativeDevice): UsbDevice {
  return {
    id: String(d.deviceId),
    name: d.productName || d.name || `USB Device (${d.vendorId.toString(16).toUpperCase()})`,
    vendorId: d.vendorId,
    productId: d.productId,
    manufacturerName: d.manufacturerName,
    productName: d.productName,
    serialNumber: d.serialNumber,
    connected: false,
    platform: 'android',
    nativeDeviceId: d.deviceId,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function UsbProvider({ children }: { children: React.ReactNode }) {
  const [devices,          setDevices]          = useState<UsbDevice[]>([]);
  const [selectedDevice,   setSelectedDevice]   = useState<UsbDevice | null>(null);
  const [packets,          setPackets]          = useState<DataPacket[]>([]);
  const [isScanning,       setIsScanning]       = useState(false);
  const [isConnecting,     setIsConnecting]     = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'disconnected' | 'error'>('idle');
  const [lastError,        setLastError]        = useState<string | null>(null);
  const [viewMode,         setViewMode]         = useState<'text' | 'hex' | 'ascii'>('text');
  const [baudRate,         setBaudRate]         = useState<BaudRate>(115200);

  // WebUSB refs (web only)
  const webUsbDeviceRef      = useRef<any>(null);
  const webUsbInterfaceRef   = useRef<number | null>(null);
  const webUsbEndpointInRef  = useRef<number | null>(null);
  const webUsbEndpointOutRef = useRef<number | null>(null);
  const readLoopActiveRef    = useRef(false);

  const selectedDeviceRef = useRef<UsbDevice | null>(null);
  useEffect(() => { selectedDeviceRef.current = selectedDevice; }, [selectedDevice]);

  // ── Boot ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadStoredPackets();

    if (Platform.OS === 'android') {
      // Listen for hotplug events from native module
      const unsubAttach = USBSerialService.onDeviceAttached(device => {
        const d = nativeToUsbDevice(device);
        setDevices(prev => {
          const exists = prev.find(x => x.nativeDeviceId === device.deviceId);
          return exists ? prev : [...prev, d];
        });
      });
      const unsubDetach = USBSerialService.onDeviceDetached(device => {
        setDevices(prev => prev.filter(x => x.nativeDeviceId !== device.deviceId));
        if (selectedDeviceRef.current?.nativeDeviceId === device.deviceId) {
          setConnectionStatus('disconnected');
          setSelectedDevice(null);
        }
      });
      // Listen for incoming data
      const unsubData = USBSerialService.onData(hexData => {
        const dev = selectedDeviceRef.current;
        if (!dev) return;
        const text = hexToString(hexData);
        const pkt: DataPacket = {
          id: generateId(),
          timestamp: new Date(),
          direction: 'read',
          data: text,
          hexView: hexData.toUpperCase().match(/.{1,2}/g)?.join(' ') ?? hexData,
          byteLength: hexData.length / 2,
          deviceId: dev.id,
        };
        setPackets(prev => {
          const next = [...prev, pkt].slice(-200);
          savePackets(next);
          return next;
        });
      });
      return () => { unsubAttach(); unsubDetach(); unsubData(); };
    }

    if (Platform.OS === 'web' && navigator.usb) {
      try {
        navigator.usb.addEventListener('disconnect', handleWebUsbDisconnect);
        checkPreAuthorizedWebDevices();
        return () => {
          try { navigator.usb!.removeEventListener('disconnect', handleWebUsbDisconnect); } catch {}
        };
      } catch {}
    }
  }, []);

  // ── Persistence ─────────────────────────────────────────────────────────────
  async function loadStoredPackets() {
    try {
      const stored = await AsyncStorage.getItem('usb_packets');
      if (stored) {
        const parsed: DataPacket[] = JSON.parse(stored);
        setPackets(parsed.map(p => ({ ...p, timestamp: new Date(p.timestamp) })).slice(-200));
      }
    } catch {}
  }

  async function savePackets(pkts: DataPacket[]) {
    try { await AsyncStorage.setItem('usb_packets', JSON.stringify(pkts.slice(-200))); } catch {}
  }

  // ── Web USB helpers ──────────────────────────────────────────────────────────
  async function handleWebUsbDisconnect(e: any) {
    const d = e.device;
    if (webUsbDeviceRef.current === d) {
      readLoopActiveRef.current = false;
      webUsbDeviceRef.current = null;
      setConnectionStatus('disconnected');
      setSelectedDevice(null);
    }
    setDevices(prev => prev.filter(dev => dev.id !== d.serialNumber));
  }

  async function checkPreAuthorizedWebDevices() {
    if (Platform.OS !== 'web' || !navigator.usb) return;
    try {
      const authorized = await navigator.usb.getDevices();
      if (authorized.length > 0) {
        setDevices(authorized.map((d: any) => ({
          id: generateId(),
          name: d.productName || `USB Device (${d.vendorId?.toString(16)})`,
          vendorId: d.vendorId, productId: d.productId,
          manufacturerName: d.manufacturerName, productName: d.productName,
          serialNumber: d.serialNumber, connected: false, platform: 'web' as const,
        })));
      }
    } catch {}
  }

  // ── Scan ─────────────────────────────────────────────────────────────────────
  const scanForDevices = useCallback(async () => {
    setIsScanning(true);
    setLastError(null);
    try {
      if (Platform.OS === 'android') {
        const list = await USBSerialService.listDevices();
        if (list.length === 0) {
          setLastError('No USB devices found. Make sure a device is connected via OTG.');
          setDevices([]);
        } else {
          setDevices(list.map(nativeToUsbDevice));
        }
      } else if (Platform.OS === 'web') {
        if (!navigator.usb) {
          setLastError('WebUSB not supported. Use Chrome or Edge.');
          return;
        }
        try {
          const device = await navigator.usb.requestDevice({ filters: [] });
          const newDev: UsbDevice = {
            id: generateId(),
            name: device.productName || `USB Device (${device.vendorId?.toString(16)})`,
            vendorId: device.vendorId, productId: device.productId,
            manufacturerName: device.manufacturerName, productName: device.productName,
            serialNumber: device.serialNumber, connected: false, platform: 'web',
          };
          setDevices(prev => {
            const exists = prev.find(d => d.vendorId === newDev.vendorId && d.productId === newDev.productId);
            return exists ? prev : [...prev, newDev];
          });
        } catch (e: any) {
          if (!String(e?.message).toLowerCase().includes('no device selected'))
            setLastError('USB access blocked. Use Chrome/Edge and allow USB permissions.');
          setDevices([]);
        }
      } else {
        setLastError('iOS USB not supported.');
        setDevices([]);
      }
    } catch (e: any) {
      setLastError(e?.message ?? String(e));
      setDevices([]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────────────
  const connectDevice = useCallback(async (device: UsbDevice) => {
    setIsConnecting(true);
    setLastError(null);
    try {
      if (Platform.OS === 'android') {
        const nativeId = device.nativeDeviceId;
        if (nativeId == null) throw new Error('Device has no native ID. Re-scan and try again.');

        // 1. Request permission
        await USBSerialService.requestPermission(nativeId);

        // 2. Open connection using the configured baud rate
        const connected = await USBSerialService.connect(nativeId, baudRate);

        const connectedDevice: UsbDevice = {
          ...nativeToUsbDevice(connected),
          connected: true,
        };
        setDevices(prev => prev.map(d => d.id === device.id ? connectedDevice : d));
        setSelectedDevice(connectedDevice);
        setConnectionStatus('connected');

      } else if (Platform.OS === 'web' && navigator.usb) {
        // WebUSB path — find the raw device object from the authorized list
        const authorized = await navigator.usb.getDevices();
        let webDev = authorized.find(
          (d: any) => d.vendorId === device.vendorId && d.productId === device.productId
        );
        if (!webDev) throw new Error('Device not authorized. Click Scan and grant USB permissions first.');

        // Open if not already open
        if (webDev.opened === false) await webDev.open();
        if (webDev.configuration === null) await webDev.selectConfiguration(1);

        // Find the best interface — prefer one with bulk endpoints
        let bestIface: any = null;
        let inEp:  any = null;
        let outEp: any = null;

        for (const iface of webDev.configuration.interfaces) {
          const alt = iface.alternate;
          const tmpIn  = alt.endpoints.find((e: any) => e.direction === 'in'  && e.type === 'bulk');
          const tmpOut = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk');
          if (tmpIn && tmpOut) {
            bestIface = iface;
            inEp  = tmpIn;
            outEp = tmpOut;
            break;
          }
          // Fallback: any in/out pair
          if (!bestIface) {
            const anyIn  = alt.endpoints.find((e: any) => e.direction === 'in');
            const anyOut = alt.endpoints.find((e: any) => e.direction === 'out');
            if (anyIn || anyOut) {
              bestIface = iface;
              inEp  = anyIn  ?? null;
              outEp = anyOut ?? null;
            }
          }
        }

        if (!bestIface) throw new Error('No usable interface found on device.');

        try {
          await webDev.claimInterface(bestIface.interfaceNumber);
        } catch (e: any) {
          // Already claimed is OK
          if (!String(e?.message).toLowerCase().includes('already claimed')) throw e;
        }

        if (bestIface.alternate) {
          try {
            await webDev.selectAlternateInterface(
              bestIface.interfaceNumber,
              bestIface.alternate.alternateSetting
            );
          } catch {}
        }

        // ── CP210x chip init via WebUSB control transfers ──────────────────
        // Without this the UART is disabled and no data flows.
        const vid = webDev.vendorId;
        try {
          if (vid === 0x10C4) {
            // CP210x: IFC_ENABLE
            await webDev.controlTransferOut({ requestType: 'vendor', recipient: 'interface', request: 0x00, value: 0x0001, index: 0 });
            // Set baud rate
            const b = baudRate;
            const baudBytes = new Uint8Array([b & 0xFF, (b >> 8) & 0xFF, (b >> 16) & 0xFF, (b >> 24) & 0xFF]);
            await webDev.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x1E, value: 0, index: 0 }, baudBytes);
            // 8N1
            await webDev.controlTransferOut({ requestType: 'vendor', recipient: 'interface', request: 0x03, value: 0x0800, index: 0 });
            // DTR + RTS
            await webDev.controlTransferOut({ requestType: 'vendor', recipient: 'interface', request: 0x07, value: 0x0303, index: 0 });
          } else if (vid === 0x0403) {
            // FTDI: reset + set baud
            await webDev.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x00, value: 0x0000, index: 0 });
            const divisor = Math.round(3000000 / baudRate);
            await webDev.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x03, value: divisor, index: 0 });
            await webDev.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x04, value: 0x0008, index: 0 });
          } else {
            // CDC-ACM: SET_LINE_CODING
            const b = baudRate;
            const lc = new Uint8Array([b & 0xFF, (b >> 8) & 0xFF, (b >> 16) & 0xFF, (b >> 24) & 0xFF, 0, 0, 8]);
            await webDev.controlTransferOut({ requestType: 'class', recipient: 'interface', request: 0x20, value: 0, index: 0 }, lc);
            // SET_CONTROL_LINE_STATE: DTR + RTS
            await webDev.controlTransferOut({ requestType: 'class', recipient: 'interface', request: 0x22, value: 0x03, index: 0 });
          }
        } catch (initErr: any) {
          // Init errors are non-fatal — log and continue
          console.warn('WebUSB chip init warning:', initErr?.message);
        }

        webUsbDeviceRef.current      = webDev;
        webUsbInterfaceRef.current   = bestIface.interfaceNumber;
        webUsbEndpointInRef.current  = inEp?.endpointNumber ?? null;
        webUsbEndpointOutRef.current = outEp?.endpointNumber ?? null;

        const connectedDevice = { ...device, connected: true };
        setDevices(prev => prev.map(d => d.id === device.id ? connectedDevice : d));
        setSelectedDevice(connectedDevice);
        setConnectionStatus('connected');

        if (inEp) {
          runWebUsbReadLoop(connectedDevice);
        } else {
          setLastError('No IN endpoint found — device connected but cannot read data.');
        }

      } else {
        throw new Error('USB not supported on this platform.');
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastError(msg);
      setConnectionStatus('error');
    } finally {
      setIsConnecting(false);
    }
  }, [baudRate]);

  // ── Quick connect (first available device) ───────────────────────────────────
  const quickConnect = useCallback(async () => {
    if (connectionStatus === 'connected') return;

    if (Platform.OS === 'android') {
      try {
        const list = await USBSerialService.listDevices();
        if (list.length === 0) {
          setLastError('No USB devices found. Connect a device via OTG cable.');
          return;
        }
        const first = nativeToUsbDevice(list[0]);
        setDevices(list.map(nativeToUsbDevice));
        await connectDevice(first);
      } catch (e: any) {
        setLastError(e?.message ?? String(e));
      }
      return;
    }

    if (Platform.OS === 'web' && navigator.usb) {
      try {
        const authorized = await navigator.usb.getDevices();
        if (authorized.length > 0) {
          const d = authorized[0];
          const dev: UsbDevice = {
            id: generateId(), name: d.productName || 'USB Device',
            vendorId: d.vendorId, productId: d.productId,
            manufacturerName: d.manufacturerName, productName: d.productName,
            serialNumber: d.serialNumber, connected: false, platform: 'web',
          };
          setDevices([dev]);
          await connectDevice(dev);
          return;
        }
        const d = await navigator.usb.requestDevice({ filters: [] });
        const dev: UsbDevice = {
          id: d.serialNumber || generateId(), name: d.productName || 'USB Device',
          vendorId: d.vendorId, productId: d.productId,
          manufacturerName: d.manufacturerName, productName: d.productName,
          serialNumber: d.serialNumber, connected: false, platform: 'web',
        };
        setDevices([dev]);
        await connectDevice(dev);
      } catch {
        setLastError('USB access denied or no device selected.');
      }
      return;
    }

    setLastError('USB not supported on this platform.');
  }, [connectionStatus, connectDevice]);

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnectDevice = useCallback(() => {
    if (Platform.OS === 'android') {
      USBSerialService.disconnect().catch(() => {});
    } else if (Platform.OS === 'web' && webUsbDeviceRef.current) {
      readLoopActiveRef.current = false;
      const dev = webUsbDeviceRef.current;
      if (webUsbInterfaceRef.current !== null)
        dev.releaseInterface(webUsbInterfaceRef.current).catch(() => {});
      dev.close().catch(() => {});
      webUsbDeviceRef.current      = null;
      webUsbInterfaceRef.current   = null;
      webUsbEndpointInRef.current  = null;
      webUsbEndpointOutRef.current = null;
    }
    setDevices(prev => prev.map(d => ({ ...d, connected: false })));
    setSelectedDevice(null);
    setConnectionStatus('disconnected');
  }, []);

  // ── Write ────────────────────────────────────────────────────────────────────
  const writeData = useCallback(async (hexData: string) => {
    const dev = selectedDeviceRef.current;
    if (!dev) return;

    if (Platform.OS === 'android') {
      await USBSerialService.write(hexData);
    } else if (Platform.OS === 'web' && webUsbDeviceRef.current && webUsbEndpointOutRef.current !== null) {
      const bytes = new Uint8Array(hexData.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
      try { await webUsbDeviceRef.current.transferOut(webUsbEndpointOutRef.current, bytes); } catch {}
    }

    // Record TX packet
    const txPkt: DataPacket = {
      id: generateId(), timestamp: new Date(), direction: 'write',
      data: hexToString(hexData),
      hexView: hexData.toUpperCase().match(/.{1,2}/g)?.join(' ') ?? hexData,
      byteLength: hexData.length / 2,
      deviceId: dev.id,
    };
    setPackets(prev => {
      const next = [...prev, txPkt].slice(-200);
      savePackets(next);
      return next;
    });
  }, []);

  // ── WebUSB read loop ─────────────────────────────────────────────────────────
  async function runWebUsbReadLoop(device: UsbDevice) {
    readLoopActiveRef.current = true;
    const epNum = webUsbEndpointInRef.current;
    if (epNum === null) return;

    while (readLoopActiveRef.current) {
      try {
        // 512 bytes covers most USB-serial packet sizes
        const result = await webUsbDeviceRef.current.transferIn(epNum, 512);
        if (result.status === 'ok' && result.data && result.data.byteLength > 0) {
          const raw = new Uint8Array(result.data.buffer);

          // Strip CP210x 2-byte status header if present (first 2 bytes are modem status)
          // CP210x prepends 0x02 0x00 or similar status bytes before actual data
          const vid = webUsbDeviceRef.current?.vendorId;
          const payload = (vid === 0x10C4 && raw.length > 2 && raw[0] <= 0x03)
            ? raw.slice(2)
            : raw;

          if (payload.length === 0) continue;

          const hexView = Array.from(payload)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
          const text = hexToString(
            Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join('')
          );

          const pkt: DataPacket = {
            id: generateId(),
            timestamp: new Date(),
            direction: 'read',
            data: text,
            hexView,
            byteLength: payload.length,
            deviceId: device.id,
          };
          setPackets(prev => {
            const next = [...prev, pkt].slice(-200);
            savePackets(next);
            return next;
          });
        }
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes('disconnected') || msg.includes('device lost') || msg.includes('closed')) break;
        // Stall/timeout — just continue polling
        if (msg.includes('STALL') || msg.includes('timeout')) {
          await new Promise(r => setTimeout(r, 10));
          continue;
        }
        // Any other error — short pause then retry
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }

  const clearPackets = useCallback(() => {
    setPackets([]);
    AsyncStorage.removeItem('usb_packets').catch(() => {});
  }, []);

  const selectDevice = useCallback((device: UsbDevice) => {
    setSelectedDevice(device);
  }, []);

  return (
    <UsbContext.Provider value={{
      devices, selectedDevice, packets,
      isScanning, isConnecting, connectionStatus, lastError,
      viewMode, setViewMode,
      baudRate, setBaudRate,
      scanForDevices, connectDevice, quickConnect, disconnectDevice,
      writeData, clearPackets, selectDevice,
    }}>
      {children}
    </UsbContext.Provider>
  );
}

export function useUsb() {
  const ctx = useContext(UsbContext);
  if (!ctx) throw new Error('useUsb must be used within UsbProvider');
  return ctx;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function hexToString(hex: string): string {
  let s = '';
  for (let i = 0; i < hex.length; i += 2)
    s += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
  return s;
}
