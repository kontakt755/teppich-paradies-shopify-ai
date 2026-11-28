/**
 * Ansicht "Onlineshop" (#/onlineshop, nur Inhaber): was je Kauf bleibt und wo der heutige Preis das Ziel
 * nicht erreicht. Zwei Reiter: "Gewinn je Kauf" (Standard) und "Preiskontrolle" (?teil=preise).
 *
 * Alles kommt fertig gerechnet aus /api/onlineshop/gewinn (operations/lib/onlineshop-gewinn.mjs); hier
 * wird nur dargestellt. Die Seite aendert keine Preise und hat keinen Knopf dafuer.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtPreis, fmtDateTime } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';

export const onlineshop = { daten: null, laedt: false, geladenAm: 0 };

// Beim Oeffnen frisch rechnen lassen; jede Zeichnung ruft die Ansicht, eine Minute lang reicht der Stand.
const NEU_LADEN_NACH_MS = 60000;
const JE_SEITE = 25;

function ladeNeu() {
  if (onlineshop.laedt) return;
  onlineshop.laedt = true;
  fetchEinkauf('/api/onlineshop/gewinn').then(d => {
    onlineshop.daten = d;
    onlineshop.laedt = false;
    onlineshop.geladenAm = Date.now();
    if (state.route.view === 'onlineshop') render();
  });
}

const euro = x => (x === null || x === undefined ? '–' : `${fmtPreis(x)} €`);
const euroRund = x => (x === null || x === undefined ? '–' : `${Math.round(x).toLocaleString('de-DE')} €`);
// Knapp unter dem Ziel nicht auf das Ziel runden: 29,9 % statt "30 %" in Bernstein.
const prozent = x => (x === null || x === undefined ? '–' : Math.round(x * 100) === 30 && x < 0.3 ? `${(Math.floor(x * 1000) / 10).toLocaleString('de-DE')} %` : `${Math.round(x * 100)} %`);
const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monatText = m => { const [j, n] = m.split('-').map(Number); return `${MONAT[n - 1]} ${j}`; };
const tag = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const GUETE = { belegt: 'belegt', geschaetzt: 'geschätzt', unbekannt: 'unbekannt' };

/** Rot bei Verlust, Bernstein unter Ziel, sonst ruhig. */
function stufe(quote, ziel) {
  if (quote === null || quote === undefined) return '';
  if (quote < 0) return 'os-crit';
  return quote < ziel ? 'os-warn' : '';
}

function gueteMarke(g) {
  return `<span class="os-guete os-guete-${esc(g)}">${esc(GUETE[g] ?? g)}</span>`;
}

function kopf(d) {
  const ziel = d?.ziel ? Math.round(d.ziel * 100) : 30;
  const stand = d?.stand ? [
    d.stand.bestellungen ? `Bestellungen ${esc(fmtDateTime(d.stand.bestellungen))}` : '',
    d.stand.belege ? `Belege bis ${esc(tag(d.stand.belege))}` : '',
    d.stand.ekListe ? `EK-Liste ${esc(tag(d.stand.ekListe))}` : '',
  ].filter(Boolean).join(' · ') : '';
  const teil = state.route.params.get('teil') === 'preise' ? 'preise' : 'gewinn';
  return `<div class="page-head"><div><h1>Onlineshop</h1>
    <p class="sub">Hier sehen wir, was je Kauf im Onlineshop bleibt und wo der heutige Preis das Ziel von ${ziel} % Rohertrag nicht erreicht.</p>
    ${stand ? `<p class="small muted">Stand: ${stand}</p>` : ''}</div></div>
    <div class="tabs" role="tablist">
      <button type="button" class="tab" role="tab" aria-selected="${teil === 'gewinn'}" data-param="teil" data-value="">Gewinn je Kauf</button>
      <button type="button" class="tab" role="tab" aria-selected="${teil === 'preise'}" data-param="teil" data-value="preise">Preiskontrolle</button>
    </div>`;
}

// ------------------------------------------------------------------ Gewinn je Kauf

