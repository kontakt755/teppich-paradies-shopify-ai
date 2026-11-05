/**
 * "Muster packen" (Kunden → Muster packen, #1572): alle offenen, bezahlten Musterbestellungen als
 * Umschlaege je Empfaenger und Bestelltag (umschlaegeJeBestelltag), in Packreihenfolge (aelteste
 * Bestellung zuerst). Je Muster steht,
 * was auf dem Lieferantenmuster steht (vorher) und welcher Aufkleber darauf kommt (nachher).
 * Den Versand bucht diese Liste nicht - der Schritt folgt, wenn der Versandweg entschieden ist.
 *
 * Rein rechnend, ohne Ein-/Ausgabe: der Server reicht Status, Kundenschluessel und gepackte
 * Kunden als Funktionen bzw. Werte herein (scripts/dashboard-api.mjs, kundenMusterPacken).
 */
import { musteretikettenFuerAuftrag } from './bestellungs-musteretiketten.mjs';
import { adressEtikett } from './adress-etiketten.mjs';
import { passtBegriff } from './lexikon-suche.mjs';
import { kalendertag, kalendertage } from './kalendertage.mjs';

/** Ab so vielen Tagen Wartezeit steht die Zahl in Bernstein. */
export const WARTET_AB_TAGEN = 2;

const FERTIG = new Set(['raus', 'erledigt']);
/** So traegt die automatische Musterbestellung (operations/lib/muster-bestellautomatik.mjs) ein. */
const MUSTERAUTOMATIK = 'Musterautomatik';
const text = v => (v === null || v === undefined ? '' : String(v).trim());
const belegt = v => !!text(v) && !['UNGEKLAERT', '–', '-'].includes(text(v));

/** Gepackt gilt fuer genau diese Bestellungen; kommt eine dazu, ist der Kunde wieder offen. */
/**
 * Geht dieses gesperrte Muster einzeln weg ("Ohne dieses Muster weiter packen")? Ja, wenn andere Muster im
 * Umschlag bleiben oder seine Bestellung Ware enthaelt: die laeuft weiter, nur das Muster wird erledigt.
 * Sonst nicht: dann schliesst "Kunde informieren…" die reine Musterbestellung ab.
 */
export const ohneMusterMoeglich = (k, m) => !!m?.gesperrt
  && (k.muster.some(x => !x.gesperrt) || k.bestellungen.some(b => b.orderId === m.orderId && b.mitWare));

/** Darf "Kunde informieren…" abschliessen? Der Schritt gilt je ganze Bestellung, also nie, wo Ware oder ein lieferbares Muster dranhaengt. */
export const umschlagAbschliessbar = k => k.muster.every(m => m.gesperrt) && !k.bestellungen.some(b => b.mitWare);

export const umschlagKennung = k => (k.bestellungen || []).map(b => b.orderName).filter(Boolean).join(' / ') || k.packSchluessel;

/** Lieferadresse normalisiert: ein Kundenkonto kann an mehrere Empfaenger liefern, deren Umschlaege nie gemischt werden. */
const adresseKey = adresse => JSON.stringify(['name', 'strasse', 'plz', 'ort', 'land'].map(f => text(adresse?.[f]).toLowerCase().replace(/\s+/g, ' ')));

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

/**
 * Lieferantenangaben zur Aufkleber-SKU aus dem Lexikon - nur, wenn sie eindeutig sind.
 * Muster (auch "Teppich nach Mass") tragen selbst keine Einkaufsdaten; sie kommen von der
 * Meterware-Variante, auf die der Aufkleber zeigt. Die Variante mit genau dieser SKU geht vor;
 * nur ohne sie zaehlen Varianten, die die SKU als Artikelnummer fuehren (z. B. TnM mit anderer
 * Breite im Lieferantennamen). Widersprechen sich die Angaben, gilt "mehrdeutig" - nie raten.
 * Eine Variante ganz ohne diese Angaben entscheidet nicht ueber "mehrdeutig", traegt aber Farbbild und
 * Suchangaben bei (#1799 hatte sie ganz uebersprungen: 37 Varianten ohne Bild, Review 29.10.).
 */
const hatAngaben = w => ['produktname', 'farbnummer', 'url', 'kollektion', 'lieferant'].some(f => w[f]);

