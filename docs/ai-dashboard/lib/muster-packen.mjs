/**
 * "Muster packen" (Kunden → Muster packen, #1572): alle offenen, bezahlten Musterbestellungen,
 * gruppiert nach Kunde und in Packreihenfolge (aelteste Bestellung zuerst). Je Muster steht,
 * was auf dem Lieferantenmuster steht (vorher) und welcher Aufkleber darauf kommt (nachher).
 * Den Versand bucht diese Liste nicht - der Schritt folgt, wenn der Versandweg entschieden ist.
 *
 * Rein rechnend, ohne Ein-/Ausgabe: der Server reicht Status, Kundenschluessel und gepackte
 * Kunden als Funktionen bzw. Werte herein (scripts/dashboard-api.mjs, kundenMusterPacken).
 */
import { musteretikettenFuerAuftrag } from './bestellungs-musteretiketten.mjs';
import { adressEtikett } from './adress-etiketten.mjs';

/** Ab so vielen Tagen Wartezeit steht die Zahl in Bernstein. */
export const WARTET_AB_TAGEN = 2;

const FERTIG = new Set(['raus', 'erledigt']);
const text = v => (v === null || v === undefined ? '' : String(v).trim());
const belegt = v => !!text(v) && !['UNGEKLAERT', '–', '-'].includes(text(v));
const TAG = 24 * 60 * 60 * 1000;

/** Gepackt gilt fuer genau diese Bestellungen; kommt eine dazu, ist der Kunde wieder offen. */
export const packSchluessel = orderIds => [...new Set(orderIds.map(text).filter(Boolean))].sort().join(',');

/** Wo das Muster gerade ist - nur aus belegtem Auftragsfluss bzw. Musterlager. */
function standVon(status, position) {
  if (status === 'geliefert') return 'da';
  if (position?.musterLager || ['eigen_versand', 'eigen_vorbei'].includes(position?.musterHerkunft)) return 'lager';
  if (status === 'bestellt') return 'bestellt';
  return 'offen';
}

// "bestellt" heisst nur: im Auftragsfluss als bestellt vermerkt. Ob es schon im Laden liegt, wird oft
// nicht nachgetragen - deshalb nur "noch nicht bestellt" als Warnung (Ansicht), der Rest bleibt leise.
export const STAND_TEXT = Object.freeze({ da: 'angekommen', lager: 'aus dem Musterlager', bestellt: 'beim Lieferanten bestellt', offen: 'noch nicht bestellt' });

/** Lieferantenangaben zur Aufkleber-SKU aus dem Lexikon - nur, wenn sie eindeutig sind. */
function vorherIndex(produkte) {
  const je = new Map();
  for (const p of produkte?.values?.() || []) {
    if (text(p?.handle).startsWith('muster-') || p?.status === 'ARCHIVED') continue;
    for (const v of p.varianten || []) {
      const e = v.einkauf || {};
      for (const sku of new Set([text(v.sku), text(e.artikelnummer)].filter(Boolean))) {
        const wert = { produktname: belegt(e.produktname) ? text(e.produktname) : null, farbnummer: belegt(e.farbnummer) ? text(e.farbnummer) : null, url: belegt(e.url) ? text(e.url) : null };
        const alt = je.get(sku);
        je.set(sku, alt && JSON.stringify(alt) !== JSON.stringify(wert) ? 'mehrdeutig' : wert);
      }
    }
  }
  return sku => { const w = je.get(text(sku)); return w && w !== 'mehrdeutig' ? w : null; };
}

/**
 * @param {object} p
 * @param {object[]} p.auftraege        Auftraege des Bestellmodells (details.lieferadresse, positionen)
 * @param {Map} p.produkte              Lexikon je Handle
 * @param {(orderId, lineItemId) => string|null} [p.statusVon]  Auftragsfluss-Status der Position
 * @param {(auftrag) => string} [p.schluesselVon]               Kundenidentitaet (kundensuche.kundenSchluessel)
 * @param {object} [p.gepackt]          Ablage muster-packen.json: { [packSchluessel]: { zeit, von } }
 */
