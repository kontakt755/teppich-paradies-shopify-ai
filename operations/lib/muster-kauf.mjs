/**
 * Muster -> Kauf (Fehlersuche 2026-10-28, Idee 17) - reine Funktionen, nur lesend.
 *
 * Frage: Wie viele Kunden, die ein Muster bestellt haben, kaufen danach Ware -
 * und das je Warengruppe des Musters?
 *
 * Regeln:
 * - Musterbestellung: Bestellung, die NUR aus Mustern besteht
 *   (istNurMusterBestellung, operations/lib/muster.mjs). Ware mit beigelegtem
 *   Muster ist schon ein Kauf und zaehlt hier nicht als Musterbestellung.
 * - Warenkauf: nicht stornierte Bestellung, keine Testbestellung
 *   (operations/lib/testbestellung.mjs), mit mindestens einer Position, die
 *   kein Muster und kein Service ist und nach Rabatten mehr als 0 kostet.
 * - Kunde: Shopify-Kundenkennung, sonst die E-Mail (klein). Bestellungen ohne
 *   beides lassen sich keinem Kunden zuordnen und bleiben draussen.
 * - Je Kunde zaehlt die ERSTE Musterbestellung im Zeitraum. Kauf heisst: eine
 *   Warenbestellung nach dieser Musterbestellung, hoechstens `nachTagen` spaeter.
 * - Reif ist eine Musterbestellung, deren Fenster schon ganz vorbei ist. Die
 *   Quote wird nur ueber reife Musterkunden gerechnet; juengere stehen als
 *   "Fenster offen" daneben (ein Kauf dort zaehlt trotzdem schon).
 * - Warengruppe des Musters: aus Titel und Angaben der Musterposition (Wortliste
 *   unten), die Gruppe des Kaufs aus der Produktart der gekauften Ware.
 */
import { istMusterPosition, istNurMusterBestellung } from './muster.mjs';
import { istTestbestellung } from './testbestellung.mjs';

const TAG_MS = 24 * 60 * 60 * 1000;

/** Reihenfolge zaehlt: "Teppich nach Mass" vor "Teppichboden" vor "Teppich". */
const GRUPPEN = [
  ['Teppich nach Maß', /nach ma(ß|ss)|kettelteppich/],
  ['Läufer', /l(ä|ae)ufer/],
  ['Teppichboden', /teppichboden|auslegware|teppichfliese/],
  ['Vinyl', /vinyl|pvc|designboden|linoleum/],
  ['Sockelleisten', /leiste/],
  ['Teppiche', /teppich/],
];

export function warengruppe(text) {
  const t = String(text ?? '').toLowerCase();
  for (const [name, re] of GRUPPEN) if (re.test(t)) return name;
  return 'Sonstiges';
}

const attr = (p, key) => (p.customAttributes ?? []).find((a) => a.key === key)?.value ?? '';

export function position(li) {
  return {
    sku: li.sku ?? li.variant?.sku ?? null,
    musterId: attr(li, '_Muster_ID') || null,
    produktTyp: li.variant?.product?.productType ?? null,
    titel: li.title ?? '',
    variante: li.variantTitle ?? '',
    produkt: attr(li, 'Produkt') || attr(li, '_Quellprodukt'),
    betrag: Number(li.priceAfterAllDiscountsBeforeTaxesSet?.shopMoney?.amount ?? li.originalUnitPriceSet?.shopMoney?.amount ?? 0),
  };
}

function positionen(order) {
  const li = Array.isArray(order.lineItems) ? order.lineItems : order.lineItems?.nodes ?? [];
  return li.map(position);
}

export function kundeSchluessel(order) {
  if (order.customer?.id) return `id:${order.customer.id}`;
  const mail = String(order.email ?? order.customer?.email ?? '').trim().toLowerCase();
  return mail ? `mail:${mail}` : null;
}

