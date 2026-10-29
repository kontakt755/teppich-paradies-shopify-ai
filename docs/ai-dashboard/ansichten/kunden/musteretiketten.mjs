/** Interne Muster-/Aufkleberzuordnung einer Bestellung; der Server bestimmt Identitaet und Menge. */
import { state } from '../../kern/zustand.mjs';
import { esc, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { kunden } from './gemeinsam.mjs';
import { neueKennung } from '../../lib/druckliste.mjs';
import { oeffneEtikettenDruck } from '../../bausteine/etiketten-druck.mjs';

const ENDPOINT = '/api/kunden/musteretiketten';
const jeBestellung = new Map();
let sitzung = 0;
let druckAnfrage = 0;
const STATUS = {
  nicht_vorgemerkt: 'Noch nicht vorgemerkt', offen: 'In der Druckliste',
  in_druck: 'Für den Druck reserviert', gedruckt: 'Als gedruckt bestätigt',
  entfernt: 'Aus der Druckliste entfernt', geaendert: 'Bestellung/Produktdaten geändert – Druckliste prüfen',
};

const sichtbar = orderId => state.route.view === 'kunden'
  && state.route.params.get('tab') === 'bestellungen' && kunden.erweitert.has(orderId);
const neuZeichnen = orderId => { if (sichtbar(orderId)) render(); };

function eintrag(orderId) {
  if (!jeBestellung.has(orderId)) jeBestellung.set(orderId, {
    daten: null, versucht: false, loading: false, speichert: false, nummer: 0, fehler: '', veraltet: false, versuch: null,
  });
  return jeBestellung.get(orderId);
}

function pruefeAntwort(daten, orderId) {
  if (!daten?.verfuegbar || daten.intern !== true || daten.orderId !== orderId || !Array.isArray(daten.zeilen)) {
    throw new Error(daten?.hinweis || 'Die interne Zuordnung konnte nicht geladen werden. Bitte erneut aktualisieren.');
  }
  return daten;
}

// Der Fortschritt in der Druckliste aendert nicht den urspruenglichen Vormerkversuch.
// Eine andere Bestellmenge oder andere kanonische Produktdaten sind ein neuer Inhalt.
function signatur(daten) {
  return JSON.stringify([daten.gesperrt, daten.zeilen.map(z => [z.lineItemId, z.produktHandle, z.key, z.anzahl, z.bestellmenge, z.etikett, z.fehlt])]);
}

function uebernehme(e, daten) {
  e.daten = daten;
  e.fehler = ''; e.veraltet = false;
  if (e.versuch && e.versuch.signatur !== signatur(daten)) e.versuch = null;
}

/** Nur beim Oeffnen oder ausdruecklichen Aktualisieren laden, nicht fuer alle Bestellungen. */
export async function aktualisiereMusteretiketten(orderId, { nachPost = false } = {}) {
  const e = eintrag(orderId);
  if (e.speichert && !nachPost) return null;
  const nummer = ++e.nummer, aktuelleSitzung = sitzung;
  e.loading = true; e.versucht = true;
  try {
    const daten = pruefeAntwort(await fetchEinkauf(`${ENDPOINT}?${new URLSearchParams({ orderId })}`), orderId);
    if (aktuelleSitzung === sitzung && jeBestellung.get(orderId) === e && nummer === e.nummer) { uebernehme(e, daten); return daten; }
    return null;
  } catch (err) {
    if (aktuelleSitzung === sitzung && jeBestellung.get(orderId) === e && nummer === e.nummer) { e.fehler = err.message; e.veraltet = true; }
    return null;
  } finally {
    if (aktuelleSitzung === sitzung && jeBestellung.get(orderId) === e && nummer === e.nummer) {
      e.loading = false; neuZeichnen(orderId);
    }
  }
}

function aktiveZeilen(daten) { return daten.zeilen.filter(z => z.anzahl !== 0); }
function zuPruefen(z) { return z.vormerkstatus === 'geaendert' || !Object.hasOwn(STATUS, z.vormerkstatus) || !z.etikett || z.etikett.fehlt?.length > 0 || !Array.isArray(z.fehlt) || z.fehlt.length > 0 || !Number.isInteger(z.anzahl) || z.anzahl < 0 || z.anzahl > 20; }
function darfVormerken(e) {
  if (!e.daten || e.loading || e.speichert || e.veraltet || e.daten.gesperrt || istNurLesend()) return false;
  const aktive = aktiveZeilen(e.daten);
  return !aktive.some(zuPruefen) && aktive.some(z => z.vormerkstatus === 'nicht_vorgemerkt');
}

function musterZeile(z) {
  const produkt = z.produktTitel || 'Produkt noch zuordnen';
  const link = z.produktHandle ? `#/lexikon?${new URLSearchParams({ handle: z.produktHandle })}` : '';
  const farbe = z.etikett?.farbe || z.bezeichnung || 'Farbe / Ausführung noch zuordnen';
  const sku = z.etikett?.sku;
  const hinweise = [...(Array.isArray(z.fehlt) && z.fehlt.length ? [`Zuordnung prüfen: ${z.fehlt.join(', ')}`] : []), z.hinweis].filter(Boolean);
  const menge = Number.isInteger(z.anzahl) ? `${z.anzahl} Aufkleber` : 'Anzahl prüfen';
  return `<li class="bme-zeile" data-bq-musteretikett-line="${esc(z.lineItemId)}">
    <div class="bme-was">${link ? `<a href="${esc(link)}"><strong>${esc(produkt)}</strong></a>` : `<strong>${esc(produkt)}</strong>`}
      <span>${esc(farbe)}</span>
      <span class="small muted">Shop-SKU: ${sku ? `<code>${esc(sku)}</code>` : 'nicht eindeutig zugeordnet'}</span>
      ${hinweise.length ? `<span class="small etk-fehlt">${hinweise.map(esc).join(' · ')}</span>` : ''}
    </div>
    <div class="bme-stand"><b>${esc(menge)}</b>
      ${Number.isFinite(z.bestellmenge) && z.bestellmenge !== z.anzahl ? `<span class="small muted">${esc(z.bestellmenge)} insgesamt bestellt</span>` : ''}
      <span class="small${zuPruefen(z) ? ' bme-pruefen' : ' muted'}">${esc(STATUS[z.vormerkstatus] || 'Stand bitte aktualisieren')}</span>
    </div>
  </li>`;
}

export function musteretikettenBlock(bestellung) {
  if (!(bestellung.auftrag?.positionen || []).some(p => p?.istMuster)) return '';
  const orderId = bestellung.orderId;
  const e = eintrag(orderId);
  if (!e.versucht && !e.loading) void aktualisiereMusteretiketten(orderId);
  const kopf = `<section class="bq-musteretiketten" data-bq-musteretiketten="${esc(orderId)}" tabindex="-1">
    <div class="bme-kopf"><h3>Musteraufkleber – nur intern</h3><button type="button" class="btn btn-sm" data-bq-musteretiketten-refresh="${esc(orderId)}"${e.loading || e.speichert ? ' disabled' : ''}>Aktualisieren</button></div>
    <p class="small muted">Diese Zuordnung hilft beim Zusammenstellen der Muster. Bestellung und Kundendaten erscheinen nicht auf dem Produktaufkleber.</p>`;
  if (!e.daten) return `${kopf}${e.fehler ? `<p class="notice crit" role="alert">${esc(e.fehler)}</p>` : '<p class="small muted" role="status">Lade benötigte Musteraufkleber …</p>'}</section>`;
  const aktive = aktiveZeilen(e.daten);
  const pruefen = aktive.some(zuPruefen);
  const neue = aktive.filter(z => z.vormerkstatus === 'nicht_vorgemerkt');
  return `${kopf}
    ${e.fehler ? `<p class="notice ${e.veraltet ? 'crit' : 'warn'}" role="alert">${esc(e.fehler)}${e.veraltet ? ' Der Stand kann veraltet sein. Bitte aktualisieren.' : ''}</p>` : ''}
    ${e.loading ? '<p class="small muted" role="status">Aktualisiere interne Zuordnung …</p>' : ''}
    ${e.daten.gesperrt ? `<p class="small bme-pruefen">${esc(e.daten.gesperrt)}</p>` : ''}
    ${pruefen ? '<p class="small bme-pruefen">Erst alle offenen Zuordnungen prüfen. Solange etwas fehlt oder geändert wurde, wird die Bestellung nicht teilweise vorgemerkt.</p>' : ''}
    <ul class="bme-liste">${e.daten.zeilen.map(musterZeile).join('') || '<li class="small muted">Keine Musterpositionen vorhanden.</li>'}</ul>
    <div class="bme-aktionen">
      ${istNurLesend() ? '<p class="small muted">Dieser Zugang kann die Zuordnung ansehen. Ein Mitarbeiter übernimmt die Vormerkung.</p>' : `<button type="button" class="btn btn-primary" data-bq-musteretiketten-vormerken="${esc(orderId)}"${darfVormerken(e) ? '' : ' disabled'}>${e.speichert ? 'Vormerkung wird bestätigt …' : 'Aufkleber zur Druckliste vormerken'}</button>`}
      <a class="btn" href="#/lexikon?tab=druckliste">Aufkleber-Druckliste</a>
    </div>
    ${!e.daten.gesperrt && !pruefen && !neue.length && aktive.length ? '<p class="small muted">Diese Musterpositionen wurden bereits zur Druckliste vorgemerkt. Für einen bewussten Nachdruck das Produkt im Lexikon öffnen.</p>' : ''}
  </section>`;
}

async function vormerken(orderId) {
  const e = eintrag(orderId);
  if (!darfVormerken(e)) return;
  const inhalt = signatur(e.daten);
  if (!e.versuch || e.versuch.signatur !== inhalt) e.versuch = { signatur: inhalt, vorgangId: neueKennung() };
  const vorgangId = e.versuch.vorgangId, aktuelleSitzung = sitzung;
  e.speichert = true; e.loading = false; e.fehler = ''; ++e.nummer; neuZeichnen(orderId);
  try {
    const daten = pruefeAntwort(await orgSchreiben(ENDPOINT, { orderId, vorgangId }), orderId);
    if (aktuelleSitzung !== sitzung || jeBestellung.get(orderId) !== e) return;
    uebernehme(e, daten); e.versuch = null;
    const neu = daten.vormerkung?.neu;
    toast(Number.isInteger(neu) ? `${neu} Musterpositionen zur gemeinsamen Druckliste vorgemerkt.` : 'Musteraufkleber zur gemeinsamen Druckliste vorgemerkt.');
  } catch (err) {
    if (aktuelleSitzung !== sitzung || jeBestellung.get(orderId) !== e) return;
    await aktualisiereMusteretiketten(orderId, { nachPost: true });
    if (aktuelleSitzung !== sitzung || jeBestellung.get(orderId) !== e) return;
    e.fehler = `Die Vormerkung wurde nicht bestätigt: ${err.message} Bitte den aktuellen Stand prüfen.`;
    toast('Vormerkung nicht bestätigt – internen Stand prüfen.');
  } finally {
    if (aktuelleSitzung === sitzung && jeBestellung.get(orderId) === e) { e.speichert = false; neuZeichnen(orderId); }
  }
}

/** Bestehenden Druckdialog mit denselben kanonischen Labels wie die interne Zuordnung oeffnen. */
export async function bestellungsEtikettenDrucken(orderId) {
  const anfrage = ++druckAnfrage, aktuelleSitzung = sitzung;
  if (eintrag(orderId).speichert) { toast('Bitte warten, bis die Vormerkung bestätigt ist.'); return; }
  const daten = await aktualisiereMusteretiketten(orderId);
  if (anfrage !== druckAnfrage || aktuelleSitzung !== sitzung || !sichtbar(orderId)) return;
  if (!daten) { toast('Die Etiketten konnten nicht geprüft werden. Bitte die interne Zuordnung aktualisieren.'); return; }
  if (!daten.zeilen.length || daten.zeilen.some(z => !z.etikett || !Array.isArray(z.fehlt) || z.fehlt.length || z.etikett.fehlt?.length || !Number.isInteger(z.bestellmenge) || z.bestellmenge <= 0)) {
    toast('Die Etiketten sind nicht vollständig zugeordnet oder die bestellte Menge fehlt. Bitte die interne Zuordnung prüfen.');
    return;
  }
  const gesamt = daten.zeilen.reduce((summe, z) => summe + z.bestellmenge, 0);
  if (gesamt > 100) {
    toast(`${gesamt} Aufkleber überschreiten die Grenze von 100 pro Druckauftrag. Bitte im Lexikon in kleineren Druckaufträgen vormerken.`);
    return;
  }
  const etiketten = daten.zeilen.flatMap(z => Array.from({ length: z.bestellmenge }, () => z.etikett));
  await oeffneEtikettenDruck({ etiketten, titel: `Etiketten drucken · ${daten.orderName}`, allowEditing: false,
    hinweis: `${daten.gesperrt ? `Historischer Nachdruck: ${daten.gesperrt} ` : ''}Die Vorschau verwendet die bestellten Gesamtmengen. Dieser Direktdruck bestätigt keinen Auftrag der gemeinsamen Druckliste.` });
}

export function musteretikettenKlick(e) {
  const ziel = e.target.closest('[data-bq-musteretiketten-open],[data-bq-musteretiketten-refresh],[data-bq-musteretiketten-vormerken]');
  if (!ziel) return false;
  e.preventDefault(); e.stopPropagation();
  if (ziel.disabled) return true;
  const orderId = ziel.dataset.bqMusteretikettenOpen || ziel.dataset.bqMusteretikettenRefresh || ziel.dataset.bqMusteretikettenVormerken;
  if (ziel.hasAttribute('data-bq-musteretiketten-vormerken')) { if (!istNurLesend()) void vormerken(orderId); return true; }
  if (ziel.hasAttribute('data-bq-musteretiketten-open')) kunden.erweitert.add(orderId);
  void aktualisiereMusteretiketten(orderId);
  neuZeichnen(orderId);
  if (ziel.hasAttribute('data-bq-musteretiketten-open')) requestAnimationFrame(() => {
    if (!sichtbar(orderId)) return;
    const block = [...document.querySelectorAll('[data-bq-musteretiketten]')].find(b => b.dataset.bqMusteretiketten === orderId && b.getBoundingClientRect().height > 0);
    block?.focus({ preventScroll: true }); block?.scrollIntoView({ block: 'start' });
  });
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('tp-sitzung-beendet', () => { sitzung++; druckAnfrage++; jeBestellung.clear(); });
  window.addEventListener('hashchange', () => { druckAnfrage++; });
}
