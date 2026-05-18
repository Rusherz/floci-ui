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

echo "Prepared standalone Next.js bundle at: $OUT_DIR"
