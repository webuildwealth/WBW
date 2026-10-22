#!/usr/bin/env python3
"""Automatische Szenenplanung fuer Talking-Head-Reels.
Transkript (Wort-Timings) + Bildanalyse (Gesicht, Personen-Belegung) -> Plan:
  hook, Listen-/Abschnittsstruktur, Overlays (Typ, Inhalt, Zeit, Ebene vor/hinter Person, Position), Zooms, Captions, SFX.
Die Entscheidungen sind regelbasiert und deterministisch; jede Entscheidung wird im Plan begruendet ("why"),
damit Claude (oder ein Mensch) sie pruefen und ueberschreiben kann - ohne dass der Nutzer JSON anfassen muss."""
import re, unicodedata
from pathlib import Path
import numpy as np
import cv2

W, H = 1080, 1920
SAFE = dict(x0=60, x1=1020, y0=226, y1=1222, rx=960)   # y1: Oberkante Caption-Zone (1236) minus Luft; rx: rechte Button-Spalte

# ---------------------------------------------------------------- Sprache
def norm(w):
    w = w.lower().replace("ß", "ss"); w = unicodedata.normalize("NFKD", w)
    return re.sub(r"[^a-z0-9%€]", "", "".join(c for c in w if not unicodedata.combining(c)))

NUMW = {"null": 0, "ein": 1, "eins": 1, "eine": 1, "einen": 1, "zwei": 2, "drei": 3, "vier": 4, "fuenf": 5, "funf": 5, "sechs": 6, "sieben": 7, "acht": 8, "neun": 9, "zehn": 10,
        "elf": 11, "zwoelf": 12, "zwolf": 12, "zwanzig": 20, "dreissig": 30, "vierzig": 40, "fuenfzig": 50, "funfzig": 50, "sechzig": 60, "siebzig": 70, "achtzig": 80, "neunzig": 90}
def num_word(w):
    """Deutsches Zahlwort -> int (bis Millionen, z.B. 'zweihundertfuenfzigtausend'); sonst None."""
    s = norm(w).replace("ue", "u") if False else norm(w)
    s = s.replace("ü", "u")
    if not s or not re.fullmatch(r"[a-z]+", s): return None
    def parse(s):
        if not s: return 0
        for big, val in (("millionen", 10**6), ("million", 10**6), ("tausend", 1000), ("hundert", 100)):
            i = s.find(big)
            if i >= 0:
                left = parse(s[:i]) if s[:i] else 1; right = parse(s[i + len(big):])
                if left is None or right is None: return None
                return left * val + right
        if s in NUMW: return NUMW[s]
        m = re.fullmatch(r"(\w+?)und(\w+)", s)
        if m and m.group(1) in NUMW and m.group(2) in NUMW and NUMW[m.group(2)] >= 20: return NUMW[m.group(1)] + NUMW[m.group(2)]
        if s.endswith("zehn") and s[:-4] in NUMW: return NUMW[s[:-4]] + 10
        return None
    v = parse(s); return v if (v is not None and (v > 0 or s == "null")) else None

def to_number(tok):
    t = tok.strip(".,!?;:")
    m = re.fullmatch(r"(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?", t)
    if m: return float(m.group(1).replace(".", "") + ("." + m.group(2) if m.group(2) else ""))
    v = num_word(t)
    return float(v) if v is not None else None

UNIT = {"euro": "€", "€": "€", "prozent": "%", "%": "%", "jahre": "Jahre", "jahren": "Jahre", "jahr": "Jahr", "monate": "Monate", "monaten": "Monate", "monat": "Monat",
        "tausend": "Tsd.", "millionen": "Mio.", "million": "Mio."}
def numbers(words):
    """Zahlen mit Einheit aus einer Wortfolge: [{'v','unit','i','label'}]"""
    out = []
    for i, w in enumerate(words):
        v = to_number(w["w"])
        nxt = norm(words[i + 1]["w"]) if i + 1 < len(words) else ""
        if v is None or (v < 2 and not re.search(r"\d", w["w"]) and nxt not in UNIT): continue
        unit = UNIT.get(nxt, "")
        if norm(w["w"]).endswith("prozent"): unit = "%"
        if unit in ("Tsd.", "Mio."):
            v *= 1000 if unit == "Tsd." else 10**6; nn = norm(words[i + 2]["w"]) if i + 2 < len(words) else ""; unit = UNIT.get(nn, "")
        prev = norm(words[i - 1]["w"]) if i else ""
        if prev in ("nummer", "nr", "tipp", "fehler", "punkt", "platz"): continue      # Aufzaehlungsnummer, keine Kennzahl
        out.append({"v": v, "unit": unit, "i": i})
    return out

def fmt_num(v, unit):
    s = f"{v:,.0f}".replace(",", ".") if abs(v - round(v)) < 1e-6 else f"{v:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s + ({"€": " €", "%": " %"}.get(unit, (" " + unit) if unit else ""))

STOP = set("""ja also aeh ahm halt mal eben eigentlich einfach quasi sozialsagen sozusagen irgendwie schon genau okay ok naja tja und oder aber denn dann
der die das den dem des ein eine einen einem einer eines ich du er sie es wir ihr man mich dich sich mir dir uns euch mein dein sein ihr unser euer
ist sind war waren bin bist hat haben habe hast wird werden wurde wuerde wuerdest kann koennen muss muessen soll sollte solltest will wollen
zu zum zur von vom mit fuer auf an in im am aus bei nach ueber unter vor hinter neben zwischen um als wie so auch noch nur sehr ganz gar nicht kein keine
fall jeden jedem jedenfalls sagen sage gesagt""".split())
LEAD = re.compile(r"^(ja|also|und|aber|so|okay|ok|naja|genau)\b[,]?\s*", re.I)

