/**
 * Text-Regeln: Ton, Hashtags, Handlungsaufruf, Pruefung.
 *
 * Geschrieben werden die Texte von der Redaktion (Claude, siehe
 * social/AGENTEN.md). Dieses Modul haelt fest, woran sich jeder Text messen
 * lassen muss - und prueft es, bevor ein Beitrag in die Freigabe geht. So
 * bleibt der Ton derselbe, egal wer oder was den Text verfasst hat.
 */

import { BETRIEB, REGION } from './konfig.mjs';
import { TYPEN } from './status.mjs';

/** Der Ton in einem Absatz - wird woertlich an die Redaktion weitergegeben. */
export const STILREGELN = `
Ton: professionell, freundlich, handwerklich, verständlich, lokal, glaubwürdig. Nicht werblich.
Anrede: Sie. Wir-Form für den Betrieb.
Aufbau: 1) Was wurde gemacht oder was ist zu sehen – konkret, in einem bis drei Sätzen.
        2) Optional ein Fachdetail, das ein Laie nicht wüsste.
        3) Ein kurzer Hinweis, was wir übernehmen oder wo es das Produkt gibt.
Länge: 2–5 Sätze. Kein Absatz ohne Information.
Beispiel: "Heute haben wir in Oranienburg einen alten Teppichboden entfernt, den Untergrund vorbereitet und anschließend neuen Klebevinyl verlegt. Sie planen ebenfalls einen neuen Boden? Wir übernehmen Beratung, Aufmaß, Lieferung und Verlegung."
Verboten: Floskeln wie "Tauchen Sie ein in die faszinierende Welt", "Wir sind unglaublich stolz", "Traumboden", "Wohlfühloase", "perfekt", "einzigartig"; Ausrufezeichen-Ketten; mehr als ein Emoji; Superlative ohne Beleg.
Fakten: nur, was in den Angaben steht. Keine erfundenen Maße, Materialien, Preise oder Eigenschaften. Ort nur, wenn er angegeben ist – nie Straße, Hausnummer oder Kundenname.
Preise: nur Euro je Quadratmeter aus den Shopdaten, nie den Paketpreis. Im Zweifel ohne Preis.
`.trim();

const FLOSKELN = [
  /tauchen sie ein/i, /faszinierende[nr]? welt/i, /unglaublich stolz/i, /wir sind stolz/i, /traumboden/i,
  /wohlf(ü|ue)hloase/i, /entdecken sie die welt/i, /lassen sie sich (inspirieren|verzaubern)/i,
  /nicht nur .{3,60}, sondern auch/i, /in der heutigen zeit/i, /das gewisse etwas/i, /hingucker/i,
  /ein echtes highlight/i, /verleiht .{0,30}das besondere/i, /l(ä|ae)sst keine w(ü|ue)nsche offen/i,
  /\bperfekt(e|er|en|es)?\b/i, /\beinzigartig(e|er|en|es)?\b/i, /\bgame.?changer\b/i,
];
const SUPERLATIVE = /\b(beste[nrs]?|g(ü|ue)nstigste[nrs]?|billigste[nrs]?|nr\.?\s*1|nummer eins|gr(ö|oe)(ß|ss)te[nrs]? auswahl)\b/i;
const DUZEN = /\b(du|dich|dir|dein(e|er|en|em)?|euch|eure?[nrms]?|ihr habt|schaut|kommt vorbei)\b/i;
// Strassenwort gefolgt von einer Hausnummer - als eigenes Wort ("Bernauer Straße 12") oder angehaengt ("Musterweg 5").
const ADRESSE = /(?:stra(?:ß|ss)e|str\.|weg|allee|gasse|platz|damm|ring|chaussee)\s+\d+/iu;
const EIGENE_ADRESSE = /saarlandstra(ß|ss)e\s*73/i;
const PREIS = /\d+(?:[.,]\d{1,2})?\s*(€|eur\b|euro\b)/i;
const EMOJI = /\p{Extended_Pictographic}/gu;

/**
 * Prueft einen Beitragstext. `fehler` verhindern den Entwurf, `hinweise`
 * stehen in der Freigabe und schliessen eine automatische Freigabe aus.
 */
