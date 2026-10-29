/**
 * Einkauf je Lieferant: Karten im Reiter "Bestellungen", Bestellmail-Dialog und die
 * Detailseite eines Lieferanten (#/einkauf?lieferant=A).
 *
 * Stammdaten (Bestellweg, Kontakt, Lieferzeit) und der Mailtext kommen fertig vom Server
 * (/api/einkauf/lieferanten, /api/einkauf/bestellmail) - hier wird nichts formuliert und
 * nichts gesendet. Gezaehlt wird aus dem Stand im Browser (lib/einkauf-lieferanten.mjs),
 * damit Zahl und Liste nach einem Klick sofort zusammenpassen.
 */
import { belegStandText } from './belege.mjs';
import {
  lieferantenKarten, karteImFilter, ueberfaelligText, hauptAktion, bestellwegText, feldKlartext,
  telLink, verlauf, lieferzeiten, SCHWELLEN_STANDARD, gmailLink, afNorm } from '../../lib/einkauf-lieferanten.mjs';
import { blockGruende, mengeText, ausfuehrungKurz, jeKommission } from '../../lib/einkauf-uebersicht.mjs';
import { musterText, musterHerkunftText } from '../../lib/bestellinhalt.mjs';
import { state } from '../../kern/zustand.mjs';
import { uebernahmeBlock } from './beschaffung.mjs';
import { $, esc, fmtDate, plural, toast, NICHT_HINTERLEGT } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import {
  einkauf, afEintragFuer, anzeigeWert, afWarteText, markiereAlsBestellt,
  ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, ensureEinkaufLieferanten,
  setzeZurueckAufOffen, ladeStandNeu, zurueckGruppen, openMusterHerkunftDialog, kundeUndOrt, musterSchrittKnopf,
} from './auftragsfluss.mjs';

// Welche Karten ihre Positionen zeigen. Als Zustand im Modul (nicht <details>): jede
// Statusaenderung zeichnet neu, und ein zugeklapptes <details> wird am Handy trotzdem gelayoutet.
const aufgeklappt = new Set();

const detailLink = id => `#/einkauf?lieferant=${encodeURIComponent(id)}`;

/** Dieselbe Bestelluebersicht nach Art eingrenzen; Quelle und lokale Status bleiben unveraendert. */
export function bestellartDaten(d, art = '') {
  if (!d || !['muster', 'ware'].includes(art)) return d;
  const passt = p => art === 'muster' ? p.istMuster === true : p.istMuster !== true;
  const auftraege = liste => (liste || []).map(a => {
    const positionen = (a.positionen || []).filter(passt);
    return { ...a, positionen, details: a.details ? { ...a.details,
      positionen: (a.details.positionen || []).filter((_, i) => passt((a.positionen || [])[i] || {})) } : a.details };
  }).filter(a => a.positionen.length);
  return { ...d, gruppen: art === 'muster' ? [] : d.gruppen,
    musterGruppen: art === 'ware' ? [] : d.musterGruppen,
    auftraege: auftraege(d.auftraege), testauftraege: auftraege(d.testauftraege) };
}

function karten(d = einkauf.bestellungen || {}) {
  d = bestellartDaten(d, state.route.params.get('art'));
  const l = einkauf.lieferanten;
  return lieferantenKarten({
    gruppen: d.gruppen, musterGruppen: d.musterGruppen,
    lieferanten: l?.lieferanten || [],
    eintragFuer: afEintragFuer,
    schwellen: l?.schwellen || SCHWELLEN_STANDARD,
  }).filter(k => !['muster', 'ware'].includes(state.route.params.get('art')) || k.wareGruppen.length || k.musterGruppen.length);
}

function kundenNamen() {
  const m = new Map();
  for (const a of einkauf.bestellungen?.auftraege || []) {
    const n = String(a.details?.kunde?.name || '').trim();
    if (n && n !== '–') m.set(a.id, n);
  }
  return m;
}

/** "Ware im Händlerportal · Muster per E-Mail an …" - oder was fehlt. */
function wegZeile(k) {
  if (!k.zugeordnet) return '<p class="lf-weg">Diese Artikel haben keinen Lieferanten hinterlegt – erst zuordnen, dann bestellen.</p>';
  const ware = state.route.params.get('art') === 'muster' ? null : bestellwegText(k.stammdaten, 'ware');
  const muster = state.route.params.get('art') === 'ware' ? null : bestellwegText(k.stammdaten, 'muster');
  if (!ware && !muster) return `<p class="lf-weg lf-fehlt">Bestellweg nicht hinterlegt · <a href="${detailLink(k.id)}">was fehlt?</a></p>`;
  return `<p class="lf-weg">${[ware ? `Ware ${esc(ware)}` : null, muster ? `Muster ${esc(muster)}` : null].filter(Boolean).join(' · ')}</p>`;
}

function ueberfaelligHinweis(k, { mitLink = true } = {}) {
  const h = ueberfaelligText(k.ueberfaellig);
  if (!h) return '';
  return `<div class="lf-hinweis ${h.stufe}"><span class="lf-uhr" aria-hidden="true"></span><span>${esc(h.text)}${mitLink && k.zugeordnet ? ` <a href="${detailLink(k.id)}">Kontakt</a>` : ''}</span></div>`;
}

function warteChip(x) {
  if (x.wartetage === null) return '';
  const text = x.wartetage === 0 ? 'heute' : x.wartetage === 1 ? '1 Tag' : `${x.wartetage} Tage`;
  return `<span class="lf-tage ${x.warnstufe || ''}" title="${esc(afWarteText(x.wartetage))}">${text}</span>`;
}

function postenZeile(x, namen) {
  const p = x.pos;
  const menge = p.bestellmenge?.menge === 'UNGEKLAERT' ? 'Menge ungeklärt' : p.bestellmenge?.text;
  // Bei Mustern auch der Ort: so sieht man, ob der Kunde in der Naehe wohnt (vorbeibringen).
  const ort = p.istMuster ? kundeUndOrt(p.orderId).ort : '';
  // Aus dem Musterlager: wo es liegt - das ist beim Verschicken die erste Frage.
  const lager = p.musterLager && !afEintragFuer(p)?.status ? `Musterlager${p.musterLager.ort ? ` ${p.musterLager.ort}` : ''}` : '';
  const teile = [p.farbe, menge, namen.get(p.orderId), ort, p.orderName, lager].filter(v => v && v !== 'UNGEKLAERT');
  return `<li class="lf-posten"><div class="lf-posten-text"><div class="t">${esc(anzeigeWert(p.titel))}</div><div class="s">${esc(teile.join(' · '))}</div></div>${warteChip(x)}</li>`;
}

function postenListe(titel, liste, namen, max) {
  if (!liste.length) return '';
  const sicht = max ? liste.slice(0, max) : liste;
  const rest = liste.length - sicht.length;
  return `<div class="lf-abschnitt">${esc(titel)}</div><ul class="lf-liste">${sicht.map(x => postenZeile(x, namen)).join('')}</ul>${rest > 0 ? `<p class="lf-rest">+ ${rest} weitere</p>` : ''}`;
}

const nachWartezeit = liste => [...liste].sort((a, b) => (b.wartetage ?? -1) - (a.wartetage ?? -1));

/** Knopf "Ware bestellen" je nach Bestellweg (Mail, Portal, Telefon). */
function wareKnopf(k, klasse) {
  const a = hauptAktion(k.stammdaten, 'ware');
  const daten = `data-lf-mail="${esc(k.id)}" data-lf-art="ware"`;
  // Portal und Telefon oeffnen sich direkt (neuer Tab bzw. Anruf); der Dialog mit der
  // Bestellliste geht trotzdem auf - dort wird kopiert und danach als bestellt markiert.
  return a.href
    ? `<a class="${klasse}" href="${esc(a.href)}"${a.neuerTab ? ' target="_blank" rel="noopener"' : ''} ${daten}>${esc(a.label)}${a.neuerTab ? ' ↗' : ''}</a>`
    : `<button type="button" class="${klasse}" ${daten}>${esc(a.label)}</button>`;
}
const musterKnopf = (k, klasse) => `<button type="button" class="${klasse}" data-lf-mail="${esc(k.id)}" data-lf-art="muster">Muster bestellen</button>`;

