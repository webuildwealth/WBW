/* =============================================================================
 *  Der Ablauf einer Mail — von "queued" bis "sent"
 *
 *  Auslesen -> Pruefen -> Empfaenger bestimmen -> Text bauen -> Send-ID
 *  bilden -> Anspruch im Ledger -> Gmail -> HubSpot nachfuehren.
 *
 *  Zur Send-ID, weil daran alles haengt: Sie ist der Fingerabdruck dessen,
 *  was beim Empfaenger ankommt — Datensatz, Empfaenger, Absender, Betreff,
 *  Text, Vorlage, Freigabeschluessel. Bewusst NICHT enthalten ist der
 *  Wunschzeitpunkt: Wer eine geplante Mail von Dienstag auf Mittwoch schiebt,
 *  hat keine zweite Mail geschrieben, und aus einer Verschiebung darf nie ein
 *  zweiter Versand werden.
 *
 *  Umgekehrt heisst das: Derselbe Text an denselben Empfaenger ergibt immer
 *  dieselbe Send-ID — auch in einem Monat, auch nach einem Neustart, auch
 *  wenn HubSpot dasselbe Ereignis funfmal schickt. Genau das ist der Zweck.
 *  Wer denselben Text absichtlich ein zweites Mal senden will, traegt in
 *  automation_email_send_key etwas Neues ein ("Nachfass 1"); das aendert den
 *  Fingerabdruck und gibt den Weg frei.
 * ========================================================================== */

'use strict';

const crypto = require('crypto');

const log = require('./log.js');
const { STATUS } = require('./status.js');
const { alsWahrheitswert, alsZeitpunkt, alsHubSpotZeit } = require('./hubspot.js');
const { ermittleEmpfaenger, KONTAKT_FELDER, UNTERNEHMEN_FELDER } = require('./recipient.js');
const { baueMail, formatiereDatum, formatiereUhrzeit } = require('./template.js');
const { baueNachricht } = require('./mime.js');
const { istWiederholbar, wartezeit, schlafe } = require('./retry.js');

/* Platzhalter -> Herkunft. "record" ist der ausloesende Datensatz selbst. */
const STANDARD_HERKUNFT = {
  firstname: 'contact:firstname',
  lastname: 'contact:lastname',
  company: 'company:name',
  salutation: 'contact:salutation',
  jobtitle: 'contact:jobtitle',
  email: 'recipient:email',
  meeting_date: 'meeting:date',
  meeting_time: 'meeting:time',
  sender_name: 'sender:name',
  sender_email: 'sender:email'
};

class Pipeline {
  constructor(bauteile) {
    this.cfg = bauteile.cfg;
    this.hubspot = bauteile.hubspot;
    this.gmail = bauteile.gmail;
    this.ledger = bauteile.ledger;
    this.vorlagen = bauteile.vorlagen || { signatur: '', rahmen: '' };
    this.herkunft = Object.assign({}, STANDARD_HERKUNFT, bauteile.herkunft || {});
    this.zaehler = { gesendet: 0, uebersprungen: 0, fehlgeschlagen: 0, doppelt: 0, pruefung: 0, geplant: 0 };
  }

