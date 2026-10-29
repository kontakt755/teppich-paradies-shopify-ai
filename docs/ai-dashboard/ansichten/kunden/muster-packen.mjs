/**
 * Kunden, Reiter "Muster packen" (#1572): offene, bezahlte Musterbestellungen je Kunde in
 * Packreihenfolge. Standard ist "Alle offenen" (Inhaber 26.10.2026): jede Musterbestellung steht
 * sofort hier, wartende mit Anmerkung "bestellt am …"; dazu Packbereit · Zu klären · Wartet · Gepackt.
 * Darunter filtert "Umschlag:" nach noch vorbereiten · vorbereitet · Muster schon drin (Inhaber 28.10.);
 * "noch vorbereiten" druckt die gezeigten Umschlaege in einem Lauf.
 * Die Suche findet ein Muster auch ueber Hersteller, Herstellerprodukt und Farbnummer (offeneSuche) -
 * in beiden Ansichten und auch in Bestellungen ausserhalb der Packliste (mit Grund, ohne Aktion).
 * Schon gepackte und versandte Bestellungen zaehlen dabei nicht mit, ein Klick zeigt sie (29.10.).
 * Neu etikettieren: je Muster "Aufkleber drucken"; "Alle eingelegt – Umschlag gepackt" hakt in einem
 * Schritt ab und packt. Sind Aufkleber und Adresse gedruckt, steht der Umschlag fuer alle Geraete als
 * "Umschlag vorbereitet" in der Liste (#1718) - er wartet dann nur noch auf die Muster.
 * Je Muster: Bild genau dieser Farbe, Partnerladen, was auf dem Lieferantenmuster steht (vorher,
 * Farbnummer gross) und welcher Aufkleber darauf kommt (nachher). Abhaken speichert zentral;
 * bleibt ein Muster offen, geht der Kunde mit "Fehlt etwas" nach "Zu klären", bis "Fehlendes ist da".
 * "Nach Partnerladen" (mp=laden): Wareneingang sortieren - je Laden alle noch nicht eingelegten
 * Muster mit Ziel-Umschlag, Aufkleber und Haken direkt in der Zeile.
 * Porto und Versandbuchung folgen, wenn der Versandweg entschieden ist.
 * In beiden Ansichten steht oben fuer den Packer, welche Herstelleretiketten abkommen (PACKER_INFO).
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { oeffneEtikettenDruck } from '../../bausteine/etiketten-druck.mjs';
import { STAND_TEXT, WARTET_AB_TAGEN, aufkleberFuer, aufkleberFuerMuster, handTreffer, musterNachLaden, offeneSuche, umschlagKennung } from '../../lib/muster-packen.mjs';
import { parseRoute } from '../../kern/router.mjs';
import { oeffneGrossbriefVorbereitung } from './muster-grossbrief.mjs';
import { kunden } from './gemeinsam.mjs';

let packOffen = null;
let packFehler = null;
let packFehlerStand = null;
// Bestellungen, deren Versand nach "Verschickt" nicht sicher in Shopify steht: bleibt sichtbar, bis jemand
// "Verstanden" klickt - der Umschlag ist dann schon aus der Liste, ein Toast allein ginge unter (Pruefung 29.10.).
let versandProbleme = [];
let packSpeichert = false;
let letztesPackZiel = null;
let letzterPackModus = null;
let packGebunden = false;
function bindePackOffen() {
  if (packGebunden) return;
  document.addEventListener('toggle', e => {
    if (e.target.matches?.('details[data-mp-kunde]')) {
      if (e.target.open) packOffen = e.target.dataset.mpKunde;
      else if (packOffen === e.target.dataset.mpKunde) packOffen = null;
    }
  }, true);
  packGebunden = true;
}

const ENDPOINT = '/api/kunden/muster-packen';

// Info fuer den Packer (Inhaber 26.10.2026): Herstelleretiketten kommen ab, nur Vorwerk und JAB behalten ihres.
const PACKER_INFO = '<p class="notice mp-packer-info"><strong>Wichtig beim Packen:</strong> Herstelleretiketten von den Mustern entfernen – außer bei Vorwerk und JAB. Dort bleibt das Herstelleretikett dran.</p>';

// "Gedruckt" (Umschlag vorbereitet) steht seit 26.10. gemeinsam auf dem Server (#1718). Vorher merkte
// es sich nur der Browser des druckenden Geraets - diese Vermerke werden beim ersten Laden uebernommen.
const ALT_GEDRUCKT_SCHLUESSEL = 'tp-mp-gedruckt';
/** Gerade gedruckt, vom Server noch nicht bestaetigt: der naechste Schritt leuchtet trotzdem schon. */
const gedrucktHier = new Set();
const istGedruckt = k => !!k.gedruckt || gedrucktHier.has(k.packSchluessel);
const gedrucktText = g => `gedruckt ${fmtDateTime(g.zeit)}${g.von ? ` · ${g.von}` : ''}`;

/**
 * Druckvermerk speichern - nach einem vollstaendigen Druck oder fuer alte Geraetevermerke (`seit`).
 * Ohne eigenen Schreibriegel: der Druckdialog ist offen, gezeichnet wird erst nach dem Schliessen.
 */
async function vermerkeGedruckt(pks, { seit = {} } = {}) {
  if (istNurLesend() || !pks.length) return 0;
  for (const pk of pks) gedrucktHier.add(pk);
  let ok = 0;
  for (const pk of pks) {
    try {
      await orgSchreiben(ENDPOINT, { packSchluessel: pk, aktion: 'gedruckt', gedruckt: true, ...(seit[pk] ? { seit: seit[pk] } : {}) });
      ok++;
    } catch (err) {
      gedrucktHier.delete(pk);
      toast(`Gedruckt, aber nicht als vorbereitet vermerkt: ${err.message} – „Schon gedruckt“ wählen.`, 'warn');
    }
  }
  try {
    const neu = await fetchEinkauf(ENDPOINT);
    if (neu?.verfuegbar && !neu.fehler) { kunden.musterPacken = neu; for (const pk of pks) gedrucktHier.delete(pk); }
  } catch { /* bisheriger Stand bleibt sichtbar */ }
  if (!document.querySelector?.('.etk-dialog')) render();
  return ok;
}

/** Einmal je Seite: alte Druckvermerke dieses Browsers fuer noch offene Umschlaege uebernehmen. */
let altUebernommen = false;
async function alteVermerkeUebernehmen(d) {
  if (altUebernommen || !d?.verfuegbar || istNurLesend()) return;
  altUebernommen = true;
  let alt = null;
  try { alt = JSON.parse(localStorage.getItem(ALT_GEDRUCKT_SCHLUESSEL) || 'null'); } catch { return; }
  if (!alt || typeof alt !== 'object') return;
  const offen = new Set(d.kunden.filter(k => !k.gepackt && !k.gedruckt).map(k => k.packSchluessel));
  const pks = Object.keys(alt).filter(pk => offen.has(pk) && Number.isFinite(Number(alt[pk])));
  const ok = await vermerkeGedruckt(pks, { seit: Object.fromEntries(pks.map(pk => [pk, new Date(Number(alt[pk])).toISOString()])) });
  if (ok === pks.length) { try { localStorage.removeItem(ALT_GEDRUCKT_SCHLUESSEL); } catch { /* bleibt bis zum naechsten Laden */ } }
  if (ok) toast(`${plural(ok, 'Umschlag', 'Umschläge')} von diesem Gerät als vorbereitet übernommen`);
}

/** Zuletzt im Reiter "Muster kommt an" eingelegt: Rueckmeldung, wohin es kam und was noch fehlt. */
let handMeldung = null;

export function ensureMusterPacken() {
  if (kunden.musterPacken || kunden.loadingMusterPacken) return;
  kunden.loadingMusterPacken = true;
  fetchEinkauf(ENDPOINT).then(d => {
    kunden.musterPacken = d; kunden.loadingMusterPacken = false;
    if (['kunden', 'heute'].includes(state.route.view)) render();
    void alteVermerkeUebernehmen(d);
  });
}

/** Zahl am Reiter: alle offenen Umschlaege (packbereit, zu klaeren, wartend), ohne Gepacktes. */
export function musterPackenOffen() {
  const d = kunden.musterPacken;
  return d?.verfuegbar ? (d.offen ?? 0) : 0;
}

/** "bestellt am 24.10. (automatisch)" - ohne belegtes Datum bleibt es beim Standtext. */
const datumKurz = iso => fmtDate(iso).slice(0, 6);
function standText(m) {
  if (m.stand !== 'bestellt' || !m.bestelltAm) return STAND_TEXT[m.stand] || '';
  return `beim Lieferanten bestellt am ${datumKurz(m.bestelltAm)}${m.automatisch ? ' (automatisch)' : ''}`;
}

/** "Di., 20.10." - mit Wochentag und in Berlin, wie die Wartetage (#1754). */
const tagDatum = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
const gueltig = iso => !!iso && !Number.isNaN(new Date(iso).getTime());

/** Muster, die noch nicht im Haus sind, und die belegten Daten ihrer Bestellung beim Lieferanten. */
function nochNichtDa(k) {
  const nichtDa = k.muster.filter(m => !m.abgehakt && !['da', 'lager'].includes(m.stand));
  const bestellt = nichtDa.filter(m => m.stand === 'bestellt');
  return { nichtDa, bestellt, isos: bestellt.map(m => m.bestelltAm).filter(gueltig).sort() };
}

/** " am 24.10." oder " zwischen 22.10. und 24.10." - leer ohne belegtes Datum. */
function wannText(isos, format) {
  if (!isos.length) return '';
  const erst = format(isos[0]), letzt = format(isos.at(-1));
  return erst === letzt ? ` am ${erst}` : ` zwischen ${erst} und ${letzt}`;
}

