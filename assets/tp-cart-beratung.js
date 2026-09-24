/*
  Beratung, Masspruefung und Verlegeanfrage im Warenkorb (Auftrag Shop 2.0,
  Abschnitte 11-14). Speichert die Antworten als Cart-Attribute per
  /cart/update.js, damit sie auch bei Express-Checkout (Shop Pay, Apple Pay,
  Google Pay) an der Bestellung haengen - der Warenkorb-Formularpost erreicht
  diese Buttons nicht.

  Pflichtentscheidung: "Beratung Ja/Nein" ohne Vorauswahl. Solange sie fehlt
  oder bei Ja (bzw. Masspruefung Ja) keine gueltige Telefonnummer vorliegt,
  fuehrt kein Weg aus dem Warenkorb in den Checkout:
  - globaler Waechter in der Capture-Phase fuer click (Checkout-Buttons,
    Links auf /checkout) und submit (Cart-Formular, auch Enter-Taste und
    requestSubmit). Er liest die aktuellen Feldwerte direkt aus dem DOM und
    wirkt damit auch dann, wenn das Element nach einem Morph des Drawers
    nicht (wieder) initialisiert wurde.
  - Express-Buttons bleiben verborgen (Klasse tp-beratung-offen am Element,
    serverseitig aus cart.attributes vorbelegt, CSS im Snippet).
  - Beratungsfrage und Telefonfeld tragen serverseitig required.
  Grenze: Ein direkter Aufruf von /checkout oder form.submit() per Skript
  laeuft am Theme vorbei und laesst sich nur im Checkout selbst verhindern.

  Reiner Kern (pruefen, attributeAus) haengt als TPCartBeratung an globalThis
  und ist ohne DOM testbar (qa/tests/tp-cart-beratung.test.mjs). Markup:
  snippets/tp-cart-beratung.liquid.
*/
(function (root) {
  'use strict';

  var KEYS = {
    beratung: 'Beratung',
    telefon: 'Telefon',
    zeit: 'Rückruf',
    thema: 'Beratungsthema',
    mass: 'Maßprüfung',
    verlegung: 'Verlegung'
  };

  var TEXT = {
    BERATUNG_FEHLT: 'Bitte wählen Sie, ob Sie eine persönliche Beratung wünschen.',
    TELEFON_FEHLT: 'Telefonnummer erforderlich: Für die Beratung benötigen wir Ihre Telefonnummer.',
    TELEFON_FEHLT_MASS: 'Telefonnummer erforderlich: Für die Maßprüfung benötigen wir Ihre Telefonnummer.',
    TELEFON_UNGUELTIG: 'Bitte prüfen Sie die Telefonnummer (mindestens 6 Ziffern).'
  };

  function ziffern(s) {
    return String(s || '').replace(/[^0-9]/g, '');
  }

  function telefonGueltig(s) {
    var t = String(s || '').trim();
    if (!t) return false;
    if (!/^[+0-9 ()\/.\-]+$/.test(t)) return false;
    return ziffern(t).length >= 6;
  }

  // Antworten pruefen. ctx.masspruefung / ctx.verlegung sagen, ob die Frage
  // im Warenkorb ueberhaupt gestellt wurde (nur bei passenden Positionen).
  function pruefen(attrs, ctx) {
    attrs = attrs || {};
    ctx = ctx || {};
    var fehler = [];
    var beratung = attrs[KEYS.beratung] || '';
    // ctx.beratung === false: Frage nicht gestellt (Ware im Warenkorb, nicht nur Muster)
    var gefragt = ctx.beratung !== false;
    if (!gefragt) beratung = '';
    var mass = attrs[KEYS.mass] || '';
    var telefonNoetig = beratung === 'Ja' || (!!ctx.masspruefung && mass === 'Ja');

    if (gefragt && beratung !== 'Ja' && beratung !== 'Nein') fehler.push({ feld: KEYS.beratung, code: 'BERATUNG_FEHLT', text: TEXT.BERATUNG_FEHLT });
    if (telefonNoetig) {
      var tel = attrs[KEYS.telefon] || '';
      if (!String(tel).trim()) fehler.push({ feld: KEYS.telefon, code: 'TELEFON_FEHLT', text: beratung === 'Ja' ? TEXT.TELEFON_FEHLT : TEXT.TELEFON_FEHLT_MASS });
      else if (!telefonGueltig(tel)) fehler.push({ feld: KEYS.telefon, code: 'TELEFON_UNGUELTIG', text: TEXT.TELEFON_UNGUELTIG });
    }
    return { ok: fehler.length === 0, fehler: fehler, telefonNoetig: telefonNoetig };
  }

  // Aus den Formularwerten den /cart/update.js-Body bauen. Leerer String
  // loescht ein Attribut. Bei "Nein" werden Telefon/Zeit/Thema nur dann
  // geleert, wenn keine Masspruefung sie braucht.
  function attributeAus(werte, ctx) {
    werte = werte || {};
    ctx = ctx || {};
    var beratung = ctx.beratung !== false && (werte.beratung === 'Ja' || werte.beratung === 'Nein') ? werte.beratung : '';
    var mass = ctx.masspruefung && (werte.mass === 'Ja' || werte.mass === 'Nein') ? werte.mass : '';
    var telefonNoetig = beratung === 'Ja' || mass === 'Ja';
    var out = {};
    out[KEYS.beratung] = beratung;
    out[KEYS.telefon] = telefonNoetig ? String(werte.telefon || '').trim() : '';
    out[KEYS.zeit] = beratung === 'Ja' ? String(werte.zeit || '').trim() : '';
    out[KEYS.thema] = beratung === 'Ja' ? String(werte.thema || '').trim().slice(0, 500) : '';
    out[KEYS.mass] = mass;
    out[KEYS.verlegung] = ctx.verlegung && werte.verlegung ? 'Angefragt' : '';
    return out;
  }

  function gleich(a, b) {
    var k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k) && String(a[k] || '') !== String(b[k] || '')) return false;
    return true;
  }

  function pfad(href) {
    var h = String(href || '');
    var m = h.match(/^(?:[a-z]+:)?\/\/[^\/?#]+([^?#]*)/i);
    if (m) return m[1] || '/';
    return h.replace(/[?#].*$/, '');
  }

  // Ist dieser Klick/Submit ein Weg in den Checkout? Reine Funktion ueber
  // einfache Beschreibungen, damit sie ohne DOM testbar bleibt.
  // art: 'click' | 'submit'; name/klasse/href vom Klickziel;
  // cartForm: Formular postet an /cart oder /checkout; submitterName: name
  // des ausloesenden Buttons (leer bei Enter-Taste/requestSubmit()).
  function istCheckoutWeg(e) {
    e = e || {};
    if (e.art === 'submit') return !!e.cartForm && (!e.submitterName || e.submitterName === 'checkout');
    if (e.art === 'click') {
      if (e.name === 'checkout') return true;
      if (/(^|\s)cart__checkout-button(\s|$)/.test(e.klasse || '')) return true;
      if (e.href && /^\/checkouts?(\/|$)/.test(pfad(e.href))) return true;
    }
    return false;
  }

  // Formularwerte aus einem (auch nicht initialisierten) Element lesen.
  function werteAus(el) {
    var q = function (sel) { var f = el.querySelector(sel); return f ? f.value : ''; };
    var r = el.querySelector('input[data-tp-feld="beratung"]:checked');
    var m = el.querySelector('input[data-tp-feld="mass"]:checked');
    var v = el.querySelector('input[data-tp-feld="verlegung"]');
    return {
      beratung: r ? r.value : '',
      telefon: q('[data-tp-feld="telefon"]'),
      zeit: q('[data-tp-feld="zeit"]'),
      thema: q('[data-tp-feld="thema"]'),
      mass: m ? m.value : '',
      verlegung: !!(v && v.checked)
    };
  }

  function ctxAus(el) {
    return { beratung: el.hasAttribute('data-beratung'), masspruefung: el.hasAttribute('data-masspruefung'), verlegung: el.hasAttribute('data-verlegung') };
  }

  root.TPCartBeratung = { KEYS: KEYS, TEXT: TEXT, pruefen: pruefen, attributeAus: attributeAus, telefonGueltig: telefonGueltig, gleich: gleich, istCheckoutWeg: istCheckoutWeg, pfad: pfad };

  if (typeof document === 'undefined' || typeof customElements === 'undefined' || root.__tpBeratungWaechter) return;
  root.__tpBeratungWaechter = true;

  function publish(name, payload) {
    var data = payload || {};
    try {
      if (root.Shopify && root.Shopify.analytics && typeof root.Shopify.analytics.publish === 'function') root.Shopify.analytics.publish(name, data);
    } catch (e) {}
    try {
      root.dataLayer = root.dataLayer || [];
      var d = { event: name };
      for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) d[k] = data[k];
      root.dataLayer.push(d);
    } catch (e) {}
  }

  // Zum Ausloeser gehoerendes Beratungselement: das naechste im selben
  // Container (Drawer oder Warenkorbseite), sonst das erste sichtbare.
  function komponenteFuer(node) {
    var n = node && node.nodeType === 1 ? node : null;
    while (n && n !== document.documentElement) {
      var k = n.tagName === 'TP-CART-BERATUNG' ? n : n.querySelector('tp-cart-beratung');
      if (k) return k;
      n = n.parentElement;
    }
    var alle = document.querySelectorAll('tp-cart-beratung');
    for (var i = 0; i < alle.length; i++) if (alle[i].getClientRects().length) return alle[i];
    return alle[0] || null;
  }

  // Fehler am Element anzeigen - auch ohne initialisiertes Custom Element.
  function melden(el, ergebnis) {
    var erster = ergebnis.fehler[0];
    // invalid feuert je ungueltigem Feld - nur einmal melden.
    var jetzt = Date.now();
    if (el.tpGemeldetAm && jetzt - el.tpGemeldetAm < 200) return;
    el.tpGemeldetAm = jetzt;
    if (typeof el.anzeigen === 'function') {
      el.anzeigen(true);
    } else {
      var box = el.querySelector('[data-tp-fehler]');
      if (box) { box.textContent = erster.text; box.hidden = false; }
      if (erster.feld === KEYS.telefon) {
        var tb = el.querySelector('[data-tp-telefon-box]');
        if (tb) tb.hidden = false;
        var tf = el.querySelector('[data-tp-telefon-fehler]');
        if (tf) { tf.textContent = erster.text; tf.hidden = false; }
      }
      el.classList.add('tp-beratung-offen');
    }
    var feld = erster.feld === KEYS.telefon ? el.querySelector('[data-tp-feld="telefon"]') : el.querySelector('input[data-tp-feld="beratung"]');
    if (feld) {
      feld.setAttribute('aria-invalid', 'true');
      try { feld.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      try { feld.focus({ preventScroll: true }); } catch (e) {}
    }
    publish('tp_beratung_checkout_gesperrt', { grund: erster.code });
  }

  // Waechter: blockiert, solange die aktuellen Angaben unvollstaendig sind.
  function waechter(ev, ausloeser) {
    var el = komponenteFuer(ausloeser);
    if (!el) return;
    var ctx = ctxAus(el);
    var ergebnis = pruefen(attributeAus(werteAus(el), ctx), ctx);
    if (ergebnis.ok) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    melden(el, ergebnis);
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('button, a, input[type="submit"]') : null;
    if (!t) return;
    var klasse = typeof t.className === 'string' ? t.className : '';
    if (istCheckoutWeg({ art: 'click', name: t.getAttribute('name'), klasse: klasse, href: t.tagName === 'A' ? t.getAttribute('href') : '' })) waechter(ev, t);
  }, true);

  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || form.tagName !== 'FORM') return;
    var ziel = pfad(form.getAttribute('action') || '');
    var cartForm = form.id === 'cart-form' || /^\/cart\/?$/.test(ziel) || /^\/checkouts?(\/|$)/.test(ziel);
    var s = ev.submitter;
    if (istCheckoutWeg({ art: 'submit', cartForm: cartForm, submitterName: s ? s.getAttribute('name') : '' })) waechter(ev, s || form);
  }, true);

  // requestSubmit() und Enter pruefen erst die nativen Pflichtfelder
  // (required); dann feuert kein submit, sondern invalid. Statt der
  // Browser-Blase den eigenen Hinweis am Feld zeigen.
  document.addEventListener('invalid', function (ev) {
    var feld = ev.target;
    if (!feld || !feld.getAttribute || !feld.getAttribute('data-tp-feld')) return;
    var el = feld.closest('tp-cart-beratung');
    if (!el) return;
    var ctx = ctxAus(el);
    var ergebnis = pruefen(attributeAus(werteAus(el), ctx), ctx);
    if (ergebnis.ok) return;
    ev.preventDefault();
    melden(el, ergebnis);
  }, true);

  if (customElements.get('tp-cart-beratung')) return;

  var Beratung = function () { return Reflect.construct(HTMLElement, [], Beratung); };
  Beratung.prototype = Object.create(HTMLElement.prototype);
  Beratung.prototype.constructor = Beratung;

  Beratung.prototype.connectedCallback = function () {
    var self = this;
    this.ctx = ctxAus(this);
    this.gespeichert = attributeAus(this.werte(), this.ctx);
    this.timer = null;
    this.onChange = function (ev) { self.aendern(ev); };
    this.addEventListener('change', this.onChange);
    this.addEventListener('input', this.onChange);
    // Ein Morph des Drawers setzt Klasse und Buttons auf den Serverstand
    // zurueck; danach den Zustand aus den Feldern neu anwenden.
    // Beobachtet werden Klasse und hidden im ganzen Element; waehrend
    // anzeigen() ist der Beobachter getrennt, damit keine Schleife entsteht.
    if (typeof MutationObserver !== 'undefined') {
      var optionen = { attributes: true, subtree: true, childList: true, attributeFilter: ['class', 'hidden', 'data-masspruefung'] };
      this.beobachter = new MutationObserver(function () {
        self.beobachter.disconnect();
        self.ctx = ctxAus(self);
        self.anzeigen(false);
        self.beobachter.takeRecords();
        self.beobachter.observe(self, optionen);
      });
      this.beobachter.observe(this, optionen);
    }
    // Gespeicherte Angaben (Reload) sofort pruefen: Sperre sofort, der
    // Hinweis am Telefonfeld erst nach einem Checkout-Versuch.
    this.anzeigen(false);
  };

  Beratung.prototype.disconnectedCallback = function () {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('input', this.onChange);
    if (this.beobachter) this.beobachter.disconnect();
    if (this.timer) clearTimeout(this.timer);
  };

  Beratung.prototype.feld = function (name) {
    return this.querySelector('[data-tp-feld="' + name + '"]');
  };

  Beratung.prototype.werte = function () {
    return werteAus(this);
  };

  Beratung.prototype.aendern = function (ev) {
    var self = this;
    var werte = this.werte();
    var ziel = ev && ev.target;
    if (ev && ev.type === 'change' && ziel && ziel.getAttribute) {
      var f = ziel.getAttribute('data-tp-feld');
      if (f === 'beratung') publish(werte.beratung === 'Ja' ? 'tp_beratung_ja' : 'tp_beratung_nein', {});
      if (f === 'mass' && werte.mass === 'Ja') publish('tp_masspruefung_ja', {});
      if (f === 'verlegung' && werte.verlegung) publish('tp_verlegung_angefragt', {});
    }
    this.anzeigen(false);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.speichern(); }, ev && ev.type === 'input' ? 600 : 150);
  };

  Beratung.prototype.speichern = function () {
    var self = this;
    var attrs = attributeAus(this.werte(), this.ctx);
    if (gleich(attrs, this.gespeichert)) return Promise.resolve();
    this.setAttribute('data-tp-speichert', '1');
    return fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ attributes: attrs })
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function () { self.gespeichert = attrs; })
      .catch(function () { self.fehlerText('Die Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es noch einmal.'); })
      .then(function () { self.removeAttribute('data-tp-speichert'); });
  };

  Beratung.prototype.fehlerText = function (text) {
    var box = this.querySelector('[data-tp-fehler]');
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
  };

  // Sichtbarkeit der Folgefelder, Sperre des Checkouts, Fehlertext (nur bei
  // "laut": nach Klick auf Zur Kasse).
  Beratung.prototype.anzeigen = function (laut) {
    var werte = this.werte();
    var attrs = attributeAus(werte, this.ctx);
    var ergebnis = pruefen(attrs, this.ctx);
    var details = this.querySelector('[data-tp-beratung-details]');
    var telefonBox = this.querySelector('[data-tp-telefon-box]');
    var telefon = this.feld('telefon');
    var telFehlerBox = this.querySelector('[data-tp-telefon-fehler]');
    if (details && details.hidden !== (werte.beratung !== 'Ja')) details.hidden = werte.beratung !== 'Ja';
    if (telefonBox && telefonBox.hidden !== !ergebnis.telefonNoetig) telefonBox.hidden = !ergebnis.telefonNoetig;
    if (telefon && telefon.required !== ergebnis.telefonNoetig) telefon.required = ergebnis.telefonNoetig;
    this.classList.toggle('tp-beratung-offen', !ergebnis.ok);
    var telFehler = null;
    ergebnis.fehler.forEach(function (f) { if (f.feld === KEYS.telefon) telFehler = f; });
    // Nach dem ersten Checkout-Versuch bleibt der Hinweis stehen, bis die
    // Angaben vollstaendig sind (auch waehrend der Eingabe).
    if (laut && !ergebnis.ok) this.gemeldet = true;
    if (ergebnis.ok) this.gemeldet = false;
    var zeigen = !!this.gemeldet;
    this.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    if (telFehlerBox) {
      telFehlerBox.textContent = zeigen && telFehler ? telFehler.text : '';
      telFehlerBox.hidden = !(zeigen && telFehler);
    }
    if (zeigen && !ergebnis.ok) {
      // Telefonfehler steht direkt am Feld; unten nur der uebrige Fehler.
      var unten = null;
      ergebnis.fehler.forEach(function (f) { if (!unten && f.feld !== KEYS.telefon) unten = f; });
      this.fehlerText(unten ? unten.text : (telFehlerBox ? '' : ergebnis.fehler[0].text));
      if (telFehler && telefon) telefon.setAttribute('aria-invalid', 'true');
      var erstes = ergebnis.fehler[0].feld === KEYS.telefon ? telefon : this.querySelector('input[data-tp-feld="beratung"]');
      if (erstes && erstes !== telefon) erstes.setAttribute('aria-invalid', 'true');
      if (laut && erstes) { try { erstes.focus(); } catch (e) {} }
    } else {
      this.fehlerText('');
    }
    var sperre = !ergebnis.ok;
    document.querySelectorAll('.cart__checkout-button').forEach(function (b) {
      if (sperre) b.setAttribute('data-tp-beratung-offen', '1'); else b.removeAttribute('data-tp-beratung-offen');
    });
    document.querySelectorAll('.additional-checkout-buttons').forEach(function (w) {
      w.classList.toggle('tp-beratung-offen', sperre);
    });
    return ergebnis;
  };

  customElements.define('tp-cart-beratung', Beratung);
})(typeof window !== 'undefined' ? window : globalThis);