/** Nichts zu bestellen, aber ueberfaellig: dann ist Nachhaken der naechste Schritt. */
function nachhakKnopf(k) {
  if (!k.zugeordnet || k.zahlen.zuBestellen || k.zahlen.musterOffen || !k.ueberfaellig.stufe) return '';
  const w = state.route.params.get('art') === 'muster' ? k.stammdaten.muster : k.stammdaten.ware;
  if (w.telefon) return `<a class="btn" href="${esc(telLink(w.telefon))}">Anrufen</a>`;
  if (w.mail) return `<a class="btn" href="mailto:${esc(w.mail)}">E-Mail schreiben</a>`;
  return '';
}

/** Hauptknopf (je nach Bestellweg) und "Muster bestellen". Hoechstens einer ist die Hauptaktion. */
function bestellKnoepfe(k) {
  if (!k.zugeordnet) return '';
  const ware = k.zahlen.zuBestellen ? wareKnopf(k, 'btn btn-primary') : '';
  const muster = k.zahlen.musterOffen ? musterKnopf(k, ware ? 'btn' : 'btn btn-primary') : '';
  return ware + muster + nachhakKnopf(k);
}

// ------------------------------------------------------------ Karte auf einen Blick
// Ware und Muster getrennt, je Stufe eine Ueberschrift mit Zahl; der Bestellknopf steht dort,
// wo bestellt wird. Ware je Position (Menge, Mass, Einfassung, Kommission), Muster je
// Kommission - ein Kunde bestellt drei bis fuenf auf einmal.

const ok = v => v && v !== 'UNGEKLAERT' && v !== '–';

function wareZeile(x, namen) {
  const p = x.pos;
  const block = blockGruende(p);
  const titel = [anzeigeWert(p.titel), p.farbe].filter(ok).join(' · ');
  const menge = mengeText(p);
  const aus = ausfuehrungKurz(p);
  const wer = [namen.get(p.orderId) || p.kunde, p.orderName].filter(ok).join(' · ');
  // Bestellt und noch nicht da: "Ist eingetroffen" direkt an der Zeile (setzt "geliefert",
  // derselbe Schritt wie "Als geliefert markieren" in der Tabelle).
  // Ueber den Kettler bestellt: die Ware kommt nicht zu uns, sondern muss dort abgeholt werden.
  const status = x.eintrag?.status;
  const kettler = status === 'bestellt' && x.eintrag?.ueber === 'kettler';
  const knopf = status === 'bestellt' && p.lineItemId && !istNurLesend()
    ? `<button type="button" class="btn btn-sm lf-zeilenknopf" data-af-set data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}" data-af-status="geliefert" data-af-name="${esc(p.orderName)}" data-af-titel="${esc(p.titel)}" data-af-farbe="${esc(p.farbe)}">${kettler ? 'Beim Kettler abgeholt' : 'Ist eingetroffen'}</button>` : '';
  return `<li class="lf-posten${block.length ? ' lf-blockiert' : ''}"><div class="lf-posten-text">
      <div class="t">${esc(titel)}</div>
      ${menge ? `<div class="lf-menge">${esc(menge)}</div>` : ''}
      ${aus.map(z => `<div class="s">${esc(z)}</div>`).join('')}
      ${wer ? `<div class="s lf-wer">${esc(wer)}</div>` : ''}
      ${kettler ? '<div class="s lf-kettler">Geht zum Kettler – nach dem Ketteln dort abholen</div>' : ''}
      ${belegZeile(x.eintrag?.status, p.orderId, p.lieferant)}
      ${block.length ? `<div class="lf-grund">Blockiert: ${esc(block.join(' · '))}</div>` : ''}
    </div><div class="lf-posten-rechts">${warteChip(x)}${knopf}</div></li>`;
}

function musterZeile(g, namen, { herkunft = false } = {}) {
  const { ort } = kundeUndOrt(g.orderId);
  const wer = [namen.get(g.orderId) || g.positionen[0]?.kunde, ort, g.orderName].filter(ok).join(' · ');
  const woher = herkunft ? musterHerkunftText(g.positionen) : '';
  return `<li class="lf-posten"><div class="lf-posten-text">
      <div class="t">${esc(wer || 'Kunde unbekannt')}</div>
      <div class="s">${esc(musterText(g.positionen))}</div>
      ${woher ? `<div class="s lf-wer">${esc(woher)}</div>` : ''}
      ${belegZeile(g.eintraege?.[0]?.eintrag?.status, g.orderId, g.positionen[0]?.lieferant)}
    </div><div class="lf-posten-rechts"><span class="lf-anzahl">${esc(plural(g.positionen.length, 'Muster', 'Muster'))}</span>${warteChip(g)}${musterSchrittKnopf(g.positionen, { klasse: 'btn btn-sm lf-zeilenknopf' })}</div></li>`;
}

/** Beleg vom Lieferanten (Postfach) an bestellten und eingetroffenen Posten: "AB 14.10. · LS 16.10.". */
function belegZeile(status, orderId, lieferant) {
  if (!['bestellt', 'geliefert'].includes(status) || !orderId || !lieferant) return '';
  const text = belegStandText(orderId, lieferant);
  return text ? `<div class="s lf-beleg"><a href="#/einkauf?tab=belege&amp;blf=beleg" title="Beleg vom Lieferanten aus dem Postfach">${esc(text)}</a></div>` : '';
}

/** Ueberschrift einer Stufe: "Ware bestellen 3", darunter ein Satz, rechts der Knopf. */
const stufeKopf = (titel, zahl, knopf = '', { klasse = '', zusatz = '' } = {}) => `<div class="lf-stufe ${klasse}"><div class="lf-stufe-titel"><h4>${esc(titel)} <b>${zahl}</b></h4>${zusatz ? `<p>${zusatz}</p>` : ''}</div>${knopf}</div>`;

function stufeListe(zeilen, rest, restText) {
  return `<ul class="lf-liste">${zeilen.join('')}</ul>${rest > 0 ? `<p class="lf-rest">+ ${rest} ${esc(restText)}</p>` : ''}`;
}

/** "3 für 2 Kunden" - Muster zaehlen einzeln, gehen aber je Kunde gemeinsam raus. */
const fuerKunden = liste => `${liste.length}<span class="lf-fuer"> für ${plural(jeKommission(liste).length, 'Kunden', 'Kunden')}</span>`;

/** Laufende Posten: Ware je Position, Muster je Kommission - Ware zuerst. */
function laufendZeilen(liste, namen) {
  const ware = nachWartezeit(liste.filter(x => !x.pos?.istMuster)).map(x => ({ n: 1, html: wareZeile(x, namen) }));
  const muster = jeKommission(liste.filter(x => x.pos?.istMuster)).map(g => ({ n: g.positionen.length, html: musterZeile(g, namen) }));
  return [...ware, ...muster];
}

/** Die ersten `max` Zeilen; der Rest in Positionen, damit er zur Zahl der Ueberschrift passt. */
function ruhigeListe(zeilen, max) {
  const rest = zeilen.slice(max).reduce((n, z) => n + z.n, 0);
  return stufeListe(zeilen.slice(0, max).map(z => z.html), rest, rest === 1 ? 'weitere Position' : 'weitere Positionen');
}

/** Kontakt fuers Nachfassen: Telefon vor Mail, sonst die Detailseite mit Kontakt. */
function nachfassKnopf(k) {
  const w = state.route.params.get('art') === 'muster' ? k.stammdaten.muster : k.stammdaten.ware;
  if (w.telefon) return `<a class="btn" href="${esc(telLink(w.telefon))}">Anrufen</a>`;
  if (w.mail) return `<a class="btn" href="mailto:${esc(w.mail)}">E-Mail schreiben</a>`;
  return `<a class="btn" href="${detailLink(k.id)}">Kontakt</a>`;
}

/**
 * Die Karte in Arbeitsschritten (Inhaber 2026-10-14: "Bestellungen ganz vorne extra Zeile, fuer
 * Muster bestellen extra Zeile, fuer Nachfassen extra Zeile"). 1. Ware bestellen, 2. Muster
 * bestellen, 3. Nachfassen (bestellt, wartet zu lange - Ware und Muster); darunter ruhig, was
 * im Plan laeuft. Ein Posten steht genau in einem Abschnitt.
 */
