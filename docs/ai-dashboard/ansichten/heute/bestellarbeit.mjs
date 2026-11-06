/** Ein Arbeitsbereich fuer den Verkauf: vorhandene Einkaufs- und Packwege direkt erreichen. */
import { esc, plural } from '../../kern/helfer.mjs';
import { ampelPlakette } from '../../bausteine/ampel.mjs';

const MUSTER = '#/einkauf?tab=lieferant&art=muster&af=offen';
const WARE = '#/einkauf?tab=lieferant&art=ware&af=offen';

/**
 * @param {number|null} [anrufe]  Kunden, die nach dem Muster gefragt werden (musterAnrufeOffen, dieselbe Zahl wie
 *        am Menuepunkt "Kunden nach Produkt fragen"); nur die Shop-Uebersicht zeigt sie, und nur ueber 0.
 */
export function bestellarbeitBlock({ arbeit, offeneBestellungen = null, bestellQuelle = null, kontrolle = null, pack = null, lesend = false, nurMuster = false, anrufe = null } = {}) {
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
  // Gepackt heisst seit 06.11. verschickt: "gepackt" zaehlt nur noch, was nie eingetragen wurde - eine Abweichung.
  const packText = { packen: 'Muster packen', klaeren: 'Klärfälle ansehen', warten: 'Wartende Umschläge ansehen', gepackt: 'Versand eintragen' }[packBereich];
  const packHref = packBereich === 'packen' ? '#/kunden?tab=muster' : `#/kunden?tab=muster&mpbereich=${packBereich}`;
  const bestellFehler = bestellQuelle?.verfuegbar === false || bestellQuelle?.fehler;
  const packFehler = pack?.verfuegbar === false || pack?.fehler;
  if (nurMuster) return shopMusterBlock({ bereit, offen, klaerung, laeden, liste, arbeit, p, packBereich, packText, packHref, packFehler, anrufe });
  return `<section class="heute-geschaeft${offen === 0 ? ' heute-geschaeft-ohne-offen' : ''}" aria-labelledby="heuteGeschaeft">
    <div class="heute-geschaeft-kopf"><h2 id="heuteGeschaeft">${nurMuster ? 'Muster bestellen &amp; packen' : 'Muster &amp; Bestellungen'}</h2><p>Neue Musterbestellungen stehen hier automatisch, nach Lieferant gebündelt.</p></div>
    <div class="heute-geschaeft-raster">
      <article class="heute-musterbestellen"><div class="heute-arbeitskopf"><h3>Muster bestellen${offen == null ? '' : ` <span>${offen} Artikel</span>`}</h3><a href="${MUSTER}">Alle ansehen →</a></div>
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
        <article><h3>Packstation &amp; Wareneingang</h3><p${packFehler ? ' class="notice warn" role="status"' : ''}>${p ? `${plural(p.packen, 'Umschlag', 'Umschläge')} packbereit${p.klaeren ? ` · ${p.klaeren} zu klären` : ''}` : packFehler ? 'Der Packstand kann gerade nicht geladen werden. Bitte die Packstation erneut öffnen.' : 'Packstand wird geladen …'}</p>
          ${p?.warten ? `<p><a href="#/kunden?tab=muster&mpbereich=warten">${plural(p.warten, 'Umschlag wartet', 'Umschläge warten')} auf Ware →</a></p>` : ''}
          <div class="btn-row"><a class="btn btn-sm" href="${packHref}">${packText}</a><a class="btn btn-sm btn-ghost" href="#/einkauf?tab=lieferant&af=bestellt">Ware annehmen</a></div>
          ${p?.gepackt ? `<a class="heute-weiter-link" href="#/kunden?tab=muster&mpbereich=gepackt">${plural(p.gepackt, 'Umschlag', 'Umschläge')} gepackt, nicht verschickt · Versand eintragen →</a>` : ''}
        </article>
      </div>
    </div>
  </section>`;
}

/**
 * "Muster & Packstation" auf der Shop-Uebersicht. Jede Zahl steht einmal (Rundgang 06.11.2026, #1996):
 * - Nur Klaerfaelle, nichts Bestellbares: eine Zeile "n Musterartikel: Angaben fehlen – prüfen →" statt
 *   Ueberschrift, Leersatz und zweitem Hinweis mit derselben Zahl und demselben Ziel.
 * - Packstand als ruhige Zahlen, nur ueber 0 (vorher "0 Umschläge packbereit" in Linkblau). Die Zahl mit
 *   demselben Ziel wie der Knopf darunter ist reiner Text - ein Weg je Ziel, der Knopf ist die Handlung.
 * - Gepackt, aber nie eingetragen ist rot wie in der Packstation ("× n Umschläge nicht eingetragen"):
 *   der Kunde hat keine Versandmail. Seit die Aufraeumliste diese Faelle nicht mehr nach 3 Tagen meldet,
 *   ist das die Stelle auf Heute, an der sie auffallen.
 * - "n Kunden nach Produkt fragen →": die taegliche Anrufliste, sonst nur im Menue.
 */
