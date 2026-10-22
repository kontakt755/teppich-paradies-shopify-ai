/**
 * Einkauf je Lieferant: reine Regeln ohne DOM (Browser und Tests).
 *
 * - lieferantenKarten(): eine Karte je Lieferant aus den Gruppen der Bestelluebersicht, dem
 *   Auftragsfluss-Stand und den Stammdaten. Gezaehlt wird hier und nicht aus der Antwort von
 *   /api/einkauf/lieferanten, damit Zahl und Liste nach einem Statuswechsel sofort
 *   zusammenpassen - der Stand je Position liegt schon im Browser.
 * - hauptAktion(): der EINE Knopf je Lieferant, abhaengig vom Bestellweg aus den Stammdaten.
 * - verlauf() / lieferzeiten(): was zuletzt bestellt und geliefert wurde.
 *
 * Schwellen (7/14 Tage) kommen vom Server (`schwellen`) - hier stehen nur die Rueckfallwerte.
 */

export const UNGEKLAERT = 'UNGEKLAERT';
export const SCHWELLEN_STANDARD = Object.freeze({ nachhakenTage: 7, problemTage: 14 });

const STUFEN = ['zuBestellen', 'bestellt', 'eingetroffen', 'erledigt', 'eigen'];

/**
 * Filter-Parameter `af` aus aelteren Links: "unterwegs" hiess bis 2026-10-12 der Schritt
 * "geliefert an uns" (zusammen mit "an Kunden raus") - heute "eingetroffen".
 */
export function afNorm(af) {
  return af === 'unterwegs' ? 'eingetroffen' : (af || '');
}

// Spiegel von operations/lib/musterherkunft.mjs musterOhneLieferant() (dort die fuehrende Quelle).
const ROUTEN_OHNE_LIEFERANT = ['SAMPLE_STOCK', 'SAMPLE_CUT'];

/** Muster, das nicht beim Lieferanten bestellt wird ("haben wir da" oder Musterlager-Route). */
export function musterEigen(p) {
  if (!p?.istMuster) return false;
  if (p.musterHerkunft === 'eigen_versand' || p.musterHerkunft === 'eigen_vorbei') return true;
  if (p.musterHerkunft === 'lieferant') return false;
  return ROUTEN_OHNE_LIEFERANT.includes(p.route) || ROUTEN_OHNE_LIEFERANT.includes(p.musterRoute);
}

/**
 * Stufe einer Position aus Sicht des Einkaufs. Der Einkauf endet, wenn die Ware bei uns
 * eingetroffen ist: "an Kunden raus" zaehlt hier als erledigt. Frueher stand es unter
 * "unterwegs" - so zaehlten Muster, die laengst beim Kunden lagen, als offene Einkaeufe.
 * Was danach kommt (nachfassen, abschliessen), fuehrt die Zeitleiste beim Kunden.
 */
export function stufeVon(status) {
  if (!status) return 'zuBestellen';
  if (status === 'bestellt') return 'bestellt';
  if (status === 'geliefert') return 'eingetroffen';
  if (status === 'raus' || status === 'erledigt') return 'erledigt';
  return 'zuBestellen';
}

/** Seit wie vielen Tagen steht die Position auf "bestellt" bzw. "geliefert"? null = wartet nicht. */
export function wartetage(eintrag, jetzt = Date.now()) {
  const termin = eintrag?.status === 'bestellt' ? eintrag.beschaffung?.liefertermin : null;
  if (termin) {
    const d = new Date(Number(jetzt));
    const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
    return termin >= heute ? null : Math.floor((Date.parse(heute) - Date.parse(termin)) / 864e5);
  }
  const seit = eintrag?.status === 'bestellt' ? eintrag.bestelltAm : eintrag?.status === 'geliefert' ? eintrag.geliefertAm : null;
  if (!seit) return null;
  const tage = Math.floor((Number(jetzt) - new Date(seit).getTime()) / 864e5);
  return Number.isFinite(tage) && tage >= 0 ? tage : null;
}

