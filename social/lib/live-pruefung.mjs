/**
 * Live-Pruefung vor dem Posten (Rundgang 26.10.2026, Massnahme #70).
 *
 * Bis dahin prueften nur Produkt-Reels den Shop direkt vor dem Posten. Story, Feed und
 * Karussell gingen auch dann raus, wenn das Produkt inzwischen archiviert war (Novaris leitete
 * per 301 auf ein anderes Produkt um, Aalborg auf die Kollektion), Auslaufware war ("Neu bei uns:
 * Armonia", Tag auslauf seit 06.10.) oder der Preis im Bild nicht mehr stimmte (Novira: 90,69 im
 * Bild, 90,50 im Shop).
 *
 * Hier wird fuer jeden Beitrag mit Produkt gefragt:
 *   - /products/<handle>.js: 404 oder 301 -> nicht mehr im Shop; Tag "auslauf" -> wird nicht beworben
 *   - ein gedruckter Quadratmeterpreis (Bild, Text) muss auf der Produktseite stehen
 *   - eine Farbzahl im Text muss zu den Farben im Shop passen
 * Jede Abweichung ist eine Sperre. Ist der Shop nicht erreichbar, wartet der Beitrag (`warten`).
 *
 * Nur lesende Abrufe des oeffentlichen Shops - kein Meta-Aufruf, kein Schreibzugriff.
 */

import { BETRIEB } from './konfig.mjs';
import { zahlenImText } from './doppelungen.mjs';
import { hauptText } from './produkt-reel.mjs';
import { preisText } from './werkstatt.mjs';

export const LIVE_REGELN = Object.freeze({
  // So viele Produkte eines Beitrags werden direkt vor dem Posten abgefragt: das Hauptprodukt und
  // die ersten Mitglieder einer Serie (das sind die, die auf den Folien stehen). Den Rest einer
  // grossen Serie (JAB: 72) gleicht der taegliche Shop-Abgleich ueber den Produktfeed ab.
  hoechstensProdukte: 10,
  pauseMs: 400,
});

/** Der Shop hat nicht verwertbar geantwortet (Netz, 5xx, 429, Bot-Pruefung) - spaeter erneut versuchen. */
export class ShopNichtErreichbar extends Error {}

const KOPF = { 'User-Agent': 'Mozilla/5.0 (Teppich Paradies Social-Pruefung)' };
const pause = ms => new Promise(r => setTimeout(r, ms));

/** Die Produkte eines Beitrags, Hauptprodukt zuerst. */
export function produktHandles(inhalt) {
  return [...new Set([inhalt?.produkt_handle, ...(inhalt?.daten?.produkte ?? [])].filter(h => typeof h === 'string' && h))];
}

function zielPfad(ort) {
  if (!ort) return null;
  try { return new URL(ort, BETRIEB.shop).pathname; } catch { return String(ort); }
}

async function abrufen(holen, url, accept) {
  try {
    return await holen(url, { headers: { ...KOPF, Accept: accept }, redirect: 'manual' });
  } catch (e) {
    throw new ShopNichtErreichbar(`${url.replace(BETRIEB.shop, '')}: ${e.message}`);
  }
}

/** Antwort auf eine Weiterleitung oder ein Fehlen - null, wenn die Antwort normal weiterverarbeitet wird. */
function endgueltig(antwort) {
  const status = Number(antwort.status);
  if (status === 404 || status === 410) return { zustand: 'fehlt' };
  // 301/308: Shopify-Weiterleitung eines archivierten Produkts. 302/307 sind voruebergehend (z. B. Wartung).
  if (status === 301 || status === 308) return { zustand: 'umgeleitet', ziel: zielPfad(antwort.headers?.get?.('location')) };
  return null;
}

/**
 * Fragt /products/<handle>.js ab, ohne Weiterleitungen zu folgen.
 * @returns {{zustand: 'aktiv', produkt} | {zustand: 'fehlt'} | {zustand: 'umgeleitet', ziel}}
 * @throws ShopNichtErreichbar
 */
