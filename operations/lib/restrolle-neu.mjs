// Plan fuer eine neue Restrolle nach dem Stand vom 03.11.2026: ein sichtbarer Artikel
// mit Meterware und Raummass, Kettelteppich als eigenes Produkt. Baut auf dem
// Entwurfsplaner auf und schreibt selbst nichts nach Shopify.
import { planeRestEntwuerfe, REST_ENTWURF_TAG } from './restposten-entwurf.mjs';
import { florklasseAusMm } from './import-pruefung.mjs';

const SPERR_TAGS = new Set([REST_ENTWURF_TAG, 'aufmass-fehlt', 'bilder-fehlen', 'freigabe-fehlt']);
const MAX_ZUSCHNITT_CM = 1000;
const MINDESTPREIS = '99.0';

export function handleTeil(name) {
  return String(name).trim().toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function zahl(wert, name) {
  const n = Number(wert);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name}: positive Zahl erforderlich`);
  return n;
}

export function planeNeueRestrolle(rolle, { locationId } = {}) {
  const breite = zahl(rolle.breiteCm, 'Rollenbreite');
  const laenge = zahl(rolle.gemesseneLaengeCm, 'Gemessene Laenge');
  const preis = zahl(rolle.preisQm, 'Preis je m²');
  const flor = zahl(rolle.florhoeheMm, 'Florhoehe');
  const uvp = rolle.uvpQm == null ? null : zahl(rolle.uvpQm, 'UVP');
  if (uvp != null && uvp <= preis) throw new Error('UVP muss ueber dem Verkaufspreis liegen');
  if (uvp != null && !String(rolle.uvpBeleg ?? '').trim()) throw new Error('UVP ohne Beleg wird nicht eingetragen');
  if (!String(rolle.vendor ?? '').trim()) throw new Error('Hersteller oder Hausname fehlt');
  if (!String(rolle.foto ?? '').trim()) throw new Error('Foto fehlt: ohne echtes Foto keine Rolle');

  const basis = planeRestEntwuerfe({
    records: [{
      tprBarcode: rolle.code, SumUpItemId: rolle.sumupId, nameOriginal: rolle.name,
      colourCodeOriginal: rolle.farbcode, bekannteRollenbreiteCm: breite, vendor: rolle.vendor,
      // Der Entwurfsplaner prueft Ladenpreis + 5 EUR/m²; hier zaehlt der Online-Preis.
      ladenPreisQm: Math.round((preis - 5) * 100) / 100, onlineMaterialPreisQm: preis,
    }],
  }, { locationId });

  // Bestand in ganzen m², abgerundet (Benutzer 29.10.): nie mehr verkaufen als liegt.
  const bestandQm = Math.floor((breite * laenge) / 10000);
  if (bestandQm < 1) throw new Error('Restmenge unter 1 m²');
  const maxLaenge = Math.min(Math.floor((bestandQm * 10000) / breite), MAX_ZUSCHNITT_CM);
  const slug = handleTeil(rolle.name);
  const key = String(rolle.code).toLowerCase();

  const neueHandles = {
    quelle: `${slug}-teppichboden-${breite}-cm-restrolle`,
    kettelteppich: `${slug}-teppich-nach-mass`,
  };
  const products = basis.products.map(p => {
    const input = { ...p.input, tags: p.input.tags.filter(t => !SPERR_TAGS.has(t)) };
    if (neueHandles[p.role]) input.handle = neueHandles[p.role];
    if (p.role === 'quelle') {
      input.variants = input.variants.map(v => ({
        ...v,
        ...(uvp != null ? { compareAtPrice: uvp.toFixed(2) } : {}),
        showUnitPrice: true,
        unitPriceMeasurement: { quantityValue: 1, quantityUnit: 'M2', referenceValue: 1, referenceUnit: 'M2' },
        inventoryQuantities: [{ locationId, name: 'available', quantity: bestandQm }],
      }));
    }
    // Zuschnitt und Raummass sind Abrechnungszeilen und bleiben unsichtbar, nie loeschen:
    // ohne die Tags am Raummass storniert der Flow die Bestellung.
    return { ...p, input, zielStatus: ['quelle', 'kettelteppich'].includes(p.role) ? 'ACTIVE' : 'UNLISTED' };
  });

  const metafields = basis.metafields.map(m => {
    if (m.key === 'max_roll_laenge_cm') return { ...m, value: String(Math.round(laenge)) };
    if (m.key === 'max_breite_cm') return { ...m, value: String(breite) };
    if (m.key === 'max_laenge_cm') return { ...m, value: String(maxLaenge) };
    // Der Kettelteppich steht fuer sich, nur die Rolle zeigt Raummass und Kettel zusammen.
    if (m.key === 'einfass_gruppe' && m.owner === `${key}:kettelteppich`) return { ...m, targets: [`${key}:kettelteppich`] };
    return m;
  });
  metafields.push(
    { owner: `${key}:quelle`, namespace: 'custom', key: 'florhoehe_mm', type: 'number_decimal', value: flor.toFixed(1) },
    { owner: `${key}:quelle`, namespace: 'custom', key: 'florhohe', type: 'single_line_text_field', value: `ca. ${flor} mm` },
    // Aus der eigenen Messung gerechnet, kein Herstellerbeleg: haelt die Rolle in ihrer Hoehenkategorie.
    { owner: `${key}:quelle`, namespace: 'custom', key: 'florklasse', type: 'single_line_text_field', value: florklasseAusMm(flor) },
  );
  if (uvp != null) metafields.push({ owner: `${key}:quelle`, namespace: 'preis', key: 'vergleich_ist_uvp', type: 'boolean', value: 'true' });
  for (const role of ['raummass', 'kettelteppich']) {
    metafields.push(
      { owner: `${key}:${role}`, namespace: 'service', key: 'mindestpreis', type: 'number_decimal', value: MINDESTPREIS },
      { owner: `${key}:${role}`, namespace: 'service', key: 'einfassen', type: 'single_line_text_field', value: 'Verfügbar', ownerVariant: true },
    );
  }

  return {
    schemaVersion: 1,
    rolle: { code: rolle.code, name: rolle.name, foto: rolle.foto, uvpBeleg: rolle.uvpBeleg ?? null },
    bestandQm, maxLaengeCm: maxLaenge, products, metafields,
    relationships: basis.relationships, preise: basis.preise,
    ablauf: [
      'Alle vier Produkte als DRAFT anlegen, Foto an Rolle, Raummass und Kettelteppich haengen',
      'Metafelder und Zuschnitt-Verknuepfungen setzen, gegenlesen (userErrors leer ist kein Beleg)',
      'Status setzen: Rolle und Kettelteppich ACTIVE, Raummass und Zuschnitt UNLISTED',
      'Veroeffentlichen: alle im Onlineshop und im Marktkatalog, Rolle zusaetzlich in Google & YouTube',
      'Rolle in die manuelle Kollektion teppichboden aufnehmen und weit vorn einsortieren',
      'npm run -s preisfilter:abgleich -- --schreiben, npm run -s auslauf:sortieren, npm run -s import:pruefen',
      'Im Shop pruefen: Band auf der Startseite, Karte mit Restmenge, Rechner, Warenkorb ohne Kauf',
    ],
  };
}
