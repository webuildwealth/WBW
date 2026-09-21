/* =============================================================================
 *  Wer bekommt die Mail
 *
 *  Der heikelste Teil der ganzen Automation. Ein Unternehmen hat keine
 *  E-Mail-Adresse, ein Lead auch nicht — beide haben Verknuepfungen. Und
 *  "irgendeinen der verknuepften Kontakte nehmen" ist keine Loesung, sondern
 *  ein Weg, vertrauliche Post an die falsche Person zu schicken.
 *
 *  Deshalb gilt hier durchgehend: Entweder die Adresse ist eindeutig, oder es
 *  wird nicht gesendet. Kein Erstbester, kein Zufall, keine Rundmail an alle.
 *
 *  Reihenfolge je Objektart:
 *
 *    Kontakt       1. automation_email_recipient (ausdrueckliche Vorgabe)
 *                  2. email
 *
 *    Unternehmen   1. automation_email_recipient
 *                  2. automation_email_contact_id (der benannte Ansprechpartner)
 *                  3. genau ein verknuepfter Kontakt mit Adresse
 *                     -> mehrere: Abbruch mit Nennung der Kandidaten
 *
 *    Lead          1. automation_email_recipient
 *                  2. genau ein verknuepfter Kontakt
 *                  3. ueber das verknuepfte Unternehmen, nach dessen Regeln
 * ========================================================================== */

'use strict';

const { istAdresse } = require('./mime.js');

/* Die Felder, die am Kontakt gebraucht werden — fuer die Adresse und fuer
   die Platzhalter. */
const KONTAKT_FELDER = ['email', 'firstname', 'lastname', 'company', 'salutation', 'jobtitle', 'phone'];
const UNTERNEHMEN_FELDER = ['name', 'domain', 'city'];

function fehler(nachricht, code, zusatz) {
  const f = new Error(nachricht);
  f.code = code;
  f.empfaengerProblem = true;      /* -> niemals wiederholen, ein Mensch muss ran */
  if (zusatz) Object.assign(f, zusatz);
  return f;
}

const feld = (datensatz, name) => (datensatz && datensatz.properties && datensatz.properties[name]) || '';

/**
 * @returns {Promise<{email:string, kontakt:object|null, unternehmen:object|null, quelle:string}>}
 */
async function ermittleEmpfaenger(objektTyp, datensatz, hubspot, cfg) {
  const typ = String(objektTyp).toLowerCase();

  /* Eine ausdrueckliche Vorgabe schlaegt jede Herleitung — sie steht ja
     genau deshalb da. Gilt fuer alle drei Objektarten gleich. */
  const vorgabe = cfg.props.recipient ? String(feld(datensatz, cfg.props.recipient)).trim() : '';
  if (vorgabe) {
    if (!istAdresse(vorgabe)) {
      throw fehler('In ' + cfg.props.recipient + ' steht keine gueltige E-Mail-Adresse.', 'EMPFAENGER_VORGABE_UNGUELTIG');
    }
    const begleitung = await begleitdaten(typ, datensatz, hubspot, cfg);
    return { email: vorgabe.toLowerCase(), kontakt: begleitung.kontakt, unternehmen: begleitung.unternehmen, quelle: 'vorgabe' };
  }

  if (typ === 'contacts' || typ === 'contact') return empfaengerAusKontakt(datensatz, hubspot, cfg);
  if (typ === 'companies' || typ === 'company') return empfaengerAusUnternehmen(datensatz, hubspot, cfg);
  if (typ === 'leads' || typ === 'lead') return empfaengerAusLead(datensatz, hubspot, cfg);

  throw fehler('Objektart "' + objektTyp + '" wird nicht unterstuetzt.', 'OBJEKTART_UNBEKANNT');
}