export async function produktLive(handle, { holen = globalThis.fetch, basis = BETRIEB.shop } = {}) {
  const antwort = await abrufen(holen, `${basis}/products/${handle}.js`, 'application/json');
  const ende = endgueltig(antwort);
  if (ende) return ende;
  if (!antwort.ok) throw new ShopNichtErreichbar(`Shop antwortet mit HTTP ${antwort.status} auf ${handle}.js`);
  const roh = String(await antwort.text());
  if (roh.trimStart().startsWith('<')) throw new ShopNichtErreichbar('Shop zeigt eine Bot-Prüfung statt der Produktdaten');
  let produkt;
  try { produkt = JSON.parse(roh); } catch { throw new ShopNichtErreichbar(`${handle}.js ist kein JSON`); }
  // Folgt der Abruf doch einer Weiterleitung, kommt ein anderes Produkt zurueck.
  if (antwort.redirected || (produkt.handle && produkt.handle !== handle)) {
    return { zustand: 'umgeleitet', ziel: produkt.handle ? `/products/${produkt.handle}` : null };
  }
  return { zustand: 'aktiv', produkt };
}

/** Sichtbarer Text der Produktseite (<main>) - dort stehen Preis und Grundpreis. */
export async function seitenText(handle, { holen = globalThis.fetch, basis = BETRIEB.shop } = {}) {
  const antwort = await abrufen(holen, `${basis}/products/${handle}`, 'text/html');
  const ende = endgueltig(antwort);
  if (ende) return ende;
  if (!antwort.ok) throw new ShopNichtErreichbar(`Produktseite ${handle}: HTTP ${antwort.status}`);
  const text = hauptText(await antwort.text());
  if (!text) throw new ShopNichtErreichbar('Produktseite ohne <main> – vermutlich Bot-Prüfung');
  return { zustand: 'aktiv', text };
}

