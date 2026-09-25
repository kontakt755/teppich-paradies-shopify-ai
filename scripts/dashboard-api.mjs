/**
 * Lokale Aktions-API des Control Centers (nur npm run dashboard, nur 127.0.0.1).
 *
 * Jede Schreibaktion laeuft ueber die gh CLI unter dem Konto des angemeldeten
 * Menschen und landet damit auditierbar im GitHub-Issue (Label, Assignee,
 * Kommentar). Uebergaenge werden HIER serverseitig geprueft - mit denselben
 * Regeln wie im Browser (docs/ai-dashboard/lib/model.mjs). Ein Client, der
 * die Oberflaeche umgeht, bekommt dieselbe Ablehnung.
 *
 * Es gibt keinen zweiten Aufgabenspeicher: nach jedem Schreibvorgang wird
 * issues.json neu erzeugt, damit Oberflaeche und GitHub identisch sind.
 *
 * `gh` ist injizierbar (Tests). Alle Funktionen sind frei von HTTP-Details.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeTask, requirementsFor, labelChangesFor, STATUS_BY_KEY, STATUS_LABELS } from '../docs/ai-dashboard/lib/model.mjs';
import { toIssueRecord } from './build-dashboard-data.mjs';
import { aufbereiten } from '../operations/lib/bestelluebersicht.mjs';
import { ladeExport } from '../operations/scripts/bestelluebersicht.mjs';
import { auftragsstatusPfad, leseAlle as leseAuftragsstatus, setzeStatus, oeffneWieder, STATUS_ORDER, AuftragsstatusFehler } from '../operations/lib/auftragsstatus.mjs';
import { sucheKunden, kundenListenEintrag, findeKunde, alleKunden } from '../operations/lib/kundensuche.mjs';
import { faelle as kundenFaelle } from '../operations/lib/kundenfaelle.mjs';
import {
  sortiere as orgSortiere, passtZuAnsicht, darfSehen, darfAendern, findeDoppelgaenger,
  istUeberfaellig, tageBis, istPerson, istTechnisch, istTeamarbeit,
} from '../operations/lib/organisation.mjs';
import { analysiere as orgAnalysiere, ausListe as orgAusListe } from '../operations/lib/organisation-analyse.mjs';
import {
  lies as orgLies, schreib as orgSchreib, dateiPfad as orgDatei, baueEintrag,
  findeEintrag, aendere as orgAendere, kommentiere as orgKommentiere,
  speichereAnhang, anhangPfad, ANHANG_TYPEN,
} from '../operations/lib/organisation-speicher.mjs';
import {
  leseBenutzer as orgLeseBenutzer, schreibeBenutzer, benutzerAnlegen, passwortSetzen,
  benutzerDeaktivieren, validiereRolle, BenutzerFehler, ROLLEN,
} from '../operations/lib/benutzer.mjs';
import { bestellliste } from '../operations/lib/bestellliste.mjs';
import {
  FOTO_ART, FotoFehler, passendeProdukte, produktHinweis, pruefeEingang, titelFuer,
} from '../operations/lib/baustellenfotos.mjs';
import { protokollPfad, protokolliere } from '../operations/lib/protokoll.mjs';
import { rueckrufliste } from '../operations/lib/rueckrufliste.mjs';
import { rueckrufePfad, leseAlle as leseRueckrufe, setzeStatus as setzeRueckrufStatus, RUECKRUF_STATUS, RueckrufFehler } from '../operations/lib/rueckrufe.mjs';
import { rollenware, paketware, stueck as stueckware, UNGEKLAERT as MENGE_UNGEKLAERT } from '../operations/lib/umrechnung.mjs';

const execFileP = promisify(execFile);

export const DEFAULT_REPO = process.env.DASHBOARD_REPO || 'kontakt755/teppich-paradies-shopify-ai';

export class ApiError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

/** Standard-gh-Aufruf: Rueckgabe stdout als String. */
export async function defaultGh(args, { timeout = 30_000 } = {}) {
  const { stdout } = await execFileP('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout });
  return stdout;
}

const DECISION_LABEL = {
  approve: 'Freigabe erteilt',
  reject: 'Freigabe abgelehnt',
  question: 'Rückfrage',
  delegate: 'Delegiert',
  later: 'Entscheidung vertagt',
};

function clip(text, max = 4_000) {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Kommentar-Format des Control Centers: maschinen- und menschenlesbar. */
export function buildComment({ actor, heading, lines = [], text = null }) {
  const out = [`## Control Center: ${heading}`, '', `- Von: @${actor}`, ...lines.map(l => `- ${l}`)];
  if (text) out.push('', clip(text));
  out.push('', '<!-- tp-control-center -->');
  return out.join('\n');
}

/**
 * Einkauf-Bereich: Bestelluebersicht und Produktdaten-Status.
 *
 * Liest ausschliesslich private Dateien ausserhalb des Repositories
 * ($TP_PRIVAT_DIR, Standard ~/teppich-paradies-analyse). Nichts davon landet
 * in docs/ai-dashboard/issues.json oder sonst im Repository - die Endpunkte
 * existieren nur im lokalen Server (scripts/serve-dashboard.mjs), nicht auf
 * GitHub Pages. Fehlende Dateien sind kein Fehler, nur ein leerer Zustand.
 */
export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

function readJsonIfExists(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** Wendet dieselben Filterchips wie alleKunden() auf Freitextsuchtreffer an (kundenListenEintrag-Form). */
function passtZuKundenFilter(filter) {
  return (k) => {
    if (filter === 'in_arbeit') return !k.fortschritt.fertig;
    if (filter === 'fertig') return k.fortschritt.fertig && k.fortschritt.gesamt > 0;
    if (filter === 'rueckruf_offen') return k.beratungOffen;
    if (filter === 'muster') return k.muster;
    if (filter === 'test') return k.nurTestbestellungen;
    return !k.nurTestbestellungen;
  };
}

/**
 * Kunden aus dem Shopify-Kundenstamm, die in den Bestellungen nicht
 * vorkommen (noch nichts bestellt oder die Bestellung liegt ausserhalb des
 * exportierten Zeitfensters). Ohne sie zeigte die Kundenliste nur einen
 * Bruchteil dessen, was im Shopify-Admin steht.
 * Form wie kundenListenEintrag, damit Filter und Anzeige unveraendert
 * funktionieren; `nurStammdaten` markiert die Herkunft.
 */
function stammOhneBestellung(dir, vorhandeneKeys) {
  const daten = readJsonIfExists(path.join(dir, 'kunden', 'kunden.json'));
  const zeilen = [];
  for (const k of daten?.kunden ?? []) {
    const key = k.email ? `email:${String(k.email).toLowerCase()}`
      : k.telefon ? `tel:${String(k.telefon).replace(/[^0-9+]/g, '')}`
      : `name:${String(k.name || 'unbekannt').toLowerCase()}`;
    if (vorhandeneKeys.has(key)) continue;
    zeilen.push({
      key,
      name: k.name || '–',
      email: k.email || null,
      telefon: k.telefon || null,
      telefonQuelle: k.telefonQuelle || null,
      ort: k.anschrift?.ort || null,
      letzteBestellung: null,
      letzteBestellungName: null,
      anzahlBestellungen: k.anzahlBestellungen || 0,
      gesamtumsatz: k.gesamtumsatz || 0,
      waehrung: k.waehrung || 'EUR',
      nurTestbestellungen: false,
      fortschritt: { fertig: true, gesamt: 0, erledigt: 0 },
      aeltesteOffeneBestellungDatum: null,
      beratungOffen: false,
      muster: false,
      nurStammdaten: true,
    });
  }
  return zeilen;
}

/** Laedt und bereitet orders.json auf (dieselbe Logik wie einkaufBestellungen()); null wenn nicht vorhanden/kaputt. */
function ladeBestellModell(dir) {
  const file = path.join(dir, 'bestelluebersicht', 'orders.json');
  const daten = readJsonIfExists(file);
  if (!daten) return null;
  try { return aufbereiten(ladeExport(JSON.stringify(daten)), { jetzt: new Date() }); }
  catch { return null; }
}

/**
 * Produktdaten-Status: Klartext, Blockier-Status und Naechster-Schritt-Text
 * je Einkaufsfeld. Drei ehrliche Gruppen, nicht zwei:
 *
 * - "blockierend": ohne dieses Feld kann die Ware beim Lieferanten nicht
 *   bestellt werden - Lieferant oder Artikelnummer fehlt. Das ist die einzige
 *   Gruppe, die die grosse Zahl oben treibt.
 * - "nachtragen": wuenschenswerte Zusatzinformation (Farbnummer, Kollektion,
 *   Hersteller, Lieferanten-Produktname/-URL) - fehlt sie, blockiert das
 *   keine Bestellung, ist aber eine echte Luecke.
 * - strukturell offen (kein Meta-Eintrag mit blockierend/nachtragen noetig,
 *   siehe istStrukturellOffenerFall()): umrechnung (Format nie definiert),
 *   procurement_id ausserhalb der Rollenware (dort nie vorgesehen) und jede
 *   Wunschmass-Variante (SKU/Artikelnummer entstehen erst beim Zuschnitt) -
 *   zaehlt nirgends als Aufgabe.
 *
 * Quelle der Feldnamen: einkauf-klaerung/offen.json (Feld `field`).
 */
const EINKAUF_FELD_META = {
  lieferant: { klartext: 'Lieferant', blockierend: true },
  artikelnummer: { klartext: 'Artikelnummer', blockierend: true },
  'lieferant/artikelnummer': { klartext: 'Lieferant/Artikelnummer', blockierend: true },
  bestelleinheit: { klartext: 'Bestellmenge unklar', blockierend: true },
  farbnummer: { klartext: 'Farbnummer', blockierend: false },
  lieferant_kollektion: { klartext: 'Kollektion', blockierend: false },
  hersteller: { klartext: 'Hersteller', blockierend: false },
  farbname: { klartext: 'Farbname', blockierend: false },
  lieferant_produktname: { klartext: 'Lieferanten-Produktname', blockierend: false },
  lieferant_url: { klartext: 'Lieferanten-Produktseite', blockierend: false },
  procurement_id: { klartext: 'Einkaufs-ID', blockierend: false },
  umrechnung: { klartext: 'Umrechnung', blockierend: false },
};

function einkaufFeldKlartext(feld) {
  return EINKAUF_FELD_META[feld]?.klartext || feld;
}

function einkaufFeldBlockierend(feld) {
  return Boolean(EINKAUF_FELD_META[feld]?.blockierend);
}

/**
 * Strukturell offene Faelle zaehlen nie als Aufgabe (weder blockierend noch
 * nachtragen) - siehe Kommentar an EINKAUF_FELD_META. `gruppe` und
 * `variantTitle` kommen aus dem Dry-Run-Plan (plan.json) der Variante.
 */
function istStrukturellOffenerFall(feld, gruppe, variantTitle) {
  if (/wunschma/i.test(variantTitle || '')) return true;
  if (feld === 'umrechnung') return true;
  if (feld === 'procurement_id' && gruppe !== 'Rollenware') return true;
  return false;
}

/**
 * Naechster Schritt in verstaendlichem Deutsch, je Feld und - wo noetig -
 * je nach Grund unterschiedlich (z. B. Kaskade ueber einen offenen
 * Lieferanten, oder das Nummernsystem-Problem aus
 * docs/lessons/zwei-nummernsysteme-doellken.md). Faellt kein Grund-Muster,
 * bleibt der generische Satz fuer das Feld.
 */
function einkaufNaechsterSchritt(feld, grund) {
  const g = String(grund || '');
  const lieferantUnklar = /Lieferant unklar/i.test(g);
  switch (feld) {
    case 'lieferant':
    case 'lieferant/artikelnummer':
      return 'Lieferant von Hand klaeren (Preisliste/Lieferantenliste abgleichen)';
    case 'artikelnummer':
      if (lieferantUnklar) return 'Kommt automatisch, sobald der Lieferant geklaert ist';
      return 'Artikelnummer bei Lieferant nicht gefunden - von Hand in Preisliste/Katalog pruefen';
    case 'farbnummer':
      if (lieferantUnklar) return 'Kommt automatisch, sobald der Lieferant geklaert ist';
      if (/zwei Nummernsysteme/i.test(g)) return 'Farbcode und Artikelnummer-Suffix weichen ab - von Hand gegen die Lieferantenliste pruefen (zwei Nummernsysteme)';
      return 'Farbnummer von der Lieferantenliste abschreiben, nie fortlaufend zaehlen';
    case 'bestelleinheit':
      if (/VE oder Stueck/i.test(g)) return 'Verpackungseinheit oder Einzelstueck? Von Hand in der Preisliste pruefen';
      if (/Massteppich/i.test(g)) return 'Bestelleinheit als Zuschnitt+Einfassung von Hand festlegen (Inhaberentscheidung noetig)';
      return 'Bestelleinheit von Hand aus der Preisliste uebernehmen';
    case 'lieferant_kollektion':
      return 'Kollektion kommt automatisch, sobald die Lieferantenseite geholt ist';
    case 'hersteller':
      return 'Hersteller kommt automatisch, sobald Lieferant und Kollektion bekannt sind';
    default:
      return 'Fuellt sich automatisch aus den uebrigen Feldern, keine Aktion noetig';
  }
}

/** Ist der Schritt fuer dieses Feld+Grund menschliche Handarbeit oder automatisch? */
function einkaufBrauchtHandarbeit(feld, grund) {
  if (!einkaufFeldBlockierend(feld)) return false;
  return !/^Kommt automatisch/.test(einkaufNaechsterSchritt(feld, grund));
}

function produktSucheTreffer(eintrag, q) {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const skus = (eintrag.varianten || []).map(v => v.sku).filter(Boolean).join(' ');
  return [eintrag.titel, eintrag.handle, skus].some(v => String(v ?? '').toLowerCase().includes(n));
}

/**
 * Baut je Produkt (Handle) eine Arbeitslisten-Zeile aus dem Einkauf-Dry-Run
 * (plan.json, Dimension: Titel/Gruppe/Varianten je gid) und dem frischeren
 * Klaerungslauf (offen.json, Feld+Grund je gid - das ist die tatsaechlich
 * noch offene Menge, plan.json selbst ist ein aelterer Zwischenstand).
 */
function produktstatusAufbauen(planRows, offenRows) {
  const dim = new Map(planRows.map(r => [r.gid, r]));
  const produkte = new Map();
  for (const r of planRows) {
    if (produkte.has(r.handle)) {
      produkte.get(r.handle).varianten.push({ gid: r.gid, sku: r.sku, variante: r.variant_title });
      continue;
    }
    produkte.set(r.handle, {
      handle: r.handle,
      titel: r.product_title,
      gruppe: r.gruppe || 'Unbekannt',
      varianten: [{ gid: r.gid, sku: r.sku, variante: r.variant_title }],
      offeneFelderRoh: new Map(), // feld -> {grund, varianten:Set}
    });
  }

  for (const o of offenRows) {
    const dr = dim.get(o.gid);
    if (!dr) continue; // Variante nicht (mehr) im Dry-Run-Plan - kann verwaist sein, wird nicht erfunden
    if (istStrukturellOffenerFall(o.field, dr.gruppe, dr.variant_title)) continue; // keine Aufgabe, siehe Kommentar oben
    const p = produkte.get(dr.handle);
    if (!p) continue;
    const bestehend = p.offeneFelderRoh.get(o.field);
    if (bestehend) bestehend.varianten.add(o.gid);
    else p.offeneFelderRoh.set(o.field, { grund: o.reason, varianten: new Set([o.gid]) });
  }

  const eintraege = [];
  for (const p of produkte.values()) {
    let offeneFelder = [...p.offeneFelderRoh.entries()].map(([feld, info]) => ({
      feld,
      klartext: einkaufFeldKlartext(feld),
      blockierend: einkaufFeldBlockierend(feld),
      grund: info.grund || 'kein Grund hinterlegt',
      naechsterSchritt: einkaufNaechsterSchritt(feld, info.grund),
      handarbeit: einkaufBrauchtHandarbeit(feld, info.grund),
      variantenBetroffen: info.varianten.size,
    }));
    // Kaskade: ist der Lieferant selbst offen, sind Artikel-/Farbnummer nur
    // eine Folge davon - nicht als eigene Handlungspunkte doppeln.
    if (offeneFelder.some(f => f.feld === 'lieferant' || f.feld === 'lieferant/artikelnummer')) {
      offeneFelder = offeneFelder.filter(f => !/Lieferant unklar/i.test(f.grund) || f.feld === 'lieferant' || f.feld === 'lieferant/artikelnummer');
    }
    offeneFelder.sort((a, b) => (b.blockierend - a.blockierend) || (b.handarbeit - a.handarbeit));

    const blockierendeFelder = offeneFelder.filter(f => f.blockierend);
    const handarbeitFelder = offeneFelder.filter(f => f.handarbeit);
    const vollstaendig = offeneFelder.length === 0;
    const status = vollstaendig ? 'vollstaendig' : handarbeitFelder.length ? 'handarbeit' : 'automatisch';

    eintraege.push({
      handle: p.handle,
      titel: p.titel,
      gruppe: p.gruppe,
      variantenAnzahl: p.varianten.length,
      varianten: p.varianten,
      vollstaendig,
      status,
      blockiertBestellung: blockierendeFelder.length > 0,
      offeneFelder,
      dringlichkeit: (blockierendeFelder.length * 1000) + (handarbeitFelder.length * 10) + offeneFelder.length,
    });
  }
  return eintraege;
}

/**
 * Kontaktdaten aus dem Shopify-Kundenstamm (kunden/kunden.json), nach E-Mail
 * und Name gebuendelt. Bestellungen tragen nicht immer eine Telefonnummer -
 * der Kundenstamm hat sie oft trotzdem (aus der Lieferadresse, siehe
 * operations/lib/kunden.mjs::telefonVon). Am Telefon zaehlt genau das.
 */
function stammKontakte(dir) {
  const daten = readJsonIfExists(path.join(dir, 'kunden', 'kunden.json'));
  const index = new Map();
  for (const k of daten?.kunden ?? []) {
    if (k.email) index.set(`mail:${String(k.email).toLowerCase()}`, k);
    if (k.name) index.set(`name:${String(k.name).toLowerCase()}`, k);
  }
  return index;
}

export function createApi({ gh = defaultGh, repo = DEFAULT_REPO, root = process.cwd(), rebuild = null, stateDir = null, ledgerPath = null, privatDirPath = null, now = () => new Date(), sitzungenVerwerfen = null } = {}) {
  let userCache = null;
  let labelCache = { at: 0, names: [] };
  // Prozesszustand des Knopfs "Jetzt aktualisieren" - genau ein Lauf gleichzeitig,
  // pro Serverprozess (nicht persistent; ein Neustart des Servers vergisst einen
  // noch laufenden Kindprozess, der aber unabhaengig weiterlaeuft und sein Ergebnis
  // ohnehin nur in aktualisierung.json schreibt).
  let aktualisierungLauf = null; // { seit, fehler, fertig } waehrend ein Lauf aktiv ist, sonst null

  const auditPath = path.join(root, '.router', 'control-center-audit.jsonl');
  function audit(entry) {
    try {
      fs.mkdirSync(path.dirname(auditPath), { recursive: true });
      fs.appendFileSync(auditPath, `${JSON.stringify({ at: now().toISOString(), ...entry })}\n`);
    } catch { /* Audit darf die Aktion nicht verhindern; der GitHub-Kommentar ist die fuehrende Spur. */ }
  }

  /** Handelnde Person fuer Anzeige/Protokoll: der angemeldete Dashboard-Benutzer, sonst der gh-Login (Notzugang). */
  function anzeigename(benutzer, actor) {
    return benutzer?.name || actor || 'unbekannt';
  }

  function merke(benutzer, actor, aktion, objekt) {
    protokolliere(protokollPfad(), { benutzer: anzeigename(benutzer, actor), aktion, objekt, jetzt: now() });
  }

  async function currentUser() {
    if (userCache) return userCache;
    try { userCache = (await gh(['api', 'user', '--jq', '.login'])).trim() || null; } catch { userCache = null; }
    return userCache;
  }

  async function repoLabels() {
    if (Date.now() - labelCache.at < 5 * 60_000 && labelCache.names.length) return labelCache.names;
    const raw = await gh(['api', '--paginate', `repos/${repo}/labels?per_page=100`]);
    const names = raw.trim().replace(/\]\s*\[/g, ',').replace(/^\[?/, '[').replace(/\]?$/, ']');
    let parsed;
    try { parsed = JSON.parse(names); } catch { parsed = JSON.parse(raw); }
    labelCache = { at: Date.now(), names: parsed.map(l => l.name) };
    return labelCache.names;
  }

  async function fetchIssue(number) {
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'Ungültige Aufgabennummer');
    let raw;
    try { raw = JSON.parse(await gh(['api', `repos/${repo}/issues/${n}`])); }
    catch (e) { throw new ApiError(404, `Aufgabe #${n} nicht gefunden (${e.message.split('\n')[0]})`); }
    if (raw.pull_request) throw new ApiError(400, `#${n} ist ein Pull Request, keine Aufgabe`);
    const record = toIssueRecord(raw);
    return { raw, record, task: normalizeTask({ ...record, body: raw.body }, { now: now() }) };
  }

  async function afterWrite() {
    if (typeof rebuild === 'function') {
      try { await rebuild(); } catch (e) { return `issues.json konnte nicht neu erzeugt werden: ${e.message}`; }
    }
    return null;
  }

  return {
    async capabilities() {
      const user = await currentUser();
      let labelsAvailable = [];
      try { labelsAvailable = (await repoLabels()).filter(l => /^(status|type|priority|area|reviewer):/.test(l)); } catch { /* bleibt leer */ }
      return {
        mode: 'local', user, actions: Boolean(user), sync: true, agentRuns: true, activity: true,
        repo, labelsAvailable,
        note: user ? null : 'gh ist nicht angemeldet – Aktionen sind gesperrt (gh auth login).',
      };
    },

    async sync() {
      const warn = await afterWrite();
      if (warn) throw new ApiError(502, warn);
      const file = path.join(root, 'docs/ai-dashboard/issues.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ok: true, count: data.count, generated_at: data.generated_at };
    },

    async activityForTask(number) {
      const n = Number(number);
      if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'Ungültige Aufgabennummer');
      const [events, comments] = await Promise.all([
        gh(['api', `repos/${repo}/issues/${n}/events?per_page=100`]).then(JSON.parse),
        gh(['api', `repos/${repo}/issues/${n}/comments?per_page=100`]).then(JSON.parse),
      ]);
      const mapped = [];
      for (const e of events) {
        const actor = e.actor?.login || 'system';
        const map = {
          labeled: `Label „${e.label?.name}" gesetzt`, unlabeled: `Label „${e.label?.name}" entfernt`,
          assigned: `zugewiesen an @${e.assignee?.login}`, unassigned: `Zuweisung @${e.assignee?.login} entfernt`,
          closed: 'geschlossen', reopened: 'wieder geöffnet', renamed: `umbenannt: „${e.rename?.to}"`,
          milestoned: `Meilenstein „${e.milestone?.title}"`, referenced: 'in Commit referenziert', mentioned: 'erwähnt',
          cross_referenced: 'querverwiesen',
        };
        if (['subscribed', 'unsubscribed', 'mentioned'].includes(e.event)) continue;
        mapped.push({ at: e.created_at, actor, type: e.event, text: map[e.event] || e.event });
      }
      for (const c of comments) {
        const cc = /tp-control-center/.test(c.body || '') ? 'Control Center' : /AI-Steuerzentrale/.test(c.body || '') ? 'KI-Steuerzentrale' : 'Kommentar';
        mapped.push({ at: c.created_at, actor: c.user?.login || '?', type: cc, text: clip(c.body, 1_500) });
      }
      mapped.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      return { number: n, events: mapped };
    },

    async activity() {
      const events = JSON.parse(await gh(['api', `repos/${repo}/issues/events?per_page=100`]));
      const out = [];
      for (const e of events) {
        if (!e.issue || e.issue.pull_request) continue;
        if (['subscribed', 'unsubscribed', 'mentioned'].includes(e.event)) continue;
        const text = e.event === 'labeled' ? `Label „${e.label?.name}"` : e.event === 'unlabeled' ? `Label „${e.label?.name}" entfernt`
          : e.event === 'assigned' ? `zugewiesen an @${e.assignee?.login}` : e.event === 'closed' ? 'geschlossen' : e.event === 'reopened' ? 'wieder geöffnet' : e.event;
        out.push({ at: e.created_at, actor: e.actor?.login || 'system', type: e.event, text: `${e.issue.title} · ${text}`, number: e.issue.number, title: e.issue.title });
      }
      return { events: out };
    },

    /** Statuswechsel mit Pflichtangaben. payload: {target, owner, comment, reason, confirmAcceptance, decision} */
    async transition(number, payload = {}, benutzer = null) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const target = String(payload.target || '');
      if (!STATUS_BY_KEY[target]) throw new ApiError(400, `Unbekannter Zielstatus „${target}"`, { missing: [`Unbekannter Zielstatus „${target}"`] });
      const { task } = await fetchIssue(number);
      const missing = requirementsFor(task, target, payload);
      if (missing.length) throw new ApiError(400, 'Pflichtangaben fehlen', { missing });
      const labels = await repoLabels();
      const change = labelChangesFor(task, target, { hasLabel: l => labels.includes(l) });
      const n = task.number;

      const editArgs = ['issue', 'edit', String(n), '--repo', repo];
      for (const l of change.remove) editArgs.push('--remove-label', l);
      for (const l of change.add) editArgs.push('--add-label', l);
      const newOwner = payload.owner && payload.owner !== task.owner ? String(payload.owner).replace(/^@/, '') : null;
      if (newOwner) editArgs.push('--add-assignee', newOwner);
      if (change.remove.length || change.add.length || newOwner) await gh(editArgs);

      const text = payload.comment || payload.reason || null;
      const heading = payload.decision && DECISION_LABEL[payload.decision] ? DECISION_LABEL[payload.decision] : `Status ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`;
      const lines = [`Status: ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`];
      if (newOwner) lines.push(`Owner: @${newOwner}`);
      if (payload.confirmAcceptance) lines.push('Akzeptanzkriterien: ausdrücklich bestätigt');
      if (change.note) lines.push(`Hinweis: ${change.note}`);
      if (benutzer?.name) lines.push(`Mitarbeiter (Control Center): ${benutzer.name}`);
      await gh(['issue', 'comment', String(n), '--repo', repo, '--body', buildComment({ actor, heading, lines, text })]);
      if (change.close) await gh(['issue', 'close', String(n), '--repo', repo]);
      if (change.reopen) await gh(['issue', 'reopen', String(n), '--repo', repo]);

      audit({ actor, benutzer: benutzer?.name || null, action: 'transition', issue: n, from: task.status, to: target, owner: newOwner, decision: payload.decision || null, labels: change });
      merke(benutzer, actor, 'Statuswechsel', `Issue #${n}: ${task.statusLabel} → ${STATUS_BY_KEY[target].label}`);
      const warn = await afterWrite();
      return { ok: true, issue: n, from: task.status, to: target, labels: change, note: [change.note, warn].filter(Boolean).join(' · ') || null };
    },

    async assign(number, payload = {}, benutzer = null) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const owner = String(payload.owner || '').replace(/^@/, '').trim();
      if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) throw new ApiError(400, 'Owner muss ein GitHub-Login sein', { missing: ['Owner (GitHub-Login) angeben'] });
      const { task, record } = await fetchIssue(number);
      const n = task.number;
      const args = ['issue', 'edit', String(n), '--repo', repo, '--add-assignee', owner];
      for (const a of record.assignees.filter(a => a !== owner)) args.push('--remove-assignee', a);
      await gh(args);
      const heading = payload.decision === 'delegate' ? DECISION_LABEL.delegate : 'Owner zugeordnet';
      const lines = [`Owner: ${task.owner ? `@${task.owner} → ` : ''}@${owner}`];
      if (benutzer?.name) lines.push(`Mitarbeiter (Control Center): ${benutzer.name}`);
      await gh(['issue', 'comment', String(n), '--repo', repo, '--body', buildComment({ actor, heading, lines, text: payload.comment || null })]);
      audit({ actor, benutzer: benutzer?.name || null, action: 'assign', issue: n, owner, decision: payload.decision || null });
      merke(benutzer, actor, 'Owner zugeordnet', `Issue #${n}: @${owner}`);
      const warn = await afterWrite();
      return { ok: true, issue: n, owner, note: warn };
    },

    async comment(number, payload = {}, benutzer = null) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const body = clip(payload.body, 6_000);
      if (!body) throw new ApiError(400, 'Kommentar ist leer', { missing: ['Kommentartext angeben'] });
      const { task } = await fetchIssue(number);
      const heading = payload.decision && DECISION_LABEL[payload.decision] ? DECISION_LABEL[payload.decision] : 'Kommentar';
      const lines = benutzer?.name ? [`Mitarbeiter (Control Center): ${benutzer.name}`] : [];
      await gh(['issue', 'comment', String(task.number), '--repo', repo, '--body', buildComment({ actor, heading, lines, text: body })]);
      audit({ actor, benutzer: benutzer?.name || null, action: 'comment', issue: task.number, decision: payload.decision || null });
      merke(benutzer, actor, 'Kommentar', `Issue #${task.number}`);
      const warn = await afterWrite();
      return { ok: true, issue: task.number, note: warn };
    },

    /** KI-Laeufe der Steuerzentrale + Provider-Ledger, read-only. */
    agentRuns() {
      const dir = stateDir || process.env.DASHBOARD_STATE_DIR || path.join(os.homedir(), 'Library/Application Support/TP AI Dashboard');
      const file = path.join(dir, 'dashboard-state.json');
      const runs = [];
      let source = null;
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        source = file;
        for (const r of [saved.current, ...(saved.history || [])].filter(Boolean)) {
          runs.push({
            id: r.id, state: r.state, task: clip(r.task, 300), issue: r.issue ? { number: r.issue.number, title: r.issue.title } : null,
            startedAt: r.startedAt, finishedAt: r.finishedAt, message: clip(r.message, 300),
            progress: r.progress || null, risk: r.risk || r.result?.risk || null, taskType: r.taskType || r.result?.taskType || null,
            provider: r.result?.provider || null, costUsd: Number.isFinite(r.result?.costUsd) ? r.result.costUsd : null,
            summary: clip(r.result?.summary, 1_200), findings: Array.isArray(r.result?.findings) ? r.result.findings.length : 0,
            guard: r.result?.guard?.status || null, resultStatus: r.result?.status || null,
          });
        }
      } catch { /* keine Steuerzentrale-Daten */ }
      const ledger = ledgerPath || process.env.AI_ROUTER_USAGE_LEDGER || path.join(root, '.router/ai-usage.jsonl');
      let usage = null;
      try {
        const lines = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
        usage = { requests: 0, costUsd: 0, byProvider: {}, last: null };
        for (const line of lines) {
          let e; try { e = JSON.parse(line); } catch { continue; }
          usage.requests += 1; usage.costUsd += Number(e.usage?.costUsd) || 0;
          const key = e.provider || 'unbekannt';
          usage.byProvider[key] = (usage.byProvider[key] || 0) + 1;
          if (!usage.last || (e.timestamp || '') > usage.last.at) usage.last = { at: e.timestamp, model: e.model, provider: e.provider };
        }
      } catch { /* kein Ledger */ }
      return { runs, source, usage, ledger: usage ? ledger : null };
    },

    /** Bestelluebersicht: offene Kundenbestellungen, gruppiert je Lieferant, plus Muster. */
    einkaufBestellungen() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'bestelluebersicht', 'orders.json');
      const daten = readJsonIfExists(file);
      if (!daten) return { verfuegbar: false, quelle: file, hinweis: 'orders.json fehlt - siehe operations/lib/bestelluebersicht.mjs bzw. den Export-Lauf dafuer.' };
      let modell;
      // Der Export der Admin API liegt als {data:{orders:{nodes}}} vor;
      // ladeExport bringt beide Formen auf {orders, quellvarianten}.
      try { modell = aufbereiten(ladeExport(JSON.stringify(daten)), { jetzt: now() }); }
      catch (e) { return { verfuegbar: false, quelle: file, hinweis: `orders.json konnte nicht ausgewertet werden: ${e.message}` }; }
      return { verfuegbar: true, quelle: file, exportiertAm: daten.exportiertAm || null, ...modell };
    },

    /** Kundensuche: Name, E-Mail, Telefon, Bestellnummer, Strasse/Ort/PLZ - waehrend des Tippens. */
    kundenSuche({ q = '', filter = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt - siehe operations/lib/bestelluebersicht.mjs bzw. den Export-Lauf dafuer.' };
      const statusAlle = leseAuftragsstatus(auftragsstatusPfad(dir));
      // Unter zwei Zeichen ist die Suche kein Tor mehr, sondern die volle
      // Kundenliste (Inhabervorgabe) - gefiltert/sortiert wie alleKunden().
      // Ab zwei Zeichen bleibt es Freitextsuche, mit demselben Filter drauf.
      const q2 = String(q ?? '').trim();
      const roh = q2.length >= 2
        ? sucheKunden(modell, q2, { statusAlle }).map(k => kundenListenEintrag(k, { statusAlle })).filter(passtZuKundenFilter(filter))
        : alleKunden(modell, { statusAlle, filter });
      const stamm = stammKontakte(dir);
      const ausBestellungen = roh.map((t) => {
        if (t.telefon && t.telefon !== '–') return t;
        const k = stamm.get(`mail:${String(t.email || '').toLowerCase()}`) || stamm.get(`name:${String(t.name || '').toLowerCase()}`);
        if (!k?.telefon) return t;
        return { ...t, telefon: k.telefon, telefonQuelle: k.telefonQuelle || 'kundenstamm' };
      });
      // Kunden aus Shopify, zu denen es hier keine Bestellung gibt, gehoeren
      // trotzdem in die Liste - sonst fehlen sie am Telefon.
      const alleKeys = new Set(ausBestellungen.map(t => t.key));
      const nurStamm = stammOhneBestellung(dir, alleKeys)
        .filter(passtZuKundenFilter(filter))
        .filter(t => q2.length < 2 || [t.name, t.email, t.telefon, t.ort].filter(Boolean).some(f => String(f).toLowerCase().includes(q2.toLowerCase())));
      const treffer = [...ausBestellungen, ...nurStamm];
      return { verfuegbar: true, treffer, gesamt: treffer.length };
    },

    /** Kunden-Detailansicht: Kontakt, Anschriften, alle Bestellungen mit Positionen. */
    kundenDetail({ key = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      const statusAlle = leseAuftragsstatus(auftragsstatusPfad(dir));
      const kunde = findeKunde(modell, key, { statusAlle });
      if (kunde) return { verfuegbar: true, kunde };
      // Kunde aus dem Shopify-Stamm ohne Bestellung in dieser Datei: die
      // Akte zeigt dann Kontakt und Anschrift statt einer Fehlermeldung.
      const ausStamm = stammOhneBestellung(dir, new Set()).find(k => k.key === key);
      if (!ausStamm) return { verfuegbar: false, hinweis: 'Kunde nicht gefunden - Bestelldaten evtl. inzwischen aktualisiert.' };
      const roh = (readJsonIfExists(path.join(dir, 'kunden', 'kunden.json'))?.kunden ?? [])
        .find(k => (k.email && `email:${String(k.email).toLowerCase()}` === key) || (k.name && `name:${String(k.name).toLowerCase()}` === key));
      return {
        verfuegbar: true,
        nurStammdaten: true,
        kunde: {
          key,
          kunde: { name: ausStamm.name, email: ausStamm.email || '–', telefon: ausStamm.telefon || '–' },
          lieferadresse: roh?.anschrift || null,
          rechnungsadresse: null,
          auftraege: [],
          anzahlBestellungen: ausStamm.anzahlBestellungen,
          gesamtumsatz: ausStamm.gesamtumsatz,
          waehrung: ausStamm.waehrung,
          nurTestbestellungen: false,
          fortschritt: ausStamm.fortschritt,
          hinweis: ausStamm.anzahlBestellungen > 0
            ? `Shopify fuehrt ${ausStamm.anzahlBestellungen} Bestellung(en) - sie liegen ausserhalb der hier exportierten Daten.`
            : 'Noch keine Bestellung.',
        },
      };
    },

    /** Vollstaendige Bestelluebersicht (eine Zeile je Bestellung) fuer die Tabellenansicht - Sortierung/Filter/Suche laufen im Browser, das lokale Datenvolumen ist klein. */
    kundenBestellungen() {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      const statusAlle = leseAuftragsstatus(auftragsstatusPfad(dir));
      const rueckrufeAlle = leseRueckrufe(rueckrufePfad(dir));
      return { verfuegbar: true, zeilen: bestellliste(modell, { statusAlle, rueckrufeAlle }) };
    },

    /**
     * "Kunde fertig": setzt ALLE offenen Positionen einer Bestellung auf
     * Erledigt - bewusster Sammelschritt mit Rueckfrage im Browser und
     * Protokolleintrag (wer/wann je Position ueber merke()), nie ein
     * stiller Massenwechsel.
     */
    async kundenBestellungFertig(payload = {}, benutzer = null) {
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const { orderId, lineItemIds, notiz } = payload || {};
      if (!orderId || !Array.isArray(lineItemIds) || !lineItemIds.length) {
        throw new ApiError(400, 'orderId und lineItemIds sind Pflicht', { missing: ['orderId', 'lineItemIds'] });
      }
      const dir = privatDirPath || privatDir();
      const file = auftragsstatusPfad(dir);
      const eintraege = [];
      for (const lineItemId of lineItemIds) {
        try {
          eintraege.push(setzeStatus(file, { orderId, lineItemId, status: 'erledigt', actor, notiz: notiz || 'Kunde fertig (Sammelschritt)', jetzt: now() }));
        } catch (e) {
          if (!(e instanceof AuftragsstatusFehler)) throw e;
        }
      }
      audit({ actor, action: 'auftragsstatus-kunde-fertig', orderId, anzahl: eintraege.length });
      merke(benutzer, actor, 'Kunde fertig', `${orderId}: ${eintraege.length} Artikel`);
      return { ok: true, anzahl: eintraege.length, eintraege };
    },

    /** Rueckruf-/Beratungs-Arbeitsliste, aelteste Bestellung zuerst, mit lokalem Bearbeitungsstatus. */
    kundenRueckrufe() {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      const statusAlle = leseRueckrufe(rueckrufePfad(dir));
      const zeilen = rueckrufliste(modell).map(z => {
        const s = statusAlle[z.orderId];
        return { ...z, status: s?.status || 'offen', notiz: s?.notiz || null, aktualisiertAm: s?.aktualisiertAm || null, aktualisiertVon: s?.aktualisiertVon || null };
      });
      return { verfuegbar: true, zeilen };
    },

    /** Setzt den Bearbeitungsstatus eines Rueckrufs (offen/angerufen/erledigt), rein lokal. */
    async kundenRueckrufSetzen(payload = {}) {
      const actor = await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const { orderId, status, notiz } = payload || {};
      if (!orderId) throw new ApiError(400, 'orderId ist Pflicht');
      if (!RUECKRUF_STATUS.includes(status)) throw new ApiError(400, `Unbekannter Status „${status}"`, { missing: [`Status muss einer von ${RUECKRUF_STATUS.join(', ')} sein`] });
      const dir = privatDirPath || privatDir();
      const file = rueckrufePfad(dir);
      let eintrag;
      try {
        eintrag = setzeRueckrufStatus(file, { orderId, status, actor, notiz, jetzt: now() });
      } catch (e) {
        if (e instanceof RueckrufFehler) throw new ApiError(400, e.message);
        throw e;
      }
      audit({ actor, action: 'rueckruf', orderId, status });
      return { ok: true, eintrag };
    },

    /**
     * Produktdaten-Status: eine Zeile je PRODUKT (nicht je Variante/Feld -
     * das waeren bei 3.300 Varianten und ~10 Feldern mehrere zehntausend
     * Einzelpunkte und keine brauchbare Arbeitsliste). Dimension (Titel,
     * Gruppe, Varianten) kommt aus dem Einkauf-Dry-Run (plan.json), die
     * tatsaechlich noch offenen Felder aus dem frischeren Klaerungslauf
     * (einkauf-klaerung/offen.json) - plan.json selbst kann ein aelterer
     * Zwischenstand sein. Filter: 'blockierend' (nur was eine Bestellung
     * verhindert), 'handarbeit' (nur was eine Person klaeren muss),
     * '' = alle offenen Produkte.
     */
    einkaufProduktstatus({ page = 1, pageSize = 50, q = '', gruppe = '', filter = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const planFile = path.join(dir, 'einkauf-dryrun', 'plan.json');
      const offenFile = path.join(dir, 'einkauf-klaerung', 'offen.json');
      const planRows = readJsonIfExists(planFile);
      if (!Array.isArray(planRows)) return { verfuegbar: false, quelle: planFile, hinweis: 'plan.json fehlt - Einkauf-Dry-Run vorher lokal laufen lassen.' };
      const offenRows = readJsonIfExists(offenFile);
      if (!Array.isArray(offenRows)) return { verfuegbar: false, quelle: offenFile, hinweis: 'offen.json fehlt (einkauf-klaerung) - Klaerungslauf vorher lokal ausfuehren.' };

      const eintraege = produktstatusAufbauen(planRows, offenRows);
      const gruppen = {};
      for (const e of eintraege) {
        const g = gruppen[e.gruppe] || (gruppen[e.gruppe] = { gruppe: e.gruppe, vollstaendig: 0, handarbeit: 0, automatisch: 0 });
        g[e.status] += 1;
      }
      const gesamt = {
        anzahl: eintraege.length,
        vollstaendig: eintraege.filter(e => e.status === 'vollstaendig').length,
        handarbeit: eintraege.filter(e => e.status === 'handarbeit').length,
        automatisch: eintraege.filter(e => e.status === 'automatisch').length,
        // Rueckwaertskompatibel: "offen" = nicht vollstaendig.
        offen: eintraege.filter(e => e.status !== 'vollstaendig').length,
      };

      let offene = eintraege.filter(e => e.status !== 'vollstaendig');
      if (gruppe) offene = offene.filter(e => e.gruppe === gruppe);
      if (filter === 'blockierend') offene = offene.filter(e => e.blockiertBestellung);
      else if (filter === 'handarbeit') offene = offene.filter(e => e.status === 'handarbeit');
      if (q) offene = offene.filter(e => produktSucheTreffer(e, q));
      offene.sort((a, b) => b.dringlichkeit - a.dringlichkeit || a.titel.localeCompare(b.titel, 'de'));

      const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
      const p = Math.max(Number(page) || 1, 1);
      const start = (p - 1) * size;
      const seite = offene.slice(start, start + size);

      return {
        verfuegbar: true, quelle: `${planFile} + ${offenFile}`,
        gesamt, gruppen: Object.values(gruppen).sort((a, b) => (b.handarbeit + b.automatisch) - (a.handarbeit + a.automatisch)),
        offen: { count: offene.length, page: p, pageSize: size, pages: Math.max(Math.ceil(offene.length / size), 1), items: seite },
      };
    },

    /** Auftragsfluss-Status je Position, rein lokal (nie im Repository). */
    einkaufAuftragsstatus() {
      const dir = privatDirPath || privatDir();
      const file = auftragsstatusPfad(dir);
      const positionen = leseAuftragsstatus(file);
      return { verfuegbar: true, quelle: file, positionen };
    },

    /** Setzt den Status einer Bestellposition (Bestellt/Geliefert/Raus/Erledigt). */
    async einkaufAuftragsstatusSetzen(payload = {}, benutzer = null) {
      // Im Mehrbenutzerbetrieb ist der angemeldete Dashboard-Benutzer die handelnde Person -
      // gh-Anmeldung ist fuer diese rein lokale Aktion dann nicht mehr Voraussetzung. Ohne
      // Anmeldung (Notzugang) bleibt der bisherige gh-Login die handelnde Person.
      const actor = benutzer?.name || await currentUser();
      if (!actor) throw new ApiError(403, 'gh ist nicht angemeldet – keine Schreibaktion möglich');
      const { orderId, lineItemId, status, lieferantBestellnummer, notiz, aktion } = payload || {};
      if (!orderId || !lineItemId) throw new ApiError(400, 'orderId und lineItemId sind Pflicht', { missing: ['orderId', 'lineItemId'] });
      // "Wieder öffnen" macht einen Abschluss rueckgaengig (z. B. versehentlich "Ohne Einkauf
      // abschliessen"). Eigener Weg statt eines Pseudo-Status, damit der Abschluss im Verlauf
      // der Position erhalten bleibt statt ueberschrieben zu werden.
      if (aktion === 'wiederOeffnen') {
        const file = auftragsstatusPfad(privatDirPath || privatDir());
        let eintrag;
        try {
          eintrag = oeffneWieder(file, { orderId, lineItemId, actor, notiz, jetzt: now() });
        } catch (e) {
          if (e instanceof AuftragsstatusFehler) throw new ApiError(400, e.message);
          throw e;
        }
        audit({ actor, action: 'auftragsstatus-wieder-geoeffnet', orderId, lineItemId, status: eintrag.status });
        merke(benutzer, actor, 'Auftragsstatus wieder geöffnet', `${orderId}/${lineItemId}: ${eintrag.status || 'noch nicht bestellt'}`);
        return { ok: true, eintrag };
      }
      if (aktion) throw new ApiError(400, `Unbekannte Aktion „${aktion}"`);
      if (!STATUS_ORDER.includes(status)) throw new ApiError(400, `Unbekannter Status „${status}"`, { missing: [`Status muss einer von ${STATUS_ORDER.join(', ')} sein`] });
      const dir = privatDirPath || privatDir();
      const file = auftragsstatusPfad(dir);
      let eintrag;
      try {
        eintrag = setzeStatus(file, { orderId, lineItemId, status, actor, lieferantBestellnummer, notiz, jetzt: now() });
      } catch (e) {
        if (e instanceof AuftragsstatusFehler) throw new ApiError(400, e.message);
        throw e;
      }
      audit({ actor, action: 'auftragsstatus', orderId, lineItemId, status });
      merke(benutzer, actor, 'Auftragsstatus', `${orderId}/${lineItemId}: ${status}`);
      return { ok: true, eintrag };
    },

    /** Offene Klaerungsfaelle des Einkaufs, falls das Team sie bereits exportiert hat. */
    einkaufKlaerung() {
      const dir = privatDirPath || privatDir();
      const basis = path.join(dir, 'einkauf-klaerung');
      const klaerung = readJsonIfExists(path.join(basis, 'klaerung.json'));
      const offen = readJsonIfExists(path.join(basis, 'offen.json'));
      if (!klaerung && !offen) return { verfuegbar: false, quelle: basis, hinweis: 'Noch keine Klaerungsdaten exportiert (klaerung.json/offen.json fehlen).' };
      return { verfuegbar: true, quelle: basis, klaerung: klaerung || null, offen: offen || null };
    },

    /**
     * Shop-Kennzahlen der letzten 7/30 Tage fuer die Startseite "Heute".
     *
     * Erwartetes Format (noch kein Export vorhanden - siehe
     * docs/control-center/ARCHITEKTUR.md, Abschnitt 9):
     *   { erstellt, zeitraeume: { "7": {bestellungen, umsatz, waehrung, durchschnitt}, "30": {...} }, topProdukte: [...] }
     * Fehlt die Datei, liefert diese Funktion nur den Hinweis samt Befehl,
     * der den Export erzeugen wuerde - keine erfundenen Zahlen.
     */
    einkaufKennzahlen() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'kennzahlen', 'shop-snapshot.json');
      const daten = readJsonIfExists(file);
      if (!daten || !daten.zeitraeume) {
        return {
          verfuegbar: false,
          quelle: file,
          hinweis: 'Noch kein Export der Shop-Kennzahlen vorhanden.',
          befehl: 'npm run kennzahlen:export -- --ziel ' + file,
        };
      }
      return { verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, zeitraeume: daten.zeitraeume, topProdukte: daten.topProdukte || [] };
    },

    /**
     * Lexikon: "Kunde nennt den Produktnamen, wir finden das Original beim
     * Lieferanten" - Nachschlagewerk fuer den Kundenkontakt. Liest
     * ausschliesslich die lokale Exportdatei ($TP_PRIVAT_DIR/lexikon/produkte.json,
     * siehe domains/lexikon/ fuer das Format), nie im Repository. Suche und
     * Paginierung laufen serverseitig, damit die potenziell grosse Datei nie
     * komplett an den Browser geht.
     */
    lexikonListe({ q = '', page = 1, pageSize = 20 } = {}) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Lexikon-Daten exportiert.', befehl: 'npm run lexikon:export' };
      }
      const suchtext = String(q || '').trim().toLowerCase();
      const treffer = suchtext
        ? daten.produkte.filter(p => lexikonSucheTreffer(p, suchtext))
        : daten.produkte;
      const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
      const p = Math.max(Number(page) || 1, 1);
      const start = (p - 1) * size;
      const seite = treffer.slice(start, start + size).map(lexikonListenEintrag);
      return {
        verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, anzahl: daten.anzahl ?? daten.produkte.length,
        treffer: { count: treffer.length, page: p, pageSize: size, pages: Math.max(Math.ceil(treffer.length / size), 1), items: seite },
      };
    },

    /**
     * Mengenhilfe fuer den Bestellblock: Kundenmenge -> Bestellmenge beim
     * Lieferanten. Nutzt ausschliesslich operations/lib/umrechnung.mjs (keine
     * neuen Rechenregeln) - laesst sich die Bestelleinheit einer Variante
     * nicht sicher zuordnen oder fehlt eine noetige Produktangabe
     * (Rollenbreite, m² pro Paket), kommt ein ehrlicher UNGEKLAERT-Hinweis
     * statt einer geschaetzten Zahl.
     */
    lexikonMengenhilfe({ handle, variantenId, kundenmengeM2, kundenlaengeCm } = {}) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Lexikon-Daten exportiert.', befehl: 'npm run lexikon:export' };
      }
      const produkt = daten.produkte.find(p => p.handle === handle);
      if (!produkt) return { verfuegbar: false, hinweis: `Kein Produkt mit Handle "${handle}" im Lexikon.` };
      const variante = (produkt.varianten || []).find(v => v.id === variantenId) || (produkt.varianten || [])[0];
      if (!variante) return { verfuegbar: false, hinweis: 'Keine Variante gefunden.' };
      const einheit = variante.einkauf?.bestelleinheit;
      const flaeche = Number(String(kundenmengeM2 ?? '').replace(',', '.'));
      const laenge = Number(String(kundenlaengeCm ?? '').replace(',', '.'));

      if (einheit === 'paket' || einheit === 'm2') {
        const qm = produkt.eigenschaften?.qmProPaket;
        if (!qm) return { verfuegbar: true, ergebnis: null, grund: 'Bestellmenge ungeklaert - m² pro Paket ist am Produkt nicht hinterlegt' };
        if (!(flaeche > 0)) return { verfuegbar: true, ergebnis: null, grund: 'Kundenmenge (m²) eingeben' };
        try {
          const r = paketware({ bedarfM2: flaeche, qmProPaket: qm });
          return { verfuegbar: true, ergebnis: { text: `${r.pakete} Paket${r.pakete === 1 ? '' : 'e'} (${r.qmGesamt} m² gesamt)`, ...r } };
        } catch (e) { return { verfuegbar: true, ergebnis: null, grund: String(e.message) }; }
      }
      if (einheit === 'rolle' || einheit === 'lfm') {
        const breiteText = produkt.eigenschaften?.rollenbreite;
        const breiteM = breiteText ? Number(String(breiteText).replace(',', '.')) / 100 : null;
        if (!breiteM) return { verfuegbar: true, ergebnis: null, grund: 'Bestellmenge ungeklaert - Rollenbreite ist am Produkt nicht hinterlegt' };
        if (!(flaeche > 0) && !(laenge > 0)) return { verfuegbar: true, ergebnis: null, grund: 'Kundenmenge (m² oder Länge in cm) eingeben' };
        try {
          const r = rollenware({ flaecheM2: flaeche > 0 ? flaeche : undefined, laengeCm: laenge > 0 ? laenge : undefined, breiteM });
          const rasterHinweis = r.raster === MENGE_UNGEKLAERT ? ' (Lieferantenraster ungeklärt, auf 1 cm genau)' : '';
          return { verfuegbar: true, ergebnis: { text: `${r.text}${rasterHinweis}`, ...r } };
        } catch (e) { return { verfuegbar: true, ergebnis: null, grund: String(e.message) }; }
      }
      if (einheit === 'stueck') {
        if (!(flaeche > 0)) return { verfuegbar: true, ergebnis: null, grund: 'Kundenmenge (Stück) eingeben' };
        try {
          const r = stueckware({ menge: flaeche });
          return { verfuegbar: true, ergebnis: { text: `${r.stueck} Stück`, ...r } };
        } catch (e) { return { verfuegbar: true, ergebnis: null, grund: String(e.message) }; }
      }
      return { verfuegbar: true, ergebnis: null, grund: einheit ? `Bestellmenge ungeklaert - Umrechnung fuer "${einheit}" ist noch nicht hinterlegt` : 'Bestellmenge ungeklaert - Bestelleinheit ist am Produkt nicht hinterlegt' };
    },

    /** Ein einzelnes Lexikon-Produkt fuer die Detailansicht (per Handle). */
    lexikonProdukt(handle) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'lexikon', 'produkte.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.produkte)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Lexikon-Daten exportiert.', befehl: 'npm run lexikon:export' };
      }
      const produkt = daten.produkte.find(p => p.handle === handle);
      if (!produkt) return { verfuegbar: false, quelle: file, hinweis: `Kein Produkt mit Handle "${handle}" im Lexikon.` };
      // Rueckweg zum Kunden: wer wartet gerade auf genau dieses Produkt? Wer im
      // Kundengespraech nachschlaegt, sieht so sofort, dass da noch etwas offen
      // ist - ohne in die Kundenliste zu wechseln.
      const wartende = this.kundenFaelle?.() ?? { verfuegbar: false };
      const offen = wartende.verfuegbar
        ? (wartende.faelle ?? []).flatMap(k => (k.punkte ?? [])
          .filter(pt => (pt.produkte ?? []).some(pr => pr.handle === handle))
          .map(pt => ({ kunde: k.name, schluessel: k.schluessel, bezug: pt.bezug, schritt: pt.schritt.text, tage: pt.tage })))
        : [];
      return { verfuegbar: true, quelle: file, produkt, wartendeKunden: offen };
    },

    /**
     * Kunden als eigene Datenart (nicht aus Bestellungen abgeleitet) - liest
     * die von operations/scripts/aktualisieren.mjs (Teil "kunden") bereits
     * aufbereitete Datei. Lesend, nur mit optionaler Textsuche ueber Name/
     * E-Mail/Telefon, damit die potenziell grosse Datei nicht komplett an
     * den Browser geht.
     */
    kundenListe({ q = '' } = {}) {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'kunden', 'kunden.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.kunden)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Kundendaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur kunden' };
      }
      const suchtext = String(q || '').trim().toLowerCase();
      const kunden = suchtext
        ? daten.kunden.filter(k => [k.name, k.email, k.telefon].filter(Boolean).some(f => String(f).toLowerCase().includes(suchtext)))
        : daten.kunden;
      return { verfuegbar: true, quelle: file, erstellt: daten.erstellt || null, anzahl: daten.anzahl ?? daten.kunden.length, kunden };
    },

    // -- Aufgaben & Organisation ------------------------------------------
    // Jede Leseabfrage filtert serverseitig nach Sichtbarkeit: persoenliche
    // Notizen duerfen das Geraet eines anderen Benutzers nie erreichen. Ein
    // Ausblenden allein in der Oberflaeche waere kein Schutz.

    _orgDatei() { return orgDatei(privatDirPath || privatDir()); },

    _orgSichtbar(daten, benutzer) { return daten.eintraege.filter(e => darfSehen(e, benutzer)); },

    /** Team aus dem vorhandenen Benutzersystem - keine fest verdrahtete Namensliste. */
    orgTeam() {
      try {
        return orgLeseBenutzer().filter(b => b.aktiv !== false)
          .map(b => ({ name: b.name, kuerzel: b.kuerzel || b.name, rolle: b.rolle }));
      } catch { return []; }
    },

    /** bereich: meine-aufgaben | meine-notizen | team-aufgaben | team-notizen | archiv */
    orgListe({ bereich = 'meine-aufgaben', ansicht = 'fokus', person = '', gruppe = 'kunden', q = '', benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const jetzt = new Date();
      const ich = benutzer?.kuerzel || benutzer?.name || 'inhaber';
      const suchtext = String(q || '').trim().toLowerCase();
      let liste = this._orgSichtbar(daten, benutzer);

      if (bereich === 'meine-aufgaben') {
        // Zugewiesenes plus herrenlose Technik: fuer Website und Shop bin ich
        // zustaendig, auch ohne Namen. Unzugewiesenes Geschaeftliches dagegen
        // steht im Team - sonst sammelt sich bei dem, der es aufgeschrieben
        // hat, Arbeit an, die er gar nicht macht.
        liste = liste.filter(e => e.typ === 'TASK'
          && (istPerson(e.verantwortlich, ich) || (!e.verantwortlich && istTechnisch(e.bereich))));
        if (ansicht && ansicht !== 'alle') liste = liste.filter(e => passtZuAnsicht(e, ansicht, jetzt));
      } else if (bereich === 'meine-notizen') {
        liste = liste.filter(e => e.typ === 'NOTE' && istPerson(e.besitzer, ich) && e.sichtbarkeit === 'PRIVAT');
      } else if (bereich === 'team-aufgaben') {
        // Das Team hat mit Shop und Website nichts zu tun - was dort auftaucht,
        // sucht dort niemand. Standardmaessig zeigt die Liste das, wofuer das
        // Team ueberhaupt hereinschaut: Kunden, Bestellungen, kleine Auftraege.
        liste = liste.filter(e => e.typ === 'TASK' && e.sichtbarkeit !== 'PRIVAT' && !istTechnisch(e.bereich));
        // Ohne Bereich bleibt ein Eintrag sichtbar - sonst verschwindet er
        // genau dort, wo ihn jemand einsortieren muesste.
        if (gruppe === 'kunden') liste = liste.filter(e => !e.bereich || istTeamarbeit(e.bereich));
        else if (gruppe === 'rest') liste = liste.filter(e => e.bereich && !istTeamarbeit(e.bereich));
        if (person === 'unzugewiesen') liste = liste.filter(e => !e.verantwortlich);
        else if (person) liste = liste.filter(e => istPerson(e.verantwortlich, person));
        if (ansicht && ansicht !== 'alle') liste = liste.filter(e => passtZuAnsicht(e, ansicht, jetzt));
      } else if (bereich === 'team-notizen') {
        liste = liste.filter(e => e.typ === 'NOTE' && e.sichtbarkeit !== 'PRIVAT');
      } else if (bereich === 'archiv') {
        liste = liste.filter(e => e.status === 'DONE');
      }

      if (suchtext) {
        liste = liste.filter(e => [e.titel, e.beschreibung, e.bereich, e.verantwortlich,
          ...(e.kommentare ?? []).map(k => k.text)].filter(Boolean)
          .some(f => String(f).toLowerCase().includes(suchtext)));
      }
      return {
        verfuegbar: true, quelle: datei, bereiche: daten.bereiche, team: this.orgTeam(), ich,
        anzahl: liste.length, eintraege: orgSortiere(liste, jetzt).slice(0, 200),
      };
    },

    /**
     * Der Stand als Text fuer ChatGPT. Ohne ihn liefert ChatGPT jedes Mal
     * dieselben Punkte neu - es kann ja nicht wissen, was schon dasteht.
     */
    orgExportText({ benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const ich = benutzer?.kuerzel || benutzer?.name || 'inhaber';
      const offen = this._orgSichtbar(daten, benutzer)
        .filter(e => e.typ === 'TASK' && e.status !== 'DONE');
      const zeile = (e) => {
        const wer = istPerson(e.verantwortlich, ich) ? 'ich'
          : e.verantwortlich ? e.verantwortlich
          : istTechnisch(e.bereich) ? 'ich' : 'Team';
        const was = String(e.beschreibung || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        return `- [${e.bereich || 'Sonstiges'}] ${e.titel} (${wer}${e.faellig ? `, bis ${e.faellig}` : ''})${was ? ` :: ${was}` : ''}`;
      };
      const meine = offen.filter(e => istPerson(e.verantwortlich, ich) || (!e.verantwortlich && istTechnisch(e.bereich)));
      const rest = offen.filter(e => !meine.includes(e));
      const text = [
        `Stand vom ${new Date().toLocaleDateString('de-DE')} - das steht bereits im Dashboard.`,
        'Leg nichts davon noch einmal an; ergaenze nur, was fehlt, oder sag mir, was sich geaendert hat.',
        '',
        `Meine Aufgaben (${meine.length}):`,
        ...(meine.length ? meine.map(zeile) : ['- (nichts offen)']),
        '',
        `Team (${rest.length}):`,
        ...(rest.length ? rest.map(zeile) : ['- (nichts offen)']),
      ].join('\n');
      return { verfuegbar: true, anzahl: offen.length, text };
    },

    /**
     * Fotos vom fertigen Raum. Sie landen als Eintrag im Aufgabensystem -
     * damit haengen Anhaenge, Verlauf und Freigabe schon dran, statt dass
     * daneben ein zweiter Speicher entsteht, in den keiner schaut.
     */
    fotosNeu({ auftrag = '', boden = '', notiz = '', einwilligung = false, fotos = [] } = {}, { benutzer = null } = {}) {
      let eingang;
      try { eingang = pruefeEingang({ auftrag, boden, einwilligung, fotos }); }
      catch (e) { throw new ApiError(400, e instanceof FotoFehler ? e.message : 'Eingabe unvollständig'); }

      const treffer = eingang.boden ? passendeProdukte(eingang.boden, this._lexikonProdukte()) : [];
      const hinweis = produktHinweis(treffer);
      const text = [
        eingang.boden ? `Verlegter Boden laut Auftragszettel: ${eingang.boden}.` : '',
        hinweis.text,
        String(notiz || '').trim(),
        'Der Kunde hat der Verwendung der Fotos zugestimmt.',
      ].filter(Boolean).map(t => (/[.!?]$/.test(t) ? t : `${t}.`)).join(' ');

      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = baueEintrag({
        typ: 'TASK',
        titel: titelFuer(eingang),
        beschreibung: text,
        bereich: 'Marketing',
        status: 'INBOX',
        erfolgskriterium: 'Beitrag ist veröffentlicht oder bewusst verworfen.',
        verknuepft: {
          art: FOTO_ART,
          auftrag: eingang.auftrag || null,
          boden: eingang.boden || null,
          produkt: hinweis.handle,
          produktTitel: hinweis.titel,
          farbe: hinweis.farbe ?? null,
          sicher: hinweis.sicher,
          einwilligung: true,
        },
      }, { benutzer });

      const abgelegt = [];
      try {
        for (const f of fotos) {
          abgelegt.push(speichereAnhang(eintrag, f, { dir: privatDirPath || privatDir(), benutzer }));
        }
      } catch (e) { throw new ApiError(400, e.message); }

      daten.eintraege.push(eintrag);
      orgSchreib(daten, datei);
      return { ok: true, id: eintrag.id, anzahl: abgelegt.length, produkt: hinweis, eintrag };
    },

    /** Was bisher hereingekommen ist - neueste zuerst. */
    fotosListe({ offen = false, benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      let liste = this._orgSichtbar(daten, benutzer).filter(e => e.verknuepft?.art === FOTO_ART);
      if (offen) liste = liste.filter(e => e.status !== 'DONE');
      liste.sort((a, b) => String(b.erstelltAm).localeCompare(String(a.erstelltAm)));
      return {
        verfuegbar: true,
        anzahl: liste.length,
        eintraege: liste.slice(0, 100).map(e => ({
          id: e.id, titel: e.titel, status: e.status, beschreibung: e.beschreibung,
          erstelltAm: e.erstelltAm, wer: e.besitzer, ...e.verknuepft,
          fotos: (e.anhaenge ?? []).map(a => ({ datei: a.datei, name: a.name, typ: a.typ })),
        })),
      };
    },

    /** Produktvorschlaege zu einem Bodennamen - fuer die Eingabe unterwegs. */
    fotosProdukt({ boden = '' } = {}) {
      const treffer = passendeProdukte(boden, this._lexikonProdukte());
      return {
        verfuegbar: true,
        hinweis: produktHinweis(treffer),
        vorschlaege: treffer.map(t => ({ handle: t.produkt.handle, titel: t.produkt.titel })),
      };
    },

    _lexikonProdukte() {
      const file = path.join(privatDirPath || privatDir(), 'lexikon', 'produkte.json');
      const daten = readJsonIfExists(file);
      return Array.isArray(daten?.produkte) ? daten.produkte : [];
    },

    /**
     * Team verwalten - bisher ging das nur im Terminal, deshalb gab es bis
     * heute keinen einzigen Mitarbeiterzugang. Ohne Zugaenge bleibt jede
     * Rechteregelung wirkungslos: alles laeuft als "Inhaber".
     */
    _benutzerDatei() { return path.join(privatDirPath || privatDir(), 'benutzer.json'); },

    teamListe() {
      const liste = orgLeseBenutzer(this._benutzerDatei());
      return {
        verfuegbar: true,
        rollen: ROLLEN,
        eingerichtet: liste.length > 0,
        benutzer: liste.map(b => ({
          name: b.name, kuerzel: b.kuerzel, rolle: b.rolle, aktiv: b.aktiv !== false,
        })),
      };
    },

    /**
     * Anlegen, Rolle aendern, Passwort neu setzen, sperren. Passwoerter werden
     * nur als Hash gespeichert (operations/lib/benutzer.mjs) und nie
     * zurueckgegeben - auch nicht an den Inhaber.
     */
    teamAendern({ was = '', name = '', kuerzel = '', passwort = '', rolle = '' } = {}, { benutzer = null } = {}) {
      // Serverseitig pruefen, nicht nur im Frontend: wer kein Inhaber ist,
      // darf hier nichts - auch nicht ueber einen selbstgebauten Aufruf.
      if (benutzer && benutzer.rolle !== 'inhaber') throw new ApiError(403, 'Nur der Inhaber darf das Team verwalten');
      const datei = this._benutzerDatei();
      const liste = orgLeseBenutzer(datei);
      try {
        let neu;
        if (was === 'anlegen') {
          // Der erste Zugang MUSS der Inhaber sein. Sobald benutzer.json
          // existiert, verlangt jede Seite eine Anmeldung - wer als erstes
          // einen Mitarbeiter anlegt, sperrt sich selbst aus.
          const ersterZugang = liste.length === 0;
          const gewuenscht = ersterZugang ? 'inhaber' : (rolle || 'mitarbeiter');
          if (ersterZugang && rolle && rolle !== 'inhaber') {
            throw new BenutzerFehler('Der erste Zugang muss dein eigener sein (Rolle „Inhaber") – sonst kommst du selbst nicht mehr herein');
          }
          neu = benutzerAnlegen(liste, { name, kuerzel, passwort, rolle: gewuenscht });
        } else if (was === 'passwort') {
          neu = passwortSetzen(liste, kuerzel, passwort);
        } else if (was === 'rolle') {
          validiereRolle(rolle);
          const idx = liste.findIndex(b => String(b.kuerzel).toLowerCase() === String(kuerzel).toLowerCase());
          if (idx < 0) throw new BenutzerFehler(`Benutzer „${kuerzel}" nicht gefunden`);
          // Der letzte aktive Inhaber darf sich nicht selbst entmachten -
          // sonst kann niemand mehr Zugaenge verwalten.
          if (liste[idx].rolle === 'inhaber' && rolle !== 'inhaber'
            && liste.filter(b => b.rolle === 'inhaber' && b.aktiv !== false).length <= 1) {
            throw new BenutzerFehler('Das ist der einzige Inhaber - sonst kann niemand mehr Zugänge verwalten');
          }
          neu = liste.slice();
          neu[idx] = { ...neu[idx], rolle };
        } else if (was === 'sperren' || was === 'entsperren') {
          const ziel = liste.find(b => String(b.kuerzel).toLowerCase() === String(kuerzel).toLowerCase());
          if (ziel?.rolle === 'inhaber' && was === 'sperren'
            && liste.filter(b => b.rolle === 'inhaber' && b.aktiv !== false).length <= 1) {
            throw new BenutzerFehler('Das ist der einzige Inhaber - er lässt sich nicht sperren');
          }
          neu = benutzerDeaktivieren(liste, kuerzel, was === 'entsperren');
        } else {
          throw new BenutzerFehler('Unbekannte Aktion');
        }
        schreibeBenutzer(neu, datei);
        merke(benutzer, benutzer?.kuerzel || 'inhaber', 'Team', `${was}: ${kuerzel || name}`);
        // Sperre, Rollenwechsel und neues Passwort gelten sofort - die
        // laufenden Sitzungen dieses Zugangs verlieren damit ihre Wirkung.
        if (['sperren', 'rolle', 'passwort'].includes(was) && typeof sitzungenVerwerfen === 'function') {
          try { sitzungenVerwerfen(kuerzel); } catch { /* Abmelden darf die Aenderung nicht verhindern */ }
        }
        return { ok: true, ersterZugang: liste.length === 0, ...this.teamListe() };
      } catch (e) {
        if (e instanceof BenutzerFehler) throw new ApiError(400, e.message);
        throw e;
      }
    },

    orgKennzahlen({ benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const jetzt = new Date();
      const ich = benutzer?.kuerzel || benutzer?.name || 'inhaber';
      const sichtbar = this._orgSichtbar(daten, benutzer).filter(e => e.typ === 'TASK');
      const meine = sichtbar.filter(e => istPerson(e.verantwortlich, ich)
        || (!e.verantwortlich && istTechnisch(e.bereich)));
      // Die Team-Kennzahl zaehlt alles, was im Team-Reiter steht - nur
      // Technisches nicht, dafuer ist das Team nicht zustaendig.
      const teamArbeit = sichtbar.filter(e => !istTechnisch(e.bereich) && e.sichtbarkeit !== 'PRIVAT');
      const zaehl = (l) => ({
        offen: l.filter(e => e.status !== 'DONE').length,
        heute: l.filter(e => e.status !== 'DONE' && tageBis(e.faellig, jetzt) === 0).length,
        dringend: l.filter(e => e.status !== 'DONE' && e.prioritaet === 'URGENT').length,
        warten: l.filter(e => e.status === 'WAITING').length,
        pruefung: l.filter(e => e.status === 'REVIEW').length,
        ueberfaellig: l.filter(e => istUeberfaellig(e, jetzt)).length,
      });
      return {
        verfuegbar: true, meine: zaehl(meine),
        team: zaehl(teamArbeit),
        naechste: orgSortiere(meine.filter(e => passtZuAnsicht(e, 'fokus', jetzt)), jetzt).slice(0, 5),
      };
    },

    /** Vorschlag zu einer Eingabe - ohne zu speichern, samt moeglicher Doppelgaenger. */
    orgAnalyse({ text = '', benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const vorschlag = orgAnalysiere(text, { mitarbeiter: this.orgTeam(), bereiche: daten.bereiche, benutzer });
      const doppelt = findeDoppelgaenger(text, this._orgSichtbar(daten, benutzer))
        .map(d => ({ id: d.eintrag.id, titel: d.eintrag.titel, status: d.eintrag.status, wert: Math.round(d.wert * 100) }));
      return { verfuegbar: true, vorschlag, doppelgaenger: doppelt };
    },

    /**
     * Liste einfuegen: eine Zeile je Aufgabe. So kommen Sammlungen aus
     * ChatGPT, aus einer Mail oder vom Zettel herein. Erst Vorschau
     * (`speichern: false`), dann Anlegen - jede Zeile mit Duplikatpruefung.
     */
    orgListeEinfuegen({ text = '', speichern = false, zeilen = null } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const sichtbar = this._orgSichtbar(daten, benutzer);

      if (!speichern) {
        const vorschlaege = orgAusListe(text, { mitarbeiter: this.orgTeam(), bereiche: daten.bereiche, benutzer });
        return {
          verfuegbar: true,
          anzahl: vorschlaege.length,
          vorschlaege: vorschlaege.map(v => ({
            ...v,
            doppelgaenger: findeDoppelgaenger(v.titel, sichtbar)
              .map(d => ({ id: d.eintrag.id, titel: d.eintrag.titel, status: d.eintrag.status, wert: Math.round(d.wert * 100) })),
          })),
        };
      }

      const anzulegen = Array.isArray(zeilen) ? zeilen : [];
      const angelegt = [];
      for (const roh of anzulegen) {
        angelegt.push(baueEintrag(roh, { benutzer }));
      }
      daten.eintraege.push(...angelegt);
      if (angelegt.length) orgSchreib(daten, datei);
      return { ok: true, angelegt: angelegt.length, eintraege: angelegt };
    },

    orgNeu(roh = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = baueEintrag(roh, { benutzer });
      daten.eintraege.push(eintrag);
      orgSchreib(daten, datei);
      return { ok: true, eintrag };
    },

    orgAendern({ id, felder = {} } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = findeEintrag(daten, id);
      if (!eintrag) throw new ApiError(404, 'Eintrag nicht gefunden');
      if (!darfSehen(eintrag, benutzer) || !darfAendern(eintrag, benutzer)) throw new ApiError(403, 'Keine Berechtigung für diesen Eintrag');
      // Wiederholung wird als eigenes Objekt gefuehrt, deshalb hier gesetzt.
      if ('wiederholungRegel' in felder) {
        const regel = felder.wiederholungRegel || null;
        eintrag.wiederholung = regel ? { regel, naechsteFaelligkeit: null, zuletztErzeugt: null } : null;
        eintrag.verlauf.push({ zeit: new Date().toISOString(), wer: benutzer?.kuerzel || benutzer?.name || 'inhaber', was: regel ? `Wiederholung auf ${regel} gesetzt` : 'Wiederholung entfernt' });
        delete felder.wiederholungRegel;
      }
      orgAendere(eintrag, felder, { benutzer });
      orgSchreib(daten, datei);
      return { ok: true, eintrag };
    },

    orgKommentar({ id, text = '' } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const daten = orgLies(datei);
      const eintrag = findeEintrag(daten, id);
      if (!eintrag) throw new ApiError(404, 'Eintrag nicht gefunden');
      if (!darfSehen(eintrag, benutzer)) throw new ApiError(403, 'Keine Berechtigung für diesen Eintrag');
      orgKommentiere(eintrag, text, { benutzer });
      orgSchreib(daten, datei);
      return { ok: true, eintrag };
    },

    /**
     * Prüflauf anstoßen (Knopf im Dashboard und die tägliche Ausführung um
     * 9:30 nutzen denselben Weg). Erledigt wird nur, was gemessen wurde.
     */
    async orgPruefen({ id = null } = {}, { benutzer = null } = {}) {
      const { laufe } = await import('../operations/scripts/aufgaben-pruefen.mjs');
      const ergebnis = await laufe({ datei: this._orgDatei(), id });
      return { ok: true, ...ergebnis };
    },

    /** Anhang hochladen (Base64 im Rumpf - kein Multipart noetig). */
    orgAnhang({ id, name, typ, daten } = {}, { benutzer = null } = {}) {
      const datei = this._orgDatei();
      const gespeichert = orgLies(datei);
      const eintrag = findeEintrag(gespeichert, id);
      if (!eintrag) throw new ApiError(404, 'Eintrag nicht gefunden');
      if (!darfSehen(eintrag, benutzer) || !darfAendern(eintrag, benutzer)) throw new ApiError(403, 'Keine Berechtigung für diesen Eintrag');
      let anhang;
      try {
        anhang = speichereAnhang(eintrag, { name, typ, daten }, { dir: privatDirPath || privatDir(), benutzer });
      } catch (e) { throw new ApiError(400, e.message); }
      orgSchreib(gespeichert, datei);
      return { ok: true, anhang, eintrag };
    },

    /** Anhang ausliefern - nur wer den Eintrag sehen darf. */
    orgAnhangLesen({ id = '', datei = '', benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const eintrag = findeEintrag(daten, id);
      if (!eintrag || !darfSehen(eintrag, benutzer)) throw new ApiError(404, 'Nicht gefunden');
      const anhang = (eintrag.anhaenge ?? []).find(a => a.datei === datei);
      if (!anhang) throw new ApiError(404, 'Anhang nicht gefunden');
      const pfad = anhangPfad(id, datei, privatDirPath || privatDir());
      return { pfad, typ: anhang.typ, name: anhang.name };
    },

    orgEintrag({ id = '', benutzer = null } = {}) {
      const daten = orgLies(this._orgDatei());
      const eintrag = findeEintrag(daten, id);
      if (!eintrag || !darfSehen(eintrag, benutzer)) return { verfuegbar: false, hinweis: 'Eintrag nicht gefunden oder nicht freigegeben.' };
      return { verfuegbar: true, eintrag, darfAendern: darfAendern(eintrag, benutzer) };
    },

    /**
     * Ergebnis der Shop-Wache (operations/scripts/shopwache.mjs). Zeigt, ob
     * der oeffentliche Shop laeuft - das sieht man den Admin-Daten nicht an.
     */
    shopwacheStatus() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'shopwache', 'status.json');
      const daten = readJsonIfExists(file);
      if (!daten || !daten.geprueftAm) {
        return { verfuegbar: false, quelle: file, hinweis: 'Shop-Wache noch nie gelaufen.', befehl: 'npm run shop:wache' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /**
     * Alles offene je Kunde in einem Eintrag - Bestellungen, Angebote und
     * liegengebliebene Warenkoerbe zusammengefuehrt. Beantwortet die Frage,
     * in der im Laden gedacht wird: wer wartet auf was.
     */
    kundenFaelle() {
      const dir = privatDirPath || privatDir();
      const modell = ladeBestellModell(dir);
      if (!modell) {
        return { verfuegbar: false, quelle: path.join(dir, 'bestelluebersicht', 'orders.json'), hinweis: 'orders.json fehlt.' };
      }
      const statusAlle = leseAuftragsstatus(auftragsstatusPfad(dir));
      const rueckrufeAlle = leseRueckrufe(rueckrufePfad(dir));
      const bestellzeilen = bestellliste(modell, { statusAlle, rueckrufeAlle });
      const angebote = readJsonIfExists(path.join(dir, 'angebote', 'angebote.json'))?.angebote ?? [];
      const warenkoerbe = readJsonIfExists(path.join(dir, 'warenkoerbe', 'warenkoerbe.json'))?.warenkoerbe ?? [];
      return { verfuegbar: true, ...kundenFaelle({ bestellzeilen, angebote, warenkoerbe }) };
    },

    /** Angebote/Entwuerfe (DraftOrder) - Mass-/Verlegeangebote, die noch keine Bestellung sind. */
    angeboteListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'angebote', 'angebote.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.angebote)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Angebotsdaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur angebote' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /** Abgebrochene Warenkoerbe der letzten 30 Tage - verlorener Umsatz. */
    warenkoerbeListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'warenkoerbe', 'warenkoerbe.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.warenkoerbe)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Warenkorb-Daten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur warenkoerbe' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /** Lagerbestand je Standort/Variante - oder der Hinweis, dass der Shop keinen fuehrt. */
    bestandListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'bestand', 'bestand.json');
      const daten = readJsonIfExists(file);
      if (!daten) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Bestandsdaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur bestand' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /** Erfuellungen (Sendungen) und Rueckerstattungen je Bestellung. */
    erfuellungListe() {
      const dir = privatDirPath || privatDir();
      const file = path.join(dir, 'erfuellung', 'erfuellung.json');
      const daten = readJsonIfExists(file);
      if (!daten || !Array.isArray(daten.eintraege)) {
        return { verfuegbar: false, quelle: file, hinweis: 'Noch keine Erfuellungsdaten exportiert.', befehl: 'npm run daten:aktualisieren -- --nur bestellungen' };
      }
      return { verfuegbar: true, quelle: file, ...daten };
    },

    /**
     * Stand je lokaler Datenquelle (Lexikon, Bestelluebersicht, Kennzahlen),
     * geschrieben von operations/scripts/aktualisieren.mjs
     * ($TP_PRIVAT_DIR/aktualisierung.json). Liefert rohe Zeitstempel plus
     * eine je Teil vorgerechnete Alters-Einschaetzung - die Oberflaeche
     * (docs/ai-dashboard/app.js, systemHealth()) zeigt daraus "Stand: …" und
     * warnt ab 24 Stunden. Fehlt die Datei (noch nie gelaufen), ist das kein
     * Fehler, nur ein leerer Zustand mit dem Befehl, der sie anlegen wuerde.
     */
    aktualisierung() {
      return leseAktualisierungsstand();
    },

    /**
     * Startet `operations/scripts/aktualisieren.mjs` (npm run daten:aktualisieren)
     * als eigenen Kindprozess - fuer den Knopf "Jetzt aktualisieren" in Heute/
     * Einkauf, damit ein Mitarbeiter nach einem Kundenanruf sofort den
     * aktuellen Stand holen kann, statt auf den naechsten geplanten Lauf zu
     * warten (siehe docs/control-center/ARCHITEKTUR.md Abschnitt 10).
     *
     * Feste Argumentliste (node + Skriptpfad, keine Nutzereingabe) - kein
     * Shell-Einschleusen moeglich. Nur ein Lauf gleichzeitig: ein zweiter
     * Aufruf waehrend eines laufenden Prozesses startet nichts neu und meldet
     * `laeuft: true`. Schlaegt ein Teil fehl (z. B. kein Zugang), bleiben seine
     * Ausgabedatei und sein letzter erfolgreicher Stand erhalten; aktualisieren.mjs
     * vermerkt den Fehlschlag daneben als `letzterFehler` (standNachLauf), kein
     * stiller Fehlschlag.
     */
    aktualisierungStarten() {
      if (aktualisierungLauf) {
        return { gestartet: false, laeuft: true, seit: aktualisierungLauf.seit, hinweis: 'Aktualisierung läuft bereits.' };
      }
      const seit = now().toISOString();
      const skript = path.join(root, 'operations', 'scripts', 'aktualisieren.mjs');
      const lauf = { seit, fehler: null, fertig: false };
      aktualisierungLauf = lauf;
      audit({ action: 'aktualisierung-start' });
      execFileP(process.execPath, [skript], { cwd: root, timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 })
        .then(() => { lauf.fertig = true; })
        .catch(err => { lauf.fertig = true; lauf.fehler = String(err?.message || err).split('\n')[0].slice(0, 500); })
        .finally(() => { if (aktualisierungLauf === lauf) aktualisierungLauf = null; });
      return { gestartet: true, laeuft: true, seit };
    },

    /**
     * Status fuer den Knopf: laeuft gerade ein Prozess (seit wann), plus der
     * zuletzt geschriebene Stand je Datenquelle (dieselbe Form wie
     * `aktualisierung()`). Wird per Abfrage gepollt (kein Warten im Request).
     */
    aktualisierungStatus() {
      const stand = leseAktualisierungsstand();
      if (aktualisierungLauf) return { ...stand, laeuft: true, seit: aktualisierungLauf.seit };
      return { ...stand, laeuft: false, seit: null };
    },
  };

  function leseAktualisierungsstand() {
    const dir = privatDirPath || privatDir();
    const file = path.join(dir, 'aktualisierung.json');
    const daten = readJsonIfExists(file);
    if (!daten || !daten.teile) {
      return { verfuegbar: false, quelle: file, hinweis: 'Noch kein Lauf von daten:aktualisieren vorhanden.', befehl: 'npm run daten:aktualisieren' };
    }
    const jetzt = now().getTime();
    const SCHWELLE_MS = 24 * 60 * 60 * 1000;
    const teile = {};
    for (const [teil, stand] of Object.entries(daten.teile)) {
      const alterMs = stand?.zeitpunkt ? jetzt - new Date(stand.zeitpunkt).getTime() : null;
      teile[teil] = { ...stand, alterMs, veraltet: alterMs === null ? null : alterMs > SCHWELLE_MS };
    }
    return { verfuegbar: true, quelle: file, aktualisiertAm: daten.aktualisiertAm || null, teile };
  }
}

/** Sucht ueber Produktname, Handle, SKU, Lieferanten-Artikelnummer, Farbe und Kollektion. */
function lexikonSucheTreffer(p, suchtext) {
  const felder = [p.titel, p.handle];
  for (const v of p.varianten || []) {
    felder.push(v.sku, v.farbe, v.einkauf?.artikelnummer, v.einkauf?.kollektion, v.einkauf?.produktname);
  }
  return felder.some(f => typeof f === 'string' && f.toLowerCase().includes(suchtext));
}

/** Zeilenform fuer die Trefferliste: Bild, Produktname, Produktgruppe, Anzahl Farben, Preis ab, Link-Zeichen. */
function lexikonListenEintrag(p) {
  const varianten = p.varianten || [];
  const farben = new Set(varianten.map(v => v.farbe).filter(Boolean));
  // Betrag und Einheit muessen aus derselben Variante kommen. Sonst stand an
  // einem Paketpreis die Einheit einer anderen Variante ("ab 19,50 €/m²",
  // obwohl 19,50 der Paketpreis war).
  const kandidaten = varianten
    .map(v => (v.preisJeEinheit && typeof v.preisJeEinheit.betrag === 'number')
      ? { betrag: v.preisJeEinheit.betrag, einheit: v.preisJeEinheit.einheit }
      : (typeof v.preis === 'number' ? { betrag: v.preis, einheit: null } : null))
    .filter(Boolean);
  const guenstigste = kandidaten.length
    ? kandidaten.reduce((a, b) => (b.betrag < a.betrag ? b : a))
    : null;
  const preisAb = guenstigste ? guenstigste.betrag : null;
  const preisEinheit = guenstigste ? guenstigste.einheit : null;
  // Muster haben "original" statt "link"; ein Produkt gilt als verlinkt, wenn
  // jede echte Variante einen Link hat bzw. jede Mustervariante ein Original.
  const linkRelevant = varianten.filter(v => v.link || v.original);
  const linkVorhanden = linkRelevant.length > 0 && linkRelevant.every(v => (v.link ? v.link.status === 'vorhanden' : v.original?.gefunden));
  return {
    handle: p.handle, titel: p.titel, produktgruppe: p.produktgruppe || null, bild: p.bild || null, status: p.status || null,
    farbenAnzahl: farben.size, preisAb, preisEinheit, linkVorhanden,
  };
}

export { STATUS_LABELS };