  /* ===================================================================== */
  /**
   * Verarbeitet genau einen Datensatz. Mehrfacher Aufruf mit demselben
   * Datensatz ist ausdruecklich erlaubt und folgenlos.
   *
   * @returns {Promise<{ergebnis:string, grund?:string, sendId?:string}>}
   */
  async verarbeite(objektTyp, objektId, ausloeser) {
    const begonnen = Date.now();
    const kennung = { objectType: objektTyp, objectId: String(objektId), trigger: ausloeser || 'unbekannt' };

    log.info('trigger.erkannt', kennung);

    let datensatz;
    try {
      datensatz = await this.ladeDatensatz(objektTyp, objektId);
    } catch (e) {
      if (e.status === 404) {
        log.warn('record.fehlt', Object.assign({}, kennung));
        return this._zaehle({ ergebnis: 'skipped', grund: 'datensatz_nicht_gefunden' });
      }
      log.error('record.ladefehler', Object.assign({ fehler: e.message, code: e.code || '' }, kennung));
      throw e;
    }

    /* ---------------------------------------------------- Vorpruefungen */
    const props = datensatz.properties || {};
    const status = String(props[this.cfg.props.status] || '').trim().toLowerCase();
    const freigegeben = this.cfg.props.enabled ? alsWahrheitswert(props[this.cfg.props.enabled]) : true;

    if (!freigegeben) {
      log.info('skip.nicht_freigegeben', Object.assign({ status: status }, kennung));
      return this._zaehle({ ergebnis: 'skipped', grund: 'nicht_freigegeben' });
    }

    if (status && [STATUS.QUEUED, STATUS.SCHEDULED].indexOf(status) === -1) {
      log.info('skip.status', Object.assign({ status: status }, kennung));
      return this._zaehle({ ergebnis: 'skipped', grund: 'status_' + status });
    }

    /* ------------------------------------------------- Inhalt und Absender */
    const absender = this.waehleAbsender(props);
    if (!absender) {
      return this._scheitern(objektTyp, objektId, null,
        'Das in ' + this.cfg.props.sender + ' hinterlegte Absenderkonto "' +
        String(props[this.cfg.props.sender] || '') + '" ist nicht konfiguriert. Bekannt sind: ' +
        Object.keys(this.cfg.absender.konten).join(', ') + '.', 'ABSENDER_UNBEKANNT', kennung);
    }

    const betreffRoh = String(props[this.cfg.props.subject] || '').trim();
    const rumpfRoh = String(props[this.cfg.props.body] || '').trim();

    if (!betreffRoh || !rumpfRoh) {
      return this._scheitern(objektTyp, objektId, null,
        'Es fehlt ' + (!betreffRoh ? this.cfg.props.subject : this.cfg.props.body) + '.',
        'INHALT_UNVOLLSTAENDIG', kennung);
    }

    /* ---------------------------------------------------------- Empfaenger */
    let ziel;
    try {
      ziel = await ermittleEmpfaenger(objektTyp, datensatz, this.hubspot, this.cfg);
    } catch (e) {
      if (e.empfaengerProblem) {
        return this._scheitern(objektTyp, objektId, null, e.message, e.code || 'EMPFAENGER', kennung);
      }
      throw e;
    }

    log.info('empfaenger.ermittelt', Object.assign({
      recipient: ziel.email, quelle: ziel.quelle,
      contact_id: ziel.kontakt ? ziel.kontakt.id : '', company_id: ziel.unternehmen ? ziel.unternehmen.id : ''
    }, kennung));

    /* Sicherheitsnetz fuer Tests am echten Portal. */
    if (!this.adresseErlaubt(ziel.email)) {
      return this._scheitern(objektTyp, objektId, null,
        'Die Adresse steht nicht auf SEND_ALLOWLIST. Der Dienst laeuft im eingeschraenkten Testbetrieb.',
        'NICHT_AUF_ALLOWLIST', kennung);
    }

    /* ------------------------------------------------------------- Text */
    const werte = this.baueWerte(datensatz, ziel, absender);
    const mail = baueMail({
      betreff: betreffRoh,
      rumpf: rumpfRoh,
      werte: werte,
      signatur: this.cfg.versand.signaturAn ? (absender.signature || this.vorlagen.signatur) : '',
      rahmen: this.vorlagen.rahmen,
      regel: this.cfg.versand.platzhalterRegel
    });

    if (mail.fehlend.length && this.cfg.versand.platzhalterRegel === 'strict') {
      return this._scheitern(objektTyp, objektId, null,
        'Zu diesen Platzhaltern fehlt der Wert: ' + mail.fehlend.join(', ') +
        '. Entweder die Felder in HubSpot fuellen oder im Text einen Ersatz angeben, z. B. {{' +
        mail.fehlend[0] + '|Kunde}}.',
        'PLATZHALTER_OHNE_WERT', kennung);
    }

    /* ---------------------------------------------------------- Send-ID */
    const sendId = this.baueSendId({
      objektTyp: objektTyp, objektId: objektId, empfaenger: ziel.email,
      absender: absender.email, betreff: betreffRoh, rumpf: rumpfRoh,
      vorlage: String(props[this.cfg.props.template] || ''),
      freigabe: String(props[this.cfg.props.sendKey] || '')
    });
    kennung.sendId = sendId;

    /* ------------------------------------------------------------ Zeit */
    const wunsch = this.cfg.props.sendAt ? alsZeitpunkt(props[this.cfg.props.sendAt]) : null;
    if (wunsch !== null && wunsch > Date.now() + this.cfg.poller.vorlaufMs) {
      if (status !== STATUS.SCHEDULED) {
        await this.schreibeHubSpot(objektTyp, objektId, {
          status: STATUS.SCHEDULED, id: sendId, error: ''
        });
      }
      log.info('versand.geplant', Object.assign({ faellig: new Date(wunsch).toISOString() }, kennung));
      return this._zaehle({ ergebnis: 'scheduled', sendId: sendId, faellig: wunsch });
    }

    /* --------------------------------------------------------- Tageslimit */
    const heute = this.ledger.zaehleVersendetSeit(Date.now() - 86400000);
    if (heute >= this.cfg.versand.tageslimit) {
      log.warn('tageslimit.erreicht', Object.assign({ gesendet_24h: heute, limit: this.cfg.versand.tageslimit }, kennung));
      return this._zaehle({ ergebnis: 'skipped', grund: 'tageslimit', sendId: sendId });
    }

    /* ====================== Anspruch — ab hier gilt Einmaligkeit ========= */
    const anspruch = this.ledger.claim(sendId, {
      objectType: String(objektTyp), objectId: String(objektId),
      empfaengerHash: crypto.createHash('sha256').update(ziel.email).digest('hex').slice(0, 16),
      absender: absender.email, trigger: kennung.trigger
    });

    if (anspruch.ergebnis === 'duplicate') {
      /* Die Mail ist nachweislich raus — HubSpot hinkt nur hinterher.
         Das passiert, wenn ein Schreibvorgang nach dem Versand scheiterte.
         Statt wegzusehen, wird der Stand jetzt korrigiert. */
      log.info('dublette.abgewehrt', Object.assign({
        gesendet_am: anspruch.eintrag.sentAt || '', quelle: 'ledger'
      }, kennung));

      await this.schreibeHubSpot(objektTyp, objektId, {
        status: STATUS.SENT,
        sentAt: anspruch.eintrag.sentAt || new Date().toISOString(),
        id: sendId,
        messageId: anspruch.eintrag.messageId || '',
        error: ''
      });
      return this._zaehle({ ergebnis: 'duplicate', sendId: sendId });
    }

    if (anspruch.ergebnis === 'in_flight') {
      log.warn('anspruch.offen', Object.assign({ seit: anspruch.eintrag.claimedAt }, kennung));
      return this._zaehle({ ergebnis: 'skipped', grund: 'bereits_in_arbeit', sendId: sendId });
    }

    if (anspruch.ergebnis === 'blocked') {
      log.warn('anspruch.gesperrt', Object.assign({ seit: anspruch.eintrag.reviewAt }, kennung));
      return this._zaehle({ ergebnis: 'review', grund: 'wartet_auf_pruefung', sendId: sendId });
    }

    /* ----------------------------------------------------------- Versand */
    await this.schreibeHubSpot(objektTyp, objektId, {
      status: STATUS.SENDING, id: sendId, error: '',
      attempts: (anspruch.eintrag.versuche || 0) + 1
    });

    const nachricht = baueNachricht({
      von: { email: absender.email, name: this.rendereEinzeln(absender.name, werte) },
      an: ziel.email,
      anName: [werte.firstname, werte.lastname].filter(Boolean).join(' '),
      antwortAn: absender.replyTo || '',
      bcc: absender.bcc || '',
      betreff: mail.betreff,
      html: mail.html,
      text: mail.text,
      sendId: sendId,
      objectRef: objektTyp + '/' + objektId,
      zeitzone: this.cfg.zeitzone
    });

    return this.sendeMitWiederholung(nachricht, absender, ziel, objektTyp, objektId, sendId, kennung, begonnen);
  }

