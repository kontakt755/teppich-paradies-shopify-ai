/**
 * Einkauf, Reiter "Bestellungen": eine Karte je Lieferant (ansichten/einkauf/lieferanten.mjs),
 * darin aufklappbar die Tabellen je Lieferweg und Kunde; dazu Auftragszeilen, Filter nach
 * Stand im Auftragsfluss, abgeschlossene Auftraege.
 */
import { gruppierePositionenNachKunde } from '../../lib/einkauf-kundengruppen.mjs';
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, plural, geldText } from '../../kern/helfer.mjs';
import { emptyState, stoerungState, bandItem } from '../../bausteine/karten.mjs';
import {
  einkaufPositionenMitStand, auftragOffenePositionen, aktiveAuftraege, einkauf, AF_STATUS_LABEL,
  afNaechsterStatus, afFilterGruppe, LIEFERWEG_LABEL, afWartetage, afWarteText, afWarteKlasse,
  ensureEinkaufBestellungen, ensureEinkaufAuftragsstatus, alleAuftraege, erledigtePositionen,
  sammelGruppen, anzeigeWert, afEintragFuer, hatLieferantLink, positionUnvollstaendig,
} from './auftragsfluss.mjs';
import { lieferantenKartenHtml } from './lieferanten.mjs';

function kopierbutton(id, label = 'Liste kopieren') {
  return `<button type="button" class="btn btn-sm" data-kopieren="${esc(id)}">${esc(label)}</button>`;
}

const EINKAUF_AMPEL_LABEL = { gruen: 'Bereit', gelb: 'Prüfen', rot: 'Blockiert', grau: 'Geschlossen', test: 'Testbestellung' };

/** Lieferanten-Link oder kurzer Hinweis, warum keiner hinterlegt ist. */
function lieferantLinkZelle(p) {
  // Zwei Wege zum Originalartikel: direkt zum Lieferanten, wenn eine
  // Produktseite hinterlegt ist - und immer ins Lexikon, wo Originalname,
  // Artikelnummer, Farbnummer und Bestellweg beieinanderstehen. Ohne den
  // Lexikon-Weg bliebe die Zelle bei fehlender URL eine Sackgasse.
  const lex = p.handle
    ? `<div style="margin-top:4px"><a class="btn btn-sm btn-ghost" href="#" data-lex-open="${esc(p.handle)}" title="Originalname, Artikelnummer und Bestellweg im Lexikon">Im Lexikon ansehen</a></div>`
    : '';
  if (hatLieferantLink(p)) {
    return `<a class="btn btn-sm" href="${esc(p.lieferantUrl)}" target="_blank" rel="noopener" title="Produktseite beim Lieferanten in neuem Tab">Beim Lieferanten öffnen ↗</a>${lex}`;
  }
  return `<span class="small muted" title="Metafeld einkauf.lieferant_url fehlt">kein Link</span>${lex}`;
}

/** Status-Zelle: aktueller Stand + Knopf fuer den naechsten Schritt. */
// Knopftext ist eine Handlung ("Als X markieren"), nicht eine Wiederholung des
// danebenstehenden Standtexts - sonst lesen sich "Stand: Noch nicht bestellt"
// und "→ Bestellt" wie zwei widersprüchliche Zustände (Inhaber-Feedback).
const AF_AKTIONS_LABEL = { bestellt: 'Als bestellt markieren', geliefert: 'Als geliefert markieren', raus: 'Als raus zum Kunden markieren', erledigt: 'Als erledigt markieren' };

