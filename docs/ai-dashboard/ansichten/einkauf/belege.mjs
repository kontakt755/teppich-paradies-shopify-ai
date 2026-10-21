/**
 * Einkauf, Reiter "Belege" (#/einkauf?tab=belege): was die Lieferanten per Mail geschickt
 * haben - Auftragsbestaetigung, Lieferschein, Avis, Storno - und ob es zu unserem Stand passt.
 *
 * Inhaber 2026-10-19: "wo kommen Lieferscheine und Auftragsbestaetigungen, wurde es abgehakt,
 * ist es mit Shopify synchron". Das Postfach liest ein geplanter Claude-Lauf stuendlich (nur
 * lesend); hier steht, was er gefunden hat. Erkennen und Zuordnen: lib/lieferbelege.mjs.
 *
 * Aufbau, von oben nach unten:
 *   Zu pruefen   Storno (rot), Lieferschein da - bei uns noch "bestellt" (gelb), Vorschlaege
 *                ("gehoert zu #1041?"), Belege ohne Bestellung je Absender.
 *   Je Auftrag   AB und Lieferschein neben dem Stand bei uns und in Shopify.
 *   Alle Belege  durchsuchbar, seitenweise.
 * Ein Beleg aendert nie selbst den Auftragsfluss - "Zum Auftrag" fuehrt in den Einkauf, dort
 * setzt ein Mensch den Schritt.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, ago, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { ART_LABEL, ART_KURZ, STAND_LABEL, SHOPIFY_LABEL, FREEMAIL, adresseVon, belegArbeit as arbeitAus } from '../../lib/lieferbelege.mjs';

export const belege = { daten: null, laedt: false, geladenAm: 0 };

/** So lange gilt der geladene Stand; der Postfach-Lauf kommt hoechstens stuendlich. */
const FRISCH_MS = 60000;
const SEITE = 25;
/** Die Auftragstabelle bleibt kurz - was nicht passt, steht ohnehin oben. */
const SEITE_AUFTRAG = 12;
/** Werktags laeuft der Abgleich stuendlich - nach so vielen Stunden ohne Lauf stimmt etwas nicht. */
const LAUF_ALT_STD = 4;

export function ensureBelege({ neu = false } = {}) {
  if (belege.laedt || (belege.daten && !neu && Date.now() - belege.geladenAm < FRISCH_MS)) return;
  belege.laedt = true;
  fetchEinkauf('/api/einkauf/belege').then(d => { belege.daten = d; belege.geladenAm = Date.now(); }).finally(() => {
    belege.laedt = false;
    if (['einkauf', 'heute'].includes(state.route.view)) render();
  });
}

// -- Bausteine --------------------------------------------------------------------

const lieferantName = id => (id ? belege.daten?.lieferanten?.[id] || `Lieferant ${id}` : null);
const absenderText = b => lieferantName(b.lieferant) || (FREEMAIL.includes(b.domain) ? b.von || b.domain : b.domain || b.von) || 'unbekannter Absender';
const auftrag = id => belege.daten?.auftraege?.[id] || null;
const auftragText = (id) => {
  const a = auftrag(id);
  return a ? `${a.orderName}${a.kundenname ? ` ${a.kundenname}` : ''}` : 'Bestellung';
};
const auftragLink = id => `#/einkauf?${new URLSearchParams({ auftrag: id })}`;
const belegVon = id => belege.daten?.belege?.find(b => b.id === id) || null;

function gmailKnopf(b) {
  if (!b?.viewUrl) return '';
  return `<a class="btn btn-sm btn-ghost" href="${esc(b.viewUrl)}" target="_blank" rel="noopener noreferrer">In Gmail öffnen</a>`;
}

/** Offene Arbeit aus den geladenen Belegen (lib/lieferbelege.mjs) - Reiter, Reiterzahl und "Heute" zaehlen gleich. */
export function belegArbeit(d = belege.daten) {
  return arbeitAus(d);
}

/**
 * Kurzer Belegstand einer bestellten Position fuer die Karten im Einkauf: "AB 14.10. · LS 16.10."
 * - leer, solange nichts zugeordnet ist (dann sagt die Zeile nichts, statt "AB fehlt" zu raten).
 */
