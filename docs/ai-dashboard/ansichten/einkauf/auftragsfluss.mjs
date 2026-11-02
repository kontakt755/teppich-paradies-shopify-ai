/**
 * Einkauf: Zwischenspeicher und Auftragsfluss je Position
 * (noch zu bestellen -> bestellt -> geliefert an uns -> an Kunden raus -> erledigt),
 * samt der Dialoge zum Setzen, Wiederoeffnen, Sammelbestellen und Abschliessen.
 *
 * Die Daten kommen aus privaten Dateien unter $TP_PRIVAT_DIR ueber /api/einkauf/* -
 * nie aus issues.json, nie aus dem Repository.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDateTime, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { musterEigen, stufeVon, wartetage } from '../../lib/einkauf-lieferanten.mjs';
import { musterSchritt } from '../../lib/einkauf-uebersicht.mjs';
import { versandRueckmeldung } from '../../lib/versand.mjs';

export { musterEigen };

/** Positionen (Ware und Muster) der Bestelluebersicht mit ihrem lokalen Auftragsfluss-Stand. */
export function einkaufPositionenMitStand(b) {
  const ware = (b.gruppen || []).flatMap(g => g.positionen);
  const muster = (b.musterGruppen || []).flatMap(g => g.positionen);
  return { ware, muster, gruppe: positionsGruppe };
}

// Woher kommt ein Muster? Spiegel von operations/lib/musterherkunft.mjs (dort die fuehrende Quelle).
export const MUSTER_HERKUNFT_LABEL = {
  lieferant: 'Beim Lieferanten bestellen',
  eigen_versand: 'Aus eigenem Bestand/Katalog – verschicken',
  eigen_vorbei: 'Aus eigenem Bestand/Katalog – persönlich vorbeibringen',
};
export const MUSTER_HERKUNFT_KURZ = { lieferant: 'beim Lieferanten', eigen_versand: 'haben wir da – verschicken', eigen_vorbei: 'haben wir da – vorbeibringen' };
/**
 * Filtergruppe einer Position wie afFilterGruppe(), dazu "eigen": ein noch offenes Muster aus
 * dem eigenen Bestand - es ist nicht "noch zu bestellen", sondern vorbeizubringen/zu verschicken.
 */
export function positionsGruppe(p) {
  const g = afFilterGruppe(afEintragFuer(p)?.status);
  return g === 'offen' && musterEigen(p) ? 'eigen' : g;
}

/**
 * Noch nicht abgeschlossene Positionen eines Auftrags. Ein Auftrag, dessen Positionen im
 * Auftragsfluss alle auf "Erledigt" stehen (z. B. als Testbestellung ohne Einkauf
 * abgeschlossen), zaehlt nicht mehr als offen oder als Problem - auch wenn Shopify ihn
 * weiter als unerfuellt fuehrt.
 */
export function auftragOffenePositionen(a) {
  return (a.positionen || []).filter(p => (p.menge ?? 1) > 0 && afFilterGruppe(afEintragFuer(p)?.status) !== 'erledigt');
}
export function aktiveAuftraege(b) { return (b.auftraege || []).filter(a => a.offen && auftragOffenePositionen(a).length); }

export const einkauf = {
  bestellungen: null, loadingBestellungen: false,
  produktstatus: null, loadingProduktstatus: false, produktstatusKey: null,
  auftragsstatus: null, loadingAuftragsstatus: false,
  kennzahlen: null, loadingKennzahlen: false,
  lieferanten: null, loadingLieferanten: false,
  aktualisierung: null, loadingAktualisierung: false,
  aktualisierungLaeuft: false, aktualisierungPollTimer: null,
};

// Auftragsfluss je Position: Bestellt -> Geliefert an uns -> An Kunden raus -> Erledigt.
// Muss zu operations/lib/auftragsstatus.mjs passen (dort die fuehrende Quelle).
const AF_STATUS_ORDER = ['bestellt', 'geliefert', 'raus', 'erledigt'];
export const AF_STATUS_LABEL = { bestellt: 'Bestellt', geliefert: 'Geliefert an uns', raus: 'An Kunden raus', erledigt: 'Erledigt' };
// Ware ueber unseren Kettelservice (eintrag.ueber = 'kettler'): dieselben Schritte, nur sagt der
// Text, wo die Ware gerade ist - "Geliefert an uns" heisst hier "beim Kettler abgeholt".
const AF_KETTLER_LABEL = { bestellt: 'Bestellt · unterwegs zum Kettler', geliefert: 'Beim Kettler abgeholt' };
/** Standtext einer Position, mit Kettler- bzw. Direktweg, wenn er vermerkt ist. */
export function afStatusText(eintrag) {
  const s = eintrag?.status;
  if (!s) return 'Noch nicht bestellt';
  if (s === 'bestellt' && istDirektZumKunden(eintrag)) return 'Bestellt · Lieferant schickt direkt an den Kunden';
  return (eintrag.ueber === 'kettler' && AF_KETTLER_LABEL[s]) || AF_STATUS_LABEL[s] || s;
}
export const istUeberKettler = eintrag => eintrag?.ueber === 'kettler';
/** Muster mit Lieferziel "Kunden" bestellt (ueber = 'kunde'): bei uns kommt nichts an, nach "bestellt" folgt "raus". */
export const istDirektZumKunden = eintrag => eintrag?.ueber === 'kunde';
// Naechster Schritt nach dem AKTUELLEN Status (nicht nach der Filtergruppe!). "raus" und
// "erledigt" fallen beide in die Filtergruppe "erledigt" (afFilterGruppe) - ein Mapping ueber
// die Filtergruppe liefert dafuer keinen eindeutigen Eintrag; frueher verschwand so der
// "Weiter"-Button ab "Geliefert an uns" und die Position blieb ohne Bedienelement stecken.
export function afNaechsterStatus(status) {
  if (!status) return AF_STATUS_ORDER[0];
  const idx = AF_STATUS_ORDER.indexOf(status);
  return idx >= 0 && idx < AF_STATUS_ORDER.length - 1 ? AF_STATUS_ORDER[idx + 1] : null;
}
/**
 * Filtergruppe im Einkauf: offen -> bestellt -> eingetroffen (bei uns) -> erledigt. Der Einkauf
 * endet bei "bei uns eingetroffen"; "an Kunden raus" zaehlt hier als erledigt (dieselbe Regel
 * wie stufeVon() in lib/einkauf-lieferanten.mjs, dort mit "zuBestellen" statt "offen").
 */
