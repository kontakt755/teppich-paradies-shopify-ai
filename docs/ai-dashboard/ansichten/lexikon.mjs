/**
 * Ansicht "Lexikon" (#/lexikon): Produkt anhand des Kundenbegriffs finden, Angaben fuers
 * Kundengespraech, Bestellzeilen, Mengenhilfe, Original-Link.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, NICHT_HINTERLEGT, fmtPreis, toast } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';
import { LIEFERWEG_LABEL, einkauf, ensureEinkaufLieferanten } from './einkauf/auftragsfluss.mjs';
import { telLink, gmailLink, lieferantName } from '../lib/einkauf-lieferanten.mjs';
import { etikettenAusLexikon } from '../lib/lexikon-etiketten.mjs';
import { suchbegriffe, lexikonTreffer } from '../lib/lexikon-suche.mjs';
import { originalHandle } from '../lib/muster-etiketten.mjs';
import { oeffneEtikettenDruck } from '../bausteine/etiketten-druck.mjs';
import { drucklisteVormerken, musterDrucklisteKlick, viewMusterDruckliste } from './muster-druckliste.mjs';
import { viewMusterEtikettenStatus, musterEtikettenStatusKlick } from './muster-etiketten-status.mjs';

export const lexikon = {
  liste: null, loadingListe: false, listeKey: null,
  produkt: null, loadingProdukt: false, produktKey: null,
  etiketten: [], etikettenKey: null, loadingEtiketten: false,
  vormerkenLaeuft: false, etikettAnzahl: 1, vorgemerkt: null, vormerkFehler: '',
};
let vormerkSitzung = 0;
if (typeof window !== 'undefined') window.addEventListener('tp-sitzung-beendet', () => {
  vormerkSitzung++;
  lexikon.vorgemerkt = null; lexikon.vormerkFehler = ''; lexikon.vormerkenLaeuft = false;
});

/** Eingabe vor jedem Neuzeichnen erhalten, auch wenn danach eine andere Farbe gewaehlt wird. */
export function lexikonEingabe(e) {
  if (!e.target?.matches?.('[data-lex-etikett-anzahl]')) return false;
  lexikon.etikettAnzahl = e.target.value;
  return true;
}

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
  lexikon.produkt = null;
  lexikon.loadingProdukt = true;
  lexikon.etikettAnzahl = 1;
  lexikon.vorgemerkt = null; lexikon.vormerkFehler = '';
  lexikon.etiketten = []; lexikon.etikettenKey = null; lexikon.loadingEtiketten = false;
  fetchEinkauf(`/api/lexikon/produkt?${new URLSearchParams({ handle })}`).then(d => {
    if (lexikon.produktKey !== handle) return; // inzwischen ein anderes Produkt geoeffnet
    lexikon.produkt = d; lexikon.loadingProdukt = false;
    if (state.route.view === 'lexikon') render();
  });
}

/** Eigene Muster koennen auf ein anderes Original zeigen (z. B. Teppich nach Mass).
 * Nur diese gezielten Eintraege nachladen, nie das ganze Lexikon an den Browser schicken. */
function ensureLexikonEtiketten(produkt) {
  const key = produkt.handle;
  if (lexikon.etikettenKey === key) return;
  lexikon.etikettenKey = key;
  lexikon.loadingEtiketten = false;
  const abhaengigkeiten = p => {
    const handles = (p.varianten || []).map(v => v.original?.produktHandle).filter(Boolean);
    if (!(p.varianten || []).some(v => v.sku && !v.wunschmass && !/^(M-|TP-MUSTER)/i.test(v.sku))) {
      if (p.muster?.handle) handles.push(p.muster.handle);
      if (p.musterRegeln?.basisHandle) handles.push(p.musterRegeln.basisHandle);
    }
    if (!handles.length && p.handle.startsWith('muster-')) handles.push(originalHandle(p.handle));
    return [...new Set(handles)];
  };
  const handles = abhaengigkeiten(produkt);
  if (!handles.length) { lexikon.etiketten = etikettenAusLexikon(produkt); return; }
  lexikon.loadingEtiketten = true;
  (async () => {
    const je = new Map([[produkt.handle, produkt]]), gesehen = new Set(je.keys());
    let offen = handles;
    // Nur die belegten Verweise verfolgen. Jede Adresse wird einmal geladen;
    // auch verkettete Basisartikel und zyklische Daten enden dadurch sicher.
    while (offen.length) {
      const batch = [...new Set(offen)].filter(h => !gesehen.has(h));
      batch.forEach(h => gesehen.add(h));
      const geladen = await Promise.all(batch.map(async handle => {
        const d = await fetchEinkauf(`/api/lexikon/produkt?${new URLSearchParams({ handle })}`);
        if (d?.produkt) je.set(handle, d.produkt);
        return d?.produkt;
      }));
      if (lexikon.produktKey !== key || lexikon.etikettenKey !== key) return;
      offen = geladen.filter(Boolean).flatMap(abhaengigkeiten).filter(h => !gesehen.has(h));
    }
    if (lexikon.produktKey !== key || lexikon.etikettenKey !== key) return;
    lexikon.etiketten = etikettenAusLexikon(produkt, je);
    lexikon.loadingEtiketten = false;
    if (state.route.view === 'lexikon') render();
  })();
}

/** Kam man ueber die Suche mit Farbnummer, ist diese Farbe fuer den Aufkleber vorgewaehlt. */
function vorauswahlZurSuche(produkt, liste) {
  const skus = new Set(lexikonTreffer(produkt, suchbegriffe(state.route.params.get('lq'))).varianten
    .map((v) => String(v.sku || '').toLowerCase()).filter(Boolean));
  const i = liste.findIndex((x) => skus.has(String(x.etikett?.sku || '').toLowerCase()));
  return i >= 0 ? i : 0;
}

