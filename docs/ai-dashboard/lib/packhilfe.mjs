/** Theoretische Packhilfe aus belegten Angaben/Eingaben. Kein Mess- oder Versandnachweis. */
const positiv = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const nichtNegativ = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const endlich = n => Number.isFinite(n) ? n : null;
const formen = new Map([['rechteck', 'rechteck'], ['rectangle', 'rechteck'], ['ellipse', 'ellipse'], ['oval', 'ellipse'], ['rund', 'rund'], ['kreis', 'rund'], ['round', 'rund']]);

export function berechnePackhilfe(positionen, { kernCm = 0, zugabeCm = 2, verpackungKg = null } = {}) {
  const fehlend = [];
  const fehlt = text => { if (!fehlend.includes(text)) fehlend.push(text); };
  const liste = Array.isArray(positionen) ? positionen : [];
  let flaeche = 0, gewicht = 0, achse = 0, querschnitt = 0;
  let flaecheOk = liste.length > 0, gewichtOk = liste.length > 0, achseOk = liste.length > 0, rolleOk = liste.length > 0;
  if (!liste.length) fehlt('Positionen fehlen');
  for (const [i, roh] of liste.entries()) {
    const p = roh || {}, name = p.id == null ? `Position ${i + 1}` : `Position ${String(p.id)}`;
    const masseOk = positiv(p.breiteCm) && positiv(p.laengeCm);
    const mengeOk = positiv(p.menge) && Number.isInteger(p.menge);
    const form = formen.get(typeof p.form === 'string' ? p.form.trim().toLowerCase() : '');
    const formOk = Boolean(form) && (form !== 'rund' || p.breiteCm === p.laengeCm);
    if (!masseOk) fehlt(`${name}: Breite/Länge in cm fehlen oder sind ungültig`);
    if (!mengeOk) fehlt(`${name}: positive ganze Menge fehlt oder ist ungültig`);
    if (!formOk) fehlt(`${name}: Form fehlt oder ist widersprüchlich (rund braucht gleiche Durchmesser)`);
    if (!positiv(p.gewichtGm2)) fehlt(`${name}: Gesamtgewicht in g/m² fehlt oder ist ungültig`);
    if (!positiv(p.dickeMm)) fehlt(`${name}: Dicke in mm fehlt oder ist ungültig`);
    const a = masseOk && mengeOk && formOk ? endlich(p.breiteCm * p.laengeCm / 10000 * p.menge * (form === 'rechteck' ? 1 : Math.PI / 4)) : null;
    if (a === null) flaecheOk = gewichtOk = false;
    else {
      flaeche += a;
      if (positiv(p.gewichtGm2)) gewicht += a * p.gewichtGm2 / 1000;
      else gewichtOk = false;
    }
    if (!masseOk || !mengeOk || !formOk) achseOk = rolleOk = false;
    else {
      achse = Math.max(achse, Math.min(p.breiteCm, p.laengeCm));
      // Alle kurzen Achsen parallel und mittig: konservativ der maximale gemeinsame
      // Querschnitt, auch bei unterschiedlichen Breiten/Materialien und ovalen Formen.
      if (positiv(p.dickeMm)) querschnitt += Math.max(p.breiteCm, p.laengeCm) * (p.dickeMm / 10) * p.menge;
      else rolleOk = false;
    }
  }
  if (!nichtNegativ(kernCm)) { fehlt('Kerndurchmesser in cm ist ungültig'); rolleOk = false; }
  if (!nichtNegativ(zugabeCm)) fehlt('Verpackungszugabe in cm ist ungültig');
  if (verpackungKg === null || verpackungKg === undefined) fehlt('Verpackungsgewicht in kg fehlt');
  else if (!nichtNegativ(verpackungKg)) fehlt('Verpackungsgewicht in kg ist ungültig');
  const flaecheM2 = flaecheOk ? endlich(flaeche) : null;
  const produktgewichtKg = gewichtOk ? endlich(gewicht) : null;
  const bruttogewichtKg = produktgewichtKg !== null && nichtNegativ(verpackungKg) ? endlich(produktgewichtKg + verpackungKg) : null;
  const rollenachseCm = achseOk ? endlich(achse) : null;
  // Durchmesser inklusive derselben gesamten Verpackungszugabe, auf volle cm aufgerundet.
  const durchmesserCm = rolleOk && nichtNegativ(zugabeCm) ? endlich(Math.ceil(Math.sqrt(kernCm ** 2 + 4 / Math.PI * querschnitt) + zugabeCm)) : null;
  const achsenLaenge = rollenachseCm !== null && nichtNegativ(zugabeCm) ? endlich(Math.ceil(rollenachseCm + zugabeCm)) : null;
  let laengeCm = achsenLaenge, breiteCm = null, hoeheCm = null;
  if (durchmesserCm !== null && achsenLaenge !== null) [laengeCm, breiteCm, hoeheCm] = [achsenLaenge, durchmesserCm, durchmesserCm].sort((a, b) => b - a);
  // Auch extreme endliche Eingaben duerfen durch Ueberlauf keine plausiblen Werte vortaeuschen.
  if ((flaecheOk && flaecheM2 === null) || (gewichtOk && produktgewichtKg === null)
      || (rolleOk && nichtNegativ(zugabeCm) && durchmesserCm === null)) fehlt('Zahlenbereich überschritten; Angaben prüfen');
  return { flaecheM2, produktgewichtKg, bruttogewichtKg, rollenachseCm, durchmesserCm, laengeCm, breiteCm, hoeheCm, fehlend };
}