/** Anmerkung fuer einen wartenden Umschlag: was fehlt noch, seit wann bestellt, wie geht es weiter. */
function warteAnmerkung(k) {
  const { nichtDa, bestellt, isos } = nochNichtDa(k);
  if (!nichtDa.length) return '';
  const wann = wannText(isos, datumKurz);
  const auto = bestellt.filter(m => m.automatisch).length;
  const wie = !bestellt.length ? '' : auto === bestellt.length ? ', automatisch per Mail' : auto ? ', teils automatisch per Mail' : '';
  const ohne = nichtDa.length - bestellt.length;
  return `<p class="notice warn mp-anmerkung"><strong>Noch nicht da:</strong> ${nichtDa.length} von ${plural(k.muster.length, 'Muster', 'Mustern')}.`
    + `${bestellt.length ? ` Beim Lieferanten bestellt${wann}${wie}.` : ''}`
    + `${ohne ? ` ${plural(ohne, 'Muster ist', 'Muster sind')} noch nicht bestellt – unter „Bestellen“ prüfen.` : ''}`
    + ' Kommt ein Muster an: abhaken. Sind alle abgehakt, ist der Umschlag packbereit.</p>';
}

/**
 * Kopfzeile rechts, ohne Aufklappen (Inhaber 28.10.: "an welchem Datum bestellt wurde"): Bestelldatum
 * samt Wartezeit, bei mehreren Bestellungen die erste. Dazu auf jeder Karte, wann beim Lieferanten
 * bestellt wurde, sobald das belegt ist - auch wenn die Muster schon da sind (29.10.: "steht nicht ueberall").
 */
function datumHtml(k) {
  const tage = k.wartetTage;
  const warn = tage !== null && tage >= WARTET_AB_TAGEN && k.bereich !== 'gepackt';
  const bestellt = gueltig(k.seit) ? `${k.bestellungen.length > 1 ? 'erste Bestellung' : 'bestellt'} am ${tagDatum(k.seit)}` : '';
  const wartet = tage === null ? '' : tage === 0 ? 'seit heute' : `wartet seit ${plural(tage, 'Tag', 'Tagen')}`;
  const zeile = [bestellt, wartet].filter(Boolean).join(' · ');
  const beimLieferanten = k.muster.map(m => m.bestelltAm).filter(gueltig).sort();
  return `${zeile ? `<span class="${warn ? 'wait-warn' : 'small muted'}">${esc(zeile)}</span>` : ''}`
    + `${beimLieferanten.length ? `<span class="small muted">${esc(`beim Lieferanten bestellt${wannText(beimLieferanten, tagDatum)}`)}</span>` : ''}`;
}

/** Aufgeklappt bei mehreren Bestellungen in einem Umschlag: das Datum jeder einzelnen. */
function bestelldatenHtml(k) {
  if (k.bestellungen.length < 2 || !k.bestellungen.some(b => gueltig(b.datum))) return '';
  return `<p class="small muted mp-bestelldaten">${k.bestellungen.map(b => esc(`${b.orderName} bestellt am ${gueltig(b.datum) ? tagDatum(b.datum) : 'unbekannt'}`)).join(' · ')}</p>`;
}

const adresseText = a => [a?.strasse, [a?.plz, a?.ort].filter(Boolean).join(' ')].filter(v => v && v !== '–').join(', ');

/** Ein Umschlag, in dem schon Muster liegen: angefangene Arbeit, die nicht untergehen darf (Inhaber 26.10.). */
const angefangen = k => k.bereich !== 'gepackt' && k.muster.some(m => m.abgehakt);

/**
 * Filter "Umschlag:" (Inhaber 28.10.). "Noch vorbereiten" sind genau die Karten, bei denen Schritt 1
 * "Bestellung drucken" leuchtet - ein Haken zaehlt dort schon als gedruckt. Die Chips schliessen sich
 * nicht aus: ein vorbereiteter Umschlag kann auch schon Muster enthalten.
 */
const UMSCHLAG = [['', 'alle'], ['vorbereiten', 'noch vorbereiten'], ['vorbereitet', 'vorbereitet'], ['drin', 'Muster schon drin']];
const UMSCHLAG_PASST = { vorbereiten: k => !istGedruckt(k) && !angefangen(k), vorbereitet: istGedruckt, drin: angefangen };
const UMSCHLAG_LEER = {
  vorbereiten: 'Alle Umschläge in dieser Liste sind vorbereitet.',
  vorbereitet: 'In dieser Liste ist noch kein Umschlag vorbereitet.',
  drin: 'In dieser Liste liegen noch in keinem Umschlag Muster.',
};

/**
 * Was zu einem Umschlag schon auf dem Packtisch liegt: der vorbereitete Umschlag (Aufkleber gedruckt) und
 * Muster, die schon drin sind. Steht in der Kopfzeile, also ohne Aufklappen sichtbar; Muster im Umschlag
 * sind offene Arbeit (Bernstein), der vorbereitete Umschlag nur ein Stand (neutral, aber kraeftig).
 */
function stempelHtml(k) {
  if (k.bereich === 'gepackt') return '';
  const drin = k.muster.filter(m => m.abgehakt).length, n = k.muster.length;
  const teile = [
    k.gedruckt ? `<span class="mp-stempel">Umschlag vorbereitet · ${esc(datumKurz(k.gedruckt.zeit))}</span>` : '',
    drin ? `<span class="mp-stempel mp-stempel-drin">${drin < n ? `${drin} von ${n} Mustern schon im Umschlag` : n === 1 ? 'Muster liegt im Umschlag' : `Alle ${n} Muster im Umschlag`}</span>` : '',
  ].filter(Boolean);
  return teile.length ? `<div class="mp-stempelzeile">${teile.join('')}</div>` : '';
}

/** Farbnummer vom Lieferantenmuster; widersprechen sich die Lexikonangaben, deutlich "pruefen" statt raten. */
function farbNrHtml(v) {
  if (v.farbnummer) return `<span class="mp-farbnr">Farbnr. ${esc(v.farbnummer)}</span>`;
  return v.unklar ? '<span class="mp-achtung">Farbnummer unklar – prüfen</span>' : '<span class="small muted">keine Farbnummer hinterlegt</span>';
}

/** Kurzname fuer Listen: "Teppichboden Tempra 400cm Sprint 027" -> "Tempra Sprint 027" (Breite und Warengruppe sagen am Packtisch nichts). */
const kurzName = n => String(n ?? '').replace(/^Teppichboden\s+/i, '').replace(/\s*\b\d{3}\s?cm\b/gi, '').replace(/\s+/g, ' ').trim();

function bildHtml(m, { gross = false } = {}) {
  return m.bild
    ? `<img class="mp-bild${gross ? ' mp-bild-gross' : ''}" src="${esc(`${m.bild}${m.bild.includes('?') ? '&' : '?'}width=${gross ? 320 : 160}`)}" alt="" loading="lazy" width="${gross ? 140 : 72}" height="${gross ? 140 : 72}">`
    : '<span class="mp-bild mp-bild-leer small">kein Farbbild</span>';
}

/** Nur dieses Muster neu etikettieren - druckt nichts ohne den Druckdialog und schreibt nichts. */
function druckEinzelnHtml(m, { nachdrucken = false } = {}) {
  if (m.fehlt.length) return '';
  return `<button type="button" class="btn btn-sm${nachdrucken ? ' btn-ghost' : ''} mp-druck1" data-mp-drucken-muster="${esc(m.lineItemId)}">${nachdrucken ? 'Nur diesen nachdrucken' : 'Aufkleber drucken'}${m.anzahl > 1 ? ` (${m.anzahl})` : ''}</button>`;
}

function hakenHtml(m, lesend) {
  const e = m.etikett || {};
  const name = m.vorher?.produktname || m.vorher?.kollektion || m.bestellt.titel;
  return `<label class="mp-haken"><input type="checkbox" data-mp-haken="${esc(m.lineItemId)}"${m.abgehakt ? ' checked' : ''}${lesend ? ' disabled' : ''}><span class="visually-hidden">${esc(`${e.serie || name} ${e.farbe || ''} überklebt und eingelegt`)}</span></label>`;
}

function zeileHtml(m, mehrereBestellungen, { lesend, fehltHervor = false, treffer = false } = {}) {
  const e = m.etikett || {};
  const v = m.vorher || {};
  // Der Produktname steht so auf dem Lieferantenetikett; die Kollektion nur, wenn er fehlt.
  const name = v.produktname || v.kollektion || m.bestellt.titel;
  // Als fehlend gemeldet, laut Bestand aber da: nicht "fehlt · angekommen" (Widerspruch), sondern
  // sagen, was zu tun ist (Rundgang 26.10.).
  const imRegal = fehltHervor && m.stand === 'da';
  const stand = imRegal ? 'laut Bestand da – im Regal suchen' : standText(m);
  const link = v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener">Lieferantenseite</a>` : '';
  const haken = !!m.abgehakt;
  return `<li class="mp-zeile${haken ? ' mp-ab' : ''}${fehltHervor ? ' mp-fehlend' : ''}${treffer ? ' mp-treffer' : ''}">
    ${hakenHtml(m, lesend)}
    ${bildHtml(m)}
    <div class="mp-vorher">
      <span class="mp-etikett">Auf dem Muster${m.lieferant ? ` · <span class="mp-laden">${esc(m.lieferant)}</span>` : ''}${treffer ? ' · <strong class="mp-treffertext">passt zur Suche</strong>' : ''}</span>
      <span>${esc(name)}</span>
      ${farbNrHtml(v)}
      ${m.verwechselbar ? '<span class="mp-achtung">Ähnliches Muster im selben Umschlag – Farbnummer prüfen</span>' : ''}
    </div>
    <div class="mp-pfeil" aria-hidden="true">→</div>
    <div class="mp-nachher"><span class="mp-etikett">Unser Aufkleber</span>${m.fehlt.length
      ? `<span class="mp-fehlt">Zuordnung fehlt: ${esc(m.bestellt.titel)}${m.bestellt.farbe ? ` – ${esc(m.bestellt.farbe)}` : ''}</span>`
      : `<span><strong>${esc(e.serie)}</strong> · ${esc(e.farbe)}</span><span class="mp-sku">${esc(e.sku)}</span>${druckEinzelnHtml(m, { nachdrucken: true })}`}</div>
    <div class="mp-stand small">${fehltHervor ? `<strong class="mp-fehlt">${imRegal ? 'nicht eingelegt' : 'fehlt'}</strong> · ` : ''}${mehrereBestellungen ? `${esc(m.orderName)} · ` : ''}${m.anzahl > 1 ? `${m.anzahl} Stück · ` : ''}<span class="${m.stand === 'offen' ? 'wait-warn' : 'muted'}">${esc(stand)}</span>${link}</div>
  </li>`;
}

