/**
 * Ablauf je Kundenbestellung (Einkauf, Reiter "Je Auftrag"): fuenf Schritte vom Eingang bis
 * "erledigt", berechnet aus der Bestelluebersicht (gruppen/musterGruppen je Lieferant) und dem
 * lokalen Auftragsfluss-Stand je Position. Reine Funktion - laeuft im Browser und im Test.
 *
 * Es wird nichts geraten: fehlt der Lieferant, die Artikelnummer oder die Bestellmenge, steht
 * die Position unter "ungeklaert" und geht nicht in die Bestellnachricht.
 */
import { UNGEKLAERT, musterEigen } from './einkauf-lieferanten.mjs';
import { warteAmpel, warteWort, dringendereAmpel } from './ampel.mjs';
import { istLagerware, lieferwegVon, selbstStand } from './lieferweg.mjs';

export const SCHRITTE = [
  ['eingegangen', 'Bestellung eingegangen'],
  ['vorbereiten', 'Lieferantenbestellung vorbereiten'],
  ['bestellt', 'Beim Lieferanten bestellt'],
  ['lieferung', 'Ware da · Lieferung/Montage'],
  ['erledigt', 'Erledigt'],
];

// Reine Musterauftraege: keine Waren-Worte (Rundgang 29.10.), die Schritte selbst bleiben dieselben.
const MUSTER_LABEL = {
  vorbereiten: 'Muster bereitstellen',
  // Bis 06.11.2026 "Muster bestellt oder im Lager": abgehakt, sobald alles bestellt war - die Leiste
  // sprang dann auf "Muster verschicken", obwohl das Muster noch beim Lieferanten lag.
  bestellt: 'Muster da',
  // Offener Schritt, solange das Muster nicht raus ist: als Aufgabe benannt, nicht als erledigt.
  lieferung: 'Muster verschicken',
};

// Diese Ware kommt nie bei uns an: der Hersteller schickt direkt, Lagerware schneiden wir selbst zu
// (lib/lieferweg.mjs). Eine Eigenleistung hat gar keinen Weg.
const OHNE_EINGANG = new Set(['hersteller', 'baustelle', 'lager']);

// Rang je Auftragsfluss-Stand (operations/lib/auftragsstatus.mjs): ohne Stand = noch zu bestellen.
const RANG = { bestellt: 1, geliefert: 2, raus: 3, erledigt: 4 };
const rang = status => RANG[status] || 0;

/** Was fehlt, damit die Position bestellt werden kann - in Alltagssprache, leer = vollstaendig. */
export function fehlendeAngaben(p, lieferant) {
  const fehlt = [];
  if (!lieferant || lieferant === UNGEKLAERT) fehlt.push('Lieferant ungeklärt');
  if (!p.grosshaendlerId || p.grosshaendlerId === UNGEKLAERT) fehlt.push('Artikelnummer beim Lieferanten fehlt');
  if (p.bestellmenge?.menge === UNGEKLAERT) fehlt.push('Bestellmenge ungeklärt');
  return fehlt;
}

/**
 * @param auftrag  { id } aus bestellungen.auftraege
 * @param daten    { gruppen, musterGruppen, gesperrteMuster? } der Bestelluebersicht (/api/einkauf/bestellungen);
 *                 gesperrteMuster = lineItemIds der Muster, die der Lieferant nicht liefern kann
 * @param eintragFuer  Position -> Auftragsfluss-Eintrag ({ status, bestelltAm, ... }) oder null
 * @returns { schritte: [{ key, label, stand: 'fertig'|'jetzt'|'offen' }], jetzt, lieferanten, ungeklaert, positionen, bestelltAm }
 */
