# Nachrichtentexte „Beratung → Termin"

Alles hier steht fertig zum Kopieren in ManyChat. Die Nummerierung entspricht dem
Ablaufdiagramm in [`README.md`](README.md).

**Formatgrenzen von Instagram, an die sich diese Texte halten:**

- Textnachricht: maximal 1.000 Zeichen — hier bleibt jede deutlich darunter
- Quick Reply: maximal 20 Zeichen Beschriftung, maximal 13 Stück
- Karte (Card): Titel maximal 80 Zeichen, Untertitel maximal 80, bis zu 3 Buttons
- Instagram zeigt **keine** Formatierung: kein Fett, kein Kursiv. Absätze ja.

---

## [1] Begrüßung + Zielgruppenfrage

**Nachrichtentyp:** Text + Quick Replies

```
Schön, dass Sie da sind — und danke für die Nachricht.

Erstgespräche führen wir als Videocall, 25 Minuten, ohne Unterlagen und ohne
Verkaufsgespräch. Sie können sich gleich selbst einen freien Termin aussuchen.

Damit ich weiß, worum es bei Ihnen geht: Was trifft am ehesten zu?
```

**Quick Replies** (Beschriftung → Aktion)

| Beschriftung | Aktionen |
|---|---|
| `Ich habe eine Praxis` | Tag `zg-praxisinhaber` · Field `zielgruppe` = `praxisinhaber` · Field `terminlink` = Link A |
| `Angestellt in Klinik` | Tag `zg-angestellt` · Field `zielgruppe` = `angestellt` · Field `terminlink` = Link B |
| `MFA / Praxisteam` | Tag `zg-mfa` · Field `zielgruppe` = `mfa` · Field `terminlink` = Link C |
| `Etwas anderes` | Tag `zg-sonstiges` · Field `zielgruppe` = `sonstiges` · Field `terminlink` = Link D |

Zusätzlich auf allen vier Wegen: Tag `beratung-angefragt`.

**Die vier Links**

```
Link A  https://www.finanz-medizin.com/ueber-uns.html?utm_source=instagram&utm_medium=dm&utm_campaign=manychat-beratung&utm_content=praxisinhaber#termin
Link B  https://www.finanz-medizin.com/ueber-uns.html?utm_source=instagram&utm_medium=dm&utm_campaign=manychat-beratung&utm_content=angestellt#termin
Link C  https://www.finanz-medizin.com/ueber-uns.html?utm_source=instagram&utm_medium=dm&utm_campaign=manychat-beratung&utm_content=mfa#termin
Link D  https://www.finanz-medizin.com/ueber-uns.html?utm_source=instagram&utm_medium=dm&utm_campaign=manychat-beratung&utm_content=sonstiges#termin
```

Wer die Zielgruppen-Auswertung nicht braucht, setzt überall dieselbe Kurzadresse:

```
https://www.finanz-medizin.com/termin
```

---

## [2] Terminkarte — der eigentliche Schritt

**Nachrichtentyp:** Text, danach Karte mit Button

Text davor:

```
Alles klar. Hier sind die nächsten freien Zeiten — Sie suchen sich einen Termin
aus und tragen sich in einem Schritt selbst ein. Eine Bestätigung kommt sofort
per E-Mail.
```

**Karte**

| Feld | Inhalt |
|---|---|
| Titel | `Erstgespräch, 25 Minuten` |
| Untertitel | `Kein Verkaufsgespräch. Sie entscheiden danach in Ruhe.` |
| Bild | optional, quadratisch, 1080 × 1080 px |
| Button 1 | `Freie Zeiten ansehen` → Open Website → `{{terminlink}}` → Aktion: Tag `terminlink-geklickt` |
| Button 2 | `Lieber schreiben` → Aktion: Tag `mensch-gewuenscht`, Stop Automation, E-Mail-Benachrichtigung, danach Antwort [5] |

Direkt nach der Karte als eigene Textnachricht (Pflichtangabe, siehe README,
Abschnitt „Erstinformation"):

```
Zur Einordnung: Wir sind Versicherungsvermittler nach § 34d GewO und
Finanzanlagenvermittler nach § 34f GewO. Die vollständige Erstinformation und
alle Pflichtangaben stehen hier: finanz-medizin.com/impressum
```

---

## [3] Erinnerung nach 1 Stunde

Nur wenn der Tag `terminlink-geklickt` **nicht** gesetzt ist.

```
Falls der Link untergegangen ist — hier noch einmal:
{{terminlink}}

Es dauert keine zwei Minuten. Und falls Ihnen etwas dazwischengekommen ist:
Schreiben Sie einfach kurz, dann melden wir uns bei Ihnen.
```

---

## [4] Erinnerung nach 20 Stunden

Nur wenn der Tag `terminlink-geklickt` **nicht** gesetzt ist. Danach sendet die
Automation nichts mehr.

```
Letzte Nachricht von uns dazu, versprochen.

Wenn Sie in den nächsten Tagen 25 Minuten frei haben, finden Sie hier die
aktuellen Zeiten: {{terminlink}}

Passt es gerade nicht, ist das völlig in Ordnung. Sie können sich jederzeit
melden — wir antworten auch in einem halben Jahr noch.
```

---

## [5] Antwort auf „Lieber schreiben"

```
Machen wir. Schreiben Sie mir hier einfach, worum es geht und was Sie
beschäftigt — ich lese jede Nachricht selbst und antworte, sobald ich am
Schreibtisch bin.

Benedict
```

---

## [6] Standardantwort für alles andere (optional)

**Automation → Default Reply.** Greift bei Nachrichten, die kein Auslöserwort
enthalten. Sie ersetzt keine Antwort von Ihnen, sondern verhindert nur, dass jemand
im Leeren steht.

```
Danke für Ihre Nachricht — die geht direkt an mich, ich antworte
persönlich.

Wenn es um ein Erstgespräch geht, schreiben Sie einfach „Beratung", dann
bekommen Sie sofort die freien Termine.
```

---

## Was diese Texte bewusst nicht tun

- **Keine erfundene Dringlichkeit.** Kein „nur noch 2 Plätze", keine Countdowns. Die
  Zielgruppe sind Ärztinnen, Ärzte und Praxisteams; Druckmasche kostet dort genau
  die Menschen, die man haben will.
- **Kein Emoji-Teppich.** Ein Emoji in der öffentlichen Kommentarantwort, sonst
  keines. Der Rest der Marke arbeitet auch ohne.
- **Kein Versprechen, das die Seite nicht hält.** Der Link führt zu echten freien
  Zeiten aus dem Kalender. Zeigt der Kalender keine, zeigt die Seite den
  Rückruf-Block — deshalb steht im Text „die nächsten freien Zeiten" und nicht
  „buchen Sie jetzt sofort".
- **Keine Beratung in der DM.** Konkrete Produkt- oder Anlagefragen gehören ins
  Gespräch, nicht in eine automatische Nachricht — schon aus Haftungsgründen.