function kundeHtml(k, nr, { offenBeiSuche = false, treffer = new Set() } = {}) {
  const lesend = istNurLesend();
  const mehrere = k.bestellungen.length > 1;
  const nummern = k.bestellungen.map(b => b.orderName).join(' · ');
  const druckbar = !k.fehlt.length;
  const offen = k.muster.filter(m => !m.abgehakt).length;
  const fehlend = new Set(k.klaeren?.fehlt || []);
  // In "Zu klären" stehen die fehlenden Muster oben.
  const muster = k.bereich === 'klaeren' ? [...k.muster].sort((a, b) => fehlend.has(b.lineItemId) - fehlend.has(a.lineItemId)) : k.muster;
  const pk = esc(k.packSchluessel);
  const rueckLaden = state.route.params.get('laden');
  const rueckweg = rueckLaden ? `<a class="btn btn-sm btn-ghost" href="#/kunden?tab=muster&amp;mp=laden&amp;laden=${encodeURIComponent(rueckLaden)}">Zurück zu „Muster kommt an“</a>` : '';
  const bestellLink = (b, klasse = 'btn btn-sm btn-ghost') => `<a class="${klasse}" href="#/einkauf?auftrag=${encodeURIComponent(b.orderId)}">${esc(b.orderName)} – Bestellstand prüfen</a>`;
  const erneutDrucken = druckbar ? `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}" data-mp-alle-aufkleber="1">Alle Aufkleber erneut drucken (${k.aufkleber})</button>` : '';
  // Je Umschlag leuchtet genau ein Knopf: der naechste Schritt. Alles Seltene steht unter "Mehr …".
  let schritte = '', unten = '', mehr = [];
  // Wer schon gedruckt hat, ohne dass es vermerkt wurde (anderes Geraet, Druck vor #1718), traegt es nach:
  // in Schritt 1 direkt am Schritt, sonst (zu klaeren, schon ein Muster drin) unter "Mehr …".
  const druckvermerk = lesend || k.bereich === 'gepackt' ? ''
    : k.gedruckt ? `<button type="button" class="btn btn-sm btn-ghost" data-mp-gedruckt-weg="${pk}">Druckvermerk zurücknehmen</button>`
      : k.bereich === 'klaeren' || angefangen(k) ? `<button type="button" class="btn btn-sm" data-mp-gedruckt="${pk}">Schon gedruckt – Umschlag vorbereitet</button>` : '';
  if (k.bereich === 'gepackt') {
    // Gepackt heisst: geht heute raus (Inhaber 29.10.). "Verschickt" bucht in Shopify mit Versandmail,
    // danach steht der Umschlag nur noch unter "Erledigt".
    unten = `${lesend ? '' : `<button type="button" class="btn btn-sm btn-primary" data-mp-verschickt="${pk}">Verschickt – Kunde informieren</button>`}<button type="button" class="btn btn-sm" data-mp-grossbrief="${pk}">Großbrief vorbereiten</button><span class="small muted">Gepackt ${esc(fmtDateTime(k.gepackt.zeit))}${k.gepackt.von ? ` · ${esc(k.gepackt.von)}` : ''}</span>`;
    mehr = [erneutDrucken, lesend ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="0">Zurücknehmen</button>`,
      ...k.bestellungen.map(b => `<a class="btn btn-sm" href="#/einkauf?auftrag=${encodeURIComponent(b.orderId)}">${esc(b.orderName)} – Versand prüfen…</a>`)];
  } else if (k.bereich === 'klaeren') {
    // Was zuerst geklaert werden muss, wird der Hauptknopf; der Rest wandert unter "Mehr …".
    const moeglich = [
      !lesend && k.klaeren ? kl => `<button type="button" class="${kl}" data-mp-aktion="klaeren" data-mp-k="${pk}" data-mp-wert="0">Fehlendes ist da – weiter packen</button>` : null,
      (k.adressFehlt || []).length ? kl => k.bestellungen.map(b => `<a class="${kl}" href="#/kunden?tab=bestellungen&amp;bfilter=alle&amp;bq=${encodeURIComponent(b.orderName || '')}">${esc(b.orderName)} – Lieferadresse prüfen</a>`).join('') : null,
      (k.zuordnungFehlt || []).length ? kl => `<a class="${kl}" href="#/lexikon">Musterzuordnung prüfen</a>` : null,
      !lesend && k.restumfangPruefen && !offen && !k.fehlt.length && !k.klaeren ? kl => `<button type="button" class="${kl}" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="1" data-mp-restumfang="1">Restumfang geprüft – Umschlag gepackt…</button>` : null,
    ].filter(Boolean);
    unten = moeglich.length ? moeglich[0]('btn btn-sm btn-primary') : bestellLink(k.bestellungen[0], 'btn btn-sm btn-primary');
    mehr = [...moeglich.slice(1).map(f => f('btn btn-sm')), druckbar ? `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}">Aufkleber und Adresse drucken (${aufkleberFuer(k, { nurOffen: true }).length})</button>` : '',
      druckvermerk,
      ...(moeglich.length ? k.bestellungen : k.bestellungen.slice(1)).map(b => bestellLink(b))];
  } else {
    // Ablauf am Packtisch (Inhaber 26.10.): Bestellung samt Adresse drucken, schauen was da ist und
    // was fehlt, zukleben. "Gedruckt" gilt fuer alle Geraete (#1718); ein Haken zaehlt auch als gedruckt.
    const da = k.muster.length - offen;
    const schritt = !(istGedruckt(k) || da) ? 1 : offen ? 2 : 3;
    const fehltNamen = k.muster.filter(m => !m.abgehakt).map(m => `${kurzName(m.vorher?.produktname) || m.etikett?.serie || m.bestellt.titel}${m.vorher?.farbnummer ? ` (Farbnr. ${m.vorher.farbnummer})` : ''}`);
    const zustand = n => (schritt === n ? 'mp-jetzt' : schritt > n ? 'mp-erledigt' : 'mp-spaeter');
    schritte = `<ol class="mp-schritte" aria-label="Schritte für diesen Umschlag">
      <li class="${zustand(1)}"><span class="mp-schritt-titel">1 · Bestellung drucken</span>${schritt === 1
        ? `<span class="mp-schritt-tun"><button type="button" class="btn btn-primary" data-mp-drucken="${pk}"${druckbar ? '' : ' disabled'}>Aufkleber und Adresse drucken (${aufkleberFuer(k, { nurOffen: true }).length})</button>${lesend ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-mp-gedruckt="${pk}">Schon gedruckt – weiter</button>`}</span>`
        : `<span class="small muted">${k.gedruckt ? esc(gedrucktText(k.gedruckt)) : 'erledigt'}</span>`}</li>
      <li class="${zustand(2)}"><span class="mp-schritt-titel">2 · Was ist da?</span><span class="mp-bilanz"><strong>Da: ${da} von ${k.muster.length}</strong>${offen ? ` · Fehlt: ${esc(fehltNamen.join(', '))}` : ''}</span>${schritt === 2 ? '<span class="small muted">Häkchen bei jedem Muster, das überklebt im Umschlag liegt.</span>' : ''}</li>
      <li class="${zustand(3)}"><span class="mp-schritt-titel">3 · Zukleben</span>${schritt === 3 ? '<span class="small muted">Alles da – Umschlag zukleben.</span>' : ''}</li>
    </ol>`;
    unten = lesend ? '' : schritt === 2
      ? `<button type="button" class="btn btn-sm" data-mp-aktion="klaeren" data-mp-k="${pk}" data-mp-wert="1">Fehlt noch – zurücklegen (${offen})</button>
         <button type="button" class="btn btn-sm" data-mp-alle-eingelegt="${pk}">Alle ${k.muster.length} da – Umschlag gepackt</button>`
      // Einzeln ueber "Muster kommt an" gefuellt: dann fehlt noch der Adressaufkleber (nurOffen = nur Adresse).
      : schritt === 3 ? `${!istGedruckt(k) && druckbar ? `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}">Adressaufkleber drucken</button>` : ''}<button type="button" class="btn btn-sm btn-primary" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="1">Umschlag gepackt</button>` : '';
    mehr = [schritt > 1 ? erneutDrucken : '', druckvermerk,
      !lesend && offen ? `<input type="text" class="mp-notiz" data-mp-notiz="${pk}" maxlength="300" placeholder="Notiz zu „Fehlt noch“ (optional)" aria-label="Notiz zu fehlenden Mustern">` : '',
      !lesend && schritt === 1 && offen ? `<button type="button" class="btn btn-sm" data-mp-alle-eingelegt="${pk}">Alle ${k.muster.length} da – Umschlag gepackt</button>` : ''];
  }
  mehr = [...mehr, ...(k.bereich === 'klaeren' ? [] : k.bestellungen.map(b => bestellLink(b))), rueckweg].filter(Boolean);
  const mehrHtml = mehr.length ? `<details class="mp-mehr"><summary>Mehr …</summary><div class="mp-aktionen">${mehr.join('')}</div></details>` : '';
  return `<details class="mp-kunde mp-${k.bereich}${angefangen(k) ? ' mp-angefangen' : ''}" name="mp-umschlag" data-mp-kunde="${pk}" aria-labelledby="mp-k${nr}"${offenBeiSuche || (packOffen ?? state.route.params.get('umschlag')) === k.packSchluessel ? ' open' : ''}>
    <summary class="mp-kopf">
      <div class="mp-wer">
        <h3 id="mp-k${nr}"><span class="mp-pos">${esc(umschlagKennung(k))}</span>${esc(k.name)}</h3>
        ${stempelHtml(k)}
        <div class="small muted">${esc(adresseText(k.adresse))}</div>
      </div>
      <div class="mp-meta">
        <span class="small muted">${k.muster.length} Muster · ${k.bereich === 'packen' ? 'packbereit' : k.bereich === 'warten' ? 'wartet auf Ware' : k.bereich === 'klaeren' ? 'zu klären' : 'gepackt'}</span>
        ${datumHtml(k)}
      </div>
    </summary>
    ${bestelldatenHtml(k)}
    ${k.klaeren ? `<p class="notice warn">Fehlt: ${plural(fehlend.size, 'Muster', 'Muster')}${k.klaeren.notiz ? ` – „${esc(k.klaeren.notiz)}“` : ''}<span class="small muted"> · ${esc(fmtDateTime(k.klaeren.zeit))}${k.klaeren.von ? `, ${esc(k.klaeren.von)}` : ''}</span></p>` : ''}
    ${k.altvermerk && !k.klaeren ? `<p class="small muted">${esc(k.altvermerk)}</p>` : ''}
    ${k.gedruckt && k.bereich === 'klaeren' ? `<p class="small mp-vorbereitet">Umschlag vorbereitet: Aufkleber und Adresse ${esc(gedrucktText(k.gedruckt))}. Er wartet auf die fehlenden Muster.</p>` : ''}
    ${(k.hinweise || []).map(h => `<p class="notice warn">${esc(h)}</p>`).join('')}
    ${(k.adressFehlt || []).length ? `<p class="notice warn">Lieferadresse unvollständig: ${esc(k.adressFehlt.join(', '))}. Bitte die Lieferadresse in der Bestellung prüfen.</p>` : ''}
    ${(k.zuordnungFehlt || []).length ? `<p class="notice warn">Musterzuordnung unvollständig: ${esc(k.zuordnungFehlt.join('; '))}. Bitte im Lexikon prüfen.</p>` : ''}
    ${schritte}
    <ul class="mp-liste">${muster.map(m => zeileHtml(m, mehrere, { lesend: lesend || k.bereich === 'gepackt', fehltHervor: fehlend.has(m.lineItemId), treffer: treffer.has(m.lineItemId) })).join('')}</ul>
    ${k.bereich === 'warten' ? warteAnmerkung(k) : ''}
    ${unten ? `<div class="mp-aktionen">${unten}</div>` : ''}${mehrHtml}
  </details>`;
}

export function viewKundenMusterPacken() {
  bindePackOffen();
  // Ein neuer Direktlink waehlt seinen Umschlag; stille Neuzeichnungen erhalten die Handwahl.
  const ziel = state.route.params.get('umschlag');
  const packModus = state.route.params.get('mp') === 'laden' ? 'laden' : 'kunde';
  if (ziel !== letztesPackZiel || (ziel && packModus === 'kunde' && letzterPackModus === 'laden')) {
    packOffen = ziel;
    letztesPackZiel = ziel;
  }
  letzterPackModus = packModus;
  ensureMusterPacken();
  const d = kunden.musterPacken;
  if (!d) return '<p class="muted" role="status">Lade offene Musterbestellungen …</p>';
  if (d.fehler) return stoerungState(d, 'Die Musterbestellungen');
  if (!d.verfuegbar) return emptyState('Keine Bestelldaten.', d.hinweis || 'Bitte „Jetzt aktualisieren“.');
  const suche = (state.route.params.get('mpq') || '').trim();
  // Gesucht wird in beiden Ansichten; Treffer zeigt immer die Umschlagansicht.
  const modus = !suche && state.route.params.get('mp') === 'laden' ? 'laden' : 'kunde';
  // Links statt Parameterknoepfe: der Wechsel hebt auch eine laufende Suche auf.
  const modusLink = m => {
    const p = new URLSearchParams(state.route.params);
    for (const k of ['mp', 'mpq', 'mh', 'laden', 'umschlag', 'mpfertig']) p.delete(k);
    p.set('tab', 'muster'); if (m === 'laden') p.set('mp', 'laden');
    return `#/kunden?${p}`;
  };
  const umschalter = `<nav class="mp-modus" aria-label="Ansicht">
      <a class="btn btn-sm${modus === 'kunde' ? ' btn-primary' : ''}" href="${esc(modusLink('kunde'))}"${modus === 'kunde' ? ' aria-current="page"' : ''}>Bestellung packen</a>
      <a class="btn btn-sm${modus === 'laden' ? ' btn-primary' : ''}" href="${esc(modusLink('laden'))}"${modus === 'laden' ? ' aria-current="page"' : ''}>Muster kommt an</a>
    </nav>`;
  const suchfeld = `<div class="toolbar"><input type="search" data-param="mpq" value="${esc(state.route.params.get('mpq') || '')}" placeholder="Was steht auf dem Muster? z. B. Modena 3N55 – oder Kunde, Bestellnr." aria-label="Packstation durchsuchen, auch nach Hersteller, Produkt und Farbnummer"></div>`;
  const fehlerHinweis = packFehlerHtml(d);
  if (modus === 'laden') return umschalter + fehlerHinweis + PACKER_INFO + viewMusterKommtAn(d);
  const kopf = `${fehlerHinweis}<p class="sub mp-hier">Hier packst du je Bestellung: Umschlag öffnen, Aufkleber samt Adresse drucken, abhaken was da ist, zukleben. Gepackt ist noch nicht versandt.</p>${PACKER_INFO}`;
  const ausserhalb = (d.ausschluesse?.zahlungOffen || 0) + (d.ausschluesse?.geschlossen || 0);
  const ausschlussHinweis = ausserhalb ? `<p class="notice warn">${plural(ausserhalb, 'weitere Musterbestellung ist', 'weitere Musterbestellungen sind')} nicht in der Packliste: ${d.ausschluesse.zahlungOffen || 0} mit offener Zahlungsfrage, ${d.ausschluesse.geschlossen || 0} geschlossen trotz offener Muster. <a href="#/kunden?tab=bestellungen&amp;bfilter=muster">Diese Bestellungen prüfen →</a></p>` : '';
  const zielKunde = d.kunden.find(k => k.packSchluessel === ziel);
  // "Alle offenen" zuerst und als Standard: jede Musterbestellung steht sofort in der Packstation.
  const bereiche = [['offen', 'Alle offenen'], ['packen', 'Packbereit'], ['klaeren', 'Zu klären'], ['warten', 'Wartet auf Ware'], ['gepackt', 'Gepackt'], ['erledigt', 'Erledigt']];
  const erledigt = erledigteBestellungen(d.ausserhalb);
  const angefordert = state.route.params.get('mpbereich');
  const aktiv = suche ? 'alle' : zielKunde?.bereich || (bereiche.some(([b]) => b === angefordert) || angefordert === 'alle' ? angefordert : 'offen');
  const linkFuer = bereich => {
    const p = new URLSearchParams(state.route.params);
    p.set('tab', 'muster'); p.set('mpbereich', bereich);
    p.delete('umschlag'); p.delete('mpq'); p.delete('mp');
    return `#/kunden?${p}`;
  };
  const filter = `<nav class="mp-arbeitsfilter" aria-label="Packstation Arbeitsliste">${bereiche.map(([b, label]) => `<a class="btn${aktiv === b ? ' btn-primary' : ''}" href="${esc(linkFuer(b))}"${aktiv === b ? ' aria-current="page"' : ''}>${label} <span class="mp-filterzahl">${b === 'erledigt' ? erledigt.length : d.kunden.filter(k => (b === 'offen' ? k.bereich !== 'gepackt' : k.bereich === b)).length}</span></a>`).join('')}</nav>`;
  // "Trotzdem zeigen" gilt nur fuer genau diese Suche (mpfertig = Suchtext) - jede neue Suche startet ohne Fertige.
  // In den Reitern Gepackt und Erledigt sucht man gerade das Fertige - dort ist es immer mit drin.
  const mitFertigen = Boolean(suche) && (['gepackt', 'erledigt'].includes(angefordert) || state.route.params.get('mpfertig') === suche);
  const gefunden = suche ? offeneSuche(d.kunden, suche, d.ausserhalb || [], { mitFertigen }) : null;
  const treffer = new Map((gefunden?.treffer || []).map(t => [t.packSchluessel, new Set(t.muster)]));
  // Offene Arbeit nach Dringlichkeit: erst Packbereites, dann zu Klaerendes, dann Wartendes; in jeder
  // Gruppe zuerst die Umschlaege, in denen schon Muster liegen.
  const RANG = { packen: 0, klaeren: 1, warten: 2 };
  const reihe = (x, y) => (RANG[x.bereich] ?? 3) - (RANG[y.bereich] ?? 3) || angefangen(y) - angefangen(x);
  const imReiter = gefunden ? d.kunden.filter(k => treffer.has(k.packSchluessel))
    : aktiv === 'offen' ? d.kunden.filter(k => k.bereich !== 'gepackt').sort(reihe)
      : aktiv === 'alle' ? d.kunden : d.kunden.filter(k => k.bereich === aktiv).sort(reihe);
  // Bei Suche, Direktlink und Gepacktem gilt der Umschlagfilter nicht - dort soll nichts verschwinden.
  const umschlagGilt = !gefunden && !zielKunde && !['gepackt', 'erledigt'].includes(aktiv);
  const umschlag = umschlagGilt && UMSCHLAG_PASST[state.route.params.get('mpumschlag')] ? state.route.params.get('mpumschlag') : '';
  const sichtbar = umschlag ? imReiter.filter(UMSCHLAG_PASST[umschlag]) : imReiter;
  // Wie die Reiter als Links; beide bleiben beim Wechsel des anderen erhalten.
  const umschlagLink = wert => {
    const p = new URLSearchParams(state.route.params);
    p.set('tab', 'muster');
    if (wert) p.set('mpumschlag', wert); else p.delete('mpumschlag');
    p.delete('umschlag'); p.delete('mpq'); p.delete('mp');
    return `#/kunden?${p}`;
  };
  const umschlagFilter = umschlagGilt ? `<nav class="chips mp-umschlagfilter" aria-label="Nach Umschlag filtern"><span class="small muted">Umschlag:</span>${UMSCHLAG.map(([w, label]) =>
    `<a class="chip" href="${esc(umschlagLink(w))}"${umschlag === w ? ' aria-current="page"' : ''}>${label}<span class="c">${w ? imReiter.filter(UMSCHLAG_PASST[w]).length : imReiter.length}</span></a>`).join('')}</nav>` : '';
  // Wenige Treffer gleich aufklappen und das passende Muster markieren.
  const aufklappen = gefunden && sichtbar.length <= 3;
  const packen = d.kunden.filter(k => k.bereich === 'packen');
  const druckbar = packen.filter(k => !k.fehlt.length);
  const aufkleber = druckbar.reduce((summe, k) => summe + aufkleberFuer(k, { nurOffen: true }).length, 0);
  // "Noch vorbereiten" druckt genau die gezeigten Umschlaege, in dieser Reihenfolge; ohne vollstaendige
  // Musterzuordnung gibt es keinen Aufkleber.
  const vorbereiten = umschlag === 'vorbereiten' ? sichtbar.filter(k => !k.fehlt.length) : [];
  const vorbereitenAufkleber = vorbereiten.reduce((summe, k) => summe + aufkleberFuer(k, { nurOffen: true }).length, 0);
  const ohneZuordnung = umschlag === 'vorbereiten' ? sichtbar.length - vorbereiten.length : 0;
  // Kein Hauptknopf: in der Liste leuchtet erst der Schritt im geoeffneten Umschlag.
  const druck = vorbereitenAufkleber || ohneZuordnung
    ? `<div class="mp-summe">${vorbereitenAufkleber ? `<button type="button" class="btn" data-mp-vorbereiten="${esc(vorbereiten.map(k => k.packSchluessel).join(' '))}">${vorbereiten.length === 1 ? 'Diesen Umschlag' : `Diese ${vorbereiten.length} Umschläge`} vorbereiten (${plural(vorbereitenAufkleber, 'Aufkleber', 'Aufkleber')})</button>` : ''}${ohneZuordnung ? `<span class="small muted">${plural(ohneZuordnung, 'Umschlag', 'Umschläge')} ohne vollständige Musterzuordnung – erst im Lexikon klären.</span>` : ''}</div>`
    : !umschlag && ['packen', 'offen'].includes(aktiv) && aufkleber ? `<div class="mp-summe"><button type="button" class="btn" data-mp-alle>Alle Packbereiten drucken (${plural(aufkleber, 'Aufkleber', 'Aufkleber')})</button></div>` : '';
  const leerText = suche ? (gefunden.ausserhalb.length ? 'Kein offener Umschlag passt – siehe unten.' : gefunden.fertig ? 'Kein offener Umschlag passt – nur schon gepackte oder versandte Bestellungen.' : 'Nichts gefunden – weder in der Packliste noch in anderen Musterbestellungen. Weniger Wörter versuchen, z. B. nur die Farbnummer.') : imReiter.length && umschlag ? UMSCHLAG_LEER[umschlag] : aktiv === 'offen' ? 'Gerade keine offene Musterbestellung.' : aktiv === 'packen' ? 'Gerade kein Umschlag packbereit.' : aktiv === 'klaeren' ? 'Keine offenen Klärungen.' : aktiv === 'warten' ? 'Kein Umschlag wartet auf Ware.' : 'Keine gepackten Umschläge.';
  const leer = `<div class="mp-arbeitsleer"><p>${leerText}</p>${imReiter.length && umschlag ? `<p><a href="${esc(umschlagLink(''))}">Alle ${plural(imReiter.length, 'Umschlag', 'Umschläge')} dieser Liste zeigen</a></p>`
    : ['packen', 'offen'].includes(aktiv) && !suche ? `<p>Eingetroffene Muster legst du unter <a href="#/kunden?tab=muster&amp;mp=laden">Muster kommt an</a> ein, oder öffne <a href="${esc(linkFuer('klaeren'))}">Zu klären</a>.</p>` : ''}</div>`;
  const titel = (aktiv === 'alle' ? (suche ? 'Suchergebnisse aus allen Arbeitslisten' : 'Alle Umschläge') : bereiche.find(([b]) => b === aktiv)?.[1])
    + (umschlag ? ` · Umschlag ${UMSCHLAG.find(([w]) => w === umschlag)[1]}` : '');
  if (aktiv === 'erledigt') return `${umschalter}${kopf}${filter}${ausschlussHinweis}${suchfeld}${erledigtHtml(erledigt)}`;
  return `${umschalter}${kopf}${filter}${umschlagFilter}${ausschlussHinweis}
    ${suchfeld}
    ${suche ? `<p class="small muted">Die Suche berücksichtigt alle offenen Umschläge und auch Musterbestellungen außerhalb der Packliste – auch Hersteller, Herstellerprodukt, Kollektion, Farb- und Artikelnummer.${(sichtbar.length || gefunden.ausserhalb.length) && gefunden.fehlen.length ? ` Nicht gefunden: ${gefunden.fehlen.map(w => `„${esc(w)}“`).join(', ')} – gezeigt ${!sichtbar.length ? 'sind die Bestellungen, die' : sichtbar.length === 1 ? 'ist der Umschlag, der' : 'sind die Umschläge, die'} zu den übrigen Wörtern am besten ${sichtbar.length === 1 ? 'passt' : 'passen'}.` : ''} <button type="button" class="btn btn-sm btn-ghost" data-param="mpq" data-value="">Suche aufheben</button></p>${fertigHinweis(gefunden.fertig, mitFertigen, suche)}` : ''}
    ${druck}<section class="mp-arbeitsliste" aria-label="${esc(titel)}"><h2 class="mp-titel">${esc(titel)}${aktiv === 'gepackt' ? ' – nach dem Verschicken „Verschickt“ drücken' : ''}</h2>
    ${sichtbar.length ? `<div class="mp-kunden">${sichtbar.map((k, i) => kundeHtml(k, i + 1, { offenBeiSuche: aufklappen, treffer: treffer.get(k.packSchluessel) })).join('')}</div>` : leer}</section>
    ${gefunden?.ausserhalb.length ? ausserhalbHtml(d.ausserhalb || [], gefunden.ausserhalb) : ''}
    <p class="small muted">Fehlt eine Bestellung? <a href="#/kunden?tab=bestellungen&amp;bfilter=muster">Bestellungen – Muster →</a>.</p>`;
}