function arbeitsSchritte(k, namen) {
  const teile = [];
  const w = k.ware.zuBestellen;
  const m = k.muster.zuBestellen;
  if (w.length) {
    const zeigen = w.slice(0, 8);
    teile.push(`<section class="lf-schritt">${stufeKopf('Ware bestellen', w.length, wareKnopf(k, 'btn btn-primary'))}
      ${stufeListe(zeigen.map(x => wareZeile(x, namen)), w.length - zeigen.length, 'weitere – „Positionen bearbeiten"')}</section>`);
  }
  if (m.length) {
    const g = jeKommission(m);
    teile.push(`<section class="lf-schritt">${stufeKopf('Muster bestellen', fuerKunden(m), musterKnopf(k, w.length ? 'btn' : 'btn btn-primary'))}
      ${stufeListe(g.slice(0, 6).map(x => musterZeile(x, namen)), g.length - Math.min(g.length, 6), 'weitere Kunden')}</section>`);
  }
  const ue = k.ueberfaellig;
  if (ue.stufe && k.zugeordnet) {
    const satz = `${plural(ue.anzahl, 'Position', 'Positionen')}, die älteste seit ${plural(ue.maxTage, 'Tag', 'Tagen')} – ${ue.stufe === 'crit' ? 'überfällig' : 'beim Lieferanten nachhaken'}.`;
    teile.push(`<section class="lf-schritt lf-nachfassen ${ue.stufe}">${stufeKopf('Nachfassen', ue.auftraege === 1 ? '1 Auftrag' : `${ue.auftraege} Aufträge`, nachfassKnopf(k), { zusatz: esc(satz) })}
      ${stufeListe(laufendZeilen(ue.positionen, namen).map(z => z.html), 0, '')}</section>`);
  }
  // Liegt zu lange bei uns: rausgeben - das ist unsere Arbeit, kein Anruf beim Lieferanten.
  const lbu = k.liegtBeiUns;
  if (lbu?.stufe) {
    const satz = `${plural(lbu.anzahl, 'Position liegt', 'Positionen liegen')} bei uns, die älteste seit ${plural(lbu.maxTage, 'Tag', 'Tagen')} – an den Kunden rausgeben oder Abholung klären.`;
    const knopf = `<a class="btn" href="#/einkauf?${new URLSearchParams({ af: 'eingetroffen', lf: k.id })}">Rausgeben</a>`;
    teile.push(`<section class="lf-schritt lf-nachfassen ${lbu.stufe}">${stufeKopf('Liegt bei uns', lbu.auftraege === 1 ? '1 Auftrag' : `${lbu.auftraege} Aufträge`, knopf, { zusatz: esc(satz) })}
      ${stufeListe(laufendZeilen(lbu.positionen, namen).map(z => z.html), 0, '')}</section>`);
  }
  // Ruhig darunter: was wir selbst da haben und was im Plan laeuft (nicht ueberfaellig).
  const ruhig = [];
  const eigen = k.muster.eigen || [];
  if (eigen.length) {
    const g = jeKommission(eigen);
    ruhig.push(stufeKopf('Muster haben wir da – verschicken oder vorbeibringen', fuerKunden(eigen), '', { klasse: 'lf-ruhig' })
      + stufeListe(g.slice(0, 4).map(x => musterZeile(x, namen, { herkunft: true })), g.length - Math.min(g.length, 4), 'weitere Kunden'));
  }
  const imPlan = [...k.ware.bestellt, ...k.muster.bestellt].filter(x => !x.warnstufe);
  if (imPlan.length) {
    ruhig.push(stufeKopf('Bestellt, im Plan', imPlan.length, '', { klasse: 'lf-ruhig' }) + ruhigeListe(laufendZeilen(imPlan, namen), 3));
  }
  const da = [...k.ware.eingetroffen, ...k.muster.eingetroffen].filter(x => !x.warnstufe);
  if (da.length) {
    ruhig.push(stufeKopf('Bei uns eingetroffen', da.length, '', { klasse: 'lf-ruhig' }) + ruhigeListe(laufendZeilen(da, namen), 2));
  }
  if (ruhig.length) teile.push(`<section class="lf-schritt lf-schritt-ruhig">${ruhig.join('')}</section>`);
  return teile.join('');
}

function karteHtml(k, { gruppeKarte, namen, af, alleGruppen, alleMusterGruppen }) {
  const offen = aufgeklappt.has(k.id) || state.route.params.get('lf') === k.id || !k.zugeordnet || !!af;
  const zu = [...k.ware.zuBestellen, ...k.muster.zuBestellen];
  const laufend = nachWartezeit([...k.ware.bestellt, ...k.ware.eingetroffen, ...k.muster.bestellt, ...k.muster.eingetroffen]);
  const eigen = k.muster.eigen || [];
  const anzahl = af === 'erledigt' ? k.ware.erledigt.length + k.muster.erledigt.length : zu.length + laufend.length + eigen.length;
  // Zugeklappt stehen die Bestellknoepfe bei "Zu bestellen"; aufgeklappt (Tabellen) unten im Fuss.
  const knoepfe = offen ? bestellKnoepfe(k) : '';
  const vorschau = offen ? '' : arbeitsSchritte(k, namen);
  // Sammelaktion fuer die ganze Karte: alles, was hier schon einen Schritt hat, zurueck auf offen.
  const gesetzt = (af === 'erledigt' ? [...k.ware.erledigt, ...k.muster.erledigt] : laufend).map(x => x.pos).filter(p => p.lineItemId);
  const zurueckId = `lf-${k.id}`;
  const zurueck = offen && gesetzt.length && !istNurLesend() ? `<button type="button" class="btn btn-ghost" data-af-zurueck data-af-zurueck-gruppe="${esc(zurueckId)}">Alle zurück auf offen…</button>` : '';
  if (zurueck) zurueckGruppen.set(zurueckId, { titel: k.name, positionen: gesetzt }); else zurueckGruppen.delete(zurueckId);
  // Die bisherigen Tabellen je Gruppe (Status setzen, Artikelnummer kopieren, Link zum
  // Lieferanten, Liste kopieren, Sammelaktion) - unveraendert, nur eingeklappt.
  const tabellen = !offen ? '' : k.wareGruppen.map(g => gruppeKarte(g, alleGruppen.indexOf(g), 'ware', { eingebettet: true })).join('')
    + k.musterGruppen.map(g => gruppeKarte(g, alleMusterGruppen.indexOf(g), 'muster', { eingebettet: true })).join('');
  const kopfName = k.zugeordnet ? `<a href="${detailLink(k.id)}" title="Kontakt, Bestellweg und Verlauf">${esc(k.name)}</a>` : esc(k.name);
  return `<article class="card lf-karte${offen ? ' lf-offen' : ''}">
    <div class="lf-kopf"><h3 class="lf-name">${kopfName}</h3>${wegZeile(k)}</div>
    ${offen ? ueberfaelligHinweis(k) : ''}
    ${vorschau}
    ${offen ? `<div class="lf-tabellen">${tabellen || '<p class="lf-rest">Kein Artikel in diesem Schritt.</p>'}</div>` : ''}
    <div class="lf-fuss">${knoepfe}${zurueck}<button type="button" class="btn btn-ghost lf-aufklappen" data-lf-auf="${esc(k.id)}" aria-expanded="${offen}">${offen ? 'Positionen einklappen' : `Positionen bearbeiten (${anzahl})`}</button></div>
  </article>`;
}

/**
 * Nachfassen ueber alle Lieferanten fuer die Kachel oben: verschiedene Auftraege aus den
 * Abschnitten "Nachfassen". Ein Auftrag mit Ware von zwei Lieferanten zaehlt einmal - die
 * Summe je Karte zaehlte ihn doppelt (Codex-Audit 2026-10-19).
 */
export function nachfassenSumme(daten) {
  const ids = new Set(); let ohneId = 0; let crit = false;
  for (const k of karten(daten)) {
    if (!k.ueberfaellig.stufe) continue;
    crit ||= k.ueberfaellig.stufe === 'crit';
    for (const x of k.ueberfaellig.positionen) { const id = x.pos?.orderId || x.pos?.orderName; if (id) ids.add(id); else ohneId += 1; }
  }
  const auftraege = ids.size + ohneId;
  return { auftraege, stufe: auftraege ? (crit ? 'crit' : 'warn') : null };
}