function vorherIndex(produkte) {
  const eigen = new Map(), artikel = new Map();
  for (const p of produkte?.values?.() || []) {
    if (text(p?.handle).startsWith('muster-') || p?.status === 'ARCHIVED') continue;
    for (const v of p.varianten || []) {
      const e = v.einkauf || {};
      const wert = { produktname: belegt(e.produktname) ? text(e.produktname) : null, farbnummer: belegt(e.farbnummer) ? text(e.farbnummer) : null, url: belegt(e.url) ? text(e.url) : null,
        kollektion: belegt(e.kollektion) ? text(e.kollektion) : null, lieferant: belegt(e.lieferant) ? text(e.lieferant) : null };
      // Nur fuer die Suche (Herstellername auf dem Muster); entscheiden nicht ueber "mehrdeutig".
      const such = { hersteller: belegt(e.hersteller) ? text(e.hersteller) : null, artikelnummer: belegt(e.artikelnummer) ? text(e.artikelnummer) : null };
      const bild = farbBild(p, v);
      const angaben = hatAngaben(wert);
      // Nichts, was dem Packer hilft: die Variante bleibt draussen, damit eine andere zum Zug kommt.
      if (!angaben && !bild && !such.hersteller && !such.artikelnummer) continue;
      const ziele = [[eigen, text(v.sku)], [artikel, text(e.artikelnummer)]];
      for (const [je, sku] of ziele) {
        if (!sku) continue;
        const alt = je.get(sku);
        // Dieselbe SKU in mehreren Breiten traegt oft je ein eigenes Bild derselben Farbe: das Bild
        // entscheidet nicht ueber "mehrdeutig"; bei verschiedenen Bildern gilt das erste.
        if (alt === 'mehrdeutig') continue;
        const vergleich = w => JSON.stringify([w.produktname, w.farbnummer, w.url, w.kollektion, w.lieferant]);
        if (alt && angaben && hatAngaben(alt) && vergleich(alt) !== vergleich(wert)) { je.set(sku, 'mehrdeutig'); continue; }
        je.set(sku, { ...(alt && hatAngaben(alt) ? alt : wert), bild: alt?.bild || bild, hersteller: alt?.hersteller || such.hersteller, artikelnummer: alt?.artikelnummer || such.artikelnummer });
      }
    }
  }
  return sku => {
    const k = text(sku);
    const e = eigen.get(k), a = artikel.get(k);
    // Eigene Variante ohne Angaben: die Lieferantenangaben kommen ueber die Artikelnummer, ihr Bild bleibt.
    const nurBeitrag = e && e !== 'mehrdeutig' && !hatAngaben(e) && a;
    const w = !nurBeitrag ? e ?? a : a === 'mehrdeutig' ? a : { ...a, bild: e.bild || a.bild, hersteller: e.hersteller || a.hersteller, artikelnummer: e.artikelnummer || a.artikelnummer };
    if (w === 'mehrdeutig') return { unklar: true, produktname: null, farbnummer: null, url: null, kollektion: null, lieferant: null, bild: null, hersteller: null, artikelnummer: null };
    return w || null;
  };
}

/**
 * @param {object} p
 * @param {object[]} p.auftraege        Auftraege des Bestellmodells (details.lieferadresse, positionen)
 * @param {Map} p.produkte              Lexikon je Handle
 * @param {(orderId, lineItemId) => string|null} [p.statusVon]  Auftragsfluss-Status der Position
 * @param {(orderId, lineItemId) => object|null} [p.eintragVon] ganzer Auftragsfluss-Eintrag (bestelltAm,
 *                                      bestelltVon, ueber) fuer die Anmerkung; ersetzt dann statusVon
 * @param {(auftrag) => string} [p.schluesselVon]               Kundenidentitaet (kundensuche.kundenSchluessel)
 * @param {object} [p.gepackt]          Ablage muster-packen.json: { [packSchluessel]: { zeit, von } }
 * @param {object} [p.haken]            { [lineItemId]: { zeit, von } } - Muster ist überklebt und liegt im Umschlag
 * @param {object} [p.klaeren]          { [Umschlagschluessel]: { zeit, von, fehlt: [lineItemId], notiz } } - Schluessel je
 *                                      Empfaenger und Bestelltag; aeltere je Empfaenger bzw. je Kunde gelten weiter
 * @param {(id) => string} [p.lieferantVon]  Lieferanten-Kuerzel -> Anzeigename (private Stammdaten)
 * @param {(orderId, lineItemId) => string|null} [p.automatikGrundVon]  warum die Musterautomatik zurueckhaelt
 * @param {(position) => {imShop: boolean, seit: string}|null} [p.sperreVon]  aktive Mustersperre dieser Position (w-210)
 */
