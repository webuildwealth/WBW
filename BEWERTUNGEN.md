# Bewertungen — ProvenExpert und Trustpilot

Diese Datei ist die Anleitung zur Seite `bewertungen.html`. Sie enthält alles, was
für die beiden Profile gebraucht wird: die fertigen Texte zum Einsetzen, die
Stelle im Code, an die die Kennungen gehören, den Ablauf zum Einholen von
Bewertungen und die rechtlichen Punkte, die dabei nicht optional sind.

> **Stand der Dinge.** Die Seite ist gebaut, verlinkt und rechtlich vorbereitet.
> Was noch fehlt, sind die beiden Profile selbst — die legt nur an, wer die
> Zugangsdaten hat, denn beide Portale verlangen eine Anmeldung mit Bestätigung
> per E-Mail und eine Bestätigung der Domain. Bis dahin zeigen die Karten auf
> der Seite den Einrichtungs-Zustand und keine leeren Flächen.

---

## 1 · Die sechs Werte, um die es geht

Alles hängt an sechs Angaben. Sie stehen an genau einer Stelle: als
`data-`-Attribute in `bewertungen.html`, Abschnitt `SIEGEL`. Solange ein Wert
leer ist, zeigt die zugehörige Karte den Einrichtungs-Hinweis — kein toter Link,
keine Anzeige, die nie kommt.

| Attribut | Portal | Was hineingehört |
|---|---|---|
| `data-profil` | ProvenExpert | Adresse der öffentlichen Profilseite |
| `data-bewerten` | ProvenExpert | Adresse des Bewertungsformulars („Bewertungslink“) |
| `data-widget` | ProvenExpert | Adresse der Bewertungsanzeige aus dem Widget-Bereich |
| `data-profil` | Trustpilot | `https://de.trustpilot.com/review/finanz-medizin.com` |
| `data-bewerten` | Trustpilot | `https://de.trustpilot.com/evaluate/finanz-medizin.com` |
| `data-businessunit` + `data-template` | Trustpilot | beide Werte stehen im TrustBox-Code |

Die beiden Trustpilot-Adressen stehen fest, sobald die Domain bestätigt ist —
sie leiten sich aus `finanz-medizin.com` ab. Alles andere kommt aus dem
jeweiligen Portal.

---

## 1b · Was sich sonst an der Website geändert hat

Die neue Seite hängt nicht frei in der Luft, deshalb sind ein paar Stellen
mitgezogen worden:

- **Navigation.** „Bewertungen“ steht jetzt in der Kopfzeile jeder Seite und
  im Klappmenü. Die Kopfzeile trug damit einen Punkt mehr, als in sie
  hineinpasste: Bis 1200px Fensterbreite lief der Erstgespräch-Knopf über den
  rechten Rand hinaus. Die Schwelle, ab der die Kopfzeile ausgeschrieben
  erscheint, liegt deshalb nicht mehr bei 1040px, sondern bei 1200px —
  darunter übernimmt das Klappmenü, das ohnehin alle Seiten und alle
  Unterpunkte führt. Zwischen 1200px und 1400px rücken die Punkte zusätzlich
  enger zusammen; das ist für die Startseite nötig, die zwei Sprungmarken mehr
  trägt als die übrigen Seiten.
- **Fußzeile.** Auf den Landingpages, der Startseite und der Dankeseite steht
  der Verweis zusätzlich unten.
- **Datenschutzerklärung.** Neuer Abschnitt 9 zu den beiden Portalen; die
  folgenden Abschnitte sind um eine Nummer weitergerückt. Die Sprungmarken
  haben sich nicht geändert, nur die Ziffern davor.
- **Cookie-Richtlinie.** Die Kategorie „Marketing“ nennt jetzt die beiden
  Bewertungsanzeigen.
- **`netlify.toml`.** Die Content-Security-Policy kennt die Hosts der beiden
  Portale, und es gibt zwei Kurz-Adressen (siehe Abschnitt 5).

