/** Aufkleber-Druckliste (bis 29.10. "Gemeinsame Druckliste"): auswaehlen, zusammen drucken, den Ausdruck bewusst bestaetigen. */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, toast } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { oeffneEtikettenDruck } from '../bausteine/etiketten-druck.mjs';
import { DRUCK_LIMIT, neueKennung } from '../lib/druckliste.mjs';

const ENDPOINT = '/api/lexikon/druckliste';
const SEITENGROESSE = 25;
const liste = {
  daten: null, loading: false, versucht: false, busy: false, ladenummer: 0,
  ladeFehler: '', aktionsFehler: '', auswahl: new Map(), seite: 1, nachladen: false,
  entferntLaeuft: false, historieOffen: false, auswahlmodus: 'alle',
};
let sitzung = 0, letzterVormerkVersuch = null, letzterReservierVersuch = null;
const schreibVersuche = new Map(), eigeneAuftraege = new Set(), versuchteAuftraege = new Set();
const auftragsAnsichten = new Map();
const sichtbar = () => state.capabilities.mode === 'local' && state.route.view === 'lexikon' && state.route.params.get('tab') === 'druckliste';
const neuZeichnen = () => { if (sichtbar()) render(); };
const person = wert => typeof wert === 'string' ? wert : wert?.name || wert?.kuerzel || 'nicht hinterlegt';
const zeit = wert => wert ? fmtDateTime(wert) : 'nicht hinterlegt';
const anzahlText = n => `${n} Aufkleber`;
const positionenText = n => `${n} ${n === 1 ? 'Position' : 'Positionen'}`;
const menge = es => es.reduce((n, e) => n + e.anzahl, 0);
const referenzen = es => es.map(e => ({ id: e.id, revision: e.revision }));

function pruefeAntwort(daten) {
  if (!daten || daten.fehler || daten.schema !== 1 || !Array.isArray(daten.eintraege)) throw new Error(daten?.hinweis || 'Die gemeinsame Druckliste konnte nicht geladen werden.');
  return daten;
}
function uebernehme(daten) {
  liste.daten = pruefeAntwort(daten);
  const offen = new Map(daten.eintraege.filter(e => e.status === 'offen').map(e => [e.id, e]));
  for (const [id, revision] of liste.auswahl) if (offen.get(id)?.revision !== revision) liste.auswahl.delete(id);
  liste.ladeFehler = '';
}
async function laden({ waehrendSchreiben = false, still = false, fehlerLoeschen = false } = {}) {
  if (liste.busy && !waehrendSchreiben) { liste.nachladen = true; return; }
  if (still && (liste.loading || liste.entferntLaeuft || document.querySelector('.etk-dialog'))) return;
  const nummer = ++liste.ladenummer, aktuelleSitzung = sitzung;
  const vorher = JSON.stringify(liste.daten);
  liste.loading = !still; liste.versucht = true;
  try {
    const daten = pruefeAntwort(await fetchEinkauf(ENDPOINT));
    if (aktuelleSitzung !== sitzung || nummer !== liste.ladenummer) return;
    uebernehme(daten);
    if (fehlerLoeschen) liste.aktionsFehler = '';
  } catch (err) {
    if (aktuelleSitzung === sitzung && nummer === liste.ladenummer) liste.ladeFehler = err.message;
  } finally {
    if (aktuelleSitzung === sitzung && nummer === liste.ladenummer) {
      liste.loading = false;
      if (!still || liste.ladeFehler || vorher !== JSON.stringify(liste.daten)) neuZeichnen();
    }
  }
}
async function schreiben(auftrag) {
  if (istNurLesend()) { toast('Dieser Zugang darf die Druckliste nur ansehen.'); return null; }
  if (liste.busy) { toast('Bitte warten, bis die aktuelle Änderung bestätigt ist.'); return null; }
  const aktuelleSitzung = sitzung;
  liste.busy = true; liste.aktionsFehler = ''; ++liste.ladenummer;
  liste.loading = false; neuZeichnen();
  const signatur = JSON.stringify(auftrag), vorgangId = auftrag.vorgangId || schreibVersuche.get(signatur) || neueKennung();
  schreibVersuche.set(signatur, vorgangId);
  try {
    const daten = pruefeAntwort(await orgSchreiben(ENDPOINT, { ...auftrag, vorgangId }));
    if (aktuelleSitzung !== sitzung) return null;
    uebernehme(daten); schreibVersuche.delete(signatur);
    return daten;
  } catch (err) {
    if (aktuelleSitzung !== sitzung) return null;
    await laden({ waehrendSchreiben: true });
    if (aktuelleSitzung !== sitzung) return null;
    liste.aktionsFehler = `Die Änderung wurde nicht bestätigt: ${err.message} Bitte den aktuellen Stand prüfen und erneut auswählen.`;
    toast('Änderung nicht bestätigt – aktuellen Stand prüfen.');
    return null;
  } finally {
    if (aktuelleSitzung === sitzung) {
      liste.busy = false;
      if (liste.nachladen) { liste.nachladen = false; void laden(); }
      neuZeichnen();
    }
  }
}

