/**
 * Datenstand der Betriebsdaten (Lexikon, Bestellungen, Kennzahlen): Anzeige, Knopf
 * "Jetzt aktualisieren", Synchronisation der Aufgaben, Verwerfen der Zwischenspeicher.
 *
 * Liest und leert dafuer die Zwischenspeicher der Ansichten Einkauf, Kunden, Lexikon und
 * Shop-Wache. Bekommt eine Ansicht einen neuen Zwischenspeicher, der nach einer
 * Aktualisierung veraltet ist, gehoert er in verwirfDatenspeicher().
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime, toast } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { refresh } from '../kern/daten.mjs';
import { render } from '../kern/render.mjs';
import { einkauf } from '../ansichten/einkauf/auftragsfluss.mjs';
import { lexikon } from '../ansichten/lexikon.mjs';
import { kunden } from '../ansichten/kunden/gemeinsam.mjs';
import { shopwache } from '../ansichten/shopwache.mjs';
import { verwirfHeuteDaten } from '../ansichten/heute/daten.mjs';

// Ohne Eintrag stuende hier der interne Schluessel ('warenkoerbe') - die vier
// Teile kamen spaeter dazu und fehlten in dieser Liste.
const AKTUALISIERUNG_TEIL_LABEL = {
  lexikon: 'Lexikon', bestellungen: 'Bestellübersicht', kennzahlen: 'Kennzahlen',
  kunden: 'Kunden', angebote: 'Angebote', warenkoerbe: 'Liegengebliebene Warenkörbe', bestand: 'Lagerbestand',
};

/**
 * Ohne Shopify-Zugang auf diesem Rechner kann der Knopf nichts holen. Der Satz nennt den
 * Grund und die Handlung: abwarten (die Daten kommen taeglich von selbst) oder, wenn sie
 * aelter als ein Tag sind, den Inhaber ansprechen - nur er kann den Zugang hinterlegen.
 */
const OHNE_ZUGANG_GRUND = 'Geht an diesem Rechner nicht – der Shopify-Zugang fehlt. Die Daten kommen einmal täglich von selbst;';
const ZUGANG_EINRICHTEN = 'Zugang einrichten: einmalig „npm run operations:verbindung“ im Terminal dieses Rechners.';
function ohneZugangHinweis() {
  const rolle = state.session?.benutzer?.rolle;
  return !rolle || rolle === 'inhaber'
    ? `${OHNE_ZUGANG_GRUND} sind sie älter als ein Tag: ${ZUGANG_EINRICHTEN}`
    : `${OHNE_ZUGANG_GRUND} sind sie älter als ein Tag, bitte dem Inhaber Bescheid geben.`;
}

export function ensureAktualisierung() {
  if (einkauf.aktualisierung || einkauf.loadingAktualisierung) return;
  einkauf.loadingAktualisierung = true;
  fetchEinkauf('/api/aktualisierung').then(d => {
    einkauf.aktualisierung = d; einkauf.loadingAktualisierung = false;
    einkauf.aktualisierungLaeuft = !!d.laeuft;
    if (['heute', 'insights', 'einkauf'].includes(state.route.view)) render();
  });
}

/** Knopf "Jetzt aktualisieren" - nur lokal, wo die privaten Datenquellen ueberhaupt existieren.
 * Gesperrt und mit Ladehinweis waehrend ein Lauf aktiv ist (sowohl serverseitig als auch nach
 * einem Klick auf diesem Tab); das Ergebnis je Quelle zeigt danach aktualisierungHealth(). */
