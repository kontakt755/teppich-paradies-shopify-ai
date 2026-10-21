/**
 * Ansicht "Bildrechte" (#/bildrechte): drei Arbeitslisten aus dem lokalen
 * Bildrechte-Verzeichnis - Herkunft ungeklaert, zu klein (< 1200 px), ohne ALT-Text.
 *
 * Nur lesend: keine Bildbearbeitung, kein Upload, kein Statuswechsel. Gepflegt wird das
 * Verzeichnis ausserhalb des Dashboards (docs/weiterentwicklung/bilder.md); die Ansicht
 * zeigt, wo Arbeit liegt, und fuehrt per Link zum Produkt in Shopify.
 *
 * Gefiltert und geblaettert wird auf dem Server (/api/bildrechte/liste) - das Verzeichnis
 * hat mehr als 15.000 Zeilen und Lizenzangaben, die im Browser nichts verloren haben.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';

const bildrechte = { daten: null, schluessel: '', laedt: false };

const LISTEN = {
  ungeklaert: { titel: 'Herkunft ungeklärt', kachel: 'Herkunft oder Freigabe ungeklärt', klasse: 'warn', leer: 'Für jedes Bild ist die Herkunft dokumentiert.' },
  'zu-klein': { titel: 'Zu klein', kachel: 'schmaler als 1.200 px', klasse: 'warn', leer: 'Kein Bild ist schmaler als 1.200 px.' },
  'ohne-alt': { titel: 'Ohne ALT-Text', kachel: 'ohne ALT-Text', klasse: 'warn', leer: 'Alle Bilder haben einen ALT-Text.' },
};

const zahl = n => Number(n).toLocaleString('de-DE');

function listeAktiv() {
  const l = state.route.params.get('bl');
  return Object.hasOwn(LISTEN, l || '') ? l : 'ungeklaert';
}

function ensureBildrechte() {
  const p = state.route.params;
  const qs = new URLSearchParams({ liste: listeAktiv(), gruppe: p.get('bg') || '', page: p.get('bs') || '1' }).toString();
  if (bildrechte.schluessel === qs && (bildrechte.daten || bildrechte.laedt)) return;
  bildrechte.schluessel = qs;
  bildrechte.laedt = true;
  fetchEinkauf(`/api/bildrechte/liste?${qs}`).then(d => {
    if (bildrechte.schluessel !== qs) return; // Antwort einer aelteren Auswahl
    bildrechte.daten = d;
    bildrechte.laedt = false;
    if (state.route.view === 'bildrechte') render();
  });
}

/** Kachel je Liste; die gewaehlte ist markiert. 0 bleibt grau. */
function kachel(key, n, aktiv) {
  const l = LISTEN[key];
  const klasse = n === 0 ? 'zero' : l.klasse;
  return `<a href="#/bildrechte${key === 'ungeklaert' ? '' : `?bl=${key}`}" class="${klasse}"${aktiv ? ' aria-current="true"' : ''}>
    <span class="n">${esc(zahl(n))}</span><span class="l">${esc(l.kachel)}</span></a>`;
}

function zeile(e, liste, mitHinweis) {
  const masse = e.breite ? `${zahl(e.breite)}${e.hoehe ? ` × ${zahl(e.hoehe)}` : ''} px` : '';
  const links = [
    e.adminUrl ? `<a href="${esc(e.adminUrl)}" target="_blank" rel="noopener">In Shopify öffnen</a>` : '',
    e.shopUrl ? `<a href="${esc(e.shopUrl)}" target="_blank" rel="noopener">Im Shop ansehen</a>` : '',
  ].filter(Boolean).join('<br>');
  return `<tr>
    <td data-l="Produkt"><div class="cell-title">${esc(e.titel)}</div><div class="small muted">${esc(e.gruppe)}${e.position ? ` · Bild ${e.position}` : ''}</div></td>
    <td data-l="Bild"><span class="mono br-datei">${esc(e.datei || '–')}</span>${liste === 'zu-klein' && masse ? `<div class="small"><b>${esc(masse)}</b></div>` : ''}</td>
    ${mitHinweis ? `<td data-l="Hinweis aus dem Dateinamen" class="small muted">${esc(e.hinweis || '–')}</td>` : ''}
    <td data-l="Öffnen" class="small">${links || '<span class="muted">kein Link</span>'}</td>
  </tr>`;
}

