/**
 * Ansicht "Lexikon" (#/lexikon): Produkt anhand des Kundenbegriffs finden, Angaben fuers
 * Kundengespraech, Bestellzeilen, Mengenhilfe, Original-Link.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, NICHT_HINTERLEGT, fmtPreis } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';
import { LIEFERWEG_LABEL } from './einkauf/auftragsfluss.mjs';

export const lexikon = {
  liste: null, loadingListe: false, listeKey: null,
  produkt: null, loadingProdukt: false, produktKey: null,
};

function ensureLexikonListe() {
  const q = state.route.params.get('lq') || '';
  const seite = state.route.params.get('lseite') || '1';
  const key = `${q}::${seite}`;
  if (lexikon.listeKey === key && (lexikon.liste || lexikon.loadingListe)) return;
  lexikon.listeKey = key;
  lexikon.loadingListe = true;
  fetchEinkauf(`/api/lexikon/liste?${new URLSearchParams({ q, page: seite })}`).then(d => {
    if (lexikon.listeKey !== key) return; // Antwort einer aelteren Eingabe
    lexikon.liste = d; lexikon.loadingListe = false;
    if (state.route.view === 'lexikon') render();
  });
}

function ensureLexikonProdukt(handle) {
  if (lexikon.produktKey === handle && (lexikon.produkt || lexikon.loadingProdukt)) return;
  lexikon.produktKey = handle;
  lexikon.loadingProdukt = true;
  fetchEinkauf(`/api/lexikon/produkt?${new URLSearchParams({ handle })}`).then(d => {
    if (lexikon.produktKey !== handle) return; // inzwischen ein anderes Produkt geoeffnet
    lexikon.produkt = d; lexikon.loadingProdukt = false;
    if (state.route.view === 'lexikon') render();
  });
}

function lexWert(w) { return (w === null || w === undefined || w === '') ? NICHT_HINTERLEGT : esc(String(w)); }

function preisText(betrag, einheit) {
  if (betrag === null || betrag === undefined) return null;
  const einheitText = einheit === 'm2' ? '€/m²' : einheit === 'stueck' ? '€/Stück' : '€';
  return `${fmtPreis(betrag)} ${einheitText}`;
}

/**
 * Preis einer Variante fuers Bestellen. Der Shopify-Rohpreis ist je nach
 * Produkt der Paketpreis oder der Preis je 0,01 m² - nackt hingeschrieben
 * ("0.85 EUR") verleitet er zu falschen Aussagen am Telefon. Deshalb zuerst
 * der Preis je Verkaufseinheit, der Rohwert klein daneben.
 */
function preisZelle(v) {
  const jeEinheit = v.preisJeEinheit;
  if (jeEinheit && typeof jeEinheit.betrag === 'number') {
    const roh = (typeof v.preis === 'number' && Math.abs(v.preis - jeEinheit.betrag) > 0.005)
      ? `<div class="small muted">Shopify-Preis ${esc(fmtPreis(v.preis))} ${esc(v.waehrung || 'EUR')}</div>`
      : '';
    return `${esc(preisText(jeEinheit.betrag, jeEinheit.einheit))}${roh}`;
  }
  if (v.preis === null || v.preis === undefined) return NICHT_HINTERLEGT;
  return `${esc(fmtPreis(v.preis))} ${esc(v.waehrung || 'EUR')}`;
}

function lexikonTrefferZeile(p) {
  const bild = p.bild ? `<img src="${esc(p.bild)}" alt="" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:6px;background:var(--bg-2,#eee)">` : `<div style="width:48px;height:48px;border-radius:6px;background:var(--bg-2,#eee)"></div>`;
  const preis = preisText(p.preisAb, p.preisEinheit);
  const linkZeichen = p.linkVorhanden
    ? '<span title="Lieferanten-Link vorhanden" style="color:var(--ok,#1a7f37)">●</span>'
    : '<span title="Lieferanten-Link fehlt noch" style="color:var(--warn,#b45309)">○</span>';
  return `<div class="row" data-lex-open="${esc(p.handle)}" tabindex="0" role="button" style="cursor:pointer">
    <div style="display:flex;gap:10px;align-items:center">
      ${bild}
      <div>
        <div class="t">${esc(p.titel)}</div>
        <div class="m">${p.produktgruppe ? esc(p.produktgruppe) : NICHT_HINTERLEGT} · ${p.farbenAnzahl} Farbe${p.farbenAnzahl === 1 ? '' : 'n'}${preis ? ` · ab ${esc(preis)}` : ''} · ${linkZeichen}</div>
      </div>
    </div>
  </div>`;
}

