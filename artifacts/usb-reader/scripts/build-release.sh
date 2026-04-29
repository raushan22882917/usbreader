#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# build-release.sh
# Builds a signed release APK locally (no EAS cloud needed).
#
# Usage:
#   ./scripts/build-release.sh                  # uses defaults from gradle.properties
#   ./scripts/build-release.sh --aab            # builds AAB instead of APK (Play Store)
#   ./scripts/build-release.sh --universal      # all 4 ABIs (larger APK)
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
KEYSTORE="$ANDROID_DIR/app/release.keystore"

BUILD_AAB=false
UNIVERSAL=false

for arg in "$@"; do
  case $arg in
    --aab)       BUILD_AAB=true ;;
    --universal) UNIVERSAL=true ;;
  esac
done

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if [ ! -f "$KEYSTORE" ]; then
  echo "❌ Release keystore not found at $KEYSTORE"
  echo "   Run: ./scripts/generate-keystore.sh"
  exit 1
fi

echo "🚀 USB Reader — Release Build"
echo "   Project: $PROJECT_ROOT"
echo "   Keystore: $KEYSTORE"
echo "   Mode: $([ "$BUILD_AAB" = true ] && echo 'AAB (Play Store)' || echo 'APK (sideload)')"
echo ""

# ── Bundle JS ────────────────────────────────────────────────────────────────
echo "📦 Bundling JavaScript..."
cd "$PROJECT_ROOT"
npx expo export:embed \
  --platform android \
  --entry-file .expo/.virtual-metro-entry \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res \
  --dev false \
  --minify true 2>/dev/null || true   # expo may handle this via gradle

# ── Gradle build ─────────────────────────────────────────────────────────────
cd "$ANDROID_DIR"

ARCH_FLAG=""
if [ "$UNIVERSAL" = false ]; then
  ARCH_FLAG="-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"
fi

if [ "$BUILD_AAB" = true ]; then
  echo "🔨 Building AAB..."
  ./gradlew bundleRelease $ARCH_FLAG \
    -PRELEASE_STORE_FILE=release.keystore \
    -PRELEASE_STORE_PASSWORD="${RELEASE_STORE_PASSWORD:-android}" \
    -PRELEASE_KEY_ALIAS="${RELEASE_KEY_ALIAS:-usbreader}" \
    -PRELEASE_KEY_PASSWORD="${RELEASE_KEY_PASSWORD:-android}"

  OUTPUT="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
  echo ""
  echo "✅ AAB built: $OUTPUT"
else
  echo "🔨 Building APK..."
  ./gradlew assembleRelease $ARCH_FLAG \
    -PRELEASE_STORE_FILE=release.keystore \
    -PRELEASE_STORE_PASSWORD="${RELEASE_STORE_PASSWORD:-android}" \
    -PRELEASE_KEY_ALIAS="${RELEASE_KEY_ALIAS:-usbreader}" \
    -PRELEASE_KEY_PASSWORD="${RELEASE_KEY_PASSWORD:-android}"

  OUTPUT="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
  echo ""
  echo "✅ APK built: $OUTPUT"
  echo ""
  echo "📲 Install on connected device:"
  echo "   adb install -r $OUTPUT"
fi