export function afFilterGruppe(status) {
  const stufe = stufeVon(status);
  return stufe === 'zuBestellen' ? 'offen' : stufe;
}
// einkauf.route -> Klartext (domains/shopify/einkauf-metafelder.json)
// Steht bewusst weit oben: die Einkaufsansicht zeigte den Rohwert
// ("SUPPLIER_DIRECT") - ausgerechnet bei der Angabe, an der haengt, wohin die
// Ware geliefert wird.
export const LIEFERWEG_LABEL = {
  OWN_STOCK: 'Eigenes Lager',
  SUPPLIER_TO_TP: 'Lieferant → Teppich-Paradies',
  SUPPLIER_DIRECT: 'Direktlieferung an Kunde',
  SUPPLIER_TO_SITE: 'Lieferant → Baustelle',
  SAMPLE_STOCK: 'Muster aus Lager',
  SAMPLE_SUPPLIER: 'Muster vom Lieferanten',
  SAMPLE_CUT: 'Muster (Zuschnitt)',
  NO_PROCUREMENT: 'Kein Einkauf',
};

function afKey(orderId, lineItemId) { return `${orderId}::${lineItemId}`; }

// Wartezeit: wie lange steht eine Position schon auf "Bestellt" bzw. "Geliefert an uns"?
// Ab 7 Tagen beim Lieferanten nachhaken (Bernstein), ab 14 Tagen ist es ein Problem (Rot).
export const AF_WARTE_WARN = 7;
const AF_WARTE_CRIT = 14;
export function afWartetage(eintrag, jetzt = Date.now()) {
  return wartetage(eintrag, jetzt);
}
export const afWarteText = tage => tage === 0 ? 'seit heute' : tage === 1 ? 'seit 1 Tag' : `seit ${tage} Tagen`;
export const afWarteKlasse = tage => tage >= AF_WARTE_CRIT ? 'wait-crit' : tage >= AF_WARTE_WARN ? 'wait-warn' : 'muted';

// Schritt, auf den "Wieder öffnen" zurueckfaellt - Spiegel von statusVorErledigt() in
// operations/lib/auftragsstatus.mjs (dort entscheidet der Server; hier nur fuer den Dialogtext).
function afVorErledigt(eintrag) {
  if (!eintrag) return null;
  const bis = eintrag.erledigtAm || '';
  return ['raus', 'geliefert', 'bestellt'].find(s => eintrag[`${s}Am`] && (!bis || eintrag[`${s}Am`] <= bis)) || null;
}

export function ensureEinkaufBestellungen() {
  if (einkauf.bestellungen || einkauf.loadingBestellungen) return;
  einkauf.loadingBestellungen = true;
  fetchEinkauf('/api/einkauf/bestellungen').then(d => {
    einkauf.bestellungen = d; einkauf.loadingBestellungen = false;
    if (['heute', 'einkauf'].includes(state.route.view)) render();
  });
}

export function ensureEinkaufAuftragsstatus() {
  if (einkauf.auftragsstatus || einkauf.loadingAuftragsstatus) return;
  einkauf.loadingAuftragsstatus = true;
  fetchEinkauf('/api/einkauf/auftragsstatus').then(d => {
    einkauf.auftragsstatus = d; einkauf.loadingAuftragsstatus = false;
    // "kunden": die Kundenakte blendet damit schon bestellte Lieferanten aus (zeitleiste.mjs).
    if (['heute', 'einkauf', 'kunden'].includes(state.route.view)) render();
  });
}

/**
 * Stammdaten je Lieferant (Bestellweg, Kontakt, Lieferzeit) - fuer die Lieferanten-Karten im
 * Einkauf und die Lieferantennamen in der Kundenakte (Zeitleiste, Ansicht "kunden").
 */
export function ensureEinkaufLieferanten() {
  if (einkauf.lieferanten || einkauf.loadingLieferanten) return;
  einkauf.loadingLieferanten = true;
  fetchEinkauf('/api/einkauf/lieferanten').then(d => {
    einkauf.lieferanten = d; einkauf.loadingLieferanten = false;
    if (['einkauf', 'kunden', 'lexikon'].includes(state.route.view)) render();
  });
}

