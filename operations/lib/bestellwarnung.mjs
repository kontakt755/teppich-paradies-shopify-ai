/**
 * Warnung im Bestelldialog (Befunde der Rohertrag-Rechnung vom 2026-11-05): bevor beim Lieferanten
 * bestellt wird, zeigt das Control Center, was von dieser Bestellung voraussichtlich bleibt, ob die
 * bestellte Menge von der verkauften abweicht und ob eine Teillieferung den Frachtzuschlag erneut ausloest.
 *
 * Nur ein Hinweis: Hier wird nichts gesperrt, nichts bestellt und kein Preis geaendert. Alles ist eine
 * Schaetzung. Fehlt ein Einkaufspreis, heisst es "Rohertrag unbekannt", nie eine Zahl.
 *
 * Keine Werte im Repository. Zur Laufzeit gelesen aus dem Privatordner:
 *   - ek-liste/ableitung-<datum>/ek-varianten.json  Einkaufspreise (die vorhandene EK-Ableitung)
 *   - lieferanten/stammdaten.json                   Lieferkosten je Lieferant ("kosten"), Kettler
 *   - versandkosten/tarife.json                     GLS/GEL ueber berechneVersand()
 *
 * Die Saetze werden bewusst nicht ueber pruefeStammdaten() gereicht: dessen Ergebnis geht auch an
 * Oberflaechen und an die Rolle "lesen". Die Warnung haengt nur an der Vorbereitung im Dialog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { berechneVersand } from '../../docs/ai-dashboard/lib/versandkosten.mjs';
import { positionKey } from './auftragsstatus.mjs';
import { wirdGekettelt, kettelZuschnitt } from './kettelpuffer.mjs';

/** Ab hier faellt eine Bestellung auf. Betriebliche Annahmen, keine Vorgaben des Inhabers. */
export const SCHWELLEN = Object.freeze({
  rohertragQuote: 0.2, // darunter gilt der Rohertrag als niedrig
  wegAnteil: 0.2, // Weg zum Kunden, Anteil am Netto: auch ohne Einkaufspreis ein Warnzeichen
  wegEuro: 25, // ... aber nicht bei einem Paket auf einer kleinen Bestellung
  mengeEuro: 15, // Mehrkosten, ab denen eine Mengenabweichung genannt wird
  mengeM2: 1, // dasselbe, wenn der Einkaufspreis fehlt
});

// Annahmen fuer das Packstueck, solange nichts Genaueres bekannt ist.
const KG_JE_M2 = 2;
const VERPACKUNG_CM = 5;
const ROLLENDICKE_M = 0.01;
const KERN_CM = 3;
const SACK = { laenge: 60, breite: 40, hoehe: 15, kg: 25 };

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const istZahl = x => typeof x === 'number' && Number.isFinite(x);
const betrag = x => (istZahl(x) && x >= 0 ? x : null);
const summe = l => l.reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ Daten lesen

let ekCache = { datei: null, mtime: 0, liste: null };

