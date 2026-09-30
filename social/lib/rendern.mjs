/**
 * Bild-Werkstatt: rendert Vorlagen zu JPEG.
 *
 * Headless-Chrome ist ueber puppeteer ohnehin im Projekt (QA-Screenshots). Er
 * schneidet zu (object-fit), setzt Schrift und Signatur und schreibt ein JPEG
 * ohne jede Metadaten - die GPS-Koordinaten aus dem Handyfoto eines Monteurs
 * koennen so gar nicht in einen veroeffentlichten Beitrag gelangen.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class RenderFehler extends Error {}

/**
 * @param auftraege [{ html, breite, hoehe, datei }]
 * @returns Liste der geschriebenen Dateien
 */
export async function rendere(auftraege, { qualitaet = 90, starte = null } = {}) {
  if (!auftraege.length) return [];
  const puppeteer = starte ? null : (await import('puppeteer')).default;
  const browser = starte ? await starte() : await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  const fertig = [];
  try {
    const seite = await browser.newPage();
    for (const a of auftraege) {
      fs.mkdirSync(path.dirname(a.datei), { recursive: true });
      // Als Datei laden, nicht per setContent: nur eine file://-Seite darf
      // lokale Baustellenfotos einbinden.
      const tmp = `${a.datei}.html`;
      fs.writeFileSync(tmp, a.html);
      try {
        await seite.setViewport({ width: a.breite, height: a.hoehe, deviceScaleFactor: 1 });
        await seite.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle0', timeout: 90_000 });
        const kaputt = await seite.evaluate(async () => {
          await document.fonts.ready;
          return [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src);
        });
        if (kaputt.length) throw new RenderFehler(`Bild nicht ladbar: ${kaputt.join(', ')}`);
        await seite.screenshot({ path: a.datei, type: 'jpeg', quality: qualitaet, clip: { x: 0, y: 0, width: a.breite, height: a.hoehe } });
        fertig.push(a.datei);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    }
  } finally {
    await browser.close();
  }
  return fertig;
}