export function belegStandText(orderId, lieferant) {
  const z = belege.daten?.zeilen?.find(x => x.orderId === orderId && x.lieferant === lieferant);
  if (!z) return '';
  const teil = (kurz) => (kurz ? `${ART_KURZ[kurz.art] || ''} ${fmtDate(kurz.datum).slice(0, 6)}`.trim() : null);
  return [z.storno ? `Storno ${fmtDate(z.storno.datum).slice(0, 6)}` : null, teil(z.ab), teil(z.lieferschein)].filter(Boolean).join(' · ');
}

/** Zeile "Postfach zuletzt gelesen" - und ob sie auffallen muss. */
export function laufStand(d = belege.daten) {
  const l = d?.letzterLauf;
  if (!l) return { text: 'Das Lieferantenpostfach wurde noch nicht gelesen.', ton: 'warn' };
  const std = (Date.now() - Date.parse(l.am)) / 3600000;
  const tag = new Date().getDay();
  const werktag = tag >= 1 && tag <= 6;
  const neu = l.neu ? ` · ${plural(l.neu, 'neues Schreiben', 'neue Schreiben')}` : '';
  const teil = l.vollstaendig === false ? ' · nicht vollständig gelesen' : '';
  return { text: `Postfach zuletzt gelesen ${ago(l.am)}${neu}${teil}`, ton: (werktag && std > LAUF_ALT_STD) || l.vollstaendig === false ? 'warn' : '' };
}

function zeile({ ton = '', titel, kontext, knoepfe }) {
  return `<li class="bl-zeile${ton ? ` ${ton}` : ''}">
    <div class="bl-was"><div class="bl-titel">${titel}</div>${kontext ? `<div class="bl-kontext">${kontext}</div>` : ''}</div>
    <div class="bl-knoepfe">${knoepfe}</div>
  </li>`;
}

function abweichungHtml(a) {
  const b = belegVon(a.belegId);
  const lesend = istNurLesend();
  const wer = esc(lieferantName(a.lieferant) || 'Lieferant');
  const erledigt = lesend ? '' : `<button type="button" class="btn btn-sm" data-bl-erledigt="${esc(a.belegId)}" data-bl-order="${esc(a.orderId)}">Erledigt</button>`;
  const zum = `<a class="btn btn-sm btn-ghost" href="${esc(auftragLink(a.orderId))}">Zum Auftrag</a>`;
  if (a.art === 'storno') {
    return zeile({
      ton: 'crit', titel: `Storno von ${wer} zu ${esc(auftragText(a.orderId))}`,
      kontext: `${b ? `„${esc(b.betreff)}“ · ` : ''}Mail lesen – betrifft es den Kunden, ihn informieren und Ersatz klären.`,
      knoepfe: `${gmailKnopf(b)}${zum}${erledigt}`,
    });
  }
  return zeile({
    ton: 'warn', titel: `Lieferschein von ${wer} zu ${esc(auftragText(a.orderId))}`,
    kontext: `${fmtDate(a.datum)} · bei uns noch „Bestellt“. Ist die Ware da, im Einkauf auf „Geliefert an uns“ setzen${a.nurMuster ? '' : ' – geht sie direkt an den Kunden, auf „An Kunden raus“'}.`,
    knoepfe: `${gmailKnopf(b)}${zum}${erledigt}`,
  });
}

function vorschlagHtml(b) {
  const lesend = istNurLesend();
  const ziel = b.zuordnung.orderIds.map(auftragText).join(b.zuordnung.orderIds.length > 1 ? ' oder ' : ', ');
  const mehrere = b.zuordnung.orderIds.length > 1;
  const ja = mehrere
    ? `<button type="button" class="btn btn-sm btn-primary" data-bl-waehlen="${esc(b.id)}">Auswählen…</button>`
    : `<button type="button" class="btn btn-sm btn-primary" data-bl-annehmen="${esc(b.id)}">Ja, gehört dazu</button>`;
  const knoepfe = lesend ? gmailKnopf(b) : `${ja}
    <button type="button" class="btn btn-sm" data-bl-ablehnen="${esc(b.id)}">${mehrere ? 'Keine davon' : 'Passt nicht'}</button>${gmailKnopf(b)}`;
  return zeile({
    titel: `${esc(ART_LABEL[b.art] || 'Schreiben')} von ${esc(absenderText(b))}: gehört zu ${esc(ziel)}${b.zuordnung.orderIds.length > 1 ? ' (eine davon)' : ''}?`,
    kontext: `${fmtDate(b.datum)} · „${esc(b.betreff)}“ · ${esc(b.zuordnung.grund)}`,
    knoepfe,
  });
}