export function auftragsAblauf(auftrag, { gruppen = [], musterGruppen = [], gesperrteMuster = [] } = {}, eintragFuer = () => null) {
  const positionen = [];
  const gesperrt = new Set(gesperrteMuster || []);
  const sammle = (liste, art) => {
    for (const g of liste || []) for (const p of g.positionen || []) {
      if (String(p.orderId) !== String(auftrag.id) || (p.menge ?? 1) <= 0) continue;
      const eintrag = eintragFuer(p) || null;
      // Lagerware (lib/lieferweg.mjs) wie ein Lagermuster: nicht beim Lieferanten bestellen, kein Nachhaken.
      const eigen = art === 'muster' ? musterEigen(p) : istLagerware(p, eintrag);
      const r = rang(eintrag?.status);
      positionen.push({ pos: p, art, lieferant: g.lieferant || UNGEKLAERT, eintrag, rang: r, eigen, fehlt: eigen ? [] : fehlendeAngaben(p, g.lieferant),
        // Ware, die wir selbst verschicken: 'zuschneiden' | 'packen' | 'versand' | null.
        selbst: art === 'ware' ? selbstStand(p, eintrag) : null, weg: art === 'ware' ? lieferwegVon(p, eintrag)?.weg || null : null,
        // Kommt nicht mehr (Mustersperre): solange noch nicht bei uns, ist Nachfragen beim Lieferanten sinnlos.
        gesperrt: art === 'muster' && r <= 1 && gesperrt.has(p.lineItemId) });
    }
  };
  sammle(gruppen, 'ware');
  sammle(musterGruppen, 'muster');

  // Noch zu bestellen, nach Lieferant und Art (Ware/Muster) - je Gruppe eine Bestellnachricht. Ein
  // gesperrtes Muster kommt nie: weder bestellen noch seine Artikelnummer klaeren (#1996).
  const zuBestellen = positionen.filter(x => x.rang === 0 && !x.eigen && !x.gesperrt);
  const ungeklaert = zuBestellen.filter(x => x.fehlt.length);
  const je = new Map();
  for (const x of zuBestellen.filter(y => !y.fehlt.length)) {
    const k = `${x.lieferant}|${x.art}`;
    if (!je.has(k)) je.set(k, { lieferant: x.lieferant, art: x.art, positionen: [] });
    je.get(k).positionen.push(x);
  }
  const lieferanten = [...je.values()].sort((a, b) => a.lieferant.localeCompare(b.lieferant) || a.art.localeCompare(b.art));

  // Eigene Muster (haben wir da) brauchen keine Lieferantenbestellung, zaehlen also als bestellt -
  // ebenso gesperrte: es gibt nichts zu bestellen, weiter geht es in der Packstation.
  const r = x => (x.eigen || x.gesperrt ? Math.max(x.rang, 1) : x.rang);
  const alle = positionen.length;
  const mind = n => alle > 0 && positionen.every(x => r(x) >= n);
  const nurMuster = alle > 0 && positionen.every(x => x.art === 'muster');
  // Was muss bei uns ankommen, bevor es weitergeht? Ware, die zu uns kommt (nicht direkt vom
  // Hersteller, nicht aus Lager, keine Eigenleistung), und jedes Muster, das der Lieferant noch
  // liefern kann. Muster aus eigenem Bestand sind schon da - dieselbe Regel wie "Packbereit".
  const eingang = {
    ware: zaehleEingang(positionen.filter(x => x.art === 'ware' && x.weg && !OHNE_EINGANG.has(x.weg)), x => x.rang >= 2),
    muster: zaehleEingang(positionen.filter(x => x.art === 'muster' && !x.gesperrt), x => x.rang >= 2 || x.eigen),
  };
  const fuerLeiste = nurMuster ? eingang.muster : eingang.ware;
  const fertig = {
    eingegangen: true,
    vorbereiten: mind(1),
    // Erst wenn alles da ist, das zu uns kommt (06.11.2026) - vorher hiess es "Ware da", sobald
    // alles bestellt war, und eine Teillieferung loeste "Kunde informieren" aus.
    bestellt: mind(1) && fuerLeiste.alle,
    lieferung: mind(3),
    erledigt: mind(4),
  };
  // Bis alles bestellt ist, steht der Auftrag auf "vorbereiten", danach auf "bestellt" (unterwegs),
  // bis alles da ist. Ware, die bei uns liegt, wartet auf Auslieferung oder Montage.
  const jetztKey = SCHRITTE.map(s => s[0]).find(k => !fertig[k]) || 'erledigt';
  const label = (key, basis, stand) => {
    if (key !== 'bestellt' || stand === 'offen') return (nurMuster && MUSTER_LABEL[key]) || basis;
    if (nurMuster) return `Muster da · ${fuerLeiste.da} von ${fuerLeiste.gesamt}`;
    return stand === 'jetzt' ? `Unterwegs · ${fuerLeiste.da} von ${fuerLeiste.gesamt} da` : basis;
  };
  const schritte = SCHRITTE.map(([key, basis]) => {
    const stand = fertig[key] && key !== jetztKey ? 'fertig' : key === jetztKey ? 'jetzt' : 'offen';
    return { key, label: label(key, basis, stand), stand };
  });
  const daten = positionen.map(x => x.eintrag?.bestelltAm).filter(Boolean).sort();
  return {
    schritte, jetzt: jetztKey, lieferanten, ungeklaert, positionen, eingang,
    bestelltAm: daten.length ? daten[daten.length - 1] : null,
    // Lagerware ist nie "unterwegs", auch nicht im Altfall "bestellt" (#1119): sie kommt nicht vom
    // Lieferanten. Sonst stuende sie in "Je Auftrag" zweimal da - mit "Ist eingetroffen" und mit "Zugeschnitten".
    unterwegs: positionen.filter(x => x.rang === 1 && x.weg !== 'lager'),
    beiUns: positionen.filter(x => x.rang === 2),
    // Ware, die wir selbst zuschneiden bzw. packen und verschicken (Heute › Von uns abschicken).
    selbst: positionen.filter(x => x.selbst),
  };
}

