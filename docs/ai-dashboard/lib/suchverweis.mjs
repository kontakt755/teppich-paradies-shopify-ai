/**
 * Suchbegriffe bleiben im Speicher der Seite, nicht in der Adresse (w-266).
 *
 * In die Kundensuche und die Packstation-Suche tippt man auch E-Mail-Adressen und Telefonnummern.
 * Stuende das in der Adresse, laege es im Browserverlauf. Deshalb steht dort nur ein Verweis
 * (kq=sv-x7f2a1-3), der Begriff selbst liegt hier. So bleibt alles andere wie bisher: Links kopieren
 * den Parameter mit, Links ohne ihn heben die Suche auf, und der Zurueck-Knopf findet in jedem
 * Verlaufseintrag genau seinen Begriff wieder.
 *
 * Nach einem Neuladen ist der Speicher leer. Die Kennung des Seitenlaufs sorgt dafuer, dass ein alter
 * Verweis dann nichts mehr findet, statt zufaellig den Begriff einer neueren Suche zu zeigen.
 */
const GESCHUETZT = ['kq', 'mpq', 'mpfertig'];
const VERWEIS = /^sv-[a-z0-9]+-\d+$/;
const seitenlauf = Math.random().toString(36).slice(2, 8) || 'x';
const begriffe = new Map();
const verweise = new Map();

/** Der Verweis auf einen Suchbegriff. Gleicher Begriff, gleicher Verweis: die Liste bleibt klein, die Adresse ruhig. */
export function suchVerweis(begriff) {
  const text = String(begriff);
  let verweis = verweise.get(text);
  if (!verweis) {
    verweis = `sv-${seitenlauf}-${begriffe.size + 1}`;
    begriffe.set(verweis, text);
    verweise.set(text, verweis);
  }
  return verweis;
}

/** Der Suchbegriff zu einem geschuetzten Parameter; '' wenn keiner gesetzt oder der Verweis veraltet ist. */
export function suchwert(params, key) {
  const wert = params.get(key) || '';
  return VERWEIS.test(wert) ? begriffe.get(wert) || '' : wert;
}

/**
 * Ersetzt Klartext in den geschuetzten Parametern durch Verweise und entfernt leere oder veraltete.
 * Muss vor jedem Schreiben in die Adresse laufen. Gibt zurueck, ob sich etwas geaendert hat.
 */
export function verbergeSuchbegriffe(params) {
  let geaendert = false;
  for (const key of GESCHUETZT) {
    const wert = params.get(key);
    if (wert === null || begriffe.has(wert)) continue;
    if (wert && !VERWEIS.test(wert)) params.set(key, suchVerweis(wert));
    else params.delete(key);
    geaendert = true;
  }
  return geaendert;
}