/**
 * Belege ohne Shop-Bestellung - meist Laden- und Telefonbestellungen. Kein To-do: eine Zeile mit
 * der Zahl, aufklappbar (Parameter blo), darin je Absender "Kein Shop-Lieferant" und je Beleg
 * "Zuordnen…" fuer den Fall, dass doch eine Shop-Bestellung dahintersteht.
 */
function ohneHtml(ohne) {
  if (!ohne.length) return '';
  const auf = Boolean(state.route.params.get('blo'));
  const lesend = istNurLesend();
  const absenderGruppe = b => FREEMAIL.includes(b.domain) ? adresseVon(b.von) || b.von || b.id : b.domain || b.von;
  const gruppen = [...ohne.reduce((m, b) => m.set(absenderGruppe(b), [...(m.get(absenderGruppe(b)) || []), b]), new Map())]
    .sort((a, b) => b[1].length - a[1].length);
  const kopf = `<h2 class="section-title">Ohne Shop-Bestellung <span class="muted">${ohne.length}</span></h2>
    <p class="small muted bl-ohne-text">Meist Laden- oder Telefonbestellungen (letzte 30 Tage). Gehört doch einer zu einer Shop-Bestellung: „Zuordnen…“. Liefert ein Absender nie für den Shop: „Kein Shop-Lieferant“ – dann erscheint er hier nicht mehr.
    <button type="button" class="heute-hg-knopf" data-param="blo" data-value="${auf ? '' : '1'}" aria-expanded="${auf}">${auf ? 'Zuklappen' : `${gruppen.length} ${gruppen.length === 1 ? 'Absender' : 'Absender'} ansehen`}</button></p>`;
  if (!auf) return `<section class="bl-abschnitt">${kopf}</section>`;
  const gruppeHtml = ([, liste]) => {
    const domain = liste[0].domain;
    const kannAbsender = !lesend && domain && !FREEMAIL.includes(domain);
    const zeilen = liste.map(b => zeile({
      titel: `${esc(ART_LABEL[b.art] || 'Schreiben')} · ${esc(fmtDate(b.datum))}`,
      kontext: `„${esc(b.betreff)}“${b.refs?.kommission ? ` · Kommission ${esc(b.refs.kommission)}` : ''}`,
      knoepfe: lesend ? gmailKnopf(b) : `<button type="button" class="btn btn-sm" data-bl-zuordnen="${esc(b.id)}">Zuordnen…</button>
        <button type="button" class="btn btn-sm btn-ghost" data-bl-keinshop="${esc(b.id)}">Kein Shop-Auftrag</button>${gmailKnopf(b)}`,
    })).join('');
    return `<li class="bl-gruppe"><div class="bl-gruppe-kopf"><span><b>${esc(absenderText(liste[0]))}</b> <span class="muted">· ${esc(plural(liste.length, 'Schreiben', 'Schreiben'))}</span></span>
      ${kannAbsender ? `<button type="button" class="btn btn-sm btn-ghost" data-bl-absender="${esc(domain)}" title="Schreiben dieses Absenders gehören nicht zu Shop-Bestellungen (z. B. Ladenware, Material)">Kein Shop-Lieferant</button>` : ''}</div>
      <ul class="bl-liste">${zeilen}</ul></li>`;
  };
  return `<section class="bl-abschnitt">${kopf}<ul class="bl-gruppen">${gruppen.map(gruppeHtml).join('')}</ul></section>`;
}

const HINWEIS = {
  storno: ['crit', 'Storno'],
  lieferschein_offen: ['warn', 'Lieferschein da, bei uns noch bestellt'],
  shopify_offen: ['warn', 'In Shopify noch nicht versendet'],
  shopify_weiter: ['warn', 'In Shopify schon versendet, bei uns noch bestellt'],
};