function afStatusZelle(p) {
  const eintrag = afEintragFuer(p);
  const status = eintrag?.status || null;
  const tage = afWartetage(eintrag);
  const warte = tage === null ? '' : `<div class="small ${afWarteKlasse(tage)}" title="${esc(AF_STATUS_LABEL[status])} am ${esc(fmtDate(eintrag[`${status}Am`]))}">${esc(afWarteText(tage))}</div>`;
  const grund = status === 'erledigt' && eintrag.erledigtNotiz ? `<div class="small muted">Grund: ${esc(eintrag.erledigtNotiz)}</div>` : '';
  const nr = eintrag?.lieferantBestellnummer ? `<div class="small muted">Bestellnr. ${esc(eintrag.lieferantBestellnummer)}</div>` : '';
  const naechster = afNaechsterStatus(status);
  const btn = naechster ? `<button type="button" class="btn btn-sm" data-af-set data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}" data-af-status="${naechster}" data-af-name="${esc(p.orderName)}" data-af-titel="${esc(p.titel)}" data-af-farbe="${esc(p.farbe)}">${esc(AF_AKTIONS_LABEL[naechster])}</button>`
    : status === 'erledigt' ? `<button type="button" class="btn btn-sm btn-ghost" data-af-reopen="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}" title="Abschluss rückgängig machen">Wieder öffnen…</button>` : '';
  // Der Stand ist ein ruhiger Text, kein zweiter Knopf - deshalb kein "badge status" mehr.
  const zusatz = status ? ` · ${fmtDateTime(eintrag.aktualisiertAm)} · @${esc(eintrag.aktualisiertVon)}`
    : eintrag?.wiederGeoeffnetAm ? ` · wieder geöffnet ${fmtDateTime(eintrag.wiederGeoeffnetAm)} · @${esc(eintrag.wiederGeoeffnetVon)}` : '';
  const stand = `<div class="small muted">Stand: ${esc(status ? AF_STATUS_LABEL[status] : 'Noch nicht bestellt')}${zusatz}</div>`;
  return `${stand}${warte}${grund}${nr}${btn ? `<div style="margin-top:6px">${btn}</div>` : ''}`;
}

/**
 * Tabelle einer Gruppe (Lieferant + Lieferweg). `eingebettet`: steht in der Karte des
 * Lieferanten - dann nennt die Ueberschrift nur noch Ware/Muster und den Lieferweg.
 */