/**
 * Karten je Lieferant fuer den Reiter "Bestellungen".
 * `gruppeKarte` zeichnet die bisherige Tabelle einer Gruppe (kommt von bestellungen.mjs -
 * als Parameter, damit die beiden Module nicht im Kreis voneinander abhaengen).
 */
export function lieferantenKartenHtml({ gruppeKarte, daten = einkauf.bestellungen }) {
  ensureEinkaufLieferanten();
  const d = daten;
  const af = afNorm(state.route.params.get('af'));
  const alle = karten(d);
  const sicht = alle.filter(k => karteImFilter(k, af));
  const ruhig = af ? [] : alle.filter(k => k.zugeordnet && !karteImFilter(k, ''));
  const namen = kundenNamen();
  const kontext = { gruppeKarte, namen, af, alleGruppen: d.gruppen || [], alleMusterGruppen: d.musterGruppen || [] };
  const stammFehler = einkauf.lieferanten?.fehler
    ? `<p class="small muted lf-fussnote">Kontakt und Bestellweg der Lieferanten konnten nicht geladen werden (${esc(einkauf.lieferanten.hinweis || 'unbekannter Fehler')}). Die Positionen stimmen trotzdem.</p>` : '';
  return `${sicht.length ? `<div class="lf-raster">${sicht.map(k => karteHtml(k, kontext)).join('')}</div>` : emptyState(af ? 'Kein Artikel in diesem Schritt.' : 'Alles bestellt.', af ? '' : 'Bei keinem Lieferanten ist etwas offen.')}
    ${ruhig.length ? `<p class="small muted lf-fussnote">Nichts offen bei: ${ruhig.map(k => `<a href="${detailLink(k.id)}">${esc(k.name)}</a>`).join(' · ')}</p>` : ''}
    ${stammFehler}`;
}

// ------------------------------------------------------------ Bestellmail-Dialog

// Nur im offenen Dialog, nie dauerhaft: kurze Freigabe fuer den zweiten Legacy-Kopierklick.
let kopierFreigaben = new WeakMap();
const KOPIERFREIGABE_MS = 10_000;

const dialog = { lieferant: null, art: 'ware', auftrag: null, ziel: '', daten: null, fehler: null, abruf: 0, prueft: false, markiert: new Set(), gesetzt: new Map() };

/** Kunde · Ort einer Bestellung als kurzer Text (Ort = Stadt der Lieferadresse). */
function kundeOrtText(orderId) {
  const k = kundeUndOrt(orderId);
  return [k.name, k.ort].filter(Boolean).join(' · ');
}

/** Muster der Mail je Zeile mit "Haben wir da …" - fuer Kunden in der Naehe oder vorraetige Kataloge. */
function musterWahlListe(m) {
  if (m.art !== 'muster' || istNurLesend() || !(m.positionen || []).length) return '';
  const zeile = p => `<li class="lf-posten"><div class="lf-posten-text"><div class="t">${esc(anzeigeWert(p.titel || ''))}${p.farbe ? ` · ${esc(p.farbe)}` : ''}</div><div class="s">${esc([kundeOrtText(p.orderId), p.orderName].filter(Boolean).join(' · '))}</div></div>
    <button type="button" class="btn btn-sm btn-ghost" data-lf-herkunft="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}">Haben wir da…</button></li>`;
  return `<details class="lf-musterwahl"><summary class="small">Einzelne Muster selbst vorrätig? (${m.positionen.length})</summary><ul class="lf-liste">${m.positionen.map(zeile).join('')}</ul></details>`;
}

const LIEFERZIEL_TEXT = { laden: 'Lieferung in den Laden', kunde: 'Lieferung direkt an den Kunden', baustelle: 'Lieferung direkt an die Baustelle', kettler: 'Lieferung an unseren Kettler' };

/**
 * Ware mit Ketteln, die sich fuer unseren Kettler anbietet (gekettelt mit Fertigmass oder Kunde in der Naehe).
 * Nur ein Hinweis - umgeschaltet wird mit "Kettler" oben; der Server begruendet je Position.
 */
function kettlerHinweis(m) {
  const puffer = kettelPufferHinweis(m);
  if (m.kettlerAutomatisch) return `<p class="small muted lf-kettler">Nach unserer Regel: Gekettelte Maßteppiche kettelt unser Kettler. Der Lieferant schickt sie ungekettelt im Zuschnittmaß dorthin, wir holen sie dort ab.</p>${puffer}`;
  const liste = m.kettlerVorschlag || [];
  if (m.art !== 'ware' || !m.kettlerMoeglich || m.lieferziel === 'kettler' || !liste.length) return puffer;
  return `<div class="notice lf-kettler"><strong>Über unseren Kettler? (${liste.length})</strong>
    <span class="small">Dort ketteln wir günstiger und liefern selbst bis in die Wohnung bzw. verschicken von dort. „Kettler" oben wählen – der Lieferant schneidet dann nur zu.</span>
    <ul class="small">${liste.map(v => `<li>${esc([v.orderName, anzeigeWert(v.titel || '')].filter(Boolean).join(' · '))} – ${esc(v.grund)}</li>`).join('')}</ul></div>`;
}

/**
 * Kettelpuffer direkt vor dem Bestellen (Inhaber 2026-10-25, #1684): beim Lieferanten wird das
 * Zuschnittmass bestellt, unser Kettler kettelt auf das Fertigmass. Der Server rechnet beides.
 */
function kettelPufferHinweis(m) {
  const liste = m.kettelPuffer || [];
  if (!liste.length) return '';
  return `<div class="notice lf-puffer"><strong>+3 cm Zuschnittpuffer je Länge und Breite für anschließendes Ketteln</strong>
    <ul class="small">${liste.map(v => `<li>${esc([v.orderName, anzeigeWert(v.titel || '')].filter(Boolean).join(' · '))}: Fertigmaß ${esc(v.fertigmass)} → bestellt wird ${esc(v.zuschnittmass)}${v.rolleUnbekannt ? ' (Rollenbreite unbekannt – bitte prüfen, ob es aus der Rolle passt)' : ''}</li>`).join('')}</ul></div>`;
}

/**
 * Lieferziel-Knoepfe. Mit Kettler gibt es "Automatisch" (Regel: gekettelt zum Kettler, Rest
 * normal) - die anderen Knoepfe schicken die ganze Bestellung an ein Ziel.
 */
function zielChips(m) {
  const wahl = m.art === 'ware' && m.kettlerMoeglich
    ? [['', 'Automatisch'], ['kunde', 'Kunden'], ['laden', 'Laden'], ['kettler', 'Kettler']]
    : [['kunde', 'Kunden'], ['laden', 'Laden']];
  const gedrueckt = w => (m.art === 'ware' && m.kettlerMoeglich ? dialog.ziel === w : m.lieferziel === w);
  return wahl.map(([w, l]) => `<button type="button" class="chip" data-lf-ziel="${w}" aria-pressed="${gedrueckt(w)}">${l}</button>`).join('');
}

