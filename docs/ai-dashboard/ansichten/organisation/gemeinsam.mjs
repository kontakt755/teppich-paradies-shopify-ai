/**
 * Aufgaben & Organisation: Zwischenspeicher, Bezeichnungen, Laden und die Listenzeile.
 *
 * Der Betriebsalltag - Laden, Lager, Baustelle, Kunden, Lieferanten. Die Ansicht
 * "Entwicklung" fuehrt weiterhin die Entwicklungsarbeit als GitHub Issues; das hier ist
 * bewusst getrennt, weil diese Eintraege personenbezogen sind und nie ins Repository
 * gehoeren.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';

export const org = {
  liste: null, loading: false, key: null, listeFehler: null, listeAm: 0, listeAbruf: 0,
  detail: null, detailId: null, loadingDetail: false, detailFehler: null, detailAbruf: 0,
  kennzahlen: null, loadingKennzahlen: false,
  entwurf: null,          // Schnellerfassung: Vorschlag + moegliche Doppelgaenger
};

export const ORG_BEREICHE = [
  ['meine-aufgaben', 'Meine Aufgaben'],
  ['meine-notizen', 'Meine Notizen'],
  ['team-aufgaben', 'Team-Aufgaben'],
  ['team-notizen', 'Team-Notizen'],
  ['archiv', 'Archiv'],
];
export const ORG_ANSICHTEN = [
  ['offen', 'Alles Offene'], ['fokus', 'Wichtig'], ['heute', 'Heute'], ['dringend', 'Dringend'],
  ['woche', 'Diese Woche'], ['spaeter', 'Später'], ['warten', 'Warten auf'], ['pruefung', 'In Prüfung'],
  ['ueberfaellig', 'Überfällig'], ['erledigt', 'Erledigt'],
];
// Am Handy nahmen elf Chips den halben Bildschirm ein, bevor die erste
// Aufgabe kam. Vier reichen fuer den Alltag, der Rest steht einen Klick weiter.
export const ORG_ANSICHTEN_HAUPT = ['offen', 'fokus', 'woche', 'erledigt'];
export const ORG_DRINGLICHKEIT = [
  ['ueberfaellig', 'Überfällig', 'Frist bereits verstrichen'],
  ['jetzt', 'Jetzt wichtig', 'Dringend oder heute fällig'],
  ['demnaechst', 'Als Nächstes', 'Hohe Priorität oder diese Woche fällig'],
  ['weitere', 'Weitere offene Aufgaben', 'Ohne unmittelbare Frist'],
  ['wartet', 'Wartet auf andere', 'Im Moment nicht selbst abschließbar'],
  ['zurueckgestellt', 'Zurückgestellt', 'Für später vorgemerkt'],
  ['erledigt', 'Erledigt', 'Bereits abgeschlossen'],
];

/**
 * Gruppen nach Art der Arbeit. Die Liste kommt vom Server mit (ARBEITSGRUPPEN
 * in operations/lib/organisation.mjs) - hier stehen nur die Schluessel, damit
 * ein Wert aus der Adresszeile geprueft werden kann, bevor Daten da sind.
 */
const ORG_GRUPPEN_KEYS = ['kunden', 'geld', 'fragen', 'shop', 'werbung', 'betrieb', 'technik', 'alles'];
export const ORG_STATUS_LABEL = {
  INBOX: 'Eingang', PLANNED: 'Geplant', IN_PROGRESS: 'In Arbeit', REVIEW: 'Prüfung',
  WAITING: 'Warten auf', DEFERRED: 'Zurückgestellt', DONE: 'Erledigt',
};
/**
 * Dringlichkeit in Worten, die etwas heissen. "dringend/hoch/normal/niedrig"
 * klang nach einer Skala, also stand am Ende alles auf "normal" (40 von 45) -
 * und die Stufe sagte nichts mehr. Jetzt benennt sie den Grund:
 *
 *   URGENT  Kostet Geld, wenn es liegen bleibt (Mahnung, unversandte Ware,
 *           nicht abgerechnete Arbeit)
 *   HIGH    Hat ein Datum (Aktion endet, Frist laeuft)
 *   NORMAL  Kann warten
 *
 * LOW bleibt lesbar, weil es in alten Eintraegen steht, wird aber nicht mehr
 * zur Auswahl angeboten - vier Stufen waren genau das Problem.
 */
export const ORG_PRIO_LABEL = { URGENT: 'kostet Geld', HIGH: 'hat ein Datum', NORMAL: 'kann warten', LOW: 'kann warten' };
export const ORG_PRIO_WAHL = { URGENT: 'Kostet Geld, wenn es liegen bleibt', HIGH: 'Hat ein Datum', NORMAL: 'Kann warten' };
export const ORG_WIEDERHOLUNG_LABEL = {
  '': 'einmalig', taeglich: 'täglich', woechentlich: 'wöchentlich', zweiwoechentlich: 'alle zwei Wochen',
  vierwoechentlich: 'alle vier Wochen', monatlich: 'monatlich', vierteljaehrlich: 'vierteljährlich', jaehrlich: 'jährlich',
};
export const ORG_PRUEF_LABEL = {
  AUTO: 'automatisch prüfbar', SEMI_AUTO: 'automatisch prüfbar, Mensch bestätigt',
  MANUAL: 'nur von Hand', EXTERNAL: 'hängt an jemandem von außen',
};

