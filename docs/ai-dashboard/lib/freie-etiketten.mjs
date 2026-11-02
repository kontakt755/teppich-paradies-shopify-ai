/**
 * Eigene Aufkleber mit freiem Text (Wunsch Mitarbeiter 02.11.), z. B. Wegweiser fuers Lager. Rein rechnend.
 * Sie haengen an keinem Produkt und keiner Bestellung: es wird nichts gespeichert und nichts als gedruckt vermerkt.
 */
import { ABSENDER, ETIKETT, MIN_SCHRIFT, layoutProbleme, qrRaster, tinte } from './muster-etiketten.mjs';
import { DRUCK_LIMIT } from './druckliste.mjs';

/** Mehr Text passt auch auf 50 x 100 nicht lesbar; die Grenze haelt die Vorschau beim Tippen schnell. */
export const FREI_MAX_ZEICHEN = 2000;
export const FREI_MAX_ANZAHL = 99;
/** Groesste Schrift: fuellt 50 x 50 mit einem kurzen Wort, ohne dass die Hoehe erst lange gesucht wird. */
const G_MAX = 240;
/** 203 dpi, gerundet wie ueberall im Druck. */
const PX_JE_MM = 8;

/** Eigene Groesse (Wunsch Benutzer 02.11.): nur fuer eigene Aufkleber, nie im Musterdruck. */
export const FORMAT_EIGEN = 'eigen';
export const EIGEN_BREITE = Object.freeze({ min: 20, max: 50 });
export const EIGEN_LAENGE = Object.freeze({ min: 10, max: 200 });
/** Feste Schriftgroessen zur Auswahl. Die Liste statt freier Eingabe kann nichts Ungueltiges enthalten; 30 mm = G_MAX. */
export const FREI_SCHRIFT_MM = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30]);

const mmWert = v => {
  const s = String(v ?? '').trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};
const imBereich = (wert, { min, max }) => wert >= min && wert <= max;
const mmText = wert => String(wert).replace('.', ',');

/** Was an der eigenen Groesse nicht stimmt, als Satz fuer den Dialog; leer = gueltig. */
export function eigeneGroesseFehler(breite, laenge) {
  if (!imBereich(mmWert(breite), EIGEN_BREITE)) return `Die Breite muss zwischen ${EIGEN_BREITE.min} und ${EIGEN_BREITE.max} mm liegen. So wird nichts gedruckt.`;
  if (!imBereich(mmWert(laenge), EIGEN_LAENGE)) return `Die Länge muss zwischen ${EIGEN_LAENGE.min} und ${EIGEN_LAENGE.max} mm liegen. So wird nichts gedruckt.`;
  return '';
}

/**
 * Rand einer eigenen Groesse in px: 15 % der kurzen Seite, zwischen 2 und 4 mm. Das trifft die erprobten Rollen
 * (kurze Seite 20 mm = 3 mm, am 02.11. so auf echten Etiketten gedruckt; ab rund 27 mm = 4 mm wie 50 x 50, Grund
 * dort: Rolle und Druckanfang sitzen nicht auf den Millimeter genau). Unter 2 mm nicht: bei 50 mm Breite schneidet
 * der Druckkopf schon 1 mm je Seite weg, und bei 10 mm Rollenbreite blieben so noch 6 mm fuer Text. Die 2 mm sind
 * gerechnet, nicht auf echten Etiketten geprueft.
 */
export const eigenerRand = (breite, hoehe) => Math.min(ETIKETT.rand, Math.max(2 * PX_JE_MM, Math.round(Math.min(breite, hoehe) * 0.15)));

/** Format aus Breite und Laenge in mm (auch "37,5"), gebaut wie die festen Formate; null, wenn ungueltig. */
export function eigenesFormat(breiteMm, laengeMm) {
  if (eigeneGroesseFehler(breiteMm, laengeMm)) return null;
  const b = mmWert(breiteMm), l = mmWert(laengeMm);
  const breite = Math.round(b * PX_JE_MM), hoehe = Math.round(l * PX_JE_MM);
  return { ...ETIKETT, format: FORMAT_EIGEN, name: `${mmText(b)} × ${mmText(l)} mm`, breite, hoehe, rand: eigenerRand(breite, hoehe), faktor: hoehe / ETIKETT.breite };
}

