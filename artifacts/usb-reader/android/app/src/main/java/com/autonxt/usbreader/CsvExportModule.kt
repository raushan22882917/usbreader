package com.autonxt.usbreader

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

class CsvExportModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CsvExportModule"

  @ReactMethod
  fun saveToDownloads(fileName: String, content: String, promise: Promise) {
    try {
      val resolver = reactContext.contentResolver
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val contentValues = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, "text/csv")
          put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val uri: Uri? = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
        if (uri == null) {
          promise.reject("CREATE_FAILED", "Failed to create file in Downloads")
          return
        }
        resolver.openOutputStream(uri)?.use { outputStream ->
          outputStream.write(content.toByteArray(Charsets.UTF_8))
        }
        promise.resolve(uri.toString())
      } else {
        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!downloadsDir.exists()) {
          downloadsDir.mkdirs()
        }
        val file = File(downloadsDir, fileName)
        FileOutputStream(file).use { outputStream ->
          outputStream.write(content.toByteArray(Charsets.UTF_8))
        }
        promise.resolve(file.absolutePath)
      }
    } catch (e: Exception) {
      promise.reject("SAVE_FAILED", e.message ?: "Unknown error saving CSV file", e)
    }
  }
}