export function aktualisierenButton({ mitHinweis = true } = {}) {
  if (state.capabilities.mode !== 'local') return '';
  const laeuft = einkauf.aktualisierungLaeuft;
  const bereit = einkauf.aktualisierung?.manuellVerfuegbar === true;
  // Der Hinweis sagt, was zu tun ist - "Geplanten Export prüfen" konnte niemand im Laden ausfuehren.
  const hinweis = mitHinweis && einkauf.aktualisierung && !bereit
    ? `<span class="small muted" role="status">${esc(ohneZugangHinweis())}</span>`
    : '';
  return `<button class="btn" type="button" data-action="aktualisieren" ${laeuft || !bereit ? 'disabled' : ''}${!bereit && !mitHinweis ? ` title="${esc(ohneZugangHinweis())}"` : ''}>${laeuft ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'}</button>${hinweis}`;
}

/** Systemgesundheit-Zeilen fuer die lokalen Datenquellen (Lexikon, Bestellübersicht, Kennzahlen). */
export function aktualisierungHealth() {
  const a = einkauf.aktualisierung;
  if (!a) return [];
  const aktualisierungHinweis = a.manuellVerfuegbar
    ? 'Bitte „Jetzt aktualisieren“ verwenden.'
    : `${OHNE_ZUGANG_GRUND} ${ZUGANG_EINRICHTEN}`;
  if (!a.verfuegbar) {
    return [{ level: 'warn', title: 'Lokale Datenquellen noch nie aktualisiert', detail: `${a.hinweis || ''} ${aktualisierungHinweis}` }];
  }
  return Object.entries(a.teile || {}).map(([teil, stand]) => {
    const label = AKTUALISIERUNG_TEIL_LABEL[teil] || teil;
    if (!stand.erfolg) {
      // Ohne Zugang (z.B. kein SHOPIFY_ADMIN_TOKEN in .env.local) laeuft der Lauf ins Leere -
      // die vorhandene Ausgabedatei bleibt unveraendert stehen, ist also aelter als der
      // gescheiterte Versuch. Kein "Stand: <Versuchszeitpunkt>" vortaeuschen.
      const keinZugang = /kein zugang/i.test(stand.meldung || '');
      const versuch = stand.zeitpunkt ? fmtDateTime(stand.zeitpunkt) : 'unbekannt';
      return {
        level: 'warn',
        title: keinZugang ? `${label}: Kein Zugang hinterlegt` : `${label}: letzter Lauf fehlgeschlagen`,
        detail: `${stand.meldung || ''} · Versuch ${versuch} – die vorhandenen (älteren) Daten bleiben unverändert stehen · ${aktualisierungHinweis}`,
      };
    }
    if (stand.letzterFehler) {
      // Der letzte Versuch scheiterte, die Daten des erfolgreichen Laufs davor gelten weiter:
      // deren Stand zeigen, den Fehlschlag daneben (operations/scripts/aktualisieren.mjs, standNachLauf).
      const f = stand.letzterFehler;
      const keinZugang = /kein zugang/i.test(f.meldung || '');
      return {
        level: 'warn',
        title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)}${stand.veraltet ? ' – Daten veraltet' : ''} · ${keinZugang ? 'Aktualisieren ohne Zugang' : 'letzter Versuch fehlgeschlagen'}`,
        detail: `${stand.anzahl ?? '?'} Datensätze · Versuch ${f.zeitpunkt ? fmtDateTime(f.zeitpunkt) : 'unbekannt'}: ${f.meldung || ''}${keinZugang ? ' · Auf diesem Rechner aktualisiert der geplante Export-Lauf die Daten.' : ''}`,
      };
    }
    if (stand.veraltet) return { level: 'warn', title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)} – Daten veraltet`, detail: aktualisierungHinweis };
    return { level: 'ok', title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)}`, detail: stand.anzahl !== null && stand.anzahl !== undefined ? `${stand.anzahl} Datensätze${stand.meldung ? ` · ${stand.meldung}` : ''}` : (stand.meldung || '') };
  });
}

export async function syncNow() {
  toast('Synchronisiere mit GitHub …');
  try {
    const r = await fetch('/api/sync', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    await refresh({ silent: true });
    toast(`Synchronisiert: ${j.count} Aufgaben`);
  } catch (e) { toast(`Sync fehlgeschlagen: ${e.message}`, 'crit'); }
}

/**
 * Knopf "Jetzt aktualisieren": startet operations/scripts/aktualisieren.mjs
 * serverseitig (POST /api/aktualisierung/start) und pollt danach den
 * Status-Endpunkt, bis der Lauf fertig ist - kein Warten im Request, die
 * Anfrage selbst kommt sofort zurueck. Waehrend des Laufs ist der Knopf
 * gesperrt ("Wird aktualisiert …"); danach zeigt render() ueber
 * aktualisierungHealth()/heuteEinkaufBlock() das Ergebnis je Quelle mit
 * Anzahl und Zeitpunkt (aus derselben aktualisierung.json).
 */
export async function aktualisierenNow() {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aktualisierung anstossen.', 'crit'); return; }
  if (einkauf.aktualisierungLaeuft) { toast('Aktualisierung läuft bereits.'); return; }
  if (einkauf.aktualisierung?.manuellVerfuegbar !== true) { toast(ohneZugangHinweis(), 'crit'); return; }
  try {
    const r = await fetch('/api/aktualisierung/start', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Aktualisierung fehlgeschlagen: ${j.error || r.status}`, 'crit'); return; }
    if (j.laeuft && !j.gestartet) { toast('Aktualisierung läuft bereits.'); }
    else toast('Aktualisierung gestartet …');
    einkauf.aktualisierungLaeuft = true;
    render();
    pollAktualisierung();
  } catch (e) { toast(`Aktualisierung fehlgeschlagen: ${e.message}`, 'crit'); }
}

