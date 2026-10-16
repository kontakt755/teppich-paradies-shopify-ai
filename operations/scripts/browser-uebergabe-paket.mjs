#!/usr/bin/env node
/** Erzeugt den privaten MV3-Begleiter mit ausschliesslich expliziten Dashboard-Urspruengen. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const QUELLE = path.join(REPO, 'operations/browser-uebergabe');
const DATEIEN = ['logik.js', 'dashboard.js', 'service-worker.js', 'empfaenger.js'];

export function dashboardUrsprung(wert) {
  let url;
  try { url = new URL(wert); } catch { throw new Error('Dashboard braucht einen vollständigen HTTP-/HTTPS-Ursprung.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || wert !== url.origin
    || url.hostname.includes('*') || /[\s\u0000-\u001f]/u.test(wert)) {
    throw new Error('Dashboard nur als exakten Ursprung ohne Pfad, Abfrage, Zugangsdaten oder Platzhalter angeben.');
  }
  return url.origin;
}

export function manifestFuer(urspruenge) {
  const matches = [...new Set(urspruenge.map(dashboardUrsprung))].map(origin => `${origin}/*`);
  if (!matches.length) throw new Error('Mindestens einen Dashboard-Ursprung angeben.');
  return {
    manifest_version: 3, name: 'Teppich Paradies – KI-Übergabe', version: '0.1.0',
    description: 'Fügt bewusst übergebene Dashboard-Texte in einen leeren ChatGPT-Projektchat ein. Sendet keine Nachricht.',
    permissions: ['storage', 'alarms'],
    background: { service_worker: 'service-worker.js', type: 'module' },
    content_scripts: [
      { matches, js: ['logik.js', 'konfiguration.js', 'dashboard.js'], run_at: 'document_idle', all_frames: false },
      { matches: ['https://chatgpt.com/g/g-p-*/project*'], js: ['logik.js', 'empfaenger.js'], run_at: 'document_idle', all_frames: false },
    ],
  };
}

function aufgeloesterZielpfad(ziel) {
  let bestehend = path.resolve(ziel);
  const rest = [];
  while (!fs.existsSync(bestehend)) {
    rest.unshift(path.basename(bestehend));
    bestehend = path.dirname(bestehend);
  }
  return path.join(fs.realpathSync(bestehend), ...rest);
}

export function paketErzeugen({ dashboards = [], ziel, repoRoot = REPO } = {}) {
  if (typeof ziel !== 'string' || !path.isAbsolute(ziel)) throw new Error('Ziel muss ein absoluter Ordner außerhalb des Repositorys sein.');
  const ausgabe = aufgeloesterZielpfad(ziel);
  const repo = fs.realpathSync(repoRoot);
  const relativ = path.relative(repo, ausgabe);
  if (!relativ || (!relativ.startsWith(`..${path.sep}`) && relativ !== '..' && !path.isAbsolute(relativ))) {
    throw new Error('Das Erweiterungspaket darf nicht im Repository liegen.');
  }
  if (fs.existsSync(ausgabe) && (!fs.statSync(ausgabe).isDirectory() || fs.readdirSync(ausgabe).length)) {
    throw new Error('Der Zielordner muss fehlen oder leer sein; bestehende Dateien werden nicht überschrieben.');
  }
  const urspruenge = [...new Set(dashboards.map(dashboardUrsprung))];
  const manifest = manifestFuer(urspruenge);
  // Erst alles lesen und validieren, dann den privaten Ordner anlegen.
  const dateien = DATEIEN.map(name => [name, fs.readFileSync(path.join(QUELLE, name), 'utf8')]);
  dateien.push(['manifest.json', `${JSON.stringify(manifest, null, 2)}\n`]);
  dateien.push(['konfiguration.js', `globalThis.TPBrowserUebergabeKonfiguration = Object.freeze(${JSON.stringify({ dashboardUrspruenge: urspruenge })});\n`]);
  fs.mkdirSync(ausgabe, { recursive: true, mode: 0o700 });
  for (const [name, inhalt] of dateien) fs.writeFileSync(path.join(ausgabe, name), inhalt, { mode: 0o600, flag: 'wx' });
  return { ziel: ausgabe, dateien: dateien.map(([name]) => name), dashboardAnzahl: urspruenge.length };
}

export function argumente(argv) {
  const out = { dashboards: [], ziel: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dashboard' && argv[i + 1]) out.dashboards.push(argv[++i]);
    else if (arg === '--ziel' && argv[i + 1]) out.ziel = argv[++i];
    else throw new Error('Aufruf: --dashboard <exakter-ursprung> [--dashboard <weiterer-ursprung>] --ziel <absoluter-privater-ordner>');
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const ergebnis = paketErzeugen(argumente(process.argv.slice(2)));
    process.stdout.write(`Browserbegleiter vorbereitet: ${ergebnis.ziel}\n${ergebnis.dashboardAnzahl} Dashboard-Ursprung/Ursprünge; keine Installation ausgeführt.\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