---

## 2 · ProvenExpert — Profil anlegen

### 2.1 Konto

1. `provenexpert.com` aufrufen, Registrierung starten.
2. **Wichtig beim Namen.** Finanz-Medizin ist keine Gesellschaft, sondern eine
   Marke des Einzelunternehmens We Build Wealth. Das Portal führt aber ein
   Impressum, das mit dem Handelsregister beziehungsweise dem Gewerbe
   übereinstimmen muss. Deshalb:
   - **Profilname:** `Finanz-Medizin`
   - **Firmierung im Impressum des Profils:** `Benedict Hintz — We Build Wealth`
   - **Anschrift:** Calvinstraße 3, 10557 Berlin
   Wer beides vermischt, bekommt entweder ein Profil, das niemand unter
   „Finanz-Medizin“ findet, oder eine Impressumsangabe, die nicht stimmt.
3. E-Mail bestätigen, Tarif wählen. Es gibt einen kostenlosen Basis-Tarif;
   welche Widgets er enthält, unterscheidet sich je nach Tarif und ändert sich
   gelegentlich — vor der Buchung prüfen, ob die gewünschte Anzeige enthalten ist.

### 2.2 Profiltexte — fertig zum Einsetzen

**Kurzbeschreibung / Slogan** (eine Zeile, erscheint unter dem Namen):

```
Finanzberatung ausschließlich für Ärztinnen, Ärzte und Praxisteams.
```

**Profilbeschreibung** (der lange Text auf der Profilseite):

```
Finanz-Medizin ist die auf Heilberufe spezialisierte Finanz- und
Versicherungsberatung von We Build Wealth, Inhaber Benedict Hintz.

Wir beraten drei Gruppen, und zwar jede anders: Praxisinhaberinnen und
Praxisinhaber zu Mitarbeiterbindung, Steuerhebeln und Praxisabsicherung;
angestellte Ärztinnen und Ärzte zu Versorgungswerk, Sonderausgaben,
Arbeitskraftabsicherung und Vermögensaufbau; medizinische Fachangestellte
zu betrieblichen Leistungen, Vorsorge und den Lücken, die Teilzeit und
Elternzeit hinterlassen.

Warum die Spezialisierung: Ärztinnen und Ärzte haben ein eigenes
Versorgungswerk, eine eigene Gebührenordnung, eigene Haftungsrisiken und mit
dem Praxiswert einen Vermögensgegenstand, den es in keiner anderen Branche so
gibt. Beratung, die das nicht kennt, übersieht regelmäßig dieselben Punkte.

Wie wir arbeiten:
— Wir sind ungebundene Versicherungsmakler. Kein Konzern gibt uns vor, was
  wir empfehlen.
— Jede Zahl, die wir nennen, hat eine Fundstelle. Im Gesetz, im Tarifvertrag
  oder in einer Studie. Sie und Ihre Steuerberatung können alles nachrechnen.
— Was schon gut ist, bleibt. Wir ersetzen keinen funktionierenden Vertrag,
  nur weil ein neuer Abschluss lukrativer wäre.
— Wenn bei Ihnen nichts zu tun ist, sagen wir Ihnen das.

Erlaubnisse, öffentlich nachprüfbar im Vermittlerregister:
§ 34d Abs. 1 GewO — D-5V3H-7KX3I-54
§ 34f Abs. 1 S. 1 Nr. 1 GewO — D-F-107-RV51-31
Aufsicht: IHK Berlin. Register: DIHK.

Eine Erlaubnis nach § 34c oder § 34i GewO besteht nicht; wo solche Leistungen
erlaubnispflichtig sind, arbeiten wir mit zugelassenen Partnern.

Das Erstgespräch dauert rund 25 Minuten und kostet nichts.
```

**Kontaktangaben**

