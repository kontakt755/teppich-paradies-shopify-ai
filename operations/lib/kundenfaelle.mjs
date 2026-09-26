/**
 * Faelle je Kunde: alles, was zu einem Kunden offen ist, in einem Eintrag.
 *
 * Das Control Center fuehrte die Arbeit bisher nach Art der Aufgabe getrennt -
 * Bestellungen hier, Rueckrufe dort, Angebote und liegengebliebene Warenkoerbe
 * woanders. Im Laden denkt aber niemand in Aufgabenarten, sondern in Kunden:
 * "Wer wartet auf was, und was mache ich als Naechstes?"
 *
 * Diese Datei fuehrt die vorhandenen Quellen zusammen. Sie erfindet nichts:
 * jeder Punkt nennt seine Quelle, und wo eine Angabe fehlt (etwa eine
 * Telefonnummer), steht das als Einschraenkung im Schritt selbst.
 */

/** Dringlichkeit: kleiner = weiter oben. */
export const DRINGEND = Object.freeze({ SOFORT: 0, BALD: 1, NORMAL: 2 });

const TAG_MS = 24 * 60 * 60 * 1000;

function tageSeit(iso, jetzt) {
  if (!iso) return null;
  const t = Math.floor((jetzt.getTime() - new Date(iso).getTime()) / TAG_MS);
  return Number.isFinite(t) ? t : null;
}

/**
 * Gruppenschluessel. Ohne Kontakt und ohne Namen darf nicht gruppiert werden -
 * sonst landen fremde Vorgaenge unter einem Sammeleintrag "ohne Namen" und
 * sehen aus wie ein einziger Kunde. Dann traegt der Vorgang selbst den
 * Schluessel (`vorgang` vom Aufrufer).
 */
function schluessel(kunde) {
  if (kunde?.schluessel) return kunde.schluessel;
  if (kunde?.email) return `email:${String(kunde.email).toLowerCase()}`;
  if (kunde?.telefon) return `tel:${String(kunde.telefon).replace(/[^0-9+]/g, '')}`;
  if (kunde?.name) return `name:${String(kunde.name).toLowerCase()}`;
  return `vorgang:${kunde?.vorgang ?? Math.random().toString(36).slice(2)}`;
}

/** Liste der Produkte, die der Kunde moechte - in der Sprache des Kunden, nicht in SKUs. */
function moechte(positionen) {
  const teile = [];
  for (const p of positionen ?? []) {
    const menge = p.kundenmenge || (p.menge ? `${p.menge}×` : '');
    const farbe = p.farbe && p.farbe !== '–' ? ` (${p.farbe})` : '';
    teile.push(`${menge ? `${menge} ` : ''}${p.titel}${farbe}`.trim());
  }
  return teile;
}

/**
 * Was ist als Naechstes zu tun? Genau ein Satz, der eine Handlung benennt -
 * und, wo etwas fehlt, warum sie gerade nicht geht.
 */
export function naechsterSchritt(zeile, { jetzt = new Date() } = {}) {
  const alter = tageSeit(zeile.datum, jetzt) ?? 0;
  const bezahlt = zeile.zahlungsstatus === 'PAID';
  const unversandt = ['UNFULFILLED', 'PARTIALLY_FULFILLED', null].includes(zeile.fulfillmentstatus);
  const offeneArtikel = (zeile.auftrag?.positionen ?? []).filter(p => p.lineItemId);

  // Ein abgeschlossener Rueckruf ist erledigt, auch wenn das Bestell-Tag
  // weiterhin "Beratung: Ja" sagt.
  if (zeile.beratungOffen && zeile.rueckrufStatus !== 'erledigt') {
    return zeile.telefon
      ? { text: 'Zurückrufen – Beratung gewünscht', dringend: DRINGEND.SOFORT, art: 'beratung' }
      : { text: 'Beratung gewünscht, aber keine Telefonnummer hinterlegt – per E-Mail melden', dringend: DRINGEND.SOFORT, art: 'beratung' };
  }
  if (bezahlt && unversandt && zeile.fortschritt?.stufe !== 'erledigt') {
    const eilig = alter >= 3;
    return {
      text: offeneArtikel.length && zeile.fortschritt?.stufe === 'offen'
        ? 'Beim Lieferanten bestellen – bezahlt, noch nichts bestellt'
        : 'Versenden – bezahlt, noch nicht raus',
      dringend: eilig ? DRINGEND.SOFORT : DRINGEND.BALD,
      art: 'versand',
    };
  }
  if (zeile.wasFehlt?.length) {
    return { text: zeile.wasFehlt.join(' · '), dringend: DRINGEND.BALD, art: 'offen' };
  }
  return { text: 'Nichts offen', dringend: DRINGEND.NORMAL, art: 'fertig' };
}

/**
 * Baut die Fallliste.
 * @param {object} quellen  {bestellzeilen, angebote, warenkoerbe}
 */
/**
 * Adressen, die nach RFC 2606 fuer Beispiele und Tests reserviert sind. Wer
 * eine davon benutzt, ist mit Sicherheit kein Kunde. Bewusst NUR diese:
 * eine Regel, die auf "test" im Namen anschlaegt, wuerde irgendwann eine Frau
 * Testorf aus der Arbeitsliste werfen, und das faellt niemandem auf.
 *
 * Alles andere - eigene Wegwerfadressen, Probekaeufe unter echtem Namen -
 * markiert der Mensch von Hand (operations/lib/fallmarken.mjs). Lieber einmal
 * klicken als raten.
 */
