/**
 * Kunden, Reiter "Muster packen" (#1572): offene, bezahlte Musterbestellungen je Kunde in
 * Packreihenfolge, in drei Bereichen: Zu packen · Zu klären · Gepackt.
 * Je Muster: Bild genau dieser Farbe, Partnerladen, was auf dem Lieferantenmuster steht (vorher,
 * Farbnummer gross) und welcher Aufkleber darauf kommt (nachher). Abhaken speichert zentral;
 * bleibt ein Muster offen, geht der Kunde mit "Fehlt etwas" nach "Zu klären", bis "Fehlendes ist da".
 * "Nach Partnerladen" (mp=laden): Wareneingang sortieren - je Laden alle noch nicht eingelegten
 * Muster mit Ziel-Umschlag.
 * Porto und Versandbuchung folgen, wenn der Versandweg entschieden ist.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDateTime, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { oeffneEtikettenDruck } from '../../bausteine/etiketten-druck.mjs';
import { STAND_TEXT, WARTET_AB_TAGEN, aufkleberFuer, musterNachLaden, umschlagKennung } from '../../lib/muster-packen.mjs';
import { oeffneGrossbriefVorbereitung } from './muster-grossbrief.mjs';
import { kunden } from './gemeinsam.mjs';

let packOffen = null;
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

export function ensureMusterPacken() {
  if (kunden.musterPacken || kunden.loadingMusterPacken) return;
  kunden.loadingMusterPacken = true;
  fetchEinkauf(ENDPOINT).then(d => {
    kunden.musterPacken = d; kunden.loadingMusterPacken = false;
    if (['kunden', 'heute'].includes(state.route.view)) render();
  });
}

/** Zahl am Reiter: Kunden, die gepackt werden koennen (ohne "zu klären" und ohne Gepacktes). */
export function musterPackenOffen() {
  const d = kunden.musterPacken;
  return d?.verfuegbar ? (d.zahlen?.packen ?? d.offen ?? 0) : 0;
}

const adresseText = a => [a?.strasse, [a?.plz, a?.ort].filter(Boolean).join(' ')].filter(v => v && v !== '–').join(', ');

function bildHtml(m) {
  return m.bild
    ? `<img class="mp-bild" src="${esc(`${m.bild}${m.bild.includes('?') ? '&' : '?'}width=160`)}" alt="" loading="lazy" width="72" height="72">`
    : '<span class="mp-bild mp-bild-leer small">kein Farbbild</span>';
}

function zeileHtml(m, mehrereBestellungen, { lesend, fehltHervor = false } = {}) {
  const e = m.etikett || {};
  const v = m.vorher || {};
  // Der Produktname steht so auf dem Lieferantenetikett; die Kollektion nur, wenn er fehlt.
  const name = v.produktname || v.kollektion || m.bestellt.titel;
  const stand = STAND_TEXT[m.stand] || '';
  const link = v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener">Lieferantenseite</a>` : '';
  const haken = !!m.abgehakt;
  return `<li class="mp-zeile${haken ? ' mp-ab' : ''}${fehltHervor ? ' mp-fehlend' : ''}">
    <label class="mp-haken"><input type="checkbox" data-mp-haken="${esc(m.lineItemId)}"${haken ? ' checked' : ''}${lesend ? ' disabled' : ''}><span class="visually-hidden">${esc(`${e.serie || name} ${e.farbe || ''} überklebt und eingelegt`)}</span></label>
    ${bildHtml(m)}
    <div class="mp-vorher">
      <span class="mp-etikett">Auf dem Muster${m.lieferant ? ` · <span class="mp-laden">${esc(m.lieferant)}</span>` : ''}</span>
      <span>${esc(name)}</span>
      ${v.farbnummer ? `<span class="mp-farbnr">Farbnr. ${esc(v.farbnummer)}</span>` : '<span class="small muted">keine Farbnummer hinterlegt</span>'}
      ${m.verwechselbar ? '<span class="mp-achtung">Ähnliches Muster im selben Umschlag – Farbnummer prüfen</span>' : ''}
    </div>
    <div class="mp-pfeil" aria-hidden="true">→</div>
    <div class="mp-nachher"><span class="mp-etikett">Unser Aufkleber</span>${m.fehlt.length
      ? `<span class="mp-fehlt">Zuordnung fehlt: ${esc(m.bestellt.titel)}${m.bestellt.farbe ? ` – ${esc(m.bestellt.farbe)}` : ''}</span>`
      : `<span><strong>${esc(e.serie)}</strong> · ${esc(e.farbe)}</span><span class="mp-sku">${esc(e.sku)}</span>`}</div>
    <div class="mp-stand small">${fehltHervor ? '<strong class="mp-fehlt">fehlt</strong> · ' : ''}${mehrereBestellungen ? `${esc(m.orderName)} · ` : ''}${m.anzahl > 1 ? `${m.anzahl} Stück · ` : ''}<span class="${m.stand === 'offen' ? 'wait-warn' : 'muted'}">${esc(stand)}</span>${link}</div>
  </li>`;
}