| Feld | Wert |
|---|---|
| Website | `https://www.finanz-medizin.com/` |
| E-Mail | `info@finanz-medizin.com` |
| Telefon | `+49 176 43229851` |
| Anschrift | Calvinstraße 3, 10557 Berlin |

**Branche / Kategorie.** ProvenExpert verlangt eine Hauptkategorie und erlaubt
weitere. Sinnvoll sind, in dieser Reihenfolge:

1. Finanzberatung / Finanzdienstleistungen (Hauptkategorie)
2. Versicherungsmakler
3. Altersvorsorge
4. Vermögensberatung

Die genaue Bezeichnung der Kategorien gibt das Portal vor; wo eine der obigen
nicht existiert, die nächstliegende nehmen.

**Suchbegriffe / Keywords** (falls das Profil ein solches Feld hat):

```
Finanzberatung Ärzte, Versicherungsmakler Heilberufe, Praxisinhaber,
Versorgungswerk, Berufsunfähigkeitsversicherung Ärzte, Praxisausfallversicherung,
betriebliche Altersvorsorge Arztpraxis, betriebliche Krankenversicherung MFA,
Basisrente Arzt, private Krankenversicherung Ärzte, Vermögensaufbau Mediziner,
Niederlassung Praxis, Berlin
```

**Leistungen** (ProvenExpert lässt einzelne Leistungen anlegen, die getrennt
bewertet werden können — dafür lohnt sich die Mühe):

| Leistung | Beschreibung |
|---|---|
| Praxis-Check für Praxisinhaber | Mitarbeiterbindung, Steuerhebel, Absicherung der Praxis — Bestandsaufnahme in rund 25 Minuten. |
| Vermögens-Check für angestellte Ärztinnen und Ärzte | Versorgungswerk, Sonderausgabenrahmen, Arbeitskraft, Vermögensaufbau. |
| Vorsorge-Check für MFA und Praxisteams | Betriebliche Leistungen, Vorsorge, Lücken durch Teilzeit und Elternzeit. |
| Betriebliche Altersvorsorge für Arztpraxen | Einrichtung und Betreuung, einschließlich Kommunikation ins Team. |
| Absicherung der Arbeitskraft | Berufsunfähigkeit mit den Klauseln, auf die es in Heilberufen ankommt. |

### 2.3 Bewertungsumfrage einrichten

ProvenExpert fragt nicht nur nach Sternen, sondern nach einzelnen Kriterien.
Diese fünf passen zur Beratung und sind bewusst so gestellt, dass sie auch eine
schlechte Antwort zulassen:

1. Verständlichkeit — Haben Sie nach dem Gespräch erklären können, was Sie haben?
2. Nachvollziehbarkeit — Waren die genannten Zahlen belegt und überprüfbar?
3. Erreichbarkeit — Haben Sie eine Antwort bekommen, als Sie eine brauchten?
4. Unabhängigkeit — Hatten Sie den Eindruck, dass etwas verkauft werden sollte?
5. Weiterempfehlung — Würden Sie uns einer Kollegin oder einem Kollegen nennen?

### 2.4 Die drei Adressen abholen

Nach dem Anlegen des Profils im Portal:

- **Profiladresse** — die öffentliche Seite, meist `provenexpert.com/<name>/`.
  → nach `data-profil` der ProvenExpert-Karte.
- **Bewertungslink** — im Bereich „Bewertungen einholen“. Das ist die Adresse,
  die auch in die Einladungs-E-Mail gehört.
  → nach `data-bewerten`.
- **Bewertungsanzeige** — im Bereich für Widgets beziehungsweise Siegel.
  Gebraucht wird die Adresse der Anzeige, nicht ein fertiger Skript-Schnipsel:
  Im ausgegebenen Code steht sie als `src="…"` in einem `<iframe>`. Nur diese
  Adresse übernehmen.
  → nach `data-widget`.

  *Warum nur die Adresse und kein Skript:* Ein fremdes Skript im eigenen
  Dokument kann alles auf der Seite lesen und verändern. Ein Rahmen kann das
  nicht. Wo beide Varianten angeboten werden, nehmen wir den Rahmen.

