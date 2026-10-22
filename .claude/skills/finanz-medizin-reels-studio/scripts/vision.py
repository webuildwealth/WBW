#!/usr/bin/env python3
"""Bildanalyse fuer den Talking-Head-Editor (mediapipe Tasks, CPU):
  - Gesichtserkennung (BlazeFace short range) -> Smart-Crop auf 9:16 und Gesicht-Schutzzone
  - Personen-Freistellung (Selfie Multiclass 256x256: Haare, Haut, Kleidung) -> weiche Alpha-Matte
  - Proxy mit Jump-Cuts, Analyse (5 fps) und finaler Durchlauf mit Zoom (30 fps) -> base.mp4 + matte.mp4
Modelle werden bei Bedarf von storage.googleapis.com/mediapipe-models geladen (~17 MB)."""
import json, os, subprocess, sys, urllib.request
from pathlib import Path
import numpy as np
import cv2

W, H, FPS = 1080, 1920, 30
MODEL_DIR = Path(os.environ.get("FM_MODELS", Path.home() / ".cache" / "fm-reels" / "models"))
MP = "https://storage.googleapis.com/mediapipe-models/"
MODELS = {"seg": "image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
          "face": "face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"}

def model(key):
    p = MODEL_DIR / Path(MODELS[key]).name
    if not p.exists():
        MODEL_DIR.mkdir(parents=True, exist_ok=True); print(f"Lade {p.name} ...", file=sys.stderr); urllib.request.urlretrieve(MP + MODELS[key], p)
    return str(p)

def probe(path):
    j = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,codec_name,pix_fmt,color_transfer,color_primaries,color_space:stream_side_data=rotation:format=duration", "-of", "json", str(path)]))
    s = j["streams"][0]; w, h = s["width"], s["height"]
    rot = 0
    for sd in s.get("side_data_list", []) or []:
        if "rotation" in sd: rot = abs(int(sd["rotation"]))
    if rot in (90, 270): w, h = h, w
    tr = s.get("color_transfer", "") or ""
    hdr = tr in ("arib-std-b67", "smpte2084") or any("dolby" in str(sd).lower() for sd in s.get("side_data_list", []) or [])
    return {"w": w, "h": h, "dur": float(j["format"]["duration"]), "codec": s.get("codec_name"), "pix_fmt": s.get("pix_fmt"), "transfer": tr, "hdr": bool(hdr)}

HDR_MODE = "mobius"   # mobius (Standard: Mitteltoene unveraendert, Spitzlichter weich) | clip | hable | aus

def color_chain(info):
    """iPhone-HDR (HLG / PQ / Dolby Vision Profil 8.4) -> SDR BT.709 per Tonemapping; SDR bleibt unveraendert.
    Ohne das wirken iPhone-Videos nach dem Export grau/ausgewaschen oder ueberstrahlt."""
    if not info or not info.get("hdr") or HDR_MODE == "aus": return ""
    tin = "arib-std-b67" if info.get("transfer") != "smpte2084" else "smpte2084"
    npl = 100 if tin == "arib-std-b67" else 203
    return (f"setparams=color_primaries=bt2020:color_trc={tin}:colorspace=bt2020nc:range=tv,"
            f"zscale=tin={tin}:pin=bt2020:min=bt2020nc:rin=tv:t=linear:npl={npl},format=gbrpf32le,zscale=p=bt709,"
            f"tonemap=tonemap={HDR_MODE}:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,")

