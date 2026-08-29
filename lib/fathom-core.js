/* =============================================================================
 *  Fathom — Gesprächsmitschrift zurück ins CRM
 *
 *  Ablauf einer Beratung:
 *
 *    1. Jemand bucht über finanz-medizin.com. lib/booking-core.js legt den
 *       Termin an — inklusive Google-Meet-Raum — und in Close einen Lead.
 *    2. Fathom hängt am Google-Kalender der Beratung, tritt dem Meet-Raum bei
 *       und transkribiert.
 *    3. Ist die Aufbereitung fertig, ruft Fathom diesen Endpunkt auf.
 *    4. Wir ordnen die Aufzeichnung über die E-Mail-Adresse des Teilnehmers
 *       dem Lead in Close zu und hängen die Zusammenfassung als Notiz an.
 *
 *  Damit steht die Nachbereitung im CRM, ohne dass jemand etwas abtippt.
 *
 *  Grundsatz Datensparsamkeit: Standardmäßig wandert nur die Zusammenfassung
 *  samt Aufgabenliste ins CRM, nicht das Wortprotokoll. Ein vollständiges
 *  Transkript einer Finanzberatung ist ein sehr detailliertes Persönlichkeits-
 *  bild; es gehört nur dorthin, wo es gebraucht wird. Wer es dennoch will,
 *  setzt FATHOM_NOTIZ=voll — bewusst und nicht aus Versehen.
 *
 *  Umgebungsvariablen
 *    FATHOM_WEBHOOK_SECRET   Pflicht. Aus Fathom beim Anlegen des Webhooks
 *                            ("whsec_…"). Ohne dieses Geheimnis nimmt der
 *                            Endpunkt nichts an.
 *    FATHOM_API_KEY          optional. Nur nötig, wenn der Webhook Inhalte
 *                            nicht mitliefert — dann holen wir sie nach.
 *    CLOSE_API_KEY           Pflicht. Ohne CRM gibt es nichts anzuhängen.
 *    FATHOM_NOTIZ            optional: "zusammenfassung" (Vorgabe) | "voll" | "aus"
 *    FATHOM_EIGENE_DOMAENEN  optional, Vorgabe "finanz-medizin.com".
 *                            Komma-Liste. Diese Teilnehmer gelten als eigene
 *                            Seite und kommen für die Zuordnung nicht infrage.
 *    FATHOM_LEAD_ANLEGEN     optional, "ja" legt einen Lead an, wenn zu der
 *                            E-Mail-Adresse keiner existiert. Vorgabe: nein —
 *                            lieber eine Lücke im CRM als ein Doppeleintrag.
 * ========================================================================== */

'use strict';

const crypto = require('crypto');
const { closeGet, closeRequest, kurz } = require('./close.js');

const FATHOM_API = 'https://api.fathom.ai/external/v1';

/* Fathom folgt der Standard-Webhooks-Spezifikation: Der Zeitstempel darf
   höchstens fünf Minuten alt sein, sonst wäre ein mitgeschnittener Aufruf
   beliebig oft wiederholbar. */
const TOLERANZ_SEKUNDEN = 300;

const antwort = (status, body) => ({ status: status, body: body });

/* ----------------------------------------------------------- Konfiguration */
function konfig(env) {
  const geheimnis = env.FATHOM_WEBHOOK_SECRET;
  const closeKey = env.CLOSE_API_KEY;
  if (!geheimnis || !closeKey) return null;

  const eigene = String(env.FATHOM_EIGENE_DOMAENEN || 'finanz-medizin.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return {
    geheimnis: geheimnis,
    closeKey: closeKey,
    apiKey: env.FATHOM_API_KEY || null,
    notiz: String(env.FATHOM_NOTIZ || 'zusammenfassung').toLowerCase(),
    eigene: eigene,
    leadAnlegen: String(env.FATHOM_LEAD_ANLEGEN || '').toLowerCase() === 'ja'
  };
}

