#!/usr/bin/env python3
"""Skript-Abgleich: Transkript (Zeitstempel aus der Sprache) + Skript des Nutzers (korrekte Schreibweise).
- gleiche Woerter        -> Skript-Schreibweise, ASR-Zeit
- ersetzte Woerter       -> Skript-Woerter, Zeitspanne der ASR-Woerter anteilig verteilt (z.B. 'Ravi kann' -> 'Ravikant')
- frei gesprochen        -> bleibt aus der Transkription (Ad-libs gehen nicht verloren)
- im Skript, nicht gesagt-> entfaellt (wird nicht eingeblendet)
Regieanweisungen im Skript in [eckigen Klammern] und Zeilen mit '#' werden ignoriert.

  python3 script_align.py words.json skript.txt aligned.json"""
import difflib, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from planner import norm

def script_tokens(text):
    text = "\n".join(l for l in text.splitlines() if not l.strip().startswith("#"))
    text = re.sub(r"\[[^\]]*\]", " ", text)
    return [t for t in re.split(r"\s+", text) if norm(t) or re.search(r"[\d€%]", t)]

def align(words, script_text):
    sw = script_tokens(script_text)
    if not sw or not words: return words, {"matched": 0, "script": len(sw), "asr": len(words)}
    a = [norm(w["w"]) for w in words]; b = [norm(t) for t in sw]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    out, stat = [], {"gleich": 0, "korrigiert": 0, "nur_gesprochen": 0, "nicht_gesprochen": 0}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1): out.append({**words[i1 + k], "w": sw[j1 + k]}); stat["gleich"] += 1
        elif tag == "replace":
            na, nb = i2 - i1, j2 - j1
            sim = difflib.SequenceMatcher(None, "".join(a[i1:i2]), "".join(b[j1:j2]), autojunk=False).ratio()
            if sim >= 0.72 or (all(re.search(r"\d", x) for x in sw[j1:j2]) and nb <= na):   # Verhoerer / Schreibweise / Zahlformat -> Skript gewinnt
                t0, t1 = words[i1]["t0"], words[i2 - 1]["t1"]; L = [max(1, len(norm(x))) for x in sw[j1:j2]]; tot = sum(L); t = t0
                for x, l in zip(sw[j1:j2], L):
                    d = (t1 - t0) * l / tot; out.append({"w": x, "t0": round(t, 3), "t1": round(t + d, 3)}); t += d
                stat["korrigiert"] += nb
            else:                                               # zu verschieden: Gesprochenes behalten
                out += words[i1:i2]; stat["nur_gesprochen"] += na; stat["nicht_gesprochen"] += nb   # anders formuliert gesprochen: Untertitel = Gesprochenes
        elif tag == "delete":
            out += words[i1:i2]; stat["nur_gesprochen"] += i2 - i1
        elif tag == "insert":
            stat["nicht_gesprochen"] += j2 - j1
    stat["abdeckung_skript"] = round(1 - stat["nicht_gesprochen"] / max(1, len(sw)), 3)
    return out, stat

if __name__ == "__main__":
    w = json.loads(Path(sys.argv[1]).read_text()); s = Path(sys.argv[2]).read_text(encoding="utf-8")
    out, st = align(w, s); Path(sys.argv[3]).write_text(json.dumps(out, ensure_ascii=False)); print(st)