/** 'crit' ab problemTage, 'warn' ab nachhakenTage, sonst null. */
export function warnstufe(tage, schwellen = SCHWELLEN_STANDARD) {
  if (tage === null || tage === undefined) return null;
  if (tage >= schwellen.problemTage) return 'crit';
  if (tage >= schwellen.nachhakenTage) return 'warn';
  return null;
}

// eigen: offene Muster aus dem eigenen Bestand - vorbeibringen/verschicken statt bestellen.
const leereStufen = () => ({ zuBestellen: [], bestellt: [], eingetroffen: [], erledigt: [], eigen: [] });

function leereStammdaten(id) {
  return {
    id, name: id === UNGEKLAERT ? 'Lieferant nicht zugeordnet' : `Lieferant ${id}`, anzeigename: null, kundennummer: null,
    ware: { weg: null, portalUrl: null, mail: null, telefon: null },
    muster: { weg: null, ansprechperson: null, mail: null, telefon: null, portalUrl: null, lieferung: null },
    lieferzeitWerktage: null, mindestmenge: null, hinweise: null, fehlend: [], hinterlegt: false,
  };
}

/**
 * Karten je Lieferant.
 *
 * @param {object} p
 * @param {object[]} p.gruppen        gruppen aus /api/einkauf/bestellungen (Ware)
 * @param {object[]} p.musterGruppen  musterGruppen aus /api/einkauf/bestellungen
 * @param {object[]} p.lieferanten    lieferanten aus /api/einkauf/lieferanten (Stammdaten), darf fehlen
 * @param {(pos:object)=>object|null} p.eintragFuer  Auftragsfluss-Eintrag einer Position
 * @param {{nachhakenTage:number, problemTage:number}} [p.schwellen]
 * @param {number|Date} [p.jetzt]
 */
