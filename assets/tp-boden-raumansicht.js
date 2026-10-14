// Raumansicht fuer Hartboeden (blocks/tp-boden-raumansicht.liquid):
// oeffnet den Dialog und schaltet die Verlegerichtung um. Das Dekorbild ist
// ein CSS-Hintergrund im Dialog und laedt erst, wenn der Dialog offen ist.
class TpBodenRaumansicht extends HTMLElement {
  #abort = new AbortController();

  connectedCallback() {
    this.#abort = new AbortController();
    const signal = this.#abort.signal;
    const dialog = this.querySelector('.tp-raum__dialog');
    if (!dialog) return;
    this.querySelector('[data-tp-raum-open]')?.addEventListener('click', () => dialog.showModal(), { signal });
    this.querySelector('[data-tp-raum-close]')?.addEventListener('click', () => dialog.close(), { signal });
    // Klick auf den abgedunkelten Hintergrund schliesst ebenfalls (nicht der Innenrand)
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const innen = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!innen) dialog.close();
    }, { signal });
    this.querySelectorAll('[data-tp-raum-richtung]').forEach((knopf) => {
      knopf.addEventListener('click', () => this.richtung(knopf.dataset.tpRaumRichtung), { signal });
    });
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  richtung(wert) {
    this.dataset.richtung = wert;
    this.querySelectorAll('[data-tp-raum-richtung]').forEach((knopf) => {
      knopf.setAttribute('aria-pressed', String(knopf.dataset.tpRaumRichtung === wert));
    });
  }
}

if (!customElements.get('tp-boden-raumansicht')) {
  customElements.define('tp-boden-raumansicht', TpBodenRaumansicht);
}
