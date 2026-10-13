/*
  Groessenvorschlag fuer die Unterlage im Befestigungs-Tipp des Einfass-
  Konfigurators (blocks/tp-einfass-konfigurator.liquid). Inhaber 2026-10-13:
  die Unterlage ist rundum 5 cm kleiner als der Teppich.

  Der Konfigurator meldet jedes gueltige Mass per Event "tp-ek:mass" am
  Block-Element ({ f, w, l } in cm, null = kein gueltiges Mass). Fuer jede
  Unterlage im Tipp rechnet vorschlag() die guenstigste Bestellung:
  - Rollenware (Preis je laufendem Meter, Menge = Meter): eine Breite, so
    viele Bahnen nebeneinander wie noetig, Gesamtlaenge auf volle Meter
    aufgerundet; beide Ausrichtungen werden verglichen.
  - abgepasste Stuecke: ein Stueck, in das die Unterlage passt.
  Gewaehlt wird nach Preis, jede weitere Bahn zaehlt dabei 10 % teurer
  (BAHN_AUFSCHLAG): weniger Naehte sind fuer Kunden angenehmer. Angezeigt
  wird immer der echte Preis. Breiten und Stueckmasse
  kommen aus den Variantentiteln ("80 cm breit", "120 × 180 cm");
  Varianten ohne erkennbares Mass fallen weg (fail closed).

  Reiner Kern (RAND_CM, ziel, vorschlag, rolleBreite, stueckMasse) haengt als
  TPUnterlage an globalThis und ist ohne DOM testbar
  (qa/tests/tp-unterlage-vorschlag.test.mjs).
*/
(function (root) {
  'use strict';

  var RAND_CM = 5;
  var BAHN_AUFSCHLAG = 0.1;

  function wertung(k) { return k.cent * (1 + BAHN_AUFSCHLAG * (k.bahnen - 1)); }

  function rolleBreite(titel) {
    var m = String(titel || '').match(/(\d+)\s*cm\s+breit/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  function stueckMasse(titel) {
    var m = String(titel || '').match(/(\d+)\s*[×x]\s*(\d+)\s*cm/i);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
  }

  // Unterlage rundum RAND_CM kleiner; rund = Quadrat ueber den Durchmesser.
  function ziel(mass) {
    if (!mass || !(mass.w > 0)) return null;
    var w = mass.w - 2 * RAND_CM;
    var l = (mass.f === 'rund' ? mass.w : mass.l) - 2 * RAND_CM;
    if (!(w > 0) || !(l > 0)) return null;
    return { w: Math.min(w, l), l: Math.max(w, l) };
  }

  // varianten: [{ id, title, price (Cent), available }], art: 'rolle' | 'stueck'
  function vorschlag(mass, produkte) {
    var z = ziel(mass);
    if (!z) return null;
    var beste = null;
    function nimm(k) {
      if (!beste || wertung(k) < wertung(beste) || (wertung(k) === wertung(beste) && k.bahnen < beste.bahnen)) beste = k;
    }
    (produkte || []).forEach(function (p) {
      (p.varianten || []).forEach(function (v) {
        var preis = parseInt(v.price, 10);
        if (!v.available || !(preis > 0)) return;
        if (p.art === 'rolle') {
          var br = rolleBreite(v.title);
          if (!(br > 0)) return;
          [[z.w, z.l], [z.l, z.w]].forEach(function (o) {
            var bahnen = Math.ceil(o[0] / br);
            var bahnCm = o[1];
            var meter = Math.ceil((bahnen * bahnCm) / 100);
            nimm({ art: 'rolle', produkt: p.key, id: v.id, menge: meter, cent: meter * preis,
              breite: br, bahnen: bahnen, bahnCm: bahnCm, ziel: z });
          });
        } else if (p.art === 'stueck') {
          var s = stueckMasse(v.title);
          if (!s) return;
          var a = Math.min(s[0], s[1]), b = Math.max(s[0], s[1]);
          if (z.w <= a && z.l <= b) {
            nimm({ art: 'stueck', produkt: p.key, id: v.id, menge: 1, cent: preis,
              stueck: [a, b], bahnen: 1, ziel: z });
          }
        }
      });
    });
    return beste;
  }

  function fmt(n, stellen) {
    return n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  }
  function euro(cent) { return fmt(cent / 100, 2) + ' €'; }
  function meterText(cm) { return fmt(cm / 100, cm % 100 ? (cm % 10 ? 2 : 1) : 0) + ' m'; }

  // Kurzer Kundentext zum Vorschlag.
  function text(k) {
    var zu = 'zuschneiden auf ' + k.ziel.w + ' × ' + k.ziel.l + ' cm';
    if (k.art === 'stueck') {
      var genau = k.stueck[0] === k.ziel.w && k.stueck[1] === k.ziel.l;
      return '1 Stück ' + k.stueck[0] + ' × ' + k.stueck[1] + ' cm, ' + (genau ? 'passt genau' : zu);
    }
    var t = k.menge + ' m in ' + k.breite + ' cm Breite';
    if (k.bahnen > 1) t += ' (' + k.bahnen + ' Bahnen à ' + meterText(k.bahnCm) + ')';
    return t + ', ' + zu;
  }

  root.TPUnterlage = { RAND_CM: RAND_CM, BAHN_AUFSCHLAG: BAHN_AUFSCHLAG, ziel: ziel, vorschlag: vorschlag, rolleBreite: rolleBreite, stueckMasse: stueckMasse, text: text, euro: euro };

  if (typeof document === 'undefined') return;

  function einrichten(block) {
    if (block.getAttribute('data-tp-unterlage-bereit')) return;
    var datenEl = block.querySelector('[data-tp-unterlage-daten]');
    var tipp = block.querySelector('.tp-ek__tipp');
    if (!datenEl || !tipp) return;
    var daten;
    try { daten = JSON.parse(datenEl.textContent); } catch (e) { return; }
    block.setAttribute('data-tp-unterlage-bereit', '1');

    function zeigen(mass) {
      (daten.plaetze || []).forEach(function (platz) {
        var box = tipp.querySelector('[data-unterlage-vorschlag="' + platz.key + '"]');
        if (!box) return;
        var k = mass ? vorschlag(mass, platz.produkte) : null;
        box.hidden = !k;
        if (!k) return;
        box.querySelector('[data-uv-text]').textContent = 'Für Ihr Maß: ' + text(k);
        box.querySelector('[data-uv-preis]').textContent = euro(k.cent);
        var knopf = box.querySelector('[data-uv-knopf]');
        knopf.dataset.id = String(k.id);
        knopf.dataset.menge = String(k.menge);
        if (!knopf.classList.contains('is-done')) knopf.textContent = 'Mit in den Warenkorb';
      });
    }

    tipp.addEventListener('click', function (ev) {
      var knopf = ev.target.closest('[data-uv-knopf]');
      if (!knopf || knopf.disabled || !knopf.dataset.id) return;
      knopf.disabled = true;
      knopf.textContent = 'Wird hinzugefügt …';
      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: parseInt(knopf.dataset.id, 10), quantity: parseInt(knopf.dataset.menge, 10) }] })
      })
        .then(function (r) { if (!r.ok) throw new Error('add'); return r.json(); })
        .then(function (erg) {
          knopf.textContent = 'Im Warenkorb';
          setTimeout(function () { knopf.classList.remove('is-done'); knopf.textContent = 'Mit in den Warenkorb'; }, 3000);
          knopf.classList.add('is-done');
          document.dispatchEvent(new CustomEvent('cart:update', {
            bubbles: true,
            detail: { resource: erg, sourceId: block.id, data: { source: 'product-form-component' } }
          }));
        })
        .catch(function () {
          // Fehler bleibt stehen, bis erneut geklickt wird.
          knopf.textContent = 'Nicht hinzugefügt – bitte erneut versuchen';
        })
        .then(function () { knopf.disabled = false; });
    });

    block.addEventListener('tp-ek:mass', function (ev) { zeigen(ev.detail || null); });
    zeigen(null);
  }

  function alle() { document.querySelectorAll('[data-tp-ek]').forEach(einrichten); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alle); else alle();
  // Theme-Editor: neu gerenderte Bloecke wie der Konfigurator neu einrichten.
  document.addEventListener('shopify:block:select', alle);
  document.addEventListener('shopify:section:load', alle);
})(typeof window !== 'undefined' ? window : globalThis);