/** Reiter "Erledigt": versandte oder erledigte Musterbestellungen der letzten Tage, nur zum Nachsehen. */
export const ERLEDIGT_TAGE = 14;
export function erledigteBestellungen(ausserhalb = [], jetzt = Date.now()) {
  const ab = jetzt - ERLEDIGT_TAGE * 24 * 60 * 60 * 1000;
  return (ausserhalb || []).filter(b => b.grund === 'erledigt' && gueltig(b.datum) && new Date(b.datum).getTime() >= ab);
}

function erledigtHtml(liste) {
  const zeilen = liste.map(b => `<li class="mp-aussen"><div><strong>${esc(b.orderName)}</strong> · ${esc(b.name)} · ${plural(b.muster.length, 'Muster', 'Muster')}</div>`
    + `<div class="small muted">bestellt am ${esc(fmtDate(b.datum))} · verschickt oder erledigt · <a href="#/einkauf?auftrag=${encodeURIComponent(b.orderId)}">Bestellung ansehen</a></div></li>`).join('');
  return `<section class="mp-arbeitsliste" aria-label="Erledigt"><h2 class="mp-titel">Erledigt – Musterbestellungen der letzten ${ERLEDIGT_TAGE} Tage</h2>
    ${zeilen ? `<ul class="mp-liste">${zeilen}</ul>` : `<div class="mp-arbeitsleer"><p>In den letzten ${ERLEDIGT_TAGE} Tagen ist keine Musterbestellung erledigt worden.</p></div>`}</section>`;
}

