#!/usr/bin/env node
/* =============================================================================
 *  Legt die Properties in HubSpot an
 *
 *      npm run setup:properties            anlegen und ergaenzen
 *      npm run setup:properties -- --dry   nur zeigen, was passieren wuerde
 *
 *  Beliebig oft aufrufbar: Vorhandenes wird nicht angefasst, nur Fehlendes
 *  ergaenzt. Bei Auswahlfeldern werden fehlende Optionen nachgetragen — wer
 *  ein weiteres Absenderkonto in SENDER_ACCOUNTS eintraegt, laesst das Skript
 *  einfach noch einmal laufen.
 *
 *  Ueber die Objektarten: Properties gelten in HubSpot je Objektart. Damit
 *  dieselbe Mechanik an Kontakt, Unternehmen und Lead funktioniert, muss
 *  jede Property dreimal angelegt werden. Kennt das Portal die Objektart
 *  Leads nicht (die gibt es erst ab Sales Hub Professional), wird sie
 *  uebersprungen — ohne Abbruch.
 * ========================================================================== */

'use strict';

const { konfig, pruefeKonfig } = require('../src/config.js');
const { HubSpot } = require('../src/hubspot.js');
const { ALLE, BESCHRIFTUNG } = require('../src/status.js');
const { Sequenzen, SEQ_STATUS_ALLE, SEQ_BESCHRIFTUNG } = require('../src/sequence.js');

const GRUPPE = 'automation_email';
const GRUPPE_TITEL = 'Automatisierter E-Mail-Versand';

const nurZeigen = process.argv.indexOf('--dry') !== -1 || process.argv.indexOf('--dry-run') !== -1;

