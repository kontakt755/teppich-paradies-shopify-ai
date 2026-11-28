/**
 * Ansicht "Onlineshop" (#/onlineshop, Inhaber 28.11.2026): Gewinn je Kauf und Preiskontrolle.
 *
 * Teil 1 - Gewinn je Kauf: jeder bezahlte Warenkauf mit Erloes netto, Wareneinkauf, Ketteln und
 * Zuschlaegen, Weg zum Kunden, Zahlungsgebuehr und Rohertrag. Jede Zeile traegt ihre Guete:
 *   - belegt:    Kosten aus Rechnung oder Auftragsbestaetigung (Belegsammlung der Rentabilitaetsrechnung)
 *   - geschaetzt: EK-Liste und Tarife, gerechnet mit bestellWarnung() - derselben Rechnung wie im Bestelldialog
 *   - unbekannt: mit dem konkreten Grund, nie mit einer Zahl ("unbekannt statt schoen gerechnet")
 *
 * Teil 2 - Preiskontrolle: wo der heutige Shop-Preis das Ziel von ZIEL_ROHERTRAG nicht erreicht,
 *   A) aus echten Kaeufen (Preis oder Versand/Zuschlaege das Problem?) und
 *   B) ueber das ganze Sortiment (heutiger Preis gegen EK, ohne Versand, Einheiten streng geprueft).
 * Massgeblich ist immer der heutige Preis aus dem Lexikon-Export. Hier wird kein Preis geaendert.
 *
 * Reine Funktionen: Lesen der privaten Dateien macht der Server (scripts/dashboard-api.mjs), damit
 * alles mit erfundenen Daten pruefbar bleibt. Keine Werte im Repository.
 */

import { fertigpreis } from './bestellwarnung.mjs';

/**
 * Ziel-Rohertrag vom Netto. Quelle: EK-Liste des Inhabers, Spalte "max. Rabatt bis 30 % Rohertrag"
 * (ek-liste/ZUSAMMENFASSUNG-2026-10-19.md). Gilt fuer Kaeufe nach allen Kosten, im Sortiment ohne Versand.
 */
export const ZIEL_ROHERTRAG = 0.3;
const MASSWARE_ART = /^(Teppich|Läufer) nach Maß$/;
export const MWST = 0.19;

/** Was bei der Belegsammlung als belegt zaehlt (R = Rechnung, AB = Auftragsbestaetigung). */
const BELEGT = new Set(['R', 'AB']);
const KLASSE_TEXT = { A: 'aus einem Beleg abgeleitet', M: 'nach Tarif gerechnet', G: 'geschätzt', U: 'unbekannt' };
const ART_TEXT = { ware: 'Einkauf', kettel: 'Ketteln', zuschlag: 'Zuschläge', versand: 'Versand' };
const LIEFERWEG_FEHLT = 'Lieferweg schon bearbeiteter Ware, er ist nicht vermerkt';

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const istZahl = x => typeof x === 'number' && Number.isFinite(x);
const summe = l => l.reduce((a, b) => a + b, 0);
const geld = (o, f) => Number(o?.[f]?.shopMoney?.amount ?? 0) || 0;
const zeilenVon = o => (Array.isArray(o?.lineItems) ? o.lineItems : o?.lineItems?.nodes ?? []);
const normTitel = t => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// ------------------------------------------------------------------ Teil 1: welche Kaeufe zaehlen

/**
 * Warenkauf oder nicht? Gratismuster, Test-, stornierte, unbezahlte und ganz erstattete Bestellungen
 * zaehlen nicht. Gibt den Grund zurueck, damit die Ansicht die Ausschluesse zaehlen kann.
 */
export function kaufArt(auftrag, roh) {
  if (!roh) return 'fehlt';
  if (auftrag.testbestellung || roh.test) return 'test';
  if (auftrag.storniert || roh.cancelledAt) return 'storniert';
  const ware = (auftrag.positionen ?? []).filter(p => !p.istMuster && !p.eigenleistung && Number(p.mengeBestellt) > 0);
  if (!ware.length) return 'muster';
  const status = String(roh.displayFinancialStatus ?? '').toUpperCase();
  if (status === 'REFUNDED' || (geld(roh, 'currentTotalPriceSet') <= 0 && geld(roh, 'totalPriceSet') > 0)) return 'erstattet';
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(status)) return 'unbezahlt';
  if (geld(roh, 'currentTotalPriceSet') <= 0) return 'muster';
  return 'ware';
}

/**
 * Erloes nach Erstattungen und Aenderungen (current*-Summen von Shopify). Steht keine Steuer in der
 * Bestellung, wird die Umsatzsteuer trotzdem herausgerechnet - so rechnete auch die Rentabilitaet.
 */
export function erloes(roh) {
  const brutto = geld(roh, 'currentTotalPriceSet');
  const steuer = geld(roh, 'currentTotalTaxSet');
  const hinweise = [];
  const netto = steuer > 0 ? brutto - steuer : brutto / (1 + MWST);
  if (!(steuer > 0) && brutto > 0) hinweise.push('In Shopify ohne Umsatzsteuer, 19 % herausgerechnet.');
  const weniger = r2(geld(roh, 'totalPriceSet') - brutto);
  if (weniger > 0.009) hinweise.push(`Erstattung oder Änderung: ${weniger.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € brutto abgezogen.`);
  return { brutto: r2(brutto), netto: r2(netto), erstattetBrutto: weniger > 0.009 ? weniger : 0, hinweise };
}

