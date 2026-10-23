/** Unbekannte oder fehlgeschlagene Quellen sind keine bestaetigt leere Arbeitsliste. */
export function arbeitsquellenStand(quellen) {
  const laedt = [], fehlt = [];
  for (const [name, daten] of quellen) {
    if (daten == null) laedt.push(name);
    else if (daten.verfuegbar === false || (Array.isArray(daten.fehler) ? daten.fehler.length : daten.fehler)) fehlt.push(name);
  }
  return { laedt, fehlt, vollstaendig: !laedt.length && !fehlt.length };
}
