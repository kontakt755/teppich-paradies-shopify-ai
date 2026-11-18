/**
 * Kunden, Reiter "Angebote" (Entwurfsbestellungen) und "Warenkoerbe" (liegengeblieben).
 * Beides ist Geld, das schon im Haus war - ein Mitarbeiter soll
 * sehen, wer wartet, worauf, und wie er denjenigen erreicht.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, geldText, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { angebotAdminLink, angebotNachricht, angebotVollstaendig, whatsappLink } from '../../lib/angebot-nachricht.mjs';
import { kunden } from './gemeinsam.mjs';

export function ensureKundenAngebote() {
  if (kunden.angebote || kunden.loadingAngebote) return;
  kunden.loadingAngebote = true;
  fetchEinkauf('/api/angebote/liste').then(d => {
    kunden.angebote = d; kunden.loadingAngebote = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

export function ensureLexwareAngebote() {
  if (kunden.lexware || kunden.loadingLexware) return;
  kunden.loadingLexware = true;
  fetchEinkauf('/api/angebote/lexware').then(d => {
    kunden.lexware = d; kunden.loadingLexware = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

/** Zahl am Reiter: heute faellige Lexware-Angebote (dieselbe Menge wie der Block darunter). */
export function lexwareFaelligAnzahl() {
  return (kunden.lexware?.zeilen || []).filter(z => z.faellig).length;
}

const NACHFASS_LABEL = { offen: 'Offen', nicht_erreicht: 'Nicht erreicht', angerufen: 'Angerufen', erledigt: 'Erledigt' };

function lexwareZeile(z) {
  const stand = z.status !== 'offen' ? `<span class="small muted">${esc(NACHFASS_LABEL[z.status] || z.status)}${z.aktualisiertVon ? ` von ${esc(z.aktualisiertVon)}` : ''}${z.aktualisiertAm ? `, ${esc(fmtDateTime(z.aktualisiertAm))}` : ''}</span>` : '';
  const knoepfe = istNurLesend() ? '' : ['nicht_erreicht', 'angerufen', 'erledigt'].map(s => `<button type="button" class="btn btn-sm${z.status === s ? ' btn-primary' : ' btn-ghost'}" data-lexware-nachfass="${esc(z.id)}" data-status="${s}">${esc(NACHFASS_LABEL[s])}</button>`).join('');
  return `<div class="row">
    <div>
      <div class="t">${esc(z.nummer)} · ${esc(z.kunde || 'ohne Kundennamen')} ${z.faellig ? '<span class="badge gap">nachfassen</span>' : ''}</div>
      <div class="m">vom ${esc(fmtDate(z.datum))} · seit ${z.alterTage} ${z.alterTage === 1 ? 'Tag' : 'Tagen'} ohne Rückmeldung</div>
      ${stand ? `<div>${stand}</div>` : ''}
    </div>
    <div class="r">
      <div class="t">${betragText(z.betrag, z.waehrung)}</div>
      ${z.url ? `<a class="btn btn-sm" href="${esc(z.url)}" target="_blank" rel="noopener" title="Kontakt und Telefonnummer stehen im Angebot">In Lexware öffnen ↗</a>` : ''}
    </div>
    ${knoepfe ? `<div class="r" style="grid-column:1 / -1">${knoepfe}</div>` : ''}
  </div>`;
}

/**
 * Offene Lexware-Angebote (w-351): ab Tag 5 anrufen, nach einem Anruf ab Tag 12 noch einmal.
 * Angenommene oder abgelehnte Angebote fallen beim naechsten Abruf von selbst heraus.
 */