function einkaufGruppeKarte(g, i, praefix, { eingebettet = false } = {}) {
  const id = `ek-${praefix}-${i}`;
  const af = state.route.params.get('af') || '';
  // Ohne Filter zeigt die Liste alles, was noch Arbeit macht - "Erledigt" nur auf Wunsch.
  const positionen = g.positionen.filter(p => { const gr = afFilterGruppe(afEintragFuer(p)?.status); return af ? gr === af : gr !== 'erledigt'; });
  if (!positionen.length) return '';
  const kundengruppen = gruppierePositionenNachKunde(positionen, einkauf.bestellungen?.auftraege || []);
  const sortiertePositionen = kundengruppen.flatMap(gruppe => gruppe.positionen);
  const unbekannt = g.lieferant === 'UNGEKLAERT';
  const luecken = positionen.filter(positionUnvollstaendig).length;
  const titel = eingebettet ? (praefix === 'muster' ? 'Muster' : 'Ware') : unbekannt ? 'Lieferant nicht zugeordnet' : `Lieferant ${esc(g.lieferant)}`;
  const route = g.route && g.route !== 'UNGEKLAERT' && g.route !== 'MUSTER'
    ? ` <span class="badge plain" title="${esc(g.route)}">${esc(LIEFERWEG_LABEL[g.route] || g.route)}</span>` : '';
  const unterzeile = luecken
    ? `<p class="small warnc" style="margin:-6px 0 10px">${plural(luecken, 'Artikel kann', 'Artikel können')} so nicht bestellt werden – Angaben fehlen (siehe markierte Felder).</p>`
    : unbekannt ? '<p class="small muted" style="margin:-6px 0 10px">Großhändler-ID und Produktseite sind je Artikel hinterlegt – über „Öffnen" beim Lieferanten bestellen.</p>' : '';
  const ungeklaert = grund => `<span class="badge gap" title="${esc(grund || 'Nicht in Shopify hinterlegt')}">fehlt</span>`;
  const zuBestellen = positionen.filter(p => p.lineItemId && !afEintragFuer(p)?.status);
  // Ab zwei Artikeln lohnt die Sammelaktion; fuer einen reicht der Knopf in der Zeile.
  const sammel = zuBestellen.length >= 2 ? `<button type="button" class="btn btn-sm" data-af-sammel="${esc(id)}">Alle als bestellt markieren…</button>` : '';
  if (sammel) sammelGruppen.set(id, { titel: unbekannt ? 'Lieferant nicht zugeordnet' : `Lieferant ${g.lieferant}`, positionen: zuBestellen });
  else sammelGruppen.delete(id);
  // Kundenmenge nur zeigen, wenn sie vom Wortlaut der Bestellmenge abweicht -
  // sonst stehen zwei Zeilen da, die dasselbe sagen (Inhaber-Feedback).
  // Vergleich ueber die Zahl selbst, nicht ueber Teilstrings: "1 Stk." steckt
  // sonst in "10 lfm" und die abweichende Kundenmenge verschwindet.
  const zahlAus = t => { const m = String(t ?? '').match(/-?\d+(?:[.,]\d+)?/); return m ? m[0].replace(',', '.') : null; };
  const kundenmengeWeicht = p => {
    if (p.bestellmenge.menge === 'UNGEKLAERT') return true;
    const k = zahlAus(p.kundenmenge); const b = zahlAus(p.bestellmenge.text);
    return k === null || b === null || k !== b;
  };
  // data-l traegt die Spaltenueberschrift in die Zelle. Am Handy wird die
  // Tabelle damit zu Karten (app.css) - vorher musste man 390 px seitwaerts
  // schieben, um Artikelnummer und Stand zu sehen.
  const zeile = p => `<tr class="${positionUnvollstaendig(p) ? 'row-gap' : ''}">
      <td data-l="Artikel"><div class="cell-title">${esc(anzeigeWert(p.titel))}</div><div class="small muted">${esc(p.farbe)}${p.sku && p.sku !== 'UNGEKLAERT' ? ` · unsere SKU: <span class="mono">${esc(p.sku)}</span>` : ''}</div></td>
      <td data-l="Auftrag" class="nowrap"><a href="${esc(adminAuftragUrl(p.orderId))}" target="_blank" rel="noopener" title="Bestellung in Shopify öffnen">${esc(p.orderName)} ↗</a><div class="small muted">${fmtDate(p.orderDatum)}</div></td>
      <td data-l="Zu bestellen">${p.bestellmenge.menge === 'UNGEKLAERT' ? `${ungeklaert(p.bestellmenge.grund)}<div class="small muted">${esc(p.bestellmenge.grund || '')}</div>` : `<b>${esc(p.bestellmenge.text)}</b>`}${kundenmengeWeicht(p) ? `<div class="small muted">Kunde: ${esc(p.kundenmenge)}</div>` : ''}</td>
      <td data-l="Artikelnummer beim Lieferanten">${p.grosshaendlerId === 'UNGEKLAERT' ? `${ungeklaert(p.idGrund)}<div class="small muted">${esc(p.idGrund || '')}</div>` : `<code class="mono" data-kopiertext="${esc(p.grosshaendlerId)}" title="Klicken zum Kopieren">${esc(p.grosshaendlerId)}</code>`}</td>
      <td data-l="Lieferant">${lieferantLinkZelle(p)}</td>
      <td data-l="Stand">${afStatusZelle(p)}</td>
    </tr>`;
  const zeilen = kundengruppen.map(gruppe => `<tbody class="einkauf-kundengruppe">
    <tr class="einkauf-kundenkopf"><th colspan="6" scope="rowgroup"><span class="einkauf-kundenname">${esc(gruppe.name)}${gruppe.ort ? ` <span class="muted small">· ${esc(gruppe.ort)}</span>` : ''}</span><span class="small muted">${plural(gruppe.auftragsAnzahl, 'Auftrag', 'Aufträge')} · ${plural(gruppe.positionen.length, praefix === 'muster' ? 'Muster' : 'Artikel', praefix === 'muster' ? 'Muster' : 'Artikel')}</span></th></tr>
    ${gruppe.positionen.map(zeile).join('')}
  </tbody>`).join('');
  return `<section class="${eingebettet ? 'lf-gruppe' : 'card'} group-card${luecken ? ' has-gap' : ''}">
    <div class="card-head"><h3>${titel}${route} <span class="muted small">${plural(positionen.length, praefix === 'muster' ? 'Muster' : 'Artikel', praefix === 'muster' ? 'Muster' : 'Artikel')}</span></h3><div class="head-actions">${sammel}${kopierbutton(id)}</div></div>
    <p class="small muted" style="margin:-6px 0 10px">Nach Kunden sortiert. Nach dem Bestellen auf „Als bestellt markieren" klicken.</p>
    ${unterzeile}
    <div class="table-scroll"><table class="tasks compact"><thead><tr><th>Artikel</th><th>Auftrag</th><th>Zu bestellen</th><th>Artikelnummer beim Lieferanten</th><th>Lieferant</th><th>Stand</th></tr></thead>
    ${zeilen}</table></div>
    <textarea id="${id}" class="visually-hidden" aria-hidden="true" tabindex="-1">${esc(kopierTextFuer(g, sortiertePositionen))}</textarea>
  </section>`;
}
/** Shopify-Link eines Auftrags aus der Auftragsliste (Positionen tragen ihn nicht selbst). */
const adminAuftragUrl = id => (einkauf.bestellungen?.auftraege || []).find(a => a.id === id)?.adminUrl || '#';

