#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/desktop/src-tauri/resources/next"

cd "$ROOT_DIR"

npm run build

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp -R .next/standalone/* "$OUT_DIR/"
mkdir -p "$OUT_DIR/.next"
cp -R .next/static "$OUT_DIR/.next/static"
cp -R public "$OUT_DIR/public"

# AppImage bundling runs on glibc; keep only glibc sharp binaries.
rm -rf \
  "$OUT_DIR/node_modules/@img/sharp-linuxmusl-x64" \
  "$OUT_DIR/node_modules/@img/sharp-libvips-linuxmusl-x64"

echo "Prepared standalone Next.js bundle at: $OUT_DIR"