/** { da, gesamt, alle, fehlt } - fehlt: was noch nicht da ist, als { titel, lieferant }. */
function zaehleEingang(liste, istDa) {
  const fehlt = liste.filter(x => !istDa(x));
  return {
    da: liste.length - fehlt.length, gesamt: liste.length, alle: fehlt.length === 0,
    fehlt: fehlt.map(x => ({ titel: [x.pos.titel, x.pos.farbe].filter(v => v && v !== UNGEKLAERT).join(' · '), lieferant: x.lieferant })),
  };
}

// ---------------------------------------------------------------------------
// Einordnung fuer die Arbeitsliste (seit 2026-10-20): nur was Handlung braucht, steht offen.
// ---------------------------------------------------------------------------

/**
 * Ist eine beim Lieferanten bestellte Position im Verzug? Dieselbe Schwelle wie "Je Lieferant"
 * (lib/ampel.mjs, 06.11.2026): gelb ab 7 Kalendertagen seit "bestellt" (nachhaken), rot ab 14
 * (ueberfaellig). Bis dahin galten hier 10 Werktage - in einer normalen Woche sind das die 14
 * Kalendertage, ab denen es jetzt rot ist. Mit bestaetigtem Liefertermin zaehlt nur der Termin:
 * davor ist der Lieferant im Plan, danach ist es sofort rot.
 * Rueckgabe: die Ampel ({ stufe, grund, tage, termin }) - oder null, wenn nichts zu tun ist.
 */
export function verzugAmpel(eintrag, jetzt = new Date()) {
  if (eintrag?.status !== 'bestellt' || !eintrag.bestelltAm) return null;
  const a = warteAmpel(eintrag, { jetzt });
  return a.stufe ? a : null;
}

/** Nur das erste "kunde_informiert" zaehlt; ein "zurueck" darauf hebt es auf (wie in der Zeitleiste). */
export function kundeInformiertAus(ereignisse = []) {
  let stand = null;
  for (const e of [...(ereignisse || [])].filter(e => e?.am).sort((a, b) => String(a.am).localeCompare(String(b.am)))) {
    if (e.schritt === 'kunde_informiert' && !stand) stand = { am: e.am, von: e.von || null };
    if (e.schritt === 'zurueck' && e.bezug === 'kunde_informiert') stand = null;
  }
  return stand;
}

