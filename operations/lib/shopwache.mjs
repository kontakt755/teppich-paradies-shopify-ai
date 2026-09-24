/**
 * Shop-Wache: prueft den oeffentlichen Shop von aussen, so wie ein Kunde ihn
 * sieht. Das Control Center kannte bisher nur die Daten aus dem Admin - ob
 * die Seite ueberhaupt laeuft, ob Rechtstexte erreichbar sind und ob der
 * Preis auf der Produktseite zu unseren Daten passt, sah niemand.
 *
 * Reine Auswertung: `pruefe()` bekommt eine `holen`-Funktion hereingereicht
 * (in den Tests ein Ersatz, im Betrieb `fetch`) und faellt nie mit einer
 * Ausnahme aus - ein nicht erreichbarer Shop ist ein Befund, kein Absturz.
 *
 * Schweregrade: 'kritisch' (Kunde kann nicht kaufen), 'warnung' (faellt auf,
 * kostet aber keinen Umsatz), 'ok'.
 */

/** Seiten, die immer erreichbar sein muessen. Rechtstexte sind Pflicht (§5 TMG, Widerruf). */
export const PFLICHTSEITEN = Object.freeze([
  { pfad: '/', name: 'Startseite', art: 'kritisch' },
  { pfad: '/cart', name: 'Warenkorb', art: 'kritisch' },
  { pfad: '/search?q=teppich', name: 'Suche', art: 'warnung' },
  { pfad: '/policies/legal-notice', name: 'Impressum', art: 'kritisch' },
  { pfad: '/policies/terms-of-service', name: 'AGB', art: 'kritisch' },
  { pfad: '/policies/refund-policy', name: 'Widerrufsbelehrung', art: 'kritisch' },
  { pfad: '/policies/privacy-policy', name: 'Datenschutz', art: 'kritisch' },
]);

/** Ueber dieser Ladezeit (ms) faellt eine Seite negativ auf - Kunden springen ab. */
export const LANGSAM_MS = 3000;

function befund(art, titel, text, extra = {}) {
  return { art, titel, text, ...extra };
}

/** Eine Seite holen und Dauer messen. Fehler werden zu einem Befund, nie zu einer Ausnahme. */
export async function holeSeite(holen, url, { zeitgrenzeMs = 15000 } = {}) {
  const start = Date.now();
  try {
    const antwort = await holen(url, { redirect: 'follow', zeitgrenzeMs });
    const text = typeof antwort?.text === 'function' ? await antwort.text() : '';
    return { url, status: antwort?.status ?? 0, dauerMs: Date.now() - start, text, fehler: null };
  } catch (e) {
    return { url, status: 0, dauerMs: Date.now() - start, text: '', fehler: e?.message || String(e) };
  }
}

/**
 * Preis auf der Produktseite gegen den erwarteten Wert. Shopify liefert unter
 * <handle>.js die Varianten als JSON - genauer als im HTML zu suchen.
 * Abweichung ab einem Cent ist ein Befund: dann stimmt entweder unsere
 * Datenbasis nicht oder im Shop steht ein falscher Preis.
 */
export function preisBefunde(produktJson, erwartet) {
  const varianten = produktJson?.variants;
  if (!Array.isArray(varianten) || !varianten.length) {
    return [befund('warnung', 'Produktseite ohne Varianten', `${erwartet?.handle ?? 'Produkt'}: die Seite liefert keine Varianten - Produkt entfernt oder umbenannt?`)];
  }
  if (erwartet?.preis === null || erwartet?.preis === undefined) return [];
  const ist = Number(varianten[0].price) / 100;
  if (!Number.isFinite(ist)) return [];
  if (Math.abs(ist - erwartet.preis) < 0.01) return [];
  return [befund('kritisch', 'Preis weicht ab',
    `${erwartet.handle}: im Shop ${ist.toFixed(2)} €, in unseren Daten ${Number(erwartet.preis).toFixed(2)} €`,
    { handle: erwartet.handle, imShop: ist, beiUns: erwartet.preis })];
}

/** Bewertet eine geholte Seite. */
export function seitenBefunde(seite, vorgabe) {
  if (seite.fehler) {
    return [befund(vorgabe.art, `${vorgabe.name} nicht erreichbar`, `${seite.url}: ${seite.fehler}`)];
  }
  if (seite.status >= 400 || seite.status === 0) {
    return [befund(vorgabe.art, `${vorgabe.name} antwortet mit ${seite.status}`, seite.url)];
  }
  const raus = [];
  if (seite.dauerMs > LANGSAM_MS) {
    raus.push(befund('warnung', `${vorgabe.name} laedt langsam`, `${(seite.dauerMs / 1000).toFixed(1)} s - ueber ${(LANGSAM_MS / 1000).toFixed(0)} s springen Kunden ab`));
  }
  return raus;
}

/**
 * Kompletter Lauf.
 * @param {(url: string, opt?: object) => Promise<{status:number, text:() => Promise<string>}>} holen
 * @param {{basis: string, stichproben?: Array<{handle: string, preis: number|null}>, jetzt?: Date}} opt
 */
export async function pruefe(holen, { basis, stichproben = [], jetzt = new Date() } = {}) {
  if (!basis) throw new Error('basis (Shop-URL) fehlt');
  const wurzel = String(basis).replace(/\/$/, '');
  const seiten = [];
  const befunde = [];

  for (const vorgabe of PFLICHTSEITEN) {
    const seite = await holeSeite(holen, `${wurzel}${vorgabe.pfad}`);
    seiten.push({ name: vorgabe.name, pfad: vorgabe.pfad, status: seite.status, dauerMs: seite.dauerMs, fehler: seite.fehler });
    befunde.push(...seitenBefunde(seite, vorgabe));
  }

  const geprueftePreise = [];
  for (const probe of stichproben) {
    const seite = await holeSeite(holen, `${wurzel}/products/${probe.handle}.js`);
    if (seite.fehler || seite.status >= 400) {
      befunde.push(befund('kritisch', 'Produktseite nicht erreichbar', `${probe.handle}: ${seite.fehler || `HTTP ${seite.status}`}`, { handle: probe.handle }));
      continue;
    }
    let daten = null;
    try { daten = JSON.parse(seite.text); } catch { daten = null; }
    if (!daten) {
      befunde.push(befund('warnung', 'Produktdaten unlesbar', `${probe.handle}: Antwort ist kein JSON`, { handle: probe.handle }));
      continue;
    }
    const neue = preisBefunde(daten, probe);
    befunde.push(...neue);
    geprueftePreise.push({ handle: probe.handle, beiUns: probe.preis ?? null, imShop: Number(daten.variants?.[0]?.price) / 100 || null, inOrdnung: neue.length === 0 });
  }

  const kritisch = befunde.filter(b => b.art === 'kritisch').length;
  const warnungen = befunde.filter(b => b.art === 'warnung').length;
  return {
    geprueftAm: jetzt.toISOString(),
    basis: wurzel,
    ampel: kritisch ? 'rot' : warnungen ? 'gelb' : 'gruen',
    kritisch,
    warnungen,
    seiten,
    preise: geprueftePreise,
    befunde,
  };
}