function kundeHtml(k, nr) {
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
  let aktionen = '';
  if (k.bereich === 'gepackt') {
    aktionen = `<button type="button" class="btn btn-sm" data-mp-grossbrief="${pk}">Großbrief vorbereiten</button><span class="small muted">Gepackt ${esc(fmtDateTime(k.gepackt.zeit))}${k.gepackt.von ? ` · ${esc(k.gepackt.von)}` : ''}</span>
      ${lesend ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="0">Zurücknehmen</button>`}`;
  } else if (k.bereich === 'klaeren') {
    aktionen = `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}"${druckbar ? '' : ' disabled'}>Aufkleber drucken (${k.aufkleber})</button>
      ${(k.adressFehlt || []).length ? `<a class="btn btn-sm" href="#/kunden?tab=bestellungen&amp;bfilter=alle&amp;bq=${encodeURIComponent(k.bestellungen[0]?.orderName || '')}">Lieferadresse in Bestellung prüfen</a>` : ''}
      ${(k.zuordnungFehlt || []).length ? '<a class="btn btn-sm" href="#/lexikon">Musterzuordnung prüfen</a>' : ''}
      ${lesend || !k.klaeren ? '' : `<button type="button" class="btn btn-sm" data-mp-aktion="klaeren" data-mp-k="${pk}" data-mp-wert="0">Klärung aufheben – erneut prüfen</button>`}`;
  } else {
    aktionen = `<button type="button" class="btn btn-sm" data-mp-drucken="${pk}"${druckbar ? '' : ' disabled'}>Aufkleber drucken (${k.aufkleber})</button>
      ${lesend ? '' : offen
        ? `<input type="text" class="mp-notiz" data-mp-notiz="${pk}" maxlength="300" placeholder="Notiz (optional), z. B. was fehlt" aria-label="Notiz zu fehlenden Mustern">
           <button type="button" class="btn btn-sm" data-mp-aktion="klaeren" data-mp-k="${pk}" data-mp-wert="1">Fehlt etwas – zu klären (${offen} offen)</button>`
        : `<button type="button" class="btn btn-sm btn-primary" data-mp-aktion="gepackt" data-mp-k="${pk}" data-mp-wert="1">Umschlag gepackt</button>`}`;
  }
  return `<details class="mp-kunde mp-${k.bereich}" name="mp-umschlag" data-mp-kunde="${pk}" aria-labelledby="mp-k${nr}"${(packOffen ?? state.route.params.get('umschlag')) === k.packSchluessel ? ' open' : ''}>
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
    ${k.altvermerk ? `<p class="small muted">Frühere gemeinsame Klärnotiz: ${esc(k.altvermerk)}. Prüfe, ob sie für diesen Umschlag noch gilt.</p>` : ''}
    ${(k.hinweise || []).map(h => `<p class="notice warn">${esc(h)}</p>`).join('')}
    ${(k.adressFehlt || []).length ? `<p class="notice warn">Lieferadresse unvollständig: ${esc(k.adressFehlt.join(', '))}. Bitte die Lieferadresse in der Bestellung prüfen.</p>` : ''}
    ${(k.zuordnungFehlt || []).length ? `<p class="notice warn">Musterzuordnung unvollständig: ${esc(k.zuordnungFehlt.join('; '))}. Bitte im Lexikon prüfen.</p>` : ''}
    <ul class="mp-liste">${muster.map(m => zeileHtml(m, mehrere, { lesend: lesend || k.bereich === 'gepackt', fehltHervor: fehlend.has(m.lineItemId) })).join('')}</ul>
    ${k.bereich === 'warten' ? '<p class="notice warn">Verfügbarkeit noch nicht vollständig bestätigt. Nur tatsächlich vorliegende Muster abhaken; fehlende Ware unter „Bestellen“ prüfen.</p>' : ''}
    <div class="mp-aktionen">${aktionen}${k.bereich === 'gepackt' ? `<a class="btn btn-sm" href="#/einkauf?auftrag=${encodeURIComponent(k.bestellungen[0]?.orderId || '')}">Versand prüfen…</a>` : ''}<a class="btn btn-sm btn-ghost" href="#/einkauf?auftrag=${encodeURIComponent(k.bestellungen[0]?.orderId || '')}">Bestellstand prüfen</a></div>
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
  const modus = state.route.params.get('mp') === 'laden' ? 'laden' : 'kunde';
  const umschalter = `<div class="mp-modus" role="group" aria-label="Ansicht">
      <button type="button" class="btn btn-sm${modus === 'kunde' ? ' btn-primary' : ''}" data-param="mp" data-value="" aria-pressed="${modus === 'kunde'}">Nach Kunde packen</button>
      <button type="button" class="btn btn-sm${modus === 'laden' ? ' btn-primary' : ''}" data-param="mp" data-value="laden" aria-pressed="${modus === 'laden'}">Wareneingang nach Partnerladen</button>
    </div>`;
  if (modus === 'laden') return umschalter + viewNachLaden(d);
  const je = b => d.kunden.filter(k => k.bereich === b);
  const warten = je('warten'), packen = je('packen'), klaeren = je('klaeren'), gepackt = je('gepackt');
  const kopf = `<p class="sub mp-hier">Hier packst du Muster je Umschlag: Farbe prüfen, Aufkleber drucken und eingelegte Muster abhaken. Gepackt ist noch nicht versandt.</p>`;
  const ausserhalb = (d.ausschluesse?.zahlungOffen || 0) + (d.ausschluesse?.geschlossen || 0);
  const ausschlussHinweis = ausserhalb ? `<p class="notice warn">${plural(ausserhalb, 'weitere Musterbestellung ist', 'weitere Musterbestellungen sind')} nicht in der Packliste: ${d.ausschluesse.zahlungOffen || 0} mit offener Zahlungsfrage, ${d.ausschluesse.geschlossen || 0} geschlossen trotz offener Muster. <a href="#/kunden?tab=bestellungen&amp;bfilter=muster">Diese Bestellungen prüfen →</a></p>` : '';
  if (!d.kunden.length) return kopf + ausschlussHinweis + emptyState('Keine offenen Musterumschläge in der Packliste.', 'Neue bezahlte Musterbestellungen erscheinen hier automatisch, nach Lieferadresse gebündelt.');
  const suche = (state.route.params.get('mpq') || '').trim().toLowerCase();
  const passt = k => !suche || [k.name, umschlagKennung(k), ...k.muster.flatMap(m => [m.bestellt.titel, m.bestellt.farbe, m.vorher?.produktname, m.vorher?.farbnummer])].some(v => String(v || '').toLowerCase().includes(suche));
  const druckbar = packen.filter(k => !k.fehlt.length);
  const aufkleber = druckbar.reduce((s, k) => s + k.aufkleber, 0);
  const summe = `<div class="mp-summe">
      <span class="mp-zahlen"><strong>${packen.length} packbereit</strong> · <span class="${klaeren.length ? 'wait-warn' : ''}">${klaeren.length} zu klären</span> · ${warten.length} warten auf Ware · ${gepackt.length} gepackt</span>
      ${packen.length ? `<button type="button" class="btn btn-primary" data-mp-alle${aufkleber ? '' : ' disabled'}>Packbereite drucken (${plural(aufkleber, 'Aufkleber', 'Aufkleber')})</button>` : ''}
    </div>
    ${druckbar.length < packen.length ? `<p class="small muted">„Packbereite drucken“ lässt ${packen.length - druckbar.length === 1 ? 'einen Kunden' : `${packen.length - druckbar.length} Kunden`} ohne eindeutige Aufkleber aus.</p>` : ''}`;
  const bereich = (titel, liste, start, offenAuf = true) => liste.filter(passt).length
    ? `<details class="mp-bereich"${suche || offenAuf || liste.some(k => k.packSchluessel === (packOffen ?? state.route.params.get('umschlag'))) ? ' open' : ''}><summary><h2 class="mp-titel">${titel} <span class="muted">(${liste.filter(passt).length})</span></h2></summary><div class="mp-kunden">${liste.filter(passt).map((k, i) => kundeHtml(k, start + i + 1)).join('')}</div></details>` : '';
  return `${umschalter}${kopf}${summe}${ausschlussHinweis}
    <div class="toolbar"><input type="search" data-param="mpq" value="${esc(state.route.params.get('mpq') || '')}" placeholder="Kunde, Bestellung, Produkt oder Farbnummer" aria-label="Packstation durchsuchen"></div>
    ${suche ? `<p class="small muted">${d.kunden.filter(passt).length} von ${d.kunden.length} Umschlägen passen zur Suche. <button type="button" class="btn btn-sm btn-ghost" data-param="mpq" data-value="">Suche aufheben</button></p>` : ''}
    ${!d.kunden.some(passt) ? '<p class="small muted">Keine passenden Umschläge gefunden.</p>' : ''}
    ${bereich('Packbereit', packen, 0)}
    ${bereich('Wartet auf Ware', warten, packen.length, !packen.length)}
    ${bereich('Zu klären', klaeren, packen.length + warten.length)}
    ${bereich('Gepackt – Versand noch separat', gepackt, packen.length + warten.length + klaeren.length, state.route.params.get('mpbereich') === 'gepackt')}
    <p class="small muted">Offene Zahlungsfragen und weitere Musterbestellungen findest du unter <a href="#/kunden?tab=bestellungen&amp;bfilter=muster">Bestellungen – Muster →</a>.</p>`;
}

