/*
  Farbwechsel auf der Produktseite eines Teppichs nach Mass: Preisbeispiele, Kauffragen
  (blocks/tp-mass-preisbeispiele, blocks/tp-mass-faq) und der FAQPage-Knoten kommen immer aus
  der Serverausgabe fuer die gewaehlte Farbe. Hier wird nichts gerechnet und kein Text gebaut.
  - variant:update (Horizons Variantenwaehler) bringt das HTML schon mit.
  - tp:farbe-wechsel (blocks/color-swatch-picker) bringt nur die Variante: dann die Section
    fuer diese Farbe laden. Die Adresse bleibt erhalten, sonst kaeme die Section in einer
    Theme-Vorschau aus dem Live-Theme. Eine veraltete Antwort wird verworfen.

  Der Knoten steht in derselben Section (snippets/tp-product-structured-data), wird von den
  Bloecken aber nicht mit ersetzt. Ohne das Nachziehen stuende im JSON-LD noch der Preis der
  vorigen Farbe. Beim ersten Laden stimmt er schon: Knoten und Block rendern dieselbe Variante.
*/
if (!window.__tpMassKaufangaben) {
  window.__tpMassKaufangaben = true;

  const faqKnoten = (wurzel) =>
    [...wurzel.querySelectorAll('script[type="application/ld+json"]')].find((s) => s.textContent.includes('"FAQPage"'));

  const uebernehmen = (html) => {
    let gefunden = false;
    document.querySelectorAll('[data-tp-mass-neu]').forEach((alt) => {
      const neu = html.querySelector(`[data-tp-mass-neu="${alt.dataset.tpMassNeu}"]`);
      if (!neu) return;
      gefunden = true;
      alt.innerHTML = neu.innerHTML;
      alt.hidden = neu.hidden;
    });
    // Ohne unsere Bloecke ist die Antwort keine vollstaendige Section: Knoten nicht anfassen.
    if (!gefunden) return;
    const knotenAlt = faqKnoten(document);
    const knotenNeu = faqKnoten(html);
    if (knotenAlt && knotenNeu) knotenAlt.textContent = knotenNeu.textContent;
    else if (knotenAlt) knotenAlt.remove();
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
