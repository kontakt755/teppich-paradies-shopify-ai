/**
 * Kunden, Reiter "Muster packen" (#1572): offene, bezahlte Musterbestellungen je Kunde in
 * Packreihenfolge. Standard ist "Alle offenen" (Inhaber 26.10.2026): jede Musterbestellung steht
 * sofort hier, wartende mit Anmerkung "bestellt am …"; dazu Packbereit · Zu klären · Wartet · Gepackt.
 * Die Suche findet ein Muster auch ueber Hersteller, Herstellerprodukt und Farbnummer (packSuche) -
 * in beiden Ansichten und auch in Bestellungen ausserhalb der Packliste (mit Grund, ohne Aktion).
 * Neu etikettieren: je Muster "Aufkleber drucken"; "Alle eingelegt – Umschlag gepackt" hakt in einem
 * Schritt ab und packt.
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
import { STAND_TEXT, WARTET_AB_TAGEN, aufkleberFuer, aufkleberFuerMuster, musterNachLaden, packSuche, umschlagKennung } from '../../lib/muster-packen.mjs';
import { oeffneGrossbriefVorbereitung } from './muster-grossbrief.mjs';
import { kunden } from './gemeinsam.mjs';

let packOffen = null;
let packFehler = null;
let packFehlerStand = null;
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

export function ensureMusterPacken() {
  if (kunden.musterPacken || kunden.loadingMusterPacken) return;
  kunden.loadingMusterPacken = true;
  fetchEinkauf(ENDPOINT).then(d => {
    kunden.musterPacken = d; kunden.loadingMusterPacken = false;
    if (['kunden', 'heute'].includes(state.route.view)) render();
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

/** Anmerkung fuer einen wartenden Umschlag: was fehlt noch, seit wann bestellt, wie geht es weiter. */
function warteAnmerkung(k) {
  const nichtDa = k.muster.filter(m => !m.abgehakt && !['da', 'lager'].includes(m.stand));
  if (!nichtDa.length) return '';
  const bestellt = nichtDa.filter(m => m.stand === 'bestellt');
  const isos = bestellt.map(m => m.bestelltAm).filter(Boolean).sort();
  const erst = isos.length ? datumKurz(isos[0]) : '', letzt = isos.length ? datumKurz(isos.at(-1)) : '';
  const wann = !erst ? '' : erst === letzt ? ` am ${erst}` : ` zwischen ${erst} und ${letzt}`;
  const auto = bestellt.filter(m => m.automatisch).length;
  const wie = !bestellt.length ? '' : auto === bestellt.length ? ', automatisch per Mail' : auto ? ', teils automatisch per Mail' : '';
  const ohne = nichtDa.length - bestellt.length;
  return `<p class="notice warn mp-anmerkung"><strong>Noch nicht da:</strong> ${nichtDa.length} von ${plural(k.muster.length, 'Muster', 'Mustern')}.`
    + `${bestellt.length ? ` Beim Lieferanten bestellt${wann}${wie}.` : ''}`
    + `${ohne ? ` ${plural(ohne, 'Muster ist', 'Muster sind')} noch nicht bestellt – unter „Bestellen“ prüfen.` : ''}`
    + ' Kommt ein Muster an: abhaken. Sind alle abgehakt, ist der Umschlag packbereit.</p>';
}

const adresseText = a => [a?.strasse, [a?.plz, a?.ort].filter(Boolean).join(' ')].filter(v => v && v !== '–').join(', ');

function bildHtml(m) {
  return m.bild
    ? `<img class="mp-bild" src="${esc(`${m.bild}${m.bild.includes('?') ? '&' : '?'}width=160`)}" alt="" loading="lazy" width="72" height="72">`
    : '<span class="mp-bild mp-bild-leer small">kein Farbbild</span>';
}

