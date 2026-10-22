#!/usr/bin/env python3
"""KI-Bildgenerierung für Szenen.

  image_gen.py "flat vector illustration of a doctor in retirement" --out-dir images/

Anbieter (per Umgebungsvariable, erster verfügbarer gewinnt):
  OPENAI_API_KEY  → OpenAI Images API (Modell FM_IMAGE_MODEL, Standard gpt-image-1), Host api.openai.com
  FM_IMAGE_DIR    → bereits erzeugte Bilder (z. B. aus dem Canva-Connector exportiert) – Datei mit passendem Stichwort im Namen
Innerhalb einer Claude-Session kann Claude stattdessen den Canva-Connector (generate-image) nutzen und das exportierte Bild
als props.src eintragen (siehe SKILL.md, Abschnitt Bilder). Nutzungsrechte: OpenAI/Canva-Bedingungen des eigenen Kontos.
"""
import base64, json, os, pathlib, re, urllib.request


def generate(prompt, out_dir, size="1536x1024"):
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    fn = out / ("gen_" + re.sub(r"\W+", "_", prompt.lower())[-40:] + ".png")
    d = os.environ.get("FM_IMAGE_DIR")
    if d:
        words = [w for w in re.findall(r"\w{4,}", prompt.lower())]
        for f in sorted(pathlib.Path(d).glob("*")):
            if any(w in f.stem.lower() for w in words[-3:]):
                return {"path": str(f), "credit": "eigenes/generiertes Bild"}
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("kein Bildgenerator konfiguriert (OPENAI_API_KEY oder FM_IMAGE_DIR)")
    body = json.dumps({"model": os.environ.get("FM_IMAGE_MODEL", "gpt-image-1"), "prompt": prompt, "size": size, "n": 1}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        res = json.loads(r.read())
    item = res["data"][0]
    data = base64.b64decode(item["b64_json"]) if item.get("b64_json") else urllib.request.urlopen(item["url"], timeout=60).read()
    fn.write_bytes(data)
    rec = {"path": str(fn), "prompt": prompt, "provider": "OpenAI Images", "credit": "KI-generiert (OpenAI)"}
    cj = out / "credits.json"
    credits = json.loads(cj.read_text()) if cj.exists() else []
    credits.append(rec); cj.write_text(json.dumps(credits, ensure_ascii=False, indent=1))
    return rec


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument("prompt"); ap.add_argument("--out-dir", default="images")
    a = ap.parse_args(); print(generate(a.prompt, a.out_dir))
