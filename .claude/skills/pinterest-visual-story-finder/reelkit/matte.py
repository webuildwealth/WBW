"""Schritt 9: Sprecher freistellen.

Backends:
  mediapipe-multiclass  (Standard) Google MediaPipe "selfie_multiclass_256x256": Klassen Haare, Gesicht,
                        Körper, Kleidung -> Personenmaske + Gesichtsposition. CPU, ca. 20-40 ms/Frame.
  mediapipe-selfie      kleineres Modell, schneller, Haare etwas gröber.
  external              eigene Maske/Alpha-Video (--matte-video), z. B. aus CapCut, Runway, RobustVideoMatting.
  none                  keine Freistellung möglich -> Sprecher als abgerundete Bildkarte (siehe compose.py).

Verfeinerung (alle Backends außer none):
  * Guided Filter mit dem Originalbild als Führung -> Haar-/Kantendetails statt Treppenkanten
  * bewegungsadaptive zeitliche Glättung (EMA): ruhige Szenen stabil, schnelle Bewegungen folgen sofort
  * Entfernen kleiner Fehlsegmente (Zusammenhangskomponenten)
"""
import os
import urllib.request

import cv2
import numpy as np

from .util import SKILL_DIR, FrameReader, FrameWriter, log, save_json, warn

MODEL_URLS = {
    "mediapipe-multiclass": ("selfie_multiclass_256x256.tflite",
                             "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
                             "selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"),
    "mediapipe-selfie": ("selfie_segmenter.tflite",
                         "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
                         "selfie_segmenter/float16/latest/selfie_segmenter.tflite"),
}
SEG_H = 640


def model_path(backend):
    name, url = MODEL_URLS[backend]
    d = os.environ.get("REELKIT_MODELS", os.path.join(SKILL_DIR, "models"))
    p = os.path.join(d, name)
    if not os.path.exists(p):
        os.makedirs(d, exist_ok=True)
        log(f"Lade Segmentierungsmodell {name} …")
        urllib.request.urlretrieve(url, p + ".part")
        os.replace(p + ".part", p)
    return p


