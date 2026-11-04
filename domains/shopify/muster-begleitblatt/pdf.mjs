// Begleitblaetter (vorlage.mjs) als PDF ueber Chromium. Eigenes Modul, weil nur der Druck einen Browser
// braucht; das Control Center laedt es erst beim Klick.
import { mitBrowser } from '../ratgeber-pdf/pdf.mjs';

// Unter dieser Luft zum Fuss laeuft die Seite praktisch ueber.
const ZU_VOLL_AB_PX = 4;

/**
 * Ein langer Name bricht um und schiebt die Seite in die Fusszeile: dann wird nur seine Schrift kleiner.
 * Ein Umschlag, der trotzdem nicht passt, wird nicht gedruckt, sondern unter `zuVoll` gemeldet.
 * @returns {Promise<{ pdf: Buffer|null, zuVoll: string[] }>}
 */
export async function blaetterAlsPdf(html) {
  return mitBrowser(async (page) => {
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const zuVoll = await page.evaluate((grenze) => {
      for (const h of document.querySelectorAll('h1')) {
        let groesse = 48;
        while (h.getBoundingClientRect().height >= groesse * 1.08 * 1.5 && groesse > 28) {
          groesse -= 2;
          h.style.fontSize = `${groesse}px`;
        }
      }
      const raus = new Set();
      for (const blatt of document.querySelectorAll('.blatt')) {
        const fuss = blatt.querySelector('footer').getBoundingClientRect().top;
        const inhalt = Math.max(...[...blatt.querySelectorAll('section *')].map(e => e.getBoundingClientRect().bottom));
        if (fuss - inhalt < grenze) raus.add(blatt.dataset.umschlag);
      }
      for (const blatt of document.querySelectorAll('.blatt')) if (raus.has(blatt.dataset.umschlag)) blatt.remove();
      return [...raus];
    }, ZU_VOLL_AB_PX);
    if (!(await page.locator('.blatt').count())) return { pdf: null, zuVoll };
    return { pdf: await page.pdf({ width: '210mm', height: '297mm', printBackground: true }), zuVoll };
  });
}
