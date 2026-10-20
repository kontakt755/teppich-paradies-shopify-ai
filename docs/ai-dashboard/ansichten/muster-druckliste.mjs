/** Gemeinsame Druckliste: bewusst vormerken, einen Auftrag reservieren, Papier danach pruefen. */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, toast } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { oeffneEtikettenDruck } from '../bausteine/etiketten-druck.mjs';

const ENDPOINT = '/api/lexikon/druckliste';
const SEITENGROESSE = 25;
const liste = {
  daten: null, loading: false, versucht: false, busy: false, ladenummer: 0,
  ladeFehler: '', aktionsFehler: '', auswahl: new Map(), seite: 1, nachladen: false,
};
let letzterVormerkVersuch = null;
let letzterReservierVersuch = null;
const schreibVersuche = new Map();
const eigeneAuftraege = new Set();

const sichtbar = () => state.route.view === 'lexikon' && state.route.params.get('tab') === 'druckliste';
const neuZeichnen = () => { if (sichtbar()) render(); };
const person = wert => typeof wert === 'string' ? wert : wert?.name || wert?.kuerzel || 'nicht hinterlegt';
const zeit = wert => wert ? fmtDateTime(wert) : 'nicht hinterlegt';
const anzahlText = n => `${n} Aufkleber`;
const referenzen = eintraege => eintraege.map(e => ({ id: e.id, revision: e.revision }));

function pruefeAntwort(daten) {
  if (!daten || daten.fehler || daten.schema !== 1 || !Array.isArray(daten.eintraege)) {
    throw new Error(daten?.hinweis || 'Die gemeinsame Druckliste konnte nicht geladen werden.');
  }
  return daten;
}

function uebernehme(daten) {
  liste.daten = pruefeAntwort(daten);
  const offen = new Map(daten.eintraege.filter(e => e.status === 'offen').map(e => [e.id, e]));
  // Eine fremde Aenderung muss vor einer neuen Reservierung erneut ausgewaehlt werden.
  for (const [id, revision] of liste.auswahl) {
    if (offen.get(id)?.revision !== revision) liste.auswahl.delete(id);
  }
  liste.ladeFehler = '';
}

async function laden({ waehrendSchreiben = false } = {}) {
  if (liste.busy && !waehrendSchreiben) { liste.nachladen = true; return; }
  const nummer = ++liste.ladenummer;
  liste.loading = true; liste.versucht = true;
  try {
    const daten = pruefeAntwort(await fetchEinkauf(ENDPOINT));
    if (nummer === liste.ladenummer) uebernehme(daten);
  } catch (err) {
    if (nummer === liste.ladenummer) liste.ladeFehler = err.message;
  } finally {
    if (nummer === liste.ladenummer) { liste.loading = false; neuZeichnen(); }
  }
}

async function schreiben(auftrag) {
  if (istNurLesend()) { toast('Dieser Zugang darf die Druckliste nur ansehen.'); return null; }
  if (liste.busy) { toast('Bitte warten, bis die aktuelle Änderung bestätigt ist.'); return null; }
  liste.busy = true; liste.aktionsFehler = ''; ++liste.ladenummer;
  liste.loading = false; neuZeichnen();
  const signatur = JSON.stringify(auftrag);
  const vorgangId = auftrag.vorgangId || schreibVersuche.get(signatur) || crypto.randomUUID();
  schreibVersuche.set(signatur, vorgangId);
  try {
    const daten = pruefeAntwort(await orgSchreiben(ENDPOINT, { ...auftrag, vorgangId }));
    uebernehme(daten);
    schreibVersuche.delete(signatur);
    return daten;
  } catch (err) {
    await laden({ waehrendSchreiben: true });
    liste.aktionsFehler = `Die Änderung wurde nicht bestätigt: ${err.message} Bitte den aktuellen Stand prüfen und erneut auswählen.`;
    toast('Änderung nicht bestätigt – aktuellen Stand in der Druckliste prüfen.');
    return null;
  } finally {
    liste.busy = false;
    if (liste.nachladen) { liste.nachladen = false; void laden(); }
    neuZeichnen();
  }
}

