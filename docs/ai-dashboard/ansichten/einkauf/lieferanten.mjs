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
  telLink, verlauf, lieferzeiten, SCHWELLEN_STANDARD,
} from '../../lib/einkauf-lieferanten.mjs';
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, plural, NICHT_HINTERLEGT } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import {
  einkauf, afEintragFuer, anzeigeWert, afWarteText, markiereAlsBestellt,
  ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, ensureEinkaufLieferanten,
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

function zahlenChips(k) {
  const z = k.zahlen;
  const chip = (n, text, klasse = '') => n ? `<span class="lf-zahl ${klasse}">${n} ${esc(text)}</span>` : '';
  return chip(z.zuBestellen, 'zu bestellen', 'akzent') + chip(z.musterOffen, 'Muster offen', 'akzent')
    + chip(z.bestellt, 'bestellt') + chip(z.unterwegs, 'unterwegs') + chip(z.musterLaufend, z.musterLaufend === 1 ? 'Muster läuft' : 'Muster laufen');
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
  const teile = [p.farbe, menge, namen.get(p.orderId), p.orderName].filter(v => v && v !== 'UNGEKLAERT');
  return `<li class="lf-posten"><div class="lf-posten-text"><div class="t">${esc(anzeigeWert(p.titel))}</div><div class="s">${esc(teile.join(' · '))}</div></div>${warteChip(x)}</li>`;
}

function postenListe(titel, liste, namen, max) {
  if (!liste.length) return '';
  const sicht = max ? liste.slice(0, max) : liste;
  const rest = liste.length - sicht.length;
  return `<div class="lf-abschnitt">${esc(titel)}</div><ul class="lf-liste">${sicht.map(x => postenZeile(x, namen)).join('')}</ul>${rest > 0 ? `<p class="lf-rest">+ ${rest} weitere</p>` : ''}`;
}

const nachWartezeit = liste => [...liste].sort((a, b) => (b.wartetage ?? -1) - (a.wartetage ?? -1));

/** Hauptknopf (je nach Bestellweg) und "Muster bestellen". Hoechstens einer ist die Hauptaktion. */
function bestellKnoepfe(k) {
  if (!k.zugeordnet) return '';
  const teile = [];
  let hauptVergeben = false;
  const klasse = () => { if (hauptVergeben) return 'btn'; hauptVergeben = true; return 'btn btn-primary'; };
  if (k.zahlen.zuBestellen) {
    const a = hauptAktion(k.stammdaten, 'ware');
    const daten = `data-lf-mail="${esc(k.id)}" data-lf-art="ware"`;
    // Portal und Telefon oeffnen sich direkt (neuer Tab bzw. Anruf); der Dialog mit der
    // Bestellliste geht trotzdem auf - dort wird kopiert und danach als bestellt markiert.
    teile.push(a.href
      ? `<a class="${klasse()}" href="${esc(a.href)}"${a.neuerTab ? ' target="_blank" rel="noopener"' : ''} ${daten}>${esc(a.label)}${a.neuerTab ? ' ↗' : ''}</a>`
      : `<button type="button" class="${klasse()}" ${daten}>${esc(a.label)}</button>`);
  }
  if (k.zahlen.musterOffen) teile.push(`<button type="button" class="${klasse()}" data-lf-mail="${esc(k.id)}" data-lf-art="muster">Muster bestellen</button>`);
  // Nichts zu bestellen, aber ueberfaellig: dann ist Nachhaken der naechste Schritt.
  if (!teile.length && k.ueberfaellig.stufe) {
    const w = k.stammdaten.ware;
    if (w.telefon) teile.push(`<a class="btn" href="${esc(telLink(w.telefon))}">Anrufen</a>`);
    else if (w.mail) teile.push(`<a class="btn" href="mailto:${esc(w.mail)}">E-Mail schreiben</a>`);
  }
  return teile.join('');
}

function karteHtml(k, { gruppeKarte, namen, af, alleGruppen, alleMusterGruppen }) {
  const offen = aufgeklappt.has(k.id) || state.route.params.get('lf') === k.id || !k.zugeordnet || !!af;
  const zu = [...k.ware.zuBestellen, ...k.muster.zuBestellen];
  const laufend = nachWartezeit([...k.ware.bestellt, ...k.ware.unterwegs, ...k.muster.bestellt, ...k.muster.unterwegs]);
  const anzahl = af === 'erledigt' ? k.ware.erledigt.length + k.muster.erledigt.length : zu.length + laufend.length;
  const knoepfe = bestellKnoepfe(k);
  const vorschau = offen ? '' : postenListe('Zu bestellen', zu, namen, 4) + postenListe('Bestellt und unterwegs', laufend, namen, 3);
  // Die bisherigen Tabellen je Gruppe (Status setzen, Artikelnummer kopieren, Link zum
  // Lieferanten, Liste kopieren, Sammelaktion) - unveraendert, nur eingeklappt.
  const tabellen = !offen ? '' : k.wareGruppen.map(g => gruppeKarte(g, alleGruppen.indexOf(g), 'ware', { eingebettet: true })).join('')
    + k.musterGruppen.map(g => gruppeKarte(g, alleMusterGruppen.indexOf(g), 'muster', { eingebettet: true })).join('');
  const kopfName = k.zugeordnet ? `<a href="${detailLink(k.id)}" title="Kontakt, Bestellweg und Verlauf">${esc(k.name)}</a>` : esc(k.name);
  return `<article class="card lf-karte${offen ? ' lf-offen' : ''}">
    <div class="lf-kopf"><h3 class="lf-name">${kopfName}</h3><div class="lf-zahlen">${zahlenChips(k)}</div>${wegZeile(k)}</div>
    ${ueberfaelligHinweis(k)}
    ${vorschau}
    ${offen ? `<div class="lf-tabellen">${tabellen || '<p class="lf-rest">Kein Artikel in diesem Schritt.</p>'}</div>` : ''}
    <div class="lf-fuss">${knoepfe}<button type="button" class="btn btn-ghost lf-aufklappen" data-lf-auf="${esc(k.id)}" aria-expanded="${offen}">${offen ? 'Positionen einklappen' : `Positionen bearbeiten (${anzahl})`}</button></div>
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
  const af = state.route.params.get('af') || '';
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

const dialog = { lieferant: null, art: 'ware', ziel: '', daten: null, markiert: new Set() };

const LIEFERZIEL_TEXT = { laden: 'Lieferung in den Laden', kunde: 'Lieferung direkt an den Kunden', baustelle: 'Lieferung direkt an die Baustelle' };

function mailAbschnitt(m, i, mehrere) {
  const lesend = istNurLesend();
  const kopf = mehrere ? `<h3 class="lf-mail-titel">${esc(m.art === 'muster' ? 'Muster' : 'Ware')}${LIEFERZIEL_TEXT[m.lieferziel] ? ` · ${esc(LIEFERZIEL_TEXT[m.lieferziel])}` : ''}</h3>` : '';
  const fehlt = (m.fehlt || []).length ? `<div class="notice warn lf-fehltliste"><strong>${m.text ? 'Nicht in der Mail' : 'Kann so nicht bestellt werden'} (${m.fehlt.length}):</strong>
      <ul>${m.fehlt.map(f => `<li>${esc([f.orderName, [f.titel, f.farbe].filter(Boolean).join(', ')].filter(Boolean).join(' · '))} – weil: ${esc((f.gruende || []).join('; '))}</li>`).join('')}</ul></div>` : '';
  const ohne = (m.ohneBestellung || []).length ? `<p class="small muted">Nicht beim Lieferanten zu bestellen: ${m.ohneBestellung.map(f => `${esc(f.titel || '')} (${esc((f.gruende || []).join(', '))})`).join(' · ')}</p>` : '';
  const zielWahl = m.art === 'muster' ? `<div class="lf-zielwahl" role="group" aria-label="Wohin gehen die Muster?"><span class="small muted">Muster gehen an:</span>
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
    if (weg === 'portal' && m.portalUrl && (m.weg === 'portal' || !m.mailto)) oeffnen.push(`<a class="${haupt()}" href="${esc(m.portalUrl)}" target="_blank" rel="noopener" data-lf-geoeffnet="${i}">Portal öffnen ↗</a>`);
    if (weg === 'telefon' && m.telefon && (m.weg === 'telefon' || !m.mailto)) oeffnen.push(`<a class="${haupt()}" href="${esc(telLink(m.telefon))}" data-lf-geoeffnet="${i}">Anrufen ${esc(m.telefon)}</a>`);
  }
  const an = m.an ? esc(m.an) + (m.ansprechperson ? ` · ${esc(m.ansprechperson)}` : '') : '<span class="lf-fehlt">keine Mailadresse hinterlegt – Text kopieren</span>';
  const gekuerzt = m.mailtoGekuerzt ? '<p class="notice warn">Der Text ist zu lang für den Link: das Mailprogramm öffnet nur mit Empfänger und Betreff. Bitte „Text kopieren" und in die Mail einfügen.</p>' : '';
  const hinweise = (m.hinweise || []).length ? `<ul class="lf-hinweise small muted">${m.hinweise.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : '';
  const frage = lesend ? '' : fertig
    ? `<p class="lf-erledigt">${plural(n, wort, wort)} als bestellt markiert.</p>`
    : `<div class="lf-frage" data-lf-frage="${i}" hidden>
        <strong>Als bestellt markieren?</strong>
        <span class="small muted">Nur, wenn die Bestellung wirklich raus ist.</span>
        <div class="field"><label for="lfNr${i}">Bestellnummer des Lieferanten (optional)</label><input id="lfNr${i}" maxlength="200" placeholder="z. B. 2026-4711"></div>
        <div class="lf-frage-knoepfe"><button type="button" class="btn btn-primary" data-lf-markieren="${i}">${plural(n, wort, wort)} als bestellt markieren</button><button type="button" class="btn btn-ghost" data-lf-nicht="${i}">Noch nicht</button></div>
      </div>`;
  return `<section class="lf-mail">${kopf}${zielWahl}
    <dl class="lf-mailkopf"><dt>An</dt><dd>${an}</dd><dt>Betreff</dt><dd>${esc(m.betreff)}</dd></dl>
    <pre class="lf-mailtext" tabindex="0">${esc(m.text)}</pre>
    ${gekuerzt}${fehlt}${ohne}${hinweise}
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
  if (dialog.art === 'muster' && dialog.ziel) q.set('ziel', dialog.ziel);
  const fuer = `${dialog.lieferant}|${dialog.art}|${dialog.ziel}`;
  const daten = await fetchEinkauf(`/api/einkauf/bestellmail?${q}`);
  // Zwischenzeitlich geschlossen oder umgeschaltet? Dann nichts mehr zeichnen.
  if (fuer !== `${dialog.lieferant}|${dialog.art}|${dialog.ziel}` || !$('#dialogRoot .lf-dialog')) return;
  dialog.daten = daten;
  zeichneDialog();
  $('#dialogRoot .lf-mail-knoepfe .btn-primary, #dialogRoot [data-close-dialog].btn')?.focus();
}