function viewLexikonListe() {
  ensureLexikonListe();
  const q = state.route.params.get('lq') || '';
  const toolbar = `<div class="toolbar search-hero"><input type="search" placeholder="Was hat der Kunde gesagt? Produktname, Farbe, SKU oder Artikelnummer …" value="${esc(q)}" data-param="lq" aria-label="Lexikon durchsuchen"></div>`;
  const d = lexikon.liste;
  if (!d && lexikon.loadingListe) return toolbar + `<div class="empty">Lade Lexikon …</div>`;
  if (d?.fehler) return toolbar + stoerungState(d, 'Das Lexikon');
  if (!d || !d.verfuegbar) {
    const hinweis = `${d?.hinweis || 'Noch keine Daten exportiert.'}${d?.befehl ? ` Befehl: ${d.befehl}` : ''}`;
    return toolbar + emptyState('Keine Lexikon-Daten verfügbar.', hinweis);
  }
  const t = d.treffer;
  // Ohne Suchbegriff zuerst die Suche anbieten statt 638 Produkte in Shop-Reihenfolge -
  // die Liste bleibt einen Klick entfernt ("Alle durchblättern").
  if (!q && !state.route.params.get('lalle')) {
    return `${toolbar}
      <div class="empty search-hint"><strong>${d.anzahl} Produkte im Lexikon.</strong> Tippe ein, was der Kunde genannt hat – das Lexikon findet das Produkt samt Lieferanten-Artikelnummer und Link. <button type="button" class="btn btn-sm" data-param="lalle" data-value="1">Alle durchblättern</button>
      <div class="small muted" style="margin-top:6px">Stand: ${esc(fmtDateTime(d.erstellt))}</div></div>`;
  }
  const pages = t.pages > 1 ? `<div class="toolbar" style="margin-top:10px">
      <button type="button" class="btn btn-sm" ${t.page <= 1 ? 'disabled' : ''} data-param="lseite" data-value="${t.page - 1}">← Zurück</button>
      <span class="muted small">Seite ${t.page} von ${t.pages} · ${t.count} Treffer</span>
      <button type="button" class="btn btn-sm" ${t.page >= t.pages ? 'disabled' : ''} data-param="lseite" data-value="${t.page + 1}">Weiter →</button>
    </div>` : '';
  return `${toolbar}
    <p class="small muted" style="margin:-4px 0 10px">${q ? `${t.count} Treffer für „${esc(q)}"` : `${d.anzahl} Produkte im Lexikon`} · Stand: ${esc(fmtDateTime(d.erstellt))}</p>
    <div class="rows">${t.items.length ? t.items.map(lexikonTrefferZeile).join('') : emptyState(q ? 'Keine Treffer.' : 'Noch keine Produkte.', q ? 'Begriff prüfen oder anders schreiben.' : '')}</div>
    ${pages}`;
}

// Lesbare deutsche Bezeichnung je internem Eigenschaften-Schluessel (aus
// operations/lib/lexikon.mjs::EIGENSCHAFTEN_FELDER). Unbekannte Schluessel
// werden trotzdem lesbar aufbereitet, nie roh angezeigt.
const EIGENSCHAFTEN_LABEL = {
  rollenbreite: 'Rollenbreite',
  qmProPaket: 'm² pro Paket',
  florhoehe: 'Florhöhe',
  material: 'Material',
  ruecken: 'Rücken',
  nutzungsklasse: 'Nutzungsklasse',
  fussbodenheizung: 'Fußbodenheizung',
  brandverhalten: 'Brandverhalten',
  belagsart: 'Belagsart',
  optik: 'Optik',
  fasermaterial: 'Fasermaterial',
  zimmer: 'Zimmer',
  aufbau: 'Aufbau',
  gesamtstaerke: 'Gesamtstärke',
  poleneinsatzgewicht: 'Poleneinsatzgewicht',
  komfortklasse: 'Komfortklasse',
  trittschallverbesserung: 'Trittschallverbesserung',
  marke: 'Marke',
};
function eigenschaftLabel(key) {
  if (EIGENSCHAFTEN_LABEL[key]) return EIGENSCHAFTEN_LABEL[key];
  const lesbar = String(key).replaceAll('_', ' ');
  return lesbar.charAt(0).toUpperCase() + lesbar.slice(1);
}

// EN-ISO-10874-Nutzungsklassen (oeffentliche Norm, keine Firmendaten) - fuers
// Kundengespraech in Klartext statt nur der Zahl.
const NUTZUNGSKLASSE_TEXT = {
  21: 'Wohnen, mäßige Beanspruchung', 22: 'Wohnen, mittlere Beanspruchung', 23: 'Wohnen, starke Beanspruchung',
  31: 'Gewerbe, mäßige Beanspruchung', 32: 'Gewerbe, mittlere Beanspruchung', 33: 'Gewerbe, starke Beanspruchung', 34: 'Gewerbe, sehr starke Beanspruchung',
  41: 'Industrie, mäßige Beanspruchung', 42: 'Industrie, mittlere Beanspruchung', 43: 'Industrie, starke Beanspruchung',
};
function nutzungsklasseText(roh) {
  if (leerWert(roh)) return null;
  const teile = String(roh).split(/[,/]/).map((s) => s.trim()).filter(Boolean);
  return teile.map((t) => (NUTZUNGSKLASSE_TEXT[t] ? `Klasse ${t}: ${NUTZUNGSKLASSE_TEXT[t]}` : t)).join(' · ');
}
function leerWert(w) { return w === null || w === undefined || w === ''; }

/** Kundengespraechs-Kachel: Frage -> Antwort, nur was hinterlegt ist. */
function kgZeile(frage, antwort) {
  if (leerWert(antwort)) return '';
  return `<div class="kg-zeile"><span class="kg-frage">${esc(frage)}</span><span class="kg-antwort">${esc(antwort)}</span></div>`;
}

function fuersKundengespraech(p) {
  const eig = p.eigenschaften || {};
  const normaleVarianten = (p.varianten || []).filter((v) => !v.wunschmass && !v.original);
  const farben = [...new Set(normaleVarianten.map((v) => v.farbe).filter(Boolean))];
  const preise = normaleVarianten.map((v) => v.preisJeEinheit).filter(Boolean);
  const minPreis = preise.length ? preise.reduce((a, b) => (a.betrag <= b.betrag ? a : b)) : null;
  const musterZeile = p.muster?.vorhanden
    ? `<div class="kg-zeile"><span class="kg-frage">Muster</span><span class="kg-antwort">Ja${p.muster.handle ? ` – <a href="#" data-lex-open="${esc(p.muster.handle)}">Muster im Lexikon ansehen →</a>` : ''}</span></div>`
    : `<div class="kg-zeile"><span class="kg-frage">Muster</span><span class="kg-antwort muted">Kein Muster hinterlegt</span></div>`;
  return `<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Für das Kundengespräch</h2></div>
    <div class="kg-liste">
      ${kgZeile('Produktgruppe', p.produktgruppe)}
      ${kgZeile('Kollektion', normaleVarianten[0]?.einkauf?.kollektion)}
      ${kgZeile('Marke', normaleVarianten[0]?.einkauf?.marke)}
      ${minPreis ? kgZeile('Preis ab', preisText(minPreis.betrag, minPreis.einheit)) : ''}
      ${farben.length ? kgZeile('Farben', farben.join(', ')) : ''}
      ${musterZeile}
      ${kgZeile('Material', eig.material)}
      ${kgZeile('Fasermaterial', eig.fasermaterial)}
      ${kgZeile('Florhöhe', eig.florhoehe)}
      ${kgZeile('Gesamtstärke', eig.gesamtstaerke)}
      ${kgZeile('Trittschallverbesserung', eig.trittschallverbesserung)}
      ${eig.nutzungsklasse ? kgZeile('Nutzungsklasse', nutzungsklasseText(eig.nutzungsklasse)) : ''}
      ${kgZeile('Brandverhalten', eig.brandverhalten)}
      ${kgZeile('Fußbodenheizung', eig.fussbodenheizung)}
      ${kgZeile('Rücken', eig.ruecken)}
    </div>
    ${Object.values({ ...eig, produktgruppe: p.produktgruppe }).filter((v) => !leerWert(v)).length ? '' : `<p class="small muted">Noch keine Eckdaten fürs Kundengespräch hinterlegt.</p>`}
  </section>`;
}

function bestellZeile(v) {
  const e = v.einkauf || {};
  const artikelZelle = e.artikelnummer
    ? `<code class="mono" data-kopiertext="${esc(e.artikelnummer)}" title="Klicken zum Kopieren" style="cursor:pointer">${esc(e.artikelnummer)}</code>`
    : NICHT_HINTERLEGT;
  const linkZelle = v.link?.status === 'vorhanden'
    ? `<a class="btn btn-sm" href="${esc(e.url)}" target="_blank" rel="noopener">Beim Lieferanten öffnen ↗</a>`
    : `<div class="small muted">${esc(v.link?.grund || 'kein Link hinterlegt')}</div>${v.link?.suchlink ? `<a class="small" href="${esc(v.link.suchlink)}" target="_blank" rel="noopener">Beim Lieferanten suchen ↗</a>` : ''}`;
  // data-l traegt die Spaltenueberschrift; am Handy wird daraus eine Karte
  // (app.css, .table-scroll table.tasks.compact). Ohne sie stand die Tabelle
  // mit zehn Spalten auf 980 px fest - die Artikelnummer, wegen der man diese
  // Ansicht ueberhaupt oeffnet, lag ausserhalb des Bildes.
  return `<tr>
    <td data-l="Farbe">${lexWert(v.farbe)}</td>
    <td data-l="Unsere SKU">${v.sku ? `<code class="mono">${esc(v.sku)}</code>` : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferant">${lexWert(e.lieferant)}</td>
    <td data-l="Artikelnummer">${artikelZelle}</td>
    <td data-l="Farbnummer">${lexWert(e.farbnummer)}</td>
    <td data-l="Bestelleinheit">${lexWert(e.bestelleinheit)}</td>
    <td data-l="Preis">${preisZelle(v)}</td>
    <td data-l="Verfügbar">${v.verfuegbar === true ? 'Ja' : v.verfuegbar === false ? 'Nein' : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferweg">${e.lieferweg ? esc(LIEFERWEG_LABEL[e.lieferweg] || e.lieferweg) : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferantenseite">${linkZelle}</td>
  </tr>`;
}

function musterBestellZeile(v) {
  const o = v.original || {};
  const artikelZelle = o.artikelnummer
    ? `<code class="mono" data-kopiertext="${esc(o.artikelnummer)}" title="Klicken zum Kopieren" style="cursor:pointer">${esc(o.artikelnummer)}</code>`
    : NICHT_HINTERLEGT;
  const linkZelle = o.gefunden && o.url
    ? `<a class="btn btn-sm" href="${esc(o.url)}" target="_blank" rel="noopener">Original beim Lieferanten ↗</a>`
    : `<div class="small muted">${esc(o.grund || 'kein Original hinterlegt')}</div>`;
  return `<tr>
    <td data-l="Unsere SKU">${v.sku ? `<code class="mono">${esc(v.sku)}</code>` : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferant">${lexWert(o.lieferant)}</td>
    <td data-l="Original-Artikelnummer">${artikelZelle}<div class="small muted">Original beim Lieferanten – das Muster selbst hat keine eigene Artikelnummer</div></td>
    <td data-l="Original beim Lieferanten">${linkZelle}</td>
  </tr>`;
}

/** Mengenhilfe-Widget: Kundenmenge -> Bestellmenge, rechnet ueber /api/lexikon/mengenhilfe (operations/lib/umrechnung.mjs). */
function mengenhilfeWidget(p, zielVariante) {
  if (!zielVariante || zielVariante.wunschmass) return '';
  const einheit = zielVariante.einkauf?.bestelleinheit;
  if (!einheit) return '';
  return `<div data-mh-wrap="${esc(p.handle)}" data-mh-default-variant="${esc(zielVariante.id || '')}" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border,#e5e5e5)">
    <div class="small" style="font-weight:600;margin-bottom:6px">Mengenhilfe: Kundenmenge → Bestellmenge beim Lieferanten</div>
    <div class="toolbar">
      <input type="text" inputmode="decimal" placeholder="Kundenmenge in m²" data-mh-menge style="max-width:180px">
      <button type="button" class="btn btn-sm" data-mh-go>Bestellmenge berechnen</button>
    </div>
    <div class="small" data-mh-ergebnis style="margin-top:6px"></div>
  </div>`;
}

// Eigenschaften, die bereits im Kundengespraech stehen - der Rest (Optik,
// Zimmer, Belagsart, Aufbau, Poleneinsatzgewicht, Komfortklasse, ...) gehoert
// zu keiner der beiden Aufgaben und landet deshalb nur noch bei "Interne Angaben".
const KUNDENGESPRAECH_EIGENSCHAFTEN = new Set([
  'material', 'fasermaterial', 'florhoehe', 'gesamtstaerke', 'trittschallverbesserung',
  'nutzungsklasse', 'brandverhalten', 'fussbodenheizung', 'ruecken',
]);

function internesDetails(p) {
  const zeilen = (p.varianten || []).map((v) => {
    const teile = [v.sku, v.einkauf?.procurementId ? `Beschaffungs-ID ${v.einkauf.procurementId}` : null].filter(Boolean);
    return teile.length ? `<li>${teile.map(esc).join(' · ')}</li>` : '';
  }).filter(Boolean);
  const weitereEigenschaften = Object.entries(p.eigenschaften || {}).filter(([k]) => !KUNDENGESPRAECH_EIGENSCHAFTEN.has(k));
  return `<details style="margin-top:16px"><summary class="small muted" style="cursor:pointer">Interne Angaben</summary>
    <div class="small muted" style="margin-top:8px">
      <div>Handle: <code class="mono">${esc(p.handle)}</code></div>
      ${zeilen.length ? `<ul style="margin:6px 0 0;padding-left:18px">${zeilen.join('')}</ul>` : ''}
      ${weitereEigenschaften.length ? `<ul style="margin:6px 0 0;padding-left:18px">${weitereEigenschaften.map(([k, v]) => `<li><b>${esc(eigenschaftLabel(k))}:</b> ${esc(String(v))}</li>`).join('')}</ul>` : ''}
    </div>
  </details>`;
}

/**
 * Rueckweg vom Produkt zum Kunden: steht dieses Produkt gerade bei jemandem
 * offen? Wer im Kundengespraech nachschlaegt, sieht das sofort - ohne in die
 * Kundenliste zu wechseln.
 */
function wartendeKundenBlock(wartende) {
  if (!wartende?.length) return '';
  return `<section class="card" style="margin-bottom:16px;border-left:3px solid var(--warn)">
    <div class="card-head"><h2>${wartende.length === 1 ? 'Ein Kunde wartet' : `${wartende.length} Kunden warten`} auf dieses Produkt</h2><a class="more" href="#/kunden">Zu tun öffnen →</a></div>
    <ul style="margin:0;padding-left:20px;line-height:1.9">
      ${wartende.map(w => `<li><b>${esc(w.kunde)}</b>${w.bezug ? ` · ${esc(w.bezug)}` : ''}${w.tage !== null && w.tage !== undefined ? ` · seit ${w.tage === 0 ? 'heute' : `${w.tage} Tagen`}` : ''} – ${esc(w.schritt)}</li>`).join('')}
    </ul>
  </section>`;
}

function viewLexikonDetail(handle) {
  ensureLexikonProdukt(handle);
  const zurueck = `<p style="margin:0 0 12px"><a href="#" data-lex-zurueck>← Zurück zur Lexikon-Suche</a></p>`;
  const d = lexikon.produktKey === handle ? lexikon.produkt : null;
  if (!d) return zurueck + `<div class="empty">Lade Produkt …</div>`;
  if (!d || !d.verfuegbar) return zurueck + emptyState('Produkt nicht gefunden.', d?.hinweis || 'Handle prüfen.');
  const p = d.produkt;
  const alleVarianten = p.varianten || [];
  const musterVarianten = alleVarianten.filter((v) => v.original);
  const normaleVarianten = alleVarianten.filter((v) => !v.wunschmass && !v.original);
  const wunschmassVarianten = alleVarianten.filter((v) => v.wunschmass);
  const zielVariante = normaleVarianten[0] || alleVarianten[0];

  const bestellTabelle = musterVarianten.length
    ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Unsere SKU</th><th>Lieferant</th><th>Original-Artikelnummer</th><th>Original beim Lieferanten</th></tr></thead>
      <tbody>${musterVarianten.map(musterBestellZeile).join('')}</tbody></table></div>`
    : `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Farbe</th><th>Unsere SKU</th><th>Lieferant</th><th>Artikelnummer</th><th>Farbnummer</th><th>Bestelleinheit</th><th>Preis</th><th>Verfügbar</th><th>Lieferweg</th><th>Lieferantenseite</th></tr></thead>
      <tbody>${normaleVarianten.map(bestellZeile).join('') || `<tr><td colspan="10">${NICHT_HINTERLEGT}</td></tr>`}</tbody></table></div>
      ${wunschmassVarianten.length ? `<p class="small muted" style="margin:10px 0 0">Wunschmaß (${wunschmassVarianten.length} Variante${wunschmassVarianten.length === 1 ? '' : 'n'}): wird erst beim Zuschnitt bestellt, deshalb hier ohne eigene Artikelnummer – keine fehlende Angabe.</p>` : ''}
      ${p.eigenschaften?.qmProPaket ? `<p class="small muted" style="margin:6px 0 0">m² pro Paket: ${esc(p.eigenschaften.qmProPaket)}</p>` : ''}
      ${p.eigenschaften?.rollenbreite ? `<p class="small muted" style="margin:6px 0 0">Rollenbreite: ${esc(p.eigenschaften.rollenbreite)} cm</p>` : ''}
      ${mengenhilfeWidget(p, zielVariante)}`;

  return `${zurueck}
    <div class="page-head">
      <div style="display:flex;gap:14px;align-items:center">
        ${p.bild ? `<img src="${esc(p.bild)}" alt="" loading="lazy" style="width:88px;height:88px;object-fit:cover;border-radius:8px;background:var(--bg-2,#eee);flex:none">` : ''}
        <div><h1>${esc(p.titel)}</h1><p class="sub">${p.produktgruppe ? esc(p.produktgruppe) : NICHT_HINTERLEGT}${p.status ? ` · ${esc(p.status)}` : ''}</p></div>
      </div>
    </div>
    <div class="toolbar" style="margin:10px 0 16px">
      ${p.shopUrl ? `<a class="btn btn-primary" href="${esc(p.shopUrl)}" target="_blank" rel="noopener">Im Shop ansehen ↗</a>` : `<span class="btn" aria-disabled="true">Im Shop ansehen (${NICHT_HINTERLEGT})</span>`}
      ${p.adminUrl ? `<a class="btn" href="${esc(p.adminUrl)}" target="_blank" rel="noopener">Im Shopify-Admin ↗</a>` : `<span class="btn" aria-disabled="true">Im Shopify-Admin (${NICHT_HINTERLEGT})</span>`}
    </div>
    ${wartendeKundenBlock(d.wartendeKunden)}
    ${fuersKundengespraech(p)}
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Zum Bestellen</h2></div>${bestellTabelle}</section>
    ${internesDetails(p)}`;
}

export function viewLexikon() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Lexikon</h1><p class="sub">Kunde nennt den Produktnamen – hier findest du das Original beim Lieferanten.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Einkaufsdaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  const handle = state.route.params.get('handle');
  const head = `<div class="page-head"><div><h1>Lexikon</h1><p class="sub">Kunde nennt einen Produktnamen – hier steht das Original beim Lieferanten samt Bestelldaten.</p></div></div>`;
  return head + (handle ? viewLexikonDetail(handle) : viewLexikonListe());
}

/** Lexikon: Produkt oeffnen, Mengenhilfe rechnen, zurueck zur Liste. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function lexikonKlick(e) {
  const lexOpen = e.target.closest('[data-lex-open]');
  if (lexOpen) { e.preventDefault(); const p = new URLSearchParams(); p.set('handle', lexOpen.dataset.lexOpen); location.hash = `#/lexikon?${p}`; return true; }
  const mhGo = e.target.closest('[data-mh-go]');
  if (mhGo) {
    e.preventDefault();
    const wrap = mhGo.closest('[data-mh-wrap]');
    const out = wrap?.querySelector('[data-mh-ergebnis]');
    if (!wrap || !out) return true;
    const handle = wrap.dataset.mhWrap;
    const variantenId = wrap.dataset.mhDefaultVariant;
    const menge = wrap.querySelector('[data-mh-menge]')?.value || '';
    out.textContent = 'Rechne …';
    fetchEinkauf(`/api/lexikon/mengenhilfe?${new URLSearchParams({ handle, variantenId, kundenmengeM2: menge })}`).then((d) => {
      if (!d.verfuegbar) { out.textContent = d.hinweis || 'Fehler bei der Berechnung.'; return; }
      out.textContent = d.ergebnis ? d.ergebnis.text : (d.grund || 'Bestellmenge ungeklärt.');
    });
    return true;
  }
  const lexZurueck = e.target.closest('[data-lex-zurueck]');
  if (lexZurueck) { e.preventDefault(); location.hash = `#/lexikon${state.route.params.get('lq') ? `?${new URLSearchParams({ lq: state.route.params.get('lq') })}` : ''}`; return true; }
  return false;
}