/** Neueste vorhandene EK-Ableitung. Fehlt sie, gilt jeder Einkaufspreis als unbekannt. */
export function leseEkListe(privatDir) {
  const ordner = path.join(privatDir, 'ek-liste');
  let datei = null;
  try {
    const kandidaten = fs.readdirSync(ordner).filter(n => /^ableitung-\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
    for (const n of kandidaten) {
      const p = path.join(ordner, n, 'ek-varianten.json');
      if (fs.existsSync(p)) { datei = p; break; }
    }
  } catch { return { verfuegbar: false, zeilen: new Map() }; }
  if (!datei) return { verfuegbar: false, zeilen: new Map() };
  try {
    const mtime = fs.statSync(datei).mtimeMs;
    if (ekCache.datei !== datei || ekCache.mtime !== mtime) {
      const zeilen = new Map();
      const handles = new Map();
      for (const z of JSON.parse(fs.readFileSync(datei, 'utf8'))) {
        if (z.handle) { if (!handles.has(z.handle)) handles.set(z.handle, []); handles.get(z.handle).push(z); }
        for (const schluessel of new Set([z.artikelnummer, z.sku].filter(Boolean))) {
          if (!zeilen.has(schluessel)) zeilen.set(schluessel, []);
          zeilen.get(schluessel).push(z);
        }
      }
      ekCache = { datei, mtime, liste: { verfuegbar: true, zeilen, handles, stand: path.basename(path.dirname(datei)).replace('ableitung-', '') } };
    }
    return ekCache.liste;
  } catch { return { verfuegbar: false, zeilen: new Map() }; }
}

/** Lieferkosten je Lieferant und Kettlerpreise aus den privaten Stammdaten; alles andere bleibt dort. */
export function leseLieferkosten(stammdatenDatei) {
  let roh;
  try { roh = JSON.parse(fs.readFileSync(stammdatenDatei, 'utf8')); } catch { return { lieferanten: {}, kettler: null }; }
  const lieferanten = {};
  for (const [id, l] of Object.entries(roh?.lieferanten ?? {})) {
    const k = l?.kosten;
    if (!k || typeof k !== 'object') continue;
    lieferanten[id] = {
      paket: betrag(k.paket), paketBisCm: betrag(k.paketBisCm), paketBisKg: betrag(k.paketBisKg),
      fracht: betrag(k.fracht), mindermenge: betrag(k.mindermenge), mindermengeUnterEk: betrag(k.mindermengeUnterEk),
      ekAufschlag: betrag(k.ekAufschlag) ?? 0, anKundenNurImLiefergebiet: k.anKundenNurImLiefergebiet === true,
    };
  }
  const k = roh?.absender?.kettelservice?.kosten;
  const kettler = k && betrag(k.bis6qmJeLfm) !== null ? { bis6qmJeLfm: k.bis6qmJeLfm, ab6qmJeLfm: betrag(k.ab6qmJeLfm) ?? k.bis6qmJeLfm } : null;
  return { lieferanten, kettler };
}

// ------------------------------------------------------------------ Einkauf und Menge je Position

/** Verkaufte Flaeche in m², wenn die Position nach Flaeche verkauft wird; sonst null. */
function verkaufteFlaeche(p) {
  const einheit = p.masspruefung?.einheit;
  if (einheit === 'm²') return Number(p.mengeBestellt);
  if (einheit === '× 0,01 m²') return Number(p.mengeBestellt) / 100;
  return null;
}

/** Zeile der EK-Liste: dasselbe Produkt zuerst, damit Maßware und Meterware nicht vertauscht werden. */
const hatPreis = z => z.sicherheit !== 'offen' && (istZahl(z.ek_bezug) || istZahl(z.ek_vk_einheit));

function ekZeilen(p, ek) {
  return [p.grosshaendlerId, p.sku].flatMap(s => ek.zeilen.get(s) ?? []);
}

function ekZeile(p, ek) {
  const treffer = ekZeilen(p, ek);
  const mitPreis = treffer.filter(hatPreis);
  if (mitPreis.length) return mitPreis.find(z => z.handle === p.handle) ?? mitPreis[0];
  // Keine Artikelnummer in der Liste (z. B. nur Grosshandelsname): dasselbe Produkt zaehlt nur,
  // wenn alle seine Varianten denselben Preis haben. Sonst bleibt der Einkauf unbekannt.
  const gleichesProdukt = (ek.handles?.get(p.handle) ?? []).filter(hatPreis);
  return gleichesProdukt.length && new Set(gleichesProdukt.map(z => `${z.bezug}|${z.ek_bezug}|${z.ek_vk_einheit}`)).size === 1 ? gleichesProdukt[0] : null;
}

/**
 * Rollenbreite in cm: aus der Position, sonst aus der Variante der EK-Liste (die Massware-Zeile nennt
 * sie nicht, die Meterware-Zeile desselben Artikels schon) oder dem Variantentitel.
 */
function rollenbreiteCm(p, ek) {
  if (Number(p.ausRolleCm) > 0) return Number(p.ausRolleCm);
  const quellen = [p.bestellmenge?.text?.match(/(\d{3})\s*cm breit/)?.[1], p.farbe?.match(/(\d{3})\s*cm/)?.[1], ...ekZeilen(p, ek).map(z => z.variante?.match(/(\d{3})\s*cm/)?.[1])];
  const b = quellen.map(Number).find(x => x >= 100 && x <= 600);
  return b ?? null;
}

function fertigmass(p) {
  const z = (p.ausfuehrung ?? []).find(t => t.startsWith('Fertigmaß:'));
  const m = z?.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const [a, b] = [m[1], m[2]].map(s => Number(s.replace(',', '.')));
  return a > 0 && b > 0 ? { breite: a, laenge: b } : null;
}

/** Was vom Lieferanten kommt und was das je Fall kostet. */
function mengeUndEinkauf(p, ek, { ziel, ekAufschlag = 0 }) {
  const zeile = ekZeile(p, ek);
  // Paketware wird in Paketen verkauft und bezahlt, auch wenn der Preis je m² gilt.
  const verkauft = zeile?.vk_einheit === 'Paket' || p.bestellmenge?.einheit === 'paket' ? null : verkaufteFlaeche(p);
  const masse = fertigmass(p);
  const rolle = rollenbreiteCm(p, ek);
  const zuschnitt = ziel === 'kettler' && wirdGekettelt(p.ausfuehrung) ? kettelZuschnitt(p.ausfuehrung) : null;
  const stueck = zuschnitt ?? (masse ? { breiteCm: masse.breite, laengeCm: masse.laenge } : null);
  let flaeche = verkauft;
  let vollerollenbreite = null;
  if (stueck) {
    flaeche = stueck.breiteCm * stueck.laengeCm / 1e4;
    const kurz = Math.min(stueck.breiteCm, stueck.laengeCm);
    if (rolle > kurz) vollerollenbreite = kurz * rolle / 1e4;
  } else if (verkauft !== null && p.bestellmenge?.einheit === 'lfm' && rolle) {
    flaeche = Number(p.bestellmenge.menge) * rolle / 100;
  }
  const je = !zeile ? null : verkauft !== null && zeile.bezug === 'm²' && istZahl(zeile.ek_bezug) ? zeile.ek_bezug * (1 + ekAufschlag) : null;
  let ekSumme = null;
  if (zeile) {
    if (je !== null && flaeche !== null) ekSumme = je * flaeche;
    else if (verkauft === null && istZahl(zeile.ek_vk_einheit)) ekSumme = zeile.ek_vk_einheit * (1 + ekAufschlag) * Number(p.mengeBestellt);
  }
  return { zeile, verkauft, flaeche, rolle, vollerollenbreite, ekJeM2: je, ekSumme, stueck };
}

// ------------------------------------------------------------------ Packstueck und Versand

/** Gewicht aus dem Titel ("..., 25 kg"), mal Menge. null, wenn es nicht dasteht. */
function gewichtStueckware(p) {
  const treffer = `${p.farbe ?? ''} ${p.titel ?? ''}`.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  return treffer ? Number(treffer[1].replace(',', '.')) * Number(p.mengeBestellt) : null;
}

function stangeCm(p) {
  const l = Number(p.einkauf?.stangenlaenge_cm);
  return l > 0 ? l : null;
}

/** Was ueber die Lieferung entscheidet: Flaechenware rollt, Stueckware hat Gewicht und ggf. Laenge. */
function sendung(eintraege) {
  const flaechen = eintraege.filter(e => e.m.flaeche !== null);
  const stueckware = eintraege.filter(e => e.m.flaeche === null);
  const kgStueck = stueckware.map(e => gewichtStueckware(e.p));
  const kg = summe(flaechen.map(e => e.m.flaeche * KG_JE_M2)) + summe(kgStueck.filter(istZahl));
  const langeSeiten = flaechen.map(e => {
    if (e.m.stueck) return Math.max(e.m.stueck.breiteCm, e.m.stueck.laengeCm);
    return e.m.rolle ? Math.max(e.m.flaeche / (e.m.rolle / 100) * 100, e.m.rolle) : 400;
  });
  const kurzeSeiten = flaechen.map(e => {
    if (e.m.stueck) return Math.min(e.m.stueck.breiteCm, e.m.stueck.laengeCm);
    return e.m.rolle ? Math.min(e.m.flaeche / (e.m.rolle / 100) * 100, e.m.rolle) : null;
  });
  const stangen = stueckware.map(e => stangeCm(e.p)).filter(Boolean);
  return {
    hatFlaeche: flaechen.length > 0,
    // Pakete mit Boden wiegen viel, ihr Gewicht steht nirgends: nie als kleines Paket rechnen.
    schwereWare: stueckware.some(e => e.p.bestellmenge?.einheit === 'paket' || e.m.zeile?.vk_einheit === 'Paket'),
    stuecke: flaechen.length,
    kg,
    gewichtBekannt: kgStueck.every(istZahl),
    kurzCm: kurzeSeiten.every(istZahl) && kurzeSeiten.length ? Math.max(...kurzeSeiten) : null,
    langCm: langeSeiten.length ? Math.max(...langeSeiten) : null,
    stangeCm: stangen.length ? Math.max(...stangen) : null,
  };
}

/** GLS/GEL ueber den vorhandenen Rechner; der guenstigere moegliche Dienst zaehlt. */
function versand(s, { zielPlz, abholPlz, warenwert, tarif, jetzt }) {
  if (!tarif) return { netto: null, grund: 'Versandtarife fehlen' };
  let packung;
  if (s.hatFlaeche) {
    if (!(s.kurzCm > 0)) return { netto: null, grund: 'Maße für den Versand unbekannt' };
    const d = Math.round(100 * Math.sqrt(4 * ((s.langCm ?? s.kurzCm) / 100) * ROLLENDICKE_M / Math.PI)) + KERN_CM;
    const durchmesser = Math.min(d, s.kurzCm + VERPACKUNG_CM);
    packung = { l: s.kurzCm + VERPACKUNG_CM, w: durchmesser, h: durchmesser, kg: Math.max(1, Math.ceil(s.kg)), anzahl: 1, art: 'Rolle' };
  } else {
    if (!s.gewichtBekannt && !s.stangeCm) return { netto: null, grund: 'Gewicht für den Versand unbekannt' };
    const anzahl = Math.max(1, Math.ceil(s.kg / SACK.kg));
    packung = s.stangeCm
      ? { l: s.stangeCm + VERPACKUNG_CM, w: 15, h: 15, kg: Math.max(1, Math.ceil(s.kg)), anzahl: 1, art: 'Rolle' }
      : { l: SACK.laenge, w: SACK.breite, h: SACK.hoehe, kg: Math.max(1, Math.ceil(s.kg / anzahl)), anzahl, art: 'Sortierfähig' };
  }
  const heute = new Date(jetzt).toISOString().slice(0, 10);
  const eingabe = Object.fromEntries(tarif.felder.map(f => [f.zeile, f.wert ?? '']));
  Object.assign(eingabe, { 5: packung.l, 6: packung.w, 7: packung.h, 8: packung.kg, 9: packung.anzahl, 10: zielPlz, 11: abholPlz || eingabe[11], 12: 'Ja', 14: Math.max(1, Math.round(warenwert)), 15: packung.art, 17: heute });
  // Abgelaufene Dieselwerte: mit dem letzten Stand rechnen und das sagen, statt gar nichts zu zeigen.
  const saetze = tarif.saetze;
  const anpassung = {};
  let veraltet = false;
  for (const name of ['GLS', 'GEL']) {
    if (heute > saetze[`${name} gültig bis`]) { anpassung[`${name} gültig bis`] = heute; veraltet = true; }
    if (heute < saetze[`${name} gültig von`]) anpassung[`${name} gültig von`] = heute;
  }
  const r = berechneVersand(eingabe, tarif, anpassung);
  if (r.fehler) return { netto: null, grund: 'Versand nicht berechenbar' };
  const moeglich = [['GLS', r.gls], ['GEL', r.gel]].filter(([, v]) => istZahl(v?.netto)).sort((a, b) => a[1].netto - b[1].netto);
  if (!moeglich.length) return { netto: null, grund: 'Für GLS und GEL zu groß oder zu schwer, Preis erfragen' };
  const [dienst, v] = moeglich[0];
  return { netto: v.netto, dienst, spedition: dienst === 'GEL', xxl: dienst === 'GEL' && r.xxl, veraltet };
}

// ------------------------------------------------------------------ Lieferung vom Lieferanten

/** Was der Lieferant fuer eine Lieferung berechnet. null: nicht hinterlegt. */
function lieferzuschlag(k, s, { ekOderNetto, teiler = 1 }) {
  if (!k) return null;
  const passtInsPaket = k.paket !== null && !s.schwereWare && (k.fracht === null || !s.hatFlaeche)
    && (k.paketBisKg === null || s.kg <= k.paketBisKg)
    && (k.paketBisCm === null || (s.stangeCm ?? 0) <= k.paketBisCm)
    && (!s.hatFlaeche || k.paketBisCm === null || (s.kurzCm ?? Infinity) <= k.paketBisCm);
  if (passtInsPaket) return { betrag: k.paket, text: 'Paket vom Lieferanten', paket: true };
  if (k.fracht === null && k.mindermenge === null) return null;
  const mindermenge = k.mindermenge !== null && k.mindermengeUnterEk !== null && ekOderNetto < k.mindermengeUnterEk ? k.mindermenge : 0;
  const fracht = (k.fracht ?? 0) / teiler;
  return { betrag: fracht + mindermenge, text: teiler > 1 ? 'Fracht vom Lieferanten, Anteil' : 'Fracht vom Lieferanten', paket: false, fracht, mindermenge };
}

function kanteMeter(ausfuehrung = []) {
  const m = ausfuehrung.join(' ').match(/umlaufend\s+(\d+(?:[.,]\d+)?)\s*m/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const euro = x => `${Math.round(x).toLocaleString('de-DE')} €`;
const m2 = x => `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const tagKurz = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`; };

/** Weg einer Lieferung bis zum Kunden: Posten der Rechnung plus das, was nicht berechenbar war. */
function wegEinerGruppe({ lieferant, ziel, eintraege, kosten, adresse, nah, kettlerAdresse, ladenPlz, ekOderNetto, netto, tarif, jetzt, teiler, lieferungen }) {
  const posten = [];
  const offen = [];
  const k = kosten.lieferanten[lieferant] ?? null;
  const s = sendung(eintraege);
  // Direkt zum Kunden geht es bei manchen Lieferanten nur auf der Tour im Nahbereich.
  const uebersLager = ziel === 'laden' || (ziel === 'kunde' && k?.anKundenNurImLiefergebiet && !nah);
  const z = lieferzuschlag(k, s, { ekOderNetto, teiler });
  if (z) {
    posten.push({ text: lieferungen > 1 ? `${z.text} (${lieferungen} Lieferungen)` : z.text, betrag: z.betrag * lieferungen, art: 'weg' });
  } else offen.push(lieferant === 'UNGEKLAERT' ? 'Lieferant nicht zugeordnet' : 'Lieferkosten des Lieferanten nicht hinterlegt');
  if (ziel === 'kettler') {
    const kanten = eintraege.filter(e => wirdGekettelt(e.p.ausfuehrung));
    if (!kosten.kettler) { if (kanten.length) offen.push('Kettelpreis nicht hinterlegt'); } else {
      const meter = kanten.map(e => ({ m: kanteMeter(e.p.ausfuehrung), satz: (e.m.verkauft ?? 0) > 6 ? kosten.kettler.ab6qmJeLfm : kosten.kettler.bis6qmJeLfm }));
      if (meter.some(x => x.m === null)) offen.push('Kantenlänge unbekannt');
      const betragKettler = summe(meter.filter(x => x.m !== null).map(x => x.m * x.satz));
      if (betragKettler > 0) posten.push({ text: 'Ketteln', betrag: betragKettler, art: 'kettel' });
    }
  }
  let versandAngabe = null;
  if (uebersLager || ziel === 'kettler') {
    if (nah) versandAngabe = { selbst: true };
    else {
      const abholPlz = ziel === 'kettler' ? kettlerAdresse?.plz : ladenPlz;
      const v = versand(s, { zielPlz: adresse?.plz, abholPlz, warenwert: netto, tarif, jetzt });
      versandAngabe = v;
      if (v.netto === null) offen.push(v.grund);
      else posten.push({ text: v.spedition ? `Spedition zum Kunden${v.xxl ? ' (XXL)' : ''}${s.kurzCm ? `, kurze Seite ${Math.round(s.kurzCm)} cm` : ''}` : 'Paket zum Kunden', betrag: v.netto, art: 'weg' });
    }
  }
  return { posten, offen, z, s, versand: versandAngabe, uebersLager };
}

// ------------------------------------------------------------------ Warnung je Bestellung

/**
 * Rechnung und Hinweise fuer eine Kundenbestellung. Reine Funktion, damit sie mit Beispielwerten
 * pruefbar bleibt.
 *
 * @returns {object|null} null, wenn nichts vom Normalfall abweicht
 */
export function bestellWarnung({ auftrag, mailsMitPosition = [], kosten, ek, tarif, statusAlle = {}, absender = null, nahPlz = /^$/, ladenPlz = null, mindestmenge = {}, jetzt = new Date(), lieferantName = id => `Lieferant ${id}` }) {
  const ware = (auftrag?.positionen ?? []).filter(p => !p.istMuster && !p.eigenleistung && Number(p.mengeBestellt) > 0);
  if (!ware.length) return null;
  const adresse = auftrag.details?.lieferadresse ?? null;
  const plz = String(adresse?.plz ?? '').trim();
  const inland = /^\d{5}$/.test(plz) && (!adresse?.land || /^(deutschland|germany|de)$/i.test(String(adresse.land).trim()));
  const nah = inland && nahPlz.test(plz);
  const zielVon = new Map();
  for (const { lieferziel, positionen, teiler } of mailsMitPosition) for (const p of positionen) zielVon.set(p.lineItemId, { ziel: lieferziel, teiler: teiler ?? 1 });
  const standardziel = p => (wirdGekettelt(p.ausfuehrung) && fertigmass(p) && absender?.kettelservice ? 'kettler' : 'kunde');
  const eintraege = ware.map(p => {
    const ziel = zielVon.get(p.lineItemId)?.ziel ?? standardziel(p);
    const k = kosten.lieferanten[p.lieferant] ?? null;
    return { p, ziel: ziel === 'baustelle' ? 'kunde' : ziel, teiler: zielVon.get(p.lineItemId)?.teiler ?? 1, m: mengeUndEinkauf(p, ek, { ziel, ekAufschlag: k?.ekAufschlag ?? 0 }) };
  });

  const zeilenNetto = (auftrag.positionen ?? []).map(p => p.nettoGesamt);
  const versandBrutto = Number(auftrag.details?.summen?.versand?.betrag ?? 0);
  const netto = zeilenNetto.every(istZahl) ? r2(summe(zeilenNetto) + versandBrutto / 1.19) : null;

  const einkauf = eintraege.map(e => e.m.ekSumme);
  const ekBekannt = einkauf.every(istZahl);
  const ekSumme = summe(einkauf.filter(istZahl));
  const ohneEk = eintraege.filter(e => !istZahl(e.m.ekSumme));

  // Eine Lieferung je Lieferant und Ziel; schon frueher Bestelltes war eine eigene.
  const gruppen = new Map();
  for (const e of eintraege) {
    const schluessel = `${e.p.lieferant}|${e.ziel}`;
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(e);
  }
  const hinweise = [];
  const posten = [];
  const offen = [];
  let versandVeraltet = false;
  let eigeneZustellung = false;
  for (const [schluessel, liste] of gruppen) {
    const [lieferant, ziel] = schluessel.split('|');
    const tage = new Set(liste.map(e => statusAlle[positionKey(auftrag.id, e.p.lineItemId)]?.bestelltAm).filter(Boolean).map(t => String(t).slice(0, 10)));
    const inDerMail = liste.some(e => zielVon.has(e.p.lineItemId));
    const offenJetzt = liste.some(e => zielVon.has(e.p.lineItemId) && !statusAlle[positionKey(auftrag.id, e.p.lineItemId)]?.bestelltAm);
    const lieferungen = Math.max(1, tage.size + (offenJetzt ? 1 : 0));
    const anteilig = inDerMail ? Math.max(...liste.map(e => e.teiler)) : 1;
    const ergebnis = wegEinerGruppe({ lieferant, ziel, eintraege: liste, kosten, adresse, nah, kettlerAdresse: absender?.kettelservice, ladenPlz, ekOderNetto: ekBekannt ? ekSumme : (netto ?? Infinity), netto: netto ?? 0, tarif, jetzt, teiler: anteilig, lieferungen });
    posten.push(...ergebnis.posten);
    offen.push(...ergebnis.offen);
    if (!inland && (ziel === 'kettler' || ergebnis.uebersLager)) offen.push('Versand ins Ausland nicht hinterlegt');
    if (ergebnis.versand?.veraltet) versandVeraltet = true;
    if (ergebnis.versand?.selbst) eigeneZustellung = true;

    // Warnung 3: Teillieferung loest den Frachtzuschlag erneut aus.
    const zuschlag = ergebnis.z && !ergebnis.z.paket ? ergebnis.z.betrag : null;
    if (inDerMail && zuschlag > 0) {
      const name = lieferantName(lieferant);
      if (tage.size && offenJetzt) {
        hinweise.push({ art: 'teillieferung', text: `Teillieferung: Bei ${name} wurde für diese Bestellung schon am ${[...tage].map(tagKurz).join(', ')} bestellt. Eine weitere Lieferung löst den Frachtzuschlag erneut aus, etwa ${euro(zuschlag)}.` });
      } else if (ergebnis.s.stuecke > 1 && offenJetzt) {
        hinweise.push({ art: 'teillieferung', text: `Teillieferung vermeiden: ${ergebnis.s.stuecke} Stücke von ${name}. Kommen sie getrennt, fällt der Frachtzuschlag je Lieferung an, etwa ${euro(zuschlag)}. Beim Bestellen um eine gemeinsame Lieferung bitten.` });
      }
    }
  }
  // Dieselbe Bestellung geht beim selben Lieferanten an zwei Ziele: Das sind zwei Lieferungen.
  const zieleJeLieferant = new Map();
  for (const m of mailsMitPosition) {
    for (const p of m.positionen) {
      const id = (auftrag.positionen.find(x => x.lineItemId === p.lineItemId) ?? {}).lieferant;
      if (!zieleJeLieferant.has(id)) zieleJeLieferant.set(id, new Set());
      zieleJeLieferant.get(id).add(m.lieferziel);
    }
  }
  for (const [id, ziele] of zieleJeLieferant) {
    if (ziele.size > 1) hinweise.push({ art: 'teillieferung', text: `Zwei Lieferungen: ${lieferantName(id)} liefert diese Bestellung an ${ziele.size} verschiedene Ziele. Der Frachtzuschlag fällt je Lieferung an.` });
  }

  const weg = summe(posten.filter(x => x.art === 'weg').map(x => x.betrag));
  const kettel = summe(posten.filter(x => x.art === 'kettel').map(x => x.betrag));
  const wegBekannt = !offen.length;
  const rohertrag = netto !== null && ekBekannt ? r2(netto - ekSumme - weg - kettel) : null;
  const quote = rohertrag !== null && netto > 0 ? rohertrag / netto : null;

  // Warnung 2: bestellte Menge gegen verkaufte Menge.
  let mehrkosten = 0;
  const verschnitt = { stuecke: [], verkauft: 0, voll: 0, euro: 0, m2Mehr: 0 };
  for (const e of eintraege) {
    if (!zielVon.has(e.p.lineItemId)) continue;
    const { verkauft, flaeche, vollerollenbreite, ekJeM2 } = e.m;
    if (verkauft === null) continue;
    if (flaeche !== null && !e.m.stueck && flaeche - verkauft >= 0.1) {
      const mehr = flaeche - verkauft;
      const euroMehr = ekJeM2 ? mehr * ekJeM2 : null;
      if (euroMehr === null ? mehr >= SCHWELLEN.mengeM2 : euroMehr >= SCHWELLEN.mengeEuro) {
        hinweise.push({ art: 'menge', text: `Menge weicht ab: ${e.p.titel ?? 'Artikel'}, verkauft ${m2(verkauft)}, bestellt ${m2(flaeche)}${euroMehr !== null ? `, etwa ${euro(euroMehr)} mehr Einkauf` : ''}.` });
      }
    }
    if (vollerollenbreite !== null && flaeche !== null && vollerollenbreite > flaeche) {
      verschnitt.stuecke.push(e);
      verschnitt.verkauft += verkauft;
      verschnitt.voll += vollerollenbreite;
      verschnitt.m2Mehr += vollerollenbreite - flaeche;
      verschnitt.euro = ekJeM2 && verschnitt.euro !== null ? verschnitt.euro + (vollerollenbreite - flaeche) * ekJeM2 : null;
    }
  }
  if (verschnitt.stuecke.length && (verschnitt.euro === null ? verschnitt.m2Mehr >= SCHWELLEN.mengeM2 : verschnitt.euro >= SCHWELLEN.mengeEuro)) {
    if (verschnitt.euro !== null) mehrkosten = verschnitt.euro;
    const eins = verschnitt.stuecke.length === 1;
    const breite = [...new Set(verschnitt.stuecke.map(e => e.m.rolle))].join(' und ');
    hinweise.push({ art: 'menge', text: `Verschnitt möglich: ${eins ? (verschnitt.stuecke[0].p.titel ?? 'Artikel') : `${verschnitt.stuecke.length} Stücke`}, verkauft ${m2(verschnitt.verkauft)}. Berechnet der Lieferant die volle Rollenbreite (${breite} cm), sind es ${eins ? '' : 'bis zu '}${m2(verschnitt.voll)}${verschnitt.euro !== null ? `, etwa ${euro(verschnitt.euro)} mehr Einkauf` : ''}. Beim Bestellen klären: nur die tatsächliche Fläche.` });
  }
  const lieferantenInMail = new Set(eintraege.filter(e => zielVon.has(e.p.lineItemId)).map(e => e.p.lieferant));
  for (const id of lieferantenInMail) {
    if (mindestmenge[id]) hinweise.push({ art: 'menge', text: `Mindestmenge bei ${lieferantName(id)}: ${mindestmenge[id]}` });
  }

  const rohertragVerschnitt = rohertrag !== null && mehrkosten > 0 ? r2(rohertrag - mehrkosten) : null;
  const quoteVerschnitt = rohertragVerschnitt !== null && netto > 0 ? rohertragVerschnitt / netto : null;
  const wegAnteil = netto > 0 ? weg / netto : null;
  const wegTeuer = wegAnteil !== null && wegAnteil >= SCHWELLEN.wegAnteil && weg >= SCHWELLEN.wegEuro;

  // Warnung 1: Rohertrag. Hoechstens ein Satz faellt auf, die Rechnung steht darunter.
  const rechnung = [];
  if (netto !== null) rechnung.push({ text: 'Verkauf netto', betrag: netto });
  if (ekBekannt) rechnung.push({ text: 'Einkauf', betrag: -ekSumme });
  else if (ekSumme > 0) rechnung.push({ text: 'Einkauf, soweit bekannt', betrag: -ekSumme });
  for (const x of posten) rechnung.push({ text: x.text, betrag: -x.betrag });
  if (rohertrag !== null) rechnung.push({ text: 'Bleibt (Schätzung)', betrag: rohertrag, ergebnis: true });
  if (rohertragVerschnitt !== null) rechnung.push({ text: 'Bleibt bei voller Rollenbreite', betrag: rohertragVerschnitt, ergebnis: true });

  let stufe = null;
  let kopf = null;
  if (rohertrag !== null) {
    const zahl = `etwa ${euro(rohertrag)} (${Math.round(quote * 100)} %)`;
    if (rohertrag < 0) { stufe = 'crit'; kopf = `Verlust wahrscheinlich: ${zahl}`; }
    else if (quote !== null && quote < SCHWELLEN.rohertragQuote) { stufe = 'warn'; kopf = `Rohertrag niedrig: ${zahl}`; }
    else if (rohertragVerschnitt !== null && rohertragVerschnitt < 0) { stufe = 'crit'; kopf = `Verlust möglich bei voller Rollenbreite: etwa ${euro(rohertragVerschnitt)}`; }
    else if (quoteVerschnitt !== null && quoteVerschnitt < SCHWELLEN.rohertragQuote) { stufe = 'warn'; kopf = `Rohertrag ${zahl}, bei voller Rollenbreite niedrig: etwa ${euro(rohertragVerschnitt)} (${Math.round(quoteVerschnitt * 100)} %)`; }
    else if (wegTeuer) { stufe = 'warn'; kopf = `Weg zum Kunden teuer: etwa ${euro(weg)} (${Math.round(wegAnteil * 100)} % vom Netto), Rohertrag ${zahl}`; }
  } else if (wegTeuer) {
    stufe = 'warn';
    kopf = `Rohertrag unbekannt, Weg zum Kunden teuer: etwa ${euro(weg)} (${Math.round(wegAnteil * 100)} % vom Netto)`;
  } else {
    stufe = 'leise';
    kopf = 'Rohertrag unbekannt';
  }
  if (!kopf && !hinweise.length) return null;
  if (!kopf) { stufe = 'warn'; kopf = `Mehrkosten möglich, Rohertrag etwa ${euro(rohertrag)}${quote !== null ? ` (${Math.round(quote * 100)} %)` : ''}`; }
  if (stufe === 'leise' && hinweise.length) stufe = 'warn';

  const anmerkungen = [];
  if (!ekBekannt) anmerkungen.push(`Einkaufspreis fehlt für: ${[...new Set(ohneEk.map(e => e.p.titel ?? 'Artikel'))].join(', ')}.`);
  if (netto === null) anmerkungen.push('Verkaufspreis nicht lesbar.');
  if (!ekBekannt && netto !== null && wegBekannt) {
    const bleibt = netto - weg - kettel - ekSumme;
    anmerkungen.push(bleibt > 0 ? `Für den fehlenden Einkauf bleiben höchstens ${euro(bleibt)}, sonst ist es Verlust.` : 'Schon ohne den fehlenden Einkauf bleibt nichts.');
  }
  for (const grund of new Set(offen)) anmerkungen.push(`Nicht eingerechnet: ${grund}.`);
  if (eigeneZustellung) anmerkungen.push('Nicht eingerechnet: Fahrt und Abholung, der Kunde liegt in unserem Liefergebiet.');
  if (ek.verfuegbar && eintraege.some(e => e.m.zeile?.sicherheit === 'abgeleitet')) anmerkungen.push(`Einkauf aus der abgeleiteten EK-Liste (Stand ${ek.stand}), echte Rechnungen können abweichen.`);
  if (versandVeraltet) anmerkungen.push('Versand mit dem letzten hinterlegten Dieselwert gerechnet.');

  return {
    orderId: auftrag.id,
    orderName: auftrag.name,
    stufe,
    kopf,
    rechnung,
    anmerkungen,
    hinweise,
    wege: wegeHinweise({ eintraege, kosten, nah, lieferantName }),
    rohertrag,
    quote,
    wegAnteil,
  };
}

/** Guenstigere Wege, soweit sie aus den Daten folgen. Alles andere bleibt eine Abwaegung von Hand. */
function wegeHinweise({ eintraege, kosten, nah, lieferantName }) {
  const wege = [];
  const inMail = eintraege;
  const ueberUns = inMail.filter(e => e.ziel === 'laden' && !wirdGekettelt(e.p.ausfuehrung));
  for (const id of new Set(ueberUns.map(e => e.p.lieferant))) {
    const k = kosten.lieferanten[id];
    if (k && !k.anKundenNurImLiefergebiet && !nah) wege.push(`${lieferantName(id)} kann direkt an den Kunden liefern: Der Weiterversand von uns entfällt.`);
  }
  const zumKettler = inMail.filter(e => e.ziel === 'kettler');
  if (zumKettler.some(e => e.m.stueck && Math.min(e.m.stueck.breiteCm, e.m.stueck.laengeCm) > 200) && !nah) {
    wege.push('Kurze Seite über 200 cm: Der Kettler versendet per Spedition. Wenn der Lieferant selbst kettelt, entfällt dieser Weg.');
  }
  return wege;
}

/**
 * Haengt die Warnungen an die Mails einer fertigen Dialog-Antwort. Eine Fracht an unseren Kettler oder
 * in den Laden teilen sich die Bestellungen derselben Mail.
 */
export function warnungenAnhaengen(antwort, { modell, privatDir, stammdaten, stammdatenDatei, statusAlle, tarif, nahPlz, jetzt = new Date() }) {
  if (antwort?.art !== 'ware' || !antwort.mails?.length) return antwort;
  const kosten = leseLieferkosten(stammdatenDatei);
  const ek = leseEkListe(privatDir);
  const absender = stammdaten?.absender ?? null;
  const name = id => (id === 'UNGEKLAERT' ? 'dem nicht zugeordneten Lieferanten' : (stammdaten?.lieferanten?.[id]?.name ?? `Lieferant ${id}`));
  const mindestmenge = Object.fromEntries(Object.entries(stammdaten?.lieferanten ?? {}).filter(([, l]) => l.mindestmenge).map(([id, l]) => [id, l.mindestmenge]));
  const sammel = antwort.mails.map(m => ({
    lieferziel: m.lieferziel,
    positionen: m.positionen ?? [],
    teiler: ['kettler', 'laden'].includes(m.lieferziel) ? new Set((m.positionen ?? []).map(p => p.orderId)).size || 1 : 1,
  }));
  const fertig = new Map();
  const warnung = orderId => {
    if (fertig.has(orderId)) return fertig.get(orderId);
    const auftrag = (modell?.auftraege ?? []).find(a => a.id === orderId);
    const w = auftrag ? bestellWarnung({
      auftrag, mailsMitPosition: sammel.filter(m => m.positionen.some(p => p.orderId === orderId)).map(m => ({ ...m, positionen: m.positionen.filter(p => p.orderId === orderId) })),
      kosten, ek, tarif, statusAlle, absender, nahPlz, ladenPlz: absender?.lieferanschrift?.plz || null, mindestmenge, jetzt, lieferantName: name,
    }) : null;
    fertig.set(orderId, w);
    return w;
  };
  // Geht eine Bestellung in zwei Mails, steht ihre Warnung nur an der ersten.
  const gezeigt = new Set();
  const mails = antwort.mails.map(m => {
    // Auch Bestellungen, die noch nicht in die Mail duerfen (z. B. Lieferant nicht zugeordnet).
    const ids = [...new Set([...(m.positionen ?? []), ...(m.fehlt ?? [])].map(p => p.orderId))];
    const liste = ids.filter(id => !gezeigt.has(id)).map(warnung).filter(Boolean);
    ids.forEach(id => gezeigt.add(id));
    return liste.length ? { ...m, kostenWarnungen: liste } : m;
  });
  return { ...antwort, mails };
}
