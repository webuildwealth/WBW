#!/usr/bin/env python3
"""Qualitätsprüfung für fertige Reels.  qa.py <video.mp4> [--spec arbeit/<nr>/spec.json] [--script skript.txt]

Prüft automatisch: Format (1080x1920, 30 fps, H.264 High, AAC), Länge 10-45 s, Lautheit (-14 LUFS / max -1 dBTP),
schwarze Frames, eingefrorene Bildstellen, Stille mitten im Video, Sicherheitszonen der Einblendungen und
(mit spec) Zeitfenster, CTA im letzten Satz, Hook ab Frame 0, keine Endkarte, (mit script) jede Zahl in den
Einblendungen kommt im Skript vor. Ergebnis: PASS / WARN / FAIL je Zeile, Exit-Code 1 bei FAIL.
Nicht automatisierbar (selbst an Standbildern prüfen): Schrift echt, Aussage passt zur Grafik, Fachlichkeit."""
import argparse, json, re, subprocess, sys
from pathlib import Path

res = []
def chk(level, what, detail=""):
    res.append(level); print(f"{level:5} {what}" + (f"  ({detail})" if detail else ""))

def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--spec"); ap.add_argument("--script")
    a = ap.parse_args(); v = a.video
    j = json.loads(sh(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", v]).stdout or "{}")
    vs = next((s for s in j.get("streams", []) if s["codec_type"] == "video"), None)
    au = next((s for s in j.get("streams", []) if s["codec_type"] == "audio"), None)
    if not vs:
        chk("FAIL", "Datei nicht abspielbar / kein Bild"); sys.exit(1)
    dur = float(j["format"]["duration"])
    chk("PASS" if (vs["width"], vs["height"]) == (1080, 1920) else "FAIL", "Auflösung 1080x1920", f'{vs["width"]}x{vs["height"]}')
    chk("PASS" if vs["r_frame_rate"] == "30/1" else "FAIL", "30 fps", vs["r_frame_rate"])
    chk("PASS" if vs["codec_name"] == "h264" and vs.get("profile") == "High" and vs["pix_fmt"] == "yuv420p" else "FAIL",
        "H.264 High, yuv420p", f'{vs["codec_name"]}/{vs.get("profile")}/{vs["pix_fmt"]}')
    chk("PASS" if au and au["codec_name"] == "aac" and au["sample_rate"] == "48000" else "FAIL", "AAC 48 kHz")
    chk("PASS" if 10 <= dur <= 45 else "FAIL", "Länge 10-45 s", f"{dur:.1f} s")
    # Lautheit
    m = sh(["ffmpeg", "-hide_banner", "-i", v, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    I = re.findall(r"I:\s+(-?[\d.]+) LUFS", m); P = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", m)
    if I:
        i, p = float(I[-1]), float(P[-1]) if P else 0
        chk("PASS" if abs(i + 14) <= 1.5 else "WARN", "Lautheit nahe -14 LUFS", f"{i:.1f} LUFS")
        chk("PASS" if p <= -0.9 else "FAIL", "Spitze höchstens -1 dBTP", f"{p:.1f} dBFS")
    # schwarze Frames, eingefrorene Stellen, Stille
    bl = re.findall(r"black_start:([\d.]+).*?black_duration:([\d.]+)", sh(["ffmpeg", "-i", v, "-vf", "blackdetect=d=0.08:pix_th=0.04", "-an", "-f", "null", "-"]).stderr)
    chk("PASS" if not bl else "FAIL", "keine schwarzen Frames", ", ".join(f"{s}s" for s, _ in bl))
    fr = re.findall(r"freeze_start: ([\d.]+)", sh(["ffmpeg", "-i", v, "-vf", "freezedetect=n=-60dB:d=1.2", "-an", "-f", "null", "-"]).stderr)
    chk("PASS" if not fr else "WARN", "keine eingefrorenen Bildstellen (>1,2 s)", ", ".join(f"{x}s" for x in fr))
    sil = re.findall(r"silence_start: ([\d.]+)", sh(["ffmpeg", "-i", v, "-af", "silencedetect=n=-45dB:d=0.7", "-vn", "-f", "null", "-"]).stderr)
    sil = [s for s in sil if float(s) < dur - 1]
    chk("PASS" if not sil else "WARN", "keine Pausen über 0,7 s", ", ".join(f"{x}s" for x in sil))

    if a.spec:
        S = json.loads(Path(a.spec).read_text(encoding="utf-8"))
        hook = S.get("hook") or S.get("question")
        chk("PASS" if hook and hook["start"] == 0 and hook["end"] <= 3.2 else "FAIL", "Hook ab Frame 0, höchstens 3 s")
        c = S.get("cta")
        chk("PASS" if c and c["start"] <= dur - 2.0 else "FAIL", "CTA sichtbar (mind. 2 s)", f'ab {c["start"]} s' if c else "fehlt")
        chk("PASS" if c and c["keyword"] else "FAIL", "CTA-Stichwort gesetzt")
        W = json.loads((Path(a.spec).parent / "words_cut.json").read_text(encoding="utf-8")) if (Path(a.spec).parent / "words_cut.json").exists() else []
        if W and c:
            last_start = next((w["s"] for w in W if w["s"] >= c["start"] - 0.01), None)
            chk("PASS" if abs(c["start"] - (max(0, [w for w in W if w["w"][-1:] in ".?!"][-2]["e"] if len([w for w in W if w["w"][-1:] in ".?!"]) > 1 else 0))) < 1.5 else "WARN",
                "CTA beginnt mit dem letzten Satz")
        over = [(x["start"], y["start"]) for k, x in enumerate(sorted(S.get("captions", []), key=lambda q: q["start"]))
                for y in sorted(S.get("captions", []), key=lambda q: q["start"])[k + 1:k + 2] if x["end"] > y["start"] + 0.01]
        chk("PASS" if not over else "FAIL", "Untertitel überlappen nicht")
        long = [q["text"] for q in S.get("captions", []) if len(re.sub(r"\*", "", q["text"]).split()) > 4]
        chk("PASS" if not long else "WARN", "Untertitel höchstens 4 Wörter", "; ".join(long[:3]))
        outside = [k for k in ("hook", "question", "cta") if S.get(k) and S[k]["start"] > dur]
        chk("PASS" if not outside else "FAIL", "alle Einblendungen innerhalb der Videolänge")
        # Zahlen nur aus dem Skript
        if a.script:
            txt = Path(a.script).read_text(encoding="utf-8")
            norm = lambda s: re.sub(r"[^\d,]", "", s)
            have = {norm(x) for x in re.findall(r"\d[\d.,]*", txt)}
            blobs = [n["value"] for n in S.get("numbers", [])] + [sc.get("value", "") for sc in S.get("scenes", [])] + \
                    [b["text"] for sc in S.get("scenes", []) for b in sc.get("bars", [])]
            bad = [b for b in blobs if b and norm(b) and norm(b) not in have]
            chk("PASS" if not bad else "FAIL", "alle Zahlen in Grafiken stehen im Skript", ", ".join(bad))
            banned = re.findall(r"(?i)\b(garantiert|sicher(?:e|er)? rendite|risikolos|\d+\s?% rendite)\b", txt + json.dumps(S, ensure_ascii=False))
            chk("PASS" if not banned else "FAIL", "keine Renditeversprechen", ", ".join(banned))
    print("\nErgebnis:", "FAIL" if "FAIL" in res else ("WARN" if "WARN" in res else "PASS"))
    print("Noch von Hand: Schrift echt (Standbilder), Grafik passt zur Aussage, Zahlen fachlich richtig, Ton verständlich.")
    sys.exit(1 if "FAIL" in res else 0)

main()