function belegZelle(kurz) {
  if (!kurz) return '<span class="muted">–</span>';
  const b = belegVon(kurz.id);
  const text = `${ART_KURZ[kurz.art] || ''} ${fmtDate(kurz.datum).slice(0, 6)}`.trim();
  return b?.viewUrl ? `<a href="${esc(b.viewUrl)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
}

function abgleichHtml(d) {
  const filter = ['abweichung', 'beleg'].includes(state.route.params.get('blf')) ? state.route.params.get('blf') : '';
  const mitAbw = d.zeilen.filter(z => z.hinweise.length);
  const mitBeleg = d.zeilen.filter(z => z.belege.length);
  const liste = filter === 'abweichung' ? mitAbw : filter === 'beleg' ? mitBeleg : d.zeilen;
  const seite = Math.max(1, Number(state.route.params.get('bls')) || 1);
  const seiten = Math.max(1, Math.ceil(liste.length / SEITE_AUFTRAG));
  const sichtbar = liste.slice((Math.min(seite, seiten) - 1) * SEITE_AUFTRAG, Math.min(seite, seiten) * SEITE_AUFTRAG);
  const chip = (wert, text, n, ton = '') => `<button type="button" class="chip" aria-pressed="${filter === wert}" data-param="blf" data-value="${wert}">${text} <span class="${n && ton ? ton : 'muted'}">${n}</span></button>`;
  const chips = `<div class="chips bl-chips" role="group" aria-label="Auswahl">
    ${chip('', 'Alle', d.zeilen.length)}${chip('beleg', 'Mit Schreiben', mitBeleg.length)}${chip('abweichung', 'Passt nicht zusammen', mitAbw.length, 'bl-warn')}
  </div>`;
  if (!d.zeilen.length) return `<section class="bl-abschnitt"><h2 class="section-title">Je Auftrag</h2>${emptyState('Noch keine Bestellung mit Lieferantenpost.', 'Sobald ein Lieferant eine Auftragsbestätigung oder einen Lieferschein mit unserer Bestellnummer schickt, steht er hier neben unserem Stand.')}</section>`;
  const rows = sichtbar.map(z => `<tr class="${z.hinweise.includes('storno') ? 'crit' : z.hinweise.length ? 'warn' : ''}">
      <td><a href="${esc(auftragLink(z.orderId))}">${esc(z.orderName)}</a>${z.kundenname ? `<div class="small muted">${esc(z.kundenname)}</div>` : ''}</td>
      <td>${esc(lieferantName(z.lieferant))}${z.nurMuster ? '<div class="small muted">Muster</div>' : ''}</td>
      <td>${z.bestelltAm ? esc(fmtDate(z.bestelltAm)) : '<span class="muted">–</span>'}</td>
      <td>${belegZelle(z.ab)}</td>
      <td>${belegZelle(z.lieferschein)}</td>
      <td>${esc(STAND_LABEL[z.stand] || z.stand)}</td>
      <td>${esc(SHOPIFY_LABEL[z.shopify] || (z.shopify ? z.shopify.toLowerCase() : '–'))}</td>
      <td>${z.hinweise.map(h => `<span class="bl-hinweis ${HINWEIS[h]?.[0] || ''}">${esc(HINWEIS[h]?.[1] || h)}</span>`).join(' ')}</td>
    </tr>`).join('');
  const blaettern = seiten > 1 ? `<div class="bl-blaettern">
      <button type="button" class="btn btn-sm" ${seite <= 1 ? 'disabled' : ''} data-param="bls" data-value="${seite - 1}">← Zurück</button>
      <span class="small muted">Seite ${Math.min(seite, seiten)} von ${seiten}</span>
      <button type="button" class="btn btn-sm" ${seite >= seiten ? 'disabled' : ''} data-param="bls" data-value="${seite + 1}">Weiter →</button></div>` : '';
  return `<section class="bl-abschnitt">
    <h2 class="section-title">Je Auftrag</h2>
    <p class="small muted">Bestellungen der letzten 45 Tage, die beim Lieferanten bestellt sind oder Post vom Lieferanten haben – Auftragsbestätigung und Lieferschein neben unserem Stand und Shopify.</p>
    ${chips}
    ${liste.length ? `<div class="table-scroll"><table class="bl-tabelle">
      <thead><tr><th>Auftrag</th><th>Lieferant</th><th>Bestellt</th><th>Auftrags&shy;bestätigung</th><th>Lieferschein</th><th>Bei uns</th><th>Shopify</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>${blaettern}` : '<p class="small muted">Alles passt zusammen.</p>'}
  </section>`;
}

function zuordnungText(b) {
  const z = b.zuordnung;
  if (z.stufe === 'kein_shop') return '<span class="muted">kein Shop-Auftrag</span>';
  if (z.stufe === 'keine') return '<span class="muted">ohne Bestellung</span>';
  const namen = esc(z.orderIds.map(auftragText).join(', '));
  return z.stufe === 'vorschlag' ? `<span class="muted">Vorschlag:</span> ${namen}` : namen;
}

function alleHtml(d) {
  const q = (state.route.params.get('blq') || '').trim().toLowerCase();
  const passt = b => !q || [b.betreff, absenderText(b), b.refs?.kommission, ART_LABEL[b.art], ...b.zuordnung.orderIds.map(auftragText)]
    .some(v => String(v || '').toLowerCase().includes(q));
  const liste = d.belege.filter(passt);
  const seite = Math.max(1, Number(state.route.params.get('blp')) || 1);
  const seiten = Math.max(1, Math.ceil(liste.length / SEITE));
  const s = Math.min(seite, seiten);
  const lesend = istNurLesend();
  const aktion = (b) => {
    if (lesend) return '';
    if (b.erledigt || Object.keys(b.quittiert || {}).length) return `<button type="button" class="btn btn-sm btn-ghost" data-bl-wieder="${esc(b.id)}">Wieder offen</button>`;
    if (['bestaetigt', 'kein_shop'].includes(b.zuordnung.stufe) && b.entscheidung) return `<button type="button" class="btn btn-sm btn-ghost" data-bl-loesen="${esc(b.id)}" title="Entscheidung zurücknehmen">Zuordnung lösen</button>`;
    if (b.zuordnung.stufe === 'keine') return `<button type="button" class="btn btn-sm btn-ghost" data-bl-zuordnen="${esc(b.id)}">Zuordnen…</button>`;
    return '';
  };
  const zeilen = liste.slice((s - 1) * SEITE, s * SEITE).map(b => `<li class="bl-beleg">
      <div class="bl-beleg-kopf"><span class="bl-art bl-art-${esc(b.art)}">${esc(ART_KURZ[b.art] || b.art)}</span>
        <span>${esc(fmtDate(b.datum))} · ${esc(absenderText(b))}</span>${b.erledigt ? `<span class="small muted">erledigt von ${esc(b.erledigt.von)}</span>` : Object.keys(b.quittiert || {}).length ? `<span class="small muted">erledigt für ${esc(Object.keys(b.quittiert).map(auftragText).join(', '))}</span>` : ''}</div>
      <div class="bl-betreff">${esc(b.betreff || '(ohne Betreff)')}</div>
      <div class="bl-beleg-fuss"><span class="small">${zuordnungText(b)}</span><span class="bl-knoepfe">${aktion(b)}${gmailKnopf(b)}</span></div>
    </li>`).join('');
  const blaettern = seiten > 1 ? `<div class="bl-blaettern">
      <button type="button" class="btn btn-sm" ${s <= 1 ? 'disabled' : ''} data-param="blp" data-value="${s - 1}">← Zurück</button>
      <span class="small muted">Seite ${s} von ${seiten}</span>
      <button type="button" class="btn btn-sm" ${s >= seiten ? 'disabled' : ''} data-param="blp" data-value="${s + 1}">Weiter →</button></div>` : '';
  // Zugeklappt (Parameter bla), solange niemand sucht - die Arbeit steht weiter oben.
  const auf = Boolean(state.route.params.get('bla')) || Boolean(q);
  if (!auf) {
    return `<section class="bl-abschnitt"><h2 class="section-title">Alle Schreiben <span class="muted">${d.belege.length}</span></h2>
      <p class="small muted bl-ohne-text">Jedes erkannte Schreiben mit Absender, Zuordnung und Link ins Postfach.
      <button type="button" class="heute-hg-knopf" data-param="bla" data-value="1" aria-expanded="false">Ansehen und suchen</button></p></section>`;
  }
  return `<section class="bl-abschnitt">
    <h2 class="section-title">Alle Schreiben <span class="muted">${d.belege.length}</span>
      <button type="button" class="heute-hg-knopf" data-param="bla" data-value="" aria-expanded="true">Zuklappen</button></h2>
    <div class="toolbar"><input type="search" autocomplete="off" placeholder="Betreff, Lieferant, Kunde oder #Nummer" value="${esc(state.route.params.get('blq') || '')}" data-param="blq" aria-label="Lieferantenpost durchsuchen"></div>
    ${liste.length ? `<ul class="bl-belege">${zeilen}</ul>${blaettern}` : `<p class="small muted">${d.belege.length ? `Nichts passt zu „${esc(q)}“.` : 'Noch keine Lieferantenpost.'}</p>`}
  </section>`;
}

export function viewEinkaufBelege() {
  ensureBelege();
  const d = belege.daten;
  if (!d && belege.laedt) return '<div class="empty">Lade Lieferantenpost …</div>';
  if (d?.fehler) return stoerungState(d, 'Die Lieferantenpost');
  if (!d || !d.verfuegbar) return emptyState('Lieferantenpost nicht verfügbar.', d?.hinweis || '');
  const arbeit = belegArbeit(d);
  const lauf = laufStand(d);
  const kopf = `<div class="bl-kopf">
    <p class="small muted">Auftragsbestätigungen, Lieferscheine und Stornos aus dem Lieferantenpostfach, zugeordnet zu unseren Bestellungen. Ein Schreiben ändert nichts von selbst – den Schritt setzt ihr unter „Je Auftrag“.</p>
    <p class="bl-lauf${lauf.ton ? ` ${lauf.ton}` : ''}">${esc(lauf.text)}</p>
  </div>`;
  const zuPruefen = arbeit.summe ? `<section class="bl-abschnitt">
      <h2 class="section-title">Zu prüfen <span class="bl-zahl">${arbeit.summe}</span></h2>
      <ul class="bl-liste">${arbeit.abweichungen.map(abweichungHtml).join('')}${arbeit.vorschlaege.map(vorschlagHtml).join('')}</ul>
    </section>` : `<section class="bl-abschnitt"><h2 class="section-title">Zu prüfen</h2><p class="small muted">Nichts offen – kein Storno, kein Lieferschein ohne Haken, kein offener Vorschlag.</p></section>`;
  return `${kopf}${zuPruefen}${abgleichHtml(d)}${ohneHtml(arbeit.ohne)}${alleHtml(d)}`;
}

// -- Schreiben ---------------------------------------------------------------------

async function schreibe(body) {
  try {
    const r = await fetch('/api/einkauf/belege', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, text: j.error || `Fehler ${r.status}` };
    return { ok: true, ...j };
  } catch (e) { return { ok: false, text: `Keine Verbindung zum Dashboard (${e.message})` }; }
}

async function aktion(knopf, body, meldung) {
  knopf.disabled = true;
  const r = await schreibe(body);
  if (!r.ok) { toast(r.text, 'crit', { dauer: 9000 }); knopf.disabled = false; return false; }
  uebernimm(r);
  toast(meldung);
  render();
  return true;
}

/** Die Antwort eines Schreibvorgangs traegt den neuen Stand - kein zweiter Abruf. */
function uebernimm(r) {
  const daten = { ...r };
  delete daten.ok;
  belege.daten = daten;
  belege.geladenAm = Date.now();
}

/**
 * "Zuordnen…": Bestellung suchen und waehlen - zuerst die mit Positionen dieses Lieferanten.
 * Mit `nur` (Vorschlag mit mehreren Bestellungen): diese Kandidaten zum Ankreuzen - es sind
 * Alternativen, kein Sammelbeleg, solange niemand mehrere ankreuzt (Codex-Review #1432).
 * Ist der Absender unbekannt und hat die Bestellung mehrere Lieferanten, fragt der Dialog, von
 * welchem der Beleg ist - sonst haengt er an keiner Zeile im Abgleich.
 */
function oeffneZuordnen(b, { nur = null } = {}) {
  const auswahl = belege.daten?.auswahl || [];
  const vorne = b.lieferant ? auswahl.filter(a => a.lieferanten.includes(b.lieferant)) : [];
  const liste = [...vorne, ...auswahl.filter(a => !vorne.includes(a))];
  const lieferantenVon = id => auswahl.find(a => a.orderId === id)?.lieferanten || [];
  const text = a => `${a.orderName} ${a.kundenname || ''} · ${a.lieferanten.map(lieferantName).join(', ')}`.trim();
  const option = a => `<option value="${esc(a.orderId)}">${esc(text(a))}</option>`;
  const kandidaten = nur ? nur.map(id => auswahl.find(a => a.orderId === id) || { orderId: id, orderName: auftrag(id)?.orderName || 'Bestellung', kundenname: auftrag(id)?.kundenname || '', lieferanten: [] }) : null;
  const wahlFeld = kandidaten
    ? `<fieldset class="bl-kandidaten"><legend>Zu welcher Bestellung gehört er?</legend>
        ${kandidaten.map(a => `<label><input type="checkbox" name="orderId" value="${esc(a.orderId)}"> <span>${esc(text(a))}</span></label>`).join('')}
        <span class="hint">Nur ankreuzen, was wirklich dazugehört – meist genau eine.</span></fieldset>`
    : `<div class="field"><label for="blSuche">Bestellung suchen</label>
        <input id="blSuche" type="search" autocomplete="off" placeholder="#Nummer oder Kundenname" value="${esc(b.refs?.kommission || '')}"></div>
      <div class="field"><label for="blWahl">Bestellung</label>
        <select id="blWahl" name="orderId" size="8" required>${liste.map(option).join('')}</select>
        <span class="hint">${vorne.length ? 'Oben die Bestellungen mit Ware dieses Lieferanten.' : 'Bestellungen der letzten 120 Tage.'}</span></div>`;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog bl-dialog" role="dialog" aria-modal="true" aria-labelledby="blTitel" data-dialog novalidate>
    <h2 id="blTitel">Zu welcher Bestellung?</h2>
    <p class="small muted">${esc(ART_LABEL[b.art] || 'Schreiben')} von ${esc(absenderText(b))} vom ${esc(fmtDate(b.datum))}:<br>„${esc(b.betreff)}“</p>
    ${b.auszug ? `<p class="bl-auszug">${esc(b.auszug)}</p>` : ''}
    ${wahlFeld}
    ${b.lieferant ? '' : `<div class="field" data-bl-lieferant-feld hidden><label for="blLieferant">Von welchem Lieferanten?</label>
      <select id="blLieferant" name="lieferant"></select>
      <span class="hint">Die Bestellung hat Ware von mehreren Lieferanten, der Absender ist keinem zugeordnet – steht meist im Briefkopf der Mail.</span></div>`}
    <p data-bl-meldung hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Zuordnen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const gewaehlt = () => (kandidaten ? [...form.querySelectorAll('input[name=orderId]:checked')].map(x => x.value) : [form.querySelector('#blWahl')?.value].filter(Boolean));
  const feld = form.querySelector('[data-bl-lieferant-feld]');
  const lieferantWahl = form.querySelector('#blLieferant');
  // Pflicht, sobald eine gewaehlte Bestellung mehrere Lieferanten hat; zur Wahl stehen die, die
  // alle gewaehlten Bestellungen beliefern. Eine getroffene Wahl bleibt beim Neuaufbau stehen.
  let gemeinsam = [];
  const lieferantAktualisieren = () => {
    if (!feld) return;
    const je = gewaehlt().map(lieferantenVon);
    gemeinsam = je.length ? je.reduce((a, l) => a.filter(x => l.includes(x))) : [];
    const vorher = lieferantWahl.value;
    feld.hidden = !je.some(l => l.length > 1);
    lieferantWahl.innerHTML = `<option value="">– bitte wählen –</option>${gemeinsam.map(id => `<option value="${esc(id)}">${esc(lieferantName(id))}</option>`).join('')}`;
    if (gemeinsam.includes(vorher)) lieferantWahl.value = vorher;
  };
  if (kandidaten) {
    form.addEventListener('change', (ev) => { if (ev.target.name === 'orderId') lieferantAktualisieren(); });
    form.querySelector('input[name=orderId]')?.focus();
  } else {
    const suche = form.querySelector('#blSuche');
    const wahl = form.querySelector('#blWahl');
    const filtern = () => {
      const worte = suche.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const treffer = liste.filter(a => worte.every(w => `${a.orderName} ${a.kundenname || ''}`.toLowerCase().includes(w)));
      // Kein Treffer fuer den vorbelegten Kommissionstext: lieber alles zeigen als eine leere Liste.
      wahl.innerHTML = (treffer.length ? treffer : liste).map(option).join('');
      if (wahl.options.length) wahl.selectedIndex = 0;
      lieferantAktualisieren();
    };
    suche.addEventListener('input', filtern);
    wahl.addEventListener('change', lieferantAktualisieren);
    filtern();
    suche.focus();
  }
  lieferantAktualisieren();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const ids = gewaehlt();
    const m = form.querySelector('[data-bl-meldung]');
    const lieferant = feld && !feld.hidden ? lieferantWahl.value : '';
    const fehlt = !ids.length ? 'Bitte eine Bestellung wählen.'
      : feld && !feld.hidden && !lieferant ? (gemeinsam.length ? 'Bitte wählen, von welchem Lieferanten das Schreiben ist.' : 'Diese Bestellungen haben keinen gemeinsamen Lieferanten – bitte nur die passende ankreuzen.')
        : null;
    if (fehlt) { m.className = 'notice warn'; m.textContent = fehlt; m.hidden = false; return; }
    const knopf = form.querySelector('button[type=submit]');
    knopf.disabled = true;
    const r = await schreibe({ aktion: 'zuordnen', mailId: b.id, orderIds: ids, ...(lieferant ? { lieferant } : {}) });
    if (!r.ok) {
      m.className = 'notice crit'; m.textContent = r.text; m.hidden = false; knopf.disabled = false;
      return;
    }
    uebernimm(r);
    $('#dialogRoot').innerHTML = '';
    toast(`Zugeordnet: ${ids.map(auftragText).join(', ')}`);
    render();
  });
}

/** Klicks der Ansicht. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function einkaufKlickBelege(ev) {
  const k = ev.target.closest('[data-bl-erledigt], [data-bl-annehmen], [data-bl-waehlen], [data-bl-ablehnen], [data-bl-keinshop], [data-bl-zuordnen], [data-bl-loesen], [data-bl-wieder], [data-bl-absender]');
  if (!k) return false;
  const ds = k.dataset;
  if (ds.blAbsender) {
    if (!window.confirm(`Schreiben von ${ds.blAbsender} gehören nicht zu Shop-Bestellungen? Sie stehen dann nicht mehr unter „Zu prüfen“ (außer mit einer Bestellnummer im Betreff).`)) return true;
    aktion(k, { aktion: 'absender_kein_shop', domain: ds.blAbsender }, `${ds.blAbsender}: kein Shop-Lieferant`);
    return true;
  }
  const id = ds.blErledigt || ds.blAnnehmen || ds.blWaehlen || ds.blAblehnen || ds.blKeinshop || ds.blZuordnen || ds.blLoesen || ds.blWieder;
  const b = belegVon(id);
  if (!b) return true;
  if (ds.blZuordnen) { oeffneZuordnen(b); return true; }
  if (ds.blWaehlen) { oeffneZuordnen(b, { nur: b.zuordnung.orderIds }); return true; }
  // Erledigt an einer Abweichung gilt fuer diese Bestellung (ein Sammelbeleg kann mehrere betreffen).
  if (ds.blErledigt) aktion(k, { aktion: 'erledigt', mailId: id, ...(ds.blOrder ? { orderId: ds.blOrder } : {}) }, 'Erledigt');
  else if (ds.blAnnehmen) {
    // Ein Vorschlag mit einer Bestellung: ein Klick. Unbekannter Absender und mehrere Lieferanten: Dialog.
    const id0 = b.zuordnung.orderIds[0];
    const mehrere = (belege.daten?.auswahl?.find(a => a.orderId === id0)?.lieferanten || []).length > 1;
    if (!b.lieferant && mehrere) { oeffneZuordnen(b, { nur: b.zuordnung.orderIds }); return true; }
    aktion(k, { aktion: 'zuordnen', mailId: id, orderIds: [id0] }, `Zugeordnet: ${auftragText(id0)}`);
  }
  else if (ds.blAblehnen) aktion(k, { aktion: 'ablehnen', mailId: id, orderIds: b.zuordnung.orderIds }, 'Vorschlag verworfen – das Schreiben steht jetzt ohne Bestellung da');
  else if (ds.blKeinshop) aktion(k, { aktion: 'kein_shop', mailId: id }, 'Als kein Shop-Auftrag markiert');
  else if (ds.blLoesen) aktion(k, { aktion: 'loesen', mailId: id }, 'Zuordnung gelöst');
  else if (ds.blWieder) aktion(k, { aktion: 'wieder_offen', mailId: id }, 'Wieder offen');
  return true;
}