export function orgParams() {
  const p = state.route.params;
  const bereich = ORG_BEREICHE.map(b => b[0]).includes(p.get('ob')) ? p.get('ob') : 'meine-aufgaben';
  // Standard ist alles Offene - eine Aufgabe, die keiner sieht, wird nicht erledigt.
  const oa = p.get('oa');
  const ansicht = (oa === 'alle' || ORG_ANSICHTEN.map(a => a[0]).includes(oa)) ? oa : 'offen';
  const og = p.get('og');
  // Standard ist 'alles': eine Aufgabe, die keiner sieht, wird nicht erledigt.
  const gruppe = ORG_GRUPPEN_KEYS.includes(og) ? og : 'alles';
  const prioritaet = ['URGENT', 'HIGH', 'REST'].includes(p.get('opf')) ? p.get('opf') : '';
  return { bereich, ansicht, gruppe, prioritaet, person: p.get('op') || '', q: p.get('oq') || '', id: p.get('oid') || '' };
}

export function orgEintragOeffnen(id) {
  const p = new URLSearchParams(state.route.params);
  p.set('oid', id);
  location.hash = `#/organisation?${p}`;
}

const ORG_REFRESH_MS = 30_000;
const lesefehler = d => ({ ...d, fehler: true, hinweis: d?.hinweis || 'Die Aufgaben konnten gerade nicht gelesen werden. Bitte erneut laden.' });

function orgListenKey({ bereich, ansicht, gruppe, prioritaet, person, q }) {
  return `${bereich}|${ansicht}|${gruppe}|${prioritaet}|${person}|${q}`;
}

/** Nach einem Listenabruf niemals inzwischen geoeffnete Formulare oder Eingaben neu zeichnen. */
function darfOrgListeZeichnen(key) {
  const aktuell = orgParams();
  if (state.route.view !== 'organisation' || aktuell.id || orgListenKey(aktuell) !== key) return false;
  if (typeof document === 'undefined') return true;
  const aktiv = document.activeElement;
  if (aktiv && aktiv !== document.body && aktiv.matches?.('input, textarea, select, [contenteditable="true"]')) return false;
  if (document.querySelector('#dialogRoot > *, #paletteRoot > *, dialog[open]')) return false;
  return ![...document.querySelectorAll('#main input, #main textarea, #main select')].some(el => {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
    if (el.tagName === 'SELECT') return [...el.options].some(o => o.selected !== o.defaultSelected);
    if (el.type === 'hidden' || el.type === 'search') return false;
    return el.value !== el.defaultValue;
  });
}

/** Erneuert hoechstens alle 30 Sekunden; Fehler behalten dieselbe gueltige Liste und bremsen Retries. */
export function ensureOrgListe({ erzwingen = false } = {}) {
  const { bereich, ansicht, gruppe, prioritaet, person, q } = orgParams();
  const key = orgListenKey({ bereich, ansicht, gruppe, prioritaet, person, q });
  if (org.key === key && (org.loading || (!erzwingen && Date.now() - org.listeAm < ORG_REFRESH_MS))) return;
  if (org.key !== key) { org.liste = null; org.listeFehler = null; }
  org.key = key; org.loading = true; org.listeAm = Date.now();
  const abruf = ++org.listeAbruf;
  return fetchEinkauf(`/api/org/liste?${new URLSearchParams({ bereich, ansicht, gruppe, prioritaet, person, q })}`)
    .catch(e => lesefehler({ hinweis: e.message }))
    .then(d => {
      if (org.key !== key || org.listeAbruf !== abruf) return;
      org.loading = false; org.listeAm = Date.now();
      if (d?.verfuegbar && Array.isArray(d.eintraege)) { org.liste = d; org.listeFehler = null; }
      else org.listeFehler = lesefehler(d);
      if (darfOrgListeZeichnen(key)) render();
    });
}

/** Hook fuer den bestehenden stillen Abgleich; Detailformulare werden nicht ueberschrieben. */
export function ensureOrgDaten() {
  if (state.route.view === 'organisation' && !orgParams().id) return ensureOrgListe();
}

export function ensureOrgDetail(id, { erzwingen = false } = {}) {
  if (org.detailId === id && (org.loadingDetail || (!erzwingen && (org.detail || org.detailFehler)))) return;
  if (org.detailId !== id) { org.detail = null; org.detailFehler = null; }
  org.detailId = id; org.loadingDetail = true;
  const abruf = ++org.detailAbruf;
  return fetchEinkauf(`/api/org/eintrag?${new URLSearchParams({ id })}`)
    .catch(e => lesefehler({ hinweis: e.message }))
    .then(d => {
      if (org.detailId !== id || org.detailAbruf !== abruf) return;
      org.loadingDetail = false;
      if (d?.fehler || !d) org.detailFehler = lesefehler(d);
      else { org.detail = d; org.detailFehler = null; }
      if (state.route.view === 'organisation') render();
    });
}

