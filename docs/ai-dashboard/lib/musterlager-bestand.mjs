/**
 * Musterlager: Bestand rechnen und nach Lieferant ordnen. Rein rechnend, damit Einkauf und Lexikon
 * dieselbe Rechnung benutzen.
 *
 * Bei Einzelmustern ist `anzahl` die Gesamtzahl seit dem Einlagern, also inklusive schon Verschicktem.
 * Was in der Schublade liegt: anzahl - verbraucht. Reservierte liegen noch drin, sie zaehlen als da.
 * `stand.rest` ist dagegen der freie Rest (ohne Reservierte) und taugt deshalb nicht zum Vorbelegen:
 * wer den speichert, verliert still die reservierten Stuecke. Das Lager wuerde dann zu wenig
 * melden und neue Musterbestellungen gingen doppelt an den Lieferanten.
 */

export const ZAEHLBAR_STANDARD = Object.freeze(['einzel']);

const verbraucht = e => e?.stand?.verbraucht ?? 0;

/** Physisch noch da (Einzelmuster): eingelagert minus verschickt. */
export function nochDaZaehlbar(e) {
  return Math.max(0, (e?.anzahl ?? 0) - verbraucht(e));
}

/** Rueckrechnung fuers Speichern: Gesamtzahl aus dem, was noch da ist, damit das Abzaehlen weiter stimmt. */
export function gesamtAusNochDa(nochDa, e) {
  return Number(nochDa) + verbraucht(e);
}

/** Was physisch da ist, in der Einheit des Eintrags: Einzelmuster gezaehlt, sonst Stueck bzw. Bahnen; leer = 0. */
export function lagerNochDa(e, zaehlbar = ZAEHLBAR_STANDARD) {
  if (e?.leer) return 0;
  return zaehlbar.includes(e?.art) ? nochDaZaehlbar(e) : (e?.anzahl ?? 1);
}

/**
 * Anfrage fuer eine direkt korrigierte Lagerzeile; nur Felder, die sich wirklich aendern.
 * @param {object} e  Lagereintrag aus /api/einkauf/musterlager
 * @param {{nochDa: string|number, ort: string}} eingabe
 * @returns {object|null} Anfrage, null = nichts geaendert, {fehler} = Eingabe ungueltig
 */
export function lagerKorrektur(e, { nochDa = '', ort = '' } = {}, zaehlbar = ZAEHLBAR_STANDARD) {
  const body = { aktion: 'aendern', id: e.id };
  const platz = String(ort ?? '').trim();
  if (platz !== (e.ort || '')) body.ort = platz;
  const roh = String(nochDa ?? '').trim();
  if (roh !== '') {
    const n = Number(roh);
    if (!Number.isInteger(n) || n < 0 || n > 999) return { fehler: 'Noch da muss eine ganze Zahl zwischen 0 und 999 sein.' };
    const zaehlt = zaehlbar.includes(e.art);
    if (e.leer) {
      // Wie "Wieder da" im Einkauf: erst eine Menge groesser 0 hebt das "leer" auf.
      if (n > 0) { body.leer = false; body.anzahl = zaehlt ? gesamtAusNochDa(n, e) : n; }
    } else if (n !== lagerNochDa(e, zaehlbar)) {
      // Zuschnitt-Stueck auf 0: ohne "leer" liefe das Stueck weiter als vorraetig, Bestellungen kaemen aus dem Lager.
      if (!zaehlt && n === 0) body.leer = true;
      else body.anzahl = zaehlt ? gesamtAusNochDa(n, e) : n;
    }
  }
  return Object.keys(body).length > 2 ? body : null;
}

/** Gewuenschte Reihenfolge im Musterlager (Pseudonyme), danach alle uebrigen, "unbekannt" ganz unten. */
export const LIEFERANTEN_ZUERST = Object.freeze(['A', 'E', 'D']);
export const LIEFERANT_UNBEKANNT = 'Lieferant unbekannt';

/**
 * Lagereintraege je Lieferant, mit Summe je Gruppe. Der Server traegt `lieferant: {id, name}` ein
 * (Zuordnung ueber die Artikelnummern); der Name kommt aus den privaten Stammdaten.
 * @returns {{id: string|null, name: string, eintraege: object[], stueck: number, jeArt: Object<string, number>}[]}
 */
export function nachLieferant(eintraege = [], zaehlbar = ZAEHLBAR_STANDARD) {
  const je = new Map();
  for (const e of eintraege) {
    const id = e?.lieferant?.id || null;
    if (!je.has(id)) je.set(id, { id, name: id ? e.lieferant.name || `Lieferant ${id}` : LIEFERANT_UNBEKANNT, eintraege: [], stueck: 0, jeArt: {} });
    const g = je.get(id);
    g.eintraege.push(e);
    const da = lagerNochDa(e, zaehlbar);
    g.stueck += da;
    g.jeArt[e?.art] = (g.jeArt[e?.art] || 0) + da;
  }
  const rang = g => {
    if (!g.id) return LIEFERANTEN_ZUERST.length + 1;
    const i = LIEFERANTEN_ZUERST.indexOf(g.id);
    return i < 0 ? LIEFERANTEN_ZUERST.length : i;
  };
  return [...je.values()].sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'de'));
}

const ART_WOERTER = [['einzel', 'Einzelmuster', 'Einzelmuster'], ['probestueck', 'Probestück', 'Probestücke'], ['bahn', 'Bahn', 'Bahnen'], ['rest', 'Verlegerest', 'Verlegereste']];

/** Summe einer Lieferantengruppe je Art: Einzelmuster, Probestuecke und Bahnen sind nicht dasselbe "Stueck". */
export function stueckJeArt(jeArt = {}) {
  const bekannt = new Set(ART_WOERTER.map(([art]) => art));
  const teile = ART_WOERTER.filter(([art]) => jeArt[art] > 0).map(([art, eins, viele]) => `${jeArt[art]} ${jeArt[art] === 1 ? eins : viele}`);
  const sonst = Object.entries(jeArt).filter(([art]) => !bekannt.has(art)).reduce((summe, [, n]) => summe + n, 0);
  if (sonst > 0) teile.push(`${sonst} Stück`);
  return teile.join(' · ') || '0 Stück';
}