/** Setzt den Auftragsfluss-Stand einer Position. `still` unterdrueckt Toast und Neuzeichnen
 * (fuer Sammelaktionen, die am Ende selbst einmal melden und zeichnen). */
export async function setzeAuftragsstatus(pos, status, { lieferantBestellnummer = null, notiz = null, ueber, still = false, nachladen = true } = {}) {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return false; }
  try {
    const r = await fetch('/api/einkauf/auftragsstatus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // ueber nur mitschicken, wenn gewaehlt wurde - sonst bleibt ein Kettler-Vermerk, wie er ist.
      body: JSON.stringify({ orderId: pos.orderId, lineItemId: pos.lineItemId, status, lieferantBestellnummer, notiz, ...(ueber === undefined ? {} : { ueber }) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    if (!einkauf.auftragsstatus || !einkauf.auftragsstatus.positionen) einkauf.auftragsstatus = { verfuegbar: true, positionen: {} };
    einkauf.auftragsstatus.positionen[afKey(pos.orderId, pos.lineItemId)] = j.eintrag;
    if (nachladen) await ladeKundenArbeitsstandNeu();
    if (!still) {
      // "Erledigt" bucht in Shopify, wenn dort noch offen (ohne Kundenmail) - das Ergebnis gehoert in die Rueckmeldung.
      const r = versandRueckmeldung(`Status: ${afStatusText(j.eintrag) || AF_STATUS_LABEL[status]}`, status === 'erledigt' ? j.shopify : null);
      toast(r.text, r.ton, r.ton ? { dauer: 9000 } : {});
      render();
    }
    return true;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return false; }
}

function openAuftragsstatusDialog(pos, status) {
  // Kettler nur anbieten, wenn seine Anschrift in den Stammdaten steht (kommt mit /api/einkauf/lieferanten).
  const kettler = einkauf.lieferanten?.kettelservice;
  const bisher = afEintragFuer(pos);
  const kettlerFeld = kettler ? `<label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="kettler"${istUeberKettler(bisher) ? ' checked' : ''}> Ware geht an unseren Kettler${kettler.ort ? ` (${esc(kettler.ort)})` : ''}</label>` : '';
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="afTitle" data-dialog>
    <h2 id="afTitle">Bestellt · ${esc(pos.orderName)}</h2>
    <p class="small muted">${esc(pos.titel)} · ${esc(pos.farbe)}<br>Beim Lieferanten bestellt – Bestellnummer des Lieferanten notieren (optional, hilft bei Rückfragen).</p>
    <div class="field"><label for="afNr">Lieferanten-Bestellnummer</label><input id="afNr" name="nr" placeholder="z. B. 2026-4711" maxlength="200"></div>
    ${kettlerFeld}
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Übernehmen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const fd = new FormData(form);
    const ueber = kettler ? (fd.get('kettler') ? 'kettler' : null) : undefined;
    const ok = await setzeAuftragsstatus(pos, status, { lieferantBestellnummer: (fd.get('nr') || '').trim() || null, ueber });
    if (ok) $('#dialogRoot').innerHTML = '';
    else form.querySelector('[type=submit]').disabled = false;
  });
}

/**
 * Satz fuer Ruecknahme-Dialoge: Shopify wird nie automatisch zurueckgenommen ("versendet" gewinnt,
 * operations/lib/shopify-abgleich.mjs). Ist der Versand dort gebucht, sagt der Dialog das ausdruecklich.
 */
export function shopifyBleibtText(positionen) {
  const gebucht = positionen.some(p => ['gebucht', 'bereits'].includes(afEintragFuer(p)?.shopifyVersand?.status));
  return gebucht
    ? ' In Shopify bleibt die Bestellung als versendet gebucht – das Control Center storniert dort nichts. Falls nötig, die Sendung in Shopify von Hand stornieren.'
    : ' In Shopify ändert sich nichts.';
}