function mailAbschnitt(m, i, mehrere) {
  const lesend = istNurLesend();
  const kopf = mehrere ? `<h3 class="lf-mail-titel">${esc(m.art === 'muster' ? 'Muster' : 'Ware')}${LIEFERZIEL_TEXT[m.lieferziel] ? ` · ${esc(LIEFERZIEL_TEXT[m.lieferziel])}` : ''}</h3>` : '';
  const fehlt = (m.fehlt || []).length ? `<div class="notice warn lf-fehltliste"><strong>${m.text ? 'Nicht in der Mail' : 'Kann so nicht bestellt werden'} (${m.fehlt.length}):</strong>
      <ul>${m.fehlt.map(f => `<li>${esc([f.orderName, [f.titel, f.farbe].filter(Boolean).join(', ')].filter(Boolean).join(' · '))} – weil: ${esc((f.gruende || []).join('; '))}</li>`).join('')}</ul></div>` : '';
  const ohne = (m.ohneBestellung || []).length ? `<div class="small muted lf-ohne"><p style="margin:0 0 4px">Nicht beim Lieferanten zu bestellen (${m.ohneBestellung.length}):</p><ul class="lf-liste">${m.ohneBestellung.map(f => `<li class="lf-posten"><div class="lf-posten-text"><div class="t">${esc(anzeigeWert(f.titel || ''))}</div><div class="s">${esc([kundeOrtText(f.orderId), f.orderName, ...(f.gruende || [])].filter(Boolean).join(' · '))}</div></div>${istNurLesend() ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-lf-herkunft="${esc(f.orderId)}" data-af-item="${esc(f.lineItemId)}">Ändern…</button>`}</li>`).join('')}</ul></div>` : '';
  const wahl = m.art === 'muster' || m.zielWaehlbar;
  const zielWahl = wahl ? `<div class="lf-zielwahl" role="group" aria-label="Wohin geht die Lieferung?"><span class="small muted">${m.art === 'muster' ? 'Muster gehen an' : 'Ware geht an'}:</span>
      ${zielChips(m)}</div>` : '';
  if (!m.text) {
    const schon = m.bereitsBestellt ? `${plural(m.bereitsBestellt, 'Artikel ist', 'Artikel sind')} schon bestellt.` : '';
    return `<section class="lf-mail">${kopf}${zielWahl}${kettlerHinweis(m)}${(m.fehlt || []).length ? '' : `<p class="lf-leer">Nichts mehr zu bestellen. ${esc(schon)}</p>`}${fehlt}${ohne}</section>`;
  }
  const fertig = dialog.markiert.has(i);
  const vorbereitet = !lesend && !dialog.fehler && !!m.vorbereitungStand;
  const n = m.positionen.length;
  const wort = m.art === 'muster' ? 'Muster' : 'Artikel';
  const oeffnen = [];
  const haupt = k => (oeffnen.length ? 'btn' : 'btn btn-primary') + (k ? ` ${k}` : '');
  const reihenfolge = m.weg === 'portal' ? ['portal', 'mail', 'telefon'] : m.weg === 'telefon' ? ['telefon', 'mail', 'portal'] : ['mail', 'portal', 'telefon'];
  for (const weg of reihenfolge) {
    if (weg === 'mail' && m.mailto) oeffnen.push(`<a class="${haupt()}" href="${esc(m.mailto)}" data-lf-geoeffnet="${i}">Im Mailprogramm öffnen</a>`);
    if (weg === 'mail') {
      // Zweiter Weg fuer Rechner ohne eingerichtetes Mailprogramm: neue Nachricht in Gmail im Browser.
      const g = gmailLink({ an: m.an, betreff: m.betreff, text: m.text });
      if (g.url) oeffnen.push(`<a class="${haupt()}" href="${esc(g.url)}" target="_blank" rel="noopener" data-lf-geoeffnet="${i}" title="${g.gekuerzt ? 'Text zu lang für den Link – bitte „Text kopieren" und einfügen' : 'Neue Nachricht in Gmail, fertig ausgefüllt'}">In Gmail öffnen ↗</a>`);
    }
    if (weg === 'portal' && m.portalUrl && (m.weg === 'portal' || !m.mailto)) oeffnen.push(`<a class="${haupt()}" href="${esc(m.portalUrl)}" target="_blank" rel="noopener" data-lf-geoeffnet="${i}">Portal öffnen ↗</a>`);
    if (weg === 'telefon' && m.telefon && (m.weg === 'telefon' || !m.mailto)) oeffnen.push(`<a class="${haupt()}" href="${esc(telLink(m.telefon))}" data-lf-geoeffnet="${i}">Anrufen ${esc(m.telefon)}</a>`);
  }
  const an = m.an ? esc(m.an) + (m.ansprechperson ? ` · ${esc(m.ansprechperson)}` : '') : '<span class="lf-fehlt">keine Mailadresse hinterlegt – Text kopieren</span>';
  const gekuerzt = m.mailtoGekuerzt ? '<p class="notice warn">Der Text ist zu lang für den Link: das Mailprogramm öffnet nur mit Empfänger und Betreff. Bitte „Text kopieren" und in die Mail einfügen.</p>' : '';
  const hinweise = (m.hinweise || []).length ? `<ul class="lf-hinweise small muted">${m.hinweise.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : '';
  const frage = lesend ? '' : fertig
    ? `<p class="lf-erledigt">${plural(dialog.gesetzt.get(i)?.length ?? n, wort, wort)} als bestellt markiert. <button type="button" class="btn btn-sm btn-ghost" data-lf-rueckgaengig="${i}" title="Versehen? Die Artikel kommen zurück auf „Noch zu bestellen"">Rückgängig</button></p>`
    : `<div class="lf-frage" data-lf-frage="${i}" hidden>
        <strong>Als bestellt markieren?</strong>
        <span class="small muted">Nur, wenn die Bestellung wirklich raus ist.</span>
        <div class="field"><label for="lfNr${i}">Bestellnummer des Lieferanten (aus der Auftragsbestätigung)</label><input id="lfNr${i}" maxlength="200" placeholder="z. B. 2026-4711"><span class="small muted">Damit die Auftragsbestätigung automatisch zugeordnet wird. Optional.</span></div>
        <div class="lf-frage-knoepfe"><button type="button" class="btn btn-primary" data-lf-markieren="${i}">${plural(n, wort, wort)} als bestellt markieren</button><button type="button" class="btn btn-ghost" data-lf-nicht="${i}">Noch nicht</button></div>
      </div>`;
  return `<section class="lf-mail">${kopf}${zielWahl}${kettlerHinweis(m)}
    ${uebernahmeBlock(m.positionen).replaceAll('data-einkauf-uebernahme=', 'data-lf-uebernahme=')}
    <dl class="lf-mailkopf"><dt>An</dt><dd>${an}</dd><dt>Betreff</dt><dd>${esc(m.betreff)}</dd></dl>
    <pre class="lf-mailtext" tabindex="0">${esc(m.text)}</pre>
    ${gekuerzt}${fehlt}${ohne}${hinweise}${fertig ? '' : musterWahlListe(m)}
    ${fertig || !vorbereitet ? '' : `<div class="lf-mail-knoepfe">${oeffnen.join('')}<button type="button" class="${oeffnen.length ? 'btn' : 'btn btn-primary'}" data-kopiertext="${esc(m.text)}" data-lf-geoeffnet="${i}">Text kopieren</button></div>`}
    ${frage}
  </section>`;
}

