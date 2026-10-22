"""Schritt 3/4/8: Inhalt analysieren und Edit Decision List (EDL) erstellen.

Bildwechsel folgen dem Inhalt, nicht einem Raster:
  * Neuer Satz mit neuem Hauptthema  -> komplette neue Collage (gestaffelt, Whoosh)
  * Neuer Satz, gleiches Thema         -> eine Zelle wechselt (Variation)
  * Schlüsselwort eines anderen Themas -> eine Zelle wechselt genau auf dieses Wort (Pop)
Die EDL (edl.json) ist editierbar; ein erneuter Lauf rendert die geänderte Fassung.
"""
import re
from collections import Counter

from .concepts import CONCEPTS, DEFAULT_CONCEPT, STYLE_QUERY_SUFFIX, STYLE_ROTATION
from .util import log

LEAD = 0.15          # Bildwechsel kommt kurz vor dem Wort
MIN_CELL_HOLD = 1.2  # Mindeststandzeit eines Bildes
MIN_EVENT_GAP = 0.8  # Mindestabstand zwischen zwei Wechseln
LONG_SCENE = 4.5     # danach eine Variations-Zelle
CELL_ORDER = [0, 1, 3, 2]  # TL, TR, BR, BL (Uhrzeigersinn)


def norm(w):
    return re.sub(r"[^\wäöüß]", "", w.lower())


def word_concept(w):
    n = norm(w)
    if len(n) < 2:
        return None, 0
    best, blen = None, 0
    for cid, c in CONCEPTS.items():
        for t in c["triggers"]:
            # "=wort" = exakter Treffer, sonst Wortanfang (deckt Beugungen ab)
            hit = n == t[1:] if t.startswith("=") else n.startswith(t)
            if hit and len(t) > blen:
                best, blen = cid, len(t)
    return best, blen


def sentences_from_words(words, max_len=6.0, min_len=1.6):
    sents, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        gap = words[i + 1]["s"] - w["e"] if i + 1 < len(words) else 9
        end_punct = w["w"][-1] in ".!?…"
        if end_punct or gap > 0.6:
            sents.append(cur)
            cur = []
    if cur:
        sents.append(cur)
    # zu lange Sätze an Kommas/Pausen teilen
    out = []
    for s in sents:
        while s[-1]["e"] - s[0]["s"] > max_len and len(s) > 4:
            best, bscore = None, -1
            for k in range(2, len(s) - 2):
                if s[k]["e"] - s[0]["s"] < 1.5:
                    continue
                score = (s[k + 1]["s"] - s[k]["e"]) + (0.5 if s[k]["w"].endswith(",") else 0)
                if score > bscore:
                    best, bscore = k, score
            if best is None:
                break
            out.append(s[: best + 1])
            s = s[best + 1:]
        out.append(s)
    # zu kurze Sätze anhängen
    merged = []
    for s in out:
        if merged and (merged[-1][-1]["e"] - merged[-1][0]["s"]) < min_len:
            merged[-1] = merged[-1] + s
        else:
            merged.append(s)
    return merged


def subtitle_chunks(words, max_words=3, max_chars=20):
    chunks, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        text = " ".join(x["w"] for x in cur)
        gap = words[i + 1]["s"] - w["e"] if i + 1 < len(words) else 9
        if len(cur) >= max_words or len(text) >= max_chars or w["w"][-1] in ".!?,;:…" or gap > 0.35:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    subs = []
    for i, c in enumerate(chunks):
        end = c[-1]["e"] + 0.25
        if i + 1 < len(chunks):
            end = min(end + 0.4, chunks[i + 1][0]["s"])
        clean = [dict(x, w=re.sub(r"[.,;:]+$", "", x["w"])) for x in c]
        subs.append({"s": round(c[0]["s"], 3), "e": round(max(end, c[-1]["e"]), 3),
                     "text": " ".join(x["w"] for x in clean), "words": clean})
    return subs


class MotifPicker:
    def __init__(self):
        self.used = Counter()
        self.style_i = 0

    def pick(self, concept, style=None, avoid=()):
        motifs = CONCEPTS[concept]["motifs"]
        ranked = sorted(range(len(motifs)), key=lambda i: (self.used[(concept, i)], i))
        for i in ranked:
            if motifs[i]["art"] not in avoid:
                break
        self.used[(concept, i)] += 1
        m = motifs[i]
        if style is None:
            style = STYLE_ROTATION[self.style_i % len(STYLE_ROTATION)]
            self.style_i += 1
        return {"concept": concept, "art": m["art"], "style": style,
                "q": f"{m['q']}", "q_style": f"{m['q']} {STYLE_QUERY_SUFFIX.get(style, '')}".strip(),
                "tags": m["tags"] + [concept], "asset": None}