/** Netto je Position nach Aenderungen: der Shop nennt den Preis der urspruenglichen Menge. */
function positionsNetto(p, rohZeile) {
  const n = p.nettoGesamt;
  if (!istZahl(n)) return null;
  const urspruenglich = Number(rohZeile?.quantity);
  const jetzt = Number(p.mengeBestellt);
  return urspruenglich > 0 && jetzt >= 0 && jetzt !== urspruenglich ? r2(n * jetzt / urspruenglich) : n;
}

// ------------------------------------------------------------------ Teil 1: Kosten aus Belegen

/** GLS-Preis wie in der Rentabilitaetsrechnung (rechnen.mjs), fuer Belegzeilen ohne festen Betrag. */
function glsAusTarif(t, { laenge, kg, breite = 20, hoehe = 20 }) {
  if (!t || laenge > t.max_cm) return null;
  const vol = laenge * breite * hoehe / 6000;
  const ab = kg <= 30 ? Math.min(30, Math.max(kg, vol)) : kg;
  const stufe = (t.stufen ?? []).find(([g]) => ab <= g);
  if (!stufe) return null;
  return r2((stufe[1] + (laenge > t.ueberlaenge_ab_cm ? t.ueberlaenge : 0) + t.privat) * (1 + t.energie + t.floater));
}

/**
 * Kosten eines Kaufs aus der Belegsammlung. null, wenn es keinen Eintrag gibt oder der Einkauf dort
 * selbst unbekannt ist - dann bleibt nur die Schaetzung.
 */
export function kostenAusBeleg(eintrag, tarife = {}) {
  if (!eintrag || !Array.isArray(eintrag.kosten) || !['R', 'AB', 'A'].includes(eintrag.klasse)) return null;
  if (eintrag.kosten.some(k => k.art === 'ware' && k.klasse === 'U')) return null;
  const teile = { ware: 0, kettel: 0, zuschlag: 0, versand: 0 };
  const ungenau = new Set();
  for (const k of eintrag.kosten) {
    let b = k.betrag;
    if (istZahl(k.kettler_m)) b = k.kettler_m * tarife.kettler_bis6qm;
    else if (k.gls && !istZahl(b)) b = glsAusTarif(tarife.gls, k.gls);
    if (!istZahl(b) || !(k.art in teile)) return null;
    teile[k.art] += b;
    if (!BELEGT.has(k.klasse)) ungenau.add(`${ART_TEXT[k.art] ?? k.art} ${KLASSE_TEXT[k.klasse] ?? 'nicht belegt'}`);
  }
  // Volle Rollenbreite berechnet, weniger verkauft: der Rest ist Verschnitt, kein zu niedriger Preis.
  const qmV = Number(eintrag.qm_verkauft);
  const qmB = Number(eintrag.qm_berechnet);
  const verschnitt = qmV > 0 && qmB > qmV + 0.05 ? r2(teile.ware * (1 - qmV / qmB)) : 0;
  const fl = x => x.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return {
    ware: r2(teile.ware), kettel: r2(teile.kettel), zuschlag: r2(teile.zuschlag), weg: r2(teile.versand), verschnitt,
    guete: BELEGT.has(eintrag.klasse) ? 'belegt' : 'geschaetzt',
    hinweise: [
      ...(eintrag.klasse === 'A' ? ['Einkauf aus einem Beleg abgeleitet.'] : []),
      ...(verschnitt ? [`Verschnitt: ${fl(qmB)} m² berechnet, ${fl(qmV)} m² verkauft.`] : []),
      ...(ungenau.size ? [`Nicht belegt: ${[...ungenau].join(', ')}.`] : []),
    ],
    nurEinePosition: eintrag.kosten.filter(k => k.art === 'ware').length === 1,
  };
}

// ------------------------------------------------------------------ Teil 1: Kosten geschaetzt

/** Kosten aus bestellWarnung().details, aufgeteilt wie in den Spalten. null-Betraege: unbekannt. */
function kostenAusSchaetzung(w, titelVon) {
  const d = w?.details;
  if (!d) return { gruende: ['Rechnung nicht möglich'] };
  const gruende = [];
  if (!d.ekBekannt) {
    const ohne = d.positionen.filter(p => p.ekSumme === null).map(p => titelVon(p.lineItemId));
    gruende.push(`Einkaufspreis fehlt: ${[...new Set(ohne)].join(', ')}`);
  }
  for (const g of d.offen) gruende.push(g);
  const posten = d.posten ?? [];
  // Annahme wie in allen bisherigen Rechnungen fuer Teppich nach Mass: der Lieferant berechnet die volle
  // Rollenbreite. Lieber zu vorsichtig als zu schoen - die Zeile nennt die Annahme.
  const verschnitt = r2(summe(d.positionen.filter(p => istZahl(p.vollerollenbreite) && istZahl(p.flaeche) && istZahl(p.ekJeM2) && p.vollerollenbreite > p.flaeche + 0.01)
    .map(p => (p.vollerollenbreite - p.flaeche) * p.ekJeM2)));
  return {
    gruende,
    ware: istZahl(d.ekSumme) ? r2(d.ekSumme + verschnitt) : d.ekSumme,
    verschnitt,
    kettel: r2(summe(posten.filter(x => x.art === 'kettel').map(x => x.betrag))),
    zuschlag: r2(summe(posten.filter(x => x.art === 'weg' && x.vomLieferanten).map(x => x.betrag))),
    weg: r2(summe(posten.filter(x => x.art === 'weg' && !x.vomLieferanten).map(x => x.betrag))),
    hinweise: [
      ...(verschnitt ? [`Annahme: Lieferant berechnet die volle Rollenbreite (Verschnitt ${verschnitt.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € im Einkauf), wie in den bisherigen Rechnungen.`] : []),
      ...(d.eigeneZustellung ? ['Fahrt im eigenen Liefergebiet nicht eingerechnet.'] : []),
      ...(d.versandVeraltet ? ['Versand mit dem letzten hinterlegten Dieselwert.'] : []),
    ],
  };
}

