import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from pk.impressum import (domain_aus_email, impressum_kandidaten,
                          telefon_aus_impressum, ist_plausible_praxisseite)

fehler = []
def pruefe(name, ist, soll):
    if ist != soll:
        fehler.append(f"{name}: erwartet {soll!r}, bekommen {ist!r}")

# --- Domain aus E-Mail -----------------------------------------------------
pruefe("Praxisdomain", domain_aus_email("nadine.schreiber@immanuelalbertinen.de"),
       "immanuelalbertinen.de")
pruefe("Subdomain", domain_aus_email("info@bernau.immanuel.de"), "bernau.immanuel.de")
pruefe("Freemail gmx", domain_aus_email("praxis-mut@gmx.de"), None)
pruefe("Freemail web.de", domain_aus_email("frank7666@web.de"), None)
pruefe("Freemail gmail", domain_aus_email("dr.mueller@gmail.com"), None)
pruefe("Freemail t-online", domain_aus_email("joachim.hintz@t-online.de"), None)
pruefe("Freemail icloud", domain_aus_email("x@icloud.com"), None)
pruefe("Jobboerse", domain_aus_email("bewerbung@indeed.com"), None)
pruefe("Jobboerse Subdomain", domain_aus_email("x@jobs.stepstone.de"), None)
pruefe("kein @", domain_aus_email("keine-mail"), None)
pruefe("leer", domain_aus_email(None), None)
pruefe("kein Punkt", domain_aus_email("x@localhost"), None)
pruefe("Ziffern-TLD", domain_aus_email("x@praxis.123"), None)

# --- Impressum-Kandidaten --------------------------------------------------
html = '''<html><body>
  <a href="/ueber-uns">Über uns</a>
  <a href="/rechtliches/impressum.html">Impressum &amp; Datenschutz</a>
  <a href="https://praxis.de/kontakt">Kontakt</a>
</body></html>'''
k = impressum_kandidaten("https://praxis.de/", html)
pruefe("Link gewinnt", k[0], "https://praxis.de/rechtliches/impressum.html")
if "https://praxis.de/impressum" not in k:
    fehler.append("Standardpfad /impressum fehlt in den Kandidaten")
if len(k) != len(set(x.rstrip('/').lower() for x in k)):
    fehler.append("Kandidaten enthalten Dubletten")

k_ohne = impressum_kandidaten("https://praxis.de/")
pruefe("ohne HTML nur Pfade", k_ohne[0], "https://praxis.de/impressum")

# --- Telefon aus Impressum -------------------------------------------------
impressum_html = '''<h1>Impressum</h1>
<p>Zahnarztpraxis Dr. Olivia Schallmayer<br>
Musterstr. 1<br>10319 Berlin</p>
<p>Telefon: 030 5122157<br>
Telefax: 030 5122158</p>'''
tel, faxe = telefon_aus_impressum(impressum_html)
pruefe("Telefon erkannt", tel, "+49305122157")
pruefe("Fax getrennt", faxe, ["+49305122158"])

# Fax steht zuerst - darf trotzdem nicht als Telefon durchgehen
umgekehrt = "<p>Fax: 030 5122158<br>Tel.: 030 5122157</p>"
tel2, faxe2 = telefon_aus_impressum(umgekehrt)
pruefe("Fax zuerst", tel2, "+49305122157")
pruefe("Fax zuerst, Fax erkannt", faxe2, ["+49305122158"])

# Unbeschriftete Nummer ist besser als keine
nackt = "<p>Praxis Dr. Meier, 030 1234567</p>"
tel3, _ = telefon_aus_impressum(nackt)
pruefe("unbeschriftet", tel3, "+49301234567")

tel4, faxe4 = telefon_aus_impressum("<p>Kein Kontakt hier.</p>")
pruefe("nichts gefunden", (tel4, faxe4), (None, []))

# --- Plausibilitaet --------------------------------------------------------
seite = "<h1>Willkommen bei Zahnarztpraxis am Jägertor in Potsdam</h1>"
pruefe("Name trifft", ist_plausible_praxisseite(seite, "Zahnarztpraxis am Jägertor"), True)
pruefe("Name trifft nicht",
       ist_plausible_praxisseite("<h1>Domain geparkt</h1>", "Zahnarztpraxis am Jägertor"), False)
pruefe("nur Rechtsform reicht nicht",
       ist_plausible_praxisseite("<p>Eine GmbH Praxis</p>", "Praxis GmbH"), False)

print(f"{'FEHLER' if fehler else 'alle Prüfungen bestanden'}")
for f in fehler: print("  " + f)
sys.exit(1 if fehler else 0)
