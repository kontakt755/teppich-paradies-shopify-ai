/**
 * Befehlspalette (Cmd+K, Ctrl+K oder /): Ansichten, Aufgaben, Kunden und Produkte finden,
 * Befehle ausloesen.
 */
import { AREAS, SAVED_VIEWS } from '../lib/model.mjs';
import { REPO_URL } from '../kern/konfig.mjs';
import { state } from '../kern/zustand.mjs';
import { $, esc, newIssueUrl } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { darfAnsicht, navigate, openTask } from '../kern/router.mjs';
import { refresh } from '../kern/daten.mjs';
import { syncNow } from './aktualisierung.mjs';
import { openOrgSchnell, openOrgListe } from '../ansichten/organisation/dialoge.mjs';

// Treffer aus den Betriebsdaten - Kunden und Produkte. Die Suche ist fuer
// viele der schnellste Weg ueberhaupt ("Kunde am Telefon, Produktname
// genannt"), deshalb muss sie mehr finden als GitHub-Aufgaben.
const paletteFern = { q: '', kunden: [], produkte: [] };
let paletteTimer = null;

/**
 * Sucht Kunden und Produkte zur Eingabe. Kein Sperr-Flag: eine laufende
 * Abfrage darf die naechste Eingabe nicht verschlucken (sonst bleibt die
 * Liste bei schnellem Tippen auf einem alten Suchwort stehen). Stattdessen
 * kurz entprellt, und Antworten zu einer alten Eingabe werden verworfen.
 */
function paletteFernSuche(q, fertig) {
  const query = String(q || '').trim();
  paletteFern.q = query;
  clearTimeout(paletteTimer);
  if (query.length < 2 || state.capabilities.mode !== 'local') {
    paletteFern.kunden = []; paletteFern.produkte = [];
    fertig();
    return;
  }
  paletteTimer = setTimeout(() => {
    Promise.all([
      fetchEinkauf(`/api/kunden/suche?${new URLSearchParams({ q: query, filter: 'alle' })}`),
      fetchEinkauf(`/api/lexikon/liste?${new URLSearchParams({ q: query })}`),
    ]).then(([k, l]) => {
      if (paletteFern.q !== query) return; // Antwort einer aelteren Eingabe
      paletteFern.kunden = (k?.treffer || []).slice(0, 5);
      paletteFern.produkte = (l?.treffer?.items || []).slice(0, 5);
      fertig();
    }).catch(() => { /* Suche bleibt bei den lokalen Treffern */ });
  }, 150);
}