/**
 * Wohin gehoert ein Auftrag in der Liste "Je Auftrag"?
 *   jetzt      - wir sind dran: bestellen, Ungeklaertes klaeren, ALLE Ware da und Kunde nicht
 *                informiert, ALLE Muster da zum Verschicken, Muster kommt nicht, Lieferant im Verzug
 *   unterwegs  - beim Lieferanten bestellt, wartet auf Ware oder Muster (startet eingeklappt)
 *   beiKunde   - Kunde informiert bzw. schon raus: Termin/Abschluss (eingeklappt)
 * @param ab  Ergebnis von auftragsAblauf()
 * @param informiert  { am, von } oder null
 * @param opt.umschlag  Bereich des Umschlags in der Packstation ('packen', 'warten', 'klaeren', 'gepackt') -
 *                      ohne Angabe gilt nur die Regel je Auftrag
 * @returns { gruppe, gruende, verzug, wareDa, teillieferung }  teillieferung: { da, gesamt, fehlt } oder null
 */
export function einordnung(ab, informiert = null, jetzt = new Date(), { umschlag = null } = {}) {
  const gruende = [];
  const verzug = ab.unterwegs.filter(x => !x.eigen && !x.gesperrt).map(x => ({ ...x, ampel: verzugAmpel(x.eintrag, jetzt) })).filter(x => x.ampel).map(x => ({ ...x, tage: x.ampel.tage }));
  if (ab.jetzt === 'vorbereiten') gruende.push(ab.lieferanten.length ? 'bestellen' : null, ab.ungeklaert.length ? 'ungeklaert' : null);
  // Lagerware geht als Paket von uns raus - dafuer gibt es keinen Termin abzustimmen.
  const wareDa = ab.beiUns.filter(x => x.art === 'ware' && x.weg !== 'lager');
  // "Ware ist da" erst, wenn alles da ist, was zu uns kommt (06.11.2026): vorher schrieb eine
  // Teillieferung dem Kunden "Ihre Ware ist eingetroffen" - mit nur der Unterlage in der Liste.
  const w = ab.eingang?.ware || { da: wareDa.length, gesamt: wareDa.length, alle: true, fehlt: [] };
  const teillieferung = w.da > 0 && !w.alle ? { da: w.da, gesamt: w.gesamt, fehlt: w.fehlt } : null;
  if (wareDa.length && w.alle && !informiert) gruende.push('informieren');
  // Eigener Grund fuer Ware, die wir selbst auf den Weg bringen: Lagerware immer; eingetroffene Ware
  // "ueber uns" nur bei einer Teillieferung - ist alles da, steht sie unter "Kunde informieren".
  if ((ab.selbst || []).some(x => x.weg === 'lager' || (teillieferung && !informiert))) gruende.push('selbst');
  // Muster verschicken erst, wenn alle Muster da sind, die noch kommen koennen (Regel "Packbereit");
  // kennt die Ansicht den Umschlag, muss auch er packbereit sein (mehrere Bestellungen, Adresse).
  const offeneMuster = ab.positionen.filter(x => x.art === 'muster' && !x.gesperrt && x.rang < 3);
  if (offeneMuster.length && offeneMuster.every(x => x.rang >= 2 || x.eigen) && (!umschlag || umschlag === 'packen')) gruende.push('muster_da');
  // Kommt nicht (Mustersperre): Kunde informieren - in der Packstation. Rot, also nie eingeklappt.
  if (ab.positionen.some(x => x.gesperrt)) gruende.push('gesperrt');
  if (verzug.length) gruende.push('verzug');
  const g = gruende.filter(Boolean);
  // Angefangene Umschlaege warten auf ihre Muster - sie sind unterwegs, nie "beim Kunden".
  const wartet = ab.unterwegs.length || offeneMuster.length;
  const gruppe = g.length ? 'jetzt' : ['bestellt', 'lieferung'].includes(ab.jetzt) && wartet ? 'unterwegs' : 'beiKunde';
  return { gruppe, gruende: g, verzug, wareDa, teillieferung };
}

/**
 * Dringendster Grund zuerst - danach zaehlt die Kopfzeile "Je Auftrag" jeden Auftrag genau einmal
 * (vorher ergaben 10 Auftraege 11 Gruende). Muster verschicken zuletzt, wie in jetztRang().
 */