function monatsKarte(m, ziel) {
  const quoteText = m.rohertrag === null ? 'Rohertrag unbekannt' : `Rohertrag ${euroRund(m.rohertrag)} <span class="${stufe(m.quote, ziel)}">(${prozent(m.quote)})</span>`;
  const abdeckung = `über ${m.rechenbar} von ${m.kaeufe} Käufen, ${prozent(m.anteilRechenbar)} des Umsatzes rechenbar`;
  return `<article class="card os-monat">
    <h3 class="os-monat-titel">${esc(monatText(m.monat))}</h3>
    <div class="os-monat-zahl">${euroRund(m.umsatzNetto)} <span class="small muted">Umsatz netto</span></div>
    <div>${quoteText}</div>
    <div class="small muted">${esc(abdeckung)}</div>
    ${m.verlust ? `<div class="small os-crit">davon ${m.verlust} ${m.verlust === 1 ? 'Kauf' : 'Käufe'} mit Verlust</div>` : ''}
  </article>`;
}

function kaufZeile(z, ziel) {
  const bekannt = z.rohertrag !== null;
  // Was fehlt, steht offen da; Annahmen und Herkunft der Zahlen nur einen Klick entfernt.
  const fehlt = z.gruende.map(g => `<div class="small os-grund">Fehlt: ${esc(g)}</div>`).join('');
  const annahmen = z.hinweise.length ? `<details class="small muted os-annahmen"><summary>${z.hinweise.length === 1 ? '1 Anmerkung' : `${z.hinweise.length} Anmerkungen`}</summary>${z.hinweise.map(h => `<div>${esc(h)}</div>`).join('')}</details>` : '';
  // Ohne Rechnung bleiben die Kostenzellen leer; am Handy fallen sie ganz weg (Karte statt Zeile).
  const geld = (label, x) => `<td data-l="${label}" class="num${bekannt ? '' : ' os-leer'}">${bekannt ? euro(x) : '–'}</td>`;
  return `<tr>
    <td data-l="Kauf"><div class="cell-title">${esc(z.name)}</div><div class="small muted">${esc(tag(z.datum))}</div>${gueteMarke(z.guete)}</td>
    <td data-l="Ware" class="os-ware">${esc(z.titel)}${fehlt}${annahmen}</td>
    <td data-l="Erlös netto" class="num">${euro(z.netto)}</td>
    ${geld('Einkauf', z.ware)}
    ${geld('Ketteln, Zuschläge', bekannt ? z.kettel + z.zuschlag : null)}
    ${geld('Weg zum Kunden', z.weg)}
    ${geld('Gebühr', z.gebuehr)}
    <td data-l="Rohertrag" class="num ${stufe(z.quote, ziel)}${bekannt ? '' : ' os-leer'}"><b>${bekannt ? euro(z.rohertrag) : '–'}</b>${bekannt ? `<div class="small">${prozent(z.quote)}</div>` : ''}</td>
  </tr>`;
}

function seitenLeiste(anzahl, seite, param = 'seite') {
  const seiten = Math.ceil(anzahl / JE_SEITE);
  if (seiten <= 1) return '';
  return `<div class="os-seiten">${Array.from({ length: seiten }, (_, i) => `<button type="button" class="chip" aria-pressed="${i + 1 === seite}" data-param="${param}" data-value="${i + 1 === 1 ? '' : i + 1}">Seite ${i + 1}</button>`).join('')}</div>`;
}