/** Druckkopf des B1 in px: ein breiteres Bild verliert links und rechts, was darueber liegt (aufDruckkopf). */
const B1_KOPF = 384;
/**
 * Groesster Druckversatz in mm, bei dem auf diesem Format nichts abgeschnitten wird: der Text beginnt erst am Rand,
 * waagerecht geht davon ab, was der Druckkopf ohnehin wegschneidet. 50 x 50 bleibt bei den 3 mm der Auswahl.
 */
export const versatzGrenze = format => ({ x: (format.rand - Math.max(0, (format.breite - B1_KOPF) / 2)) / PX_JE_MM, y: format.rand / PX_JE_MM });

const AUSRICHTUNGEN = ['links', 'mitte', 'rechts'];
/**
 * Einstellungen des Dialogs, gelten fuer alle Aufkleber darin. Ohne Angabe wie bisher: automatische Groesse, fett, mittig.
 * `schrift` ist 'auto' oder eine feste Groesse in mm, `quer` dreht den Text entlang der Rolle.
 */
export function freiStil({ schrift, fett, ausrichtung, quer } = {}) {
  return {
    schrift: FREI_SCHRIFT_MM.includes(Number(schrift)) ? Number(schrift) : 'auto',
    fett: fett !== false,
    ausrichtung: AUSRICHTUNGEN.includes(ausrichtung) ? ausrichtung : 'mitte',
    quer: quer === true,
  };
}

/** Die Aufkleber im Eingabefeld als Zeilen: jede Zeile eine Zeile auf dem Aufkleber, eine Leerzeile beginnt den naechsten. */
export function freieZeilen(eingabe) {
  return String(eingabe ?? '').slice(0, FREI_MAX_ZEICHEN).split(/\r?\n(?:[ \t]*\r?\n)+/)
    .map(b => b.split(/\r?\n/).map(z => z.trim()).filter(Boolean))
    .filter(zeilen => zeilen.length);
}
/** Schluessel einer Zeile in `zeilenSchrift`: Aufkleber und Zeile, beide ab 0. */
export const zeilenSchluessel = (motiv, zeile) => `${motiv}:${zeile}`;

/**
 * Text aus dem Eingabefeld als Aufkleber.
 * `zeilenSchrift`: feste Schrift in mm je Zeile (zeilenSchluessel), sie geht vor der Schrift aus den Einstellungen.
 * `url`: Produktadresse fuer den QR-Code, gilt fuer jeden Aufkleber im Dialog.
 * @returns {object[]} je Aufkleber `anzahl` Kopien, hoechstens DRUCK_LIMIT.etiketten
 */
export function freieEtiketten(eingabe, anzahl = 1, { zeilenSchrift = {}, url = '' } = {}) {
  const kopien = Math.min(FREI_MAX_ANZAHL, Math.max(1, Math.trunc(Number(anzahl)) || 1));
  const motive = freieZeilen(eingabe).map((zeilen, m) => {
    const schriften = zeilen.map((_, z) => { const mm = Number(zeilenSchrift[zeilenSchluessel(m, z)]); return FREI_SCHRIFT_MM.includes(mm) ? mm : 0; });
    return { art: 'frei', zeilen, schriften: schriften.some(Boolean) ? schriften : null, fehlt: [], serie: zeilen.join(' · '), farbe: '', sku: '', url, technik: [] };
  });
  return motive.flatMap(e => Array.from({ length: kopien }, () => e)).slice(0, DRUCK_LIMIT.etiketten);
}

/**
 * Vorbefuellter Entwurf aus einem fertigen Produktetikett (etikett() in muster-etiketten.mjs): dieselben Angaben wie
 * auf dem Musteraufkleber, aber als aenderbarer Text. Serie und Farbe bleiben automatisch gross; Absender, Technik und
 * Art.-Nr. stehen fest klein wie auf dem Musteraufkleber. Die Eckdaten mit `zusatz` setzt auch layout() nur bei Platz,
 * sie bleiben hier weg und koennen von Hand dazu.
 * @returns {{text: string, zeilenSchrift: object, url: string}}
 */
