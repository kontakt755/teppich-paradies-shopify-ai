/**
 * Auswertung: was funktioniert - und was folgt daraus fuer die Planung?
 *
 * Bewusst keine Like-Optimierung. Gezaehlt wird, was dem Betrieb nuetzt:
 * Klicks auf den Shop, Profilbesuche, gespeicherte und geteilte Beitraege,
 * Kommentare. Likes und Reichweite gehen nur mit kleinem Gewicht ein.
 * Anfragen und Beratungstermine misst Meta nicht - sie kommen aus dem Shop
 * (UTM-Parameter) und aus dem Control Center und werden in der Wochenauswertung
 * daneben gestellt, siehe social/AGENTEN.md.
 */

export const GEWICHTE = Object.freeze({
  link_klicks: 6,
  profilbesuche: 4,
  gespeichert: 3,
  geteilt: 3,
  kommentare: 2,
  likes: 0.3,
  reichweite: 0.01,
});

/** Bringt die Metriknamen der Plattformen auf unsere Spalten. */
export function vereinheitliche(werte = {}) {
  const zahl = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    reichweite: zahl(werte.reach),
    aufrufe: zahl(werte.views),
    likes: zahl(werte.likes),
    kommentare: zahl(werte.comments ?? werte.replies),
    geteilt: zahl(werte.shares),
    gespeichert: zahl(werte.saved),
    profilbesuche: zahl(werte.profile_visits),
    link_klicks: zahl(werte.link_clicks),
  };
}

export function punkte(k, gewichte = GEWICHTE) {
  let p = 0;
  for (const [feld, g] of Object.entries(gewichte)) p += (Number(k[feld]) || 0) * g;
  return Math.round(p * 10) / 10;
}

const MIN_BEITRAEGE = 3;

function gruppiere(zeilen, feld, gesamt) {
  const gruppen = {};
  for (const z of zeilen) {
    const schluessel = z[feld];
    if (schluessel === null || schluessel === undefined || schluessel === '') continue;
    (gruppen[schluessel] ??= []).push(z.punkte);
  }
  const aus = {};
  for (const [schluessel, werte] of Object.entries(gruppen)) {
    const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;
    aus[schluessel] = {
      n: werte.length,
      mittel: Math.round(mittel * 10) / 10,
      // Unter drei Beitraegen ist ein Mittelwert Zufall - dann bleibt der Faktor neutral.
      faktor: werte.length >= MIN_BEITRAEGE && gesamt > 0 ? Math.round((mittel / gesamt) * 100) / 100 : 1,
    };
  }
  return aus;
}

/**
 * @param zeilen je veroeffentlichtem Beitrag: {typ, quelle, format, bodenart, ort, wochentag, punkte}
 */
export function lernstand(zeilen, jetzt = new Date()) {
  const gesamt = zeilen.length ? zeilen.reduce((a, z) => a + z.punkte, 0) / zeilen.length : 0;
  return {
    erstellt: jetzt.toISOString(),
    beitraege: zeilen.length,
    mittel: Math.round(gesamt * 10) / 10,
    belastbar: zeilen.length >= 12,
    typ: gruppiere(zeilen, 'typ', gesamt),
    quelle: gruppiere(zeilen, 'quelle', gesamt),
    format: gruppiere(zeilen, 'format', gesamt),
    bodenart: gruppiere(zeilen, 'bodenart', gesamt),
    ort: gruppiere(zeilen, 'ort', gesamt),
    wochentag: gruppiere(zeilen, 'wochentag', gesamt),
  };
}

/** Der Lernstand in Saetzen - fuer die Zentrale und den Wochenbericht. */
export function erkenntnisse(stand) {
  if (!stand?.beitraege) return ['Noch keine veröffentlichten Beiträge mit Messwerten.'];
  const saetze = [];
  if (!stand.belastbar) saetze.push(`Erst ${stand.beitraege} Beiträge gemessen – Aussagen sind noch vorläufig (belastbar ab 12).`);
  const namen = { typ: 'Inhaltsart', quelle: 'Quelle', format: 'Format', bodenart: 'Bodenart', ort: 'Ort', wochentag: 'Wochentag' };
  for (const [feld, label] of Object.entries(namen)) {
    const eintraege = Object.entries(stand[feld] ?? {}).filter(([, v]) => v.n >= MIN_BEITRAEGE).sort((a, b) => b[1].faktor - a[1].faktor);
    if (eintraege.length < 2) continue;
    const [oben, unten] = [eintraege[0], eintraege.at(-1)];
    if (oben[1].faktor >= 1.15) saetze.push(`${label} „${oben[0]}“ liegt ${Math.round((oben[1].faktor - 1) * 100)} % über dem Schnitt (${oben[1].n} Beiträge).`);
    if (unten[1].faktor <= 0.85) saetze.push(`${label} „${unten[0]}“ liegt ${Math.round((1 - unten[1].faktor) * 100)} % unter dem Schnitt (${unten[1].n} Beiträge).`);
  }
  if (saetze.length === (stand.belastbar ? 0 : 1)) saetze.push('Keine Inhaltsart hebt sich bisher deutlich ab.');
  return saetze;
}