function musterEtikettenBlock(produkt) {
  if (produkt.handle === 'kostenloses-muster') return `<section class="card lex-etiketten"><div class="card-head"><h2>Musteraufkleber</h2></div><p>Für den Aufkleber bitte das konkrete Produkt im Lexikon öffnen. Dort sind Farbe, Artikelnummer und Produktlink hinterlegt.</p><a class="btn" href="#/lexikon">Produkt suchen</a></section>`;
  ensureLexikonEtiketten(produkt);
  if (lexikon.loadingEtiketten) return `<section class="card lex-etiketten"><div class="card-head"><h2>Musteraufkleber</h2></div><p role="status">Lade die Angaben für den Aufkleber …</p></section>`;
  const liste = lexikon.etiketten;
  if (!liste.length) return '';
  const angefragt = Number(state.route.params.get('letikett'));
  const gewaehlt = state.route.params.has('letikett') && Number.isInteger(angefragt) && angefragt >= 0 && angefragt < liste.length;
  const index = gewaehlt ? angefragt : vorauswahlZurSuche(produkt, liste);
  const auswahl = liste[index];
  return `<section class="card lex-etiketten" data-lex-etiketten>
    <div class="card-head"><h2>Musteraufkleber</h2></div>
    <p class="small muted">Fertiger Aufkleber mit Produktname, Farbe und QR-Code für eure Etiketten (50 × 50, 50 × 80 oder 50 × 100 mm, Größe im Druckfenster wählen).</p>
    <div class="lex-etiketten-auswahl">
      <label>Farbe / Ausführung<select data-param="letikett" aria-label="Farbe oder Ausführung für den Aufkleber">${liste.map((x, i) => `<option value="${i}"${i === index ? ' selected' : ''}>${esc(x.bezeichnung)}</option>`).join('')}</select></label>
      <label>Anzahl<input id="lexEtikettAnzahl" type="number" min="1" max="20" step="1" value="${esc(lexikon.etikettAnzahl)}" data-lex-etikett-anzahl data-focus-erhalten inputmode="numeric"></label>
      ${istNurLesend() ? '' : `<button type="button" class="btn btn-primary" data-lex-etikett-vormerken${auswahl.etikett.fehlt.length || lexikon.vormerkenLaeuft ? ' disabled' : ''}>${lexikon.vormerkenLaeuft ? 'Wird vorgemerkt …' : 'Zum Drucken vormerken'}</button>`}
      <button type="button" class="btn btn-ghost" data-lex-etikett-drucken>Aufkleber ansehen</button>
    </div>
    ${lexikon.vorgemerkt?.handle === produkt.handle ? `<div class="lex-vorgemerkt" role="status"><p><strong>Vorgemerkt:</strong> ${esc(lexikon.vorgemerkt.anzahl)} × ${esc(lexikon.vorgemerkt.bezeichnung)}</p><div class="md-aktionen"><a class="btn" href="#/lexikon" data-lex-weiteres-muster>Weiteres Muster suchen</a><a class="btn" href="#/lexikon?tab=druckliste">Druckliste öffnen</a></div></div>` : ''}
    ${lexikon.vormerkFehler ? `<p class="notice warn" role="alert">${esc(lexikon.vormerkFehler)}</p>` : ''}
    ${auswahl.etikett.fehlt.length ? `<p class="small etk-fehlt">Noch ergänzen: ${esc(auswahl.etikett.fehlt.join(', '))}. Du kannst die Angaben in der Vorschau bearbeiten.</p>` : ''}
  </section>`;
}

function lexWert(w) { return (w === null || w === undefined || w === '') ? NICHT_HINTERLEGT : esc(String(w)); }

/**
 * Lieferant mit Namen aus den Stammdaten wie in Packstation und Bestellen (Rundgang 29.10., T8) -
 * vorher stand hier das Kuerzel ("A"). Ohne Stammdaten bleibt "Lieferant A".
 */
function lieferantZelle(id) {
  if (!id) return NICHT_HINTERLEGT;
  ensureEinkaufLieferanten();
  return esc(lieferantName(id, einkauf.lieferanten?.lieferanten || []));
}

/**
 * Name einer Variante in der Bestellliste. Viele Produkte unterscheiden ihre
 * Varianten nicht nach Farbe, sondern nach Breite oder Laenge (Vinyl von der
 * Rolle, Sockelleisten, Zubehoer) - mit der Farbe allein stand dort
 * "nicht hinterlegt", und 200, 300 und 400 cm waren nicht auseinanderzuhalten.
 * Der Variantentitel nennt beides ("Braun Dunkel / 200cm").
 */
function variantenName(v) {
  const titel = String(v.titel ?? '').trim();
  return titel && titel !== 'Default Title' ? titel : v.farbe;
}

/**
 * Artikelnummer zum Antippen. Fehlt sie, aber die Bestellbezeichnung des
 * Lieferanten ist da (Teppich nach Mass direkt vom Hersteller: "Alpaca
 * 3799/091 gekettelt nach Mass"), ist die Bezeichnung die Bestellangabe -
 * "nicht hinterlegt" waere dort falsch.
 */
function artikelAngabe(e, leerText) {
  if (e.artikelnummer) return `<code class="lex-artnr" data-kopiertext="${esc(e.artikelnummer)}" title="Antippen zum Kopieren">${esc(e.artikelnummer)}</code>`;
  if (e.produktname) return `<span class="small muted">Bestellbezeichnung</span> <code class="lex-artnr" data-kopiertext="${esc(e.produktname)}" title="Antippen zum Kopieren">${esc(e.produktname)}</code>`;
  return leerText;
}

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

/**
 * Ein Treffer als Karte: Bild, Name, Gruppe und Farbenzahl, rechts der Preis. Eine Tabelle
 * laesst sich am Handy nicht mit dem Daumen treffen - nachgeschlagen wird aber gerade unterwegs.
 */
function lexikonTrefferKarte(p) {
  const bild = p.bild ? `<img class="lex-bild" src="${esc(p.bild)}" alt="" loading="lazy">` : `<span class="lex-bild" aria-hidden="true"></span>`;
  const preis = preisText(p.preisAb, p.preisEinheit);
  const link = p.linkVorhanden
    ? '<span class="lex-link da" title="Lieferanten-Link vorhanden"></span>'
    : '<span class="lex-link" title="Lieferanten-Link fehlt noch"></span>';
  return `<div class="lex-karte" data-lex-open="${esc(p.handle)}" tabindex="0" role="button">
    ${bild}
    <div>
      <div class="t">${esc(p.titel)}</div>
      <div class="m">${link}${p.produktgruppe ? esc(p.produktgruppe) : NICHT_HINTERLEGT} · ${p.farbenAnzahl} Farbe${p.farbenAnzahl === 1 ? '' : 'n'}</div>
      ${suchHinweisKurz(p)}
      ${offeneBestellungenKurz(p)}
    </div>
    ${preis ? `<div class="preis"><small>ab</small>${esc(preis)}</div>` : ''}
  </div>`;
}