/* ------------------------------------------------------------- Signatur
   Signiert wird "<id>.<zeitstempel>.<rumpf>" mit HMAC-SHA256. Das Geheimnis
   ist base64-kodiert und trägt das Präfix "whsec_". Der Header kann mehrere
   Signaturen enthalten (bei einem Schlüsselwechsel) — eine muss passen. */
function pruefeSignatur(kopfzeilen, rohBody, geheimnis) {
  const id = kopfzeilen['webhook-id'];
  const zeit = kopfzeilen['webhook-timestamp'];
  const signaturen = kopfzeilen['webhook-signature'];
  if (!id || !zeit || !signaturen) return false;

  const alter = Math.abs(Math.floor(Date.now() / 1000) - parseInt(zeit, 10));
  if (!isFinite(alter) || alter > TOLERANZ_SEKUNDEN) return false;

  const schluessel = Buffer.from(geheimnis.replace(/^whsec_/, ''), 'base64');
  const erwartet = crypto.createHmac('sha256', schluessel)
    .update(id + '.' + zeit + '.' + rohBody)
    .digest();

  return String(signaturen).split(' ').some(function (eintrag) {
    const teile = eintrag.split(',');
    const roh = teile.length > 1 ? teile[1] : teile[0];
    let gegeben;
    try { gegeben = Buffer.from(roh, 'base64'); } catch (e) { return false; }
    /* timingSafeEqual wirft bei ungleicher Länge — die Längenprüfung vorweg
       verrät nichts, weil die Länge der HMAC-Ausgabe ohnehin bekannt ist. */
    if (gegeben.length !== erwartet.length) return false;
    return crypto.timingSafeEqual(gegeben, erwartet);
  });
}

/* ---------------------------------------------------------- Fathom-Abruf
   Nur ein Nachschlag: Was der Webhook schon mitbringt, holen wir nicht
   zweimal. Fehlschläge sind hier nicht tödlich — dann steht eben weniger in
   der Notiz. */
async function holeVonFathom(pfad, apiKey) {
  const res = await fetch(FATHOM_API + pfad, {
    headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' }
  });
  if (!res.ok) {
    const f = new Error('Fathom ' + pfad + ' antwortete ' + res.status);
    f.status = res.status;
    throw f;
  }
  return res.json();
}

/* ------------------------------------------------------- Nutzlast lesen
   Fathom hat die Feldnamen über die Jahre erweitert. Statt uns auf eine
   Schreibweise festzulegen, nehmen wir die erste, die belegt ist. */
function ersterWert(objekt, namen) {
  for (const name of namen) {
    const wert = objekt && objekt[name];
    if (wert !== undefined && wert !== null && wert !== '') return wert;
  }
  return null;
}

/* Aus Text oder Liste eine lesbare Zeichenkette machen. Die Zusammenfassung
   kommt mal als Fließtext, mal als Liste von Abschnitten. */
function alsText(wert) {
  if (wert == null) return '';
  if (typeof wert === 'string') return wert;
  if (Array.isArray(wert)) {
    return wert.map(function (e) {
      if (typeof e === 'string') return '  • ' + e;
      const t = ersterWert(e, ['text', 'description', 'title', 'summary', 'content']);
      return t ? '  • ' + String(t) : '';
    }).filter(Boolean).join('\n');
  }
  if (typeof wert === 'object') {
    const t = ersterWert(wert, ['markdown', 'text', 'content', 'summary']);
    if (t) return alsText(t);
  }
  return '';
}

/* Das Wortprotokoll kommt als Liste von Sprecherbeiträgen. */
function transkriptText(wert) {
  if (typeof wert === 'string') return wert;
  if (!Array.isArray(wert)) return '';
  return wert.map(function (z) {
    const wer = ersterWert(z, ['speaker', 'speaker_name', 'name']);
    const was = ersterWert(z, ['text', 'transcript', 'content']);
    if (!was) return '';
    const sprecher = (wer && typeof wer === 'object')
      ? ersterWert(wer, ['name', 'display_name', 'email'])
      : wer;
    return (sprecher ? sprecher + ': ' : '') + was;
  }).filter(Boolean).join('\n');
}

