/**
 * Puppeteer fuer die Sichtpruefung (scripts/dashboard-pruefen.mjs) laden.
 *
 * Zuerst aus dem eigenen node_modules. Fehlt es dort (leerer Hauptcheckout, frischer Worktree
 * ohne `npm ci`), aus dem Dienst-Checkout ~/tp-dashboard: der Betrieb braucht puppeteer fuer
 * Social-Rendering und Auslauf-Pruefung, dort ist es also immer installiert. Bis 2026-10-26
 * brach die Pruefung im Hauptcheckout mit "puppeteer fehlt" ab, und die Pruefer wichen auf eine
 * git-archive-Kopie mit verlinktem node_modules aus.
 */

import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STANDARD_ERSATZ = () => process.env.TP_DIENST_DIR || path.join(os.homedir(), 'tp-dashboard');

/** Aus einem Modul-Namensraum das puppeteer-Objekt holen (ESM-Standard oder CommonJS-Huelle). */
function puppeteerAus(mod) {
  for (const k of [mod?.default, mod?.default?.default, mod]) if (typeof k?.launch === 'function') return k;
  return null;
}

/**
 * @param {object} [opt]
 *   importieren  (spezifizierer) => Promise<Modul>; Tests geben einen Ersatz
 *   ersatzDir    Ordner mit package.json und node_modules/puppeteer (Standard ~/tp-dashboard)
 *   melden       Ausgabe fuer den Hinweis, wenn der Ersatz benutzt wird
 * @returns {Promise<{ puppeteer: object, quelle: 'eigen'|string }>}
 */
export async function ladePuppeteer({ importieren = (s) => import(s), ersatzDir = STANDARD_ERSATZ(), melden = console.log } = {}) {
  try {
    const p = puppeteerAus(await importieren('puppeteer'));
    if (p) return { puppeteer: p, quelle: 'eigen' };
  } catch { /* weiter mit dem Dienst-Checkout */ }
  if (ersatzDir) {
    try {
      const datei = createRequire(path.join(ersatzDir, 'package.json')).resolve('puppeteer');
      const p = puppeteerAus(await importieren(pathToFileURL(datei).href));
      if (p) {
        melden(`Hinweis: puppeteer fehlt hier - benutze ${path.join(ersatzDir, 'node_modules')}. Dauerhaft: im Repository-Root \`npm ci\` ausfuehren.`);
        return { puppeteer: p, quelle: ersatzDir };
      }
    } catch { /* auch dort nicht */ }
  }
  throw new Error(`puppeteer fehlt - im Repository-Root \`npm ci\` ausfuehren (auch unter ${ersatzDir || '~/tp-dashboard'} nicht gefunden).`);
}