export function musterPackliste({ auftraege = [], produkte = new Map(), statusVon: statusAllein = () => null, eintragVon = null, schluesselVon = a => `auftrag:${a.id}`, gepackt = {}, haken = {}, klaeren = {}, gedruckt = {}, lieferantVon = id => `Lieferant ${id}`, automatikGrundVon = () => null, sperreVon = () => null, jetzt = new Date() } = {}) {
  const statusVon = eintragVon ? (o, l) => eintragVon(o, l)?.status || null : statusAllein;
  // Vom Lieferanten direkt an den Kunden (#1680): wird nicht bei uns gepackt.
  const direkt = (a, p) => [p.route, p.musterRoute].includes('SUPPLIER_DIRECT') || eintragVon?.(a.id, p.lineItemId)?.ueber === 'kunde';
  const vorher = vorherIndex(produkte);
  // Je Empfaenger (Kundenidentitaet und Lieferadresse) alle offenen Musterbestellungen; die Umschlaege
  // ergeben sich daraus je Bestelltag (umschlaegeJeBestelltag).
  const gruppen = new Map();
  const ausschluesse = { zahlungOffen: 0, geschlossen: 0 };
  // Fuer die Suche: Muster, die nicht (mehr) gepackt werden - mit Grund. Wer so ein Muster in der
  // Hand haelt, soll sehen, wohin es gehoert haette, statt "nichts gefunden".
  const ausserhalb = [];
  // Wann die Bestellung fertig wurde: der letzte Schritt im Auftragsfluss. `teilweise`: andere Muster liegen noch in der Packliste.
  const fertigAm = (a, liste) => liste.flatMap(p => { const e = eintragVon?.(a.id, p.lineItemId); return [e?.rausAm, e?.erledigtAm]; }).filter(belegt).map(text).sort().at(-1) || null;
  const merkeAusserhalb = (a, grund, liste, { teilweise = false } = {}) => {
    if (!liste.length) return;
    const zeilen = musteretikettenFuerAuftrag({ positionen: liste }, produkte);
    ausserhalb.push({ orderId: a.id, orderName: text(a.name), datum: a.datum || null, grund, erledigtAm: fertigAm(a, liste), teilweise,
      name: text(a.details?.lieferadresse?.name) || text(a.details?.kunde?.name) || 'Kunde',
      muster: zeilen.map((z, i) => {
        const e = z.etikett || {}, v = e.sku ? vorher(e.sku) : null;
        return { lineItemId: z.lineItemId, bestellt: { titel: text(liste[i].titel), farbe: text(liste[i].farbe) },
          etikett: { serie: text(e.serie), farbe: text(e.farbe), sku: text(e.sku) },
          vorher: v ? { produktname: v.produktname, kollektion: v.kollektion, farbnummer: v.farbnummer, hersteller: v.hersteller, artikelnummer: v.artikelnummer, ...(v.unklar ? { unklar: true } : {}) } : null,
          lieferant: v?.lieferant ? lieferantVon(v.lieferant) : null };
      }) });
  };
  for (const a of auftraege) {
    if (!a || a.testbestellung) continue;
    const alleMuster = (a.positionen || []).filter(p => p?.istMuster === true);
    const fertig = p => p.menge === 0 || FERTIG.has(statusVon(a.id, p.lineItemId));
    if (a.storniert || a.erfuellt === 'FULFILLED') { merkeAusserhalb(a, a.storniert ? 'storniert' : 'erledigt', alleMuster); continue; }
    if (!a.offen || !['PAID', 'PARTIALLY_REFUNDED'].includes(a.bezahlt)) {
      const grund = alleMuster.some(p => !fertig(p)) ? (!a.offen ? 'geschlossen' : 'zahlungOffen') : 'erledigt';
      if (grund !== 'erledigt') ausschluesse[grund]++;
      merkeAusserhalb(a, grund, alleMuster);
      continue;
    }
    const positionen = alleMuster.filter(p => !fertig(p));
    merkeAusserhalb(a, 'erledigt', alleMuster.filter(fertig), { teilweise: positionen.length > 0 });
    if (!positionen.length) continue;
    const zeilen = musteretikettenFuerAuftrag({ positionen }, produkte);
    const identitaet = a.details?.kunde || {};
    const unbekannt = ![identitaet.email, identitaet.telefon, identitaet.name].some(belegt);
    const basis = unbekannt ? `auftrag:${a.id}` : schluesselVon(a);
    // Ein Kundenkonto kann an mehrere Empfaenger liefern; niemals deren Umschlaege mischen.
    const key = JSON.stringify([basis, adresseKey(a.details?.lieferadresse)]);
    if (!gruppen.has(key)) gruppen.set(key, { basis, auftraege: [] });
    gruppen.get(key).auftraege.push({ a, positionen, zeilen });
  }

  /**
   * Klaermarke dieses Umschlags, in dieser Reihenfolge: die eigene (je Empfaenger und Bestelltag); die des
   * Empfaengers (bis 29.10.2026 war der ganze Empfaenger ein Umschlag) - bei mehreren Umschlaegen nur, wenn
   * ihre fehlenden Muster hier liegen, sonst als fremde Marke; zuletzt die alte gemeinsame Marke des Kunden.
   * Eine ausdrueckliche Freigabe (geklaert) beendet die Suche. Fremde Marken geben nur den Vermerk.
   */
  const klaerungFuer = ({ eigen, empfaenger, kunde }, muster, mehrere) => {
    const ids = new Set(muster.map(m => m.lineItemId));
    const fehltVon = e => (Array.isArray(e?.fehlt) ? e.fehlt : []);
    const betrifft = e => !fehltVon(e).length || fehltVon(e).some(id => ids.has(id));
    const ganzHier = e => fehltVon(e).length > 0 && fehltVon(e).every(id => ids.has(id));
    const kandidaten = [[klaeren[eigen], false], [klaeren[empfaenger], mehrere && !ganzHier(klaeren[empfaenger])], [klaeren[kunde], true]];
    const fremd = kandidaten.find(([e, alt]) => e && alt && !e.geklaert && betrifft(e))?.[0] || null;
    const altvermerk = fremd ? `Frühere gemeinsame Klärung${text(fremd.notiz) ? `: ${text(fremd.notiz)}` : ' vorhanden'} – je Umschlag neu prüfen.` : null;
    for (const [e] of kandidaten) {
      if (!e) continue;
      if (e.geklaert) return { eintrag: null, altvermerk };
      if (betrifft(e)) return { eintrag: e, altvermerk };
    }
    return { eintrag: null, altvermerk };
  };

  /** Ein Umschlag: Bestellungen desselben Empfaengers von einem Bestelltag (oder mit bestehender Packmarke) samt Mustern. */
  const baueUmschlag = (eintraege, { basis, mehrere }) => {
    const g = { name: '', email: '', adresse: null, bestellungen: [], muster: [], hinweise: new Set(), teilweiseErstattet: false, direktversand: false };
    for (const { a, positionen, zeilen } of eintraege) {
      if (a.bezahlt === 'PARTIALLY_REFUNDED') { g.teilweiseErstattet = true; g.hinweise.add('Teilweise erstattet – offene Muster und Versandumfang prüfen.'); }
      if (positionen.some(p => direkt(a, p))) { g.direktversand = true; g.hinweise.add('Direktversand – Versandweg prüfen, nicht lokal packen.'); }
      // Gleiche Regel wie auftragsart(): mit Ware kennt die Bestellung den Schritt "Muster nicht verfuegbar" nicht.
      g.bestellungen.push({ orderId: a.id, orderName: text(a.name), datum: a.datum || null, ...((a.positionen || []).some(p => p?.istMuster !== true) ? { mitWare: true } : {}) });
      // Die neueste Bestellung traegt die aktuellste Anschrift.
      if (!g.adresse || (a.datum || '') >= (g.adresse.datum || '')) {
        g.adresse = { ...(a.details?.lieferadresse || {}), datum: a.datum || '' };
        g.name = text(a.details?.lieferadresse?.name) || text(a.details?.kunde?.name) || 'Kunde';
        g.email = belegt(a.details?.kunde?.email) ? text(a.details.kunde.email) : '';
      }
      zeilen.forEach((z, i) => {
        const p = positionen[i];
        const v = z.etikett?.sku ? vorher(z.etikett.sku) : null;
        const eintrag = eintragVon?.(a.id, p.lineItemId) || null;
        const stand = standVon(statusVon(a.id, p.lineItemId), p);
        // Nur was noch fehlt, "kommt nicht": ein Muster, das trotzdem hier liegt, wird normal gepackt.
        const sperre = !haken[z.lineItemId] && !['da', 'lager'].includes(stand) ? sperreVon(p) : null;
        g.muster.push({
          orderId: a.id, orderName: text(a.name), lineItemId: z.lineItemId,
          anzahl: Number.isInteger(z.anzahl) ? z.anzahl : null, etikett: z.etikett, fehlt: z.fehlt,
          bestellt: { titel: text(p.titel), farbe: text(p.farbe) },
          vorher: v,
          lieferant: v?.lieferant ? lieferantVon(v.lieferant) : null,
          bild: v?.bild || null,
          abgehakt: haken[z.lineItemId] ? { zeit: haken[z.lineItemId].zeit || null, von: haken[z.lineItemId].von || null } : null,
          stand,
          gesperrt: sperre ? { imShop: !!sperre.imShop, seit: sperre.seit || null } : null,
          // Bleibt nach der Ankunft erhalten: die Kopfzeile nennt das Lieferanten-Bestelldatum immer (29.10.).
          bestelltAm: belegt(eintrag?.bestelltAm) ? text(eintrag.bestelltAm) : null,
          automatisch: stand === 'bestellt' && eintrag?.bestelltVon === MUSTERAUTOMATIK,
          automatikGrund: stand === 'offen' ? text(automatikGrundVon(a.id, p.lineItemId)) || null : null,
          // Wo es im Haus liegt (Musterlager), damit die Karte "liegt hier: …" sagen kann.
          lagerOrt: stand === 'lager' && belegt(p.musterLager?.ort) ? text(p.musterLager.ort) : null,
        });
      });
    }
    const bestellungen = g.bestellungen.sort((x, y) => text(x.datum).localeCompare(text(y.datum)));
    const seit = bestellungen[0]?.datum || null;
    const tage = kalendertage(seit, jetzt);
    const pk = packSchluessel(bestellungen.map(b => b.orderId));
    const { datum, ...adresse } = g.adresse || {};
    const nr = bestellungen.map(b => b.orderName);
    const adressAufkleber = adressEtikett(adresse, nr);
    const muster = g.muster.sort((x, y) => nr.indexOf(x.orderName) - nr.indexOf(y.orderName));
    const unvollstaendig = muster.filter(m => m.fehlt.length || !m.anzahl);
    markiereVerwechslung(muster);
    const hinweise = [...g.hinweise];
    // Dauerhaft je Empfaenger und Bestelltag: eine andere erledigte Bestellung oder eine spaetere
    // Bestellung desselben Kunden darf die Klaerkennung dieses Umschlags nicht aendern.
    const empfaenger = `${basis}|adresse:${adresseKey(g.adresse)}`;
    const schluessel = `${empfaenger}|tag:${kalendertag(seit) || 'ohne'}`;
    const istGepackt = !!gepackt[pk];
    const { eintrag: kl, altvermerk } = klaerungFuer({ eigen: schluessel, empfaenger, kunde: basis }, muster, mehrere);
    const gesperrt = muster.some(m => m.gesperrt);
    // Gepackt erledigt jede Klaerung.
    const klaerung = istGepackt ? null : kl;
    return {
      schluessel, packSchluessel: pk, name: g.name, adresse, bestellungen, seit, wartetTage: tage,
      muster, adressAufkleber, hinweise, altvermerk,
      // Fuer den Textvorschlag "Kunde informieren": nur bei Umschlaegen, die ihn brauchen.
      ...(gesperrt && g.email ? { email: g.email } : {}),
      restumfangPruefen: g.teilweiseErstattet && !g.direktversand && muster.some(m => m.anzahl > 0),
      direktversand: g.direktversand,
      adressFehlt: [...adressAufkleber.fehlt],
      zuordnungFehlt: unvollstaendig.map(m => `${m.bestellt.titel}${m.bestellt.farbe ? ` – ${m.bestellt.farbe}` : ''}`),
      aufkleber: muster.reduce((s, m) => s + (m.anzahl || 0), 0) + 1,
      fehlt: [...unvollstaendig.map(m => `${m.bestellt.titel}${m.bestellt.farbe ? ` – ${m.bestellt.farbe}` : ''}`), ...adressAufkleber.fehlt.map(f => `Adresse: ${f}`)],
      nichtBestellt: muster.filter(m => m.stand === 'offen').length,
      gepackt: istGepackt ? { zeit: gepackt[pk].zeit || null, von: gepackt[pk].von || null } : null,
      // Umschlag vorbereitet: Aufkleber und Adresse gedruckt. Kommt am selben Tag eine Bestellung dazu,
      // aendert sich der packSchluessel - dann fehlen deren Aufkleber, und der Vermerk gilt nicht mehr.
      gedruckt: !istGepackt && gedruckt[pk] ? { zeit: gedruckt[pk].zeit || null, von: gedruckt[pk].von || null } : null,
      klaeren: klaerung ? { zeit: klaerung.zeit || null, von: klaerung.von || null, notiz: text(klaerung.notiz) || null,
        fehlt: muster.filter(m => (klaerung.fehlt || []).includes(m.lineItemId)).map(m => m.lineItemId) } : null,
      // Ein Haken bestaetigt das physisch eingelegte Muster, sonst braucht es bestaetigten Bestand.
      bereich: istGepackt ? 'gepackt' : klaerung || gesperrt || hinweise.length || unvollstaendig.length || adressAufkleber.fehlt.length ? 'klaeren' : muster.every(m => m.abgehakt || ['da', 'lager'].includes(m.stand)) ? 'packen' : 'warten',
    };
  };

  const liste = [];
  for (const { basis, auftraege: eigene } of gruppen.values()) {
    const teile = umschlaegeJeBestelltag(eigene, { gepackt, gedruckt });
    const umschlaege = teile.map(t => baueUmschlag(t, { basis, mehrere: teile.length > 1 }));
    // Weitere Umschlaege desselben Empfaengers (andere Bestelltage): die Ansicht nennt sie in der
    // Kopfzeile, damit niemand die Bestellungen verwechselt.
    for (const u of umschlaege) {
      u.weitere = umschlaege.filter(x => x !== u).map(x => ({ packSchluessel: x.packSchluessel, bestellungen: x.bestellungen.map(b => b.orderName), seit: x.seit, bereich: x.bereich }));
    }
    liste.push(...umschlaege);
  }
  // Packreihenfolge: wer am laengsten wartet, zuerst; Gepacktes ans Ende.
  liste.sort((x, y) => (!!x.gepackt - !!y.gepackt) || text(x.seit).localeCompare(text(y.seit)) || x.name.localeCompare(y.name, 'de'));
  const zahl = b => liste.filter(k => k.bereich === b).length;
  ausserhalb.sort((x, y) => text(y.datum).localeCompare(text(x.datum)));
  return { kunden: liste, ausschluesse, ausserhalb, offen: liste.filter(k => !k.gepackt).length, zahlen: { warten: zahl('warten'), packen: zahl('packen'), klaeren: zahl('klaeren'), gepackt: zahl('gepackt') } };
}