def clean(text):
    t = text
    for _ in range(3): t = LEAD.sub("", t.strip())
    t = re.sub(r"\b(auf jeden fall|ich würde sagen|würde ich sagen|sozusagen|eigentlich|quasi|halt)\b,?\s*", "", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip(" ,")

def short(text, max_words=5):
    """Kurztext fuer Karten: Teilsatz bis Komma, Fuellwoerter raus, max. n Woerter."""
    t = clean(text).split(",")[0].strip(" .!?")
    ws = t.split()
    if len(ws) <= max_words: return t
    ws = ws[:max_words]
    while len(ws) > 2 and norm(ws[-1]) in STOP: ws.pop()
    return " ".join(ws) + " …"

def caps_run(words, start=0):
    """Folge grossgeschriebener Woerter ab Position (Eigennamen/Titel), z.B. 'The Happiness Advantage'."""
    run = []
    for w in words[start:]:
        core = w["w"].strip(".,!?;:")
        if core[:1].isupper() and norm(core) not in STOP | {"nummer", "tipp", "fehler", "letzt", "schluss"}: run.append(w)
        else: break
        if w["w"][-1:] in ",.!?:;": break
    return run

def accent(text, key_words):
    """Schluesselwoerter mit *Akzent* markieren."""
    for k in key_words:
        text = re.sub(rf"(?<![\w*])({re.escape(k)})(?![\w*])", r"*\1*", text, count=1)
    return text

# Motiv-Lexikon: Wortstamm -> Illustration (eigene SVG-Bibliothek, lizenzfrei)
MOTIF = [(r"rente|altersvorsorge|ruhestand|vorsorge|pension", "hourglass"), (r"versicher|berufsunfaehig|bu\b|absicher|schutz|risiko", "shield"),
         (r"steuer|finanzamt|absetz|abzug", "tax"), (r"etf|aktie|fonds|boerse|rendite|invest|depot|wachst|vermoegen", "chart"),
         (r"inflation|kaufkraft|geldwert|teuer", "banknote"), (r"spar|notgroschen|ruecklage|tagesgeld|konto", "piggy"), (r"zins", "coins"),
         (r"gehalt|lohn|brutto|netto|einkommen|verdien", "wallet"), (r"praxis|arzt|aerzt|klinik|patient|mfa|medizin", "stethoscope"),
         (r"immobil|haus|wohnung|miete", "house"), (r"kosten|gebuehr|provision", "receipt"), (r"buch|buech|lesen|gelesen|lektuere|almanach", "book"),
         (r"glueck|zufried|erfuell|freude|liebling", "heart"), (r"verantwortung|ownership|entscheid|kontrolle", "compass"), (r"vorteil|ziel|erfolg|gewinn", "target"),
         (r"fehler|problem|hindernis|gefahr", "warning"), (r"idee|tipp|wissen|verstehen|lernen|philosoph|denken|gedank|selbstbetracht", "bulb"),
         (r"vergleich|unterschied|versus", "scale"), (r"frist|termin|kalender|monat", "calendar"), (r"zeit|jahre|leben|langfrist", "clock")]
def motif(text):
    t = norm(text.replace(" ", "_")).replace("_", " ") if False else " ".join(norm(w) for w in text.split())
    for pat, m in MOTIF:
        if re.search(pat, t): return m
    return None

# Bildbibliothek: Datei <motiv|stichwort>.(jpg|png|webp) im Ordner --images ersetzt die Illustration
def find_image(folder, motif_, text):
    if not folder: return None
    fs = [f for f in Path(folder).iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    keys = ([motif_] if motif_ else []) + [norm(w) for w in text.split() if len(norm(w)) > 4]
    for k in keys:
        for f in fs:
            if norm(f.stem) == k or (len(k) > 5 and norm(f.stem) in k): return "file://" + str(f.resolve())
    return None
def img_credit(src):
    c = Path(src.replace("file://", "")).with_suffix(".txt")
    return c.read_text(encoding="utf-8").strip()[:80] if c.exists() else ""

# ---------------------------------------------------------------- Struktur
def sentences(words, max_len=7.0):
    out, cur = [], []
    for w in words:
        cur.append(w)
        end = w["w"][-1:] in ".!?"
        long_ = cur[-1]["t1"] - cur[0]["t0"] > max_len and w["w"][-1:] in ",;:"
        if end or long_: out.append(cur); cur = []
    if cur: out.append(cur)
    return [{"i": i, "words": s, "t0": s[0]["t0"], "t1": s[-1]["t1"], "text": " ".join(w["w"] for w in s)} for i, s in enumerate(out)]

KIND = {
    "myth": r"\b(mythos|irrtum|viele (glauben|denken|meinen)|angeblich|stimmt (das|nicht)|klischee|haeufig gehoert)\b",
    "error": r"\b(fehler|falsch|vermeide\w*|nicht machen|auf keinen fall|kostet dich|verschenk\w*|das problem)\b",
    "tip": r"\b(tipp\w*|erstens|zweitens|drittens|viertens|fuenftens|empfehl\w*|solltest|achte|pruef\w*|regel|trick)\b",
    "compare": r"\b(vs|versus|im vergleich|gegenueber|statt|anstatt|unterschied|oder lieber)\b",
    "fact": r"\b(wusstest du|fakt|tatsaechlich|studie|laut|durchschnitt\w*|statistisch|prozent der)\b",
    "cta": r"\b(folg\w*|abonnier\w*|speicher\w*|teil (das|es|dieses)|kommentar\w*|schreib mir|link in|melde dich|termin|profil)\b",
    "emph": r"\b(unglaublich|wichtig\w*|groesste\w*|niemals|immer|lieblings\w*|krass|enorm|riesig|unbedingt|muss man)\b",
}
def myth_claim(text):
    t = re.sub(r"^.*?\b(mythos|viele (glauben|denken|meinen)|man hört oft|angeblich)\b[:,]?\s*", "", clean(text), flags=re.I)
    t = re.split(r",?\s+\b(aber|doch|jedoch|allerdings)\b", t)[0]
    return short(t, 7).strip(" .,") or short(text, 6)

def kind_scores(text):
    t = " ".join(norm(w) for w in re.sub(r"[^\w\s%€]", " ", text).split())
    return {k: len(re.findall(p, t)) for k, p in KIND.items()}

ORD = {"erstens": 1, "zweitens": 2, "drittens": 3, "viertens": 4, "fuenftens": 5, "funftens": 5}
def list_marker(s):
    """Erkennt 'X Nummer 3', 'Tipp 2', 'Erstens', 'zu guter Letzt', 'als naechstes' -> (Rubrik, Nummer|None, Wortindex)"""
    ws = s["words"]; n = [norm(w["w"]) for w in ws]
    for i, t in enumerate(n):
        if t in ("nummer", "nr", "platz") and i + 1 < len(ws):
            v = to_number(ws[i + 1]["w"])
            if v: label = ws[i - 1]["w"].strip(".,:") if i and n[i - 1] not in STOP else ""; return label, int(v), i
        if t in ("tipp", "fehler", "punkt", "schritt", "mythos", "regel") and i + 1 < len(ws) and to_number(ws[i + 1]["w"]):
            return ws[i]["w"].strip(".,:").capitalize(), int(to_number(ws[i + 1]["w"])), i
        if t in ORD: return "", ORD[t], i
    j = " ".join(n)
    if re.search(r"zu guter letzt|als letztes|last but not least|zum schluss", j): return "", "last", 0
    if re.search(r"^(als naechstes|danach|ausserdem|weiter geht)", j): return "", None, 0
    return None

def announced_count(hook_words):
    for w in hook_words[:8]:
        v = to_number(w["w"])
        if v and 2 <= v <= 10: return int(v)
    return None

# ---------------------------------------------------------------- Planung
def plan(words, ana, dur, opts=None):
    opts = opts or {}; S = sentences(words)
    if not S: raise SystemExit("Leeres Transkript")
    why = []
    # Hook = erster Satz (bis ~4,5 s, sonst bis zum ersten Komma)
    hook = S[0]; hw = hook["words"]
    if hook["t1"] - hook["t0"] > 4.5:
        cut = next((k for k, w in enumerate(hw) if w["w"].endswith(",") and w["t1"] - hw[0]["t0"] > 1.5), len(hw) - 1); hw = hw[:cut + 1]
    N = announced_count(hook["words"])
    # Listen-Elemente erkennen
    items = []
    for s in S[1:]:
        m = list_marker(s)
        run = caps_run(s["words"], 0)
        starts_with_name = len(run) >= 2 and not (s["words"][0]["w"].lower() in ("muss", "kann", "sollte"))
        if m or (N and starts_with_name and len(items) < N):
            label, nr, idx = m if m else ("", None, 0)
            # Titel: Eigenname nach dem Marker ('... ist auf jeden Fall The Happiness Advantage') oder Satzanfang
            title_words, title = [], ""
            if m:
                k = idx + (2 if nr not in (None, "last") else 1)
                if nr == "last":   # 'zu guter Letzt, der Almanach ...' -> hinter die Markerphrase springen
                    k = next((j + 1 for j, w in enumerate(s["words"]) if norm(w["w"]) in ("letzt", "letztes", "schluss", "zuletzt")), k)
                sw = s["words"]
                for j in range(k, len(sw)):
                    if norm(sw[j]["w"]) in ("der", "die", "das") and j + 1 < len(sw) and sw[j + 1]["w"][:1].isupper() and (j + 2 >= len(sw) or not sw[j + 2]["w"][:1].isupper()):
                        title_words = sw[j:j + 2]; title = sw[j]["w"].capitalize() + " " + sw[j + 1]["w"].strip(".,!?")
                        if j + 3 < len(sw) and norm(sw[j + 2]["w"]) == "von":
                            r = caps_run(sw, j + 3)
                            if r: title += " von " + " ".join(w["w"] for w in r[:2]).strip(".,!?")
                        break
                    r = caps_run(sw, j)
                    if len(r) >= 2: title_words = r; break
                if not title_words:
                    rest = s["words"][k:]
                    if rest:
                        title = short(" ".join(w["w"] for w in rest), 5).strip(" .,")
                        tw = title.split()
                        while tw and not tw[-1][:1].isupper() and len(tw) > 1: tw.pop()   # nicht auf Kleinwort enden
                        title = " ".join(tw); title_words = rest[:1]
            else: title_words = run
            title = (title or " ".join(w["w"] for w in title_words)).strip(".,!?:;") or short(s["text"].split(":", 1)[-1], 4)
            after = s["text"].split(":", 1)[1] if ":" in s["text"] else " ".join(w["w"] for w in s["words"][(idx + 2 if m and nr not in (None, "last") else 0):])
            named = (len(title_words) >= 2 and all(w["w"][:1].isupper() for w in title_words) and norm(title_words[0]["w"]) not in ("der", "die", "das")) or bool(re.match(r"^(Der|Die|Das) \S+ von ", title))
            if ":" in s["text"] and not named: title = short(after, 7).strip(" .")
            items.append({"s": s["i"], "label": label, "nr": nr, "title": title, "named": named, "clause": short(after, 7).strip(" ."), "t_title": (title_words[0]["t0"] if title_words else s["t0"]), "t0": s["t0"]})
    for k, it in enumerate(items):
        if it["nr"] in (None, "last"): it["nr"] = (items[k - 1]["nr"] + 1) if k and isinstance(items[k - 1]["nr"], int) else k + 1
        if not it["label"]: it["label"] = items[k - 1]["label"] if k else ""
        it["t1"] = items[k + 1]["t0"] if k + 1 < len(items) else S[-1]["t1"]
    if items: why.append(f"Liste erkannt: {len(items)} Elemente" + (f" (angekuendigt: {N})" if N else ""))
    rubric = items[0]["label"] if items and items[0]["label"] else ""

    ov = []
    def add(**o): ov.append(o); return o
    # 1) Hook: kinetische Typo wie in der Referenz (Sans + Serif-Kursiv, Akzentwoerter), Wort fuer Wort
    hook_txt_words = [w for w in hw if norm(w["w"]) not in ("ja", "also", "aeh", "ahm")]
    keys = [w["w"].strip(".,!?") for w in hook_txt_words if w["w"][:1].isupper() and hook_txt_words.index(w) > 0][:2]
    nums = numbers(hook["words"])
    add(type="hook", t0=max(0.0, hw[0]["t0"] - 0.1), t1=min(hw[-1]["t1"] + 0.5, S[1]["t0"] - 0.05) if len(S) > 1 else hw[-1]["t1"] + 0.5, layer="auto", pref="top",
        data={"words": [{"w": w["w"], "t": round(w["t0"], 3), "serif": (w["w"].strip(".,!?") in keys) or bool(to_number(w["w"])), "ac": w["w"].strip(".,!?") in keys[1:] or bool(to_number(w["w"]))} for w in hook_txt_words]},
        why="Hook: erster Satz als Wort-fuer-Wort-Typo (Style DNA R1/R2)")
    # 2) Pro Satz Inhalt-Visualisierung waehlen
    last_types = []; side = 1; item_of = {it["s"]: it for it in items}
    def item_at(t): return next((it for it in items if it["t0"] - 0.01 <= t < it["t1"]), None)
    for s in S[1:]:
        it = item_of.get(s["i"]); sc = kind_scores(s["text"]); nm = numbers(s["words"]); d = s["t1"] - s["t0"]; cands = []
        mot = motif(s["text"]) or (motif(rubric) if it else None)
        if it:
            add(type="title", t0=s["t0"] - 0.05, t1=it["t1"] - 0.05, layer="front", pref="topleft", data={"label": it["label"] or rubric or "Tipp", "nr": f'{it["nr"]}/{max(N or 0, len(items))}' if (N or len(items)) > 1 else it["nr"], "title": it["title"] if it["named"] else ""},
                why=f"Neues Listenelement Nr. {it['nr']}: Titel + NR-Badge oben (Style DNA R3/R7)")
            lab = norm(it["label"] or rubric)
            if not it["named"]:
                typ = "error" if "fehler" in lab else "myth" if "mythos" in lab else "tip"
                data = {"title": it["clause"] or it["title"], "icon": "bulb"} if typ != "myth" else {"claim": myth_claim(s["text"]), "verdict": "Mythos?"}
                cands.append((0.94, dict(type=typ, t0=s["t0"] + 0.25, t1=min(it["t1"] - 0.1, s["t1"] + 2.5), layer="front", pref="side", data=data,
                                          why=f"Listenpunkt ohne Eigennamen -> {typ}-Karte mit der Kernaussage")))
                if mot: cands.append((0.7, dict(type="illus", t0=s["t0"] + 0.4, t1=it["t1"] - 0.1, layer="back", pref="beside_head", data={"motif": mot}, why=f"Thema des Listenpunkts -> Illustration '{mot}' hinter der Person")))
            elif it["title"] and len(it["title"].split()) <= 6:
                cands.append((0.95, dict(type="poster", t0=it["t_title"] + 0.15, t1=it["t1"] - 0.1, layer="back", pref="beside_head",
                                          data={"kicker": it["label"] or rubric, "title": it["title"], "motif": mot or "book", "tone": (["red", "navy"] if ana.get("bright", 0.5) > 0.55 else ["red", "navy", "ivory", "rose", "navy"])[(it["nr"] - 1) % (2 if ana.get("bright", 0.5) > 0.55 else 5) if isinstance(it["nr"], int) else 0]},
                                          why="Benannter Gegenstand -> eigenes Titel-Plakat hinter der Person (Referenz: Beleg erscheint ~2 s nach Blockstart hinter dem Sprecher)")))
        if sc["myth"]:
            verdict = "Falsch" if re.search(r"stimmt nicht|falsch|irrtum", s["text"], re.I) else "Mythos?"
            cands.append((0.9, dict(type="myth", t0=s["t0"], t1=s["t1"] + 0.6, layer="front", pref="side", data={"claim": myth_claim(s["text"]), "verdict": verdict}, why="Mythos-Formulierung erkannt")))
        if sc["error"] and not it and not nm:
            cands.append((0.88, dict(type="error", t0=s["t0"] + 0.1, t1=s["t1"] + 0.5, layer="front", pref="side", data={"title": short(s["text"], 5)}, why="Fehler-Formulierung erkannt -> rote Karte")))
        pair = next(((x, y) for k, x in enumerate(nm) for y in nm[k + 1:] if x["unit"] == y["unit"] and x["unit"] in ("€", "%")), None)
        if pair:
            a, b = pair
            cands.append((0.93, dict(type="bars", t0=s["words"][a["i"]]["t0"] - 0.1, t1=s["t1"] + 0.8, layer="back", pref="beside_head",
                                      data={"bars": [{"v": a["v"], "label": fmt_num(a["v"], a["unit"]), "at": 0.0}, {"v": b["v"], "label": fmt_num(b["v"], b["unit"]), "at": round(s["words"][b["i"]]["t0"] - s["words"][a["i"]]["t0"], 2)}]},
                                      why="Zwei vergleichbare Zahlen -> Mini-Balkendiagramm")))
        elif nm:
            a = max(nm, key=lambda x: (x["unit"] != "", x["v"]))
            typ = "ring" if a["unit"] == "%" and a["v"] <= 100 else "number"
            cands.append((0.9, dict(type=typ, t0=s["words"][a["i"]]["t0"] - 0.1, t1=min(s["t1"] + 1.0, s["words"][a["i"]]["t0"] + 5), layer="back", pref="beside_head",
                                     data={"v": a["v"], "unit": a["unit"], "label": short(" ".join(w["w"] for w in s["words"][a["i"] + (2 if a["unit"] else 1):a["i"] + 6]) or s["text"], 4).rstrip(" …")},
                                     why=f"Kennzahl {fmt_num(a['v'], a['unit'])} -> {'Ring' if typ == 'ring' else 'Count-up-Zahl'}")))
        if sc["compare"]:
            m_ = re.search(r"([A-ZÄÖÜ][\wäöüß-]+(?: [A-ZÄÖÜ][\wäöüß-]+)?)\s+(?:vs\.?|versus|oder|statt|gegenüber)\s+([A-ZÄÖÜ][\wäöüß-]+(?: [A-ZÄÖÜ][\wäöüß-]+)?)", s["text"])
            if m_: cands.append((0.92, dict(type="vs", t0=s["t0"], t1=s["t1"] + 0.5, layer="front", pref="top", data={"a": m_.group(1), "b": m_.group(2)}, why="Gegenueberstellung A vs. B")))
        if sc["tip"] and not it and d > 1.6:
            cands.append((0.8, dict(type="tip", t0=s["t0"] + 0.1, t1=s["t1"] + 0.4, layer="front", pref="side", data={"title": short(s["text"], 5), "icon": "bulb"}, why="Handlungsempfehlung -> Tipp-Karte")))
        if sc["cta"] and s["i"] >= len(S) - 2:
            cands.append((0.97, dict(type="cta", t0=s["t0"], t1=dur - 0.05, layer="front", pref="lower", data={"text": short(s["text"], 5)}, why="Handlungsaufforderung am Ende")))
        if sc["emph"] and d > 1.0:
            ew = next((w for w in s["words"] if re.search(KIND["emph"], norm(w["w"]))), None)
            if ew:
                j = s["words"].index(ew); phrase = " ".join(w["w"] for w in s["words"][j:j + 3]).strip(".,!?")
                cands.append((0.6, dict(type="sticker", t0=ew["t0"] - 0.05, t1=min(s["t1"] + 0.6, ew["t0"] + 2.8), layer="front", pref="near_head", data={"text": phrase}, why="Betonung im Satz -> Sticker am Kopf")))
        if mot and not it and d > 1.4:
            cands.append((0.55, dict(type="illus", t0=s["t0"] + 0.2, t1=s["t1"] + 0.5, layer="back", pref="beside_head", data={"motif": mot}, why=f"Schluesselbegriff -> Illustration '{mot}' hinter der Person")))
        if not cands and d > 2.2 and not item_at(s["t0"]):
            kw = [w["w"].strip(".,!?") for w in s["words"] if w["w"][:1].isupper() and norm(w["w"]) not in STOP and s["words"].index(w) > 0]
            if kw: cands.append((0.4, dict(type="kinetic", t0=s["t0"] + 0.1, t1=s["t1"] + 0.3, layer="back", pref="top", data={"text": kw[0]}, why="Kernbegriff als grosse Typo hinter der Person")))
        # Abwechslung: gleicher Typ wie die letzten zwei -> abwerten; max. 2 Inhalts-Overlays je Satz
        scored = sorted(((sc_ - (0.25 if c["type"] in last_types[-2:] else 0), c) for sc_, c in cands), key=lambda x: -x[0])
        picked = []
        for sc_, c in scored:
            if len(picked) == 2: break
            if any(p["layer"] == c["layer"] and p["type"] not in ("sticker",) and c["type"] not in ("sticker",) for p in picked): continue
            data_viz = c["type"] in ("bars", "number", "ring")
            if c["layer"] == "back" and not it and not data_viz and any(o["layer"] == "back" and o["t0"] - 0.01 <= c["t0"] < o["t1"] for o in ov): continue
            if c["layer"] == "back" and (it or data_viz):
                for o in ov:
                    if o["layer"] == "back" and o["t1"] > c["t0"] - 0.05: o["t1"] = c["t0"] - 0.05
            picked.append(c)
        for c in picked:
            img = find_image(opts.get("images"), c["data"].get("motif"), s["text"]) if c["type"] in ("illus",) else None
            if img: c.update(type="image", data={"src": img, "credit": img_credit(img)}, why=c["why"] + f" -> eigenes Bild {Path(img).name}")
            if c["type"] in ("poster", "illus", "number", "ring", "bars"): c["side"] = "right" if side > 0 else "left"; side = -side
            add(**c); last_types.append(c["type"])
    # Gleichzeitig hoechstens ein grosses Hintergrund-Element: Ueberlappungen kuerzen
    backs = sorted([o for o in ov if o["layer"] == "back"], key=lambda o: o["t0"])
    for a, b in zip(backs, backs[1:]):
        if a["t1"] > b["t0"] - 0.05: a["t1"] = b["t0"] - 0.05
    ov = [o for o in ov if o["t1"] - o["t0"] >= 0.9]
    hook_end = ov[0]["t1"] if ov and ov[0]["type"] == "hook" else 0
    punches = rhythm(ov, S, items, dur, hook_end, why)
    ov.sort(key=lambda o: o["t0"])
    for k, o in enumerate(ov): o["id"] = f"o{k:02d}_{o['type']}"
    # 3) Zoom: weiche Sprung-Zooms an Abschnittsgrenzen (Talking-Head-Standard; Referenz nutzt keine -> dezent, abschaltbar)
    zoom_mode = opts.get("zoom", "subtle"); zooms = [{"t": 0.0, "z": 1.0}]
    if zoom_mode != "off":
        bounds = [it["t0"] for it in items] or [s["t0"] for s in S[1:] if s["t1"] - s["t0"] > 2.0][::2]
        zl = 1.08 if zoom_mode == "subtle" else 1.15; cur = 1.0; last = 0
        for t in bounds:
            if t - last < 2.5: continue
            cur = zl if cur == 1.0 else 1.0; zooms.append({"t": round(t - 0.03, 3), "z": cur}); last = t
        for t in punches:   # kurze Zoom-Impulse der Rhythmus-Regie (+5 % fuer 1,4 s, danach zurueck)
            base = max((z for z in zooms if z["t"] <= t), key=lambda z: z["t"])["z"]
            if all(abs(z["t"] - t) > 1.6 for z in zooms): zooms += [{"t": round(t, 3), "z": round(base + 0.05, 3)}, {"t": round(t + 1.4, 3), "z": base}]
        zooms.sort(key=lambda z: z["t"])
        why.append(f"{len(zooms) - 1} Zoom-Wechsel (Abschnitte + Rhythmus-Impulse, {zoom_mode})")
    keys = sorted({w.strip(".,!?:;") for o in ov for w in str(o["data"].get("title") or o["data"].get("text") or "").split() if len(w) > 4 and w[:1].isupper()})
    return {"sentences": [{k: s[k] for k in ("i", "t0", "t1", "text")} for s in S], "items": items, "overlays": ov, "zooms": zooms, "notes": why, "hook_t1": hook_end, "keys": keys}

ICON_OF = {"shield": "shield", "banknote": "banknote", "chart": "trend", "coins": "coins", "piggy": "coins", "wallet": "banknote", "tax": "doc", "receipt": "doc",
           "warning": "alert", "clock": "clock", "hourglass": "clock", "calendar": "clock", "bulb": "search", "stethoscope": "plus", "house": "lock"}
FIN_MOTIF = {"hourglass", "shield", "tax", "chart", "banknote", "piggy", "coins", "wallet", "stethoscope", "receipt", "warning"}
BIG = {"poster", "kinetic", "number", "bars", "illus", "vs", "ring", "image"}
FLEX = {"number", "illus", "kinetic", "ring"}          # duerfen vor ODER hinter der Person stehen
def rhythm(ov, S, items, dur, hook_end, why):
    """Rhythmus-Regie (aus der Referenz gemessen: Mikro 0,4 s Untertitel, Makro 5-7 s Blockwechsel):
       - Abschnittswechsel = harter Schnitt: Wisch-Uebergang + Titel + Visual im selben Moment
       - spaetestens alle 3,2 s ein neuer visueller Reiz (Meso-Rhythmus)
       - Wechsel vorne/hinten und gross/klein zwischen aufeinanderfolgenden Inhalts-Overlays"""
    n0 = len(ov)
    for k, it in enumerate(items[1:], 1):
        ov.append(dict(type="wipe", t0=round(it["t0"] - 0.22, 3), t1=round(it["t0"] + 0.2, 3), layer="front", pref="full", data={"tone": ["red", "navy"][k % 2]}, why="Abschnittswechsel -> Wisch-Uebergang (Makro-Rhythmus)"))
    content = sorted([o for o in ov if o["type"] not in ("hook", "title", "wipe")], key=lambda o: o["t0"])
    for a, b in zip(content, content[1:]):   # Kontrast: gleiche Ebene hintereinander -> flexible Typen wechseln die Ebene
        if b["type"] in FLEX and a["layer"] == b["layer"] and abs(b["t0"] - a["t1"]) < 4: b["layer"] = "front" if a["layer"] == "back" else "back"; b["why"] = b.get("why", "") + " · Ebene gewechselt (Kontrast)"
    punches, filled, used_sent = [], 0, set()
    for _ in range(40):
        evs = sorted({round(o["t0"], 2) for o in ov} | {hook_end})
        evs = [e for e in evs if e >= hook_end - 0.01] + [dur - 0.8]
        gap = next(((a, b) for a, b in zip(evs, evs[1:]) if b - a > 3.2), None)
        if not gap: break
        t = gap[0] + min(2.2, (gap[1] - gap[0]) / 2)
        sent = next((x for x in S if x["t0"] <= t <= x["t1"] + 0.3), None)
        if not sent: break
        lo, hi_ = gap[0] + 0.6, gap[1] - 0.6
        inwin = lambda w: lo <= w["t0"] <= hi_
        cand = [w for w in sent["words"] if inwin(w) and w["w"].strip(".,!?:;")[:1].isupper() and norm(w["w"]) not in STOP and len(norm(w["w"])) > 3 and sent["words"].index(w) > 0]
        nums = [sent["words"][x["i"]] for x in numbers(sent["words"]) if x["unit"] and inwin(sent["words"][x["i"]])]   # nur echte Kennzahlen (mit Einheit), keine Aufzaehlungsnummern
        pick = (nums or cand or [w for w in sent["words"] if inwin(w) and len(norm(w["w"])) > 6 and norm(w["w"]) not in STOP])[:1]
        prev = max((o for o in ov if o["type"] not in ("hook", "title", "wipe") and o["t0"] <= t), key=lambda o: o["t0"], default=None)
        vis = [o for o in ov if o["type"] not in ("hook", "title", "wipe", "_punch") and o["t0"] <= t <= o["t1"]]
        vis_all = vis + [o for o in ov if o["type"] in ("title", "hook") and o["t0"] <= t <= o["t1"]]
        shown = " ".join(norm(x) for o in vis_all for x in " ".join(str(o["data"].get(k) or "") for k in ("title", "text", "claim", "a", "b", "label")).split())
        if pick and (len(vis) >= 2 or norm(pick[0]["w"]) in shown.split() or sent["i"] in used_sent or sent["i"] == S[-1]["i"]): pick = []   # nicht ueberladen, nichts doppeln
        if not pick:
            punches.append(t); ov.append(dict(type="_punch", t0=t, t1=t, layer="none", data={})); continue
        w = pick[0]; j = sent["words"].index(w); sw_ = sent["words"]
        phrase = w["w"].strip(".,!?:;")
        if to_number(w["w"]) and j + 1 < len(sw_): phrase += " " + UNIT.get(norm(sw_[j + 1]["w"]), sw_[j + 1]["w"].strip(".,!?:;"))   # Zahl + Einheit
        elif j + 1 < len(sw_) and sw_[j + 1]["w"][:1].isupper() and norm(sw_[j + 1]["w"]) not in STOP | {"nummer"} and not re.search(r"[,.!?:;]$", w["w"]): phrase += " " + sw_[j + 1]["w"].strip(".,!?:;")
        big_prev = prev is not None and (prev["type"] in BIG or prev["layer"] == "back")
        if big_prev:
            o = dict(type="lowerthird", t0=w["t0"] - 0.05, t1=min(w["t0"] + 2.6, sent["t1"] + 0.6), layer="front", pref="near_head", data={"text": phrase, "icon": ICON_OF.get(motif(phrase) or "", "check")})
        else:
            o = dict(type="kinetic", t0=w["t0"] - 0.05, t1=min(w["t0"] + 2.4, sent["t1"] + 0.4), layer="back", pref="top", data={"text": phrase})
        o["why"] = f"Rhythmus-Regie: {gap[1] - gap[0]:.1f} s ohne Bildwechsel -> {'kleines Label vorn' if big_prev else 'grosse Typo hinten'} (Kontrast zum vorigen Element)"
        ov.append(o); punches.append(w["t0"]); filled += 1; used_sent.add(sent["i"])
    ov[:] = [o for o in ov if o["type"] != "_punch"]
    why.append(f"Rhythmus-Regie: {len(items[1:])} Wisch-Uebergaenge, {filled} Fuell-Reize, {len(punches)} Zoom-Impulse")
    return punches

# ---------------------------------------------------------------- Zoom + Layout
def face_center(ana, t0, t1):
    T = np.array(ana["t"]); F = np.array(ana["face"]); sel = (T >= t0) & (T <= t1)
    f = F[sel] if sel.any() else F
    return float(np.median(f[:, 0] + f[:, 2] / 2)), float(np.median(f[:, 1] + f[:, 3] / 2))

def zoom_fn(zooms, ana):
    """t -> (z, cx, cy); Zoom-Zentrum = Gesichtszentrum des Abschnitts (fest pro Abschnitt -> kein Wackeln)."""
    seg = []
    for k, z in enumerate(zooms):
        t1 = zooms[k + 1]["t"] if k + 1 < len(zooms) else 1e9
        cx, cy = face_center(ana, z["t"], min(t1, z["t"] + 8)); seg.append((z["t"], t1, z["z"], cx, cy))
    def f(t):
        for a, b, z, cx, cy in seg:
            if a <= t < b: return z, cx, cy
        return 1.0, W / 2, H / 2
    return f

def transformed(ana, zf):
    """Gesicht + Belegungsraster in Ausgabe-Koordinaten (nach Zoom)."""
    import vision
    faces, masks = [], []; g = ana["grid"]; gh, gw = H // g, W // g
    for t, f, m in zip(ana["t"], ana["face"], ana["mask"]):
        z, cx, cy = zf(t); x0, y0, w, h = vision.zoom_rect(z, cx, cy)
        faces.append([(f[0] - x0) * z, (f[1] - y0) * z, f[2] * z, f[3] * z])
        if z > 1.001:
            big = cv2.resize(m.astype(np.float32), (W, H), interpolation=cv2.INTER_NEAREST)[int(y0):int(y0 + h), int(x0):int(x0 + w)]
            m = (cv2.resize(big, (gw, gh), interpolation=cv2.INTER_AREA) > 0.3).astype(np.uint8)
        masks.append(m)
    return np.array(ana["t"]), np.array(faces), np.stack(masks)

NAT = {"hook": (960, 300), "title": (720, 170), "poster": (500, 700), "illus": (520, 520), "number": (600, 360), "ring": (420, 470), "bars": (560, 520),
       "myth": (440, 330), "error": (440, 280), "tip": (440, 280), "sticker": (440, 130), "vs": (900, 190), "cta": (640, 150), "kinetic": (940, 300), "image": (520, 650), "check": (460, 400), "lowerthird": (520, 120), "wipe": (1080, 1920)}

def place(plan_, ana, zf, log=None):
    """Position + Massstab je Overlay: Gesicht frei (hart), vordere Elemente meiden die Person, hintere muessen sichtbar bleiben."""
    T, F, M = transformed(ana, zf); g = ana["grid"]; gh, gw = M.shape[1:]
    used = []   # (t0,t1,box) fuer Kollisionsvermeidung zwischen Overlays
    for o in plan_["overlays"]:
        if o["type"] == "wipe":
            o["box"] = {"x": 0, "y": 0, "w": W, "h": H, "s": 1.0}; o["face"] = [0, 0, 0, 0]; o["occluded"] = 0; continue
        sel = (T >= o["t0"] - 0.2) & (T <= o["t1"] + 0.2)
        if not sel.any(): sel = np.argmin(np.abs(T - o["t0"])) == np.arange(len(T))
        person = M[sel].max(0).astype(np.float32)                        # Vereinigung ueber das Zeitfenster
        person = cv2.dilate(person, np.ones((2, 2), np.uint8))
        fb = F[sel]; fx0, fy0 = fb[:, 0].min(), fb[:, 1].min(); fx1, fy1 = (fb[:, 0] + fb[:, 2]).max(), (fb[:, 1] + fb[:, 3]).max()
        pad = 0.10 * (fx1 - fx0) + 14; face = (fx0 - pad, fy0 - pad, fx1 + pad, fy1 + pad * 0.5)
        nw, nh = NAT[o["type"]]; layer = o["layer"]
        if layer == "auto": layer = "front" if fy0 > SAFE["y0"] + nh * 0.7 else "back"
        best = None
        ip = cv2.integral(person)
        def occ(x, y, w, h):
            a, b, c, d = int(x // g), int(y // g), int(min(gw, (x + w) // g)), int(min(gh, (y + h) // g))
            if c <= a or d <= b: return 0.0
            return float(ip[d, c] - ip[b, c] - ip[d, a] + ip[b, a]) / ((c - a) * (d - b))
        fcx = (face[0] + face[2]) / 2
        for relax in (False, True):
          if best: break
          for s in (np.linspace(1.0, 0.5, 11) if not relax else np.linspace(0.6, 0.38, 6)):
              w, h = nw * s, nh * s
              for y in np.arange(SAFE["y0"], SAFE["y1"] - h + 1, 20):
                  for x in np.arange(SAFE["x0"], SAFE["x1"] - w + 1, 20):
                      if y + h > 900 and x + w > SAFE["rx"]: continue
                      inter = not (x + w < face[0] or x > face[2] or y + h < face[1] or y > face[3])
                      if inter and (layer == "front" or o["type"] in ("hook", "title")): continue
                      oc = occ(x, y, w, h)
                      if layer == "front" and oc > (0.65 if not relax else 1.01): continue
                      if layer == "back" and oc > 0.45: continue
                      clash = any(min(t1, o["t1"]) - max(t0, o["t0"]) > 0.35 and not (x + w < b[0] or x > b[0] + b[2] or y + h < b[1] or y > b[1] + b[3]) for t0, t1, b in used)
                      if clash: continue
                      score = s * 2.0 - oc * (1.6 if layer == "front" else 0.8)
                      p = o.get("pref")
                      if p in ("top", "topleft"): score -= (y - SAFE["y0"]) / 900 * 1.2
                      if p == "topleft": score -= x / 1080 * 0.6
                      if p == "lower": score -= (SAFE["y1"] - (y + h)) / 900 * 1.2
                      if o.get("side"): score -= (0.0 if (x + w / 2 > fcx) == (o["side"] == "right") else 0.9)
                      if p in ("beside_head", "near_head", "side"):
                          cx_, cy_ = x + w / 2, y + h / 2
                          score -= abs(cy_ - (face[1] + face[3]) / 2) / 1400 + (0 if p != "near_head" else abs(cx_ - fcx) / 1200)
                      if best is None or score > best[0]: best = (score, x, y, w, h, s, oc)
              if best and best[5] >= s + 0.15: break
        if best is None:   # Notfall: kleinste Groesse oben, hinter der Person
            s = 0.5; best = (0, SAFE["x0"], SAFE["y0"], nw * s, nh * s, s, 1.0); layer = "back"
        _, x, y, w, h, s, oc = best
        o["layer"] = layer; o["box"] = {"x": round(float(x)), "y": round(float(y)), "w": round(float(w)), "h": round(float(h)), "s": round(float(s), 3)}
        o["face"] = [round(float(v)) for v in face]; o["occluded"] = round(oc, 2) if layer == "back" else 0
        used.append((o["t0"], o["t1"], (x, y, w, h)))
    return plan_

def captions(words, hook_t1, keys=()):
    kn = {norm(k) for k in keys}
    chunks, i = [], 0; ws = [w for w in words if w["t0"] >= hook_t1 - 0.05]
    while i < len(ws):
        take = [ws[i]]; i += 1
        isnum = lambda w: bool(to_number(w["w"])) and bool(re.search(r"\d", w["w"]))
        isunit = lambda w: norm(w["w"]) in UNIT
        if isnum(take[0]) and i < len(ws) and isunit(ws[i]): take.append(ws[i]); i += 1        # Zahl + Einheit gehoeren zusammen
        while i < len(ws) and len(take) < 2 and not re.search(r"[.!?:;,]$", take[-1]["w"]) and len(" ".join(x["w"] for x in take)) + len(ws[i]["w"]) < 17 and ws[i]["t0"] - take[-1]["t1"] < 0.3:
            if isnum(ws[i]) and i + 1 < len(ws) and isunit(ws[i + 1]): break                    # Zahl beginnt eigenen Chunk
            take.append(ws[i]); i += 1
        chunks.append({"text": " ".join(x["w"] for x in take), "t0": take[0]["t0"], "t1": take[-1]["t1"], "hi": False})
    # Hervorhebung sparsam: nur echte Kennzahlen (Zahl + Einheit) und Finanzbegriffe, hoechstens alle 2 s
    fig = {round(words_[x["i"]]["t0"], 3) for words_ in [ws] for x in numbers(ws) if x["unit"]}
    last = -9
    for c in chunks:
        isfig = any(abs(c["t0"] - f) < 0.01 or (c["t0"] <= f <= c["t1"]) for f in fig)
        isfin = any(motif(x) in FIN_MOTIF - {"warning"} for x in c["text"].split())
        if (isfig or isfin) and c["t0"] - last >= 2.0: c["hi"] = True; last = c["t0"]
    for a, b in zip(chunks, chunks[1:]):
        if b["t0"] - a["t1"] < 0.25: a["t1"] = round(max(a["t0"] + 0.04, b["t0"]), 3)
    return chunks

SFX = {"hook": [("riser", 0.0, 0.3)], "title": [("whoosh", -0.08, 0.6)], "poster": [("whoosh", -0.05, 0.55), ("pop", 0.2, 0.5)], "illus": [("pop", 0.1, 0.7)],
       "number": [("pop", 0.0, 0.6)], "ring": [("pop", 0.0, 0.6)], "bars": [("pop", 0.1, 0.7)], "myth": [("pop", 0.0, 0.7), ("stamp", 0.9, 0.9)], "error": [("thud", 0.05, 0.8)],
       "tip": [("pop", 0.05, 0.8)], "sticker": [("pop", 0.0, 0.6)], "vs": [("whoosh", -0.05, 0.6), ("thud", 0.3, 0.5)], "cta": [("ding", 0.2, 0.6)], "kinetic": [("whoosh", -0.05, 0.5)], "image": [("whoosh", -0.05, 0.6)],
       "wipe": [("whoosh", 0.0, 0.75)], "lowerthird": [("pop", 0.05, 0.5)]}
def sfx_events(plan_):
    ev = []
    for o in plan_["overlays"]:
        for name, dt, gain in SFX.get(o["type"], []): ev.append({"t": round(max(0, o["t0"] + dt), 3), "name": name, "gain": gain, "kw": {}})
        if o["type"] in ("number", "ring"):
            for k in range(14): ev.append({"t": round(o["t0"] + 0.1 + k * 0.08, 3), "name": "tick", "gain": 0.3, "kw": {"pitch": 1.25 - 0.04 * k}})
    for z in plan_["zooms"][1:]: ev.append({"t": z["t"], "name": "whoosh", "gain": 0.25, "kw": {"d": 0.3}})
    return ev
