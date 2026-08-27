/* ==========================================================================
   finanz-medizin.com — Sonderausgaben-Rechner

   Ärzte glauben keiner Behauptung, sie glauben einem Befund. Deshalb behauptet
   diese Seite nicht, wie viel zu holen ist — sie gibt dem Besucher ein
   Instrument, mit dem er es selbst ausrechnet. Wer die Zahl selbst erzeugt hat,
   verteidigt sie, statt sie abzuwehren.

   Rechengrundlage (Stand 2026)
     § 10 Abs. 3 EStG — abzugsfähige Altersvorsorge:
       Einzelveranlagung  30.826 €
       Zusammenveranlagung 61.652 €
     Abzüglich der geleisteten Versorgungswerkbeiträge bleibt der freie Rahmen.
     Steuerersparnis = freier Rahmen × persönlicher Grenzsteuersatz.

   Bewusst konservativ: keine Hochrechnung auf Fantasierenditen, kein
   Countdown, keine Dringlichkeit, die nicht in der Sache liegt. Die
   Jahresfrist des § 10 EStG ist echt — die genügt.
   ========================================================================== */
(function () {
  'use strict';

  var HOECHST = { ledig: 30826, verheiratet: 61652 };

  document.querySelectorAll('[data-calc]').forEach(function (wurzel) {
    var reglerVW   = wurzel.querySelector('[data-calc-vw]');
    var reglerSatz = wurzel.querySelector('[data-calc-satz]');
    var toggle     = wurzel.querySelectorAll('[data-calc-stand]');

    var ausVW    = wurzel.querySelector('[data-out-vw]');
    var ausSatz  = wurzel.querySelector('[data-out-satz]');
    var ausRahmen = wurzel.querySelector('[data-out-rahmen]');
    var ausHoechst = wurzel.querySelector('[data-out-hoechst]');
    var ausBeitrag = wurzel.querySelector('[data-out-beitrag]');
    var ausErspart = wurzel.querySelector('[data-out-erspart]');
    var ausFazit   = wurzel.querySelector('[data-out-fazit]');

    var stand = 'ledig';

    function euro(n) {
      return Math.round(n).toLocaleString('de-DE') + ' €';
    }

    function fuellstand(el) {
      var min = parseFloat(el.min), max = parseFloat(el.max);
      var p = ((parseFloat(el.value) - min) / (max - min)) * 100;
      el.style.setProperty('--fill', p.toFixed(1) + '%');
    }

    function rechne() {
      var vw   = parseFloat(reglerVW.value);
      var satz = parseFloat(reglerSatz.value);
      var hoechst = HOECHST[stand];
      var rahmen = Math.max(0, hoechst - vw);
      var erspart = rahmen * (satz / 100);

      fuellstand(reglerVW);
      fuellstand(reglerSatz);

      if (ausVW) ausVW.textContent = euro(vw);
      if (ausSatz) ausSatz.textContent = satz.toLocaleString('de-DE', {
        minimumFractionDigits: 1, maximumFractionDigits: 1
      }) + ' %';

      if (ausHoechst) ausHoechst.textContent = euro(hoechst);
      if (ausBeitrag) ausBeitrag.textContent = '− ' + euro(vw);
      if (ausRahmen) ausRahmen.textContent = euro(rahmen);
      if (ausErspart) ausErspart.textContent = euro(erspart);

      if (ausFazit) {
        if (rahmen < 1500) {
          ausFazit.innerHTML = 'Ihr Rahmen ist nahezu ausgeschöpft — dann liegen ' +
            'Ihre Hebel woanders: <strong>Anlageklasse, Haltedauer und Struktur</strong>. ' +
            'Auch darüber sprechen wir im Erstgespräch.';
        } else {
          ausFazit.innerHTML = 'Nutzen Sie diesen Rahmen nicht, ist er am ' +
            '<strong>31. Dezember ersatzlos verfallen</strong> — er lässt sich nicht ' +
            'ins nächste Jahr mitnehmen. Bei voller Ausschöpfung trägt das Finanzamt ' +
            '<strong>' + euro(erspart) + '</strong> Ihrer Einzahlung.';
        }
      }
    }

    if (reglerVW) reglerVW.addEventListener('input', rechne);
    if (reglerSatz) reglerSatz.addEventListener('input', rechne);

    toggle.forEach(function (b) {
      b.addEventListener('click', function () {
        stand = b.getAttribute('data-calc-stand');
        toggle.forEach(function (x) { x.classList.toggle('is-on', x === b); });
        toggle.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        rechne();
      });
    });

    rechne();
  });
})();