function teilGewinn(d) {
  const ziel = d.ziel;
  const filter = state.route.params.get('g') || '';
  const alle = d.kaeufe;
  const unter = alle.filter(z => z.quote !== null && z.quote < ziel);
  const unbekannt = alle.filter(z => z.guete === 'unbekannt');
  const liste = filter === 'unter' ? unter : filter === 'unbekannt' ? unbekannt : alle;
  const seite = Math.max(1, Number(state.route.params.get('seite')) || 1);
  const sichtbar = liste.slice((seite - 1) * JE_SEITE, seite * JE_SEITE);
  const chip = (wert, text, n) => `<button type="button" class="chip" aria-pressed="${filter === wert}" data-param="g" data-value="${wert}">${text}<span class="chip-zahl">${n}</span></button>`;
  const aus = d.ausgeschlossen || {};
  const ausText = [aus.muster && `${aus.muster} Muster­bestellungen`, aus.storniert && `${aus.storniert} storniert`, aus.erstattet && `${aus.erstattet} ganz erstattet`, aus.test && `${aus.test} Test`, aus.unbezahlt && `${aus.unbezahlt} nicht bezahlt`].filter(Boolean).join(', ');
  return `<section class="os-monate">${d.monate.map(m => monatsKarte(m, ziel)).join('')}</section>
    <p class="small muted os-erklaerung">Rohertrag = Erlös netto minus Einkauf, Ketteln und Zuschläge, Weg zum Kunden und Zahlungsgebühr. Summen zählen nur Käufe, deren Kosten bekannt sind. Werbung, Muster und Arbeitszeit sind nicht enthalten.${ausText ? ` Nicht gezählt: ${esc(ausText)}.` : ''}</p>
    <div class="chips">${chip('', 'Alle Käufe', alle.length)}${chip('unter', `Unter ${Math.round(ziel * 100)} %`, unter.length)}${chip('unbekannt', 'Kosten unbekannt', unbekannt.length)}</div>
    ${sichtbar.length ? `<div class="table-scroll"><table class="tasks compact os-tabelle"><thead><tr>
      <th>Kauf</th><th>Ware</th><th class="num">Erlös netto</th><th class="num">Einkauf</th><th class="num">Ketteln, Zuschläge</th><th class="num">Weg</th><th class="num">Gebühr</th><th class="num">Rohertrag</th>
    </tr></thead><tbody>${sichtbar.map(z => kaufZeile(z, ziel)).join('')}</tbody></table></div>${seitenLeiste(liste.length, seite)}`
    : emptyState('Keine Käufe in dieser Auswahl.', '')}`;
}

// ------------------------------------------------------------------ Preiskontrolle

function preisFallZeile(f) {
  return `<tr>
    <td data-l="Produkt"><div class="cell-title">${esc(f.titel)}</div><div class="small muted">${esc(f.variante)}</div></td>
    <td data-l="Verkauft zu" class="num">${euro(f.verkauftBrutto)} <span class="small muted">${esc(f.einheit)}</span></td>
    <td data-l="Heute" class="num">${f.heuteBrutto === null ? '<span class="muted">nicht im Shop gefunden</span>' : euro(f.heuteBrutto)}</td>
    <td data-l="Nötig mindestens" class="num ${f.verlust ? 'os-crit' : 'os-warn'}"><b>${euro(f.noetigBrutto)}</b></td>
    <td data-l="Käufe">${esc(f.kaeufe.join(', '))}${f.mitKante ? `<div class="small muted">mit Kante${f.mitKettelservice ? ' und Kettelservice' : ''}, bei diesem Maß</div>` : ''}</td>
    <td data-l="Güte">${gueteMarke(f.guete)}</td>
  </tr>`;
}

const URSACHE_TEXT = { ware: 'Ware', kante: 'Kante', verschnitt: 'Verschnitt', zuschlag: 'Lieferzuschläge', weg: 'Weg zum Kunden', gebuehr: 'Zahlungsgebühr' };

function kaufFallZeile(f, ziel) {
  return `<tr>
    <td data-l="Kauf"><div class="cell-title">${esc(f.name)}</div><div class="small muted">${esc(tag(f.datum))}</div>${gueteMarke(f.guete)}</td>
    <td data-l="Ware" class="os-ware">${esc(f.titel)}</td>
    <td data-l="Erlös brutto" class="num">${euro(f.brutto)}</td>
    <td data-l="Hätte mindestens bringen müssen" class="num ${f.quote < 0 ? 'os-crit' : 'os-warn'}"><b>${euro(f.mindestBrutto)}</b>${f.mehrBrutto > 0 ? `<div class="small">${euro(f.mehrBrutto)} mehr</div>` : ''}</td>
    <td data-l="Rohertrag" class="num ${stufe(f.quote, ziel)}">${prozent(f.quote)}</td>
    <td data-l="Größte Ursache"><b>${esc(URSACHE_TEXT[f.groesste] ?? f.groesste)}</b> ${euro(f.groessteBetrag)}<div class="small muted">${f.stand === 'angehoben' ? `${f.ursache === 'preis' ? 'Warenpreis' : 'Preis'} reicht inzwischen (heute ${euro(f.heuteBrutto)} für diesen Kauf)` : esc(f.hinweis)}</div></td>
  </tr>`;
}

