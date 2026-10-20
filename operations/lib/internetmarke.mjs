/**
 * Briefmarken fuer Musterversand ueber die INTERNETMARKE-API der Deutschen Post
 * (REST, developer.dhl.com "Post & Parcel Germany"). Braucht kein DHL-Geschaeftskundenkonto,
 * nur eine Portokasse plus freigeschaltete Geschaeftsanwendung (Werkbank, Inhaber 2026-10-20).
 *
 * Musterbestellungen gehen als Brief raus, weil das am guenstigsten ist (Inhaber 2026-10-20:
 * "das guenstigste"). A5-Muster passen in Gross- oder Maxibrief:
 *   Grossbrief  (Code 21): bis 500 g, 2 cm dick  - 1,80 EUR (Preisstand 2025/2026)
 *   Maxibrief   (Code 31): bis 1000 g, 5 cm dick - 2,90 EUR
 * Briefe haben keine Sendungsverfolgung: die Buchung in Shopify laeuft ohne Sendungsnummer.
 * Ab 2027-01-01 aendert die Post die Formate - dann PRODUKTE pruefen.
 *
 * Modus "trocken" (Standard, solange keine Zugangsdaten in .env stehen): alle Anfragen werden
 * gebaut und geprueft, aber nichts verschickt und nichts gekauft. Echte Kaeufe nur mit
 * INTERNETMARKE_MODUS=echt.
 */

export const API_BASIS = 'https://api-eu.dhl.com/post/de/shipping/im/v1/';

export const PRODUKTE = Object.freeze({
  grossbrief: Object.freeze({ code: 21, name: 'Großbrief', centPreis: 180, maxGramm: 500, maxDickeMm: 20 }),
  maxibrief: Object.freeze({ code: 31, name: 'Maxibrief', centPreis: 290, maxGramm: 1000, maxDickeMm: 50 }),
});

/** Gewicht und Dicke je A5-Muster - grobe Annahme, bis der Innendienst nachwiegt. */
export const MUSTER_SCHAETZUNG = Object.freeze({ gramm: 60, dickeMm: 8, umschlagGramm: 20 });

export class InternetmarkeFehler extends Error {
  constructor(message, { status = null, antwort = null } = {}) {
    super(message);
    this.name = 'InternetmarkeFehler';
    this.status = status;
    this.antwort = antwort;
  }
}

/**
 * Guenstigstes Briefprodukt fuer eine Anzahl Muster. Passt es nicht in einen Maxibrief,
 * kommt null zurueck - dann geht es als Paeckchen von Hand.
 */
export function waehleProdukt(anzahlMuster, schaetzung = MUSTER_SCHAETZUNG) {
  const n = Math.max(1, Math.floor(Number(anzahlMuster) || 0));
  const gramm = n * schaetzung.gramm + schaetzung.umschlagGramm;
  const dickeMm = n * schaetzung.dickeMm;
  for (const p of [PRODUKTE.grossbrief, PRODUKTE.maxibrief]) {
    if (gramm <= p.maxGramm && dickeMm <= p.maxDickeMm) return { ...p, gramm, dickeMm };
  }
  return null;
}

const ISO3 = { DE: 'DEU', AT: 'AUT', CH: 'CHE' };

/** Shopify-Lieferadresse -> Adresse der INTERNETMARKE. Nur Inland, sonst Fehler. */
export function empfaengerAusShopify(a) {
  if (!a) throw new InternetmarkeFehler('Bestellung hat keine Lieferadresse.');
  const land = a.countryCodeV2 ?? a.countryCode ?? 'DE';
  if (land !== 'DE') throw new InternetmarkeFehler(`Lieferadresse in ${land}: Musterbrief nur innerhalb Deutschlands.`);
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim() || a.name;
  const pflicht = { name, addressLine1: a.address1, postalCode: a.zip, city: a.city };
  const fehlt = Object.entries(pflicht).filter(([, v]) => !String(v ?? '').trim()).map(([k]) => k);
  if (fehlt.length) throw new InternetmarkeFehler(`Lieferadresse unvollstaendig: ${fehlt.join(', ')}.`);
  return adresse({ ...pflicht, additionalName: a.company, addressLine2: a.address2, country: ISO3[land] });
}

/** Absender aus der Umgebung (.env), damit keine Firmenadresse im Code steht. */
export function absenderAusEnv(env = process.env) {
  const a = {
    name: env.INTERNETMARKE_ABSENDER_NAME,
    addressLine1: env.INTERNETMARKE_ABSENDER_STRASSE,
    postalCode: env.INTERNETMARKE_ABSENDER_PLZ,
    city: env.INTERNETMARKE_ABSENDER_ORT,
  };
  const fehlt = Object.entries(a).filter(([, v]) => !String(v ?? '').trim()).map(([k]) => k);
  if (fehlt.length) throw new InternetmarkeFehler(`Absender fehlt in .env: ${fehlt.join(', ')}.`);
  return adresse(a);
}