function lexwareBlock() {
  ensureLexwareAngebote();
  const d = kunden.lexware;
  if (!d && kunden.loadingLexware) return `<div class="empty">Lade Lexware-Angebote …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Lexware-Angebote');
  if (!d || !d.verfuegbar) return emptyState('Noch keine Lexware-Angebote abgerufen.', d?.hinweis || '');
  const offen = d.zeilen.filter(z => z.status !== 'erledigt');
  const faellig = offen.filter(z => z.faellig);
  const rest = offen.filter(z => !z.faellig);
  const summe = faellig.reduce((s, z) => s + (z.betrag || 0), 0);
  return `
    <h2 style="margin:0 0 6px">Lexware-Angebote nachfassen</h2>
    <p class="small muted" style="margin:0 0 10px">Offene Angebote aus Lexware, Stand ${esc(fmtDateTime(d.stand))}. Ab 5 Tagen ohne Rückmeldung anrufen, nach einem Anruf ab Tag 12 noch einmal.${faellig.length ? ` Heute ${faellig.length} dran, zusammen ${geldText({ betrag: summe })}.` : ''}</p>
    <div class="rows">${faellig.length ? faellig.map(lexwareZeile).join('') : emptyState('Heute ist kein Angebot zum Nachfassen dran.', '')}</div>
    ${rest.length ? `<details style="margin-top:10px"><summary>${rest.length} weitere offene Angebote (noch nicht dran)</summary><div class="rows">${rest.map(lexwareZeile).join('')}</div></details>` : ''}`;
}

async function lexwareNachfassSetzen(id, status) {
  try {
    const r = await fetch('/api/angebote/lexware', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return; }
    // Faelligkeit rechnet der Server; neu laden statt im Browser nachrechnen.
    kunden.lexware = null;
    ensureLexwareAngebote();
    toast(`Angebot: ${NACHFASS_LABEL[status]}`);
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); }
}

export function lexwareKlick(e) {
  const b = e.target.closest('[data-lexware-nachfass]');
  if (!b) return false;
  e.preventDefault();
  lexwareNachfassSetzen(b.dataset.lexwareNachfass, b.dataset.status);
  return true;
}

export function ensureKundenWarenkoerbe() {
  if (kunden.warenkoerbe || kunden.loadingWarenkoerbe) return;
  kunden.loadingWarenkoerbe = true;
  fetchEinkauf('/api/warenkoerbe/liste').then(d => {
    kunden.warenkoerbe = d; kunden.loadingWarenkoerbe = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

/** Wie lange liegt das schon? Alter in Tagen, ab 14 Tagen hervorgehoben. */
function liegtSeit(iso) {
  if (!iso) return '';
  const tage = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(tage)) return '';
  const text = tage === 0 ? 'heute' : tage === 1 ? 'seit gestern' : `seit ${tage} Tagen`;
  return tage >= 14 ? `<span class="badge gap">${esc(text)}</span>` : `<span class="small muted">${esc(text)}</span>`;
}

function kontaktZeile(k) {
  const teile = [];
  if (k.email) teile.push(`<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>`);
  if (k.telefon) teile.push(`<a href="tel:${esc(String(k.telefon).replace(/\s/g, ''))}">${esc(k.telefon)}</a>`);
  return teile.length ? teile.join(' · ') : '<span class="muted">keine Kontaktdaten hinterlegt</span>';
}

function positionenKurz(positionen) {
  const liste = (positionen || []).map(p => `${p.menge}× ${p.titel}${p.variante ? ` (${p.variante})` : ''}`);
  if (!liste.length) return '<span class="muted">keine Positionen</span>';
  return esc(liste.slice(0, 3).join(' · ')) + (liste.length > 3 ? ` <span class="muted">+${liste.length - 3} weitere</span>` : '');
}

function betragText(betrag, waehrung) {
  return geldText({ betrag, waehrung });
}

/** Antwort per WhatsApp: Text und Link kommen fertig, abschicken tut immer der Mitarbeiter. */
function whatsappKnoepfe(a, konto) {
  if (!ANGEBOT_OFFEN.has(a.status) || istNurLesend() || !angebotVollstaendig(a)) return '';
  const admin = angebotAdminLink(a.id);
  const adminKnopf = admin ? `<a class="btn btn-sm" href="${esc(admin)}" target="_blank" rel="noopener" title="Nach dem Geldeingang dort als bezahlt markieren">In Shopify öffnen ↗</a>` : '';
  const text = angebotNachricht(a, konto);
  // Eigene Zeile ueber die volle Breite: rechts neben dem Text quetschten vier Knoepfe die Kundenangaben.
  const zeile = inhalt => `<div class="r" style="grid-column:1 / -1">${inhalt}</div>`;
  if (!text) return adminKnopf && zeile(adminKnopf);
  const link = whatsappLink(a.telefon, text);
  return zeile(`${a.versandEingetragen ? '' : '<span class="small muted">Kein Versand im Angebot eingetragen. Betrag vor dem Senden prüfen.</span>'}
      ${link ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">In WhatsApp öffnen ↗</a>` : ''}
      <button type="button" class="btn btn-sm" data-kopiertext="${esc(text)}">Text kopieren</button>
      ${adminKnopf}`);
}

function angebotZeile(a, konto) {
  return `<div class="row">
    <div>
      <div class="t">${esc(a.nummer)} · ${esc(a.kunde || 'ohne Kundennamen')} ${liegtSeit(a.erstelltAm)}</div>
      <div class="m">${positionenKurz(a.positionen)}</div>
      <div class="small">${kontaktZeile(a)}</div>
    </div>
    <div class="r">
      <div class="t">${betragText(a.betrag, a.waehrung)}</div>
      <div class="m">${esc(ANGEBOT_STATUS_TEXT[a.status] || a.status || 'Status unbekannt')}</div>
      ${a.rechnungUrl ? `<a class="btn btn-sm" href="${esc(a.rechnungUrl)}" target="_blank" rel="noopener">Angebot öffnen ↗</a>` : ''}
    </div>
    ${whatsappKnoepfe(a, konto)}
  </div>`;
}

// Offen heisst: der Kunde wartet. Ein verschicktes Angebot (INVOICE_SENT) ist
// genauso offen wie ein angelegtes - es lag sonst im zugeklappten Block
// "erledigte Angebote" (operations/lib/angebote.mjs zaehlt beide als offen).
const ANGEBOT_OFFEN = new Set(['OPEN', 'INVOICE_SENT']);
const ANGEBOT_STATUS_TEXT = {
  OPEN: 'offen – Kunde wartet',
  INVOICE_SENT: 'Angebot verschickt – Kunde hat noch nicht bezahlt',
  COMPLETED: 'in Bestellung umgewandelt',
};

export function viewKundenAngebote() {
  ensureKundenAngebote();
  const d = kunden.angebote;
  if (!d && kunden.loadingAngebote) return `<div class="empty">Lade Angebote …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Angebote');
  const lexware = lexwareBlock();
  if (!d || !d.verfuegbar) return lexware;
  const offen = (d.angebote || []).filter(a => ANGEBOT_OFFEN.has(a.status));
  const rest = (d.angebote || []).filter(a => !ANGEBOT_OFFEN.has(a.status));
  return `${lexware}
    <h2 style="margin:22px 0 6px">Shop-Angebote</h2>
    <p class="small muted" style="margin:0 0 10px">Angebote sind Entwurfsbestellungen aus Shopify. „Offen" heißt: verschickt oder angelegt, aber noch nicht bezahlt – dort wartet jemand auf eine Antwort.</p>
    ${offen.length && !d.kontodaten && !istNurLesend() ? '<p class="notice warn">Für den WhatsApp-Text fehlen die Kontodaten oder die IBAN stimmt nicht. Bitte den Inhaber fragen.</p>' : ''}
    <div class="rows">${offen.length ? offen.map(a => angebotZeile(a, d.kontodaten)).join('') : emptyState('Kein offenes Angebot.', 'Nichts zu tun.')}</div>
    ${rest.length ? `<details style="margin-top:14px"><summary>${rest.length} erledigte Angebote</summary><div class="rows">${rest.map(a => angebotZeile(a, null)).join('')}</div></details>` : ''}`;
}

function warenkorbZeile(w) {
  return `<div class="row">
    <div>
      <div class="t">${esc(w.kunde || 'ohne Namen')} ${liegtSeit(w.zeitpunkt)}</div>
      <div class="m">${positionenKurz(w.positionen)}</div>
      <div class="small">${kontaktZeile(w)}</div>
    </div>
    <div class="r">
      <div class="t">${betragText(w.wert, w.waehrung)}</div>
      ${w.wiederhergestelltUrl ? `<a class="btn btn-sm" href="${esc(w.wiederhergestelltUrl)}" target="_blank" rel="noopener">Warenkorb öffnen ↗</a>` : '<div class="m">kein Wiederherstellungs-Link</div>'}
    </div>
  </div>`;
}

export function viewKundenWarenkoerbe() {
  ensureKundenWarenkoerbe();
  const d = kunden.warenkoerbe;
  if (!d && kunden.loadingWarenkoerbe) return `<div class="empty">Lade Warenkörbe …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Warenkörbe');
  if (!d || !d.verfuegbar) return emptyState('Keine Warenkörbe exportiert.', d?.hinweis || 'Daten aktualisieren (braucht den Shopify-Zugang).');
  const liste = [...(d.warenkoerbe || [])].sort((a, b) => (b.wert || 0) - (a.wert || 0));
  const summe = liste.reduce((s, w) => s + (w.wert || 0), 0);
  return `
    <p class="small muted" style="margin:0 0 10px">Kunden, die den Kauf abgebrochen haben – nach Wert sortiert, zusammen ${geldText({ betrag: summe })}. Anrufen oder anschreiben lohnt sich meist bei den obersten.${d.testAusgeblendet ? ` ${d.testAusgeblendet === 1 ? 'Ein Testkauf ist' : `${d.testAusgeblendet} Testkäufe sind`} ausgeblendet.` : ''}</p>
    <div class="rows">${liste.length ? liste.map(warenkorbZeile).join('') : emptyState('Kein liegengebliebener Warenkorb.', '')}</div>`;
}