const KANTE_TEXT = { enthalten: 'Kante im Einkaufspreis', mitgerechnet: 'Kante mitgerechnet', kettelservice: 'Kante und Kettelservice mitgerechnet', ohne: 'ohne Kante gerechnet' };

function sortimentZeile(p, ziel) {
  const [von, bis] = p.heuteBrutto;
  return `<tr>
    <td data-l="Produkt"><div class="cell-title">${esc(p.titel)}</div><div class="small muted">${esc(p.gruppe)}${p.verkauft ? ' · schon verkauft' : ''}${p.kante ? ` · ${esc(KANTE_TEXT[p.kante])}` : ''}</div></td>
    <td data-l="Varianten unter Ziel" class="num">${p.varianten}${p.verlustVarianten ? ` <span class="os-crit">(${p.verlustVarianten} mit Verlust)</span>` : ''}</td>
    <td data-l="Rohertrag heute" class="num ${stufe(p.schlechtesteQuote, ziel)}">${von === bis ? '' : 'ab '}${prozent(p.schlechtesteQuote)}</td>
    <td data-l="Preis heute" class="num">${von === bis ? euro(von) : `${euro(von)} bis ${euro(bis)}`} <span class="small muted">${esc(p.einheit)}</span></td>
    <td data-l="Nötig mindestens" class="num ${p.verlust ? 'os-crit' : 'os-warn'}"><b>${euro(p.noetigBrutto)}</b></td>
    <td data-l="Güte">${gueteMarke(p.guete)}</td>
  </tr>`;
}