function adresse({ name, additionalName, addressLine1, addressLine2, postalCode, city, country = 'DEU' }) {
  const out = { name: String(name).slice(0, 50), addressLine1, postalCode: String(postalCode), city, country };
  if (additionalName) out.additionalName = additionalName;
  if (addressLine2) out.addressLine2 = addressLine2;
  return out;
}

/** Anfrage fuer den PDF-Checkout: eine Marke je Position, Adresse im Markenfeld. */
export function pdfAnfrage({ shopOrderId, pageFormatId, positionen }) {
  if (!positionen?.length) throw new InternetmarkeFehler('Keine Marke zu kaufen.');
  return {
    type: 'AppShoppingCartPDFRequest',
    shopOrderId: String(shopOrderId),
    pageFormatId: Number(pageFormatId),
    positions: positionen.map((p, i) => ({
      positionType: 'AppShoppingCartPDFPosition',
      productCode: p.produkt.code,
      voucherLayout: 'ADDRESS_ZONE',
      position: { labelX: 1, labelY: 1, page: i + 1 },
      address: { sender: p.absender, receiver: p.empfaenger },
    })),
    // Die Post prueft die Summe gegen ihre Preisliste - stimmt sie nicht, wird nichts gekauft.
    total: positionen.reduce((s, p) => s + p.produkt.centPreis, 0),
  };
}

/** Zugang aus .env; ohne alles -> trocken. Echt nur ausdruecklich. */
export function zugangAusEnv(env = process.env) {
  const z = {
    clientId: env.INTERNETMARKE_CLIENT_ID,
    clientSecret: env.INTERNETMARKE_CLIENT_SECRET,
    benutzer: env.INTERNETMARKE_PORTOKASSE_BENUTZER,
    passwort: env.INTERNETMARKE_PORTOKASSE_PASSWORT,
    pageFormatId: Number(env.INTERNETMARKE_SEITENFORMAT ?? 0) || null,
  };
  const vollstaendig = Boolean(z.clientId && z.clientSecret && z.benutzer && z.passwort && z.pageFormatId);
  const modus = env.INTERNETMARKE_MODUS === 'echt' && vollstaendig ? 'echt' : 'trocken';
  return { ...z, modus, vollstaendig };
}

/**
 * Marken kaufen. `fetchFn` ist austauschbar (Tests). Im Modus trocken wird nur die Anfrage
 * gebaut und zurueckgegeben - kein Netz, kein Geld.
 * @returns {{ modus, anfrage, pdfLink?, marken?: {voucherId, trackId}[], guthabenCent? }}
 */
export async function kaufeMarken(zugang, positionen, { fetchFn = fetch, basis = API_BASIS } = {}) {
  const vorlaeufig = pdfAnfrage({ shopOrderId: 'TROCKEN', pageFormatId: zugang.pageFormatId ?? 1, positionen });
  if (zugang.modus !== 'echt') return { modus: 'trocken', anfrage: vorlaeufig };

  const json = async (antwort, was) => {
    const text = await antwort.text();
    let daten = null;
    try { daten = text ? JSON.parse(text) : null; } catch { /* Text bleibt fuer die Meldung */ }
    if (!antwort.ok) throw new InternetmarkeFehler(`${was}: HTTP ${antwort.status}`, { status: antwort.status, antwort: daten ?? text.slice(0, 500) });
    return daten;
  };

  const login = await json(await fetchFn(`${basis}user`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: zugang.clientId, client_secret: zugang.clientSecret, username: zugang.benutzer, password: zugang.passwort }),
  }), 'Anmeldung Portokasse');
  const auth = { authorization: `Bearer ${login.access_token}`, 'content-type': 'application/json' };

  if (Number.isFinite(login.walletBalance) && login.walletBalance < vorlaeufig.total) {
    throw new InternetmarkeFehler(`Portokasse reicht nicht: ${login.walletBalance} Cent, gebraucht ${vorlaeufig.total} Cent.`);
  }

  const korb = await json(await fetchFn(`${basis}app/shoppingcart`, { method: 'POST', headers: auth }), 'Warenkorb anlegen');
  const anfrage = pdfAnfrage({ shopOrderId: korb.shopOrderId, pageFormatId: zugang.pageFormatId, positionen });
  const kauf = await json(await fetchFn(`${basis}app/shoppingcart/pdf`, { method: 'POST', headers: auth, body: JSON.stringify(anfrage) }), 'Marken kaufen');

  return {
    modus: 'echt',
    anfrage,
    pdfLink: kauf.link,
    marken: (kauf.shoppingCart?.voucherList ?? []).map(v => ({ voucherId: v.voucherId, trackId: v.trackId ?? null })),
    // Die API schreibt das Feld so ("walletBallance").
    guthabenCent: kauf.walletBallance ?? kauf.walletBalance ?? null,
  };
}