export function musterPackliste({ auftraege = [], produkte = new Map(), statusVon = () => null, schluesselVon = a => `auftrag:${a.id}`, gepackt = {}, jetzt = new Date() } = {}) {
  const vorher = vorherIndex(produkte);
  const gruppen = new Map();
  for (const a of auftraege) {
    if (!a?.offen || a.storniert || a.testbestellung || a.bezahlt !== 'PAID' || a.erfuellt === 'FULFILLED') continue;
    const positionen = (a.positionen || []).filter(p => p?.istMuster === true && !FERTIG.has(statusVon(a.id, p.lineItemId)));
    if (!positionen.length) continue;
    const zeilen = musteretikettenFuerAuftrag({ positionen }, produkte);
    const key = schluesselVon(a);
    if (!gruppen.has(key)) gruppen.set(key, { schluessel: key, name: '', adresse: null, bestellungen: [], muster: [] });
    const g = gruppen.get(key);
    g.bestellungen.push({ orderId: a.id, orderName: text(a.name), datum: a.datum || null });
    // Die neueste Bestellung traegt die aktuellste Anschrift.
    if (!g.adresse || (a.datum || '') >= (g.adresse.datum || '')) {
      g.adresse = { ...(a.details?.lieferadresse || {}), datum: a.datum || '' };
      g.name = text(a.details?.lieferadresse?.name) || text(a.details?.kunde?.name) || 'Kunde';
    }
    zeilen.forEach((z, i) => {
      const p = positionen[i];
      g.muster.push({
        orderId: a.id, orderName: text(a.name), lineItemId: z.lineItemId,
        anzahl: Number.isInteger(z.anzahl) ? z.anzahl : null, etikett: z.etikett, fehlt: z.fehlt,
        bestellt: { titel: text(p.titel), farbe: text(p.farbe) },
        vorher: z.etikett?.sku ? vorher(z.etikett.sku) : null,
        stand: standVon(statusVon(a.id, p.lineItemId), p),
      });
    });
  }

  const liste = [...gruppen.values()].map(g => {
    const bestellungen = g.bestellungen.sort((x, y) => text(x.datum).localeCompare(text(y.datum)));
    const seit = bestellungen[0]?.datum || null;
    const tage = seit ? Math.max(0, Math.floor((jetzt - new Date(seit)) / TAG)) : null;
    const pk = packSchluessel(bestellungen.map(b => b.orderId));
    const { datum, ...adresse } = g.adresse || {};
    const nr = bestellungen.map(b => b.orderName);
    const adressAufkleber = adressEtikett(adresse, nr);
    const muster = g.muster.sort((x, y) => nr.indexOf(x.orderName) - nr.indexOf(y.orderName));
    const unvollstaendig = muster.filter(m => m.fehlt.length || !m.anzahl);
    return {
      schluessel: g.schluessel, packSchluessel: pk, name: g.name, adresse, bestellungen, seit, wartetTage: tage,
      muster, adressAufkleber,
      aufkleber: muster.reduce((s, m) => s + (m.anzahl || 0), 0) + 1,
      fehlt: [...unvollstaendig.map(m => `${m.bestellt.titel}${m.bestellt.farbe ? ` – ${m.bestellt.farbe}` : ''}`), ...adressAufkleber.fehlt.map(f => `Adresse: ${f}`)],
      nichtBestellt: muster.filter(m => m.stand === 'offen').length,
      gepackt: gepackt[pk] ? { zeit: gepackt[pk].zeit || null, von: gepackt[pk].von || null } : null,
    };
  });
  // Packreihenfolge: wer am laengsten wartet, zuerst; Gepacktes ans Ende.
  liste.sort((x, y) => (!!x.gepackt - !!y.gepackt) || text(x.seit).localeCompare(text(y.seit)) || x.name.localeCompare(y.name, 'de'));
  return { kunden: liste, offen: liste.filter(k => !k.gepackt).length };
}

/** Aufkleber eines Kunden in Druckreihenfolge: seine Muster (je bestellte Anzahl), danach die Adresse. */
export function aufkleberFuer(kunde) {
  return [...kunde.muster.flatMap(m => Array.from({ length: m.anzahl || 0 }, () => m.etikett)), kunde.adressAufkleber];
}