export function produktEntwurf(e) {
  const zeilen = [[ABSENDER, 2], [e.serie, 0], [e.farbe, 0],
    ...(e.technik || []).filter(t => !t.zusatz).map(t => [`${t.label}: ${t.wert}`, 2]),
    [e.sku ? `Art.-Nr. ${e.sku}` : '', 3]].filter(([t]) => t);
  const zeilenSchrift = {};
  zeilen.forEach(([, mm], i) => { if (mm) zeilenSchrift[zeilenSchluessel(0, i)] = mm; });
  return { text: zeilen.map(([t]) => t).join('\n'), zeilenSchrift, url: e.url || '' };
}

/**
 * Was wo steht, in Pixeln des Etiketts - wie layout() in muster-etiketten.mjs, mit `passt` und `probleme`.
 * Automatisch ist jede Zeile so gross, wie Breite und Hoehe zulassen. Lange Zeilen werden nur kleiner, nie
 * umbrochen: wo die Zeile endet, bestimmt, wer den Aufkleber schreibt. Eine feste Schrift aendert nichts von selbst:
 * passt sie nicht, meldet layoutProbleme das und der Druck bleibt gesperrt. Das gilt auch fuer die Schrift je Zeile
 * (`e.schriften`); automatische Zeilen daneben teilen sich den Platz, der uebrig bleibt.
 * Mit `e.url` steht unten mittig der QR-Code, der Text bekommt die Hoehe darueber.
 * `quer: true` heisst wie bei adressLayout: Koordinaten gelten im gedrehten Format (Breite = Rollenlaenge),
 * zeichne() im Druckdialog dreht das Bild um 90 Grad im Uhrzeigersinn auf die Rolle.
 */
export function freiLayout(e, mass, format, einstellungen) {
  const { schrift, fett, ausrichtung, quer } = freiStil(einstellungen);
  const flaeche = quer ? { ...format, breite: format.hoehe, hoehe: format.breite } : format;
  const { breite, hoehe, rand } = flaeche;
  const innen = breite - 2 * rand, hoch = hoehe - 2 * rand;
  const zeilen = e.zeilen || [];
  const allgemein = schrift === 'auto' ? 0 : schrift * PX_JE_MM;
  const feste = zeilen.map((_, i) => (e.schriften?.[i] || 0) * PX_JE_MM || allgemein);
  const allesFest = feste.every(Boolean);
  const qrFlaeche = e.url ? qrRaster(e.url, Math.min(innen, Math.round(hoch * 0.4))) : 0;
  const qr = qrFlaeche ? { x: Math.round((breite - qrFlaeche) / 2), y: hoehe - rand - qrFlaeche, groesse: qrFlaeche } : null;
  const textHoch = qr ? hoch - qrFlaeche - 8 : hoch;
  const passend = zeilen.map((t, i) => {
    if (feste[i]) return feste[i];
    let g = G_MAX;
    while (g > MIN_SCHRIFT && mass(t, g, fett) > innen) g--;
    return g;
  });
  const xVon = w => (ausrichtung === 'links' ? rand : ausrichtung === 'rechts' ? breite - rand - w : (breite - w) / 2);
  const stapel = obergrenze => {
    const out = [];
    zeilen.forEach((text, i) => {
      const groesse = feste[i] || Math.min(obergrenze, passend[i]), v = out.at(-1);
      const y = v ? v.y + tinte(v.text, v.groesse).unten + tinte(text, groesse).oben + Math.max(3, Math.round(v.groesse * 0.1)) : tinte(text, groesse).oben;
      out.push({ text, groesse, y, x: xVon(mass(text, groesse, fett)), fett });
    });
    return out;
  };
  const hoeheVon = s => s.at(-1).y + s.at(-1).groesse;
  let texte = [];
  for (let obergrenze = G_MAX; obergrenze >= MIN_SCHRIFT && zeilen.length; obergrenze--) {
    texte = stapel(obergrenze);
    if (allesFest || hoeheVon(texte) <= textHoch) break;
  }
  if (texte.length) {
    const ab = rand + Math.max(0, Math.floor((textHoch - hoeheVon(texte)) / 2));
    texte = texte.map(t => ({ ...t, y: t.y + ab }));
  }
  const probleme = layoutProbleme({ texte, linien: [], qr }, mass, flaeche, e.url);
  return { texte, linien: [], qr, passt: !probleme.length, probleme, quer };
}