/* Alle Teilnehmer-Adressen aus der Nutzlast einsammeln — egal, unter welchem
   Schlüssel Fathom sie gerade führt. */
function teilnehmerAdressen(nutzlast) {
  const listen = [
    nutzlast.calendar_invitees, nutzlast.invitees, nutzlast.attendees,
    nutzlast.participants,
    nutzlast.meeting && nutzlast.meeting.calendar_invitees,
    nutzlast.meeting && nutzlast.meeting.invitees,
    nutzlast.recording && nutzlast.recording.calendar_invitees
  ];

  const adressen = [];
  listen.forEach(function (liste) {
    if (!Array.isArray(liste)) return;
    liste.forEach(function (e) {
      const mail = (typeof e === 'string') ? e : ersterWert(e, ['email', 'email_address', 'address']);
      if (!mail) return;
      const sauber = String(mail).trim().toLowerCase();
      if (sauber.indexOf('@') > 0 && adressen.indexOf(sauber) === -1) adressen.push(sauber);
    });
  });
  return adressen;
}

/* Die Gegenseite ist, wer nicht zu uns gehört. Fathoms eigener Notetaker
   trägt je nach Konfiguration auch eine Adresse — die fliegt mit raus. */
function gegenseite(adressen, eigene) {
  return adressen.filter(function (a) {
    const domain = a.split('@')[1] || '';
    if (eigene.indexOf(domain) !== -1) return false;
    if (/(^|\.)fathom\.(ai|video)$/.test(domain)) return false;
    return true;
  });
}

/* ------------------------------------------------------------ Close-Suche */
async function sucheLeadId(closeKey, email) {
  const treffer = await closeGet('/lead/?query=' + encodeURIComponent('email:' + email) +
    '&_fields=id&_limit=1', closeKey);
  const daten = (treffer && treffer.data) || [];
  return daten.length ? daten[0].id : null;
}

/* Fathom wiederholt Zustellversuche, wenn unsere Antwort unterwegs verloren
   geht. Ohne diese Prüfung stünde dieselbe Mitschrift dann zweimal am Lead.
   Wir suchen deshalb nach der Kennung, die baueNotiz hinterlässt. Schlägt die
   Suche fehl, schreiben wir lieber doppelt als gar nicht. */
async function bereitsVermerkt(closeKey, leadId, aufnahmeId) {
  try {
    const vorhanden = await closeGet('/activity/note/?lead_id=' +
      encodeURIComponent(leadId) + '&_limit=50', closeKey);
    const marke = 'Fathom-Aufnahme: ' + aufnahmeId;
    return ((vorhanden && vorhanden.data) || []).some(function (n) {
      return String(n.note || '').indexOf(marke) !== -1;
    });
  } catch (e) {
    console.error('fathom: Dublettenprüfung fehlgeschlagen —', e.message);
    return false;
  }
}

/* -------------------------------------------------------------- Notiztext */
function baueNotiz(f, modus) {
  const zeilen = [
    '=== Beratungsgespräch — Mitschrift von Fathom ===',
    ''
  ];

  zeilen.push('GESPRÄCH');
  /* Feste Kennung, an der ein zweiter Zustellversuch erkennbar ist. */
  zeilen.push('  • Fathom-Aufnahme: ' + f.aufnahmeId);
  if (f.titel) zeilen.push('  • Titel: ' + f.titel);
  if (f.zeitpunkt) zeilen.push('  • Zeitpunkt: ' + f.zeitpunkt);
  if (f.dauer) zeilen.push('  • Dauer: ' + f.dauer);
  if (f.teilnehmer.length) zeilen.push('  • Teilnehmer: ' + f.teilnehmer.join(', '));
  if (f.url) zeilen.push('  • Aufzeichnung: ' + f.url);
  zeilen.push('');

  if (f.zusammenfassung) {
    zeilen.push('ZUSAMMENFASSUNG', f.zusammenfassung, '');
  }
  if (f.aufgaben) {
    zeilen.push('OFFENE PUNKTE', f.aufgaben, '');
  }

  if (modus === 'voll' && f.transkript) {
    /* Close nimmt lange Notizen an, aber alles hat eine Grenze. Wird es
       länger, steht der Rest ohnehin in Fathom — der Link ist oben. */
    zeilen.push('WORTPROTOKOLL', kurz(f.transkript, 90000), '');
  }

  zeilen.push('Automatisch übernommen am ' + new Date().toISOString());
  return zeilen.join('\n');
}