/**
 * Fertige Treffer (schon gepackt oder versandt) blendet die Suche aus (Mitarbeiter 29.10.); ein Klick
 * zeigt sie trotzdem (mpfertig=<Suchtext>, gilt nur fuer diese Suche), etwa um nachzusehen, wohin ein
 * Muster schon gegangen ist. Offene Treffer stehen dann weiter zuerst.
 */
function fertigHinweis(anzahl, mitFertigen, suchtext) {
  const p = new URLSearchParams(state.route.params);
  p.set('tab', 'muster');
  if (mitFertigen) p.delete('mpfertig'); else p.set('mpfertig', suchtext);
  const link = `<a href="${esc(`#/kunden?${p}`)}">${mitFertigen ? 'Fertige wieder ausblenden' : 'Trotzdem zeigen'}</a>`;
  if (mitFertigen) return `<p class="small muted mp-fertig">Schon gepackte und versandte Bestellungen sind mit drin. ${link}</p>`;
  return anzahl ? `<p class="small muted mp-fertig">${plural(anzahl, 'fertige Bestellung passt', 'fertige Bestellungen passen')} auch – schon gepackt oder versandt, deshalb nicht gezeigt. ${link}</p>` : '';
}

const GRUND_TEXT = Object.freeze({
  zahlungOffen: 'Zahlung offen – erst klären, nicht packen',
  geschlossen: 'Bestellung geschlossen, Muster noch offen – Bestellung prüfen',
  storniert: 'storniert – nicht verschicken',
  erledigt: 'schon versandt oder erledigt',
});

