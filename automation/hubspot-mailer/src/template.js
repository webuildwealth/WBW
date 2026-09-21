/* =============================================================================
 *  Platzhalter, HTML, Signatur
 *
 *  Schreibweise:   {{firstname}}          Wert aus HubSpot
 *                  {{firstname|Kunde}}    Wert, sonst der Text nach dem Strich
 *
 *  Drei Regeln, die hier entschieden werden:
 *
 *  1. Werte werden im HTML-Teil maskiert. Steht in HubSpot als Nachname
 *     "O'Brien & Partner <GmbH>", darf das die Nachricht nicht zerlegen.
 *     Der Nur-Text-Teil bekommt denselben Wert unmaskiert.
 *
 *  2. Fehlt ein Wert und steht kein Ersatz dabei, bricht der Versand ab
 *     (PLACEHOLDER_POLICY=strict). "Guten Tag ," ist schlimmer als eine Mail,
 *     die zehn Minuten spaeter rausgeht, weil jemand den Vornamen nachtraegt.
 *
 *  3. Der Mailtext darf HTML sein — das ist gewollt. Skripte, eingebettete
 *     Rahmen und Ereignisattribute werden trotzdem entfernt: Solcher Inhalt
 *     entsteht fast immer aus einem Kopieren-und-Einfuegen von einer Website,
 *     wirkt in keinem Mailprogramm und schadet nur der Zustellbarkeit.
 * ========================================================================== */

'use strict';

const PLATZHALTER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|([^}]*))?\}\}/g;

/* ------------------------------------------------------------ Maskierung */
function maskiereHtml(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Die benannten Entitaeten, die in deutschen Geschaeftsmails wirklich
   vorkommen. Alles Numerische wird ohnehin generisch aufgeloest. */
const ENTITAETEN = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: '\u00e4', ouml: '\u00f6', uuml: '\u00fc',
  Auml: '\u00c4', Ouml: '\u00d6', Uuml: '\u00dc', szlig: '\u00df',
  agrave: '\u00e0', aacute: '\u00e1', eacute: '\u00e9', egrave: '\u00e8',
  ccedil: '\u00e7', ntilde: '\u00f1', oslash: '\u00f8', aring: '\u00e5', aelig: '\u00e6',
  euro: '\u20ac', pound: '\u00a3', cent: '\u00a2', yen: '\u00a5',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', sect: '\u00a7', para: '\u00b6',
  deg: '\u00b0', plusmn: '\u00b1', times: '\u00d7', divide: '\u00f7',
  middot: '\u00b7', bull: '\u2022', hellip: '\u2026', dagger: '\u2020',
  ndash: '\u2013', mdash: '\u2014', minus: '\u2212',
  laquo: '\u00ab', raquo: '\u00bb', bdquo: '\u201e', ldquo: '\u201c', rdquo: '\u201d',
  sbquo: '\u201a', lsquo: '\u2018', rsquo: '\u2019',
  shy: '', zwnj: '', zwj: '', ensp: ' ', emsp: ' ', thinsp: ' ',
  frac12: '\u00bd', frac14: '\u00bc', sup2: '\u00b2', sup3: '\u00b3',
  larr: '\u2190', rarr: '\u2192', harr: '\u2194', checkmark: '\u2713'
};

function entmaskiereHtml(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,9});/g, (ganz, name) => {
      if (ENTITAETEN[name] !== undefined) return ENTITAETEN[name];
      const klein = name.toLowerCase();
      return ENTITAETEN[klein] !== undefined ? ENTITAETEN[klein] : ganz;
    });
}

/* -------------------------------------------------------- Platzhalter */
/** Welche Platzhalter kommen in einem Text vor? */
function sammlePlatzhalter(text) {
  const namen = new Set();
  String(text || '').replace(PLATZHALTER_RE, (_, name) => { namen.add(name); return ''; });
  return namen;
}

/**
 * Setzt Werte ein.
 * @param {object} optionen  { maskieren:boolean, regel:'strict'|'blank' }
 * @returns {{text:string, fehlend:string[]}}
 */
