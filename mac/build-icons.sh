#!/bin/bash
# Export browser and macOS icon sizes from the retained Pica artwork.
set -euo pipefail
cd "$(dirname "$0")/.."
MASTER="assets/branding/pica-icon-master.png"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
ICONSET="$WORK/Pica.iconset"
mkdir -p "$ICONSET" client/public
for SIZE in 16 32 128 256 512; do
    sips -z "$SIZE" "$SIZE" "$MASTER" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
    DOUBLE=$((SIZE * 2))
    sips -z "$DOUBLE" "$DOUBLE" "$MASTER" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
# Let Apple's encoder select compatible representations for every size.
# Packing PNGs into the small icp4/icp5 slots can scramble app icons in Finder.
iconutil --convert icns "$ICONSET" --output mac/App/Pica.icns
sips -z 256 256 "$MASTER" --out client/public/pica-icon.png >/dev/null
echo "Exported mac/App/Pica.icns and client/public/pica-icon.png"