/** Suchtreffer ausserhalb der Packliste: nur zeigen, wohin das Muster gehoert haette - keine Aktion. */
function ausserhalbHtml(alle, treffer) {
  const je = new Map(alle.map(b => [b.orderId, b]));
  const zeilen = treffer.map(t => {
    const b = je.get(t.orderId);
    if (!b) return '';
    const muster = (t.muster.length ? b.muster.filter(m => t.muster.includes(m.lineItemId)) : b.muster).map(m => {
      const v = m.vorher || {}, e = m.etikett || {};
      return `<li><span>${esc(v.produktname || v.kollektion || m.bestellt.titel)}</span>${v.farbnummer ? ` <strong>Farbnr. ${esc(v.farbnummer)}</strong>` : ''}${e.serie ? ` <span class="muted">→ ${esc(e.serie)}${e.farbe ? ` · ${esc(e.farbe)}` : ''}</span>` : ''}</li>`;
    }).join('');
    return `<li class="mp-aussen">
      <div><strong>${esc(b.orderName)}</strong> · ${esc(b.name)}${b.datum ? ` <span class="small muted">· bestellt ${esc(fmtDate(b.datum))}</span>` : ''}</div>
      <div class="mp-fehlt">${esc(GRUND_TEXT[b.grund] || b.grund)}</div>
      <ul class="small">${muster}</ul>
      <a class="btn btn-sm btn-ghost" href="#/kunden?tab=bestellungen&amp;bfilter=alle&amp;bq=${encodeURIComponent(b.orderName || '')}">${esc(b.orderName)} – Bestellung ansehen</a>
    </li>`;
  }).join('');
  return `<section class="mp-arbeitsliste" aria-label="Außerhalb der Packliste"><h2 class="mp-titel">Außerhalb der Packliste</h2>
    <p class="small muted">Diese Musterbestellungen passen auch zur Suche, werden hier aber nicht gepackt.</p>
    <ul class="mp-aussenliste">${zeilen}</ul></section>`;
}

/**
 * Reiter "Muster kommt an": Muster in die Hand nehmen, eintippen was darauf steht, und die Karte sagt,
 * in welchen Umschlag es gehoert - mit "Aufkleber drucken" und "Eingelegt". Ohne Eingabe darunter der
 * Wareneingang je Partnerladen.
 */
function viewMusterKommtAn(d) {
  const q = (state.route.params.get('mh') || '').trim();
  const lesend = istNurLesend();
  const feld = `<div class="mp-hand">
      <label class="mp-hand-label" for="mpHandFeld">Was steht auf dem Muster?</label>
      <input id="mpHandFeld" type="search" class="mp-hand-feld" data-param="mh" value="${esc(state.route.params.get('mh') || '')}" placeholder="z. B. Modena 3N55" autocomplete="off" aria-describedby="mpHandHilfe">
      <p id="mpHandHilfe" class="small muted">Hersteller, Produkt oder Farbnummer eintippen – oder Kunde, Bestellnummer.</p>
    </div>`;
  const meldung = handMeldungHtml(d);
  if (!q) return feld + meldung + viewNachLaden(d);
  const mitFertigen = state.route.params.get('mpfertig') === q;
  const t = handTreffer(d.kunden, q, d.ausserhalb || [], { mitFertigen });
  const karten = t.karten.length ? `<h2 class="mp-titel mp-ohne-pfeil">${t.karten.length === 1 ? 'Gehört in' : `${t.karten.length} offene Muster passen – ältere Bestellung zuerst`}</h2>
    <div class="mp-karten">${t.karten.map((x, i) => karteHtml(x, { erste: i === 0 && t.karten.length > 1, lesend })).join('')}</div>` : '';
  const mehr = t.mehr ? `<p class="small muted">Noch ${plural(t.mehr, 'weiterer Treffer', 'weitere Treffer')} – genauer eintippen, z. B. mit Farbnummer.</p>` : '';
  const fehlen = t.fehlen.length && (t.karten.length || t.eingelegt.length || t.ausserhalb.length) ? `<p class="small muted">Nicht gefunden: ${t.fehlen.map(w => `„${esc(w)}“`).join(', ')} – gezeigt ist, was zu den übrigen Wörtern passt.</p>` : '';
  const schon = t.eingelegt.length ? `<section class="mp-arbeitsliste" aria-label="Schon eingelegt"><h2 class="mp-titel mp-ohne-pfeil">Schon eingelegt</h2><ul class="mp-aussenliste">${t.eingelegt.map(({ kunde: k, muster: m }) =>
    `<li class="mp-aussen"><div><strong>${esc(umschlagKennung(k))}</strong> · ${esc(k.name)} · ${esc(m.vorher?.produktname || m.bestellt.titel)}${m.vorher?.farbnummer ? ` <strong>Farbnr. ${esc(m.vorher.farbnummer)}</strong>` : ''}</div><div class="small muted">${k.bereich === 'gepackt' ? 'Umschlag ist schon gepackt' : 'liegt schon im Umschlag'}</div></li>`).join('')}</ul></section>` : '';
  const nichts = !t.karten.length && !t.eingelegt.length && !t.ausserhalb.length
    ? `<div class="mp-arbeitsleer"><p>${t.fertig ? 'Kein offener Umschlag braucht dieses Muster – es passt nur zu schon gepackten oder versandten Bestellungen.' : 'Nichts gefunden. Weniger Wörter versuchen, z. B. nur die Farbnummer.'}</p></div>` : '';
  return `${feld}${meldung}${fehlen}${fertigHinweis(t.fertig, mitFertigen, q)}${karten}${mehr}${schon}${t.ausserhalb.length ? ausserhalbHtml(d.ausserhalb || [], t.ausserhalb) : ''}${nichts}`;
}

/** Eine grosse Karte je passendem Muster: was draufsteht, wohin es gehoert, zwei Knoepfe. */
function karteHtml({ kunde: k, muster: m }, { erste = false, lesend = false } = {}) {
  const v = m.vorher || {}, e = m.etikett || {};
  const rest = k.muster.filter(x => !x.abgehakt && x.lineItemId !== m.lineItemId).length;
  return `<article class="mp-karte${erste ? ' mp-karte-erste' : ''}">
    ${bildHtml(m, { gross: true })}
    <div class="mp-vorher">
      <span class="mp-etikett">Auf dem Muster${m.lieferant ? ` · <span class="mp-laden">${esc(m.lieferant)}</span>` : ''}</span>
      <span class="mp-karte-name">${esc(v.produktname || v.kollektion || m.bestellt.titel)}</span>
      ${farbNrHtml(v)}
      ${m.verwechselbar ? '<span class="mp-achtung">Ähnliches Muster im selben Umschlag – Farbnummer prüfen</span>' : ''}
    </div>
    <div class="mp-karte-ziel">
      <span class="mp-etikett">Gehört in${erste ? ' · wartet am längsten' : ''}</span>
      <span class="mp-umschlag">${esc(umschlagKennung(k))}</span>
      <strong>${esc(k.name)}</strong>
      ${stempelHtml(k)}
      <span class="small muted">${rest ? `danach noch ${plural(rest, 'Muster', 'Muster')} offen` : 'letztes offenes Muster – danach komplett'}</span>
      ${k.bereich === 'klaeren' ? '<span class="mp-fehlt">Umschlag ist zu klären</span>' : ''}
      ${m.fehlt.length ? '<span class="mp-fehlt">Aufkleber-Zuordnung fehlt – im Lexikon prüfen</span>' : `<span class="small">Unser Aufkleber: <strong>${esc(e.serie)}</strong> · ${esc(e.farbe)}</span>`}
    </div>
    <div class="mp-karte-aktionen">
      ${m.fehlt.length ? '' : `<button type="button" class="btn mp-gross" data-mp-drucken-muster="${esc(m.lineItemId)}">Aufkleber drucken${m.anzahl > 1 ? ` (${m.anzahl})` : ''}</button>`}
      ${lesend ? '' : `<button type="button" class="btn btn-primary mp-gross" data-mp-eingelegt="${esc(m.lineItemId)}">Eingelegt ✓</button>`}
    </div>
  </article>`;
}

function handMeldungHtml(d) {
  const k = handMeldung && d.kunden.find(x => x.packSchluessel === handMeldung);
  if (!k) return '';
  const rest = k.muster.filter(m => !m.abgehakt).length;
  if (rest) return `<p class="notice mp-meldung" role="status"><strong>✓ Eingelegt in ${esc(umschlagKennung(k))}</strong> · ${esc(k.name)} – noch ${plural(rest, 'Muster', 'Muster')} offen in diesem Umschlag. Nächstes Muster eintippen.</p>`;
  return `<p class="notice mp-meldung mp-komplett" role="status"><strong>✓ ${esc(umschlagKennung(k))} · ${esc(k.name)} ist komplett.</strong> Adresse drucken und zukleben.
    <a class="btn btn-sm btn-primary" href="#/kunden?tab=muster&amp;umschlag=${encodeURIComponent(k.packSchluessel)}">Zum Umschlag</a></p>`;
}

