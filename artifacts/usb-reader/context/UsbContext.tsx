import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface UsbDevice {
  id: string;
  name: string;
  vendorId?: number;
  productId?: number;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  connected: boolean;
  platform: "android" | "ios" | "web";
}

export interface DataPacket {
  id: string;
  timestamp: Date;
  direction: "read" | "write";
  data: string;
  hexView: string;
  byteLength: number;
  deviceId: string;
}

interface UsbContextType {
  devices: UsbDevice[];
  selectedDevice: UsbDevice | null;
  packets: DataPacket[];
  isScanning: boolean;
  isConnecting: boolean;
  connectionStatus: "idle" | "connected" | "disconnected" | "error";
  lastError: string | null;
  viewMode: "text" | "hex" | "ascii";
  setViewMode: (mode: "text" | "hex" | "ascii") => void;
  scanForDevices: () => Promise<void>;
  connectDevice: (device: UsbDevice) => Promise<void>;
  disconnectDevice: () => void;
  writeData: (data: string) => Promise<void>;
  clearPackets: () => void;
  selectDevice: (device: UsbDevice) => void;
}

const UsbContext = createContext<UsbContextType | undefined>(undefined);

function toHex(str: string): string {
  return Array.from(str)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function UsbProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<UsbDevice | null>(null);
  const [packets, setPackets] = useState<DataPacket[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connected" | "disconnected" | "error"
  >("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"text" | "hex" | "ascii">("text");

  const webUsbDeviceRef = useRef<USBDevice | null>(null);
  const webUsbInterfaceRef = useRef<number | null>(null);
  const webUsbEndpointInRef = useRef<number | null>(null);
  const webUsbEndpointOutRef = useRef<number | null>(null);
  const readLoopActiveRef = useRef(false);

  useEffect(() => {
    loadStoredPackets();
    if (Platform.OS === "web" && "usb" in navigator) {
      navigator.usb.addEventListener("disconnect", handleWebUsbDisconnect);
      checkPreAuthorizedWebDevices();
      return () => {
        navigator.usb.removeEventListener("disconnect", handleWebUsbDisconnect);
      };
    }
  }, []);

  async function loadStoredPackets() {
    try {
      const stored = await AsyncStorage.getItem("usb_packets");
      if (stored) {
        const parsed: DataPacket[] = JSON.parse(stored);
        const revived = parsed.map((p) => ({ ...p, timestamp: new Date(p.timestamp) }));
        setPackets(revived.slice(-200));
      }
    } catch {}
  }

  async function savePackets(pkts: DataPacket[]) {
    try {
      await AsyncStorage.setItem("usb_packets", JSON.stringify(pkts.slice(-200)));
    } catch {}
  }

  function handleWebUsbDisconnect(event: Event) {
    const usbEvent = event as USBConnectionEvent;
    if (webUsbDeviceRef.current === usbEvent.device) {
      readLoopActiveRef.current = false;
      setConnectionStatus("disconnected");
      setSelectedDevice(null);
      webUsbDeviceRef.current = null;
      setDevices((prev) => prev.map((d) => ({ ...d, connected: false })));
    }
  }

  async function checkPreAuthorizedWebDevices() {
    if (Platform.OS !== "web" || !("usb" in navigator)) return;
    try {
      const authorized = await (navigator.usb as USB).getDevices();
      if (authorized.length > 0) {
        const mapped: UsbDevice[] = authorized.map((d) => ({
          id: generateId(),
          name: d.productName || `USB Device (${d.vendorId?.toString(16)})`,
          vendorId: d.vendorId,
          productId: d.productId,
          manufacturerName: d.manufacturerName,
          productName: d.productName,
          serialNumber: d.serialNumber,
          connected: false,
          platform: "web",
        }));
        setDevices(mapped);
      }
    } catch {}
  }

  const scanForDevices = useCallback(async () => {
    setIsScanning(true);
    setLastError(null);
    try {
      if (Platform.OS === "web") {
        if (!("usb" in navigator)) {
          setLastError(
            "WebUSB is not supported in this browser. Try Chrome or Edge."
          );
          setDevices(getDemoDevices("web"));
          return;
        }
        const device = await (navigator.usb as USB).requestDevice({ filters: [] });
        const newDevice: UsbDevice = {
          id: generateId(),
          name: device.productName || `USB Device (${device.vendorId?.toString(16)})`,
          vendorId: device.vendorId,
          productId: device.productId,
          manufacturerName: device.manufacturerName,
          productName: device.productName,
          serialNumber: device.serialNumber,
          connected: false,
          platform: "web",
        };
        setDevices((prev) => {
          const exists = prev.find((d) => d.vendorId === newDevice.vendorId && d.productId === newDevice.productId);
          if (exists) return prev;
          return [...prev, newDevice];
        });
      } else if (Platform.OS === "android") {
        setLastError(null);
        setDevices(getDemoDevices("android"));
      } else {
        setDevices(getDemoDevices("ios"));
        setLastError(
          "iOS supports USB accessories via MFi protocol. Demo mode active."
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("No device selected")) {
        setLastError(msg);
      }
    } finally {
      setIsScanning(false);
    }
  }, []);

  function getDemoDevices(platform: "android" | "ios" | "web"): UsbDevice[] {
    return [
      {
        id: "demo-1",
        name: "Arduino Uno",
        vendorId: 0x2341,
        productId: 0x0043,
        manufacturerName: "Arduino LLC",
        productName: "Arduino Uno",
        serialNumber: "SN-8472",
        connected: false,
        platform,
      },
      {
        id: "demo-2",
        name: "USB Serial Adapter",
        vendorId: 0x0403,
        productId: 0x6001,
        manufacturerName: "FTDI",
        productName: "FT232R USB UART",
        serialNumber: "SN-1238",
        connected: false,
        platform,
      },
      {
        id: "demo-3",
        name: "ESP32 DevKit",
        vendorId: 0x10c4,
        productId: 0xea60,
        manufacturerName: "Silicon Labs",
        productName: "CP2102 USB to UART",
        serialNumber: "SN-9921",
        connected: false,
        platform,
      },
    ];
  }

  const selectDevice = useCallback((device: UsbDevice) => {
    setSelectedDevice(device);
  }, []);

  const connectDevice = useCallback(async (device: UsbDevice) => {
    setIsConnecting(true);
    setLastError(null);
    try {
      if (Platform.OS === "web" && "usb" in navigator) {
        const authorized = await (navigator.usb as USB).getDevices();
        const webDev = authorized.find(
          (d) => d.vendorId === device.vendorId && d.productId === device.productId
        );
        if (webDev) {
          await webDev.open();
          if (webDev.configuration === null) await webDev.selectConfiguration(1);
          const iface = webDev.configuration?.interfaces[0];
          if (iface) {
            await webDev.claimInterface(iface.interfaceNumber);
            const endpoints = iface.alternate.endpoints;
            const inEndpoint = endpoints.find((e) => e.direction === "in");
            const outEndpoint = endpoints.find((e) => e.direction === "out");
            webUsbDeviceRef.current = webDev;
            webUsbInterfaceRef.current = iface.interfaceNumber;
            webUsbEndpointInRef.current = inEndpoint?.endpointNumber ?? null;
            webUsbEndpointOutRef.current = outEndpoint?.endpointNumber ?? null;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 800));
      const connected = { ...device, connected: true };
      setDevices((prev) => prev.map((d) => (d.id === device.id ? connected : d)));
      setSelectedDevice(connected);
      setConnectionStatus("connected");
      startReadLoop(device);
    } catch (e: unknown) {
      setLastError(e instanceof Error ? e.message : String(e));
      setConnectionStatus("error");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  function startReadLoop(device: UsbDevice) {
    readLoopActiveRef.current = true;
    if (Platform.OS === "web" && webUsbDeviceRef.current && webUsbEndpointInRef.current !== null) {
      runWebUsbReadLoop(device);
    } else {
      runDemoReadLoop(device);
    }
  }

  function runDemoReadLoop(device: UsbDevice) {
    let tick = 0;
    const interval = setInterval(() => {
      if (!readLoopActiveRef.current) { clearInterval(interval); return; }
      tick++;

      // Rotate through different realistic USB serial payloads
      const payloads = [
        `STATUS:OK VCC:${(3.28 + Math.sin(tick * 0.3) * 0.05).toFixed(2)}V TEMP:${(23 + Math.sin(tick * 0.1) * 3).toFixed(1)}C`,
        `RPM:${Math.round(800 + Math.sin(tick * 0.2) * 400)} CURR:${(12.4 + Math.sin(tick * 0.4) * 2).toFixed(1)}A SOC:${Math.max(10, Math.min(100, 78 - tick * 0.5)).toFixed(0)}%`,
        `{"bms":{"soc":${Math.round(78 - tick * 0.3)},"pack_voltage_v":${(320 + Math.sin(tick * 0.1) * 10).toFixed(1)},"pack_current_a":${(15 + Math.sin(tick * 0.2) * 5).toFixed(1)},"pack_temp_c":${(28 + Math.sin(tick * 0.05) * 4).toFixed(1)}}}`,
        `HEARTBEAT:${tick} UPTIME:${tick * 3}s OK`,
        `DATA:${Array.from({length: 8}, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(" ")}`,
        `MOTOR:RPM=${Math.round(1200 + Math.sin(tick * 0.15) * 300)} TEMP=${(45 + Math.sin(tick * 0.08) * 10).toFixed(0)}C LOAD=${Math.round(40 + Math.sin(tick * 0.2) * 20)}%`,
      ];

      const raw = payloads[tick % payloads.length];
      const packet: DataPacket = {
        id: generateId(),
        timestamp: new Date(),
        direction: "read",
        data: raw,
        hexView: toHex(raw),
        byteLength: raw.length,
        deviceId: device.id,
      };
      setPackets((prev) => {
        const next = [...prev, packet];
        savePackets(next);
        return next.slice(-200);
      });
    }, 2500);
  }

  async function runWebUsbReadLoop(device: UsbDevice) {
    const webDev = webUsbDeviceRef.current;
    const epIn = webUsbEndpointInRef.current;
    if (!webDev || epIn === null) return;
    while (readLoopActiveRef.current) {
      try {
        const result = await webDev.transferIn(epIn, 64);
        if (result.data && result.data.byteLength > 0) {
          const decoder = new TextDecoder();
          const raw = decoder.decode(result.data);
          const packet: DataPacket = {
            id: generateId(),
            timestamp: new Date(),
            direction: "read",
            data: raw,
            hexView: Array.from(new Uint8Array(result.data.buffer))
              .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
              .join(" "),
            byteLength: result.data.byteLength,
            deviceId: device.id,
          };
          setPackets((prev) => {
            const next = [...prev, packet];
            savePackets(next);
            return next.slice(-200);
          });
        }
      } catch {
        break;
      }
    }
  }

  const disconnectDevice = useCallback(() => {
    readLoopActiveRef.current = false;
    if (Platform.OS === "web" && webUsbDeviceRef.current) {
      const dev = webUsbDeviceRef.current;
      if (webUsbInterfaceRef.current !== null) {
        dev.releaseInterface(webUsbInterfaceRef.current).catch(() => {});
      }
      dev.close().catch(() => {});
      webUsbDeviceRef.current = null;
    }
    setDevices((prev) => prev.map((d) => ({ ...d, connected: false })));
    setSelectedDevice(null);
    setConnectionStatus("disconnected");
  }, []);

  const writeData = useCallback(async (data: string) => {
    if (!selectedDevice) return;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    if (Platform.OS === "web" && webUsbDeviceRef.current && webUsbEndpointOutRef.current !== null) {
      await webUsbDeviceRef.current.transferOut(webUsbEndpointOutRef.current, encoded);
    }
    const packet: DataPacket = {
      id: generateId(),
      timestamp: new Date(),
      direction: "write",
      data,
      hexView: Array.from(encoded)
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join(" "),
      byteLength: encoded.byteLength,
      deviceId: selectedDevice.id,
    };
    setPackets((prev) => {
      const next = [...prev, packet];
      savePackets(next);
      return next.slice(-200);
    });
  }, [selectedDevice]);

  const clearPackets = useCallback(() => {
    setPackets([]);
    AsyncStorage.removeItem("usb_packets").catch(() => {});
  }, []);

  return (
    <UsbContext.Provider
      value={{
        devices,
        selectedDevice,
        packets,
        isScanning,
        isConnecting,
        connectionStatus,
        lastError,
        viewMode,
        setViewMode,
        scanForDevices,
        connectDevice,
        disconnectDevice,
        writeData,
        clearPackets,
        selectDevice,
      }}
    >
      {children}
    </UsbContext.Provider>
  );
}

export function useUsb() {
  const ctx = useContext(UsbContext);
  if (!ctx) throw new Error("useUsb must be used within UsbProvider");
  return ctx;
}