export function pruefeText(text, { hashtags = [] } = {}) {
  const t = String(text ?? '').trim();
  const fehler = []; const hinweise = [];
  if (t.length < 40) fehler.push('Text zu kurz – es fehlt, was zu sehen ist.');
  if (t.length > 2000) fehler.push('Text zu lang (über 2000 Zeichen).');
  for (const f of FLOSKELN) { const m = f.exec(t); if (m) fehler.push(`Floskel: „${m[0]}“`); }
  const ohneEigene = t.replace(EIGENE_ADRESSE, '');
  if (ADRESSE.test(ohneEigene)) fehler.push('Text enthält eine Adresse – nie genauer als der Ort.');
  if ((t.match(EMOJI) ?? []).length > 1) hinweise.push('Mehr als ein Emoji.');
  if ((t.match(/!/g) ?? []).length > 1) hinweise.push('Mehrere Ausrufezeichen.');
  if (DUZEN.test(t)) hinweise.push('Anrede: Text duzt – im Shop siezen wir.');
  if (SUPERLATIVE.test(t)) hinweise.push('Superlativ ohne Beleg – wettbewerbsrechtlich heikel.');
  if (PREIS.test(t)) hinweise.push('Preis im Text – bitte gegen den Shop prüfen.');
  if (hashtags.length > 12) hinweise.push('Mehr als 12 Hashtags.');
  return { fehler, hinweise, ok: fehler.length === 0 };
}