const ZIEL_TEXT = { kunde: 'direkt vom Lieferanten', kettler: 'über unseren Kettler', laden: 'über unser Lager' };

/**
 * Gewinn eines Kaufs. warnungFuer(auftrag, { standardweg }) liefert bestellWarnung(..., immer: true);
 * mit standardweg: true rechnet sie bearbeitete Ware ohne Vermerk mit dem ueblichen Weg.
 */
export function gewinnJeKauf({ auftrag, roh, warnungFuer, beleg = null, belegTarife = {}, gebuehr = null, gebuehrTarif = null }) {
  const e = erloes(roh);
  const rohZeilen = new Map(zeilenVon(roh).map(z => [z.id, z]));
  const titelVon = id => (auftrag.positionen.find(p => p.lineItemId === id)?.titel ?? 'Artikel');
  const hinweise = [...e.hinweise];
  const gruende = [];

  let w = warnungFuer(auftrag, { standardweg: false });
  let kosten = null;
  let guete = 'geschaetzt';
  const ausBeleg = kostenAusBeleg(beleg, belegTarife);
  if (ausBeleg) {
    kosten = ausBeleg;
    guete = ausBeleg.guete;
    hinweise.push(...ausBeleg.hinweise);
  } else {
    let s = kostenAusSchaetzung(w, titelVon);
    // Erlaubt nur mit klarer Annahme: bearbeitete Ware ohne vermerkten Weg rechnet mit dem ueblichen Weg.
    if (s.gruende.includes(LIEFERWEG_FEHLT)) {
      const w2 = warnungFuer(auftrag, { standardweg: true });
      const s2 = kostenAusSchaetzung(w2, titelVon);
      if (!s2.gruende.length) {
        w = w2;
        s = s2;
      }
    }
    if (s.gruende.length) gruende.push(...s.gruende);
    else kosten = s;
    if (kosten) {
      hinweise.push(...s.hinweise);
      const ohneVermerk = (w?.details?.positionen ?? []).filter(p => !p.vermerkt);
      if (ohneVermerk.length) {
        const wege = [...new Set(ohneVermerk.map(p => ZIEL_TEXT[p.ziel] ?? p.ziel))].join(', ');
        hinweise.push(`Annahme: Lieferweg nicht vermerkt, gerechnet mit dem üblichen Weg (${wege}).`);
      }
      if (w?.details?.positionen?.some(p => p.zeile?.sicherheit === 'abgeleitet')) hinweise.push('Einkauf aus der abgeleiteten EK-Liste.');
      // Fertiger Teppich: Kante im Preis, kein Kettler; Mindestflaeche und Lieferpauschale des Herstellers.
      const fertige = (w?.details?.positionen ?? []).filter(p => p.fertig);
      if (fertige.length) {
        const min = [...new Set(fertige.map(p => p.fertig.minM2).filter(Boolean))];
        hinweise.push(`${fertige.some(p => !p.vermerkt) ? 'Annahme: ' : ''}Fertiger Teppich direkt vom Hersteller, Kante im Einkaufspreis${min.length ? `, berechnet mindestens ${min.join(' bzw. ')} m²` : ''}, Lieferpauschale des Herstellers in den Zuschlägen.`);
      }
    }
  }

  let gebuehrBetrag = null;
  let gebuehrGuete = null;
  if (istZahl(gebuehr)) { gebuehrBetrag = gebuehr; gebuehrGuete = 'belegt'; }
  else if (gebuehrTarif && istZahl(gebuehrTarif.prozentBrutto)) {
    gebuehrBetrag = r2(e.brutto * gebuehrTarif.prozentBrutto / 100 + (gebuehrTarif.fix ?? 0));
    gebuehrGuete = 'geschaetzt';
    if (kosten) hinweise.push('Zahlungsgebühr nach Tarif geschätzt.');
  } else gruende.push('Zahlungsgebühr: Tarif fehlt');

  const positionen = (auftrag.positionen ?? []).filter(p => !p.istMuster && !p.eigenleistung && Number(p.mengeBestellt) > 0 && p.masspruefung?.status !== 'bestand').map(p => {
    const d = w?.details?.positionen?.find(x => x.lineItemId === p.lineItemId);
    return {
      lineItemId: p.lineItemId, titel: p.titel ?? 'Artikel', variante: p.farbe ?? '', handle: p.handle ?? null, sku: p.sku ?? null, lieferant: p.lieferant ?? null,
      einheit: p.masspruefung?.einheit ?? '', menge: Number(p.mengeBestellt), netto: positionsNetto(p, rohZeilen.get(p.lineItemId)),
      ek: d?.ekSumme ?? null, ekZeile: d?.zeile ?? null, fertig: Boolean(d?.fertig),
    };
  });
  // Eigenleistungen (Kettelservice, Fertigungspauschale) bringen Erloes fuer Kante und Fertigung.
  const nettoNebenleistung = r2(summe((auftrag.positionen ?? []).filter(p => p.eigenleistung && !p.istMuster).map(p => positionsNetto(p, rohZeilen.get(p.lineItemId)) ?? 0)));
  // Belegt und nur eine Ware: dann gehoert der belegte Einkauf genau dieser Position.
  // Fuer die Preisfrage zaehlt der Einkauf ohne Verschnitt.
  if (ausBeleg?.nurEinePosition && positionen.length === 1) { positionen[0].ekBeleg = r2(ausBeleg.ware - ausBeleg.verschnitt); }

  const rechenbar = kosten !== null && gebuehrBetrag !== null && !gruende.length;
  const zeile = {
    orderId: auftrag.id, name: auftrag.name, datum: auftrag.datum, monat: String(auftrag.datum ?? '').slice(0, 7),
    brutto: e.brutto, netto: e.netto, erstattetBrutto: e.erstattetBrutto, nettoNebenleistung,
    guete: rechenbar ? guete : 'unbekannt', gruende: [...new Set(gruende)], hinweise: [...new Set(hinweise)],
    ware: null, verschnitt: null, kettel: null, zuschlag: null, weg: null, gebuehr: null, gebuehrGuete: null, rohertrag: null, quote: null,
    positionen,
  };
  if (!rechenbar) return zeile;
  const rohertrag = r2(e.netto - kosten.ware - kosten.kettel - kosten.zuschlag - kosten.weg - gebuehrBetrag);
  return {
    ...zeile, ware: kosten.ware, verschnitt: kosten.verschnitt ?? 0, kettel: kosten.kettel, zuschlag: kosten.zuschlag, weg: kosten.weg,
    gebuehr: gebuehrBetrag, gebuehrGuete, rohertrag, quote: e.netto > 0 ? rohertrag / e.netto : null,
  };
}

