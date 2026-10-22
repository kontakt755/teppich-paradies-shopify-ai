/**
 * Kunden, Reiter "Muster packen" (#1572): offene, bezahlte Musterbestellungen je Kunde in
 * Packreihenfolge. Je Muster: was auf dem Lieferantenmuster steht (vorher) und welcher Aufkleber
 * darauf kommt (nachher). Aufkleber drucken (Muster, danach die Adresse), abhaken, "Gepackt".
 * Grossbrief kann vorbereitet werden; Portokauf und Versandbuchung bleiben getrennt.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDateTime, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { oeffneEtikettenDruck } from '../../bausteine/etiketten-druck.mjs';
import { STAND_TEXT, WARTET_AB_TAGEN, aufkleberFuer } from '../../lib/muster-packen.mjs';
import { kunden } from './gemeinsam.mjs';
import { oeffneGrossbriefVorbereitung } from './muster-grossbrief.mjs';

const ENDPOINT = '/api/kunden/muster-packen';
// Abhaken ist eine Packhilfe an diesem Geraet; "Gepackt" ist der gemeinsame Stand.
const HAKEN_SPEICHER = 'tp-muster-packen-haken';

export function ensureMusterPacken() {
  if (kunden.musterPacken || kunden.loadingMusterPacken) return;
  kunden.loadingMusterPacken = true;
  fetchEinkauf(ENDPOINT).then(d => {
    kunden.musterPacken = d; kunden.loadingMusterPacken = false;
    if (state.route.view === 'kunden') render();
  });
}

/** Zahl am Reiter: Kunden, deren Umschlag noch nicht gepackt ist (dieselbe Menge wie die Liste). */
export function musterPackenOffen() { return kunden.musterPacken?.verfuegbar ? kunden.musterPacken.offen || 0 : 0; }

function haken() { try { return JSON.parse(localStorage.getItem(HAKEN_SPEICHER) || '{}') || {}; } catch { return {}; } }
function hakenSetzen(id, an) {
  const h = haken();
  if (an) h[id] = 1; else delete h[id];
  try { localStorage.setItem(HAKEN_SPEICHER, JSON.stringify(h)); } catch { /* gilt nur bis zum Neuladen */ }
}

const adresseText = a => [a?.strasse, [a?.plz, a?.ort].filter(Boolean).join(' ')].filter(v => v && v !== '–').join(', ');

function zeileHtml(m, mehrereBestellungen, h) {
  const e = m.etikett || {};
  const v = m.vorher || {};
  const auf = v.produktname || m.bestellt.titel;
  const stand = STAND_TEXT[m.stand] || '';
  const link = v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener">Lieferantenseite</a>` : '';
  return `<li class="mp-zeile">
    <label class="mp-haken"><input type="checkbox" data-mp-haken="${esc(m.lineItemId)}"${h[m.lineItemId] ? ' checked' : ''}><span class="visually-hidden">${esc(`${e.serie || auf} ${e.farbe || ''} überklebt`)}</span></label>
    <div class="mp-vorher"><span class="mp-etikett">Auf dem Muster</span><span>${esc(auf)}</span>${v.farbnummer ? `<span class="mp-farbnr">Farbnr. ${esc(v.farbnummer)}</span>` : ''}</div>
    <div class="mp-pfeil" aria-hidden="true">→</div>
    <div class="mp-nachher"><span class="mp-etikett">Unser Aufkleber</span>${m.fehlt.length
      ? `<span class="mp-fehlt">Zuordnung fehlt: ${esc(m.bestellt.titel)}${m.bestellt.farbe ? ` – ${esc(m.bestellt.farbe)}` : ''}</span>`
      : `<span><strong>${esc(e.serie)}</strong> · ${esc(e.farbe)}</span><span class="mp-sku">${esc(e.sku)}</span>`}</div>
    <div class="mp-stand small">${mehrereBestellungen ? `${esc(m.orderName)} · ` : ''}${m.anzahl > 1 ? `${m.anzahl} Stück · ` : ''}<span class="${m.stand === 'offen' ? 'wait-warn' : 'muted'}">${esc(stand)}</span>${link}</div>
  </li>`;
}

