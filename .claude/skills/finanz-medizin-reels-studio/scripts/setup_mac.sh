#!/bin/bash
# Einrichtung auf dem Mac (Apple Silicon oder Intel), einmalig. Im Terminal:
#   bash ~/.claude/skills/finanz-medizin-reels-studio/scripts/setup_mac.sh
# Installiert: ffmpeg, Node, Python-Umgebung (~/.fm-reels/venv), Playwright+Chromium (~/.fm-reels),
# laedt die Modelle (~510 MB, ~/.cache/fm-reels) und legt ~/Videos/FinanzMedizin an.
set -e
SKILL="$(cd "$(dirname "$0")/.." && pwd)"; FM="$HOME/.fm-reels"
say(){ printf "\n\033[1m==> %s\033[0m\n" "$1"; }
if ! command -v brew >/dev/null; then
  say "Homebrew fehlt - Installation (fragt nach dem Mac-Passwort)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
fi
say "ffmpeg, Node, Python"; brew install ffmpeg node python@3.12
ffmpeg -hide_banner -filters | grep -q zscale || echo "WARNUNG: ffmpeg ohne zscale - iPhone-HDR wird nicht umgerechnet (Option --hdr aus)"
say "Python-Umgebung $FM/venv"; mkdir -p "$FM"; "$(brew --prefix python@3.12)/bin/python3.12" -m venv "$FM/venv"
"$FM/venv/bin/pip" install -q --upgrade pip; "$FM/venv/bin/pip" install -q numpy scipy sherpa-onnx mediapipe opencv-python-headless
say "Playwright + Chromium"; cd "$FM"; [ -f package.json ] || npm init -y >/dev/null; npm install --silent playwright; npx --yes playwright install chromium
say "Modelle vorladen (Spracherkennung ~490 MB, Freistellung ~17 MB)"
"$FM/venv/bin/python3" -c "import sys; sys.path.insert(0,'$SKILL/scripts'); import asr, vision; asr.ensure_model(); vision.model('seg'); vision.model('face'); print('Modelle ok')"
say "Arbeitsordner"; FM_NO_VENV=1 "$FM/venv/bin/python3" "$SKILL/scripts/fm.py" init
if [ ! -e "$HOME/.claude/skills/finanz-medizin-reels-studio" ]; then mkdir -p "$HOME/.claude/skills"; ln -s "$SKILL" "$HOME/.claude/skills/finanz-medizin-reels-studio"; fi
say "Fertig. Test:  $FM/venv/bin/python3 $SKILL/scripts/fm.py status"