/* -------------------------------------------------------------- Kontakt */
async function empfaengerAusKontakt(kontakt, hubspot, cfg) {
  const adresse = String(feld(kontakt, 'email')).trim().toLowerCase();

  if (!adresse) {
    throw fehler('Der Kontakt hat keine E-Mail-Adresse.', 'KONTAKT_OHNE_ADRESSE');
  }
  if (!istAdresse(adresse)) {
    throw fehler('Die E-Mail-Adresse des Kontakts ist ungueltig.', 'KONTAKT_ADRESSE_UNGUELTIG');
  }

  const unternehmen = await ersteVerknuepfung(hubspot, 'contacts', kontakt.id, 'companies', UNTERNEHMEN_FELDER);
  return { email: adresse, kontakt: kontakt, unternehmen: unternehmen, quelle: 'kontakt.email' };
}

/* ---------------------------------------------------------- Unternehmen */
async function empfaengerAusUnternehmen(unternehmen, hubspot, cfg) {
  /* 1. Der ausdruecklich benannte Ansprechpartner. */
  const benannt = cfg.props.contactId ? String(feld(unternehmen, cfg.props.contactId)).trim() : '';

  if (benannt) {
    if (!/^\d+$/.test(benannt)) {
      throw fehler('In ' + cfg.props.contactId + ' steht keine HubSpot-Kontakt-ID (erwartet wird eine reine Zahl).',
        'ANSPRECHPARTNER_ID_UNGUELTIG');
    }

    let kontakt;
    try {
      kontakt = await hubspot.datensatz('contacts', benannt, KONTAKT_FELDER);
    } catch (e) {
      if (e.status === 404) {
        throw fehler('Der in ' + cfg.props.contactId + ' benannte Kontakt ' + benannt + ' existiert nicht (mehr).',
          'ANSPRECHPARTNER_FEHLT');
      }
      throw e;
    }

    const adresse = String(feld(kontakt, 'email')).trim().toLowerCase();
    if (!istAdresse(adresse)) {
      throw fehler('Der benannte Ansprechpartner (Kontakt ' + benannt + ') hat keine gueltige E-Mail-Adresse.',
        'ANSPRECHPARTNER_OHNE_ADRESSE');
    }
    return { email: adresse, kontakt: kontakt, unternehmen: unternehmen, quelle: 'unternehmen.ansprechpartner' };
  }

  /* 2. Genau ein verknuepfter Kontakt mit Adresse. */
  if (!cfg.empfaenger.einzelkontaktErlaubt) {
    throw fehler('Am Unternehmen ist kein Ansprechpartner in ' + cfg.props.contactId + ' hinterlegt.',
      'ANSPRECHPARTNER_NICHT_GESETZT');
  }

  const verknuepft = await hubspot.verknuepfungen('companies', unternehmen.id, 'contacts', cfg.empfaenger.maxAssoziationen);
  if (!verknuepft.length) {
    throw fehler('Mit dem Unternehmen ist kein Kontakt verknuepft.', 'UNTERNEHMEN_OHNE_KONTAKT');
  }

  const kontakte = await hubspot.kontakteStapel(verknuepft.map((v) => v.id), KONTAKT_FELDER);
  const mitAdresse = kontakte.filter((k) => istAdresse(String(feld(k, 'email')).trim()));

  if (!mitAdresse.length) {
    throw fehler('Keiner der ' + kontakte.length + ' verknuepften Kontakte hat eine gueltige E-Mail-Adresse.',
      'UNTERNEHMEN_KONTAKTE_OHNE_ADRESSE');
  }

  if (mitAdresse.length > 1) {
    /* Hier koennte man "den zuerst angelegten" nehmen. Man koennte auch
       wuerfeln. Beides waere dasselbe. */
    throw fehler(
      'Mit dem Unternehmen sind ' + mitAdresse.length + ' Kontakte mit E-Mail-Adresse verknuepft — ' +
      'damit ist der Empfaenger nicht eindeutig. Bitte die Kontakt-ID des gewuenschten Ansprechpartners in ' +
      cfg.props.contactId + ' eintragen. Zur Auswahl stehen: ' + mitAdresse.map((k) => k.id).join(', ') + '.',
      'EMPFAENGER_MEHRDEUTIG',
      { kandidaten: mitAdresse.map((k) => k.id) }
    );
  }

  return {
    email: String(feld(mitAdresse[0], 'email')).trim().toLowerCase(),
    kontakt: mitAdresse[0],
    unternehmen: unternehmen,
    quelle: 'unternehmen.einzelkontakt'
  };
}

