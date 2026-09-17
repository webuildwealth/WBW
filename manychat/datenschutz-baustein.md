# Textbaustein für `datenschutz.html` — Instagram-DM und ManyChat

**Status: Entwurf. Vor dem Livegang von einer Rechtsberatung prüfen lassen.**
Dieser Baustein beschreibt, was die Automation tatsächlich tut — er ist kein
juristisches Gutachten und ersetzt keine Prüfung.

Die Datenschutzerklärung hat aktuell 14 Abschnitte. Der neue Abschnitt passt
thematisch hinter Abschnitt 5 (Terminbuchung). Einfügen heißt deshalb:

1. Den Block unten **nach** dem Abschnitt „5. Terminbuchung über Google Kalender"
   einsetzen, also vor `<h2 id="einwilligung">`.
2. Die Abschnitte 6 bis 14 auf 7 bis 15 **hochzählen** — die Nummern stehen im
   `<h2>`-Text, die `id`-Attribute bleiben unverändert.
3. Im Inhaltsverzeichnis (um Zeile 341) einen Eintrag ergänzen:
   `<li><a href="#instagram">Instagram-Direktnachrichten (ManyChat)</a></li>`
4. In Abschnitt „Empfänger Ihrer Daten" ManyChat in die Liste aufnehmen.
5. Die Anschrift von ManyChat aus dem abgeschlossenen DPA eintragen — im Entwurf
   steht dafür ein Platzhalter.

---

## Einzufügender Block

```html
    <h2 id="instagram">6. Instagram-Direktnachrichten (ManyChat)</h2>
    <p>
      Wir betreiben ein Unternehmensprofil auf Instagram. Schreiben Sie uns dort eine
      Direktnachricht, beantworten wir bestimmte Anfragen — etwa die Bitte um ein
      Erstgespräch — zunächst automatisiert. Dafür setzen wir den Dienst
      <strong>ManyChat</strong> der ManyChat, Inc., <em>[Anschrift aus dem
      Auftragsverarbeitungsvertrag eintragen]</em>, USA, ein.
    </p>
    <p>
      Verarbeitet werden dabei:
    </p>
    <ul>
      <li>Ihr Instagram-Benutzername, Ihr angezeigter Name und Ihre Instagram-ID</li>
      <li>Ihr Profilbild, sofern Instagram es übermittelt</li>
      <li>der Inhalt und der Zeitpunkt Ihrer Nachrichten an uns und unserer Antworten</li>
      <li>Ihre Auswahl innerhalb der automatischen Antwort (etwa die Angabe, ob Sie
        eine Praxis führen, angestellt oder im Praxisteam tätig sind)</li>
      <li>die Angabe, ob Sie den Link zur Terminbuchung geöffnet haben</li>
    </ul>
    <p>
      Diese Angaben speichern wir in ManyChat, um den Gesprächsverlauf nachvollziehen
      und Ihnen passend antworten zu können. Wir nutzen sie nicht für Werbung an Sie
      außerhalb der von Ihnen selbst begonnenen Unterhaltung.
    </p>
    <p>
      Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Nachricht der
      Anbahnung eines Vertrags dient, im Übrigen unser berechtigtes Interesse nach
      Art. 6 Abs. 1 lit. f DSGVO daran, Anfragen zügig und außerhalb der Bürozeiten
      zu beantworten. Widersprechen Sie der automatischen Beantwortung, genügt ein
      Hinweis in der Unterhaltung; wir antworten dann ausschließlich persönlich.
    </p>
    <p>
      Mit ManyChat besteht ein Vertrag über die Auftragsverarbeitung nach Art. 28
      DSGVO. Da der Anbieter seinen Sitz in den USA hat, werden Daten in ein Drittland
      übermittelt. Grundlage sind die Standardvertragsklauseln der EU-Kommission nach
      Art. 46 Abs. 2 lit. c DSGVO.
      <em>[Prüfen und ergänzen: Zertifizierung unter dem EU-US Data Privacy
      Framework]</em>
    </p>
    <p>
      Unabhängig davon ist für den Betrieb von Instagram und für die Verarbeitung
      Ihrer Nachrichten auf der Plattform selbst die <strong>Meta Platforms Ireland
      Limited</strong>, Merrion Road, Dublin 4, D04 X2K5, Irland, verantwortlich.
      Auf diese Verarbeitung haben wir keinen Einfluss. Es gilt die
      Datenschutzrichtlinie von Meta.
    </p>
    <p>
      Wir löschen Unterhaltungen in ManyChat spätestens zwölf Monate nach dem letzten
      Nachrichtenaustausch, sofern daraus keine Geschäftsbeziehung entstanden ist und
      keine gesetzliche Aufbewahrungspflicht besteht. Führt die Anfrage zu einem
      Termin, gilt für die dabei erhobenen Angaben Abschnitt 5.
    </p>
    <p>
      Wenn Sie uns über Instagram keine Daten anvertrauen möchten, erreichen Sie uns
      jederzeit unter <a href="mailto:info@finanz-medizin.com">info@finanz-medizin.com</a>
      oder über die Terminbuchung auf dieser Website.
    </p>
```

---

## Ergänzung in Abschnitt „Empfänger Ihrer Daten"

Als weiteren Listenpunkt aufnehmen:

```html
      <li><strong>ManyChat, Inc.</strong> (USA) — automatische Beantwortung von
        Instagram-Direktnachrichten, siehe Abschnitt 6</li>
```

## Noch zu klären, bevor der Abschnitt live geht

- [ ] DPA bei ManyChat abgeschlossen und Anschrift eingetragen
- [ ] Data-Privacy-Framework-Zertifizierung geprüft, Platzhalter ersetzt oder Satz
      gestrichen
- [ ] Löschfrist (zwölf Monate) mit der tatsächlichen Praxis abgeglichen
- [ ] Verzeichnis von Verarbeitungstätigkeiten um ManyChat ergänzt
- [ ] Abschnittsnummern 6 bis 14 hochgezählt, Inhaltsverzeichnis ergänzt
