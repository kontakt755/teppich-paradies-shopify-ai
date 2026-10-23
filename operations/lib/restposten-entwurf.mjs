// Ein Entwurfssatz je vorbereiteter Position, noch kein bestaetigtes Reststueck.
// Dieser Planer schreibt nichts nach Shopify und veroeffentlicht nichts.
import { existsSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

export function privaterAusgabeordner(ausgabe, repoRoot) {
  const root = realpathSync(repoRoot);
  const ziel = resolve(ausgabe);
  let vorfahre = ziel;
  while (!existsSync(vorfahre)) vorfahre = dirname(vorfahre);
  const kanonisch = resolve(realpathSync(vorfahre), relative(vorfahre, ziel));
  if (kanonisch === root || kanonisch.startsWith(root + sep)) {
    throw new Error('Rohdaten/Plan ausserhalb des Repositorys ablegen');
  }
  return kanonisch;
}

export const REST_ENTWURF_TAG = 'rest-vorbereitung-20261023';
const ROLES = ['quelle', 'zuschnitt', 'raummass', 'kettelteppich'];
const GID = /^gid:\/\/shopify\/(Product|ProductVariant)\/\d+$/;
const text = value => String(value ?? '').trim();
const mf = (owner, namespace, key, type, value) => ({ owner, namespace, key, type, value: String(value) });
const reference = (owner, key, target, variant = false) => ({
  owner, namespace: 'service', key, type: variant ? 'variant_reference' : 'product_reference',
  target, targetVariant: variant,
});
const money = cents => (cents / 100).toFixed(2);
function cents(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isSafeInteger(Math.round(n * 100)) || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    throw new Error(`${name}: positiver Centpreis erforderlich`);
  }
  return Math.round(n * 100);
}
function html(value) {
  return text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function planeRestEntwuerfe(input, { locationId } = {}) {
  if (!/^gid:\/\/shopify\/Location\/\d+$/.test(locationId ?? '')) throw new Error('Bestaetigter Shopify-Lagerort fehlt');
  if (!Array.isArray(input.records) || !input.records.length) throw new Error('Keine Vorbereitungspositionen');
  if (input.records.length > 1000) throw new Error('Hoechstens 1000 Positionen je Plan');
  const keys = new Set(), sumupIds = new Set();
  const products = [], metafields = [], relationships = [], preise = [];
  for (const row of input.records) {
    const key = text(row.tprBarcode).toLowerCase();
    if (!/^tpr\d{4,8}$/.test(key) || keys.has(key)) throw new Error('Vorbereitungsschluessel fehlt oder ist doppelt');
    if (!text(row.SumUpItemId) || sumupIds.has(row.SumUpItemId)) throw new Error('SumUp-Artikelkennung fehlt oder ist doppelt');
    keys.add(key); sumupIds.add(row.SumUpItemId);
    // Keine Laenge oder Menge aus einem Kassenkatalog ohne Bestandsfuehrung ableiten.
    if ([row.tatsaechlicheRestlaengeM, row.tatsaechlicheNutzbreiteCm, row.stueckzahlPhysisch].some(v => v != null)) {
      throw new Error(`${key}: echte Stueckdaten gehoeren in die separate gepruefte Bestandsaufnahme`);
    }
    const name = text(row.nameOriginal);
    const width = Number(row.bekannteRollenbreiteCm);
    if (!name || ![400, 500].includes(width)) throw new Error(`${key}: bestaetigte Nennbreite oder Artikelname fehlt`);
    const laden = cents(row.ladenPreisQm, 'Ladenpreis');
    const material = cents(row.onlineMaterialPreisQm, 'Online-Materialpreis');
    if (material !== laden + 500) throw new Error(`${key}: Preisregel Ladenpreis + 5 EUR/m² verletzt`);
    // Inhaber delegiert 23.10.: vorhandenes 0,01-m²-Format beibehalten;
    // nach 35 % Raummaß-Aufschlag auf volle EUR/m² runden. Kein Streichpreis.
    const massEuro = Math.round(material * 135 / 10000);
    const einheit = money(massEuro);
    const base = `restvorlage-${key}`;
    const handles = Object.fromEntries(ROLES.map(role => [role, `${base}-${role}`]));
    const owner = role => `${key}:${role}`;
    const tags = [REST_ENTWURF_TAG, 'sonderposten', 'ohne-muster', 'aufmass-fehlt', 'bilder-fehlen', 'freigabe-fehlt', `restvorlage:${key}`];
    const single = (price, sku, tracked) => ({
      optionValues: [{ optionName: 'Title', name: 'Default Title' }], price,
      sku, taxable: true, inventoryPolicy: 'DENY',
      inventoryItem: { tracked, requiresShipping: true },
      ...(tracked ? { inventoryQuantities: [{ locationId, name: 'available', quantity: 0 }] } : {}),
    });
    const source = {
      title: `${name} – Restposten, ${width} cm`, handle: handles.quelle,
      descriptionHtml: `<p>${html(name)} als Restposten aus unserem Ladenbestand.</p>`,
      productType: 'Teppichboden', vendor: text(row.vendor), status: 'DRAFT',
      category: 'gid://shopify/TaxonomyCategory/ha-2-5', templateSuffix: 'rolle',
      tags: [...tags, 'art: teppichboden', 'rest-rollenquelle'],
      productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
      variants: [single(money(material), `${key.toUpperCase()}-VOR-ROLLE`, true)],
    };
    products.push({ key: owner('quelle'), role: 'quelle', input: source });
    metafields.push(
      mf(owner('quelle'), 'custom', 'rollenbreite', 'number_decimal', (width / 100).toFixed(1)),
      mf(owner('quelle'), 'custom', 'max_roll_laenge_cm', 'number_integer', 0),
      { owner: owner('quelle'), namespace: 'service', key: 'einfass_gruppe', type: 'list.product_reference', targets: [owner('raummass'), owner('kettelteppich')] },
      { ...mf(owner('quelle'), 'custom', 'rollenbreite', 'number_decimal', (width / 100).toFixed(1)), ownerVariant: true },
      { ...mf(owner('quelle'), 'custom', 'farbcode', 'single_line_text_field', row.colourCodeOriginal), ownerVariant: true },
    );
    const step = 10000 / width; // eine Quelleinheit = 1 m² volle Rollenbreite
    const cuts = Array.from({ length: 1000 / step }, (_, i) => (i + 1) * step);
    const bundle = {
      title: `Zuschnitt von der Rolle – ${name}`, handle: handles.zuschnitt,
      productType: '', vendor: 'TeppichParadies', status: 'DRAFT', tags: [...tags, 'rest-zuschnitt'],
      productOptions: [{ name: 'Rollenlänge', values: cuts.map(cm => ({ name: `${cm} cm` })) }],
      variants: cuts.map(cm => ({
        optionValues: [{ optionName: 'Rollenlänge', name: `${cm} cm` }],
        price: einheit, sku: `${key.toUpperCase()}-VOR-ZS-${cm}`, taxable: true,
        inventoryPolicy: 'DENY', requiresComponents: true,
        inventoryItem: { tracked: true, requiresShipping: true },
      })),
    };
    products.push({ key: owner('zuschnitt'), role: 'zuschnitt', input: bundle });
    cuts.forEach(cm => relationships.push({ parent: owner('zuschnitt'), title: `${cm} cm`, component: owner('quelle'), quantity: cm / step, price: einheit }));
    for (const role of ['raummass', 'kettelteppich']) {
      const raum = role === 'raummass';
      const angebot = {
        title: `${name} – ${raum ? 'Raummaß' : 'Kettelteppich nach Maß'} – Restposten`,
        handle: handles[role], descriptionHtml: `<p>${raum ? 'Rechteckiger Zuschnitt ohne Einfassung' : 'Rechteckiger Teppich mit umlaufender Kettelung'} aus ${html(name)}.</p>`,
        productType: 'Teppich nach Maß', vendor: text(row.vendor), status: 'DRAFT',
        category: 'gid://shopify/TaxonomyCategory/ha-2-5', templateSuffix: 'einfassung',
        tags: [...tags, 'teppich-nach-mass', raum ? 'rest-raummass' : 'gekettelt'],
        productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
        variants: [single(einheit, `${key.toUpperCase()}-VOR-${raum ? 'RAUM' : 'KETTEL'}`, false)],
      };
      products.push({ key: owner(role), role, input: angebot });
      metafields.push(
        mf(owner(role), 'service', 'einfassung', 'single_line_text_field', raum ? 'Raummaß' : 'Ketteln'),
        mf(owner(role), 'service', 'max_breite_cm', 'number_integer', 0),
        mf(owner(role), 'service', 'max_laenge_cm', 'number_integer', 0),
        mf(owner(role), 'service', 'formen', 'list.single_line_text_field', '["Rechteck"]'),
        mf(owner(role), 'custom', 'preis_pro_001_qm', 'boolean', true),
        mf(owner(role), 'custom', 'rollenzuschnitt_richtung', 'single_line_text_field', 'laengs'),
        reference(owner(role), 'einfass_basis', owner('quelle')),
        { owner: owner(role), namespace: 'custom', key: 'zuschnitt_von_rolle', type: 'product_reference', target: owner('zuschnitt') },
        { ...reference(owner(role), 'basisvariante', owner('quelle'), true), ownerVariant: true },
        { owner: owner(role), namespace: 'service', key: 'einfass_gruppe', type: 'list.product_reference', targets: [owner('raummass'), owner('kettelteppich')] },
      );
      // service.einfassen wird absichtlich NICHT freigegeben. Erst nach Aufmass,
      // echtem Bestand, Bildern und fachlicher Pruefung gezielt aktivieren.
    }
    preise.push({ key, ladenQm: money(laden), materialQm: money(material), wunschmassQm: `${massEuro}.00`, kettelung: 'vorhandener Kettelservice zusaetzlich' });
  }
  return {
    schemaVersion: 1, products, metafields, relationships, preise,
    offen: ['Physische Stueckzahl und Kennung', 'Nutzbreite und Restlaenge', 'Zustand und Produktidentitaet', 'Echte Bilder', 'Versand/Packdaten und Bearbeitungszeit', 'Gezielte Daten-/Bestandsfreigabe und Veroeffentlichung'],
  };
}

export function bindeRestPlan(plan, liveProducts) {
  if (new Set(liveProducts.map(p => p.handle)).size !== liveProducts.length) throw new Error('Doppelte Handles im Readback');
  const byHandle = new Map(liveProducts.map(p => [p.handle, p]));
  const bound = new Map();
  for (const p of plan.products) {
    const live = byHandle.get(p.input.handle);
    if (!live || !GID.test(live.id) || live.status !== 'DRAFT' || !(live.tags ?? []).includes(REST_ENTWURF_TAG)) throw new Error(`${p.key}: gesperrter Entwurf nicht bestaetigt`);
    const variants = live.variants?.nodes ?? live.variants ?? [];
    if (variants.length !== p.input.variants.length) throw new Error(`${p.key}: Variantenzahl weicht ab`);
    if (variants.some(v => !Number.isSafeInteger(v.inventoryQuantity) || v.inventoryQuantity !== 0)) throw new Error(`${p.key}: Bestand 0 ist nicht bestaetigt`);
    if (live.variants?.pageInfo?.hasNextPage) throw new Error(`${p.key}: unvollstaendiger Varianten-Readback`);
    for (const v of variants) {
      const expected = p.input.variants.find(x => x.optionValues[0].name === v.title);
      if (!expected || v.price !== expected.price || v.inventoryPolicy !== 'DENY' || v.inventoryItem?.tracked !== expected.inventoryItem.tracked || v.requiresComponents !== Boolean(expected.requiresComponents)) throw new Error(`${p.key}: Preis oder Bestandsvertrag weicht ab`);
    }
    if (live.publishedAt || live.resourcePublications?.nodes?.some(x => x.isPublished)) throw new Error(`${p.key}: Entwurf ist veroeffentlicht`);
    bound.set(p.key, { ...live, variants });
  }
  const get = (key, variant = false) => {
    const p = bound.get(key);
    const id = variant ? p?.variants?.[0]?.id : p?.id;
    if (!GID.test(id ?? '')) throw new Error(`${key}: Referenz fehlt`);
    return id;
  };
  const expectedMetafields = plan.metafields.map(m => ({
    ownerId: get(m.owner, m.ownerVariant), namespace: m.namespace, key: m.key, type: m.type,
    value: m.targets ? JSON.stringify(m.targets.map(k => get(k))) : m.target ? get(m.target, m.targetVariant) : m.value,
    compareDigest: null,
  }));
  const owners = new Map([...bound.values()].flatMap(p => [[p.id, p], ...p.variants.map(v => [v.id, v])]));
  const metafields = expectedMetafields.filter(m => {
    const old = owners.get(m.ownerId)?.metafields?.nodes?.find(x => x.namespace === m.namespace && x.key === m.key);
    if (!old) return true;
    if (old.value !== m.value || old.type !== m.type) throw new Error(`${m.ownerId}: vorhandener Wert ${m.namespace}.${m.key} weicht ab`);
    return false;
  });
  const relationships = plan.relationships.map(r => {
    const parent = bound.get(r.parent).variants.find(v => v.title === r.title);
    if (!parent || !Number.isInteger(r.quantity) || r.quantity <= 0) throw new Error('Gueltige positive Bundle-Komponente fehlt');
    const current = parent.productVariantComponents?.nodes ?? [];
    if (current.length) {
      if (current.length !== 1 || current[0].productVariant?.id !== get(r.component, true) || current[0].quantity !== r.quantity || parent.price !== r.price) throw new Error(`${parent.id}: vorhandene Bundle-Zuordnung weicht ab`);
      return null;
    }
    return {
      parentProductVariantId: parent.id,
      priceInput: { calculation: 'FIXED', price: r.price },
      productVariantRelationshipsToCreate: [{ id: get(r.component, true), quantity: r.quantity }],
    };
  }).filter(Boolean);
  return { metafields, expectedMetafields, relationships, rollback: metafields.map(m => ({ ownerId: m.ownerId, namespace: m.namespace, key: m.key, vorher: null })), products: [...bound.values()].map(p => ({ id: p.id, handle: p.handle })) };
}

export function pruefeRestReadback(plan, products) {
  const bound = bindeRestPlan(plan, products);
  if (bound.metafields.length || bound.relationships.length) throw new Error(`Readback unvollstaendig: ${bound.metafields.length} Metafelder, ${bound.relationships.length} Komponenten fehlen`);
  return { products: products.length, variants: products.reduce((n, p) => n + (p.variants?.nodes ?? p.variants).length, 0), metafields: bound.expectedMetafields.length, components: plan.relationships.length, draft: true, unpublished: true, inventoryZero: true };
}