def guided_filter(guide, src, r=8, eps=1e-3, sub=2):
    """Fast Guided Filter (He & Sun 2015): Koeffizienten in 1/sub Auflösung, Anwendung in voller
    Auflösung -> Haar-/Kantendetails bleiben erhalten, ~4x schneller."""
    I = guide.astype(np.float32)
    h, w = I.shape
    Is = cv2.resize(I, (w // sub, h // sub), interpolation=cv2.INTER_AREA)
    ps = cv2.resize(src.astype(np.float32), (w // sub, h // sub), interpolation=cv2.INTER_AREA)
    rs = max(1, r // sub)
    k = (2 * rs + 1, 2 * rs + 1)
    mI = cv2.boxFilter(Is, -1, k)
    mp = cv2.boxFilter(ps, -1, k)
    cov = cv2.boxFilter(Is * ps, -1, k) - mI * mp
    var = cv2.boxFilter(Is * Is, -1, k) - mI * mI
    a = cov / (var + eps)
    b = mp - a * mI
    a = cv2.resize(cv2.boxFilter(a, -1, k), (w, h), interpolation=cv2.INTER_LINEAR)
    b = cv2.resize(cv2.boxFilter(b, -1, k), (w, h), interpolation=cv2.INTER_LINEAR)
    return a * I + b


def head_from_mask(m):
    """Kopfposition aus der Silhouette schätzen (für Masken ohne Gesichtsklasse):
    oberstes Band der Person -> horizontaler Schwerpunkt und Kopfbreite."""
    rows = np.nonzero((m > 0.5).any(axis=1))[0]
    if len(rows) < 20:
        return None
    top, bot = rows[0], rows[-1]
    band = m[top: top + max(10, int((bot - top) * 0.16))] > 0.5
    ys, xs = np.nonzero(band)
    if len(xs) < 20:
        return None
    x0, x1 = np.percentile(xs, [5, 95])
    head_w = max(x1 - x0, 1)
    return [float(xs.mean()), float(top + head_w * 0.62), float(head_w * 0.95), float(head_w * 0.75)]


def clean_components(m):
    binm = (m > 0.5).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(binm, connectivity=8)
    if n <= 2:
        return m
    areas = stats[1:, cv2.CC_STAT_AREA]
    keep = np.zeros(n, np.uint8)
    keep[1:] = areas >= max(areas.max() * 0.08, 200)
    region = keep[lab].astype(np.float32)
    region = cv2.dilate(region, np.ones((15, 15), np.uint8))
    region = cv2.GaussianBlur(region, (0, 0), 4)
    return m * region


class MediaPipeSegmenter:
    def __init__(self, backend):
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
        self.mp = mp
        self.multiclass = backend == "mediapipe-multiclass"
        opts = vision.ImageSegmenterOptions(
            base_options=mpt.BaseOptions(model_asset_path=model_path(backend)),
            running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True, output_category_mask=False)
        self.seg = vision.ImageSegmenter.create_from_options(opts)

    def __call__(self, rgb_small, ts_ms):
        img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb_small))
        res = self.seg.segment_for_video(img, ts_ms)
        masks = [np.squeeze(m.numpy_view()).astype(np.float32) for m in res.confidence_masks]
        if self.multiclass:
            person = 1.0 - masks[0]
            face = masks[3]
        else:
            person = masks[0] if len(masks) == 1 else masks[-1]
            face = None
        return person, face

    def close(self):
        try:
            self.seg.close()
        except Exception:
            pass


def compute_matte(work, info, backend="mediapipe-multiclass", matte_video=None, force=False):
    """Schreibt work/matte.mkv (Graustufen, verlustfrei) + work/matte_stats.json. Gibt das genutzte Backend zurück."""
    out = os.path.join(work, "matte.mkv")
    stats_p = os.path.join(work, "matte_stats.json")
    if os.path.exists(out) and os.path.exists(stats_p) and not force:
        log("Maske vorhanden (Cache)")
        from .util import load_json
        return load_json(stats_p)["backend"]
    W, H, fps = info["width"], info["height"], info["fps"]
    src = os.path.join(work, "source.mp4")

    seg = None
    ext = None
    if matte_video:
        backend = "external"
        ext = FrameReader_resized(matte_video, W, H)
    elif backend != "none":
        try:
            seg = MediaPipeSegmenter(backend)
        except Exception as e:
            warn(f"Segmentierung '{backend}' nicht verfügbar ({type(e).__name__}: {str(e)[:160]}). "
                 "Fallback: Sprecher als Bildkarte ohne Freistellung.")
            backend = "none"
    if backend == "none":
        save_json(stats_p, {"backend": "none"})
        return "none"

    sh = SEG_H
    sw = int(round(W * sh / H / 2) * 2)
    reader = FrameReader(src, W, H)
    writer = FrameWriter(out, W, H, fps, ["-c:v", "ffv1", "-pix_fmt", "gray"], gray=True)
    prev_m, prev_g = None, None
    faces, boxes = [], []
    n = 0
    for frame in reader:
        if ext is not None:
            m = ext.read()
            if m is None:
                m = prev_m * 255 if prev_m is not None else np.zeros((H, W), np.float32)
            m = m.astype(np.float32) / 255.0
            face = None
        else:
            small = cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA)
            p, face = seg(small, int(n * 1000 / fps))
            m = cv2.resize(p, (W, H), interpolation=cv2.INTER_LINEAR)
        gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
        if ext is None:
            m = guided_filter(gray, m, r=max(4, W // 140), eps=2e-3)
            m = np.clip((m - 0.25) / 0.5, 0, 1)
            m = m * m * (3 - 2 * m)  # Smoothstep: weiche, aber definierte Kante
            m = clean_components(m)
        # bewegungsadaptive zeitliche Glättung
        if prev_m is not None:
            g_small = cv2.resize(gray, (sw // 2, sh // 2))
            motion = float(np.mean(np.abs(g_small - prev_g)))
            a = float(np.clip(0.45 + motion * 12, 0.45, 1.0))
            m = a * m + (1 - a) * prev_m
            prev_g = g_small
        else:
            prev_g = cv2.resize(gray, (sw // 2, sh // 2))
        prev_m = m
        writer.write((np.clip(m, 0, 1) * 255).astype(np.uint8))
        if n % 10 == 0:
            ys, xs = np.nonzero(m > 0.5)
            if len(xs) > 100:
                boxes.append([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())])
            got = False
            if face is not None:
                fy, fx = np.nonzero(face > 0.5)
                if len(fx) > 30:
                    k = W / sw
                    faces.append([float(fx.mean() * k), float(fy.mean() * k),
                                  float((fy.max() - fy.min()) * k), float((fx.max() - fx.min()) * k)])
                    got = True
            if not got:
                hd = head_from_mask(m)
                if hd:
                    faces.append(hd)
        n += 1
        if n % 150 == 0:
            log(f"  Freistellung: {n} Frames")
    reader.close()
    writer.close()
    if ext is not None:
        ext.close()
    if seg is not None:
        seg.close()
    if not boxes:
        warn("Keine Person im Bild erkannt – Fallback auf Bildkarte.")
        save_json(stats_p, {"backend": "none"})
        return "none"
    box = np.median(np.array(boxes), axis=0).tolist()
    st = {"backend": backend, "frames": n, "person_box": box}
    if faces:
        f = np.median(np.array(faces), axis=0).tolist()
        st.update(face_cx=f[0], face_cy=f[1], face_h=f[2], face_w=f[3])
    else:  # letzte Rückfallebene: Personen-Box
        bw = box[2] - box[0]
        st.update(face_cx=(box[0] + box[2]) / 2, face_cy=box[1] + bw * 0.28, face_h=bw * 0.38, face_w=bw * 0.3)
    save_json(stats_p, st)
    log(f"Freistellung fertig ({backend}): {n} Frames, Gesicht bei ({st['face_cx']:.0f},{st['face_cy']:.0f})")
    return backend


class FrameReader_resized(FrameReader):
    """Externe Maske lesen und auf Quellgröße skalieren: Alpha-Kanal (z. B. ProRes 4444, WebM-Alpha)
    oder Luma einer Schwarz/Weiß-Maske (weiß = Person)."""

    def __init__(self, path, width, height):
        import subprocess
        from .util import run
        pix = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt",
                   "-of", "csv=p=0", path]).strip()
        has_alpha = any(t in pix for t in ("yuva", "rgba", "argb", "bgra", "abgr", "ya8", "gbrap"))
        chain = "alphaextract," if has_alpha else ""
        log(f"Externe Maske: {path} ({pix}, {'Alpha-Kanal' if has_alpha else 'Luma'})")
        self.w, self.h, self.ch = width, height, 1
        self.p = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps=30,{chain}scale={width}:{height},format=gray",
             "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE, bufsize=10 ** 8)