export const GRUND_REIHENFOLGE = Object.freeze(['ungeklaert', 'gesperrt', 'verzug', 'bestellen', 'informieren', 'selbst', 'muster_da']);

/** Der dringendste Grund eines Auftrags (Ergebnis von einordnung()) oder null. */
export function hauptGrund(e) {
  return GRUND_REIHENFOLGE.find(g => (e?.gruende || []).includes(g)) || null;
}

/** Je Grund die Zahl der Auftraege, jeder Auftrag einmal; die Summe ist die Zahl der Auftraege mit Grund. */
export function grundZahlen(liste = []) {
  const z = Object.fromEntries(GRUND_REIHENFOLGE.map(g => [g, 0]));
  for (const e of liste) { const g = hauptGrund(e); if (g) z[g] += 1; }
  return z;
}

/**
 * "Teillieferung: 1 von 2 Warenartikeln da – fehlt noch: Teppich · Farbe (Lieferant)" - leer ohne
 * Teillieferung. Ein Satz fuer alle Ansichten, die den Teilstand zeigen.
 * @param ab  Ergebnis von auftragsAblauf() (nur fuer kuenftige Ansichten ohne einordnung)
 * @param e   Ergebnis von einordnung()
 * @param opt.lieferantName  Kennung -> Anzeigename (Stammdaten); ohne Namen bleibt der Lieferant weg
 */
export function teilstandText(ab, e, { lieferantName = () => '' } = {}) {
  const t = e?.teillieferung;
  if (!t) return '';
  const fehlt = t.fehlt.map(f => {
    const name = f.lieferant && f.lieferant !== UNGEKLAERT ? lieferantName(f.lieferant) : '';
    return `${f.titel || 'Artikel'}${name ? ` (${name})` : ''}`;
  });
  return `Teillieferung: ${t.da} von ${t.gesamt} Warenartikeln da – fehlt noch: ${fehlt.join(', ')}`;
}

/**
 * Ampel einer Auftragskarte "Je Auftrag" (lib/ampel.mjs): die dringendste ihrer Positionen.
 *   rot   Bestellangaben fehlen (ungeklaert), ein Muster ist gesperrt (Lieferant kann nicht
 *         liefern), Verzug ab 14 Tagen oder bestaetigter Liefertermin vorbei
 *   gelb  Verzug ab 7 Tagen: beim Lieferanten nachhaken
 * Was sonst "jetzt" zu tun ist (bestellen, Kunde informieren, Muster verschicken), ist normale
 * Arbeit und bleibt ohne Farbe.
 * @param ab  Ergebnis von auftragsAblauf()
 * @param e   Ergebnis von einordnung()
 * Gesperrte Muster markiert auftragsAblauf() aus `gesperrteMuster` der Bestellungen.
 * @returns {{stufe:'rot'|'gelb', grund:string, wort:string, tage?:number}|null}
 */
export function auftragsAmpel(ab, e) {
  if (ab?.ungeklaert?.length) return { stufe: 'rot', grund: 'blockiert', wort: 'Blockiert' };
  if ((ab?.positionen || []).some(x => x.gesperrt)) return { stufe: 'rot', grund: 'gesperrt', wort: 'Gesperrt' };
  const v = (e?.verzug || []).reduce((m, x) => dringendereAmpel(m, x.ampel), null);
  return v?.stufe ? { ...v, wort: warteWort(v) } : null;
}

/**
 * Reihenfolge in "Jetzt zu tun" (Rundgang 29.10., T2; Review 29.10., w-223): zahlende Warenkunden
 * zuerst (Inhaber 22.10.), auch vor einem reinen Musterauftrag, den wir erst bestellen muessen.
 * 0 = Auftrag mit Ware und eigenem Schritt ausser Muster verschicken
 * 1 = reiner Musterauftrag: bestellen, klaeren oder nachfragen
 * 2 = nur Muster verschicken
 * @param e   Ergebnis von einordnung()
 * @param ab  Ergebnis von auftragsAblauf()
 */