/* Baut die Feldliste aus der Konfiguration — die Namen sind ja einstellbar. */
function definitionen(cfg, objektTyp) {
  const p = cfg.props;
  const nummer = { start: 1 };
  const felder = [];

  const dazu = (name, titel, typ, feldTyp, beschreibung, zusatz) => {
    if (!name) return;
    felder.push(Object.assign({
      name: name,
      label: titel,
      type: typ,
      fieldType: feldTyp,
      groupName: GRUPPE,
      description: beschreibung,
      displayOrder: nummer.start++,
      hasUniqueValue: false,
      hidden: false,
      formField: false
    }, zusatz || {}));
  };

  dazu(p.enabled, 'E-Mail senden', 'bool', 'booleancheckbox',
    'Der Hauptschalter. Ohne Haken passiert gar nichts, egal was im Status steht.',
    { options: [
      { label: 'Ja', value: 'true', displayOrder: 0, hidden: false },
      { label: 'Nein', value: 'false', displayOrder: 1, hidden: false }
    ] });

  dazu(p.status, 'E-Mail Status', 'enumeration', 'select',
    'Steuert und dokumentiert den Versand. Auf "Zum Versand freigegeben" (queued) stellen, ' +
    'um die Mail loszuschicken. Alles Weitere traegt die Automation selbst ein.',
    { options: ALLE.map((wert, i) => ({
      label: BESCHRIFTUNG[wert] + ' (' + wert + ')', value: wert, displayOrder: i, hidden: false
    })) });

  dazu(p.subject, 'E-Mail Betreff', 'string', 'text',
    'Betreff der Mail. Platzhalter wie {{firstname}} sind erlaubt.');

  dazu(p.body, 'E-Mail Inhalt', 'string', 'textarea',
    'Der Mailtext. Reiner Text oder HTML — beides wird erkannt. Platzhalter: ' +
    '{{firstname}}, {{lastname}}, {{company}}, {{meeting_date}}, {{meeting_time}}, {{sender_name}}. ' +
    'Mit {{firstname|Kunde}} laesst sich ein Ersatz fuer den Fall angeben, dass das Feld leer ist.');

  dazu(p.sendAt, 'Gewuenschter Versandzeitpunkt', 'datetime', 'date',
    'Leer lassen fuer sofort. Steht hier ein Zeitpunkt in der Zukunft, wartet die Automation ' +
    'bis dahin (Zeitzone ' + cfg.zeitzone + ').');

  dazu(p.sender, 'Absenderkonto', 'enumeration', 'select',
    'Aus welchem Postfach die Mail rausgeht. Leer = ' + cfg.absender.standard + '.',
    { options: Object.values(cfg.absender.konten).map((k, i) => ({
      label: (k.name ? k.name + ' — ' : '') + k.email, value: k.key, displayOrder: i, hidden: false
    })) });

  dazu(p.template, 'E-Mail Vorlage', 'enumeration', 'select',
    'Fuer spaetere Mailtypen. Geht derzeit nur in die Send-ID ein und dient der Auswertung.',
    { options: vorlagenOptionen() });

  dazu(p.sequence, 'Kampagne', 'enumeration', 'select',
    'Mehrstufige Ansprache mit Nachfassmails. Steht hier eine Kampagne, liefert sie Betreff und ' +
    'Text — die Freitextfelder werden dann nicht gelesen. Die Kampagne startet, sobald der Haken ' +
    'gesetzt und der Status auf "queued" steht; alles Weitere laeuft von selbst.',
    { options: kampagnenOptionen() });

  dazu(p.sequenceStep, 'Kampagne: letzter Schritt', 'number', 'number',
    'Wie viele Schritte der Kampagne schon raus sind. Von der Automation gesetzt. ' +
    'Zurueckstellen wiederholt den betreffenden Schritt — die Dublettensperre verhindert dabei, ' +
    'dass dieselbe Mail ein zweites Mal ankommt.');

  dazu(p.sequenceStatus, 'Kampagne: Stand', 'enumeration', 'select',
    'Laeuft, abgeschlossen oder gestoppt. Auf "Gestoppt — von Hand" setzen, um keine weiteren ' +
    'Nachfassmails mehr zu verschicken.',
    { options: SEQ_STATUS_ALLE.map((wert, i) => ({
      label: SEQ_BESCHRIFTUNG[wert] + ' (' + wert + ')', value: wert, displayOrder: i, hidden: false
    })) });

  dazu(p.recipient, 'Empfaenger (Vorgabe)', 'string', 'text',
    'Ausdrueckliche Empfaengeradresse. Schlaegt jede Herleitung. Nur setzen, wenn die Adresse ' +
    'abweichen soll oder die Automation den Empfaenger nicht eindeutig bestimmen kann.');

  if (objektTyp === 'companies') {
    dazu(p.contactId, 'Ansprechpartner (Kontakt-ID)', 'string', 'text',
      'Die HubSpot-ID des Kontakts, der die Mail bekommen soll. Pflicht, sobald mehr als ein ' +
      'Kontakt mit dem Unternehmen verknuepft ist — sonst ist der Empfaenger nicht eindeutig ' +
      'und es wird bewusst nichts verschickt.');
  }

  dazu(p.sendKey, 'Freigabeschluessel', 'string', 'text',
    'Nur noetig, um denselben Text absichtlich ein zweites Mal zu senden. Etwas Neues ' +
    'eintragen ("Nachfass 1") — das aendert die Send-ID und gibt den Versand frei. ' +
    'Ohne diese Aenderung verhindert die Dublettensperre die Wiederholung.');

  dazu(p.meetingAt, 'Termin (fuer Platzhalter)', 'datetime', 'date',
    'Quelle fuer {{meeting_date}} und {{meeting_time}}.');

  /* Ab hier: was die Automation zurueckschreibt. */
  dazu(p.sentAt, 'E-Mail versendet am', 'datetime', 'date',
    'Von der Automation gesetzt. Nicht von Hand aendern.');

  dazu(p.id, 'E-Mail Send-ID', 'string', 'text',
    'Eindeutige Kennung genau dieser Mail. Von der Automation gesetzt. Steht auch als ' +
    'Kopfzeile X-Automation-Send-Id in der verschickten Nachricht — damit laesst sich im ' +
    'Postausgang zweifelsfrei nachsehen, welche Mail gemeint ist.');

  dazu(p.messageId, 'E-Mail Gmail-ID', 'string', 'text',
    'Die Kennung, die Gmail der Nachricht gegeben hat. Von der Automation gesetzt.');

  dazu(p.attempts, 'E-Mail Versuche', 'number', 'number',
    'Wie oft versucht wurde. Von der Automation gesetzt.');

  dazu(p.error, 'E-Mail Fehler', 'string', 'textarea',
    'Klartext des letzten Fehlers samt Hinweis, was zu tun ist. Von der Automation gesetzt.');

  return felder;
}

