// Ratgeber-HTML (vorlage.mjs) als PDF ueber Chromium. Eigenes Modul, weil nur die Druckwege
// einen Browser brauchen: scripts/ratgeber-pdf.mjs und das Control Center
// (/api/kunden/ratgeber-druck). Tests der Vorlage laufen ohne.
import { chromium } from 'playwright-core';
import { resolveBrowserExecutable } from '../../../qa/browser-resolver.mjs';

/** Startet Chromium, gibt der Arbeit eine Seite und schliesst den Browser in jedem Fall. */
export async function mitBrowser(arbeit) {
  const { executablePath, error } = resolveBrowserExecutable({ playwrightChromium: chromium });
  if (!executablePath) throw new Error(error || 'Kein Chrome/Chromium gefunden');
  const browser = await chromium.launch({ executablePath });
  try {
    return await arbeit(await browser.newPage());
  } finally {
    await browser.close();
  }
}

/**
 * Ein Ratgeber-Dokument als PDF. `luft` = Abstand des Inhalts zum Fuss je Seite in px;
 * unter 8 px laeuft die Seite praktisch ueber (dann Text kuerzen, nicht die Schrift).
 * @returns {Promise<{ pdf: Buffer, luft: { seite: number, luftPx: number }[] }>}
 */
export async function seitenAlsPdf(page, html, { pfad } = {}) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const luft = await page.evaluate(() => [...document.querySelectorAll('.seite')].map((s, i) => {
    const fuss = s.querySelector('.fuss').getBoundingClientRect().top;
    const inhalt = [...s.children].filter((c) => !c.classList.contains('fuss'))
      .reduce((m, c) => Math.max(m, c.getBoundingClientRect().bottom), 0);
    return { seite: i + 1, luftPx: Math.round(fuss - inhalt) };
  }));
  const pdf = await page.pdf({ ...(pfad ? { path: pfad } : {}), preferCSSPageSize: true, printBackground: true });
  return { pdf, luft };
}

export const ZU_VOLL_AB_PX = 8;