export function jetztRang(e, ab) {
  if (!(e?.gruende || []).some(g => g !== 'muster_da')) return 2;
  return (ab?.positionen || []).some(x => x.art === 'ware') ? 0 : 1;
}

const datumDe = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '');

/** Fertiger Text an den Kunden: Ware ist da, Termin abstimmen. Versendet wird nichts. */
export function kundenNachricht({ auftragName, kundeName, artikel = [] }) {
  const anrede = kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,';
  const liste = artikel.length ? `\n\n${artikel.map(a => `- ${a}`).join('\n')}` : '';
  return {
    betreff: `Ihre Bestellung ${auftragName} ist bei uns eingetroffen`,
    text: `${anrede}\n\nIhre Ware zur Bestellung ${auftragName} ist bei uns im Teppich Paradies eingetroffen:${liste}\n\nBitte sagen Sie uns kurz, wann es Ihnen passt: Wir stimmen gern einen Termin für Lieferung bzw. Verlegung mit Ihnen ab – oder Sie holen die Ware bei uns im Laden ab.\n\nAntworten Sie einfach auf diese E-Mail oder rufen Sie uns an.\n\nMit freundlichen Grüßen\nIhr Team von Teppich Paradies`,
  };
}

/** Erinnerung am Vortag eines Termins beim Kunden (Lieferung/Verlegung). Versendet wird nichts. */
export function kundenErinnerung({ auftragName, kundeName, termin }) {
  const anrede = kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,';
  return `${anrede}\n\nwir möchten Sie kurz an unseren Termin morgen, ${datumDe(termin)}, zu Ihrer Bestellung ${auftragName} erinnern. Falls etwas dazwischengekommen ist, melden Sie sich bitte kurz bei uns.\n\nMit freundlichen Grüßen\nIhr Team von Teppich Paradies`;
}

/** Fertige Nachfrage an den Lieferanten bei Verzug. */
export function nachfrageNachricht({ auftragName, positionen = [] }) {
  const zeilen = positionen.map(x => {
    const p = x.pos;
    const menge = p.bestellmenge?.menge && p.bestellmenge.menge !== UNGEKLAERT ? `${p.bestellmenge.menge} ${p.bestellmenge.einheit || ''}`.trim() : '';
    const nr = p.grosshaendlerId && p.grosshaendlerId !== UNGEKLAERT ? `Art.-Nr. ${p.grosshaendlerId}` : '';
    const bestnr = x.eintrag?.lieferantBestellnummer ? `Ihre Auftragsnr. ${x.eintrag.lieferantBestellnummer}` : '';
    return `- ${[p.titel, p.farbe, menge, nr, `bestellt am ${datumDe(x.eintrag?.bestelltAm)}`, bestnr].filter(Boolean).join(' · ')}`;
  });
  return {
    betreff: `Nachfrage Liefertermin – Kommission ${auftragName}`,
    text: `Guten Tag,\n\nfolgende Ware haben wir für unsere Kommission ${auftragName} bei Ihnen bestellt; sie ist bei uns noch nicht eingetroffen:\n\n${zeilen.join('\n')}\n\nKönnen Sie uns bitte kurz den voraussichtlichen Liefertermin nennen?\n\nVielen Dank und freundliche Grüße\nTeppich Paradies`,
  };
}

/**
 * Zahlen fuer die Zeile oben auf "Heute" - dieselbe Rechnung wie die Liste im Einkauf,
 * je Auftrag gezaehlt.
 */
export function einkaufZahlen(auftraege = [], daten = {}, eintragFuer = () => null, informiertFuer = () => null, jetzt = new Date()) {
  const z = { bestellen: 0, informieren: 0, verzug: 0 };
  for (const a of auftraege) {
    const e = einordnung(auftragsAblauf(a, daten, eintragFuer), informiertFuer(a.id), jetzt);
    if (e.gruende.includes('bestellen') || e.gruende.includes('ungeklaert')) z.bestellen += 1;
    if (e.gruende.includes('informieren')) z.informieren += 1;
    if (e.gruende.includes('verzug')) z.verzug += 1;
  }
  return z;
}