function istWarenPosition(p) {
  if (istMusterPosition(p)) return false;
  if (String(p.produktTyp ?? '').toLowerCase() === 'service') return false;
  return p.betrag > 0;
}

/**
 * @param {object[]} orders  Admin-API-Bestellungen (operations/sync/orders.mjs)
 * @param {object}   o
 * @param {number}   o.tage       Musterbestellungen der letzten N Tage (Standard 90)
 * @param {number}   o.nachTagen  Kauffenster nach dem Muster (Standard 30)
 * @param {number}   o.jetzt      Zeitpunkt in ms (Standard Date.now())
 */
export function musterKauf(orders = [], { tage = 90, nachTagen = 30, jetzt = Date.now() } = {}) {
  const von = jetzt - tage * TAG_MS;
  const gueltig = orders.filter((o) => !o.cancelledAt && !istTestbestellung(o));
  const muster = new Map(); // Kunde -> erste Musterbestellung im Zeitraum
  const waren = new Map(); // Kunde -> Warenbestellungen
  let ohneKunde = 0;
  for (const o of gueltig) {
    const zeit = Date.parse(o.createdAt);
    const pos = positionen(o);
    const kunde = kundeSchluessel(o);
    const istMuster = istNurMusterBestellung(pos);
    const ware = pos.filter(istWarenPosition);
    if (!kunde) { if (istMuster && zeit >= von) ohneKunde += 1; continue; }
    if (istMuster && zeit >= von && zeit <= jetzt) {
      const bisher = muster.get(kunde);
      if (!bisher || zeit < bisher.zeit) {
        const text = pos.map((p) => `${p.titel} ${p.produkt}`).join(' ');
        muster.set(kunde, { zeit, gruppe: warengruppe(text), name: o.name });
      }
    }
    if (ware.length) {
      if (!waren.has(kunde)) waren.set(kunde, []);
      waren.get(kunde).push({ zeit, gruppen: [...new Set(ware.map((p) => p.produktTyp || 'ohne Produktart'))], betrag: ware.reduce((s, p) => s + p.betrag, 0) });
    }
  }

  const gruppen = {};
  const leer = () => ({ musterkunden: 0, reif: 0, kaufReif: 0, fensterOffen: 0, kaufOffen: 0, tageBisKauf: [], gekauft: {} });
  const summe = leer();
  for (const [kunde, m] of muster) {
    const g = (gruppen[m.gruppe] ??= leer());
    const kauf = (waren.get(kunde) ?? [])
      .filter((w) => w.zeit > m.zeit && w.zeit <= m.zeit + nachTagen * TAG_MS)
      .sort((a, b) => a.zeit - b.zeit)[0];
    const reif = m.zeit + nachTagen * TAG_MS <= jetzt;
    for (const z of [g, summe]) {
      z.musterkunden += 1;
      if (reif) z.reif += 1; else z.fensterOffen += 1;
      if (kauf) {
        if (reif) z.kaufReif += 1; else z.kaufOffen += 1;
        z.tageBisKauf.push(Math.round((kauf.zeit - m.zeit) / TAG_MS));
        for (const k of kauf.gruppen) z.gekauft[k] = (z.gekauft[k] ?? 0) + 1;
      }
    }
  }
  const fertig = (z) => ({
    ...z,
    quote: z.reif ? Math.round((z.kaufReif / z.reif) * 1000) / 10 : null,
    medianTage: median(z.tageBisKauf),
  });
  return {
    zeitraum: { von: new Date(von).toISOString(), bis: new Date(jetzt).toISOString(), tage, nachTagen },
    bestellungen: { geprueft: orders.length, gezaehlt: gueltig.length, musterOhneKunde: ohneKunde },
    gesamt: fertig(summe),
    gruppen: Object.fromEntries(Object.entries(gruppen).sort((a, b) => b[1].musterkunden - a[1].musterkunden).map(([k, v]) => [k, fertig(v)])),
  };
}

function median(liste) {
  if (!liste.length) return null;
  const s = [...liste].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
