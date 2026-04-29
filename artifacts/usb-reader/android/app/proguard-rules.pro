# ── React Native / Expo ───────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ── USB Serial native module ──────────────────────────────────────────────────
# Keep our custom module so R8 doesn't strip it
-keep class com.firstclassdelivary.usbreader.UsbSerialModule { *; }
-keep class com.firstclassdelivary.usbreader.UsbSerialPackage { *; }

# Keep Android USB Host API classes (system, but be explicit)
-keep class android.hardware.usb.** { *; }

# ── Expo modules ──────────────────────────────────────────────────────────────
-keep class expo.modules.** { *; }

# ── Kotlin coroutines / reflection ────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception

# ── Keep JS bridge interfaces ─────────────────────────────────────────────────
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keepclassmembers class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keepclassmembers class * implements com.facebook.react.bridge.NativeModule { *; }

# ── Suppress warnings for missing optional deps ───────────────────────────────
-dontwarn com.facebook.react.fabric.**
-dontwarn okio.**
-dontwarn javax.annotation.**
