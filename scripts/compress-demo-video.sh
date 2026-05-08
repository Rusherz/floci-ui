#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: npm run demo:compress -- <input-video-path> [output-video-path]"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required but was not found in PATH"
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "Input video not found: $INPUT"
  exit 1
fi

OUTPUT="${2:-}"
if [[ -z "$OUTPUT" ]]; then
  DIRNAME="$(dirname "$INPUT")"
  BASENAME="$(basename "$INPUT")"
  STEM="${BASENAME%.*}"
  OUTPUT="$DIRNAME/${STEM}-compressed.mp4"
fi

ffmpeg -y -i "$INPUT" \
  -vf "scale=1920:1080:flags=lanczos,fps=30" \
  -c:v libx264 \
  -preset slow \
  -crf 21 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  -an \
  "$OUTPUT"

echo "Compressed video saved: $OUTPUT"
