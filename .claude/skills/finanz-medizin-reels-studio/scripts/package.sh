#!/bin/sh
# Erzeugt das installierbare ZIP-Paket (ohne Render-Ausgaben). Installation: ZIP nach ~/.claude/skills/ oder <repo>/.claude/skills/ entpacken.
set -e
cd "$(dirname "$0")/../.."
OUT="${1:-finanz-medizin-reels-studio.zip}"
rm -f "$OUT"
zip -r -q "$OUT" finanz-medizin-reels-studio -x '*/__pycache__/*' '*/output/*' '*/work/*' '*.pyc' '*/examples/*/out/*'
echo "Paket: $(pwd)/$OUT ($(du -h "$OUT" | cut -f1))"
