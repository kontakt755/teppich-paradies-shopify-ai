/**
 * "Noch zu schneiden" (Benutzer 13.11.2026): Unterlagen als Rollenware (Daemm- und Antirutschunterlagen),
 * die wir aus eigener Rolle schneiden - und auf welchem Weg sie zum Kunden gehen. Am 12.11. lag ein
 * geschnittenes Vlies im Lager, weil niemand sah, dass der Teppich direkt vom Hersteller kommt.
 *
 * Welche Artikel das sind, steht nur in der privaten Datei lieferanten/lagerware.json
 * (operations/lib/lagerware.mjs): `regeln` = Rolle liegt im Laden (position.lagerware),
 * `ohneRolle` = keine Rolle im Laden, die Unterlage wird bestellt (position.ohneRolle).
 * Reine Regel ohne DOM und Dateizugriff: Browser (Seite, Heute) und Server (Ansicht Laden).
 */
import { lieferwegVon, selbstStand, LIEFERWEG_WORT } from './lieferweg.mjs';
import { FRISTEN, tageSeit, tonNachAlter } from './todos.mjs';

const DURCH_UNS = new Set(['uns', 'kettler']);
const DIREKT = new Set(['hersteller', 'baustelle']);
const WEG = new Set(['raus', 'erledigt']);
const BEZAHLT = ['PAID', 'PARTIALLY_REFUNDED']; // wie lib/laden.mjs: unbezahlt ist der Kunde dran, nicht die Schere
const istTeppich = q => /teppich|l(ä|ae)ufer/i.test(q?.titel || '');
const STAND = { geliefert: 'liegt schon hier', bestellt: 'ist bestellt und noch nicht da' };

/**
 * Wie geht eine Unterlage zum Kunden? Vier Antworten (art):
 *   hersteller  der Lieferant schickt sie direkt - bei uns ist nichts zu schneiden
 *   mit         zusammen mit Ware derselben Bestellung, die durch unsere Haende geht (Teppich: einrollen)
 *   allein      allein als Paeckchen von uns
 *   unklar      der Weg der uebrigen Ware steht nicht fest (noch nicht bestellt oder beim Bestellen nicht
 *               vermerkt) - nie raten, genau das war die Verwechslung vom 12.11.
 * Ein gekettelter Teppich ohne Vermerk gilt als "durch uns", wenn der Kettelservice in der Bestellung steht.
 * @param {object} p                    die Unterlage
 * @param {object[]} positionen         alle Positionen derselben Bestellung
 * @param {(q:object)=>object|null} eintragVon  Auftragsfluss-Eintrag je Position
 * @returns {{art:string, kurz:string, text:string}|null}  null fuer Muster und Eigenleistung
 */
export function versandweg(p, positionen = [], eintragVon = () => null) {
  const eigen = lieferwegVon(p, eintragVon(p));
  if (!eigen) return null;
  if (DIREKT.has(eigen.weg)) {
    return eigen.vorschlag
      ? { art: 'unklar', kurz: 'Noch nicht bestellt', text: 'Voraussichtlich schickt der Hersteller direkt an den Kunden. Fest steht der Weg erst mit der Bestellung.' }
      : { art: 'hersteller', kurz: 'Hersteller schickt direkt', text: 'Nichts schneiden: Der Hersteller schickt die Unterlage direkt an den Kunden.' };
  }
  const kettelnWir = positionen.some(q => q?.eigenleistung && /kettel/i.test(q.titel || ''));
  const andere = positionen
    .filter(q => q && q.lineItemId !== p.lineItemId && !q.istMuster && !q.eigenleistung && !q.lagerware && !q.ohneRolle && (q.menge ?? 1) > 0)
    .map(q => { const e = eintragVon(q); return { q, e, lw: lieferwegVon(q, e) }; })
    .filter(x => x.lw && !WEG.has(x.e?.status))
    .sort((a, b) => istTeppich(b.q) - istTeppich(a.q));
  const sicher = x => x.lw.belegt || x.e?.status === 'geliefert' || (kettelnWir && !x.lw.vorschlag);
  const mit = andere.find(x => DURCH_UNS.has(x.lw.weg) && sicher(x));
  if (mit) {
    const stand = STAND[mit.e?.status] || 'ist noch nicht da';
    if (!istTeppich(mit.q)) return { art: 'mit', kurz: 'Zusammen mit der übrigen Ware', text: `Zusammen verschicken mit: ${mit.q.titel} (${stand}).` };
    const woher = mit.lw.weg === 'kettler' || kettelnWir ? 'Den Teppich ketteln wir selbst' : 'Der Teppich kommt vom Hersteller zu uns';
    return { art: 'mit', kurz: 'Zusammen mit dem Teppich', text: `Mit dem Teppich einrollen und zusammen verschicken (${mit.q.titel}). ${woher} – er ${stand}.` };
  }
  const offen = andere.find(x => !(DIREKT.has(x.lw.weg) && x.lw.belegt));
  if (offen) {
    const was = istTeppich(offen.q) ? 'der Teppich' : 'die übrige Ware';
    const warum = offen.e?.status
      ? 'beim Bestellen wurde kein Weg vermerkt'
      : `noch nicht bestellt, voraussichtlich ${LIEFERWEG_WORT[offen.lw.weg]}`;
    return { art: 'unklar', kurz: 'Versandweg noch offen', text: `Erst klären, dann verschicken: Wie ${was} zum Kunden geht, steht noch nicht fest (${offen.q.titel}: ${warum}).` };
  }
  const direkt = andere.find(x => DIREKT.has(x.lw.weg));
  return { art: 'allein', kurz: 'Allein als Päckchen',
    text: direkt ? `${istTeppich(direkt.q) ? 'Der Teppich' : 'Die übrige Ware'} kommt getrennt direkt vom Hersteller.` : '' };
}