/** Macht einen Abschluss rueckgaengig (Server prueft: nur erledigte Positionen). */
async function oeffneAuftragsstatusWieder(pos, notiz) {
  try {
    const r = await fetch('/api/einkauf/auftragsstatus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: pos.orderId, lineItemId: pos.lineItemId, aktion: 'wiederOeffnen', notiz: notiz || null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    if (!einkauf.auftragsstatus || !einkauf.auftragsstatus.positionen) einkauf.auftragsstatus = { verfuegbar: true, positionen: {} };
    einkauf.auftragsstatus.positionen[afKey(pos.orderId, pos.lineItemId)] = j.eintrag;
    return true;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return false; }
}

/** Geladene Arbeitslisten nach lokalem Schreiben nachziehen; Lesefehler aendern keinen Altstand. */
async function ladeKundenArbeitsstandNeu() {
  const lesen = async (feld, pfad) => {
    if (!kunden[feld]) return;
    try {
      const d = await fetchEinkauf(pfad);
      if (d?.verfuegbar) kunden[feld] = d;
    } catch { /* Der bestaetigte Status bleibt gespeichert; die letzte lesbare Liste bleibt sichtbar. */ }
  };
  // Offene Kundenakte: der Bestellmail-Dialog geht seit dem Rundgang 26.10. auch von dort auf -
  // nach "Als bestellt markieren" muss die Zeitleiste den naechsten Schritt zeigen.
  const key = kunden.detailKey;
  const akte = key && kunden.detail ? fetchEinkauf(`/api/kunden/detail?${new URLSearchParams({ key })}`)
    .then(d => { if (kunden.detailKey === key && d?.verfuegbar) kunden.detail = d; }).catch(() => {}) : null;
  await Promise.all([
    lesen('bestellungen', '/api/kunden/bestellungen'),
    lesen('musterPacken', '/api/kunden/muster-packen'),
    akte,
  ]);
}

/**
 * Nach einer Aenderung (zurueck auf offen, Muster-Herkunft) alles nachladen, was den Stand
 * zeigt - ohne dass die Seite auf "Lade ..." springt. `bestellungen`: auch die Bestelluebersicht
 * (die Herkunft steht an den Positionen dort).
 */
export async function ladeStandNeu({ bestellungen = false } = {}) {
  const auftraege = [fetchEinkauf('/api/einkauf/auftragsstatus').then(d => { if (d?.verfuegbar) einkauf.auftragsstatus = d; })];
  if (bestellungen) auftraege.push(fetchEinkauf('/api/einkauf/bestellungen').then(d => { if (d?.verfuegbar) einkauf.bestellungen = d; }));
  // Laedt auch die offene Kundenakte (einmal - vorher holte ladeStandNeu sie ein zweites Mal).
  auftraege.push(ladeKundenArbeitsstandNeu());
  kunden.faelle = null;
  await Promise.all(auftraege);
  render();
}

/**
 * Setzt Positionen von jedem Schritt zurueck auf "noch zu bestellen" (Server protokolliert
 * wer/wann/von welchem Status). Gibt die Zahl der zurueckgesetzten Positionen zurueck.
 */
export async function setzeZurueckAufOffen(positionen, notiz = null) {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return 0; }
  try {
    const r = await fetch('/api/einkauf/auftragsstatus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aktion: 'zurueckAufOffen', positionen: positionen.map(p => ({ orderId: p.orderId, lineItemId: p.lineItemId })), notiz: notiz || null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return 0; }
    if (!einkauf.auftragsstatus || !einkauf.auftragsstatus.positionen) einkauf.auftragsstatus = { verfuegbar: true, positionen: {} };
    Object.assign(einkauf.auftragsstatus.positionen, j.eintraege || {});
    return j.anzahl || 0;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return 0; }
}

// Sammelaktion "zurueck auf offen" je Gruppe/Karte: Positionen beim Zeichnen gemerkt (wie sammelGruppen).
export const zurueckGruppen = new Map();

/** Rueckfrage vor "Zurück auf offen": zeigt je Artikel, von welchem Schritt er zurueckfaellt. */
export function openZurueckAufOffenDialog(positionen, titel) {
  const betroffen = positionen.filter(p => p.lineItemId && afEintragFuer(p)?.status);
  if (!betroffen.length) { toast('Diese Artikel sind schon offen.'); return; }
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="zoTitel" data-dialog>
    <h2 id="zoTitel">Zurück auf offen · ${esc(titel)}</h2>
    <p class="small muted">${plural(betroffen.length, 'Artikel kommt', 'Artikel kommen')} zurück auf „Noch zu bestellen" – z. B. wenn versehentlich „bestellt" geklickt wurde. Der bisherige Stand bleibt mit Zeit und Person im Verlauf gespeichert.${shopifyBleibtText(betroffen)}</p>
    <ul class="small" style="margin:0;padding-left:18px;max-height:200px;overflow:auto">${betroffen.map(p => `<li>${esc(anzeigeWert(p.titel || ''))}${p.farbe ? ` · ${esc(p.farbe)}` : ''}${p.orderName ? ` · ${esc(p.orderName)}` : ''} <span class="muted">(war: ${esc(AF_STATUS_LABEL[afEintragFuer(p).status] || afEintragFuer(p).status)})</span></li>`).join('')}</ul>
    <div class="field"><label for="zoNotiz">Notiz (optional)</label><input id="zoNotiz" name="notiz" maxlength="500" placeholder="z. B. nur zum Testen geklickt"></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">${plural(betroffen.length, 'Artikel', 'Artikel')} zurück auf offen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const ok = await setzeZurueckAufOffen(betroffen, (new FormData(form).get('notiz') || '').trim());
    $('#dialogRoot').innerHTML = '';
    toast(ok === betroffen.length ? `${plural(ok, 'Artikel', 'Artikel')} zurück auf offen` : `Nur ${ok} von ${betroffen.length} Artikeln zurück auf offen`, ok === betroffen.length ? '' : 'crit');
    render();
    ladeStandNeu();
  });
}

/** Speichert, woher die Muster einer Bestellung (ohne lineItemId) bzw. einer Position kommen. */
export async function setzeMusterHerkunft({ orderId, lineItemId = null, herkunft, notiz = null }) {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return false; }
  try {
    const r = await fetch('/api/einkauf/auftragsstatus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aktion: 'musterHerkunft', orderId, lineItemId, herkunft, notiz }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    toast(`Muster: ${MUSTER_HERKUNFT_LABEL[herkunft]}`);
    await ladeStandNeu({ bestellungen: true });
    return true;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return false; }
}

