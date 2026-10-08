// Tag-Abgleich fuer die Kollektion "Angebote" (Smart-Regel: Tag = angebot).
// Konzept: docs/weiterentwicklung/angebote.md.
//
// Die Regel ist dieselbe wie im Theme - beide aendern sich nur gemeinsam:
//   snippets/tp-angebot-sichtbar.liquid
//     = tp-rabatt-sichtbar ("ja") UND angezeigte Variante mit compare_at > price
//       ODER tp-aktion-laufend (zentrale Aktion aus Metaobjekt tp_aktion)
//   snippets/tp-rabatt-sichtbar.liquid
//     = Dauerrabatt (aktion.klasse = preisanker, bis aktion.ende)
//       ODER befristete Aktion (tp-aktion-aktiv: aktion.start <= heute <= aktion.ende)
//       Rollenware mit Raummass: nur wenn alle regulaeren Varianten reduziert sind.
//   Sonderposten sind nie ein Angebot.
// "Heute" ist der Kalendertag in Europe/Berlin, wie im Shop (Zeitzone des Shops).

export const TAG = 'angebot';

/** JJJJ-MM-TT in Europe/Berlin. */
export function heuteBerlin(jetzt = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}

const tag = (wert) => (wert ? String(wert).slice(0, 10) : '');
const geld = (wert) => (wert == null || wert === '' ? null : Number(wert));

/** snippets/tp-aktion-aktiv.liquid */
export function aktionAktiv(mf, heute) {
  const start = tag(mf?.aktion_start);
  if (!start) return false;
  const ende = tag(mf?.aktion_ende) || '9999-12-31';
  return start <= heute && heute <= ende;
}

/** snippets/tp-rabatt-sichtbar.liquid (ohne Sonderposten-Weg, der hier nie zaehlt). */
export function rabattSichtbar(produkt, heute) {
  const mf = produkt.mf ?? {};
  let aktiv = false;
  if (mf.aktion_klasse === 'preisanker') {
    const ende = tag(mf.aktion_ende);
    aktiv = !ende || heute <= ende;
  } else {
    aktiv = aktionAktiv(mf, heute);
  }
  if (!aktiv) return false;
  let roll = false;
  let raum = false;
  let alleReduziert = true;
  for (const v of produkt.varianten ?? []) {
    if (String(v.titel ?? '').toLowerCase().includes('opc-')) continue;
    const optionen = ` ${(v.optionen ?? []).join(' ')}`.toLowerCase();
    if (optionen.includes('wunschmaß') || optionen.includes('wunschmass')) raum = true;
    else if (optionen.includes(' cm')) roll = true;
    else continue;
    const preis = geld(v.preis);
    const vergleich = geld(v.vergleichspreis);
    // Wie Liquid: "compare_at_price <= price" ist bei fehlendem Vergleichspreis
    // (nil) falsch - eine Variante ohne Vergleichspreis kippt die Regel also nicht.
    if (vergleich != null && vergleich <= preis) alleReduziert = false;
  }
  return roll && raum ? alleReduziert : true;
}

/** Die Variante, die der Shop zeigt: erste kaufbare, sonst erste. */
export function angezeigteVariante(produkt) {
  const v = produkt.varianten ?? [];
  return v.find((x) => x.kaufbar) ?? v[0] ?? null;
}

/** snippets/tp-aktion-laufend.liquid: laeuft eine zentrale Aktion fuer eine Kollektion des Produkts? */
export function aktionLaufend(produkt, aktionen, heute) {
  const kollektionen = new Set(produkt.kollektionen ?? []);
  return (aktionen ?? []).some((a) => a.aktiv === true
    && tag(a.start) && tag(a.ende) && tag(a.start) <= heute && heute <= tag(a.ende)
    && a.kollektion && kollektionen.has(a.kollektion)
    && Number(a.prozent) > 0);
}

/** snippets/tp-angebot-sichtbar.liquid */
export function istAngebot(produkt, { heute, aktionen = [] } = {}) {
  if (produkt.typ === 'Sonderposten') return false;
  const v = angezeigteVariante(produkt);
  if (rabattSichtbar(produkt, heute) && v && geld(v.vergleichspreis) > geld(v.preis)) return true;
  return aktionLaufend(produkt, aktionen, heute);
}

/** Was zu tun ist: Tag setzen, wo ein Angebot ohne Tag ist, entfernen, wo der Tag ohne Angebot steht. */
export function plan(produkte, { heute, aktionen = [] } = {}) {
  const setzen = [];
  const entfernen = [];
  for (const p of produkte ?? []) {
    const hat = (p.tags ?? []).includes(TAG);
    const soll = istAngebot(p, { heute, aktionen });
    if (soll && !hat) setzen.push(p);
    if (!soll && hat) entfernen.push(p);
  }
  return { setzen, entfernen, angebote: (produkte ?? []).filter((p) => istAngebot(p, { heute, aktionen })).length };
}

/** Admin-API-Knoten -> internes Produktmodell. */
export function ausAdminKnoten(n) {
  return {
    id: n.id,
    handle: n.handle,
    titel: n.title,
    typ: n.productType ?? '',
    tags: n.tags ?? [],
    kollektionen: (n.collections?.nodes ?? []).map((c) => c.id),
    mf: {
      aktion_start: n.aStart?.value ?? '',
      aktion_ende: n.aEnde?.value ?? '',
      aktion_klasse: n.aKlasse?.value ?? '',
    },
    varianten: (n.variants?.nodes ?? []).map((v) => ({
      titel: v.title,
      optionen: (v.selectedOptions ?? []).map((o) => o.value),
      preis: v.price,
      vergleichspreis: v.compareAtPrice,
      kaufbar: v.availableForSale,
    })),
  };
}

/** Metaobjekt tp_aktion (Admin API, fields[]) -> {aktiv,start,ende,kollektion,prozent}. */
export function aktionAusMetaobjekt(m) {
  const f = Object.fromEntries((m.fields ?? []).map((x) => [x.key, x.value]));
  return { aktiv: f.aktiv === 'true', start: f.start ?? '', ende: f.ende ?? '', kollektion: f.kollektion ?? '', prozent: Number(f.prozent ?? 0) };
}