def frames(path, w, h, fps=None, start=None, dur=None, pre=""):
    """Rohbilder (RGB) aus ffmpeg streamen."""
    cmd = ["ffmpeg", "-v", "error"]
    if start is not None: cmd += ["-ss", str(start)]
    cmd += ["-i", str(path)]
    if dur is not None: cmd += ["-t", str(dur)]
    vf = pre + f"scale={w}:{h}" + (f",fps={fps}" if fps else "")
    cmd += ["-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE); n = w * h * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        yield np.frombuffer(b, np.uint8).reshape(h, w, 3)
    p.wait()

class Face:
    def __init__(self, mode="IMAGE"):
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision as v
        self.mp, self.v = mp, v
        self.det = v.FaceDetector.create_from_options(v.FaceDetectorOptions(base_options=mpt.BaseOptions(model_asset_path=model("face")), min_detection_confidence=0.5))
    def __call__(self, rgb):
        r = self.det.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        if not r.detections: return None
        b = max(r.detections, key=lambda d: d.bounding_box.width * d.bounding_box.height).bounding_box
        # BlazeFace-Box ist eng (Augenbrauen bis Kinn) -> auf Kopf erweitern (Stirn/Haare)
        x, y, w, h = b.origin_x, b.origin_y, b.width, b.height
        return [x - 0.12 * w, y - 0.45 * h, w * 1.24, h * 1.55]

class Seg:
    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision as v
        self.mp = mp
        self.s = v.ImageSegmenter.create_from_options(v.ImageSegmenterOptions(base_options=mpt.BaseOptions(model_asset_path=model("seg")), output_confidence_masks=True, output_category_mask=False))
    def __call__(self, rgb):
        r = self.s.segment(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        return 1.0 - r.confidence_masks[0].numpy_view().astype(np.float32)   # 1 - Hintergrund = Person

def guided(I, p, r=8, eps=1e-3):
    """Fast guided filter (He et al.): Matte-Kanten an Bildkanten (Haare, Schultern) anlegen."""
    mI = cv2.boxFilter(I, -1, (r, r)); mp_ = cv2.boxFilter(p, -1, (r, r))
    cov = cv2.boxFilter(I * p, -1, (r, r)) - mI * mp_; var = cv2.boxFilter(I * I, -1, (r, r)) - mI * mI
    a = cov / (var + eps); b = mp_ - a * mI
    return cv2.boxFilter(a, -1, (r, r)) * I + cv2.boxFilter(b, -1, (r, r))

def crop_window(src, path, samples=12):
    """9:16-Ausschnitt um das (mediane) Gesicht. Hochkant-Quellen werden unveraendert skaliert."""
    sw, sh = src["w"], src["h"]
    if abs(sw / sh - 9 / 16) < 0.01: return [0, 0, sw, sh]
    face = Face(); cx, cy = [], []
    sc = 640 / max(sw, sh); fw, fh = int(sw * sc) // 2 * 2, int(sh * sc) // 2 * 2
    for i, f in enumerate(frames(path, fw, fh, fps=samples / max(1, src["dur"]), pre=color_chain(src))):
        b = face(f)
        if b: cx.append((b[0] + b[2] / 2) / sc); cy.append((b[1] + b[3] / 2) / sc)
    mx = float(np.median(cx)) if cx else sw / 2
    if sw / sh > 9 / 16:   # zu breit -> Breite beschneiden
        cw = int(sh * 9 / 16) // 2 * 2; x = int(min(max(0, mx - cw / 2), sw - cw)); return [x, 0, cw, sh]
    ch = int(sw * 16 / 9) // 2 * 2; my = float(np.median(cy)) if cy else sh / 2
    y = int(min(max(0, my - ch * 0.38), sh - ch)); return [0, y, sw, ch]   # zu hoch -> Gesicht ins obere Drittel

def make_proxy(src_path, segments, crop, out, info=None):
    """(HDR->SDR) + Jump-Cuts + 9:16-Crop + 1080x1920@30 + Ton -> proxy.mp4"""
    x, y, cw, ch = crop; n = len(segments)
    fc = f"[0:v]{color_chain(info)}split={n}" + "".join(f"[s{i}]" for i in range(n)) + ";" if n > 1 else f"[0:v]{color_chain(info)}null[s0];"
    for i, (a, b) in enumerate(segments):
        fc += f"[s{i}]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS,crop={cw}:{ch}:{x}:{y},scale={W}:{H}:flags=lanczos,fps={FPS},setsar=1[v{i}];[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={max(0, b - a - 0.012):.3f}:d=0.012[a{i}];"
    fc += "".join(f"[v{i}][a{i}]" for i in range(len(segments))) + f"concat=n={len(segments)}:v=1:a=1[v][a]"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src_path), "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "12", "-preset", "fast", "-pix_fmt", "yuv420p",
                    "-c:a", "pcm_s16le", "-ar", "48000", str(out)], check=True)