  /* ===================================================================== */
  async sendeMitWiederholung(nachricht, absender, ziel, objektTyp, objektId, sendId, kennung, begonnen) {
    const max = this.cfg.versand.maxVersuche;
    let letzterFehler = null;
    /* Mitgezaehlt wird, was tatsaechlich stattfand — nicht, was erlaubt
       gewesen waere. Wer spaeter in HubSpot "Versuche: 3" liest, soll darauf
       vertrauen koennen, dass auch dreimal gewaehlt wurde. */
    let getaneVersuche = 0;

    for (let versuch = 1; versuch <= max; versuch++) {
      getaneVersuche = versuch;
      log.info('versand.versuch', Object.assign({ versuch: versuch, von: absender.email, recipient: ziel.email }, kennung));

      if (this.cfg.versand.trockenlauf) {
        log.warn('versand.trockenlauf', Object.assign({ recipient: ziel.email }, kennung));
        this.ledger.markiereVersendet(sendId, { messageId: 'dry-run', versuche: versuch, trockenlauf: true });
        await this.schreibeHubSpot(objektTyp, objektId, {
          status: STATUS.SENT, sentAt: new Date().toISOString(), id: sendId,
          messageId: 'dry-run', error: '', attempts: versuch
        });
        return this._zaehle({ ergebnis: 'sent', sendId: sendId, trockenlauf: true });
      }

      try {
        const quittung = await this.gmail.sende(absender.email, nachricht.raw);
        return await this.buchVersandAb(quittung.id, versuch, objektTyp, objektId, sendId, kennung, begonnen);

      } catch (e) {
        letzterFehler = e;
        const art = istWiederholbar(e);

        log.warn('versand.fehler', Object.assign({
          versuch: versuch, art: art, status: e.status || 0,
          code: e.code || '', fehler: e.message
        }, kennung));

        /* Der gefaehrliche Fall: Die Verbindung riss ab, Gmail koennte die
           Nachricht angenommen haben. Blind wiederholen hiesse riskieren,
           dass sie zweimal ankommt. */
        if (art === 'unklar') {
          const pruefung = await this.gmail.pruefeVersand(absender.email, sendId);

          if (pruefung.pruefbar && pruefung.gefunden) {
            log.info('versand.nachtraeglich_bestaetigt', Object.assign({ versuch: versuch }, kennung));
            return await this.buchVersandAb(pruefung.messageId, versuch, objektTyp, objektId, sendId, kennung, begonnen);
          }

          if (pruefung.pruefbar) {
            /* Nachgesehen und nichts gefunden: Es ist belegt, dass nichts
               raus ist. Damit ist die Wiederholung wieder sicher. */
            log.info('versand.nichts_gesendet_bestaetigt', Object.assign({ versuch: versuch }, kennung));
            if (versuch < max) {
              await schlafe(wartezeit(versuch, this.cfg.versand.grundverzoegerungMs, this.cfg.versand.maxVerzoegerungMs));
              continue;
            }
          } else {
            /* Nicht nachsehbar. Hier endet die Automatik — bewusst. */
            return await this.buchPruefungAb(e, versuch, objektTyp, objektId, sendId, kennung, absender.email);
          }
        }

        if (art === 'nein' || versuch >= max) break;

        const pause = (e.status === 429 && e.retryAfter)
          ? e.retryAfter * 1000
          : wartezeit(versuch, this.cfg.versand.grundverzoegerungMs, this.cfg.versand.maxVerzoegerungMs);

        await schlafe(pause);
      }
    }

    /* Sauber gescheitert: Gmail hat geantwortet, nur eben ablehnend. */
    this.ledger.markiereFehler(sendId, {
      versuche: getaneVersuche,
      fehlerCode: (letzterFehler && letzterFehler.code) || String((letzterFehler && letzterFehler.status) || ''),
      fehlerText: (letzterFehler && letzterFehler.message || '').slice(0, 300)
    });

    await this.schreibeHubSpot(objektTyp, objektId, {
      status: STATUS.FAILED, id: sendId, attempts: getaneVersuche,
      error: (letzterFehler && letzterFehler.message || 'Unbekannter Fehler').slice(0, 500)
    });

    log.error('versand.endgueltig_fehlgeschlagen', Object.assign({
      versuche: getaneVersuche, code: (letzterFehler && letzterFehler.code) || '',
      fehler: (letzterFehler && letzterFehler.message) || ''
    }, kennung));

    return this._zaehle({ ergebnis: 'failed', sendId: sendId, fehler: letzterFehler && letzterFehler.message });
  }