function zeichneDialog() {
  const d = dialog.daten;
  const titel = `${dialog.art === 'muster' ? 'Muster bestellen' : 'Bestellung'} · ${esc(d?.name || `Lieferant ${dialog.lieferant}`)}`;
  let inhalt;
  if (!d) inhalt = '<p class="lf-leer">Lade Bestellung …</p>';
  else if (d.fehler) inhalt = `<p class="notice crit">Die Bestellung konnte nicht geladen werden. ${esc(d.hinweis || '')}</p>`;
  else if (!d.verfuegbar) inhalt = `<p class="notice">${esc(d.hinweis || 'Bestelldaten fehlen.')}</p>`;
  else if (!d.mails.length) inhalt = `<p class="lf-leer">${dialog.art === 'muster' ? 'Keine offenen Muster bei diesem Lieferanten.' : 'Keine offene Ware bei diesem Lieferanten.'}</p>`;
  else inhalt = d.mails.map((m, i) => mailAbschnitt(m, i, d.mails.length > 1)).join('');
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop lf-dialog-boden" data-close-dialog><div class="dialog lf-dialog" role="dialog" aria-modal="true" aria-labelledby="lfTitel">
    <h2 id="lfTitel" class="lf-name">${titel}</h2>
    <p class="notice warn" data-lf-fehler role="alert"${dialog.fehler ? '' : ' hidden'}>${esc(dialog.fehler || '')}</p>
    <button type="button" class="btn btn-sm" data-lf-neu${dialog.fehler ? '' : ' hidden'}>Vorbereitung erneut prüfen</button>
    ${inhalt}
    <div class="actions"><span class="small muted lf-nie">Aus diesem Dialog wird nichts gesendet. Freigegebene kostenlose Muster bestellt die Automatik.</span><button type="button" class="btn" data-close-dialog>Schließen</button></div>
  </div></div>`;
}

async function ladeDialog() {
  kopierFreigaben = new WeakMap();
  const abruf = ++dialog.abruf;
  const payload = vorbereitungsPayload();
  let daten, fehler = null;
  try {
    daten = istNurLesend()
      ? await fetchEinkauf(`/api/einkauf/bestellmail?${new URLSearchParams(payload)}`)
      : await orgSchreiben('/api/einkauf/auftragsstatus', { ...payload, aktion: 'bestellVorbereitung' });
  } catch (e) {
    fehler = e.message;
    // Bei einer fremden Uebernahme bleibt die Vorlage lesbar. Oeffnen/Kopieren
    // wird erst nach einer erfolgreichen eigenen Vorbereitung angeboten.
    daten = await fetchEinkauf(`/api/einkauf/bestellmail?${new URLSearchParams(payload)}`);
  }
  if (abruf !== dialog.abruf || !$('#dialogRoot .lf-dialog')) return;
  const stand = await fetchEinkauf('/api/einkauf/auftragsstatus');
  if (abruf !== dialog.abruf || !$('#dialogRoot .lf-dialog')) return;
  if (stand?.verfuegbar) einkauf.auftragsstatus = stand;
  dialog.fehler = fehler;
  dialog.daten = daten;
  zeichneDialog();
  $('#dialogRoot .lf-mail-knoepfe .btn-primary, #dialogRoot [data-close-dialog].btn')?.focus();
}

export function openBestellmailDialog(lieferant, art = 'ware', { auftrag = null } = {}) {
  Object.assign(dialog, { lieferant, art: art === 'muster' ? 'muster' : 'ware', auftrag: auftrag || state.route.params.get('auftrag') || null, ziel: '', daten: null, fehler: null, prueft: false, markiert: new Set(), gesetzt: new Map() });
  zeichneDialog();
  ladeDialog();
}

function vorbereitungsPayload() {
  return { lieferant: dialog.lieferant, art: dialog.art, auftrag: dialog.auftrag || '', ziel: dialog.ziel || '' };
}

function vorbereitungFehler(text) {
  kopierFreigaben = new WeakMap();
  dialog.fehler = text;
  const hinweis = $('#dialogRoot [data-lf-fehler]');
  if (hinweis) { hinweis.textContent = text; hinweis.hidden = false; }
  const neu = $('#dialogRoot [data-lf-neu]');
  if (neu) neu.hidden = false;
  document.querySelectorAll('#dialogRoot [data-lf-geoeffnet], #dialogRoot [data-lf-markieren]').forEach(el => {
    el.setAttribute('aria-disabled', 'true');
    if (el.tagName === 'A') el.removeAttribute('href'); else el.disabled = true;
  });
}

/** Unmittelbar vor der Uebergabe: dieselbe Vorlage und eigene Uebernahme frisch bestaetigen. */
async function pruefeVorbereitung(i) {
  if (istNurLesend() || dialog.fehler || dialog.prueft) return false;
  const m = dialog.daten?.mails?.[i];
  if (!m?.vorbereitungStand) return false;
  const abruf = dialog.abruf;
  dialog.prueft = true;
  try {
    await orgSchreiben('/api/einkauf/auftragsstatus', { ...vorbereitungsPayload(), aktion: 'bestellPruefen', mailStand: m.vorbereitungStand });
    return abruf === dialog.abruf && !!$('#dialogRoot .lf-dialog');
  } catch (e) {
    if (abruf === dialog.abruf && $('#dialogRoot .lf-dialog')) vorbereitungFehler(e.message);
    return false;
  } finally {
    if (abruf === dialog.abruf) dialog.prueft = false;
  }
}

/** Eine bewusste Freigabe/Übernahme soll auch den offenen Vorbereitungsdialog nachziehen. */
async function aendereDialogUebernahme(knopf) {
  if (istNurLesend() || dialog.prueft) return;
  knopf.disabled = true;
  kopierFreigaben = new WeakMap();
  const abruf = ++dialog.abruf;
  try {
    const positionen = JSON.parse(knopf.dataset.einkaufPositionen);
    const aktion = knopf.dataset.lfUebernahme;
    await orgSchreiben('/api/einkauf/auftragsstatus', { aktion: 'uebernahme', uebernahmeAktion: aktion, positionen });
    if (abruf !== dialog.abruf || !$('#dialogRoot .lf-dialog')) return;
    if (aktion !== 'freigeben') { await ladeDialog(); return; }
    const stand = await fetchEinkauf('/api/einkauf/auftragsstatus');
    if (abruf !== dialog.abruf || !$('#dialogRoot .lf-dialog')) return;
    if (stand?.verfuegbar) einkauf.auftragsstatus = stand;
    dialog.fehler = 'Du hast die Arbeit freigegeben. Für die Übergabe bitte erneut vorbereiten.';
    zeichneDialog();
  } catch (e) {
    if (abruf === dialog.abruf && $('#dialogRoot .lf-dialog')) vorbereitungFehler(e.message);
  }
}

/** Legacy: erst im zweiten bewussten Klick kopieren, solange dessen Serverfreigabe noch gilt. */
function kopiereMitAuswahl(knopf, text) {
  const feld = document.createElement('textarea');
  feld.value = text; feld.readOnly = true; feld.rows = 6; feld.className = 'lf-mailtext';
  feld.setAttribute('aria-label', 'Geprüften Bestelltext manuell kopieren');
  if (knopf.insertAdjacentElement) knopf.insertAdjacentElement('afterend', feld);
  else document.body.append(feld);
  feld.focus?.(); feld.select();
  let kopiert = false;
  try { kopiert = document.execCommand('copy'); } catch { /* Sichtbare Auswahl bleibt als manueller Weg. */ }
  if (kopiert) feld.remove();
  else toast('Der Browser erlaubt das Kopieren nicht. Der geprüfte Text ist markiert: bitte mit ⌘C oder Strg+C kopieren.', 'warn');
  return kopiert;
}

async function kopiereGepruefteVorlage(knopf, i) {
  const mail = dialog.daten?.mails?.[i];
  if (!mail?.vorbereitungStand) return false;
  const abruf = dialog.abruf;
  const stand = mail.vorbereitungStand;
  const text = mail.text;
  const scope = JSON.stringify(vorbereitungsPayload());
  const gleich = () => abruf === dialog.abruf && !dialog.fehler && !!$('#dialogRoot .lf-dialog')
    && dialog.daten?.mails?.[i] === mail && mail.vorbereitungStand === stand && mail.text === text
    && JSON.stringify(vorbereitungsPayload()) === scope;
  const freigabe = kopierFreigaben.get(knopf);
  kopierFreigaben.delete(knopf);
  if (freigabe && freigabe.abruf === abruf && freigabe.stand === stand && freigabe.text === text
      && freigabe.scope === scope && Date.now() - freigabe.am < KOPIERFREIGABE_MS && gleich()) {
    const kopiert = kopiereMitAuswahl(knopf, text);
    knopf.textContent = kopiert ? 'Kopiert' : 'Text markiert – bitte manuell kopieren';
    return kopiert;
  }
  const pruefung = pruefeVorbereitung(i);
  let schreiben = null;
  // Safari verlangt clipboard.write im urspruenglichen Klick. Der Promise liefert vorher keinen Text.
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const inhalt = pruefung.then(ok => {
      if (!ok || !gleich()) throw new Error('Vorbereitung nicht mehr freigegeben');
      return new Blob([text], { type: 'text/plain' });
    });
    // Auch wenn ein Browser den Schreibaufruf sofort ablehnt, bleibt eine verweigerte Pruefung behandelt.
    void inhalt.catch(() => {});
    try {
      schreiben = Promise.resolve(navigator.clipboard.write([new ClipboardItem({ 'text/plain': inhalt })]))
        .then(() => true, () => false);
    } catch { /* Ohne passenden API-Zugang folgt ein zweiter bewusster Klick. */ }
  }
  if (!await pruefung || !gleich()) return false;
  if (schreiben && await schreiben) {
    if (!gleich()) return false;
    knopf.textContent = 'Kopiert';
    return true;
  }
  if (!gleich()) return false;
  kopierFreigaben.set(knopf, { abruf, stand, text, scope, am: Date.now() });
  knopf.textContent = 'Jetzt kopieren';
  toast('Vorlage geprüft. Bitte innerhalb von 10 Sekunden noch einmal „Jetzt kopieren“ anklicken.', '');
  return false;
}

async function uebergebeVorlage(knopf) {
  const i = Number(knopf.dataset.lfGeoeffnet);
  if (dialog.prueft || dialog.fehler || istNurLesend()) return;
  if (knopf.dataset.kopiertext !== undefined) {
    if (await kopiereGepruefteVorlage(knopf, i)) {
      const frage = $(`#dialogRoot [data-lf-frage="${i}"]`);
      if (frage) frage.hidden = false;
    }
    return;
  }
  const href = knopf.getAttribute('href');
  // Den neuen Tab im urspruenglichen Klick anlegen, damit die frische Serverpruefung
  // den Browser-Popupschutz nicht ausloest. Bei Ablehnung bleibt kein leerer Tab zurueck.
  const fenster = href && knopf.target === '_blank' ? window.open('about:blank', '_blank') : null;
  if (fenster) fenster.opener = null;
  const ok = await pruefeVorbereitung(i);
  if (!ok) { fenster?.close(); return; }
  if (href) {
    if (knopf.target === '_blank') {
      if (!fenster || fenster.closed) { toast('Der Browser hat den neuen Tab nicht geöffnet. Bitte Popups für dieses Dashboard erlauben und erneut klicken.', 'warn'); return; }
      fenster.location.href = href;
    } else window.location.href = href;
  } else return;
  const frage = $(`#dialogRoot [data-lf-frage="${i}"]`);
  if (frage) frage.hidden = false;
}