def analyze(proxy, fps=5, grid=40):
    """Gesicht + Personen-Belegung (Raster 40 px) mit 5 fps -> fuer Layout und Zoom-Planung."""
    face, seg = Face(), Seg(); T, F, M, L = [], [], [], []
    w, h = W // 2, H // 2
    for i, f in enumerate(frames(proxy, w, h, fps=fps)):
        b = face(f); T.append(i / fps); F.append([v * 2 for v in b] if b else None)
        m = seg(f); m = cv2.resize(m, (W // grid, H // grid), interpolation=cv2.INTER_AREA); M.append((m > 0.35).astype(np.uint8))
        if i % 10 == 0: L.append(float(f[: h // 2].mean()) / 255)   # Helligkeit obere Bildhaelfte (dort liegen die Overlays)
    # fehlende Gesichter interpolieren / glaetten
    idx = [i for i, b in enumerate(F) if b]
    if not idx: raise SystemExit("Kein Gesicht im Video erkannt - Talking-Head-Modus braucht ein sichtbares Gesicht.")
    arr = np.array([F[i] for i in idx]); full = np.stack([np.interp(range(len(F)), idx, arr[:, k]) for k in range(4)], 1)
    k = np.ones(5) / 5; sm = np.stack([np.convolve(np.pad(full[:, c], 2, mode="edge"), k, "valid") for c in range(4)], 1)
    return {"fps": fps, "grid": grid, "t": T, "face": sm.round(1).tolist(), "mask": np.stack(M), "bright": float(np.median(L)) if L else 0.5}

def zoom_rect(z, cx, cy):
    """Ausschnitt (x0,y0,w,h) im Proxy fuer Zoom z um (cx,cy)."""
    w, h = W / z, H / z; x0 = min(max(0, cx - w / 2), W - w); y0 = min(max(0, cy - h / 2), H - h); return x0, y0, w, h

def render_base(proxy, zoom_at, base_out, matte_out, track_out=None, preview_every=0):
    """30 fps: Zoom anwenden, freistellen (Guided Filter + zeitliche Glaettung), base.mp4 + matte.mp4 schreiben."""
    seg, face = Seg(), Face()
    enc = lambda out, pix, crf: subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", pix, "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                                  "-c:v", "libx264", "-crf", str(crf), "-preset", "fast", "-pix_fmt", "yuv420p", str(out)], stdin=subprocess.PIPE)
    eb, em = enc(base_out, "rgb24", 13), enc(matte_out, "gray", 8)
    prev = None; faces = []
    for i, f in enumerate(frames(proxy, W, H)):
        t = i / FPS; z, cx, cy = zoom_at(t)
        if z > 1.001:
            x0, y0, w, h = zoom_rect(z, cx, cy)
            f = cv2.resize(f[int(y0):int(y0 + h), int(x0):int(x0 + w)], (W, H), interpolation=cv2.INTER_CUBIC)
        small = cv2.resize(f, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        a = cv2.resize(seg(small), (W // 2, H // 2), interpolation=cv2.INTER_CUBIC)
        g = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
        a = np.clip(guided(g, np.clip(a, 0, 1), r=10, eps=2e-3), 0, 1)
        a = np.clip((a - 0.35) / 0.4, 0, 1)                       # Kontrast der Kante
        a = cv2.erode(a, np.ones((3, 3), np.uint8))                # Matte 1-2 px enger -> kein Hintergrund-Saum vor hinteren Elementen
        if prev is not None: a = np.maximum(0.8 * a + 0.2 * prev, a * 0.9)   # Flimmern daempfen ohne Nachziehen
        prev = a
        if i % 6 == 0:
            b = face(small); faces.append([t] + ([v * 2 for v in b] if b else [None] * 4))
        eb.stdin.write(np.ascontiguousarray(f).tobytes())
        em.stdin.write((cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR) * 255).astype(np.uint8).tobytes())
    for e in (eb, em): e.stdin.close(); e.wait()
    if track_out: Path(track_out).write_text(json.dumps(faces))
    return faces
