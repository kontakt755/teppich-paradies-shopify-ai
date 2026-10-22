/**
 * Adressaufkleber fuer Musterbriefe (Kunden → Muster packen, #1572) auf dem Niimbot B1.
 * Absender klein und unterstrichen, Empfaenger gross, Bestellnummer unten rechts. Gleiche Bauart
 * wie layout() in muster-etiketten.mjs, damit der vorhandene Druckdialog beide zeichnen kann.
 * Das Porto (Internetmarke) kommt separat auf den Umschlag. Testbar ohne Drucker und ohne DOM.
 */
import { ETIKETT } from './muster-etiketten.mjs';

/** Oeffentliche Geschaeftsanschrift (Impressum); zwei Zeilen, damit sie auch auf 50 x 50 lesbar bleibt. */
export const ABSENDER = Object.freeze(['Abs.: Teppich Paradies Oranienburg GmbH', 'Saarlandstraße 73-81 · 16515 Oranienburg']);

const text = v => (v === null || v === undefined ? '' : String(v).trim());
const leer = v => !text(v) || ['–', '-', 'UNGEKLAERT'].includes(text(v));
const INLAND = /^(de|deu|deutschland|germany)$/i;

/**
 * Etikett aus der Lieferadresse der Bestellung. `strasse` kommt als "address1, address2" und wird
 * wieder in zwei Zeilen geteilt. Ausland bekommt das Land als letzte Zeile.
 * Felder serie/farbe/sku/url/technik nur, damit Vorschau und Druckliste sie wie Musteraufkleber fuehren.
 */
export function adressEtikett(adresse = {}, bestellungen = []) {
  const { name, strasse, plz, ort, land } = adresse || {};
  const empfaenger = [];
  if (!leer(name)) empfaenger.push({ text: text(name), fett: true });
  for (const teil of text(strasse).split(/\s*,\s*/)) if (!leer(teil)) empfaenger.push({ text: teil, fett: false });
  const ortZeile = [plz, ort].filter(v => !leer(v)).map(text).join(' ');
  if (ortZeile) empfaenger.push({ text: ortZeile, fett: true });
  if (!leer(land) && !INLAND.test(text(land))) empfaenger.push({ text: text(land).toUpperCase(), fett: true });
  const fehlt = [];
  if (leer(name)) fehlt.push('Name');
  if (leer(strasse)) fehlt.push('Straße');
  if (leer(plz) || leer(ort)) fehlt.push('PLZ/Ort');
  const nr = bestellungen.map(text).filter(Boolean);
  return {
    art: 'adresse', empfaenger, bestellungen: nr, fehlt,
    serie: text(name) || 'Adresse', farbe: empfaenger.slice(1).map(z => z.text).join(', '), sku: nr.join(', '), url: '', technik: [],
  };
}

/**
 * Was wo steht, in Pixeln des Etiketts - wie layout() in muster-etiketten.mjs.
 * `mass(text, groesse, fett)` misst Text. Schriftgroessen schrumpfen, bis jede Zeile passt.
 */
export function adressLayout(e, mass, format = ETIKETT) {
  const { breite, hoehe, rand } = format;
  const innen = breite - 2 * rand;
  const passend = (t, g, fett) => { while (g > 12 && mass(t, g, fett) > innen) g -= 1; return g; };
  const texte = [];
  const linien = [];
  let y = rand;
  const gAbs = Math.min(...ABSENDER.map(t => passend(t, 19, false)));
  for (const t of ABSENDER) { texte.push({ text: t, x: rand, y, groesse: gAbs, fett: false }); y += gAbs + 4; }
  linien.push({ x1: rand, x2: rand + Math.min(innen, Math.max(...ABSENDER.map(t => mass(t, gAbs, false)))), y: y + 1 });
  y += 28;

  const nr = e.bestellungen?.length ? `Bestellung ${e.bestellungen.join(', ')}` : '';
  const gNr = nr ? passend(nr, 18, false) : 0;
  const unten = hoehe - rand - (nr ? gNr + 10 : 0);
  const zeilen = e.empfaenger || [];
  // Eine Groesse fuer alle Empfaengerzeilen: die breiteste Zeile bestimmt sie, die Hoehe deckelt sie.
  let g = zeilen.length ? Math.min(...zeilen.map(z => passend(z.text, 36, z.fett))) : 0;
  while (g > 12 && zeilen.length * Math.round(g * 1.22) > unten - y) g -= 1;
  const abstand = Math.round(g * 1.22);
  y += Math.max(0, Math.floor((unten - y - zeilen.length * abstand) / 2));
  for (const z of zeilen) { texte.push({ text: z.text, x: rand, y, groesse: g, fett: z.fett }); y += abstand; }
  if (nr) texte.push({ text: nr, x: breite - rand - Math.min(innen, mass(nr, gNr, false)), y: hoehe - rand - gNr, groesse: gNr, fett: false });
  return { texte, linien, qr: null };
}