function adresseText(a) {
  if (!a) return '–';
  return `${esc(a.name)}<br>${esc(a.strasse)}<br>${esc(a.plz)} ${esc(a.ort)}, ${esc(a.land)}${a.telefon && a.telefon !== '–' ? `<br>Tel: ${esc(a.telefon)}` : ''}`;
}

/** Volle Detailansicht einer Bestellung: Kunde, Adressen, Summen, Beratung, Positionen. */
function einkaufAuftragDetails(a) {
  const d = a.details;
  if (!d) return '';
  const s = d.summen || {};
  const beratungZeilen = Object.entries(d.beratungsangaben || {}).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v || '–')}</div>`).join('') || '<div class="muted small">Keine Beratungsangaben.</div>';
  const posZeilen = (d.positionen || []).map(p => `<tr>
      <td data-l="Artikel">${esc(p.titel)}<div class="small muted">${esc(p.sku || '–')}</div></td>
      <td data-l="Farbe/Variante">${esc(p.farbe)}</td>
      <td data-l="Kundenmaße">${esc(p.kundenmasse)}</td>
      <td data-l="Preis">${geldText(p.preis)}</td>
      <td data-l="Lieferanten-Art.-Nr.">${esc(p.lieferantenArtikelnummer === 'UNGEKLAERT' ? '–' : p.lieferantenArtikelnummer)}${p.lieferantenLink && p.lieferantenLink !== 'UNGEKLAERT' ? `<div class="small"><a href="${esc(p.lieferantenLink)}" target="_blank" rel="noopener">Beim Lieferanten öffnen</a></div>` : ''}</td>
    </tr>`).join('');
  return `<div style="padding:10px 4px;display:grid;gap:10px;overflow-wrap:anywhere">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px">
      <div><b>Kunde</b><br>${esc(d.kunde?.name)}<br>${esc(d.kunde?.email)}<br>${esc(d.kunde?.telefon)}</div>
      <div><b>Lieferadresse</b><br>${adresseText(d.lieferadresse)}</div>
      <div><b>Rechnungsadresse</b><br>${adresseText(d.rechnungsadresse)}</div>
      <div><b>Versand &amp; Zahlung</b><br>Versandart: ${esc(d.versandart)}<br>Zahlungsart: ${esc(d.zahlungsart)}</div>
      <div><b>Summen</b><br>Zwischensumme: ${geldText(s.zwischensumme)}<br>Versand: ${geldText(s.versand)}<br>Steuer: ${geldText(s.steuer)}<br><b>Gesamt: ${geldText(s.gesamt)}</b></div>
      <div><b>Beratung/Angaben</b>${beratungZeilen}</div>
    </div>
    ${d.tags?.length ? `<div><b>Tags:</b> ${d.tags.map(t => `<span class="badge plain">${esc(t)}</span>`).join(' ')}</div>` : ''}
    ${d.notiz ? `<div><b>Notiz des Kunden:</b> ${esc(d.notiz)}</div>` : ''}
    <div class="table-scroll"><table class="tasks compact"><thead><tr><th>Artikel</th><th>Farbe/Variante</th><th>Kundenmaße</th><th>Preis</th><th>Lieferanten-Art.-Nr.</th></tr></thead><tbody>${posZeilen}</tbody></table></div>
  </div>`;
}

/** Kopiertext fuer Mail/Bestellportal - nur die gerade sichtbaren Artikel, ohne interne Marker. */
function kopierTextFuer(g, positionen) {
  const kopf = `Bestellung ${g.lieferant === 'UNGEKLAERT' ? '(Lieferant nicht zugeordnet)' : `Lieferant ${g.lieferant}`}` + (g.route && g.route !== 'UNGEKLAERT' && g.route !== 'MUSTER' ? ` (${g.route})` : '');
  return [kopf, ...positionen.map((p, i) => `${i + 1}. ${anzeigeWert(p.grosshaendlerId)} | ${anzeigeWert(p.titel)} | ${p.farbe} | ${p.bestellmenge.menge === 'UNGEKLAERT' ? `ungeklärt (Kunde: ${p.kundenmenge})` : p.bestellmenge.text} | Kd.-Best. ${p.orderName}`)].join('\n');
}

const FINANZ_LABEL = { PAID: 'bezahlt', PENDING: 'Zahlung offen', AUTHORIZED: 'Zahlung autorisiert', PARTIALLY_PAID: 'teilweise bezahlt', REFUNDED: 'erstattet', PARTIALLY_REFUNDED: 'teilweise erstattet', VOIDED: 'Zahlung storniert', EXPIRED: 'Zahlung abgelaufen' };
const VERSAND_LABEL = { UNFULFILLED: 'nicht versendet', FULFILLED: 'versendet', PARTIALLY_FULFILLED: 'teilweise versendet', IN_PROGRESS: 'in Bearbeitung', ON_HOLD: 'angehalten', SCHEDULED: 'geplant', RESTOCKED: 'zurückgelegt', OPEN: 'offen' };
/** Hinweise aus der Aufbereitung in Alltagssprache (interne Marker nie roh zeigen). */
export const hinweisText = h => String(h).replace(/UNGEKLAERT/g, 'ungeklärt').replace(/Position\(en\)/g, 'Artikel').replace(/Einkaufsmenge\(n\)/g, 'Bestellmenge(n)').replace(/^Zahlung: (\w+)$/, (_, c) => FINANZ_LABEL[c] ? `Zahlung: ${FINANZ_LABEL[c]}` : `Zahlung: ${c}`);

/**
 * Ein Auftrag als Karte: Ampel, Nummer, Datum, was fehlt - in Klartext. Die frueheren
 * Chips (Bezahlt: PAID, Telefon: fehlt, …) standen bei jedem Auftrag, auch wenn sie
 * nichts bedeuteten; jetzt erscheint nur, was vom Normalfall abweicht.
 */
export function einkaufAuftragZeile(a) {
  const offen = auftragOffenePositionen(a);
  const artikel = offen.map(p => anzeigeWert(p.titel)).filter(Boolean);
  const abweichungen = [];
  if (a.erfuellt && a.erfuellt !== 'UNFULFILLED' && VERSAND_LABEL[a.erfuellt]) abweichungen.push(VERSAND_LABEL[a.erfuellt]);
  if (a.checks?.verlegung === 'Ja' && !a.hinweise?.some(h => /Verlegung/.test(h))) abweichungen.push('Verlegung gebucht');
  const ampelKlasse = a.ampel === 'rot' ? 'blockiert' : a.ampel === 'gelb' ? 'freigabe' : a.ampel === 'gruen' ? 'fertig' : 'plain';
  const detail = einkaufAuftragDetails(a);
  const kopf = `<div class="order-row ${esc(a.ampel)}">
    <div class="order-main">
      <div class="t"><span class="badge status ${ampelKlasse}">${esc(EINKAUF_AMPEL_LABEL[a.ampel] || a.ampel)}</span> <a href="${esc(a.adminUrl || '')}" target="_blank" rel="noopener" title="In Shopify öffnen">${esc(a.name)} ↗</a> <span class="muted small">${fmtDate(a.datum)}</span>${abweichungen.map(x => ` <span class="badge plain">${esc(x)}</span>`).join('')}</div>
      ${artikel.length ? `<div class="small muted">${esc(artikel.slice(0, 3).join(' · '))}${artikel.length > 3 ? ` · +${artikel.length - 3}` : ''}</div>` : ''}
      ${a.hinweise?.length ? `<ul class="order-issues">${a.hinweise.map(h => `<li>${esc(hinweisText(h))}</li>`).join('')}</ul>` : ''}
    </div>
    ${offen.length && a.ampel !== 'gruen' ? `<button type="button" class="btn btn-sm btn-ghost" onclick="event.preventDefault()" data-auftrag-erledigt="${esc(a.id)}" title="Z. B. Testbestellung oder anders erledigt – setzt die Artikel im Auftragsfluss auf „Erledigt"">Ohne Einkauf abschließen…</button>` : ''}
  </div>`;
  // Ohne Detaildaten bleibt es bei der Zeile; sonst klappt die volle Bestellung darunter auf.
  if (!detail) return kopf;
  return `<details class="order-details"><summary>${kopf}</summary>${detail}</details>`;
}

const AF_FILTER_LABEL = { offen: 'Noch zu bestellen', bestellt: 'Bestellt', unterwegs: 'Unterwegs', erledigt: 'Erledigt' };

/** Filter nach Auftragsfluss-Schritt. Ohne Auswahl: alles ausser "Erledigt". */
function afFilterChips(allePositionen) {
  const zaehler = { offen: 0, bestellt: 0, unterwegs: 0, erledigt: 0 };
  for (const p of allePositionen) zaehler[afFilterGruppe(afEintragFuer(p)?.status)] += 1;
  const af = state.route.params.get('af') || '';
  const offenGesamt = zaehler.offen + zaehler.bestellt + zaehler.unterwegs;
  return `<div class="chips" role="group" aria-label="Nach Auftragsfluss filtern">
    <button type="button" class="chip" data-param="af" data-value="" aria-pressed="${!af}">Alle offenen<span class="c">${offenGesamt}</span></button>
    ${Object.keys(AF_FILTER_LABEL).map(k => `<button type="button" class="chip" data-param="af" data-value="${k}" aria-pressed="${af === k}">${esc(AF_FILTER_LABEL[k])}<span class="c">${zaehler[k]}</span></button>`).join('')}
  </div>`;
}

export function viewEinkaufBestellungen() {
  ensureEinkaufBestellungen();
  ensureEinkaufAuftragsstatus();
  const d = einkauf.bestellungen;
  if (!d && einkauf.loadingBestellungen) return `<div class="empty">Lade Bestellübersicht …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Bestelldaten');
  if (!d || !d.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  const { ware, muster, gruppe } = einkaufPositionenMitStand(d);
  const aktiv = aktiveAuftraege(d);
  const klaeren = aktiv.filter(a => a.ampel === 'rot' || a.ampel === 'gelb').sort((a, b) => (a.ampel === 'rot' ? 0 : 1) - (b.ampel === 'rot' ? 0 : 1));
  const rot = klaeren.filter(a => a.ampel === 'rot').length;
  const af = state.route.params.get('af') || '';
  const abgeschlossen = af === 'erledigt' ? abgeschlosseneAuftraegeKarte() : '';
  return `
    <div class="band">
      ${bandItem(aktiv.length, 'offene Kundenaufträge', 'plain')}
      ${bandItem(ware.filter(p => gruppe(p) === 'offen').length, 'Artikel noch zu bestellen', 'warn')}
      ${bandItem(muster.filter(p => gruppe(p) === 'offen').length, 'Muster noch zu bestellen', 'warn')}
      ${bandItem(rot, rot === 1 ? 'Auftrag mit Problem' : 'Aufträge mit Problem', 'crit')}
    </div>
    ${klaeren.length ? `<section class="card problem-card"><div class="card-head"><h2>Zuerst klären</h2><span class="more muted">Rot = blockiert, Gelb = vor dem Bestellen prüfen</span></div><div class="rows">${klaeren.map(einkaufAuftragZeile).join('')}</div></section>` : ''}
    <div class="section-bar"><h2 class="section-title" style="margin:0">Bestellen je Lieferant</h2>${afFilterChips([...ware, ...muster])}</div>
    ${abgeschlossen}
    ${lieferantenKartenHtml({ gruppeKarte: einkaufGruppeKarte })}
    <details class="card section plain-details"><summary><h2>Alle offenen Aufträge</h2><span class="preview">${aktiv.length}</span></summary>
      <div class="rows" style="margin-top:10px">${aktiv.map(einkaufAuftragZeile).join('') || emptyState('Keine offenen Aufträge.', '')}</div>
    </details>
    ${(d.testauftraege || []).length ? `<details style="margin-top:20px">
      <summary style="cursor:pointer;font-weight:600">Testbestellungen (${d.testauftraege.length}) – zählen in keiner Kennzahl</summary>
      <p class="small muted" style="margin:6px 0">Tag „TESTBESTELLUNG" oder Shopify-Feld test=true. Fließen nicht in Auftragsampel, Einkauf oder Shop-Zahlen ein.</p>
      <div class="rows">${d.testauftraege.map(einkaufAuftragZeile).join('')}</div>
    </details>` : ''}
    <p class="small muted" style="margin-top:12px">Stand der Bestellungen: ${esc(fmtDateTime(d.exportiertAm || d.erstellt))} · Wartezeit: gelb ab 7 Tagen (nachhaken), rot ab 14. Hier wird nie etwas automatisch bestellt oder versendet.</p>`;
}