/** Nur Referenzen senden: der Server baut die Angaben aus dem aktuellen Lexikon. */
export async function drucklisteVormerken({ handle, key, anzahl }) {
  const inhalt = JSON.stringify([handle, key, anzahl]);
  if (!letzterVormerkVersuch || letzterVormerkVersuch.inhalt !== inhalt) letzterVormerkVersuch = { inhalt, vorgangId: neueKennung() };
  const versuch = letzterVormerkVersuch;
  const daten = await schreiben({ aktion: 'vormerken', vorgangId: versuch.vorgangId, handle, key, anzahl });
  if (daten) {
    if (letzterVormerkVersuch === versuch) letzterVormerkVersuch = null;
    toast(`${anzahlText(anzahl)} zum Drucken vorgemerkt.`);
  }
  return Boolean(daten);
}
function offeneEintraege() { return (liste.daten?.eintraege || []).filter(e => e.status === 'offen'); }
function ausgewaehlt() { return offeneEintraege().filter(e => liste.auswahl.get(e.id) === e.revision); }
// Eine geleerte individuelle Auswahl darf niemals unbemerkt wieder alles enthalten.
function druckauswahl() { return liste.auswahlmodus === 'alle' ? offeneEintraege() : ausgewaehlt(); }
const laedt = () => liste.busy || liste.loading || liste.entferntLaeuft || Boolean(liste.ladeFehler);
const gesperrt = () => laedt() || istNurLesend();
function angaben(e) {
  const link = `#/lexikon?${new URLSearchParams({ handle: e.produktHandle })}`;
  const bestellung = e.quelle ? `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bq: e.quelle.orderName, bfilter: 'alle' })}` : '';
  return `<div class="md-was"><a href="${esc(link)}">${esc(e.produktTitel)}</a><strong>${esc(e.bezeichnung)}</strong>
    ${bestellung ? `<a class="small" href="${esc(bestellung)}">${esc(`Für Bestellung ${e.quelle.orderName} · nur intern`)}</a>` : ''}
    <span class="small muted">Vorgemerkt von ${esc(person(e.erstelltVon))} · ${esc(zeit(e.erstelltAm))}</span></div>`;
}
function offeneZeile(e) {
  const auswahl = liste.auswahlmodus === 'auswahl' && !istNurLesend();
  return `<li class="md-zeile md-offene-zeile${auswahl ? ' md-mit-auswahl' : ''}${auswahl && liste.auswahl.get(e.id) === e.revision ? ' md-gewaehlt' : ''}">
    ${auswahl ? `<label class="md-auswahl"><input type="checkbox" data-md-auswahl="${esc(e.id)}"${liste.auswahl.get(e.id) === e.revision ? ' checked' : ''}${gesperrt() ? ' disabled' : ''} aria-label="${esc(`${e.bezeichnung} zum Drucken auswählen`)}"><span class="visually-hidden">Auswählen</span></label>` : ''}
    ${angaben(e)}<span class="md-kopien">${esc(anzahlText(e.anzahl))}</span>
    ${istNurLesend() ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-md-entfernen="${esc(e.id)}"${gesperrt() ? ' disabled' : ''}>Entfernen</button>`}
  </li>`;
}
function auftraege() {
  const je = new Map();
  for (const e of liste.daten?.eintraege || []) {
    if (e.status !== 'in_druck' || !e.druckauftrag?.id) continue;
    const id = e.druckauftrag.id;
    if (!je.has(id)) je.set(id, []);
    je.get(id).push(e);
  }
  return je;
}
function auftragBlock(id, eintraege) {
  const a = eintraege[0].druckauftrag;
  const ansicht = auftragsAnsichten.get(id) || { offen: false, anzahl: SEITENGROESSE };
  return `<section class="card md-auftrag"><div class="card-head"><h2>${esc(anzahlText(menge(eintraege)))} – Druckauftrag noch offen</h2></div>
    <p class="small muted">Reserviert von ${esc(person(a.von))} · ${esc(zeit(a.am))}. Ausdruck prüfen und bestätigen oder nicht benötigte Muster entfernen.</p>
    <details${ansicht.offen ? ' open' : ''}><summary id="md-auftrag-details-${esc(id)}" data-focus-erhalten data-md-auftrag-details="${esc(id)}">Enthaltene ${esc(positionenText(eintraege.length))}</summary><ul class="md-liste">${eintraege.slice(0, ansicht.anzahl).map(e => `<li class="md-zeile${istNurLesend() ? '' : ' md-auftragszeile'}">${angaben(e)}<span class="md-kopien">${esc(anzahlText(e.anzahl))}</span>${istNurLesend() ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-md-auftrag-entfernen="${esc(id)}" data-md-eintrag="${esc(e.id)}" aria-label="${esc(`${e.bezeichnung} aus der Druckliste entfernen`)}"${gesperrt() ? ' disabled' : ''}>Entfernen…</button>`}</li>`).join('')}</ul>${eintraege.length > ansicht.anzahl ? `<button type="button" class="btn btn-sm btn-ghost" id="md-auftrag-mehr-${esc(id)}" data-focus-erhalten data-md-auftrag-mehr="${esc(id)}">Weitere Positionen anzeigen</button><p class="small muted">${Math.min(ansicht.anzahl, eintraege.length)} von ${esc(positionenText(eintraege.length))} angezeigt.</p>` : ''}</details>
    ${istNurLesend() ? '' : `<div class="md-aktionen">
      ${eigeneAuftraege.has(id) ? `<button type="button" class="btn" data-md-vorschau="${esc(id)}"${gesperrt() ? ' disabled' : ''}>Druckvorschau öffnen</button>` : '<p class="small muted">Auftrag aus einer früheren Sitzung oder von einem anderen Arbeitsplatz. Unter „Enthaltene Positionen“ einzelne Muster entfernen oder den gesamten Auftrag unten entfernen. Für einen neuen Drucklauf „Wieder freigeben“ wählen.</p>'}
      <button type="button" class="btn btn-primary" data-md-erledigen="${esc(id)}"${gesperrt() ? ' disabled' : ''}>Ausdruck geprüft – als gedruckt markieren</button>
      <button type="button" class="btn btn-ghost" data-md-freigeben="${esc(id)}"${gesperrt() ? ' disabled' : ''}>Wieder freigeben…</button>
      <button type="button" class="btn btn-ghost" data-md-auftrag-entfernen="${esc(id)}"${gesperrt() ? ' disabled' : ''}>Gesamten Auftrag entfernen…</button>
    </div>`}</section>`;
}
export function viewMusterDruckliste() {
  if (!liste.versucht && !liste.loading) void laden();
  const kopf = `<div class="page-head"><div><h1>Aufkleber-Druckliste</h1><p class="sub">Hier sammelst du Muster-Aufkleber, prüfst die Vorschau und druckst gemeinsam.</p></div></div>
    <div class="md-navigation"><a class="btn" href="#/lexikon">Weitere Muster vormerken</a><button type="button" class="btn" data-md-aktualisieren${liste.busy || liste.loading || liste.entferntLaeuft ? ' disabled' : ''}>Liste aktualisieren</button></div>`;
  if (!liste.daten) return kopf + (liste.ladeFehler ? `<p class="notice crit" role="alert">${esc(liste.ladeFehler)} Bitte erneut aktualisieren.</p>` : '<p class="empty" role="status">Lade gemeinsame Druckliste …</p>');
  const offen = offeneEintraege(), auswahl = druckauswahl(), anzahl = menge(auswahl);
  const zuGross = auswahl.length > DRUCK_LIMIT.positionen || anzahl > DRUCK_LIMIT.etiketten;
  const seiten = Math.max(1, Math.ceil(offen.length / SEITENGROESSE));
  liste.seite = Math.max(1, Math.min(seiten, liste.seite));
  const seite = offen.slice((liste.seite - 1) * SEITENGROESSE, liste.seite * SEITENGROESSE);
  const historie = liste.daten.eintraege.filter(e => ['gedruckt', 'entfernt'].includes(e.status)).sort((a, b) => String(b.gedrucktAm || b.entferntAm || b.geaendertAm).localeCompare(String(a.gedrucktAm || a.entferntAm || a.geaendertAm))).slice(0, 25);
  return `${kopf}
    ${liste.ladeFehler ? `<p class="notice crit" role="alert">${esc(liste.ladeFehler)} Der Stand kann veraltet sein. Bitte aktualisieren.</p>` : ''}
    ${liste.aktionsFehler ? `<p class="notice warn" role="alert">${esc(liste.aktionsFehler)}</p>` : ''}
    ${liste.loading ? '<p class="small muted" role="status">Aktualisiere Druckliste …</p>' : ''}
    ${istNurLesend() ? '<p class="small muted">Dieser Zugang kann die Druckliste ansehen. Änderungen übernimmt ein Mitarbeiter.</p>' : ''}
    <section class="card md-offen"><div class="card-head"><h2>Noch zu drucken</h2><span class="small muted">${esc(positionenText(offen.length))} · ${esc(anzahlText(menge(offen)))}</span></div>
      ${offen.length ? `${istNurLesend() ? '' : `<div class="md-druckstart"><p class="small${zuGross ? ' etk-fehlt' : ''}" role="status">${liste.auswahlmodus === 'alle' ? 'Alle offenen Muster sind für den nächsten Drucklauf vorgesehen.' : `${esc(positionenText(auswahl.length))} · ${esc(anzahlText(anzahl))} ausgewählt.`}${zuGross ? ` Pro Drucklauf höchstens ${DRUCK_LIMIT.positionen} Positionen und ${DRUCK_LIMIT.etiketten} Aufkleber. Über „Auswahl ändern“ eine kleinere Auswahl zusammenstellen.` : ''}</p><div class="md-druckaktionen"><button type="button" class="btn btn-ghost" data-md-auswahlmodus${gesperrt() ? ' disabled' : ''}>${liste.auswahlmodus === 'alle' ? 'Auswahl ändern' : 'Alle offenen verwenden'}</button><button type="button" class="btn btn-primary" data-md-reservieren${gesperrt() || !anzahl || zuGross ? ' disabled' : ''}>Druckvorschau öffnen</button></div></div>`}
        ${liste.auswahlmodus === 'auswahl' && !istNurLesend() ? `<div class="md-auswahl-aktionen"><button type="button" class="btn btn-sm" data-md-alle-auswaehlen${gesperrt() ? ' disabled' : ''}>Alle auswählen</button>${seiten > 1 ? `<button type="button" class="btn btn-sm btn-ghost" data-md-seite-auswaehlen${gesperrt() ? ' disabled' : ''}>Diese Seite auswählen</button>` : ''}<button type="button" class="btn btn-sm btn-ghost" data-md-auswahl-leeren${gesperrt() || !auswahl.length ? ' disabled' : ''}>Auswahl aufheben</button><button type="button" class="btn btn-sm btn-ghost" data-md-auswahl-entfernen${gesperrt() || !auswahl.length ? ' disabled' : ''}>Auswahl entfernen…</button></div>` : ''}
        <ul class="md-liste">${seite.map(offeneZeile).join('')}</ul>` : '<p class="small muted">Die offene Liste ist leer. Im Lexikon ein Muster suchen und „Zum Drucken vormerken“ wählen.</p>'}
      ${seiten > 1 ? `<div class="md-seiten"><button type="button" class="btn btn-sm" data-md-seite="${liste.seite - 1}"${liste.seite === 1 || laedt() ? ' disabled' : ''}>← Zurück</button><span class="small muted">Seite ${liste.seite} von ${seiten}</span><button type="button" class="btn btn-sm" data-md-seite="${liste.seite + 1}"${liste.seite === seiten || laedt() ? ' disabled' : ''}>Weiter →</button></div>` : ''}

    </section>
    ${[...auftraege()].map(([id, es]) => auftragBlock(id, es)).join('')}
    ${historie.length ? `<details class="md-historie"${liste.historieOffen ? ' open' : ''}><summary data-md-historie>Zuletzt gedruckt oder entfernt</summary><ul class="md-liste">${historie.map(e => `<li class="md-zeile">${angaben(e)}<span class="small muted">${esc(anzahlText(e.anzahl))} · ${e.status === 'gedruckt' ? `Gedruckt · ${esc(person(e.gedrucktVon))} · ${esc(zeit(e.gedrucktAm))}` : `Entfernt · ${esc(zeit(e.entferntAm))}`}</span></li>`).join('')}</ul></details>` : ''}`;
}
function vorschau(es) {
  if (!es.length || es.length > DRUCK_LIMIT.positionen || menge(es) > DRUCK_LIMIT.etiketten) { toast(`Bitte höchstens ${DRUCK_LIMIT.positionen} Positionen und ${DRUCK_LIMIT.etiketten} Aufkleber auswählen.`); return; }
  const etiketten = es.flatMap(e => Array.from({ length: e.anzahl }, () => e.etikett));
  const id = es[0].druckauftrag.id, erwartet = referenzen(es), aktuelleSitzung = sitzung;
  const pruefeSitzung = () => { if (aktuelleSitzung !== sitzung) throw new Error('Sitzung abgelaufen. Bitte neu anmelden.'); };
  void oeffneEtikettenDruck({ etiketten, titel: 'Druckvorschau', allowEditing: false,
    hinweis: 'Alle gezeigten Aufkleber werden nacheinander gedruckt. Anschließend den Papierausdruck hier bestätigen.',
    schonVersucht: versuchteAuftraege.has(id),
    druckVersucht: () => { pruefeSitzung(); versuchteAuftraege.add(id); },
    vorDruck: async () => {
      pruefeSitzung();
      const daten = pruefeAntwort(await fetchEinkauf(ENDPOINT));
      pruefeSitzung(); uebernehme(daten); neuZeichnen();
      const aktuell = auftraege().get(id);
      if (!aktuell || aktuell.length !== erwartet.length || erwartet.some(ref => !aktuell.some(e => e.id === ref.id && e.revision === ref.revision))) {
        throw new Error('Der Druckauftrag wurde inzwischen geändert oder freigegeben. Bitte schließen und die aktuelle Druckliste prüfen.');
      }
    },
    beiSchliessen: async ({ versucht }) => {
      pruefeSitzung();
      if (versucht || versuchteAuftraege.has(id)) return true;
      const daten = await schreiben({ aktion: 'freigeben', eintraege: erwartet, druckauftragId: id });
      pruefeSitzung();
      if (!daten) throw new Error('Die Freigabe wurde nicht bestätigt. Bitte die Verbindung prüfen und erneut schließen.');
      eigeneAuftraege.delete(id); neuZeichnen();
      return true;
    },
    beiBestaetigen: async () => {
      pruefeSitzung();
      const daten = await schreiben({ aktion: 'erledigen', eintraege: erwartet, druckauftragId: id });
      pruefeSitzung();
      if (!daten) throw new Error('Die Bestätigung wurde nicht gespeichert. Bitte erneut bestätigen.');
      eigeneAuftraege.delete(id); versuchteAuftraege.delete(id); neuZeichnen();
      toast('Geprüften Ausdruck als gedruckt markiert.');
      return true;
    },
  });
}
async function eigeneVorschau(id) {
  const bisher = auftraege().get(id);
  if (!eigeneAuftraege.has(id) || !bisher?.length) return;
  const erwartet = new Map(bisher.map(e => [e.id, e.revision]));
  await laden();
  if (liste.ladeFehler) { toast('Druckauftrag konnte nicht geprüft werden. Bitte aktualisieren.'); return; }
  const aktuell = auftraege().get(id);
  if (!aktuell || aktuell.length !== erwartet.size || aktuell.some(e => erwartet.get(e.id) !== e.revision)) {
    eigeneAuftraege.delete(id); liste.aktionsFehler = 'Dieser Auftrag wurde inzwischen geändert oder freigegeben. Bitte den aktuellen Stand prüfen und neu auswählen.'; neuZeichnen(); return;
  }
  if (sichtbar()) vorschau(aktuell);
}
async function reservieren() {
  const gewaehlt = druckauswahl(), anzahl = menge(gewaehlt);
  if (!anzahl || anzahl > DRUCK_LIMIT.etiketten || gewaehlt.length > DRUCK_LIMIT.positionen) { toast(`Bitte höchstens ${DRUCK_LIMIT.positionen} Positionen und ${DRUCK_LIMIT.etiketten} Aufkleber auswählen.`); return; }
  const ids = new Set(gewaehlt.map(e => e.id)), signatur = JSON.stringify(referenzen(gewaehlt));
  if (!letzterReservierVersuch || letzterReservierVersuch.signatur !== signatur) letzterReservierVersuch = { signatur, druckauftragId: neueKennung() };
  const druckauftragId = letzterReservierVersuch.druckauftragId;
  const daten = await schreiben({ aktion: 'reservieren', eintraege: referenzen(gewaehlt), druckauftragId });
  if (!daten) return;
  const reserviert = daten.eintraege.filter(e => ids.has(e.id) && e.status === 'in_druck' && e.druckauftrag?.id === druckauftragId);
  if (reserviert.length !== ids.size) { liste.aktionsFehler = 'Der Druckauftrag wurde nicht vollständig bestätigt. Bitte die Liste aktualisieren.'; neuZeichnen(); return; }
  letzterReservierVersuch = null; eigeneAuftraege.add(druckauftragId); neuZeichnen();
  if (sichtbar()) vorschau(reserviert);
}
async function entferneAuswahl() {
  const gewaehlt = ausgewaehlt();
  if (!gewaehlt.length || !window.confirm(`${positionenText(gewaehlt.length)} mit ${anzahlText(menge(gewaehlt))} aus der Druckliste entfernen?`)) return;
  liste.entferntLaeuft = true; let entfernt = 0;
  try {
    for (let i = 0; i < gewaehlt.length; i += DRUCK_LIMIT.positionen) {
      const teil = gewaehlt.slice(i, i + DRUCK_LIMIT.positionen);
      if (!await schreiben({ aktion: 'entfernen', eintraege: referenzen(teil) })) break;
      entfernt += teil.length;
    }
  } finally { liste.entferntLaeuft = false; neuZeichnen(); }
  if (entfernt) toast(`${positionenText(entfernt)} aus der Druckliste entfernt.`);
}
async function auftragAendern(aktion, id) {
  const es = auftraege().get(id);
  if (!es?.length) { toast('Dieser Auftrag hat sich geändert. Bitte aktualisieren.'); return; }
  if (aktion === 'freigeben' && !window.confirm('Ist schon ein Teil gedruckt? Bitte den bisherigen Ausdruck prüfen. Nach dem Freigeben kann ein erneuter Druck doppelte Aufkleber erzeugen. Auftrag wieder in die offene Liste legen?')) return;
  const daten = await schreiben({ aktion, eintraege: referenzen(es), druckauftragId: id });
  if (daten) { eigeneAuftraege.delete(id); versuchteAuftraege.delete(id); toast(aktion === 'erledigen' ? 'Geprüften Ausdruck als gedruckt markiert.' : 'Druckauftrag wieder freigegeben.'); }
}
async function auftragEntfernen(id, eintragId) {
  const es = auftraege().get(id);
  const entfernen = eintragId ? es?.filter(e => e.id === eintragId) : es;
  if (!entfernen?.length) { toast('Dieser Auftrag hat sich geändert. Bitte aktualisieren.'); return; }
  const rest = es.filter(e => !entfernen.some(ziel => ziel.id === e.id));
  const was = eintragId ? `${entfernen[0].produktTitel} · ${entfernen[0].bezeichnung} (${anzahlText(menge(entfernen))})` : `Den gesamten Auftrag mit ${positionenText(es.length)} und ${anzahlText(menge(es))}`;
  const danach = rest.length ? `Danach wieder unter „Noch zu drucken“: ${positionenText(rest.length)} mit ${anzahlText(menge(rest))}. Bereits gedruckte Aufkleber vorher prüfen, damit nichts doppelt gedruckt wird.` : 'Die Positionen bleiben im Verlauf als entfernt sichtbar.';
  if (!window.confirm(`${was} aus der Druckliste entfernen?\n\nFalls dieser Auftrag noch an einem anderen Arbeitsplatz gedruckt wird, den Druck dort zuerst beenden.\n\n${danach}`)) return;
  // Der alte Auftrag endet gemeinsam: kein veraltetes Vorschaufenster darf den Rest bestaetigen.
  const daten = await schreiben({ aktion: 'auftrag_entfernen', druckauftragId: id, eintraege: referenzen(es), entfernenIds: entfernen.map(e => e.id) });
  if (!daten) return;
  eigeneAuftraege.delete(id); versuchteAuftraege.delete(id); auftragsAnsichten.delete(id);
  toast(`${positionenText(entfernen.length)} aus der Druckliste entfernt.${rest.length ? ` ${positionenText(rest.length)} wieder unter „Noch zu drucken“.` : ''}`);
}
export function musterDrucklisteKlick(e) {
  const ziel = e.target.closest('[data-md-aktualisieren],[data-md-auswahlmodus],[data-md-auswahl],[data-md-alle-auswaehlen],[data-md-seite-auswaehlen],[data-md-auswahl-leeren],[data-md-auswahl-entfernen],[data-md-seite],[data-md-reservieren],[data-md-vorschau],[data-md-erledigen],[data-md-freigeben],[data-md-entfernen],[data-md-historie],[data-md-auftrag-details],[data-md-auftrag-mehr],[data-md-auftrag-entfernen]');
  if (!ziel) return false;
  if (ziel.disabled) return true;
  if (ziel.hasAttribute('data-md-historie')) { e.preventDefault(); liste.historieOffen = !liste.historieOffen; neuZeichnen(); return true; }
  if (ziel.hasAttribute('data-md-auftrag-details') || ziel.hasAttribute('data-md-auftrag-mehr')) {
    e.preventDefault();
    const id = ziel.dataset.mdAuftragDetails || ziel.dataset.mdAuftragMehr;
    const ansicht = auftragsAnsichten.get(id) || { offen: false, anzahl: SEITENGROESSE };
    auftragsAnsichten.set(id, ziel.hasAttribute('data-md-auftrag-mehr') ? { offen: true, anzahl: ansicht.anzahl + SEITENGROESSE } : { ...ansicht, offen: !ansicht.offen });
    neuZeichnen(); return true;
  }
  if (ziel.hasAttribute('data-md-aktualisieren')) { void laden({ fehlerLoeschen: true }); neuZeichnen(); return true; }
  if (ziel.hasAttribute('data-md-seite')) { if (!laedt()) { liste.seite = Number(ziel.dataset.mdSeite); neuZeichnen(); } return true; }
  if (gesperrt()) return true;
  if (ziel.hasAttribute('data-md-auswahlmodus')) {
    if (liste.auswahlmodus === 'alle') {
      liste.auswahlmodus = 'auswahl'; liste.auswahl = new Map(offeneEintraege().map(x => [x.id, x.revision]));
    } else { liste.auswahlmodus = 'alle'; liste.auswahl.clear(); }
    neuZeichnen();
  } else if (ziel.hasAttribute('data-md-auswahl')) {
    const x = offeneEintraege().find(x => x.id === ziel.dataset.mdAuswahl);
    if (x) { if (ziel.checked) liste.auswahl.set(x.id, x.revision); else liste.auswahl.delete(x.id); }
    neuZeichnen();
  } else if (ziel.hasAttribute('data-md-alle-auswaehlen')) { for (const x of offeneEintraege()) liste.auswahl.set(x.id, x.revision); neuZeichnen(); }
  else if (ziel.hasAttribute('data-md-seite-auswaehlen')) { for (const x of offeneEintraege().slice((liste.seite - 1) * SEITENGROESSE, liste.seite * SEITENGROESSE)) liste.auswahl.set(x.id, x.revision); neuZeichnen(); }
  else if (ziel.hasAttribute('data-md-auswahl-leeren')) { liste.auswahl.clear(); neuZeichnen(); }
  else if (ziel.hasAttribute('data-md-auswahl-entfernen')) void entferneAuswahl();
  else if (ziel.hasAttribute('data-md-reservieren')) void reservieren();
  else if (ziel.hasAttribute('data-md-vorschau')) void eigeneVorschau(ziel.dataset.mdVorschau);
  else if (ziel.hasAttribute('data-md-erledigen')) void auftragAendern('erledigen', ziel.dataset.mdErledigen);
  else if (ziel.hasAttribute('data-md-freigeben')) void auftragAendern('freigeben', ziel.dataset.mdFreigeben);
  else if (ziel.hasAttribute('data-md-auftrag-entfernen')) void auftragEntfernen(ziel.dataset.mdAuftragEntfernen, ziel.dataset.mdEintrag);
  else if (ziel.hasAttribute('data-md-entfernen')) {
    const x = offeneEintraege().find(x => x.id === ziel.dataset.mdEntfernen);
    if (x) void schreiben({ aktion: 'entfernen', eintraege: referenzen([x]) });
  }
  return true;
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const [route, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    if (route === 'lexikon' && new URLSearchParams(query).get('tab') === 'druckliste') void laden();
  });
  window.addEventListener('focus', () => { if (sichtbar()) void laden({ still: true }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && sichtbar()) void laden({ still: true }); });
  window.setInterval(() => { if (!document.hidden && sichtbar()) void laden({ still: true }); }, 30_000);
  window.addEventListener('tp-sitzung-beendet', () => {
    sitzung++; ++liste.ladenummer; liste.daten = null; liste.loading = false; liste.versucht = false;
    liste.busy = false; liste.entferntLaeuft = false; liste.ladeFehler = ''; liste.aktionsFehler = '';
    liste.auswahl.clear(); liste.auswahlmodus = 'alle'; eigeneAuftraege.clear(); versuchteAuftraege.clear(); schreibVersuche.clear(); auftragsAnsichten.clear(); letzterVormerkVersuch = null; letzterReservierVersuch = null;
    const main = document.querySelector('#main');
    if (main?.querySelector('[data-md-aktualisieren]')) main.innerHTML = '<p class="notice warn">Sitzung abgelaufen. Bitte <a href="/login">neu anmelden</a>.</p>';
  });
}
