/**
 * Adressaufkleber fuer Musterbriefe (Kunden → Muster packen, #1572) auf dem Niimbot B1.
 * Absender klein und unterstrichen, Empfaenger gross. Keine Bestellnummer: sie geht den Postweg
 * nichts an (Inhaber 22.10.); welcher Umschlag zu welcher Bestellung gehoert, zeigt die Packliste. Gleiche Bauart
 * wie layout() in muster-etiketten.mjs, damit der vorhandene Druckdialog beide zeichnen kann.
 * Das Porto (Internetmarke) kommt separat auf den Umschlag. Testbar ohne Drucker und ohne DOM.
 */
import { ETIKETT, MIN_SCHRIFT, einpassen, layoutProbleme, stapeln, tinte, umbrechen, woerterPassen } from './muster-etiketten.mjs';

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

/** Unter dieser Schrift duerfen Empfaengerzeilen umbrechen; darueber werden sie nur kleiner. */
const UMBRUCH_AB = 20;

/**
 * Was wo steht, in Pixeln des Etiketts - wie layout() in muster-etiketten.mjs, mit `passt` und `probleme`.
 * `mass(text, groesse, fett)` misst Text. Eine Schrift fuer alle Empfaengerzeilen: so gross, wie Breite und
 * Hoehe zulassen; unter 20 px brechen zu lange Zeilen an Wortgrenzen um. Nie unter MIN_SCHRIFT.
 */
export function adressLayout(e, mass, format = ETIKETT) {
  const { breite, hoehe, rand } = format;
  const innen = breite - 2 * rand;
  const probleme = [];
  const gAbs = Math.min(...ABSENDER.map(t => einpassen(t, innen, 19, MIN_SCHRIFT, false, mass).g));
  const texte = stapeln(ABSENDER, gAbs, false, { y: rand }, gAbs + 4, rand);
  const letzte = texte.at(-1);
  const linien = [{ x1: rand, x2: rand + Math.min(innen, Math.max(...ABSENDER.map(t => mass(t, gAbs, false)))), y: letzte.y + Math.max(gAbs + 5, tinte(letzte.text, gAbs).unten + 2) }];
  const y = linien[0].y + 27;

  const unten = hoehe - rand;
  const zeilenFuer = g => {
    const out = [];
    for (const z of e.empfaenger || []) {
      if (mass(z.text, g, z.fett) <= innen) { out.push(z); continue; }
      if (g > UMBRUCH_AB) return null;
      const getrennt = !woerterPassen(z.text, innen, g, z.fett, mass);
      out.push(...umbrechen(z.text, innen, t => mass(t, g, z.fett), Infinity).map(t => ({ text: t, fett: z.fett, getrennt })));
    }
    return out;
  };
  let block = [];
  for (let g = 36; g >= MIN_SCHRIFT; g--) {
    const zeilen = zeilenFuer(g);
    if (!zeilen || (zeilen.some(z => z.getrennt) && g > MIN_SCHRIFT)) continue;
    block = [];
    for (const z of zeilen) block.push(...stapeln([z.text], g, z.fett, block.at(-1) || { y: 0 }, Math.round(g * 1.22), rand));
    if (zeilen.some(z => z.getrennt)) probleme.push('Ein Wort der Adresse ist zu lang');
    if (!block.length || block.at(-1).y + g <= unten - y) break;
  }
  const hoeheBlock = block.length ? block.at(-1).y + block.at(-1).groesse : 0;
  const ab = y + Math.max(0, Math.floor((unten - y - hoeheBlock) / 2));
  texte.push(...block.map(t => ({ ...t, y: t.y + ab })));
  probleme.push(...layoutProbleme({ texte, linien }, mass, format));
  return { texte, linien, qr: null, passt: !probleme.length, probleme };
}
