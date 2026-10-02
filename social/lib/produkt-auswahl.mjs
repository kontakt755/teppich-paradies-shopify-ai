/**
 * Shop-Scout: welche Produkte sind es wert, gezeigt zu werden?
 *
 * Der Shop fuehrt ueber 500 Artikel, und fast alle tragen einen Streichpreis.
 * "Neu" und "rabattiert" allein sind deshalb kein Anlass. Gewertet wird nach
 * Familien (alle Dekore einer Vinylserie sind EIN Thema), nach Bildmaterial
 * (ohne gutes Bild kein Beitrag), nach Jahreszeit, nach Musterbestellungen und
 * danach, wie lange eine Familie nicht mehr gezeigt wurde.
 *
 * Reine Funktionen - der Abruf steckt in shop-quelle.mjs, das Speichern im CLI.
 */

import { vergleichJeEinheit } from './shop-quelle.mjs';

const TAG = 24 * 60 * 60 * 1000;

export const REGELN = Object.freeze({
  neuTage: 14,              // so lange gilt ein Produkt als neu
  angebotAbProzent: 20,     // der uebliche Shop-Rabatt liegt bei 5-15 % und ist kein Anlass
  farbenAb: 4,              // ab so vielen Farben/Dekoren lohnt ein Karussell
  ruheTage: 45,             // so lange wird eine Familie nach einem Beitrag nicht erneut vorgeschlagen
  ruheTageAngebot: 14,
  hoechstens: 10,           // Vorrat je Lauf
  jeArt: 3,
  jeGruppe: 3,
});

const SAISON = {
  herbst: ['Teppichboden', 'Teppich', 'Teppich nach Maß', 'Sauberlauf', 'Dekofell'],
  winter: ['Teppichboden', 'Teppich', 'Teppich nach Maß', 'Dekofell'],
  fruehling: ['Klickvinyl', 'Klebevinyl', 'Linoleumboden', 'Vinyl von der Rolle'],
  sommer: ['Klickvinyl', 'Vinyl von der Rolle', 'Linoleumboden', 'Sauberlauf'],
};

export function saison(datum = new Date()) {
  const m = datum.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'fruehling';
  if (m >= 6 && m <= 8) return 'sommer';
  if (m >= 9 && m <= 11) return 'herbst';
  return 'winter';
}

function tageSeit(iso, jetzt) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Infinity : (jetzt.getTime() - t) / TAG;
}

/** Die Bilder eines Beitrags: Raumbilder zuerst, dann Details, dann Produktflaechen. */
export function besteBilder(produkt, grenze = 6) {
  const rang = { raum: 0, detail: 1, produkt: 2 };
  return produkt.bilder
    .filter(b => b.tauglich)
    .sort((a, b) => rang[a.rolle] - rang[b.rolle] || (b.breite * b.hoehe) - (a.breite * a.hoehe))
    .slice(0, grenze);
}

function familien(produkte) {
  const map = new Map();
  for (const p of produkte) {
    if (!map.has(p.familie)) map.set(p.familie, { schluessel: p.familie, name: p.familienName, typ: p.typ, mitglieder: [] });
    map.get(p.familie).mitglieder.push(p);
  }
  return map;
}

/**
 * @param produkte  normalisierte Produkte (shop-quelle.normalisiere)
 * @param stand     Map handle -> letzter bekannter Stand (db.produktStand)
 * @param preise    Map handle -> {betrag, einheit} Quadratmeterpreise aus dem Lexikon
 * @param nachfrage Map name -> Anzahl Musterbestellungen
 */
