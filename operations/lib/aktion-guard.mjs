// Aktions-Guard (Werkbank w-310, Konzept domains/shopify/aktionssystem-konzept.md,
// Abschnitt Empfehlung Punkt 4): Anzeige und Abrechnung einer Aktion muessen
// zusammenpassen.
//
//   Anzeige    = Metaobjekt tp_aktion (Top-Leiste, Produktseite, Karte, Rollenrechner)
//                und die Produktfelder aktion.start/ende/klasse
//   Abrechnung = automatischer Shopify-Rabatt (DiscountAutomaticBasic) auf eine Kollektion
//
// Teil-Guard: geprueft werden Zeitraum, Prozent und Kollektion zwischen tp_aktion und
// Rabatt, der Zeitraum aktion.* an jedem Rabatt-Produkt, Rabatt-Produkte mit zusaetzlich
// reduziertem Variantenpreis (Doppelrabatt) und laufende Produkt-Aktionen ohne jede
// Abrechnung. Ob jeder Warenkorbpreis auf den Cent stimmt, prueft er nicht.
//
// Reine Funktionen ohne Netz; das Lesen macht operations/scripts/aktion-guard.mjs.

import { aktionAktiv } from './angebote-abgleich.mjs';

const tag = (wert) => (wert ? String(wert).slice(0, 10) : '');

