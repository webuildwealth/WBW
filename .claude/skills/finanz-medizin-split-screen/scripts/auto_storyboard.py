#!/usr/bin/env python3
"""Automatisches Storyboard aus dem Transkript – kein manuelles JSON nötig.

  auto_storyboard.py words.json -o story.json [--engine auto|claude|rules] [--images none|search|generate]

Engines:
  claude – Claude-API (Umgebungsvariable ANTHROPIC_API_KEY, Host api.anthropic.com). Bekommt Transkript, Regeln und Schema,
           liefert story.json; Ergebnis wird mit storyboard.check geprüft, bei Fehlern einmal zur Korrektur zurückgegeben.
  rules  – regelbasierter Regisseur (offline): Sätze → Beats → Szenentyp nach Inhalt (Beträge, Prozente, Jahre, Mythen,
           Aufzählungen, Personen/Orte). Gut als Entwurf; inhaltlich schwächer als claude.
  auto   – claude, wenn API-Key vorhanden, sonst rules.
Bilder:
  search   – image_search.py (Openverse/Wikimedia, nur kommerziell nutzbare Lizenzen) für Beats ohne eigene Grafik
  generate – image_gen.py (KI-Bildgenerierung, API-Key nötig) für diese Beats
"""
import argparse, json, os, re, sys, pathlib, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(HERE))
import storyboard as SBM  # noqa: E402

ORD = {"erstens": 1, "zweitens": 2, "drittens": 3, "viertens": 4, "fünftens": 5}
MYTH = re.compile(r"\b(glauben|glaubt|denken|denkt|meinen|mythos|irrtum|heißt es|hört man|behaupten)\b")
VERDICT = re.compile(r"\b(falsch|stimmt nicht|nicht richtig|quatsch|irrtum)\b")
WARN = re.compile(r"\b(risiko|achtung|gefahr|problem|fehler|lücke|teuer|verlust|verlieren|weniger)\b")
INFL = re.compile(r"\b(preise?|inflation|kaufkraft|teurer)\b")
PEOPLE = re.compile(r"\b(arzt|ärztin|ärzte|zahnarzt|zahnärztin|mediziner|mfa|zfa|praxisinhaber|assistenzarzt|oberarzt|chefarzt|kollege|kollegin)\w*")
ENV = [(re.compile(r"krankenhaus|klinik|station|dienst"), "hospital"), (re.compile(r"praxis"), "praxis"),
       (re.compile(r"ruhestand|rente|pension|alter\b|später"), "retirement")]
STOP = set("ich du er sie es wir ihr man der die das den dem des ein eine einen einem einer und oder aber wenn dann weil dass ist sind war hat haben "
           "wird werden kann können muss müssen nicht noch auch nur so wie was wer viele mehr sehr ganz schon immer jetzt hier da dir dich mir mich "
           "sich mit von zu zum zur im in am an auf aus bei für über unter nach vor um es ja nein stell vor heißt".split())


def clean(w):
    return re.sub(r"[^\wäöüÄÖÜß€%.,-]", "", w)


def sentences(words, max_len=4.8, min_len=1.3):
    beats, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        end = re.search(r"[.!?]$", w["w"]) or i == len(words) - 1
        long_ = cur[-1]["e"] - cur[0]["s"] > max_len and re.search(r"[,;:]$", w["w"])
        gap = i + 1 < len(words) and words[i + 1]["s"] - w["e"] > 0.6
        if end or long_ or gap:
            beats.append(cur); cur = []
    merged = []
    for b in beats:
        if merged and b[-1]["e"] - b[0]["s"] < min_len and not re.match(r"(erstens|zweitens|drittens)", b[0]["w"].lower()):
            merged[-1] = merged[-1] + b
        else:
            merged.append(b)
    if len(merged) > 1 and merged[-1][-1]["e"] - merged[-1][0]["s"] < min_len:
        merged[-2] += merged.pop()
    return merged


def numbers_with_units(toks):
    """[(wert, art, index)] art ∈ eur, pct, years, plain"""
    out = []
    for i, t in enumerate(toks):
        for n in SBM.parse_numbers(t):
            nxt = " ".join(toks[i:i + 2]).lower()
            art = "eur" if re.search(r"€|euro", nxt) else "pct" if re.search(r"%|prozent", nxt) else "years" if re.search(r"jahr", nxt) else "plain"
            out.append((n, art, i))
    return out


