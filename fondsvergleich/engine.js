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
   - Persönlicher Satz: Tarif § 32a EStG auf der gesetzlichen Rente aufgesetzt, oder manuell.
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

  // Manuell vorgegebener persönlicher Satz: ESt (+ KiSt auf die ESt)
  function persSatz(grenz, kist) {
    return grenz * (1 + (kist || 0));
  }

  const monthly = (annual) => Math.pow(1 + annual, 1 / 12) - 1;

  /* ---------- Einkommensteuer und Ruhestandseinkommen (Rechtsstand 2026) ---------- */

  const STAND = { jahr: 2026, rentenwert: 42.52, durchschnittsentgelt: 51944, bbgRv: 101400, soliFreigrenze: 20350 };

  // Tarif § 32a Abs. 1 EStG 2026, ungerundet (das Gesetz rundet das Ergebnis ab)
  function est(x) {
    if (x <= 12348) return 0;
    if (x <= 17799) { const y = (x - 12348) / 10000; return (914.51 * y + 1400) * y; }
    if (x <= 69878) { const z = (x - 17799) / 10000; return (173.10 * z + 2397) * z + 1034.87; }
    if (x <= 277825) return 0.42 * x - 11135.63;
    return 0.45 * x - 19470.38;
  }

  // ESt + Soli (Freigrenze, Milderungszone § 4 SolZG) + KiSt.
  // Der Tarif wächst mit tarifIndex: Das Einkommen wird auf heutige Werte abgezinst, besteuert und wieder aufgezinst.
  function steuerGesamt(p, zvE, jahreAbHeute) {
    const d = Math.pow(1 + (p.tarifIndex || 0), jahreAbHeute || 0);
    const split = p.verheiratet ? 2 : 1;
    const x = Math.max(0, zvE) / d;
    const e = split * est(x / split);
    const fg = STAND.soliFreigrenze * split;
    const soli = e <= fg ? 0 : Math.min(0.055 * e, 0.119 * (e - fg));
    return (e + soli + e * (p.kist || 0)) * d;
  }

  // Besteuerungsanteil der gesetzlichen Rente nach Rentenbeginn (§ 22 Nr. 1 S. 3 a) aa) EStG): 2026 = 84 %, je Jahr +0,5 %
  const besteuerungsanteil = (jahr) => Math.min(1, 0.84 + 0.005 * (jahr - STAND.jahr));

  // Schätzung der gesetzlichen Rente in heutigen Werten: Entgeltpunkte × Zugangsfaktor × Rentenwert
  function renteSchaetzung(brutto, jahre, rentenalter) {
    const ep = Math.min(brutto, STAND.bbgRv) / STAND.durchschnittsentgelt * jahre;
    const zugang = 1 - Math.max(0, 67 - rentenalter) * 12 * 0.003;
    return ep * zugang * STAND.rentenwert;
  }

  // Jahreswerte im Ruhestand, y = Jahre seit Rentenbeginn. Rentenfreibetrag bleibt nominal fest.
  function ruhestand(p, y) {
    const anp = p.renteAnp || 0, j = p.jahre + y;
    const R0 = (p.rente || 0) * 12 * Math.pow(1 + anp, p.jahre);
    const R = R0 * Math.pow(1 + anp, y);
    const kv = R * (p.kvSatz || 0) + (p.pkv || 0) * 12 * Math.pow(1 + (p.inflation || 0), j);
    const anteil = besteuerungsanteil(STAND.jahr + p.jahre);
    const zvE = Math.max(0, R - R0 * (1 - anteil) - (R > 0 ? 138 : 0) - kv); // 102 € Werbungskosten, 36 € Sonderausgaben
    const steuer = p.steuerModus === "manuell" ? zvE * persSatz(p.grenzRuhe, p.kist) : steuerGesamt(p, zvE, j);
    return { R, kv, zvE, steuer, netto: R - kv - steuer, anteil };
  }

  // Zusätzliche Steuer auf steuerpflichtige Erträge: voller Tarif auf der Rente aufgesetzt, oder manueller Satz
  function persSteuer(p, y, extra) {
    if (!(extra > 0)) return 0;
    if (p.steuerModus === "manuell") return extra * persSatz(p.grenzRuhe, p.kist);
    const zvE = ruhestand(p, y).zvE, j = p.jahre + y;
    return steuerGesamt(p, zvE + extra, j) - steuerGesamt(p, zvE, j);
  }

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
    const k = { order: 0, depot: 0, vapSteuer: 0, wechselSteuer: 0 };
    const verlauf = [0];
    let jahresStart = 0, jahresEinzahlung = 0, vapBasis = 0;
    // Fondswechsel: gleichmäßig über die Ansparphase verteilt, realisieren den aufgelaufenen Gewinn
    const wechsel = new Set();
    for (let j = 1; j <= (p.wechsel || 0); j++) wechsel.add(Math.round(j * p.jahre / ((p.wechsel || 0) + 1)));

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
          const jahr = (m + 1) / 12;
          if (wechsel.has(jahr) && jahr < p.jahre) {
            const rest = Math.max(0, p.sparerpausch - vap * (1 - tf));
            const gewinn = Math.max(0, V - basis - vapSumme);
            const wst = Math.max(0, gewinn * (1 - tf) - rest) * satz;
            V -= wst; k.wechselSteuer += wst;
            basis = V; vapSumme = 0;
          }
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
      return { gewinn, stpfl, steuer: persSteuer(p, 0, stpfl), hev, regel: "Halbeinkünfte (12/62), " + Math.round(tf * 100) + " % Teilfreistellung, persönlicher Steuersatz" };
    }
    const stpfl = Math.max(0, gewinn * (1 - tf) - p.sparerpausch);
    return { gewinn, stpfl, steuer: stpfl * abgeltungSatz(p.kist), hev, regel: "Abgeltungsteuer (12/62 nicht erfüllt), " + Math.round(tf * 100) + " % Teilfreistellung" };
  }

  /* ---------- Auszahlphase ---------- */

  // Lebenslange Rente aus dem Rentenfaktor (€ je 10.000 € Kapital), Ertragsanteil-Besteuerung
  function policeRente(p, kapital, rentenfaktor) {
    const brutto = kapital / 10000 * (rentenfaktor || 0);
    const ea = ertragsanteil(p.rentenalter);
    const steuer = persSteuer(p, 0, brutto * 12 * ea) / 12;
    return { brutto, steuer, netto: brutto - steuer, ertragsanteil: ea };
  }

  // Entnahmeplan: feste Netto-Monatsentnahme (art "depot" oder "police"), Kapital bleibt investiert.
  // Steuer je Jahr auf den Gewinnanteil der Entnahme; im Depot zusätzlich die Vorabpauschale.
  function entnahmeplan(art, p, kapital, basis, netto, bisAlter, kosten) {
    const r = monthly((p.renditeEntnahme || 0) - (kosten || 0));
    const depot = art === "depot";
    const tf = depot ? (p.aktienfonds ? 0.30 : 0) : (p.aktienfonds ? 0.15 : 0);
    const satz = abgeltungSatz(p.kist);
    const hev = p.jahre >= 12 && p.rentenalter >= 62;
    const steuerAuf = (gewinn, y) => {
      if (!depot && hev) return persSteuer(p, y, gewinn * (1 - tf) * 0.5);
      return Math.max(0, gewinn * (1 - tf) - p.sparerpausch) * satz;
    };
    let V = kapital, B = Math.min(basis, kapital), steuerSumme = 0, nettoSumme = 0, bruttoJ1 = 0, leerAlter = null;
    const verlauf = [V];
    const Y = Math.max(1, Math.ceil(bisAlter - p.rentenalter));
    let y = 0;
    for (; y < Y; y++) {
      const ziel = 12 * netto * Math.pow(1 + (p.entnahmeDyn || 0), y);
      const g = V > 0 ? Math.max(0, 1 - B / V) : 0;
      const nettoVon = (G) => G - steuerAuf(G * g, y);
      // Höchste Jahresentnahme, die das Kapital bei monatlicher vorschüssiger Zahlung noch trägt
      let barwert = 0;
      for (let m = 0; m < 12; m++) barwert += Math.pow(1 + r, -m) / 12;
      const moeglich = V / barwert;
      if (nettoVon(moeglich) < ziel) {
        const paid = nettoVon(moeglich);
        steuerSumme += moeglich - paid; nettoSumme += paid;
        leerAlter = p.rentenalter + y + (ziel > 0 ? paid / ziel : 0);
        V = 0; verlauf.push(0);
        break;
      }
      let lo = ziel, hi = moeglich;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (nettoVon(mid) < ziel) lo = mid; else hi = mid; }
      const G = hi;
      if (y === 0) bruttoJ1 = G / 12;
      steuerSumme += G - ziel; nettoSumme += ziel;
      B = Math.max(0, B - G * (1 - g));
      const start = V;
      for (let m = 0; m < 12; m++) V = Math.max(0, V - G / 12) * (1 + r);
      if (depot) {
        const zuwachs = Math.max(0, V - (start - G));
        const vap = Math.min(start * (p.basiszins || 0) * 0.7, zuwachs);
        const rest = Math.max(0, p.sparerpausch - G * g * (1 - tf));
        const st = Math.max(0, vap * (1 - tf) - rest) * satz;
        V = Math.max(0, V - st); B += vap; steuerSumme += st;
      }
      verlauf.push(V);
    }
    const g = V > 0 ? Math.max(0, 1 - B / V) : 0;
    const restSteuer = V > 0 ? steuerAuf(V * g, y) : 0;
    return { nettoMonat: netto, brutto: bruttoJ1, nettoSumme, steuerSumme, leerAlter, rest: V, restSteuer, restNetto: V - restSteuer, verlauf };
  }

  // Höchste Netto-Monatsentnahme, bei der das Kapital bis zum Planungsalter reicht
  function maxEntnahme(art, p, kapital, basis, bisAlter, kosten) {
    let lo = 0, hi = Math.max(1, kapital / 12);
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (entnahmeplan(art, p, kapital, basis, mid, bisAlter, kosten).leerAlter === null) lo = mid; else hi = mid;
    }
    return entnahmeplan(art, p, kapital, basis, lo, bisAlter, kosten);
  }

  // Alter, bis zu dem das Depot dieselbe Netto-Monatsrente zahlen kann wie die Police
  function breakEvenAlter(p, depotKapital, depotBasis, zielNetto, kosten) {
    if (!(zielNetto > 0)) return null;
    const q = Object.assign({}, p, { entnahmeDyn: 0 });
    const e = entnahmeplan("depot", q, depotKapital, depotBasis, zielNetto, 120, kosten);
    if (e.leerAlter === null) return { alter: 120, plus: true };
    if (e.leerAlter < p.rentenalter + 1) return { alter: e.leerAlter, minus: true };
    return { alter: e.leerAlter };
  }

  /* ---------- Bedarf ---------- */

  // Versorgungslücke, Kapitalbedarf und nötige Sparrate. Vor Steuern auf Erträge, Entnahme wächst mit der Inflation.
  function bedarf(p, kostenAnspar, kostenEntnahme, kapitalPlan) {
    const i = p.inflation || 0;
    const zielNominal = (p.ziel || 0) * Math.pow(1 + i, p.jahre);
    const rs = ruhestand(p, 0);
    const nettoMonat = rs.netto / 12;
    const luecke = Math.max(0, zielNominal - nettoMonat);
    const rm = monthly((p.renditeEntnahme || 0) - (kostenEntnahme || 0));
    const dauer = Math.max(1, p.planAlter - p.rentenalter);
    let kapital = 0;
    for (let m = 0; m < dauer * 12; m++) kapital += luecke * Math.pow(1 + i, Math.floor(m / 12)) * Math.pow(1 + rm, -m);
    const rate = (warten) => {
      const r = monthly((p.rendite || 0) - (kostenAnspar || 0));
      let fv = 0;
      for (let m = 0; m < Math.max(0, p.jahre - warten) * 12; m++) fv = (fv + Math.pow(1 + (p.dynamik || 0), Math.floor(m / 12))) * (1 + r);
      return fv > 0 ? kapital / fv : Infinity;
    };
    const defl = Math.pow(1 + i, p.jahre);
    return {
      zielNominal, nettoMonat, nettoHeute: nettoMonat / defl, luecke, lueckeHeute: luecke / defl,
      kapital, rate: rate(0), rate5: rate(5), deckung: kapital > 0 ? Math.min(1, (kapitalPlan || 0) / kapital) : 1,
      bruttoMonat: rs.R / 12, kvMonat: rs.kv / 12, steuerMonat: rs.steuer / 12, anteil: rs.anteil
    };
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
      kostenWirkung: depOhne.wert - dep.wert - dep.kosten.vapSteuer - dep.kosten.wechselSteuer,
      riy: p.rendite - renditeAus(p, simDepot(p, depotCfg, { ohneSteuer: true }).wert, strom(p)),
      steuerAnspar: dep.kosten.vapSteuer + dep.kosten.wechselSteuer, steuerKapital: depSt, netto: depNetto,
      renditeVorSteuer: depRendite, renditeNachSteuer: depNachSt,
      verlauf: dep.verlauf, verlaufOhne: depOhne.verlauf,
      entnahme: maxEntnahme("depot", p, dep.wert, dep.basis + dep.vapSumme, p.planAlter, depotCfg.ter || 0),
      basis: dep.basis + dep.vapSumme
    };
    out.bedarf = bedarf(p, depotCfg.ter || 0, depotCfg.ter || 0, dep.wert);

    for (const t of tarife) {
      const pol = simPolice(p, t);
      const ohne = simPolice(p, t, { ohneKosten: true });
      const st = steuerPoliceKapital(p, pol);
      const netto = pol.wert - st.steuer;
      const kn = pol.kosten.alpha + pol.kosten.beta + pol.kosten.stueck + pol.kosten.honorar + pol.kosten.einmal;
      const rente = policeRente(p, pol.wert, t.rentenfaktor);
      const kostenEntnahme = (t.gamma || 0) + (t.ter || 0);
      const gleich = entnahmeplan("police", p, pol.wert, pol.beitragssumme, out.depot.entnahme.nettoMonat, p.planAlter, kostenEntnahme);
      const maxE = maxEntnahme("police", p, pol.wert, pol.beitragssumme, p.planAlter, kostenEntnahme);
      out.policen.push({
        entnahmeGleich: gleich, entnahmeMax: maxE,
        tarif: t, name: t.name,
        wert: pol.wert, ohneKosten: ohne.wert, eingezahlt: pol.eingezahlt, beitragssumme: pol.beitragssumme,
        kosten: pol.kosten, kostenNominal: kn, kostenWirkung: ohne.wert - pol.wert,
        riy: p.rendite - renditeAus(p, pol.wert, strom(p)),
        steuerAnspar: 0, steuerKapital: st, netto,
        renditeVorSteuer: renditeAus(p, pol.wert, strom(p)),
        renditeNachSteuer: renditeAus(p, netto, strom(p)),
        verlauf: pol.verlauf, verlaufOhne: ohne.verlauf,
        rente,
        breakEven: rente.netto > 0 ? breakEvenAlter(p, out.depot.wert, out.depot.basis, rente.netto, depotCfg.ter || 0) : null
      });
    }
    return out;
  }

  const FV = { STAND, berechne, simPolice, simDepot, steuerDepotKapital, steuerPoliceKapital, policeRente, entnahmeplan, maxEntnahme, breakEvenAlter, bedarf, ruhestand, renteSchaetzung, besteuerungsanteil, est, steuerGesamt, persSteuer, ertragsanteil, abgeltungSatz, persSatz, renditeAus, monthly };
  if (typeof module === "object" && module.exports) module.exports = FV; else root.FV = FV;
})(typeof window !== "undefined" ? window : globalThis);
