/** Ein Arbeitsbereich fuer den Verkauf: vorhandene Einkaufs- und Packwege direkt erreichen. */
import { esc, plural } from '../../kern/helfer.mjs';

const MUSTER = '#/einkauf?tab=lieferant&art=muster&af=offen';
const WARE = '#/einkauf?tab=lieferant&art=ware&af=offen';

export function bestellarbeitBlock({ arbeit, offeneBestellungen = null, bestellQuelle = null, kontrolle = null, pack = null, lesend = false, nurMuster = false } = {}) {
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
  const packBereich = !p || p.packen ? 'packen' : p.klaeren ? 'klaeren' : p.warten ? 'warten' : p.gepackt ? 'gepackt' : 'packen';
  const packText = { packen: 'Muster packen', klaeren: 'Klärfälle ansehen', warten: 'Wartende Umschläge ansehen', gepackt: 'Versand vorbereiten' }[packBereich];
  const packHref = packBereich === 'packen' ? '#/kunden?tab=muster' : `#/kunden?tab=muster&mpbereich=${packBereich}`;
  const bestellFehler = bestellQuelle?.verfuegbar === false || bestellQuelle?.fehler;
  const packFehler = pack?.verfuegbar === false || pack?.fehler;
  if (nurMuster) return `<section class="heute-geschaeft shop-musterarbeit" aria-labelledby="heuteGeschaeft">
    <div class="heute-geschaeft-kopf"><h2 id="heuteGeschaeft">Muster &amp; Packstation</h2></div>
    ${bereit && offen === 0 ? `<p class="muted">Keine neuen Muster beim Lieferanten zu bestellen. <a href="${MUSTER}">Musterbestellungen ansehen →</a></p>`
      : `<div class="heute-arbeitskopf"><h3>Muster bestellen${offen == null ? '' : ` · ${offen}`}</h3><a href="${MUSTER}">Alle ansehen →</a></div>${liste}`}
    ${klaerung ? `<p class="notice warn">${plural(klaerung, 'Musterartikel braucht', 'Musterartikel brauchen')} Klärung. <a href="${MUSTER}">Fehlende Angaben prüfen →</a></p>` : ''}
    ${bereit && arbeit.eigen.muster.positionen ? `<p class="small muted">${plural(arbeit.eigen.muster.positionen, 'Musterartikel kommt', 'Musterartikel kommen')} aus eigenem Bestand.</p>` : ''}
    ${p ? `<nav class="shop-packschritte" aria-label="Muster-Arbeitsstand">
      <a class="chip" href="#/kunden?tab=muster&amp;mpbereich=warten">${p.warten || 0} warten auf Ware</a>
      <a class="chip${p.klaeren ? ' warn' : ''}" href="#/kunden?tab=muster&amp;mpbereich=klaeren">${p.klaeren || 0} zu klären</a>
      <a class="chip" href="#/kunden?tab=muster&amp;mpbereich=packen">${p.packen || 0} packbereit</a>
      <a class="chip" href="#/kunden?tab=muster&amp;mpbereich=gepackt">${p.gepackt || 0} gepackt · Versand vorbereiten</a>
    </nav>` : `<p class="${packFehler ? 'notice warn' : 'muted'}" role="status">${packFehler ? 'Packstand nicht verfügbar. Bitte die Packstation erneut öffnen.' : 'Packstand wird geladen …'}</p>`}
    <div class="btn-row"><a class="btn btn-sm" href="${packHref}">${packText}</a>
      <a class="btn btn-sm btn-ghost" href="#/kunden?tab=muster&amp;mp=laden">Muster kommt an</a>
      <a class="btn btn-sm btn-ghost" href="#/lexikon?tab=druckliste">Aufkleber-Druckliste</a></div>
  </section>`;
  return `<section class="heute-geschaeft${offen === 0 ? ' heute-geschaeft-ohne-offen' : ''}" aria-labelledby="heuteGeschaeft">
    <div class="heute-geschaeft-kopf"><h2 id="heuteGeschaeft">${nurMuster ? 'Muster bestellen &amp; packen' : 'Muster &amp; Bestellungen'}</h2><p>Neue Musterbestellungen stehen hier automatisch, nach Lieferant gebündelt.</p></div>
    <div class="heute-geschaeft-raster">
      <article class="heute-musterbestellen"><div class="heute-arbeitskopf"><h3>Muster bestellen${offen == null ? '' : ` <span>${offen}</span>`}</h3><a href="${MUSTER}">Alle ansehen →</a></div>
        ${liste}
        ${klaerung ? `<p class="notice warn">${plural(klaerung, 'Musterartikel braucht', 'Musterartikel brauchen')} Klärung. <a href="${MUSTER}">Fehlende Angaben prüfen →</a></p>` : ''}
        ${bereit && arbeit.eigen.muster.positionen ? `<p class="small muted">${plural(arbeit.eigen.muster.positionen, 'Musterartikel kommt', 'Musterartikel kommen')} aus eigenem Bestand. <a href="#/kunden?tab=muster">In der Packstation prüfen →</a></p>` : ''}
        ${laeden.length ? '<p class="small muted">Im nächsten Schritt prüfst du Lieferziel und fehlende Angaben. Erst die bewusste Bestätigung setzt den Bestellstand.</p>' : ''}
      </article>
      <div class="heute-geschaeft-weiter">
        ${nurMuster ? '' : `<article><h3>Kundenbestellungen</h3><p${bestellFehler ? ' class="notice warn" role="status"' : ''}>${bestellFehler ? 'Bestellungen können gerade nicht geladen werden. Bitte die Bestellliste erneut öffnen.' : offeneBestellungen === null ? 'Bestellungen werden geladen …' : `${plural(offeneBestellungen, 'Bestellung ist', 'Bestellungen sind')} noch offen.`}</p>
          ${kontrolle ? `<p class="notice warn"><a href="#/kunden?tab=bestellungen&bfilter=pruefen">${plural(kontrolle, 'Bestellung braucht', 'Bestellungen brauchen')} Kontrolle →</a></p>` : ''}
          <div class="btn-row"><a class="btn btn-sm" href="#/kunden?tab=bestellungen&bsort=wichtigkeit">Dringendes bearbeiten</a><a class="btn btn-sm btn-ghost" href="#/kunden?tab=bestellungen&bfilter=fertig">Fertige ansehen</a></div>
          <a class="heute-weiter-link" href="${WARE}">Ware beim Lieferanten bestellen${bereit && arbeit.gesamt.ware.positionen ? ` · ${arbeit.gesamt.ware.positionen} Artikel` : ''} →</a>
        </article>`}
        <article><h3>Packstation &amp; Wareneingang</h3><p${packFehler ? ' class="notice warn" role="status"' : ''}>${p ? `${p.packen} packbereit${p.klaeren ? ` · ${p.klaeren} zu klären` : ''}` : packFehler ? 'Der Packstand kann gerade nicht geladen werden. Bitte die Packstation erneut öffnen.' : 'Packstand wird geladen …'}</p>
          ${p?.warten ? `<p><a href="#/kunden?tab=muster&mpbereich=warten">${plural(p.warten, 'Umschlag wartet', 'Umschläge warten')} auf Ware →</a></p>` : ''}
          <div class="btn-row"><a class="btn btn-sm" href="${packHref}">${packText}</a><a class="btn btn-sm btn-ghost" href="#/einkauf?tab=lieferant&af=bestellt">Ware annehmen</a></div>
          <a class="heute-weiter-link" href="#/kunden?tab=muster&mpbereich=gepackt">${p ? `${p.gepackt} gepackte Umschläge` : 'Gepackte Umschläge'} · Versand vorbereiten →</a>
        </article>
      </div>
    </div>
  </section>`;
}