  async buchVersandAb(messageId, versuch, objektTyp, objektId, sendId, kennung, begonnen) {
    const zeitpunkt = new Date().toISOString();

    /* Erst das Ledger, dann HubSpot. Scheitert HubSpot, ist die Mail
       trotzdem als versendet vermerkt — und ein spaeterer Lauf korrigiert
       den CRM-Stand ueber den Zweig 'duplicate'. Andersherum waere die
       Mail bei einem Absturz verloren und ginge doppelt raus. */
    this.ledger.markiereVersendet(sendId, { messageId: messageId, versuche: versuch });

    await this.schreibeHubSpot(objektTyp, objektId, {
      status: STATUS.SENT, sentAt: zeitpunkt, id: sendId,
      messageId: messageId, error: '', attempts: versuch
    });

    log.info('versand.erfolgreich', Object.assign({
      versuch: versuch, message_id: messageId, dauer_ms: Date.now() - begonnen
    }, kennung));

    return this._zaehle({ ergebnis: 'sent', sendId: sendId, messageId: messageId });
  }

  async buchPruefungAb(fehler, versuch, objektTyp, objektId, sendId, kennung, absenderAdresse) {
    this.ledger.markierePruefung(sendId, {
      versuche: versuch,
      fehlerCode: fehler.code || '',
      fehlerText: (fehler.message || '').slice(0, 300)
    });

    await this.schreibeHubSpot(objektTyp, objektId, {
      status: STATUS.NEEDS_REVIEW, id: sendId, attempts: versuch,
      error: 'Der Ausgang des Versands ist ungeklaert: ' + (fehler.message || '').slice(0, 300) +
        ' Bitte im Gmail-Postausgang von ' + absenderAdresse + ' nachsehen, ob die Mail dort steht. ' +
        'Es wird bewusst nichts automatisch wiederholt, damit sie nicht doppelt ankommt. Danach den Status ' +
        'von Hand auf "sent" (war schon raus) oder "queued" (war nicht raus) setzen.'
    });

    log.error('versand.ungeklaert', Object.assign({
      versuch: versuch, code: fehler.code || '', fehler: fehler.message
    }, kennung));

    return this._zaehle({ ergebnis: 'review', sendId: sendId, grund: 'ausgang_unklar' });
  }

