/**
 * Einkauf, Reiter "Produktdaten": welche Produkte brauchen noch Handarbeit, bevor sie
 * bestellt werden koennen (seitenweise, serverseitig gefiltert).
 */
import { state } from '../../kern/zustand.mjs';
import { esc, plural } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState, bandItem } from '../../bausteine/karten.mjs';
import { einkauf } from './auftragsfluss.mjs';

function ensureEinkaufProduktstatus() {
  const p = state.route.params;
  const qs = new URLSearchParams({ page: p.get('seite') || '1', pageSize: '25', q: p.get('psq') || '', gruppe: p.get('gruppe') || '', filter: psFilterAktiv() === 'alle' ? '' : psFilterAktiv() }).toString();
  if (einkauf.produktstatusKey === qs && (einkauf.produktstatus || einkauf.loadingProduktstatus)) return;
  einkauf.produktstatusKey = qs;
  einkauf.loadingProduktstatus = true;
  fetchEinkauf(`/api/einkauf/produktstatus?${qs}`).then(d => {
    if (einkauf.produktstatusKey !== qs) return; // Antwort einer aelteren Eingabe
    einkauf.produktstatus = d; einkauf.loadingProduktstatus = false;
    if (state.route.view === 'einkauf') render();
  });
}

// Standard ist "Braucht Handarbeit": das ist die Arbeitsliste und dieselbe Zahl wie die
// Kachel darueber (die Kachel stand sonst neben einer anders gezaehlten Liste).
// "Alle offenen" (auch reine Zusatzinfos) bleibt einen Klick entfernt.
const EINKAUF_PSFILTER_LABEL = { handarbeit: 'Braucht Handarbeit', blockierend: 'Blockiert eine Bestellung', alle: 'Alle offenen Produkte' };
const PSFILTER_STANDARD = 'handarbeit';
function psFilterAktiv() {
  const f = state.route.params.get('psfilter');
  return Object.hasOwn(EINKAUF_PSFILTER_LABEL, f || '') ? f : PSFILTER_STANDARD;
}

export function viewEinkaufProduktdaten() {
  ensureEinkaufProduktstatus();
  const d = einkauf.produktstatus;
  const p = state.route.params;
  const psfilter = psFilterAktiv();
  const toolbar = `<div class="toolbar">
      <input type="search" placeholder="Produkt, Handle oder SKU suchen …" value="${esc(p.get('psq') || '')}" data-param="psq" aria-label="Produktdaten durchsuchen">
      ${d?.gruppen?.length ? `<select data-param="gruppe" aria-label="Nach Produktgruppe filtern"><option value="">Alle Gruppen</option>${d.gruppen.map(g => `<option value="${esc(g.gruppe)}" ${p.get('gruppe') === g.gruppe ? 'selected' : ''}>${esc(g.gruppe)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="chips" role="group" aria-label="Welche Produkte zeigen">
      ${Object.entries(EINKAUF_PSFILTER_LABEL).map(([k, l]) => `<button type="button" class="chip" data-param="psfilter" data-value="${k === PSFILTER_STANDARD ? '' : k}" aria-pressed="${psfilter === k}">${esc(l)}</button>`).join('')}
    </div>`;
  if (!d && einkauf.loadingProduktstatus) return toolbar + `<div class="empty">Lade Produktdaten-Status …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Produktdaten');
  if (!d || !d.verfuegbar) return emptyState('Keine Produktdaten-Statusdaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  const g = d.gesamt;
  const gruppenzeilen = d.gruppen.map(row => {
    const summe = row.vollstaendig + row.handarbeit + row.automatisch;
    return `<tr>
      <td data-l="Gruppe">${esc(row.gruppe)}</td>
      <td data-l="Handarbeit" class="num ${row.handarbeit ? 'warnc' : 'muted'}">${row.handarbeit}</td>
      <td data-l="Nur Zusatzinfos" class="num muted">${row.automatisch}</td>
      <td data-l="Vollständig" class="num">${row.vollstaendig}<span class="muted"> / ${summe}</span></td>
    </tr>`;
  }).join('');
  const offen = d.offen;
  const items = offen.items.map(e => {
    const blockierend = e.offeneFelder.filter(f => f.blockierend);
    const zusatz = e.offeneFelder.filter(f => !f.blockierend);
    return `<tr>
      <td data-l="Produkt"><div class="cell-title">${esc(e.titel)}</div><div class="small muted">${esc(e.gruppe)} · ${plural(e.variantenAnzahl, 'Variante', 'Varianten')}</div></td>
      <td data-l="Was fehlt für die Bestellung">${blockierend.length ? blockierend.map(f => `<div class="fehlt" title="${esc(f.grund)}"><b>${esc(f.klartext)}</b>${f.variantenBetroffen < e.variantenAnzahl ? ` <span class="small muted">· ${f.variantenBetroffen}/${e.variantenAnzahl} Varianten</span>` : ''} <span class="small muted">→ ${esc(f.naechsterSchritt)}</span></div>`).join('') : '<span class="small muted">blockiert nichts</span>'}</td>
      <td data-l="Außerdem offen" class="small muted">${zusatz.length ? esc(zusatz.map(f => f.klartext).join(', ')) : '–'}</td>
    </tr>`;
  }).join('');
  const pages = offen.pages > 1 ? `<div class="pager">
      <button type="button" class="btn btn-sm" ${offen.page <= 1 ? 'disabled' : ''} data-param="seite" data-value="${offen.page - 1}">← Zurück</button>
      <span class="muted small">Seite ${offen.page} von ${offen.pages} · ${offen.count} Produkte</span>
      <button type="button" class="btn btn-sm" ${offen.page >= offen.pages ? 'disabled' : ''} data-param="seite" data-value="${offen.page + 1}">Weiter →</button>
    </div>` : '';
  return `
    <div class="band">
      ${bandItem(g.handarbeit, 'Produkte brauchen Handarbeit', 'crit')}
      ${bandItem(g.automatisch, 'nur Zusatzinfos offen (füllt sich selbst)', 'plain')}
      ${bandItem(g.vollstaendig, `von ${g.anzahl} vollständig`, 'plain')}
    </div>
    <p class="small muted" style="margin:-4px 0 14px">„Handarbeit" heißt: Lieferant, Artikelnummer, Farbnummer oder Bestellmenge fehlen – ohne sie kann nicht bestellt werden. Zusatzinfos wie Kollektion oder Hersteller halten keine Bestellung auf.</p>
    ${toolbar}
    <section class="card"><div class="card-head"><h2>${esc(EINKAUF_PSFILTER_LABEL[psfilter])}</h2><span class="more muted">${offen.count} Produkte · dringendste zuerst</span></div>
      ${items ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Produkt</th><th>Was fehlt für die Bestellung</th><th>Außerdem offen</th></tr></thead><tbody>${items}</tbody></table></div>` : emptyState('Keine Treffer.', psfilter !== 'alle' && !p.get('psq') ? 'Hier ist gerade nichts zu tun.' : 'Suche oder Filter anpassen.')}
      ${pages}
    </section>
    <details class="card section plain-details"><summary><h2>Je Produktgruppe</h2><span class="preview">${d.gruppen.length} Gruppen</span></summary>
      <div class="table-scroll" style="margin-top:10px"><table class="tasks compact"><thead><tr><th>Gruppe</th><th class="num">Handarbeit</th><th class="num">Nur Zusatzinfos</th><th class="num">Vollständig</th></tr></thead><tbody>${gruppenzeilen}</tbody></table></div>
    </details>`;
}