/** Nur Referenzen senden: der Server baut die Angaben aus dem aktuellen Lexikon. */
export async function drucklisteVormerken({ handle, key, anzahl }) {
  const inhalt = JSON.stringify([handle, key, anzahl]);
  if (!letzterVormerkVersuch || letzterVormerkVersuch.inhalt !== inhalt) {
    letzterVormerkVersuch = { inhalt, vorgangId: crypto.randomUUID() };
  }
  // Nach einer unklaren Netzantwort ist derselbe Versuch idempotent wiederholbar.
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
const gesperrt = () => liste.busy || liste.loading || Boolean(liste.ladeFehler) || istNurLesend();

function angaben(e) {
  const link = `#/lexikon?${new URLSearchParams({ handle: e.produktHandle })}`;
  const bestellung = e.quelle ? `#/kunden?${new URLSearchParams({ tab: 'bestellungen', bq: e.quelle.orderName, bfilter: 'alle' })}` : '';
  return `<div class="md-was"><a href="${esc(link)}">${esc(e.produktTitel)}</a>
    <strong>${esc(e.bezeichnung)}</strong>
    ${bestellung ? `<a class="small" href="${esc(bestellung)}">${esc(`Für Bestellung ${e.quelle.orderName} · nur intern`)}</a>` : ''}
    <span class="small muted">${esc(anzahlText(e.anzahl))} · vorgemerkt von ${esc(person(e.erstelltVon))} · ${esc(zeit(e.erstelltAm))}</span></div>`;
}

function offeneZeile(e) {
  return `<li class="md-zeile md-mit-auswahl">
    <label class="md-auswahl"><input type="checkbox" data-md-auswahl="${esc(e.id)}"${liste.auswahl.get(e.id) === e.revision ? ' checked' : ''}${gesperrt() ? ' disabled' : ''} aria-label="${esc(`${e.bezeichnung} zum Drucken auswählen`)}"><span class="visually-hidden">Auswählen</span></label>
    ${angaben(e)}
    ${istNurLesend() ? '' : `<button type="button" class="btn btn-sm" data-md-entfernen="${esc(e.id)}"${gesperrt() ? ' disabled' : ''}>Entfernen</button>`}
  </li>`;
}

function auftraege() {
  const je = new Map();
  for (const e of liste.daten?.eintraege || []) {
    if (e.status !== 'in_druck') continue;
    const id = e.druckauftrag?.id;
    if (!id) continue;
    if (!je.has(id)) je.set(id, []);
    je.get(id).push(e);
  }
  return je;
}

function auftragBlock(id, eintraege) {
  const a = eintraege[0].druckauftrag;
  return `<section class="card md-auftrag">
    <div class="card-head"><h2>Für den Druck reserviert</h2></div>
    <p class="small muted">Von ${esc(person(a.von))} · ${esc(zeit(a.am))}. Diese Einträge bleiben reserviert, bis der Ausdruck geprüft oder der Auftrag bewusst freigegeben wurde.</p>
    <ul class="md-liste">${eintraege.map(e => `<li class="md-zeile">${angaben(e)}</li>`).join('')}</ul>
    ${istNurLesend() ? '' : `<div class="md-aktionen">
      ${eigeneAuftraege.has(id) ? `<button type="button" class="btn" data-md-vorschau="${esc(id)}"${gesperrt() ? ' disabled' : ''}>Druckvorschau öffnen</button>` : '<p class="small muted">Dieser Auftrag wird an einem anderen Arbeitsplatz oder in einer früheren Sitzung gedruckt. Vor einem erneuten Druck den bisherigen Ausdruck prüfen und den Auftrag bewusst freigeben.</p>'}
      <button type="button" class="btn btn-primary" data-md-erledigen="${esc(id)}"${gesperrt() ? ' disabled' : ''}>Ausdruck geprüft – als gedruckt markieren</button>
      <button type="button" class="btn btn-ghost" data-md-freigeben="${esc(id)}"${gesperrt() ? ' disabled' : ''}>Wieder freigeben…</button>
    </div>`}
  </section>`;
}

export function viewMusterDruckliste() {
  if (!liste.versucht && !liste.loading) void laden();
  const kopf = `<div class="page-head"><div><h1>Gemeinsame Druckliste</h1><p class="sub">Im Lexikon vormerken, am Drucker gemeinsam abarbeiten. Alle Arbeitsplätze sehen denselben Stand.</p></div></div>
    <div class="md-navigation"><a class="btn" href="#/lexikon">Produkt suchen</a><button type="button" class="btn" data-md-aktualisieren${liste.busy || liste.loading ? ' disabled' : ''}>Liste aktualisieren</button></div>`;
  if (!liste.daten) return kopf + (liste.ladeFehler
    ? `<p class="notice crit" role="alert">${esc(liste.ladeFehler)} Bitte die Liste erneut aktualisieren.</p>`
    : '<p class="empty" role="status">Lade gemeinsame Druckliste …</p>');
  const offen = offeneEintraege();
  const ausgewaehlte = ausgewaehlt();
  const anzahl = ausgewaehlte.reduce((summe, e) => summe + e.anzahl, 0);
  const seiten = Math.max(1, Math.ceil(offen.length / SEITENGROESSE));
  liste.seite = Math.max(1, Math.min(seiten, liste.seite));
  const seite = offen.slice((liste.seite - 1) * SEITENGROESSE, liste.seite * SEITENGROESSE);
  const historie = liste.daten.eintraege.filter(e => ['gedruckt', 'entfernt'].includes(e.status)).slice(-25).reverse();
  return `${kopf}
    ${liste.ladeFehler ? `<p class="notice crit" role="alert">${esc(liste.ladeFehler)} Der angezeigte Stand kann veraltet sein. Bitte aktualisieren.</p>` : ''}
    ${liste.aktionsFehler ? `<p class="notice warn" role="alert">${esc(liste.aktionsFehler)}</p>` : ''}
    ${liste.loading ? '<p class="small muted" role="status">Aktualisiere Druckliste …</p>' : ''}
    ${istNurLesend() ? '<p class="small muted">Dieser Zugang kann die gemeinsame Druckliste ansehen. Änderungen übernimmt ein Mitarbeiter.</p>' : ''}
    <section class="card md-offen"><div class="card-head"><h2>Noch zu drucken</h2></div>
      ${offen.length ? `${istNurLesend() ? '' : `<div class="md-auswahl-aktionen"><button type="button" class="btn btn-sm" data-md-seite-auswaehlen${gesperrt() ? ' disabled' : ''}>Diese Seite auswählen</button><button type="button" class="btn btn-sm" data-md-auswahl-leeren${gesperrt() ? ' disabled' : ''}>Auswahl aufheben</button></div>`}
        <ul class="md-liste">${seite.map(offeneZeile).join('')}</ul>`
        : '<p class="small muted">Keine offenen Einträge. Im Lexikon ein Muster suchen und „Zum Drucken vormerken“ wählen.</p>'}
      ${seiten > 1 ? `<div class="md-seiten"><button type="button" class="btn btn-sm" data-md-seite="${liste.seite - 1}"${liste.seite === 1 ? ' disabled' : ''}>← Zurück</button><span class="small muted">Seite ${liste.seite} von ${seiten}</span><button type="button" class="btn btn-sm" data-md-seite="${liste.seite + 1}"${liste.seite === seiten ? ' disabled' : ''}>Weiter →</button></div>` : ''}
      ${istNurLesend() ? '' : `<div class="md-druckstart"><p class="small${anzahl > 100 ? ' etk-fehlt' : ' muted'}">${anzahl ? `${anzahlText(anzahl)} ausgewählt.` : 'Die gewünschten Einträge auswählen.'}${anzahl > 100 ? ' Pro Druckauftrag sind höchstens 100 Aufkleber möglich. Auswahl verkleinern.' : ''}</p><button type="button" class="btn btn-primary" data-md-reservieren${gesperrt() || !anzahl || anzahl > 100 ? ' disabled' : ''}>Auswahl zum Drucken öffnen</button></div>`}
    </section>
    ${[...auftraege()].map(([id, eintraege]) => auftragBlock(id, eintraege)).join('')}
    ${historie.length ? `<details class="md-historie"><summary>Zuletzt gedruckt oder entfernt (bis zu 25 Einträge)</summary><ul class="md-liste">${historie.map(e => `<li class="md-zeile">${angaben(e)}<span class="small muted">${e.status === 'gedruckt' ? `Gedruckt · ${esc(person(e.gedrucktVon))} · ${esc(zeit(e.gedrucktAm))}` : 'Entfernt'}</span></li>`).join('')}</ul></details>` : ''}`;
}

function vorschau(eintraege) {
  const etiketten = eintraege.flatMap(e => Array.from({ length: e.anzahl }, () => e.etikett));
  if (!etiketten.length || etiketten.length > 100) { toast('Bitte einen Druckauftrag mit 1 bis 100 Aufklebern wählen.'); return; }
  void oeffneEtikettenDruck({ etiketten, titel: 'Gemeinsame Druckliste – Druckvorschau', allowEditing: false,
    hinweis: 'Die Einträge bleiben reserviert. Danach den Ausdruck auf Papier prüfen, diese Vorschau schließen und „Ausdruck geprüft – als gedruckt markieren“ wählen. Ein geschlossener Dialog bestätigt keinen Druck.' });
}

async function eigeneVorschau(id) {
  const bisher = auftraege().get(id);
  if (!eigeneAuftraege.has(id) || !bisher?.length) return;
  const erwartet = new Map(bisher.map(e => [e.id, e.revision]));
  await laden();
  if (liste.ladeFehler) { toast('Druckauftrag konnte nicht geprüft werden. Bitte aktualisieren.'); return; }
  const aktuell = auftraege().get(id);
  if (!aktuell || aktuell.length !== erwartet.size || aktuell.some(e => erwartet.get(e.id) !== e.revision)) {
    eigeneAuftraege.delete(id);
    liste.aktionsFehler = 'Dieser Druckauftrag wurde inzwischen geändert oder freigegeben. Bitte den aktuellen Stand prüfen und neu auswählen.';
    neuZeichnen();
    return;
  }
  if (sichtbar()) vorschau(aktuell);
}

async function reservieren() {
  const gewaehlt = ausgewaehlt();
  const anzahl = gewaehlt.reduce((summe, e) => summe + e.anzahl, 0);
  if (!anzahl || anzahl > 100) { toast('Bitte 1 bis 100 Aufkleber auswählen.'); return; }
  const ids = new Set(gewaehlt.map(e => e.id));
  const signatur = JSON.stringify(referenzen(gewaehlt));
  if (!letzterReservierVersuch || letzterReservierVersuch.signatur !== signatur) {
    letzterReservierVersuch = { signatur, druckauftragId: crypto.randomUUID() };
  }
  const druckauftragId = letzterReservierVersuch.druckauftragId;
  const daten = await schreiben({ aktion: 'reservieren', eintraege: referenzen(gewaehlt), druckauftragId });
  if (!daten) return;
  const reserviert = daten.eintraege.filter(e => ids.has(e.id) && e.status === 'in_druck' && e.druckauftrag?.id === druckauftragId);
  if (reserviert.length !== ids.size) { liste.aktionsFehler = 'Der Druckauftrag wurde nicht vollständig bestätigt. Bitte die Druckliste aktualisieren.'; neuZeichnen(); return; }
  letzterReservierVersuch = null;
  eigeneAuftraege.add(druckauftragId);
  neuZeichnen();
  // Die Serverantwort ist der unveraenderliche Inhalt dieses Auftrags; neue Vormerkungen bleiben offen.
  if (sichtbar()) vorschau(reserviert);
}

async function auftragAendern(aktion, id) {
  const eintraege = auftraege().get(id);
  if (!eintraege?.length) { toast('Dieser Druckauftrag hat sich geändert. Bitte aktualisieren.'); return; }
  if (aktion === 'freigeben' && !window.confirm('Vor dem Freigeben prüfen: Ist der Auftrag bereits ganz oder teilweise gedruckt? Bereits gedruckte Aufkleber können beim erneuten Druck doppelt entstehen. Nur freigeben, wenn der Auftrag wieder offen sein soll.')) return;
  const daten = await schreiben({ aktion, eintraege: referenzen(eintraege), druckauftragId: id });
  if (daten) { eigeneAuftraege.delete(id); toast(aktion === 'erledigen' ? 'Geprüfter Ausdruck als gedruckt markiert.' : 'Druckauftrag wieder freigegeben.'); }
}

/** Die bestehende Lexikon-Klickdelegation ruft diese Funktion auf. */
export function musterDrucklisteKlick(e) {
  const ziel = e.target.closest('[data-md-aktualisieren],[data-md-auswahl],[data-md-seite-auswaehlen],[data-md-auswahl-leeren],[data-md-seite],[data-md-reservieren],[data-md-vorschau],[data-md-erledigen],[data-md-freigeben],[data-md-entfernen]');
  if (!ziel) return false;
  if (ziel.disabled) return true;
  if (ziel.hasAttribute('data-md-aktualisieren')) { void laden(); neuZeichnen(); return true; }
  if (ziel.hasAttribute('data-md-seite')) { liste.seite = Number(ziel.dataset.mdSeite); neuZeichnen(); return true; }
  if (gesperrt()) return true;
  if (ziel.hasAttribute('data-md-auswahl')) {
    const eintrag = offeneEintraege().find(x => x.id === ziel.dataset.mdAuswahl);
    if (eintrag) { if (ziel.checked) liste.auswahl.set(eintrag.id, eintrag.revision); else liste.auswahl.delete(eintrag.id); }
    neuZeichnen();
  } else if (ziel.hasAttribute('data-md-seite-auswaehlen')) {
    for (const x of offeneEintraege().slice((liste.seite - 1) * SEITENGROESSE, liste.seite * SEITENGROESSE)) liste.auswahl.set(x.id, x.revision);
    neuZeichnen();
  } else if (ziel.hasAttribute('data-md-auswahl-leeren')) { liste.auswahl.clear(); neuZeichnen(); }
  else if (ziel.hasAttribute('data-md-reservieren')) void reservieren();
  else if (ziel.hasAttribute('data-md-vorschau')) {
    void eigeneVorschau(ziel.dataset.mdVorschau);
  } else if (ziel.hasAttribute('data-md-erledigen')) void auftragAendern('erledigen', ziel.dataset.mdErledigen);
  else if (ziel.hasAttribute('data-md-freigeben')) void auftragAendern('freigeben', ziel.dataset.mdFreigeben);
  else if (ziel.hasAttribute('data-md-entfernen')) {
    const eintrag = offeneEintraege().find(x => x.id === ziel.dataset.mdEntfernen);
    if (eintrag) void schreiben({ aktion: 'entfernen', eintraege: referenzen([eintrag]) });
  }
  return true;
}

// Beim Zurueckkehren erneut lesen, auch wenn die identische Hash-Adresse schon einmal offen war.
// Ein Rendern oder Auswaehlen allein schreibt nie in die gemeinsame Ablage.
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => {
  const [route, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  if (route === 'lexikon' && new URLSearchParams(query).get('tab') === 'druckliste') void laden();
});
