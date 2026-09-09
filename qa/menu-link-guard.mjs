/**
 * Findet Menuelinks, die auf ein leeres Produktraster oder ins Nichts zeigen.
 *
 * ─── Wonach gesucht wird ───────────────────────────────────────────────
 * Zwei Sorten toter Link, beide im Menue nicht sichtbar:
 *
 *   1. HTTP 404 — die Kollektion oder Seite gibt es nicht (mehr).
 *   2. Leeres Raster — die URL laedt mit 200, das Produktraster ist aber
 *      leer. Entsteht bei Filterlinks der Form
 *      /collections/<x>?filter.p.m.custom.<feld>=<Metaobjekt>, wenn kein
 *      Produkt in <x> diesen Wert traegt.
 *
 * Fall 2 hat zwei verschiedene Ursachen, die der Guard nicht unterscheidet
 * und auch nicht unterscheiden muss — er meldet den Zustand, die Ursache
 * klaert der Mensch:
 *   - das Metafeld fehlt an den Produkten (Vinyl, Commit 108467d), oder
 *   - der Filter hat den falschen Scope: der Wert stimmt, aber die
 *     Produkte liegen in einer anderen Kollektion (Bodenleisten, #123).
 *
 * ─── Warum ein Guard und keine Sichtpruefung ───────────────────────────
 * Ein toter Filterlink sieht im Menue exakt aus wie ein lebender. Er faellt
 * nur auf, wenn jemand ihn anklickt — im Theme-Editor klickt aber niemand
 * die Storefront durch. Beide bekannten Faelle standen wochenlang live:
 * drei von vier Punkten im Zweig Bodenleisten lieferten ein leeres Raster.
 *
 * ─── Warum die Storefront und nicht die Admin API ──────────────────────
 * Der Guard liest das gerenderte Menue aus dem HTML der Startseite. Das
 * braucht kein Token, laeuft also ueberall, und es prueft das, was der
 * Kunde tatsaechlich sieht — nicht das, was im Menuebaum steht.
 *
 * Ohne Netz (Remote-Session, Egress-Policy blockt die Storefront) meldet er
 * SKIP statt Fehler: hier ist Struktur pruefbar, das Aussehen nicht.
 */

/** Erkennt die Leermeldung des Rasters in den Sprachen, die der Shop faehrt. */
const LEER_MARKER = /no products found|keine produkte|nichts gefunden/i;

/** Menuelinks aus dem gerenderten Kopfbereich. */
export function extractMenuLinks(html) {
  const links = new Map();
  const nav = html.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? html;
  for (const m of nav.matchAll(/href="([^"]*(?:\/collections\/|\/pages\/)[^"]*)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (!links.has(url)) links.set(url, true);
  }
  return [...links.keys()];
}

/** Bewertet eine abgerufene Seite. */
export function classify({ url, status, body }) {
  if (status !== 200) {
    return { url, severity: 'error', rule: 'MENU_LINK_TOT', message: `HTTP ${status}: ${url}` };
  }
  if (LEER_MARKER.test(body)) {
    return {
      url, severity: 'error', rule: 'MENU_LINK_LEER',
      message: `Leeres Produktraster: ${url}\n`
        + '        Ursache pruefen: fehlt das Metafeld an den Produkten, oder '
        + 'filtert der Link in einer Kollektion, in der die Produkte nicht liegen?',
    };
  }
  return { url, severity: 'ok', rule: 'MENU_LINK_OK', message: url };
}
