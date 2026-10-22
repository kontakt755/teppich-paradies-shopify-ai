/** Vorbereitung ohne Ein-/Ausgabe, Portokauf oder Versandbuchung.
 * Post-Preisliste am 22.10.2026 geprueft: deutschepost.de/de/b/brief_postkarte.html.
 * Ab 2027 werden Formate geaendert; danach keine alte Freigabe anzeigen.
 */
export const GROSSBRIEF = Object.freeze({ preis: '1,80 €', bis: '2026-12-31', maxGramm: 500, maxDickeMm: 20, minLaengeMm: 100, maxLaengeMm: 353, minBreiteMm: 70, maxBreiteMm: 250 });

const zahl = v => typeof v === 'number' ? v : typeof v === 'string' && /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN;
const inland = v => /^(DE|DEU|Deutschland|Germany)$/i.test(String(v || '').trim());

export function pruefeGrossbrief(kunde, messung = {}, { heute = new Date().toISOString().slice(0, 10) } = {}) {
  const fehlt = [];
  if (!kunde?.gepackt) fehlt.push('Umschlag zuerst als gepackt bestätigen.');
  if (!inland(kunde?.adresse?.land)) fehlt.push('Großbrief ist hier nur für eine bestätigte Lieferanschrift in Deutschland vorbereitet.');
  if (!kunde?.adressAufkleber || kunde.adressAufkleber.fehlt?.length) fehlt.push('Lieferanschrift vervollständigen.');
  if (kunde?.fehlt?.length) fehlt.push('Fehlende Muster- oder Adresszuordnung zuerst klären.');
  if (heute > GROSSBRIEF.bis) fehlt.push('Portopreis und Briefformat für das neue Jahr zuerst prüfen.');
  const g = zahl(messung.gramm), d = zahl(messung.dickeMm);
  const seiten = [zahl(messung.laengeMm), zahl(messung.breiteMm)].sort((a, b) => b - a);
  if (!Number.isFinite(g) || g <= 0) fehlt.push('Gewicht des fertigen Umschlags in g eintragen.');
  else if (g > GROSSBRIEF.maxGramm) fehlt.push('Über 500 g: passt nicht als Großbrief.');
  if (!Number.isFinite(d) || d <= 0) fehlt.push('Dicke des fertigen Umschlags in mm eintragen.');
  else if (d > GROSSBRIEF.maxDickeMm) fehlt.push('Dicker als 20 mm: passt nicht als Großbrief.');
  if (seiten.some(v => !Number.isFinite(v) || v <= 0)) fehlt.push('Beide Seiten des Umschlags in mm eintragen.');
  else if (seiten[0] < GROSSBRIEF.minLaengeMm || seiten[0] > GROSSBRIEF.maxLaengeMm || seiten[1] < GROSSBRIEF.minBreiteMm || seiten[1] > GROSSBRIEF.maxBreiteMm) fehlt.push('Format passt nicht: längere Seite 100–353 mm, kürzere Seite 70–250 mm.');
  if (messung.vorOrt !== true) fehlt.push('Bestätigen, dass alle enthaltenen Muster vor Ort liegen und kein Direktversand offen ist.');
  return { passt: !fehlt.length, fehlt };
}