/** Kunde und Ort (Stadt der Lieferadresse) einer Bestellung - damit man "in der Naehe" erkennt. */
export function kundeUndOrt(orderId) {
  const a = alleAuftraege().find(x => x.id === orderId)
    || kunden.detail?.kunde?.auftraege?.find(x => x.id === orderId)
    || kunden.bestellungen?.zeilen?.find(z => z.orderId === orderId)?.auftrag;
  const ok = v => (v && v !== '–' ? String(v).trim() : '');
  return { name: ok(a?.details?.kunde?.name) || ok(a?.details?.lieferadresse?.name), ort: ok(a?.details?.lieferadresse?.ort), auftrag: a || null };
}

/**
 * Dialog "Woher kommen die Muster?" fuer eine Musterbestellung (lineItemId leer) oder eine
 * Musterposition. Zeigt Kunde und Ort, damit man "Kunde in der Naehe" sofort sieht.
 */
export function openMusterHerkunftDialog(orderId, lineItemId = null, { danach = null } = {}) {
  const { name, ort, auftrag } = kundeUndOrt(orderId);
  const pos = lineItemId ? (auftrag?.positionen || []).find(p => p.lineItemId === lineItemId) : null;
  const muster = (auftrag?.positionen || []).filter(p => p.istMuster);
  const aktuell = (pos || muster[0])?.musterHerkunft || 'lieferant';
  const bereitsBestellt = (pos ? [pos] : muster).filter(p => afEintragFuer({ orderId, lineItemId: p.lineItemId })?.status === 'bestellt').length;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="mhTitel" data-dialog>
    <h2 id="mhTitel">Woher kommen die Muster? · ${esc(auftrag?.name || '')}</h2>
    <p class="small"><b>${esc(name || 'Kunde')}</b>${ort ? ` · ${esc(ort)}` : ''}${pos ? `<br><span class="muted">${esc(anzeigeWert(pos.titel))}${pos.farbe ? ` · ${esc(pos.farbe)}` : ''}</span>` : muster.length ? `<br><span class="muted">${plural(muster.length, 'Muster', 'Muster')} in dieser Bestellung</span>` : ''}</p>
    <fieldset class="zl-wahl"><legend>Woher?</legend>
      ${Object.entries(MUSTER_HERKUNFT_LABEL).map(([w, t]) => `<label><input type="radio" name="herkunft" value="${esc(w)}"${w === aktuell ? ' checked' : ''} required> ${esc(t)}${w === 'eigen_vorbei' ? ' <span class="muted">(Kunde in der Nähe)</span>' : ''}</label>`).join('')}
    </fieldset>
    <p class="small muted">„Haben wir da" nimmt die Muster aus der Bestellmail und aus „Muster noch zu bestellen". Gespeichert wird nur hier im Control Center, nicht in Shopify.</p>
    ${bereitsBestellt ? `<p class="notice warn">${plural(bereitsBestellt, 'Muster steht', 'Muster stehen')} schon auf „Bestellt". Falls das ein Versehen war: in „Positionen bearbeiten" auf „Zurück auf offen…".</p>` : ''}
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Übernehmen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input:checked, input')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const herkunft = String(new FormData(form).get('herkunft') || '');
    if (!herkunft) return;
    form.querySelector('[type=submit]').disabled = true;
    const ok = await setzeMusterHerkunft({ orderId, lineItemId, herkunft });
    if (!ok) { form.querySelector('[type=submit]').disabled = false; return; }
    $('#dialogRoot').innerHTML = '';
    if (danach) danach();
  });
}

/** Alle Auftraege der Bestelluebersicht, auch Testbestellungen (die "Ohne Einkauf
 * abschliessen" am haeufigsten trifft und die in keiner Lieferanten-Gruppe stehen). */
export const alleAuftraege = () => {
  const jeId = new Map();
  for (const a of [...(einkauf.bestellungen?.auftraege || []), ...(einkauf.bestellungen?.testauftraege || []), ...(kunden.bestellungen?.zeilen || []).map(z => z.auftrag), ...(kunden.detail?.kunde?.auftraege || [])]) if (a?.id && !jeId.has(a.id)) jeId.set(a.id, a);
  return [...jeId.values()];
};
export const erledigtePositionen = a => (a.positionen || []).filter(p => p.lineItemId && afEintragFuer({ orderId: a.id, lineItemId: p.lineItemId })?.status === 'erledigt');

