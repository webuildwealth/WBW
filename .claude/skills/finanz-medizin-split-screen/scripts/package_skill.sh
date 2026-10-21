#!/usr/bin/env bash
# Installierbares ZIP des Skills erzeugen:  bash scripts/package_skill.sh [Zielordner]
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"; NAME="$(basename "$SKILL")"; OUT="${1:-.}"
cd "$(dirname "$SKILL")"
zip -qr "$OUT/$NAME.zip" "$NAME" -x "*/__pycache__/*" "*.pyc" "*/examples/demo/*"
echo "→ $OUT/$NAME.zip ($(du -h "$OUT/$NAME.zip" | cut -f1)); Installation: nach .claude/skills/ entpacken, dann: pip install pillow numpy playwright"