/**
 * Alles verwerfen, was aus den privaten Datendateien stammt. Jede ensure*-
 * Funktion steigt sofort wieder aus, solange ihr Feld gefuellt ist - ohne
 * dieses Leeren meldete "Jetzt aktualisieren" zwar Erfolg, aber Heute, Einkauf
 * und Kunden zeigten weiter die Zahlen vom Seitenaufruf. Der Knopf sagte damit
 * die Unwahrheit, und niemand konnte sehen, dass er nichts bewirkt hat.
 *
 * Nicht geleert wird, was nicht aus diesen Dateien kommt: die Aufgabenliste
 * (org, GitHub bzw. eintraege.json) und der Zustand der Oberflaeche selbst
 * (aufgeklappte Zeilen, Entwuerfe) - sonst verlaere der Benutzer beim
 * Aktualisieren seine Arbeit.
 */
function verwirfDatenspeicher() {
  Object.assign(einkauf, {
    bestellungen: null, produktstatus: null, produktstatusKey: null,
    auftragsstatus: null, kennzahlen: null, lieferanten: null,
  });
  Object.assign(kunden, {
    suche: null, sucheKey: null, detail: null, detailKey: null,
    rueckrufe: null, bestellungen: null, angebote: null, faelle: null,
    warenkoerbe: null, notizen: null, notizenKey: null,
  });
  Object.assign(lexikon, { liste: null, listeKey: null, produkt: null, produktKey: null });
  shopwache.daten = null;
  verwirfHeuteDaten();
}

function pollAktualisierung() {
  clearTimeout(einkauf.aktualisierungPollTimer);
  einkauf.aktualisierungPollTimer = setTimeout(async () => {
    const d = await fetchEinkauf('/api/aktualisierung/status');
    einkauf.aktualisierung = d;
    einkauf.aktualisierungLaeuft = !!d.laeuft;
    if (einkauf.aktualisierungLaeuft) { pollAktualisierung(); return; }
    verwirfDatenspeicher();
    const geholt = Object.values(d.teile || {}).filter(t => t.erfolg).length;
    const gesamt = Object.keys(d.teile || {}).length;
    toast(gesamt && geholt < gesamt
      ? `Aktualisierung fertig – ${geholt} von ${gesamt} Quellen erneuert, der Rest steht im Systemzustand.`
      : 'Aktualisierung abgeschlossen – die Ansichten zeigen jetzt den neuen Stand.');
    render();
  }, 2000);
}