/**
 * Ein Umschlag je Bestelltag (Rueckmeldung 29.10.2026): Bestellungen desselben Empfaengers
 * vom selben Tag (Berlin) kommen zusammen, eine Bestellung von einem anderen Tag bekommt ihren eigenen
 * Umschlag. Bis dahin kamen alle offenen Bestellungen eines Empfaengers in einen Umschlag - dann wartete
 * die fertige erste Bestellung auf die zweite, und "x von n im Umschlag" zaehlte beide zusammen.
 * Ein Umschlag, der schon ueber mehrere Tage gepackt oder vorbereitet wurde (Marke mit genau diesen
 * Bestellungen), bleibt zusammen: er liegt so auf dem Packtisch.
 * @param {{a: object}[]} eintraege  je Bestellung ein Eintrag mit dem Auftrag `a`
 * @returns {object[][]} Eintraege je Umschlag, aelteste Bestellung zuerst
 */
function umschlaegeJeBestelltag(eintraege, { gepackt = {}, gedruckt = {} } = {}) {
  const datum = e => text(e.a.datum);
  const offen = new Map([...eintraege].sort((x, y) => datum(x).localeCompare(datum(y))).map(e => [text(e.a.id), e]));
  const umschlaege = [];
  const marken = [...new Set([...Object.keys(gepackt), ...Object.keys(gedruckt)])]
    .map(k => k.split(',')).filter(ids => ids.length > 1 && ids.every(id => offen.has(id)))
    .sort((x, y) => y.length - x.length);
  for (const ids of marken) {
    if (!ids.every(id => offen.has(id))) continue; // schon einem groesseren Umschlag zugeteilt
    umschlaege.push(ids.map(id => offen.get(id)));
    for (const id of ids) offen.delete(id);
  }
  const jeTag = new Map();
  for (const e of offen.values()) {
    const tag = kalendertag(e.a.datum);
    if (!jeTag.has(tag)) jeTag.set(tag, []);
    jeTag.get(tag).push(e);
  }
  return [...umschlaege, ...jeTag.values()].map(u => u.sort((x, y) => datum(x).localeCompare(datum(y))))
    .sort((x, y) => datum(x[0]).localeCompare(datum(y[0])));
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

/**
 * Aufkleber eines Kunden in Druckreihenfolge: seine Muster (je bestellte Anzahl), danach die Adresse.
 * `nurOffen`: abgehakte Muster sind schon ueberklebt und eingelegt - ihre Aufkleber nicht nochmal;
 * gesperrte kommen nicht - kommt doch eins, druckt "Nur diesen nachdrucken" seinen Aufkleber.
 */
export function aufkleberFuer(kunde, { nurOffen = false } = {}) {
  const muster = nurOffen ? kunde.muster.filter(m => !m.abgehakt && !m.gesperrt) : kunde.muster;
  return [...muster.flatMap(m => Array.from({ length: m.anzahl || 0 }, () => m.etikett)), kunde.adressAufkleber];
}

/** Aufkleber genau eines Musters (Neu-Etikettieren eines einzelnen Musters), je bestellte Anzahl. */
export function aufkleberFuerMuster(m) {
  return m?.fehlt?.length || !m?.etikett ? [] : Array.from({ length: m.anzahl || 1 }, () => m.etikett);
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
      const laden = m.lieferant || 'Lieferant nicht hinterlegt';
      if (!laeden.has(laden)) laeden.set(laden, []);
      laeden.get(laden).push({ muster: m, kunde: k.name, bestellung: m.orderName, umschlag, packSchluessel: k.packSchluessel });
    }
  }
  const sortName = e => `${text(e.muster.vorher?.produktname || e.muster.etikett?.serie).toLowerCase()}|${text(e.muster.vorher?.farbnummer).padStart(8, '0')}`;
  return [...laeden.entries()]
    .map(([laden, eintraege]) => ({ laden, eintraege: eintraege.sort((a, b) => sortName(a).localeCompare(sortName(b), 'de')) }))
    .sort((a, b) => b.eintraege.length - a.eintraege.length || a.laden.localeCompare(b.laden, 'de'));
}

