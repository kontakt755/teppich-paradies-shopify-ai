/*
 * Haelt die Groessenauswahl einer Darstellungs-Gruppe mit dem
 * Variantenwaehler in Takt (siehe snippets/tp-produktgruppe-liste.liquid).
 *
 * Der Variantenwaehler tauscht die Farbe ohne Seitenwechsel aus. Die
 * Groessenlinks zeigen dann noch auf die Variante, die beim Seitenaufbau
 * gewaehlt war. Dieses Skript zieht Link, Preis und Verfuegbarkeit auf die
 * gerade gewaehlte Farbe nach - anhand der Tabelle, die Liquid je Groesse
 * mitliefert. Es erfindet keine Varianten: fehlt die Farbe in einer Groesse,
 * bleibt der Link auf dem Produkt ohne Variantenangabe stehen.
 */
(() => {
  const SELECTOR = '[data-tp-groessen]';

  const daten = (item) => {
    const script = item.querySelector('.tp-groessen__daten');
    if (!script) return null;
    try {
      return JSON.parse(script.textContent);
    } catch {
      return null;
    }
  };

  const gewaehlteFarbe = (wurzel) => {
    const radio = wurzel.querySelector('variant-picker input[type="radio"]:checked');
    if (radio) return radio.value;
    const select = wurzel.querySelector('variant-picker select');
    if (select) return select.value;
    const fallback = wurzel.querySelector('input[type="radio"]:checked');
    return fallback ? fallback.value : null;
  };

  const aktualisieren = () => {
    document.querySelectorAll(SELECTOR).forEach((block) => {
      const wurzel = block.closest('product-details, .product-information, main') || document;
      const farbe = gewaehlteFarbe(wurzel);
      if (!farbe) return;

      block.querySelectorAll('.tp-groessen__item').forEach((item) => {
        const info = daten(item);
        const link = item.querySelector('[data-tp-groesse]');
        if (!info || !link) return;

        const treffer = info.farben ? info.farben[farbe] : null;
        link.href = treffer ? treffer.url : info.url;

        const preis = item.querySelector('.tp-groessen__price');
        if (preis && treffer) preis.textContent = treffer.preis;

        const verfuegbar = treffer ? treffer.verfuegbar : true;
        link.classList.toggle('tp-groessen__option--soldout', !verfuegbar);
        const hinweis = item.querySelector('.tp-groessen__hint');
        if (hinweis) hinweis.hidden = verfuegbar;
      });
    });
  };

  // Der Variantenwaehler meldet den Wechsel nicht einheitlich; deshalb auf die
  // Interaktion selbst hoeren und danach einmal nachfassen, falls der Waehler
  // den Zustand erst im naechsten Frame setzt.
  const anstossen = () => {
    aktualisieren();
    requestAnimationFrame(aktualisieren);
    setTimeout(aktualisieren, 250);
  };

  document.addEventListener('change', anstossen);
  document.addEventListener('click', (event) => {
    if (event.target.closest('variant-picker')) anstossen();
  });
  document.addEventListener('variant:update', anstossen);
  document.addEventListener('DOMContentLoaded', aktualisieren);
  aktualisieren();
})();