/**
 * Trefferkarte: warum passt das Produkt zur Suche? Vom Musteraufkleber kommt der
 * Lieferantenname ("Linie027 Kora 98") - die Karte nennt dann den Namen beim
 * Lieferanten und, wenn die Nummer eine Farbe trifft, Farbe und Farbnummer.
 */
function suchHinweisKurz(p) {
  const farben = (p.passend || []).map(f => `<b>${esc(f.farbe || 'Variante')}</b>${f.farbnummer ? ` · Farbnr. ${esc(f.farbnummer)}` : ''}`);
  if (p.passendMehr) farben.push(`+${esc(p.passendMehr)} weitere`);
  return `${p.lieferantName ? `<div class="m small muted">Beim Lieferanten: ${esc(p.lieferantName)}</div>` : ''}${farben.length ? `<div class="m">Passende Farbe: ${farben.join('; ')}</div>` : ''}`;
}

/** Trefferkarte: steckt das Produkt in offenen Bestellungen? Ware faellt auf, Muster nur leise. */
function offeneBestellungenKurz(p) {
  const ware = p.offeneBestellungen || 0;
  const muster = p.offeneMuster || 0;
  if (!ware && !muster) return '';
  return `<div class="m">${ware ? `<span class="badge p1">${ware} offene Bestellung${ware === 1 ? '' : 'en'}</span>` : ''}${muster ? `<span class="small muted">${ware ? ' ' : ''}${muster} Muster offen</span>` : ''}</div>`;
}

