/** Ein Arbeitsbereich fuer den Verkauf: vorhandene Einkaufs- und Packwege direkt erreichen. */
import { esc, plural } from '../../kern/helfer.mjs';

const MUSTER = '#/einkauf?tab=lieferant&art=muster&af=offen';
const WARE = '#/einkauf?tab=lieferant&art=ware&af=offen';

export function bestellarbeitBlock({ arbeit, offeneBestellungen = null, pack = null, lesend = false } = {}) {
  const bereit = arbeit?.verfuegbar;
  const laeden = bereit ? arbeit.lieferanten.filter(l => l.muster.positionen) : [];
  const offen = bereit ? arbeit.gesamt.muster.positionen : null;
  const klaerung = bereit ? arbeit.blockiert.muster.positionen + arbeit.nichtZugeordnet.muster.positionen : 0;
  const zeile = l => `<div class="heute-bestellzeile">
    <div><strong>${esc(l.name)}</strong><p>${plural(l.muster.kunden, 'Kundenbestellung', 'Kundenbestellungen')} · ${plural(l.muster.positionen, 'Musterartikel', 'Musterartikel')}${l.muster.aeltesteTage > 0 ? ` · wartet seit ${plural(l.muster.aeltesteTage, 'Tag', 'Tagen')}` : ''}</p></div>
    ${lesend ? `<a class="btn btn-sm" href="${MUSTER}&amp;lf=${encodeURIComponent(l.id)}">Ansehen</a>` : `<button type="button" class="btn btn-sm btn-primary" data-lf-mail="${esc(l.id)}" data-lf-art="muster">Bestellung vorbereiten</button>`}
  </div>`;
  const liste = !bereit ? `<p class="${arbeit?.laedt ? 'muted' : 'notice warn'}" role="status">${esc(arbeit?.hinweis || 'Musterbestellungen werden geladen …')}</p>`
    : laeden.length ? `${laeden.slice(0, 3).map(zeile).join('')}${laeden.length > 3 ? `<details><summary>${laeden.length - 3} weitere Lieferanten</summary>${laeden.slice(3).map(zeile).join('')}</details>` : ''}`
      : `<p class="muted">${klaerung ? 'Vor dem Bestellen müssen noch Angaben geklärt werden.' : 'Gerade keine Muster beim Lieferanten zu bestellen.'}</p>`;
  const p = pack?.verfuegbar ? pack.zahlen : null;
  const packHref = p && !p.packen && p.klaeren ? '#/kunden?tab=muster&mpbereich=klaeren' : '#/kunden?tab=muster';
  return `<section class="heute-geschaeft${offen === 0 ? ' heute-geschaeft-ohne-offen' : ''}" aria-labelledby="heuteGeschaeft">
    <div class="heute-geschaeft-kopf"><h2 id="heuteGeschaeft">Muster &amp; Bestellungen</h2><p>Neue Musterbestellungen stehen hier automatisch, nach Lieferant gebündelt.</p></div>
    <div class="heute-geschaeft-raster">
      <article class="heute-musterbestellen"><div class="heute-arbeitskopf"><h3>Muster bestellen${offen == null ? '' : ` <span>${offen}</span>`}</h3><a href="${MUSTER}">Alle ansehen →</a></div>
        ${liste}
        ${klaerung ? `<p class="notice warn">${plural(klaerung, 'Musterartikel braucht', 'Musterartikel brauchen')} Klärung. <a href="${MUSTER}">Fehlende Angaben prüfen →</a></p>` : ''}
        ${bereit && arbeit.eigen.muster.positionen ? `<p class="small muted">${plural(arbeit.eigen.muster.positionen, 'Musterartikel kommt', 'Musterartikel kommen')} aus eigenem Bestand. <a href="#/kunden?tab=muster">In der Packstation prüfen →</a></p>` : ''}
        ${laeden.length ? '<p class="small muted">Im nächsten Schritt prüfst du Lieferziel und fehlende Angaben. Erst die bewusste Bestätigung setzt den Bestellstand.</p>' : ''}
      </article>
      <div class="heute-geschaeft-weiter">
        <article><h3>Kundenbestellungen</h3><p>${offeneBestellungen === null ? 'Bestellungen werden geladen …' : `${plural(offeneBestellungen, 'Bestellung ist', 'Bestellungen sind')} noch offen.`}</p>
          <div class="btn-row"><a class="btn btn-sm" href="#/kunden?tab=bestellungen">Offene bearbeiten</a><a class="btn btn-sm btn-ghost" href="#/kunden?tab=bestellungen&bfilter=fertig">Fertige ansehen</a></div>
          <a class="heute-weiter-link" href="${WARE}">Ware beim Lieferanten bestellen${bereit && arbeit.gesamt.ware.positionen ? ` · ${arbeit.gesamt.ware.positionen} Artikel` : ''} →</a>
        </article>
        <article><h3>Packstation &amp; Wareneingang</h3><p>${p ? `${p.packen} packbereit${p.klaeren ? ` · ${p.klaeren} zu klären` : ''}` : 'Packstand wird geladen …'}</p>
          <div class="btn-row"><a class="btn btn-sm" href="${packHref}">${p && !p.packen && p.klaeren ? 'Klärfälle ansehen' : 'Muster packen'}</a><a class="btn btn-sm btn-ghost" href="#/einkauf?tab=lieferant&af=bestellt">Ware annehmen</a></div>
          <a class="heute-weiter-link" href="#/kunden?tab=muster&mpbereich=gepackt">${p ? `${p.gepackt} gepackte Umschläge` : 'Gepackte Umschläge'} · Versand vorbereiten →</a>
        </article>
      </div>
    </div>
  </section>`;
}
