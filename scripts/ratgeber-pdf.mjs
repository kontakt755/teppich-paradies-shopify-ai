#!/usr/bin/env node
// Druckt die Kurz-Ratgeber (PDF, A4, zwei Seiten) aus domains/shopify/ratgeber-pdf/inhalte.mjs.
// Die Bestellbestaetigung verlinkt sie je Produktart (bestellbestaetigung-block.liquid).
//
//   npm run -s ratgeber:pdf                 alle Ratgeber
//   npm run -s ratgeber:pdf -- --nur parkett
//   npm run -s ratgeber:pdf -- --qr         QR-Codes neu erzeugen (braucht qrencode)
//
// Bricht ab, wenn eine Seite ueberlaeuft: dann Text kuerzen, nicht die Schrift verkleinern.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveBrowserExecutable } from '../qa/browser-resolver.mjs';
import { RATGEBER, KONTAKT } from '../domains/shopify/ratgeber-pdf/inhalte.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ordner = join(root, 'domains', 'shopify', 'ratgeber-pdf');
const args = process.argv.slice(2);
const nur = args.includes('--nur') ? args[args.indexOf('--nur') + 1] : null;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const datenUri = (datei, typ) => `data:${typ};base64,${readFileSync(join(ordner, datei)).toString('base64')}`;

