#!/bin/bash
# Build the macOS app: web editor first, then the Swift shell around it.
#
#   ./build-app.sh              build Screenwriter.app (ad-hoc signed) into .build
#   ./build-app.sh --install    also copy it to /Applications
#   ./build-app.sh --check <script.fdx>   build the wrapcheck tool and run it on a script
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building the web editor..."
(cd ../client && npx vite build --logLevel warn)
rm -rf web && cp -R ../client/dist web

echo "==> Generating the Xcode project..."
xcodegen generate --quiet

DERIVED=".build"
if [ "${1:-}" = "--check" ]; then
    xcodebuild -project Screenwriter.xcodeproj -scheme wrapcheck -configuration Debug -derivedDataPath "$DERIVED" build CODE_SIGN_IDENTITY="-" -quiet
    "$DERIVED/Build/Products/Debug/wrapcheck" "$(pwd)/web" "$2"
    exit $?
fi

echo "==> Building Screenwriter.app..."
xcodebuild -project Screenwriter.xcodeproj -scheme Screenwriter -configuration Release -derivedDataPath "$DERIVED" build CODE_SIGN_IDENTITY="-" -quiet
APP="$DERIVED/Build/Products/Release/Screenwriter.app"
echo "==> Built $APP"
if [ "${1:-}" = "--install" ]; then
    rm -rf "/Applications/Screenwriter.app"
    cp -R "$APP" /Applications/
    echo "==> Installed to /Applications/Screenwriter.app"
fi