/* ==========================================================================
 *  Einstieg: ein eingegangener Webhook
 *
 *  Rückgabewerte sind bewusst großzügig mit 200: Fathom wiederholt bei
 *  Fehlern. Ein Aufruf, den wir verstanden aber nicht zuordnen konnten, ist
 *  erledigt und kein Grund für eine Wiederholungsschleife. Nur eine falsche
 *  Signatur und ein echter Ausfall im CRM rechtfertigen einen Fehlercode.
 * ======================================================================== */
async function verarbeiteWebhook(rohBody, kopfzeilen, env) {
  const k = konfig(env);
  if (!k) return antwort(503, { ok: false, grund: 'nicht_konfiguriert' });
  if (k.notiz === 'aus') return antwort(200, { ok: true, uebersprungen: 'abgeschaltet' });

  if (!pruefeSignatur(kopfzeilen, rohBody, k.geheimnis)) {
    console.error('fathom: Signatur abgelehnt');
    return antwort(401, { ok: false, fehler: 'Signatur ungültig.' });
  }

  let nutzlast;
  try {
    nutzlast = JSON.parse(rohBody || '{}');
  } catch (e) {
    return antwort(400, { ok: false, fehler: 'Ungültiges JSON.' });
  }

  const aufnahme = nutzlast.recording || nutzlast.meeting || nutzlast;
  const aufnahmeId = ersterWert(nutzlast, ['recording_id', 'id']) ||
                     ersterWert(aufnahme, ['recording_id', 'id']);
  if (!aufnahmeId) return antwort(200, { ok: true, uebersprungen: 'ohne_aufnahme' });

  /* Was der Webhook mitbringt. */
  const f = {
    aufnahmeId: aufnahmeId,
    titel: kurz(ersterWert(nutzlast, ['title', 'meeting_title']) ||
                ersterWert(aufnahme, ['title', 'meeting_title']), 200),
    zeitpunkt: kurz(ersterWert(nutzlast, ['recording_start_time', 'scheduled_start_time', 'created_at']) ||
                    ersterWert(aufnahme, ['recording_start_time', 'scheduled_start_time', 'created_at']), 60),
    dauer: kurz(ersterWert(nutzlast, ['duration', 'recording_duration_in_minutes']) ||
                ersterWert(aufnahme, ['duration', 'recording_duration_in_minutes']), 40),
    url: kurz(ersterWert(nutzlast, ['share_url', 'url', 'recording_url']) ||
              ersterWert(aufnahme, ['share_url', 'url', 'recording_url']), 300),
    zusammenfassung: alsText(ersterWert(nutzlast, ['summary', 'ai_summary']) ||
                             ersterWert(aufnahme, ['summary', 'ai_summary'])),
    aufgaben: alsText(ersterWert(nutzlast, ['action_items']) ||
                      ersterWert(aufnahme, ['action_items'])),
    transkript: transkriptText(ersterWert(nutzlast, ['transcript']) ||
                               ersterWert(aufnahme, ['transcript'])),
    teilnehmer: teilnehmerAdressen(nutzlast)
  };

  /* Was fehlt, holen wir nach — sofern ein API-Schlüssel hinterlegt ist.
     Scheitert das, bleibt die Notiz eben kürzer; abbrechen wäre schlechter. */
  if (k.apiKey && !f.zusammenfassung) {
    try {
      const s = await holeVonFathom('/recordings/' + encodeURIComponent(aufnahmeId) + '/summary', k.apiKey);
      f.zusammenfassung = alsText(ersterWert(s, ['markdown', 'summary', 'text'])) || alsText(s);
    } catch (e) {
      console.error('fathom: Zusammenfassung nicht abrufbar —', e.message);
    }
  }
  if (k.apiKey && k.notiz === 'voll' && !f.transkript) {
    try {
      const t = await holeVonFathom('/recordings/' + encodeURIComponent(aufnahmeId) + '/transcript', k.apiKey);
      f.transkript = transkriptText(ersterWert(t, ['transcript', 'items', 'data']) || t);
    } catch (e) {
      console.error('fathom: Transkript nicht abrufbar —', e.message);
    }
  }

  if (!f.zusammenfassung && !f.transkript) {
    return antwort(200, { ok: true, uebersprungen: 'ohne_inhalt', recording_id: aufnahmeId });
  }

  /* --------------------------------------------------------- Zuordnung
     Wir probieren die Adressen der Gegenseite der Reihe nach durch. Bei einem
     Gespräch zu zweit ist das genau eine; bei mehreren gewinnt die erste, zu
     der es im CRM etwas gibt. */
  const kandidaten = gegenseite(f.teilnehmer, k.eigene);
  let leadId = null;
  let zugeordnetPer = null;

  for (const email of kandidaten) {
    try {
      leadId = await sucheLeadId(k.closeKey, email);
    } catch (e) {
      console.error('fathom: Close-Suche fehlgeschlagen —', e.message);
      return antwort(502, { ok: false, fehler: 'CRM nicht erreichbar.' });
    }
    if (leadId) { zugeordnetPer = email; break; }
  }

  if (!leadId && k.leadAnlegen && kandidaten.length) {
    try {
      const neu = await closeRequest('/lead/', k.closeKey, {
        name: kandidaten[0],
        description: 'Aus einem Beratungsgespräch (Fathom) angelegt',
        contacts: [{ emails: [{ type: 'office', email: kandidaten[0] }] }]
      });
      leadId = neu.id;
      zugeordnetPer = kandidaten[0];
    } catch (e) {
      console.error('fathom: Lead konnte nicht angelegt werden —', e.message);
    }
  }

  if (!leadId) {
    /* Kein Treffer. Bewusst ohne die Adressen im Log — sie gehören nicht in
       eine Protokolldatei, die andere Zwecke hat. */
    console.warn('fathom: keine Zuordnung für Aufnahme', aufnahmeId,
                 '(' + kandidaten.length + ' Kandidat(en))');
    return antwort(200, { ok: true, zugeordnet: false, recording_id: aufnahmeId });
  }

  if (await bereitsVermerkt(k.closeKey, leadId, aufnahmeId)) {
    return antwort(200, {
      ok: true, zugeordnet: true, lead_id: leadId,
      recording_id: aufnahmeId, uebersprungen: 'bereits_vermerkt'
    });
  }

  try {
    await closeRequest('/activity/note/', k.closeKey, {
      lead_id: leadId,
      note: baueNotiz(f, k.notiz)
    });
  } catch (e) {
    console.error('fathom: Notiz fehlgeschlagen —', e.message, '|', e.detail || '');
    return antwort(502, { ok: false, fehler: 'Notiz konnte nicht angelegt werden.' });
  }

  return antwort(200, {
    ok: true, zugeordnet: true, lead_id: leadId,
    recording_id: aufnahmeId, per: zugeordnetPer
  });
}

module.exports = {
  verarbeiteWebhook, pruefeSignatur, konfig, bereitsVermerkt,
  teilnehmerAdressen, gegenseite, alsText, transkriptText, baueNotiz
};
