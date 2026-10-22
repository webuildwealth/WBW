#!/usr/bin/env bash
# Einmalige Einrichtung auf dem Mac (Apple Silicon oder Intel):  bash scripts/mac_setup.sh
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
FM_HOME="${FM_HOME:-$HOME/Videos/FinanzMedizin}"
command -v brew >/dev/null || { echo "Homebrew fehlt: https://brew.sh installieren, dann erneut starten."; exit 1; }
brew install ffmpeg python@3.12          # ffmpeg von Homebrew enthält zscale (HDR→SDR), libx264, aac
mkdir -p "$FM_HOME"/{original,skripte,fotos,arbeit,fertig}
python3.12 -m venv "$FM_HOME/.venv"
"$FM_HOME/.venv/bin/pip" install -q --upgrade pip
"$FM_HOME/.venv/bin/pip" install -q pillow numpy playwright faster-whisper "opencv-python-headless<5"
"$FM_HOME/.venv/bin/python" -m playwright install chromium
# Whisper-Modell einmal vorladen (~460 MB, danach offline)
"$FM_HOME/.venv/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); print('Whisper-Modell bereit')"
"$FM_HOME/.venv/bin/python" "$SKILL/scripts/setup_check.py" || true
echo
echo "Fertig. Ordner: $FM_HOME   Python: $FM_HOME/.venv/bin/python"
echo "Aufruf: $FM_HOME/.venv/bin/python $SKILL/scripts/reel.py original/IMG_1234.MOV --skript 3 --cta Vorsorge"
