#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-keystore.sh
# Generates a release keystore for signing the USB Reader APK.
# Run once, then keep release.keystore safe — losing it means you can't
# publish updates to the same app on the Play Store.
# ─────────────────────────────────────────────────────────────────────────────

set -e

KEYSTORE="android/app/release.keystore"
ALIAS="usbreader"
VALIDITY=10000   # ~27 years

if [ -f "$KEYSTORE" ]; then
  echo "⚠️  $KEYSTORE already exists. Delete it first if you want to regenerate."
  exit 1
fi

echo "🔑 Generating release keystore..."
keytool -genkeypair \
  -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity $VALIDITY \
  -storepass android \
  -keypass android \
  -dname "CN=USB Reader, OU=Mobile, O=FirstClassDelivary, L=Unknown, ST=Unknown, C=US"

echo ""
echo "✅ Keystore created at: $KEYSTORE"
echo ""
echo "Add these lines to android/gradle.properties (or pass as -P flags):"
echo "  RELEASE_STORE_FILE=release.keystore"
echo "  RELEASE_STORE_PASSWORD=android"
echo "  RELEASE_KEY_ALIAS=usbreader"
echo "  RELEASE_KEY_PASSWORD=android"
echo ""
echo "⚠️  Change the passwords above before publishing to the Play Store!"