---

## 3 · Trustpilot — Profil anlegen

### 3.1 Konto und Domain

1. `business.trustpilot.com` aufrufen, kostenloses Geschäftskonto anlegen.
   Domain: `finanz-medizin.com` (ohne `www`, Trustpilot normalisiert selbst).
2. **Domain bestätigen.** Trustpilot verlangt einen Nachweis, dass die Domain
   uns gehört — per DNS-Eintrag, Datei auf dem Server oder E-Mail an eine
   Adresse der Domain. Der DNS-Weg ist der saubere: Der Eintrag wird beim
   DNS-Anbieter der Domain gesetzt (dort, wo auch die Netlify-Einträge stehen).
   Erst nach der Bestätigung lassen sich TrustBoxes einbinden und Einladungen
   versenden.
3. Achtung bei der Firmierung: Trustpilot zeigt den Domainnamen prominent. Als
   Anzeigename `Finanz-Medizin` setzen, im Impressum des Profils
   `Benedict Hintz — We Build Wealth`.

### 3.2 Profiltexte — fertig zum Einsetzen

**Unternehmensbeschreibung** (Trustpilot kürzt lange Texte, deshalb knapper als
bei ProvenExpert):

```
Finanz-Medizin ist die auf Heilberufe spezialisierte Finanz- und
Versicherungsberatung von We Build Wealth, Inhaber Benedict Hintz, Berlin.

Wir beraten Praxisinhaberinnen und Praxisinhaber, angestellte Ärztinnen und
Ärzte sowie medizinische Fachangestellte — zu Versorgungswerk, Steuerhebeln,
Absicherung der Arbeitskraft, betrieblichen Leistungen und Vermögensaufbau.

Wir sind ungebundene Versicherungsmakler nach § 34d Abs. 1 GewO
(D-5V3H-7KX3I-54) und Finanzanlagenvermittler nach § 34f Abs. 1 S. 1 Nr. 1
GewO (D-F-107-RV51-31), beaufsichtigt durch die IHK Berlin. Beide Erlaubnisse
sind im öffentlichen Vermittlerregister nachprüfbar.

Jede Zahl, die wir nennen, hat eine Fundstelle. Wenn bei Ihnen nichts zu tun
ist, sagen wir Ihnen das. Das Erstgespräch dauert rund 25 Minuten und kostet
nichts.
```

**Kategorien.** Trustpilot arbeitet mit einem festen Katalog. Passend sind:

1. `Financial Advisor` / Finanzberater (Hauptkategorie)
2. `Insurance Broker` / Versicherungsmakler
3. `Pension Consultant` / Altersvorsorgeberatung — falls vorhanden

**Kontaktangaben** wie bei ProvenExpert (Abschnitt 2.2).

### 3.3 TrustBox holen

Im Geschäftskonto unter TrustBox eine Anzeige auswählen. Empfehlung für diese
Seite: eine Darstellung, die einzelne Bewertungen zeigt — etwa „Review
Carousel“ oder „Grid“; die Micro-Varianten zeigen nur Sterne und wirken auf
einer eigenen Bewertungsseite dünn.

Der ausgegebene Code enthält beide Werte, die gebraucht werden:

```html
<div class="trustpilot-widget"
     data-locale="de-DE"
     data-template-id="XXXXXXXXXXXXXXXXXXXXXXXX"   <!-- → data-template -->
     data-businessunit-id="YYYYYYYYYYYYYYYYYYYYYYYY" <!-- → data-businessunit -->
     …>
```

Nur diese beiden Zeichenketten übernehmen — nicht den ganzen Block und nicht
das Skript. Beides bringt `assets/js/bewertungen.js` selbst mit, und zwar erst
nach der Einwilligung.

