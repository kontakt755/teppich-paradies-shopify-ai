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

/**
 * Ziel-Rohertrag vom Netto. Quelle: EK-Liste des Inhabers, Spalte "max. Rabatt bis 30 % Rohertrag"
 * (ek-liste/ZUSAMMENFASSUNG-2026-10-19.md). Gilt fuer Kaeufe nach allen Kosten, im Sortiment ohne Versand.
 */
export const ZIEL_ROHERTRAG = 0.3;
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
      ek: d?.ekSumme ?? null, ekZeile: d?.zeile ?? null,
    };
  });
  // Belegt und nur eine Ware: dann gehoert der belegte Einkauf genau dieser Position.
  // Fuer die Preisfrage zaehlt der Einkauf ohne Verschnitt.
  if (ausBeleg?.nurEinePosition && positionen.length === 1) { positionen[0].ekBeleg = r2(ausBeleg.ware - ausBeleg.verschnitt); }

  const rechenbar = kosten !== null && gebuehrBetrag !== null && !gruende.length;
  const zeile = {
    orderId: auftrag.id, name: auftrag.name, datum: auftrag.datum, monat: String(auftrag.datum ?? '').slice(0, 7),
    brutto: e.brutto, netto: e.netto, erstattetBrutto: e.erstattetBrutto,
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
 * Kaeufe unter dem Ziel. Liegt eine Ware selbst unter dem Ziel, ist der Preis das Problem (Fall je
 * Produkt, mit noetigem Preis). Reicht der Preis jeder Ware und erst Versand, Zuschlaege und Gebuehr
 * druecken den Kauf unter das Ziel, ist es ein Kostenfall: Mindermengen- oder Versandaufschlag pruefen.
 */
/**
 * Einkauf einer Position fuer die Preisfrage, in dieser Reihenfolge: belegt (ohne Verschnitt), EK-Liste je
 * Verkaufseinheit (wenn die Einheit passt), sonst der geschaetzte Einkauf dieses Kaufs.
 */
function ekFuerPreis(pos, ekAufschlag) {
  if (istZahl(pos.ekBeleg)) return { ek: pos.ekBeleg, guete: 'belegt' };
  const z = pos.ekZeile;
  const passt = z && istZahl(z.ek_vk_einheit) && ((z.vk_einheit === '0,01 m² (Konfigurator)' && pos.einheit === '× 0,01 m²')
    || (z.vk_einheit === 'm²' && pos.einheit === 'm²') || (z.vk_einheit === 'Paket' && pos.einheit !== 'm²' && pos.einheit !== '× 0,01 m²')
    || (['Stück', 'stueck'].includes(z.vk_einheit) && !pos.einheit));
  if (passt) return { ek: z.ek_vk_einheit * (1 + (ekAufschlag[pos.lieferant] ?? 0)) * pos.menge, guete: z.sicherheit === 'belegt' ? 'belegt' : 'geschaetzt' };
  return istZahl(pos.ek) ? { ek: pos.ek, guete: 'geschaetzt' } : null;
}

export function preisKontrolleKaeufe(zeilen, { preise, ekAufschlag = {} }) {
  const preisFaelle = new Map();
  const kostenFaelle = [];
  for (const z of zeilen) {
    if (z.rohertrag === null || z.quote === null || z.quote >= ZIEL_ROHERTRAG) continue;
    let preisProblem = false;
    for (const pos of z.positionen) {
      const e = ekFuerPreis(pos, ekAufschlag);
      if (!e || !istZahl(pos.netto) || !(pos.netto > 0) || !(pos.menge > 0)) continue;
      const quote = (pos.netto - e.ek) / pos.netto;
      if (quote >= ZIEL_ROHERTRAG) continue;
      preisProblem = true;
      const { faktor, text } = einheitDerPosition(pos);
      const ekJe = e.ek / pos.menge * faktor;
      const verkauftNetto = pos.netto / pos.menge * faktor;
      const noetig = noetigNetto(ekJe);
      const heute = preise.fuerPosition(pos);
      const heuteNetto = heute ? heute.variante.preis / (1 + MWST) * faktor : null;
      const schluessel = `${pos.handle}|${pos.variante}`;
      const fall = preisFaelle.get(schluessel) ?? {
        handle: pos.handle, titel: pos.titel, variante: pos.variante, einheit: text, kaeufe: [], fehlt: 0,
        noetigBrutto: 0, verkauftBrutto: null, heuteBrutto: heuteNetto === null ? null : r2(heuteNetto * (1 + MWST)), guete: e.guete,
      };
      fall.kaeufe.push(z.name);
      fall.fehlt = r2(fall.fehlt + (noetig - verkauftNetto) * pos.menge / faktor);
      fall.noetigBrutto = Math.max(fall.noetigBrutto, aufCent(noetig * (1 + MWST)));
      fall.verkauftBrutto = fall.verkauftBrutto === null ? r2(verkauftNetto * (1 + MWST)) : Math.min(fall.verkauftBrutto, r2(verkauftNetto * (1 + MWST)));
      fall.verlust = fall.verlust || quote < 0;
      preisFaelle.set(schluessel, fall);
    }
    if (!preisProblem) {
      // Laesst schon der Wareneinkauf (ohne Verschnitt) weniger als das Ziel, ist es doch der Preis -
      // nur nicht einer Position zuzuordnen (mehrere Waren, Einkauf nur als Summe belegt).
      const warenQuote = z.netto > 0 ? (z.netto - (z.ware - z.verschnitt)) / z.netto : null;
      kostenFaelle.push({
        ursache: warenQuote !== null && warenQuote < ZIEL_ROHERTRAG ? 'preis' : 'kosten', warenQuote,
        name: z.name, datum: z.datum, netto: z.netto, rohertrag: z.rohertrag, quote: z.quote,
        kosten: r2(z.verschnitt + z.kettel + z.zuschlag + z.weg + z.gebuehr), verschnitt: z.verschnitt, kettel: z.kettel, zuschlag: z.zuschlag, weg: z.weg, gebuehr: z.gebuehr, fehlt: r2(ZIEL_ROHERTRAG * z.netto - z.rohertrag), guete: z.guete,
        titel: [...new Set(z.positionen.map(p => p.titel))].join(', '),
      });
    }
  }
  const faelle = [...preisFaelle.values()].map(f => ({
    ...f,
    stand: f.heuteBrutto === null ? 'heute-unbekannt' : f.heuteBrutto + 0.005 >= f.noetigBrutto ? 'angehoben' : 'offen',
  })).sort((a, b) => (b.verlust === true) - (a.verlust === true) || b.fehlt - a.fehlt);
  return { preisFaelle: faelle, kostenFaelle: kostenFaelle.sort((a, b) => a.quote - b.quote) };
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
export function preisKontrolleSortiment({ produkte = [], ekZeilen = [], ekAufschlag = {}, verkaufteHandles = new Set() }) {
  const ekJe = new Map();
  for (const z of ekZeilen) {
    if (!z?.handle) continue;
    ekJe.set(`${z.handle}|${normTitel(z.variante)}`, z);
    if (z.sku && !ekJe.has(`${z.handle}|sku:${z.sku}`)) ekJe.set(`${z.handle}|sku:${z.sku}`, z);
  }
  const zaehler = { geprueft: 0, ohneEk: 0, nichtVergleichbar: 0, imZiel: 0, unterZiel: 0, verlust: 0 };
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
      const ek = e.ek * (1 + aufschlag);
      const vkNetto = v.preis / (1 + MWST);
      const quote = (vkNetto - ek) / vkNetto;
      if (quote >= ZIEL_ROHERTRAG) { zaehler.imZiel += 1; continue; }
      zaehler.unterZiel += 1;
      if (quote < 0) zaehler.verlust += 1;
      const g = jeProdukt.get(p.handle) ?? {
        handle: p.handle, titel: p.titel, gruppe: p.produktgruppe ?? '', adminUrl: p.adminUrl ?? null, verkauft: verkaufteHandles.has(p.handle),
        einheit: e.text, varianten: 0, verlustVarianten: 0, schlechtesteQuote: 1, heuteBrutto: [Infinity, -Infinity], noetigBrutto: 0, guete: 'belegt', beispiele: [],
      };
      g.varianten += 1;
      if (quote < 0) g.verlustVarianten += 1;
      g.schlechtesteQuote = Math.min(g.schlechtesteQuote, quote);
      g.heuteBrutto = [Math.min(g.heuteBrutto[0], v.preis * e.faktor), Math.max(g.heuteBrutto[1], v.preis * e.faktor)];
      g.noetigBrutto = Math.max(g.noetigBrutto, aufCent(noetigNetto(ek) * (1 + MWST) * e.faktor));
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
