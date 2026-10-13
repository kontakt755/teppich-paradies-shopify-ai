// Google-Maps-Karten duerfen erst nach Klick (oder ausdruecklicher
// Marketing-Einwilligung) laden. Ein fest eingebautes iframe schickt beim
// Seitenaufruf Daten an Google - Befund 13.10. auf /pages/kontakt (w-083).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const ORDNER = ['sections', 'snippets', 'blocks', 'layout', 'templates', 'config', 'assets'];
// /maps/embed?pb=... sowie die alte Form /maps?q=...&output=embed (www.google.* und maps.google.*)
const MAPS_EMBED = /google\.[a-z.]+\/maps\/embed|(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+\/(?:maps)?)\?[^"'\s]*output=embed/i;

function dateien() {
  const liste = [];
  for (const ordner of ORDNER) {
    const voll = path.join(root, ordner);
    if (!fs.existsSync(voll)) continue;
    for (const name of fs.readdirSync(voll, { recursive: true })) {
      if (!/\.(liquid|json|js)$/.test(name)) continue;
      liste.push(path.join(ordner, name));
    }
  }
  return liste;
}

export function mapsIframeFunde(dateiInhalte) {
  const funde = [];
  for (const [datei, text] of dateiInhalte) {
    // Ein Script in assets/ hat keinen Grund, eine Maps-Embed-Adresse zu kennen
    if (datei.startsWith('assets') && MAPS_EMBED.test(text)) {
      funde.push({ datei, tag: 'Maps-Embed-Adresse im Script' });
      continue;
    }
    // JSON-Templates speichern HTML escaped (custom_liquid), deshalb \" und \u003c mitnehmen
    const roh = text.replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>').replace(/\\"/g, '"');
    for (const tag of roh.match(/<iframe\b[^>]*>/gi) || []) {
      if (MAPS_EMBED.test(tag)) funde.push({ datei, tag: tag.slice(0, 120) });
    }
  }
  return funde;
}

test('kein Google-Maps-iframe wird direkt ausgeliefert', () => {
  const inhalte = dateien().map((datei) => [datei, fs.readFileSync(path.join(root, datei), 'utf8')]);
  assert.ok(inhalte.length > 100, 'zu wenige Theme-Dateien gefunden');
  assert.deepEqual(mapsIframeFunde(inhalte), []);
});

test('Pruefung erkennt ein direktes Maps-iframe, auch escaped im JSON-Template', () => {
  const funde = mapsIframeFunde([
    ['sections/a.liquid', '<iframe class="x" src="https://www.google.com/maps/embed?pb=1"></iframe>'],
    ['templates/page.json', '{"custom_liquid":"\\u003ciframe src=\\"https://www.google.com/maps/embed?pb=1\\"\\u003e"}'],
    ['sections/b.liquid', '<div data-tp-karte-src="https://www.google.com/maps/embed?pb=1"></div>'],
    ['sections/c.liquid', '<a href="https://www.google.com/maps/dir/?api=1&destination=x">Route</a>'],
    ['sections/d.liquid', '<iframe src="https://www.google.com/maps?q=Oranienburg&output=embed"></iframe>'],
    ['sections/e.liquid', '<iframe src="https://maps.google.de/maps?q=x&amp;output=embed"></iframe>'],
    ['sections/f.liquid', '<a href="https://maps.google.com/?cid=1">Profil</a>'],
    ['assets/karte.js', "f.src = 'https://www.google.com/maps/embed?pb=1';"],
  ]);
  assert.deepEqual(funde.map((f) => f.datei), ['sections/a.liquid', 'templates/page.json', 'sections/d.liquid', 'sections/e.liquid', 'assets/karte.js']);
});

test('Kontaktseite: Platzhalter mit Knopf, Hinweis, Datenschutz-Link und Maps-Link', () => {
  const code = fs.readFileSync(path.join(root, 'sections', 'contact-form.liquid'), 'utf8');
  const muss = [
    [/data-tp-karte-src="\{\{ tp_karte_embed \| escape \}\}"/, 'Embed-Adresse nur im data-Attribut'],
    [/<button type="button" class="tp-karte__laden"[^>]*aria-describedby=/, 'Knopf mit Hinweis-Verweis'],
    [/Karte von Google Maps laden/, 'Knopftext'],
    [/Dabei werden Daten an Google übertragen\. Mehr in der\s+<a href="\/pages\/datenschutzerklarung">Datenschutzerklärung<\/a>\./, 'Hinweis mit Datenschutz-Link'],
    [/assign tp_karte_link = settings\.tp_google_profil \| default: 'https:\/\/maps\.google\.com\/\?cid=\d+'/, 'Maps-Link auf das Unternehmensprofil'],
    [/<a class="tp-karte__extern" href="\{\{ tp_karte_link \| escape \}\}" target="_blank" rel="noopener">\s*In Google Maps öffnen/, 'normaler Link "In Google Maps öffnen"'],
    // Direkt laden nur bei ausdruecklichem Ja, nicht bei marketingAllowed() (true ohne Banner)
    [/consent\.marketing === 'yes'/, 'Einwilligung nur bei ausdruecklichem Ja'],
  ];
  for (const [muster, was] of muss) assert.ok(muster.test(code), `contact-form.liquid: ${was} fehlt`);
  assert.ok(!/\.marketingAllowed\b/.test(code), 'marketingAllowed ist auch ohne Banner true (auch im Event-Detail)');
});
