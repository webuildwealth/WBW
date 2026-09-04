# SETUP — Consent, Tracking und offene Angaben

Alles, was nach dem Deploy noch von Hand zu tun ist. Reihenfolge einhalten:
Schritt 1 muss stehen, bevor Schritt 2 Sinn ergibt, und Schritt 3 blockiert
den Livegang.

---

## 1 · Cookiebot einrichten

1. Konto auf [cookiebot.com](https://www.cookiebot.com) anlegen.
2. Domain `finanz-medizin.com` als *Domain Group* hinzufügen und verifizieren.
3. Die **Domain Group ID** kopieren (Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
4. Im Projekt alle Vorkommen von `COOKIEBOT_CBID_HIER` ersetzen:

   ```bash
   grep -rl COOKIEBOT_CBID_HIER . --include='*.html' \
     | xargs sed -i 's/COOKIEBOT_CBID_HIER/IHRE-ECHTE-ID/g'
   ```

   Betroffen sind alle 10 HTML-Seiten: je einmal das `uc.js`-Skript im `<head>`,
   dazu das `cd.js`-Deklarationsskript zweimal — in `cookie-richtlinie.html`
   und in `datenschutz.html` (Abschnitt 11).

5. In Cookiebot einen ersten **Scan** auslösen. Erst danach füllt sich die
   Tabelle auf der Cookie-Richtlinie-Seite.

**Kategorien prüfen.** Cookiebot ordnet gefundene Cookies automatisch ein.
Kontrollieren Sie, dass Clarity unter *Statistik* landet und nicht unter
*Notwendig* — sonst würde es ohne Einwilligung laden, und die gesamte
Konstruktion wäre wertlos.

---

## 2 · Google Tag Manager

### 2.1 Container anlegen

1. [tagmanager.google.com](https://tagmanager.google.com) → Konto und Container
   für `finanz-medizin.com`, Zielplattform **Web**.
2. Container-ID kopieren (Format `GTM-XXXXXXX`).
3. Im Projekt ersetzen:

   ```bash
   grep -rl GTM-XXXXXXX . --include='*.html' \
     | xargs sed -i 's/GTM-XXXXXXX/GTM-IHRECHTE/g'
   ```

   Pro Seite zweimal enthalten: Head-Snippet und `noscript`-iframe im Body.

### 2.2 Consent Mode im Container aktivieren

*Container-Einstellungen* → **Einwilligungsübersicht** einschalten. Damit
zeigt der GTM pro Tag an, ob eine Einwilligungsprüfung hinterlegt ist.

Der Default-Block liegt bereits im HTML — er setzt alle sieben Typen
(`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`,
`functionality_storage`, `personalization_storage`, `security_storage`)
auf `denied` mit `wait_for_update: 500`. Im GTM ist dafür **nichts** mehr
einzurichten; ein zweiter Default-Block im Container würde den ersten
überschreiben und die Reihenfolge unklar machen.

#### Der Container lädt erst nach der Einwilligung

Das GTM-Snippet auf dieser Website weicht bewusst vom Standard ab: Es lädt
`gtm.js` **nicht** sofort, sondern wartet auf ein Einwilligungssignal von
Cookiebot (Statistik oder Marketing).

Grund: Schon das Anfordern von `gtm.js` überträgt die IP-Adresse des Besuchers
an Google. Das Standard-Snippet verlässt sich darauf, dass Cookiebots
Auto-Blocking die Einfügung zur Laufzeit abfängt. Das funktioniert meistens —
aber „meistens" ist bei § 25 TDDDG die falsche Kategorie, und die
Datenschutzerklärung sagt ausdrücklich zu, dass der Container erst nach der
Einwilligung geladen wird.

**Was das kostet:** Ohne geladenen Container erreichen auch die
`denied`-Signale des Consent Mode Google nicht. Die cookielose Modellierung
(„Conversion Modeling") entfällt damit. Für den derzeitigen Aufbau — Clarity
als einziges Werkzeug, das ohnehin Einwilligung braucht — ist das kein Verlust.

**Falls Sie später GA4 mit Modellierung einsetzen wollen:** In allen HTML-Seiten
im GTM-Block die Zeile

```js
  pruefeUndStarte();
```

am Ende der Funktion ersetzen durch

```js
  starteGtm();
```

Dann lädt der Container wie im Standard-Snippet sofort, und Cookiebot hält
lediglich die einzelnen Tags zurück. **Wird das geändert, muss auch Abschnitt 7
der Datenschutzerklärung angepasst werden** — dort steht sonst eine Zusage, die
nicht mehr stimmt.

### 2.3 Cookiebot-Vorlage einbinden

1. GTM → *Vorlagen* → **Vorlagengalerie durchsuchen** → „Cookiebot CMP".
2. Vorlage hinzufügen, dann als Tag anlegen:
   - **Tag-Typ:** Cookiebot CMP
   - **Domain Group ID:** Ihre CBID aus Schritt 1
   - **Trigger:** *Consent Initialization – All Pages*
   - **Tag-Reihenfolge:** ganz oben (Consent Initialization feuert vor allem anderen)

### 2.4 Microsoft Clarity als Tag

Clarity steht bewusst **nicht** im HTML — so lässt es sich abschalten, ohne
die Seite neu zu deployen, und der Consent-Check liegt an einer Stelle.

1. [clarity.microsoft.com](https://clarity.microsoft.com) → Projekt anlegen →
   **Projekt-ID** kopieren.
2. GTM → *Tags* → **Neu**:

   | Feld | Wert |
   |---|---|
   | Tag-Typ | Benutzerdefiniertes HTML |
   | Trigger | All Pages (`gtm.js`) |
   | Name | `Clarity – Statistik` |

3. Als HTML einsetzen (`IHRE_CLARITY_ID` ersetzen):

   ```html
   <script>
   (function(c,l,a,r,i,t,y){
       c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
       t=l.createElement(r);t.async=1;
       t.src="https://www.clarity.ms/tag/"+i;
       y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
   })(window, document, "clarity", "script", "IHRE_CLARITY_ID");
   </script>
   ```

4. **Einwilligungsbedingung setzen — der wichtigste Schritt:**
   Im Tag unter *Erweiterte Einstellungen* → **Einwilligungseinstellungen** →
   *Zusätzliche Einwilligung erforderlich für Tag-Auslösung* →
   **`analytics_storage`** hinzufügen.

   Ohne diesen Eintrag feuert das Tag unabhängig von der Einwilligung. Der
   Consent Mode allein reicht bei einem Custom-HTML-Tag **nicht** — er steuert
   nur Google-eigene Tags.

5. Zusätzlich als zweite Absicherung eine Auslöse-Ausnahme über eine
   Datenschichtvariable ist **nicht** nötig, wenn Schritt 4 gesetzt ist und
   Cookiebot mit `data-blockingmode="auto"` läuft. Beide greifen unabhängig
   voneinander.

### 2.5 Clarity-Maskierung härten

Die Datenschutzerklärung sagt zu, dass Formulareingaben maskiert werden.
Diese Zusage müssen Sie in Clarity einlösen:

Clarity → *Settings* → **Masking** → auf **Strict** stellen.

Auf dieser Website tragen Besucher in die Online-Checks und die Terminbuchung
Namen, E-Mail-Adressen, Telefonnummern sowie Angaben zu Praxis, Einkommen und
Verträgen ein. Steht die Maskierung nicht auf *Strict*, landen diese Inhalte in
den Sitzungsaufzeichnungen — und damit läge eine Verarbeitung vor, die weder in
der Datenschutzerklärung beschrieben noch von der Einwilligung gedeckt ist.

Nach dem Einrichten stichprobenartig eine eigene Sitzung aufzeichnen, einen
Check ausfüllen und in der Wiedergabe prüfen, dass dort Platzhalter statt
Klartext stehen.

### 2.6 Veröffentlichen

GTM → **Senden** → Versionsname vergeben → *Veröffentlichen*. Vorher im
**Vorschaumodus** testen (siehe Abschnitt 5).

---

## 3 · Offene Angaben in den Rechtsseiten

Alle Platzhalter sind im Quelltext als `[[NAME]]` markiert und werden auf der
Seite **gelb hinterlegt** dargestellt — sie fallen also auf, falls eine Seite
versehentlich damit live geht.

Auffinden:

```bash
grep -rn '\[\[' *.html
```

### Impressum (`impressum.html`)

| Platzhalter | Woher |
|---|---|
| `[[UMSATZSTEUER_ID]]` | Steuerbescheid / BZSt. Liegt keine vor, den Absatz durch den im Quelltext angegebenen Alternativsatz ersetzen und den Hinweisabsatz löschen. |
| `[[HAFTPFLICHT_VERSICHERER]]` | Versicherungsschein der Vermögensschaden-Haftpflicht |
| `[[HAFTPFLICHT_ANSCHRIFT]]` | ebenda |
| `[[HAFTPFLICHT_POLICE]]` | ebenda |
| `[[HAFTPFLICHT_GELTUNGSBEREICH]]` | ebenda, üblich: „Deutschland" oder „Europäischer Wirtschaftsraum" |

**Bereits vollständig und nicht anzufassen** — diese Angaben stammen aus Ihrem
bestehenden Impressum und sind keine Platzhalter: Name, Anschrift, Telefon,
E-Mail, beide Erlaubnisse nach § 34d und § 34f GewO, beide Registernummern,
IHK Berlin als Aufsicht, die Erklärung zu Beteiligungen über 10 %, beide
Ombudsstellen mit Anschrift.

### Datenschutzerklärung (`datenschutz.html`)

Keine Platzhalter — aber ganz oben im Quelltext steht ein **ENTWURF-Vermerk**.
Die Seite ist vor dem Livegang anwaltlich prüfen zu lassen; die kritischen
Punkte sind dort einzeln aufgeführt. Nach der Prüfung den Kommentarblock
entfernen.

### Auftragsverarbeitungsverträge

Die Erklärung sagt zu, dass sie bestehen. Einzulösen bei: Netlify, Close,
Google (Cloud + Tag Manager), **Usercentrics/Cookiebot** und **Microsoft**
(Clarity). Die letzten beiden sind neu hinzugekommen.

---

## 4 · Was sich an der Auslieferung geändert hat

Die Content-Security-Policy in `netlify.toml` war zuvor vollständig auf
`'self'` gestellt — die Seite lud ausschließlich eigene Dateien. Cookiebot und
GTM hätten darunter **nicht geladen**, ohne dass es auffällt: Die Seite hätte
normal ausgesehen, im Konsolen-Log wäre lediglich ein CSP-Verstoß erschienen.

Freigegeben ist jetzt genau, was die eingebauten Dienste brauchen — Cookiebot,
GTM, GA4 und Clarity. Nichts davon lädt ohne Einwilligung: Die CSP *erlaubt*
nur, blockiert wird von Cookiebot.

Wollen Sie später ein weiteres Werkzeug über den GTM einbinden, muss dessen
Host in `netlify.toml` ergänzt werden — sonst blockiert die CSP es stillschweigend.

`'unsafe-eval'` ist **nicht** gesetzt. Bleibt der GTM-Vorschaumodus leer oder
lädt eine benutzerdefinierte Vorlage nicht, ist das die wahrscheinliche
Ursache. Dann in `netlify.toml` in `script-src` `'unsafe-eval'` ergänzen — und
danach wieder entfernen, wenn die Vorschau nicht mehr gebraucht wird.

---

## 5 · Selbst nachprüfen, dass ohne Einwilligung nichts lädt

Diese Prüfung ist der eigentliche Nachweis. Machen Sie sie nach jeder
Änderung am GTM.

### Vorbereitung

Immer im **privaten Fenster** prüfen — sonst liegt Ihre eigene Einwilligung
schon im Browser und Sie sehen ein falsches Ergebnis.

### 5.1 Cookies (DevTools → Application)

1. F12 → Reiter **Application** → links **Storage** → **Cookies** →
   `https://finanz-medizin.com`
2. Seite laden, Banner **stehen lassen** — nichts anklicken.
3. **Erwartung:** höchstens `CookieConsent` von Cookiebot selbst. Wenn Sie noch
   nicht entschieden haben, kann auch dieses fehlen.

   **Nicht vorhanden sein dürfen:** `_ga`, `_gid`, `_gat` (Google Analytics),
   `_clck`, `_clsk` (Clarity), `MUID` (Microsoft).

4. Jetzt im Banner **alle ablehnen**. Cookie-Liste erneut ansehen: unverändert.
5. Jetzt **alle akzeptieren**. Nach dem Neuladen müssen `_clck` und `_clsk`
   erscheinen. Tun sie das nicht, feuert das Clarity-Tag nicht — Consent-Bedingung
   in Schritt 2.4 prüfen.

Ebenfalls unter *Application* prüfen: **Local Storage** und **Session Storage**.
Dort darf ohne Einwilligung nur `fm_campaign` bzw. `fm_rail_zu` stehen — beides
von dieser Website selbst, ohne Personenbezug, ohne Übertragung.

### 5.2 Netzwerkverkehr (DevTools → Network)

1. F12 → **Network** → Häkchen bei *Disable cache* → Seite neu laden.
2. In das Filterfeld nacheinander eintragen und prüfen:

   | Filter | ohne Einwilligung | nach Zustimmung |
   |---|---|---|
   | `clarity` | **keine Zeile** | mehrere Zeilen |
   | `google-analytics` | **keine Zeile** | Zeilen |
   | `googletagmanager` | **keine Zeile** | `gtm.js` |
   | `cookiebot` | `uc.js` — korrekt, das ist das Banner | ebenso |

   Anders als bei einem Standard-GTM-Einbau darf hier vor der Einwilligung
   **gar keine** Zeile mit `googletagmanager` erscheinen — siehe Abschnitt 2.2.
   Erscheint doch eine, ist das GTM-Snippet versehentlich durch die
   Standardfassung ersetzt worden.

3. Zusätzlich Reiter **Console** ansehen. Erscheint dort
   `Refused to load the script ... Content Security Policy`, fehlt der Host in
   `netlify.toml` — siehe Abschnitt 4.

### 5.3 Widerruf prüfen

1. Einwilligung erteilen, Seite neu laden, `_clck` im Cookie-Reiter bestätigen.
2. Ganz nach unten scrollen → **„Cookie-Einstellungen ändern"** anklicken.
3. Banner muss sich erneut öffnen. Alles ablehnen.
4. Seite neu laden → `_clck` und `_clsk` müssen verschwunden sein.

Wird der Knopf gar nicht angezeigt, ist Cookiebot nicht geladen — dann blendet
die Seite ihn absichtlich aus, statt eine tote Schaltfläche zu zeigen. Prüfen
Sie in dem Fall zuerst, ob die CBID aus Schritt 1 wirklich eingetragen ist.

### 5.4 GTM-Vorschaumodus

GTM → **Vorschau** → URL eingeben. Im Tag-Assistenten links unten auf
**Consent** klicken: Dort steht pro Tag, ob es wegen fehlender Einwilligung
zurückgehalten wurde. Das Clarity-Tag muss vor der Zustimmung unter
*Nicht ausgelöst* stehen, mit dem Grund `analytics_storage`.
