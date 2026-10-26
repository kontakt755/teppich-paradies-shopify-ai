/**
 * Bausteine fuer das automatische Nachziehen des Dienst-Checkouts (~/tp-dashboard).
 * Der Ablauf selbst steht in operations/scripts/betrieb-nachziehen.mjs; hier liegt,
 * was sich ohne git und launchd pruefen laesst: Ruhe von Codex und Oberflaeche,
 * welche Dienste neu starten muessen, und der Zustand fuer den Systemzustand.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ZUSTAND_DATEI = 'betrieb-nachziehen.json';
export const VERLAUF_MAX = 30;

/** Dateien im Privatordner, die nicht von Klicks im Dashboard stammen. */
const KEINE_EINGABE = [/\.log$/, /^aktualisierung(-vorher)?\.json$/, /^betrieb-nachziehen\.(json|lock)$/, /^\./];

/**
 * Ist es im Dashboard gerade ruhig? Jede Schreibaktion der Oberflaeche landet als Datei
 * direkt im Privatordner (Packhaken, Auftragsstatus, Protokoll). Unterordner schreibt der
 * Sync-Dienst; sie zaehlen nicht, sonst kaeme nie eine ruhige Minute.
 */
export function privatRuhe(dir, { jetzt = new Date(), sekunden = 120 } = {}) {
  let juengste = null;
  let eintraege = [];
  try { eintraege = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return { ruhig: true, datei: null, alterSekunden: null }; throw e; }
  for (const e of eintraege) {
    if (!e.isFile() || KEINE_EINGABE.some(r => r.test(e.name))) continue;
    let mtime;
    try { mtime = fs.statSync(path.join(dir, e.name)).mtimeMs; } catch { continue; }
    if (!juengste || mtime > juengste.mtime) juengste = { datei: e.name, mtime };
  }
  if (!juengste) return { ruhig: true, datei: null, alterSekunden: null };
  const alterSekunden = Math.max(0, Math.round((jetzt.getTime() - juengste.mtime) / 1000));
  return { ruhig: alterSekunden >= sekunden, datei: juengste.datei, alterSekunden };
}

