/*
  TP Schnellsuche unter der grossen Suchleiste (sections/tp-header-suche.liquid).

  Desktop und Tablet (ab 768 px): Ab zwei Zeichen laedt das Element die
  Shopify Predictive Search per Section Rendering API (Section
  "predictive-search", Markup aus snippets/tp-suche-ergebnisse.liquid) und
  zeigt sie als Dropdown unter dem Feld. Bei leerem Feld erscheinen die
  beliebten Bereiche und Suchbegriffe aus den Section-Einstellungen.

  Telefon (bis 767 px): Das Feld oeffnet das Horizon-Suchfenster (Lupe im
  Header), das dieselben Ergebnisse mit derselben Optik zeigt - dort sind
  klebendes Eingabefeld, Bildschirmtastatur und Schliessen bereits geloest.

  Anfragen: 150 ms entprellt, AbortController plus laufende Nummer, damit eine
  spaete Antwort ("vi") nie die aktuelle ("vinyl") ueberschreibt; Ergebnisse
  je Begriff im Speicher (max. 50 Eintraege, nur diese Seite).

  Sicherheit: Der Suchbegriff wird nie als HTML eingesetzt - nur per
  URLSearchParams, textContent und Liquid-escape im Snippet.

  Tracking-Vorbereitung: Das Element loest die Ereignisse "tp:suche"
  (Begriff, Anzahl Produkte, Treffer ja/nein) und "tp:suche:klick" (Typ, URL,
  Text, Begriff) auf document aus. Es setzt keine Cookies und schreibt nichts
  in Analytics - ein Consent-gesteuertes System kann die Ereignisse abonnieren.
*/
const MIN_ZEICHEN = 2;
const WARTEZEIT_MS = 150;
const LADE_ANZEIGE_MS = 250;
const CACHE_MAX = 50;