---

## 4 · Die Werte eintragen

In `bewertungen.html`, Abschnitt `SIEGEL`:

```html
<div class="siegel__karte"
     data-siegel="provenexpert"
     data-name="ProvenExpert"
     data-profil="https://www.provenexpert.com/…/"
     data-bewerten="https://www.provenexpert.com/…"
     data-widget="https://www.provenexpert.com/widget/…"
     data-hoehe="430"
     data-reveal>
```

```html
<div class="siegel__karte"
     data-siegel="trustpilot"
     data-name="Trustpilot"
     data-profil="https://de.trustpilot.com/review/finanz-medizin.com"
     data-bewerten="https://de.trustpilot.com/evaluate/finanz-medizin.com"
     data-businessunit="YYYYYYYYYYYYYYYYYYYYYYYY"
     data-template="XXXXXXXXXXXXXXXXXXXXXXXX"
     data-hoehe="380"
     data-reveal>
```

Sonst ist nichts zu tun: Die Knöpfe im Abschnitt „Bewertung abgeben“ verdrahten
sich aus denselben Werten, und die Hosts der beiden Portale stehen bereits in
der Content-Security-Policy in `netlify.toml`.

**Danach prüfen** — mit den Entwicklerwerkzeugen des Browsers, Reiter „Network“:

1. Seite ohne Einwilligung laden. Es darf **keine** Anfrage an
   `provenexpert.com` oder `trustpilot.com` erscheinen. Auf den Karten steht
   der Ersatztext.
2. Im Banner „Marketing“ zustimmen. Jetzt erscheinen beide Anzeigen.
3. Einwilligung über „Cookie-Einstellungen ändern“ widerrufen und die Seite neu
   laden. Die Anzeigen verschwinden wieder.
4. Konsole ansehen: Meldet sie eine blockierte Quelle („Refused to load …“),
   fehlt ein Host in der Content-Security-Policy in `netlify.toml`.

---

## 5 · Bewertungen einholen

### Der Ablauf

1. Beratung ist abgeschlossen — unabhängig davon, ob ein Vertrag zustande kam.
2. Im Gespräch fragen, ob eine Einladung zur Bewertung recht ist. Das **Ja**
   notieren; es ist die Einwilligung, auf die sich die Datenschutzerklärung
   beruft (siehe Abschnitt 6).
3. Einladung genau einmal senden. Keine Erinnerung.
4. Antwort abwarten. Auf jede Bewertung öffentlich antworten — auf eine gute in
   zwei Sätzen, auf eine schlechte sachlich und ohne Rechtfertigung.

### E-Mail-Vorlage

> **Betreff:** Zwei Minuten — wie war es bei uns?
>
> Guten Tag Frau/Herr …,
>
> Sie hatten sich Zeit für unser Gespräch genommen. Wenn Sie zwei Minuten
> übrig haben: Eine öffentliche Bewertung hilft der nächsten Ärztin und dem
> nächsten Praxisteam mehr als jede Anzeige, die wir schalten könnten.
>
> Hier geht es zur Bewertung: [Bewertungslink]
>
> Schreiben Sie bitte, was Sie tatsächlich erlebt haben — auch, wenn etwas
> nicht gut gelaufen ist. Eine unangenehme Rückmeldung, die stimmt, ist uns
> lieber als fünf Sterne, mit denen niemand etwas anfangen kann.
>
> Falls Sie nicht bewerten möchten: Das ist völlig in Ordnung, Sie hören von
> uns dazu nichts mehr.
>
> Herzliche Grüße
> Benedict Hintz
> Finanz-Medizin — eine Marke von We Build Wealth
>
> *Sie erhalten diese E-Mail, weil Sie im Gespräch zugestimmt haben. Sie können
> der weiteren Nutzung Ihrer Adresse für diesen Zweck jederzeit formlos
> widersprechen — eine Antwort auf diese E-Mail genügt, es entstehen Ihnen
> dadurch keine Nachteile.*