/** Einfacher Leser fuer die wenigen Schluessel einer Codex-automation.toml. */
export function automationLesen(text) {
  const wert = schluessel => {
    const m = text.match(new RegExp(`^${schluessel}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm'));
    return m ? m[1].replace(/\\(.)/g, '$1') : null;
  };
  return { status: wert('status'), thread: wert('target_thread_id'), prompt: wert('prompt') || '' };
}

/**
 * Letzter Laufmarker im Ende eines Codex-Protokolls: 'gestartet', 'fertig' oder null.
 * Zeilenweise als JSON gelesen: derselbe Text in einer Werkzeugausgabe zaehlt nicht.
 */
export function letzterLaufmarker(text) {
  const zeilen = text.split('\n');
  for (let i = zeilen.length - 1; i >= 0; i--) {
    if (!zeilen[i].includes('task_')) continue;
    let ereignis;
    try { ereignis = JSON.parse(zeilen[i]); } catch { continue; } // erste Zeile des Endes ist oft abgeschnitten
    const typ = ereignis?.payload?.type;
    if (typ === 'task_started') return 'gestartet';
    if (typ === 'task_complete') return 'fertig';
  }
  return null;
}

function protokollEnde(datei, bytes = 512 * 1024) {
  const groesse = fs.statSync(datei).size;
  const fd = fs.openSync(datei, 'r');
  try {
    const laenge = Math.min(groesse, bytes);
    const puffer = Buffer.alloc(laenge);
    fs.readSync(fd, puffer, 0, laenge, groesse - laenge);
    return puffer.toString('utf8');
  } finally { fs.closeSync(fd); }
}

function protokollFinden(sessionsDir, thread) {
  // Aufbau ~/.codex/sessions/JJJJ/MM/TT/rollout-<zeit>-<thread>.jsonl
  const tiefe = (dir, rest) => {
    let liste;
    try { liste = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of liste) {
      const p = path.join(dir, e.name);
      if (rest === 0) { if (e.isFile() && e.name.includes(thread) && e.name.endsWith('.jsonl')) return p; }
      else if (e.isDirectory()) { const f = tiefe(p, rest - 1); if (f) return f; }
    }
    return null;
  };
  return tiefe(sessionsDir, 3);
}

/**
 * Arbeitet gerade eine Codex-Automation in diesem Checkout? Codex bestellt alle 15 Minuten
 * neue Muster aus ~/tp-dashboard. Ein Lauf beginnt im Protokoll mit task_started und endet
 * mit task_complete. Ein Lauf, der seit 30 Minuten nichts mehr schreibt, gilt als
 * abgebrochen - sonst blockierte ein einziger Absturz jede Aktualisierung.
 */
export function codexArbeitet({ automationsDir, sessionsDir, checkout, jetzt = new Date(), stilleMinuten = 30 } = {}) {
  let ordner;
  try { ordner = fs.readdirSync(automationsDir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return { arbeitet: false, grund: 'keine Codex-Automationen' }; throw e; }
  const name = path.basename(checkout || '');
  for (const e of ordner) {
    if (!e.isDirectory()) continue;
    let a;
    try { a = automationLesen(fs.readFileSync(path.join(automationsDir, e.name, 'automation.toml'), 'utf8')); } catch { continue; }
    if (a.status !== 'ACTIVE' || !a.thread || (name && !a.prompt.includes(name))) continue;
    const datei = protokollFinden(sessionsDir, a.thread);
    if (!datei) continue;
    const alterMin = (jetzt.getTime() - fs.statSync(datei).mtimeMs) / 60000;
    if (alterMin >= stilleMinuten) continue;
    const marker = letzterLaufmarker(protokollEnde(datei));
    // Ohne Marker im Ende (sehr langer Lauf): frisch geschrieben heisst laeuft noch.
    if (marker === 'gestartet' || (marker === null && alterMin < 5)) return { arbeitet: true, grund: `Codex-Automation ${e.name} laeuft` };
  }
  return { arbeitet: false, grund: null };
}

/**
 * Theme-Ordner, Agentenregeln und Lehren liest das Dashboard nicht; alles andere kann es
 * betreffen. Ein unnoetiger Neustart kostet ein paar Sekunden, ein fehlender alten Code.
 */
const NUR_THEME = /^(?:(?:sections|blocks|snippets|templates|assets|config|locales|layout|\.claude|\.github|docs\/lessons|docs\/audits)\/|[^/]+\.md$)/;

/**
 * Welche dauerhaft laufenden Dienste muessen nach diesen Aenderungen neu starten?
 * Zeitgesteuerte Dienste (Nachfassen, Shopwache, Sicherung …) laden ihren Code bei
 * jedem Lauf neu und brauchen keinen Neustart.
 */
export function neustartNoetig(geaendert = []) {
  const abhaengigkeiten = geaendert.some(d => d === 'package.json' || d === 'package-lock.json');
  const dienste = new Set();
  if (abhaengigkeiten || geaendert.some(d => !NUR_THEME.test(d))) dienste.add('dashboard');
  if (abhaengigkeiten || geaendert.some(d => d.startsWith('operations/'))) dienste.add('sync');
  if (abhaengigkeiten || geaendert.some(d => d.startsWith('social/'))) dienste.add('social');
  return [...dienste];
}

/** Testsuiten, die vor dem Uebernehmen in der Probekopie laufen. */
export function probeTests(geaendert = []) {
  const suiten = ['dashboard:test'];
  const abhaengigkeiten = geaendert.some(d => d === 'package.json' || d === 'package-lock.json');
  if (abhaengigkeiten || geaendert.some(d => d.startsWith('operations/'))) suiten.push('operations:test');
  if (abhaengigkeiten || geaendert.some(d => d.startsWith('social/'))) suiten.push('social:test');
  return suiten;
}

/** PR-Zeilen aus `git log --merges --first-parent --format=%s%x09%b`. */
export function prZeilen(log = '') {
  return log.split('\n').map(z => {
    const [kopf, ...rest] = z.split('\t');
    const nr = kopf.match(/^Merge pull request #(\d+)/)?.[1];
    const titel = rest.join(' ').trim();
    return nr ? `#${nr} ${titel}`.trim() : null;
  }).filter(Boolean);
}

export function zustandLesen(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, ZUSTAND_DATEI), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return { version: 1, verlauf: [] }; throw e; }
}