def nouns(toks):
    out = []
    for i, t in enumerate(toks):
        c = re.sub(r"[^\wäöüÄÖÜß-]", "", t)
        if len(c) > 2 and c[0].isupper() and c.lower() not in STOP and not c.isupper() and (i > 0 or c.lower() not in STOP):
            out.append(c)
    return out


def fmt_eur(n):
    return SBM_de(n) + " €"


def SBM_de(n):
    s = f"{n:,.0f}" if float(n).is_integer() else f"{n:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def anchor_of(beat):
    return " ".join(w["w"] for w in beat[:2])


FEM = re.compile(r"\b(ärztin|zahnärztin|medizinerin|mfa|zfa|kollegin|assistenzärztin|oberärztin|chefärztin|praxisinhaberin|sie)\b")
CTA = re.compile(r"\b(lass uns|melde dich|schreib mir|link in|termin|kommentier|folge mir|speicher dir|erstgespräch|beratung)\b")
RET = re.compile(r"\b(ruhestand|rente|pension|alter)\b")


def title_from(toks, glossary):
    """Titelkarte: Substantive (Großschreibung, nicht am Satzanfang außer Fachbegriff) + letztes Verb als Akzent."""
    nn = [n for i, n in enumerate(nouns(toks)) if not (toks and n == re.sub(r"[^\wäöüÄÖÜß-]", "", toks[0]) and n.lower() not in glossary)]
    verb = re.sub(r"[^\wäöüß]", "", toks[-1]) if toks else ""
    if nn and verb and verb[0].islower() and verb not in STOP and len(verb) > 3:
        return {"line1": " ".join(nn[:2]), "accent": verb}, nn
    if nn:
        return ({"line1": " ".join(nn[:-1][:2]), "accent": nn[-1]} if len(nn) > 1 else {"line1": nn[0]}), nn
    return None, []


