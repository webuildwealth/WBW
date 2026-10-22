#!/bin/sh
# Prueft Voraussetzungen des Reels Studios und installiert, was per apt/pip moeglich ist.
ok(){ printf "  [ok] %s\n" "$1"; }; miss(){ printf "  [FEHLT] %s -> %s\n" "$1" "$2"; }
echo "Finanz-Medizin Reels Studio - Setup-Check"
command -v ffmpeg >/dev/null && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 && ok "ffmpeg + libx264" || miss ffmpeg "apt-get install -y ffmpeg"
command -v node >/dev/null && ok "node $(node -v)" || miss node "https://nodejs.org (>=18)"
command -v pico2wave >/dev/null && ok "pico2wave (TTS de-DE)" || { echo "  installiere libttspico-utils ..."; (apt-get update -q && apt-get install -y -q libttspico-utils) >/dev/null 2>&1 && ok "pico2wave installiert" || miss pico2wave "apt-get install -y libttspico-utils (oder eigene Aufnahmen via scene.audio)"; }
python3 -c "import numpy,scipy" 2>/dev/null && ok "python numpy+scipy" || { pip install -q numpy scipy && ok "numpy+scipy installiert" || miss "numpy/scipy" "pip install numpy scipy"; }
for p in "$PLAYWRIGHT_MODULE" playwright /opt/node-tools/node_modules/playwright /usr/lib/node_modules/playwright; do [ -n "$p" ] && node -e "require('$p')" 2>/dev/null && { ok "playwright ($p)"; PW=1; break; }; done
[ -z "$PW" ] && miss playwright "npm i -g playwright && npx playwright install chromium   (oder PLAYWRIGHT_MODULE=/pfad, PLAYWRIGHT_BROWSERS_PATH=/pfad)"
ls "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/chromium-*/chrome-linux/chrome >/dev/null 2>&1 && ok "Chromium" || echo "  [?] Chromium nicht unter ${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} gefunden (CHROME_PATH setzen)"
python3 -c "import sherpa_onnx, mediapipe, cv2" 2>/dev/null && ok "Talking-Head: sherpa-onnx, mediapipe, opencv" || { pip install -q sherpa-onnx mediapipe opencv-python-headless && ok "Talking-Head-Pakete installiert" || miss "sherpa-onnx/mediapipe/opencv" "pip install sherpa-onnx mediapipe opencv-python-headless"; }
(ldconfig -p | grep -q libEGL.so.1) && ok "libEGL (mediapipe)" || { apt-get install -y -q libegl1 libgles2 >/dev/null 2>&1 && ok "libEGL installiert" || miss libEGL "apt-get install -y libegl1 libgles2"; }
python3 -c "import faster_whisper" 2>/dev/null && ok "faster-whisper (optional)" || echo "  [optional] faster-whisper fehlt: pip install faster-whisper (fuer exakte Wort-Timings eigener Aufnahmen)"
