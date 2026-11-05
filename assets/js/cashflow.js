/* ==========================================================================
   finanz-medizin.com — Cashflow-Rechner (cashflow-rechner.html)

   Ablauf
     1. Begrüßung: weitermachen (lokal gesichert), Datei laden oder neu.
     2. Rechner: Eingaben, Auswertung, Datei speichern, Bericht drucken.
     Es gibt keinen Server-Aufruf und keinen Zugangsschutz.

   Datenhaltung
     - Automatisch: localStorage, nur auf diesem Gerät.
     - Dauerhaft und übertragbar: JSON-Datei, die der Kunde selbst speichert
       und später wieder hochlädt (Format "finanz-medizin/cashflow", v1).
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     Stammdaten
     --------------------------------------------------------------------- */
  var TURNUS = [
    { id: 'monatlich', label: 'monatlich', faktor: 12 },
    { id: 'vierteljaehrlich', label: 'quartalsweise', faktor: 4 },
    { id: 'halbjaehrlich', label: 'halbjährlich', faktor: 2 },
    { id: 'jaehrlich', label: 'jährlich', faktor: 1 }
  ];
  var FAKTOR = {};
  TURNUS.forEach(function (t) { FAKTOR[t.id] = t.faktor; });

  var ARTEN = {
    fix: 'Fixkosten',
    variabel: 'Variable Kosten',
    sparen: 'Sparen & Vorsorge'
  };

  var M = 'monatlich', J = 'jaehrlich', Q = 'vierteljaehrlich';

  /* Jede Position: [id, Bezeichnung, Turnus, Art, Hinweis] */
  var BEREICHE = [
    { id: 'einnahmen', titel: 'Einnahmen', typ: 'ein',
      text: 'Netto, also das, was tatsächlich auf dem Konto ankommt.',
      posten: [
        ['netto', 'Nettogehalt', M, null, ''],
        ['netto-partner', 'Nettogehalt Partner/in', M, null, ''],
        ['entnahme', 'Gewinnentnahme Praxis', M, null, 'für Selbstständige, nach Steuern'],
        ['sonderzahlung', 'Urlaubs- und Weihnachtsgeld', J, null, 'netto'],
        ['bonus', 'Bonus oder Prämie', J, null, 'netto'],
        ['dienste', 'Dienste, Vertretungen, Honorare', M, null, 'z. B. Notdienst, Gutachten'],
        ['neben', 'Sonstige Nebentätigkeit', M, null, ''],
        ['kindergeld', 'Kindergeld', M, null, ''],
        ['elterngeld', 'Elterngeld', M, null, ''],
        ['miete-ein', 'Mieteinnahmen', M, null, 'kalt'],
        ['kapital', 'Zinsen und Dividenden', J, null, 'nach Abgeltungsteuer'],
        ['unterhalt-ein', 'Unterhalt (erhalten)', M, null, '']
      ] },
    { id: 'wohnen', titel: 'Wohnen', typ: 'aus', posten: [
        ['miete', 'Miete (warm) oder Kreditrate Eigenheim', M, 'fix', ''],
        ['nebenkosten', 'Nebenkosten bzw. Hausgeld', M, 'fix', 'falls nicht in der Warmmiete'],
        ['strom', 'Strom', M, 'fix', ''],
        ['heizung', 'Heizung oder Gas', M, 'fix', 'falls separat'],
        ['internet', 'Internet und Festnetz', M, 'fix', ''],
        ['rundfunk', 'Rundfunkbeitrag', Q, 'fix', ''],
        ['grundsteuer', 'Grundsteuer', Q, 'fix', 'nur bei Eigentum'],
        ['instandhaltung', 'Instandhaltungsrücklage', M, 'fix', 'nur bei Eigentum']
      ] },
    { id: 'versicherungen', titel: 'Versicherungen', typ: 'aus', posten: [
        ['kv', 'Krankenversicherung (Eigenanteil)', M, 'fix', 'falls nicht vom Gehalt abgezogen'],
        ['bu', 'Berufsunfähigkeitsversicherung', M, 'fix', ''],
        ['haftpflicht', 'Privathaftpflicht', J, 'fix', ''],
        ['hausrat', 'Hausratversicherung', J, 'fix', ''],
        ['gebaeude', 'Wohngebäudeversicherung', J, 'fix', 'nur bei Eigentum'],
        ['risiko-lv', 'Risikolebensversicherung', M, 'fix', ''],
        ['rechtsschutz', 'Rechtsschutzversicherung', J, 'fix', ''],
        ['zusatz', 'Zahn- oder Krankenzusatz', M, 'fix', ''],
        ['unfall', 'Unfallversicherung', J, 'fix', '']
      ] },
    { id: 'mobilitaet', titel: 'Mobilität', typ: 'aus', posten: [
        ['auto-rate', 'Kreditrate oder Leasing Auto', M, 'fix', ''],
        ['kfz-vers', 'Kfz-Versicherung', J, 'fix', ''],
        ['kfz-steuer', 'Kfz-Steuer', J, 'fix', ''],
        ['tanken', 'Tanken oder Laden', M, 'variabel', ''],
        ['wartung', 'Wartung, Reparaturen, TÜV', J, 'variabel', ''],
        ['oepnv', 'ÖPNV oder Deutschlandticket', M, 'fix', ''],
        ['parken', 'Parken, Taxi, Carsharing', M, 'variabel', '']
      ] },
    { id: 'leben', titel: 'Lebenshaltung', typ: 'aus', posten: [
        ['lebensmittel', 'Lebensmittel und Haushalt', M, 'variabel', ''],
        ['drogerie', 'Drogerie und Körperpflege', M, 'variabel', ''],
        ['kleidung', 'Kleidung und Schuhe', M, 'variabel', ''],
        ['gesundheit', 'Gesundheit, Apotheke, Zuzahlungen', M, 'variabel', ''],
        ['friseur', 'Friseur', M, 'variabel', ''],
        ['handy', 'Handyvertrag', M, 'fix', '']
      ] },
    { id: 'kinder', titel: 'Kinder', typ: 'aus', posten: [
        ['kita', 'Kita, Schule, Betreuung', M, 'fix', ''],
        ['vereine', 'Vereine, Musikunterricht, Nachhilfe', M, 'fix', ''],
        ['taschengeld', 'Taschengeld', M, 'fix', ''],
        ['kinderbedarf', 'Kinderbedarf und Spielzeug', M, 'variabel', '']
      ] },
    { id: 'beruf', titel: 'Beruf', typ: 'aus', posten: [
        ['versorgungswerk', 'Versorgungswerk oder Rentenversicherung', M, 'fix', 'nur falls selbst gezahlt'],
        ['kammer', 'Kammerbeitrag', J, 'fix', ''],
        ['berufshaftpflicht', 'Berufshaftpflicht', J, 'fix', ''],
        ['verband', 'Berufsverband und Fachliteratur', J, 'fix', ''],
        ['fortbildung', 'Fortbildungen und Kongresse', J, 'variabel', '']
      ] },
    { id: 'freizeit', titel: 'Freizeit', typ: 'aus', posten: [
        ['restaurant', 'Restaurant, Lieferdienste, Ausgehen', M, 'variabel', ''],
        ['abos', 'Streaming und Abos', M, 'fix', ''],
        ['sport', 'Fitnessstudio und Sport', M, 'fix', ''],
        ['hobbys', 'Hobbys', M, 'variabel', ''],
        ['urlaub', 'Urlaub und Reisen', J, 'variabel', ''],
        ['geschenke', 'Geschenke und Feiertage', J, 'variabel', ''],
        ['haustier', 'Haustier', M, 'variabel', '']
      ] },
    { id: 'kredite', titel: 'Kredite und Verpflichtungen', typ: 'aus', posten: [
        ['ratenkredit', 'Ratenkredit', M, 'fix', ''],
        ['kreditkarte', 'Kreditkarte (Rückzahlung)', M, 'fix', ''],
        ['studienkredit', 'Studienkredit oder BAföG', M, 'fix', ''],
        ['unterhalt-aus', 'Unterhalt (gezahlt)', M, 'fix', '']
      ] },
    { id: 'sparen', titel: 'Sparen und Vorsorge', typ: 'aus', posten: [
        ['notgroschen', 'Notgroschen (Tagesgeld)', M, 'sparen', ''],
        ['etf', 'ETF- oder Fondssparplan', M, 'sparen', ''],
        ['private-rente', 'Private Altersvorsorge', M, 'sparen', 'Rürup, Riester, private Rente'],
        ['bav', 'Betriebliche Altersvorsorge (Eigenanteil)', M, 'sparen', 'nur falls nicht vom Gehalt abgezogen'],
        ['bauspar', 'Bausparvertrag', M, 'sparen', ''],
        ['sondertilgung', 'Sondertilgung Immobilie', J, 'sparen', ''],
        ['kinder-sparen', 'Sparen für Kinder', M, 'sparen', '']
      ] },
    { id: 'sonstiges', titel: 'Sonstiges', typ: 'aus', posten: [
        ['spenden', 'Spenden und Mitgliedschaften', M, 'variabel', ''],
        ['steuerberatung', 'Steuerberatung oder Lohnsteuerhilfe', J, 'fix', ''],
        ['konto', 'Kontoführungsgebühren', M, 'fix', ''],
        ['unvorhergesehen', 'Unvorhergesehenes', M, 'variabel', '']
      ] }
  ];

  var STANDARD = {};      // id -> { bereich, label, turnus, art, hinweis }
  BEREICHE.forEach(function (b) {
    b.posten.forEach(function (p) {
      STANDARD[p[0]] = { bereich: b.id, label: p[1], turnus: p[2], art: p[3], hinweis: p[4] };
    });
  });

  var FORMAT = 'finanz-medizin/cashflow';
  var VERSION = 1;

  /* ---------------------------------------------------------------------
     Zustand
     --------------------------------------------------------------------- */
  var zugang = { id: 'offen', name: '' };   // ein Gerät, ein Stand
  var zeitraum = 1;           // 1 = Monat, 12 = Jahr
  var ungesichert = false;    // Änderungen seit der letzten Datei-Sicherung
  var state = leererZustand();

  function leererZustand() {
    return { werte: {}, eigene: [], reserve: { aktuell: null, monate: 3 }, dateiGespeichert: null };
  }

  /* ---------------------------------------------------------------------
     Hilfen
     --------------------------------------------------------------------- */
  var $ = function (sel, wurzel) { return (wurzel || document).querySelector(sel); };
  var $$ = function (sel, wurzel) { return Array.prototype.slice.call((wurzel || document).querySelectorAll(sel)); };

  function speicherLesen(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function speicherSchreiben(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function speicherLoeschen(k) { try { window.localStorage.removeItem(k); } catch (e) { /* egal */ } }

  var EUR0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  var EUR2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  var PROZ = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });

  function euro(n) { return EUR0.format(Math.round(n || 0)).replace(/ /g, ' '); }
  function prozent(n) { return PROZ.format(n || 0).replace(/ /g, ' '); }

  /* Liest deutsche und englische Schreibweisen: 1.234,56 · 1234,5 · 1234.56 */
  function zahlLesen(text) {
    var s = String(text == null ? '' : text).replace(/[€\s ]/g, '');
    if (!s) return null;
    if (s.indexOf(',') !== -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }
  function zahlZeigen(n) {
    if (n == null) return '';
    return n % 1 === 0 ? ZAHL.format(n) : EUR2.format(n);
  }

  function monatlich(betrag, turnus) {
    if (!betrag) return 0;
    return betrag * (FAKTOR[turnus] || 12) / 12;
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function neueId() { return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var toastTimer;
  function toast(text, art) {
    var el = $('[data-toast]');
    el.textContent = text;
    el.className = 'cf-toast' + (art ? ' cf-toast--' + art : '');
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('ist-sichtbar'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('ist-sichtbar');
      setTimeout(function () { el.hidden = true; }, 300);
    }, 3600);
  }

  function zeige(ansicht) {
    $$('section[data-ansicht]').forEach(function (s) { s.hidden = s.getAttribute('data-ansicht') !== ansicht; });
    $$('[data-nur-app]').forEach(function (el) { el.hidden = ansicht !== 'app'; });
    document.body.setAttribute('data-modus', ansicht);
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------------
     Begrüßung
     --------------------------------------------------------------------- */
  function lokalerSchluessel() { return 'fm-cf-daten:' + zugang.id; }

  function begruessung() {
    document.title = 'Cashflow-Rechner · Finanz-Medizin';

    var lokal = ladeLokal();
    var knopf = $('[data-aktion="fortsetzen"]');
    if (lokal && zaehleEintraege(lokal) > 0) {
      knopf.hidden = false;
      var stand = lokal.geaendert ? new Date(lokal.geaendert) : null;
      $('[data-fortsetzen-text]').textContent = zaehleEintraege(lokal) + ' Angaben, zuletzt bearbeitet ' +
        (stand ? stand.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) + ' um ' +
          stand.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'auf diesem Gerät') + '.';
    } else {
      knopf.hidden = true;
    }
    zeige('start');
  }

  function zaehleEintraege(s) {
    var n = 0;
    Object.keys(s.werte || {}).forEach(function (k) { if (s.werte[k] && s.werte[k].betrag) n++; });
    (s.eigene || []).forEach(function (p) { if (p.betrag) n++; });
    return n;
  }

  function ladeLokal() {
    var roh = speicherLesen(lokalerSchluessel());
    if (!roh) return null;
    try { return normalisiere(JSON.parse(roh)); } catch (e) { return null; }
  }

  function sichereLokal() {
    state.geaendert = new Date().toISOString();
    speicherSchreiben(lokalerSchluessel(), JSON.stringify(state));
  }

  /* ---------------------------------------------------------------------
     3. Datei
     --------------------------------------------------------------------- */
  function alsDatei() {
    var posten = [];
    Object.keys(STANDARD).forEach(function (id) {
      var w = state.werte[id];
      if (!w || (w.betrag == null && w.turnus === STANDARD[id].turnus)) return;
      posten.push({ id: id, bereich: STANDARD[id].bereich, bezeichnung: STANDARD[id].label,
        betrag: w.betrag, turnus: w.turnus });
    });
    state.eigene.forEach(function (p) {
      posten.push({ id: p.id, bereich: p.bereich, bezeichnung: p.label, betrag: p.betrag,
        turnus: p.turnus, art: p.art, eigen: true });
    });
    return {
      format: FORMAT,
      version: VERSION,
      erstelltFuer: zugang ? zugang.name : '',
      gespeichert: new Date().toISOString(),
      posten: posten,
      reserve: state.reserve
    };
  }

  /* Bringt Datei- oder Speicherinhalt in den internen Zustand. */
  function normalisiere(d) {
    var s = leererZustand();
    if (!d || typeof d !== 'object') return s;

    if (Array.isArray(d.posten)) {             // Dateiformat
      d.posten.forEach(function (p) {
        if (!p || typeof p !== 'object') return;
        var turnus = FAKTOR[p.turnus] ? p.turnus : M;
        var betrag = typeof p.betrag === 'number' && p.betrag >= 0 ? p.betrag : null;
        if (p.eigen) {
          var bereich = BEREICHE.some(function (b) { return b.id === p.bereich; }) ? p.bereich : 'sonstiges';
          s.eigene.push({ id: String(p.id || neueId()).slice(0, 40), bereich: bereich,
            label: String(p.bezeichnung || '').slice(0, 80), betrag: betrag, turnus: turnus,
            art: ARTEN[p.art] ? p.art : 'variabel' });
        } else if (STANDARD[p.id]) {
          s.werte[p.id] = { betrag: betrag, turnus: turnus };
        }
      });
    } else {                                    // interner Speicherstand
      Object.keys(d.werte || {}).forEach(function (id) {
        var w = d.werte[id];
        if (!STANDARD[id] || !w) return;
        s.werte[id] = { betrag: typeof w.betrag === 'number' ? w.betrag : null, turnus: FAKTOR[w.turnus] ? w.turnus : STANDARD[id].turnus };
      });
      (d.eigene || []).forEach(function (p) {
        if (!p || !p.id) return;
        s.eigene.push({ id: p.id, bereich: p.bereich || 'sonstiges', label: String(p.label || ''),
          betrag: typeof p.betrag === 'number' ? p.betrag : null,
          turnus: FAKTOR[p.turnus] ? p.turnus : M, art: ARTEN[p.art] ? p.art : 'variabel' });
      });
      s.geaendert = d.geaendert || null;
      s.dateiGespeichert = d.dateiGespeichert || null;
    }
    if (d.reserve) {
      s.reserve.aktuell = typeof d.reserve.aktuell === 'number' ? d.reserve.aktuell : null;
      s.reserve.monate = [3, 4, 6, 9, 12].indexOf(Number(d.reserve.monate)) !== -1 ? Number(d.reserve.monate) : 3;
    }
    return s;
  }

  function dateiname() {
    var name = (zugang ? zugang.name : 'Cashflow')
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var d = new Date();
    var datum = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return 'Cashflow_' + (name || 'Finanz-Medizin') + '_' + datum + '.json';
  }

  function speichereDatei() {
    var blob = new Blob([JSON.stringify(alsDatei(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = dateiname();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    state.dateiGespeichert = new Date().toISOString();
    setzeUngesichert(false);
    sichereLokal();
    toast('Gespeichert als „' + a.download + '“. Bewahren Sie die Datei gut auf.', 'ok');
  }

  function ladeDatei(datei) {
    if (!datei) return;
    if (datei.size > 2 * 1024 * 1024) { toast('Diese Datei ist zu groß für einen Cashflow-Stand.', 'fehler'); return; }
    var leser = new FileReader();
    leser.onload = function () {
      var d;
      try { d = JSON.parse(leser.result); } catch (e) { d = null; }
      if (!d || d.format !== FORMAT) {
        toast('Diese Datei stammt nicht aus dem Cashflow-Rechner.', 'fehler');
        return;
      }
      if (d.version > VERSION) {
        toast('Diese Datei wurde mit einer neueren Fassung erstellt. Bitte laden Sie die Seite neu.', 'fehler');
        return;
      }
      if (document.body.getAttribute('data-modus') === 'app' && zaehleEintraege(state) > 0 &&
          !window.confirm('Die aktuellen Angaben werden durch die Datei ersetzt. Fortfahren?')) {
        return;
      }
      state = normalisiere(d);
      state.dateiGespeichert = d.gespeichert || null;
      starteApp();
      setzeUngesichert(false);
      sichereLokal();
      var wann = d.gespeichert ? new Date(d.gespeichert).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      toast('Ihr Stand' + (wann ? ' vom ' + wann : '') + ' ist geladen.', 'ok');
    };
    leser.onerror = function () { toast('Die Datei konnte nicht gelesen werden.', 'fehler'); };
    leser.readAsText(datei);
  }

  var dateiFeld = $('[data-datei]');
  dateiFeld.addEventListener('change', function () {
    ladeDatei(dateiFeld.files && dateiFeld.files[0]);
    dateiFeld.value = '';
  });

  /* Ziehen und Ablegen: überall auf der Seite. */
  var ziehZaehler = 0;
  function istDateiZug(e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
  }
  document.addEventListener('dragenter', function (e) {
    if (!zugang || !istDateiZug(e)) return;
    e.preventDefault();
    ziehZaehler++;
    $('[data-overlay]').hidden = false;
  });
  document.addEventListener('dragleave', function () {
    if (!zugang) return;
    ziehZaehler = Math.max(0, ziehZaehler - 1);
    if (!ziehZaehler) $('[data-overlay]').hidden = true;
  });
  document.addEventListener('dragover', function (e) { if (zugang && istDateiZug(e)) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (!zugang || !istDateiZug(e)) return;
    e.preventDefault();
    ziehZaehler = 0;
    $('[data-overlay]').hidden = true;
    ladeDatei(e.dataTransfer.files[0]);
  });

  function setzeUngesichert(wert) {
    ungesichert = wert;
    $('[data-ungesichert]').hidden = !wert;
    var st = $('[data-status]');
    if (wert) {
      st.textContent = 'Auf diesem Gerät gesichert';
      st.title = 'Ihre Angaben bleiben in diesem Browser erhalten. Für andere Geräte und als Sicherung: „Speichern“.';
    } else if (state.dateiGespeichert) {
      st.textContent = 'Datei aktuell';
      st.title = '';
    } else {
      st.textContent = '';
    }
  }

  /* ---------------------------------------------------------------------
     4. Rechner aufbauen
     --------------------------------------------------------------------- */
  var turnusOptionen = TURNUS.map(function (t) {
    return '<option value="' + t.id + '">' + t.label + '</option>';
  }).join('');
  var artOptionen = Object.keys(ARTEN).map(function (k) {
    return '<option value="' + k + '">' + ARTEN[k] + '</option>';
  }).join('');

  function zeileHtml(p, eigen, typ) {
    var id = esc(p.id);
    var art = (eigen && typ === 'aus')
      ? '<select class="cf-art" data-feld="art" aria-label="Art der Ausgabe">' + artOptionen + '</select>' : '';
    var kopf = eigen
      ? '<div class="cf-zeile__name"><input class="cf-eigen-name" type="text" maxlength="80" placeholder="Bezeichnung eingeben" value="' + esc(p.label) + '" data-feld="label" aria-label="Bezeichnung">' + art + '</div>'
      : '<div class="cf-zeile__name"><span>' + esc(p.label) + '</span>' + (p.hinweis ? '<small>' + esc(p.hinweis) + '</small>' : '') + '</div>';
    var weg = eigen
      ? '<button class="cf-weg-x" type="button" data-entfernen aria-label="Position entfernen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>' : '';
    return '<div class="cf-zeile' + (eigen ? ' cf-zeile--eigen' : '') + '" data-id="' + id + '"' + (eigen ? ' data-eigen' : '') + '>' +
      kopf +
      '<div class="cf-zeile__felder">' +
        '<label class="cf-betrag"><input type="text" inputmode="decimal" autocomplete="off" placeholder="0" data-feld="betrag" aria-label="Betrag in Euro: ' + esc(p.label || 'eigene Position') + '"><i>€</i></label>' +
        '<select class="cf-turnus" data-feld="turnus" aria-label="Turnus">' + turnusOptionen + '</select>' +
        '<output class="cf-zeile__monat" data-monat>–</output>' +
        weg +
      '</div>' +
    '</div>';
  }

  function baueBereiche() {
    var html = BEREICHE.map(function (b, i) {
      var zeilen = b.posten.map(function (p) {
        return zeileHtml({ id: p[0], label: p[1], hinweis: p[4] }, false, b.typ);
      }).join('');
      return '<section class="cf-bereich' + (b.typ === 'ein' ? ' cf-bereich--ein' : '') + '" id="bereich-' + b.id + '" data-bereich="' + b.id + '">' +
        '<button class="cf-bereich__kopf" type="button" aria-expanded="' + (i < 2 ? 'true' : 'false') + '" data-umschalten>' +
          '<span class="cf-bereich__nr">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="cf-bereich__titel">' + esc(b.titel) + (b.text ? '<small>' + esc(b.text) + '</small>' : '') + '</span>' +
          '<span class="cf-bereich__summe" data-bereich-summe>–</span>' +
          '<svg class="cf-bereich__pfeil" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>' +
        '</button>' +
        '<div class="cf-bereich__inhalt">' +
          '<div class="cf-bereich__spalten" aria-hidden="true"><span>Position</span><div class="cf-bereich__spalten-felder"><span>Betrag</span><span>Turnus</span><span>pro Monat</span><span></span></div></div>' +
          zeilen +
          '<div data-eigene-liste></div>' +
          '<button class="cf-plus" type="button" data-plus><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>Eigene Position hinzufügen</button>' +
        '</div>' +
      '</section>';
    }).join('');
    $('[data-bereiche]').innerHTML = html;

    $('[data-sprung]').innerHTML = BEREICHE.map(function (b) {
      return '<a href="#bereich-' + b.id + '" data-sprung-zu="' + b.id + '">' + esc(b.titel.replace(' und Verpflichtungen', '').replace(' und Vorsorge', '')) + '</a>';
    }).join('');
  }

  function zeichneEigene() {
    BEREICHE.forEach(function (b) {
      var liste = $('[data-bereich="' + b.id + '"] [data-eigene-liste]');
      liste.innerHTML = state.eigene.filter(function (p) { return p.bereich === b.id; })
        .map(function (p) { return zeileHtml(p, true, b.typ); }).join('');
    });
  }

  /* Werte aus dem Zustand in die Felder schreiben. */
  function fuelleFelder() {
    $$('.cf-zeile').forEach(function (z) {
      var id = z.getAttribute('data-id');
      var eigen = z.hasAttribute('data-eigen');
      var p = eigen ? findeEigene(id) : (state.werte[id] || { betrag: null, turnus: STANDARD[id].turnus });
      if (!p) return;
      $('[data-feld="betrag"]', z).value = zahlZeigen(p.betrag);
      $('[data-feld="turnus"]', z).value = p.turnus;
      var art = $('[data-feld="art"]', z);
      if (art) art.value = p.art;
    });
    $('[data-reserve="aktuell"]').value = zahlZeigen(state.reserve.aktuell);
    $('[data-reserve="monate"]').value = String(state.reserve.monate);
  }

  function findeEigene(id) {
    for (var i = 0; i < state.eigene.length; i++) if (state.eigene[i].id === id) return state.eigene[i];
    return null;
  }

  function starteApp() {
    zeichneEigene();
    fuelleFelder();
    rechne();
    zeige('app');
  }

  /* ---------------------------------------------------------------------
     5. Eingaben
     --------------------------------------------------------------------- */
  var bereicheEl = $('[data-bereiche]');

  /* Textfelder melden sich über "input", Auswahllisten über "change".
     So wird jede Änderung genau einmal verarbeitet, in allen Browsern. */
  bereicheEl.addEventListener('input', function (e) {
    if (e.target.tagName !== 'SELECT') feldGeaendert(e);
  });
  bereicheEl.addEventListener('change', function (e) {
    if (e.target.tagName === 'SELECT') feldGeaendert(e);
  });

  function feldGeaendert(e) {
    var feld = e.target.getAttribute('data-feld');
    var z = e.target.closest('.cf-zeile');
    if (!feld || !z) return;
    var id = z.getAttribute('data-id');
    var eigen = z.hasAttribute('data-eigen');
    var p;
    if (eigen) {
      p = findeEigene(id);
    } else {
      p = state.werte[id] || (state.werte[id] = { betrag: null, turnus: STANDARD[id].turnus });
    }
    if (!p) return;
    if (feld === 'betrag') {
      p.betrag = zahlLesen(e.target.value);
      e.target.setAttribute('aria-invalid', e.target.value.trim() && p.betrag == null ? 'true' : 'false');
    } else if (feld === 'turnus' || feld === 'art' || feld === 'label') {
      p[feld] = e.target.value;
    }
    geaendert();
  }

  bereicheEl.addEventListener('blur', function (e) {
    if (e.target.getAttribute('data-feld') !== 'betrag') return;
    var n = zahlLesen(e.target.value);
    if (n != null) e.target.value = zahlZeigen(n);
  }, true);

  bereicheEl.addEventListener('click', function (e) {
    var kopf = e.target.closest('[data-umschalten]');
    if (kopf) {
      kopf.setAttribute('aria-expanded', kopf.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
      return;
    }
    var plus = e.target.closest('[data-plus]');
    if (plus) {
      var bereich = plus.closest('[data-bereich]').getAttribute('data-bereich');
      var p = { id: neueId(), bereich: bereich, label: '', betrag: null, turnus: M, art: 'variabel' };
      state.eigene.push(p);
      var liste = $('[data-bereich="' + bereich + '"] [data-eigene-liste]');
      var typ = bereich === 'einnahmen' ? 'ein' : 'aus';
      liste.insertAdjacentHTML('beforeend', zeileHtml(p, true, typ));
      var neu = liste.lastElementChild;
      $('[data-feld="turnus"]', neu).value = M;
      var art = $('[data-feld="art"]', neu);
      if (art) art.value = 'variabel';
      $('[data-feld="label"]', neu).focus();
      geaendert();
      return;
    }
    var weg = e.target.closest('[data-entfernen]');
    if (weg) {
      var z = weg.closest('.cf-zeile');
      var id = z.getAttribute('data-id');
      state.eigene = state.eigene.filter(function (x) { return x.id !== id; });
      z.remove();
      geaendert();
    }
  });

  $('[data-sprung]').addEventListener('click', function (e) {
    var a = e.target.closest('[data-sprung-zu]');
    if (!a) return;
    var kopf = $('[data-bereich="' + a.getAttribute('data-sprung-zu') + '"] [data-umschalten]');
    kopf.setAttribute('aria-expanded', 'true');
  });

  $('[data-reserve="aktuell"]').addEventListener('input', function (e) {
    state.reserve.aktuell = zahlLesen(e.target.value);
    geaendert();
  });
  $('[data-reserve="aktuell"]').addEventListener('blur', function (e) {
    var n = zahlLesen(e.target.value);
    if (n != null) e.target.value = zahlZeigen(n);
  });
  $('[data-reserve="monate"]').addEventListener('change', function (e) {
    state.reserve.monate = Number(e.target.value) || 3;
    geaendert();
  });

  $$('[data-zeitraum]').forEach(function (b) {
    b.addEventListener('click', function () {
      zeitraum = Number(b.getAttribute('data-zeitraum'));
      $$('[data-zeitraum]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      rechne();
    });
  });

  var sicherTimer;
  function geaendert() {
    rechne();
    setzeUngesichert(true);
    clearTimeout(sicherTimer);
    sicherTimer = setTimeout(sichereLokal, 400);
  }

  /* ---------------------------------------------------------------------
     6. Rechnen und Auswertung
     --------------------------------------------------------------------- */
  function alleposten() {
    var liste = [];
    Object.keys(STANDARD).forEach(function (id) {
      var w = state.werte[id];
      var s = STANDARD[id];
      liste.push({ id: id, bereich: s.bereich, label: s.label, art: s.art,
        betrag: w ? w.betrag : null, turnus: w ? w.turnus : s.turnus });
    });
    state.eigene.forEach(function (p) {
      liste.push({ id: p.id, bereich: p.bereich, label: p.label || 'Eigene Position', art: p.bereich === 'einnahmen' ? null : p.art,
        betrag: p.betrag, turnus: p.turnus, eigen: true });
    });
    liste.forEach(function (p) { p.monat = monatlich(p.betrag, p.turnus); });
    return liste;
  }

  function auswerten() {
    var r = { ein: 0, fix: 0, variabel: 0, sparen: 0, bereiche: {} };
    BEREICHE.forEach(function (b) { r.bereiche[b.id] = 0; });
    alleposten().forEach(function (p) {
      var m = p.monat;
      r.bereiche[p.bereich] = (r.bereiche[p.bereich] || 0) + m;
      if (p.bereich === 'einnahmen') r.ein += m;
      else r[p.art || 'variabel'] += m;
    });
    r.aus = r.fix + r.variabel + r.sparen;
    r.frei = r.ein - r.aus;
    r.quote = r.ein > 0 ? (r.sparen + Math.max(r.frei, 0)) / r.ein : 0;
    r.lebenshaltung = r.fix + r.variabel;
    return r;
  }

  function setze(schluessel, text) {
    $$('[data-out="' + schluessel + '"]').forEach(function (el) { el.textContent = text; });
  }

  function rechne() {
    var r = auswerten();
    var f = zeitraum;

    /* Zeilen und Bereichssummen */
    var posten = {};
    alleposten().forEach(function (p) { posten[p.id] = p; });
    $$('.cf-zeile').forEach(function (z) {
      var p = posten[z.getAttribute('data-id')];
      var m = p ? monatlich(p.betrag, p.turnus) : 0;
      $('[data-monat]', z).textContent = m ? euro(m) : '–';
      z.classList.toggle('hat-wert', !!m);
    });
    BEREICHE.forEach(function (b) {
      var el = $('[data-bereich="' + b.id + '"] [data-bereich-summe]');
      var s = r.bereiche[b.id];
      el.textContent = s ? euro(s) + ' / Monat' : '–';
      el.classList.toggle('hat-wert', !!s);
    });

    /* Kennzahlen */
    setze('ein', euro(r.ein * f));
    setze('aus-ohne-sparen', euro(r.lebenshaltung * f));
    setze('spar', euro(r.sparen * f));
    setze('frei', euro(r.frei * f));
    setze('quote', r.ein > 0 ? prozent(r.quote) : '–');
    var freiKarte = $('[data-kpi-frei]');
    freiKarte.classList.toggle('ist-negativ', r.frei < 0);
    freiKarte.classList.toggle('ist-positiv', r.frei > 0 && r.ein > 0);
    setze('frei-text', r.ein <= 0
      ? 'Tragen Sie zuerst Ihre Einnahmen ein.'
      : r.frei < 0
        ? 'Es fließt mehr ab, als hereinkommt.'
        : r.frei === 0 ? 'Einnahmen und Ausgaben gleichen sich aus.'
          : 'bleibt nach Ausgaben und Sparen übrig');

    zeichneStapel(r);
    zeichneRegel(r);
    zeichneKategorien(r, f);
    zeichneReserve(r);
  }

  function zeichneStapel(r) {
    var basis = Math.max(r.ein, r.aus, 1);
    var teile = [
      { k: 'fix', label: 'Fixkosten', wert: r.fix },
      { k: 'variabel', label: 'Variable Kosten', wert: r.variabel },
      { k: 'sparen', label: 'Sparen & Vorsorge', wert: r.sparen },
      { k: 'frei', label: r.frei < 0 ? 'Fehlbetrag' : 'Frei verfügbar', wert: Math.abs(r.frei) }
    ];
    $('[data-stapel]').innerHTML = teile.map(function (t) {
      var w = (t.wert / (r.frei < 0 ? r.aus : basis)) * 100;
      if (t.k === 'frei' && r.frei < 0) w = 0;
      return '<i class="cf-stapel__' + t.k + '" style="width:' + Math.max(0, w).toFixed(2) + '%"></i>';
    }).join('');
    $('[data-legende]').innerHTML = teile.map(function (t) {
      var anteil = r.ein > 0 ? prozent(t.wert / r.ein) : '–';
      return '<li class="cf-legende__' + t.k + (t.k === 'frei' && r.frei < 0 ? ' ist-negativ' : '') + '">' +
        '<span><i></i>' + t.label + '</span><b>' + euro(t.wert * zeitraum) + '</b><em>' + anteil + '</em></li>';
    }).join('');
  }

  function zeichneRegel(r) {
    var zeilen = [
      { label: 'Fixkosten', ist: r.ein ? r.fix / r.ein : 0, ziel: 0.5, max: true },
      { label: 'Variable Kosten', ist: r.ein ? r.variabel / r.ein : 0, ziel: 0.3, max: true },
      { label: 'Sparen inkl. freiem Betrag', ist: r.quote, ziel: 0.2, max: false }
    ];
    $('[data-regel]').innerHTML = zeilen.map(function (z) {
      var gut = z.max ? z.ist <= z.ziel : z.ist >= z.ziel;
      var status = !r.ein ? '' : (gut ? (z.max ? 'im Rahmen' : 'erreicht') : (z.max ? 'darüber' : 'darunter'));
      return '<div class="cf-regel' + (r.ein ? (gut ? ' ist-gut' : ' ist-hinweis') : '') + '">' +
        '<div class="cf-regel__kopf"><span>' + z.label + '</span><b>' + (r.ein ? prozent(z.ist) : '–') + '</b></div>' +
        '<div class="cf-regel__spur"><i style="width:' + Math.min(100, z.ist * 100).toFixed(1) + '%"></i>' +
        '<s style="left:' + (z.ziel * 100) + '%" title="Richtwert"></s></div>' +
        '<div class="cf-regel__fuss"><span>Richtwert ' + (z.max ? 'höchstens ' : 'mindestens ') + prozent(z.ziel) + '</span><em>' + status + '</em></div>' +
      '</div>';
    }).join('');
  }

  function zeichneKategorien(r, f) {
    var liste = BEREICHE.filter(function (b) { return b.typ === 'aus' && r.bereiche[b.id] > 0; })
      .map(function (b) { return { titel: b.titel, wert: r.bereiche[b.id] }; })
      .sort(function (a, b) { return b.wert - a.wert; });
    var max = liste.length ? liste[0].wert : 1;
    $('[data-kategorien]').innerHTML = liste.length
      ? liste.map(function (k) {
          return '<li><div><span>' + esc(k.titel) + '</span><b>' + euro(k.wert * f) + '</b></div>' +
            '<i style="width:' + (k.wert / max * 100).toFixed(1) + '%"></i></li>';
        }).join('')
      : '<li class="cf-leer">Sobald Sie Ausgaben eintragen, erscheint hier die Verteilung.</li>';
  }

  function zeichneReserve(r) {
    var ziel = r.lebenshaltung * state.reserve.monate;
    var aktuell = state.reserve.aktuell || 0;
    setze('lebenshaltung', r.lebenshaltung ? euro(r.lebenshaltung) : '–');
    setze('reserve-ziel', ziel ? euro(ziel) : '–');
    setze('reserve-monate', r.lebenshaltung ? ZAHL.format(Math.round(aktuell / r.lebenshaltung * 10) / 10) + ' Monate' : '–');
    var fehlt = Math.max(0, ziel - aktuell);
    setze('reserve-fehlt', ziel ? (fehlt ? euro(fehlt) : 'Ziel erreicht') : '–');
    var b = $('[data-reserve-balken]');
    b.style.width = (ziel ? Math.min(100, aktuell / ziel * 100) : 0).toFixed(1) + '%';
    b.parentNode.classList.toggle('ist-voll', ziel > 0 && aktuell >= ziel);
  }

  /* ---------------------------------------------------------------------
     7. Bericht (Druck / PDF)
     --------------------------------------------------------------------- */
  function baueBericht() {
    var r = auswerten();
    var posten = alleposten();
    var heute = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

    var bereiche = BEREICHE.map(function (b) {
      var zeilen = posten.filter(function (p) { return p.bereich === b.id && p.monat > 0; });
      if (!zeilen.length) return '';
      return '<h3>' + esc(b.titel) + '</h3><table><thead><tr><th>Position</th><th>Betrag</th><th>Turnus</th><th>pro Monat</th></tr></thead><tbody>' +
        zeilen.map(function (p) {
          var t = TURNUS.filter(function (x) { return x.id === p.turnus; })[0];
          return '<tr><td>' + esc(p.label) + '</td><td>' + EUR2.format(p.betrag) + ' €</td><td>' + (t ? t.label : '') + '</td><td>' + euro(p.monat) + '</td></tr>';
        }).join('') +
        '<tr class="summe"><td colspan="3">Summe</td><td>' + euro(r.bereiche[b.id]) + '</td></tr></tbody></table>';
    }).join('');

    $('[data-bericht]').innerHTML =
      '<header><img src="assets/img/mark-finanz-medizin.png" alt=""><div><p><b>Finanz-Medizin</b> · Cashflow-Analyse</p><h1>Ihr Cashflow</h1><p>Stand ' + heute + '</p></div></header>' +
      '<h2>Überblick pro Monat</h2><table class="kpi"><tbody>' +
        '<tr><td>Einnahmen (netto)</td><td>' + euro(r.ein) + '</td><td></td></tr>' +
        '<tr><td>Fixkosten</td><td>' + euro(r.fix) + '</td><td>' + (r.ein ? prozent(r.fix / r.ein) : '') + '</td></tr>' +
        '<tr><td>Variable Kosten</td><td>' + euro(r.variabel) + '</td><td>' + (r.ein ? prozent(r.variabel / r.ein) : '') + '</td></tr>' +
        '<tr><td>Sparen &amp; Vorsorge</td><td>' + euro(r.sparen) + '</td><td>' + (r.ein ? prozent(r.sparen / r.ein) : '') + '</td></tr>' +
        '<tr class="summe"><td>Frei verfügbar</td><td>' + euro(r.frei) + '</td><td>' + (r.ein ? prozent(r.frei / r.ein) : '') + '</td></tr>' +
        '<tr><td>Sparquote inkl. freiem Betrag</td><td>' + (r.ein ? prozent(r.quote) : '–') + '</td><td></td></tr>' +
        '<tr><td>Notgroschen</td><td>' + euro(state.reserve.aktuell || 0) + '</td><td>Ziel ' + euro(r.lebenshaltung * state.reserve.monate) + '</td></tr>' +
      '</tbody></table>' +
      '<h2>Einzelaufstellung</h2>' + (bereiche || '<p>Noch keine Beträge eingetragen.</p>') +
      '<footer>Finanz-Medizin · We Build Wealth · finanz-medizin.com<br>Der Bericht dient der eigenen Orientierung und ersetzt keine individuelle Beratung.</footer>';
  }
  window.addEventListener('beforeprint', function () { if (zugang) baueBericht(); });

  /* ---------------------------------------------------------------------
     8. Aktionen
     --------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var knopf = e.target.closest('[data-aktion]');
    if (!knopf) return;
    var aktion = knopf.getAttribute('data-aktion');

    if (aktion === 'laden') { dateiFeld.click(); }
    if (aktion === 'speichern') { speichereDatei(); }
    if (aktion === 'bericht') { baueBericht(); window.print(); }
    if (aktion === 'fortsetzen') {
      state = ladeLokal() || leererZustand();
      starteApp();
      setzeUngesichert(!state.dateiGespeichert || (state.geaendert > state.dateiGespeichert));
    }
    if (aktion === 'neu') {
      var lokal = ladeLokal();
      if (lokal && zaehleEintraege(lokal) > 0 &&
          !window.confirm('Ihre bisherigen Angaben auf diesem Gerät werden überschrieben. Sichern Sie sie vorher über „Weitermachen“ und „Speichern“, falls Sie sie noch brauchen. Neu beginnen?')) {
        return;
      }
      state = leererZustand();
      starteApp();
      setzeUngesichert(false);
      $('[data-feld="betrag"]').focus();
    }
  });

  /* Die Ablagefläche auf der Begrüßungsseite reagiert sichtbar auf Dateien. */
  var ablage = $('[data-ablage]');
  ['dragenter', 'dragover'].forEach(function (t) {
    ablage.addEventListener(t, function () { ablage.classList.add('ist-aktiv'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    ablage.addEventListener(t, function () { ablage.classList.remove('ist-aktiv'); });
  });

  /* Strg/Cmd + S speichert die Datei statt der Webseite. */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && document.body.getAttribute('data-modus') === 'app') {
      e.preventDefault();
      speichereDatei();
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (ungesichert && document.body.getAttribute('data-modus') === 'app') {
      sichereLokal();
    }
  });

  /* ---------------------------------------------------------------------
     Start
     --------------------------------------------------------------------- */
  baueBereiche();
  begruessung();
})();
