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

const STUFEN = ['zuBestellen', 'bestellt', 'unterwegs', 'erledigt'];

/** Stufe einer Position wie filterGruppe() im Server: geliefert/raus zaehlen als "unterwegs". */
export function stufeVon(status) {
  if (!status) return 'zuBestellen';
  if (status === 'bestellt') return 'bestellt';
  if (status === 'geliefert' || status === 'raus') return 'unterwegs';
  if (status === 'erledigt') return 'erledigt';
  return 'zuBestellen';
}

/** Seit wie vielen Tagen steht die Position auf "bestellt" bzw. "geliefert"? null = wartet nicht. */
export function wartetage(eintrag, jetzt = Date.now()) {
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

const leereStufen = () => ({ zuBestellen: [], bestellt: [], unterwegs: [], erledigt: [] });

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
        ziel[art][stufeVon(eintrag?.status)].push({ pos, eintrag, wartetage: tage, warnstufe: warnstufe(tage, schwellen) });
      }
    }
  };
  verteile(gruppen, 'ware');
  verteile(musterGruppen, 'muster');

  const stamm = new Map((lieferanten || []).map(l => [l.id, l.stammdaten]));
  const karten = [...je.values()].map(k => {
    const wartend = [...k.ware.bestellt, ...k.ware.unterwegs, ...k.muster.bestellt, ...k.muster.unterwegs].filter(x => x.warnstufe);
    wartend.sort((a, b) => b.wartetage - a.wartetage);
    const st = stamm.get(k.id) || leereStammdaten(k.id);
    const zahlen = {
      zuBestellen: k.ware.zuBestellen.length,
      bestellt: k.ware.bestellt.length,
      unterwegs: k.ware.unterwegs.length,
      musterOffen: k.muster.zuBestellen.length,
      musterLaufend: k.muster.bestellt.length + k.muster.unterwegs.length,
    };
    return {
      ...k,
      name: st.name || leereStammdaten(k.id).name,
      zugeordnet: k.id !== UNGEKLAERT,
      stammdaten: st,
      zahlen,
      offenGesamt: zahlen.zuBestellen + zahlen.bestellt + zahlen.unterwegs + zahlen.musterOffen + zahlen.musterLaufend,
      ueberfaellig: {
        stufe: wartend.some(x => x.warnstufe === 'crit') ? 'crit' : wartend.length ? 'warn' : null,
        anzahl: wartend.length,
        problem: wartend.filter(x => x.warnstufe === 'crit').length,
        maxTage: wartend.length ? wartend[0].wartetage : null,
        positionen: wartend,
      },
    };
  });
  // Oben steht, wo heute etwas zu tun ist: erst zu bestellen, dann ueberfaellig, dann der Rest.
  const rang = k => (k.zahlen.zuBestellen + k.zahlen.musterOffen ? 0 : k.ueberfaellig.stufe ? 1 : k.offenGesamt ? 2 : 3);
  return karten.sort((a, b) => (a.id === UNGEKLAERT) - (b.id === UNGEKLAERT) || rang(a) - rang(b) || a.id.localeCompare(b.id));
}

/** Passt eine Karte zum Auftragsfluss-Filter (af)? Ohne Filter: alles, was noch Arbeit macht. */
export function karteImFilter(karte, af = '') {
  const n = stufe => karte.ware[stufe].length + karte.muster[stufe].length;
  if (!af) return n('zuBestellen') + n('bestellt') + n('unterwegs') > 0;
  const stufe = af === 'offen' ? 'zuBestellen' : af;
  return STUFEN.includes(stufe) ? n(stufe) > 0 : false;
}

/** Ueberfaellig-Hinweis einer Karte: Bernstein ab 7 Tagen ("nachhaken"), Rot ab 14. null = nichts. */
export function ueberfaelligText(ue) {
  if (!ue?.stufe) return null;
  const tage = `${ue.maxTage} ${ue.maxTage === 1 ? 'Tag' : 'Tagen'}`;
  const was = ue.anzahl === 1 ? '1 Bestellung wartet' : `${ue.anzahl} Bestellungen warten`;
  return ue.stufe === 'crit'
    ? { stufe: 'crit', text: `Überfällig: ${was}, die älteste seit ${tage}.` }
    : { stufe: 'warn', text: `Nachhaken: ${was}, die älteste seit ${tage}.` };
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
