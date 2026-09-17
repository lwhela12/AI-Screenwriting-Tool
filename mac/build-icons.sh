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
# Pack PNG representations directly; this also works in headless build environments.
node --input-type=module - "$ICONSET" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const source = process.argv[2];
const representations = [
  ['icp4', 16, 1], ['icp5', 32, 1], ['ic07', 128, 1],
  ['ic08', 256, 1], ['ic09', 512, 1], ['ic10', 512, 2],
  ['ic11', 16, 2], ['ic12', 32, 2], ['ic13', 128, 2], ['ic14', 256, 2],
];
const chunks = representations.map(([type, size, scale]) => {
  const png = readFileSync(join(source, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([header, png]);
});
const header = Buffer.alloc(8);
header.write('icns');
header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
writeFileSync('mac/App/Pica.icns', Buffer.concat([header, ...chunks]));
NODE
sips -z 256 256 "$MASTER" --out client/public/pica-icon.png >/dev/null
echo "Exported mac/App/Pica.icns and client/public/pica-icon.png"