/** ISO-Zeitpunkt -> JJJJ-MM-TT in Europe/Berlin. */
export function tagBerlin(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function plusEinTag(jjjjmmtt) {
  const d = new Date(`${jjjjmmtt}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Passt das Rabatt-Ende zum letzten Aktionstag? Erlaubt: Ende am letzten Tag selbst
 * (bis 23:59) oder am Morgen des Folgetags (Shopify-Admin speichert "bis 30.11." oft
 * als 01.12. frueh). Ohne Ende laeuft der Rabatt unbegrenzt weiter - das passt nie.
 */
export function endePasst(rabattEnde, aktionEnde) {
  if (!rabattEnde || !aktionEnde) return false;
  const t = tagBerlin(rabattEnde);
  if (t === aktionEnde) return true;
  if (t !== plusEinTag(aktionEnde)) return false;
  const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(rabattEnde));
  const stunde = Number(teile.find((t) => t.type === 'hour')?.value);
  return stunde < 12;
}

/** Zaehlt nur fuer laufende oder geplante Rabatte, die heute oder spaeter gelten. */
function rabattRelevant(r, heute) {
  if (!['ACTIVE', 'SCHEDULED'].includes(r.status)) return false;
  return !r.ende || tagBerlin(r.ende) >= heute;
}

function aktionRelevant(a, heute) {
  return a.aktiv === true && tag(a.ende) && tag(a.ende) >= heute && a.kollektion;
}

/**
 * @param {object} eingabe
 * @param {Array<{titel,status,start,ende,prozent,kollektionen:string[]}>} eingabe.rabatte  prozent 0..100
 * @param {Array<{aktiv,start,ende,kollektion,prozent}>} eingabe.aktionen  aus aktionAusMetaobjekt
 * @param {Array<{handle,mf:{aktion_start,aktion_ende,aktion_klasse},kollektionen:string[],vergleichspreis:boolean}>} eingabe.produkte
 * @param {string} eingabe.heute JJJJ-MM-TT (Berlin)
 * @returns {{fehler: string[], hinweise: string[], geprueft: object}}
 */
export function pruefeAktionen({ rabatte = [], aktionen = [], produkte = [], heute }) {
  const fehler = [];
  const hinweise = [];
  const laufendeRabatte = rabatte.filter((r) => rabattRelevant(r, heute));
  const relevanteAktionen = aktionen.filter((a) => aktionRelevant(a, heute));

  for (const a of relevanteAktionen) {
    const passende = laufendeRabatte.filter((r) => r.kollektionen.includes(a.kollektion));
    if (passende.length === 0) {
      fehler.push(`Anzeige ohne Abrechnung: tp_aktion ${a.start}–${a.ende} (${a.prozent} %) auf ${a.kollektion}, aber kein laufender automatischer Rabatt auf diese Kollektion.`);
      continue;
    }
    if (passende.length > 1) fehler.push(`Mehrere automatische Rabatte auf ${a.kollektion}: ${passende.map((r) => r.titel).join(', ')} - Doppelrabatt moeglich.`);
    for (const r of passende) {
      if (Math.abs(Number(r.prozent) - Number(a.prozent)) > 0.001) fehler.push(`Prozent weicht ab: tp_aktion ${a.prozent} %, Rabatt "${r.titel}" ${r.prozent} %.`);
      if (tagBerlin(r.start) > tag(a.start)) fehler.push(`Rabatt "${r.titel}" beginnt erst ${tagBerlin(r.start)}, die Anzeige schon ${tag(a.start)}.`);
      if (!endePasst(r.ende, tag(a.ende))) fehler.push(`Ende weicht ab: tp_aktion bis ${tag(a.ende)}, Rabatt "${r.titel}" bis ${r.ende ? tagBerlin(r.ende) : 'unbegrenzt'}.`);
    }
  }

  for (const r of laufendeRabatte) {
    for (const k of r.kollektionen) {
      if (!relevanteAktionen.some((a) => a.kollektion === k)) {
        fehler.push(`Abrechnung ohne Anzeige: Rabatt "${r.titel}" (${r.prozent} %) auf ${k}, aber kein aktives tp_aktion-Metaobjekt fuer diese Kollektion.`);
      }
    }
  }

  // Produkte: Mitglieder einer Rabatt-Kollektion tragen aktion.* bewusst mit (Anzeige,
  // Ausschluss der kostenlosen Verlegung, Black Week 2026). Pruefen: Zeitraum gleich der
  // Anzeige-Aktion, kein zusaetzlich reduzierter Variantenpreis (Doppelrabatt).
  const aktionFuer = new Map(relevanteAktionen.map((a) => [a.kollektion, a]));
  const rabattKollektionen = new Set(laufendeRabatte.flatMap((r) => r.kollektionen));
  let mitEigenerAktion = 0;
  let imRabatt = 0;
  for (const p of produkte) {
    const mf = p.mf ?? {};
    const kollektionen = (p.kollektionen ?? []).filter((k) => rabattKollektionen.has(k));
    if (kollektionen.length) {
      imRabatt += 1;
      if (p.vergleichspreis) fehler.push(`Doppelrabatt moeglich: ${p.handle} liegt im automatischen Rabatt und hat zusaetzlich einen Vergleichspreis (Variantenpreis reduziert).`);
      const a = aktionFuer.get(kollektionen[0]);
      if (!tag(mf.aktion_start)) hinweise.push(`${p.handle}: im Rabatt, aber ohne aktion.start (kostenlose Verlegung nicht ausgeschlossen).`);
      else if (a && (tag(mf.aktion_ende) !== tag(a.ende) || tag(mf.aktion_start) > tag(a.start))) {
        fehler.push(`Zeitraum am Produkt weicht ab: ${p.handle} aktion ${tag(mf.aktion_start)} bis ${tag(mf.aktion_ende) || 'offen'}, Aktion ${tag(a.start)} bis ${tag(a.ende)}.`);
      }
      continue;
    }
    if (mf.aktion_klasse === 'preisanker' || !aktionAktiv(mf, heute)) continue;
    mitEigenerAktion += 1;
    if (!p.vergleichspreis) fehler.push(`Anzeige ohne Abrechnung: ${p.handle} hat eine laufende Aktion (bis ${tag(mf.aktion_ende) || 'offen'}), liegt in keinem automatischen Rabatt und hat keinen reduzierten Variantenpreis.`);
    else hinweise.push(`${p.handle}: eigene Aktion bis ${tag(mf.aktion_ende) || 'offen'} ueber den Variantenpreis.`);
  }

  return {
    fehler,
    hinweise,
    geprueft: { rabatte: laufendeRabatte.length, aktionen: relevanteAktionen.length, produkte: produkte.length, imRabatt, mitEigenerAktion },
  };
}

/** Admin-API-Knoten eines Rabatts -> internes Modell (nur DiscountAutomaticBasic mit Prozent). */
export function rabattAusKnoten(n) {
  const d = n?.discount;
  if (d?.__typename !== 'DiscountAutomaticBasic') return null;
  const wert = d.customerGets?.value;
  if (wert?.__typename !== 'DiscountPercentage') return null;
  const kollektionen = d.customerGets?.items?.__typename === 'DiscountCollections'
    ? (d.customerGets.items.collections?.nodes ?? []).map((c) => c.id)
    : [];
  return { titel: d.title, status: d.status, start: d.startsAt, ende: d.endsAt, prozent: Math.round(Number(wert.percentage) * 10000) / 100, kollektionen };
}