  /* ===================================================================== */
  /* ------------------------------------------------------------- Laden */
  async ladeDatensatz(objektTyp, objektId) {
    const felder = new Set();
    for (const name of Object.values(this.cfg.props)) if (name) felder.add(name);

    /* Was die Platzhalter aus dem Datensatz selbst brauchen. */
    for (const herkunft of Object.values(this.herkunft)) {
      const [quelle, name] = String(herkunft).split(':');
      if (quelle === 'record' && name) felder.add(name);
    }

    const typ = String(objektTyp).toLowerCase();
    if (typ === 'contacts' || typ === 'contact') for (const f of KONTAKT_FELDER) felder.add(f);
    if (typ === 'companies' || typ === 'company') for (const f of UNTERNEHMEN_FELDER) felder.add(f);
    if (typ === 'leads' || typ === 'lead') { felder.add('hs_lead_name'); felder.add('hs_lead_type'); }

    return this.hubspot.datensatz(objektTyp, objektId, Array.from(felder));
  }

  /* ---------------------------------------------------------- Absender */
  waehleAbsender(props) {
    const gewuenscht = this.cfg.props.sender ? String(props[this.cfg.props.sender] || '').trim() : '';
    const schluessel = gewuenscht || this.cfg.absender.standard;
    return this.cfg.absender.konten[schluessel] || null;
  }

  adresseErlaubt(adresse) {
    const liste = this.cfg.versand.erlaubteEmpfaenger;
    if (!liste || !liste.length) return true;

    const a = String(adresse).toLowerCase();
    return liste.some((eintrag) => {
      const e = String(eintrag).toLowerCase().trim();
      return e.charAt(0) === '@' ? a.endsWith(e) : a === e;
    });
  }

