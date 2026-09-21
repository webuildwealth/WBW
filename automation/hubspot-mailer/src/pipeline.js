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
const {
  pruefeAbbruch, naechsterSchritt, faelligkeitDanach, SEQ_STATUS
} = require('./sequence.js');
const { ladeAnhaenge } = require('./anhang.js');

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
  sender_email: 'sender:email',
  /* Eine vollstaendige deutsche Briefanrede aus Anrede und Nachname —
     "Sehr geehrter Herr Dr. Meier". Faellt auf "Guten Tag" zurueck, wenn
     das Geschlecht nicht bekannt ist; erraten wird nichts. */
  anrede: 'computed:anrede'
};

class Pipeline {
  constructor(bauteile) {
    this.cfg = bauteile.cfg;
    this.hubspot = bauteile.hubspot;
    this.gmail = bauteile.gmail;
    this.ledger = bauteile.ledger;
    this.vorlagen = bauteile.vorlagen || { signatur: '', rahmen: '' };
    this.herkunft = Object.assign({}, STANDARD_HERKUNFT, bauteile.herkunft || {});
    this.sequenzen = bauteile.sequenzen || { fuer: () => null, schluessel: () => [] };
    this.zaehler = {
      gesendet: 0, uebersprungen: 0, fehlgeschlagen: 0, doppelt: 0,
      pruefung: 0, geplant: 0, sequenz_gestoppt: 0
    };
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

    /* ------------------------------------------------- Kampagne oder Einzelmail */
    /* Steht eine Kampagne am Datensatz, liefert sie Betreff und Text; die
       Freitextfelder werden dann nicht gelesen. Das ist bewusst
       ausschliessend — sonst waere nie klar, welcher Text gilt. */
    const sequenz = this.cfg.props.sequence
      ? this.sequenzen.fuer(props[this.cfg.props.sequence])
      : null;

    if (this.cfg.props.sequence && String(props[this.cfg.props.sequence] || '').trim() && !sequenz) {
      return this._scheitern(objektTyp, objektId, null,
        'Die Kampagne "' + String(props[this.cfg.props.sequence]).trim() + '" ist nicht hinterlegt. ' +
        'Bekannt sind: ' + (this.sequenzen.schluessel().join(', ') || '(keine)') + '. ' +
        'Kampagnen liegen als Datei in sequences/; nach dem Anlegen den Dienst neu starten.',
        'KAMPAGNE_UNBEKANNT', kennung);
    }

    /* ------------------------------------------------- Inhalt und Absender */
    const absender = this.waehleAbsender(props, sequenz);
    if (!absender) {
      const gewuenscht = (sequenz && sequenz.absender) || String(props[this.cfg.props.sender] || '');
      return this._scheitern(objektTyp, objektId, null,
        'Das Absenderkonto "' + gewuenscht + '" ist nicht konfiguriert. Bekannt sind: ' +
        Object.keys(this.cfg.absender.konten).join(', ') + '. Absenderkonten stehen in SENDER_ACCOUNTS.',
        'ABSENDER_UNBEKANNT', kennung);
    }

    /* Kampagnen, die ohne Einwilligung gar nicht erst starten duerfen. */
    if (sequenz && this.cfg.sequenz.einwilligungProperty) {
      const feld = this.cfg.sequenz.einwilligungProperty;
      if (!alsWahrheitswert(props[feld])) {
        log.info('sequenz.ohne_einwilligung', Object.assign({ sequenz: sequenz.schluessel, feld: feld }, kennung));
        return this._zaehle({ ergebnis: 'skipped', grund: 'keine_einwilligung' });
      }
    }

    /* Welcher Schritt ist dran — und darf ueberhaupt noch einer raus? */
    let schrittNr = 0;
    let schritt = null;

    if (sequenz) {
      const abbruch = pruefeAbbruch(sequenz, props, this.cfg);
      if (abbruch) {
        return await this.beendeSequenz(objektTyp, objektId, abbruch, kennung, sequenz);
      }

      const naechster = naechsterSchritt(sequenz, props[this.cfg.props.sequenceStep]);
      if (!naechster) {
        return await this.beendeSequenz(objektTyp, objektId, { grund: SEQ_STATUS.COMPLETED }, kennung, sequenz);
      }

      schrittNr = naechster.nummer;
      schritt = naechster.schritt;
      kennung.sequenz = sequenz.schluessel;
      kennung.schritt = schrittNr;
    }

    const betreffRoh = schritt ? String(schritt.betreff).trim() : String(props[this.cfg.props.subject] || '').trim();
    const rumpfRoh = schritt ? String(schritt.rumpf).trim() : String(props[this.cfg.props.body] || '').trim();

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

    let vorgaenger = null;

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
      /* Die Anrede bekommt eine eigene Meldung: Sie ist der mit Abstand
         haeufigste Grund, aus dem ein Datensatz haengen bleibt, und der
         Handgriff dagegen ist ein anderer als "Feld ausfuellen". */
      if (mail.fehlend.indexOf('anrede') !== -1) {
        const nachname = (ziel.kontakt && ziel.kontakt.properties && ziel.kontakt.properties.lastname) || '';
        return this._scheitern(objektTyp, objektId, null,
          'Es fehlt die Anrede: Am Kontakt' + (nachname ? ' "' + nachname + '"' : '') +
          ' steht im Feld "salutation" weder Frau noch Herr, deshalb laesst sich weder ' +
          '"Sehr geehrte Frau …" noch "Sehr geehrter Herr …" bilden. Erraten wird nichts. ' +
          'Entweder die Anrede am Kontakt nachtragen, oder ANREDE_POLICY=formal setzen — dann ' +
          'steht in solchen Faellen "Sehr geehrte Damen und Herren".',
          'ANREDE_FEHLT', kennung);
      }

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
      freigabe: String(props[this.cfg.props.sendKey] || ''),
      sequenz: sequenz ? sequenz.schluessel : '',
      schritt: schrittNr,
      anhaenge: (schritt && schritt.anhaenge) || []
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

    /* Kaltakquise um drei Uhr nachts sieht nach Maschine aus und wird
       entsprechend einsortiert. Das Fenster gilt nur fuer Kampagnen —
       eine angeforderte Einzelmail soll sofort rausgehen. */
    if (sequenz) {
      const fenster = this.naechstesFenster(Date.now());
      if (fenster !== null) {
        await this.schreibeHubSpot(objektTyp, objektId, {
          status: STATUS.SCHEDULED, id: sendId, error: '',
          sendAtWunsch: alsHubSpotZeit(fenster)
        });
        log.info('versand.ausserhalb_sendefenster', Object.assign({
          faellig: new Date(fenster).toISOString(), fenster: this.cfg.sequenz.sendefenster
        }, kennung));
        return this._zaehle({ ergebnis: 'scheduled', sendId: sendId, faellig: fenster, grund: 'sendefenster' });
      }
    }

    /* ------------------------------------------- Hat er laengst geantwortet? */
    /* Erst hier, und nicht frueher: Solange die Nachfassmail gar nicht
       faellig ist, waere die Nachfrage bei Gmail ein Aufruf ohne Anlass —
       und ein fehlender Lesezugriff duerfte einen Datensatz nicht schon
       Tage vor dem Termin auf "failed" setzen.

       Ab dem zweiten Schritt. Vor dem ersten gibt es nichts nachzusehen. */
    if (sequenz && schrittNr > 1) {
      vorgaenger = this.vorherigerSchritt(sequenz, schrittNr, objektTyp, objektId, ziel.email, absender.email, props);

      const antwort = await this.pruefeAntwort(absender, vorgaenger, kennung);

      if (antwort.gestoppt) {
        return await this.beendeSequenz(objektTyp, objektId,
          { grund: SEQ_STATUS.STOPPED_REPLY }, kennung, sequenz);
      }

      if (!antwort.pruefbar && this.cfg.sequenz.antwortpruefungPflicht) {
        return await this._scheitern(objektTyp, objektId, null,
          'Nachfassmail ' + schrittNr + ' der Kampagne "' + sequenz.schluessel + '" wurde nicht verschickt, ' +
          'weil nicht nachzusehen ist, ob bereits geantwortet wurde. Wer auf eine Erstansprache antwortet und ' +
          'trotzdem nachgefasst wird, ist als Kunde verloren. Abhilfe: in der domainweiten Delegierung den Scope ' +
          'gmail.readonly ergaenzen und GMAIL_VERIFY_ENABLED=true setzen. Wer die Abbrueche stattdessen in HubSpot ' +
          'von Hand pflegen will, setzt SEQUENCE_REQUIRE_REPLY_CHECK=false.',
          'ANTWORTPRUEFUNG_NICHT_MOEGLICH', kennung);
      }
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

    /* Nachfassmails gehoeren in denselben Verlauf wie die Erstansprache —
       sonst stehen drei zusammenhanglose Mails im Postfach und die dritte
       wirkt, als haette der Absender die ersten beiden vergessen. Das
       braucht die echte Message-ID der Vorgaengermail, und die gibt es nur
       mit Lesezugriff. Ohne ihn geht die Mail eigenstaendig raus, mit
       "Re:" im Betreff — das funktioniert immer. */
    const anschluss = (schritt && schritt.antwortAufVorherige && vorgaenger) ? vorgaenger.eintrag : null;
    const imThread = !!(anschluss && anschluss.rfcId);

    /* Anhaenge erst hier laden — nach dem Anspruch, aber vor dem Versand.
       Fehlt der Flyer, soll das ein sauberer Fehler sein und keine Mail,
       die ohne ihn rausgeht und den Empfaenger ratlos zuruecklaesst. */
    let anhaenge = [];
    if (schritt && schritt.anhaenge && schritt.anhaenge.length) {
      try {
        anhaenge = ladeAnhaenge(schritt.anhaenge, this.cfg.anhang);
      } catch (e) {
        this.ledger.markiereFehler(sendId, { fehlerCode: e.code || 'ANHANG', fehlerText: (e.message || '').slice(0, 300) });
        return await this._scheitern(objektTyp, objektId, sendId, e.message, e.code || 'ANHANG', kennung);
      }
    }

    const nachricht = baueNachricht({
      von: { email: absender.email, name: this.rendereEinzeln(absender.name, werte) },
      an: ziel.email,
      anName: [werte.firstname, werte.lastname].filter(Boolean).join(' '),
      antwortAn: absender.replyTo || '',
      bcc: absender.bcc || '',
      betreff: (schritt && schritt.antwortAufVorherige && !imThread)
        ? betreffMitRe(mail.betreff)
        : mail.betreff,
      html: mail.html,
      text: mail.text,
      sendId: sendId,
      objectRef: objektTyp + '/' + objektId,
      zeitzone: this.cfg.zeitzone,
      antwortAuf: imThread ? anschluss.rfcId : '',
      verweise: imThread ? (anschluss.verweise || anschluss.rfcId) : '',
      anhaenge: anhaenge
    });

    return this.sendeMitWiederholung(nachricht, absender, ziel, objektTyp, objektId, sendId, kennung, begonnen, {
      sequenz: sequenz,
      schrittNr: schrittNr,
      threadId: imThread ? anschluss.threadId : '',
      verweise: imThread ? [anschluss.verweise, anschluss.rfcId].filter(Boolean).join(' ') : ''
    });
  }

  /* ===================================================================== */
  async sendeMitWiederholung(nachricht, absender, ziel, objektTyp, objektId, sendId, kennung, begonnen, kampagne) {
    kampagne = kampagne || { sequenz: null, schrittNr: 0, threadId: '', verweise: '' };
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
        this.ledger.markiereVersendet(sendId, {
          messageId: 'dry-run', versuche: versuch, trockenlauf: true,
          threadId: 'dry-run-thread', rfcId: nachricht.messageId
        });
        await this.schreibeHubSpot(objektTyp, objektId, Object.assign({
          status: STATUS.SENT, sentAt: new Date().toISOString(), id: sendId,
          messageId: 'dry-run', error: '', attempts: versuch
        }, this.sequenzFortschritt(kampagne)));
        return this._zaehle({ ergebnis: 'sent', sendId: sendId, trockenlauf: true });
      }

      try {
        const quittung = await this.gmail.sende(absender.email, nachricht.raw, kampagne.threadId);
        return await this.buchVersandAb(quittung, versuch, objektTyp, objektId, sendId, kennung, begonnen, kampagne, absender, nachricht);

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
            return await this.buchVersandAb(
              { id: pruefung.messageId, threadId: pruefung.threadId || '', rfcId: pruefung.rfcId || '' },
              versuch, objektTyp, objektId, sendId, kennung, begonnen, kampagne, absender, nachricht);
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

  async buchVersandAb(quittung, versuch, objektTyp, objektId, sendId, kennung, begonnen, kampagne, absender, nachricht) {
    kampagne = kampagne || { sequenz: null, schrittNr: 0, verweise: '' };
    const zeitpunkt = new Date().toISOString();
    const messageId = (quittung && quittung.id) || '';

    /* Erst das Ledger, dann HubSpot. Scheitert HubSpot, ist die Mail
       trotzdem als versendet vermerkt — und ein spaeterer Lauf korrigiert
       den CRM-Stand ueber den Zweig 'duplicate'. Andersherum waere die
       Mail bei einem Absturz verloren und ginge doppelt raus. */
    this.ledger.markiereVersendet(sendId, {
      messageId: messageId,
      versuche: versuch,
      threadId: (quittung && quittung.threadId) || '',
      /* Die Message-ID, die Gmail wirklich vergeben hat. Sie ist der Faden,
         an dem die Nachfassmail haengt. Steht sie nicht zur Verfuegung
         (kein Lesezugriff), geht die naechste Mail eigenstaendig raus. */
      rfcId: (quittung && quittung.rfcId) || '',
      verweise: kampagne.verweise || '',
      sequenz: kampagne.sequenz ? kampagne.sequenz.schluessel : '',
      schritt: kampagne.schrittNr || 0
    });

    /* Die echte Message-ID nachtraeglich holen, damit der naechste Schritt
       im selben Verlauf landen kann. Nur wenn Lesezugriff besteht und noch
       eine Nachfassmail kommt — sonst waere es ein Aufruf ohne Nutzen. */
    if (kampagne.sequenz && messageId && absender &&
        faelligkeitDanach(kampagne.sequenz, kampagne.schrittNr, Date.now()) !== null) {
      const kopf = await this.gmail.messageKopf(absender.email, messageId);
      if (kopf && kopf.rfcId) {
        this.ledger.markiereVersendet(sendId, { rfcId: kopf.rfcId, threadId: kopf.threadId || '' });
      } else if (this.cfg.sequenz.antwortpruefungPflicht === false) {
        log.debug('sequenz.ohne_verlauf', Object.assign({
          hinweis: 'Ohne gmail.readonly geht die Nachfassmail eigenstaendig raus, mit "Re:" im Betreff.'
        }, kennung));
      }
    }

    await this.schreibeHubSpot(objektTyp, objektId, Object.assign({
      status: STATUS.SENT, sentAt: zeitpunkt, id: sendId,
      messageId: messageId, error: '', attempts: versuch
    }, this.sequenzFortschritt(kampagne)));

    log.info('versand.erfolgreich', Object.assign({
      versuch: versuch, message_id: messageId, dauer_ms: Date.now() - begonnen
    }, kennung));

    return this._zaehle({ ergebnis: 'sent', sendId: sendId, messageId: messageId, schritt: kampagne.schrittNr || 0 });
  }

  /* ------------------------------------------------------------ Kampagne */
  /**
   * Was nach einem verschickten Schritt in HubSpot stehen muss. Gibt es
   * noch einen Schritt, wird der Datensatz gleich wieder auf "scheduled"
   * gestellt — damit uebernimmt die vorhandene Zeitsteuerung die
   * Nachfassmail, und es braucht keinen zweiten Mechanismus daneben.
   */
  sequenzFortschritt(kampagne) {
    if (!kampagne || !kampagne.sequenz) return {};

    const faellig = faelligkeitDanach(kampagne.sequenz, kampagne.schrittNr, Date.now());

    if (faellig === null) {
      return { sequenceStep: kampagne.schrittNr, sequenceStatus: SEQ_STATUS.COMPLETED };
    }

    return {
      sequenceStep: kampagne.schrittNr,
      sequenceStatus: SEQ_STATUS.ACTIVE,
      status: STATUS.SCHEDULED,
      sendAtWunsch: alsHubSpotZeit(faellig)
    };
  }

  /** Beendet eine Sequenz — von Hand gestoppt, Bedingung erfuellt oder durch. */
  async beendeSequenz(objektTyp, objektId, abbruch, kennung, sequenz) {
    const endStatus = abbruch.grund === SEQ_STATUS.COMPLETED ? STATUS.SENT : STATUS.CANCELLED;

    await this.schreibeHubSpot(objektTyp, objektId, {
      status: endStatus,
      sequenceStatus: abbruch.grund,
      error: abbruch.feld
        ? 'Kampagne gestoppt, weil ' + abbruch.feld + ' auf "' + abbruch.wert + '" steht.'
        : ''
    });

    log.info('sequenz.beendet', Object.assign({
      sequenz: sequenz ? sequenz.schluessel : '', grund: abbruch.grund,
      feld: abbruch.feld || '', wert: abbruch.wert || ''
    }, kennung));

    this.zaehler.sequenz_gestoppt++;
    return { ergebnis: 'sequence_stopped', grund: abbruch.grund };
  }

  /** Der Ledger-Eintrag des vorangegangenen Schritts — ueber dessen Send-ID. */
  vorherigerSchritt(sequenz, schrittNr, objektTyp, objektId, empfaenger, absender, props) {
    const vorher = sequenz.schritte[schrittNr - 2];
    if (!vorher) return null;

    const sendId = this.baueSendId({
      objektTyp: objektTyp, objektId: objektId, empfaenger: empfaenger, absender: absender,
      betreff: String(vorher.betreff).trim(), rumpf: String(vorher.rumpf).trim(),
      vorlage: String(props[this.cfg.props.template] || ''),
      freigabe: String(props[this.cfg.props.sendKey] || ''),
      sequenz: sequenz.schluessel, schritt: schrittNr - 1
    });

    return { sendId: sendId, eintrag: this.ledger.eintrag(sendId) || {} };
  }

  /** Hat jemand anderes als wir in den Verlauf geschrieben? */
  async pruefeAntwort(absender, vorgaenger, kennung) {
    const threadId = vorgaenger && vorgaenger.eintrag && vorgaenger.eintrag.threadId;
    if (!threadId) return { gestoppt: false, pruefbar: false };

    const ergebnis = await this.gmail.threadHatFremdeAntwort(absender.email, threadId, absender.email);

    if (ergebnis.pruefbar && ergebnis.gefunden) {
      log.info('sequenz.antwort_erkannt', Object.assign({ von: ergebnis.von }, kennung));
      return { gestoppt: true, pruefbar: true };
    }
    return { gestoppt: false, pruefbar: ergebnis.pruefbar };
  }

  /* ------------------------------------------------------- Sendefenster */
  /**
   * @returns {number|null} null, wenn jetzt gesendet werden darf; sonst der
   *   naechste erlaubte Zeitpunkt in Millisekunden.
   */
  naechstesFenster(abMs) {
    const spanne = String(this.cfg.sequenz.sendefenster || '').trim();
    if (!spanne) return null;

    const teile = spanne.split('-');
    const von = parseInt(teile[0], 10);
    const bis = parseInt(teile[1], 10);
    if (!Number.isFinite(von) || !Number.isFinite(bis) || von >= bis) return null;

    const tage = this.cfg.sequenz.sendetage.map((t) => parseInt(t, 10)).filter(Number.isFinite);
    if (!tage.length) return null;

    /* In Viertelstundenschritten bis zu acht Tage voraus — das deckt auch
       ein langes Wochenende samt Zeitumstellung ab, ohne eigene Rechnerei. */
    for (let i = 0; i <= 8 * 24 * 4; i++) {
      const zeitpunkt = abMs + i * 15 * 60000;
      const t = this.teileInZone(zeitpunkt);
      if (tage.indexOf(t.wochentag) !== -1 && t.stunde >= von && t.stunde < bis) {
        return i === 0 ? null : zeitpunkt;
      }
    }
    return null;
  }

  teileInZone(ms) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: this.cfg.zeitzone, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit'
    });
    const t = {};
    for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== 'literal') t[p.type] = p.value;

    const wochentage = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { stunde: parseInt(t.hour, 10) % 24, minute: parseInt(t.minute, 10), wochentag: wochentage[t.weekday] };
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

    /* Die Felder, ueber die eine Kampagne abbrechen kann — global und je
       Kampagne. Ohne sie im Abruf wuerde die Abbruchbedingung leerlaufen
       und die Nachfassmail trotzdem rausgehen. */
    for (const feld of Object.keys(this.cfg.sequenz.abbruchWenn || {})) felder.add(feld);
    for (const schluessel of this.sequenzen.schluessel()) {
      const s = this.sequenzen.fuer(schluessel);
      for (const feld of Object.keys((s && s.abbruchWenn) || {})) felder.add(feld);
    }
    if (this.cfg.sequenz.einwilligungProperty) felder.add(this.cfg.sequenz.einwilligungProperty);

    const typ = String(objektTyp).toLowerCase();
    if (typ === 'contacts' || typ === 'contact') for (const f of KONTAKT_FELDER) felder.add(f);
    if (typ === 'companies' || typ === 'company') for (const f of UNTERNEHMEN_FELDER) felder.add(f);
    if (typ === 'leads' || typ === 'lead') { felder.add('hs_lead_name'); felder.add('hs_lead_type'); }

    return this.hubspot.datensatz(objektTyp, objektId, Array.from(felder));
  }

  /* ---------------------------------------------------------- Absender */
  /* Reihenfolge: was am Datensatz steht, dann was die Kampagne vorgibt,
     dann der Standard. Der Datensatz gewinnt, damit sich eine einzelne
     Mail im Zweifel umleiten laesst, ohne die Kampagne zu aendern. */
  waehleAbsender(props, sequenz) {
    const amDatensatz = this.cfg.props.sender ? String(props[this.cfg.props.sender] || '').trim() : '';
    const ausKampagne = (sequenz && sequenz.absender) ? String(sequenz.absender).trim() : '';
    const schluessel = amDatensatz || ausKampagne || this.cfg.absender.standard;
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
        case 'computed':
          if (name === 'anrede') {
            wert = baueAnrede(kontaktProps.salutation || props.salutation,
                              kontaktProps.lastname || props.lastname)
                   || anredeErsatz(this.cfg.versand.anredeRegel);
          }
          break;
        default: wert = '';
      }
      werte[platzhalter] = String(wert == null ? '' : wert).trim();
    }

    /* Feste Werte aus der Konfiguration — der Buchungslink vor allem.
       Sie fuellen nur, was oben leer geblieben ist; ein echter Wert aus
       HubSpot hat immer Vorrang. */
    for (const [name, wert] of Object.entries(this.cfg.versand.extraPlatzhalter || {})) {
      if (!werte[name]) werte[name] = String(wert == null ? '' : wert).trim();
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
      String(teile.freigabe || ''),
      /* Kampagne und Schritt gehoeren mit hinein: Zwei Schritte derselben
         Kampagne sind zwei verschiedene Mails, auch wenn der Text einmal
         zufaellig derselbe waere. */
      String(teile.sequenz || ''),
      String(teile.schritt || 0),
      /* Nur die Namen der Anhaenge, nicht ihr Inhalt. Ein korrigierter
         Flyer unter gleichem Namen ist eine Korrektur, kein Anlass, die
         Mail noch einmal zu verschicken. */
      (teile.anhaenge || []).join(',')
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

    /* Kampagnenstand. sendAtWunsch traegt die Faelligkeit der naechsten
       Nachfassmail in dasselbe Feld ein, das auch ein Mensch benutzt —
       so ist im CRM sichtbar, wann die naechste Mail rausgeht. */
    if (felder.sequenceStep !== undefined) setze('sequenceStep', felder.sequenceStep);
    setze('sequenceStatus', felder.sequenceStatus);
    if (felder.sendAtWunsch) setze('sendAt', felder.sendAtWunsch);

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

/* ------------------------------------------------------------- Anrede */
/**
 * Baut die persoenliche Briefanrede.
 *
 *   ("Herr", "Meier")        -> Sehr geehrter Herr Meier
 *   ("Frau Dr.", "Schmidt")  -> Sehr geehrte Frau Dr. Schmidt
 *   ("Mr.", "Brown")         -> Sehr geehrter Herr Brown
 *   ("", "Meier")            -> ''   (nicht bildbar)
 *   ("Dr.", "Meier")         -> ''   (Titel ohne Geschlecht)
 *
 * Leer heisst: nicht bildbar. Was dann geschieht, entscheidet ANREDE_POLICY —
 * hier wird nicht geraten. Das Geschlecht aus dem Vornamen abzuleiten waere
 * technisch moeglich und bei jedem zehnten Namen falsch; eine Praxisinhaberin
 * mit "Sehr geehrter Herr" anzuschreiben verbrennt den Kontakt sicherer als
 * gar keine Mail.
 */
function baueAnrede(anredeFeld, nachname) {
  const anrede = String(anredeFeld || '').trim();
  const name = String(nachname || '').trim();
  if (!anrede || !name) return '';

  /* HubSpot-Portale mit englischer Grundeinstellung liefern Mr./Ms. */
  const weiblich = /^(frau|ms|mrs|miss)\b\.?/i.test(anrede);
  const maennlich = /^(herr|mr)\b\.?/i.test(anrede);
  if (!weiblich && !maennlich) return '';

  const titel = anrede
    .replace(/^(frau|ms|mrs|miss|herr|mr)\.?\s*/i, '')
    .trim();

  return (weiblich ? 'Sehr geehrte Frau' : 'Sehr geehrter Herr') +
         (titel ? ' ' + titel : '') + ' ' + name;
}

/** Der Ersatz, wenn keine persoenliche Anrede gebildet werden konnte. */
function anredeErsatz(regel) {
  if (regel === 'formal') return 'Sehr geehrte Damen und Herren';
  if (regel === 'neutral') return 'Guten Tag';
  return '';   /* strict — der Versand bleibt stehen */
}

/* "Re:" genau einmal davor — auch wenn der Betreff es schon traegt. */
function betreffMitRe(betreff) {
  const b = String(betreff || '').trim();
  return /^(re|aw|antw)\s*:/i.test(b) ? b : 'Re: ' + b;
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

module.exports = { Pipeline, STANDARD_HERKUNFT, normalisiere, baueAnrede, anredeErsatz, betreffMitRe };
