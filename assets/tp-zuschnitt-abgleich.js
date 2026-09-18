/*
 * Zuschnittangaben im Warenkorb abgleichen.
 *
 * Der Lieferschein kennt line_item.properties nicht, nur order.attributes.
 * Jede konfigurierte Position traegt deshalb ihre Zuschnittangabe selbst
 * (_Zuschnitt, dazu _Gruppe), und die Warenkorbattribute sind nur deren
 * Abbild: genau ein Attribut "Zuschnitt <Gruppe>" je Position, sonst keins.
 * Entfernte oder neu konfigurierte Positionen verlieren ihr Attribut beim
 * naechsten Abgleich. Die Quelle der Wahrheit ist die Zeile, nie das Attribut.
 *
 * Fail closed: snippets/tp-cart-gruppe.liquid sperrt den Checkout serverseitig,
 * solange Attribute und Zeilen nicht uebereinstimmen. Dieses Skript hebt die
 * Sperre nur auf, indem es den Abgleich tatsaechlich schreibt und gegenprueft.
 *
 * Reine Funktion sollAttribute() ist fuer die Tests exportiert (module.exports).
 */
(function (global) {
  var PRAEFIX = 'Zuschnitt ';
  var QUELLE = 'tp-zuschnitt-abgleich';

  // Aus den Zeilen: welche Zuschnitt-Attribute muessen gesetzt sein, welche
  // muessen weg? Leerer Wert loescht ein Attribut bei /cart/update.js.
  function sollAttribute(cart) {
    var soll = {};
    ((cart && cart.items) || []).forEach(function (it) {
      var p = it.properties || {};
      var text = p._Zuschnitt;
      var gruppe = p._Gruppe;
      if (text && gruppe) soll[PRAEFIX + gruppe] = String(text);
    });
    var ist = (cart && cart.attributes) || {};
    var aenderung = {};
    var noetig = false;
    Object.keys(soll).forEach(function (k) {
      if (ist[k] !== soll[k]) { aenderung[k] = soll[k]; noetig = true; }
    });
    Object.keys(ist).forEach(function (k) {
      if (k.indexOf(PRAEFIX) === 0 && !(k in soll) && ist[k] !== '' && ist[k] != null) {
        aenderung[k] = '';
        noetig = true;
      }
    });
    return { soll: soll, aenderung: aenderung, noetig: noetig };
  }

  function json(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function einmal() {
    return fetch('/cart.js', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(json)
      .then(function (cart) {
        var plan = sollAttribute(cart);
        if (!plan.noetig) return { geaendert: false, cart: cart };
        return fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ attributes: plan.aenderung })
        })
          .then(json)
          .then(function (neu) {
            // Gegenprobe am zurueckgegebenen Warenkorb - HTTP 200 allein belegt nichts.
            if (sollAttribute(neu).noetig) throw new Error('Abgleich nicht uebernommen');
            return { geaendert: true, cart: neu };
          });
      });
  }

  // Aufrufe laufen nacheinander, damit sich zwei Abgleiche nicht ueberholen.
  var kette = Promise.resolve();
  function abgleichen() {
    var lauf = kette.then(einmal, einmal);
    kette = lauf.catch(function () {});
    return lauf;
  }

  function fehlerZeigen(an) {
    var sperre = document.querySelector('[data-tp-cart-gesperrt]');
    var ziel = sperre || an;
    if (!ziel) return;
    var p = ziel.querySelector('[data-tp-zuschnitt-fehler]');
    if (!p) {
      p = document.createElement('p');
      p.setAttribute('data-tp-zuschnitt-fehler', '');
      p.setAttribute('role', 'alert');
      p.className = 'tp-cart-sperre__fehler';
      ziel.appendChild(p);
    }
    p.textContent = 'Die Zuschnittangaben konnten nicht gespeichert werden. Bitte „Erneut abgleichen" wählen.';
  }

  // Warenkorb neu rendern lassen, damit die serverseitige Sperre verschwindet.
  // resource und itemCount muessen echt sein: cart-icon.js setzt die Blase
  // sonst auf 0.
  function neuZeichnen(cart) {
    document.dispatchEvent(new CustomEvent('cart:update', {
      bubbles: true,
      detail: { resource: cart, sourceId: QUELLE, data: { source: QUELLE, itemCount: cart.item_count } }
    }));
  }

  function abgleichenUndZeichnen() {
    return abgleichen().then(function (e) {
      if (e.geaendert) neuZeichnen(e.cart);
      return e;
    });
  }

  if (typeof document !== 'undefined' && !global.TPZuschnitt) {
    global.TPZuschnitt = { abgleichen: abgleichen, abgleichenUndZeichnen: abgleichenUndZeichnen, fehlerZeigen: fehlerZeigen };

    document.addEventListener('cart:update', function (e) {
      var q = e.detail && e.detail.data && e.detail.data.source;
      if (q === QUELLE) return;
      abgleichenUndZeichnen().catch(function () { fehlerZeigen(); });
    });

    document.addEventListener('click', function (e) {
      var knopf = e.target && e.target.closest && e.target.closest('[data-tp-zuschnitt-abgleich]');
      if (!knopf) return;
      e.preventDefault();
      knopf.disabled = true;
      abgleichen()
        .then(function (e) { neuZeichnen(e.cart); })
        .catch(function () { fehlerZeigen(); })
        .then(function () { knopf.disabled = false; });
    });

    // Beim Laden einmal: faengt Aenderungen ab, die ohne Ereignis passierten
    // (z. B. Entfernen per Link ohne JavaScript, zweiter Tab).
    var start = function () { abgleichenUndZeichnen().catch(function () { fehlerZeigen(); }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { sollAttribute: sollAttribute };
})(typeof window !== 'undefined' ? window : globalThis);