/** Nur dieses Muster neu etikettieren - druckt nichts ohne den Druckdialog und schreibt nichts. */
function druckEinzelnHtml(m) {
  if (m.fehlt.length) return '';
  return `<button type="button" class="btn btn-sm mp-druck1" data-mp-drucken-muster="${esc(m.lineItemId)}">Aufkleber drucken${m.anzahl > 1 ? ` (${m.anzahl})` : ''}</button>`;
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
  const stand = standText(m);
  const link = v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener">Lieferantenseite</a>` : '';
  const haken = !!m.abgehakt;
  return `<li class="mp-zeile${haken ? ' mp-ab' : ''}${fehltHervor ? ' mp-fehlend' : ''}${treffer ? ' mp-treffer' : ''}">
    ${hakenHtml(m, lesend)}
    ${bildHtml(m)}
    <div class="mp-vorher">
      <span class="mp-etikett">Auf dem Muster${m.lieferant ? ` · <span class="mp-laden">${esc(m.lieferant)}</span>` : ''}${treffer ? ' · <strong class="mp-treffertext">passt zur Suche</strong>' : ''}</span>
      <span>${esc(name)}</span>
      ${v.farbnummer ? `<span class="mp-farbnr">Farbnr. ${esc(v.farbnummer)}</span>` : '<span class="small muted">keine Farbnummer hinterlegt</span>'}
      ${m.verwechselbar ? '<span class="mp-achtung">Ähnliches Muster im selben Umschlag – Farbnummer prüfen</span>' : ''}
    </div>
    <div class="mp-pfeil" aria-hidden="true">→</div>
    <div class="mp-nachher"><span class="mp-etikett">Unser Aufkleber</span>${m.fehlt.length
      ? `<span class="mp-fehlt">Zuordnung fehlt: ${esc(m.bestellt.titel)}${m.bestellt.farbe ? ` – ${esc(m.bestellt.farbe)}` : ''}</span>`
      : `<span><strong>${esc(e.serie)}</strong> · ${esc(e.farbe)}</span><span class="mp-sku">${esc(e.sku)}</span>${druckEinzelnHtml(m)}`}</div>
    <div class="mp-stand small">${fehltHervor ? '<strong class="mp-fehlt">fehlt</strong> · ' : ''}${mehrereBestellungen ? `${esc(m.orderName)} · ` : ''}${m.anzahl > 1 ? `${m.anzahl} Stück · ` : ''}<span class="${m.stand === 'offen' ? 'wait-warn' : 'muted'}">${esc(stand)}</span>${link}</div>
  </li>`;
}

