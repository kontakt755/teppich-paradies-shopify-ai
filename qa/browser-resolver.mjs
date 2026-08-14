import fs from 'node:fs';
import process from 'node:process';

export const BROWSER_ENVIRONMENT_VARIABLE = 'TP_BROWSER_EXECUTABLE';

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

  const systemPath = systemBrowserCandidates(platform).find(candidate => existsSync(candidate));
  if (systemPath) return { executablePath: systemPath, source: 'system-browser' };
  return { executablePath: null, source: 'missing', error: 'Kein Playwright-Chromium oder unterstützter Systembrowser gefunden' };
}

