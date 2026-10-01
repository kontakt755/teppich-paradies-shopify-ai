/**
 * Ansicht "Ratgeber" (#/ratgeber, nur Inhaber): Stand der Bodenwissen-Inhalte aus bodenwissen.json.
 */
import { ratgeberStatus, pipelineRows, statusLabel, suchleistungHinweis } from '../lib/bodenwissen.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, plural } from '../kern/helfer.mjs';
import { render } from '../kern/render.mjs';
import { emptyState } from '../bausteine/karten.mjs';

/**
 * Laedt docs/ai-dashboard/bodenwissen.json einmal je Sitzung. Fehlt die Datei
 * (HTTP 404, z. B. weil sie noch nie erzeugt wurde), ist das kein Fehler -
 * ratgeberStatus() zeigt dann den ruhigen "fehlt"-Hinweis statt eines Absturzes.
 */
function ensureBodenwissen() {
  if (state.bodenwissenLoaded) return;
  state.bodenwissenLoaded = true;
  fetch(`./bodenwissen.json?t=${Date.now()}`, { cache: 'no-store' })
    .then(async r => {
      if (!r.ok) { state.bodenwissen = null; state.bodenwissenError = null; return; }
      state.bodenwissen = await r.json();
      state.bodenwissenError = null;
    })
    .catch(e => { state.bodenwissen = null; state.bodenwissenError = e.message; })
    .finally(() => { if (state.route.view === 'ratgeber') render(); });
}