function kundeHtml(k, nr, h) {
  const lesend = istNurLesend();
  const mehrere = k.bestellungen.length > 1;
  const nummern = k.bestellungen.map(b => b.orderName).join(' · ');
  const tage = k.wartetTage;
  const druckbar = !k.fehlt.length;
  return `<article class="mp-kunde${k.gepackt ? ' mp-gepackt' : ''}" aria-labelledby="mp-k${nr}">
    <header class="mp-kopf">
      <div class="mp-wer">
        <h3 id="mp-k${nr}">${k.gepackt ? '' : `<span class="mp-pos">${nr}</span>`}${esc(k.name)}</h3>
        <div class="small muted">${esc(adresseText(k.adresse))}</div>
      </div>
      <div class="mp-meta">
        <strong class="mp-nr">${mehrere ? 'Bestellungen' : 'Bestellung'} ${esc(nummern)}</strong>
        ${tage === null ? '' : `<span class="${tage >= WARTET_AB_TAGEN && !k.gepackt ? 'wait-warn' : 'small muted'}">${tage === 0 ? 'seit heute' : `wartet seit ${plural(tage, 'Tag', 'Tagen')}`}</span>`}
      </div>
    </header>
    ${k.fehlt.length ? `<p class="notice warn">Für ${esc(k.fehlt.join('; '))} gibt es keinen eindeutigen Aufkleber. Bitte im Lexikon prüfen – bis dahin druckt dieser Kunde nicht mit.</p>` : ''}
    ${k.nichtBestellt ? `<p class="small wait-warn">${plural(k.nichtBestellt, 'Muster ist', 'Muster sind')} noch nicht beim Lieferanten bestellt.</p>` : ''}
    <ul class="mp-liste">${k.muster.map(m => zeileHtml(m, mehrere, h)).join('')}</ul>
    <div class="mp-aktionen">
      ${k.gepackt
        ? `<span class="small muted">Gepackt ${esc(fmtDateTime(k.gepackt.zeit))}${k.gepackt.von ? ` · ${esc(k.gepackt.von)}` : ''}</span>
           ${lesend ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-mp-gepackt="${esc(k.packSchluessel)}" data-mp-wert="0">Zurücknehmen</button>`}`
        : `<button type="button" class="btn btn-sm" data-mp-drucken="${esc(k.packSchluessel)}"${druckbar ? '' : ' disabled'}>Aufkleber drucken (${k.aufkleber})</button>
           ${lesend ? '' : `<button type="button" class="btn btn-sm" data-mp-gepackt="${esc(k.packSchluessel)}" data-mp-wert="1">Umschlag gepackt</button>`}`}
      <button type="button" class="btn btn-sm btn-ghost" data-mp-grossbrief="${esc(k.packSchluessel)}">Großbrief vorbereiten</button>
    </div>
  </article>`;
}

export function viewKundenMusterPacken() {
  ensureMusterPacken();
  const d = kunden.musterPacken;
  if (!d) return '<p class="muted" role="status">Lade offene Musterbestellungen …</p>';
  if (d.fehler) return stoerungState(d, 'Die Musterbestellungen');
  if (!d.verfuegbar) return emptyState('Keine Bestelldaten.', d.hinweis || 'Bitte „Jetzt aktualisieren“.');
  const offen = d.kunden.filter(k => !k.gepackt);
  const gepackt = d.kunden.filter(k => k.gepackt);
  const h = haken();
  const kopf = `<p class="sub mp-hier">Hier packst du die offenen Musterbestellungen Kunde für Kunde: Aufkleber drucken, jedes Muster überkleben und abhaken, Umschlag gepackt. Anschließend kannst du den Großbrief vorbereiten. Porto wird dabei nicht gekauft und Versand nicht gebucht.</p>`;
  if (!offen.length && !gepackt.length) return kopf + emptyState('Keine offenen Musterbestellungen.', 'Neue bezahlte Musterbestellungen erscheinen hier automatisch, nach Kunde gebündelt.');
  const druckbar = offen.filter(k => !k.fehlt.length);
  const aufkleber = druckbar.reduce((s, k) => s + k.aufkleber, 0);
  const muster = offen.reduce((s, k) => s + k.muster.length, 0);
  const summe = offen.length ? `<div class="mp-summe">
      <span><strong>${plural(offen.length, 'Kunde', 'Kunden')}</strong> · ${plural(muster, 'Muster', 'Muster')} zu packen</span>
      <button type="button" class="btn btn-primary" data-mp-alle${aufkleber ? '' : ' disabled'}>Alle drucken (${plural(aufkleber, 'Aufkleber', 'Aufkleber')})</button>
    </div>
    ${druckbar.length < offen.length ? `<p class="small muted">„Alle drucken“ lässt ${offen.length - druckbar.length === 1 ? 'einen Kunden' : `${offen.length - druckbar.length} Kunden`} ohne eindeutige Aufkleber aus.</p>` : ''}` : '<p class="small muted">Alle Umschläge sind gepackt.</p>';
  return `${kopf}${summe}
    <div class="mp-kunden">${offen.map((k, i) => kundeHtml(k, i + 1, h)).join('')}</div>
    ${gepackt.length ? `<details class="mp-fertig"><summary>Gepackt (${gepackt.length})</summary><div class="mp-kunden">${gepackt.map((k, i) => kundeHtml(k, offen.length + i + 1, h)).join('')}</div></details>` : ''}`;
}

function drucken(liste, titel) {
  const etiketten = liste.flatMap(aufkleberFuer);
  if (!etiketten.length) return;
  oeffneEtikettenDruck({ etiketten, titel, allowEditing: false,
    hinweis: 'Je Kunde erst die Muster, zuletzt die Adresse – so kommt die Rolle in Packreihenfolge heraus. Der Druck bucht nichts.' });
}

async function gepacktSetzen(packSchluessel, gepackt) {
  try {
    await orgSchreiben(ENDPOINT, { packSchluessel, gepackt });
    toast(gepackt ? 'Umschlag gepackt' : 'Gepackt zurückgenommen');
  } catch (err) {
    toast(`Nicht gespeichert: ${err.message}`, 'warn');
  }
  kunden.musterPacken = null;
  ensureMusterPacken();
  render();
}

/** Klicks im Reiter "Muster packen". Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function musterPackenKlick(e) {
  // Haken: Standardverhalten der Checkbox behalten, nur den Stand merken.
  const h = e.target.closest('[data-mp-haken]');
  if (h) { hakenSetzen(h.dataset.mpHaken, h.checked); return true; }
  const liste = kunden.musterPacken?.kunden || [];
  const grossbrief = e.target.closest('[data-mp-grossbrief]');
  if (grossbrief) {
    e.preventDefault();
    const k = liste.find(x => x.packSchluessel === grossbrief.dataset.mpGrossbrief);
    if (k) oeffneGrossbriefVorbereitung(k);
    return true;
  }
  const einzeln = e.target.closest('[data-mp-drucken]');
  if (einzeln) {
    e.preventDefault();
    const k = liste.find(x => x.packSchluessel === einzeln.dataset.mpDrucken);
    if (k) drucken([k], `Aufkleber · ${k.name}`);
    return true;
  }
  if (e.target.closest('[data-mp-alle]')) {
    e.preventDefault();
    drucken(liste.filter(k => !k.gepackt && !k.fehlt.length), 'Aufkleber · alle Kunden in Packreihenfolge');
    return true;
  }
  const gp = e.target.closest('[data-mp-gepackt]');
  if (gp) { e.preventDefault(); gp.disabled = true; gepacktSetzen(gp.dataset.mpGepackt, gp.dataset.mpWert === '1'); return true; }
  return false;
}