def build_edl(transcript, duration, fps=30, width=1080, height=1920):
    words = transcript["words"]
    if not words:
        raise SystemExit("Transkript enthält keine Wörter.")
    sents = sentences_from_words(words)

    counts = Counter()
    for w in words:
        c, l = word_concept(w["w"])
        if c:
            counts[c] += l
    theme = counts.most_common(1)[0][0] if counts else DEFAULT_CONCEPT

    scenes = []
    prev = theme
    for i, s in enumerate(sents):
        sc = Counter()
        for w in s:
            c, l = word_concept(w["w"])
            if c:
                sc[c] += l
        concept = sc.most_common(1)[0][0] if sc else prev
        start = 0.0 if i == 0 else max(0.0, s[0]["s"] - LEAD)
        scenes.append({"id": i + 1, "start": round(start, 3), "text": " ".join(w["w"] for w in s),
                       "concept": concept, "keywords": [w["w"] for w in s if word_concept(w["w"])[0]],
                       "words": s})
        prev = concept
    for i, sc in enumerate(scenes):
        sc["end"] = scenes[i + 1]["start"] if i + 1 < len(scenes) else round(duration, 3)

    picker = MotifPicker()
    tracks = [[] for _ in range(4)]
    last_change = [-9.0] * 4
    events, sfx = [], []
    current = None
    rr = 0

    def showing():
        return {tracks[c][-1]["art"] for c in range(4) if tracks[c]}

    def place(cell, t, item, trigger, kind):
        if tracks[cell]:
            tracks[cell][-1]["end"] = round(t, 3)
        item.update({"start": round(t, 3), "end": round(duration, 3), "trigger": trigger, "anim": kind})
        tracks[cell].append(item)
        last_change[cell] = t

    last_event = -9.0
    for sc in scenes:
        t0 = sc["start"]
        if sc["concept"] != current:
            styles = STYLE_ROTATION[sc["id"] % 4:] + STYLE_ROTATION[: sc["id"] % 4]
            arts = set()
            for k, cell in enumerate(CELL_ORDER):
                it = picker.pick(sc["concept"], styles[k], avoid=arts)
                arts.add(it["art"])
                # erste Collage steht ab Frame 0 komplett (Vorschaubild), spätere blenden gestaffelt ein
                place(cell, t0 + (0.07 * k if sc["id"] > 1 else 0.0), it, sc["text"][:40], "scene")
            events.append({"t": t0, "type": "collage", "concept": sc["concept"], "scene": sc["id"]})
            sfx.append({"t": round(t0, 3), "type": "whoosh"})
            current = sc["concept"]
            last_event = t0
        elif t0 - last_event >= MIN_EVENT_GAP:
            cell = min(range(4), key=lambda c: last_change[c])
            place(cell, t0, picker.pick(sc["concept"], avoid=showing()), sc["text"][:40], "swap")
            events.append({"t": t0, "type": "swap", "cell": cell, "concept": sc["concept"], "scene": sc["id"]})
            sfx.append({"t": round(t0, 3), "type": "pop"})
            last_event = t0

        scene_events = 0
        for w in sc["words"]:
            c, _ = word_concept(w["w"])
            t = max(0.0, w["s"] - LEAD)
            if not c or c == sc["concept"] or t - last_event < MIN_EVENT_GAP or t >= sc["end"] - 0.3:
                continue
            cands = [x for x in range(4) if t - last_change[x] >= MIN_CELL_HOLD]
            if not cands:
                continue
            cell = cands[rr % len(cands)]
            rr += 1
            place(cell, t, picker.pick(c, avoid=showing()), w["w"], "swap")
            events.append({"t": round(t, 3), "type": "swap", "cell": cell, "concept": c, "trigger": w["w"],
                           "scene": sc["id"]})
            sfx.append({"t": round(t, 3), "type": "pop"})
            last_event = t
            scene_events += 1

        if scene_events == 0 and sc["end"] - sc["start"] > LONG_SCENE:
            mid_words = [w for w in sc["words"] if w["s"] > sc["start"] + (sc["end"] - sc["start"]) / 2]
            if mid_words:
                t = max(0.0, mid_words[0]["s"] - LEAD)
                cell = min(range(4), key=lambda c: last_change[c])
                if t - last_change[cell] >= MIN_CELL_HOLD:
                    place(cell, t, picker.pick(sc["concept"], avoid=showing()), mid_words[0]["w"], "swap")
                    events.append({"t": round(t, 3), "type": "swap", "cell": cell, "concept": sc["concept"],
                                   "trigger": mid_words[0]["w"], "scene": sc["id"]})
                    sfx.append({"t": round(t, 3), "type": "pop"})
                    last_event = t

    for sc in scenes:
        sc.pop("words", None)
    edl = {
        "version": 1, "fps": fps, "width": width, "height": height, "duration": round(duration, 3),
        "theme": theme, "language": transcript.get("language"), "asr_backend": transcript.get("backend"),
        "layout": {
            "type": "grid2x2",
            "face_y": 0.47,           # Gesichtsmitte (Anteil Höhe) – Kreuzpunkt liegt bei 0.5
            "face_height": 0.125,     # Gesichtshöhe relativ zur Bildhöhe
            "bust_bottom": 0.64,      # horizontale Schnittkante des Oberkörpers (wie Referenz)
            "outline_px": 9, "outline_color": [18, 18, 18], "shadow_opacity": 0.45,
            "subtitle_y": 0.60, "subtitle_size": 66, "subtitle_highlight": None,
            "grain": 0.045, "vignette": 0.35, "ken_burns": 0.08,
        },
        "scenes": scenes,
        "tracks": tracks,
        "events": events,
        "sfx": sfx,
        "subtitles": subtitle_chunks(words),
    }
    n_full = sum(1 for e in events if e["type"] == "collage")
    log(f"EDL: {len(scenes)} Szenen, {n_full} Collagen, {len(events) - n_full} Einzelwechsel, Thema '{theme}'")
    return edl


def cta_block(transcript, duration, word, text=None, min_show=2.8, tail=3.5):
    """Call-to-Action: startet beim letzten gesprochenen CTA-Wort, sonst in den letzten Sekunden."""
    n = norm(word)
    hits = [w for w in transcript["words"] if n and norm(w["w"]).startswith(n)]
    start = hits[-1]["s"] - 0.1 if hits else duration - tail
    start = max(0.0, min(start, duration - min_show))
    return {"word": word, "text": text or "Kommentiere", "start": round(start, 3), "end": round(duration, 3),
            "spoken": bool(hits)}