// Strichsymbole, 24er-Raster, Farbe ueber currentColor
const ICON = {
  pruefen: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/><path d="M8 11l2 2 4-4"/>',
  uhr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7.5"/>',
  untergrund: '<rect x="4" y="6" width="16" height="6" rx="1.5"/><circle cx="12" cy="9" r="1.2"/><path d="M3 16h18"/><path d="M3 20h18"/>',
  schichten: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  schutz: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  luft: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h6"/>',
  holz: '<path d="M5 20c0-9 6-15 15-15 0 9-6 15-15 15z"/><path d="M5 20l8-8"/>',
  werkzeug: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.5"/>',
  lesen: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  ja: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/>',
  nein: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  haken: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  kreuz: '<path d="M6 6l12 12M18 6L6 18"/>',
  telefon: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  ort: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  zeit: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5h4"/>',
  pfeil: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  notiz: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
};
const svg = (name, breite = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${breite}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

function qrSvg(r) {
  const datei = join(ordner, 'qr', `${r.schluessel}.svg`);
  if (args.includes('--qr') || !existsSync(datei)) {
    // Fehlerkorrektur M, ohne Rand: der weisse Rahmen kommt aus dem Layout
    execFileSync('qrencode', ['-t', 'SVG', '-l', 'M', '-m', '0', '--svg-path', '-o', datei, r.mehr.link]);
  }
  return readFileSync(datei, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg /, '<svg preserveAspectRatio="xMidYMid meet" ');
}

function seiten(r, logo) {
  const fuss = (n) => `<footer class="fuss"><span><strong>Teppich Paradies</strong> · Ratgeber ${esc(r.titel.replace(/^Ihr neuer /, ''))}</span><span>Seite ${n} von 2</span></footer>`;
  const hinweis = r.schluessel === 'teppich' ? 'Zum Auspacken und Pflegen' : 'Bitte vor dem Verlegen lesen';
  const kacheln = r.vorher.map((k) => `
      <div class="kachel"><div class="icon">${svg(k.icon)}</div><h3>${esc(k.titel)}</h3><p>${esc(k.text)}</p></div>`).join('');
  const schritte = r.schritte.map(([t, p], i) => `
      <li class="schritt"><span class="zahl">${i + 1}</span><div><h3>${esc(t)}</h3><p>${esc(p)}</p></div></li>`).join('');
  // gutZuWissen enthaelt bewusst <strong> aus der eigenen Inhaltsdatei
  const gut = r.gutZuWissen.map((p) => `<p>${p}</p>`).join('');
  const li = (liste, icon) => liste.map((t) => `<li>${svg(icon, 2.4)}${esc(t)}</li>`).join('');

  let extra;
  if (r.extra.art === 'flecken') {
    extra = `
    <div class="flecken">
      <div class="regeln"><h3>Die goldenen Regeln</h3><ol>${r.extra.regeln.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
      <div>
        <table><thead><tr><th>Fleck</th><th>So geht's</th><th>Bitte nie</th></tr></thead>
        <tbody>${r.extra.tabelle.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</tbody></table>
        <p class="notiz">${esc(r.extra.hinweis)}</p>
      </div>
    </div>`;
  } else {
    extra = `<div class="tipps">${r.extra.tipps.map(([t, p]) => `<div class="tipp"><h3>${esc(t)}</h3><p>${esc(p)}</p></div>`).join('')}</div>`;
  }

  return `
  <section class="seite">
    <header class="kopf">
      <img class="logo" src="${logo}" alt="Teppich Paradies">
      <div class="kopf-rechts"><span class="etikett">Ratgeber zu Ihrer Bestellung</span><span class="web">${esc(KONTAKT.web)}</span></div>
    </header>
    <div class="held">
      <div class="held-text">
        <p class="ueberzeile">Kurzanleitung</p>
        <h1>${esc(r.titel)}</h1>
        <p class="unterzeile">${esc(r.unterzeile)}</p>
      </div>
      <div class="held-hinweis">${svg('lesen', 2)}${esc(hinweis)}</div>
    </div>
    <div class="abschnitt">
      <h2><span class="nr">1</span>Bevor Sie anfangen</h2>
      <div class="kacheln">${kacheln}
      </div>
      <p class="werkzeug">${svg('werkzeug')}<span><strong>Das brauchen Sie:</strong> ${esc(r.werkzeug)}</span></p>
    </div>
    <div class="abschnitt">
      <h2><span class="nr">2</span>${esc(r.schritteTitel)}</h2>
      <ol class="schritte">${schritte}
      </ol>
    </div>
    <div class="hinweisbox">${svg('info')}<div><h3>Gut zu wissen</h3>${gut}</div></div>
    ${fuss(1)}
  </section>
  <section class="seite">
    <header class="kopf klein">
      <img class="logo" src="${logo}" alt="Teppich Paradies">
      <div class="titel-klein"><span>Pflege &amp; Hilfe</span>${esc(r.titel)}</div>
    </header>
    <div class="abschnitt">
      <h2><span class="nr">3</span>Pflege im Alltag</h2>
      <div class="pflege">
        <div class="karte ja"><h3>${svg('ja', 2)}${esc(r.pflegeTitel)}</h3><ul class="liste">${li(r.pflegeJa, 'haken')}</ul></div>
        <div class="karte nein"><h3>${svg('nein', 2)}Bitte vermeiden</h3><ul class="liste">${li(r.pflegeNein, 'kreuz')}</ul></div>
      </div>
    </div>
    <div class="abschnitt">
      <h2><span class="nr">4</span>${esc(r.extra.titel)}</h2>
      ${extra}
    </div>
    <div class="abschnitt">
      <h2><span class="nr">5</span>Wir sind für Sie da</h2>
      <div class="service">
        <div class="verlegen">
          <div><h3>${esc(r.service.titel)}</h3><p>${esc(r.service.text)}</p></div>
          <a class="link" href="${esc(r.service.link)}">${esc(r.service.linkText)}${svg('pfeil', 2.2)}</a>
        </div>
        <div class="kontakt">
          <div class="kontakt-text">
            <h3>Fragen? Rufen Sie uns an.</h3>
            <a class="zeile telefon" href="tel:+4933015733720">${svg('telefon')}${esc(KONTAKT.telefon)}</a>
            <span class="zeile">${svg('zeit')}${esc(KONTAKT.zeiten)}</span>
            <a class="zeile" href="mailto:${esc(KONTAKT.mail)}">${svg('mail')}${esc(KONTAKT.mail)}</a>
            <span class="zeile">${svg('ort')}${esc(KONTAKT.adresse)}</span>
          </div>
          <a class="qr" href="${esc(r.mehr.link)}"><div class="code">${qrSvg(r)}</div><span>${esc(r.mehr.text)}</span></a>
        </div>
      </div>
      <div class="unterlagen">
        <h3>${svg('notiz')}Für Ihre Unterlagen <span>– hilft uns bei Nachbestellung und Rückfragen</span></h3>
        <div class="felder">${(r.unterlagen || ['Bestellnummer', 'Boden und Farbe', 'Verlegt am', 'Reststücke liegen in']).map((f) => `<div class="feld"><span>${esc(f)}</span></div>`).join('')}</div>
      </div>
      <p class="rechtlich">Diese Kurzanleitung fasst allgemeine Hinweise zusammen. Die Verlege- und Pflegeanleitung des Herstellers auf der Verpackung oder im Produktdatenblatt geht immer vor. ${esc(KONTAKT.firma)} · ${esc(KONTAKT.adresse)}</p>
    </div>
    ${fuss(2)}
  </section>`;
}

function html(r) {
  const css = readFileSync(join(ordner, 'vorlage.css'), 'utf8');
  // Feste Schnitte wie im Shop-Theme: eine variable Schrift bettet Chromium als Type 3 ein
  const schriften = [400, 500, 700].map((w) => `@font-face{font-family:'Inter';src:url(${datenUri(`inter-${w}.woff`, 'font/woff')}) format('woff');font-weight:${w};font-style:normal;}`).join('\n');
  const logo = datenUri('logo.png', 'image/png');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Ratgeber ${esc(r.titel.replace(/^Ihr neuer /, ''))} – Teppich Paradies</title>
<style>${schriften}
${css}</style></head><body>${seiten(r, logo)}</body></html>`;
}

const liste = RATGEBER.filter((r) => !nur || r.schluessel === nur);
if (!liste.length) { console.error(`Unbekannter Ratgeber: ${nur}`); process.exit(1); }

const { executablePath, error } = resolveBrowserExecutable({ playwrightChromium: chromium });
if (!executablePath) { console.error(error); process.exit(1); }
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
const tmp = join(root, 'tmp', 'ratgeber-pdf');
mkdirSync(tmp, { recursive: true });
mkdirSync(join(ordner, 'pdf'), { recursive: true });
let fehler = 0;
try {
  for (const r of liste) {
    const quelle = html(r);
    writeFileSync(join(tmp, `${r.schluessel}.html`), quelle);
    await page.setContent(quelle, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Ueberlauf: Inhalt darf nicht in den Fuss laufen
    const ueber = await page.evaluate(() => [...document.querySelectorAll('.seite')].map((s, i) => {
      const fuss = s.querySelector('.fuss').getBoundingClientRect().top;
      const inhalt = [...s.children].filter((c) => !c.classList.contains('fuss'))
        .reduce((m, c) => Math.max(m, c.getBoundingClientRect().bottom), 0);
      return { seite: i + 1, luftPx: Math.round(fuss - inhalt) };
    }));
    const eng = ueber.filter((u) => u.luftPx < 8);
    const ziel = join(ordner, 'pdf', r.datei);
    await page.pdf({ path: ziel, preferCSSPageSize: true, printBackground: true });
    console.log(`${eng.length ? 'ZU VOLL' : 'ok     '} ${r.datei}  Luft bis Fuss: ${ueber.map((u) => `S.${u.seite} ${u.luftPx}px`).join(', ')}`);
    if (eng.length) fehler++;
  }
} finally {
  await browser.close();
}
process.exit(fehler ? 1 : 0);
