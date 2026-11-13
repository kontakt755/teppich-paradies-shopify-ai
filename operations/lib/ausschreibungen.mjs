/**
 * Ausschreibungen Bodenbelag: reine Funktionen fuer operations/scripts/ausschreibungen-pruefen.mjs.
 * Quellen ohne Konto: TED-Suche (EU-weit, oberhalb der Schwellenwerte), die Tagesexporte von
 * oeffentlichevergabe.de (OCDS, auch unterhalb der Schwelle), die RSS-Feeds von service.bund.de
 * und der Vergabeplattform Berlin und die oeffentliche CPV-Liste von dtvp.de.
 * Nationale Bekanntmachungen (z. B. vom Vergabemarktplatz Brandenburg) tragen dort nur
 * die grobe Region DE3/DE4, die PLZ im Ortsfeld ("15745 Wildau") und keine Frist.
 */
import { titelKurz, sichereUrl, kleineZuerst } from '../../docs/ai-dashboard/lib/akquise.mjs';

/**
 * CPV-Familien (Anfang der Nummer): Bodenbelagsarbeiten 454321xx (Verlegen, Parkett, Doppelboden,
 * 45432130 Bodenbelagsarbeiten) sowie Lieferung von Teppichen 3953xxxx und Bodenbelaegen 441122xx.
 */
export const CPV = ['454321', '3953', '441122'];
/** NUTS-3 im Umkreis Oranienburg: Oberhavel, Havelland, Barnim, Berlin + Nachbarkreise. */
export const NUTS = ['DE40A', 'DE409', 'DE405', 'DE300', 'DE408', 'DE403', 'DE404'];
/**
 * Unterschwellige Bekanntmachungen tragen meist nur das Land ("DE4") und die PLZ des Ausfuehrungsorts.
 * shortcut: PLZ-Anfaenge statt Entfernung (Berlin 10/12/13/14, Potsdam bis Rathenow 144-147,
 * Strausberg 153, Oberhavel/Barnim/Ruppin 160-168); eine Umkreisrechnung erst, wenn das zu grob wird.
 */
const PLZ_UMKREIS = /^(1[023]|14[0-7]|153|16[0-8])/;
/** Suchwoerter im Titel - fuer Feeds ohne CPV und Bekanntmachungen mit zu allgemeiner CPV. */
const BODEN = /bodenbel[aä]g|bodenleg|teppich|linoleum|parkett/i;

const cpvPasst = id => CPV.some(p => String(id || '').startsWith(p));
const plzAus = text => String(text || '').match(/\b\d{5}\b/)?.[0] || '';

/** Region passt: NUTS-3 aus der Liste, Berlin als Land, sonst (Brandenburg oder ohne Angabe) die PLZ im Umkreis. */
export function imUmkreis(nuts, plz) {
  const n = String(nuts || '');
  if (n.length >= 5) return NUTS.includes(n);
  if (n.startsWith('DE3')) return true;
  // Brandenburg ganz ohne PLZ ist selten (2 von 312 im November 2026): lieber zeigen als uebersehen.
  if (n.startsWith('DE4') && !plz) return true;
  return (!n || n.startsWith('DE4')) && PLZ_UMKREIS.test(String(plz));
}

export function tedAbfrage(abTag) {
  return {
    query: `classification-cpv IN (${CPV.map(p => `${p}*`).join(' ')}) AND place-of-performance IN (${NUTS.join(' ')}) AND deadline-receipt-tender-date-lot>=${abTag.replaceAll('-', '')}`,
    fields: ['notice-title', 'buyer-name', 'buyer-city', 'deadline-receipt-tender-date-lot', 'place-of-performance', 'procedure-type', 'estimated-value-lot'],
    limit: 100,
  };
}

const ersterText = v => (v && typeof v === 'object' && !Array.isArray(v) ? (v.deu ?? Object.values(v)[0]) : v);
const erster = v => (Array.isArray(v) ? v[0] : v);

/** Verfahrensarten der Feeds in Klartext; "Öffentliche Ausschreibung" & Co. sind die kleinen (unter EU-Schwelle). */
const VERFAHREN = {
  open: 'Offenes Verfahren (EU)', restricted: 'Nicht offenes Verfahren (EU)',
  'public announcement': 'Öffentliche Ausschreibung', 'restricted tender': 'Beschränkte Ausschreibung',
  'restricted tender with public participation competition': 'Beschränkte Ausschreibung mit Teilnahmewettbewerb',
  'negotiated award with public participation competition': 'Verhandlungsvergabe mit Teilnahmewettbewerb',
  'direct award': 'Direktauftrag',
};
const summe = werte => werte.map(Number).filter(v => v > 0).reduce((a, v) => a + v, 0) || null;