/* ----------------------------------------------------------------- Lead */
async function empfaengerAusLead(lead, hubspot, cfg) {
  const verknuepfteKontakte = await hubspot.verknuepfungen('leads', lead.id, 'contacts', cfg.empfaenger.maxAssoziationen);

  if (verknuepfteKontakte.length) {
    const kontakte = await hubspot.kontakteStapel(verknuepfteKontakte.map((v) => v.id), KONTAKT_FELDER);
    const mitAdresse = kontakte.filter((k) => istAdresse(String(feld(k, 'email')).trim()));

    if (mitAdresse.length === 1) {
      const unternehmen = await ersteVerknuepfung(hubspot, 'contacts', mitAdresse[0].id, 'companies', UNTERNEHMEN_FELDER);
      return {
        email: String(feld(mitAdresse[0], 'email')).trim().toLowerCase(),
        kontakt: mitAdresse[0],
        unternehmen: unternehmen,
        quelle: 'lead.kontakt'
      };
    }

    if (mitAdresse.length > 1) {
      throw fehler(
        'Mit dem Lead sind ' + mitAdresse.length + ' Kontakte mit E-Mail-Adresse verknuepft. ' +
        'Bitte die gewuenschte Adresse in ' + cfg.props.recipient + ' eintragen. Kandidaten: ' +
        mitAdresse.map((k) => k.id).join(', ') + '.',
        'EMPFAENGER_MEHRDEUTIG',
        { kandidaten: mitAdresse.map((k) => k.id) }
      );
    }
  }

  /* Kein Kontakt am Lead — dann ueber das Unternehmen, mit denselben
     strengen Regeln wie dort. */
  const verknuepfteUnternehmen = await hubspot.verknuepfungen('leads', lead.id, 'companies', 5);
  if (verknuepfteUnternehmen.length === 1) {
    const unternehmen = await hubspot.datensatz('companies', verknuepfteUnternehmen[0].id,
      UNTERNEHMEN_FELDER.concat(cfg.props.contactId ? [cfg.props.contactId] : []));
    const ergebnis = await empfaengerAusUnternehmen(unternehmen, hubspot, cfg);
    return Object.assign({}, ergebnis, { quelle: 'lead.unternehmen.' + ergebnis.quelle.split('.').pop() });
  }

  throw fehler(
    'Der Lead hat keinen verknuepften Kontakt mit E-Mail-Adresse' +
    (verknuepfteUnternehmen.length > 1 ? ' und ist mit mehreren Unternehmen verknuepft' : '') + '.',
    'LEAD_OHNE_EMPFAENGER'
  );
}

/* ------------------------------------------------------------- Hilfen */
/* Fuer Platzhalter wie {{company}}: das verknuepfte Unternehmen, wenn es
   genau eines gibt. Ist es mehrdeutig, bleibt der Platzhalter leer — das ist
   eine Textfrage, kein Zustellproblem, und darf nichts blockieren. */
async function ersteVerknuepfung(hubspot, vonTyp, vonId, zuTyp, felder) {
  try {
    const treffer = await hubspot.verknuepfungen(vonTyp, vonId, zuTyp, 2);
    if (treffer.length !== 1) return null;
    return await hubspot.datensatz(zuTyp, treffer[0].id, felder);
  } catch (e) {
    return null;
  }
}

async function begleitdaten(typ, datensatz, hubspot, cfg) {
  if (typ === 'contacts' || typ === 'contact') {
    return { kontakt: datensatz, unternehmen: await ersteVerknuepfung(hubspot, 'contacts', datensatz.id, 'companies', UNTERNEHMEN_FELDER) };
  }
  if (typ === 'companies' || typ === 'company') {
    return { kontakt: null, unternehmen: datensatz };
  }
  return { kontakt: null, unternehmen: null };
}

module.exports = { ermittleEmpfaenger, KONTAKT_FELDER, UNTERNEHMEN_FELDER };