function rendere(text, werte, optionen) {
  optionen = optionen || {};
  const maskieren = optionen.maskieren !== false;
  const regel = optionen.regel || 'strict';
  const fehlend = [];

  const ergebnis = String(text || '').replace(PLATZHALTER_RE, (treffer, name, ersatz) => {
    let wert = werte ? werte[name] : undefined;

    if (wert === undefined || wert === null || String(wert).trim() === '') {
      if (ersatz !== undefined) {
        wert = ersatz;
      } else {
        fehlend.push(name);
        if (regel === 'strict') return treffer;   /* bleibt stehen, der Aufrufer bricht ab */
        wert = '';
      }
    }

    return maskieren ? maskiereHtml(wert) : String(wert);
  });

  return { text: ergebnis, fehlend: Array.from(new Set(fehlend)) };
}

/* ---------------------------------------------------- HTML erkennen/bauen */
const HTML_RE = /<(p|div|br|a|table|tr|td|h[1-6]|ul|ol|li|strong|em|b|i|span|img|blockquote|hr)\b[^>]*>/i;
const istHtml = (text) => HTML_RE.test(String(text || ''));

/* Bewusst eng gefasst: nur das, was in einer E-Mail ohnehin nichts verloren
   hat. Kein vollstaendiger Desinfizierer — der Inhalt kommt aus dem eigenen
   CRM, nicht von Fremden. */
function entferneGefaehrliches(html) {
  return String(html || '')
    .replace(/<(script|style|iframe|object|embed|form|base|link|meta)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|object|embed|form|base|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/* HTML-Kommentare raus — aber nicht die bedingten Kommentare, mit denen
   Outlook gesteuert wird ( <!--[if mso]> ). Die tragen Gestaltung. */
function entferneKommentare(html) {
  return String(html || '').replace(/<!--([\s\S]*?)-->/g, (ganz, inhalt) =>
    (/^\s*\[if\b/i.test(inhalt) || /<!\[endif\]/i.test(ganz) ? ganz : ''));
}

const URL_RE = /\b(https?:\/\/[^\s<>"')]+)/g;

/** Aus Klartext wird ordentliches HTML: Absaetze, Umbrueche, klickbare Links. */
function textZuHtml(text) {
  const absaetze = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/);

  return absaetze
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => '<p>' + maskiereHtml(a)
      .replace(/\n/g, '<br>')
      .replace(URL_RE, '<a href="$1">$1</a>') + '</p>')
    .join('\n');
}

/** Und zurueck — fuer den Nur-Text-Teil, den jede Mail mitbringen sollte. */
function htmlZuText(html) {
  let t = String(html || '');

  t = entferneKommentare(t);
  t = t.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|tr|h[1-6]|blockquote)\s*>/gi, '\n\n');
  t = t.replace(/<li\b[^>]*>/gi, '\n  • ');
  t = t.replace(/<\/(ul|ol)\s*>/gi, '\n');
  t = t.replace(/<hr\s*\/?>/gi, '\n' + '-'.repeat(40) + '\n');

  /* Ein Link ohne sichtbare Adresse ist im Nur-Text-Teil wertlos. */
  t = t.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, beschriftung) => {
    const sichtbar = beschriftung.replace(/<[^>]+>/g, '').trim();
    if (!sichtbar) return url;
    if (sichtbar === url || url.indexOf('mailto:') === 0) return sichtbar;
    return sichtbar + ' (' + url + ')';
  });

  t = t.replace(/<[^>]+>/g, '');
  t = entmaskiereHtml(t);
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/ *\n */g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');

  return t.trim();
}