export function lieferantenKarten({ gruppen = [], musterGruppen = [], lieferanten = [], eintragFuer = () => null, schwellen = SCHWELLEN_STANDARD, jetzt = Date.now() } = {}) {
  const je = new Map();
  const fuer = id => {
    if (!je.has(id)) je.set(id, { id, ware: leereStufen(), muster: leereStufen(), wareGruppen: [], musterGruppen: [] });
    return je.get(id);
  };
  for (const l of lieferanten || []) if (l?.id) fuer(l.id);
  const verteile = (liste, art) => {
    for (const g of liste || []) {
      const ziel = fuer(g.lieferant || UNGEKLAERT);
      ziel[art === 'ware' ? 'wareGruppen' : 'musterGruppen'].push(g);
      for (const pos of g.positionen || []) {
        const eintrag = eintragFuer(pos);
        const tage = wartetage(eintrag, jetzt);
        const stufe = stufeVon(eintrag?.status);
        ziel[art][stufe === 'zuBestellen' && musterEigen(pos) ? 'eigen' : stufe].push({ pos, eintrag, wartetage: tage, warnstufe: warnstufe(tage, schwellen) });
      }
    }
  };
  verteile(gruppen, 'ware');
  verteile(musterGruppen, 'muster');

  const stamm = new Map((lieferanten || []).map(l => [l.id, l.stammdaten]));
  const karten = [...je.values()].map(k => {
    // Nachfassen beim Lieferanten nur fuer Bestelltes. Was schon bei uns liegt, wartet auf uns,
    // nicht auf den Lieferanten - bis 2026-10-19 stand es mit dessen Telefonnummer unter
    // "Nachfassen" (Codex-Audit). Es steht jetzt unter `liegtBeiUns` ("rausgeben").
    const wartend = [...k.ware.bestellt, ...k.muster.bestellt].filter(x => x.warnstufe);
    wartend.sort((a, b) => b.wartetage - a.wartetage);
    const liegt = [...k.ware.eingetroffen, ...k.muster.eingetroffen].filter(x => x.warnstufe);
    liegt.sort((a, b) => b.wartetage - a.wartetage);
    const st = stamm.get(k.id) || leereStammdaten(k.id);
    const zahlen = {
      zuBestellen: k.ware.zuBestellen.length,
      bestellt: k.ware.bestellt.length,
      eingetroffen: k.ware.eingetroffen.length,
      musterOffen: k.muster.zuBestellen.length,
      musterLaufend: k.muster.bestellt.length + k.muster.eingetroffen.length,
    };
    // Eigenes Feld (nicht in `zahlen`): offene Muster aus dem eigenen Bestand.
    const musterEigen = k.muster.eigen.length;
    return {
      ...k,
      name: st.name || leereStammdaten(k.id).name,
      zugeordnet: k.id !== UNGEKLAERT,
      stammdaten: st,
      zahlen,
      musterEigen,
      offenGesamt: zahlen.zuBestellen + zahlen.bestellt + zahlen.eingetroffen + zahlen.musterOffen + zahlen.musterLaufend + musterEigen,
      ueberfaellig: {
        stufe: wartend.some(x => x.warnstufe === 'crit') ? 'crit' : wartend.length ? 'warn' : null,
        anzahl: wartend.length,
        // Mehrere Positionen einer Kundenbestellung sind ein Auftrag - "15 Bestellungen warten"
        // waren in Wahrheit 15 Positionen aus 5 Auftraegen.
        auftraege: new Set(wartend.map(x => x.pos?.orderId || x.pos?.orderName).filter(Boolean)).size || wartend.length,
        problem: wartend.filter(x => x.warnstufe === 'crit').length,
        maxTage: wartend.length ? wartend[0].wartetage : null,
        positionen: wartend,
      },
      liegtBeiUns: {
        stufe: liegt.some(x => x.warnstufe === 'crit') ? 'crit' : liegt.length ? 'warn' : null,
        anzahl: liegt.length,
        auftraege: new Set(liegt.map(x => x.pos?.orderId || x.pos?.orderName).filter(Boolean)).size || liegt.length,
        maxTage: liegt.length ? liegt[0].wartetage : null,
        positionen: liegt,
      },
    };
  });
  // Oben steht, wo es am dringendsten ist (Inhaber 22.10.): rot ueberfaellig, dann bernstein
  // ueberfaellig, dann zu bestellen, dann der Rest; darin die laengste Wartezeit zuerst, nicht A-Z.
  const STUFE = { crit: 0, warn: 1 };
  const ueber = k => Math.min(STUFE[k.ueberfaellig.stufe] ?? 9, STUFE[k.liegtBeiUns.stufe] ?? 9);
  const rang = k => (ueber(k) < 9 ? ueber(k) : k.zahlen.zuBestellen + k.zahlen.musterOffen ? 2 : k.offenGesamt ? 3 : 4);
  const maxTage = k => Math.max(k.ueberfaellig.maxTage ?? -1, k.liegtBeiUns.maxTage ?? -1);
  return karten.sort((a, b) => (a.id === UNGEKLAERT) - (b.id === UNGEKLAERT) || rang(a) - rang(b) || maxTage(b) - maxTage(a) || a.id.localeCompare(b.id));
}

/** Passt eine Karte zum Auftragsfluss-Filter (af)? Ohne Filter: alles, was noch Arbeit macht. */
export function karteImFilter(karte, af = '') {
  const n = stufe => karte.ware[stufe].length + karte.muster[stufe].length;
  af = afNorm(af);
  if (!af) return n('zuBestellen') + n('bestellt') + n('eingetroffen') + n('eigen') > 0;
  const stufe = af === 'offen' ? 'zuBestellen' : af;
  return STUFEN.includes(stufe) ? n(stufe) > 0 : false;
}