// -- Suche: welches Muster gehoert in welchen Umschlag? -----------------
// Wer ein Muster in der Hand haelt, tippt ab, was darauf steht ("Vorwerk Modena TSU 3N55"). Auf
// dem Muster stehen Herstellername, Produkt und Farbnummer - nicht unser Aufkleber. Deshalb zaehlt
// jedes Wort einzeln; gezeigt werden die Umschlaege mit den meisten passenden Woertern. Ein Wort,
// das nirgends vorkommt (z. B. ein Rueckencode), verhindert so keinen Treffer.
const norm = v => text(v).toLowerCase().replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss');
const kompakt = v => v.replace(/[^a-z0-9]/g, '');

export function suchWoerter(eingabe) {
  return [...new Set(norm(eingabe).split(/\s+/).filter(Boolean))];
}

function passendeWoerter(woerter, felder) {
  const heu = felder.map(norm).filter(Boolean);
  const heuKompakt = heu.map(kompakt);
  // Zahlen wie im Lexikon (passtBegriff): "73" findet "073", aber nicht "8H73", "373" oder "#1173".
  // Ohne Satzzeichen nur ab drei Zeichen ("3N-55" = "3N55"); sonst passte "#2" auf jede 2.
  return woerter.filter(w => heu.some(h => passtBegriff(w, h)) || (!/^\d+$/.test(w) && kompakt(w).length >= 3 && heuKompakt.some(h => h.includes(kompakt(w)))));
}

