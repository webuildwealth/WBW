/* H&H Fondsvergleich – Oberfläche */
(function () {
  "use strict";
  const FV = window.FV;
  const DATA = window.FV_TARIFE || { tarife: [], referenz: null };
  const STORE = "hh-fondsvergleich-v2";
  const COLORS = ["var(--c-p0)", "var(--c-p1)", "var(--c-p2)"];
  const MAX_POLICEN = 3;

  /* ---------- Formatierung ---------- */
  const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = (v) => nf0.format(Math.round(v)) + " €";
  const eurS = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + nf0.format(Math.abs(Math.round(v))) + " €";
  const pct = (v, d = 2) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v * 100) + " %";
  const num = (v) => (v == null || v === "" || isNaN(v) ? "" : String(v).replace(".", ","));
  // Akzeptiert „1.000“, „1.000,50“, „0,2“ und „0.2“ (Punkt als Dezimaltrenner, wenn kein Tausenderformat)
  const parse = (s) => {
    if (s == null) return null;
    let t = String(s).trim().replace(/\s|€|%/g, "");
    if (t === "") return null;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    const v = Number(t);
    return isFinite(v) ? v : null;
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Zustand ---------- */
  const KUNDE_FELDER = [
    { k: "alter", l: "Alter heute", u: "J.", min: 18, max: 70, step: 1, slider: true },
    { k: "rentenalter", l: "Auszahlung mit", u: "J.", min: 55, max: 80, step: 1, slider: true },
    { k: "beitrag", l: "Monatsbudget", u: "€", min: 25, max: 3000, step: 25, slider: true },
    { k: "einmal", l: "Einmalbeitrag", u: "€", min: 0, max: 500000, step: 1000, hint: "zu Beginn" },
    { k: "dynamik", l: "Dynamik", u: "% p. a.", min: 0, max: 10, step: 0.5, hint: "Beitragssteigerung" },
    { k: "rendite", l: "Fondsrendite", u: "% p. a.", min: 0, max: 12, step: 0.25, slider: true, hint: "vor Kosten" },
    { k: "aktienfonds", l: "Fondsart", type: "seg", opts: [[true, "Aktienfonds"], [false, "Sonstige"]] },
    { k: "kist", l: "Kirchensteuer", type: "seg", opts: [[0, "keine"], [0.08, "8 %"], [0.09, "9 %"]] },
    { k: "sparerpausch", l: "Sparerpauschbetrag", type: "seg", opts: [[1000, "1.000 €"], [2000, "2.000 €"], [0, "verbraucht"]] },
    { k: "basiszins", l: "Basiszins", u: "%", min: 0, max: 6, step: 0.01, hint: "BMF 2026: 3,20 %" },
    { k: "wechsel", l: "Fondswechsel", u: "Anzahl", min: 0, max: 10, step: 1, hint: "im Depot steuerpflichtig" },
    { k: "renditeEntnahme", l: "Rendite Entnahme", u: "% p. a.", min: 0, max: 10, step: 0.25, hint: "vor Kosten" },
    { k: "planAlter", l: "Entnahme bis", u: "J.", min: 70, max: 105, step: 1, hint: "Planungsalter" },
    { k: "entnahmeDyn", l: "Entnahme steigt", u: "% p. a.", min: 0, max: 5, step: 0.25, hint: "0 = konstant" }
  ];

  const BEDARF_FELDER = [
    { k: "ziel", l: "Wunscheinkommen", u: "€/Mon.", min: 0, max: 30000, step: 100, slider: false, hint: "netto, heutige Kaufkraft" },
    { k: "inflation", l: "Inflation", u: "% p. a.", min: 0, max: 8, step: 0.25, hint: "Annahme" },
    { k: "rvModus", l: "Gesetzliche Rente", type: "seg", opts: [["info", "Renteninfo"], ["schaetzen", "schätzen"]] },
    { k: "renteHeute", l: "Rente heute", u: "€/Mon.", min: 0, max: 6000, step: 50, hint: "brutto, Renteninformation", nurWenn: ["rvModus", "info"] },
    { k: "brutto", l: "Bruttoeinkommen", u: "€/Jahr", min: 0, max: 500000, step: 1000, hint: "Durchschnitt", nurWenn: ["rvModus", "schaetzen"] },
    { k: "rvJahre", l: "Beitragsjahre", u: "J.", min: 0, max: 50, step: 1, hint: "bis Rentenbeginn", nurWenn: ["rvModus", "schaetzen"] },
    { k: "renteAnp", l: "Rentenanpassung", u: "% p. a.", min: 0, max: 5, step: 0.25, hint: "Annahme" },
    { k: "kvSatz", l: "KV/PV auf die Rente", u: "%", min: 0, max: 25, step: 0.05, hint: "KVdR 2026 Ø: 12,35 %, PKV: 0" },
    { k: "pkv", l: "PKV-Beitrag", u: "€/Mon.", min: 0, max: 3000, step: 10, hint: "heute, sonst 0" },
    { k: "verheiratet", l: "Veranlagung", type: "seg", opts: [[false, "Einzeln"], [true, "Zusammen"]] },
    { k: "steuerModus", l: "Steuersatz Ruhestand", type: "seg", opts: [["auto", "aus Tarif"], ["manuell", "manuell"]] },
    { k: "grenzRuhe", l: "Persönlicher Satz", u: "%", min: 0, max: 45, step: 1, hint: "manuell", nurWenn: ["steuerModus", "manuell"] },
    { k: "tarifIndex", l: "Tarif wächst", u: "% p. a.", min: 0, max: 5, step: 0.25, hint: "gegen kalte Progression", nurWenn: ["steuerModus", "auto"] }
  ];

  const DEPOT_FELDER = [
    { k: "ter", l: "Fondskosten TER", u: "%" },
    { k: "order", l: "Orderkosten je Rate", u: "%" },
    { k: "depotgebuehr", l: "Depotgebühr", u: "€/J." }
  ];
  const POLICE_FELDER = [
    { k: "alpha", l: "Abschluss <span class=\"gr\">α</span>", u: "%", hint: "Beitragssumme", req: true },
    { k: "beta", l: "Verwaltung <span class=\"gr\">β</span>", u: "%", hint: "je Beitrag", req: true },
    { k: "gamma", l: "Guthaben <span class=\"gr\">γ</span>", u: "% p. a.", req: true },
    { k: "ter", l: "Fondskosten TER", u: "% p. a.", req: true },
    { k: "stueck", l: "Stückkosten", u: "€/J." },
    { k: "rentenfaktor", l: "Rentenfaktor", u: "€", hint: "je 10.000 €" },
    { k: "honorar", l: "Honorar", u: "€", hint: "Nettotarif", netto: true },
    { k: "honorarMonate", l: "Honorar-Raten", u: "Mon.", netto: true }
  ];

  const DEFAULT = () => ({
    view: "kapital",
    kunde: { alter: 37, rentenalter: 67, beitrag: 200, einmal: 0, dynamik: 0, rendite: 6, aktienfonds: true, grenzRuhe: 30, kist: 0, sparerpausch: 1000, basiszins: 3.2, wechsel: 0, renditeEntnahme: 4, planAlter: 90, entnahmeDyn: 0,
      ziel: 3000, inflation: 2, rvModus: "info", renteHeute: 1500, brutto: 60000, rvJahre: 42, renteAnp: 1, kvSatz: 12.35, pkv: 0, verheiratet: false, steuerModus: "auto", tarifIndex: 2 },
    depot: { name: "ETF-Depot", ter: 0.2, order: 0, depotgebuehr: 0 },
    policen: [tarifAus(DATA.referenz ? DATA.referenz.id : "eigen")]
  });

  function alleTarife() {
    const list = [];
    if (DATA.referenz) list.push(DATA.referenz);
    for (const t of DATA.tarife || []) list.push(t);
    return list;
  }
  function tarifById(id) { return alleTarife().find((t) => t.id === id) || null; }
  function tarifAus(id) {
    const t = tarifById(id);
    if (!t) return { src: "eigen", name: "Eigener Tarif " + (S ? S.policen.length + 1 : 1), tarifart: "Bruttotarif", alpha: null, beta: null, gamma: null, ter: null, stueck: null, rentenfaktor: null, honorar: null, honorarMonate: null, edited: false };
    return { src: t.id, name: t.name, tarifart: t.tarifart || "Bruttotarif", alpha: t.alpha, beta: t.beta, gamma: t.gamma, ter: t.ter, stueck: t.stueck ?? 0, rentenfaktor: t.rentenfaktor ?? null, honorar: t.honorar ?? (t.tarifart === "Nettotarif" ? null : 0), honorarMonate: t.honorarMonate ?? null, edited: false };
  }

  let S; S = load();
  function load() {
    try { const raw = localStorage.getItem(STORE); if (raw) { const s = JSON.parse(raw); if (s && s.kunde && s.depot && Array.isArray(s.policen)) { const d = DEFAULT(); return Object.assign(d, s, { kunde: Object.assign(d.kunde, s.kunde) }); } } } catch (e) { /* Speicher nicht verfügbar */ }
    return DEFAULT();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* egal */ } }

  /* ---------- Eingaben rendern ---------- */
  const $ = (sel, el = document) => el.querySelector(sel);

  function inputHtml(id, val, unit, empty) {
    return `<div class="inp${empty ? " inp--empty" : ""}"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${esc(num(val))}"${empty ? ' placeholder="aus Angebot"' : ""}><em>${unit}</em></div>`;
  }

  function renderKunde() {
    renderFelder("kunde", KUNDE_FELDER);
    renderFelder("bedarf", BEDARF_FELDER);
  }

  function renderFelder(name, liste) {
    const box = $(`[data-fields=${name}]`);
    const felder = liste.filter((f) => !f.nurWenn || S.kunde[f.nurWenn[0]] === f.nurWenn[1]);
    box.innerHTML = felder.map((f) => {
      const v = S.kunde[f.k];
      if (f.type === "seg") {
        return `<div class="field field--seg"><span>${f.l}</span><div class="seg" role="radiogroup" aria-label="${f.l}">${f.opts.map(([ov, ol], i) =>
          `<label><input type="radio" name="k-${f.k}" value="${i}"${ov === v ? " checked" : ""} data-seg="${f.k}">${ol}</label>`).join("")}</div></div>`;
      }
      const shown = f.u === "%" || f.u.startsWith("%") ? v : v;
      return `<label class="field" for="k-${f.k}"><span>${f.l}${f.hint ? `<i>${f.hint}</i>` : ""}</span>${inputHtml("k-" + f.k, shown, f.u)}${f.slider ? `<input class="range" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" data-range="${f.k}" aria-label="${f.l}">` : ""}</label>`;
    }).join("");

    felder.forEach((f) => {
      if (f.type === "seg") return;
      const inp = $("#k-" + f.k);
      const rng = $(`[data-range="${f.k}"]`);
      const set = (v, from) => {
        if (v == null) return;
        v = Math.min(f.max, Math.max(f.min, v));
        S.kunde[f.k] = v;
        if (from !== "inp") inp.value = num(v);
        if (rng) { rng.value = v; paintRange(rng); }
        update();
      };
      inp.addEventListener("input", () => { const v = parse(inp.value); if (v != null && v >= f.min && v <= f.max) set(v, "inp"); });
      inp.addEventListener("change", () => { const v = parse(inp.value); set(v == null ? S.kunde[f.k] : v); inp.value = num(S.kunde[f.k]); });
      if (rng) { paintRange(rng); rng.addEventListener("input", () => set(Number(rng.value), "rng")); }
    });
    box.querySelectorAll("[data-seg]").forEach((r) => r.addEventListener("change", () => {
      const f = liste.find((x) => x.k === r.dataset.seg);
      S.kunde[f.k] = f.opts[Number(r.value)][0];
      if (liste.some((x) => x.nurWenn && x.nurWenn[0] === f.k)) renderFelder(name, liste);
      update();
    }));
  }
  function paintRange(r) { const p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty("--p", p + "%"); }

  function renderProdukte() {
    const box = $("[data-products]");
    const tarifOpts = (sel) => {
      const list = alleTarife();
      const real = list.filter((t) => t.id !== (DATA.referenz && DATA.referenz.id));
      let h = "";
      if (DATA.referenz) h += `<option value="${esc(DATA.referenz.id)}"${sel === DATA.referenz.id ? " selected" : ""}>${esc(DATA.referenz.name)}</option>`;
      if (real.length) h += `<optgroup label="Notion · Tarife">${real.map((t) => `<option value="${esc(t.id)}"${sel === t.id ? " selected" : ""}>${esc(t.versicherer ? t.versicherer + " · " : "")}${esc(t.name)}${t.status ? " (" + esc(t.status) + ")" : ""}</option>`).join("")}</optgroup>`;
      h += `<option value="eigen"${sel === "eigen" ? " selected" : ""}>Eigene Werte aus dem Angebot</option>`;
      return h;
    };

    let h = `<article class="card prod" style="--c:var(--c-depot)">
      <div class="card__head"><div><div class="card__tag">Maßstab</div><div class="card__title"><span class="dot"></span>${esc(S.depot.name)}</div></div></div>
      <div class="fields">${DEPOT_FELDER.map((f) => `<label class="field" for="d-${f.k}"><span>${f.l}</span>${inputHtml("d-" + f.k, S.depot[f.k], f.u)}</label>`).join("")}</div>
      <div class="prod__src">Gleicher Fonds wie in der Police. Kosten laut Preisverzeichnis der Depotbank, Vorabpauschale wird automatisch gerechnet.</div>
    </article>`;

    S.policen.forEach((p, i) => {
      const t = tarifById(p.src);
      const netto = p.tarifart === "Nettotarif";
      h += `<article class="card prod" style="--c:${COLORS[i]}" data-pol="${i}">
        <div class="card__head"><div><div class="card__tag">Fondspolice ${i + 1}</div><div class="card__title"><span class="dot"></span>${esc(p.name)}</div></div>
          <button class="prod__x" type="button" data-del="${i}" aria-label="Police ${i + 1} entfernen"><svg aria-hidden="true"><use href="#i-x"/></svg></button></div>
        <div class="fields">
          <label class="field field--wide" for="p${i}-src"><span>Tarif</span><select id="p${i}-src" data-src="${i}">${tarifOpts(p.src)}</select></label>
          ${p.src === "eigen" ? `<label class="field field--wide" for="p${i}-name"><span>Bezeichnung<i>Versicherer · Tarif</i></span><div class="inp"><input id="p${i}-name" type="text" autocomplete="off" value="${esc(p.name)}" data-name="${i}"><em></em></div></label>` : ""}
          <div class="field field--wide"><span>Tarifart</span><div class="seg"><label><input type="radio" name="p${i}-art" value="Bruttotarif"${!netto ? " checked" : ""} data-art="${i}">Bruttotarif</label><label><input type="radio" name="p${i}-art" value="Nettotarif"${netto ? " checked" : ""} data-art="${i}">Nettotarif + Honorar</label></div></div>
          ${POLICE_FELDER.filter((f) => !f.netto || netto).map((f) => {
            const empty = (p[f.k] == null || p[f.k] === "") && (f.req || f.k === "rentenfaktor" || (f.netto && f.k === "honorar"));
            return `<label class="field" for="p${i}-${f.k}"><span><b class="lbl">${f.l}</b>${f.hint ? `<i>${f.hint}</i>` : ""}</span>${inputHtml(`p${i}-${f.k}`, p[f.k], f.u, empty)}</label>`;
          }).join("")}
        </div>
        <div class="prod__src">${t ? `Quelle: <b>${esc(t.quelle || "Notion")}</b>${t.stand ? ", Stand " + esc(t.stand) : ""}${p.edited ? " · <b>manuell angepasst</b>" : ""}${t.notionUrl ? ` · <a href="${esc(t.notionUrl)}" target="_blank" rel="noopener">in Notion öffnen</a>` : ""}` : "Werte aus Angebot bzw. Hochrechnung mit Kostenausweis eintragen (α, β, γ, TER, Rentenfaktor)."}</div>
      </article>`;
    });

    if (S.policen.length < MAX_POLICEN) {
      h += `<button class="card add" type="button" data-add><span><span class="add__plus" aria-hidden="true">+</span><b>Weitere Fondspolice</b><small>Tarif aus Notion oder eigene Werte</small></span></button>`;
    }
    box.innerHTML = h;

    DEPOT_FELDER.forEach((f) => {
      const inp = $("#d-" + f.k);
      inp.addEventListener("input", () => { const v = parse(inp.value); S.depot[f.k] = v == null ? 0 : v; update(); });
    });
    S.policen.forEach((p, i) => {
      POLICE_FELDER.forEach((f) => {
        const inp = $(`#p${i}-${f.k}`); if (!inp) return;
        inp.addEventListener("input", () => {
          p[f.k] = parse(inp.value); p.edited = true;
          inp.parentElement.classList.toggle("inp--empty", p[f.k] == null && (f.req || f.k === "rentenfaktor"));
          update();
        });
      });
    });
    box.querySelectorAll("[data-name]").forEach((inp) => inp.addEventListener("input", () => {
      const i = Number(inp.dataset.name); S.policen[i].name = inp.value.trim() || "Eigener Tarif";
      const t = box.querySelector(`[data-pol="${i}"] .card__title`); if (t) t.innerHTML = `<span class="dot"></span>${esc(S.policen[i].name)}`;
      update();
    }));
    box.querySelectorAll("[data-src]").forEach((s) => s.addEventListener("change", () => {
      const i = Number(s.dataset.src); S.policen[i] = tarifAus(s.value); renderProdukte(); update();
    }));
    box.querySelectorAll("[data-art]").forEach((r) => r.addEventListener("change", () => {
      const p = S.policen[Number(r.dataset.art)]; p.tarifart = r.value; p.edited = true;
      if (r.value === "Nettotarif") { if (p.honorarMonate == null) p.honorarMonate = 60; } else { p.honorar = 0; }
      renderProdukte(); update();
    }));
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { S.policen.splice(Number(b.dataset.del), 1); renderProdukte(); update(); }));
    const add = $("[data-add]", box);
    if (add) add.addEventListener("click", () => { S.policen.push(tarifAus("eigen")); renderProdukte(); update(); const last = box.querySelector(`[data-pol="${S.policen.length - 1}"] select`); if (last) last.focus(); });
  }

  function renderTarifState() {
    const el = $("[data-tarif-state]");
    const n = (DATA.tarife || []).length;
    el.style.setProperty("--c", n ? "var(--win)" : "var(--gold)");
    el.innerHTML = n
      ? `<span><b>${n} Tarif${n === 1 ? "" : "e"}</b> aus Notion geladen · abgerufen ${esc(DATA.abgerufen || "–")}</span>`
      : `<span><b>Notion-Datenbank „Tarife“ ist noch leer</b> (abgerufen ${esc(DATA.abgerufen || "–")}). Bis dahin rechnet Police 1 mit der Referenzannahme aus dem Notion-Rechenmodell, kein realer Tarif. Echte Werte per <code>notion_sync.py</code> oder direkt aus dem Angebot.</span>`;
    $("[data-stand]").textContent = "Rechtsstand 2026 · Tarifdaten: " + (DATA.abgerufen || "–");
  }

  /* ---------- Rechnen ---------- */
  function params(over) {
    const k = S.kunde;
    const p = {
      alter: k.alter, rentenalter: Math.max(k.rentenalter, k.alter + 1), beitrag: k.beitrag, einmal: k.einmal || 0,
      dynamik: (k.dynamik || 0) / 100, rendite: k.rendite / 100, aktienfonds: !!k.aktienfonds,
      kist: k.kist || 0, sparerpausch: k.sparerpausch || 0, grenzRuhe: (k.grenzRuhe || 0) / 100,
      basiszins: (k.basiszins || 0) / 100, renditeEntnahme: (k.renditeEntnahme || 0) / 100,
      planAlter: Math.max(k.planAlter, k.rentenalter + 1), wechsel: k.wechsel || 0, entnahmeDyn: (k.entnahmeDyn || 0) / 100,
      ziel: k.ziel || 0, inflation: (k.inflation || 0) / 100, renteAnp: (k.renteAnp || 0) / 100, kvSatz: (k.kvSatz || 0) / 100, pkv: k.pkv || 0,
      verheiratet: !!k.verheiratet, steuerModus: k.steuerModus, tarifIndex: (k.tarifIndex || 0) / 100,
      rente: k.rvModus === "schaetzen" ? FV.renteSchaetzung(k.brutto || 0, k.rvJahre || 0, k.rentenalter) : (k.renteHeute || 0)
    };
    p.jahre = p.rentenalter - p.alter;
    return Object.assign(p, over || {});
  }
  const depotCfg = () => ({ name: S.depot.name, ter: (S.depot.ter || 0) / 100, order: (S.depot.order || 0) / 100, depotgebuehr: S.depot.depotgebuehr || 0 });
  const vollstaendig = (p) => ["alpha", "beta", "gamma", "ter"].every((k) => p[k] != null);
  function tarifCfg(p) {
    return { name: p.name, alpha: (p.alpha || 0) / 100, beta: (p.beta || 0) / 100, gamma: (p.gamma || 0) / 100, ter: (p.ter || 0) / 100, stueck: p.stueck || 0, rentenfaktor: p.rentenfaktor || 0,
      honorar: p.tarifart === "Nettotarif" ? (p.honorar || 0) : 0, honorarMonate: p.honorarMonate || 1 };
  }

  let R = null;
  function rechnen() {
    const p = params();
    const aktiv = S.policen.map((x, i) => ({ x, i })).filter((o) => vollstaendig(o.x));
    const res = FV.berechne(p, depotCfg(), aktiv.map((o) => tarifCfg(o.x)));
    res.policen.forEach((r, j) => { r.idx = aktiv[j].i; r.color = COLORS[aktiv[j].i]; r.input = aktiv[j].x; });
    res.depot.color = "var(--c-depot)";
    res.p = p;
    res.unvollstaendig = S.policen.map((x, i) => ({ x, i })).filter((o) => !vollstaendig(o.x));
    return res;
  }

  /* ---------- Ausgabe ---------- */
  function update() {
    save();
    R = rechnen();
    renderBedarf(); renderKpis(); renderLevers(); renderTable(); renderLine(); renderWaterfall(); renderPayout(); renderEntnahme(); renderSens();
  }

  function renderBedarf() {
    const b = R.bedarf, p = R.p;
    const inflFaktor = Math.pow(1 + p.inflation, p.jahre);
    const rate = (v) => (isFinite(v) ? eur(v) + " / Monat" : "nicht mehr erreichbar");
    $("[data-bedarf]").innerHTML = `
      <article class="pay" style="--c:var(--c-depot)"><div class="card__tag"><span class="dot"></span>Einkommen mit ${p.rentenalter}</div>
        <div class="pay__big">${eur(b.nettoHeute)} <small>netto / Monat, in heutiger Kaufkraft</small></div>
        <div class="pay__rows"><div><span>Gesetzliche Rente heute</span><b>${eur(p.rente)}</b></div><div><span>Brutto bei Rentenbeginn</span><b>${eur(b.bruttoMonat)}</b></div><div><span>KV/PV</span><b class="neg">−${nf0.format(Math.round(b.kvMonat))}&nbsp;€</b></div><div><span>Steuer (${pct(b.anteil, 1)} steuerpflichtig)</span><b class="${b.steuerMonat >= 0.5 ? "neg" : ""}">${b.steuerMonat >= 0.5 ? "−" : ""}${nf0.format(Math.round(b.steuerMonat))}&nbsp;€</b></div><div><span>Netto bei Rentenbeginn</span><b>${eur(b.nettoMonat)}</b></div></div></article>
      <article class="pay" style="--c:var(--c-p0)"><div class="card__tag"><span class="dot"></span>Versorgungslücke</div>
        <div class="pay__big">${eur(b.lueckeHeute)} <small>/ Monat, in heutiger Kaufkraft</small></div>
        <div class="pay__rows"><div><span>Wunsch heute</span><b>${eur(p.ziel)}</b></div><div><span>Wunsch mit ${p.rentenalter} (Faktor ${nf2.format(inflFaktor)})</span><b>${eur(b.zielNominal)}</b></div><div><span>Lücke mit ${p.rentenalter}</span><b>${eur(b.luecke)}</b></div><div><span>Kapitalbedarf bis ${p.planAlter}</span><b>${eur(b.kapital)}</b></div></div></article>
      <article class="pay" style="--c:var(--c-p1)"><div class="card__tag"><span class="dot"></span>Was das bedeutet</div>
        <div class="pay__big">${rate(b.rate).replace(" / Monat", "")} <small>${isFinite(b.rate) ? "Sparrate / Monat, ab sofort" : ""}</small></div>
        <div class="pay__rows"><div><span>Bei 5 Jahren Wartezeit</span><b>${rate(b.rate5)}</b></div><div><span>Aktuelles Budget</span><b>${eur(p.beitrag)} / Monat</b></div><div><span>Deckt vom Kapitalbedarf (Depot)</span><b>${pct(b.deckung, 0)}</b></div></div>
        <div class="pay__hint">Kapitalbedarf und Sparrate vor Steuern auf Erträge. Die Entnahme wächst hier mit der Inflation.</div></article>`;
  }

  function renderEntnahme() {
    const d = R.depot.entnahme;
    const box = $("[data-entnahme]");
    if (!R.policen.length) { box.innerHTML = ""; return; }
    const N = R.p.planAlter - R.p.rentenalter;
    const head = `<thead><tr><th>Entnahmeplan bis ${R.p.planAlter}</th><th><span class="dot" style="--c:var(--c-depot)"></span>${esc(R.depot.name)}</th>${R.policen.map((x) => `<th><span class="dot" style="--c:${x.color}"></span>${esc(x.name)}</th>`).join("")}</tr></thead>`;
    const zeile = (label, dep, pol, cls) => `<tr class="${cls || ""}"><td>${label}</td><td>${dep}</td>${R.policen.map((x) => `<td>${pol(x)}</td>`).join("")}</tr>`;
    box.innerHTML = head + `<tbody>
      <tr class="grp"><td colspan="${R.policen.length + 2}">Höchste Entnahme, Kapital reicht genau bis ${R.p.planAlter}</td></tr>
      ${zeile("Netto pro Monat im ersten Jahr", eur(d.nettoMonat), (x) => eur(x.entnahmeMax.nettoMonat), "sum")}
      ${zeile("Unterschied zum Depot", "–", (x) => eurS(x.entnahmeMax.nettoMonat - d.nettoMonat))}
      ${zeile("Steuer über " + N + " Jahre", eur(d.steuerSumme), (x) => eur(x.entnahmeMax.steuerSumme))}
      <tr class="grp"><td colspan="${R.policen.length + 2}">Gleiche Entnahme wie im Depot: ${eur(d.nettoMonat)} netto pro Monat</td></tr>
      ${zeile("Kapital reicht bis", String(R.p.planAlter), (x) => (x.entnahmeGleich.leerAlter === null ? String(R.p.planAlter) + " und länger" : "Alter " + nf0.format(Math.floor(x.entnahmeGleich.leerAlter))))}
      ${zeile("Restkapital netto mit " + R.p.planAlter, eur(0), (x) => eur(x.entnahmeGleich.restNetto), "sum")}
      ${zeile("Steuer über die Laufzeit", eur(d.steuerSumme), (x) => eur(x.entnahmeGleich.steuerSumme))}
    </tbody>`;
  }

  const steuerGesamt = (x) => x.steuerAnspar + x.steuerKapital.steuer;
  const produkte = () => [R.depot].concat(R.policen);
  const monatlich = (x) => (x === R.depot ? x.entnahme.nettoMonat : x.rente.netto);

  function renderKpis() {
    const p = R.p;
    $("[data-summary-line]").textContent = `${eur(p.beitrag)} im Monat über ${p.jahre} Jahre, ${pct(p.rendite, 1)} Fondsrendite vor Kosten, Auszahlung mit ${p.rentenalter}. Eingezahlt: ${eur(R.depot.eingezahlt)}.`;
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === S.view)));
    const all = produkte();
    const rente = S.view === "rente";
    const val = (x) => (rente ? monatlich(x) : x.netto);
    const vals = all.map(val).filter((v) => v > 0);
    const best = Math.max(...vals);
    let h = all.map((x) => {
      const isDepot = x === R.depot;
      const v = val(x);
      const diff = v - val(R.depot);
      const isBest = v === best && v > 0;
      const rows = rente
        ? (isDepot
          ? `<div><span>Brutto-Entnahme</span><b>${eur(x.entnahme.brutto)}</b></div><div><span>Läuft bis</span><b>${R.p.planAlter} Jahre, danach 0 €</b></div><div><span>Steuer in der Entnahme</span><b class="neg">${eur(x.entnahme.steuerSumme)}</b></div>`
          : (x.rente.brutto > 0
            ? `<div><span>Brutto-Rente</span><b>${eur(x.rente.brutto)}</b></div><div><span>Läuft</span><b>lebenslang</b></div><div><span>Steuer (Ertragsanteil ${pct(x.rente.ertragsanteil, 0)})</span><b class="neg">${eur(x.rente.steuer)}</b></div><div><span>Gegenüber Depot</span><b class="${diff >= 0 ? "pos" : "neg"}">${eurS(diff)}</b></div>`
            : `<div><span>Rentenfaktor fehlt</span><b>aus Angebot eintragen</b></div>`))
        : `<div><span>Ablaufleistung vor Steuern</span><b>${eur(x.wert)}</b></div><div><span>Kosten (Wirkung)</span><b class="neg">−${nf0.format(Math.round(x.kostenWirkung))}&nbsp;€</b></div><div><span>Steuer gesamt</span><b class="neg">−${nf0.format(Math.round(steuerGesamt(x)))}&nbsp;€</b></div><div><span>Rendite nach Kosten &amp; Steuern</span><b>${pct(x.renditeNachSteuer)}</b></div>${isDepot ? "" : `<div><span>Gegenüber Depot</span><b class="${diff >= 0 ? "pos" : "neg"}">${eurS(diff)}</b></div>`}`;
      return `<article class="kpi${isBest ? " kpi--best" : ""}" style="--c:${x.color}">
        <div class="kpi__name"><span><span class="dot"></span>${esc(x.name)}</span>${isBest ? '<span class="kpi__badge">Vorne</span>' : ""}</div>
        <div class="kpi__big">${v > 0 ? eur(v) : "–"}${rente && v > 0 ? '<small style="font-size:16px;color:var(--grey-3)"> / Monat</small>' : ""}</div>
        <div class="kpi__sub">${rente ? (isDepot ? "Netto-Entnahme pro Monat" : "Netto-Rente pro Monat") : "Netto-Kapital nach Steuern"}</div>
        <div class="kpi__rows">${rows}</div></article>`;
    }).join("");
    R.unvollstaendig.forEach((o) => {
      h += `<article class="kpi" style="--c:${COLORS[o.i]}"><div class="kpi__name"><span><span class="dot"></span>${esc(o.x.name)}</span></div><div class="kpi__big" style="font-size:24px;white-space:normal">Werte fehlen</div><div class="kpi__sub">α, β, γ und TER aus dem Angebot eintragen, dann rechnet die Police mit.</div></article>`;
    });
    $("[data-kpis]").innerHTML = h;
    $("[data-verdict]").innerHTML = verdict();
  }

  function verdict() {
    const d = R.depot;
    if (!R.policen.length) return "Tragen Sie mindestens eine Fondspolice ein, um den Vergleich zu sehen.";
    const bestPol = R.policen.reduce((a, b) => (b.netto > a.netto ? b : a));
    const diff = bestPol.netto - d.netto;
    const kostenDiff = bestPol.kostenWirkung - d.kostenWirkung;
    const steuerDiff = steuerGesamt(d) - steuerGesamt(bestPol);
    const vorn = diff >= 0 ? `<em>${esc(bestPol.name)}</em> liegt um <em>${eur(Math.abs(diff))}</em> vor dem Depot` : `Das <em>Depot</em> liegt um <em>${eur(Math.abs(diff))}</em> vor der besten Police`;
    const hebel = `Die Police kostet ${eur(kostenDiff)} mehr an Ablaufleistung und spart ${eur(steuerDiff)} Steuern.`;
    let rente = "";
    if (bestPol.breakEven && bestPol.rente.netto > 0) {
      const be = bestPol.breakEven;
      rente = be.plus ? " Bei Verrentung zahlt das Depot dieselbe Netto-Rente sogar über das 120. Lebensjahr hinaus." : be.minus ? " Bei Verrentung liegt die Police von Anfang an vorn." : ` Bei Verrentung hält das Depot dieselbe Netto-Rente bis zum Alter von ${nf0.format(Math.floor(be.alter))} Jahren durch.`;
    }
    return `Bei Kapitalauszahlung: ${vorn}. ${hebel}${rente}`;
  }

  function renderLevers() {
    const all = produkte();
    const maxK = Math.max(1, ...all.map((x) => x.kostenWirkung));
    const maxS = Math.max(1, ...all.map(steuerGesamt));
    const per10k = (x) => (x === R.depot ? (x.entnahme.nettoMonat / Math.max(1, x.wert)) * 10000 : (x.rente.netto > 0 ? x.rente.netto / x.wert * 10000 : 0));
    const maxA = Math.max(1, ...all.map(per10k));
    const row = (x, label, v, w) => `<div class="lever__row" style="--c:${x.color}"><span>${esc(x.name)}</span><b>${label}</b><div class="bar"><i style="--w:${Math.max(0, Math.min(100, w))}%"></i></div></div>`;
    $("[data-levers]").innerHTML = `
      <article class="lever"><div class="lever__n">Hebel 1</div><h3>Kosten</h3><p>Was die Kosten inklusive Zinseszins von der Ablaufleistung wegnehmen. Dahinter die Effektivkosten (RIY) pro Jahr.</p>
        <div class="lever__list">${all.map((x) => row(x, `${eur(x.kostenWirkung)} · ${pct(x.riy)}`, 0, x.kostenWirkung / maxK * 100)).join("")}</div></article>
      <article class="lever"><div class="lever__n">Hebel 2</div><h3>Steuer</h3><p>Vorabpauschale in der Ansparphase plus Steuer bei Auszahlung als Kapital.</p>
        <div class="lever__list">${all.map((x) => row(x, eur(steuerGesamt(x)), 0, steuerGesamt(x) / maxS * 100)).join("")}</div></article>
      <article class="lever"><div class="lever__n">Hebel 3</div><h3>Ablaufleistung</h3><p>Netto pro Monat aus 10.000&nbsp;€ Ablaufleistung: Police über den Rentenfaktor lebenslang, Depot per Entnahmeplan bis ${R.p.planAlter}.</p>
        <div class="lever__list">${all.map((x) => { const v = per10k(x); return row(x, v > 0 ? nf2.format(v) + " €" : "Rentenfaktor fehlt", 0, v / maxA * 100); }).join("")}</div></article>`;
  }

  function renderTable() {
    const all = produkte();
    const d = R.depot;
    const td = (v, cls = "") => `<td class="${cls}">${v}</td>`;
    const line = (label, f, opts = {}) => `<tr class="${opts.cls || ""}"><td>${label}</td>${all.map((x) => { const r = f(x); return typeof r === "object" ? td(r.v, r.c) : td(r); }).join("")}</tr>`;
    const best = Math.max(...all.map((x) => x.netto));
    const neg = (v) => (v > 0.5 ? { v: "−" + eur(v), c: "neg" } : "–");
    const h = `<thead><tr><th>Ansparphase ${R.p.jahre} Jahre</th>${all.map((x) => `<th><span class="dot" style="--c:${x.color}"></span>${esc(x.name)}</th>`).join("")}</tr></thead><tbody>
      ${line("Eingezahlt gesamt", (x) => eur(x.eingezahlt))}
      ${line("Ablaufleistung ohne Kosten", (x) => eur(x.ohneKosten))}
      <tr class="grp"><td colspan="${all.length + 1}">Hebel 1 · Kosten</td></tr>
      ${line("Abschlusskosten α / Honorar", (x) => x === d ? "–" : neg(x.kosten.alpha + x.kosten.honorar))}
      ${line("Verwaltung β, Stückkosten", (x) => x === d ? "–" : neg(x.kosten.beta + x.kosten.stueck + x.kosten.einmal))}
      ${line("Order- und Depotkosten", (x) => x === d ? neg(x.kosten.order + x.kosten.depot) : "–")}
      ${line("Kostenwirkung auf die Ablaufleistung<small>inkl. γ, TER und Zinseszins</small>", (x) => neg(x.kostenWirkung))}
      ${line("Effektivkosten (RIY) p. a.", (x) => pct(x.riy))}
      ${line("Ablaufleistung vor Steuern", (x) => eur(x.wert), { cls: "sum" })}
      <tr class="grp"><td colspan="${all.length + 1}">Hebel 2 · Steuer</td></tr>
      ${line("Vorabpauschale und Fondswechsel (Ansparphase)", (x) => neg(x.steuerAnspar))}
      ${line("Steuerpflichtiger Ertrag bei Auszahlung", (x) => eur(x.steuerKapital.stpfl))}
      ${line("Steuer bei Kapitalauszahlung", (x) => ({ v: (x.steuerKapital.steuer > 0.5 ? "−" + eur(x.steuerKapital.steuer) : "–") + `<small>${esc(x.steuerKapital.regel)}</small>`, c: "neg" }))}
      ${line("Netto-Kapital", (x) => ({ v: eur(x.netto), c: x.netto === best ? "best" : "" }), { cls: "sum" })}
      ${line("Rendite nach Kosten und Steuern", (x) => pct(x.renditeNachSteuer))}
      ${line("Unterschied zum Depot", (x) => x === d ? "–" : { v: eurS(x.netto - d.netto), c: x.netto - d.netto < 0 ? "neg" : "best" })}
      <tr class="grp"><td colspan="${all.length + 1}">Hebel 3 · Ablaufleistung als Einkommen</td></tr>
      ${line("Netto pro Monat", (x) => { const v = monatlich(x); return v > 0 ? eur(v) : "Rentenfaktor fehlt"; })}
      ${line("Bezugsdauer", (x) => x === d ? `bis ${R.p.planAlter}` : "lebenslang")}
    </tbody>`;
    $("[data-table]").innerHTML = h;
  }

  function renderLine() {
    const all = produkte();
    const box = $("[data-chart-line]");
    const W = Math.max(320, Math.min(640, Math.round(box.clientWidth || 640))), H = W < 480 ? 240 : 300, L = 50, B = 26, T = 10, Rr = 12;
    const n = R.p.jahre;
    const maxV = Math.max(...all.map((x) => Math.max(...x.verlauf, ...x.verlaufOhne)));
    const step = niceStep(maxV / 4);
    const top = Math.ceil(maxV / step) * step;
    const x = (i) => L + (W - L - Rr) * i / n;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    let g = "";
    for (let v = 0; v <= top + 1; v += step) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="#ece9e2"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? nf0.format(v / 1000) + " T€" : nf0.format(v)}</text>`;
    const tickEvery = n > 30 ? 10 : 5;
    for (let i = 0; i <= n; i += tickEvery) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${R.p.alter + i}</text>`;
    const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    g += `<path d="${path(R.depot.verlaufOhne)}" fill="none" stroke="#a6a6ab" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    all.slice().reverse().forEach((p) => { g += `<path d="${path(p.verlauf)}" fill="none" stroke="${p.color}" stroke-width="2.4" stroke-linejoin="round"/>`; });
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Guthabenverlauf nach Alter">${g}</svg>`;
    $("[data-chart-legend]").innerHTML = all.map((p) => `<span style="--c:${p.color}">${esc(p.name)}</span>`).join("") + `<span class="dash" style="--c:#a6a6ab">ohne Kosten</span>`;
  }
  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

  function renderWaterfall() {
    const all = produkte();
    const T = Math.max(...all.map((x) => x.ohneKosten));
    $("[data-waterfall]").innerHTML = all.map((x) => {
      const N = x.netto, S2 = steuerGesamt(x), K = Math.max(0, x.ohneKosten - N - S2);
      const w = (v) => (v / T * 100).toFixed(2) + "%";
      return `<div class="wf__row" style="--c:${x.color}"><div class="wf__top"><span><span class="dot"></span>${esc(x.name)}</span><b>${eur(N)} von ${eur(x.ohneKosten)}</b></div>
        <div class="wf__bar" title="Netto ${eur(N)} · Kosten ${eur(K)} · Steuer ${eur(S2)}"><i class="n" style="width:${w(N)}"></i><i class="k" style="width:${w(K)}"></i><i class="s" style="width:${w(S2)}"></i></div>
        <div class="wf__keys"><span style="--c:${x.color}">${pct(N / x.ohneKosten, 0)} netto</span><span style="--c:#c98e84">${eur(K)} Kosten</span><span style="--c:#8a8a90">${eur(S2)} Steuer</span></div></div>`;
    }).join("");
  }

  function renderPayout() {
    const d = R.depot;
    let h = `<article class="pay" style="--c:${d.color}"><div class="card__tag"><span class="dot"></span>${esc(d.name)} · Entnahmeplan</div>
      <div class="pay__big">${eur(d.entnahme.nettoMonat)} <small>netto / Monat</small></div>
      <div class="pay__rows"><div><span>Depotwert mit ${R.p.rentenalter}</span><b>${eur(d.wert)}</b></div><div><span>Brutto-Entnahme</span><b>${eur(d.entnahme.brutto)}</b></div><div><span>Rendite in der Entnahme</span><b>${pct(R.p.renditeEntnahme, 2)} vor TER</b></div><div><span>Steuer über die Laufzeit</span><b>${eur(d.entnahme.steuerSumme)}</b></div><div><span>Läuft bis</span><b>Alter ${R.p.planAlter}, dann ist das Depot leer</b></div></div>
      <div class="pay__hint">Flexibel: Das Kapital bleibt verfügbar und vererbbar. Wird der Kunde älter als ${R.p.planAlter}, ist es aufgebraucht.</div></article>`;
    R.policen.forEach((x) => {
      const r = x.rente;
      if (!(r.brutto > 0)) {
        h += `<article class="pay" style="--c:${x.color}"><div class="card__tag"><span class="dot"></span>${esc(x.name)} · Verrentung</div><div class="pay__big">– <small>netto / Monat</small></div>
          <div class="pay__rows"><div><span>Ablaufleistung</span><b>${eur(x.wert)}</b></div></div>
          <div class="pay__hint pay__hint--empty">Rentenfaktor fehlt. Den garantierten bzw. rechnungsmäßigen Rentenfaktor (€ Monatsrente je 10.000 € Kapital) aus dem Angebot eintragen. Erst dann lässt sich der Ablaufleistungshebel bewerten.</div></article>`;
        return;
      }
      const be = x.breakEven;
      const beTxt = !be ? "–" : be.plus ? "über das 120. Lebensjahr hinaus" : be.minus ? "Police von Anfang an vorn" : "bis Alter " + nf0.format(Math.floor(be.alter));
      h += `<article class="pay" style="--c:${x.color}"><div class="card__tag"><span class="dot"></span>${esc(x.name)} · Verrentung</div>
        <div class="pay__big">${eur(r.netto)} <small>netto / Monat, lebenslang</small></div>
        <div class="pay__rows"><div><span>Ablaufleistung</span><b>${eur(x.wert)}</b></div><div><span>Rentenfaktor</span><b>${nf2.format(x.input.rentenfaktor)} € je 10.000 €</b></div><div><span>Brutto-Rente</span><b>${eur(r.brutto)}</b></div><div><span>Ertragsanteil mit ${R.p.rentenalter}</span><b>${pct(r.ertragsanteil, 0)}</b></div><div><span>Steuer pro Monat</span><b>${eur(r.steuer)}</b></div></div>
        <div class="pay__hint"><b>Break-even:</b> Das Depot zahlt dieselbe Netto-Rente ${beTxt}. ${be && !be.plus && !be.minus ? "Wer länger lebt, fährt mit der Police besser." : ""}</div></article>`;
    });
    $("[data-payout]").innerHTML = h;
  }

  function renderSens() {
    const base = params();
    const rates = [3, 4, 5, 6, 7, 8, 9];
    const aktiv = S.policen.map((x, i) => ({ x, i })).filter((o) => vollstaendig(o.x));
    const rows = rates.map((r) => FV.berechne(Object.assign({}, base, { rendite: r / 100 }), depotCfg(), aktiv.map((o) => tarifCfg(o.x))));
    const cur = (r) => Math.abs(r / 100 - base.rendite) < 1e-9 ? " cur" : "";
    let h = `<thead><tr><th>Fondsrendite vor Kosten</th>${rates.map((r) => `<th class="${cur(r)}">${r}&nbsp;%</th>`).join("")}</tr></thead><tbody>`;
    h += `<tr><td><span class="dot" style="--c:var(--c-depot)"></span>${esc(S.depot.name)}</td>${rows.map((x, j) => `<td class="${cur(rates[j])}">${eur(x.depot.netto)}</td>`).join("")}</tr>`;
    aktiv.forEach((o, k) => {
      h += `<tr><td><span class="dot" style="--c:${COLORS[o.i]}"></span>${esc(o.x.name)}</td>${rows.map((x, j) => { const v = x.policen[k].netto, df = v - x.depot.netto; return `<td class="${df >= 0 ? "win" : "lose"}${cur(rates[j])}">${eur(v)}<small>${eurS(df)}</small></td>`; }).join("")}</tr>`;
    });
    h += "</tbody>";
    $("[data-sens]").innerHTML = h;
  }

  /* ---------- Start ---------- */
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.view; save(); renderKpis(); }));
  $("[data-print]").addEventListener("click", () => window.print());
  $("[data-reset]").addEventListener("click", () => { S = DEFAULT(); renderKunde(); renderProdukte(); update(); });

  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => R && renderLine(), 150); });
  renderTarifState();
  renderKunde();
  renderProdukte();
  update();
})();
