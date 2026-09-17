# Nachrichtentexte „Beratung → Check"

Alles hier steht fertig zum Kopieren in ManyChat. Die Nummerierung entspricht den
Ablaufdiagrammen in [`README.md`](README.md).

**Formatgrenzen von Instagram, an die sich diese Texte halten:**

- Textnachricht: maximal 1.000 Zeichen — hier bleibt jede deutlich darunter
- Quick Reply: maximal 20 Zeichen Beschriftung, maximal 13 Stück
- Karte (Card): Titel maximal 80 Zeichen, Untertitel maximal 80, bis zu 3 Buttons
- Instagram zeigt **keine** Formatierung: kein Fett, kein Kursiv. Absätze ja.

---

# Variante A — ein Link, ohne Rückfrage

## [1] Die einzige Nachricht, auf die es ankommt

**Nachrichtentyp:** Text, danach Karte mit Button

Text:

```
Schön, dass Sie da sind — und danke für die Nachricht.

Damit ich Ihnen nicht die Standardantwort schicke: Auf der Website stehen ein
paar Fragen zu Ihrer Situation. Rund 90 Sekunden, keine Unterlagen nötig.
Danach weiß ich, worum es geht, und melde mich mit einem konkreten Vorschlag
statt mit Allgemeinplätzen.
```

**Karte**

| Feld | Inhalt |
|---|---|
| Titel | `Ihre Situation in 90 Sekunden` |
| Untertitel | `Fünf Fragen. Danach melde ich mich persönlich.` |
| Bild | optional, quadratisch, 1080 × 1080 px |
| Button 1 | `Jetzt ausfüllen` → Open Website → `https://www.finanz-medizin.com/beratung` → Aktion: Tag `link-geklickt` |
| Button 2 | `Lieber schreiben` → Aktion: Tag `mensch-gewuenscht`, Stop Automation, E-Mail-Benachrichtigung, danach Antwort [5] |

Direkt danach als eigene Textnachricht:

```
Zur Einordnung: Wir sind Versicherungsvermittler nach § 34d GewO und
Finanzanlagenvermittler nach § 34f GewO. Alle Pflichtangaben stehen hier:
finanz-medizin.com/impressum
```

---

# Variante B — mit Rollenfrage in der DM

## [1] Begrüßung + Rollenfrage

**Nachrichtentyp:** Text + Quick Replies

```
Schön, dass Sie da sind — und danke für die Nachricht.

Damit Sie die passenden Fragen bekommen und nicht die für alle: Was trifft am
ehesten zu?
```

**Quick Replies** (Beschriftung → Aktion)

| Beschriftung | Aktionen |
|---|---|
| `Ich habe eine Praxis` | Tag `zg-praxisinhaber` · Field `linkziel` = Link A |
| `Angestellt in Klinik` | Tag `zg-angestellt` · Field `linkziel` = Link B |
| `MFA / Praxisteam` | Tag `zg-mfa` · Field `linkziel` = Link C |
| `Etwas anderes` | Tag `zg-sonstiges` · Field `linkziel` = Link D |

Zusätzlich auf allen vier Wegen: Tag `beratung-angefragt`.

**Die vier Links**

```
Link A  https://www.finanz-medizin.com/check-praxis
Link B  https://www.finanz-medizin.com/check-arzt
Link C  https://www.finanz-medizin.com/check-mfa
Link D  https://www.finanz-medizin.com/beratung
```

Jede dieser Adressen springt direkt in den Check der passenden Seite und bringt die
Instagram-Herkunft als UTM-Parameter mit. Link D führt auf die Weiche, wo die Person
selbst wählt.

## [2] Der Link

**Nachrichtentyp:** Text, danach Karte mit Button

Text:

```
Alles klar. Dann hier entlang: ein paar Fragen zu Ihrer Situation, rund 90
Sekunden, keine Unterlagen nötig. Danach weiß ich, worum es geht, und melde
mich mit einem konkreten Vorschlag.
```

**Karte**

| Feld | Inhalt |
|---|---|
| Titel | `Ihre Situation in 90 Sekunden` |
| Untertitel | `Fünf Fragen. Danach melde ich mich persönlich.` |
| Button 1 | `Jetzt ausfüllen` → Open Website → `{{linkziel}}` → Aktion: Tag `link-geklickt` |
| Button 2 | `Lieber schreiben` → Aktion: Tag `mensch-gewuenscht`, Stop Automation, E-Mail-Benachrichtigung, danach Antwort [5] |

Danach dieselbe Impressum-Zeile wie in Variante A.

---

# Gemeinsam für beide Varianten

## [3] Erinnerung nach 1 Stunde

Nur wenn der Tag `link-geklickt` **nicht** gesetzt ist. In Variante A steht statt
`{{linkziel}}` die feste Adresse `finanz-medizin.com/beratung`.

```
Falls der Link untergegangen ist — hier noch einmal:
{{linkziel}}

Es dauert keine zwei Minuten. Und falls Ihnen etwas dazwischengekommen ist:
Schreiben Sie einfach kurz, dann machen wir es anders.
```

## [4] Erinnerung nach 20 Stunden

Nur wenn der Tag `link-geklickt` **nicht** gesetzt ist. Danach sendet die Automation
nichts mehr.

```
Letzte Nachricht von uns dazu, versprochen.

Wenn Sie zwei Minuten übrig haben, hier sind die Fragen: {{linkziel}}

Passt es gerade nicht, ist das völlig in Ordnung. Sie können sich jederzeit
melden — wir antworten auch in einem halben Jahr noch.
```

## [5] Antwort auf „Lieber schreiben"

```
Machen wir. Schreiben Sie mir hier einfach, worum es geht und was Sie
beschäftigt — ich lese jede Nachricht selbst und antworte, sobald ich am
Schreibtisch bin.

Benedict
```

## [6] Standardantwort für alles andere (optional)

**Automation → Default Reply.** Greift bei Nachrichten, die kein Auslöserwort
enthalten. Sie ersetzt keine Antwort von Ihnen, sondern verhindert nur, dass jemand
im Leeren steht.

```
Danke für Ihre Nachricht — die geht direkt an mich, ich antworte
persönlich.

Wenn es um eine Beratung geht, schreiben Sie einfach „Beratung", dann
bekommen Sie sofort den passenden Link.
```

---

## Was diese Texte bewusst nicht tun

- **Keine erfundene Dringlichkeit.** Kein „nur noch 2 Plätze", keine Countdowns. Die
  Zielgruppe sind Ärztinnen, Ärzte und Praxisteams; Druckmasche kostet dort genau
  die Menschen, die man haben will.
- **Kein Emoji-Teppich.** Ein Emoji in der öffentlichen Kommentarantwort, sonst
  keines. Der Rest der Marke arbeitet auch ohne.
- **Keine Kontaktdaten in der DM abfragen.** Name, E-Mail und Erreichbarkeit stehen
  im Check — dort landen sie strukturiert im CRM statt als Fließtext im Postfach.
- **Keine Beratung in der DM.** Konkrete Produkt- oder Anlagefragen gehören ins
  Gespräch, nicht in eine automatische Nachricht — schon aus Haftungsgründen.