Der letzte Absatz ist kein Beiwerk. Eine Bitte um Bewertung gilt
wettbewerbsrechtlich als Werbung; ohne den Hinweis auf den Widerspruch fehlt
eine der Voraussetzungen, unter denen sie zulässig ist.

### Kurz-Adressen

Für Visitenkarte, Signatur und einen QR-Code im Beratungsraum sind zwei
Weiterleitungen eingerichtet (`netlify.toml`):

| Adresse | führt zu |
|---|---|
| `finanz-medizin.com/bewertungen` | die ganze Seite |
| `finanz-medizin.com/bewerten` | direkt zu den beiden Wegen zur Bewertung |

### Was nicht geht

- **Nichts dafür geben.** Kein Geld, kein Nachlass, keine Verlosung, kein
  Geschenk. Das ist keine Vorsicht, sondern Anhang Nr. 23b UWG.
- **Nicht vorsortieren.** Nur die Zufriedenen einzuladen ist eine irreführende
  geschäftliche Handlung, auch wenn jede einzelne Bewertung echt ist.
- **Nicht selbst schreiben, nicht schreiben lassen.** Weder im eigenen Namen
  noch durch Angehörige, Mitarbeitende oder Dienstleister.
- **Keine Bewertung kaufen.** Auch nicht als „Startbestand“.

---

## 6 · Rechtliches

### § 5b Abs. 3 UWG — Auskunftspflicht

Wer Bewertungen zugänglich macht, muss darüber informieren, ob und wie er
sicherstellt, dass sie von Personen stammen, die die Leistung tatsächlich in
Anspruch genommen haben. Diese Auskunft steht auf `bewertungen.html` im
Abschnitt **Transparenz**. **Sie darf nicht entfallen, solange auf der Seite
Bewertungen zu sehen sind** — auch nicht beim Umbau der Seite.

### Anhang Nr. 23b und 23c UWG — unzulässig in jedem Fall

Gefälschte Bewertungen, gekaufte Bewertungen und die Behauptung, Bewertungen
seien geprüft, obwohl sie es nicht sind. Beides ist unabhängig von einer
Spürbarkeitsschwelle verboten.

### DSGVO

- Die **Einladung** überträgt Name und E-Mail-Adresse an das Portal, wenn sie
  über dessen Versand läuft. Grundlage ist die Einwilligung, die im Gespräch
  eingeholt und notiert wird. Sie ist in `datenschutz.html`, Abschnitt 9,
  beschrieben.
- **Auftragsverarbeitungsvertrag** mit ProvenExpert abschließen, wenn der
  Einladungsversand über das Portal läuft. Das Portal stellt ihn im Konto
  bereit. Ohne ihn fehlt die Grundlage für die Übermittlung.
- Ein **Zitat mit Namen** auf der Website braucht eine zweite, gesonderte
  Einwilligung — die Zustimmung zur Bewertung im Portal deckt das nicht ab.
  Schriftlich einholen, zur Akte nehmen, bei Widerruf das Zitat entfernen.
- Die **Verschwiegenheit** gilt weiter: Öffentlich bestätigen, dass jemand
  Mandantin oder Mandant ist, dürfen wir nie. Antworten auf Bewertungen deshalb
  allgemein halten und keine Einzelheiten aus der Beratung nennen — auch dann
  nicht, wenn die Bewertung selbst welche nennt.

### Werberecht der Finanzbranche

Eine Bewertung beschreibt eine Beratungserfahrung, kein Ergebnis. Zitate, die
nach einem Renditeversprechen klingen („… hat mir X Euro gespart“), gehören
nicht auf die Website, selbst wenn sie so im Portal stehen. Der entsprechende
Hinweis steht am Ende des Abschnitts „Transparenz“.

---

## 7 · Wie eine Stimme auf die Website kommt