/** "Muster kommt an": ein Paket eines Lieferanten auf die richtigen Umschlaege verteilen. */
function viewNachLaden(d) {
  const laeden = musterNachLaden(d.kunden);
  if (!laeden.length) return emptyState('Nichts zu sortieren.', 'Alle offenen Muster sind schon eingelegt.');
  const gewaehlt = laeden.find(l => l.laden === state.route.params.get('laden')) || laeden[0];
  const lesend = istNurLesend();
  const chips = laeden.map(l => `<button type="button" class="btn btn-sm${l === gewaehlt ? ' btn-primary' : ''}" data-param="laden" data-value="${esc(l.laden)}" aria-pressed="${l === gewaehlt}">${esc(l.laden)} <span class="${l === gewaehlt ? '' : 'muted'}">(${l.eintraege.length})</span></button>`).join('');
  const zeilen = gewaehlt.eintraege.map(e => {
    const m = e.muster, v = m.vorher || {};
    return `<li class="mp-sortzeile">
      ${hakenHtml(m, lesend)}
      ${bildHtml(m)}
      <div class="mp-vorher"><span>${esc(v.produktname || m.bestellt.titel)}</span>${farbNrHtml(v)}</div>
      <div class="mp-pfeil" aria-hidden="true">→</div>
      <div class="mp-ziel"><a class="mp-umschlag" href="#/kunden?tab=muster&amp;umschlag=${encodeURIComponent(e.packSchluessel)}&amp;laden=${encodeURIComponent(gewaehlt.laden)}">${esc(e.umschlag)}</a>
        <span><strong>${esc(e.kunde)}</strong></span><span class="small muted">${esc(e.bestellung)}</span>${druckEinzelnHtml(m)}</div>
    </li>`;
  }).join('');
  return `<p class="sub mp-hier">Oder ein ganzes Paket eines Lieferanten abarbeiten: Muster an Bild und Farbnummer erkennen, Aufkleber drucken, aufkleben, auf den Stapel mit der Bestellnummer legen und abhaken – abgehakte Muster verschwinden aus der Liste.</p>
    <div class="mp-laeden">${chips}</div>
    <h2 class="mp-titel">${esc(gewaehlt.laden)} <span class="muted">· ${plural(gewaehlt.eintraege.length, 'Muster', 'Muster')}</span></h2>
    <ul class="mp-sortliste">${zeilen}</ul>`;
}

/**
 * Druck je Bestellung. Ist der Lauf vollstaendig beim Drucker, gilt der Umschlag fuer alle Geraete als
 * vorbereitet (#1718); ein abgebrochener Druck vermerkt nichts - dann "Schon gedruckt" waehlen.
 */
function drucken(liste, titel, { nurOffen = false } = {}) {
  const etiketten = liste.flatMap(k => aufkleberFuer(k, { nurOffen }));
  if (!etiketten.length) return;
  // Der erste Druck zaehlt; Gepacktes wird nur neu etikettiert.
  const vorbereiten = liste.filter(k => !k.gepackt && !k.gedruckt).map(k => k.packSchluessel);
  oeffneEtikettenDruck({ etiketten, titel, allowEditing: false,
    hinweis: 'Je Kunde erst die Muster, zuletzt die Adresse – so kommt die Rolle in Packreihenfolge heraus. Nach dem Druck steht der Umschlag als „vorbereitet“ in der Packstation; versandt oder gebucht wird nichts.',
    druckFertig: () => { void vermerkeGedruckt(vorbereiten); },
    beiSchliessen: ({ versucht } = {}) => { if (versucht) render(); return true; } });
}

function packFehlerHtml(d) {
  if (packFehler && d?.verfuegbar && !d.fehler && d !== packFehlerStand) {
    packFehler = null; packFehlerStand = null;
  }
  const versand = versandProbleme.length ? `<div class="notice crit" role="alert"><p><strong>Verschickt, aber in Shopify nicht sicher als versendet gemeldet.</strong> Bestellung öffnen und prüfen – fehlt der Versand, dort „In Shopify buchen“ (mit Mail-Wahl).</p>
      <ul>${versandProbleme.map(v => `<li><a href="#/einkauf?auftrag=${encodeURIComponent(v.orderId)}">${esc(v.orderName)}</a>: ${esc(v.meldung || 'Ergebnis unbekannt')}</li>`).join('')}</ul>
      <button type="button" class="btn btn-sm" data-mp-versand-ok>Verstanden</button></div>` : '';
  return versand + (packFehler ? `<p class="notice warn" role="alert">${esc(packFehler)} <button type="button" class="btn btn-sm" data-mp-neuladen>Packliste erneut laden</button></p>` : '');
}

async function packlisteErneutLaden() {
  if (packSpeichert) return;
  packSpeichert = true; kunden.loadingMusterPacken = true;
  try {
    const neu = await fetchEinkauf(ENDPOINT);
    if (!neu?.verfuegbar || neu.fehler) throw new Error(neu?.hinweis || 'Die Packliste ist gerade nicht lesbar.');
    kunden.musterPacken = neu; packFehler = null; packFehlerStand = null;
  } catch (err) {
    packFehler = `Die Packliste konnte nicht geladen werden: ${err.message} Der bisherige Stand bleibt sichtbar.`;
    packFehlerStand = kunden.musterPacken;
  } finally {
    packSpeichert = false; kunden.loadingMusterPacken = false; render();
  }
}

async function schreiben(daten, meldung) {
  if (packSpeichert) { toast('Bitte warten, der vorige Packstand wird noch gespeichert.', 'warn'); return; }
  packSpeichert = true;
  kunden.loadingMusterPacken = true;
  packFehler = null;
  try {
    const r = await orgSchreiben(ENDPOINT, daten);
    // Eingelegt/gepackt bestaetigt den Wareneingang (#1706); ein Fehler dort laesst den Packstand stehen.
    const eingang = r?.wareneingang;
    if (eingang?.fehler) toast(`Gespeichert, aber der Wareneingang wurde nicht vermerkt: ${eingang.fehler}`, 'warn');
    else if (meldung) toast(eingang?.anzahl ? `${meldung} · ${plural(eingang.anzahl, 'Muster', 'Muster')} als angekommen vermerkt` : meldung);
    try {
      const neu = await fetchEinkauf(ENDPOINT);
      if (!neu?.verfuegbar || neu.fehler) throw new Error(neu?.hinweis || 'Die Packliste ist gerade nicht lesbar.');
      kunden.musterPacken = neu;
    } catch (err) {
      packFehlerStand = kunden.musterPacken;
      packFehler = `Gespeichert, aber die aktuelle Packliste konnte nicht geladen werden: ${err.message} Der bisherige Stand bleibt sichtbar. Bitte erneut aktualisieren.`;
    }
  } catch (err) {
    packFehlerStand = kunden.musterPacken;
    packFehler = `Nicht gespeichert: ${err.message} Der bisherige Stand bleibt erhalten.`;
    toast(packFehler, 'warn');
  } finally {
    packSpeichert = false;
    kunden.loadingMusterPacken = false;
    render();
  }
}

/**
 * "Verschickt – Kunde informieren": je Bestellung im Umschlag den Schritt "raus" fuer genau ihre Muster.
 * Der Server bucht dabei in Shopify den Versand mit Versandmail (operations/lib/versand.mjs) - wie der
 * Versanddialog, ohne Sendungsnummer (Brief). Danach ist der Umschlag nicht mehr in der Packliste.
 */
async function verschicken(k, knopf) {
  const n = k.bestellungen.length;
  if (!window.confirm(`Umschlag ${umschlagKennung(k)} für ${k.name} ist verschickt?\n\nShopify bucht ${n === 1 ? 'die Bestellung' : `die ${n} Bestellungen`} als versendet und schickt die Versandbestätigung an den Kunden. Danach steht der Umschlag unter „Erledigt“.`)) return;
  packSpeichert = true;
  knopf.disabled = true;
  knopf.textContent = 'Wird gebucht …';
  // Ein Aufruf fuer den ganzen Umschlag: der Server prueft erst alle Bestellungen und schreibt dann
  // alle lokalen Schritte, bevor Shopify antwortet - so zerfaellt ein Umschlag mit zwei Bestellungen nie.
  let r = null;
  let fehler = null;
  try {
    r = await orgSchreiben(ENDPOINT, { packSchluessel: k.packSchluessel, aktion: 'verschickt' });
  } catch (err) { fehler = err; }
  try {
    const neu = await fetchEinkauf(ENDPOINT);
    if (neu?.verfuegbar && !neu.fehler) kunden.musterPacken = neu;
  } catch { /* der naechste Abruf holt es nach */ }
  packSpeichert = false;
  if (fehler) {
    // Nur eine Sperre des Servers (4xx, oder 500 "Nicht verschickt, keine Mail") ist sicher "nichts
    // passiert". Bei Netzfehler/5xx sonst entscheidet die neu geladene Liste (Pruefung 29.10.).
    const sicherNichts = /^Nicht verschickt/.test(fehler.message) || (fehler.status >= 400 && fehler.status < 500);
    const nochDa = (kunden.musterPacken?.kunden || []).some(x => x.packSchluessel === k.packSchluessel);
    const text = sicherNichts || nochDa
      ? `${/^Nicht verschickt/.test(fehler.message) ? fehler.message : `Nicht verschickt: ${fehler.message}`}${nochDa ? ' Der Umschlag steht noch unter „Gepackt“.' : ''}`
      : `Ergebnis unklar (${fehler.message}) – der Umschlag ist nicht mehr in der Liste, vermutlich verschickt. Bitte ${k.bestellungen.map(b => b.orderName).join(', ')} unter Bestellen prüfen.`;
    // Erst nach dem Neuladen setzen: der Fehler gilt fuer genau diesen Stand der Liste, sonst loescht
    // packFehlerHtml ihn beim naechsten Zeichnen sofort wieder.
    packFehler = text;
    packFehlerStand = kunden.musterPacken;
    toast(text, 'crit', { dauer: 9000 });
    render();
    return;
  }
  const versand = Array.isArray(r?.versand) ? r.versand : [];
  // Lokal nicht eingetragen: steht weiter unter "Gepackt" und braucht einen neuen Klick, keine Shopify-Pruefung.
  const nicht = versand.filter(v => v.status === 'nicht-eingetragen');
  // Was lokal raus, aber in Shopify nicht sicher gebucht ist, bleibt oben stehen; die Texte je Bestellung
  // kommen vom Server und passen zu jedem Ergebnis (teilweise, unklar, Fehler).
  const probleme = versand.filter(v => !['gebucht', 'bereits', 'nicht-eingetragen'].includes(v.status));
  const gebucht = versand.filter(v => v.status === 'gebucht');
  toast(`Verschickt · ${umschlagKennung(k)} ${k.name}${gebucht.length ? ` · in Shopify als versendet gemeldet${gebucht.some(v => v.kundeBenachrichtigt) ? ', der Kunde bekommt die Versandmail' : ', ohne Mail'}` : ''}`);
  if (nicht.length) {
    packFehler = `Nicht verschickt: ${nicht.map(v => `${v.orderName} – ${v.meldung}`).join(' · ')} Diese Bestellung steht noch unter „Gepackt“ – dort erneut „Verschickt“ drücken.`;
    packFehlerStand = kunden.musterPacken;
    toast(packFehler, 'crit', { dauer: 9000 });
  }
  if (probleme.length) {
    versandProbleme = [...versandProbleme.filter(a => !probleme.some(v => v.orderId === a.orderId)), ...probleme];
    toast(`${plural(probleme.length, 'Bestellung', 'Bestellungen')} in Shopify bitte prüfen – Hinweis oben in der Packstation.`, 'crit', { dauer: 9000 });
  }
  render();
}

