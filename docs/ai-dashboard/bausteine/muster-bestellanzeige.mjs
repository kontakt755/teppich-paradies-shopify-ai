import { esc, fmtDateTime } from '../kern/helfer.mjs';

export function musterAutomatikHtml(a) {
  const zeilen = [];
  for (const s of a.bestellt || []) {
    const inhalt = s.positionen.map(p => [p.menge + '×', p.titel, p.farbe].filter(Boolean).join(' ')).join(' · ');
    zeilen.push(`<div class="bq-inhalt-zeile"><strong>Muster bestellt</strong> · ${esc(fmtDateTime(s.am))} · ${esc(inhalt)} · an ${esc(s.an)} · ${s.lieferziel === 'kunde' ? 'direkt zum Kunden' : 'zu uns ins Geschäft'}</div>`);
  }
  if (a.geplant) zeilen.push('<div class="bq-inhalt-zeile">Muster werden automatisch bestellt.</div>');
  const gruende = [...new Set((a.klaeren || []).map(p => [p.titel, p.farbe, p.grund].filter(Boolean).join(' · ')))];
  if (gruende.length) zeilen.push(`<div class="bq-inhalt-zeile"><strong>Muster: Klärung nötig</strong> · ${esc(gruende.join('; '))}</div>`);
  return zeilen.join('');
}

export function musterAutomatikBlock(daten, jetzt = Date.now()) {
  const a = daten?.musterAutomatik;
  if (!a?.aktiv && !a?.hinweis) return '';
  const aktuelle = (daten.zeilen || []).filter(z => z.musterAutomatik && ((z.musterAutomatik.klaeren || []).length || z.musterAutomatik.geplant || (z.musterAutomatik.bestellt || []).some(s => Date.parse(s.am) >= jetzt - 7 * 864e5)))
    .sort((x, y) => String(y.musterAutomatik.bestellt?.at(-1)?.am || y.datum || '').localeCompare(String(x.musterAutomatik.bestellt?.at(-1)?.am || x.datum || '')));
  return `<section class="card" aria-label="Automatische Musterbestellungen"><h2>Musterbestellungen automatisch</h2>
    ${a.hinweis ? `<p class="notice warn">${esc(a.hinweis)}</p>` : '<p class="small muted">Neue vollständige, kostenlose Muster bestellen wir automatisch. Hier siehst du das Ergebnis.</p>'}
    ${aktuelle.slice(0, 5).map(z => `<div class="row"><div><div class="t">${esc(z.kundenname || 'Kunde')} · ${esc(z.orderName)}</div>${musterAutomatikHtml(z.musterAutomatik)}</div></div>`).join('')}
    ${aktuelle.length ? '' : '<p>Aktuell keine neue Musterbestellung.</p>'}
    <a class="btn btn-sm" href="#/kunden?tab=bestellungen&bart=muster">Alle Musterbestellungen ansehen</a>
  </section>`;
}