export function openBestellmailDialog(lieferant, art = 'ware') {
  Object.assign(dialog, { lieferant, art: art === 'muster' ? 'muster' : 'ware', ziel: '', daten: null, markiert: new Set() });
  zeichneDialog();
  ladeDialog();
}

async function markiereMail(i, knopf) {
  const m = dialog.daten?.mails?.[i];
  if (!m) return;
  knopf.disabled = true;
  const nr = ($(`#lfNr${i}`)?.value || '').trim() || null;
  const ok = await markiereAlsBestellt(m.positionen, nr);
  if (ok === m.positionen.length) dialog.markiert.add(i);
  // Karten und Zahlen dahinter nachziehen; der Dialog bleibt offen, solange weitere Mails warten.
  render();
  const offen = dialog.daten.mails.some((x, j) => x.text && !dialog.markiert.has(j));
  if (offen || ok !== m.positionen.length) zeichneDialog(); else $('#dialogRoot').innerHTML = '';
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
  const unterwegs = nachWartezeit([...k.ware.unterwegs, ...k.muster.unterwegs]);
  const n = zu.length + bestellt.length + unterwegs.length;
  return `<section class="card lf-block"><h2 class="lf-blocktitel">Offene Posten${n ? ` · ${n}` : ''}</h2>
    ${n ? postenListe('Zu bestellen', zu, namen) + postenListe('Bestellt', bestellt, namen) + postenListe('Geliefert an uns / an Kunden raus', unterwegs, namen)
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
