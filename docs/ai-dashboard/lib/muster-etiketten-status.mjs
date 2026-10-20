/** Vollstaendige, rein lesende Aufkleberpruefung des aktuellen Lexikonstands. */
import { etikettenAusLexikon } from './lexikon-etiketten.mjs';

const text = v => typeof v === 'string' ? v.trim() : '';
const muster = p => text(p?.handle).startsWith('muster-') || p?.handle === 'kostenloses-muster';
const norm = v => text(v).toLowerCase();

/** Die Ausschluesse des Musterwegs; Anfrage-Muster brauchen ebenfalls einen Aufkleber. */
export function musterAngebot(p) {
  if (!p || muster(p) || p.status === 'ARCHIVED') return 'kein';
  const r = p.musterRegeln;
  if (!r?.vollstaendig || !Array.isArray(r.tags) || typeof r.geschenkgutschein !== 'boolean') {
    return p.muster?.vorhanden ? 'bekannt' : 'unbekannt';
  }
  if (r.geschenkgutschein || r.tags.some(t => ['zubehoer', 'ohne-muster'].includes(norm(t)))) return 'kein';
  if (!p.muster?.vorhanden && norm(p.produktgruppe) === 'service') return 'kein';
  if (!p.muster?.vorhanden && !text(p.produktgruppe)) return 'unklar';
  if (!p.onlineStoreUrl && !p.muster?.vorhanden) return 'kein';
  return ['laminat', 'parkett', 'kork'].includes(norm(p.produktgruppe)) ? 'anfrage' : 'direkt';
}

/** Keine gespeicherte Freigabe: neue/geaenderte Produkte werden beim naechsten Aufruf neu geprueft. */
export function musterEtikettenStatus(modell) {
  if (!modell || !Array.isArray(modell.produkte)) throw new Error('Der Lexikonbestand fehlt oder ist nicht lesbar.');
  const produkte = modell.produkte.filter(p => p?.handle && p.status !== 'ARCHIVED');
  const je = new Map(produkte.map(p => [p.handle, p]));
  const zeilen = [];
  const zaehler = { produkte: 0, etiketten: 0, bereit: 0, pruefen: 0, regelstandOffen: 0, ohneMuster: 0,
    musterartikel: 0, musterzuordnungen: 0, zuordnungPruefen: 0, musterbedarfOffen: 0, ohneArtikelnummer: 0 };
  for (const p of produkte) {
    if (muster(p)) continue;
    const angebot = musterAngebot(p);
    if (angebot === 'kein') { zaehler.ohneMuster++; continue; }
    if (angebot === 'unbekannt') {
      zaehler.regelstandOffen++;
      zeilen.push({ handle: p.handle, titel: p.titel, angebot, status: 'datenstand', anzahl: 0,
        bereit: 0, fehlt: ['Musterregeln noch nicht aktualisiert'], etiketten: [] });
      continue;
    }
    if (angebot === 'unklar') {
      zaehler.musterbedarfOffen++;
      zeilen.push({ handle: p.handle, titel: p.titel, angebot, status: 'pruefen', anzahl: 0, bereit: 0,
        fehlt: ['Produktgruppe fehlt – Musterfähigkeit prüfen'], etiketten: [] });
      continue;
    }
    const etiketten = etikettenAusLexikon(p, je).map((z, index) => {
      const fehlt = [...z.etikett.fehlt];
      // Eine QR-Adresse aus dem Handle allein belegt keine Veroeffentlichung.
      const ziel = je.get(new URL(z.etikett.url || 'https://ungueltig.invalid').pathname.split('/products/')[1]);
      if (!ziel?.onlineStoreUrl || ziel.onlineStoreUrl !== z.etikett.url) fehlt.push('Veröffentlichte Produktseite');
      if (!z.etikett.sku) zaehler.ohneArtikelnummer++;
      return { index, key: z.key, bezeichnung: z.bezeichnung, sku: z.etikett.sku,
        fehlt: [...new Set(fehlt)], hinweise: z.etikett.sku ? [] : ['Keine Artikelnummer im Shop hinterlegt; die Zeile entfällt auf dem Aufkleber.'], etikett: z.etikett };
    });
    const fehlt = [...new Set(etiketten.flatMap(z => z.fehlt))];
    if (!etiketten.length) fehlt.push('Keine eindeutige Ausführung');
    const bereit = etiketten.filter(z => !z.fehlt.length).length;
    zaehler.produkte++; zaehler.etiketten += etiketten.length;
    zaehler.bereit += bereit; zaehler.pruefen += etiketten.filter(z => z.fehlt.length).length;
    if (!etiketten.length) zaehler.pruefen++;
    zeilen.push({ handle: p.handle, titel: p.titel, angebot, status: fehlt.length ? 'pruefen' : 'bereit',
      anzahl: etiketten.length, bereit, fehlt, etiketten });
  }
  // Auch ein fehlerhafter Musterartikel darf nicht hinter einem gesunden Original verschwinden.
  for (const p of produkte.filter(p => muster(p) && p.handle !== 'kostenloses-muster')) {
    zaehler.musterartikel++;
    const etiketten = etikettenAusLexikon(p, je);
    zaehler.musterzuordnungen += etiketten.length;
    const fehler = etiketten.filter(z => z.etikett.fehlt.length);
    zaehler.zuordnungPruefen += fehler.length || (!etiketten.length ? 1 : 0);
    if (fehler.length || !etiketten.length) zeilen.push({ handle: p.handle, titel: p.titel,
      angebot: 'musterartikel', status: 'pruefen', anzahl: etiketten.length, bereit: etiketten.length - fehler.length,
      fehlt: [...new Set(fehler.flatMap(z => z.etikett.fehlt).concat(!etiketten.length ? ['Muster ohne Ausführung'] : []))], etiketten: [] });
  }
  return { erstellt: modell.erstellt || null, zaehler,
    vollstaendig: !zaehler.pruefen && !zaehler.zuordnungPruefen && !zaehler.regelstandOffen && !zaehler.musterbedarfOffen,
    zeilen: zeilen.sort((a, b) => String(a.titel || a.handle).localeCompare(String(b.titel || b.handle), 'de')) };
}