/* Die Auswahl im CRM entsteht aus den Dateien in sequences/ — so kann kein
   Wert im Auswahlfeld stehen, zu dem es keine Kampagne gibt. */
function kampagnenOptionen() {
  const gefunden = new Sequenzen(konfig().sequenz.verzeichnis).lade();
  const namen = gefunden.schluessel();
  if (!namen.length) return [{ label: '(keine hinterlegt)', value: '', displayOrder: 0, hidden: true }];

  return namen.map((schluessel, i) => {
    const s = gefunden.fuer(schluessel);
    return {
      label: (s.name ? s.name + ' — ' : '') + schluessel + ' (' + s.schritte.length + ' Schritte)',
      value: schluessel, displayOrder: i, hidden: false
    };
  });
}

function vorlagenOptionen() {
  const roh = (process.env.TEMPLATE_OPTIONS || 'standard,erstinformation,terminbestaetigung,nachfass').trim();
  return roh.split(',').map((s) => s.trim()).filter(Boolean).map((wert, i) => ({
    label: wert.charAt(0).toUpperCase() + wert.slice(1), value: wert, displayOrder: i, hidden: false
  }));
}

/* ------------------------------------------------------------------ Lauf */
async function stelleGruppeSicher(hubspot, objektTyp) {
  const gruppen = await hubspot.gruppenListe(objektTyp);
  if (gruppen.some((g) => g.name === GRUPPE)) return 'vorhanden';
  if (nurZeigen) return 'wuerde angelegt';
  await hubspot.legeGruppeAn(objektTyp, { name: GRUPPE, label: GRUPPE_TITEL, displayOrder: -1 });
  return 'angelegt';
}

/* Optionen ergaenzen, ohne bestehende zu verlieren — in ihnen stecken Daten. */
function fehlendeOptionen(vorhanden, gewuenscht) {
  const bekannt = new Set((vorhanden.options || []).map((o) => String(o.value)));
  return (gewuenscht.options || []).filter((o) => !bekannt.has(String(o.value)));
}

