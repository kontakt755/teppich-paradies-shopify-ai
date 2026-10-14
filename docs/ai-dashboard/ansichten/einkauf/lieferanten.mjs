/**
 * Einkauf je Lieferant: Karten im Reiter "Bestellungen", Bestellmail-Dialog und die
 * Detailseite eines Lieferanten (#/einkauf?lieferant=A).
 *
 * Stammdaten (Bestellweg, Kontakt, Lieferzeit) und der Mailtext kommen fertig vom Server
 * (/api/einkauf/lieferanten, /api/einkauf/bestellmail) - hier wird nichts formuliert und
 * nichts gesendet. Gezaehlt wird aus dem Stand im Browser (lib/einkauf-lieferanten.mjs),
 * damit Zahl und Liste nach einem Klick sofort zusammenpassen.
 */
import {
  lieferantenKarten, karteImFilter, ueberfaelligText, hauptAktion, bestellwegText, feldKlartext,
  telLink, verlauf, lieferzeiten, SCHWELLEN_STANDARD, gmailLink, afNorm } from '../../lib/einkauf-lieferanten.mjs';
import { blockGruende, mengeText, ausfuehrungKurz, jeKommission, laufendSicht } from '../../lib/einkauf-uebersicht.mjs';
import { musterText, musterHerkunftText } from '../../lib/bestellinhalt.mjs';
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, plural, toast, NICHT_HINTERLEGT } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import {
  einkauf, afEintragFuer, anzeigeWert, afWarteText, markiereAlsBestellt,
  ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, ensureEinkaufLieferanten,
  setzeZurueckAufOffen, zurueckGruppen, openMusterHerkunftDialog, kundeUndOrt,
} from './auftragsfluss.mjs';

// Welche Karten ihre Positionen zeigen. Als Zustand im Modul (nicht <details>): jede
// Statusaenderung zeichnet neu, und ein zugeklapptes <details> wird am Handy trotzdem gelayoutet.
const aufgeklappt = new Set();

const detailLink = id => `#/einkauf?lieferant=${encodeURIComponent(id)}`;

function karten() {
  const d = einkauf.bestellungen || {};
  const l = einkauf.lieferanten;
  return lieferantenKarten({
    gruppen: d.gruppen, musterGruppen: d.musterGruppen,
    lieferanten: l?.lieferanten || [],
    eintragFuer: afEintragFuer,
    schwellen: l?.schwellen || SCHWELLEN_STANDARD,
  });
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
  const ware = bestellwegText(k.stammdaten, 'ware');
  const muster = bestellwegText(k.stammdaten, 'muster');
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
  const w = k.stammdaten.ware;
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
  const status = x.eintrag?.status;
  const knopf = status === 'bestellt' && p.lineItemId && !istNurLesend()
    ? `<button type="button" class="btn btn-sm lf-zeilenknopf" data-af-set data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}" data-af-status="geliefert" data-af-name="${esc(p.orderName)}" data-af-titel="${esc(p.titel)}" data-af-farbe="${esc(p.farbe)}">Ist eingetroffen</button>` : '';
  return `<li class="lf-posten${block.length ? ' lf-blockiert' : ''}"><div class="lf-posten-text">
      <div class="t">${esc(titel)}</div>
      ${menge ? `<div class="lf-menge">${esc(menge)}</div>` : ''}
      ${aus.map(z => `<div class="s">${esc(z)}</div>`).join('')}
      ${wer ? `<div class="s lf-wer">${esc(wer)}</div>` : ''}
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
    </div><div class="lf-posten-rechts"><span class="lf-anzahl">${esc(plural(g.positionen.length, 'Muster', 'Muster'))}</span>${warteChip(g)}</div></li>`;
}

/** Ueberschrift einer Stufe: "Zu bestellen · 3" und rechts daneben der Knopf. */
const stufeKopf = (titel, zahl, knopf = '') => `<div class="lf-stufe"><span class="lf-abschnitt">${esc(titel)} <b>${zahl}</b></span>${knopf}</div>`;

function stufeListe(zeilen, rest, restText) {
  return `<ul class="lf-liste">${zeilen.join('')}</ul>${rest > 0 ? `<p class="lf-rest">+ ${rest} ${esc(restText)}</p>` : ''}`;
}

