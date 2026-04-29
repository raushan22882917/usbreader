/**
 * USBSerialService unit tests
 *
 * Tests the JS layer of USBSerialService in isolation.
 * Native modules are mocked — no device or emulator needed.
 *
 * NOTE: USBSerialService.ts destructures NativeModules.UsbSerialModule
 * at module load time, so the mock object must be the SAME reference
 * that the service captured. We expose it via `__nativeModule` so tests
 * can call mockFn.mockResolvedValueOnce() on the right object.
 */

// Shared mock object — same reference the service will capture
// (must be named with 'mock' prefix to be accessible inside jest.mock factory)
const mockNativeModule = {
  listDevices:       jest.fn(),
  requestPermission: jest.fn(),
  connect:           jest.fn(),
  write:             jest.fn(),
  disconnect:        jest.fn(),
  addListener:       jest.fn(),
  removeListeners:   jest.fn(),
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { UsbSerialModule: mockNativeModule },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener:        jest.fn().mockReturnValue({ remove: jest.fn() }),
    removeAllListeners: jest.fn(),
  })),
}));

import USBSerialService, { UsbNativeDevice } from '../USBSerialService';

// ── Helper ───────────────────────────────────────────────────────────────────
const makeDevice = (overrides: Partial<UsbNativeDevice> = {}): UsbNativeDevice => ({
  deviceId:         1,
  vendorId:         0x10c4,
  productId:        0xea60,
  name:             '/dev/bus/usb/001/002',
  productName:      'CP2102 USB to UART',
  manufacturerName: 'Silicon Labs',
  serialNumber:     'ABC123',
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
describe('listDevices', () => {
  it('returns empty array when no devices connected', async () => {
    nativeModule.listDevices.mockResolvedValueOnce([]);
    const result = await USBSerialService.listDevices();
    expect(result).toEqual([]);
    expect(nativeModule.listDevices).toHaveBeenCalledTimes(1);
  });

  it('returns device list from native module', async () => {
    nativeModule.listDevices.mockResolvedValueOnce([makeDevice()]);
    const result = await USBSerialService.listDevices();
    expect(result).toHaveLength(1);
    expect(result[0].vendorId).toBe(0x10c4);
    expect(result[0].productName).toBe('CP2102 USB to UART');
  });

  it('returns multiple devices', async () => {
    nativeModule.listDevices.mockResolvedValueOnce([
      makeDevice({ deviceId: 1, productName: 'Device A' }),
      makeDevice({ deviceId: 2, productName: 'Device B' }),
    ]);
    const result = await USBSerialService.listDevices();
    expect(result).toHaveLength(2);
    expect(result[1].productName).toBe('Device B');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('requestPermission', () => {
  it('resolves with device when permission granted', async () => {
    nativeModule.requestPermission.mockResolvedValueOnce(makeDevice());
    const result = await USBSerialService.requestPermission(1);
    expect(result.deviceId).toBe(1);
    expect(nativeModule.requestPermission).toHaveBeenCalledWith(1);
  });

  it('rejects when permission denied', async () => {
    nativeModule.requestPermission.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(USBSerialService.requestPermission(99)).rejects.toThrow('PERMISSION_DENIED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('connect', () => {
  it('connects with default baud rate 9600', async () => {
    nativeModule.connect.mockResolvedValueOnce(makeDevice());
    const result = await USBSerialService.connect(1);
    expect(nativeModule.connect).toHaveBeenCalledWith(1, 9600);
    expect(result.deviceId).toBe(1);
  });

  it('connects with custom baud rate', async () => {
    nativeModule.connect.mockResolvedValueOnce(makeDevice());
    await USBSerialService.connect(1, 115200);
    expect(nativeModule.connect).toHaveBeenCalledWith(1, 115200);
  });

  it('rejects when device not found', async () => {
    nativeModule.connect.mockRejectedValueOnce(new Error('DEVICE_NOT_FOUND'));
    await expect(USBSerialService.connect(999)).rejects.toThrow('DEVICE_NOT_FOUND');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('write', () => {
  it('sends hex data and returns bytes written', async () => {
    nativeModule.write.mockResolvedValueOnce(4);
    const sent = await USBSerialService.write('deadbeef');
    expect(nativeModule.write).toHaveBeenCalledWith('deadbeef');
    expect(sent).toBe(4);
  });

  it('rejects when not connected', async () => {
    nativeModule.write.mockRejectedValueOnce(new Error('NOT_CONNECTED'));
    await expect(USBSerialService.write('ff')).rejects.toThrow('NOT_CONNECTED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('disconnect', () => {
  it('calls native disconnect', async () => {
    nativeModule.disconnect.mockResolvedValueOnce(undefined);
    await expect(USBSerialService.disconnect()).resolves.toBeUndefined();
    expect(nativeModule.disconnect).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('onData listener', () => {
  it('registers and receives data events', () => {
    const received: string[] = [];
    const unsub = USBSerialService.onData(hex => received.push(hex));

    USBSerialService.simulateData('aabbcc');
    USBSerialService.simulateData('112233');

    expect(received).toEqual(['aabbcc', '112233']);
    unsub();
  });

  it('stops receiving after unsubscribe', () => {
    const received: string[] = [];
    const unsub = USBSerialService.onData(hex => received.push(hex));

    USBSerialService.simulateData('aabb');
    unsub();
    USBSerialService.simulateData('ccdd'); // should NOT arrive

    expect(received).toEqual(['aabb']);
  });

  it('supports multiple independent listeners', () => {
    const a: string[] = [];
    const b: string[] = [];
    const unsubA = USBSerialService.onData(h => a.push(h));
    const unsubB = USBSerialService.onData(h => b.push(h));

    USBSerialService.simulateData('ff00');

    expect(a).toEqual(['ff00']);
    expect(b).toEqual(['ff00']);
    unsubA();
    unsubB();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('simulateResponse — JSON round-trip', () => {
  it('encodes object as hex and fires onData', () => {
    const received: string[] = [];
    const unsub = USBSerialService.onData(hex => received.push(hex));

    const payload = {
      status: 'ok', seq: 1, ts: 1000,
      params: [{ addr: '0x001', val: 50, raw: 50, ok: true }],
    };
    USBSerialService.simulateResponse(payload);

    expect(received).toHaveLength(1);

    // Decode hex → string → JSON and verify round-trip
    const decoded = received[0]
      .match(/.{2}/g)!
      .map(b => String.fromCharCode(parseInt(b, 16)))
      .join('');
    expect(JSON.parse(decoded)).toEqual(payload);

    unsub();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('device attach/detach listeners', () => {
  it('onDeviceAttached fires and unsubscribes', () => {
    const events: UsbNativeDevice[] = [];
    const unsub = USBSerialService.onDeviceAttached(d => events.push(d));

    const device = makeDevice();
    (USBSerialService as any).attachListeners.forEach((cb: any) => cb(device));

    expect(events).toHaveLength(1);
    expect(events[0].productName).toBe('CP2102 USB to UART');

    unsub();
    (USBSerialService as any).attachListeners.forEach((cb: any) => cb(device));
    expect(events).toHaveLength(1); // no new events after unsub
  });

  it('onDeviceDetached fires and unsubscribes', () => {
    const events: UsbNativeDevice[] = [];
    const unsub = USBSerialService.onDeviceDetached(d => events.push(d));

    const device = makeDevice({ deviceId: 2 });
    (USBSerialService as any).detachListeners.forEach((cb: any) => cb(device));

    expect(events).toHaveLength(1);
    expect(events[0].deviceId).toBe(2);
    unsub();
  });
});