/** Rueckfrage vor "Wieder öffnen": zeigt, was zurueckkommt und wohin, und wer wann abgeschlossen hat. */
function openWiederOeffnenDialog(orderId, lineItemId = null) {
  const a = alleAuftraege().find(x => x.id === orderId);
  if (!a) { toast('Auftrag nicht in der Bestellübersicht gefunden.', 'crit'); return; }
  const positionen = erledigtePositionen(a).filter(p => !lineItemId || p.lineItemId === lineItemId);
  if (!positionen.length) { toast('Nichts abgeschlossen in diesem Auftrag.'); return; }
  const eintrag = p => afEintragFuer({ orderId: a.id, lineItemId: p.lineItemId });
  const ziel = p => { const s = afVorErledigt(eintrag(p)); return s ? AF_STATUS_LABEL[s] : 'Noch nicht bestellt'; };
  const e0 = eintrag(positionen[0]);
  const abschluss = e0?.erledigtAm ? `Abgeschlossen ${fmtDateTime(e0.erledigtAm)}${e0.erledigtVon ? ` von @${esc(e0.erledigtVon)}` : ''}${e0.erledigtNotiz ? ` · Grund: ${esc(e0.erledigtNotiz)}` : ''}` : '';
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="woTitle" data-dialog>
    <h2 id="woTitle">Wieder öffnen · ${esc(a.name)}</h2>
    <p class="small muted">${plural(positionen.length, 'Artikel kommt', 'Artikel kommen')} zurück in die Arbeitsliste. Der Abschluss bleibt im Verlauf der Position gespeichert.${shopifyBleibtText(positionen.map(p => ({ orderId: a.id, lineItemId: p.lineItemId })))}${abschluss ? `<br>${abschluss}` : ''}</p>
    <ul class="small" style="margin:0;padding-left:18px">${positionen.map(p => `<li>${esc(anzeigeWert(p.titel))} · ${esc(p.farbe)} → ${esc(ziel(p))}</li>`).join('')}</ul>
    <div class="field"><label for="woNotiz">Notiz (optional)</label><input id="woNotiz" name="notiz" maxlength="500" placeholder="z. B. doch keine Testbestellung"></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Wieder öffnen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const notiz = (new FormData(form).get('notiz') || '').trim();
    let ok = 0;
    for (const p of positionen) if (await oeffneAuftragsstatusWieder({ orderId: a.id, lineItemId: p.lineItemId }, notiz)) ok += 1;
    $('#dialogRoot').innerHTML = '';
    toast(ok === positionen.length ? `${a.name}: ${plural(ok, 'Artikel', 'Artikel')} wieder geöffnet` : `${a.name}: nur ${ok} von ${positionen.length} wieder geöffnet`, ok === positionen.length ? '' : 'crit');
    render();
  });
}

// Sammelaktion je Lieferanten-Gruppe: die Positionen stehen hier (beim Zeichnen gemerkt), nicht
// in data-Attributen - eine Gruppe kann viele Artikel haben.
export const sammelGruppen = new Map();

function openSammelBestelltDialog(id) {
  const g = sammelGruppen.get(id);
  if (!g) return;
  // Beim Oeffnen neu pruefen: zwischen Zeichnen und Klick kann jemand einzelne Artikel gesetzt haben.
  const positionen = g.positionen.filter(p => !afEintragFuer(p)?.status && !musterEigen(p));
  if (!positionen.length) { toast('Alle Artikel dieser Gruppe sind bereits bestellt.'); return; }
  const luecken = positionen.filter(positionUnvollstaendig).length;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="sbTitle" data-dialog>
    <h2 id="sbTitle">Als bestellt markieren · ${esc(g.titel)}</h2>
    <p class="small muted">Setzt ${plural(positionen.length, 'Artikel', 'Artikel')} auf „Bestellt" – nur verwenden, wenn die Bestellung beim Lieferanten wirklich raus ist.</p>
    <ul class="small" style="margin:0;padding-left:18px;max-height:200px;overflow:auto">${positionen.map(p => `<li>${esc(anzeigeWert(p.titel))} · ${esc(p.farbe)} · ${esc(p.orderName)}</li>`).join('')}</ul>
    ${luecken ? `<p class="notice warn">${plural(luecken, 'Artikel hat', 'Artikel haben')} fehlende Angaben (in der Liste markiert).</p>` : ''}
    <div class="field"><label for="sbNr">Lieferanten-Bestellnummer (optional, gilt für alle)</label><input id="sbNr" name="nr" placeholder="z. B. 2026-4711" maxlength="200"></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">${plural(positionen.length, 'Artikel', 'Artikel')} als bestellt markieren</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const nr = (new FormData(form).get('nr') || '').trim() || null;
    await markiereAlsBestellt(positionen, nr);
    $('#dialogRoot').innerHTML = '';
    render();
  });
}

/**
 * Sammelaktion: setzt mehrere Positionen auf "Bestellt" und meldet einmal. Gemeinsam fuer
 * "Alle als bestellt markieren…" und die Rueckfrage nach der Bestellmail. Gibt die Zahl der
 * gesetzten Positionen zurueck; gezeichnet wird vom Aufrufer.
 */
export async function markiereAlsBestellt(positionen, lieferantBestellnummer = null, { ueber } = {}) {
  let ok = 0;
  for (const p of positionen) if (await setzeAuftragsstatus(p, 'bestellt', { lieferantBestellnummer, ueber, still: true, nachladen: false })) ok += 1;
  if (ok) await ladeKundenArbeitsstandNeu();
  toast(ok === positionen.length ? `${plural(ok, 'Artikel', 'Artikel')} als bestellt markiert` : `Nur ${ok} von ${positionen.length} Artikeln als bestellt markiert`, ok === positionen.length ? '' : 'crit');
  return ok;
}

/**
 * Muster eines Kunden auf einmal als angekommen eintragen - ohne Mengen-Dialog: ein Muster ist
 * da oder nicht (Innendienst 2026-10-15, vorher ein Dialog je Muster). Meldet einmal.
 */
export async function markiereMusterAngekommen(positionen) {
  let ok = 0;
  for (const p of positionen) if (await setzeAuftragsstatus(p, 'geliefert', { still: true, nachladen: false })) ok += 1;
  if (ok) await ladeKundenArbeitsstandNeu();
  if (ok) toast(ok === positionen.length ? `${plural(ok, 'Muster', 'Muster')} als angekommen eingetragen` : `Nur ${ok} von ${positionen.length} Mustern eingetragen`, ok === positionen.length ? '' : 'crit');
  render();
  return ok;
}

