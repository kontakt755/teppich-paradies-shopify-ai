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

/** Positionen (Ware und Muster) der Bestelluebersicht mit ihrem lokalen Auftragsfluss-Stand. */
export function einkaufPositionenMitStand(b) {
  const ware = (b.gruppen || []).flatMap(g => g.positionen);
  const muster = (b.musterGruppen || []).flatMap(g => g.positionen);
  const gruppe = p => afFilterGruppe(afEintragFuer(p)?.status);
  return { ware, muster, gruppe };
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
// Naechster Schritt nach dem AKTUELLEN Status (nicht nach der Filtergruppe!). "geliefert" und
// "raus" fallen beide in die Filtergruppe "unterwegs" (afFilterGruppe) - ein Mapping ueber die
// Filtergruppe wie zuvor hier stand liefert dafuer keinen Eintrag, und der "Weiter"-Button
// verschwand dauerhaft ab "Geliefert an uns": die Position blieb ohne Bedienelement stecken.
export function afNaechsterStatus(status) {
  if (!status) return AF_STATUS_ORDER[0];
  const idx = AF_STATUS_ORDER.indexOf(status);
  return idx >= 0 && idx < AF_STATUS_ORDER.length - 1 ? AF_STATUS_ORDER[idx + 1] : null;
}
export function afFilterGruppe(status) {
  if (!status) return 'offen';
  if (status === 'bestellt') return 'bestellt';
  if (status === 'geliefert' || status === 'raus') return 'unterwegs';
  if (status === 'erledigt') return 'erledigt';
  return 'offen';
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
  const seit = eintrag?.status === 'bestellt' ? eintrag.bestelltAm : eintrag?.status === 'geliefert' ? eintrag.geliefertAm : null;
  if (!seit) return null;
  const tage = Math.floor((jetzt - new Date(seit)) / 864e5);
  return Number.isFinite(tage) && tage >= 0 ? tage : null;
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
    if (['heute', 'einkauf'].includes(state.route.view)) render();
  });
}

/** Stammdaten je Lieferant (Bestellweg, Kontakt, Lieferzeit) - fuer die Lieferanten-Karten im Einkauf. */
export function ensureEinkaufLieferanten() {
  if (einkauf.lieferanten || einkauf.loadingLieferanten) return;
  einkauf.loadingLieferanten = true;
  fetchEinkauf('/api/einkauf/lieferanten').then(d => {
    einkauf.lieferanten = d; einkauf.loadingLieferanten = false;
    if (state.route.view === 'einkauf') render();
  });
}

/** Setzt den Auftragsfluss-Stand einer Position. `still` unterdrueckt Toast und Neuzeichnen
 * (fuer Sammelaktionen, die am Ende selbst einmal melden und zeichnen). */
export async function setzeAuftragsstatus(pos, status, { lieferantBestellnummer = null, notiz = null, still = false } = {}) {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return false; }
  try {
    const r = await fetch('/api/einkauf/auftragsstatus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: pos.orderId, lineItemId: pos.lineItemId, status, lieferantBestellnummer, notiz }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    if (!einkauf.auftragsstatus || !einkauf.auftragsstatus.positionen) einkauf.auftragsstatus = { verfuegbar: true, positionen: {} };
    einkauf.auftragsstatus.positionen[afKey(pos.orderId, pos.lineItemId)] = j.eintrag;
    if (!still) { toast(`Status: ${AF_STATUS_LABEL[status]}`); render(); }
    return true;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return false; }
}

function openAuftragsstatusDialog(pos, status) {
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="afTitle" data-dialog>
    <h2 id="afTitle">Bestellt · ${esc(pos.orderName)}</h2>
    <p class="small muted">${esc(pos.titel)} · ${esc(pos.farbe)}<br>Beim Lieferanten bestellt – Bestellnummer des Lieferanten notieren (optional, hilft bei Rückfragen).</p>
    <div class="field"><label for="afNr">Lieferanten-Bestellnummer</label><input id="afNr" name="nr" placeholder="z. B. 2026-4711" maxlength="200"></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Übernehmen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const ok = await setzeAuftragsstatus(pos, status, { lieferantBestellnummer: (new FormData(form).get('nr') || '').trim() || null });
    if (ok) $('#dialogRoot').innerHTML = '';
    else form.querySelector('[type=submit]').disabled = false;
  });
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

/** Alle Auftraege der Bestelluebersicht, auch Testbestellungen (die "Ohne Einkauf
 * abschliessen" am haeufigsten trifft und die in keiner Lieferanten-Gruppe stehen). */
export const alleAuftraege = () => [...(einkauf.bestellungen?.auftraege || []), ...(einkauf.bestellungen?.testauftraege || [])];
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
    <p class="small muted">${plural(positionen.length, 'Artikel kommt', 'Artikel kommen')} zurück in die Arbeitsliste. Der Abschluss bleibt im Verlauf der Position gespeichert; in Shopify ändert sich nichts.${abschluss ? `<br>${abschluss}` : ''}</p>
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
  const positionen = g.positionen.filter(p => !afEintragFuer(p)?.status);
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
export async function markiereAlsBestellt(positionen, lieferantBestellnummer = null) {
  let ok = 0;
  for (const p of positionen) if (await setzeAuftragsstatus(p, 'bestellt', { lieferantBestellnummer, still: true })) ok += 1;
  toast(ok === positionen.length ? `${plural(ok, 'Artikel', 'Artikel')} als bestellt markiert` : `Nur ${ok} von ${positionen.length} Artikeln als bestellt markiert`, ok === positionen.length ? '' : 'crit');
  return ok;
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
    <p class="small muted">Setzt ${plural(offen.length, 'Artikel', 'Artikel')} dieses Auftrags im Auftragsfluss auf „Erledigt". Gedacht für Testbestellungen oder Aufträge, die anders erledigt wurden. In Shopify ändert sich nichts; über den Filter „Erledigt" lässt sich der Schritt nachvollziehen und wieder öffnen.</p>
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
    form.querySelector('[type=submit]').disabled = true;
    let ok = 0;
    for (const p of offen) {
      if (await setzeAuftragsstatus({ orderId: a.id, lineItemId: p.lineItemId }, 'erledigt', { notiz: grund, still: true })) ok += 1;
    }
    $('#dialogRoot').innerHTML = '';
    toast(ok === offen.length ? `${a.name}: ${plural(ok, 'Artikel', 'Artikel')} abgeschlossen` : `${a.name}: nur ${ok} von ${offen.length} abgeschlossen`, ok === offen.length ? '' : 'crit');
    render();
  });
}

/** Einkauf: Auftragsfluss-Knopf an einer Position. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function einkaufKlickStatus(e) {
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
  const reopen = e.target.closest('[data-af-reopen]');
  if (reopen) { openWiederOeffnenDialog(reopen.dataset.afReopen, reopen.dataset.afItem || null); return true; }
  const sammelBtn = e.target.closest('[data-af-sammel]');
  if (sammelBtn) { openSammelBestelltDialog(sammelBtn.dataset.afSammel); return true; }
  const abschl = e.target.closest('[data-auftrag-erledigt]');
  if (abschl) { openAuftragAbschliessenDialog(abschl.dataset.auftragErledigt); return true; }
  return false;
}
