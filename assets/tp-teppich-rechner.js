/*
  Mass-Rechner der Kategorieseite "Teppich nach Mass" (sections/tp-teppiche-hero.liquid,
  Einstellung "rechner"). Der Kunde gibt Breite und Laenge ein; darunter erscheinen alle
  Qualitaeten der Kollektion mit dem Preis fuer genau dieses Mass, guenstigste zuerst.
  Qualitaeten, die das Mass nicht hergeben, stehen ausgegraut am Ende.

  Warum eine eigene Liste statt das Raster umzusortieren: Horizon laedt hoechstens
  36 Karten je Seite und den Rest per Endlos-Scroll nach - ein Sortieren der geladenen
  Karten waere nie vollstaendig. Die Daten aller Teppiche kommen deshalb als JSON aus
  snippets/tp-teppich-rechner-daten.liquid (nachgeladen, siehe laden()); das normale Raster (#ResultsList) wird nur
  ausgeblendet, solange ein Mass gilt.

  Gerechnet wird mit assets/tp-masstepich-rechnung.js - derselben Formel wie im
  Konfigurator (Material je 0,01 m2 plus Kettelung je 0,01 lfm, Mindestpreis hebt die
  Materialmenge an). Je Teppich zaehlt die guenstigste Farbe, die das Mass hergibt; der
  Link oeffnet genau diese Farbe mit eingetragenem Mass (?variant=&breite=&laenge=).
*/
(function () {
  'use strict';

  var SPEICHER = 'tp-teppich-mass';
  var MIN_CM = 50;
  var MAX_EINGABE_CM = 2000;

  function euro(cent) {
    var e = cent / 100;
    var ganz = Math.round(e) === e;
    return e.toLocaleString('de-DE', { minimumFractionDigits: ganz ? 0 : 2, maximumFractionDigits: 2 }) + ' €';
  }

  function zahl(input) {
    var roh = String(input.value || '').trim();
    if (!roh) return { wert: 0, fehler: '' };
    // Komma oder Punkt: auf ganze Zentimeter aufrunden wie der Konfigurator der
    // Produktseite, aber sichtbar ("200,5 → 201 cm"). Vorher lehnte nur diese
    // Seite "200,5" ab (Rundgang 2026-10-26).
    if (/^\d+[.,]\d+$/.test(roh)) {
      var dezimal = parseFloat(roh.replace(',', '.'));
      var auf = Math.ceil(dezimal);
      return { wert: auf, fehler: '', dezimal: true, gerundet: auf !== dezimal ? roh.replace('.', ',') : '' };
    }
    var n = parseInt(roh, 10);
    if (!(n > 0) || String(n) !== roh.replace(/^0+/, '')) return { wert: 0, fehler: 'Bitte nur Zahlen in Zentimetern eingeben.' };
    return { wert: n, fehler: '' };
  }

  function massPruefen(inW, inL) {
    var b = zahl(inW);
    var l = zahl(inL);
    var f = b.fehler || l.fehler;
    if (!f && (!b.wert || !l.wert)) f = 'Bitte Breite und Länge in Zentimetern eingeben.';
    if (!f && (b.wert < MIN_CM || l.wert < MIN_CM)) f = 'Beide Seiten mindestens ' + MIN_CM + ' cm.';
    if (!f && (b.wert > MAX_EINGABE_CM || l.wert > MAX_EINGABE_CM)) f = 'Bitte ein Maß bis ' + MAX_EINGABE_CM + ' cm eingeben.';
    var gerundet = [];
    if (b.gerundet) gerundet.push(b.gerundet + ' → ' + b.wert + ' cm');
    if (l.gerundet) gerundet.push(l.gerundet + ' → ' + l.wert + ' cm');
    return { w: b.wert, l: l.wert, fehler: f, dezimal: !!(b.dezimal || l.dezimal), hinweis: gerundet.length ? 'aufgerundet: ' + gerundet.join(', ') : '' };
  }

  function lesenGespeichert() {
    try {
      var s = JSON.parse(sessionStorage.getItem(SPEICHER) || 'null');
      if (s && s.w >= MIN_CM && s.l >= MIN_CM) return s;
    } catch (e) { /* ohne Speicher geht es auch */ }
    return null;
  }

  function speichern(w, l) {
    try {
      if (w && l) sessionStorage.setItem(SPEICHER, JSON.stringify({ w: w, l: l }));
      else sessionStorage.removeItem(SPEICHER);
    } catch (e) { /* ohne Speicher geht es auch */ }
  }

  // Preis eines Teppichs fuer w x l: guenstigste Farbe, die das Mass hergibt.
  function preisFuer(M, t, kettel, w, l, pauschale) {
    var kurz = Math.min(w, l);
    var lang = Math.max(w, l);
    var flaeche = M.flaecheM2(w, l);
    // Kettelung als eigene Zeile nur ohne kante_inkl (service.kante_inklusive):
    // sonst steckt sie im m2-Preis - dieselbe Regel wie im Konfigurator.
    var mitKettel = M.kettelSeparat(t.art, t.kante_inkl);
    if (mitKettel && !(kettel > 0)) return { passt: false, grund: 'preis' };
    // Art "fertig": Pauschale je Teppich (Pflicht) und Gewichtsgrenze fuer den Paketversand -
    // dieselben Regeln wie im Konfigurator (blocks/tp-einfass-konfigurator.liquid).
    var istFertig = t.art === 'fertig';
    if (istFertig && !(pauschale > 0)) return { passt: false, grund: 'preis' };
    if (t.max_kg > 0 && t.kg_qm > 0 && flaeche * t.kg_qm > t.max_kg + 1e-9) return { passt: false, grund: 'mass' };
    var kettelCent = (mitKettel ? M.kanteEinheiten(M.umfangM('rechteck', w, l)) * kettel : 0) +
      (istFertig ? pauschale : 0);
    var rest = Math.max(0, (t.mindest || 0) - kettelCent);
    var besteW = 0;
    var best = null;
    (t.farben || []).forEach(function (f) {
      if (!f || !(f.p > 0)) return;
      if (f.w > besteW) besteW = f.w;
      if (!(f.w > 0) || kurz > f.w || !(t.max_l > 0) || lang > t.max_l) return;
      var menge = M.mengeMitMindestpreis(flaeche, f.p, rest);
      var summe = menge * f.p + kettelCent;
      if (!best || summe < best.summe) {
        var alt = 0;
        if (f.alt > f.p) {
          var mengeAlt = M.mengeMitMindestpreis(flaeche, f.alt, rest);
          var summeAlt = mengeAlt * f.alt + kettelCent;
          // Wie im Konfigurator: greift beim alten Preis der Mindestpreis, kein Streichpreis.
          if (mengeAlt === M.mengeHundertstelM2(flaeche) && summeAlt > summe) alt = summeAlt;
        }
        best = { summe: summe, alt: alt, variante: f.id, mindest: menge > M.mengeHundertstelM2(flaeche) };
      }
    });
    if (best) {
      best.passt = true;
      return best;
    }
    return { passt: false, grund: 'mass', maxKurz: besteW, maxLang: t.max_l };
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function datenLesen(text) {
    var daten = JSON.parse(text);
    if (!daten || !Array.isArray(daten.teppiche) || !daten.teppiche.every(function (t) {
      // Das Liquid-Snippet schliesst beide Arrays mit null ab, damit keine
      // nachgestellten Kommata entstehen. Das ist ein gueltiger Leerplatz.
      return t === null || (typeof t === 'object' && !Array.isArray(t) && Array.isArray(t.farben) && t.farben.every(function (f) {
        return f === null || (typeof f === 'object' && !Array.isArray(f));
      }));
    })) throw new Error('Ungueltige Rechner-Daten');
    return daten;
  }

  function init(root) {
    if (root.getAttribute('data-tp-rechner-bereit')) return true;
    var M = window.TPMass;
    var datenEl = root.querySelector('[data-tp-rechner-daten]');
    if (!M || !datenEl) return;
    var daten;
    try { daten = datenLesen(datenEl.textContent); } catch (e) { return false; }
    var teppiche = (daten.teppiche || []).filter(Boolean);
    if (!teppiche.length) {
      // Diese Kategorie zeigt alle Qualitaeten in Gruppen statt auf Rasterseiten.
      // Alte direkte ?page=2-Links waehlen dennoch die leere zweite Seite aller
      // 250er-Paginationsbloecke. Nur dann zur gefuellten Seite zurueckkehren;
      // andere Filter, Sortierung und das Fragment bleiben im URL-Objekt erhalten.
      var ziel = new URL(window.location.href);
      if (Number(ziel.searchParams.get('page')) > 1 && Number(daten.gesamt) > 0) {
        ziel.searchParams.delete('page');
        window.location.replace(ziel.toString());
      }
      return;
    }
    var form = root.querySelector('[data-tp-rechner]');
    var inW = root.querySelector('[data-tp-rechner-breite]');
    var inL = root.querySelector('[data-tp-rechner-laenge]');
    var fehler = root.querySelector('[data-tp-rechner-fehler]');
    var ergebnis = root.querySelector('[data-tp-rechner-ergebnis]');
    var liste = root.querySelector('[data-tp-rechner-liste]');
    var zusammenfassung = root.querySelector('[data-tp-rechner-summe]');
    var loeschen = root.querySelectorAll('[data-tp-rechner-loeschen]');
    if (!form || !inW || !inL || !ergebnis || !liste) return;

    function fehlerZeigen(text) {
      fehler.textContent = text || '';
      fehler.hidden = !text;
    }

    function ergebnisVerbergen() {
      ergebnis.hidden = true;
      document.documentElement.classList.remove('tp-rechner-aktiv');
    }

    function zuruecksetzen() {
      inW.value = '';
      inL.value = '';
      fehlerZeigen('');
      speichern(0, 0);
      ergebnisVerbergen();
      while (liste.firstChild) liste.removeChild(liste.firstChild);
    }

    function karte(t, r, w, l) {
      var li = el('li', 'tp-tep-rechner__karte' + (r.passt ? '' : ' tp-tep-rechner__karte--passt-nicht'));
      var a = el('a', 'tp-tep-rechner__link');
      var url = t.url + (t.url.indexOf('?') < 0 ? '?' : '&');
      if (r.passt) url += 'variant=' + encodeURIComponent(r.variante) + '&';
      a.href = url + 'breite=' + w + '&laenge=' + l;
      var bild = el('span', 'tp-tep-rechner__bild');
      if (t.bild) {
        var img = el('img');
        img.src = t.bild;
        img.alt = '';
        img.loading = 'lazy';
        img.width = 600;
        img.height = 600;
        bild.appendChild(img);
      }
      a.appendChild(bild);
      var text = el('span', 'tp-tep-rechner__text');
      text.appendChild(el('span', 'tp-tep-rechner__titel', t.titel));
      if (t.qualitaet) text.appendChild(el('span', 'tp-tep-rechner__qualitaet', t.qualitaet));
      var preis = el('span', 'tp-tep-rechner__preis');
      if (r.passt) {
        preis.appendChild(el('span', 'tp-tep-rechner__ab', 'ab'));
        var betrag = el('span', 'tp-tep-rechner__betrag', euro(r.summe));
        preis.appendChild(betrag);
        if (r.alt > 0) {
          var s = el('s', 'tp-tep-rechner__alt', euro(r.alt));
          s.setAttribute('aria-label', 'statt ' + euro(r.alt));
          preis.appendChild(s);
        }
        text.appendChild(preis);
        text.appendChild(el('span', 'tp-tep-rechner__grund',
          w + ' × ' + l + ' cm' + (t.art === 'ketteln' ? ', inkl. Kettelung' : t.art === 'fertig' ? ', inkl. Einfassung und Pauschale' : ', inkl. Einfassung') +
          (r.mindest ? ' · Mindestpreis' : '')));
      } else if (r.grund === 'mass') {
        text.appendChild(el('span', 'tp-tep-rechner__grund',
          r.maxKurz > 0 ? 'Nur bis ' + r.maxKurz + ' × ' + r.maxLang + ' cm' : 'Dieses Maß ist hier nicht möglich'));
      } else {
        text.appendChild(el('span', 'tp-tep-rechner__grund', 'Preis im Konfigurator'));
      }
      a.appendChild(text);
      li.appendChild(a);
      return li;
    }

    function anwenden(w, l, scrollen, hinweis) {
      var passend = [];
      var andere = [];
      teppiche.forEach(function (t) {
        var r = preisFuer(M, t, daten.kettel, w, l, daten.pauschale);
        (r.passt ? passend : andere).push({ t: t, r: r });
      });
      passend.sort(function (a, b) { return a.r.summe - b.r.summe; });
      while (liste.firstChild) liste.removeChild(liste.firstChild);
      passend.concat(andere).forEach(function (x) { liste.appendChild(karte(x.t, x.r, w, l)); });

      if (zusammenfassung) {
        var masstext = w + ' × ' + l + ' cm' + (hinweis ? ' (' + hinweis + ')' : '');
        zusammenfassung.textContent = passend.length
          ? passend.length + ' von ' + teppiche.length + ' Qualitäten gibt es in ' + masstext + ' – ab ' + euro(passend[0].r.summe) + ', günstigste zuerst.'
          : 'Für ' + masstext + ' passt keine Qualität. Probieren Sie ein kleineres Maß oder rufen Sie uns an.';
      }
      // Querverweise auf JAB, Vorwerk und Sisal mit Bordüre (snippets/tp-mass-querverweise)
      // nehmen das Mass mit; die Zielkollektion gibt es an die Produktseite weiter.
      root.querySelectorAll('[data-tp-mass-link]').forEach(function (link) {
        var basis = link.getAttribute('data-tp-mass-link');
        link.href = basis + (basis.indexOf('?') < 0 ? '?' : '&') + 'breite=' + w + '&laenge=' + l;
      });
      ergebnis.hidden = false;
      document.documentElement.classList.add('tp-rechner-aktiv');
      speichern(w, l);
      if (scrollen) {
        var reduziert = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        ergebnis.scrollIntoView({ behavior: reduziert ? 'auto' : 'smooth', block: 'start' });
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var mass = massPruefen(inW, inL);
      fehlerZeigen(mass.fehler);
      if (mass.fehler) {
        // Das alte Ergebnis nicht neben der Fehlermeldung stehen lassen: es nannte
        // weiter das vorige Mass (Rundgang 2026-10-26). Das Raster kommt zurueck.
        ergebnisVerbergen();
        return;
      }
      // Im Feld steht danach das Mass, mit dem gerechnet wird (wie auf der Produktseite).
      if (mass.dezimal) {
        inW.value = String(mass.w);
        inL.value = String(mass.l);
      }
      anwenden(mass.w, mass.l, true, mass.hinweis);
    });
    // "oder alle Qualitaeten ansehen": Mass verwerfen, der Link springt dann zum normalen Raster.
    root.querySelectorAll('[data-tp-rechner-alle]').forEach(function (link) {
      link.addEventListener('click', function () { zuruecksetzen(); });
    });
    loeschen.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        zuruecksetzen();
        inW.focus();
      });
    });

    // Zurueck vom Produkt: das zuletzt gerechnete Mass steht wieder da.
    // Auch eine erst teilweise eingegebene oder wieder geloeschte Eingabe gehoert
    // dem Kunden. Ein spaeter Fetch darf sie nicht durch den Speicher ersetzen.
    var bearbeitet = root.getAttribute('data-tp-rechner-bearbeitet') || inW.value || inL.value;
    var alt = bearbeitet ? null : lesenGespeichert();
    if (alt) {
      inW.value = alt.w;
      inL.value = alt.l;
      anwenden(alt.w, alt.l, false);
    }
    root.setAttribute('data-tp-rechner-bereit', '1');
    return true;
  }

  // Daten nachladen (data-tp-rechner-quelle): Inline im Hero kosteten sie die ganze Seite
  // je Teppich rund 5 ms Renderzeit. Wer vorher schon rechnet, wird nach dem Laden bedient.
  // Eine ?page=-Angabe geht mit, damit der Ruecksprung alter ?page=2-Links (init) weiter greift.
  function laden(root, abgeschickt) {
    var datenEl = root.querySelector('[data-tp-rechner-daten]');
    var quelle = datenEl && datenEl.getAttribute('data-tp-rechner-quelle');
    if (!quelle || datenEl.textContent.trim()) { init(root); return; }
    if (root.getAttribute('data-tp-rechner-laedt')) return;
    root.setAttribute('data-tp-rechner-laedt', '1');
    var form = root.querySelector('[data-tp-rechner]');
    if (form && !root.getAttribute('data-tp-rechner-beobachtet')) {
      root.setAttribute('data-tp-rechner-beobachtet', '1');
      form.addEventListener('input', function () { root.setAttribute('data-tp-rechner-bearbeitet', '1'); });
    }
    var wartet = !!abgeschickt;
    function frueh(e) { e.preventDefault(); wartet = true; }
    if (form) form.addEventListener('submit', frueh);
    var seite = new URL(window.location.href).searchParams.get('page');
    if (seite) quelle += (quelle.indexOf('?') < 0 ? '?' : '&') + 'page=' + encodeURIComponent(seite);
    fetch(quelle, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        datenLesen(text);
        datenEl.textContent = text;
        if (!init(root)) throw new Error('Rechner nicht bereit');
        if (form) form.removeEventListener('submit', frueh);
        if (wartet && form) {
          if (form.requestSubmit) form.requestSubmit();
          else form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      })
      .catch(function () {
        // Kein stilles Neuladen der Seite per Formular: Hinweis zeigen, naechster Versuch beim Absenden.
        root.removeAttribute('data-tp-rechner-laedt');
        datenEl.textContent = '';
        if (form) {
          form.removeEventListener('submit', frueh);
          form.addEventListener('submit', function erneut(e) {
            e.preventDefault();
            form.removeEventListener('submit', erneut);
            laden(root, true);
          });
        }
        if (wartet) wartetNachFehler(root);
      });
  }

  function wartetNachFehler(root) {
    var fehler = root.querySelector('[data-tp-rechner-fehler]');
    if (!fehler || root.getAttribute('data-tp-rechner-bereit')) return;
    fehler.textContent = 'Die Preise konnten gerade nicht geladen werden. Bitte gleich noch einmal versuchen.';
    fehler.hidden = false;
  }

  function alle() { document.querySelectorAll('[data-tp-rechner-root]').forEach(function (r) { laden(r); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alle);
  else alle();
  document.addEventListener('shopify:section:load', alle);
})();
