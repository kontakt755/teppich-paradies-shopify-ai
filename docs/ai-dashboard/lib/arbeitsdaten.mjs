/** Gemeinsamer Leselauf fuer Arbeitsdaten: je Arbeitsgruppe vollstaendig und geschuetzt uebernehmen. */
export function exportFingerabdruck(a) {
  if (!a?.verfuegbar) return '';
  return Object.entries(a.teile || {}).map(([t, s]) => `${t}:${s?.zeitpunkt || ''}`).sort().join('|');
}
export function arbeitsFingerabdruck(a) {
  return JSON.stringify([exportFingerabdruck(a), a?.arbeitsstand?.kennung || '']);
}

/**
 * Quellen liefern lesen()/setzen(daten), pfad und optional gruppe/laedt()/bezug()/versucht().
 * Kein Zeitgeber hier: der bestehende Datenstand-Takt und Tabwechsel rufen pruefe() auf.
 * Eine fehlgeschlagene Gruppe behaelt ihren bisherigen Stand. Andere Gruppen koennen nachladen.
 * Erst ein vollstaendiger Lauf bestaetigt die Kennung; Teilfehler werden spaeter erneut versucht.
 */
export function erzeugeArbeitsabgleich({ holen, quellen, darfAktualisieren, kontext = () => '',
  statusUebernehmen = () => {}, vorUebernahme = () => {}, nachUebernahme = () => {},
  fehlerMelden = () => {} }) {
  let laeuft = false;
  let kennung = null;
  let exportKennung = null;
  const fehler = () => { fehlerMelden('Die Arbeitsdaten konnten nicht vollständig aktualisiert werden. Für betroffene Bereiche bleibt der bisherige Stand erhalten; der nächste Versuch folgt automatisch.'); return false; };
  return async function pruefe() {
    if (laeuft || !darfAktualisieren()) return false;
    laeuft = true;
    const anfang = kontext();
    const nochFrei = () => darfAktualisieren() && kontext() === anfang;
    try {
      const stand = await holen('/api/aktualisierung/status');
      if (!nochFrei()) return false;
      if (!stand || stand.fehler) return fehler();
      statusUebernehmen(stand);
      const arbeitsstandFehler = stand.arbeitsstand?.verfuegbar === false;
      const neu = arbeitsFingerabdruck(stand);
      if (!arbeitsstandFehler && neu === kennung) { fehlerMelden(null); return false; }
      const exportNeu = exportFingerabdruck(stand);
      const exportGeaendert = exportKennung !== null && exportNeu !== exportKennung;
      const geladen = quellen().filter(q => q.lesen() !== null && q.lesen() !== undefined);
      if (geladen.some(q => q.laedt?.())) return false;
      const vorher = geladen.map(q => ({ q, alt: q.lesen(), bezug: q.bezug?.() }));
      if (!nochFrei()) return false;
      // Eine Quelle kann mehreren Ansichten gehoeren (Heute/Einkauf): einmal holen, gemeinsam setzen.
      const pfade = [...new Set(geladen.map(q => q.pfad))];
      const antworten = await Promise.allSettled(pfade.map(pfad => holen(pfad)));
      if (!nochFrei() || vorher.some(({ q, alt, bezug }) => q.lesen() !== alt || q.bezug?.() !== bezug || q.laedt?.())) return false;
      const ergebnisse = new Map(pfade.map((pfad, i) => [pfad, antworten[i]]));
      const gescheitert = new Set(geladen.filter(q => {
        const r = ergebnisse.get(q.pfad);
        return r.status !== 'fulfilled' || !r.value || r.value.fehler || r.value.verfuegbar === false;
      }).map(q => q.gruppe || q.pfad));
      const vollstaendig = !arbeitsstandFehler && !gescheitert.size;
      const uebernehmen = geladen.filter(q => !gescheitert.has(q.gruppe || q.pfad));
      // TTL-basierte ensure-Aufrufe duerfen beim folgenden Rendern nicht sofort nochmal laden
      // und den bewahrten alten Stand durch denselben Fehlerwert ersetzen.
      for (const q of geladen) q.versucht?.();
      // Kein gescheiterter Cache darf durch die bisherige Export-Invalidierung geleert werden.
      // Eine defekte Belegablage haelt trotzdem keine neuen Bestellungen/Packstaende zurueck.
      if (vollstaendig) vorUebernahme({ exportGeaendert });
      for (const q of uebernehmen) q.setzen(ergebnisse.get(q.pfad).value);
      if (vollstaendig) {
        kennung = neu; exportKennung = exportNeu;
        fehlerMelden(null);
      } else fehler();
      if (uebernehmen.length || vollstaendig) nachUebernahme({ erneuert: uebernehmen.length,
        exportGeaendert: vollstaendig && exportGeaendert, vollstaendig });
      return vollstaendig;
    } catch {
      if (nochFrei()) return fehler();
      return false;
    } finally { laeuft = false; }
  };
}