/** Ueberfaellig-Hinweis einer Karte: Bernstein ab 7 Tagen ("nachhaken"), Rot ab 14. null = nichts. */
export function ueberfaelligText(ue) {
  if (!ue?.stufe) return null;
  const tage = `${ue.maxTage} ${ue.maxTage === 1 ? 'Tag' : 'Tagen'}`;
  const auftraege = ue.auftraege ?? ue.anzahl;
  const pos = ue.anzahl === 1 ? '1 Position' : `${ue.anzahl} Positionen`;
  const was = auftraege === 1
    ? `1 Auftrag wartet${ue.anzahl > 1 ? ` (${pos})` : ''}`
    : `${auftraege} Aufträge warten (${pos})`;
  return ue.stufe === 'crit'
    ? { stufe: 'crit', text: `Überfällig: ${was}, der älteste seit ${tage}.` }
    : { stufe: 'warn', text: `Nachhaken: ${was}, der älteste seit ${tage}.` };
}

export function telLink(nummer) {
  const n = String(nummer || '').replace(/[^+\d]/g, '');
  return n ? `tel:${n}` : null;
}

const WEG_LABEL = { mail: 'Bestellmail öffnen', portal: 'Im Portal bestellen', telefon: 'Anrufen' };

/**
 * Der eine Hauptknopf je Lieferant. `href` ist gesetzt, wenn der Knopf zugleich etwas oeffnet
 * (Portal in neuem Tab, Telefon); die Bestellung selbst zeigt immer der Dialog.
 * Ohne hinterlegten Bestellweg bleibt die Bestellliste zum Kopieren.
 */
/**
 * Link, der in Gmail im Browser eine neue Nachricht mit Empfaenger, Betreff und Text oeffnet.
 * Fuer Rechner ohne eingerichtetes Mailprogramm. Sehr lange Texte lassen den Text weg
 * (dann "Text kopieren"); ohne Empfaenger gibt es keinen Link.
 */