function wareBlock(k, namen, knopfKlasse) {
  const w = k.ware;
  if (!w.zuBestellen.length && !w.bestellt.length && !w.eingetroffen.length) return '';
  const teile = [];
  if (w.zuBestellen.length) {
    const zeigen = w.zuBestellen.slice(0, 8);
    teile.push(stufeKopf('Zu bestellen', w.zuBestellen.length, wareKnopf(k, knopfKlasse))
      + stufeListe(zeigen.map(x => wareZeile(x, namen)), w.zuBestellen.length - zeigen.length, 'weitere – „Positionen bearbeiten"'));
  }
  if (w.bestellt.length) {
    const s = laufendSicht(nachWartezeit(w.bestellt));
    teile.push(stufeKopf('Bestellt, noch nicht da', w.bestellt.length) + stufeListe(s.zeigen.map(x => wareZeile(x, namen)), s.rest, 'weitere im Plan'));
  }
  if (w.eingetroffen.length) {
    const zeigen = nachWartezeit(w.eingetroffen).slice(0, 2);
    teile.push(stufeKopf('Bei uns eingetroffen', w.eingetroffen.length) + stufeListe(zeigen.map(x => wareZeile(x, namen)), w.eingetroffen.length - zeigen.length, 'weitere'));
  }
  return `<section class="lf-art" aria-label="Ware"><h4 class="lf-art-titel">Ware</h4>${teile.join('')}</section>`;
}

function musterBlock(k, namen, knopfKlasse) {
  const m = k.muster;
  const eigen = m.eigen || [];
  const laufend = [...m.bestellt, ...m.eingetroffen];
  if (!m.zuBestellen.length && !eigen.length && !laufend.length) return '';
  const zahl = liste => { const n = jeKommission(liste).length; return `${liste.length}<span class="lf-fuer"> für ${plural(n, 'Kunden', 'Kunden')}</span>`; };
  const teile = [];
  if (m.zuBestellen.length) {
    const g = jeKommission(m.zuBestellen);
    teile.push(stufeKopf('Zu bestellen', zahl(m.zuBestellen), musterKnopf(k, knopfKlasse)) + stufeListe(g.slice(0, 6).map(x => musterZeile(x, namen)), g.length - Math.min(g.length, 6), 'weitere Kunden'));
  }
  if (eigen.length) {
    const g = jeKommission(eigen);
    teile.push(stufeKopf('Haben wir da – verschicken oder vorbeibringen', zahl(eigen)) + stufeListe(g.slice(0, 4).map(x => musterZeile(x, namen, { herkunft: true })), g.length - Math.min(g.length, 4), 'weitere Kunden'));
  }
  if (laufend.length) {
    const s = laufendSicht(jeKommission(laufend));
    teile.push(stufeKopf('Bestellt, unterwegs', zahl(laufend)) + stufeListe(s.zeigen.map(x => musterZeile(x, namen)), s.rest, s.rest === 1 ? 'weiterer Kunde im Plan' : 'weitere Kunden im Plan'));
  }
  return `<section class="lf-art" aria-label="Muster"><h4 class="lf-art-titel">Muster</h4>${teile.join('')}</section>`;
}