async function bearbeiteObjektart(hubspot, cfg, objektTyp) {
  const zeile = (s) => process.stdout.write('  ' + s + '\n');
  process.stdout.write('\n' + objektTyp.toUpperCase() + '\n');

  let vorhandene;
  try {
    vorhandene = await hubspot.propertyListe(objektTyp);
  } catch (e) {
    if (e.status === 404 || e.status === 400) {
      zeile('uebersprungen — dieses Portal kennt die Objektart "' + objektTyp + '" nicht.');
      if (objektTyp === 'leads') {
        zeile('(Leads gibt es ab Sales Hub Professional. Kontakte und Unternehmen genuegen fuer den Betrieb.)');
      }
      return { angelegt: 0, ergaenzt: 0, vorhanden: 0, uebersprungen: true };
    }
    throw e;
  }

  const nachName = new Map(vorhandene.map((p) => [p.name, p]));
  zeile('Property-Gruppe: ' + await stelleGruppeSicher(hubspot, objektTyp));

  const zaehler = { angelegt: 0, ergaenzt: 0, vorhanden: 0, uebersprungen: false };

  for (const definition of definitionen(cfg, objektTyp)) {
    const alt = nachName.get(definition.name);

    if (!alt) {
      if (nurZeigen) {
        zeile('+ ' + definition.name + '  (' + definition.type + '/' + definition.fieldType + ')  — wuerde angelegt');
      } else {
        try {
          await hubspot.legePropertyAn(objektTyp, definition);
          zeile('+ ' + definition.name + '  angelegt');
        } catch (e) {
          /* 409: zwischen Auflisten und Anlegen hat jemand anders gearbeitet. */
          if (e.status === 409) { zeile('= ' + definition.name + '  existierte bereits'); zaehler.vorhanden++; continue; }
          zeile('! ' + definition.name + '  FEHLER: ' + e.message + (e.detail ? ' | ' + e.detail.slice(0, 200) : ''));
          continue;
        }
      }
      zaehler.angelegt++;
      continue;
    }

    if (definition.options && definition.options.length) {
      const fehlt = fehlendeOptionen(alt, definition);
      if (fehlt.length) {
        const namen = fehlt.map((o) => o.value).join(', ');
        if (nurZeigen) {
          zeile('~ ' + definition.name + '  — wuerde Optionen ergaenzen: ' + namen);
        } else {
          await hubspot.aenderePropertyAn(objektTyp, definition.name, {
            options: (alt.options || []).concat(fehlt)
          });
          zeile('~ ' + definition.name + '  Optionen ergaenzt: ' + namen);
        }
        zaehler.ergaenzt++;
        continue;
      }
    }

    zaehler.vorhanden++;
  }

  zeile('--> ' + zaehler.angelegt + ' neu, ' + zaehler.ergaenzt + ' ergaenzt, ' + zaehler.vorhanden + ' unveraendert');
  return zaehler;
}

async function main() {
  const cfg = konfig();

  /* Fuer dieses Skript zaehlt nur der HubSpot-Teil der Konfiguration. */
  const probleme = pruefeKonfig(cfg).filter((p) => /HubSpot|Properties|Absender/.test(p));
  if (probleme.length) {
    process.stderr.write('\nKonfiguration unvollstaendig:\n  - ' + probleme.join('\n  - ') + '\n\n');
    process.exit(1);
  }

  const hubspot = new HubSpot(cfg);

  process.stdout.write('\nHubSpot-Properties einrichten' + (nurZeigen ? '  [Probelauf, es wird nichts geaendert]' : '') + '\n');

  try {
    const info = await hubspot.portalInfo();
    process.stdout.write('Portal: ' + (info.portalId || '?') + ' (' + (info.timeZone || '?') + ')\n');
  } catch (e) {
    if (e.status === 401) {
      process.stderr.write('\nHubSpot lehnt den Token ab (401). Bitte HUBSPOT_ACCESS_TOKEN pruefen:\n' +
        'Einstellungen > Integrationen > Private Apps > die App > Auth.\n\n');
      process.exit(1);
    }
    /* 403 heisst nur, dass dieser eine Endpunkt nicht freigegeben ist. Fuer
       das Anlegen der Properties braucht er ihn nicht — also weitermachen
       und den Fehler dort auftreten lassen, wo er wirklich stoert. */
    process.stdout.write('Portal: Kennung nicht abrufbar (' + (e.status || '?') + ') — fuer diesen Schritt unerheblich.\n');
  }

  const gesamt = { angelegt: 0, ergaenzt: 0, vorhanden: 0 };
  for (const objektTyp of cfg.objekte) {
    const z = await bearbeiteObjektart(hubspot, cfg, objektTyp);
    gesamt.angelegt += z.angelegt; gesamt.ergaenzt += z.ergaenzt; gesamt.vorhanden += z.vorhanden;
  }

  process.stdout.write('\nFertig: ' + gesamt.angelegt + ' Properties neu, ' + gesamt.ergaenzt +
    ' ergaenzt, ' + gesamt.vorhanden + ' waren schon da.\n');
  if (!nurZeigen) process.stdout.write('Naechster Schritt: npm run check\n\n');
}

main().catch((e) => {
  process.stderr.write('\nAbbruch: ' + e.message + '\n' + (e.detail ? e.detail.slice(0, 400) + '\n' : '') + '\n');
  process.exit(1);
});