export const GMAIL_MAX = 6000;
export function gmailLink({ an, betreff = '', text = '' } = {}) {
  if (!an) return { url: null, gekuerzt: false };
  const basis = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(an)}&su=${encodeURIComponent(betreff)}`;
  const voll = `${basis}&body=${encodeURIComponent(text)}`;
  return voll.length <= GMAIL_MAX ? { url: voll, gekuerzt: false } : { url: basis, gekuerzt: true };
}

export function hauptAktion(stammdaten, art = 'ware') {
  const s = stammdaten?.[art] || {};
  if (s.weg === 'mail') return { weg: 'mail', label: WEG_LABEL.mail, href: null, neuerTab: false };
  if (s.weg === 'portal') return { weg: 'portal', label: WEG_LABEL.portal, href: s.portalUrl || null, neuerTab: true };
  if (s.weg === 'telefon') return { weg: 'telefon', label: WEG_LABEL.telefon, href: telLink(s.telefon), neuerTab: false };
  return { weg: null, label: 'Bestellliste öffnen', href: null, neuerTab: false };
}

/** "per E-Mail an Frau Muster", "im Händlerportal", "per Telefon" - null, wenn kein Weg hinterlegt ist. */
export function bestellwegText(stammdaten, art = 'ware') {
  const s = stammdaten?.[art] || {};
  const person = art === 'muster' && s.ansprechperson ? ` an ${s.ansprechperson}` : '';
  if (s.weg === 'mail') return `per E-Mail${person}`;
  if (s.weg === 'portal') return 'im Händlerportal';
  if (s.weg === 'telefon') return `per Telefon${person}`;
  return null;
}

const FELD_KLARTEXT = {
  anzeigename: 'Name des Lieferanten',
  kundennummer: 'unsere Kundennummer',
  'ware.weg': 'Bestellweg für Ware',
  'ware.mail': 'Mailadresse für Ware',
  'ware.portalUrl': 'Adresse des Händlerportals (Ware)',
  'ware.telefon': 'Telefonnummer für Ware',
  'muster.weg': 'Bestellweg für Muster',
  'muster.mail': 'Mailadresse für Muster',
  'muster.portalUrl': 'Adresse des Händlerportals (Muster)',
  'muster.telefon': 'Telefonnummer für Muster',
  'muster.lieferung': 'wohin Muster gehen (Kunde oder Laden)',
  lieferzeitWerktage: 'übliche Lieferzeit in Werktagen',
};
/** Feldname aus `stammdaten.fehlend` in Alltagssprache. */
export const feldKlartext = feld => FELD_KLARTEXT[feld] || feld;

/** Werktage (Mo-Fr) vom Tag nach `von` bis einschliesslich `bis`; null bei ungueltigen Angaben. */
export function werktageZwischen(von, bis) {
  const a = new Date(von); const b = new Date(bis);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  const tag = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  let n = 0;
  for (let t = tag(a) + 864e5; t <= tag(b); t += 864e5) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n += 1; }
  return n;
}

const tagVon = iso => String(iso || '').slice(0, 10);

const VERLAUF_SCHRITTE = [['erledigt', 'erledigt'], ['raus', 'an Kunden raus'], ['geliefert', 'geliefert'], ['bestellt', 'bestellt']];

/**
 * Verlauf der letzten Bestellungen: je Tag und Schritt eine Zeile ("3 Artikel bestellt"),
 * neueste zuerst. Grundlage sind die Zeitstempel im Auftragsfluss - mehr ist nicht gespeichert.
 *
 * @param {{pos:object, eintrag:object|null}[]} eintraege
 */
export function verlauf(eintraege, { max = 8 } = {}) {
  const je = new Map();
  for (const { pos, eintrag } of eintraege || []) {
    if (!eintrag) continue;
    for (const [schritt, wort] of VERLAUF_SCHRITTE) {
      const am = eintrag[`${schritt}Am`];
      if (!am) continue;
      const nr = schritt === 'bestellt' ? (eintrag.lieferantBestellnummer || '') : '';
      const key = `${tagVon(am)}|${schritt}|${nr}|${pos.istMuster ? 'm' : 'w'}`;
      if (!je.has(key)) je.set(key, { am, schritt, wort, bestellnummer: nr || null, von: eintrag[`${schritt}Von`] || null, muster: !!pos.istMuster, auftraege: new Set(), anzahl: 0 });
      const z = je.get(key);
      z.anzahl += 1;
      if (pos.orderName) z.auftraege.add(pos.orderName);
      if (am > z.am) z.am = am;
    }
  }
  return [...je.values()]
    .sort((a, b) => String(b.am).localeCompare(String(a.am)))
    .slice(0, max)
    .map(z => ({ ...z, auftraege: [...z.auftraege] }));
}

/**
 * Tatsaechliche Lieferzeit: Werktage von "bestellt" bis "geliefert an uns", je Lieferung
 * (gleicher Bestell- und Liefertag = eine Lieferung). Aelteste zuerst, hoechstens `max`.
 */
export function lieferzeiten(eintraege, { max = 8 } = {}) {
  const je = new Map();
  for (const { eintrag } of eintraege || []) {
    if (!eintrag?.bestelltAm || !eintrag?.geliefertAm) continue;
    const tage = werktageZwischen(eintrag.bestelltAm, eintrag.geliefertAm);
    if (tage === null) continue;
    je.set(`${tagVon(eintrag.bestelltAm)}|${tagVon(eintrag.geliefertAm)}`, { geliefertAm: eintrag.geliefertAm, werktage: tage });
  }
  const werte = [...je.values()].sort((a, b) => String(a.geliefertAm).localeCompare(String(b.geliefertAm))).slice(-max);
  const schnitt = werte.length ? werte.reduce((s, w) => s + w.werktage, 0) / werte.length : null;
  return { anzahl: werte.length, schnitt, werte };
}
