#!/usr/bin/env bash
# Baut das installierbare ZIP (Ordner pinterest-visual-story-finder/ im Archiv).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
name="$(basename "$here")"
out="${1:-$here/../../../dist/$name.zip}"
mkdir -p "$(dirname "$out")"
rm -f "$out"
cd "$(dirname "$here")"
zip -r -q "$out" "$name" -x '*/__pycache__/*' '*.pyc' '*/.DS_Store'
echo "ZIP: $(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