function kundeHtml(k, nr, { offenBeiSuche = false, treffer = new Set() } = {}) {
  const lesend = istNurLesend();
  const mehrere = k.bestellungen.length > 1;
  const nummern = k.bestellungen.map(b => b.orderName).join(' · ');
  const tage = k.wartetTage;
  const druckbar = !k.fehlt.length;
  const offen = k.muster.filter(m => !m.abgehakt).length;
  const fehlend = new Set(k.klaeren?.fehlt || []);
  // In "Zu klären" stehen die fehlenden Muster oben.
  const muster = k.bereich === 'klaeren' ? [...k.muster].sort((a, b) => fehlend.has(b.lineItemId) - fehlend.has(a.lineItemId)) : k.muster;
  const pk = esc(k.packSchluessel);
  const bestellLinks = k.bestellungen.map(b => `<a class="btn btn-sm btn-ghost" href="#/einkauf?auftrag=${encodeURIComponent(b.orderId)}">${esc(b.orderName)} – Bestellstand prüfen</a>`).join('');
  const rueckLaden = state.route.params.get('laden');
  const rueckweg = rueckLaden ? `<a class="btn btn-sm btn-ghost" href="#/kunden?tab=muster&amp;mp=laden&amp;laden=${encodeURIComponent(rueckLaden)}">Zurück zum Wareneingang</a>` : '';
  let aktionen = '';
  if (k.bereich === 'gepackt') {
    aktionen = `<button type="button" class="btn btn-sm" data-mp-grossbrief="${pk}">Großbrief vorbereiten</button>${druckbar ? `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}">Aufkleber erneut drucken (${k.aufkleber})</button>` : ''}<span class="small muted">Gepackt ${esc(fmtDateTime(k.gepackt.zeit))}${k.gepackt.von ? ` · ${esc(k.gepackt.von)}` : ''}</span>
      ${lesend ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="0">Zurücknehmen</button>`}`;
  } else if (k.bereich === 'klaeren') {
    aktionen = `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}"${druckbar ? '' : ' disabled'}>Aufkleber drucken (${k.aufkleber})</button>
      ${(k.adressFehlt || []).length ? `${k.bestellungen.map(b => `<a class="btn btn-sm" href="#/kunden?tab=bestellungen&amp;bfilter=alle&amp;bq=${encodeURIComponent(b.orderName || '')}">${esc(b.orderName)} – Lieferadresse prüfen</a>`).join('')}` : ''}
      ${(k.zuordnungFehlt || []).length ? '<a class="btn btn-sm" href="#/lexikon">Musterzuordnung prüfen</a>' : ''}
      ${!lesend && k.restumfangPruefen && !offen && !k.fehlt.length && !k.klaeren ? `<button type="button" class="btn btn-sm" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="1" data-mp-restumfang="1">Restumfang geprüft – Umschlag gepackt…</button>` : ''}
      ${lesend || !k.klaeren ? '' : `<button type="button" class="btn btn-sm" data-mp-aktion="klaeren" data-mp-k="${pk}" data-mp-wert="0">Klärung aufheben – erneut prüfen</button>`}`;
  } else {
    aktionen = `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}"${druckbar ? '' : ' disabled'}>Aufkleber drucken (${k.aufkleber})</button>
      ${lesend ? '' : offen
        ? `<button type="button" class="btn btn-sm${k.bereich === 'packen' ? ' btn-primary' : ''}" data-mp-alle-eingelegt="${pk}">Alle ${k.muster.length} Muster eingelegt – Umschlag gepackt</button>
           <input type="text" class="mp-notiz" data-mp-notiz="${pk}" maxlength="300" placeholder="Notiz (optional), z. B. was fehlt" aria-label="Notiz zu fehlenden Mustern">
           <button type="button" class="btn btn-sm" data-mp-aktion="klaeren" data-mp-k="${pk}" data-mp-wert="1">Fehlt etwas – zu klären (${offen} offen)</button>`
        : `<button type="button" class="btn btn-sm btn-primary" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="1">Umschlag gepackt</button>`}`;
  }
  return `<details class="mp-kunde mp-${k.bereich}" name="mp-umschlag" data-mp-kunde="${pk}" aria-labelledby="mp-k${nr}"${offenBeiSuche || (packOffen ?? state.route.params.get('umschlag')) === k.packSchluessel ? ' open' : ''}>
    <summary class="mp-kopf">
      <div class="mp-wer">
        <h3 id="mp-k${nr}"><span class="mp-pos">${esc(umschlagKennung(k))}</span>${esc(k.name)}</h3>
        <div class="small muted">${esc(adresseText(k.adresse))}</div>
      </div>
      <div class="mp-meta">
        <span class="small muted">${k.muster.length} Muster · ${k.bereich === 'packen' ? 'packbereit' : k.bereich === 'warten' ? 'wartet auf Ware' : k.bereich === 'klaeren' ? 'zu klären' : 'gepackt'}</span>
        ${tage === null ? '' : `<span class="${tage >= WARTET_AB_TAGEN && k.bereich !== 'gepackt' ? 'wait-warn' : 'small muted'}">${tage === 0 ? 'seit heute' : `wartet seit ${plural(tage, 'Tag', 'Tagen')}`}</span>`}
        ${['packen', 'warten'].includes(k.bereich) ? `<span class="small ${offen ? 'muted' : 'mp-ok'}">${offen ? `${k.muster.length - offen} von ${k.muster.length} abgehakt` : 'alles abgehakt'}</span>` : ''}
      </div>
    </summary>
    ${k.klaeren ? `<p class="notice warn">Fehlt: ${plural(fehlend.size, 'Muster', 'Muster')}${k.klaeren.notiz ? ` – „${esc(k.klaeren.notiz)}“` : ''}<span class="small muted"> · ${esc(fmtDateTime(k.klaeren.zeit))}${k.klaeren.von ? `, ${esc(k.klaeren.von)}` : ''}</span></p>` : ''}
    ${k.altvermerk && !k.klaeren ? `<p class="small muted">${esc(k.altvermerk)}</p>` : ''}
    ${(k.hinweise || []).map(h => `<p class="notice warn">${esc(h)}</p>`).join('')}
    ${(k.adressFehlt || []).length ? `<p class="notice warn">Lieferadresse unvollständig: ${esc(k.adressFehlt.join(', '))}. Bitte die Lieferadresse in der Bestellung prüfen.</p>` : ''}
    ${(k.zuordnungFehlt || []).length ? `<p class="notice warn">Musterzuordnung unvollständig: ${esc(k.zuordnungFehlt.join('; '))}. Bitte im Lexikon prüfen.</p>` : ''}
    <ul class="mp-liste">${muster.map(m => zeileHtml(m, mehrere, { lesend: lesend || k.bereich === 'gepackt', fehltHervor: fehlend.has(m.lineItemId), treffer: treffer.has(m.lineItemId) })).join('')}</ul>
    ${k.bereich === 'warten' ? warteAnmerkung(k) : ''}
    <div class="mp-aktionen">${aktionen}${k.bereich === 'gepackt' ? k.bestellungen.map(b => `<a class="btn btn-sm" href="#/einkauf?auftrag=${encodeURIComponent(b.orderId)}">${esc(b.orderName)} – Versand prüfen…</a>`).join('') : ''}${bestellLinks}${rueckweg}</div>
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
    for (const k of ['mp', 'mpq', 'laden', 'umschlag']) p.delete(k);
    p.set('tab', 'muster'); if (m === 'laden') p.set('mp', 'laden');
    return `#/kunden?${p}`;
  };
  const umschalter = `<nav class="mp-modus" aria-label="Ansicht">
      <a class="btn btn-sm${modus === 'kunde' ? ' btn-primary' : ''}" href="${esc(modusLink('kunde'))}"${modus === 'kunde' ? ' aria-current="page"' : ''}>Nach Kunde packen</a>
      <a class="btn btn-sm${modus === 'laden' ? ' btn-primary' : ''}" href="${esc(modusLink('laden'))}"${modus === 'laden' ? ' aria-current="page"' : ''}>Wareneingang nach Partnerladen</a>
    </nav>`;
  const suchfeld = `<div class="toolbar"><input type="search" data-param="mpq" value="${esc(state.route.params.get('mpq') || '')}" placeholder="Was steht auf dem Muster? z. B. Modena 3N55 – oder Kunde, Bestellnr." aria-label="Packstation durchsuchen, auch nach Hersteller, Produkt und Farbnummer"></div>`;
  const fehlerHinweis = packFehlerHtml(d);
  if (modus === 'laden') return umschalter + fehlerHinweis + suchfeld + viewNachLaden(d);
  const kopf = `${fehlerHinweis}<p class="sub mp-hier">Hier packst du Muster je Umschlag: Muster suchen, Aufkleber drucken, aufkleben, einlegen und abhaken. Gepackt ist noch nicht versandt.</p>${PACKER_INFO}`;
  const ausserhalb = (d.ausschluesse?.zahlungOffen || 0) + (d.ausschluesse?.geschlossen || 0);
  const ausschlussHinweis = ausserhalb ? `<p class="notice warn">${plural(ausserhalb, 'weitere Musterbestellung ist', 'weitere Musterbestellungen sind')} nicht in der Packliste: ${d.ausschluesse.zahlungOffen || 0} mit offener Zahlungsfrage, ${d.ausschluesse.geschlossen || 0} geschlossen trotz offener Muster. <a href="#/kunden?tab=bestellungen&amp;bfilter=muster">Diese Bestellungen prüfen →</a></p>` : '';
  const zielKunde = d.kunden.find(k => k.packSchluessel === ziel);
  // "Alle offenen" zuerst und als Standard: jede Musterbestellung steht sofort in der Packstation.
  const bereiche = [['offen', 'Alle offenen'], ['packen', 'Packbereit'], ['klaeren', 'Zu klären'], ['warten', 'Wartet auf Ware'], ['gepackt', 'Gepackt']];
  const angefordert = state.route.params.get('mpbereich');
  const aktiv = suche ? 'alle' : zielKunde?.bereich || (bereiche.some(([b]) => b === angefordert) || angefordert === 'alle' ? angefordert : 'offen');
  const linkFuer = bereich => {
    const p = new URLSearchParams(state.route.params);
    p.set('tab', 'muster'); p.set('mpbereich', bereich);
    p.delete('umschlag'); p.delete('mpq'); p.delete('mp');
    return `#/kunden?${p}`;
  };
  const filter = `<nav class="mp-arbeitsfilter" aria-label="Packstation Arbeitsliste">${bereiche.map(([b, label]) => `<a class="btn${aktiv === b ? ' btn-primary' : ''}" href="${esc(linkFuer(b))}"${aktiv === b ? ' aria-current="page"' : ''}>${label} <span class="mp-filterzahl">${d.kunden.filter(k => (b === 'offen' ? k.bereich !== 'gepackt' : k.bereich === b)).length}</span></a>`).join('')}</nav>`;
  const gefunden = suche ? packSuche(d.kunden, suche, d.ausserhalb || []) : null;
  const treffer = new Map((gefunden?.treffer || []).map(t => [t.packSchluessel, new Set(t.muster)]));
  // Offene Arbeit nach Dringlichkeit: erst Packbereites, dann zu Klaerendes, dann Wartendes.
  const RANG = { packen: 0, klaeren: 1, warten: 2 };
  const sichtbar = gefunden ? d.kunden.filter(k => treffer.has(k.packSchluessel))
    : aktiv === 'offen' ? d.kunden.filter(k => k.bereich !== 'gepackt').sort((x, y) => RANG[x.bereich] - RANG[y.bereich])
      : d.kunden.filter(k => aktiv === 'alle' || k.bereich === aktiv);
  // Wenige Treffer gleich aufklappen und das passende Muster markieren.
  const aufklappen = gefunden && sichtbar.length <= 3;
  const packen = d.kunden.filter(k => k.bereich === 'packen');
  const druckbar = packen.filter(k => !k.fehlt.length);
  const aufkleber = druckbar.reduce((summe, k) => summe + k.aufkleber, 0);
  const druck = ['packen', 'offen'].includes(aktiv) && aufkleber ? `<div class="mp-summe"><button type="button" class="btn btn-primary" data-mp-alle>Packbereite drucken (${plural(aufkleber, 'Aufkleber', 'Aufkleber')})</button></div>` : '';
  const leerText = suche ? (gefunden.ausserhalb.length ? 'Kein offener Umschlag passt – siehe unten.' : 'Nichts gefunden – weder in der Packliste noch in anderen Musterbestellungen. Weniger Wörter versuchen, z. B. nur die Farbnummer.') : aktiv === 'offen' ? 'Gerade keine offene Musterbestellung.' : aktiv === 'packen' ? 'Gerade kein Umschlag packbereit.' : aktiv === 'klaeren' ? 'Keine offenen Klärungen.' : aktiv === 'warten' ? 'Kein Umschlag wartet auf Ware.' : 'Keine gepackten Umschläge.';
  const leer = `<div class="mp-arbeitsleer"><p>${leerText}</p>${['packen', 'offen'].includes(aktiv) && !suche ? `<p>Prüfe eingetroffene Muster unter <a href="#/kunden?tab=muster&amp;mp=laden">Wareneingang nach Partnerladen</a> oder öffne <a href="${esc(linkFuer('klaeren'))}">Zu klären</a>.</p>` : ''}</div>`;
  const titel = aktiv === 'alle' ? (suche ? 'Suchergebnisse aus allen Arbeitslisten' : 'Alle Umschläge') : bereiche.find(([b]) => b === aktiv)?.[1];
  return `${umschalter}${kopf}${filter}${ausschlussHinweis}
    ${suchfeld}
    ${suche ? `<p class="small muted">Die Suche berücksichtigt alle Umschläge und auch Musterbestellungen außerhalb der Packliste – auch Hersteller, Herstellerprodukt, Kollektion, Farb- und Artikelnummer.${(sichtbar.length || gefunden.ausserhalb.length) && gefunden.fehlen.length ? ` Nicht gefunden: ${gefunden.fehlen.map(w => `„${esc(w)}“`).join(', ')} – gezeigt ${!sichtbar.length ? 'sind die Bestellungen, die' : sichtbar.length === 1 ? 'ist der Umschlag, der' : 'sind die Umschläge, die'} zu den übrigen Wörtern am besten ${sichtbar.length === 1 ? 'passt' : 'passen'}.` : ''} <button type="button" class="btn btn-sm btn-ghost" data-param="mpq" data-value="">Suche aufheben</button></p>` : ''}
    ${druck}<section class="mp-arbeitsliste" aria-label="${esc(titel)}"><h2 class="mp-titel">${esc(titel)}${aktiv === 'gepackt' ? ' – Versand noch separat' : ''}</h2>
    ${sichtbar.length ? `<div class="mp-kunden">${sichtbar.map((k, i) => kundeHtml(k, i + 1, { offenBeiSuche: aufklappen, treffer: treffer.get(k.packSchluessel) })).join('')}</div>` : leer}</section>
    ${gefunden?.ausserhalb.length ? ausserhalbHtml(d.ausserhalb || [], gefunden.ausserhalb) : ''}
    <p class="small muted">Fehlt eine Bestellung? <a href="#/kunden?tab=bestellungen&amp;bfilter=muster">Bestellungen – Muster →</a>.</p>`;
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