export function viewBildrechte() {
  ensureBildrechte();
  const d = bildrechte.daten;
  const kopf = `<div class="page-head"><div><h1>Bildrechte</h1>
    <p class="sub">Hier siehst du, welche Produktbilder noch Arbeit brauchen. Nur zum Nachsehen – geändert wird in Shopify und im Bildrechte-Verzeichnis.</p></div></div>`;
  if (!d && bildrechte.laedt) return kopf + '<div class="empty">Lade Bildrechte …</div>';
  if (d?.fehler) return kopf + stoerungState(d, 'Die Bildrechte');
  if (!d || !d.verfuegbar) return kopf + emptyState(d?.hinweis || 'Das Bildrechte-Verzeichnis fehlt.', d?.befehl ? `Auf dem Mac anlegen: ${d.befehl}` : '');

  const liste = d.liste;
  const L = LISTEN[liste];
  const z = d.zaehler;
  const band = `<div class="band br-band">${Object.keys(LISTEN).map(k => kachel(k, z[k] ?? 0, k === liste)).join('')}</div>`;
  const erklaerung = `<p class="small muted br-erklaerung">Gezählt werden Bilder, die am Produkt hängen – entfernte Bilder nicht.${liste === 'zu-klein' && d.breiteUnbekannt ? ` Bei ${esc(zahl(d.breiteUnbekannt))} Bildern ist die Breite nicht erfasst; sie fehlen in dieser Liste.` : ''} Stand des Verzeichnisses: ${esc(fmtDateTime(d.stand))}.</p>`;

  const filter = d.gruppen.length > 1 || d.gruppe ? `<div class="toolbar">
      <select data-param="bg" aria-label="Nach Warengruppe filtern">
        <option value="">Alle Warengruppen</option>
        ${d.gruppen.map(g => `<option value="${esc(g.gruppe)}" ${d.gruppe === g.gruppe ? 'selected' : ''}>${esc(g.gruppe)} (${esc(zahl(g.anzahl))})</option>`).join('')}
      </select></div>` : '';

  // Die Spalte "Hinweis" nur, wenn auf dieser Seite wenigstens ein Bild einen hat.
  const mitHinweis = liste === 'ungeklaert' && d.items.some(e => e.hinweis);
  const tabelle = d.items.length
    ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Produkt</th><th>Bild</th>${mitHinweis ? '<th>Hinweis aus dem Dateinamen</th>' : ''}<th>Öffnen</th></tr></thead>
        <tbody>${d.items.map(e => zeile(e, liste, mitHinweis)).join('')}</tbody></table></div>`
    : emptyState(L.leer, '');
  const blaettern = d.pages > 1 ? `<div class="pager">
      <button type="button" class="btn btn-sm" ${d.page <= 1 ? 'disabled' : ''} data-param="bs" data-value="${d.page - 1}">← Zurück</button>
      <span class="muted small">Seite ${d.page} von ${d.pages}</span>
      <button type="button" class="btn btn-sm" ${d.page >= d.pages ? 'disabled' : ''} data-param="bs" data-value="${d.page + 1}">Weiter →</button>
    </div>` : '';

  return `${kopf}${band}${erklaerung}${filter}
    <section class="card"><div class="card-head"><h2>${esc(L.titel)}${d.gruppe ? ` · ${esc(d.gruppe)}` : ''}</h2>${d.gruppe ? `<span class="more muted">${esc(zahl(d.count))} Bilder</span>` : ''}</div>
      ${tabelle}${blaettern}
    </section>`;
}