function teilPreise(d) {
  const ziel = d.ziel;
  const zielText = `${Math.round(ziel * 100)} %`;
  const k = d.kaeufeKontrolle;
  const offen = k.preisFaelle.filter(f => f.stand !== 'angehoben');
  const angehoben = k.preisFaelle.filter(f => f.stand === 'angehoben');
  const s = d.sortiment;
  const seite = Math.max(1, Number(state.route.params.get('sseite')) || 1);
  const zahl = n => Number(n).toLocaleString('de-DE');
  const ref = d.kanteReferenz ? `${d.kanteReferenz.breiteCm} × ${d.kanteReferenz.laengeCm} cm` : 'ein Referenzmaß';
  return `<p class="os-regel">Ziel: ${zielText} Rohertrag vom Netto. <span class="os-crit">Rot</span> heißt Verlust, <span class="os-warn">Bernstein</span> unter Ziel. Maßgeblich ist immer der heutige Shop-Preis; alle Preise brutto mit 19 %. Preise ändert nur der Inhaber, diese Seite ändert nichts.</p>
    <section class="os-abschnitt"><h2>Käufe unter ${zielText}: was sie hätten bringen müssen</h2>
      <p class="small muted">Mindestbetrag brutto, damit nach Einkauf, Kante, Verschnitt, Zuschlägen, Weg und Zahlungsgebühr ${zielText} bleiben. Ketteln und Einfassen gehören bei Maßware zu den Herstellkosten: Reichen Ware und Kante nicht, ist es der Preis.</p>
      ${k.kaufFaelle.length ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Kauf</th><th>Ware</th><th class="num">Erlös brutto</th><th class="num">Hätte mindestens bringen müssen</th><th class="num">Rohertrag</th><th>Größte Ursache</th></tr></thead><tbody>${k.kaufFaelle.map(f => kaufFallZeile(f, ziel)).join('')}</tbody></table></div>`
        : emptyState('Kein rechenbarer Kauf unter dem Ziel.', '')}
    </section>
    <section class="os-abschnitt"><h2>Produkte, deren Preis nicht reicht</h2>
      <p class="small muted">Aus den Käufen oben: Ware (und Kante, wenn sie dieser Ware gehört) lässt weniger als ${zielText}. Nötig ist mindestens der genannte Preis je Verkaufseinheit, ohne Versand.</p>
      ${offen.length ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Produkt</th><th class="num">Verkauft zu</th><th class="num">Heute</th><th class="num">Nötig mindestens</th><th>Käufe</th><th>Güte</th></tr></thead><tbody>${offen.map(preisFallZeile).join('')}</tbody></table></div>`
        : emptyState('Kein offener Preisfall aus Käufen.', angehoben.length ? 'Alle zu günstig verkauften Produkte sind inzwischen angehoben.' : '')}
      ${angehoben.length ? `<p class="small muted">Inzwischen angehoben: ${angehoben.map(f => `${esc(f.titel)} (${esc(f.kaeufe.join(', '))}: damals ${euro(f.verkauftBrutto)}, heute ${euro(f.heuteBrutto)})`).join('; ')}.</p>` : ''}
    </section>
    <section class="os-abschnitt"><h2>Ganzes Sortiment: heutiger Preis gegen Einkauf</h2>
      <p class="small muted">Aktive Varianten mit Einkaufspreis, ohne Versand und Zuschläge. Zuerst Verlust, dann schon verkaufte Produkte. Bei Teppich nach Maß, dessen Einkauf nur das Material nennt, ist die Kante für ${esc(ref)} mit dem Kettlertarif mitgerechnet, ebenso der Kettelservice, den der Kunde dafür extra zahlt (${zahl(s.kanteMitgerechnet ?? 0)} Varianten); kleinere Teppiche brauchen mehr Kante je m². „Nötig mindestens“ ist der Preis der Variante ohne Kettelservice.${s.ohneKante ? ` ${zahl(s.ohneKante)} Varianten sind ohne Kante gerechnet, weil nicht belegt ist, ob sie im Einkauf steckt.` : ''}</p>
      <p class="os-zaehler">${zahl(s.geprueft)} Varianten geprüft · ${zahl(s.ohneEk)} ohne Einkaufspreis · ${zahl(s.nichtVergleichbar)} nicht vergleichbar · <b>${zahl(s.unterZiel)} unter Ziel</b>${s.verlust ? ` · <b class="os-crit">${zahl(s.verlust)} mit Verlust</b>` : ' · keine mit Verlust'}</p>
      ${s.produkte.length ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Produkt</th><th class="num">Varianten unter Ziel</th><th class="num">Rohertrag heute</th><th class="num">Preis heute</th><th class="num">Nötig mindestens</th><th>Güte</th></tr></thead><tbody>${s.produkte.slice((seite - 1) * JE_SEITE, seite * JE_SEITE).map(p => sortimentZeile(p, ziel)).join('')}</tbody></table></div>${seitenLeiste(s.produkte.length, seite, 'sseite')}`
        : emptyState('Im Sortiment liegt kein heutiger Preis unter dem Ziel.', '')}
      ${s.nichtVergleichbarGruende.length ? `<details class="os-details"><summary>Nicht vergleichbar: ${zahl(s.nichtVergleichbar)} Varianten</summary>
        <p class="small muted">Einkaufs- und Verkaufseinheit passen nicht eindeutig zusammen. Diese Varianten werden nicht geraten, sondern bleiben hier.</p>
        <ul class="small">${s.nichtVergleichbarGruende.map(g => `<li>${esc(g.grund)}: ${zahl(g.anzahl)} (z. B. ${esc(g.beispiele.join(', '))})</li>`).join('')}</ul></details>` : ''}
      <p class="small muted">„Geschätzt“ heißt: Einkauf aus der abgeleiteten EK-Liste, nicht aus einer Händlerpreisliste.</p>
    </section>`;
}

export function viewOnlineshop() {
  if (!onlineshop.laedt && Date.now() - onlineshop.geladenAm > NEU_LADEN_NACH_MS) ladeNeu();
  const d = onlineshop.daten;
  if (!d) return kopf(null) + '<div class="empty">Lade Onlineshop …</div>';
  if (d.fehler) return kopf(null) + stoerungState(d, 'Der Onlineshop-Gewinn');
  if (d.nurInhaber) return kopf(null) + emptyState('Gewinn und Preise sieht nur der Inhaber.', '');
  if (!d.verfuegbar) return kopf(null) + emptyState('Noch keine Bestelldaten auf diesem Rechner.', d.hinweis || '');
  const hinweise = (d.hinweise || []).map(h => `<div class="notice warn">${esc(h)}</div>`).join('');
  const teil = state.route.params.get('teil') === 'preise' ? teilPreise(d) : teilGewinn(d);
  return kopf(d) + hinweise + teil;
}