/** Wie viele Suchwoerter passen zu einem Umschlag bzw. einer Bestellung und zu welchen Mustern. */
function bewerte(woerter, kopf, muster = []) {
  const umschlag = passendeWoerter(woerter, kopf);
  const je = muster.map(m => {
    const v = m.vorher || {}, e = m.etikett || {};
    const passt = new Set([...umschlag, ...passendeWoerter(woerter, [m.bestellt?.titel, m.bestellt?.farbe, e.serie, e.farbe, e.sku,
      v.produktname, v.kollektion, v.farbnummer, v.hersteller, v.artikelnummer, m.lieferant])]);
    return { id: m.lineItemId, passt };
  });
  const bestes = Math.max(umschlag.length, ...je.map(m => m.passt.size));
  return { bestes, muster: je.filter(m => m.passt.size === bestes && m.passt.size > umschlag.length).map(m => m.id),
    passt: new Set([...umschlag, ...je.filter(m => m.passt.size === bestes).flatMap(m => [...m.passt])]) };
}

/**
 * @param {object[]} kundenListe  Umschlaege aus musterPackliste
 * @param {string} eingabe
 * @param {object[]} [ausserhalb] Bestellungen ausserhalb der Packliste (musterPackliste().ausserhalb)
 * @returns {{woerter: string[], treffer: {packSchluessel: string, muster: string[]}[], ausserhalb: {orderId: string, muster: string[]}[], fehlen: string[]}}
 *   `treffer` in der Reihenfolge der Liste, `muster` = lineItemIds der passenden Muster (leer, wenn nur
 *   Kunde/Bestellnummer passen), `fehlen` = Woerter, die in keinem Treffer vorkommen. Bestellungen
 *   ausserhalb der Packliste zaehlen gleich; gezeigt wird nur, was am besten passt.
 */