export function zustandSchreiben(dir, zustand) {
  const ziel = path.join(dir, ZUSTAND_DATEI);
  const tmp = `${ziel}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(zustand, null, 2)}\n`);
  fs.renameSync(tmp, ziel);
}

/** Neuer Zustand nach einem Lauf; der Verlauf haelt nur Wechsel, keine Leerlaeufe. */
export function zustandNach(alt = {}, ergebnis, jetzt = new Date()) {
  const wann = jetzt.toISOString();
  const z = { version: 1, ...alt, zuletztGeprueft: wann };
  z.betrieb = ergebnis.betrieb ?? alt.betrieb ?? null;
  z.main = ergebnis.main ?? alt.main ?? null;
  z.rueckstand = ergebnis.rueckstand ?? alt.rueckstand ?? null;
  const verlauf = Array.isArray(alt.verlauf) ? alt.verlauf : [];
  const merke = was => { z.verlauf = [...verlauf, { wann, was, ...(ergebnis.prs?.length ? { prs: ergebnis.prs } : {}) }].slice(-VERLAUF_MAX); };
  if (ergebnis.stand === 'aktuell') {
    z.stand = 'aktuell'; z.grund = null; z.art = null; z.wartetSeit = null; z.gesperrt = null;
    if (ergebnis.nachgezogen) { z.zuletztNachgezogen = wann; merke(`nachgezogen ${ergebnis.von} → ${ergebnis.nach}`); }
  } else if (ergebnis.stand === 'wartet') {
    z.stand = 'wartet'; z.grund = ergebnis.grund; z.art = null;
    z.wartetSeit = alt.stand === 'wartet' && alt.wartetSeit ? alt.wartetSeit : wann;
  } else {
    z.stand = 'haengt'; z.grund = ergebnis.grund; z.art = ergebnis.art || 'fehler'; z.wartetSeit = null;
    // Gesperrt wird nur ein main-Stand, der selbst scheitert (Konflikt, Tests, Neustart);
    // eine schmutzige Arbeitskopie wird bei jedem Lauf neu geprueft.
    z.gesperrt = ergebnis.sperren && ergebnis.main ? { main: ergebnis.main, grund: ergebnis.grund } : null;
    if (alt.stand !== 'haengt' || alt.grund !== ergebnis.grund) merke(`haengt: ${ergebnis.grund}`);
  }
  if (ergebnis.getestet !== undefined) z.getestet = ergebnis.getestet;
  return z;
}

/**
 * Stand fuer den Systemzustand (operations/lib/betriebszustand.mjs): 'ok', 'wartet',
 * 'fehler' (haengt), 'alt' (laeuft nicht mehr) oder 'unbekannt' (nie gelaufen).
 */
export function nachziehStand(dir, { jetzt = new Date(), maxStunden = 2, warteMinuten = 60 } = {}) {
  let z;
  try { z = JSON.parse(fs.readFileSync(path.join(dir, ZUSTAND_DATEI), 'utf8')); }
  catch (e) { return { status: e.code === 'ENOENT' ? 'unbekannt' : 'fehler', grund: e.code === 'ENOENT' ? null : 'Stand nicht lesbar' }; }
  const geprueft = Date.parse(z.zuletztGeprueft || '');
  const basis = { zuletztGeprueft: z.zuletztGeprueft || null, zuletztNachgezogen: z.zuletztNachgezogen || null, rueckstand: z.rueckstand ?? null };
  if (!Number.isFinite(geprueft)) return { status: 'unbekannt', grund: null, ...basis };
  // `art` fuer die Oberflaeche (Klartext), `grund` mit Dateien und Fehlertext nur fuer --status.
  if (z.stand === 'haengt') return { status: 'fehler', art: z.art || 'fehler', grund: z.grund || 'unbekannt', ...basis };
  if (jetzt.getTime() - geprueft > maxStunden * 3600000) return { status: 'alt', grund: null, ...basis };
  if (z.stand === 'wartet' && jetzt.getTime() - Date.parse(z.wartetSeit || z.zuletztGeprueft) > warteMinuten * 60000) {
    return { status: 'wartet', grund: z.grund || null, wartetSeit: z.wartetSeit || null, ...basis };
  }
  return { status: 'ok', grund: null, ...basis };
}
