package com.autonxt.usbreader

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class UsbSerialModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val usbManager =
    reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
  private var serialPort: UsbSerialPort? = null
  private val readExecutor = Executors.newSingleThreadExecutor()
  private val reading = AtomicBoolean(false)
  private var permissionPromise: Promise? = null
  private var permissionDeviceId: Int? = null

  private val usbReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        ACTION_USB_PERMISSION -> {
          val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
          val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
          val promise = permissionPromise
          val expectedId = permissionDeviceId
          permissionPromise = null
          permissionDeviceId = null

          if (promise == null || device == null || device.deviceId != expectedId) return

          if (granted) {
            promise.resolve(deviceToMap(device))
          } else {
            promise.reject("PERMISSION_DENIED", "USB permission denied by user")
          }
        }

        UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
          val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
          sendEvent("UsbDeviceAttached", deviceToMap(device))
        }

        UsbManager.ACTION_USB_DEVICE_DETACHED -> {
          val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
          if (serialPort?.driver?.device?.deviceId == device.deviceId) {
            stopReading()
            try {
              serialPort?.close()
            } catch (_: Exception) {
            }
            serialPort = null
          }
          sendEvent("UsbDeviceDetached", deviceToMap(device))
        }
      }
    }
  }

  init {
    val filter = IntentFilter().apply {
      addAction(ACTION_USB_PERMISSION)
      addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
      addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(usbReceiver, filter)
    }
  }

  override fun getName(): String = "UsbSerialModule"

  override fun invalidate() {
    stopReading()
    try {
      serialPort?.close()
    } catch (_: Exception) {
    }
    serialPort = null
    try {
      reactContext.unregisterReceiver(usbReceiver)
    } catch (_: Exception) {
    }
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter
  }

  @ReactMethod
  fun listDevices(promise: Promise) {
    try {
      val seen = linkedSetOf<Int>()
      val result = Arguments.createArray()

      UsbSerialProber.getDefaultProber().findAllDrivers(usbManager).forEach { driver ->
        val device = driver.device
        if (seen.add(device.deviceId)) {
          Log.d(TAG, "listDevices driver vid=${device.vendorId} pid=${device.productId} id=${device.deviceId}")
          result.pushMap(deviceToMap(device))
        }
      }

      usbManager.deviceList.values.forEach { device ->
        if (seen.add(device.deviceId)) {
          Log.d(TAG, "listDevices raw vid=${device.vendorId} pid=${device.productId} id=${device.deviceId}")
          result.pushMap(deviceToMap(device))
        }
      }

      Log.d(TAG, "listDevices found ${result.size()} device(s)")
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("LIST_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun requestPermission(deviceId: Int, promise: Promise) {
    try {
      val device = findDevice(deviceId)
        ?: return promise.reject("DEVICE_NOT_FOUND", "USB device $deviceId not found")

      if (usbManager.hasPermission(device)) {
        promise.resolve(deviceToMap(device))
        return
      }

      if (permissionPromise != null) {
        promise.reject("PERMISSION_IN_PROGRESS", "Another USB permission request is in progress")
        return
      }

      permissionPromise = promise
      permissionDeviceId = deviceId

      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }

      val intent = PendingIntent.getBroadcast(
        reactContext,
        deviceId,
        Intent(ACTION_USB_PERMISSION).setPackage(reactContext.packageName),
        flags,
      )
      Log.d(TAG, "requestPermission deviceId=$deviceId vid=${device.vendorId} pid=${device.productId}")
      usbManager.requestPermission(device, intent)
    } catch (e: Exception) {
      permissionPromise = null
      permissionDeviceId = null
      promise.reject("PERMISSION_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun connect(deviceId: Int, baudRate: Int, promise: Promise) {
    try {
      stopReading()
      try {
        serialPort?.close()
      } catch (_: Exception) {
      }
      serialPort = null

      val device = findDevice(deviceId)
        ?: return promise.reject("DEVICE_NOT_FOUND", "USB device $deviceId not found")

      if (!usbManager.hasPermission(device)) {
        return promise.reject("PERMISSION_DENIED", "USB permission not granted")
      }

      val driver = UsbSerialProber.getDefaultProber().probeDevice(device)
        ?: return promise.reject(
          "NO_DRIVER",
          "No USB serial driver found for this device (VID:${device.vendorId}, PID:${device.productId})",
        )

      val connection = usbManager.openDevice(device)
        ?: return promise.reject("OPEN_FAILED", "Failed to open USB device")

      val port = driver.ports[0]
      port.open(connection)
      port.setParameters(
        baudRate,
        8,
        UsbSerialPort.STOPBITS_1,
        UsbSerialPort.PARITY_NONE,
      )
      try {
        port.dtr = true
        port.rts = true
      } catch (_: Exception) {
      }

      serialPort = port
      startReading()
      promise.resolve(deviceToMap(device))
    } catch (e: Exception) {
      stopReading()
      try {
        serialPort?.close()
      } catch (_: Exception) {
      }
      serialPort = null
      promise.reject("CONNECT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun write(hexData: String, promise: Promise) {
    try {
      val port = serialPort
        ?: return promise.reject("NOT_CONNECTED", "No USB serial connection open")

      val clean = hexData.replace("\\s".toRegex(), "")
      if (clean.isEmpty() || clean.length % 2 != 0) {
        return promise.reject("INVALID_HEX", "Hex payload must have even length")
      }

      val bytes = ByteArray(clean.length / 2)
      for (i in bytes.indices) {
        bytes[i] = clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
      }

      port.write(bytes, WRITE_TIMEOUT_MS)
      promise.resolve(bytes.size)
    } catch (e: Exception) {
      promise.reject("WRITE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    try {
      stopReading()
      try {
        serialPort?.close()
      } catch (_: Exception) {
      }
      serialPort = null
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("DISCONNECT_ERROR", e.message, e)
    }
  }

  private fun findDevice(deviceId: Int): UsbDevice? {
    return usbManager.deviceList.values.find { it.deviceId == deviceId }
  }

  private fun deviceToMap(device: UsbDevice): WritableMap {
    return Arguments.createMap().apply {
      putInt("deviceId", device.deviceId)
      putInt("vendorId", device.vendorId)
      putInt("productId", device.productId)
      putString("name", device.deviceName ?: "")
      putString("productName", safeUsbString { device.productName })
      putString("manufacturerName", safeUsbString { device.manufacturerName })
      putString("serialNumber", safeUsbString { device.serialNumber })
    }
  }

  /** UsbDevice string fields throw SecurityException until permission is granted. */
  private fun safeUsbString(read: () -> String?): String {
    return try {
      read() ?: ""
    } catch (_: SecurityException) {
      ""
    }
  }

  private fun startReading() {
    if (!reading.compareAndSet(false, true)) return

    readExecutor.execute {
      val buffer = ByteArray(512)
      while (reading.get()) {
        val port = serialPort ?: break
        try {
          val len = port.read(buffer, READ_TIMEOUT_MS)
          if (len > 0) {
            val hex = buildString(len * 2) {
              for (i in 0 until len) {
                append(String.format("%02x", buffer[i]))
              }
            }
            sendEvent("UsbSerialDataReceived", hex)
          }
        } catch (_: Exception) {
          break
        }
      }
      reading.set(false)
    }
  }

  private fun stopReading() {
    reading.set(false)
  }

  private fun sendEvent(eventName: String, params: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  private fun sendEvent(eventName: String, params: String) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  companion object {
    private const val TAG = "UsbSerialModule"
    private const val ACTION_USB_PERMISSION = "com.autonxt.usbreader.USB_PERMISSION"
    private const val READ_TIMEOUT_MS = 200
    private const val WRITE_TIMEOUT_MS = 2000
  }
}
