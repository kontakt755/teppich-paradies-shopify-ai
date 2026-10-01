/**
 * Kunden, Reiter "Angebote" (Entwurfsbestellungen) und "Warenkoerbe" (liegengeblieben).
 * Beides ist Geld, das schon im Haus war - ein Mitarbeiter soll
 * sehen, wer wartet, worauf, und wie er denjenigen erreicht.
 */
import { state } from '../../kern/zustand.mjs';
import { esc } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { kunden } from './gemeinsam.mjs';

export function ensureKundenAngebote() {
  if (kunden.angebote || kunden.loadingAngebote) return;
  kunden.loadingAngebote = true;
  fetchEinkauf('/api/angebote/liste').then(d => {
    kunden.angebote = d; kunden.loadingAngebote = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
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
  const zahl = Number(betrag);
  return `${Number.isFinite(zahl) ? zahl.toFixed(2) : '–'} ${esc(waehrung || 'EUR')}`;
}

function angebotZeile(a) {
  const offen = ANGEBOT_OFFEN.has(a.status);
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
  if (!d || !d.verfuegbar) return emptyState('Keine Angebote exportiert.', d?.hinweis || 'Daten aktualisieren (braucht den Shopify-Zugang).');
  const offen = (d.angebote || []).filter(a => ANGEBOT_OFFEN.has(a.status));
  const rest = (d.angebote || []).filter(a => !ANGEBOT_OFFEN.has(a.status));
  return `
    <p class="small muted" style="margin:0 0 10px">Angebote sind Entwurfsbestellungen aus Shopify. „Offen" heißt: verschickt oder angelegt, aber noch nicht bezahlt – dort wartet jemand auf eine Antwort.</p>
    <div class="rows">${offen.length ? offen.map(angebotZeile).join('') : emptyState('Kein offenes Angebot.', 'Nichts zu tun.')}</div>
    ${rest.length ? `<details style="margin-top:14px"><summary>${rest.length} erledigte Angebote</summary><div class="rows">${rest.map(angebotZeile).join('')}</div></details>` : ''}`;
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
    <p class="small muted" style="margin:0 0 10px">Kunden, die den Kauf abgebrochen haben – nach Wert sortiert, zusammen ${esc(summe.toFixed(2))} €. Anrufen oder anschreiben lohnt sich meist bei den obersten.</p>
    <div class="rows">${liste.length ? liste.map(warenkorbZeile).join('') : emptyState('Kein liegengebliebener Warenkorb.', '')}</div>`;
}
