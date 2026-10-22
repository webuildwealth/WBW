#!/usr/bin/env bash
# Einrichtung für die Claude-Desktop-App auf dem Mac (läuft auch unter Linux, ohne Homebrew-Schritte).
#   bash scripts/install_mac.sh
# Ergebnis:
#   ~/.claude/skills/pinterest-visual-story-finder   Skill (Desktop-App/Claude Code finden ihn automatisch)
#   ~/Videos/FinanzMedizin/{original,skripte,bilder,musik,fertig}
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${SKILL_DEST:-$HOME/.claude/skills/pinterest-visual-story-finder}"
BASE="${REELKIT_HOME:-$HOME/Videos/FinanzMedizin}"

if [ "$(uname)" = "Darwin" ]; then
  if ! command -v brew >/dev/null; then
    echo "Homebrew fehlt. Installieren (Terminal):"
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
  fi
  command -v ffmpeg >/dev/null || brew install ffmpeg
fi

# Python >= 3.10 finden (macOS-System-Python ist zu alt)
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then PY="$(command -v $c)"; break; fi
done
if [ -z "$PY" ]; then
  if [ "$(uname)" = "Darwin" ]; then brew install python@3.12 && PY="$(brew --prefix)/bin/python3.12"
  else echo "Python >= 3.10 fehlt"; exit 1; fi
fi
echo "Python: $PY"

echo "== Skill nach $DEST kopieren"
mkdir -p "$DEST"
if [ "$SRC" != "$DEST" ]; then
  (cd "$SRC" && tar --exclude=.venv --exclude=models --exclude=__pycache__ -cf - .) | (cd "$DEST" && tar -xf -)
fi

echo "== Arbeitsordner $BASE"
mkdir -p "$BASE"/{original,skripte,bilder,musik,fertig}
[ -f "$BASE/skripte/LIESMICH.txt" ] || cat > "$BASE/skripte/LIESMICH.txt" <<'TXT'
Skripte als .txt oder .md ablegen, z. B. "3.txt" oder "03_inflation.txt".
In der Desktop-App: „Schneide original/IMG_1234.MOV, Skript 3, CTA-Wort ‚Vorsorge‘“.
Zeilen mit # sowie [Regieanweisungen] werden ignoriert.
TXT

echo "== Python-Umgebung, Modelle (Whisper ${WHISPER:-small})"
PYTHON="$PY" WHISPER="${WHISPER:-small}" bash "$DEST/scripts/setup_reels.sh"
echo
echo "Fertig. In der Claude-Desktop-App (Ordner $BASE freigeben) einfach schreiben:"
echo "  Schneide original/IMG_1234.MOV, Skript 3, CTA-Wort Vorsorge"
