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
export const umschlagKennung = k => (k.bestellungen || []).map(b => b.orderName).filter(Boolean).join(' / ') || k.packSchluessel;

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

/**
 * Bild genau dieser Farbe: das Variantenbild; das Produktbild nur, wenn das Produkt ohnehin nur
 * eine Farbe hat. Sonst lieber kein Bild als das Bild einer anderen Farbe.
 */
function farbBild(p, v) {
  if (belegt(v?.bild)) return text(v.bild);
  const farben = new Set((p.varianten || []).filter(x => !x.wunschmass).map(x => text(x.farbe || x.titel).toLowerCase()));
  return farben.size <= 1 && belegt(p.bild) ? text(p.bild) : null;
}

/** Lieferantenangaben zur Aufkleber-SKU aus dem Lexikon - nur, wenn sie eindeutig sind. */
function vorherIndex(produkte) {
  const je = new Map();
  for (const p of produkte?.values?.() || []) {
    if (text(p?.handle).startsWith('muster-') || p?.status === 'ARCHIVED') continue;
    for (const v of p.varianten || []) {
      const e = v.einkauf || {};
      for (const sku of new Set([text(v.sku), text(e.artikelnummer)].filter(Boolean))) {
        const wert = { produktname: belegt(e.produktname) ? text(e.produktname) : null, farbnummer: belegt(e.farbnummer) ? text(e.farbnummer) : null, url: belegt(e.url) ? text(e.url) : null,
          kollektion: belegt(e.kollektion) ? text(e.kollektion) : null, lieferant: belegt(e.lieferant) ? text(e.lieferant) : null };
        const bild = farbBild(p, v);
        const alt = je.get(sku);
        // Dieselbe SKU in mehreren Breiten traegt oft je ein eigenes Bild derselben Farbe: das Bild
        // entscheidet nicht ueber "mehrdeutig"; bei verschiedenen Bildern gilt das erste.
        if (alt === 'mehrdeutig') continue;
        if (alt && JSON.stringify({ ...alt, bild: null }) !== JSON.stringify({ ...wert, bild: null })) { je.set(sku, 'mehrdeutig'); continue; }
        je.set(sku, { ...wert, bild: alt?.bild || bild });
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
 * @param {object} [p.haken]            { [lineItemId]: { zeit, von } } - Muster ist überklebt und liegt im Umschlag
 * @param {object} [p.klaeren]          { [Kundenschluessel]: { zeit, von, fehlt: [lineItemId], notiz } }
 * @param {(id) => string} [p.lieferantVon]  Lieferanten-Kuerzel -> Anzeigename (private Stammdaten)
 */
export function musterPackliste({ auftraege = [], produkte = new Map(), statusVon = () => null, schluesselVon = a => `auftrag:${a.id}`, gepackt = {}, haken = {}, klaeren = {}, lieferantVon = id => `Lieferant ${id}`, jetzt = new Date() } = {}) {
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
      const v = z.etikett?.sku ? vorher(z.etikett.sku) : null;
      g.muster.push({
        orderId: a.id, orderName: text(a.name), lineItemId: z.lineItemId,
        anzahl: Number.isInteger(z.anzahl) ? z.anzahl : null, etikett: z.etikett, fehlt: z.fehlt,
        bestellt: { titel: text(p.titel), farbe: text(p.farbe) },
        vorher: v,
        lieferant: v?.lieferant ? lieferantVon(v.lieferant) : null,
        bild: v?.bild || null,
        abgehakt: haken[z.lineItemId] ? { zeit: haken[z.lineItemId].zeit || null, von: haken[z.lineItemId].von || null } : null,
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
    markiereVerwechslung(muster);
    const istGepackt = !!gepackt[pk];
    const kl = !istGepackt && klaeren[g.schluessel] ? klaeren[g.schluessel] : null;
    return {
      schluessel: g.schluessel, packSchluessel: pk, name: g.name, adresse, bestellungen, seit, wartetTage: tage,
      muster, adressAufkleber,
      aufkleber: muster.reduce((s, m) => s + (m.anzahl || 0), 0) + 1,
      fehlt: [...unvollstaendig.map(m => `${m.bestellt.titel}${m.bestellt.farbe ? ` – ${m.bestellt.farbe}` : ''}`), ...adressAufkleber.fehlt.map(f => `Adresse: ${f}`)],
      nichtBestellt: muster.filter(m => m.stand === 'offen').length,
      gepackt: istGepackt ? { zeit: gepackt[pk].zeit || null, von: gepackt[pk].von || null } : null,
      klaeren: kl ? { zeit: kl.zeit || null, von: kl.von || null, notiz: text(kl.notiz) || null,
        fehlt: muster.filter(m => (kl.fehlt || []).includes(m.lineItemId)).map(m => m.lineItemId) } : null,
      // Ein Haken bestaetigt das physisch eingelegte Muster, sonst braucht es bestaetigten Bestand.
      bereich: istGepackt ? 'gepackt' : kl || unvollstaendig.length || adressAufkleber.fehlt.length ? 'klaeren' : muster.every(m => m.abgehakt || ['da', 'lager'].includes(m.stand)) ? 'packen' : 'warten',
    };
  });
  // Packreihenfolge: wer am laengsten wartet, zuerst; Gepacktes ans Ende.
  liste.sort((x, y) => (!!x.gepackt - !!y.gepackt) || text(x.seit).localeCompare(text(y.seit)) || x.name.localeCompare(y.name, 'de'));
  const zahl = b => liste.filter(k => k.bereich === b).length;
  return { kunden: liste, offen: liste.filter(k => !k.gepackt).length, zahlen: { warten: zahl('warten'), packen: zahl('packen'), klaeren: zahl('klaeren'), gepackt: zahl('gepackt') } };
}

/**
 * Zwei Muster desselben Lieferanten aus derselben Kollektion bzw. mit demselben Namen im selben
 * Umschlag: beide bekommen `verwechselbar`, die Ansicht hebt dann die Farbnummer hervor.
 */
function markiereVerwechslung(muster) {
  const gruppe = m => {
    const v = m.vorher || {};
    const name = text(v.kollektion || v.produktname || m.etikett?.serie).toLowerCase();
    return name ? `${text(v.lieferant)}|${name}` : '';
  };
  const je = new Map();
  for (const m of muster) { const g = gruppe(m); if (g) je.set(g, [...(je.get(g) || []), m]); }
  for (const liste of je.values()) {
    const farben = new Set(liste.map(m => text(m.vorher?.farbnummer || m.etikett?.farbe)));
    for (const m of liste) m.verwechselbar = farben.size > 1;
  }
  for (const m of muster) m.verwechselbar = !!m.verwechselbar;
}

/** Aufkleber eines Kunden in Druckreihenfolge: seine Muster (je bestellte Anzahl), danach die Adresse. */
export function aufkleberFuer(kunde) {
  return [...kunde.muster.flatMap(m => Array.from({ length: m.anzahl || 0 }, () => m.etikett)), kunde.adressAufkleber];
}

/**
 * Wareneingang sortieren: alle noch nicht eingelegten Muster der offenen Kunden je Partnerladen,
 * mit Ziel-Umschlag (Nummer in "Zu packen" bzw. "zu klären"). Je Laden nach Name und Farbnummer,
 * damit ein Paket von oben nach unten abgelegt werden kann.
 */
export function musterNachLaden(kundenListe = []) {
  const laeden = new Map();
  for (const k of kundenListe) {
    if (k.bereich === 'gepackt') continue;
    const umschlag = umschlagKennung(k);
    for (const m of k.muster) {
      if (m.abgehakt) continue;
      const laden = m.lieferant || 'Partnerladen nicht hinterlegt';
      if (!laeden.has(laden)) laeden.set(laden, []);
      laeden.get(laden).push({ muster: m, kunde: k.name, bestellung: m.orderName, umschlag, packSchluessel: k.packSchluessel });
    }
  }
  const sortName = e => `${text(e.muster.vorher?.produktname || e.muster.etikett?.serie).toLowerCase()}|${text(e.muster.vorher?.farbnummer).padStart(8, '0')}`;
  return [...laeden.entries()]
    .map(([laden, eintraege]) => ({ laden, eintraege: eintraege.sort((a, b) => sortName(a).localeCompare(sortName(b), 'de')) }))
    .sort((a, b) => b.eintraege.length - a.eintraege.length || a.laden.localeCompare(b.laden, 'de'));
}