/* --------------------------------------------------------- Zeitangaben */
function formatiereDatum(ms, zeitzone, gebietsschema) {
  return new Intl.DateTimeFormat(gebietsschema || 'de-DE', {
    timeZone: zeitzone || 'Europe/Berlin',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(ms));
}

function formatiereUhrzeit(ms, zeitzone, gebietsschema) {
  const z = new Intl.DateTimeFormat(gebietsschema || 'de-DE', {
    timeZone: zeitzone || 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(ms));
  return z + ' Uhr';
}

/* ------------------------------------------------------------ Zusammenbau */
/**
 * Baut Betreff, HTML-Teil und Text-Teil.
 *
 * @param {object} e
 *   betreff, rumpf     Rohtexte aus HubSpot
 *   werte              Platzhalterwerte
 *   signatur           HTML der Signatur (oder '')
 *   rahmen             HTML-Geruest mit {{content}} (oder '')
 *   regel              'strict' | 'blank'
 * @returns {{betreff:string, html:string, text:string, fehlend:string[]}}
 */
function baueMail(e) {
  const regel = e.regel || 'strict';
  const werte = e.werte || {};
  const fehlend = [];

  const sammle = (r) => { for (const n of r.fehlend) fehlend.push(n); return r.text; };

  /* Betreff ist Klartext — dort wird nicht maskiert. */
  const betreff = sammle(rendere(e.betreff, werte, { maskieren: false, regel: regel }));

  /* Der Rumpf wird zweimal gerendert: einmal maskiert fuer HTML, einmal roh
     fuer den Textteil. Nur so steht in beiden Teilen derselbe Wert richtig. */
  const rumpfRoh = String(e.rumpf || '');
  const alsHtmlQuelle = istHtml(rumpfRoh);

  const rumpfHtml = sammle(rendere(rumpfRoh, werte, { maskieren: alsHtmlQuelle, regel: regel }));
  const rumpfText = rendere(rumpfRoh, werte, { maskieren: false, regel: regel }).text;

  const inhaltHtml = alsHtmlQuelle
    ? entferneGefaehrliches(rumpfHtml)
    : textZuHtml(rumpfHtml);

  /* Signatur und Geruest werden immer mit 'blank' gerendert und ihre
     fehlenden Werte NICHT gesammelt: Ein leerer Platzhalter in der Signatur
     ist ein Schoenheitsfehler, aber kein Grund, eine Mail nicht zu senden.
     Gesammelt wird nur, was aus Betreff und Mailtext stammt. */
  const signaturHtml = e.signatur
    ? rendere(e.signatur, werte, { maskieren: true, regel: 'blank' }).text
    : '';

  const koerper = inhaltHtml + (signaturHtml ? '\n' + signaturHtml : '');

  let html;
  if (e.rahmen) {
    /* Reihenfolge ist hier entscheidend: Erst {{content}} ersetzen, dann die
       uebrigen Platzhalter rendern. Andersherum wuerde {{content}} selbst als
       Platzhalter ohne Wert gelten, geleert — und der ganze Mailtext landete
       hinter </html>, wo ihn kein Programm mehr anzeigt. */
    const mitInhalt = e.rahmen.indexOf('{{content}}') !== -1
      ? e.rahmen.split('{{content}}').join(koerper)
      : e.rahmen + koerper;
    html = rendere(mitInhalt, werte, { maskieren: true, regel: 'blank' }).text;
  } else {
    html = koerper;
  }

  /* Der Nur-Text-Teil entsteht aus demselben Material, damit beide Fassungen
     wirklich dasselbe sagen — nur eben ohne Auszeichnung. */
  const text = htmlZuText(
    (alsHtmlQuelle ? entferneGefaehrliches(rumpfText) : maskiereHtml(rumpfText).replace(/\n/g, '<br>')) +
    (signaturHtml ? '<hr>' + signaturHtml : '')
  );

  return {
    betreff: betreff,
    html: html,
    text: text,
    fehlend: Array.from(new Set(fehlend))
  };
}

module.exports = {
  baueMail, rendere, entferneKommentare, sammlePlatzhalter, maskiereHtml, entmaskiereHtml,
  textZuHtml, htmlZuText, istHtml, entferneGefaehrliches,
  formatiereDatum, formatiereUhrzeit, PLATZHALTER_RE
};
