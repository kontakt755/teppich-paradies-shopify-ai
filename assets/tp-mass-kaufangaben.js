/*
  Farbwechsel auf der Produktseite eines Teppichs nach Mass: Preisbeispiele und Kauffragen
  (blocks/tp-mass-preisbeispiele, blocks/tp-mass-faq) kommen immer aus der Serverausgabe
  fuer die gewaehlte Farbe. Hier wird nichts gerechnet.
  - variant:update (Horizons Variantenwaehler) bringt das HTML schon mit.
  - tp:farbe-wechsel (blocks/color-swatch-picker) bringt nur die Variante: dann die Section
    fuer diese Farbe laden. Die Adresse bleibt erhalten, sonst kaeme die Section in einer
    Theme-Vorschau aus dem Live-Theme. Eine veraltete Antwort wird verworfen.
*/
if (!window.__tpMassKaufangaben) {
  window.__tpMassKaufangaben = true;

  const uebernehmen = (html) => {
    document.querySelectorAll('[data-tp-mass-neu]').forEach((alt) => {
      const neu = html.querySelector(`[data-tp-mass-neu="${alt.dataset.tpMassNeu}"]`);
      if (!neu) return;
      alt.innerHTML = neu.innerHTML;
      alt.hidden = neu.hidden;
    });
  };

  document.addEventListener('variant:update', (e) => {
    const html = e.detail?.data?.html;
    if (html) uebernehmen(html);
  });

  let zuletzt = '';
  document.addEventListener('tp:farbe-wechsel', async (e) => {
    const variante = String(e.detail?.variantId || '');
    const section = document.querySelector('[data-tp-mass-neu]')?.closest('.shopify-section');
    if (!variante || !section?.id.startsWith('shopify-section-')) return;
    zuletzt = variante;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variante);
    url.searchParams.set('section_id', section.id.slice('shopify-section-'.length));
    try {
      const antwort = await fetch(url);
      if (!antwort.ok || zuletzt !== variante) return;
      const text = await antwort.text();
      if (zuletzt !== variante) return;
      uebernehmen(new DOMParser().parseFromString(text, 'text/html'));
    } catch (fehler) {
      console.warn('[tp-mass-kaufangaben] Preisbeispiele nicht aktualisiert', fehler);
    }
  });
}