Im Abschnitt `STIMMEN` von `bewertungen.html` stehen drei Karten mit gelb
markierten Platzhaltern. Eine Karte wird so gefüllt:

1. Bewertung heraussuchen, die im Portal **veröffentlicht** ist.
2. Wortlaut übernehmen. Kürzen nur mit `[…]` und nur so, dass der Sinn erhalten
   bleibt. Nichts umformulieren, nichts glätten, keine Tippfehler „korrigieren“,
   die den Ton ausmachen.
3. Einwilligung für die Nennung des Namens einholen — schriftlich. Liegt sie
   nicht vor: Rolle und Region statt Name („Hausärztin, Praxisinhaberin,
   Brandenburg“).
4. Quelle eintragen: Portal und Monat, etwa „ProvenExpert, März 2026“.
5. Die `<mark class="platzhalter">…</mark>` entfernen — **nur** die Auszeichnung,
   nicht den Text darin ersetzen und die Markierung stehen lassen.

Sind weniger als drei Bewertungen da, überzählige Karten löschen statt füllen.
Eine erfundene Stimme ist der einzige Fehler auf dieser Seite, der nicht
korrigierbar ist.

---

## 8 · Bewusst nicht gemacht: Sterne in den Google-Ergebnissen

Es wäre technisch leicht, auf dieser Seite eine `AggregateRating`-Auszeichnung
zu hinterlegen, damit in den Google-Ergebnissen Sterne erscheinen. Das ist
unterblieben, und zwar aus zwei Gründen:

1. Google wertet Bewertungen, die eine Website über sich selbst auszeichnet
   („self-serving reviews“), für die eigene Organisation nicht aus. Die
   Auszeichnung brächte also nichts.
2. Sie müsste mit echten, laufend gepflegten Zahlen gefüllt werden. Eine
   Auszeichnung, die eine Durchschnittsnote behauptet, die im Portal nicht mehr
   stimmt, ist eine unwahre Angabe — und damit genau der Fall, den Anhang
   Nr. 23c UWG meint.

Sterne in den Suchergebnissen entstehen ohnehin eher über die Profile selbst:
Die Portalseiten sind eigene, gut rankende Seiten. Wer dort steht, wird dort
gefunden.

---

## 9 · Checkliste vor dem Livegang

- [ ] ProvenExpert-Profil angelegt, Impressum im Profil geprüft
- [ ] Trustpilot-Konto angelegt, Domain `finanz-medizin.com` bestätigt
- [ ] Sechs `data-`-Werte in `bewertungen.html` eingetragen
- [ ] Ohne Einwilligung: keine Anfrage an die beiden Portale (Netzwerk-Reiter)
- [ ] Mit Einwilligung: beide Anzeigen erscheinen, keine CSP-Meldung in der Konsole
- [ ] Widerruf getestet — Anzeigen verschwinden wieder
- [ ] Anschriften der beiden Anbieter in `datenschutz.html`, Abschnitt 9,
      eingetragen (zwei gelbe Platzhalter)
- [ ] Die beiden Verweise am Ende von Abschnitt 9 angeklickt; führen sie ins
      Leere, die aktuelle Adresse aus dem Impressum des Portals nachtragen
- [ ] AV-Vertrag mit ProvenExpert abgeschlossen, falls Einladungen über das
      Portal laufen
- [ ] Cookiebot erneut scannen lassen, damit die neuen Cookies in der
      Cookie-Richtlinie auftauchen
- [ ] Erst danach: gelbe Platzhalter im Abschnitt `STIMMEN` durch echte
      Bewertungen ersetzen oder die Karten entfernen

Solange die letzte Zeile offen ist, geht die Seite besser noch nicht live —
oder zumindest nicht in die Sitemap. Der Eintrag steht bereits in
`sitemap.xml`; wer die Seite zunächst zurückhalten will, nimmt ihn dort
vorübergehend heraus.
