#!/usr/bin/env bash
# Richtet die Reels-Pipeline ein: venv, Python-Pakete, Segmentierungsmodelle, Systemtools prüfen.
#   bash scripts/setup_reels.sh            -> .venv im Skill-Ordner
#   WHISPER=medium bash scripts/setup_reels.sh   -> zusätzlich Whisper-Modell vorladen (braucht Zugriff auf huggingface.co)
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
PY="${PYTHON:-python3}"
echo "== Systemtools"
for b in ffmpeg ffprobe; do command -v $b >/dev/null || { echo "FEHLT: $b  (macOS: brew install ffmpeg | Ubuntu: sudo apt install ffmpeg)"; exit 1; }; done
if [ "$(uname)" = "Linux" ] && ! ldconfig -p 2>/dev/null | grep -q libEGL.so.1; then
  echo "FEHLT: libEGL (MediaPipe). Ubuntu/Debian: sudo apt install libegl1 libgles2 libgl1"; fi
echo "== Python-Umgebung ($SKILL/.venv)"
"$PY" -m venv "$SKILL/.venv"
"$SKILL/.venv/bin/pip" install -q --upgrade pip
"$SKILL/.venv/bin/pip" install -q -r "$SKILL/requirements-reels.txt"
echo "== Segmentierungsmodelle"
mkdir -p "$SKILL/models"
base=https://storage.googleapis.com/mediapipe-models/image_segmenter
[ -f "$SKILL/models/selfie_multiclass_256x256.tflite" ] || curl -sSfL -o "$SKILL/models/selfie_multiclass_256x256.tflite" "$base/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
[ -f "$SKILL/models/selfie_segmenter.tflite" ] || curl -sSfL -o "$SKILL/models/selfie_segmenter.tflite" "$base/selfie_segmenter/float16/latest/selfie_segmenter.tflite"
if [ -n "${WHISPER:-}" ]; then
  echo "== Whisper-Modell '$WHISPER' vorladen"
  "$SKILL/.venv/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('$WHISPER', device='cpu', compute_type='int8')" \
    || echo "WARNUNG: Whisper-Download fehlgeschlagen (huggingface.co erreichbar?). Fallback: --script oder pocketsphinx (EN)."
fi
echo "== Selbsttest"
"$SKILL/.venv/bin/python" - <<PY
import sys; sys.path.insert(0, "$SKILL")
import os; os.environ.setdefault("REELKIT_MODELS", "$SKILL/models")
from reelkit.matte import MediaPipeSegmenter
s = MediaPipeSegmenter("mediapipe-multiclass"); s.close(); print("MediaPipe OK")
PY
echo "Fertig. Start: $SKILL/.venv/bin/python $SKILL/scripts/make_reel.py ROHVIDEO.mp4 -o ausgabe --lang de"