/** Wareneingang: ein Paket eines Partnerladens auf die richtigen Umschlaege verteilen. */
function viewNachLaden(d) {
  const laeden = musterNachLaden(d.kunden);
  if (!laeden.length) return emptyState('Nichts zu sortieren.', 'Alle offenen Muster sind schon eingelegt.');
  const gewaehlt = laeden.find(l => l.laden === state.route.params.get('laden')) || laeden[0];
  const chips = laeden.map(l => `<button type="button" class="btn btn-sm${l === gewaehlt ? ' btn-primary' : ''}" data-param="laden" data-value="${esc(l.laden)}" aria-pressed="${l === gewaehlt}">${esc(l.laden)} <span class="${l === gewaehlt ? '' : 'muted'}">(${l.eintraege.length})</span></button>`).join('');
  const zeilen = gewaehlt.eintraege.map(e => {
    const m = e.muster, v = m.vorher || {};
    return `<li class="mp-sortzeile">
      ${bildHtml(m)}
      <div class="mp-vorher"><span>${esc(v.produktname || m.bestellt.titel)}</span>${v.farbnummer ? `<span class="mp-farbnr">Farbnr. ${esc(v.farbnummer)}</span>` : '<span class="small muted">keine Farbnummer hinterlegt</span>'}</div>
      <div class="mp-pfeil" aria-hidden="true">→</div>
      <div class="mp-ziel"><a class="mp-umschlag" href="#/kunden?tab=muster&amp;umschlag=${encodeURIComponent(e.packSchluessel)}">${esc(e.umschlag)}</a>
        <span><strong>${esc(e.kunde)}</strong></span><span class="small muted">${esc(e.bestellung)}</span></div>
    </li>`;
  }).join('');
  return `<p class="sub mp-hier">Paket auspacken, Laden wählen, jedes Muster an Bild und Farbnummer erkennen und auf den Stapel mit der Umschlag-Nummer legen. Die Bestellnummer bleibt auch nach dem Packen anderer Kunden gleich.</p>
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

async function schreiben(daten, meldung) {
  try {
    await orgSchreiben(ENDPOINT, daten);
    if (meldung) toast(meldung);
  } catch (err) {
    toast(`Nicht gespeichert: ${err.message}`, 'warn');
  }
  kunden.musterPacken = null;
  ensureMusterPacken();
  render();
}

function kundeMitMuster(lineItemId) {
  return (kunden.musterPacken?.kunden || []).find(k => k.muster.some(m => m.lineItemId === lineItemId));
}

/** Klicks im Reiter "Muster packen". Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function musterPackenKlick(e) {
  const h = e.target.closest('[data-mp-haken]');
  if (h) {
    const k = kundeMitMuster(h.dataset.mpHaken);
    if (!k) return true;
    // Sofort sichtbar, dann zentral speichern (bei Fehler stellt das Neuladen den Stand wieder her).
    const m = k.muster.find(x => x.lineItemId === h.dataset.mpHaken);
    m.abgehakt = h.checked ? { zeit: new Date().toISOString(), von: null } : null;
    h.closest('.mp-zeile')?.classList.toggle('mp-ab', h.checked);
    schreiben({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [m.lineItemId], an: h.checked });
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
    a.disabled = true;
    const an = a.dataset.mpWert === '1';
    const pk = a.dataset.mpK;
    if (a.dataset.mpAktion === 'gepackt') schreiben({ packSchluessel: pk, aktion: 'gepackt', gepackt: an }, an ? 'Umschlag gepackt' : 'Gepackt zurückgenommen');
    else {
      const notiz = [...document.querySelectorAll('[data-mp-notiz]')].find(i => i.dataset.mpNotiz === pk)?.value || '';
      schreiben({ packSchluessel: pk, aktion: 'klaeren', klaeren: an, notiz }, an ? 'Zu klären – das Abgehakte bleibt gespeichert' : 'Wieder bei „Zu packen“');
    }
    return true;
  }
  return false;
}
