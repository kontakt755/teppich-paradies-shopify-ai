/** Startseite: dieselben offenen Einkaufspositionen wie die Lieferantenkarten, ohne DOM. */
import { lieferantenKarten } from './einkauf-lieferanten.mjs';
import { blockGruende } from './einkauf-uebersicht.mjs';
import { kalendertage } from './kalendertage.mjs';

const objekt = v => v && typeof v === 'object' && !Array.isArray(v);
const arten = fn => ({ muster: fn('muster'), ware: fn('ware') });

/** Dieselben harten Kriterien wie lieferanten.mjs: geklaerte Artikelnummer und Menge > 0.
 * Lieferziel und Kundenanschrift prueft weiterhin der bestehende Vorbereitungsdialog. */
function musterBlockiert(p) {
  const nummer = p.grosshaendlerId;
  return !nummer || nummer === 'UNGEKLAERT' || nummer === '–' || !String(nummer).trim()
    || !(p.bestellmenge?.menge > 0);
}

/** Kundenbestellungen zaehlen einmal, auch wenn mehrere Farben noch fehlen. */
function menge(eintraege, jetzt) {
  const tage = eintraege.map(({ pos }) => {
    return kalendertage(pos?.orderDatum, jetzt);
  }).filter(t => t !== null);
  return {
    positionen: eintraege.length,
    kunden: new Set(eintraege.map(x => x.pos?.orderId).filter(Boolean)).size,
    aeltesteTage: tage.length ? Math.max(...tage) : null,
    eintraege,
  };
}

function nichtBereit(laedt, hinweis) {
  // Unbekannt ist keine leere Arbeitsliste und darf nie als "alles erledigt" erscheinen.
  return { verfuegbar: false, laedt, hinweis, lieferanten: [], blockiert: null,
    nichtZugeordnet: null, eigen: null, gesamt: null };
}

/**
 * Nur die Stufe "zuBestellen" wird zur Bestellarbeit; bestellt/eingetroffen/erledigt bleiben
 * im vorhandenen Ablauf. Lager und eigener Zuschnitt stehen gesondert unter `eigen`.
 * `kunden` meint eindeutige Kundenbestellungen (orderId), keine Farben oder Stueckzahlen.
 *
 * @param {object|null} p.daten Antwort von /api/einkauf/bestellungen
 * @param {object|null} p.statusAlle Positionsmap oder Antwort von /api/einkauf/auftragsstatus
 * @param {object[]|object|null} p.lieferanten Stammdatenliste oder deren API-Antwort
 * @param {number|Date} p.jetzt
 */
export function startBestellarbeit({ daten = null, statusAlle = null, lieferanten = null, jetzt = Date.now() } = {}) {
  if (!daten || !statusAlle) return nichtBereit(true, 'Bestellarbeit wird geladen.');
  if (daten.verfuegbar === false) return nichtBereit(false, daten.hinweis || 'Bestelldaten sind nicht verfügbar.');
  if (statusAlle.verfuegbar === false) return nichtBereit(false, statusAlle.hinweis || 'Der aktuelle Bestellstand ist nicht verfügbar.');
  const status = Object.hasOwn(statusAlle, 'positionen') ? statusAlle.positionen : statusAlle;
  if (!Array.isArray(daten.gruppen) || !Array.isArray(daten.musterGruppen) || !objekt(status)) {
    return nichtBereit(false, 'Bestellarbeit ist noch nicht vollständig verfügbar.');
  }
  const zeit = Number(jetzt);
  if (!Number.isFinite(zeit)) return nichtBereit(false, 'Der Zeitpunkt für die Bestellarbeit ist nicht verfügbar.');
  const stamm = Array.isArray(lieferanten) ? lieferanten : lieferanten?.lieferanten || [];
  const karten = lieferantenKarten({ gruppen: daten.gruppen, musterGruppen: daten.musterGruppen,
    lieferanten: stamm, schwellen: lieferanten?.schwellen, jetzt: zeit,
    eintragFuer: p => p.orderId && p.lineItemId ? status[`${p.orderId}::${p.lineItemId}`] || null : null });
  const blockiert = arten(() => []), nichtZugeordnet = arten(() => []), eigen = arten(() => []);
  const gesamt = arten(() => []), liste = [];
  for (const k of karten) {
    const bestellbar = arten(() => []);
    for (const art of ['muster', 'ware']) {
      eigen[art].push(...k[art].eigen);
      for (const x of k[art].zuBestellen) {
        gesamt[art].push(x);
        if (!k.zugeordnet) nichtZugeordnet[art].push(x);
        else if (!x.pos.orderId || !x.pos.lineItemId || (art === 'muster' ? musterBlockiert(x.pos) : blockGruende(x.pos).length)) blockiert[art].push(x);
        else bestellbar[art].push(x);
      }
    }
    if (bestellbar.muster.length || bestellbar.ware.length) {
      liste.push({ id: k.id, name: k.name, ...arten(art => menge(bestellbar[art], zeit)) });
    }
  }
  const aelteste = k => Math.max(k.muster.aeltesteTage ?? -1, k.ware.aeltesteTage ?? -1);
  liste.sort((a, b) => aelteste(b) - aelteste(a) || a.id.localeCompare(b.id));
  return { verfuegbar: true, laedt: false, hinweis: null, lieferanten: liste,
    blockiert: arten(art => menge(blockiert[art], zeit)),
    nichtZugeordnet: arten(art => menge(nichtZugeordnet[art], zeit)),
    eigen: arten(art => menge(eigen[art], zeit)),
    gesamt: arten(art => menge(gesamt[art], zeit)) };
}