  /* -------------------------------------------------------- Platzhalter */
  baueWerte(datensatz, ziel, absender) {
    const werte = {};
    const props = datensatz.properties || {};
    const kontaktProps = (ziel.kontakt && ziel.kontakt.properties) || {};
    const firmaProps = (ziel.unternehmen && ziel.unternehmen.properties) || {};

    /* Der Termin kann am ausloesenden Datensatz oder am Kontakt stehen. */
    const terminRoh = this.cfg.props.meetingAt
      ? (props[this.cfg.props.meetingAt] || kontaktProps[this.cfg.props.meetingAt] || '')
      : '';
    const terminMs = alsZeitpunkt(terminRoh);

    for (const [platzhalter, herkunft] of Object.entries(this.herkunft)) {
      const trenner = String(herkunft).indexOf(':');
      const quelle = trenner === -1 ? 'record' : String(herkunft).slice(0, trenner);
      const name = trenner === -1 ? String(herkunft) : String(herkunft).slice(trenner + 1);

      let wert = '';
      switch (quelle) {
        case 'record':    wert = props[name] || ''; break;
        case 'contact':   wert = kontaktProps[name] || props[name] || ''; break;
        case 'company':   wert = firmaProps[name] || props[name] || kontaktProps.company || ''; break;
        case 'recipient': wert = name === 'email' ? ziel.email : ''; break;
        case 'sender':    wert = name === 'name' ? (absender.name || '') : (absender.email || ''); break;
        case 'const':     wert = name; break;
        case 'meeting':
          if (terminMs !== null) {
            wert = name === 'time'
              ? formatiereUhrzeit(terminMs, this.cfg.zeitzone, this.cfg.gebietsschema)
              : formatiereDatum(terminMs, this.cfg.zeitzone, this.cfg.gebietsschema);
          }
          break;
        default: wert = '';
      }
      werte[platzhalter] = String(wert == null ? '' : wert).trim();
    }

    return werte;
  }

  rendereEinzeln(text, werte) {
    if (!text || text.indexOf('{{') === -1) return text || '';
    return String(text).replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|([^}]*))?\}\}/g,
      (_, name, ersatz) => (werte[name] || ersatz || ''));
  }

  /* ---------------------------------------------------------- Send-ID */
  baueSendId(teile) {
    const quelle = [
      String(teile.objektTyp).toLowerCase(),
      String(teile.objektId),
      String(teile.empfaenger).toLowerCase(),
      String(teile.absender).toLowerCase(),
      normalisiere(teile.betreff),
      normalisiere(teile.rumpf),
      String(teile.vorlage || ''),
      String(teile.freigabe || '')
    ].join('\u0000');

    return crypto.createHash('sha256').update(quelle, 'utf8').digest('hex').slice(0, 32);
  }

  /* --------------------------------------------------------- Schreiben */
  /** Schreibt nur Properties, die auch konfiguriert sind. Fehler beim
      Schreiben duerfen den Versand nie kippen — das Ledger ist massgeblich. */
  async schreibeHubSpot(objektTyp, objektId, felder) {
    const props = {};
    const setze = (schluessel, wert) => {
      const name = this.cfg.props[schluessel];
      if (name && wert !== undefined && wert !== null) props[name] = String(wert);
    };

    setze('status', felder.status);
    setze('id', felder.id);
    setze('messageId', felder.messageId);
    setze('error', felder.error);
    if (felder.attempts !== undefined) setze('attempts', felder.attempts);
    if (felder.sentAt) setze('sentAt', alsHubSpotZeit(alsZeitpunkt(felder.sentAt) || Date.now()));

    if (!Object.keys(props).length) return;

    try {
      await this.hubspot.aktualisiere(objektTyp, objektId, props);
      log.debug('hubspot.aktualisiert', {
        objectType: objektTyp, objectId: String(objektId),
        status: felder.status || '', felder: Object.keys(props)
      });
    } catch (e) {
      log.error('hubspot.schreibfehler', {
        objectType: objektTyp, objectId: String(objektId),
        status: felder.status || '', fehler: e.message, code: e.code || ''
      });
    }
  }

  /* ------------------------------------------------------------ Hilfen */
  async _scheitern(objektTyp, objektId, sendId, nachricht, code, kennung) {
    await this.schreibeHubSpot(objektTyp, objektId, {
      status: STATUS.FAILED, id: sendId || '', error: nachricht
    });
    log.error('validierung.fehlgeschlagen', Object.assign({ code: code, fehler: nachricht }, kennung));
    return this._zaehle({ ergebnis: 'failed', grund: code, fehler: nachricht });
  }

  _zaehle(ergebnis) {
    const abbildung = {
      sent: 'gesendet', skipped: 'uebersprungen', failed: 'fehlgeschlagen',
      duplicate: 'doppelt', review: 'pruefung', scheduled: 'geplant'
    };
    const feld = abbildung[ergebnis.ergebnis];
    if (feld) this.zaehler[feld]++;
    return ergebnis;
  }
}

/* Unsichtbare Unterschiede duerfen keine neue Send-ID ergeben: ein
   zusaetzliches Leerzeichen am Zeilenende ist keine neue Mail. */
function normalisiere(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

module.exports = { Pipeline, STANDARD_HERKUNFT, normalisiere };
