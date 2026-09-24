/**
 * Reine Anzeige-Logik fuer den Bereich "Ratgeber" im Control Center.
 *
 * Liest ausschliesslich das Ergebnis von scripts/build-bodenwissen-data.mjs
 * (docs/ai-dashboard/bodenwissen.json). Keine DOM- und keine Node-Abhaengigkeit,
 * damit diese Datei im Browser laeuft und - wie lib/model.mjs - ohne Browser
 * testbar ist. docs/ai-dashboard/app.js bindet sie nur ans DOM.
 */

/**
 * Wie der Bereich auf den Ladezustand reagieren soll. Eine fehlende Datei
 * (noch nie erzeugt, z. B. frischer Checkout) ist kein Fehler und darf nicht
 * abstuerzen - nur ein echter Ladefehler (Netzwerk, kaputtes JSON) ist einer.
 */
export function ratgeberStatus(data, ladeFehler) {
  if (ladeFehler) return { state: 'fehler', hinweis: ladeFehler };
  if (!data) {
    return {
      state: 'fehlt',
      hinweis: 'docs/ai-dashboard/bodenwissen.json fehlt oder ist leer. Erzeugen mit: node scripts/build-bodenwissen-data.mjs',
    };
  }
  return { state: 'ok' };
}

/** "fachinput_noetig" -> "Fachinput noetig" - keine zweite Statusliste pflegen, nur lesbarer machen. */
export function statusLabel(key) {
  const woerter = String(key || '').split('_');
  return woerter.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

/** Content-Pipeline in der Reihenfolge aus dem Payload (== STATUS aus bodenwissen-guard.mjs), inkl. Nullen. */
export function pipelineRows(data) {
  const reihenfolge = data?.statusReihenfolge || Object.keys(data?.contentPipeline || {});
  return reihenfolge.map(key => ({ key, label: statusLabel(key), anzahl: data?.contentPipeline?.[key] || 0 }));
}

/**
 * Text fuer die Suchleistungs-Kachel. `data.suchleistung` ist absichtlich
 * `null` (siehe build-bodenwissen-data.mjs) - hier wird nie eine Zahl daraus
 * gemacht, nur der erklaerende Hinweistext gelesen.
 */
export function suchleistungHinweis(data) {
  return data?.suchleistungHinweis || 'GA4 und Search Console sind nicht angebunden.';
}
