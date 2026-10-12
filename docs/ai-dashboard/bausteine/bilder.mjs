/**
 * Bilder fuer den Upload vorbereiten: verkleinern und als base64 verpacken.
 * Gebraucht von "Fotos" (Baustellenfotos) und "Fehler melden" (Bildschirmfotos).
 */

/** Datei oder Blob -> base64, ohne den Praefix "data:...;base64," */
export function alsBase64(datei) {
  return new Promise((ja, nein) => {
    const leser = new FileReader();
    leser.onload = () => ja(String(leser.result).split(',')[1] || '');
    leser.onerror = () => nein(new Error(`„${datei.name || 'Bild'}" ließ sich nicht lesen`));
    leser.readAsDataURL(datei);
  });
}

/**
 * Ein Foto vom Handy hat 12 Megapixel und 3-5 MB. Fuer einen Beitrag und fuer
 * die Ablage reicht die lange Kante mit 2000 px; das spart auf der Baustelle
 * Mobilfunkdaten und haelt die Anfrage klein genug, dass sie ueberhaupt
 * ankommt (der Server nimmt 24 MB fuer den ganzen Schwung).
 *
 * Geht das Verkleinern nicht - unbekanntes Format, kein canvas, HEIC, das der
 * Browser nicht dekodiert -, wird die Datei unveraendert geschickt. Lieber ein
 * grosses Foto als gar keins; die Groessengrenze faengt den Rest ab.
 */
export async function alsHochladbar(datei, { maxKante = 2000 } = {}) {
  const name = datei.name || 'bild';
  const unveraendert = async () => ({ name, typ: datei.type, daten: await alsBase64(datei) });
  if (!/^image\//.test(datei.type) || typeof createImageBitmap !== 'function') return unveraendert();
  let bild = null;
  try {
    bild = await createImageBitmap(datei);
    const faktor = Math.min(1, maxKante / Math.max(bild.width, bild.height));
    // Schon klein genug: nicht neu kodieren, das wuerde nur Qualitaet kosten.
    if (faktor === 1 && datei.size <= 1_500_000) return unveraendert();
    const flaeche = document.createElement('canvas');
    flaeche.width = Math.max(1, Math.round(bild.width * faktor));
    flaeche.height = Math.max(1, Math.round(bild.height * faktor));
    flaeche.getContext('2d').drawImage(bild, 0, 0, flaeche.width, flaeche.height);
    const klein = await new Promise(ja => flaeche.toBlob(ja, 'image/jpeg', 0.82));
    // Wenn das Ergebnis nicht kleiner ist, hat das Verkleinern nichts gebracht.
    if (!klein || klein.size >= datei.size) return unveraendert();
    return { name: name.replace(/\.[^.]+$/, '') + '.jpg', typ: 'image/jpeg', daten: await alsBase64(klein) };
  } catch {
    return unveraendert();
  } finally {
    bild?.close?.();
  }
}