export function findeKandidaten({ produkte, stand = new Map(), preise = new Map(), nachfrage = new Map(), jetzt = new Date(), regeln = REGELN } = {}) {
  const jahreszeit = saison(jetzt);
  const monat = jetzt.toISOString().slice(0, 7);
  const kandidaten = [];

  const brauchbar = produkte.filter(p => p.verfuegbar && !p.zubehoer && p.bilder.some(b => b.tauglich));

  for (const fam of familien(brauchbar).values()) {
    const mitglieder = fam.mitglieder;
    // Das Aushaengeschild der Familie: das Produkt mit dem besten Bildmaterial.
    const bild = p => (p.bilder.some(b => b.tauglich && b.rolle === 'raum') ? 2 : 0) + Math.min(p.bilder.filter(b => b.tauglich).length, 4) / 4;
    const haupt = [...mitglieder].sort((a, b) => bild(b) - bild(a))[0];
    const zuletzt = Math.min(...mitglieder.map(p => tageSeit(stand.get(p.handle)?.zuletzt_beworben, jetzt)));
    const hatRaumbild = mitglieder.some(p => p.bilder.some(b => b.tauglich && b.rolle === 'raum'));

    let zusatz = 0; const gruende = [];
    if (hatRaumbild) { zusatz += 15; gruende.push('Raumbild vorhanden'); }
    if (SAISON[jahreszeit].includes(fam.typ)) { zusatz += 10; gruende.push(`passt in den ${jahreszeit === 'fruehling' ? 'Frühling' : jahreszeit[0].toUpperCase() + jahreszeit.slice(1)}`); }
    const muster = nachfrage.get(String(fam.name).toLowerCase());
    if (muster) { zusatz += 15; gruende.push(`${muster} Musterbestellungen`); }
    if (zuletzt === Infinity) { zusatz += 8; gruende.push('noch nie gezeigt'); }
    else if (zuletzt > 120) { zusatz += 6; gruende.push(`seit ${Math.round(zuletzt)} Tagen nicht gezeigt`); }

    const preis = preise.get(haupt.handle) ?? null;
    const basis = {
      familie: fam.schluessel, familienName: fam.name, gruppe: fam.typ,
      hauptHandle: haupt.handle, titel: haupt.titel, url: haupt.url,
      produkte: mitglieder.map(p => p.handle),
      preisJeEinheit: preis,
      beschreibung: haupt.beschreibung,
      tags: haupt.tags,
    };
    const dazu = (art, punkte, grund, extra = {}) => kandidaten.push({
      art, schluessel: `shopify:${art}:${fam.schluessel}:${monat}`,
      punkte: punkte + zusatz, grund: [grund, ...gruende].join(' · '),
      bilder: besteBilder(haupt), ...basis, ...extra,
    });

    // Angebot: nur echte Ausreisser nach oben, nie der uebliche Shop-Rabatt.
    const angebote = mitglieder.filter(p => p.starkReduziert || p.rabattProzent >= regeln.angebotAbProzent);
    if (angebote.length && zuletzt >= regeln.ruheTageAngebot) {
      const a = angebote.sort((x, y) => y.rabattProzent - x.rabattProzent)[0];
      dazu('angebot', 60 + Math.min(a.rabattProzent, 40) / 2, `${a.rabattProzent} % unter dem bisherigen Preis`, {
        hauptHandle: a.handle, titel: a.titel, url: a.url, bilder: besteBilder(a),
        rabattProzent: a.rabattProzent, preisJeEinheit: preise.get(a.handle) ?? null,
        vergleichJeEinheit: vergleichJeEinheit(a, preise.get(a.handle)),
      });
    }
    if (zuletzt < regeln.ruheTage) continue;

    // Neu: die ganze Familie ist frisch im Shop.
    const neue = mitglieder.filter(p => tageSeit(p.veroeffentlicht, jetzt) <= regeln.neuTage);
    if (neue.length === mitglieder.length) {
      const anzahl = mitglieder.length;
      dazu('produkt_neu', 55 + Math.min(anzahl, 6), anzahl > 1 ? `neue Serie mit ${anzahl} Designs` : 'neu im Shop', {
        serie: anzahl > 1,
        serienBilder: anzahl > 1 ? mitglieder.map(p => ({ ...besteBilder(p, 1)[0], beschriftung: p.titel.replace(fam.name, '').replace(/^[\s–-]+/, '').trim() || p.titel })).filter(b => b.src).slice(0, 10) : [],
      });
      continue;
    }

    // Neue Farbe: der letzte Lauf kannte weniger Farben als heute.
    for (const p of mitglieder) {
      const alt = stand.get(p.handle)?.farben;
      if (!Array.isArray(alt) || !alt.length) continue;
      const hinzu = p.farben.filter(f => !alt.includes(f));
      if (hinzu.length) {
        dazu('produkt_farben', 50, `${hinzu.length} neue Farbe(n): ${hinzu.slice(0, 4).join(', ')}`, {
          hauptHandle: p.handle, titel: p.titel, url: p.url, neueFarben: hinzu,
          farbBilder: p.bilder.filter(b => b.tauglich && hinzu.includes(b.farbe)).map(b => ({ ...b, beschriftung: b.farbe })),
        });
        break;
      }
    }

    // Farbvorstellung: viele Farben an einem Produkt oder viele Dekore in einer Familie.
    const farbProdukt = [...mitglieder].sort((a, b) => b.farben.length - a.farben.length)[0];
    const farbBilder = farbProdukt.bilder.filter(b => b.tauglich && b.farbe);
    const jeFarbe = [...new Map(farbBilder.map(b => [b.farbe, b])).values()];
    if (jeFarbe.length >= regeln.farbenAb) {
      dazu('produkt_farben', 35 + Math.min(jeFarbe.length, 10), `${farbProdukt.farben.length} Farben`, {
        hauptHandle: farbProdukt.handle, titel: farbProdukt.titel, url: farbProdukt.url,
        farbAnzahl: farbProdukt.farben.length,
        farbBilder: jeFarbe.slice(0, 9).map(b => ({ ...b, beschriftung: b.farbe })),
      });
    } else if (mitglieder.length >= regeln.farbenAb) {
      const dekore = mitglieder.map(p => ({ ...besteBilder(p, 1)[0], beschriftung: p.titel.replace(fam.name, '').replace(/^[\s–-]+/, '').trim() })).filter(b => b.src && b.beschriftung);
      if (dekore.length >= regeln.farbenAb) {
        dazu('produkt_farben', 35 + Math.min(dekore.length, 10), `${mitglieder.length} Dekore`, { farbAnzahl: mitglieder.length, farbBilder: dekore.slice(0, 9), serie: true });
      }
    }

    if (hatRaumbild) dazu('raumidee', 30, 'Raumbild als Wohnidee');
    dazu('produkt_woche', 22, 'Kandidat für Produkt der Woche');
  }

  return waehleAus(kandidaten, regeln);
}