/** Kopf je Monat: Umsatz aller Kaeufe, Rohertrag nur ueber die rechenbaren - und wie viel das abdeckt. */
export function monatsKopf(zeilen) {
  const je = new Map();
  for (const z of zeilen) {
    if (!je.has(z.monat)) je.set(z.monat, []);
    je.get(z.monat).push(z);
  }
  return [...je.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([monat, l]) => {
    const rechenbar = l.filter(z => z.rohertrag !== null);
    const umsatz = summe(l.map(z => z.netto));
    const umsatzRechenbar = summe(rechenbar.map(z => z.netto));
    const rohertrag = summe(rechenbar.map(z => z.rohertrag));
    return {
      monat, kaeufe: l.length, rechenbar: rechenbar.length, umsatzNetto: r2(umsatz), umsatzRechenbar: r2(umsatzRechenbar),
      anteilRechenbar: umsatz > 0 ? umsatzRechenbar / umsatz : null,
      rohertrag: rechenbar.length ? r2(rohertrag) : null, quote: umsatzRechenbar > 0 ? rohertrag / umsatzRechenbar : null,
      verlust: rechenbar.filter(z => z.rohertrag < 0).length,
      belegt: l.filter(z => z.guete === 'belegt').length, geschaetzt: l.filter(z => z.guete === 'geschaetzt').length, unbekannt: l.filter(z => z.guete === 'unbekannt').length,
    };
  });
}

// ------------------------------------------------------------------ heutige Preise

/** Heutige Variante zu einer Position: zuerst die SKU, sonst Produkt und Variantentitel. */
export function preisIndex(produkte = []) {
  const jeSku = new Map();
  const jeTitel = new Map();
  for (const p of produkte) {
    for (const v of p.varianten ?? []) {
      const eintrag = { produkt: p, variante: v };
      if (v.sku && !jeSku.has(`${p.handle}|${v.sku}`)) jeSku.set(`${p.handle}|${v.sku}`, eintrag);
      if (v.sku && !jeSku.has(`*|${v.sku}`)) jeSku.set(`*|${v.sku}`, eintrag);
      jeTitel.set(`${p.handle}|${normTitel(v.titel)}`, eintrag);
    }
  }
  return {
    fuerPosition: pos => jeSku.get(`${pos.handle}|${pos.sku}`) ?? jeTitel.get(`${pos.handle}|${normTitel(pos.variante)}`) ?? (pos.sku ? jeSku.get(`*|${pos.sku}`) : null) ?? null,
    fuerEkZeile: z => jeTitel.get(`${z.handle}|${normTitel(z.variante)}`) ?? (z.sku ? jeSku.get(`${z.handle}|${z.sku}`) : null) ?? null,
  };
}

/** Verkaufseinheit einer Position: Teppich nach Mass in 0,01 m² wird je m² gezeigt (x 100). */
function einheitDerPosition(pos) {
  if (pos.einheit === '× 0,01 m²') return { faktor: 100, text: 'je m²' };
  if (pos.einheit === 'm²') return { faktor: 1, text: 'je m²' };
  if (pos.ekZeile?.vk_einheit === 'Paket') return { faktor: 1, text: 'je Paket' };
  return { faktor: 1, text: 'je Stück' };
}

const noetigNetto = ekJe => ekJe / (1 - ZIEL_ROHERTRAG);
const aufCent = x => Math.ceil(x * 100 - 1e-6) / 100;

