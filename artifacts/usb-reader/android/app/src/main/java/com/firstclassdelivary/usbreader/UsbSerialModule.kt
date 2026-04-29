package com.firstclassdelivary.usbreader

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class UsbSerialModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "UsbSerialModule"
        private const val ACTION_USB_PERMISSION = "com.firstclassdelivary.usbreader.USB_PERMISSION"
        private const val EVENT_DATA_RECEIVED   = "UsbSerialDataReceived"
        private const val EVENT_DEVICE_ATTACHED = "UsbDeviceAttached"
        private const val EVENT_DEVICE_DETACHED = "UsbDeviceDetached"
        private const val READ_BUFFER_SIZE      = 4096
        private const val PERMISSION_TIMEOUT_MS = 30_000L  // 30 s
    }

    private val usbManager: UsbManager by lazy {
        reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
    }

    private var usbDevice: UsbDevice?               = null
    private var usbConnection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface?         = null
    private var endpointIn: UsbEndpoint?            = null
    private var endpointOut: UsbEndpoint?           = null
    private var readThread: Thread?                 = null
    @Volatile private var isReading                 = false

    private val mainHandler = Handler(Looper.getMainLooper())
    private var permissionTimeoutRunnable: Runnable? = null

    // ── Permission receiver ──────────────────────────────────────────────────
    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != ACTION_USB_PERMISSION) return

            // Cancel timeout
            permissionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            permissionTimeoutRunnable = null

            val device: UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            else
                @Suppress("DEPRECATION") intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)

            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            pendingPermissionPromise?.let { promise ->
                if (granted && device != null) {
                    Log.d(TAG, "USB permission granted for ${device.deviceName}")
                    promise.resolve(deviceToMap(device))
                } else {
                    Log.w(TAG, "USB permission denied for device")
                    promise.reject("PERMISSION_DENIED",
                        "USB permission denied. Open the app, plug in the device, " +
                        "and tap 'OK' on the permission dialog.")
                }
                pendingPermissionPromise = null
            }
        }
    }

    // ── Hotplug receiver ─────────────────────────────────────────────────────
    private val hotplugReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val device: UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
            else
                @Suppress("DEPRECATION") intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
            device ?: return
            when (intent.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> emit(EVENT_DEVICE_ATTACHED, deviceToMap(device))
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    if (usbDevice?.deviceId == device.deviceId) closeConnection()
                    emit(EVENT_DEVICE_DETACHED, deviceToMap(device))
                }
            }
        }
    }

    private var pendingPermissionPromise: Promise? = null

    init {
        val permFilter = IntentFilter(ACTION_USB_PERMISSION)
        val hotFilter  = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Permission receiver is app-internal — keep it NOT_EXPORTED for security.
            reactContext.registerReceiver(permissionReceiver, permFilter, Context.RECEIVER_NOT_EXPORTED)
            // Hotplug receiver must be EXPORTED so it can receive system USB broadcasts
            // (ACTION_USB_DEVICE_ATTACHED / DETACHED are sent by the Android USB service).
            reactContext.registerReceiver(hotplugReceiver,   hotFilter,  Context.RECEIVER_EXPORTED)
        } else {
            reactContext.registerReceiver(permissionReceiver, permFilter)
            reactContext.registerReceiver(hotplugReceiver,   hotFilter)
        }
    }

    override fun getName() = "UsbSerialModule"

    // ── JS-callable methods ──────────────────────────────────────────────────

    /** List all connected USB devices */
    @ReactMethod
    fun listDevices(promise: Promise) {
        try {
            val deviceList = usbManager.deviceList
            val arr = Arguments.createArray()
            deviceList.values.forEach { arr.pushMap(deviceToMap(it)) }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("LIST_ERROR", e.message, e)
        }
    }

    /** Request permission for a device by deviceId */
    @ReactMethod
    fun requestPermission(deviceId: Int, promise: Promise) {
        val device = usbManager.deviceList.values.find { it.deviceId == deviceId }
        if (device == null) {
            promise.reject("DEVICE_NOT_FOUND", "No USB device with id $deviceId. Re-scan and try again.")
            return
        }

        // Already have permission — resolve immediately
        if (usbManager.hasPermission(device)) {
            Log.d(TAG, "Already have permission for ${device.deviceName}")
            promise.resolve(deviceToMap(device))
            return
        }

        // Cancel any previous pending request
        permissionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingPermissionPromise?.reject("PERMISSION_CANCELLED", "New permission request started")
        pendingPermissionPromise = promise

        // Set timeout so the promise doesn't hang forever if dialog is dismissed
        val timeout = Runnable {
            pendingPermissionPromise?.let {
                it.reject("PERMISSION_TIMEOUT",
                    "USB permission dialog timed out. Plug in the device and try again.")
                pendingPermissionPromise = null
            }
        }
        permissionTimeoutRunnable = timeout
        mainHandler.postDelayed(timeout, PERMISSION_TIMEOUT_MS)

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        else
            PendingIntent.FLAG_UPDATE_CURRENT

        val pi = PendingIntent.getBroadcast(reactContext, 0, Intent(ACTION_USB_PERMISSION), flags)
        Log.d(TAG, "Requesting USB permission for ${device.deviceName} (${device.vendorId.toString(16)}:${device.productId.toString(16)})")
        usbManager.requestPermission(device, pi)
    }

    /** Open connection to a device (deviceId, baudRate) */
    @ReactMethod
    fun connect(deviceId: Int, baudRate: Int, promise: Promise) {
        try {
            val device = usbManager.deviceList.values.find { it.deviceId == deviceId }
                ?: return promise.reject("DEVICE_NOT_FOUND", "No USB device with id $deviceId")

            if (!usbManager.hasPermission(device))
                return promise.reject("NO_PERMISSION", "Permission not granted for device $deviceId")

            val connection = usbManager.openDevice(device)
                ?: return promise.reject("OPEN_FAILED", "Could not open USB device")

            // Find the first bulk-transfer interface
            var iface: UsbInterface? = null
            var epIn: UsbEndpoint?   = null
            var epOut: UsbEndpoint?  = null

            outer@ for (i in 0 until device.interfaceCount) {
                val intf = device.getInterface(i)
                var tmpIn: UsbEndpoint?  = null
                var tmpOut: UsbEndpoint? = null
                for (j in 0 until intf.endpointCount) {
                    val ep = intf.getEndpoint(j)
                    if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                        if (ep.direction == UsbConstants.USB_DIR_IN)  tmpIn  = ep
                        if (ep.direction == UsbConstants.USB_DIR_OUT) tmpOut = ep
                    }
                }
                if (tmpIn != null && tmpOut != null) {
                    iface  = intf
                    epIn   = tmpIn
                    epOut  = tmpOut
                    break@outer
                }
            }

            if (iface == null || epIn == null || epOut == null) {
                connection.close()
                return promise.reject("NO_ENDPOINT", "No bulk IN/OUT endpoints found on device")
            }

            connection.claimInterface(iface, true)

            // Detect chip type by VID:PID and run the correct initialization sequence
            initChip(connection, device, baudRate)

            usbDevice     = device
            usbConnection = connection
            usbInterface  = iface
            endpointIn    = epIn
            endpointOut   = epOut

            startReadLoop()
            promise.resolve(deviceToMap(device))
        } catch (e: Exception) {
            promise.reject("CONNECT_ERROR", e.message, e)
        }
    }

    /** Write hex string to device */
    @ReactMethod
    fun write(hexData: String, promise: Promise) {
        val conn = usbConnection
        val ep   = endpointOut
        if (conn == null || ep == null) {
            promise.reject("NOT_CONNECTED", "No USB device connected")
            return
        }
        try {
            val bytes = hexStringToBytes(hexData)
            val sent  = conn.bulkTransfer(ep, bytes, bytes.size, 2000)
            if (sent < 0) promise.reject("WRITE_ERROR", "bulkTransfer returned $sent")
            else          promise.resolve(sent)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", e.message, e)
        }
    }

    /** Disconnect from current device */
    @ReactMethod
    fun disconnect(promise: Promise) {
        closeConnection()
        promise.resolve(true)
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    private fun startReadLoop() {
        isReading = true
        readThread = Thread {
            val buf = ByteArray(READ_BUFFER_SIZE)
            while (isReading) {
                val conn = usbConnection ?: break
                val ep   = endpointIn   ?: break
                val len  = conn.bulkTransfer(ep, buf, buf.size, 100)
                if (len > 0) {
                    val hex = bytesToHexString(buf, len)
                    emit(EVENT_DATA_RECEIVED, hex)
                }
            }
            Log.d(TAG, "Read loop ended")
        }.also { it.isDaemon = true; it.start() }
    }

    private fun closeConnection() {
        isReading = false
        readThread?.interrupt()
        readThread = null
        try { usbConnection?.releaseInterface(usbInterface) } catch (_: Exception) {}
        try { usbConnection?.close() } catch (_: Exception) {}
        usbDevice     = null
        usbConnection = null
        usbInterface  = null
        endpointIn    = null
        endpointOut   = null
    }

    /**
     * Detect the USB-serial chip by VID:PID and run the correct
     * initialization sequence so data actually flows.
     *
     * Supported chips:
     *   CP210x  — Silicon Labs  VID 0x10C4  (CP2102, CP2104, CP2105, CP2108…)
     *   FTDI    — FTDI          VID 0x0403  (FT232R, FT2232, FT4232…)
     *   CH34x   — WCH           VID 0x1A86  (CH340, CH341…)
     *   CDC-ACM — generic       (Arduino, STM32 VCP, etc.)
     */
    private fun initChip(conn: UsbDeviceConnection, device: UsbDevice, baud: Int) {
        val vid = device.vendorId
        val pid = device.productId
        Log.d(TAG, "initChip VID=0x${vid.toString(16)} PID=0x${pid.toString(16)} baud=$baud")

        when (vid) {
            0x10C4 -> initCP210x(conn, baud)   // Silicon Labs CP210x
            0x0403 -> initFTDI(conn, baud)     // FTDI FT232/FT2232/FT4232
            0x1A86 -> initCH34x(conn, baud)    // WCH CH340/CH341
            else   -> initCdcAcm(conn, baud)   // Generic CDC-ACM fallback
        }
    }

    // ── CP210x (Silicon Labs) ────────────────────────────────────────────────
    // Reference: https://www.silabs.com/documents/public/application-notes/AN571.pdf
    private fun initCP210x(conn: UsbDeviceConnection, baud: Int) {
        // 1. Enable UART (IFC_ENABLE = 0x0001)
        conn.controlTransfer(0x41, 0x00, 0x0001, 0, null, 0, 2000)
        // 2. Set baud rate
        val baudBytes = ByteArray(4).apply {
            this[0] = (baud and 0xFF).toByte()
            this[1] = ((baud shr 8)  and 0xFF).toByte()
            this[2] = ((baud shr 16) and 0xFF).toByte()
            this[3] = ((baud shr 24) and 0xFF).toByte()
        }
        conn.controlTransfer(0x40, 0x1E, 0, 0, baudBytes, 4, 2000)
        // 3. Set line control: 8N1 (BITS=8, PARITY=NONE, STOP=1)
        conn.controlTransfer(0x41, 0x03, 0x0800, 0, null, 0, 2000)
        // 4. Set flow control: none
        conn.controlTransfer(0x41, 0x13, 0, 0, ByteArray(16), 16, 2000)
        // 5. Set MHS (modem handshake): DTR+RTS active
        conn.controlTransfer(0x41, 0x07, 0x0303, 0, null, 0, 2000)
        Log.d(TAG, "CP210x init done @ $baud baud")
    }

    // ── FTDI FT232/FT2232/FT4232 ────────────────────────────────────────────
    // Reference: https://ftdichip.com/wp-content/uploads/2020/08/AN232B-10_Advanced_Driver_Options.pdf
    private fun initFTDI(conn: UsbDeviceConnection, baud: Int) {
        // 1. Reset device
        conn.controlTransfer(0x40, 0x00, 0x0000, 0, null, 0, 2000)
        // 2. Set baud rate divisor (simplified — works for standard rates)
        val divisor = 3000000 / baud
        conn.controlTransfer(0x40, 0x03, divisor, 0, null, 0, 2000)
        // 3. Set line properties: 8N1
        conn.controlTransfer(0x40, 0x04, 0x0008, 0, null, 0, 2000)
        // 4. Set flow control: none
        conn.controlTransfer(0x40, 0x02, 0x0000, 0, null, 0, 2000)
        // 5. Set modem control: DTR+RTS
        conn.controlTransfer(0x40, 0x01, 0x0303, 0, null, 0, 2000)
        Log.d(TAG, "FTDI init done @ $baud baud")
    }

    // ── CH340/CH341 (WCH) ────────────────────────────────────────────────────
    // Reference: https://github.com/torvalds/linux/blob/master/drivers/usb/serial/ch341.c
    private fun initCH34x(conn: UsbDeviceConnection, baud: Int) {
        // 1. Init handshake
        conn.controlTransfer(0xC0, 0x5F, 0, 0, ByteArray(8), 8, 2000)
        // 2. Reset
        conn.controlTransfer(0x40, 0xA1, 0, 0, null, 0, 2000)
        // 3. Set baud rate
        val factor: Int
        val divisor: Int
        when {
            baud >= 921600 -> { factor = 0xF3; divisor = 7 }
            baud >= 307200 -> { factor = 0xD9; divisor = 7 }
            else -> {
                val f = 1532620800L / baud
                factor = (f and 0xFF).toInt()
                divisor = ((f shr 8) and 0x07).toInt()
            }
        }
        conn.controlTransfer(0x40, 0x9A, 0x1312, (factor or (divisor shl 8)), null, 0, 2000)
        conn.controlTransfer(0x40, 0x9A, 0x0F2C, 0x0004, null, 0, 2000)
        // 4. Enable RX/TX
        conn.controlTransfer(0xC0, 0x95, 0x2518, 0, ByteArray(8), 8, 2000)
        conn.controlTransfer(0x40, 0x9A, 0x2518, 0x0050, null, 0, 2000)
        // 5. Set line control: 8N1
        conn.controlTransfer(0xC0, 0x95, 0x0706, 0, ByteArray(8), 8, 2000)
        conn.controlTransfer(0x40, 0xA4, 0xFF, 0, null, 0, 2000)
        conn.controlTransfer(0x40, 0xA4, 0xDF, 0, null, 0, 2000)
        Log.d(TAG, "CH34x init done @ $baud baud")
    }

    // ── Generic CDC-ACM fallback ─────────────────────────────────────────────
    private fun initCdcAcm(conn: UsbDeviceConnection, baud: Int) {
        val data = ByteArray(7).apply {
            this[0] = (baud and 0xFF).toByte()
            this[1] = ((baud shr 8)  and 0xFF).toByte()
            this[2] = ((baud shr 16) and 0xFF).toByte()
            this[3] = ((baud shr 24) and 0xFF).toByte()
            this[4] = 0  // 1 stop bit
            this[5] = 0  // no parity
            this[6] = 8  // 8 data bits
        }
        conn.controlTransfer(0x21, 0x20, 0, 0, data, data.size, 2000)
        // SET_CONTROL_LINE_STATE: DTR + RTS
        conn.controlTransfer(0x21, 0x22, 0x03, 0, null, 0, 2000)
        Log.d(TAG, "CDC-ACM init done @ $baud baud")
    }

    private fun emit(event: String, data: Any) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(event, data)
        } catch (e: Exception) {
            Log.e(TAG, "emit error: ${e.message}")
        }
    }

    private fun deviceToMap(device: UsbDevice): WritableMap = Arguments.createMap().apply {
        putInt("deviceId",    device.deviceId)
        putInt("vendorId",    device.vendorId)
        putInt("productId",   device.productId)
        putString("name",     device.deviceName)
        putString("productName",      if (Build.VERSION.SDK_INT >= 21) device.productName  ?: "" else "")
        putString("manufacturerName", if (Build.VERSION.SDK_INT >= 21) device.manufacturerName ?: "" else "")
        putString("serialNumber",     if (Build.VERSION.SDK_INT >= 21) device.serialNumber ?: "" else "")
    }

    private fun hexStringToBytes(hex: String): ByteArray {
        val clean = hex.replace(" ", "")
        return ByteArray(clean.length / 2) {
            clean.substring(it * 2, it * 2 + 2).toInt(16).toByte()
        }
    }

    private fun bytesToHexString(buf: ByteArray, len: Int): String =
        buf.take(len).joinToString("") { "%02x".format(it) }

    override fun onCatalystInstanceDestroy() {
        closeConnection()
        permissionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        permissionTimeoutRunnable = null
        pendingPermissionPromise?.reject("MODULE_DESTROYED", "Module was destroyed")
        pendingPermissionPromise = null
        try { reactContext.unregisterReceiver(permissionReceiver) } catch (_: Exception) {}
        try { reactContext.unregisterReceiver(hotplugReceiver)    } catch (_: Exception) {}
    }
}
