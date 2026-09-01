import fs from 'node:fs';
import process from 'node:process';

export const BROWSER_ENVIRONMENT_VARIABLE = 'TP_BROWSER_EXECUTABLE';
export const BROWSERS_PATH_ENVIRONMENT_VARIABLE = 'PLAYWRIGHT_BROWSERS_PATH';

// Vorinstallierte Container-/CI-Images legen Chromium unter
// PLAYWRIGHT_BROWSERS_PATH ab, oft in einer anderen Revision als die lokal
// installierte playwright-core-Version erwartet. executablePath() zeigt dann
// auf einen nicht existierenden Revisionsordner, obwohl ein passender Browser
// daneben liegt. Diese Kandidaten sind relativ zur Env-Variable und enthalten
// deshalb keinen maschinenspezifischen absoluten Pfad.
export function browsersPathCandidates(browsersPath, platform = process.platform, readdirSync = fs.readdirSync) {
  if (!browsersPath) return [];
  const base = browsersPath.replace(/[\\/]+$/, '');

  const layout = platform === 'win32'
    ? ['chrome-win/chrome.exe']
    : platform === 'darwin'
      ? ['chrome-mac/Chromium.app/Contents/MacOS/Chromium']
      : ['chrome-linux/chrome', 'chrome-linux64/chrome'];

  // Installierte Revisionen absteigend, damit die neueste zuerst greift.
  let revisions = [];
  try {
    revisions = readdirSync(base)
      .filter(entry => /^chromium-\d+$/.test(entry))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  } catch {}

  const candidates = [];
  for (const revision of revisions) {
    for (const suffix of layout) candidates.push(`${base}/${revision}/${suffix}`);
  }
  // Symlink/Ordner "chromium" zuletzt: konkrete Binaries haben Vorrang.
  for (const suffix of layout) candidates.push(`${base}/chromium/${suffix}`);
  candidates.push(`${base}/chromium`);
  return candidates;
}

export function systemBrowserCandidates(platform = process.platform) {
  if (platform === 'darwin') return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  if (platform === 'win32') return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
}

export function resolveBrowserExecutable({
  configuredPath = 'auto',
  environment = process.env,
  platform = process.platform,
  existsSync = fs.existsSync,
  readdirSync = fs.readdirSync,
  playwrightChromium,
} = {}) {
  const explicitPath = environment[BROWSER_ENVIRONMENT_VARIABLE] || (configuredPath !== 'auto' ? configuredPath : '');
  if (explicitPath) {
    if (existsSync(explicitPath)) return { executablePath: explicitPath, source: 'explicit' };
    return { executablePath: null, source: 'explicit-missing', error: `Expliziter Browserpfad existiert nicht (${BROWSER_ENVIRONMENT_VARIABLE}/Config)` };
  }

  try {
    const bundledPath = playwrightChromium?.executablePath?.();
    if (bundledPath && existsSync(bundledPath)) return { executablePath: bundledPath, source: 'playwright-chromium' };
  } catch {}

  const browsersPath = browsersPathCandidates(environment[BROWSERS_PATH_ENVIRONMENT_VARIABLE], platform, readdirSync)
    .find(candidate => existsSync(candidate));
  if (browsersPath) return { executablePath: browsersPath, source: 'playwright-browsers-path' };

  const systemPath = systemBrowserCandidates(platform).find(candidate => existsSync(candidate));
  if (systemPath) return { executablePath: systemPath, source: 'system-browser' };
  return { executablePath: null, source: 'missing', error: 'Kein Playwright-Chromium oder unterstützter Systembrowser gefunden' };
}

