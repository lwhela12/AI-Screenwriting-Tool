#!/bin/bash
# Build the macOS app: web editor first, then the Swift shell around it.
#
#   ./build-app.sh              build Pica.app (ad-hoc signed) into .build
#   ./build-app.sh --install    also copy it to /Applications
#   ./build-app.sh --check <script.fdx>   build the wrapcheck tool and run it on a script
#
# PICA_MARKETING_VERSION and PICA_BUILD_NUMBER, when set (release-app.sh sets
# both), override the version and build number in project.yml.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building the web editor..."
(cd ../client && npx vite build --logLevel warn)
rm -rf web && cp -R ../client/dist web

echo "==> Generating the Xcode project..."
xcodegen generate --quiet

DERIVED=".build"
if [ "${1:-}" = "--check" ]; then
    xcodebuild -project Pica.xcodeproj -scheme wrapcheck -configuration Debug -derivedDataPath "$DERIVED" build CODE_SIGN_IDENTITY="-" -quiet
    "$DERIVED/Build/Products/Debug/wrapcheck" "$(pwd)/web" "$2"
    exit $?
fi

VERSION_SETTINGS=()
[ -n "${PICA_MARKETING_VERSION:-}" ] && VERSION_SETTINGS+=("MARKETING_VERSION=$PICA_MARKETING_VERSION")
[ -n "${PICA_BUILD_NUMBER:-}" ] && VERSION_SETTINGS+=("CURRENT_PROJECT_VERSION=$PICA_BUILD_NUMBER")

echo "==> Building Pica.app..."
xcodebuild -project Pica.xcodeproj -scheme Pica -configuration Release -derivedDataPath "$DERIVED" build CODE_SIGN_IDENTITY="-" ${VERSION_SETTINGS[@]+"${VERSION_SETTINGS[@]}"} -quiet
APP="$DERIVED/Build/Products/Release/Pica.app"
echo "==> Built $APP"
if [ "${1:-}" = "--install" ]; then
    rm -rf "/Applications/Pica.app"
    cp -R "$APP" /Applications/
    echo "==> Installed to /Applications/Pica.app"
fi