/**
 * Im Filter "Erledigt": Auftraege mit abgeschlossenen Artikeln, je mit "Wieder öffnen…".
 * Auch Testbestellungen, deren Artikel in keiner Lieferanten-Gruppe stehen - sonst gaebe es
 * fuer sie keinen Weg zurueck.
 */
function abgeschlosseneAuftraegeKarte() {
  const liste = alleAuftraege().map(a => ({ a, erledigt: erledigtePositionen(a) })).filter(x => x.erledigt.length);
  if (!liste.length) return '';
  const zeile = ({ a, erledigt }) => {
    const e = afEintragFuer({ orderId: a.id, lineItemId: erledigt[0].lineItemId });
    const wer = e?.erledigtAm ? ` · abgeschlossen ${esc(fmtDateTime(e.erledigtAm))}${e.erledigtVon ? ` von @${esc(e.erledigtVon)}` : ''}` : '';
    return `<div class="order-row">
      <div class="order-main">
        <div class="t"><a href="${esc(a.adminUrl || '')}" target="_blank" rel="noopener" title="In Shopify öffnen">${esc(a.name)} ↗</a> <span class="muted small">${fmtDate(a.datum)}</span>${a.testbestellung ? ' <span class="badge plain">Testbestellung</span>' : ''}</div>
        <div class="small muted">${plural(erledigt.length, 'Artikel', 'Artikel')} erledigt${wer}${e?.erledigtNotiz ? ` · Grund: ${esc(e.erledigtNotiz)}` : ''}</div>
      </div>
      <button type="button" class="btn btn-sm btn-ghost" data-af-reopen="${esc(a.id)}" title="Artikel zurück in die Arbeitsliste holen">Wieder öffnen…</button>
    </div>`;
  };
  return `<section class="card section"><div class="card-head"><h3>Abgeschlossene Aufträge</h3><span class="more muted">Versehentlich abgeschlossen? „Wieder öffnen" holt die Artikel zurück.</span></div><div class="rows">${liste.map(zeile).join('')}</div></section>`;
}