/** "Eingelegt ✓": Haken setzen, Feld leeren und fuer das naechste Muster bereit machen. */
async function eingelegt(k, lineItemId) {
  await schreiben({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [lineItemId], an: true });
  if (!kundeMitMuster(lineItemId)?.muster.find(m => m.lineItemId === lineItemId)?.abgehakt) return;
  handMeldung = k.packSchluessel;
  const p = new URLSearchParams(state.route.params);
  p.delete('mh');
  history.replaceState(null, '', `#/${state.route.view}?${p}`);
  parseRoute();
  render();
  document.getElementById('mpHandFeld')?.focus();
}

function kundeMitMuster(lineItemId) {
  return (kunden.musterPacken?.kunden || []).find(k => k.muster.some(m => m.lineItemId === lineItemId));
}

/** Klicks im Reiter "Muster packen". Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function musterPackenKlick(e) {
  if (e.target.closest('[data-mp-neuladen]')) { e.preventDefault(); void packlisteErneutLaden(); return true; }
  if (e.target.closest('[data-mp-versand-ok]')) { e.preventDefault(); versandProbleme = []; render(); return true; }
  const h = e.target.closest('[data-mp-haken]');
  if (h) {
    const k = kundeMitMuster(h.dataset.mpHaken);
    if (!k) return true;
    // Erst bestaetigte Serverdaten ersetzen den Cache; ein Fehlversuch darf keinen Haken erfinden.
    const m = k.muster.find(x => x.lineItemId === h.dataset.mpHaken);
    if (packSpeichert) { h.checked = !!m.abgehakt; return true; }
    h.disabled = true;
    // Im Wareneingang verschwindet die Zeile danach - die Meldung sagt, wohin das Muster gehoert.
    const rest = k.muster.filter(x => !x.abgehakt && x.lineItemId !== m.lineItemId).length;
    schreiben({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [m.lineItemId], an: h.checked },
      h.checked ? `Abgehakt · ${umschlagKennung(k)} ${k.name}${rest ? ` – noch ${rest} offen` : ' – alle Muster eingelegt'}` : 'Haken entfernt');
    return true;
  }
  const liste = kunden.musterPacken?.kunden || [];
  const versandt = e.target.closest('[data-mp-verschickt]');
  if (versandt) {
    e.preventDefault();
    const k = liste.find(x => x.packSchluessel === versandt.dataset.mpVerschickt);
    if (k?.gepackt && !packSpeichert) verschicken(k, versandt);
    return true;
  }
  const grossbrief = e.target.closest('[data-mp-grossbrief]');
  if (grossbrief) {
    e.preventDefault();
    const k = liste.find(x => x.packSchluessel === grossbrief.dataset.mpGrossbrief);
    if (k?.gepackt) oeffneGrossbriefVorbereitung(k);
    return true;
  }
  const weiter = e.target.closest('[data-mp-gedruckt]');
  if (weiter) {
    e.preventDefault();
    if (packSpeichert) return true;
    weiter.disabled = true;
    schreiben({ packSchluessel: weiter.dataset.mpGedruckt, aktion: 'gedruckt', gedruckt: true }, 'Vermerkt: Umschlag vorbereitet');
    return true;
  }
  const weg = e.target.closest('[data-mp-gedruckt-weg]');
  if (weg) {
    e.preventDefault();
    if (packSpeichert) return true;
    weg.disabled = true;
    gedrucktHier.delete(weg.dataset.mpGedrucktWeg);
    schreiben({ packSchluessel: weg.dataset.mpGedrucktWeg, aktion: 'gedruckt', gedruckt: false }, 'Druckvermerk zurückgenommen');
    return true;
  }
  const ein = e.target.closest('[data-mp-eingelegt]');
  if (ein) {
    e.preventDefault();
    const k = kundeMitMuster(ein.dataset.mpEingelegt);
    if (!k || packSpeichert) return true;
    ein.disabled = true;
    void eingelegt(k, ein.dataset.mpEingelegt);
    return true;
  }
  const eines = e.target.closest('[data-mp-drucken-muster]');
  if (eines) {
    e.preventDefault();
    const k = kundeMitMuster(eines.dataset.mpDruckenMuster);
    const m = k?.muster.find(x => x.lineItemId === eines.dataset.mpDruckenMuster);
    const etiketten = aufkleberFuerMuster(m);
    if (etiketten.length) {
      oeffneEtikettenDruck({ etiketten, titel: `Aufkleber · ${m.etikett.serie || m.bestellt.titel}${m.etikett.farbe ? ` ${m.etikett.farbe}` : ''}`, allowEditing: false,
        hinweis: `Gehört in ${umschlagKennung(k)} · ${k.name}. Nach dem Druck aufkleben, einlegen und abhaken. Der Druck bucht nichts.` });
    }
    return true;
  }
  const alleEin = e.target.closest('[data-mp-alle-eingelegt]');
  if (alleEin) {
    e.preventDefault();
    if (packSpeichert) return true;
    const k = liste.find(x => x.packSchluessel === alleEin.dataset.mpAlleEingelegt);
    if (!k) return true;
    const offen = k.muster.filter(m => !m.abgehakt);
    const nichtDa = offen.filter(m => !['da', 'lager'].includes(m.stand)).length;
    // Ohne bestaetigten Wareneingang entscheidet allein, was im Umschlag liegt - einmal ausdruecklich fragen.
    if (nichtDa && !window.confirm(`Laut Bestellstand ${nichtDa === 1 ? 'ist 1 Muster' : `sind ${nichtDa} Muster`} noch nicht angekommen.\n\nLiegen trotzdem alle ${k.muster.length} Muster überklebt im Umschlag ${umschlagKennung(k)}?\n\nEs wird nur der lokale Packstand gespeichert.`)) return true;
    alleEin.disabled = true;
    schreiben({ packSchluessel: k.packSchluessel, aktion: 'gepackt', gepackt: true, alleEingelegt: true, lineItemIds: offen.map(m => m.lineItemId) }, `Umschlag gepackt · ${umschlagKennung(k)}`);
    return true;
  }
  const einzeln = e.target.closest('[data-mp-drucken]');
  if (einzeln) {
    e.preventDefault();
    const k = liste.find(x => x.packSchluessel === einzeln.dataset.mpDrucken);
    if (k) drucken([k], `Aufkleber · ${k.name}`, { nurOffen: k.bereich !== 'gepackt' && einzeln.dataset.mpAlleAufkleber !== '1' });
    return true;
  }
  if (e.target.closest('[data-mp-alle]')) {
    e.preventDefault();
    drucken(liste.filter(k => k.bereich === 'packen' && !k.fehlt.length), 'Aufkleber · alle Kunden in Packreihenfolge', { nurOffen: true });
    return true;
  }
  const vorb = e.target.closest('[data-mp-vorbereiten]');
  if (vorb) {
    e.preventDefault();
    // Reihenfolge wie in der Liste; was inzwischen gepackt oder ohne Zuordnung ist, faellt heraus.
    const auswahl = vorb.dataset.mpVorbereiten.split(' ').map(pk => liste.find(k => k.packSchluessel === pk)).filter(k => k && !k.gepackt && !k.fehlt.length);
    drucken(auswahl, `Aufkleber · ${plural(auswahl.length, 'Umschlag', 'Umschläge')} vorbereiten`, { nurOffen: true });
    return true;
  }
  const a = e.target.closest('[data-mp-aktion]');
  if (a) {
    e.preventDefault();
    if (packSpeichert) return true;
    const an = a.dataset.mpWert === '1';
    const pk = a.dataset.mpK;
    const restumfangGeprueft = a.dataset.mpRestumfang === '1';
    if (restumfangGeprueft && !window.confirm('Diese Bestellung wurde teilweise erstattet. Hast du den verbleibenden Musterumfang mit der Bestellung abgeglichen und nur die noch benötigten Muster eingelegt?\n\nEs wird nur der lokale Packstand gespeichert.')) return true;
    a.disabled = true;
    if (a.dataset.mpAktion === 'gepackt') schreiben({ packSchluessel: pk, aktion: 'gepackt', gepackt: an, ...(restumfangGeprueft ? { restumfangGeprueft: true } : {}) }, an ? 'Umschlag gepackt' : 'Gepackt zurückgenommen');
    else {
      const notiz = [...document.querySelectorAll('[data-mp-notiz]')].find(i => i.dataset.mpNotiz === pk)?.value || '';
      schreiben({ packSchluessel: pk, aktion: 'klaeren', klaeren: an, notiz }, an ? 'Zu klären – das Abgehakte bleibt gespeichert' : 'Wieder bei „Zu packen“');
    }
    return true;
  }
  return false;
}