// ------------------------------------------------------------------ Teil 2 A: aus echten Kaeufen

/**
 * Einkauf einer Position fuer die Preisfrage, in dieser Reihenfolge: belegt (ohne Verschnitt), fertiger
 * Teppich (geschaetzter Einkauf mit Mindestflaeche), EK-Liste je Verkaufseinheit (wenn die Einheit passt),
 * sonst der geschaetzte Einkauf dieses Kaufs.
 */
function ekFuerPreis(pos, ekAufschlag) {
  if (istZahl(pos.ekBeleg)) return { ek: pos.ekBeleg, guete: 'belegt' };
  if (pos.fertig && istZahl(pos.ek)) return { ek: pos.ek, guete: 'geschaetzt' };
  const z = pos.ekZeile;
  const passt = z && istZahl(z.ek_vk_einheit) && ((z.vk_einheit === '0,01 m² (Konfigurator)' && pos.einheit === '× 0,01 m²')
    || (z.vk_einheit === 'm²' && pos.einheit === 'm²') || (z.vk_einheit === 'Paket' && pos.einheit !== 'm²' && pos.einheit !== '× 0,01 m²')
    || (['Stück', 'stueck'].includes(z.vk_einheit) && !pos.einheit));
  if (passt) return { ek: z.ek_vk_einheit * (1 + (ekAufschlag[pos.lieferant] ?? 0)) * pos.menge, guete: z.sicherheit === 'belegt' ? 'belegt' : 'geschaetzt' };
  return istZahl(pos.ek) ? { ek: pos.ek, guete: 'geschaetzt' } : null;
}

/**
 * Was ein Kauf mindestens brutto haette bringen muessen, damit nach allen Kosten das Ziel bleibt.
 * Die Zahlungsgebuehr waechst mit dem Preis: B/1,19 x (1 - Ziel) - B x p - fix >= Kosten.
 */
export function mindestBrutto(kostenOhneGebuehr, { prozent, fix = 0 }) {
  const nenner = (1 - ZIEL_ROHERTRAG) / (1 + MWST) - prozent;
  return nenner > 0 ? aufCent((kostenOhneGebuehr + fix) / nenner) : null;
}

const URSACHE_HINWEIS = {
  ware: 'Preis je m² bzw. Stück erhöhen',
  kante: 'Preis je m² oder Mindestpreis für kleine Maße erhöhen (Kante)',
  verschnitt: 'Mindestpreis oder Mindestfläche je Teppich prüfen (Verschnitt)',
  zuschlag: 'Mindermengen- bzw. Lieferaufschlag prüfen',
  weg: 'Versandaufschlag prüfen',
};

/**
 * Jeder Kauf unter dem Ziel mit "haette mindestens X Euro brutto bringen muessen" und der groessten
 * Ursache. Ketteln und Einfassen gehoeren bei Massware zu den Herstellkosten: Reichen Ware und Kante
 * nicht fuer das Ziel, ist es ein Preisfall. Sonst druecken Verschnitt, Lieferzuschlaege oder Weg den Kauf
 * darunter - dann ist die groesste davon die Ursache.
 * Dazu je Produkt der noetige Preis je Verkaufseinheit (Kante anteilig, wenn sie einer Ware gehoert) und
 * die Kontrolle gegen den heutigen Preis ("inzwischen angehoben").
 */