function shopMusterBlock({ bereit, offen, klaerung, laeden, liste, arbeit, p, packBereich, packText, packHref, packFehler, anrufe }) {
  const bestellen = !bereit ? liste
    : offen === 0 ? `<p class="muted">Keine neuen Muster beim Lieferanten zu bestellen. <a href="${MUSTER}">Musterbestellungen ansehen →</a></p>`
      : !laeden.length ? `<p class="notice warn">${plural(klaerung, 'Musterartikel', 'Musterartikel')}: Angaben fehlen – <a href="${MUSTER}">prüfen →</a></p>`
        : `<div class="heute-arbeitskopf"><h3>Muster bestellen · ${offen} Artikel</h3><a href="${MUSTER}">Alle ansehen →</a></div>${liste}
          ${klaerung ? `<p class="small">davon ${plural(klaerung, 'Musterartikel', 'Musterartikel')} mit fehlenden Angaben</p>` : ''}`;
  // Ziel je Packbereich; "packen" oeffnet die Packstation ohne Parameter (dort ist Packbereit die Vorgabe).
  const zahl = (bereich, text) => (bereich === packBereich
    ? `<span class="shop-packzahl">${text}</span>`
    : `<a class="chip shop-packzahl-link" href="#/kunden?tab=muster&amp;mpbereich=${bereich}">${text}</a>`);
  const zahlen = p ? [
    p.warten ? zahl('warten', `${plural(p.warten, 'Umschlag wartet', 'Umschläge warten')} auf Ware`) : '',
    p.klaeren ? zahl('klaeren', `${plural(p.klaeren, 'Umschlag', 'Umschläge')} zu klären`) : '',
    p.packen ? zahl('packen', `${plural(p.packen, 'Umschlag', 'Umschläge')} packbereit`) : '',
    p.gepackt ? (packBereich === 'gepackt' ? ampelPlakette('rot', `${plural(p.gepackt, 'Umschlag', 'Umschläge')} nicht eingetragen`, { titel: GEPACKT_TITEL })
      : `<a class="shop-packzahl-rot" href="#/kunden?tab=muster&amp;mpbereich=gepackt">${ampelPlakette('rot', `${plural(p.gepackt, 'Umschlag', 'Umschläge')} nicht eingetragen`, { titel: GEPACKT_TITEL })}</a>`) : '',
  ].filter(Boolean) : [];
  return `<section class="heute-geschaeft shop-musterarbeit" aria-labelledby="heuteGeschaeft">
    <div class="heute-geschaeft-kopf"><h2 id="heuteGeschaeft">Muster &amp; Packstation</h2></div>
    ${bestellen}
    ${bereit && arbeit.eigen.muster.positionen ? `<p class="small muted">${plural(arbeit.eigen.muster.positionen, 'Musterartikel kommt', 'Musterartikel kommen')} aus eigenem Bestand.</p>` : ''}
    ${p ? (zahlen.length ? `<nav class="shop-packschritte" aria-label="Muster-Arbeitsstand">${zahlen.join('')}</nav>` : '')
      : `<p class="${packFehler ? 'notice warn' : 'muted'}" role="status">${packFehler ? 'Packstand nicht verfügbar. Bitte die Packstation erneut öffnen.' : 'Packstand wird geladen …'}</p>`}
    ${anrufe > 0 ? `<p class="shop-anrufe"><a href="#/kunden?tab=anrufe">${plural(anrufe, 'Kunde', 'Kunden')} nach Produkt fragen →</a></p>` : ''}
    <div class="btn-row"><a class="btn btn-sm" href="${packHref}">${packText}</a>
      <a class="btn btn-sm btn-ghost" href="#/kunden?tab=muster&amp;mp=laden">Muster kommt an</a>
      <a class="btn btn-sm btn-ghost" href="#/lexikon?tab=druckliste">Aufkleber-Druckliste</a></div>
  </section>`;
}

const GEPACKT_TITEL = 'Gepackt, aber nie als verschickt eingetragen – der Kunde hat keine Versandmail';