export function orgFrisch() {
  org.liste = null; org.key = null; org.listeFehler = null; org.listeAm = 0;
  org.loading = false; org.listeAbruf++;
  org.kennzahlen = null; org.detail = null; org.detailId = null; org.detailFehler = null;
  org.loadingDetail = false; org.detailAbruf++;
}

// -- Zeilen und Karten ------------------------------------------------------

function orgFaelligText(e) {
  if (!e.faellig) return '';
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const ziel = new Date(`${e.faellig}T00:00:00`);
  const tage = Math.round((ziel - heute) / 86400000);
  if (tage < 0) return `<span class="warnc">${Math.abs(tage)} ${Math.abs(tage) === 1 ? 'Tag' : 'Tage'} überfällig</span>`;
  if (tage === 0) return '<b>heute fällig</b>';
  if (tage === 1) return 'morgen fällig';
  return `fällig ${fmtDate(e.faellig)}`;
}

/**
 * Eine Zeile. Badges nur dort, wo sie etwas Neues sagen: in "Meine Notizen"
 * ist "Notiz" und "privat" selbstverstaendlich und damit Rauschen.
 */
export function orgZeile(e, { bereich = '' } = {}) {
  // Der Server liefert je Eintrag mit, ob man ihn aendern darf. Ohne das
  // standen Knoepfe da, die in einer Fehlermeldung endeten.
  const darf = e.darfAendern !== false && !istNurLesend();
  const prioKlasse = e.prioritaet === 'URGENT' ? 'crit' : e.prioritaet === 'HIGH' ? 'gap' : 'plain';
  const merkmale = [
    e.verknuepft?.art === 'kunde' && e.verknuepft.id
      ? `<a href="#/kunden?kunde=${encodeURIComponent(e.verknuepft.id)}" onclick="event.stopPropagation()">${esc(e.verknuepft.titel || 'Kunde')}</a>`
      : '',
    e.bereich ? esc(e.bereich) : '',
    e.verantwortlich ? `für ${esc(e.verantwortlich)}` : (e.typ === 'TASK' ? '<span class="muted">unzugewiesen</span>' : ''),
    orgFaelligText(e),
    e.wartetAuf ? `wartet auf ${esc(e.wartetAuf)}` : '',
  ].filter(Boolean);
  const inNotizAnsicht = bereich === 'meine-notizen' || bereich === 'team-notizen';
  // Die Aktionen haengen am document-Klickhandler. Inline stopPropagation wuerde
  // Abhaken, Uebernehmen und Umwandeln vor diesem Handler abschneiden.
  return `<div class="row org-zeile${e.status === 'DONE' ? ' fertig' : ''}" data-org-open="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(e.titel)}">
    <div>
      <div class="t">${esc(e.titel)}
        ${e.prioritaet !== 'NORMAL' && e.typ === 'TASK' ? `<span class="badge ${prioKlasse}">${esc(ORG_PRIO_LABEL[e.prioritaet])}</span>` : ''}
        ${e.typ === 'NOTE' && !inNotizAnsicht ? '<span class="badge plain">Notiz</span>' : ''}
        ${e.sichtbarkeit === 'PRIVAT' && bereich !== 'meine-notizen' ? '<span class="badge plain">privat</span>' : ''}
      </div>
      ${e.beschreibung ? `<div class="m org-was">${esc(String(e.beschreibung).replace(/\s+/g, ' ').slice(0, 220))}${String(e.beschreibung).length > 220 ? ' …' : ''}</div>` : ''}
      <div class="m">${merkmale.join(' · ')}</div>
    </div>
    <div class="r">
      ${e.typ === 'TASK' ? `<span class="badge status ${esc(e.status.toLowerCase())}">${esc(ORG_STATUS_LABEL[e.status] || e.status)}</span>` : ''}
      ${darf && e.typ === 'TASK' && e.status !== 'DONE' && !e.verantwortlich
        ? `<button type="button" class="btn btn-sm" data-org-uebernehmen="${esc(e.id)}" title="Diese Aufgabe auf deinen Namen setzen">Ich mache das</button>` : ''}
      ${darf && e.typ === 'TASK' && e.status !== 'DONE' ? `<button type="button" class="btn btn-sm" data-org-fertig="${esc(e.id)}" title="Aufgabe abhaken">✓ Abhaken</button>` : ''}
      ${darf && e.typ === 'NOTE' ? `<button type="button" class="btn btn-sm" data-org-zuaufgabe="${esc(e.id)}" title="Aus dieser Notiz eine Aufgabe machen">In Aufgabe umwandeln</button>` : ''}
    </div>
  </div>`;
}
