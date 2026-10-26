/**
 * Ansicht "Shop-Wache" (#/shopwache, nur Inhaber). Prueft den oeffentlichen Shop von aussen -
 * laeuft die Seite, sind Impressum/AGB/Widerruf erreichbar, stimmen die Preise. Das
 * sieht man den Admin-Daten nicht an.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, NICHT_HINTERLEGT, fmtPreis } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { tailscaleHinweis, speicherHinweis } from '../lib/todos.mjs';

export const shopwache = { daten: null, laedt: false };

/** Laedt den Stand der Shop-Wache - auch fuer die To-dos auf "Heute" (nur Inhaber). */
export function ensureShopwache() {
  if (shopwache.daten || shopwache.laedt) return;
  shopwache.laedt = true;
  fetchEinkauf('/api/shopwache/status').then(d => {
    shopwache.daten = d; shopwache.laedt = false;
    if (['heute', 'shopwache', 'insights'].includes(state.route.view)) render();
  });
}

export function viewShopwache() {
  ensureShopwache();
  const kopf = `<div class="page-head"><div><h1>Shop-Kontrolle</h1><p class="sub">Hier siehst du den Shop von außen – so wie ein Kunde ihn erlebt.</p></div></div>`;
  const d = shopwache.daten;
  if (!d && shopwache.laedt) return kopf + `<div class="empty">Lade Prüfergebnis …</div>`;
  // Nur wenn Tailscale nicht laeuft - im Normalfall steht hier nichts.
  const ts = tailscaleHinweis(d?.tailscale);
  const tailscale = ts ? `<p class="notice warn" role="status"><b>${esc(ts.titel)}.</b> ${esc(ts.handlung)}</p>` : '';
  // Freier Speicher am Mac mini - ebenfalls nur, wenn er knapp wird.
  const sp = speicherHinweis(d?.speicher);
  const speicher = sp ? `<p class="notice ${sp.ton === 'crit' ? 'crit' : 'warn'}" role="status"><b>${esc(sp.titel)}:</b> ${esc(sp.text)}. ${esc(sp.handlung)}</p>` : '';
  if (!d || !d.verfuegbar) {
    return kopf + tailscale + emptyState('Die Shop-Kontrolle ist noch nie gelaufen.', `Auf dem Mac starten: ${d?.befehl || 'npm run shop:wache'}`);
  }
  const zeile = (s) => {
    const ok = !s.fehler && s.status >= 200 && s.status < 400;
    const langsam = ok && s.dauerMs > 3000;
    return `<tr>
      <td>${esc(s.name)}</td>
      <td><span class="badge ${ok ? 'ok' : 'crit'}">${ok ? 'erreichbar' : esc(s.fehler || `HTTP ${s.status}`)}</span></td>
      <td class="${langsam ? 'warnc' : ''}">${esc((s.dauerMs / 1000).toFixed(1))} s${langsam ? ' – langsam' : ''}</td>
      <td class="small muted mono">${esc(s.pfad)}</td>
    </tr>`;
  };
  const preisZeile = (p) => `<tr>
    <td class="mono small">${esc(p.handle)}</td>
    <td>${p.beiUns === null ? NICHT_HINTERLEGT : `${esc(fmtPreis(p.beiUns))} €`}</td>
    <td>${p.imShop === null ? NICHT_HINTERLEGT : `${esc(fmtPreis(p.imShop))} €`}</td>
    <td><span class="badge ${p.inOrdnung ? 'ok' : 'crit'}">${p.inOrdnung ? 'gleich' : 'weicht ab'}</span></td>
  </tr>`;
  return kopf + tailscale + speicher + `
    <p class="small muted" style="margin:0 0 12px">Zuletzt geprüft: ${esc(fmtDateTime(d.geprueftAm))} · ${esc(d.basis)}</p>
    ${d.ampel === 'gruen'
      ? `<p class="notice ok">Alles in Ordnung: jede Pflichtseite antwortet, keine Preisabweichung.</p>`
      : `<section class="card ${d.ampel === 'rot' ? 'problem-card' : ''}" style="margin-bottom:14px"><div class="card-head"><h2>${d.befunde.length} ${d.befunde.length === 1 ? 'Befund' : 'Befunde'}</h2></div>
          <ul style="margin:0;padding-left:20px;line-height:1.9">${d.befunde.map(b => `<li><span class="badge ${b.art === 'kritisch' ? 'crit' : 'gap'}">${esc(b.art)}</span> <b>${esc(b.titel)}</b> – ${esc(b.text)}</li>`).join('')}</ul>
        </section>`}
    <section class="card" style="margin-bottom:14px"><div class="card-head"><h2>Seiten</h2></div>
      <div class="table-scroll"><table class="tasks"><thead><tr><th>Seite</th><th>Zustand</th><th>Ladezeit</th><th>Adresse</th></tr></thead>
      <tbody>${d.seiten.map(zeile).join('')}</tbody></table></div>
    </section>
    <section class="card"><div class="card-head"><h2>Preisstichprobe</h2></div>
      ${d.preise.length
        ? `<div class="table-scroll"><table class="tasks"><thead><tr><th>Produkt</th><th>Bei uns</th><th>Im Shop</th><th>Vergleich</th></tr></thead>
           <tbody>${d.preise.map(preisZeile).join('')}</tbody></table></div>`
        : `<p class="small muted">Keine Stichprobe – dafür wird der Produkt-Export gebraucht.</p>`}
      <p class="small muted" style="margin:10px 0 0">Verglichen wird der Shopify-Listenpreis der ersten Variante mit dem, was die Produktseite ausliefert.</p>
    </section>`;
}