export function preisKontrolleKaeufe(zeilen, { preise, ekAufschlag = {}, gebuehrTarif = null }) {
  const preisFaelle = new Map();
  const kaufFaelle = [];
  for (const z of zeilen) {
    if (z.rohertrag === null || z.quote === null || z.quote >= ZIEL_ROHERTRAG) continue;
    const ware = r2(z.ware - z.verschnitt);
    const herstellQuote = z.netto > 0 ? (z.netto - ware - z.kettel) / z.netto : null;
    const preisFall = herstellQuote !== null && herstellQuote < ZIEL_ROHERTRAG;
    const teile = preisFall
      ? [['ware', ware], ['kante', z.kettel]]
      : [['verschnitt', z.verschnitt], ['zuschlag', z.zuschlag], ['weg', z.weg]];
    const [groesste, betrag] = teile.reduce((a, b) => (b[1] > a[1] ? b : a));
    // Gebuehrensatz: Tarif, sonst aus der belegten Gebuehr dieses Kaufs.
    const satz = gebuehrTarif && istZahl(gebuehrTarif.prozentBrutto) ? { prozent: gebuehrTarif.prozentBrutto / 100, fix: gebuehrTarif.fix ?? 0 }
      : { prozent: z.brutto > 0 ? z.gebuehr / z.brutto : 0, fix: 0 };
    const mindest = mindestBrutto(z.ware + z.kettel + z.zuschlag + z.weg, satz);
    // Heute schon gedeckt? Derselbe Kauf zu den heutigen Shop-Preisen (Versand und Nebenleistungen wie damals,
    // Kosten wie damals). Nur wenn jede Ware heute einen Preis hat - sonst bleibt der Fall offen.
    const heuteJe = z.positionen.map(p => ({ p, heute: istZahl(p.netto) && p.menge > 0 ? preise.fuerPosition(p) : null }));
    const heuteNetto = heuteJe.length && heuteJe.every(x => x.heute)
      ? z.netto + summe(heuteJe.map(x => x.heute.variante.preis / (1 + MWST) * x.p.menge - x.p.netto)) : null;
    const heuteBrutto = heuteNetto === null ? null : r2(heuteNetto * (1 + MWST));
    const gedeckt = heuteNetto > 0 && (preisFall
      ? (heuteNetto - ware - z.kettel) / heuteNetto >= ZIEL_ROHERTRAG
      : mindest !== null && heuteBrutto + 0.005 >= mindest);
    kaufFaelle.push({
      name: z.name, datum: z.datum, titel: [...new Set(z.positionen.map(p => p.titel))].join(', '), guete: z.guete,
      netto: z.netto, brutto: z.brutto, rohertrag: z.rohertrag, quote: z.quote, herstellQuote,
      ware, kante: z.kettel, verschnitt: z.verschnitt, zuschlag: z.zuschlag, weg: z.weg, gebuehr: z.gebuehr,
      ursache: preisFall ? 'preis' : 'kosten', groesste, groessteBetrag: r2(betrag), hinweis: URSACHE_HINWEIS[groesste],
      mindestBrutto: mindest, mehrBrutto: mindest === null ? null : r2(mindest - z.brutto),
      heuteBrutto, stand: gedeckt ? 'angehoben' : 'offen',
    });
    // Auch in einem Kauf, den sonst die Kosten druecken, kann eine einzelne Ware zu billig sein.
    // Kante gehoert der Ware, wenn es genau eine gibt; sonst nur die Ware selbst (Kante nicht zuzuordnen).
    const kanteJe = z.positionen.length === 1 ? z.kettel : 0;
    // ... und mit ihr der Erloes, den der Kunde dafuer separat bezahlt hat (Kettelservice).
    const kanteErloes = kanteJe > 0 ? (z.nettoNebenleistung ?? 0) : 0;
    for (const pos of z.positionen) {
      const e = ekFuerPreis(pos, ekAufschlag);
      if (!e || !istZahl(pos.netto) || !(pos.netto > 0) || !(pos.menge > 0)) continue;
      const kosten = e.ek + kanteJe;
      const netto = pos.netto + kanteErloes;
      const quote = (netto - kosten) / netto;
      if (quote >= ZIEL_ROHERTRAG) continue;
      const { faktor, text } = einheitDerPosition(pos);
      const kostenJe = kosten / pos.menge * faktor;
      const nebenJe = kanteErloes / pos.menge * faktor;
      // Verkauft und heute je Einheit samt Kettelservice dieses Masses: nur so passen sie zum noetigen Preis.
      const verkauftNetto = netto / pos.menge * faktor;
      const noetig = noetigNetto(kostenJe);
      const heute = preise.fuerPosition(pos);
      const heuteNetto = heute ? heute.variante.preis / (1 + MWST) * faktor + nebenJe : null;
      const schluessel = `${pos.handle}|${pos.variante}`;
      const fall = preisFaelle.get(schluessel) ?? {
        handle: pos.handle, titel: pos.titel, variante: pos.variante, einheit: text, kaeufe: [], fehlt: 0, mitKante: false,
        noetigBrutto: 0, verkauftBrutto: null, heuteBrutto: heuteNetto === null ? null : r2(heuteNetto * (1 + MWST)), guete: e.guete,
      };
      fall.kaeufe.push(z.name);
      fall.mitKante = fall.mitKante || kanteJe > 0;
      fall.mitKettelservice = fall.mitKettelservice || kanteErloes > 0;
      fall.fehlt = r2(fall.fehlt + (noetig - verkauftNetto) * pos.menge / faktor);
      fall.noetigBrutto = Math.max(fall.noetigBrutto, aufCent(noetig * (1 + MWST)));
      fall.verkauftBrutto = fall.verkauftBrutto === null ? r2(verkauftNetto * (1 + MWST)) : Math.min(fall.verkauftBrutto, r2(verkauftNetto * (1 + MWST)));
      fall.verlust = fall.verlust || quote < 0;
      preisFaelle.set(schluessel, fall);
    }
  }
  const faelle = [...preisFaelle.values()].map(f => ({
    ...f,
    stand: f.heuteBrutto === null ? 'heute-unbekannt' : f.heuteBrutto + 0.005 >= f.noetigBrutto ? 'angehoben' : 'offen',
  })).sort((a, b) => (b.verlust === true) - (a.verlust === true) || b.fehlt - a.fehlt);
  // Offene zuerst: dort ist noch etwas zu tun.
  return { preisFaelle: faelle, kaufFaelle: kaufFaelle.sort((a, b) => (a.stand === 'angehoben') - (b.stand === 'angehoben') || a.quote - b.quote) };
}

// ------------------------------------------------------------------ Teil 2 B: ganzes Sortiment

const nah = (a, b, tol) => Math.abs(a - b) <= tol;

/**
 * Passen Einkaufs- und Verkaufseinheit? Nur dann gibt es einen EK je Verkaufseinheit. Sonst ein Grund -
 * nie geraten. Der heutige Preis muss zur Einheit der EK-Liste passen (Grundpreis im Lexikon).
 */
