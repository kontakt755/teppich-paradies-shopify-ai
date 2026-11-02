/** Interne Abdeckung: neue Produkte erscheinen nach dem Lexikonabgleich automatisch. */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';

let antwort = null, key = '', nummer = 0, loading = false, fehler = '';
const aktiv = () => state.route.view === 'lexikon' && state.route.params.get('tab') === 'etiketten';
const zahl = n => Number(n || 0).toLocaleString('de-DE');

function laden(neu = false) {
  const q = state.route.params.get('lq') || '', status = state.route.params.get('els') || 'pruefen', page = state.route.params.get('lseite') || '1';
  const k = JSON.stringify([q, status, page]);
  if (!neu && k === key) return;
  key = k; loading = true; if (!neu) antwort = null; fehler = '';
  const nr = ++nummer;
  fetchEinkauf(`/api/lexikon/etiketten-status?${new URLSearchParams({ q, status, page })}`).then(d => {
    if (nr !== nummer) return;
    antwort = d;
  }).catch(e => { if (nr === nummer) fehler = e.message; }).finally(() => {
    if (nr !== nummer) return;
    loading = false; if (aktiv()) render();
  });
}

function produkt(z) {
  const link = `#/lexikon?${new URLSearchParams({ handle: z.handle })}`;
  const art = { direkt: 'Muster', bekannt: 'Eigenes Muster', anfrage: 'Muster auf Anfrage', musterartikel: 'Musterzuordnung', unbekannt: 'Datenstand prüfen', unklar: 'Musterbedarf prüfen' }[z.angebot] || 'Muster';
  return `<article class="card"><div class="card-head"><h2><a href="${esc(link)}">${esc(z.titel || z.handle)}</a></h2><span class="small muted">${esc(art)}</span></div>
    <p>${z.status === 'bereit' ? `${zahl(z.anzahl)} Aufkleber-Ausführungen bereit` : `<span class="etk-fehlt">${z.fehlt.map(esc).join(' · ')}</span>`}</p>
    ${z.etiketten.length ? `<details><summary class="small">Farben und Artikelnummern ansehen</summary><ul>${z.etiketten.map(e => `<li><a href="${esc(`${link}&letikett=${e.index}`)}">${esc(e.bezeichnung)}</a>${e.fehlt.length ? ` – <span class="etk-fehlt">${e.fehlt.map(esc).join(', ')}</span>` : ''}${e.hinweise?.length ? `<span class="small muted"> ${e.hinweise.map(esc).join(' ')}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
    <a class="btn btn-sm" href="${esc(link)}">${z.status === 'bereit' ? 'Aufkleber ansehen' : 'Produkt prüfen'}</a></article>`;
}

export function viewMusterEtikettenStatus() {
  laden();
  const q = state.route.params.get('lq') || '', filter = state.route.params.get('els') || 'pruefen';
  const kopf = `<p class="lex-druckliste-link"><a class="btn" href="#/lexikon">Lexikon</a><a class="btn" href="#/lexikon?tab=druckliste">Aufkleber-Druckliste</a></p>
    <div class="page-head"><div><h1>Aufkleber prüfen</h1><p class="sub">Hier prüfst du die Muster-Aufkleber; neue Produkte und Farben kommen automatisch dazu.</p></div><button class="btn btn-sm" data-etiketten-status-neu${loading ? ' disabled' : ''}>Aktualisieren</button></div>
    <p class="small muted">Die Aufkleber entstehen aus den aktuellen Produktdaten. Hier wird nichts zur Druckliste hinzugefügt und kein Druck gestartet.</p>`;
  const suche = `<div class="toolbar search-hero"><input type="search" data-param="lq" value="${esc(q)}" aria-label="Aufkleberbestand durchsuchen" placeholder="Produkt, Farbe oder Artikelnummer …"></div>
    <div class="chips">${[['pruefen', 'Zu prüfen'], ['bereit', 'Bereit'], ['alle', 'Alle']].map(([wert, name]) => `<button class="chip" aria-pressed="${filter === wert}" data-etiketten-status-filter="${wert}">${name}</button>`).join('')}</div>`;
  if (loading && !antwort) return `${kopf}<p role="status">Prüfe den aktuellen Aufkleberbestand …</p>`;
  if (fehler || !antwort?.verfuegbar) return `${kopf}<p class="notice crit" role="alert">${esc(fehler || antwort?.hinweis || 'Der Bestand konnte nicht geprüft werden. Bitte aktualisieren.')}</p>`;
  const z = antwort.zaehler, t = antwort.treffer;
  return `${kopf}<section class="card"><div class="card-head"><h2>${zahl(z.bereit)} Aufkleber-Ausführungen bereit</h2></div>
    <p>${zahl(z.produkte)} Produkte mit Mustern oder Musteranfrage geprüft. ${zahl(z.pruefen)} Ausführungen und ${zahl(z.zuordnungPruefen)} Musterzuordnungen brauchen Prüfung.</p>
    ${z.regelstandOffen ? `<p class="etk-fehlt">Bei ${zahl(z.regelstandOffen)} Produkten fehlen noch die aktuellen Musterregeln. Bitte die Produktdaten aktualisieren; diese Produkte sind noch nicht als geprüft bestätigt.</p>` : ''}
    ${z.musterbedarfOffen ? `<p class="etk-fehlt">Bei ${zahl(z.musterbedarfOffen)} ${z.musterbedarfOffen === 1 ? 'Produkt ist' : 'Produkten ist'} die Musterfähigkeit noch ungeklärt. ${z.musterbedarfOffen === 1 ? 'Dieser Artikel bleibt' : 'Diese Artikel bleiben'} unter „Zu prüfen“ sichtbar.</p>` : ''}
    ${z.ohneArtikelnummer ? `<p class="small muted">${zahl(z.ohneArtikelnummer)} Aufkleber haben keine Artikelnummer im Shop. Dieses optionale Feld wird weggelassen.</p>` : ''}
    <p class="small muted">${zahl(z.musterzuordnungen)} Zuordnungen aus ${zahl(z.musterartikel)} eigenen Musterartikeln geprüft. Datenstand: ${esc(fmtDateTime(antwort.erstellt))}.</p>
    <p class="small muted">Vorhandene Angaben werden geprüft. Nicht hinterlegte technische Eigenschaften werden nicht erfunden.</p></section>
    ${suche}<p class="small muted">${zahl(t.count)} Produkte in dieser Auswahl</p>
    ${t.items.length ? `<div class="lex-etiketten-status">${t.items.map(produkt).join('')}</div>` : `<div class="empty">${filter === 'pruefen' ? 'Keine offenen Prüffälle in dieser Auswahl.' : 'Keine passenden Produkte.'}</div>`}
    ${t.pages > 1 ? `<div class="lex-seiten"><button class="btn btn-sm" data-param="lseite" data-value="${t.page - 1}"${t.page === 1 ? ' disabled' : ''}>← Zurück</button><span class="small muted">Seite ${t.page} von ${t.pages}</span><button class="btn btn-sm" data-param="lseite" data-value="${t.page + 1}"${t.page === t.pages ? ' disabled' : ''}>Weiter →</button></div>` : ''}`;
}

export function musterEtikettenStatusKlick(e) {
  const b = e.target.closest('[data-etiketten-status-filter],[data-etiketten-status-neu]');
  if (!b) return false;
  e.preventDefault();
  if (b.hasAttribute('data-etiketten-status-neu')) { laden(true); render(); }
  else {
    const p = new URLSearchParams(state.route.params); p.set('els', b.dataset.etikettenStatusFilter); p.delete('lseite');
    location.hash = `#/lexikon?${p}`;
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('tp-sitzung-beendet', () => {
    nummer++; antwort = null; key = ''; loading = false; fehler = '';
  });
  // Vor dem zentralen Router invalidieren: erneutes Betreten liest den Export neu.
  window.addEventListener('hashchange', () => { key = ''; });
  const abgleichen = () => {
    if (!aktiv() || state.capabilities.mode !== 'local' || loading || document.visibilityState === 'hidden' || document.activeElement?.matches('input,textarea,select')) return;
    laden(true);
  };
  window.addEventListener('focus', abgleichen);
  document.addEventListener('visibilitychange', abgleichen);
  window.setInterval(abgleichen, 30_000);
}