/** Wareneingang: ein Paket eines Partnerladens auf die richtigen Umschlaege verteilen. */
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
      <div class="mp-vorher"><span>${esc(v.produktname || m.bestellt.titel)}</span>${v.farbnummer ? `<span class="mp-farbnr">Farbnr. ${esc(v.farbnummer)}</span>` : '<span class="small muted">keine Farbnummer hinterlegt</span>'}</div>
      <div class="mp-pfeil" aria-hidden="true">→</div>
      <div class="mp-ziel"><a class="mp-umschlag" href="#/kunden?tab=muster&amp;umschlag=${encodeURIComponent(e.packSchluessel)}&amp;laden=${encodeURIComponent(gewaehlt.laden)}">${esc(e.umschlag)}</a>
        <span><strong>${esc(e.kunde)}</strong></span><span class="small muted">${esc(e.bestellung)}</span>${druckEinzelnHtml(m)}</div>
    </li>`;
  }).join('');
  return `<p class="sub mp-hier">Paket auspacken, Laden wählen, jedes Muster an Bild und Farbnummer erkennen – oder oben eintippen, was darauf steht. Aufkleber drucken, aufkleben, auf den Stapel mit der Bestellnummer legen und abhaken; abgehakte Muster verschwinden aus dieser Liste.</p>
    ${PACKER_INFO}
    <div class="mp-laeden">${chips}</div>
    <h2 class="mp-titel">${esc(gewaehlt.laden)} <span class="muted">· ${plural(gewaehlt.eintraege.length, 'Muster', 'Muster')}</span></h2>
    <ul class="mp-sortliste">${zeilen}</ul>`;
}

function drucken(liste, titel) {
  const etiketten = liste.flatMap(aufkleberFuer);
  if (!etiketten.length) return;
  oeffneEtikettenDruck({ etiketten, titel, allowEditing: false,
    hinweis: 'Je Kunde erst die Muster, zuletzt die Adresse – so kommt die Rolle in Packreihenfolge heraus. Der Druck bucht nichts.' });
}

function packFehlerHtml(d) {
  if (packFehler && d?.verfuegbar && !d.fehler && d !== packFehlerStand) {
    packFehler = null; packFehlerStand = null;
  }
  return packFehler ? `<p class="notice warn" role="alert">${esc(packFehler)} <button type="button" class="btn btn-sm" data-mp-neuladen>Packliste erneut laden</button></p>` : '';
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
    await orgSchreiben(ENDPOINT, daten);
    if (meldung) toast(meldung);
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

function kundeMitMuster(lineItemId) {
  return (kunden.musterPacken?.kunden || []).find(k => k.muster.some(m => m.lineItemId === lineItemId));
}

/** Klicks im Reiter "Muster packen". Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function musterPackenKlick(e) {
  if (e.target.closest('[data-mp-neuladen]')) { e.preventDefault(); void packlisteErneutLaden(); return true; }
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
  const grossbrief = e.target.closest('[data-mp-grossbrief]');
  if (grossbrief) {
    e.preventDefault();
    const k = liste.find(x => x.packSchluessel === grossbrief.dataset.mpGrossbrief);
    if (k?.gepackt) oeffneGrossbriefVorbereitung(k);
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
    if (k) drucken([k], `Aufkleber · ${k.name}`);
    return true;
  }
  if (e.target.closest('[data-mp-alle]')) {
    e.preventDefault();
    drucken(liste.filter(k => k.bereich === 'packen' && !k.fehlt.length), 'Aufkleber · alle Kunden in Packreihenfolge');
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
