#!/usr/bin/env python3
"""Storyboard-Werkzeuge: Wörter schätzen, Szenen an Sprache verankern, Zahlen prüfen.

  storyboard.py resolve story.json [--words words.json] -o resolved.json
  storyboard.py check   resolved.json
  storyboard.py table   resolved.json

Autorenformat (story.json):
  meta{title,fps,ratio,subtitles{max_words}}, script, figures{}, assumptions[], derived[], scenes[]
  Szene: {id, at:"Phrase im Gesagten", type, props{}, transition, callouts[], keywords[], sfx[]}
  'at' verankert den Szenenbeginn am ersten Wort der Phrase (Suche ab der vorigen Szene) – dadurch bleibt die
  Visualisierung auch bei neu aufgenommener Sprache synchron. Alternativ: 'start' (Sekunden) direkt angeben.
"""
import argparse, ast, json, math, operator, re, sys, pathlib

SCENE_TYPES = {"title", "character", "counter", "stat", "gap_bars", "inflation", "timeline", "myth", "compare", "bullets", "image", "svg"}
REQUIRED = {"title": ["line1"], "counter": ["to"], "stat": ["to"], "gap_bars": ["bars"], "myth": ["text"], "compare": ["left", "right"],
            "bullets": ["items"], "image": ["src"], "timeline": ["from", "to"], "inflation": [], "character": [], "svg": ["layers"]}
TRANSITIONS = {"cut", "fade", "slide", "zoom", "wipe", "push"}


# ---------- Wörter ----------
def estimate_words(script, wps=2.7, start=0.0):
    """Grobe Zeitschätzung (Modus C ohne Audio). Ersetzt KEINE echte Transkription."""
    toks = script.split()
    t, out = start, []
    for tok in toks:
        letters = len(re.sub(r"[^\wäöüÄÖÜß]", "", tok)) or 1
        d = 0.16 + 0.052 * letters
        out.append({"w": tok, "s": round(t, 3), "e": round(t + d, 3)})
        t += d + (0.30 if re.search(r"[.!?]$", tok) else 0.14 if re.search(r"[,;:]$", tok) else 0.03)
    return out


def norm(s):
    return re.sub(r"[^\wäöüß€%0-9]", "", s.lower())


def find_phrase(words, phrase, from_idx):
    ph = [norm(x) for x in phrase.split() if norm(x)]
    for i in range(from_idx, len(words) - len(ph) + 1):
        if all(norm(words[i + k]["w"]) == ph[k] for k in range(len(ph))):
            return i
    return -1


# ---------- Auflösen ----------
def absolutize(sb, base):
    """Relative Bildpfade (props.src) relativ zur Storyboard-Datei in absolute Pfade umwandeln."""
    for sc in sb.get("scenes", []):
        p = sc.get("props", {})
        src = p.get("src")
        if src and not src.startswith(("http", "file:", "data:")) and not pathlib.Path(src).is_absolute():
            p["src"] = str((pathlib.Path(base) / src).resolve())
    return sb



def resolve(sb, words=None, tail=0.6):
    if words is None:
        words = sb.get("words") or estimate_words(sb.get("script", ""))
    sb["words"] = words
    meta = sb.setdefault("meta", {})
    dur = meta.get("duration") or round(words[-1]["e"] + tail, 3)
    cursor, last_start = 0, 0.0
    scenes = sb["scenes"]
    for i, sc in enumerate(scenes):
        if "start" in sc and "at" not in sc:
            st = float(sc["start"])
        elif i == 0:
            st = 0.0
        else:
            idx = find_phrase(words, sc["at"], cursor)
            if idx < 0:
                sys.exit(f"Szene '{sc.get('id', i)}': Anker '{sc['at']}' im Gesagten nicht gefunden (ab Wort {cursor}).")
            cursor = idx
            st = max(words[idx]["s"] - sc.get("lead", 0.12), last_start + 0.4)  # Bild leicht VOR dem Wort
        sc["start"] = round(st, 3)
        last_start = st
    for i, sc in enumerate(scenes):
        sc["end"] = round(scenes[i + 1]["start"] if i + 1 < len(scenes) else dur, 3)
        if sc["end"] <= sc["start"]:
            sys.exit(f"Szene {sc.get('id', i)} hat keine Dauer.")
    meta["duration"] = dur
    return sb


