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

export const shopwache = { daten: null, laedt: false };

function ensureShopwache() {
  if (shopwache.daten || shopwache.laedt) return;
  shopwache.laedt = true;
  fetchEinkauf('/api/shopwache/status').then(d => {
    shopwache.daten = d; shopwache.laedt = false;
    if (['heute', 'shopwache'].includes(state.route.view)) render();
  });
}

const AMPEL_TEXT = { gruen: 'Shop läuft', gelb: 'Shop läuft – mit Auffälligkeiten', rot: 'Shop hat ein Problem' };

/** Startseiten-Zeile: eine Zeile, wenn alles gut ist - sonst die Befunde. */
export function heuteShopwache() {
  ensureShopwache();
  const d = shopwache.daten;
  if (!d || !d.verfuegbar) return '';
  // Die Wache laeuft stuendlich. Bleibt sie aus (Rechner aus, Auftrag geloescht,
  // npm-Fehler), stand hier trotzdem im Praesens "Shop laeuft" - eine Aussage
  // ueber jetzt, gestuetzt auf eine womoeglich tagealte Messung. Ab drei
  // Stunden gilt der Stand als zu alt, um daraus etwas ueber jetzt zu sagen.
  const alterStunden = d.geprueftAm ? (Date.now() - new Date(d.geprueftAm).getTime()) / 3_600_000 : null;
  const veraltet = alterStunden === null || alterStunden > 3;
  if (d.ampel === 'gruen' && !veraltet) {
    return `<p class="health-ok"><span class="dot" aria-hidden="true"></span>${esc(AMPEL_TEXT.gruen)} · alle Pflichtseiten erreichbar, Preise stimmen · geprüft ${esc(fmtDateTime(d.geprueftAm))} · <a href="#/shopwache">Shop-Wache ansehen</a></p>`;
  }
  if (d.ampel === 'gruen') {
    return `<p class="notice warn" style="margin:8px 0 0"><strong>Shop-Wache meldet sich nicht.</strong>
      Die letzte Prüfung war ${d.geprueftAm ? esc(fmtDateTime(d.geprueftAm)) : 'unbekannt'} – sie läuft sonst stündlich.
      Damals war alles in Ordnung; über den Shop <em>jetzt</em> sagt das nichts.
      <a href="#/shopwache">Shop-Wache ansehen</a></p>`;
  }
  const klasse = d.ampel === 'rot' ? 'crit' : 'warn';
  return `<section class="card section health-card ${klasse}" style="margin-top:12px">
    <div class="card-head"><h2>${esc(AMPEL_TEXT[d.ampel] || 'Shop-Wache')}</h2><a class="more" href="#/shopwache">Alle Details →</a></div>
    <ul style="margin:0;padding-left:20px;line-height:1.8">${d.befunde.slice(0, 4).map(b => `<li><b>${esc(b.titel)}</b> – ${esc(b.text)}</li>`).join('')}</ul>
    ${d.befunde.length > 4 ? `<p class="small muted" style="margin:6px 0 0">+${d.befunde.length - 4} weitere</p>` : ''}
  </section>`;
}

export function viewShopwache() {
  ensureShopwache();
  const kopf = `<div class="page-head"><div><h1>Shop-Wache</h1><p class="sub">Der Shop von außen gesehen – so wie ein Kunde ihn erlebt.</p></div></div>`;
  const d = shopwache.daten;
  if (!d && shopwache.laedt) return kopf + `<div class="empty">Lade Prüfergebnis …</div>`;
  if (!d || !d.verfuegbar) {
    return kopf + emptyState('Die Shop-Wache ist noch nie gelaufen.', `Auf dem Mac starten: ${d?.befehl || 'npm run shop:wache'}`);
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
  return kopf + `
    <p class="small muted" style="margin:0 0 12px">Zuletzt geprüft: ${esc(fmtDateTime(d.geprueftAm))} · ${esc(d.basis)}</p>
    ${d.ampel === 'gruen'
      ? `<p class="notice ok">Alles in Ordnung: jede Pflichtseite antwortet, keine Preisabweichung.</p>`
      : `<section class="card ${d.ampel === 'rot' ? 'problem-card' : ''}" style="margin-bottom:14px"><div class="card-head"><h2>${d.befunde.length} ${d.befunde.length === 1 ? 'Befund' : 'Befunde'}</h2></div>
          <ul style="margin:0;padding-left:20px;line-height:1.9">${d.befunde.map(b => `<li><span class="badge ${b.art === 'kritisch' ? 'crit' : 'gap'}">${esc(b.art)}</span> <b>${esc(b.titel)}</b> – ${esc(b.text)}</li>`).join('')}</ul>
        </section>`}
    <section class="card" style="margin-bottom:14px"><div class="card-head"><h2>Seiten</h2></div>
      <div style="overflow-x:auto"><table class="tasks"><thead><tr><th>Seite</th><th>Zustand</th><th>Ladezeit</th><th>Adresse</th></tr></thead>
      <tbody>${d.seiten.map(zeile).join('')}</tbody></table></div>
    </section>
    <section class="card"><div class="card-head"><h2>Preisstichprobe</h2></div>
      ${d.preise.length
        ? `<div style="overflow-x:auto"><table class="tasks"><thead><tr><th>Produkt</th><th>Bei uns</th><th>Im Shop</th><th>Vergleich</th></tr></thead>
           <tbody>${d.preise.map(preisZeile).join('')}</tbody></table></div>`
        : `<p class="small muted">Keine Stichprobe – dafür wird der Lexikon-Export gebraucht.</p>`}
      <p class="small muted" style="margin:10px 0 0">Verglichen wird der Shopify-Listenpreis der ersten Variante mit dem, was die Produktseite ausliefert.</p>
    </section>`;
}