export function ekJeVerkaufseinheit(z, v) {
  const je = v?.preisJeEinheit;
  const preis = Number(v?.preis);
  if (!(preis > 0)) return { grund: 'kein Verkaufspreis' };
  if (!istZahl(z.ek_vk_einheit) || !(z.ek_vk_einheit > 0)) return { grund: 'EK je Verkaufseinheit fehlt' };
  const ekBezugPasst = !istZahl(z.ek_bezug) || !istZahl(z.menge_bezug) || nah(z.ek_bezug * z.menge_bezug, z.ek_vk_einheit, Math.max(0.01, z.ek_vk_einheit * 0.01));
  if (!ekBezugPasst) return { grund: 'EK-Liste in sich nicht stimmig' };
  let passt = false;
  if (z.vk_einheit === 'm²' && z.bezug === 'm²') passt = je?.einheit === 'm2' && nah(je.betrag, preis, 0.011);
  else if (z.vk_einheit === '0,01 m² (Konfigurator)' && z.bezug === 'm²') passt = je?.einheit === 'm2' && z.menge_bezug === 0.01 && nah(je.betrag, preis * 100, 0.6);
  else if (z.vk_einheit === 'Paket' && z.bezug === 'm²') passt = je?.einheit === 'm2' && z.menge_bezug > 0 && nah(preis / z.menge_bezug, je.betrag, Math.max(0.02, je.betrag * 0.02));
  else if (['Stück', 'stueck'].includes(z.vk_einheit) && ['Stück', 'stueck'].includes(z.bezug)) passt = je?.einheit === 'stueck' && nah(je.betrag, preis, 0.011);
  else return { grund: `Einheit ${z.bezug ?? '?'} gegen ${z.vk_einheit ?? '?'}` };
  if (!passt) return { grund: `Shop verkauft ${je?.einheit === 'stueck' ? 'je Stück' : je?.einheit === 'm2' ? 'nach m²' : 'ohne Grundpreis'}, EK-Liste rechnet ${z.vk_einheit === 'Paket' ? 'je Paket' : `je ${z.vk_einheit}`}` };
  // Ein Sprung auf mehr als das Doppelte oder unter die Haelfte ist eher eine andere Einheit als eine Preisaenderung.
  if (istZahl(z.vk_brutto) && z.vk_brutto > 0 && (preis / z.vk_brutto > 2 || preis / z.vk_brutto < 0.5)) return { grund: 'Preis seit der EK-Liste mehr als verdoppelt oder halbiert, Einheit prüfen' };
  const text = z.vk_einheit === 'm²' ? 'je m²' : z.vk_einheit === 'Paket' ? 'je Paket' : z.vk_einheit === '0,01 m² (Konfigurator)' ? 'je m²' : 'je Stück';
  const faktor = z.vk_einheit === '0,01 m² (Konfigurator)' ? 100 : 1;
  return { ek: z.ek_vk_einheit, faktor, text };
}

/**
 * Aktive Varianten mit EK gegen den heutigen Preis, ohne Versand. Gruppiert je Produkt, zuerst Verlust,
 * dann schon verkaufte Produkte, dann nach Abstand zum Ziel.
 */
/**
 * Referenzmass fuer die Kante, wenn die EK-Liste nur das Material nennt: 200 x 300 cm, also 10 m Kante auf
 * 6 m². Je kleiner der Teppich, desto mehr Kante je m² - das Referenzmass steht deshalb in der Ansicht.
 */
export const KANTE_REFERENZ = Object.freeze({ breiteCm: 200, laengeCm: 300 });

/**
 * Kante einer Variante: 'enthalten' (Fertigpreis), 'mitgerechnet' (nur Material, Kettlertarif fuer das
 * Referenzmass dazu) oder 'ohne' (Massware, Kante nicht belegt - ohne Kante gerechnet). null: keine Massware.
 */
function kanteFuer(z, kettler, kettelVkJeLfmNetto) {
  if (!MASSWARE_ART.test(z.produktart ?? '')) return null;
  if (fertigpreis(z)) return { art: 'enthalten', jeM2: 0, erloesJeM2: 0 };
  if (/nur Material/i.test(z.bemerkung ?? '') && kettler && istZahl(kettler.bis6qmJeLfm)) {
    const { breiteCm: b, laengeCm: l } = KANTE_REFERENZ;
    const m2 = b * l / 1e4;
    const meter = 2 * (b + l) / 100;
    const satz = m2 > 6 ? (kettler.ab6qmJeLfm ?? kettler.bis6qmJeLfm) : kettler.bis6qmJeLfm;
    // Der Kunde zahlt die Kante als Kettelservice je laufenden Meter extra - Kosten UND Erloes gehoeren dazu.
    const erloes = istZahl(kettelVkJeLfmNetto) ? meter * kettelVkJeLfmNetto / m2 : 0;
    return { art: erloes ? 'kettelservice' : 'mitgerechnet', jeM2: meter * satz / m2, erloesJeM2: erloes };
  }
  return { art: 'ohne', jeM2: 0, erloesJeM2: 0 };
}