export function viewRatgeber() {
  ensureBodenwissen();
  const head = `<div class="page-head"><div><h1>Ratgeber</h1><p class="sub">Stand der Bodenwissen-Inhalte (content/ratgeber, content/lexikon, content/probleme) · Quelle: <span class="mono">node scripts/build-bodenwissen-data.mjs</span></p></div></div>`;
  const status = ratgeberStatus(state.bodenwissen, state.bodenwissenError);
  if (status.state !== 'ok') {
    return head + emptyState(status.state === 'fehler' ? 'Ratgeber-Daten konnten nicht geladen werden.' : 'Noch keine Ratgeber-Daten erzeugt.', status.hinweis);
  }
  const d = state.bodenwissen;
  const bandItem = (n, label, cls, href) => href
    ? `<a href="${href}" class="${n === 0 ? 'zero' : cls}"><span class="n">${n}</span><span class="l">${esc(label)}</span></a>`
    : `<div class="${n === 0 ? 'zero' : cls}"><span class="n">${n}</span><span class="l">${esc(label)}</span></div>`;
  const pipeline = pipelineRows(d);
  const maxPipeline = Math.max(1, ...pipeline.map(r => r.anzahl));
  const ueb = d.ueberarbeitungsbedarf || [];
  const bilder = d.bilder || { offen: 0, items: [] };
  const ei = d.expertInput || { gesamt: 0, ratgeber: 0, lexikon: 0, items: [] };
  const pf = d.problemFinder || { gesamt: 0, mitZiel: 0, ohneZiel: 0 };
  const gate = d.gate || { fehler: [], hinweise: [], zahlen: {} };
  const kappen = (liste, n = 20) => liste.length > n ? `<p class="small muted" style="margin-top:6px">… und ${liste.length - n} weitere.</p>` : '';

  return `${head}
    <div class="band">
      ${bandItem(d.gesamt?.artikel || 0, 'Artikel', 'info')}
      ${bandItem(ueb.length, 'Überarbeitung fällig', ueb.length ? 'crit' : 'ok')}
      ${bandItem(bilder.offen, 'Bildbedarfe offen', bilder.offen ? 'warn' : 'ok')}
      ${bandItem(ei.gesamt, 'Expert Input offen', ei.gesamt ? 'warn' : 'ok')}
      ${bandItem(gate.fehler.length, 'Gate-Fehler', gate.fehler.length ? 'crit' : 'ok')}
      ${bandItem(gate.hinweise.length, 'Gate-Hinweise', gate.hinweise.length ? 'warn' : 'ok')}
    </div>

    <section class="card">
      <div class="card-head"><h2>Content-Pipeline</h2><span class="more muted">${plural(d.gesamt?.artikel || 0, 'Artikel', 'Artikel')} gesamt</span></div>
      <div class="bars">${pipeline.map(r => `<div class="bar"><span>${esc(r.label)}</span><div class="track"><div class="fill" style="width:${Math.round(r.anzahl / maxPipeline * 100)}%"></div></div><span class="mono small">${r.anzahl}</span></div>`).join('')}</div>
    </section>

    <div class="grid grid-2 section">
      <section class="card">
        <div class="card-head"><h2>Überarbeitung fällig</h2><span class="more muted">pruefung.naechste in der Vergangenheit</span></div>
        ${ueb.length ? `<div class="rows">${ueb.map(a => `<div class="row" style="cursor:default" tabindex="-1"><div><div class="t">${esc(a.titel || a.handle)}</div><div class="m"><span>${esc(a.bereich)}</span><span class="badge status">${esc(a.status ? statusLabel(a.status) : 'ohne Status')}</span><span style="color:var(--crit)">fällig seit ${fmtDate(a.naechste)} (${a.tageUeberfaellig} Tage)</span></div></div></div>`).join('')}</div>` : emptyState('Keine Überarbeitung fällig.', 'Kein Artikel mit abgelaufenem Prüfdatum.')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Offene Bildbedarfe</h2><span class="more muted">${bilder.offen} offen</span></div>
        ${bilder.items.length ? `<ul class="small muted" style="margin:0;padding-left:18px">${bilder.items.slice(0, 20).map(b => `<li>${esc(b.titel || b.handle)} · ${esc(b.zweck)}</li>`).join('')}</ul>${kappen(bilder.items)}` : emptyState('Keine offenen Bildbedarfe.', '')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Offener Expert Input</h2><span class="more muted">${ei.gesamt} Fragen · ${ei.ratgeber} Ratgeber, ${ei.lexikon} Lexikon</span></div>
        ${ei.items.length ? `<ul class="small muted" style="margin:0;padding-left:18px">${ei.items.slice(0, 20).map(f => `<li><b>${esc(f.titel || f.handle)}</b> (${esc(f.quelle)}): ${esc(f.frage)}</li>`).join('')}</ul>${kappen(ei.items)}` : emptyState('Kein offener Expert Input.', '')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Problem-Finder</h2><span class="more muted">content/probleme</span></div>
        <div class="band" style="margin:0">
          ${bandItem(pf.gesamt, 'Probleme gesamt', 'info')}
          ${bandItem(pf.mitZiel, 'mit Ziel-Artikel', 'ok')}
          ${bandItem(pf.ohneZiel, 'ohne Ziel-Artikel', pf.ohneZiel ? 'warn' : 'ok')}
        </div>
      </section>
    </div>

    <section class="card section">
      <div class="card-head"><h2>Gate (bodenwissen-guard)</h2><span class="more muted">${plural(gate.zahlen?.artikel || 0, 'Artikel', 'Artikel')}, ${plural(gate.zahlen?.lexikon || 0, 'Lexikoneintrag', 'Lexikoneinträge')}, ${plural(gate.zahlen?.probleme || 0, 'Problem', 'Probleme')} geprüft</span></div>
      ${gate.fehler.length ? `<div class="notice crit" style="margin-bottom:8px"><b>${plural(gate.fehler.length, 'Fehler', 'Fehler')}:</b><ul style="margin:6px 0 0;padding-left:18px">${gate.fehler.slice(0, 20).map(f => `<li>${esc(f.ort)}: ${esc(f.text)}</li>`).join('')}</ul>${kappen(gate.fehler)}</div>` : ''}
      ${gate.hinweise.length ? `<div class="notice warn"><b>${plural(gate.hinweise.length, 'Hinweis', 'Hinweise')}:</b><ul style="margin:6px 0 0;padding-left:18px">${gate.hinweise.slice(0, 20).map(h => `<li>${esc(h.ort)}: ${esc(h.text)}</li>`).join('')}</ul>${kappen(gate.hinweise)}</div>` : ''}
      ${!gate.fehler.length && !gate.hinweise.length ? emptyState('Gate ist sauber.', 'npm run bodenwissen:guard meldet weder Fehler noch Hinweise.') : ''}
    </section>

    <section class="card section">
      <div class="card-head"><h2>Suchleistung</h2><span class="more muted">Klicks, Impressionen, CTR, Position</span></div>
      ${emptyState('Daten noch nicht verfügbar.', suchleistungHinweis(d))}
    </section>

    <p class="small muted section">Stand: ${esc(fmtDateTime(d.erzeugtAm))} · erzeugt aus dem Repository, keine externen Aufrufe.</p>`;
}