# ---------- Zahlenprüfung ----------
_ops = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg}


def safe_eval(expr):
    def ev(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _ops:
            return _ops[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in _ops:
            return _ops[type(n.op)](ev(n.operand))
        raise ValueError("unerlaubter Ausdruck")
    return ev(ast.parse(expr, mode="eval").body)


def parse_numbers(text):
    """Zahlen aus deutschem Text: 6.000 -> 6000, 44,6 -> 44.6"""
    out = []
    for m in re.finditer(r"(?<![\w.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?", text):
        i = m.group(1).replace(".", "")
        out.append(float(i + ("." + m.group(2) if m.group(2) else "")))
    return out


NUMWORDS = {"zwei": 2, "drei": 3, "vier": 4, "fünf": 5, "sechs": 6, "sieben": 7, "acht": 8, "neun": 9, "zehn": 10, "elf": 11, "zwölf": 12,
            "zwanzig": 20, "dreißig": 30, "vierzig": 40, "fünfzig": 50, "hundert": 100, "tausend": 1000, "eins": 1,
            "erstens": 1, "zweitens": 2, "drittens": 3, "viertens": 4, "fünftens": 5, "erste": 1, "zweite": 2, "dritte": 3, "vierte": 4, "fünfte": 5,
            "erster": 1, "zweiter": 2, "dritter": 3, "ersten": 1, "zweiten": 2, "dritten": 3, "hälfte": 50, "halb": 0.5}


def allowed_numbers(sb):
    ok = {}
    for n in parse_numbers(sb.get("script", "")):
        ok[n] = "Skript"
    for w in re.findall(r"[a-zäöüß]+", sb.get("script", "").lower()):
        if w in NUMWORDS:
            ok.setdefault(float(NUMWORDS[w]), "Skript (Zahlwort)")
    for a in sb.get("assumptions", []):
        ok[float(a["value"])] = "Annahme" + ("" if a.get("approved") else " (NICHT freigegeben)")
    return ok


def check(sb):
    errs, warns = [], []
    ok = allowed_numbers(sb)
    for d in sb.get("derived", []):
        try:
            v = safe_eval(d["formula"])
        except Exception as e:
            errs.append(f"derived '{d.get('formula')}': {e}")
            continue
        dec = d.get("decimals", 0)
        if round(v, dec) != round(float(d["value"]), dec):
            errs.append(f"derived: {d['formula']} = {v:.4f}, angegeben {d['value']}")
        for opnd in re.findall(r"\d+(?:\.\d+)?", d["formula"]):
            if float(opnd) not in ok and float(opnd) != 1:
                errs.append(f"derived '{d['formula']}': Operand {opnd} weder im Skript noch als Annahme deklariert")
        ok[round(float(d["value"]), dec)] = "berechnet"
    for a in sb.get("assumptions", []):
        if not a.get("approved"):
            warns.append(f"Annahme {a['value']} {a.get('unit', '')} ('{a.get('text', '')}') ist nicht freigegeben – vor Veröffentlichung klären.")

    def known(n):
        return any(abs(n - k) < 1e-6 or abs(round(n, 1) - k) < 1e-6 or abs(round(n) - k) < 1e-6 for k in ok)

    t_prev = None
    for sc in sb["scenes"]:
        sid = sc.get("id", "?")
        p = sc.get("props", {})
        if sc["type"] not in SCENE_TYPES:
            errs.append(f"{sid}: unbekannter Typ {sc['type']}")
            continue
        for r in REQUIRED[sc["type"]]:
            if r not in p:
                errs.append(f"{sid}: props.{r} fehlt")
        if sc.get("transition", "push") not in TRANSITIONS:
            errs.append(f"{sid}: unbekannter Übergang")
        if t_prev is not None and abs(sc["start"] - t_prev) > 1e-3:
            errs.append(f"{sid}: Lücke/Überlappung")
        t_prev = sc["end"]
        if sc["end"] - sc["start"] < 0.9:
            warns.append(f"{sid}: nur {sc['end'] - sc['start']:.2f}s sichtbar – zu kurz zum Erfassen?")
        if sc["end"] - sc["start"] > 9:
            warns.append(f"{sid}: {sc['end'] - sc['start']:.1f}s ohne Bildwechsel – zusätzliche Veränderung/Callout einplanen.")
        # Zahlen in Texten
        texts = []
        def walk(x):
            if isinstance(x, str): texts.append(x)
            elif isinstance(x, dict): [walk(v) for k, v in x.items() if k not in ("src", "tone", "mark", "figure", "env", "envTo", "pose", "mood", "unit", "credit", "query", "svg", "origin", "bg")]
            elif isinstance(x, list): [walk(v) for v in x]
        walk(p)
        for L in p.get("layers", []) if sc["type"] == "svg" else []:  # nur sichtbarer SVG-Text zählt, nicht Koordinaten
            texts += [re.sub(r"<[^>]+>", "", m) for m in re.findall(r"<text[^>]*>(.*?)</text>", L.get("svg", ""), re.S)]
        for t in texts:
            for n in parse_numbers(t):
                if 1900 <= n <= 2100 or n <= 0:
                    continue
                if not known(n):
                    errs.append(f"{sid}: Zahl {n:g} im Text '{t[:40]}' ist weder im Skript noch als Annahme/Berechnung belegt")
        # numerische Props
        nums = []
        if sc["type"] in ("counter", "stat"):
            nums += [("to", p.get("to")), ("from", p.get("from"))]
        if sc["type"] == "gap_bars":
            nums += [(f"bar{i}", b["value"]) for i, b in enumerate(p.get("bars", []))]
            if len(p.get("bars", [])) >= 2:
                ok[abs(p["bars"][0]["value"] - p["bars"][1]["value"])] = "Differenz"
        if sc["type"] == "inflation":
            nums += [("amount", p.get("amount", 100)), ("rate", p.get("rate", 3)), ("years", p.get("years", 20))]
        if sc["type"] == "character" and p.get("badge") and "value" in p["badge"]:
            nums.append(("badge", p["badge"]["value"]))
        for name, v in nums:
            if v in (None, 0):
                continue
            if not known(float(v)):
                errs.append(f"{sid}: {name}={v} ist weder im Skript noch als Annahme/Berechnung belegt")
    return errs, warns


def table(sb):
    print(f"Dauer {sb['meta']['duration']:.1f}s, {len(sb['scenes'])} Szenen, {len(sb['words'])} Wörter")
    for sc in sb["scenes"]:
        ws = [w["w"] for w in sb["words"] if sc["start"] - 0.05 <= w["s"] < sc["end"]]
        print(f"{sc['start']:6.2f}–{sc['end']:6.2f}  {sc.get('id', ''):4} {sc['type']:10} {sc.get('transition', 'push'):6} | {' '.join(ws)[:70]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["resolve", "check", "table"])
    ap.add_argument("file")
    ap.add_argument("--words")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()
    sb = json.loads(pathlib.Path(a.file).read_text(encoding="utf-8"))
    if a.cmd == "resolve":
        absolutize(sb, pathlib.Path(a.file).resolve().parent)
        words = json.loads(pathlib.Path(a.words).read_text(encoding="utf-8")) if a.words else None
        if isinstance(words, dict):
            words = words["words"]
        sb = resolve(sb, words)
        out = a.out or a.file
        pathlib.Path(out).write_text(json.dumps(sb, ensure_ascii=False, indent=1), encoding="utf-8")
        table(sb)
        errs, warns = check(sb)
    elif a.cmd == "table":
        table(sb)
        return
    else:
        errs, warns = check(sb)
    for w in warns: print("WARNUNG:", w)
    for e in errs: print("FEHLER:", e)
    print("OK" if not errs else f"{len(errs)} Fehler")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