function paletteItems(q) {
  const items = [];
  for (const k of paletteFern.kunden) {
    items.push({ kind: 'Kunde', label: k.name || 'ohne Namen', sub: [k.ort, k.telefon].filter(x => x && x !== '–').join(' · ') || undefined, treffer: true, run: () => navigate('kunden', { kunde: k.key }) });
  }
  for (const p of paletteFern.produkte) {
    items.push({ kind: 'Produkt', label: p.titel, sub: p.produktgruppe || undefined, treffer: true, run: () => navigate('lexikon', { handle: p.handle }) });
  }
  const views = [['heute', 'Heute'], ['einkauf', 'Einkauf'], ['kunden', 'Kunden'], ['lexikon', 'Lexikon'], ['arbeit', 'Entwicklung (KI & GitHub)'], ['freigaben', 'Freigaben'], ['bereiche', 'Bereiche'], ['insights', 'Insights'], ['aktivitaet', 'Aktivität'], ['ratgeber', 'Ratgeber'], ['organisation', 'Aufgaben & Organisation'], ['shopwache', 'Shop-Wache'], ['hilfe', 'Hilfe: So arbeitest du damit']];
  for (const [k, l] of views) if (darfAnsicht(k)) items.push({ kind: 'Ansicht', label: l, run: () => navigate(k) });
  items.push({ kind: 'Ansicht', label: 'Fotos vom fertigen Raum', run: () => navigate('fotos') });
  if (darfAnsicht('team')) items.push({ kind: 'Ansicht', label: 'Team: Zugänge verwalten', run: () => navigate('team') });
  if (darfAnsicht('arbeit')) {
    for (const v of SAVED_VIEWS) items.push({ kind: 'Ansicht', label: `Arbeit: ${v.label}`, run: () => navigate('arbeit', { view: v.key }) });
    for (const a of AREAS) items.push({ kind: 'Bereich', label: a.label, run: () => navigate('arbeit', { area: a.key }) });
    items.push({ kind: 'Aktion', label: 'Neue Aufgabe auf GitHub anlegen', run: () => window.open(newIssueUrl({ template: 'feature.yml' }), '_blank', 'noopener') });
    items.push({ kind: 'Aktion', label: 'Entscheidung anlegen', run: () => window.open(newIssueUrl({ template: 'entscheidung.yml' }), '_blank', 'noopener') });
  }
  items.push({ kind: 'Aktion', label: 'Schnell erfassen (Aufgabe oder Notiz)', run: () => openOrgSchnell() });
  items.push({ kind: 'Aktion', label: 'Liste einfügen (mehrere Aufgaben auf einmal)', run: () => openOrgListe() });
  items.push({ kind: 'Aktion', label: 'Daten neu laden', run: () => refresh() });
  if (state.capabilities.sync && darfAnsicht('arbeit')) items.push({ kind: 'Aktion', label: 'Jetzt mit GitHub synchronisieren', run: () => syncNow() });
  if (darfAnsicht('arbeit')) {
    items.push({ kind: 'Aktion', label: 'GitHub Issues öffnen', run: () => window.open(`${REPO_URL}/issues`, '_blank', 'noopener') });
    const owners = [...new Set(state.tasks.map(t => t.owner).filter(Boolean))];
    for (const o of owners) items.push({ kind: 'Person', label: `@${o}`, run: () => navigate('arbeit', { owner: o }) });
    for (const e of [...new Set(state.tasks.map(t => t.executor).filter(Boolean))]) items.push({ kind: 'Agent', label: e, run: () => navigate('arbeit', { q: e }) });
    for (const t of state.tasks) items.push({ kind: t.isDecision ? 'Entscheidung' : 'Aufgabe', label: `${t.id} ${t.title}`, sub: t.statusLabel, run: () => openTask(t.number) });
  }
  const ql = q.trim().toLowerCase();
  const scored = items.map(i => ({
    i,
    // Kunden/Produkte kommen schon gefiltert vom Server und stehen oben.
    s: i.treffer ? 5 : !ql ? 1 : i.label.toLowerCase().includes(ql) ? 2 + (i.label.toLowerCase().startsWith(ql) ? 1 : 0) : ql.split(/\s+/).every(p => i.label.toLowerCase().includes(p)) ? 1 : 0,
  })).filter(x => x.s > 0);
  return scored.sort((a, b) => b.s - a.s).slice(0, 14).map(x => x.i);
}

export function openPalette() {
  const root = $('#paletteRoot');
  paletteFern.q = ''; paletteFern.kunden = []; paletteFern.produkte = [];
  let sel = 0; let items = paletteItems('');
  const draw = () => { root.querySelector('ul').innerHTML = items.map((it, k) => `<li role="option" aria-selected="${k === sel}" data-k="${k}"><span class="k">${esc(it.kind)}</span><span>${esc(it.label)}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}</li>`).join('') || '<li class="muted">Nichts gefunden.</li>'; };
  root.innerHTML = `<div class="palette-backdrop" data-close-palette><div class="palette" role="combobox" aria-expanded="true"><input type="text" placeholder="Kunde, Produkt, Aufgabe, Ansicht … (Esc schließt)" aria-label="Suche" autocomplete="off"><ul role="listbox"></ul></div></div>`;
  draw();
  const input = root.querySelector('input'); input.focus();
  const run = () => { const it = items[sel]; closePalette(); it?.run(); };
  input.addEventListener('input', () => {
    paletteFernSuche(input.value, () => { items = paletteItems(input.value); draw(); });
    items = paletteItems(input.value); sel = 0; draw();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Escape') closePalette();
  });
  root.querySelector('ul').addEventListener('click', e => { const li = e.target.closest('li[data-k]'); if (li) { sel = Number(li.dataset.k); run(); } });
}
export function closePalette() { $('#paletteRoot').innerHTML = ''; }