const RESERVIERTE_DOMAeNEN = /@(?:[^@\s]*\.)?(?:example\.(?:com|net|org)|(?:[^@\s.]+\.)?(?:test|invalid|localhost))$/i;

/** Offensichtliche Testadresse? Nur an der Domaene, nie am Namen. */
export function istTestkontakt({ email = null } = {}) {
  return Boolean(email && RESERVIERTE_DOMAeNEN.test(String(email).trim()));
}

export function faelle(quellen = {}, opt = {}) {
  const jetzt = opt.jetzt ?? new Date();
  const map = new Map();

  const hole = (kunde) => {
    const key = schluessel(kunde);
    if (!map.has(key)) {
      map.set(key, {
        schluessel: key,
        name: kunde?.name || 'ohne Namen',
        email: kunde?.email || null,
        telefon: kunde?.telefon || null,
        ort: kunde?.ort || null,
        punkte: [],
      });
    }
    const eintrag = map.get(key);
    // Kontaktdaten aus der jeweils besseren Quelle nachtragen
    if (!eintrag.email && kunde?.email) eintrag.email = kunde.email;
    if (!eintrag.telefon && kunde?.telefon) eintrag.telefon = kunde.telefon;
    if (!eintrag.ort && kunde?.ort) eintrag.ort = kunde.ort;
    return eintrag;
  };

  for (const z of quellen.bestellzeilen ?? []) {
    if (z.testbestellung || z.storniert) continue;
    const schritt = naechsterSchritt(z, { jetzt });
    if (schritt.art === 'fertig') continue;
    hole({ schluessel: z.kundenSchluessel, name: z.kundenname, email: z.email, telefon: z.telefon })
      .punkte.push({
        quelle: 'bestellung',
        bezug: z.orderName,
        datum: z.datum,
        tage: tageSeit(z.datum, jetzt),
        moechte: moechte(z.auftrag?.positionen),
        produkte: (z.auftrag?.positionen ?? []).map(p => ({ titel: p.titel, handle: p.handle || null })),
        betrag: z.gesamtbetrag ?? null,
        waehrung: z.waehrung || 'EUR',
        schritt,
        adminUrl: z.adminUrl || null,
      });
  }

  for (const a of quellen.angebote ?? []) {
    if (!['OPEN', 'INVOICE_SENT'].includes(a.status)) continue;
    hole({ name: a.kunde, email: a.email, telefon: a.telefon, vorgang: a.id || a.nummer })
      .punkte.push({
        quelle: 'angebot',
        bezug: a.nummer,
        datum: a.erstelltAm,
        tage: tageSeit(a.erstelltAm, jetzt),
        moechte: moechte(a.positionen),
        produkte: (a.positionen ?? []).map(p => ({ titel: p.titel, handle: null })),
        betrag: a.betrag ?? null,
        waehrung: a.waehrung || 'EUR',
        schritt: { text: 'Angebot nachfassen – noch nicht bezahlt', dringend: (tageSeit(a.erstelltAm, jetzt) ?? 0) >= 14 ? DRINGEND.SOFORT : DRINGEND.BALD, art: 'angebot' },
        adminUrl: a.rechnungUrl || null,
      });
  }

  for (const w of quellen.warenkoerbe ?? []) {
    const kontakt = Boolean(w.email || w.telefon);
    // Ohne Kontakt kann niemand etwas tun - solche Warenkoerbe stehen
    // vollstaendig unter "Liegengeblieben", aber nicht in der Arbeitsliste.
    if (!kontakt) continue;
    hole({ name: w.kunde, email: w.email, telefon: w.telefon, ort: w.ort, vorgang: w.id })
      .punkte.push({
        quelle: 'warenkorb',
        bezug: null,
        datum: w.zeitpunkt,
        tage: tageSeit(w.zeitpunkt, jetzt),
        moechte: moechte(w.positionen),
        produkte: (w.positionen ?? []).map(p => ({ titel: p.titel, handle: null })),
        betrag: w.wert ?? null,
        waehrung: w.waehrung || 'EUR',
        schritt: { text: 'Ansprechen – Kauf abgebrochen', dringend: DRINGEND.NORMAL, art: 'warenkorb' },
        adminUrl: w.wiederhergestelltUrl || null,
      });
  }

  const liste = [...map.values()].filter(k => k.punkte.length);
  for (const k of liste) {
    // Reservierte Domaene = sicher kein Kunde. Der Fall wird nicht
    // weggeworfen, sondern markiert - die Oberflaeche blendet ihn aus und
    // zeigt ihn auf Wunsch trotzdem.
    k.testkontakt = istTestkontakt(k);
    k.punkte.sort((a, b) => a.schritt.dringend - b.schritt.dringend || (b.tage ?? 0) - (a.tage ?? 0));
    k.dringend = Math.min(...k.punkte.map(p => p.schritt.dringend));
    k.aeltesteTage = Math.max(...k.punkte.map(p => p.tage ?? 0));
    k.summe = k.punkte.reduce((s, p) => s + (Number(p.betrag) || 0), 0);
  }
  // Dringendstes zuerst, bei gleicher Stufe das aelteste - so arbeitet man eine
  // Liste von oben nach unten ab, ohne selbst zu priorisieren.
  liste.sort((a, b) => a.dringend - b.dringend || b.aeltesteTage - a.aeltesteTage);
  return {
    erstellt: jetzt.toISOString(),
    anzahl: liste.length,
    sofort: liste.filter(k => k.dringend === DRINGEND.SOFORT).length,
    faelle: liste,
  };
}