function karteHtml(k, { gruppeKarte, namen, af, alleGruppen, alleMusterGruppen }) {
  const offen = aufgeklappt.has(k.id) || state.route.params.get('lf') === k.id || !k.zugeordnet || !!af;
  const zu = [...k.ware.zuBestellen, ...k.muster.zuBestellen];
  const laufend = nachWartezeit([...k.ware.bestellt, ...k.ware.eingetroffen, ...k.muster.bestellt, ...k.muster.eingetroffen]);
  const eigen = k.muster.eigen || [];
  const anzahl = af === 'erledigt' ? k.ware.erledigt.length + k.muster.erledigt.length : zu.length + laufend.length + eigen.length;
  // Zugeklappt stehen die Bestellknoepfe bei "Zu bestellen"; aufgeklappt (Tabellen) unten im Fuss.
  const knoepfe = offen ? bestellKnoepfe(k) : nachhakKnopf(k);
  const wareHtml = offen || !k.zugeordnet ? '' : wareBlock(k, namen, 'btn btn-primary');
  const vorschau = offen ? '' : wareHtml + musterBlock(k, namen, k.zahlen.zuBestellen ? 'btn' : 'btn btn-primary');
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
    ${ueberfaelligHinweis(k)}
    ${vorschau}
    ${offen ? `<div class="lf-tabellen">${tabellen || '<p class="lf-rest">Kein Artikel in diesem Schritt.</p>'}</div>` : ''}
    <div class="lf-fuss">${knoepfe}${zurueck}<button type="button" class="btn btn-ghost lf-aufklappen" data-lf-auf="${esc(k.id)}" aria-expanded="${offen}">${offen ? 'Positionen einklappen' : `Positionen bearbeiten (${anzahl})`}</button></div>
  </article>`;
}

/**
 * Karten je Lieferant fuer den Reiter "Bestellungen".
 * `gruppeKarte` zeichnet die bisherige Tabelle einer Gruppe (kommt von bestellungen.mjs -
 * als Parameter, damit die beiden Module nicht im Kreis voneinander abhaengen).
 */
export function lieferantenKartenHtml({ gruppeKarte }) {
  ensureEinkaufLieferanten();
  const d = einkauf.bestellungen;
  const af = afNorm(state.route.params.get('af'));
  const alle = karten();
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

const dialog = { lieferant: null, art: 'ware', ziel: '', daten: null, markiert: new Set(), gesetzt: new Map() };

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

const LIEFERZIEL_TEXT = { laden: 'Lieferung in den Laden', kunde: 'Lieferung direkt an den Kunden', baustelle: 'Lieferung direkt an die Baustelle' };

function mailAbschnitt(m, i, mehrere) {
  const lesend = istNurLesend();
  const kopf = mehrere ? `<h3 class="lf-mail-titel">${esc(m.art === 'muster' ? 'Muster' : 'Ware')}${LIEFERZIEL_TEXT[m.lieferziel] ? ` · ${esc(LIEFERZIEL_TEXT[m.lieferziel])}` : ''}</h3>` : '';
  const fehlt = (m.fehlt || []).length ? `<div class="notice warn lf-fehltliste"><strong>${m.text ? 'Nicht in der Mail' : 'Kann so nicht bestellt werden'} (${m.fehlt.length}):</strong>
      <ul>${m.fehlt.map(f => `<li>${esc([f.orderName, [f.titel, f.farbe].filter(Boolean).join(', ')].filter(Boolean).join(' · '))} – weil: ${esc((f.gruende || []).join('; '))}</li>`).join('')}</ul></div>` : '';
  const ohne = (m.ohneBestellung || []).length ? `<div class="small muted lf-ohne"><p style="margin:0 0 4px">Nicht beim Lieferanten zu bestellen (${m.ohneBestellung.length}):</p><ul class="lf-liste">${m.ohneBestellung.map(f => `<li class="lf-posten"><div class="lf-posten-text"><div class="t">${esc(anzeigeWert(f.titel || ''))}</div><div class="s">${esc([kundeOrtText(f.orderId), f.orderName, ...(f.gruende || [])].filter(Boolean).join(' · '))}</div></div>${istNurLesend() ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-lf-herkunft="${esc(f.orderId)}" data-af-item="${esc(f.lineItemId)}">Ändern…</button>`}</li>`).join('')}</ul></div>` : '';
  const wahl = m.art === 'muster' || m.zielWaehlbar;
  const zielWahl = wahl ? `<div class="lf-zielwahl" role="group" aria-label="Wohin geht die Lieferung?"><span class="small muted">${m.art === 'muster' ? 'Muster gehen an' : 'Ware geht an'}:</span>
      ${[['kunde', 'Kunden'], ['laden', 'Laden']].map(([w, l]) => `<button type="button" class="chip" data-lf-ziel="${w}" aria-pressed="${m.lieferziel === w}">${l}</button>`).join('')}</div>` : '';
  if (!m.text) {
    const schon = m.bereitsBestellt ? `${plural(m.bereitsBestellt, 'Artikel ist', 'Artikel sind')} schon bestellt.` : '';
    return `<section class="lf-mail">${kopf}${zielWahl}${(m.fehlt || []).length ? '' : `<p class="lf-leer">Nichts mehr zu bestellen. ${esc(schon)}</p>`}${fehlt}${ohne}</section>`;
  }
  const fertig = dialog.markiert.has(i);
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
        <div class="field"><label for="lfNr${i}">Bestellnummer des Lieferanten (optional)</label><input id="lfNr${i}" maxlength="200" placeholder="z. B. 2026-4711"></div>
        <div class="lf-frage-knoepfe"><button type="button" class="btn btn-primary" data-lf-markieren="${i}">${plural(n, wort, wort)} als bestellt markieren</button><button type="button" class="btn btn-ghost" data-lf-nicht="${i}">Noch nicht</button></div>
      </div>`;
  return `<section class="lf-mail">${kopf}${zielWahl}
    <dl class="lf-mailkopf"><dt>An</dt><dd>${an}</dd><dt>Betreff</dt><dd>${esc(m.betreff)}</dd></dl>
    <pre class="lf-mailtext" tabindex="0">${esc(m.text)}</pre>
    ${gekuerzt}${fehlt}${ohne}${hinweise}${fertig ? '' : musterWahlListe(m)}
    ${fertig ? '' : `<div class="lf-mail-knoepfe">${oeffnen.join('')}<button type="button" class="${oeffnen.length ? 'btn' : 'btn btn-primary'}" data-kopiertext="${esc(m.text)}" data-lf-geoeffnet="${i}">Text kopieren</button></div>`}
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
    ${inhalt}
    <div class="actions"><span class="small muted lf-nie">Es wird nichts automatisch gesendet.</span><button type="button" class="btn" data-close-dialog>Schließen</button></div>
  </div></div>`;
}

async function ladeDialog() {
  const q = new URLSearchParams({ lieferant: dialog.lieferant, art: dialog.art });
  if (dialog.ziel) q.set('ziel', dialog.ziel);
  const fuer = `${dialog.lieferant}|${dialog.art}|${dialog.ziel}`;
  const daten = await fetchEinkauf(`/api/einkauf/bestellmail?${q}`);
  // Zwischenzeitlich geschlossen oder umgeschaltet? Dann nichts mehr zeichnen.
  if (fuer !== `${dialog.lieferant}|${dialog.art}|${dialog.ziel}` || !$('#dialogRoot .lf-dialog')) return;
  dialog.daten = daten;
  zeichneDialog();
  $('#dialogRoot .lf-mail-knoepfe .btn-primary, #dialogRoot [data-close-dialog].btn')?.focus();
}

export function openBestellmailDialog(lieferant, art = 'ware') {
  Object.assign(dialog, { lieferant, art: art === 'muster' ? 'muster' : 'ware', ziel: '', daten: null, markiert: new Set(), gesetzt: new Map() });
  zeichneDialog();
  ladeDialog();
}

async function markiereMail(i, knopf) {
  const m = dialog.daten?.mails?.[i];
  if (!m) return;
  knopf.disabled = true;
  const nr = ($(`#lfNr${i}`)?.value || '').trim() || null;
  const ok = await markiereAlsBestellt(m.positionen, nr);
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
  render();
  zeichneDialog();
}

/** Klicks der Lieferanten-Karten und des Bestellmail-Dialogs. true = Ereignis erledigt. */
export function einkaufKlickLieferanten(e) {
  const mail = e.target.closest('[data-lf-mail]');
  if (mail) {
    // Bei <a> (Portal, Telefon) laeuft der Link normal weiter - kein preventDefault.
    openBestellmailDialog(mail.dataset.lfMail, mail.dataset.lfArt);
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
    // Nach dem Oeffnen (oder Kopieren) fragen, ob bestellt ist. Nur einblenden, nicht neu
    // zeichnen: der Link (mailto/Portal) und das Kopieren laufen in diesem Klick noch.
    const frage = $(`#dialogRoot [data-lf-frage="${geoeffnet.dataset.lfGeoeffnet}"]`);
    if (frage) frage.hidden = false;
    return false;
  }
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
      + `<p class="lf-rest"><a href="#/einkauf?lf=${encodeURIComponent(k.id)}">Positionen im Einkauf bearbeiten</a></p>` : '<p class="lf-rest">Nichts offen.</p>'}
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
  const zurueck = '<a class="lf-zurueck" href="#/einkauf">‹ Einkauf</a>';
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
