/* H&H Fondsvergleich – Rechenkern
   Reine Funktionen, keine DOM-Zugriffe. Läuft im Browser (window.FV) und in Node (require).

   Kostenmodell der Police nach Notion „Versicherungs-Tarifvergleich – WBW / finanz-medizin":
   Sparanteil = Beitrag − β·Beitrag − (α-Kosten / 60, nur in Monat 1–60) − Stückkosten/12.
   Guthaben wächst mit (Bruttorendite − γ − TER). Beiträge vorschüssig (Monatsanfang).

   Steuern (Rechtsstand 2026):
   - Depot: Abgeltungsteuer 25 % + Soli 5,5 % (+ KiSt), Teilfreistellung Aktienfonds 30 %
     (§ 20 Abs. 1 InvStG), Vorabpauschale (§ 18 InvStG), Sparerpauschbetrag (§ 20 Abs. 9 EStG).
   - Fondspolice Kapital: Unterschiedsbetrag, davon 15 % steuerfrei bei Aktienfonds
     (§ 20 Abs. 1 Nr. 6 S. 9 EStG); nach 12 Jahren Laufzeit und Auszahlung ab 62 nur die
     Hälfte zum persönlichen Steuersatz (S. 2), sonst Abgeltungsteuer.
   - Fondspolice Rente: Ertragsanteil nach § 22 Nr. 1 S. 3 a) bb) EStG zum persönlichen Satz.
*/
(function (root) {
  "use strict";

  // Ertragsanteil-Tabelle § 22 Nr. 1 Satz 3 Buchstabe a Doppelbuchstabe bb EStG
  // [ab Alter, Prozent] – gilt bis zum nächsten Eintrag
  const ERTRAGSANTEIL = [
    [50, 30], [51, 29], [53, 28], [54, 27], [55, 26], [57, 25], [58, 24], [59, 23],
    [60, 22], [62, 21], [63, 20], [64, 19], [65, 18], [67, 17], [68, 16], [69, 15],
    [71, 14], [72, 13], [74, 12], [75, 11], [76, 10], [78, 9], [80, 8], [81, 7],
    [83, 6], [85, 5], [88, 4], [92, 3], [94, 2], [97, 1]
  ];

  function ertragsanteil(alter) {
    let p = 30;
    for (const [a, v] of ERTRAGSANTEIL) if (alter >= a) p = v;
    return p / 100;
  }

  // Abgeltungsteuer inkl. Soli und ggf. Kirchensteuer (§ 32d Abs. 1 EStG)
  function abgeltungSatz(kist) {
    const k = kist || 0;
    const est = 0.25 / (1 + 0.25 * k);
    return est * (1.055 + k);
  }

  // Persönlicher Satz: Grenzsteuersatz ESt (+ KiSt auf die ESt). Soli entfällt für die
  // meisten Ruheständler (Freigrenze § 3 SolZG) und wird hier bewusst nicht aufgeschlagen.
  function persSatz(grenz, kist) {
    return grenz * (1 + (kist || 0));
  }

  const monthly = (annual) => Math.pow(1 + annual, 1 / 12) - 1;

  /* ---------- Ansparphase ---------- */

  // Beitragsverlauf: Budget je Monat inkl. Dynamik (jährlich, ab Jahr 2)
  function budgetFor(month, p) {
    const year = Math.floor(month / 12);
    return p.beitrag * Math.pow(1 + p.dynamik, year);
  }

  // Fondspolice (Brutto- oder Nettotarif)
  function simPolice(p, t, opts) {
    const o = Object.assign({ ohneKosten: false }, opts);
    const n = p.jahre * 12;
    // α bezieht sich auf die Beitragssumme (inkl. Dynamik-Erhöhungen, vereinfachend auf Basis der Gesamtbeitragssumme)
    let beitragssumme = p.einmal;
    for (let m = 0; m < n; m++) beitragssumme += budgetFor(m, p);

    const honorar = o.ohneKosten ? 0 : (t.honorar || 0);
    const honorarMonate = Math.max(1, t.honorarMonate || 1);
    const alphaGesamt = o.ohneKosten ? 0 : (t.alpha || 0) * beitragssumme;
    const alphaMonate = Math.min(60, n);
    const g = o.ohneKosten ? p.rendite : p.rendite - (t.gamma || 0) - (t.ter || 0);
    const r = monthly(g);

    let V = 0, eingezahlt = 0, zuVersicherer = 0;
    const k = { alpha: 0, beta: 0, stueck: 0, honorar: 0, einmal: 0 };
    const verlauf = [0];

    for (let m = 0; m < n; m++) {
      let b = budgetFor(m, p);
      eingezahlt += b;
      // Honorar beim Nettotarif: aus demselben Budget, die Beitragszahlung an den Versicherer sinkt
      let h = 0;
      if (honorar > 0 && m < honorarMonate) h = Math.min(b, honorar / honorarMonate);
      b -= h; k.honorar += h;
      zuVersicherer += b;
      let spar = b;
      if (!o.ohneKosten) {
        const beta = (t.beta || 0) * b;
        const a = m < alphaMonate ? alphaGesamt / alphaMonate : 0;
        const s = (t.stueck || 0) / 12;
        k.beta += beta; k.alpha += a; k.stueck += s;
        spar -= beta + a + s;
      }
      if (m === 0 && p.einmal > 0) {
        const e = p.einmal;
        eingezahlt += e; zuVersicherer += e;
        const eb = o.ohneKosten ? 0 : (t.betaEinmal != null ? t.betaEinmal : (t.beta || 0)) * e;
        k.einmal += eb;
        spar += e - eb;
      }
      V = (V + spar) * (1 + r);
      if ((m + 1) % 12 === 0) verlauf.push(V);
    }
    return { wert: V, eingezahlt, beitragssumme: zuVersicherer, kosten: k, verlauf };
  }

  // ETF-/Fondsdepot mit Vorabpauschale
  function simDepot(p, d, opts) {
    const o = Object.assign({ ohneKosten: false, ohneSteuer: false }, opts);
    const n = p.jahre * 12;
    const tf = p.aktienfonds ? 0.30 : 0;
    const satz = abgeltungSatz(p.kist);
    const g = o.ohneKosten ? p.rendite : p.rendite - (d.ter || 0);
    const r = monthly(g);

    let V = 0, basis = 0, eingezahlt = 0, vapSumme = 0;
    const k = { order: 0, depot: 0, vapSteuer: 0 };
    const verlauf = [0];
    let jahresStart = 0, jahresEinzahlung = 0, vapBasis = 0;

    for (let m = 0; m < n; m++) {
      const im = m % 12;
      if (im === 0) { jahresStart = V; jahresEinzahlung = 0; vapBasis = V; }
      let b = budgetFor(m, p);
      if (m === 0 && p.einmal > 0) b += p.einmal;
      eingezahlt += b;
      const ord = o.ohneKosten ? 0 : b * (d.order || 0);
      k.order += ord;
      basis += b;                 // Anschaffungskosten inkl. Nebenkosten
      V += b - ord;
      jahresEinzahlung += b - ord;
      // Vorabpauschale: im Laufe des Jahres erworbene Anteile – je vollem Monat vor Erwerb 1/12 weniger
      vapBasis += (b - ord) * (12 - im) / 12;
      V *= 1 + r;

      if (im === 11) {
        if (!o.ohneKosten && d.depotgebuehr) { const f = Math.min(V, d.depotgebuehr); V -= f; k.depot += f; }
        if (!o.ohneSteuer) {
          const zuwachs = Math.max(0, V - jahresStart - jahresEinzahlung);
          const vap = Math.min(vapBasis * p.basiszins * 0.7, zuwachs);
          vapSumme += vap;
          const stpfl = Math.max(0, vap * (1 - tf) - p.sparerpausch);
          const st = stpfl * satz;
          V -= st; k.vapSteuer += st;
        }
        verlauf.push(V);
      }
    }
    return { wert: V, eingezahlt, basis, vapSumme, kosten: k, verlauf };
  }

  /* ---------- Steuer bei Auszahlung ---------- */

  function steuerDepotKapital(p, dep) {
    const tf = p.aktienfonds ? 0.30 : 0;
    const gewinn = Math.max(0, dep.wert - dep.basis - dep.vapSumme);
    const stpfl = Math.max(0, gewinn * (1 - tf) - p.sparerpausch);
    return { gewinn, stpfl, steuer: stpfl * abgeltungSatz(p.kist), regel: "Abgeltungsteuer, Teilfreistellung " + Math.round(tf * 100) + " %" };
  }

  function steuerPoliceKapital(p, pol) {
    const tf = p.aktienfonds ? 0.15 : 0;
    const gewinn = Math.max(0, pol.wert - pol.beitragssumme);
    const hev = p.jahre >= 12 && p.rentenalter >= 62;
    if (hev) {
      const stpfl = gewinn * (1 - tf) * 0.5;
      return { gewinn, stpfl, steuer: stpfl * persSatz(p.grenzRuhe, p.kist), hev, regel: "Halbeinkünfte (12/62), " + Math.round(tf * 100) + " % Teilfreistellung, persönlicher Satz" };
    }
    const stpfl = Math.max(0, gewinn * (1 - tf) - p.sparerpausch);
    return { gewinn, stpfl, steuer: stpfl * abgeltungSatz(p.kist), hev, regel: "Abgeltungsteuer (12/62 nicht erfüllt), " + Math.round(tf * 100) + " % Teilfreistellung" };
  }

  /* ---------- Auszahlphase ---------- */

  // Lebenslange Rente aus dem Rentenfaktor (€ je 10.000 € Kapital), Ertragsanteil-Besteuerung
  function policeRente(p, kapital, rentenfaktor) {
    const brutto = kapital / 10000 * (rentenfaktor || 0);
    const ea = ertragsanteil(p.rentenalter);
    const steuer = brutto * ea * persSatz(p.grenzRuhe, p.kist);
    return { brutto, steuer, netto: brutto - steuer, ertragsanteil: ea };
  }

  // Entnahmeplan aus dem Depot bis zum Planungsalter; Steuer auf den Gewinnanteil jeder Entnahme.
  // Liefert die gleichbleibende Netto-Monatsentnahme (Brutto wird so gewählt, dass das Depot am Ende leer ist).
  function depotEntnahme(p, kapital, basis, bisAlter) {
    const N = Math.max(1, Math.round((bisAlter - p.rentenalter) * 12));
    const r = monthly(p.renditeEntnahme - (p.terEntnahme || 0));
    const tf = p.aktienfonds ? 0.30 : 0;
    const satz = abgeltungSatz(p.kist);
    // Brutto-Annuität vorschüssig
    const W = r === 0 ? kapital / N : kapital * r / (1 - Math.pow(1 + r, -N)) / (1 + r);
    let V = kapital, B = Math.min(basis, kapital), freibetrag = p.sparerpausch, steuerSumme = 0, nettoSumme = 0, ersteJahrNetto = 0;
    for (let m = 0; m < N; m++) {
      if (m % 12 === 0) freibetrag = p.sparerpausch;
      const w = Math.min(W, V);
      const anteilBasis = V > 0 ? B / V : 1;
      const gewinn = w * (1 - anteilBasis);
      B -= w * anteilBasis;
      let stpfl = gewinn * (1 - tf);
      const f = Math.min(freibetrag, stpfl); freibetrag -= f; stpfl -= f;
      const st = Math.max(0, stpfl) * satz;
      steuerSumme += st; nettoSumme += w - st;
      if (m < 12) ersteJahrNetto += w - st;
      V = (V - w) * (1 + r);
    }
    return { brutto: W, nettoMonat: nettoSumme / N, nettoErstesJahr: ersteJahrNetto / Math.min(12, N), steuerSumme, monate: N };
  }

  // Alter, bis zu dem das Depot dieselbe Netto-Monatsrente zahlen kann wie die Police
  function breakEvenAlter(p, depotKapital, depotBasis, zielNetto) {
    if (!(zielNetto > 0)) return null;
    let lo = p.rentenalter + 1, hi = 120;
    if (depotEntnahme(p, depotKapital, depotBasis, hi).nettoMonat > zielNetto) return { alter: hi, plus: true };
    if (depotEntnahme(p, depotKapital, depotBasis, lo).nettoMonat < zielNetto) return { alter: lo, minus: true };
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (depotEntnahme(p, depotKapital, depotBasis, mid).nettoMonat >= zielNetto) lo = mid; else hi = mid;
    }
    return { alter: lo };
  }

  /* ---------- Kennzahlen ---------- */

  // Rendite p. a., mit der die Einzahlungen (gleicher Zahlungsstrom) genau den Endwert erreichen
  function renditeAus(p, endwert, beitragsstrom) {
    const n = p.jahre * 12;
    const fv = (g) => {
      const r = monthly(g); let V = 0;
      for (let m = 0; m < n; m++) V = (V + beitragsstrom(m)) * (1 + r);
      return V;
    };
    let lo = -0.5, hi = 0.5;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (fv(mid) < endwert) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  const strom = (p) => (m) => budgetFor(m, p) + (m === 0 ? p.einmal : 0);

  function berechne(p, depotCfg, tarife) {
    const out = { depot: null, policen: [] };

    // Depot
    const dep = simDepot(p, depotCfg);
    const depOhne = simDepot(p, depotCfg, { ohneKosten: true, ohneSteuer: true });
    const depSt = steuerDepotKapital(p, dep);
    const depNetto = dep.wert - depSt.steuer;
    const depRendite = renditeAus(p, dep.wert, strom(p));
    const depNachSt = renditeAus(p, depNetto, strom(p));
    out.depot = {
      name: depotCfg.name || "ETF-Depot",
      wert: dep.wert, ohneKosten: depOhne.wert, eingezahlt: dep.eingezahlt,
      kosten: dep.kosten, kostenNominal: dep.kosten.order + dep.kosten.depot,
      kostenWirkung: depOhne.wert - dep.wert - dep.kosten.vapSteuer,
      riy: p.rendite - renditeAus(p, simDepot(p, depotCfg, { ohneSteuer: true }).wert, strom(p)),
      steuerAnspar: dep.kosten.vapSteuer, steuerKapital: depSt, netto: depNetto,
      renditeVorSteuer: depRendite, renditeNachSteuer: depNachSt,
      verlauf: dep.verlauf, verlaufOhne: depOhne.verlauf,
      entnahme: depotEntnahme(p, depNetto + depSt.steuer, dep.basis + dep.vapSumme, p.planAlter),
      basis: dep.basis + dep.vapSumme
    };

    for (const t of tarife) {
      const pol = simPolice(p, t);
      const ohne = simPolice(p, t, { ohneKosten: true });
      const st = steuerPoliceKapital(p, pol);
      const netto = pol.wert - st.steuer;
      const kn = pol.kosten.alpha + pol.kosten.beta + pol.kosten.stueck + pol.kosten.honorar + pol.kosten.einmal;
      const rente = policeRente(p, pol.wert, t.rentenfaktor);
      out.policen.push({
        tarif: t, name: t.name,
        wert: pol.wert, ohneKosten: ohne.wert, eingezahlt: pol.eingezahlt, beitragssumme: pol.beitragssumme,
        kosten: pol.kosten, kostenNominal: kn, kostenWirkung: ohne.wert - pol.wert,
        riy: p.rendite - renditeAus(p, pol.wert, strom(p)),
        steuerAnspar: 0, steuerKapital: st, netto,
        renditeVorSteuer: renditeAus(p, pol.wert, strom(p)),
        renditeNachSteuer: renditeAus(p, netto, strom(p)),
        verlauf: pol.verlauf, verlaufOhne: ohne.verlauf,
        rente,
        breakEven: rente.netto > 0 ? breakEvenAlter(p, out.depot.netto + out.depot.steuerKapital.steuer, out.depot.basis, rente.netto) : null
      });
    }
    return out;
  }

  const FV = { berechne, simPolice, simDepot, steuerDepotKapital, steuerPoliceKapital, policeRente, depotEntnahme, breakEvenAlter, ertragsanteil, abgeltungSatz, persSatz, renditeAus, monthly };
  if (typeof module === "object" && module.exports) module.exports = FV; else root.FV = FV;
})(typeof window !== "undefined" ? window : globalThis);
