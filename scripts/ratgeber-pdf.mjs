#!/usr/bin/env node
// Druckt die Kurz-Ratgeber (PDF, A4, zwei Seiten) aus domains/shopify/ratgeber-pdf/inhalte.mjs.
// Die Bestellbestaetigung verlinkt sie je Produktart (bestellbestaetigung-block.liquid).
//
//   npm run -s ratgeber:pdf                    alle Ratgeber (die Dateien in Shopify)
//   npm run -s ratgeber:pdf -- --nur parkett
//   npm run -s ratgeber:pdf -- --qr            QR-Codes neu erzeugen (braucht qrencode)
//   npm run -s ratgeber:pdf -- --bestellung 1070 [--oeffnen]
//        Druckfassung zu einer Bestellung: passende Ratgeber in einer Datei, Kopf und
//        "Fuer Ihre Unterlagen" ausgefuellt. Quelle ist der Bestellexport des Control
//        Centers ($TP_PRIVAT_DIR/bestelluebersicht/orders.json), Ziel
//        $TP_PRIVAT_DIR/ratgeber-druck/<nr>.pdf - Kundendaten nie ins Repository.
//        --oeffnen zeigt die Datei in Vorschau zum Drucken (beidseitig).
//        Exit 2: Bestellung hat keine Ware mit Ratgeber (z. B. nur Muster).
//
// Bricht ab, wenn eine Seite ueberlaeuft: dann Text kuerzen, nicht die Schrift verkleinern.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATGEBER, ORDNER, ratgeberHtml, ratgeberFuerBestellung } from '../domains/shopify/ratgeber-pdf/vorlage.mjs';
import { mitBrowser, seitenAlsPdf, ZU_VOLL_AB_PX } from '../domains/shopify/ratgeber-pdf/pdf.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wert = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const nur = wert('--nur');
const bestellNr = wert('--bestellung');
const privat = process.env.TP_PRIVAT_DIR || join(os.homedir(), 'teppich-paradies-analyse');

// Auftraege: { html, ziel, name }
let auftraege;
if (bestellNr) {
  const quelle = wert('--quelle') || join(privat, 'bestelluebersicht', 'orders.json');
  if (!existsSync(quelle)) { console.error(`Bestellexport fehlt: ${quelle} (npm run dashboard)`); process.exit(1); }
  const name = `#${String(bestellNr).replace(/^#/, '')}`;
  const bestellung = (JSON.parse(readFileSync(quelle, 'utf8')).orders || []).find((o) => o.name === name);
  if (!bestellung) { console.error(`${name} steht nicht im Bestellexport ${quelle} - Export aktualisieren`); process.exit(1); }
  const teile = ratgeberFuerBestellung(bestellung);
  if (!teile.length) { console.log(`${name}: keine Ware mit Ratgeber (nur Muster oder Zubehör)`); process.exit(2); }
  const ziel = join(privat, 'ratgeber-druck', `${name.slice(1)}.pdf`);
  auftraege = [{ html: ratgeberHtml(teile, { titel: `Ratgeber zu Bestellung ${name} – Teppich Paradies` }), ziel, name: `${name}: ${teile.map(({ r }) => r.datei).join(', ')}` }];
} else {
  const liste = RATGEBER.filter((r) => !nur || r.schluessel === nur);
  if (!liste.length) { console.error(`Unbekannter Ratgeber: ${nur}`); process.exit(1); }
  auftraege = liste.map((r) => ({ html: ratgeberHtml([{ r }], { qrNeu: args.includes('--qr') }), ziel: join(ORDNER, 'pdf', r.datei), name: r.datei }));
}

const tmp = join(root, 'tmp', 'ratgeber-pdf');
mkdirSync(tmp, { recursive: true });
let fehler = 0;
await mitBrowser(async (page) => {
  for (const a of auftraege) {
    mkdirSync(dirname(a.ziel), { recursive: true });
    if (!bestellNr) writeFileSync(join(tmp, a.name.replace(/\.pdf$/, '.html')), a.html);
    // Ueberlauf: Inhalt darf nicht in den Fuss laufen
    const { luft } = await seitenAlsPdf(page, a.html, { pfad: a.ziel });
    const eng = luft.filter((u) => u.luftPx < ZU_VOLL_AB_PX);
    console.log(`${eng.length ? 'ZU VOLL' : 'ok     '} ${a.name}  Luft bis Fuss: ${luft.map((u) => `S.${u.seite} ${u.luftPx}px`).join(', ')}`);
    if (eng.length) fehler++;
    if (bestellNr) console.log(a.ziel);
  }
});
if (bestellNr && args.includes('--oeffnen') && !fehler && process.platform === 'darwin') {
  execFileSync('open', ['-a', 'Preview', auftraege[0].ziel]);
}
process.exit(fehler ? 1 : 0);