async function markiereMail(i, knopf) {
  const m = dialog.daten?.mails?.[i];
  if (!m) return;
  knopf.disabled = true;
  if (!await pruefeVorbereitung(i)) { if (!dialog.fehler) knopf.disabled = false; return; }
  const nr = ($(`#lfNr${i}`)?.value || '').trim() || null;
  // Vermerk zum Lieferweg, damit der Auftragsfluss den richtigen naechsten Schritt zeigt: Ware an
  // den Kettler ("unterwegs zum Kettler"), Muster direkt an den Kunden (kein "angekommen" bei uns).
  // Jede andere Mail nimmt einen alten Vermerk zurueck.
  const ueber = m.art === 'ware' ? (m.lieferziel === 'kettler' ? 'kettler' : null) : (m.lieferziel === 'kunde' ? 'kunde' : null);
  const ok = await markiereAlsBestellt(m.positionen, nr, { ueber });
  if (ok) { dialog.markiert.add(i); dialog.gesetzt.set(i, m.positionen.filter(p => afEintragFuer(p)?.status === 'bestellt')); }
  // Karten und Zahlen dahinter nachziehen. Der Dialog bleibt offen - mit "Rückgängig", falls der
  // Klick ein Versehen war (z. B. beim Ausprobieren); geschlossen wird er von Hand.
  render();
  zeichneDialog();
}

/** "Rückgängig" direkt nach "Als bestellt markieren": dieselben Artikel zurück auf offen. */
async function macheMarkierenRueckgaengig(i, knopf) {
  const positionen = dialog.gesetzt.get(i) || [];
  if (!positionen.length) return;
  knopf.disabled = true;
  const ok = await setzeZurueckAufOffen(positionen, 'Rückgängig direkt nach „Als bestellt markieren"');
  toast(ok === positionen.length ? `${plural(ok, 'Artikel', 'Artikel')} zurück auf offen` : `Nur ${ok} von ${positionen.length} Artikeln zurück auf offen`, ok === positionen.length ? '' : 'crit');
  if (ok) { dialog.markiert.delete(i); dialog.gesetzt.delete(i); }
  // Kundenakte und Bestellliste mitziehen (wie nach "Als bestellt markieren"): sonst bleibt die
  // Zeitleiste beim Wareneingang stehen und der Knopf "Bestellmail öffnen" fehlt (Codex-Review #1731).
  if (ok) await ladeStandNeu(); else render();
  zeichneDialog();
}

/** Klicks der Lieferanten-Karten und des Bestellmail-Dialogs. true = Ereignis erledigt. */
export function einkaufKlickLieferanten(e) {
  const mail = e.target.closest('[data-lf-mail]');
  if (mail) {
    // Bei <a> (Portal, Telefon) laeuft der Link normal weiter - kein preventDefault.
    openBestellmailDialog(mail.dataset.lfMail, mail.dataset.lfArt, { auftrag: mail.dataset.lfAuftrag || null });
    return true;
  }
  const auf = e.target.closest('[data-lf-auf]');
  if (auf) {
    const id = auf.dataset.lfAuf;
    if (auf.getAttribute('aria-expanded') === 'true') {
      aufgeklappt.delete(id);
      // Kam die Karte ueber ?lf= aufgeklappt an, muss der Parameter weg - sonst bleibt sie offen.
      if (state.route.params.get('lf') === id) { state.route.params.delete('lf'); history.replaceState(null, '', `#/einkauf${state.route.params.toString() ? `?${state.route.params}` : ''}`); }
    } else aufgeklappt.add(id);
    render();
    return true;
  }
  const geoeffnet = e.target.closest('[data-lf-geoeffnet]');
  if (geoeffnet) {
    e.preventDefault();
    void uebergebeVorlage(geoeffnet);
    return true;
  }
  const uebernahme = e.target.closest('[data-lf-uebernahme]');
  if (uebernahme) { e.preventDefault(); void aendereDialogUebernahme(uebernahme); return true; }
  if (e.target.closest('[data-lf-neu]')) { e.preventDefault(); dialog.fehler = null; ladeDialog(); return true; }
  const ziel = e.target.closest('[data-lf-ziel]');
  if (ziel) { dialog.ziel = ziel.dataset.lfZiel; dialog.markiert = new Set(); ladeDialog(); return true; }
  const rueck = e.target.closest('[data-lf-rueckgaengig]');
  if (rueck) { macheMarkierenRueckgaengig(Number(rueck.dataset.lfRueckgaengig), rueck); return true; }
  const herkunft = e.target.closest('[data-lf-herkunft]');
  if (herkunft) {
    // Die Wahl ersetzt den Mail-Dialog kurz; danach geht die Mail neu geladen wieder auf -
    // ohne die gerade als vorraetig markierten Muster.
    const zurueckZu = { lieferant: dialog.lieferant, art: dialog.art, ziel: dialog.ziel };
    openMusterHerkunftDialog(herkunft.dataset.lfHerkunft, herkunft.dataset.afItem || null, {
      danach: () => { Object.assign(dialog, { ...zurueckZu, daten: null, markiert: new Set(), gesetzt: new Map() }); zeichneDialog(); ladeDialog(); },
    });
    return true;
  }
  const mark = e.target.closest('[data-lf-markieren]');
  if (mark) { markiereMail(Number(mark.dataset.lfMarkieren), mark); return true; }
  const nicht = e.target.closest('[data-lf-nicht]');
  if (nicht) { const frage = nicht.closest('[data-lf-frage]'); if (frage) frage.hidden = true; return true; }
  return false;
}

// ------------------------------------------------------------ Lieferant-Detail

function kontaktKarte(k) {
  const st = k.stammdaten;
  const zeile = (art, titel) => {
    const s = st[art];
    const weg = bestellwegText(st, art);
    const zusatz = [
      s.portalUrl ? `<a href="${esc(s.portalUrl)}" target="_blank" rel="noopener">Händlerportal ↗</a>` : '',
      s.mail ? `<a href="mailto:${esc(s.mail)}">${esc(s.mail)}</a>` : '',
      s.telefon ? `<a href="${esc(telLink(s.telefon))}">${esc(s.telefon)}</a>` : '',
      art === 'muster' && s.lieferung ? `<span>${s.lieferung === 'kunde' ? 'Versand direkt an den Kunden' : 'Versand in den Laden'}</span>` : '',
    ].filter(Boolean);
    return `<dt>${titel}</dt><dd>${weg ? esc(weg) : NICHT_HINTERLEGT}${zusatz.length ? `<div class="lf-kv-zusatz">${zusatz.join('')}</div>` : ''}</dd>`;
  };
  return `<section class="card lf-block"><h2 class="lf-blocktitel">Kontakt und Bestellweg</h2><dl class="lf-kv">
      ${zeile('ware', 'Ware')}${zeile('muster', 'Muster')}
      <dt>Unsere Kundennr.</dt><dd>${st.kundennummer ? `<code class="mono" data-kopiertext="${esc(st.kundennummer)}" title="Klicken zum Kopieren">${esc(st.kundennummer)}</code>` : NICHT_HINTERLEGT}</dd>
    </dl></section>`;
}