/**
 * Knopf fuer den gemeinsamen naechsten Schritt aller Muster eines Kunden (musterSchritt):
 * "Alle 3 angekommen" (ein Klick) oder "Verschicken…"/"Übergeben…" (Versand-Dialog, alle
 * bereiten Muster angekreuzt). `hier` sind die Muster der Zeile; fuers Verschicken zaehlt der
 * ganze Auftrag, damit nichts raus geht, solange ein Muster noch fehlt.
 */
export function musterSchrittKnopf(hier, { klasse = 'btn btn-sm' } = {}) {
  if (istNurLesend() || !hier?.length) return '';
  const statusVon = p => afEintragFuer(p)?.status || null;
  const direktVon = p => istDirektZumKunden(afEintragFuer(p));
  const s = musterSchritt(hier, statusVon, { direktVon });
  if (s?.schritt === 'angekommen') {
    const daten = JSON.stringify(s.positionen.map(p => ({ orderId: p.orderId, lineItemId: p.lineItemId })));
    const text = s.positionen.length === 1 ? 'Muster angekommen' : `Alle ${s.positionen.length} als angekommen eintragen`;
    return `<button type="button" class="${klasse}" data-muster-angekommen="${esc(daten)}" title="Die Muster sind bei uns eingetroffen">${esc(text)}</button>`;
  }
  const orderIds = [...new Set(hier.map(p => p.orderId).filter(Boolean))];
  // Direkt vom Lieferanten: der Versand-Dialog fuer den ganzen Auftrag bucht in Shopify und
  // startet damit das Nachfassen - "angekommen" gibt es hier nicht.
  if (s?.schritt === 'direkt' && orderIds.length === 1) {
    return `<button type="button" class="${klasse}" data-af-set data-af-status="raus" data-af-order="${esc(orderIds[0])}" title="Der Lieferant hat die Muster direkt an den Kunden geschickt">Ist an den Kunden raus…</button>`;
  }
  if (orderIds.length !== 1) return '';
  const auftrag = alleAuftraege().find(a => a.id === orderIds[0]);
  const ganz = musterSchritt((auftrag?.positionen || hier).map(p => ({ ...p, orderId: orderIds[0] })), statusVon, { direktVon });
  if (ganz?.schritt !== 'verschicken') return '';
  const packen = `<a class="${klasse}" href="#/kunden?tab=muster&amp;umschlag=${encodeURIComponent(orderIds[0])}">Packstation</a>`;
  return `${packen}<button type="button" class="${klasse}" data-af-set data-af-status="raus" data-af-order="${esc(orderIds[0])}" data-af-item="${esc(ganz.positionen[0].lineItemId)}">${ganz.uebergabe ? 'Übergeben…' : 'Verschicken…'}</button>`;
}

export function ensureEinkaufKennzahlen() {
  if (einkauf.kennzahlen || einkauf.loadingKennzahlen) return;
  einkauf.loadingKennzahlen = true;
  fetchEinkauf('/api/einkauf/kennzahlen').then(d => {
    einkauf.kennzahlen = d; einkauf.loadingKennzahlen = false;
    if (state.route.view === 'heute') render();
  });
}

/** Menschenlesbare Anzeige statt des internen Markers "UNGEKLAERT" (Grosshandel-Exportdaten). */
export function anzeigeWert(wert) { return wert === 'UNGEKLAERT' ? 'Ungeklärt' : wert; }

export function afEintragFuer(p) {
  return einkauf.auftragsstatus?.positionen?.[afKey(p.orderId, p.lineItemId)] || null;
}

export const hatLieferantLink = p => Boolean(p.lieferantUrl && p.lieferantUrl !== 'UNGEKLAERT');

/** Fehlt einer Position etwas, das die Bestellung beim Lieferanten verhindert? */
export function positionUnvollstaendig(p) {
  return p.grosshaendlerId === 'UNGEKLAERT' || p.bestellmenge?.menge === 'UNGEKLAERT' || !hatLieferantLink(p);
}