/** TED-Antwort -> einheitliche Treffer. */
export function ausTed(antwort) {
  return (antwort?.notices || []).map(n => ({
    quelle: 'TED',
    id: n['publication-number'],
    titel: titelKurz(erster(ersterText(n['notice-title'])) || ''),
    auftraggeber: erster(ersterText(n['buyer-name'])) || '',
    ort: erster(ersterText(n['buyer-city'])) || '',
    frist: String(erster(n['deadline-receipt-tender-date-lot']) || '').slice(0, 10) || null,
    // Links aus dem Feed nur mit http(s) uebernehmen (sichereUrl), sonst die feste TED-Adresse.
    link: sichereUrl(n.links?.html?.DEU) || `https://ted.europa.eu/de/notice/-/detail/${n['publication-number']}`,
    verfahren: VERFAHREN[String(n['procedure-type'] || '').toLowerCase()] || n['procedure-type'] || 'EU-Verfahren',
    wert: summe([n['estimated-value-lot']].flat()),
  }));
}

/** Ein OCDS-Release -> Treffer oder null (offene Bekanntmachung, Bodenbelag, Region muessen passen). */
export function ausOcds(release) {
  const t = release?.tender;
  // Zuschlagsmeldungen (award/contract) sind vergeben, Vorinformationen (planning) noch nicht ausgeschrieben - kein To-do.
  if (!t || (release.tag || []).some(x => /award|contract|planning/.test(x))) return null;
  const items = t.items || [];
  const lose = t.lots || [];
  const cpv = items.some(i => cpvPasst(i.classification?.id) || (i.additionalClassifications || []).some(c => cpvPasst(c.id)));
  if (!cpv && !BODEN.test([t.title, ...lose.map(l => l.title)].join(' '))) return null;
  const kaeufer = (release.parties || []).find(p => p.id === release.buyer?.id) || (release.parties || [])[0];
  const orte = items.map(i => i.deliveryAddress).filter(a => a?.region || a?.postalCode || a?.locality);
  const passt = orte.length
    ? orte.some(a => imUmkreis(a.region, a.postalCode || plzAus(a.locality)))
    : imUmkreis(kaeufer?.address?.region, kaeufer?.address?.postalCode);
  if (!passt) return null;
  const umfang = lose.map(l => l.description).find(d => d && d !== t.title) || '';
  return {
    quelle: 'oeffentlichevergabe.de',
    id: release.ocid,
    titel: t.title || '',
    auftraggeber: release.buyer?.name || kaeufer?.name || '',
    ort: kaeufer?.address?.locality || orte[0]?.locality || '',
    frist: (t.tenderPeriod?.endDate || '').slice(0, 10) || null,
    // Erster Dokument-Link mit http(s); javascript: & Co. aus dem Feed fallen weg (sichereUrl).
    link: (t.documents || []).map(d => sichereUrl(d?.url)).find(Boolean) || null,
    verfahren: VERFAHREN[String(t.procurementMethodDetails || '').toLowerCase()] || t.procurementMethodDetails || '',
    wert: Number(t.value?.amount) || summe(lose.map(l => l.value?.amount)),
    // Losbeschreibung nennt oft die Menge ("ca. 210 m2 Nadelvlies") - daran erkennt man kleine Vergaben.
    umfang: umfang.replace(/\s+/g, ' ').slice(0, 200),
  };
}

const ZEICHEN = { auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', amp: '&', quot: '"', nbsp: ' ' };
const klartext = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&(\w+);/g, (m, n) => ZEICHEN[n] ?? m)
  .replace(/\s+/g, ' ').trim();

/**
 * RSS von service.bund.de (Suche je Suchwort) und der Vergabeplattform Berlin -> Treffer.
 * Beide Feeds tragen keine CPV: Suchwort im Titel und PLZ des Ausfuehrungsorts entscheiden.
 */