def rules_engine(words, script, figure_gender="m"):
    glossary = json.loads((HERE / "glossary_de_en.json").read_text(encoding="utf-8"))
    beats = sentences(words)
    scenes, bullets = [], []
    st = {"age": None, "env": None, "prev": None, "eur": [], "pct": [], "infl": False}
    gender = "f" if FEM.search(script.lower()) and not re.search(r"\b(arzt|zahnarzt)\b", script.lower().split("ärztin")[0]) else figure_gender
    cycle = ["push", "slide", "push", "wipe"]

    def add(sc, beat, at_tok=None, text=""):
        sc.setdefault("transition", cycle[len(scenes) % len(cycle)])
        sc["id"] = f"s{len(scenes) + 1}"
        if scenes:
            sc["at"] = at_tok or anchor_of(beat)
        sc["say"] = text
        scenes.append(sc)
        st["prev"] = sc["type"]

    for bi, beat in enumerate(beats):
        toks = [w["w"] for w in beat]; text = " ".join(toks); low = text.lower()
        nums = numbers_with_units(toks)
        eur = [n for n, a, _ in nums if a == "eur"]; pct = [n for n, a, _ in nums if a == "pct"]; yrs = [n for n, a, _ in nums if a == "years"]
        eur_i = [i for n, a, i in nums if a == "eur"]
        infl_ctx = bool(INFL.search(low)) or st["infl"]
        first = re.sub(r"\W", "", toks[0].lower())
        tp, _nn = title_from(toks, glossary)
        nn = _nn
        if first in ORD:
            bullets.append(" ".join(toks[1:5]).rstrip(",.:;")[:38])
            add({"type": "bullets", "props": {"title": "Worauf es ankommt", "items": list(bullets)}, "transition": "cut" if st["prev"] == "bullets" else "slide"}, beat, text=text)
        elif infl_ctx and eur and (yrs or st["pct"]) and (pct or st["pct"]) and yrs:
            add({"type": "inflation", "props": {"amount": eur[0], "rate": (pct or st["pct"])[-1], "years": int(yrs[0])}, "transition": "slide"}, beat, text=text)
        elif INFL.search(low) and pct:
            add({"type": "counter", "props": {"label": "Preissteigerung pro Jahr" if "jahr" in low else "Inflation", "from": 0, "to": pct[0], "unit": "%",
                                              "decimals": 0 if float(pct[0]).is_integer() else 1, "tone": "red", "caption": "Inflation"}, "transition": "zoom"}, beat, text=text)
        elif VERDICT.search(low) and st["prev"] == "myth":
            add({"type": "myth", "props": {"kicker": "DIE REALITÄT", "text": text.rstrip(".")[:60], "size": 80, "stamp": "FALSCH", "strike_t": 99, "stamp_t": 0.7, "warn": False}, "transition": "zoom"}, beat, text=text)
        elif MYTH.search(low) and not eur:
            claim = re.sub(r"^.*?\b(glauben|glaubt|denken|denkt|meinen|behaupten),?\s*(dass)?\s*", "", text, flags=re.I).strip().rstrip(".")
            claim = (claim[:1].upper() + claim[1:]) if claim else text
            add({"type": "myth", "props": {"text": claim[:70] + ("" if claim.endswith("?") else "?"), "stamp": "MYTHOS", "strike_t": 1.2, "stamp_t": 1.7}}, beat, text=text)
        elif RET.search(low) and eur and st["eur"]:
            # Lebensphase wechselt: dieselbe Figur altert, danach Vergleich heute vs. Ruhestand – zwei Bilder für einen Satz
            a0 = st["age"] if st["age"] is not None and st["age"] < 60 else 38
            add({"type": "character", "props": {"figure": "doc", "env": st["env"] or "apartment", "envTo": "retirement", "age": a0, "ageTo": 67,
                                                "lapse": 1.6, "lapseStart": 0.2, "mood": "worried"}, "transition": "fade" if st["prev"] == "character" else "push"}, beat, text=text)
            st["age"], st["env"] = 67, "retirement"
            at = " ".join(toks[eur_i[0]:eur_i[0] + 2])
            add({"type": "gap_bars", "props": {"title": "Nettoeinkommen pro Monat" if "monat" in low else "Im Vergleich", "bars": [
                {"label": "Heute", "value": st["eur"][-1], "tone": "blue"}, {"label": "Ruhestand", "value": eur[0], "tone": "gray"}], "gap": {"label": "Versorgungslücke"}, "gap_t": 1.6}}, beat, at_tok=at, text=text)
        elif len(eur) >= 2:
            add({"type": "gap_bars", "props": {"title": "Im Vergleich", "bars": [{"label": "Vorher", "value": eur[0], "tone": "blue"}, {"label": "Nachher", "value": eur[1], "tone": "gray"}],
                                               "gap": {"label": "Differenz"}, "gap_t": 1.7}}, beat, text=text)
        elif PEOPLE.search(low) or any(r.search(low) for r, _ in ENV):
            env = next((e for r, e in ENV if r.search(low)), st["env"] or "apartment")
            age = 67 if env == "retirement" else 32 if re.search(r"\bjung", low) else (st["age"] or 40)
            props = {"figure": "doc", "env": env, "age": age, "x": 420 if eur else 470}
            if eur:
                lab = next((t for t in toks[eur_i[0] + 1:eur_i[0] + 4] if t.lower().strip(".,") in ("netto", "brutto", "monatlich")), "")
                props["badge"] = {"text": fmt_eur(eur[0]), "value": eur[0], "label": (lab.strip(".,") + (" pro Monat" if "monat" in low else "")).strip(), "tone": "blue", "t": 0.4, "x": 610, "y": 300}
            if WARN.search(low):
                props["mood"] = "worried"
                if not eur:
                    props["warn"] = {"t": 0.6, "x": 650, "y": 250}
            if not scenes:
                props["pose"] = "wave"
            st["age"], st["env"] = age, env
            add({"type": "character", "props": props, "transition": "fade" if st["prev"] == "character" else "push"}, beat, text=text)
        elif eur or pct:
            v, unit = (eur[0], "€") if eur else (pct[0], "%")
            add({"type": "counter", "props": {"label": " ".join(nn[:3])[:32] or ("Betrag" if eur else "Anteil"), "from": 0, "to": v, "unit": unit,
                                              "decimals": 0 if float(v).is_integer() else 1, "tone": "red" if WARN.search(low) else "blue"}, "transition": "zoom"}, beat, text=text)
        elif yrs:
            add({"type": "timeline", "props": {"from": 0, "to": int(yrs[0]), "step": max(1, int(yrs[0]) // 4), "prefix": "Jahr ", "label": " ".join(nn[:3])}}, beat, text=text)
        elif CTA.search(low) and tp:
            add({"type": "title", "props": dict(tp, kicker="Nächster Schritt", size=96)}, beat, text=text)
        elif tp:
            sc = {"type": "title", "props": dict(tp, size=96), "_query": nn}
            if not scenes:
                sc["props"]["kicker"] = "Finanz-Medizin"
            if WARN.search(low):
                sc["callouts"] = [{"t": 0.8, "text": "Achtung!", "x": 640, "y": 210, "size": 50, "rot": -5}]
            add(sc, beat, text=text)
        elif not scenes:
            add({"type": "title", "props": {"kicker": "Finanz-Medizin", "line1": " ".join(toks[:3])}}, beat, text=text)
        # sonst: Beat ohne Bildidee → vorige Szene läuft weiter
        st["eur"] += eur; st["pct"] = pct or st["pct"]; st["infl"] = bool(INFL.search(low))
        if scenes:
            scenes[-1].setdefault("keywords", [x for x in nn[:2]])
    return {"meta": {"title": "Auto-Storyboard", "fps": 30, "subtitles": {"max_words": 3}, "engine": "rules"},
            "script": script, "figures": {"doc": {"gender": gender, "hair": "4A2E22" if gender == "f" else "2B2320"}}, "assumptions": [], "derived": [], "scenes": scenes}


# ---------------- Claude-Engine ----------------
def claude_engine(words, script, model, retries=1):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY nicht gesetzt")
    rules = (SKILL / "references" / "visual-storytelling.md").read_text(encoding="utf-8")
    props = (SKILL / "references" / "animation-guide.md").read_text(encoding="utf-8").split("## Grafikregeln")[0]
    example = (SKILL / "examples" / "A_altersvorsorge.json").read_text(encoding="utf-8")
    system = ("Du bist Regisseur für animierte Split-Screen-Erklärreels der Marke Finanz-Medizin (Zielgruppe Ärzte/medizinische Berufe). "
              "Erzeuge AUSSCHLIESSLICH ein gültiges JSON-Storyboard nach dem Schema. Regeln:\n" + rules + "\n\nSzenentypen/Props:\n" + props +
              "\n\nZusätzlicher Typ 'svg': props{layers:[{svg:'<g>…</g> im Koordinatensystem 1080x960',t,d,enter:'pop|fade|up|left|right|draw'}],camera{from,to}} "
              "für eigene Illustrationen, wenn kein vorhandener Typ passt. Typ 'image' mit props.query (englische Suchbegriffe) statt src, "
              "wenn ein Foto die Aussage am besten trägt.\nBeispiel:\n" + example)
    user = ("Transkript (gesprochen, bereits geschnitten):\n" + script +
            "\n\nAnforderungen: 'at' = 2–3 aufeinanderfolgende Wörter exakt aus dem Transkript; erste Szene ohne 'at'. "
            "Jede Zahl muss im Transkript stehen oder in assumptions/derived deklariert sein. Gib nur JSON aus.")
    msgs = [{"role": "user", "content": user}]
    for attempt in range(retries + 1):
        body = json.dumps({"model": model, "max_tokens": 8000, "system": system, "messages": msgs}).encode()
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
            "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            res = json.loads(r.read())
        txt = "".join(c.get("text", "") for c in res["content"])
        m = re.search(r"\{.*\}", txt, re.S)
        sb = json.loads(m.group(0))
        sb["script"] = script
        sb.setdefault("meta", {})["engine"] = "claude:" + model
        try:
            test = SBM.resolve(json.loads(json.dumps(sb)), words)
            errs, _ = SBM.check(test)
        except SystemExit as e:
            errs = [str(e)]
        if not errs:
            return sb
        msgs += [{"role": "assistant", "content": txt}, {"role": "user", "content": "Die Prüfung meldet Fehler, bitte korrigiertes JSON:\n" + "\n".join(errs)}]
    raise RuntimeError("Claude-Storyboard nicht valide: " + "; ".join(errs))


PHOTO_STYLE = ("photorealistic editorial photograph, natural soft light, shallow depth of field, modern German setting, "
               "authentic, professional, no text, no logos, no watermark: ")
ENV_EN = {"apartment": "in a bright modern apartment", "hospital": "in a modern hospital corridor", "praxis": "in a modern medical practice",
          "retirement": "in a garden in front of a house, retired"}


def person_query(p, gender, older=False):
    """Bildbeschreibung für ein echtes Foto derselben Person (jung/alt) – konsistent über das ganze Reel."""
    age = p.get("ageTo") if older else p.get("age", 40)
    who = ("woman" if gender == "f" else "man")
    role = "doctor in white coat with stethoscope" if (age or 40) < 62 else f"retired senior {who}, former doctor"
    mood = ", looking thoughtful and slightly worried" if p.get("mood") == "worried" else ", friendly confident smile"
    env = ENV_EN.get(p.get("envTo") if older else p.get("env"), "")
    return f"{age}-year-old {who} {role} {env}{mood}, portrait, upper body"


def get_image(query, mode, out_dir, photo=True):
    import image_search, image_gen
    errors = []
    order = ["library"] + (["generate", "search"] if mode == "generate" else ["search", "generate"] if mode == "search" else ["generate", "search"])
    for src in order:
        try:
            if src == "library":
                hit = image_gen.from_library(query)
            elif src == "generate":
                hit = image_gen.generate((PHOTO_STYLE if photo else "") + query, out_dir)
            else:
                hit = image_search.find(" ".join(re.findall(r"[a-z]+", query.lower())[:5]), out_dir)
            if hit:
                return hit
        except Exception as e:
            errors.append(f"{src}: {str(e)[:90]}")
    raise RuntimeError(" | ".join(errors))


def attach_images(sb, mode, out_dir):
    """Personen → echte Fotos (Bibliothek/KI-Foto/Fotosuche); Titelkarten ohne Bildidee → passendes Foto.
    Diagramme/Zahlen bleiben generierte Grafik. Ohne Bildquelle bleibt die Illustration und wird als Platzhalter gemeldet."""
    if mode == "none":
        for sc in sb["scenes"]:
            sc.pop("_query", None)
        return sb
    glossary = json.loads((HERE / "glossary_de_en.json").read_text(encoding="utf-8"))
    gender = sb.get("figures", {}).get("doc", {}).get("gender", "m")
    warn = sb.setdefault("meta", {}).setdefault("warnings", [])
    for i, sc in enumerate(sb["scenes"]):
        p = sc.get("props", {})
        try:
            if sc["type"] == "character":
                young = get_image(person_query(p, gender), mode, out_dir)
                newp = {"src": young["path"], "credit": young.get("credit", ""), "zoom_from": 1.0, "zoom_to": 1.12, "focus": "50% 25%"}
                if p.get("ageTo"):
                    old = get_image(person_query(p, gender, older=True), mode, out_dir)
                    newp.update(src2=old["path"], cross_t=p.get("lapseStart", .3) + .4, cross_d=1.0)
                    newp["credit"] = "; ".join(x for x in (young.get("credit"), old.get("credit")) if x)
                for k in ("badge", "warn", "year", "yearTo"):
                    if k in p:
                        newp[k] = p[k]
                sc["type"], sc["props"] = "image", newp
            elif sc.get("_query") and i > 0:
                q = " ".join(glossary.get(w.lower(), w) for w in sc["_query"][:3])
                img = get_image(q, mode, out_dir)
                cap = (p.get("line1", "") + " " + p.get("accent", "")).strip()
                sc["type"], sc["props"] = "image", {"src": img["path"], "caption": cap, "zoom_from": 1.0, "zoom_to": 1.15, "credit": img.get("credit", "")}
        except Exception as e:
            if sc["type"] == "character":
                warn.append(f"{sc['id']}: kein Foto verfügbar → Illustration als PLATZHALTER ({e})")
            print(f"Bild für {sc['id']} nicht verfügbar: {e}")
        sc.pop("_query", None)
    return sb


def repair(sb, words):
    """Szenen, die die Prüfung nicht bestehen (z. B. unbelegte Zahl), durch neutrale Titelkarten ersetzen – nie still verfälschen."""
    for _ in range(3):
        try:
            errs, _w = SBM.check(SBM.resolve(json.loads(json.dumps(sb)), words))
        except SystemExit as e:
            errs = [str(e)]
        bad = {e.split(":")[0] for e in errs}
        hit = [sc for sc in sb["scenes"] if sc.get("id") in bad]
        if not hit:
            if errs:
                print("Prüfung meldet weiterhin:", errs[:3])
            return sb
        for sc in hit:
            print(f"Szene {sc['id']} ({sc['type']}) ersetzt: {[e for e in errs if e.startswith(sc['id'])][:1]}")
            nn = nouns(sc.get("say", "").split()) or ["Finanz-Medizin"]
            sc["type"], sc["props"] = "title", {"line1": " ".join(nn[:2]), "accent": nn[-1] if len(nn) > 2 else "", "size": 96}
    return sb


def add_cta(sb, words, cta):
    """CTA-Karte: „Kommentiere VORSORGE“. Beginnt dort, wo das Wort zuletzt gesagt wird (sonst beim letzten Satz)."""
    if not cta:
        return sb
    cw = norm_cta = re.sub(r"[^\wäöüß]", "", cta.lower())
    idx = max((i for i, w in enumerate(words) if re.sub(r"[^\wäöüß]", "", w["w"].lower()) == cw), default=None)
    if idx is None:  # Satzanfang des letzten Satzes
        idx = max((i + 1 for i, w in enumerate(words[:-1]) if re.search(r"[.!?]$", w["w"])), default=max(0, len(words) - 6))
        print(f"Hinweis: CTA-Wort '{cta}' wird nicht gesprochen – Karte ab dem letzten Satz")
    else:  # bis zum Satzanfang zurück
        while idx > 0 and not re.search(r"[.!?]$", words[idx - 1]["w"]) and words[idx]["s"] - words[idx - 1]["s"] < 4:
            idx -= 1
    at = " ".join(w["w"] for w in words[idx:idx + 2])
    sc = {"id": f"s{len(sb['scenes']) + 1}", "at": at, "type": "title", "transition": "zoom",
          "props": {"kicker": "Schreib in die Kommentare", "line1": "", "accent": "„" + cta + "“", "sub": "und ich schicke dir die Details", "size": 130},
          "keywords": [cta], "say": "CTA"}
    # Szenen, die nach dem CTA-Anker beginnen, entfallen
    t_cta = words[idx]["s"]
    tmp = SBM.resolve(json.loads(json.dumps(sb)), words)
    keep = [s for s, r in zip(sb["scenes"], tmp["scenes"]) if r["start"] < t_cta - 0.5]
    sb["scenes"] = keep + [sc]
    sb.setdefault("meta", {}).setdefault("keywords", []).append(cta)
    return sb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("words")
    ap.add_argument("-o", "--out", default="story.json")
    ap.add_argument("--engine", default="auto", choices=["auto", "claude", "rules"])
    ap.add_argument("--model", default="claude-opus-5-5")
    ap.add_argument("--images", default="auto", choices=["auto", "none", "search", "generate"])
    ap.add_argument("--gender", default="m")
    ap.add_argument("--cta", help="CTA-Wort für die Kommentar-Aufforderung am Ende, z. B. Vorsorge")
    a = ap.parse_args()
    words = json.loads(pathlib.Path(a.words).read_text(encoding="utf-8"))
    if isinstance(words, dict):
        words = words["words"]
    script = " ".join(w["w"] for w in words)
    sb = None
    if a.engine in ("auto", "claude"):
        try:
            sb = claude_engine(words, script, a.model)
            print("Storyboard: Claude-API")
        except Exception as e:
            if a.engine == "claude":
                sys.exit(f"Claude-Engine fehlgeschlagen: {e}")
            print(f"Claude-API nicht nutzbar ({e}) → regelbasierter Regisseur")
    if sb is None:
        sb = rules_engine(words, script, a.gender)
    sb = attach_images(sb, "generate" if a.images == "auto" else a.images, pathlib.Path(a.out).resolve().parent / "images")
    for w_ in sb.get("meta", {}).get("warnings", []):
        print("WARNUNG:", w_)
    sb = add_cta(sb, words, a.cta)
    sb = repair(sb, words)
    pathlib.Path(a.out).write_text(json.dumps(sb, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(sb['scenes'])} Szenen -> {a.out}")


if __name__ == "__main__":
    main()