function viewLexikonListe() {
  ensureLexikonListe();
  const q = state.route.params.get('lq') || '';
  const toolbar = `<div class="toolbar search-hero"><input type="search" placeholder="Was hat der Kunde gesagt? Produktname, Farbe, SKU oder Artikelnummer …" value="${esc(q)}" data-param="lq" aria-label="Produkte durchsuchen"></div>`;
  const d = lexikon.liste;
  if (!d && lexikon.loadingListe) return toolbar + `<div class="empty">Lade Produkte …</div>`;
  if (d?.fehler) return toolbar + stoerungState(d, 'Das Lexikon');
  if (!d || !d.verfuegbar) {
    const hinweis = `${d?.hinweis || 'Noch keine Daten exportiert.'}${d?.befehl ? ` Befehl: ${d.befehl}` : ''}`;
    return toolbar + emptyState('Keine Produktdaten verfügbar.', hinweis);
  }
  const t = d.treffer;
  // Ohne Suchbegriff zuerst die Suche anbieten statt 638 Produkte in Shop-Reihenfolge -
  // die Liste bleibt einen Klick entfernt ("Alle durchblättern").
  if (!q && !state.route.params.get('lalle')) {
    return `${toolbar}
      <div class="empty search-hint"><strong>${d.anzahl} Produkte in der Suche.</strong> Tippe ein, was der Kunde genannt hat – das Lexikon findet das Produkt samt Lieferanten-Artikelnummer und Link. <button type="button" class="btn btn-sm" data-param="lalle" data-value="1">Alle durchblättern</button>
      <div class="small muted" style="margin-top:6px">Stand: ${esc(fmtDateTime(d.erstellt))}</div></div>`;
  }
  const pages = t.pages > 1 ? `<div class="lex-seiten">
      <button type="button" class="btn btn-sm" ${t.page <= 1 ? 'disabled' : ''} data-param="lseite" data-value="${t.page - 1}">← Zurück</button>
      <span class="muted small">Seite ${t.page} von ${t.pages} · ${t.count} Treffer</span>
      <button type="button" class="btn btn-sm" ${t.page >= t.pages ? 'disabled' : ''} data-param="lseite" data-value="${t.page + 1}">Weiter →</button>
    </div>` : '';
  return `${toolbar}
    <p class="small muted" style="margin:-4px 0 10px">${q ? `${t.count} Treffer für „${esc(q)}"` : `${d.anzahl} Produkte`} · Stand: ${esc(fmtDateTime(d.erstellt))}</p>
    <div class="lex-treffer">${t.items.length ? t.items.map(lexikonTrefferKarte).join('') : emptyState(q ? 'Keine Treffer.' : 'Noch keine Produkte.', q ? 'Begriff prüfen oder anders schreiben.' : '')}</div>
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
  nutzschicht: 'Nutzschicht',
  format: 'Format',
  arten: 'Art',
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

/**
 * Die Rollenbreite ist je nach Quelle in Metern ("4.0") oder Zentimetern ("400") hinterlegt.
 * Bisher stand hinter beidem "cm" - "4.0 cm" am Telefon vorgelesen ist falsch. Keine Rolle
 * ist schmaler als 20 cm, deshalb gilt ein kleinerer Zahlenwert als Meter.
 */
function rollenbreiteText(roh) {
  if (leerWert(roh)) return '';
  const zahl = Number(String(roh).replace(',', '.'));
  if (!Number.isFinite(zahl)) return esc(roh);
  return zahl <= 20 ? `${esc(String(zahl).replace('.', ','))} m` : `${esc(String(zahl).replace('.', ','))} cm`;
}

/**
 * Produktkarte: das, was man unterwegs wissen will, ohne zu lesen - Preis, die wichtigsten
 * Eckdaten, Farben, Muster. Jede Angabe steht genau einmal: was hier steht, fehlt unten in
 * "Fuer das Kundengespraech".
 */
function produktKarte(p, normaleVarianten) {
  const eig = p.eigenschaften || {};
  const farben = [...new Set(normaleVarianten.map((v) => v.farbe).filter(Boolean))];
  const preise = normaleVarianten.map((v) => v.preisJeEinheit).filter(Boolean);
  const minPreis = preise.length ? preise.reduce((a, b) => (a.betrag <= b.betrag ? a : b)) : null;
  const fakt = (name, wert, klasse = '') => leerWert(wert) ? '' : `<div><dt>${esc(name)}</dt><dd${klasse ? ` class="${klasse}"` : ''}>${wert}</dd></div>`;
  const jaNein = (w) => /^ja\b/i.test(String(w || '')) ? 'ja' : '';
  const muster = p.muster?.vorhanden
    ? (p.muster.handle ? `<a href="#" data-lex-open="${esc(p.muster.handle)}">Ja – ansehen →</a>` : 'Ja')
    : '<span class="muted">nicht hinterlegt</span>';
  const fakten = [
    fakt('Rollenbreite', rollenbreiteText(eig.rollenbreite)),
    fakt('m² pro Paket', eig.qmProPaket ? esc(eig.qmProPaket) : ''),
    fakt('Nutzungsklasse', eig.nutzungsklasse ? esc(eig.nutzungsklasse) : ''),
    fakt('Fußbodenheizung', eig.fussbodenheizung ? esc(eig.fussbodenheizung) : '', jaNein(eig.fussbodenheizung)),
    fakt('Material', eig.material ? esc(eig.material) : ''),
    fakt('Florhöhe', eig.florhoehe ? esc(eig.florhoehe) : ''),
    fakt('Gesamtstärke', eig.gesamtstaerke ? esc(eig.gesamtstaerke) : ''),
    fakt('Rücken', eig.ruecken ? esc(eig.ruecken) : ''),
    `<div><dt>Muster</dt><dd>${muster}</dd></div>`,
  ].join('');
  return `<section class="card lex-produkt">
    <div class="lex-produkt-kopf">
      ${p.bild ? `<img class="lex-produkt-bild" src="${esc(p.bild)}" alt="" loading="lazy">` : ''}
      <div class="lex-produkt-titel">
        <div class="gruppe">${p.produktgruppe ? esc(p.produktgruppe) : NICHT_HINTERLEGT}${statusHinweis(p.status)}</div>
        <h1>${esc(p.titel)}</h1>
      </div>
      ${minPreis ? `<div class="lex-produkt-preis"><span>ab</span><b>${esc(preisText(minPreis.betrag, minPreis.einheit))}</b></div>` : ''}
    </div>
    <dl class="lex-fakten">${fakten}</dl>
    ${farben.length ? `<div class="lex-abschnitt"><h3>${farben.length === 1 ? 'Farbe' : `${farben.length} Farben`}</h3><div class="lex-farben">${farben.map((f) => `<span>${esc(f)}</span>`).join('')}</div></div>` : ''}
    <div class="lex-produkt-fuss">
      ${p.shopUrl ? `<a class="btn btn-primary" href="${esc(p.shopUrl)}" target="_blank" rel="noopener">Im Shop ansehen ↗</a>` : `<span class="btn" aria-disabled="true">Im Shop ansehen (${NICHT_HINTERLEGT})</span>`}
      ${p.adminUrl ? `<a class="btn" href="${esc(p.adminUrl)}" target="_blank" rel="noopener">Im Shopify-Admin ↗</a>` : `<span class="btn" aria-disabled="true">Im Shopify-Admin (${NICHT_HINTERLEGT})</span>`}
    </div>
  </section>`;
}

// Shopify-Status in Klartext. "Aktiv" ist der Normalfall und steht nicht da - nur Abweichungen.
const PRODUKT_STATUS = { DRAFT: 'Entwurf – nicht im Shop', ARCHIVED: 'archiviert – nicht im Shop', UNLISTED: 'nicht gelistet' };
function statusHinweis(status) {
  if (!status || status === 'ACTIVE') return '';
  return ` · ${esc(PRODUKT_STATUS[status] || String(status).toLowerCase())}`;
}

/** Was oben in der Produktkarte keinen Platz hat: Herkunft und die Angaben, die man erklaeren muss. */
function fuersKundengespraech(p, normaleVarianten) {
  const eig = p.eigenschaften || {};
  const zeilen = [
    kgZeile('Kollektion', normaleVarianten[0]?.einkauf?.kollektion),
    kgZeile('Marke', normaleVarianten[0]?.einkauf?.marke),
    kgZeile('Fasermaterial', eig.fasermaterial),
    kgZeile('Trittschallverbesserung', eig.trittschallverbesserung),
    // Die Zahl steht oben; hier, was sie bedeutet - aber nur, wenn es dazu einen Klartext gibt.
    eig.nutzungsklasse && nutzungsklasseText(eig.nutzungsklasse) !== String(eig.nutzungsklasse) ? kgZeile('Nutzungsklasse bedeutet', nutzungsklasseText(eig.nutzungsklasse)) : '',
    kgZeile('Brandverhalten', eig.brandverhalten),
  ].join('');
  if (!zeilen.trim()) return '';
  return `<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Für das Kundengespräch</h2></div>
    <div class="kg-liste">${zeilen}</div>
  </section>`;
}

/**
 * Schnellzugriff zum Lieferanten fuer Varianten ohne Direkt- und ohne Suchlink (Server:
 * lexikonSchnellzugriff in operations/lib/lieferanten.mjs). Manche Lieferanten haben online
 * keine Artikelseiten - dann ist ihr Bestellweg aus den Stammdaten der Weg: die fertig
 * ausgefuellte Bestellmail, das Portal oder das Telefon.
 */
const schnellzugriffVon = (v) => (v.original ? v.original.schnellzugriff : v.link?.schnellzugriff) || null;
const WEG_KURZ = { mail: 'Bestellmail', portal: 'Portal', telefon: 'Anrufen' };
const WEG_TEXT = { mail: 'Bestellung per E-Mail', portal: 'Bestellung im Händlerportal', telefon: 'Bestellung per Telefon' };

function aktionHref(a) {
  if (a.weg === 'mail') return a.mailto;
  if (a.weg === 'telefon') return telLink(a.nummer);
  return a.href;
}

/**
 * Knopf fuer den Hauptweg. Kurz beschriftet ("Bestellmail"), weil Lieferant und Weg schon in
 * der Zeile ueber der Liste stehen - "Bestellmail an Lieferant B" sprengte die Tabellenspalte.
 * Der volle Text steht im Tooltip und fuer Screenreader.
 */
function schnellKnopf(sz) {
  const a = sz?.aktionen?.[0];
  const href = a ? aktionHref(a) : null;
  if (!href) return '';
  const neuerTab = a.weg === 'portal';
  const text = a.weg === 'mail' && sz.art === 'muster' ? 'Muster per Mail' : WEG_KURZ[a.weg];
  return `<a class="btn btn-sm" href="${esc(href)}"${neuerTab ? ' target="_blank" rel="noopener"' : ''} aria-label="${esc(a.label)}" title="${esc(a.label)}">${esc(text)}${neuerTab ? ' ↗' : ''}</a>`;
}

/** Dieselbe Mail in Gmail im Browser - fuer Rechner ohne eingerichtetes Mailprogramm (wie im Einkauf). */
function gmailZusatz(sz) {
  const m = sz?.aktionen?.find((a) => a.weg === 'mail');
  const g = m ? gmailLink({ an: m.an, betreff: m.betreff, text: m.text }) : null;
  return g?.url ? `<div class="small" style="margin-top:4px;white-space:nowrap"><a href="${esc(g.url)}" target="_blank" rel="noopener" title="Neue Nachricht in Gmail, fertig ausgefüllt">in Gmail ↗</a></div>` : '';
}

/**
 * Einmal ueber der Bestellliste: wie bei diesem Lieferanten bestellt wird, wenn es keinen Link
 * gibt - samt Kundennummer und Telefon, die nicht in jede Zeile gehoeren. Ohne hinterlegten
 * Bestellweg steht hier, wo man ihn nachtraegt.
 */
function bestellwegKopf(varianten) {
  const je = new Map();
  for (const v of varianten) {
    const sz = schnellzugriffVon(v);
    if (sz && !je.has(sz.lieferant)) je.set(sz.lieferant, sz);
  }
  return [...je.values()].map((sz) => {
    const einkaufLink = `#/einkauf?lieferant=${encodeURIComponent(sz.lieferant)}`;
    if (!sz.aktionen.length) {
      const wasFehlt = sz.stammdatenEintrag ? ` <a href="${einkaufLink}">Was fehlt?</a>` : '';
      return `<p class="lex-bestellweg small"><span class="warnc">${esc(sz.hinweis || `Bestellweg von ${sz.name} nicht hinterlegt.`)}</span>${wasFehlt}</p>`;
    }
    const haupt = sz.aktionen[0];
    const teile = [
      `<b>${esc(sz.name)}</b>`,
      esc(sz.art === 'muster' && haupt.weg === 'mail' ? 'Musterbestellung per E-Mail' : WEG_TEXT[haupt.weg]),
      sz.kundennummer ? `Kundennr. <code class="lex-artnr" data-kopiertext="${esc(sz.kundennummer)}" title="Antippen zum Kopieren">${esc(sz.kundennummer)}</code>` : '',
      ...sz.aktionen.slice(1).map((a) => (a.weg === 'telefon'
        ? `<a href="${esc(telLink(a.nummer))}">Anrufen ${esc(a.nummer)}</a>`
        : a.weg === 'portal' ? `<a href="${esc(a.href)}" target="_blank" rel="noopener">Portal ↗</a>` : '')),
    ].filter(Boolean);
    const erklaerung = haupt.weg !== 'mail' ? ''
      : sz.art === 'muster' ? '„Muster per Mail“ öffnet die Musterbestellung mit Artikel- und Farbnummer.'
        : '„Bestellmail“ an der Variante öffnet die Mail mit Artikel- und Farbnummer – Menge und Lieferanschrift ergänzen.';
    return `<p class="lex-bestellweg small">${teile.join(' · ')}${erklaerung ? `<br><span class="muted">${esc(erklaerung)}</span>` : ''}</p>`;
  }).join('');
}

function bestellZeile(v, passende = new Set()) {
  const e = v.einkauf || {};
  const artikelZelle = artikelAngabe(e, NICHT_HINTERLEGT);
  const sz = schnellzugriffVon(v);
  const linkZelle = v.link?.status === 'vorhanden'
    ? `<a class="btn btn-sm" href="${esc(e.url)}" target="_blank" rel="noopener">Beim Lieferanten öffnen ↗</a>`
    : sz?.aktionen?.length
      ? `${schnellKnopf(sz)}${gmailZusatz(sz)}`
      : `<div class="small muted">${esc(v.link?.grund || 'kein Link hinterlegt')}</div>${v.link?.suchlink ? `<a class="small" href="${esc(v.link.suchlink)}" target="_blank" rel="noopener">Beim Lieferanten suchen ↗</a>` : ''}`;
  // data-l traegt die Spaltenueberschrift; am Handy wird daraus eine Karte
  // (app.css, .table-scroll table.tasks.compact). Ohne sie stand die Tabelle
  // mit zehn Spalten auf 980 px fest - die Artikelnummer, wegen der man diese
  // Ansicht ueberhaupt oeffnet, lag ausserhalb des Bildes.
  return `<tr${passende.has(v) ? ' class="lex-passt"' : ''}>
    <td data-l="Variante">${lexWert(variantenName(v))}${passende.has(v) ? ' <span class="badge plain">passt zur Suche</span>' : ''}</td>
    <td data-l="Unsere SKU">${v.sku ? `<code class="mono">${esc(v.sku)}</code>` : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferant">${lieferantZelle(e.lieferant)}</td>
    <td data-l="Artikelnummer">${artikelZelle}</td>
    <td data-l="Farbnummer">${lexWert(e.farbnummer)}</td>
    <td data-l="Bestelleinheit">${lexWert(e.bestelleinheit)}</td>
    <td data-l="Preis">${preisZelle(v)}</td>
    <td data-l="Verfügbar">${v.verfuegbar === true ? 'Ja' : v.verfuegbar === false ? 'Nein' : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferweg">${e.lieferweg ? esc(LIEFERWEG_LABEL[e.lieferweg] || e.lieferweg) : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferantenseite">${linkZelle}</td>
  </tr>`;
}

/**
 * Dieselben Bestellangaben als kompakte Liste fuer schmale Fenster: je Farbe eine Zeile mit
 * Artikelnummer zum Antippen. Als gestapelte Tabellenkarten (neun Felder je Farbe) war ein
 * Produkt mit 19 Farben am Handy ueber zehn Bildschirme lang. Was fuer alle Farben gleich
 * ist (Lieferant, Bestelleinheit, Lieferweg), steht einmal darueber.
 */
const LISTE_OFFEN = 6;
function bestellListe(varianten, passende = new Set()) {
  if (!varianten.length) return '';
  const gleich = (lesen) => {
    const werte = [...new Set(varianten.map(lesen).map((w) => (leerWert(w) ? '' : String(w))))];
    return werte.length === 1 && werte[0] ? werte[0] : null;
  };
  const lieferant = gleich((v) => v.einkauf?.lieferant);
  const einheit = gleich((v) => v.einkauf?.bestelleinheit);
  const lieferweg = gleich((v) => v.einkauf?.lieferweg);
  // Steht der Lieferant schon in der Bestellweg-Zeile darueber, nicht ein zweites Mal.
  const lieferantOben = lieferant && varianten.some((v) => schnellzugriffVon(v)?.aktionen?.length);
  const gemeinsam = [
    lieferant && !lieferantOben ? `Lieferant ${esc(lieferant)}` : '',
    einheit ? `Bestelleinheit ${esc(einheit)}` : '',
    lieferweg ? esc(LIEFERWEG_LABEL[lieferweg] || lieferweg) : '',
  ].filter(Boolean).join(' · ');
  const zeile = (v) => {
    const e = v.einkauf || {};
    const nebenbei = [
      v.sku ? `SKU ${esc(v.sku)}` : '',
      e.farbnummer ? `Farbnr. ${esc(e.farbnummer)}` : '',
      lieferant ? '' : (e.lieferant ? `Lieferant ${esc(e.lieferant)}` : ''),
      einheit ? '' : (e.bestelleinheit ? esc(e.bestelleinheit) : ''),
      lieferweg ? '' : (e.lieferweg ? esc(LIEFERWEG_LABEL[e.lieferweg] || e.lieferweg) : ''),
      v.verfuegbar === false ? '<span class="warnc">nicht verfügbar</span>' : '',
    ].filter(Boolean).join(' · ');
    const artikel = artikelAngabe(e, `<span class="small muted">Art.-Nr. nicht hinterlegt</span>`);
    const sz = schnellzugriffVon(v);
    const link = v.link?.status === 'vorhanden'
      ? `<a class="btn btn-sm" href="${esc(e.url)}" target="_blank" rel="noopener" aria-label="Beim Lieferanten öffnen">Lieferant ↗</a>`
      : (v.link?.suchlink ? `<a class="btn btn-sm" href="${esc(v.link.suchlink)}" target="_blank" rel="noopener" aria-label="Beim Lieferanten suchen">Suchen ↗</a>` : schnellKnopf(sz));
    return `<li${passende.has(v) ? ' class="lex-passt"' : ''}>
      <div class="kopf"><span><b>${lexWert(variantenName(v))}</b>${passende.has(v) ? ' <span class="badge plain">passt zur Suche</span>' : ''}</span><span class="preis">${preisZelle(v)}</span></div>
      <div class="nr">${artikel}${link}</div>
      ${nebenbei ? `<div class="small muted">${nebenbei}</div>` : ''}
      ${v.link?.status === 'vorhanden' || sz?.aktionen?.length ? '' : `<div class="small muted">${esc(v.link?.grund || 'kein Link hinterlegt')}</div>`}
    </li>`;
  };
  return `<div class="lex-bestell-liste">
    ${gemeinsam ? `<p class="small muted" style="margin:0 0 8px">${gemeinsam}</p>` : ''}
    <ul>${varianten.slice(0, LISTE_OFFEN).map(zeile).join('')}</ul>
    ${varianten.length > LISTE_OFFEN ? `<details><summary>Alle ${varianten.length} Varianten zeigen</summary><ul>${varianten.slice(LISTE_OFFEN).map(zeile).join('')}</ul></details>` : ''}
  </div>`;
}

function musterBestellZeile(v) {
  const o = v.original || {};
  const artikelZelle = o.artikelnummer
    ? `<code class="lex-artnr" data-kopiertext="${esc(o.artikelnummer)}" title="Antippen zum Kopieren">${esc(o.artikelnummer)}</code>`
    : NICHT_HINTERLEGT;
  const linkZelle = o.gefunden && o.url
    ? `<a class="btn btn-sm" href="${esc(o.url)}" target="_blank" rel="noopener">Original beim Lieferanten ↗</a>`
    : o.gefunden && o.suchlink
      ? `<a class="btn btn-sm" href="${esc(o.suchlink)}" target="_blank" rel="noopener">Beim Lieferanten suchen ↗</a>`
      : o.schnellzugriff?.aktionen?.length
        ? `${schnellKnopf(o.schnellzugriff)}${gmailZusatz(o.schnellzugriff)}`
        : `<div class="small muted">${esc(o.grund || 'kein Original hinterlegt')}</div>`;
  return `<tr>
    <td data-l="Unsere SKU">${v.sku ? `<code class="mono">${esc(v.sku)}</code>` : NICHT_HINTERLEGT}</td>
    <td data-l="Lieferant">${lieferantZelle(o.lieferant)}</td>
    <td data-l="Original-Artikelnummer">${artikelZelle}<div class="small muted">Original beim Lieferanten – das Muster selbst hat keine eigene Artikelnummer</div></td>
    <td data-l="Original beim Lieferanten">${linkZelle}</td>
  </tr>`;
}

/** Mengenhilfe-Widget: Kundenmenge -> Bestellmenge, rechnet ueber /api/lexikon/mengenhilfe (operations/lib/umrechnung.mjs). */
function mengenhilfeWidget(p, zielVariante, varianten = []) {
  if (!zielVariante || zielVariante.wunschmass) return '';
  const einheit = zielVariante.einkauf?.bestelleinheit;
  if (!einheit) return '';
  // Mehrere Rollenbreiten (Teppichboden 400/500 cm, Vinyl 200/300/400 cm):
  // die Bestellmenge haengt von der Rolle ab, also waehlen lassen statt
  // stillschweigend die erste Variante zu nehmen.
  const jeBreite = new Map();
  for (const v of varianten) if (v.rollenbreiteM > 0 && !jeBreite.has(v.rollenbreiteM)) jeBreite.set(v.rollenbreiteM, v.id);
  const breiten = [...jeBreite].sort((a, b) => a[0] - b[0]);
  const auswahl = breiten.length > 1
    ? `<select data-mh-variante aria-label="Rollenbreite" style="min-height:42px;padding:7px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font:inherit">${breiten.map(([m, id]) => `<option value="${esc(id)}"${id === zielVariante.id ? ' selected' : ''}>Rolle ${esc(String(Math.round(m * 100)))} cm</option>`).join('')}</select>`
    : '';
  return `<div data-mh-wrap="${esc(p.handle)}" data-mh-default-variant="${esc(zielVariante.id || '')}" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
    <div class="small" style="font-weight:600;margin-bottom:6px">Mengenhilfe: Kundenmenge → Bestellmenge beim Lieferanten</div>
    <div class="toolbar">
      ${auswahl}
      <input type="text" inputmode="decimal" placeholder="Kundenmenge in m²" data-mh-menge aria-label="Kundenmenge in m²" style="flex:1 1 150px;max-width:220px;min-height:42px;padding:7px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font:inherit">
      <button type="button" class="btn btn-sm" data-mh-go>Bestellmenge berechnen</button>
    </div>
    <div class="small" data-mh-ergebnis style="margin-top:6px"></div>
  </div>`;
}

// Eigenschaften, die bereits in der Produktkarte oder im Kundengespraech stehen - der Rest (Optik,
// Zimmer, Belagsart, Aufbau, Poleneinsatzgewicht, Komfortklasse, ...) gehoert
// zu keiner der beiden Aufgaben und landet deshalb nur noch bei "Interne Angaben".
const KUNDENGESPRAECH_EIGENSCHAFTEN = new Set([
  'material', 'fasermaterial', 'florhoehe', 'gesamtstaerke', 'trittschallverbesserung',
  'nutzungsklasse', 'brandverhalten', 'fussbodenheizung', 'ruecken',
  // stehen in der Produktkarte
  'rollenbreite', 'qmProPaket',
]);

function internesDetails(p) {
  const zeilen = (p.varianten || []).map((v) => {
    const teile = [v.sku, v.einkauf?.procurementId ? `Beschaffungs-ID ${v.einkauf.procurementId}` : null].filter(Boolean);
    return teile.length ? `<li>${teile.map(esc).join(' · ')}</li>` : '';
  }).filter(Boolean);
  const weitereEigenschaften = Object.entries(p.eigenschaften || {}).filter(([k]) => !KUNDENGESPRAECH_EIGENSCHAFTEN.has(k));
  return `<details class="lex-intern" style="margin-top:8px"><summary class="small muted">Interne Angaben</summary>
    <div class="small muted" style="margin-top:8px">
      <div>Handle: <code class="mono">${esc(p.handle)}</code></div>
      ${zeilen.length ? `<ul style="margin:6px 0 0;padding-left:18px">${zeilen.join('')}</ul>` : ''}
      ${weitereEigenschaften.length ? `<ul style="margin:6px 0 0;padding-left:18px">${weitereEigenschaften.map(([k, v]) => `<li><b>${esc(eigenschaftLabel(k))}:</b> ${esc(String(v))}</li>`).join('')}</ul>` : ''}
    </div>
  </details>`;
}

/**
 * Rueckweg vom Produkt zum Kunden: in welchen offenen Bestellungen steckt dieses Produkt,
 * und bei wem? Wer im Kundengespraech nachschlaegt, sieht das sofort - ohne in die
 * Kundenliste zu wechseln. Der naechste Schritt aus "Zu tun" (wartendeKunden) steht an der
 * passenden Bestellung; Faelle ohne offene Bestellung hier stehen darunter.
 */
function offeneBestellungenBlock(offene = [], wartende = []) {
  const ware = offene.filter(o => !o.istMuster);
  const muster = offene.filter(o => o.istMuster);
  const schrittJeBestellung = new Map(wartende.filter(w => w.bezug).map(w => [w.bezug, w.schritt]));
  const bekannt = new Set(offene.map(o => o.bestellung));
  const uebrige = wartende.filter(w => !w.bezug || !bekannt.has(w.bezug));
  if (!ware.length && !muster.length && !uebrige.length) return '';
  const kundeLink = o => `<a href="#/kunden?kunde=${encodeURIComponent(o.kundenKey)}"><b>${esc(o.kunde)}</b></a>`;
  const zeile = o => {
    const schritt = schrittJeBestellung.get(o.bestellung);
    return `<li>${kundeLink(o)} · ${esc(o.bestellung)} vom ${esc(fmtDate(o.datum))}${o.farbe ? ` · ${esc(o.farbe)}` : ''}${o.menge && !o.istMuster ? ` · ${esc(o.menge)}` : ''} – ${esc(o.stand)}${schritt ? ` <span class="small muted">(als Nächstes: ${esc(schritt)})</span>` : ''}</li>`;
  };
  const anzahl = new Set(ware.map(o => o.orderId)).size;
  const titel = ware.length
    ? `${anzahl === 1 ? 'Eine offene Bestellung' : `${anzahl} offene Bestellungen`} mit diesem Produkt`
    : (muster.length ? 'Muster dieses Produkts noch offen' : 'Kunden warten auf dieses Produkt');
  return `<section class="card lex-offen${ware.length || uebrige.length ? ' wichtig' : ''}">
    <div class="card-head"><h2>${titel}</h2><a class="more" href="#/kunden">Kunden öffnen →</a></div>
    ${ware.length ? `<ul>${ware.map(zeile).join('')}</ul>` : ''}
    ${muster.length ? `${ware.length ? '<h3>Muster noch offen</h3>' : ''}<ul>${muster.map(zeile).join('')}</ul>` : ''}
    ${uebrige.length ? `<h3>Außerdem warten</h3><ul>${uebrige.map(w => `<li><b>${esc(w.kunde)}</b>${w.bezug ? ` · ${esc(w.bezug)}` : ''}${w.tage !== null && w.tage !== undefined ? ` · seit ${w.tage === 0 ? 'heute' : `${w.tage} Tagen`}` : ''} – ${esc(w.schritt)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function viewLexikonDetail(handle) {
  ensureLexikonProdukt(handle);
  const zurueck = `<p style="margin:0"><a class="lex-zurueck" href="#" data-lex-zurueck>← Zurück zum Lexikon</a></p>`;
  const d = lexikon.produktKey === handle ? lexikon.produkt : null;
  if (!d) return zurueck + `<div class="empty">Lade Produkt …</div>`;
  if (!d || !d.verfuegbar) return zurueck + emptyState('Produkt nicht gefunden.', d?.hinweis || 'Handle prüfen.');
  const p = d.produkt;
  const alleVarianten = p.varianten || [];
  const musterVarianten = alleVarianten.filter((v) => v.original);
  // Kam man ueber die Suche ("Linie027 Kora 98"), stehen die passenden Farben oben und markiert.
  const gefunden = lexikonTreffer(p, suchbegriffe(state.route.params.get('lq'))).varianten.filter((v) => !v.wunschmass && !v.original);
  const ungefiltert = alleVarianten.filter((v) => !v.wunschmass && !v.original);
  const passende = new Set(gefunden.length < ungefiltert.length ? gefunden : []);
  const normaleVarianten = [...ungefiltert.filter((v) => passende.has(v)), ...ungefiltert.filter((v) => !passende.has(v))];
  const wunschmassVarianten = alleVarianten.filter((v) => v.wunschmass);
  const zielVariante = normaleVarianten[0] || alleVarianten[0];

  const bestellTabelle = musterVarianten.length
    ? `${bestellwegKopf(musterVarianten)}<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Unsere SKU</th><th>Lieferant</th><th>Original-Artikelnummer</th><th>Original beim Lieferanten</th></tr></thead>
      <tbody>${musterVarianten.map(musterBestellZeile).join('')}</tbody></table></div>`
    : `${bestellwegKopf(normaleVarianten)}${bestellListe(normaleVarianten, passende)}<div class="table-scroll lex-bestell-tabelle"><table class="tasks compact"><thead><tr><th>Variante</th><th>Unsere SKU</th><th>Lieferant</th><th>Artikelnummer</th><th>Farbnummer</th><th>Bestelleinheit</th><th>Preis</th><th>Verfügbar</th><th>Lieferweg</th><th>Lieferantenseite</th></tr></thead>
      <tbody>${normaleVarianten.map((v) => bestellZeile(v, passende)).join('') || `<tr><td colspan="10">${NICHT_HINTERLEGT}</td></tr>`}</tbody></table></div>
      ${wunschmassVarianten.length ? `<p class="small muted" style="margin:10px 0 0">Wunschmaß (${wunschmassVarianten.length} Variante${wunschmassVarianten.length === 1 ? '' : 'n'}): wird erst beim Zuschnitt bestellt, deshalb hier ohne eigene Artikelnummer – keine fehlende Angabe.</p>` : ''}
      ${mengenhilfeWidget(p, zielVariante, normaleVarianten)}`;

  return `${zurueck}
    ${offeneBestellungenBlock(d.offeneBestellungen, d.wartendeKunden)}
    ${produktKarte(p, normaleVarianten)}
    ${musterEtikettenBlock(p)}
    ${fuersKundengespraech(p, normaleVarianten)}
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Zum Bestellen</h2></div>${bestellTabelle}</section>
    ${internesDetails(p)}`;
}

export function viewLexikon() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Lexikon</h1><p class="sub">Hier findest du zum Produktnamen des Kunden das Original beim Lieferanten.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Einkaufsdaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  const handle = state.route.params.get('handle');
  if (state.route.params.get('tab') === 'druckliste') return viewMusterDruckliste();
  if (state.route.params.get('tab') === 'etiketten') return viewMusterEtikettenStatus();
  const drucklisteLink = '<p class="lex-druckliste-link"><a class="btn" href="#/lexikon?tab=druckliste">Aufkleber-Druckliste</a><a class="btn" href="#/lexikon?tab=etiketten">Aufkleber prüfen</a></p>';
  const head = `<div class="page-head"><div><h1>Lexikon</h1><p class="sub">Hier findest du zum Produktnamen des Kunden das Original beim Lieferanten samt Bestelldaten.</p></div></div>`;
  // Im Produkt entfaellt der erklaerende Seitenkopf: am Handy schob er Name und Preis aus dem
  // ersten Bildschirm. "Lexikon" steht weiter in der Kopfzeile.
  return drucklisteLink + (handle ? viewLexikonDetail(handle) : head + viewLexikonListe());
}

/** Lexikon: Produkt oeffnen, Mengenhilfe rechnen, zurueck zur Liste. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function lexikonKlick(e) {
  if (musterEtikettenStatusKlick(e)) return true;
  if (musterDrucklisteKlick(e)) return true;
  const etikettKnopf = e.target.closest('[data-lex-etikett-drucken],[data-lex-etikett-vormerken]');
  if (etikettKnopf) {
    e.preventDefault();
    const wrap = etikettKnopf.closest('[data-lex-etiketten]');
    const index = Number(wrap?.querySelector('select[data-param="letikett"]')?.value);
    const anzahl = Number(wrap?.querySelector('[data-lex-etikett-anzahl]')?.value);
    const auswahl = lexikon.etiketten[index];
    if (!auswahl) { toast('Bitte zuerst eine Farbe oder Ausführung wählen.'); return true; }
    if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 20) { toast('Bitte eine Anzahl von 1 bis 20 eingeben.'); return true; }
    lexikon.etikettAnzahl = anzahl;
    if (etikettKnopf.hasAttribute('data-lex-etikett-vormerken')) {
      if (istNurLesend() || lexikon.vormerkenLaeuft || auswahl.etikett.fehlt.length) return true;
      const handle = lexikon.produkt?.produkt?.handle;
      if (!handle) { toast('Bitte das Produkt erneut öffnen.'); return true; }
      const aktuelleSitzung = vormerkSitzung;
      lexikon.vormerkenLaeuft = true; lexikon.vormerkFehler = ''; etikettKnopf.disabled = true;
      void drucklisteVormerken({ handle, key: auswahl.key, anzahl }).then(ok => {
        if (aktuelleSitzung !== vormerkSitzung || lexikon.produktKey !== handle) return;
        if (ok) lexikon.vorgemerkt = { handle, anzahl, bezeichnung: auswahl.bezeichnung };
        else lexikon.vormerkFehler = 'Vormerkung nicht bestätigt. Bitte die Druckliste prüfen und bei Bedarf erneut vormerken.';
      }).finally(() => {
        if (aktuelleSitzung !== vormerkSitzung) return;
        lexikon.vormerkenLaeuft = false;
        if (state.route.view === 'lexikon' && state.route.params.get('tab') !== 'druckliste') render();
      });
      return true;
    }
    oeffneEtikettenDruck({ etiketten: Array.from({ length: anzahl }, () => auswahl.etikett), titel: 'Musteretikett drucken' });
    return true;
  }
  if (e.target.closest('[data-lex-weiteres-muster]')) {
    e.preventDefault();
    window.addEventListener('hashchange', () => requestAnimationFrame(() => document.querySelector('#main input[data-param="lq"]')?.focus()), { once: true });
    location.hash = '#/lexikon';
    return true;
  }
  const lexOpen = e.target.closest('[data-lex-open]');
  if (lexOpen) { e.preventDefault(); const p = new URLSearchParams(); p.set('handle', lexOpen.dataset.lexOpen); if (state.route.params.get('lq')) p.set('lq', state.route.params.get('lq')); location.hash = `#/lexikon?${p}`; return true; }
  const mhGo = e.target.closest('[data-mh-go]');
  if (mhGo) {
    e.preventDefault();
    const wrap = mhGo.closest('[data-mh-wrap]');
    const out = wrap?.querySelector('[data-mh-ergebnis]');
    if (!wrap || !out) return true;
    const handle = wrap.dataset.mhWrap;
    const variantenId = wrap.querySelector('[data-mh-variante]')?.value || wrap.dataset.mhDefaultVariant;
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
