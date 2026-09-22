/**
 * Mengenumrechnung Kundenmenge -> Einkaufsmenge. Reine Funktionen.
 *
 * Regeln stammen ausschliesslich aus den vorhandenen Rechnern
 * (audit/tp-operations-v3/02-DATA-MODEL.md Abschnitt 4):
 *   - Paketware: max(1, ceil(bedarf / qm_pro_paket - 1e-9))   blocks/paket-auswahl.liquid
 *   - Leisten:   ceil(meter / stangenlaenge - 1e-9)           blocks/tp-zubehoer-menge.liquid
 *   - Rollenware: lfm = laenge / 100 bzw. flaeche / breite;
 *     das Lieferantenraster (0,1 m? 0,5 m?) ist NICHT belegt und wird nie
 *     geraten - ohne Raster bleibt die Zahl auf 0,01 lfm aufgerundet und
 *     das Feld `raster` sagt UNGEKLAERT.
 *
 * Es werden keine Rundungsregeln erfunden, die nicht in den Rechnern stehen.
 */

export const UNGEKLAERT = 'UNGEKLAERT';

/** Bestelleinheiten laut einkauf.bestelleinheit (02-DATA-MODEL.md Abschnitt 2). */
export const EINHEIT = Object.freeze({
  M2: 'm2',
  LFM: 'lfm',
  STUECK: 'stueck',
  PAKET: 'paket',
  ROLLE: 'rolle',
  KARTON: 'karton',
  SET: 'set',
  PAAR: 'paar',
  SONDERMASS: 'sondermass',
});

export const EINHEITEN = Object.freeze(Object.values(EINHEIT));

export function istEinheit(wert) {
  return EINHEITEN.includes(wert);
}

// Dieselbe Toleranz wie in den Rechnern: 7,2 / 2,4 ist in Gleitkomma
// 3,0000000000000004 und wuerde sonst eine Stange zu viel bestellen.
const EPS = 1e-9;

function zahl(wert) {
  if (wert === null || wert === undefined || wert === '') return NaN;
  if (typeof wert === 'number') return wert;
  return parseFloat(String(wert).replace(',', '.'));
}

/** Deutsche Darstellung mit zwei Nachkommastellen: 6.4 -> "6,40". */
export function formatDe(wert, stellen = 2) {
  return Number(wert).toFixed(stellen).replace('.', ',');
}

/**
 * Rollenware: Kundenmenge (Flaeche oder Laenge) -> laufende Meter je Breite.
 *
 * @param {object} p
 * @param {number} [p.flaecheM2]  Flaeche in m2 (wenn keine Laenge bekannt)
 * @param {number} [p.laengeCm]   Laenge in cm (gewinnt vor der Flaeche)
 * @param {number} p.breiteM      Rollenbreite in m
 * @param {number} [p.rasterM]    Lieferantenschritt in m; fehlt -> UNGEKLAERT
 * @returns {{lfm:number, breiteM:number, text:string, raster:(number|string), einheit:string}}
 */
export function rollenware({ flaecheM2, laengeCm, breiteM, rasterM } = {}) {
  const breite = zahl(breiteM);
  if (!(breite > 0)) throw new Error('rollenware: breiteM muss > 0 sein');

  let roh;
  const laenge = zahl(laengeCm);
  if (laenge > 0) {
    roh = laenge / 100;
  } else {
    const flaeche = zahl(flaecheM2);
    if (!(flaeche > 0)) throw new Error('rollenware: flaecheM2 oder laengeCm muss > 0 sein');
    roh = flaeche / breite;
  }

  const raster = zahl(rasterM);
  let lfm;
  let rasterFeld;
  if (raster > 0) {
    // Lieferantenschritt bekannt: auf das naechste Vielfache aufrunden.
    lfm = Math.ceil(roh / raster - EPS) * raster;
    lfm = Math.round(lfm * 100) / 100;
    rasterFeld = raster;
  } else {
    // Kein belegter Schritt: nur auf 0,01 lfm aufrunden, Raster bleibt offen.
    lfm = Math.ceil(roh * 100 - EPS) / 100;
    rasterFeld = UNGEKLAERT;
  }

  return {
    lfm,
    breiteM: breite,
    einheit: EINHEIT.LFM,
    raster: rasterFeld,
    text: `${formatDe(lfm)} lfm × ${formatDe(breite)} m`,
  };
}

/**
 * Paketware: ganze Pakete, nie abgerundet (blocks/paket-auswahl.liquid computePackages).
 *
 * @param {object} p
 * @param {number} p.bedarfM2    benoetigte Flaeche in m2 (inkl. Verschnitt, wenn gewuenscht)
 * @param {number} p.qmProPaket  custom.qm_pro_paket
 * @returns {{pakete:number, qmGesamt:number, einheit:string}}
 */
export function paketware({ bedarfM2, qmProPaket } = {}) {
  const qm = zahl(qmProPaket);
  if (!(qm > 0)) throw new Error('paketware: qmProPaket muss > 0 sein');
  const bedarf = Math.max(0, zahl(bedarfM2) || 0);
  const pakete = Math.max(1, Math.ceil(bedarf / qm - EPS));
  return {
    pakete,
    qmGesamt: Math.round(pakete * qm * 100) / 100,
    einheit: EINHEIT.PAKET,
  };
}

/**
 * Leisten: Stangen aus Metern und Stangenlaenge des Artikels
 * (custom.stangenlaenge; keine pauschale 2,5-m-Regel).
 *
 * @returns {{stangen:(number|string), meterGesamt:(number|string), einheit:string}}
 */
export function leisten({ lfm, stangenlaengeM } = {}) {
  const meter = zahl(lfm);
  if (!(meter > 0)) throw new Error('leisten: lfm muss > 0 sein');
  const stange = zahl(stangenlaengeM);
  if (!(stange > 0)) {
    // Stangenlaenge fehlt am Produkt: nichts annehmen.
    return { stangen: UNGEKLAERT, meterGesamt: UNGEKLAERT, einheit: EINHEIT.STUECK, stangenlaengeM: UNGEKLAERT };
  }
  const stangen = Math.ceil(meter / stange - EPS);
  return {
    stangen,
    meterGesamt: Math.round(stangen * stange * 100) / 100,
    einheit: EINHEIT.STUECK,
    stangenlaengeM: stange,
  };
}

/** Stueckware: Menge 1:1, ganze Stueck. */
export function stueck({ menge } = {}) {
  const m = zahl(menge);
  if (!(m > 0)) throw new Error('stueck: menge muss > 0 sein');
  if (!Number.isInteger(m)) throw new Error('stueck: menge muss ganzzahlig sein');
  return { stueck: m, einheit: EINHEIT.STUECK };
}