const euro = cent => (Number(cent) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const M2 = /(Normaler Preis\s+)?(\d{1,3}(?:\.\d{3})*,\d{2})\s?€\s?\/\s?m²/g;

/**
 * Quadratmeterpreise, die der Shop jetzt zeigt. Auf der Seite steht der Preis der gewaehlten
 * Variante, bei einer Aktion zusaetzlich "Normaler Preis …". Bei Meterware ist der Variantenpreis
 * selbst der Quadratmeterpreis - so zaehlt auch eine guenstigere Breite ("ab …").
 * @returns {{aktuell: string[], vergleich: string[]}} Betraege wie "90,50"
 */
export function m2Preise(text, produkt = null) {
  const alle = []; const vergleich = new Set();
  for (const m of String(text ?? '').matchAll(M2)) { alle.push(m[2]); if (m[1]) vergleich.add(m[2]); }
  const aktuell = new Set(alle.filter(b => !vergleich.has(b)));
  for (const v of produkt?.variants ?? []) {
    if (Number(v.price) > 0) aktuell.add(euro(v.price));
    if (Number(v.compare_at_price) > Number(v.price)) vergleich.add(euro(v.compare_at_price));
  }
  for (const b of vergleich) aktuell.delete(b);
  return { aktuell: [...aktuell], vergleich: [...vergleich], erster: alle.find(b => !vergleich.has(b)) ?? null };
}

const betrag = s => /(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(String(s ?? ''))?.[1] ?? null;

/**
 * Welcher Preis steht im Bild? Neue Beitraege tragen ihn selbst (werkstatt.mjs, `preis` je Medium);
 * bei aelteren gilt der Standardaufbau: Preisschild bei Angebot, Neu im Shop und Produkt der Woche,
 * nie bei einer Serie.
 */
export function gedruckterPreis(beitrag, inhalt) {
  const eintraege = beitrag?.medien ?? [];
  if (eintraege.some(m => 'preis' in m || 'preisAlt' in m)) {
    const preis = eintraege.map(m => m.preis).find(Boolean) ?? null;
    const preisAlt = eintraege.map(m => m.preisAlt).find(Boolean) ?? null;
    return preis || preisAlt ? { preis, preisAlt } : null;
  }
  const d = inhalt?.daten ?? {};
  if (!['produkt', 'angebot'].includes(beitrag?.vorlage)) return null;
  if (!['angebot', 'produkt_woche', 'produkt_neu'].includes(inhalt?.typ) || d.serie) return null;
  const preis = preisText(d.preisJeEinheit);
  if (!preis) return null;
  return { preis, preisAlt: inhalt.typ === 'angebot' ? preisText(d.vergleichJeEinheit) : null };
}

/** Quadratmeterpreise im Beitragstext (Instagram und Facebook). */
export function preiseImText(beitrag) {
  const text = [beitrag?.text, beitrag?.text_facebook].filter(Boolean).join('\n');
  return [...new Set([...text.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s?€\s?\/\s?m²/g)].map(m => m[1]))];
}

function farbZahl(produkt) {
  const opt = (produkt?.options ?? []).find(o => /^(farbe|dekor|design)$/i.test(o?.name ?? ''));
  return Array.isArray(opt?.values) && opt.values.length ? opt.values.length : null;
}

/**
 * Prueft einen Beitrag gegen den Shop von jetzt.
 * @param cache Map handle -> Promise (ein Abruf je Produkt und Lauf)
 * @returns {{sperren: string[], warten: string|null}}
 */
export async function pruefeBeitragLive({ beitrag, inhalt }, { holen = globalThis.fetch, cache = new Map(), pauseMs = LIVE_REGELN.pauseMs, regeln = LIVE_REGELN } = {}) {
  const handles = produktHandles(inhalt).slice(0, regeln.hoechstensProdukte);
  const sperren = []; let warten = null;
  if (!handles.length) return { sperren, warten };
  const einmal = async (schluessel, abruf) => {
    if (!cache.has(schluessel)) {
      cache.set(schluessel, (async () => {
        if (cache.size && pauseMs) await pause(pauseMs);   // der Shop zeigt bei schnellen Abrufen eine Bot-Pruefung
        return abruf();
      })());
    }
    return cache.get(schluessel);
  };

  const stand = new Map();
  for (const handle of handles) {
    try {
      const live = await einmal(`js:${handle}`, () => produktLive(handle, { holen }));
      stand.set(handle, live);
      if (live.zustand === 'fehlt') sperren.push(`${handle}: nicht mehr im Shop (404)`);
      else if (live.zustand === 'umgeleitet') sperren.push(`${handle}: nicht mehr im Shop, leitet um auf ${live.ziel ?? 'eine andere Seite'}`);
      else if ((live.produkt.tags ?? []).some(t => String(t).toLowerCase() === 'auslauf')) sperren.push(`${handle}: Tag „auslauf“ – Auslaufware wird nicht beworben`);
    } catch (e) {
      if (!(e instanceof ShopNichtErreichbar)) throw e;
      warten ??= e.message;
    }
  }

  const haupt = stand.get(handles[0]);
  if (haupt?.zustand === 'aktiv' && !inhalt.daten?.serie) {
    // Farbzahl im Text ("insgesamt in 11 Farben") gegen die Farben im Shop.
    sperren.push(...zahlenImText([beitrag.text, beitrag.text_facebook].filter(Boolean).join('\n'), { farben: farbZahl(haupt.produkt) }));

    const gedruckt = gedruckterPreis(beitrag, inhalt);
    const imText = preiseImText(beitrag);
    if (gedruckt || imText.length) {
      try {
        const seite = await einmal(`seite:${handles[0]}`, () => seitenText(handles[0], { holen }));
        if (seite.zustand !== 'aktiv') sperren.push(`${handles[0]}: Produktseite nicht mehr erreichbar (${seite.zustand === 'fehlt' ? '404' : `leitet um auf ${seite.ziel ?? '?'}`})`);
        else {
          const p = m2Preise(seite.text, haupt.produkt);
          const shopZeigt = p.erster ? `${p.erster} €/m²` : 'keinen Quadratmeterpreis';
          if (gedruckt?.preis && !p.aktuell.includes(betrag(gedruckt.preis))) sperren.push(`Preis im Bild ${gedruckt.preis}, der Shop zeigt ${shopZeigt}`);
          if (gedruckt?.preisAlt && !p.vergleich.includes(betrag(gedruckt.preisAlt))) sperren.push(`Streichpreis im Bild ${gedruckt.preisAlt} steht nicht mehr im Shop`);
          for (const b of imText) if (!p.aktuell.includes(b) && !p.vergleich.includes(b)) sperren.push(`Preis im Text ${b} €/m², der Shop zeigt ${shopZeigt}`);
        }
      } catch (e) {
        if (!(e instanceof ShopNichtErreichbar)) throw e;
        warten ??= e.message;
      }
    }
  }
  return { sperren, warten: sperren.length ? null : warten };
}