export function packSuche(kundenListe = [], eingabe = '', ausserhalb = []) {
  const woerter = suchWoerter(eingabe);
  if (!woerter.length) return { woerter, treffer: [], ausserhalb: [], fehlen: [] };
  const umschlaege = kundenListe.map(k => ({ k, ...bewerte(woerter, [k.name, umschlagKennung(k), ...(k.bestellungen || []).map(b => b.orderName)], k.muster) }));
  const andere = ausserhalb.map(b => ({ b, ...bewerte(woerter, [b.name, b.orderName], b.muster) }));
  const max = Math.max(0, ...umschlaege.map(x => x.bestes), ...andere.map(x => x.bestes));
  if (!max) return { woerter, treffer: [], ausserhalb: [], fehlen: woerter };
  const beste = umschlaege.filter(x => x.bestes === max), besteAndere = andere.filter(x => x.bestes === max);
  const gefunden = new Set([...beste, ...besteAndere].flatMap(x => [...x.passt]));
  return { woerter, treffer: beste.map(x => ({ packSchluessel: x.k.packSchluessel, muster: x.muster })),
    ausserhalb: besteAndere.map(x => ({ orderId: x.b.orderId, muster: x.muster })), fehlen: woerter.filter(w => !gefunden.has(w)) };
}

/**
 * Suche nur in offener Arbeit (Mitarbeiter 29.10.): gepackte Umschlaege und schon versandte bzw.
 * erledigte Bestellungen zaehlen nicht mit - sonst verdraengt ein fertiger Kunde mit dem besseren
 * Treffer den Kunden, der das Muster noch braucht (packSuche zeigt nur die besten Treffer).
 * `fertig` zaehlt die Bestellungen unter den fertigen Treffern, die nicht schon offen gezeigt sind.
 * `mitFertigen` haengt die fertigen Treffer HINTER die offenen - verdraengen koennen sie auch dann
 * nichts. Storniert, Zahlung offen und geschlossen bleiben immer in der Suche: das sind Warnungen.
 * `fertigGenauer`: offene Umschlaege passen, eine fertige Bestellung aber mit mehr Woertern - dann
 * liegt das Muster in der Hand vermutlich bei der fertigen, und das muss man sehen.
 */