export function preisKontrolleSortiment({ produkte = [], ekZeilen = [], ekAufschlag = {}, verkaufteHandles = new Set(), kettler = null, kettelVkJeLfmBrutto = null }) {
  const kettelVkNetto = istZahl(kettelVkJeLfmBrutto) ? kettelVkJeLfmBrutto / (1 + MWST) : null;
  const ekJe = new Map();
  for (const z of ekZeilen) {
    if (!z?.handle) continue;
    ekJe.set(`${z.handle}|${normTitel(z.variante)}`, z);
    if (z.sku && !ekJe.has(`${z.handle}|sku:${z.sku}`)) ekJe.set(`${z.handle}|sku:${z.sku}`, z);
  }
  const zaehler = { geprueft: 0, ohneEk: 0, nichtVergleichbar: 0, imZiel: 0, unterZiel: 0, verlust: 0, kanteMitgerechnet: 0, ohneKante: 0 };
  const nichtVergleichbar = new Map();
  const jeProdukt = new Map();
  for (const p of produkte) {
    if (String(p.status).toUpperCase() !== 'ACTIVE' || /^muster-/.test(p.handle ?? '') || p.musterRegeln?.geschenkgutschein) continue;
    for (const v of p.varianten ?? []) {
      zaehler.geprueft += 1;
      const z = ekJe.get(`${p.handle}|${normTitel(v.titel)}`) ?? (v.sku ? ekJe.get(`${p.handle}|sku:${v.sku}`) : null);
      if (!z || z.sicherheit === 'offen' || !istZahl(z.ek_vk_einheit)) { zaehler.ohneEk += 1; continue; }
      const e = ekJeVerkaufseinheit(z, v);
      if (e.grund) {
        zaehler.nichtVergleichbar += 1;
        const n = nichtVergleichbar.get(e.grund) ?? { grund: e.grund, anzahl: 0, beispiele: [] };
        n.anzahl += 1;
        if (n.beispiele.length < 3 && !n.beispiele.includes(p.titel)) n.beispiele.push(p.titel);
        nichtVergleichbar.set(e.grund, n);
        continue;
      }
      const aufschlag = ekAufschlag[v.einkauf?.lieferant] ?? 0;
      const kante = kanteFuer(z, kettler, kettelVkNetto);
      if (['mitgerechnet', 'kettelservice'].includes(kante?.art)) zaehler.kanteMitgerechnet += 1;
      if (kante?.art === 'ohne') zaehler.ohneKante += 1;
      // Kante je Verkaufseinheit: e.faktor Einheiten ergeben einen m² (Konfigurator 100, sonst 1).
      const ek = e.ek * (1 + aufschlag) + (kante?.jeM2 ?? 0) / e.faktor;
      const kanteErloes = (kante?.erloesJeM2 ?? 0) / e.faktor;
      const vkNetto = v.preis / (1 + MWST) + kanteErloes;
      const quote = (vkNetto - ek) / vkNetto;
      if (quote >= ZIEL_ROHERTRAG) { zaehler.imZiel += 1; continue; }
      zaehler.unterZiel += 1;
      if (quote < 0) zaehler.verlust += 1;
      const g = jeProdukt.get(p.handle) ?? {
        handle: p.handle, titel: p.titel, gruppe: p.produktgruppe ?? '', adminUrl: p.adminUrl ?? null, verkauft: verkaufteHandles.has(p.handle),
        einheit: e.text, kante: kante?.art ?? null, varianten: 0, verlustVarianten: 0, schlechtesteQuote: 1, heuteBrutto: [Infinity, -Infinity], noetigBrutto: 0, guete: 'belegt', beispiele: [],
      };
      g.varianten += 1;
      if (quote < 0) g.verlustVarianten += 1;
      g.schlechtesteQuote = Math.min(g.schlechtesteQuote, quote);
      g.heuteBrutto = [Math.min(g.heuteBrutto[0], v.preis * e.faktor), Math.max(g.heuteBrutto[1], v.preis * e.faktor)];
      // Noetig ist der Preis der Variante selbst; den Kettelservice zahlt der Kunde ohnehin dazu.
      g.noetigBrutto = Math.max(g.noetigBrutto, aufCent((noetigNetto(ek) - kanteErloes) * (1 + MWST) * e.faktor));
      if (z.sicherheit !== 'belegt') g.guete = 'geschaetzt';
      if (g.beispiele.length < 3) g.beispiele.push(v.titel);
      jeProdukt.set(p.handle, g);
    }
  }
  const produkteListe = [...jeProdukt.values()].map(g => ({ ...g, heuteBrutto: g.heuteBrutto.map(r2), verlust: g.verlustVarianten > 0 }))
    .sort((a, b) => (b.verlust - a.verlust) || (b.verkauft - a.verkauft) || (a.schlechtesteQuote - b.schlechtesteQuote));
  return {
    ...zaehler, produkte: produkteListe,
    nichtVergleichbarGruende: [...nichtVergleichbar.values()].sort((a, b) => b.anzahl - a.anzahl),
  };
}

// ------------------------------------------------------------------ Rechte

/**
 * Die eine Stelle fuer die Rechte dieser Ansicht: Einkauf und Rohertrag sieht nur der Inhaber (auch der
 * Notzugang: benutzer null). Der Server (darfPfad in serve-dashboard.mjs) und die API fragen beide hier.
 * Soll spaeter eine andere Rolle mitlesen, wird nur diese Funktion geaendert (und im Browser
 * ANSICHT_ROLLEN.onlineshop, das nur die Navigation steuert).
 */
export function darfOnlineshop(benutzer = null) {
  return !benutzer || benutzer.rolle === 'inhaber';
}

/** Was eine Rolle bekommt: ohne Recht keine Betraege, nur der Hinweis. */
export function fuerRolle(antwort, benutzer = null) {
  if (darfOnlineshop(benutzer)) return antwort;
  return { verfuegbar: false, nurInhaber: true, hinweis: 'Gewinn und Preise sieht nur der Inhaber.' };
}