function lieferzeitKarte(k, eintraege) {
  const soll = k.stammdaten.lieferzeitWerktage;
  const ist = lieferzeiten(eintraege);
  const schnitt = ist.schnitt === null ? null : ist.schnitt.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const max = Math.max(soll || 0, ...ist.werte.map(w => w.werktage)) + 1;
  const balken = ist.anzahl >= 2 ? `<div class="lf-balken" role="img" aria-label="Lieferzeit der letzten ${ist.anzahl} Lieferungen in Werktagen: ${ist.werte.map(w => w.werktage).join(', ')}">
      ${ist.werte.map(w => `<i class="${soll && w.werktage > soll ? 'spaet' : ''}" style="height:${Math.max(6, Math.round(w.werktage / max * 100))}%" title="${w.werktage} Werktage, geliefert ${esc(fmtDate(w.geliefertAm))}"></i>`).join('')}
      ${soll ? `<span class="lf-soll" style="bottom:${Math.round(soll / max * 100)}%"><span>zugesagt</span></span>` : ''}
    </div><p class="small muted">Letzte ${ist.anzahl} Lieferungen${soll ? ' · gelb = später als zugesagt' : ''}</p>` : '';
  return `<section class="card lf-block"><h2 class="lf-blocktitel">Lieferzeit</h2><dl class="lf-kv">
      <dt>Zugesagt</dt><dd>${soll ? `${soll} Werktage` : NICHT_HINTERLEGT}</dd>
      <dt>Tatsächlich</dt><dd>${schnitt === null ? '<span class="small muted">noch keine Lieferung erfasst</span>' : `${esc(schnitt)} Werktage im Schnitt <span class="small muted">(${plural(ist.anzahl, 'Lieferung', 'Lieferungen')})</span>`}</dd>
    </dl>${balken}</section>`;
}

function hinweiseKarte(k) {
  const st = k.stammdaten;
  if (!st.mindestmenge && !st.hinweise) return '';
  return `<section class="card lf-block"><h2 class="lf-blocktitel">Zu beachten</h2><dl class="lf-kv">
      ${st.mindestmenge ? `<dt>Mindestmenge</dt><dd>${esc(st.mindestmenge)}</dd>` : ''}
      ${st.hinweise ? `<dt>Intern</dt><dd class="lf-freitext">${esc(st.hinweise)}</dd>` : ''}
    </dl></section>`;
}

/** Was in den Stammdaten fehlt - und wo es gepflegt wird. Kein Editor: die Datei ist privat. */
function stammdatenHinweis(k) {
  const st = k.stammdaten;
  const datei = einkauf.lieferanten?.stammdatenDatei;
  const fehler = (datei?.fehler || []).filter(f => f.startsWith(`lieferanten.${k.id}.`)).map(f => f.replace(`lieferanten.${k.id}.`, ''));
  if (!st.fehlend?.length && !fehler.length) return '';
  const wo = 'Gepflegt werden sie in der privaten Datei <span class="mono">lieferanten/stammdaten.json</span> auf dem Büro-Mac (Inhaber) – nicht hier und nie im Repository.';
  const liste = st.fehlend?.length ? `<ul>${st.fehlend.map(f => `<li>${esc(feldKlartext(f))}</li>`).join('')}</ul>` : '';
  const kaputt = fehler.length ? `<p>Ungültig eingetragen: ${fehler.map(esc).join(' · ')}</p>` : '';
  return `<div class="notice warn lf-stammhinweis"><strong>${st.hinterlegt ? 'Stammdaten unvollständig' : 'Für diesen Lieferanten sind noch keine Stammdaten hinterlegt'}.</strong>
    ${liste ? `<p>Es fehlt:</p>${liste}` : ''}${kaputt}<p>${wo}</p></div>`;
}

function postenKarte(k, namen) {
  const zu = [...k.ware.zuBestellen, ...k.muster.zuBestellen];
  const bestellt = nachWartezeit([...k.ware.bestellt, ...k.muster.bestellt]);
  const eingetroffen = nachWartezeit([...k.ware.eingetroffen, ...k.muster.eingetroffen]);
  const n = zu.length + bestellt.length + eingetroffen.length;
  return `<section class="card lf-block"><h2 class="lf-blocktitel">Offene Posten${n ? ` · ${n}` : ''}</h2>
    ${n ? postenListe('Zu bestellen', zu, namen) + postenListe('Bestellt', bestellt, namen) + postenListe('Bei uns eingetroffen', eingetroffen, namen)
      + `<p class="lf-rest"><a href="#/einkauf?lf=${encodeURIComponent(k.id)}">Positionen unter „Bestellen“ bearbeiten</a></p>` : '<p class="lf-rest">Nichts offen.</p>'}
  </section>`;
}

function verlaufKarte(eintraege) {
  const v = verlauf(eintraege);
  const zeile = z => {
    const was = `${plural(z.anzahl, z.muster ? 'Muster' : 'Artikel', z.muster ? 'Muster' : 'Artikel')} ${z.wort}`;
    const teile = [fmtDate(z.am), z.bestellnummer ? `Bestellnr. ${z.bestellnummer}` : null, z.auftraege.slice(0, 3).join(', ') + (z.auftraege.length > 3 ? ' u. a.' : ''), z.von ? `@${z.von}` : null].filter(Boolean);
    return `<li class="lf-posten"><div class="lf-posten-text"><div class="t">${esc(was)}</div><div class="s">${esc(teile.join(' · '))}</div></div></li>`;
  };
  return `<section class="card lf-block"><h2 class="lf-blocktitel">Verlauf</h2>
    ${v.length ? `<ul class="lf-liste">${v.map(zeile).join('')}</ul>` : '<p class="lf-rest">Noch nichts bestellt oder geliefert, das hier erfasst wäre.</p>'}
  </section>`;
}

export function viewEinkaufLieferant(id) {
  ensureEinkaufBestellungen();
  ensureEinkaufAuftragsstatus();
  ensureEinkaufLieferanten();
  const zurueck = '<a class="lf-zurueck" href="#/einkauf">‹ Bestellen</a>';
  const b = einkauf.bestellungen;
  if ((!b && einkauf.loadingBestellungen) || (!einkauf.lieferanten && einkauf.loadingLieferanten)) return `${zurueck}<div class="empty">Lade Lieferant …</div>`;
  if (b?.fehler) return zurueck + stoerungState(b, 'Die Bestelldaten');
  const k = karten().find(x => x.id === String(id).toUpperCase());
  if (!k || !k.zugeordnet) return `${zurueck}<div class="page-head"><div><h1>Lieferant</h1></div></div>${emptyState('Lieferant nicht gefunden.', 'Die Kennung kommt weder in den Stammdaten noch in offenen Bestellungen vor.')}`;
  const namen = kundenNamen();
  const eintraege = ['ware', 'muster'].flatMap(art => Object.values(k[art]).flat());
  const st = k.stammdaten;
  return `${zurueck}
    <div class="page-head"><div><h1 class="lf-name">${esc(k.name)}</h1><p class="sub">${st.kundennummer ? `Unsere Kundennummer ${esc(st.kundennummer)}` : 'Kundennummer nicht hinterlegt'}</p></div>
      <div class="head-actions">${bestellKnoepfe(k)}</div></div>
    ${stammdatenHinweis(k)}
    ${ueberfaelligHinweis(k, { mitLink: false })}
    <div class="lf-spalten">
      <div class="lf-stapel">${kontaktKarte(k)}${lieferzeitKarte(k, eintraege)}${hinweiseKarte(k)}</div>
      <div class="lf-stapel">${postenKarte(k, namen)}${verlaufKarte(eintraege)}</div>
    </div>`;
}