export function offeneSuche(kundenListe = [], eingabe = '', ausserhalb = [], { mitFertigen = false } = {}) {
  const fertigK = k => k.bereich === 'gepackt', fertigB = b => b.grund === 'erledigt';
  const s = packSuche(kundenListe.filter(k => !fertigK(k)), eingabe, ausserhalb.filter(b => !fertigB(b)));
  const f = packSuche(kundenListe.filter(fertigK), eingabe, ausserhalb.filter(fertigB));
  const je = new Map(kundenListe.map(k => [k.packSchluessel, k]));
  const bestellungenVon = t => (je.get(t.packSchluessel)?.bestellungen || []).map(b => b.orderId);
  const gezeigt = new Set([...s.treffer.flatMap(bestellungenVon), ...s.ausserhalb.map(b => b.orderId)]);
  const fertig = new Set([...f.treffer.flatMap(bestellungenVon), ...f.ausserhalb.map(b => b.orderId)].filter(id => !gezeigt.has(id)));
  const fertigGenauer = gezeigt.size > 0 && fertig.size > 0 && f.fehlen.length < s.fehlen.length;
  if (!mitFertigen) return { ...s, fertig: fertig.size, fertigGenauer };
  return { woerter: s.woerter, treffer: [...s.treffer, ...f.treffer], ausserhalb: [...s.ausserhalb, ...f.ausserhalb.filter(b => !gezeigt.has(b.orderId))],
    // Beide Gruppen stehen da: "nicht gefunden" ist nur, was in keiner von beiden vorkommt.
    fehlen: s.fehlen.filter(w => f.fehlen.includes(w)), fertig: 0, fertigGenauer: false };
}

/**
 * So lange laesst sich "Eingeworfen" zuruecknehmen, erst danach bucht der Dienst den Versand. Eine Buchung
 * in Shopify nimmt das Control Center nie zurueck (Architektur, Abschnitt 24), und die Versandmail ist dann
 * schon beim Kunden - Rueckgaengig gibt es deshalb nur VOR der Buchung.
 */
export const EINWURF_FRIST_MINUTEN = 5;

/**
 * Gepackte Umschlaege fuer den Reiter "Gepackt": `wartend` (eingeworfen, Frist laeuft), `heute` (heute
 * gepackt: die Sammelaktion) und `alt` (frueher gepackt, nie eingetragen; aelteste Bestellung zuerst).
 * Altfaelle stehen bewusst nicht in der Sammelaktion: ob so ein Umschlag raus ist, weiss nur, wer ihn
 * eingeworfen hat. Ein Umschlag mit Problem kann wieder geklickt werden und zaehlt deshalb nicht als wartend.
 */
export function einwurfListen(kundenListe = [], jetzt = new Date()) {
  const gepackt = (kundenListe || []).filter(k => k?.bereich === 'gepackt');
  const wartend = gepackt.filter(k => k.eingeworfen && !k.eingeworfen.problem);
  const frei = gepackt.filter(k => !wartend.includes(k));
  const tag = kalendertag(jetzt);
  const heute = frei.filter(k => kalendertag(k.gepackt?.zeit) === tag);
  const alt = frei.filter(k => kalendertag(k.gepackt?.zeit) !== tag)
    .sort((x, y) => text(x.seit).localeCompare(text(y.seit)) || text(x.gepackt?.zeit).localeCompare(text(y.gepackt?.zeit)));
  return { wartend, heute, alt, altBestellungen: alt.reduce((n, k) => n + k.bestellungen.length, 0) };
}

/** Die Muster einer Bestellung in diesem Umschlag. Offene Ware derselben Bestellung gehoert nicht dazu. */
export function umschlagMusterIds(k, orderId) {
  return (k?.muster || []).filter(m => m.orderId === orderId).map(m => m.lineItemId);
}

/**
 * "Muster kommt an": welcher Umschlag braucht das Muster in der Hand? `karten` = passende, noch nicht
 * eingelegte Muster offener Umschlaege in Packreihenfolge (aelteste Bestellung zuerst), hoechstens
 * `max`; `eingelegt` = passende Muster, die schon im Umschlag liegen oder gepackt sind; dazu die
 * Bestellungen ausserhalb der Packliste. Passen nur Kunde oder Bestellnummer, zaehlen alle Muster
 * dieses Umschlags.
 */
export function handTreffer(kundenListe = [], eingabe = '', ausserhalb = [], { max = 6, mitFertigen = false } = {}) {
  const s = offeneSuche(kundenListe, eingabe, ausserhalb, { mitFertigen });
  const je = new Map(kundenListe.map(k => [k.packSchluessel, k]));
  const alle = s.treffer.flatMap(t => {
    const k = je.get(t.packSchluessel);
    if (!k) return [];
    const ids = new Set(t.muster.length ? t.muster : k.muster.map(m => m.lineItemId));
    return k.muster.filter(m => ids.has(m.lineItemId)).map(m => ({ kunde: k, muster: m }));
  });
  const offen = alle.filter(x => !x.muster.abgehakt && x.kunde.bereich !== 'gepackt');
  return { woerter: s.woerter, fehlen: s.fehlen, karten: offen.slice(0, max), mehr: Math.max(0, offen.length - max),
    eingelegt: alle.filter(x => x.muster.abgehakt || x.kunde.bereich === 'gepackt'), ausserhalb: s.ausserhalb, fertig: s.fertig, fertigGenauer: s.fertigGenauer };
}