/** Aus allen Anlaessen den Vorrat eines Laufs: je Familie einer, gemischt nach Art und Warengruppe. */
export function waehleAus(kandidaten, regeln = REGELN) {
  const sortiert = [...kandidaten].sort((a, b) => b.punkte - a.punkte || a.schluessel.localeCompare(b.schluessel));
  const genommen = []; const familie = new Set(); const jeArt = {}; const jeGruppe = {};
  for (const k of sortiert) {
    if (genommen.length >= regeln.hoechstens) break;
    if (familie.has(k.familie)) continue;
    if ((jeArt[k.art] ?? 0) >= regeln.jeArt) continue;
    if ((jeGruppe[k.gruppe] ?? 0) >= regeln.jeGruppe) continue;
    familie.add(k.familie);
    jeArt[k.art] = (jeArt[k.art] ?? 0) + 1;
    jeGruppe[k.gruppe] = (jeGruppe[k.gruppe] ?? 0) + 1;
    genommen.push(k);
  }
  return genommen;
}

/** Was vom heutigen Feed fuer den naechsten Vergleich gemerkt wird. */
export function standAus(produkt, alt, jetzt = new Date()) {
  return {
    titel: produkt.titel,
    familie: produkt.familie,
    gruppe: produkt.typ,
    erstgesehen: alt?.erstgesehen ?? jetzt.toISOString(),
    zuletzt_gesehen: jetzt.toISOString(),
    farben: produkt.farben,
    bilder: produkt.bilder.length,
    preis_min: produkt.preisMin,
    vergleich_max: produkt.vergleichMax,
  };
}