/** "180 cm breit × 6 m" aus Variante ("1 mm, 180 cm breit (je lfm)") und Kundenmenge ("6 lfm"); sonst null. */
export function schnittMass(p) {
  const breite = /(\d+)\s*cm\s*breit/i.exec(p?.farbe || '')?.[1];
  const laenge = /([\d.,]+)\s*lfm/i.exec(String(p?.kundenmenge || ''))?.[1];
  return breite && laenge ? `${breite} cm breit × ${laenge} m` : null;
}

const TON_RANG = { crit: 0, warn: 1, '': 2 };

/**
 * Stand der Seite "Noch zu schneiden": bezahlte, offene Bestellungen mit einer Unterlage aus der Liste.
 *   schneiden  Rolle liegt im Laden, noch nicht zugeschnitten
 *   hier       geschnitten oder eingetroffen, noch nicht verschickt
 *   bestellen  nichts zu schneiden: keine Rolle im Laden oder der Hersteller schickt direkt
 * @param {object} q
 * @param {object} q.daten        /api/kunden/bestellungen
 * @param {object} [q.statusAlle] einkauf.auftragsstatus - frischer als positionsstatus, ein Klick fuehrt ihn sofort nach
 */
export function zuschnittStand({ daten, statusAlle = null, jetzt = new Date() } = {}) {
  const stand = { verfuegbar: false, schneiden: [], hier: [], bestellen: [], fehler: null };
  if (!daten?.verfuegbar || !Array.isArray(daten.zeilen)) return stand;
  const frisch = statusAlle?.positionen && typeof statusAlle.positionen === 'object' ? statusAlle.positionen : null;
  for (const z of daten.zeilen) {
    if (!z || z.testbestellung || z.storniert || z.archiviert || z.offen === false || z.fulfillmentstatus === 'FULFILLED' || !BEZAHLT.includes(z.zahlungsstatus)) continue;
    const positionen = z.auftrag?.positionen || [];
    const eintragVon = q => (frisch ? frisch[`${z.orderId}::${q.lineItemId}`] : z.positionsstatus?.[q.lineItemId]) || null;
    for (const p of positionen) {
      if (!p?.lineItemId || p.istMuster || !(p.lagerware || p.ohneRolle) || (p.menge ?? 1) <= 0) continue;
      const eintrag = eintragVon(p);
      if (WEG.has(eintrag?.status)) continue;
      const selbst = selbstStand(p, eintrag);
      // Frist wie "Von uns abschicken": beim Schneiden ab Bestellung, danach ab Zuschnitt bzw. Eingang.
      const seit = selbst && selbst !== 'zuschneiden' ? (eintrag?.selbstversand?.zugeschnitten?.am || eintrag?.geliefertAm) : z.datum;
      const tage = tageSeit(seit || null, jetzt);
      stand[selbst === 'zuschneiden' ? 'schneiden' : selbst ? 'hier' : 'bestellen'].push({
        key: `${z.orderId}::${p.lineItemId}`, z, p: { ...p, orderId: z.orderId, orderName: z.orderName || '' }, eintrag, selbst,
        weg: versandweg(p, positionen, eintragVon), tage, ton: tonNachAlter(tage, ...FRISTEN.rausgeben),
      });
    }
  }
  for (const liste of [stand.schneiden, stand.hier, stand.bestellen]) {
    liste.sort((a, b) => TON_RANG[a.ton] - TON_RANG[b.ton] || (b.tage ?? -1) - (a.tage ?? -1) || a.key.localeCompare(b.key));
  }
  return { ...stand, verfuegbar: true, fehler: daten.lagerwareFehler || null };
}