/** Dialog "Ohne Einkauf abschließen": setzt alle offenen Artikel eines Auftrags auf Erledigt. */
function openAuftragAbschliessenDialog(orderId) {
  // Auch Testbestellungen: dort steht der Knopf ebenfalls, fand den Auftrag aber frueher nicht
  // (Suche nur in den Kundenauftraegen) - der Klick blieb ohne Wirkung.
  const a = alleAuftraege().find(x => x.id === orderId);
  if (!a) return;
  const offen = auftragOffenePositionen(a).filter(p => p.lineItemId);
  if (!offen.length) { toast('Keine offenen Artikel in diesem Auftrag.'); return; }
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="abTitle" data-dialog>
    <h2 id="abTitle">Ohne Einkauf abschließen · ${esc(a.name)}</h2>
    <p class="small muted">Setzt ${plural(offen.length, 'Artikel', 'Artikel')} dieses Auftrags im Auftragsfluss auf „Erledigt". Gedacht für Testbestellungen oder Aufträge, die anders erledigt wurden. ${a.testbestellung ? 'Testbestellung: in Shopify wird nichts gebucht.' : 'In Shopify wird die Bestellung als versendet gebucht, ohne Mail an den Kunden. Wurde sie storniert, zuerst in Shopify stornieren.'} Über den Filter „Erledigt" lässt sich der Schritt nachvollziehen und wieder öffnen.</p>
    <ul class="small" style="margin:0;padding-left:18px">${offen.map(p => `<li>${esc(anzeigeWert(p.titel))} · ${esc(p.farbe)}</li>`).join('')}</ul>
    <div class="field"><label for="abGrund">Grund (Pflicht)</label><textarea id="abGrund" name="grund" required maxlength="500" placeholder="z. B. Testbestellung, kein Einkauf nötig"></textarea></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Abschließen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('textarea')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const grund = (new FormData(form).get('grund') || '').trim();
    if (!grund) return;
    const knopf = form.querySelector('[type=submit]');
    knopf.disabled = true;
    // Ein Aufruf fuer alle Artikel: eine Buchung in Shopify statt einer je Artikel.
    let j;
    try {
      const r = await fetch('/api/kunden/bestellung-fertig', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: a.id, lineItemIds: offen.map(p => p.lineItemId), notiz: grund }),
      });
      j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); knopf.disabled = false; return; }
    } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); knopf.disabled = false; return; }
    if (!einkauf.auftragsstatus || !einkauf.auftragsstatus.positionen) einkauf.auftragsstatus = { verfuegbar: true, positionen: {} };
    for (const e of j.eintraege || []) if (e?.orderId && e?.lineItemId) einkauf.auftragsstatus.positionen[afKey(e.orderId, e.lineItemId)] = e;
    $('#dialogRoot').innerHTML = '';
    const ok = j.anzahl || 0;
    const r = versandRueckmeldung(ok === offen.length ? `${a.name}: ${plural(ok, 'Artikel', 'Artikel')} abgeschlossen` : `${a.name}: nur ${ok} von ${offen.length} abgeschlossen`, j.shopify);
    toast(r.text, ok === offen.length ? r.ton : 'crit', r.ton ? { dauer: 9000 } : {});
    render();
    ladeStandNeu();
  });
}

/** Einkauf: Auftragsfluss-Knopf an einer Position. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function einkaufKlickStatus(e) {
  const angekommen = e.target.closest('[data-muster-angekommen]');
  if (angekommen) {
    e.preventDefault();
    let positionen = [];
    try { positionen = JSON.parse(angekommen.dataset.musterAngekommen); } catch { /* unten gemeldet */ }
    if (!positionen.length) { toast('Die Muster sind nicht in den aktuellen Daten. Bitte aktualisieren.', 'crit'); return true; }
    angekommen.disabled = true;   // gegen den Doppelklick - danach wird ohnehin neu gezeichnet
    markiereMusterAngekommen(positionen).then(ok => { if (!ok) angekommen.disabled = false; });
    return true;
  }
  const afBtn = e.target.closest('[data-af-set]');
  if (afBtn) {
    // Anzeige-Angaben fuer den Dialog stehen als data-Attribute am Knopf - nicht aus den
    // Tabellenspalten lesen, deren Reihenfolge sich mit dem Layout aendert.
    const ds = afBtn.dataset;
    const pos = { orderId: ds.afOrder, lineItemId: ds.afItem, orderName: ds.afName || '', titel: anzeigeWert(ds.afTitel || ''), farbe: ds.afFarbe || '' };
    const status = afBtn.dataset.afStatus;
    if (status === 'bestellt') openAuftragsstatusDialog(pos, status);
    else setzeAuftragsstatus(pos, status);
    return true;
  }
  return false;
}

/** Einkauf: wieder oeffnen, Sammelbestellung, Auftrag abschliessen. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function einkaufKlickDialoge(e) {
  const zurueck = e.target.closest('[data-af-zurueck]');
  if (zurueck) {
    // Einzelne Position (data-af-item) oder gemerkte Sammelgruppe (data-af-zurueck-gruppe).
    const ds = zurueck.dataset;
    if (ds.afZurueckGruppe) { const g = zurueckGruppen.get(ds.afZurueckGruppe); if (g) openZurueckAufOffenDialog(g.positionen, g.titel); return true; }
    openZurueckAufOffenDialog([{ orderId: ds.afZurueck, lineItemId: ds.afItem, orderName: ds.afName || '', titel: ds.afTitel || '', farbe: ds.afFarbe || '' }], ds.afName || 'Artikel');
    return true;
  }
  const herkunft = e.target.closest('[data-muster-herkunft]');
  if (herkunft) { e.preventDefault(); openMusterHerkunftDialog(herkunft.dataset.musterHerkunft, herkunft.dataset.afItem || null); return true; }
  const reopen = e.target.closest('[data-af-reopen]');
  if (reopen) { openWiederOeffnenDialog(reopen.dataset.afReopen, reopen.dataset.afItem || null); return true; }
  const sammelBtn = e.target.closest('[data-af-sammel]');
  if (sammelBtn) { openSammelBestelltDialog(sammelBtn.dataset.afSammel); return true; }
  const abschl = e.target.closest('[data-auftrag-erledigt]');
  if (abschl) { openAuftragAbschliessenDialog(abschl.dataset.auftragErledigt); return true; }
  return false;
}