function tag(wort) {
  const s = String(wort ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
  return s ? `#${s}` : null;
}

const FACH = [
  [/klebevinyl/i, ['klebevinyl', 'vinylboden', 'designboden']],
  [/klickvinyl/i, ['klickvinyl', 'vinylboden', 'designboden']],
  [/vinyl/i, ['vinylboden', 'bodenbelag']],
  [/teppichfliese/i, ['teppichfliesen', 'teppichboden']],
  [/teppich nach ma/i, ['teppichnachmass', 'teppich']],
  [/teppichboden|velours|schlinge/i, ['teppichboden', 'teppich']],
  [/teppich|dekofell/i, ['teppich', 'wohnteppich']],
  [/linoleum/i, ['linoleum', 'naturboden']],
  [/laminat/i, ['laminat']],
  [/parkett/i, ['parkett']],
  [/treppe/i, ['treppenrenovierung', 'treppe']],
  [/sauberlauf/i, ['sauberlauf', 'schmutzfangmatte']],
  [/leiste/i, ['sockelleisten']],
];

/**
 * Hashtags: wenige, passende, lokale. Orts-Hashtags nur, wenn der Ort bekannt
 * ist - geraten wird nicht.
 */
export function hashtags({ ort = null, bodenart = '', typ = '', plattform = 'instagram' } = {}) {
  const liste = [];
  if (ort) {
    for (const teil of String(ort).split(/[-/]/)) liste.push(tag(teil));
    liste.push(tag(/^berlin/i.test(ort) ? REGION.Berlin : REGION.standard));
  }
  liste.push(tag(BETRIEB.ort));
  const fach = FACH.find(([re]) => re.test(bodenart));
  if (fach) liste.push(...fach[1].map(tag));
  const gruppe = TYPEN[typ]?.gruppe;
  if (gruppe === 'handwerk') liste.push('#bodenleger', '#bodenverlegung', '#handwerk');
  if (typ === 'vorher_nachher') liste.push('#vorhernachher', '#renovierung');
  if (gruppe === 'produkt' || gruppe === 'angebot') liste.push('#bodenbelag', '#wohnen');
  if (gruppe === 'wissen') liste.push('#bodenwissen', '#bodenbelag');
  liste.push('#teppichparadies');
  const eindeutig = [...new Set(liste.filter(Boolean))];
  // Auf Facebook bringen Hashtags wenig und wirken schnell wie Werbung.
  return eindeutig.slice(0, plattform === 'facebook' ? 3 : 10);
}

const CTA = {
  handwerk: [
    'Sie planen ebenfalls einen neuen Boden? Wir übernehmen Beratung, Aufmaß, Lieferung und Verlegung.',
    'Neuer Boden geplant? Wir messen auf, liefern und verlegen – in Oranienburg und bis 50 km Umkreis.',
    'Fragen zum eigenen Projekt? Rufen Sie an (03301 573 37 20) oder kommen Sie im Laden in Oranienburg vorbei.',
  ],
  produkt: [
    'Im Shop ansehen: teppich-paradies.net – bis zu 3 Muster kostenlos.',
    'Muster bestellen und zu Hause vergleichen – bis zu 3 Muster sind kostenlos.',
    'Im Laden in Oranienburg zum Anfassen oder online unter teppich-paradies.net.',
  ],
  angebot: [
    // Bewusst ohne "solange der Vorrat reicht" oder Enddatum: beides weiss das System nicht.
    'Den aktuellen Preis sehen Sie im Shop unter teppich-paradies.net – oder Sie kommen im Laden in Oranienburg vorbei.',
  ],
  wissen: [
    'Fragen dazu? Wir beraten im Laden in Oranienburg oder am Telefon: 03301 573 37 20.',
  ],
  betrieb: [
    'Saarlandstraße 73–81 in Oranienburg – Mo–Fr 8:30–18:00, Sa 8:30–14:30.',
  ],
};

/** Handlungsaufruf passend zur Art. `wechsel` sorgt dafuer, dass nicht jeder Beitrag gleich endet. */
export function cta(typ, wechsel = 0) {
  const liste = CTA[TYPEN[typ]?.gruppe] ?? CTA.produkt;
  return liste[Math.abs(wechsel) % liste.length];
}

const TAT = {
  'Altbelag entfernt': 'den alten Belag entfernt',
  'Untergrund vorbereitet': 'den Untergrund vorbereitet',
  Gespachtelt: 'den Untergrund gespachtelt',
  'Treppe belegt': 'die Treppe belegt',
  'Leisten montiert': 'die Sockelleisten montiert',
  Lieferung: 'geliefert',
  'Aufmaß': 'aufgemessen',
};

/**
 * Notfalltext aus den reinen Angaben - damit ein Entwurf auch dann entsteht,
 * wenn die Redaktion einmal nicht laeuft. Bewusst schlicht; er behauptet
 * nichts, was nicht angegeben wurde.
 */
export function grundtext(inhalt, wechsel = 0) {
  if (inhalt.quelle === 'baustelle' || inhalt.quelle === 'referenz') {
    const taten = String(inhalt.taetigkeit ?? '').split(',').map(t => t.trim()).filter(Boolean);
    const schritte = taten.filter(t => t !== 'Verlegung').map(t => TAT[t]).filter(Boolean);
    const boden = inhalt.bodenart ? `${inhalt.bodenart} verlegt` : 'den neuen Boden verlegt';
    if (!schritte.includes('die Treppe belegt')) schritte.push(boden);
    const reihe = schritte.length > 1 ? `${schritte.slice(0, -1).join(', ')} und ${schritte.at(-1)}` : schritte[0];
    // Wie im Bild und in den Hashtags: ein Ort, den wir nicht kennen, wird nicht genannt.
    const ort = inhalt.daten?.ortBekannt === false ? null : inhalt.ort;
    const wo = ort ? `In ${ort} haben wir` : 'Bei diesem Projekt haben wir';
    const raum = inhalt.raum ? ` – hier im ${inhalt.raum === 'Küche' ? 'Bereich Küche' : inhalt.raum}` : '';
    const extra = inhalt.besonderheit ? ` ${inhalt.besonderheit.replace(/\s*$/, '').replace(/([^.!?])$/, '$1.')}` : '';
    return `${wo} ${reihe}${raum}.${extra}\n\n${cta(inhalt.typ, wechsel)}`;
  }
  const name = inhalt.produkt_titel || inhalt.titel;
  const kopf = { produkt_neu: `Neu im Shop: ${name}.`, angebot: `Aktuell reduziert: ${name}.`, produkt_farben: `${name} – die Farben im Überblick.` }[inhalt.typ] ?? `${name}.`;
  return `${kopf}\n\n${cta(inhalt.typ, wechsel)}`;
}

/** Shop-Link mit Herkunftsangabe - damit die Auswertung Shopbesuche einem Beitrag zuordnen kann. */
export function shopLink(url, { beitragId = null, plattform = 'instagram' } = {}) {
  if (!url) return null;
  const u = new URL(url);
  u.searchParams.set('utm_source', plattform);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', 'organisch');
  if (beitragId) u.searchParams.set('utm_content', `b${beitragId}`);
  return u.toString();
}

/** Setzt Text, Link und Hashtags je Plattform zusammen. Instagram-Links sind nicht klickbar - dort nur die Domain. */
export function fertigerText({ text, tags = [], link = null, plattform = 'instagram' }) {
  const teile = [String(text).trim()];
  if (link && plattform === 'facebook') teile.push(link);
  if (tags.length) teile.push(tags.join(' '));
  return teile.join('\n\n');
}