export function ausRss(xml, quelle) {
  const treffer = [];
  for (const roh of String(xml || '').split('<item>').slice(1)) {
    const feld = name => klartext(roh.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]);
    const titel = feld('title');
    const text = feld('description');
    const [, plz = '', ort = ''] = text.match(/(?:Erfüllungsort|Ausführungsort):\s*(\d{5})?[,\s]*([^:]*?)\s*(?:Vergabestelle|Ablauf|Angebotsfrist|Eröffnungstermin|Online seit|$)/) || [];
    if (!BODEN.test(titel) || !imUmkreis('', plz)) continue;
    // Berlin nennt bei rund jedem dritten Eintrag nur den Eroeffnungstermin: der gilt dann als Frist.
    const [, t, m, j] = text.match(/Angebotsfrist:\s*(\d\d)\.(\d\d)\.(\d{4})/) || text.match(/Eröffnungstermin:\s*(\d\d)\.(\d\d)\.(\d{4})/) || [];
    const link = sichereUrl(feld('link').replace(/#.*$/, ''));
    treffer.push({
      quelle,
      id: link || `${quelle}|${titel}`,
      titel,
      auftraggeber: text.match(/Vergabestelle:\s*(.*?)\s*(?:Angebotsfrist|Veröffentlichungsende|$)/)?.[1] || '',
      ort: [plz, ort].filter(Boolean).join(' '),
      frist: j ? `${j}-${m}-${t}` : null,
      link,
      verfahren: text.match(/Verfahrensart:\s*(.*?)\s*(?:Ausführungsort|$)/)?.[1] || '',
      wert: null,
      umfang: '',
    });
  }
  return treffer;
}

/**
 * shortcut: dtvp.de nennt in der Liste keinen Ort (Details erst nach Anmeldung) - Berlin/Brandenburg nur am
 * Namen in Titel oder Vergabestelle. Vergabestellen ohne Ortsnamen fallen durch; genauer erst mit der
 * Umkreissuche von DTVP, die ein Konto oder die Sitzung eines Browsers braucht.
 * Strassennamen ("Berliner Str. 5" in Duisburg) zaehlen nicht als Ort.
 */
const DTVP_REGION = /\b(berlin|brandenburg|potsdam|oranienburg|oberhavel|hennigsdorf|velten|barnim|bernau|eberswalde|havelland|falkensee|nauen|neuruppin|strausberg|gesobau|degewo|howoge)(?!er\s+(str|platz|allee|ring|tor|weg|damm|chaussee))/i;
const isoTag = s => String(s || '').match(/(\d\d)\.(\d\d)\.(\d{4})/)?.slice(1).reverse().join('-') || null;

/**
 * Oeffentliche Liste von dtvp.de je CPV-Code (HTML-Tabelle, neueste zuerst) -> offene Ausschreibungen
 * ab `abTag` in Berlin/Brandenburg. `fertig`: die Seite reicht bis vor `abTag` oder ist leer - nicht weiterblaettern.
 */
export function ausDtvp(html, abTag) {
  const treffer = [];
  let fertig = true;
  for (const roh of String(html || '').split(/<tr[\s>]/).slice(1)) {
    const [art, pid] = roh.match(/\/(public|secured)\/company\/projectForwarding\.do[^"']*?\bpid=(\d+)/)?.slice(1) || [];
    const [seit, frist, titel, typ, auftraggeber] = [...roh.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => klartext(m[1]));
    if (!pid || !auftraggeber) continue;
    fertig = isoTag(seit) < abTag;
    // "Vergebener Auftrag" ist vergeben, "Beabsichtigte Ausschreibung" noch nicht ausgeschrieben - kein To-do.
    if (fertig || /Vergebener|Beabsichtigte/.test(typ) || !DTVP_REGION.test(`${titel} ${auftraggeber}`)) continue;
    const link = `https://www.dtvp.de/Center/${art}/company/projectForwarding.do?pid=${pid}`;
    treffer.push({ quelle: 'dtvp.de', id: link, titel, auftraggeber, ort: '', frist: isoTag(frist), link, verfahren: typ, wert: null, umfang: '' });
  }
  return { treffer, fertig };
}

/**
 * Doppelte zusammenfassen (gleicher Titel; Auftraggeber nur, wenn beide ihn nennen - der Berliner Feed
 * nennt keinen), fehlende Angaben aus dem Doppel ergaenzen, abgelaufene weg, kleine und nahe zuerst
 * (kleineZuerst, dieselbe Reihenfolge wie in der Ansicht), darin nach Frist.
 */
export function bereinigen(treffer, heute) {
  const liste = [];
  // Dieselbe Bekanntmachung kommt je Quelle mit anderen Zeilenumbruechen und Leerzeichen.
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  for (const t of treffer) {
    const gleich = liste.find(x => norm(x.titel) === norm(t.titel)
      && (!x.auftraggeber || !t.auftraggeber || norm(x.auftraggeber) === norm(t.auftraggeber)));
    if (!gleich) liste.push({ ...t });
    else for (const [k, v] of Object.entries(t)) if (!gleich[k] && v) gleich[k] = v;
  }
  return liste.filter(t => !(t.frist && t.frist < heute)).sort(kleineZuerst);
}

/** Neu seit dem letzten Lauf (nach id). */
export function neuSeit(treffer, vorher) {
  const alt = new Set((vorher || []).map(t => t.id));
  return treffer.filter(t => !alt.has(t.id));
}