class TpSucheLeiste extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('form');
    this.input = this.querySelector('input[type="search"]');
    this.panel = this.querySelector('.tp-hs__panel');
    if (!this.form || !this.input || !this.panel) return;
    this.leer = this.panel.querySelector('[data-tp-leer]');
    this.ergebnisse = this.panel.querySelector('[data-tp-ergebnisse]');
    this.meinten = this.panel.querySelector('[data-tp-meinten]');
    this.telefon = window.matchMedia('(max-width: 767px)');
    this.cache = new Map();
    this.nummer = 0;
    this.laufend = null;
    this.timer = 0;
    this.ladeTimer = 0;
    this.offen = false;
    this.aktiv = -1;
    this.begriff = '';
    this.synonyme = this.#synonymeLesen();

    this.abbruch = new AbortController();
    const { signal } = this.abbruch;
    this.input.addEventListener('input', this.#onInput, { signal });
    this.input.addEventListener('focus', this.#onFocus, { signal });
    this.input.addEventListener('pointerdown', this.#onPointerDown, { signal });
    this.input.addEventListener('keydown', this.#onKeyDown, { signal });
    this.addEventListener('focusout', this.#onFocusOut, { signal });
    this.panel.addEventListener('click', this.#onPanelClick, { signal });
    this.panel.addEventListener('pointerdown', this.#onPanelPointerDown, { signal });
    document.addEventListener('pointerdown', this.#onDocPointerDown, { signal });
    window.addEventListener('pageshow', this.#onPageShow, { signal });
    this.telefon.addEventListener('change', this.#onTelefonWechsel, { signal });
  }

  disconnectedCallback() {
    this.abbruch?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.ladeTimer);
    this.laufend?.abort();
  }

  /* ---------- Ereignisse ---------- */

  #onPointerDown = (event) => {
    // Telefon: Suchfenster oeffnen. Nur pointerdown, nicht focus - beim
    // Schliessen gibt der Dialog den Fokus zurueck und wuerde sonst sofort
    // wieder oeffnen.
    if (!this.telefon.matches) return;
    const modal = document.getElementById('search-modal');
    if (!modal || typeof modal.showDialog !== 'function') return;
    event.preventDefault();
    const text = this.input.value;
    modal.showDialog();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ziel = modal.querySelector('input[type="search"]');
        if (!ziel) return;
        if (text) {
          ziel.value = text;
          ziel.dispatchEvent(new Event('input', { bubbles: true }));
        }
        ziel.focus();
      });
    });
  };

  #onFocus = () => {
    if (this.telefon.matches) return;
    this.#zeigen();
  };

  #onInput = () => {
    if (this.telefon.matches) return;
    this.#zeigen();
  };

  #onFocusOut = (event) => {
    const ziel = event.relatedTarget;
    if (ziel instanceof Node && this.contains(ziel)) return;
    this.#schliessen();
  };

  #onDocPointerDown = (event) => {
    if (!this.offen) return;
    if (event.target instanceof Node && this.contains(event.target)) return;
    this.#schliessen();
  };

  #onPageShow = (event) => {
    if (event.persisted) this.#schliessen();
  };

  #onTelefonWechsel = () => {
    if (this.telefon.matches) this.#schliessen();
  };

  #onPanelPointerDown = (event) => {
    // Klick auf Freiflaeche oder Rollbalken des Dropdowns: Fokus bleibt im
    // Feld, sonst schloesse focusout das Dropdown. Links und Knoepfe
    // bekommen den Fokus normal.
    const ziel = event.target instanceof Element ? event.target : null;
    if (ziel && ziel.closest('a, button, input')) return;
    event.preventDefault();
  };

  #onPanelClick = (event) => {
    const option = event.target instanceof Element ? event.target.closest('a[role="option"]') : null;
    if (!option) return;
    document.dispatchEvent(
      new CustomEvent('tp:suche:klick', {
        detail: {
          begriff: this.begriff,
          typ: option.dataset.tpTyp || 'link',
          url: option.href,
          text: (option.querySelector('[data-tp-titel]') || option).textContent.replace(/\s+/g, ' ').trim(),
        },
      })
    );
  };

  #onKeyDown = (event) => {
    if (this.telefon.matches) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.offen) this.#zeigen();
        this.#bewegen(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#bewegen(-1);
        break;
      case 'Home':
      case 'End':
        if (this.offen && this.aktiv >= 0) {
          event.preventDefault();
          this.#setzeAktiv(event.key === 'Home' ? 0 : this.#optionen().length - 1);
        }
        break;
      case 'Enter': {
        const option = this.#optionen()[this.aktiv];
        if (this.offen && option) {
          event.preventDefault();
          option.click();
        }
        break;
      }
      case 'Escape':
        if (this.offen) {
          event.preventDefault();
          this.#schliessen();
        }
        break;
      case 'Tab':
        // Fokus wandert weiter; focusout schliesst, sobald er das Element verlaesst.
        break;
      default:
        break;
    }
  };

  /* ---------- Zustand ---------- */

  #begriffLesen() {
    return this.input.value.replace(/\s+/g, ' ').trim();
  }

  #zeigen() {
    const begriff = this.#begriffLesen();
    clearTimeout(this.timer);
    if (begriff.length < MIN_ZEICHEN) {
      this.begriff = begriff;
      this.laufend?.abort();
      this.#ladeAnzeige(false);
      this.#meintenAnzeigen(begriff);
      this.#leerzustand();
      return;
    }
    if (begriff === this.begriff && this.ergebnisse.childElementCount > 0) {
      this.#oeffnen();
      return;
    }
    this.timer = setTimeout(() => this.#laden(begriff), WARTEZEIT_MS);
  }

  #leerzustand() {
    if (!this.leer || this.leer.childElementCount === 0) {
      // Keine Startinhalte konfiguriert: nichts oeffnen.
      if (this.ergebnisse.childElementCount === 0 && !this.meinten?.childElementCount) {
        this.#schliessen();
        return;
      }
    }
    this.ergebnisse.replaceChildren();
    if (this.leer) this.leer.hidden = false;
    this.#optionenNummerieren();
    this.#oeffnen();
  }

  async #laden(begriff) {
    const schluessel = begriff.toLocaleLowerCase('de');
    this.begriff = begriff;
    this.#meintenAnzeigen(begriff);
    const nummer = ++this.nummer;
    this.laufend?.abort();

    const treffer = this.cache.get(schluessel);
    if (treffer) {
      // Auch eine noch anstehende Ladeanzeige der abgebrochenen Anfrage loeschen.
      this.#ladeAnzeige(false);
      this.#einsetzen(treffer.cloneNode(true), begriff);
      return;
    }

    const steuerung = new AbortController();
    this.laufend = steuerung;
    this.#ladeAnzeige(true);

    try {
      const antwort = await fetch(this.#url(begriff), { signal: steuerung.signal, headers: { Accept: 'text/html' } });
      if (nummer !== this.nummer) return;
      if (!antwort.ok) throw new Error(`Suche antwortet mit ${antwort.status}`);
      const html = await antwort.text();
      if (nummer !== this.nummer) return;
      const dokument = new DOMParser().parseFromString(html, 'text/html');
      const knoten = dokument.querySelector('.tp-se');
      if (!knoten) throw new Error('Kein Suchergebnis im Markup');
      this.#cacheSetzen(schluessel, knoten.cloneNode(true));
      this.#einsetzen(knoten, begriff);
    } catch (fehler) {
      if (fehler?.name === 'AbortError' || nummer !== this.nummer) return;
      this.#fehler();
    } finally {
      if (nummer === this.nummer) this.#ladeAnzeige(false);
    }
  }

  #url(begriff) {
    const basis = (window.Theme && window.Theme.routes && window.Theme.routes.predictive_search_url) || '/search/suggest';
    const url = new URL(basis, window.location.origin);
    const p = url.searchParams;
    p.set('q', begriff);
    p.set('section_id', 'predictive-search');
    p.set('resources[type]', 'product,collection,query,page');
    p.set('resources[limit]', '6');
    p.set('resources[limit_scope]', 'each');
    p.set('resources[options][unavailable_products]', 'last');
    return url.toString();
  }

  #cacheSetzen(schluessel, knoten) {
    if (this.cache.size >= CACHE_MAX) {
      const aeltester = this.cache.keys().next().value;
      this.cache.delete(aeltester);
    }
    this.cache.set(schluessel, knoten);
  }

  #einsetzen(knoten, begriff) {
    if (this.leer) this.leer.hidden = true;
    this.#hervorheben(knoten, begriff);
    this.ergebnisse.replaceChildren(knoten);
    this.#optionenNummerieren();
    this.#oeffnen();
    const produkte = Number(knoten.getAttribute('data-tp-produkte') || 0);
    document.dispatchEvent(
      new CustomEvent('tp:suche', {
        detail: { begriff, produkte, treffer: !knoten.querySelector('.tp-se__leer') },
      })
    );
  }

  #fehler() {
    if (this.leer) this.leer.hidden = true;
    const hinweis = document.createElement('p');
    hinweis.className = 'tp-hs__hinweis';
    hinweis.textContent = 'Die Schnellsuche ist gerade nicht erreichbar. Mit Enter öffnen Sie die Ergebnisseite.';
    this.ergebnisse.replaceChildren(hinweis);
    this.#optionenNummerieren();
    this.#oeffnen();
  }

  #ladeAnzeige(an) {
    clearTimeout(this.ladeTimer);
    if (an) {
      this.ladeTimer = setTimeout(() => {
        this.panel.classList.add('tp-hs__panel--laedt');
        this.input.setAttribute('aria-busy', 'true');
      }, LADE_ANZEIGE_MS);
      return;
    }
    this.panel.classList.remove('tp-hs__panel--laedt');
    this.input.removeAttribute('aria-busy');
  }

  #oeffnen() {
    if (this.telefon.matches) return;
    this.panel.hidden = false;
    this.offen = true;
    this.input.setAttribute('aria-expanded', 'true');
    this.classList.add('tp-hs__leiste--offen');
  }

  #schliessen() {
    clearTimeout(this.timer);
    this.panel.hidden = true;
    this.offen = false;
    this.#setzeAktiv(-1);
    this.input.setAttribute('aria-expanded', 'false');
    this.classList.remove('tp-hs__leiste--offen');
  }

  /* ---------- Optionen und Tastatur ---------- */

  #optionen() {
    return Array.from(this.panel.querySelectorAll('a[role="option"]')).filter((el) => {
      const gruppe = el.closest('[hidden]');
      return !gruppe;
    });
  }

  #optionenNummerieren() {
    this.aktiv = -1;
    this.input.removeAttribute('aria-activedescendant');
    this.panel.querySelectorAll('a[role="option"]').forEach((el, i) => {
      el.id = `tp-hs-option-${i}`;
      el.removeAttribute('aria-selected');
    });
  }

  #bewegen(schritt) {
    const optionen = this.#optionen();
    if (!optionen.length) return;
    let ziel = this.aktiv + schritt;
    if (ziel >= optionen.length) ziel = 0;
    if (ziel < 0) ziel = optionen.length - 1;
    this.#setzeAktiv(ziel);
  }

  #setzeAktiv(index) {
    const optionen = this.#optionen();
    optionen.forEach((el) => el.removeAttribute('aria-selected'));
    this.aktiv = index;
    const option = optionen[index];
    if (!option) {
      this.input.removeAttribute('aria-activedescendant');
      return;
    }
    option.setAttribute('aria-selected', 'true');
    this.input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Hervorhebung ---------- */

  #hervorheben(knoten, begriff) {
    const woerter = begriff
      .split(' ')
      .filter((w) => w.length >= 2)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!woerter.length) return;
    const muster = new RegExp(`(${woerter.join('|')})`, 'iu');
    knoten.querySelectorAll('[data-tp-titel]').forEach((titel) => {
      const laeufer = document.createTreeWalker(titel, NodeFilter.SHOW_TEXT);
      const texte = [];
      while (laeufer.nextNode()) texte.push(laeufer.currentNode);
      texte.forEach((text) => {
        const teile = text.data.split(muster);
        if (teile.length < 2) return;
        const fragment = document.createDocumentFragment();
        teile.forEach((teil, i) => {
          if (!teil) return;
          if (i % 2 === 1) {
            const mark = document.createElement('mark');
            mark.className = 'tp-se__mark';
            mark.textContent = teil;
            fragment.appendChild(mark);
          } else {
            fragment.appendChild(document.createTextNode(teil));
          }
        });
        text.replaceWith(fragment);
      });
    });
  }

  /* ---------- "Meinten Sie" aus den Section-Einstellungen ---------- */

  #synonymeLesen() {
    const quelle = this.querySelector('script[data-tp-synonyme]');
    if (!quelle) return [];
    let text = '';
    try {
      text = JSON.parse(quelle.textContent || '""');
    } catch {
      return [];
    }
    if (typeof text !== 'string') return [];
    return text
      .split('\n')
      .map((zeile) => zeile.trim())
      .filter((zeile) => zeile.includes(':'))
      .map((zeile) => {
        const [links, rechts] = zeile.split(':', 2);
        return {
          begriffe: links.split(',').map((s) => s.trim().toLocaleLowerCase('de')).filter(Boolean),
          ziele: rechts.split(',').map((s) => s.trim()).filter(Boolean),
        };
      })
      .filter((eintrag) => eintrag.begriffe.length && eintrag.ziele.length);
  }

  #meintenAnzeigen(begriff) {
    if (!this.meinten) return;
    const klein = begriff.toLocaleLowerCase('de');
    const ziele = [];
    if (klein.length >= MIN_ZEICHEN) {
      this.synonyme.forEach((eintrag) => {
        if (eintrag.begriffe.some((b) => klein.includes(b))) {
          eintrag.ziele.forEach((z) => {
            if (!ziele.includes(z) && z.toLocaleLowerCase('de') !== klein) ziele.push(z);
          });
        }
      });
    }
    this.meinten.replaceChildren();
    this.meinten.hidden = ziele.length === 0;
    if (!ziele.length) return;
    const titel = document.createElement('h3');
    titel.className = 'tp-se__h';
    titel.textContent = 'Meinten Sie';
    const liste = document.createElement('ul');
    liste.className = 'tp-se__liste tp-se__liste--chips';
    liste.setAttribute('role', 'presentation');
    const suchUrl = (window.Theme && window.Theme.routes && window.Theme.routes.search_url) || '/search';
    ziele.slice(0, 4).forEach((ziel) => {
      const li = document.createElement('li');
      li.className = 'tp-se__item';
      li.setAttribute('role', 'presentation');
      const a = document.createElement('a');
      a.className = 'tp-se__chip';
      a.setAttribute('role', 'option');
      a.dataset.tpTyp = 'meinten';
      const url = new URL(suchUrl, window.location.origin);
      url.searchParams.set('q', ziel);
      url.searchParams.set('type', 'product,collection,page');
      a.href = url.toString();
      a.textContent = ziel;
      li.appendChild(a);
      liste.appendChild(li);
    });
    this.meinten.append(titel, liste);
  }
}

if (!customElements.get('tp-suche-leiste')) {
  customElements.define('tp-suche-leiste', TpSucheLeiste);
}
