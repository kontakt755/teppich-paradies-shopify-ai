/**
 * "Muster nachfassen" fuer die Startseite "Heute" (Inhaberentscheidung 2026-10-10: der Verkauf
 * im Laden fasst nach, wer montags im Laden ist).
 *
 * Nichts wird hier erfasst: die Liste ergibt sich aus den Bestellzeilen von
 * /api/kunden/bestellungen samt Zeitleiste (operations/lib/auftragsverlauf.mjs). "Erledigt"
 * ist der vorhandene Zeitleisten-Schritt "nachgefasst" - er traegt wer und wann selbst.
 *
 * Ablauf nach dem Konzept des Inhabers (muster-nachfassen-texte.md im Privatordner):
 *   - erste Nachfrage per E-Mail 4-5 Tage nach Versand der Muster,
 *   - hoechstens eine kurze Erinnerung nach weiteren 10 Tagen, danach nicht mehr,
 *   - anrufen nur, wenn der Kunde einen Rueckruf gewuenscht hat (Paragraf 7 UWG).
 *
 * Reine Funktionen ohne DOM und ohne Dateizugriff - der Server nutzt texteAusMarkdown(),
 * der Browser den Rest. Kundendaten kommen nur zur Laufzeit aus den lokalen Daten.
 */

const TAG_MS = 86400000;

/** Erste Nachfrage ab so vielen Tagen nach Versand bzw. Uebergabe der Muster. */
export const ERSTE_NACH_TAGEN = 4;
/** Erinnerung ab so vielen Tagen nach der ersten Nachfrage - nur einmal. */
export const ERINNERUNG_NACH_TAGEN = 10;
/** Laenger her als das: nicht mehr nachfassen (eine Nachfrage nach Wochen wirkt aufdringlich). */
export const HOECHSTENS_TAGE = 30;
/** Erledigte Nachfragen bleiben so lange sichtbar - mit wer und wann. */
export const ERLEDIGT_ZEIGEN_TAGE = 7;

export const SHOP_URL = 'https://www.teppich-paradies.net';

/** Platzhalter der Vorlage, die fuer jede Nachfrage gleich sind. */
const FESTE_LINKS = Object.freeze({
  'Link Muster': `${SHOP_URL}/pages/muster`,
  'Link Liefer- & Verlegeservice': `${SHOP_URL}/pages/liefer-verlegeservice`,
});

export const STUFE_LABEL = Object.freeze({ erste: 'Erste Nachfrage', erinnerung: 'Erinnerung' });

function tageSeit(iso, jetzt) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((jetzt.getTime() - t) / TAG_MS));
}

const gesetzt = v => v !== null && v !== undefined && v !== '' && v !== '–';
const schrittVon = (z, schritt) => (z.verlauf || []).find(s => s.schritt === schritt) || null;
const erledigt = s => s?.zustand === 'erledigt';

/**
 * Je Produkt eine Angabe mit seinen Farben: "Testvelours Teppich nach Maß: Sand, Greige".
 * "Muster: X" bzw. "Muster X" ohne das Wort Muster; steckt die Farbe schon im Titel, nur der Titel.
 */
function musterKurz(positionen) {
  const jeProdukt = new Map();
  for (const p of positionen || []) {
    if (!p?.istMuster) continue;
    const titel = String(p.titel || '').replace(/^\s*Muster\s*:?\s*/i, '').trim() || 'Muster';
    if (!jeProdukt.has(titel)) jeProdukt.set(titel, []);
    const farben = jeProdukt.get(titel);
    if (gesetzt(p.farbe) && !titel.includes(p.farbe) && !farben.includes(p.farbe)) farben.push(p.farbe);
  }
  return [...jeProdukt].map(([titel, farben]) => (farben.length ? `${titel}: ${farben.join(', ')}` : titel));
}

/**
 * Wie erreichen wir den Kunden? E-Mail ist der Weg; Telefon nur bei Rueckrufwunsch.
 * @returns {{ weg: 'email'|'rueckruf'|'keiner', email: string|null, telefon: string|null }}
 */
export function kontaktweg(z) {
  const email = gesetzt(z?.email) ? String(z.email) : null;
  const telefon = gesetzt(z?.telefon) ? String(z.telefon) : null;
  if (z?.beratungOffen && telefon) return { weg: 'rueckruf', email, telefon };
  if (email) return { weg: 'email', email, telefon: null };
  return { weg: 'keiner', email: null, telefon: null };
}

/**
 * Offene und kuerzlich erledigte Nachfragen.
 *
 * @param {object[]} bestellzeilen  /api/kunden/bestellungen -> zeilen (mit auftragsart, verlauf, zeitleisteAbgeschlossen)
 * @param {object} [opt]
 * @param {Date} [opt.jetzt]
 * @returns {{ offen: object[], erledigt: object[] }}
 */
export function musterNachfassen(bestellzeilen = [], { jetzt = new Date() } = {}) {
  const offen = [];
  const fertig = [];
  for (const z of bestellzeilen || []) {
    if (!z || z.auftragsart !== 'muster' || z.testbestellung || z.storniert) continue;
    const raus = schrittVon(z, 'raus');
    const hat = schrittVon(z, 'kunde_hat_muster');
    const nach = schrittVon(z, 'nachgefasst');
    const ergebnis = schrittVon(z, 'ergebnis');
    const basis = {
      orderId: z.orderId,
      orderName: z.orderName,
      kundenname: gesetzt(z.kundenname) ? z.kundenname : null,
      kundenSchluessel: z.kundenSchluessel || null,
      datum: z.datum || null,
      muster: musterKurz(z.auftrag?.positionen),
      kontakt: kontaktweg(z),
    };

    if (erledigt(nach) && nach.am) {
      const vor = tageSeit(nach.am, jetzt);
      if (vor !== null && vor < ERLEDIGT_ZEIGEN_TAGE) fertig.push({ ...basis, am: nach.am, von: nach.von || null, anzahl: nach.anzahl || 1 });
    }
    // Abgeschlossen (Ergebnis eingetragen, spaetere Bestellung erkannt, im alten Modell erledigt): nichts mehr zu tun.
    if (z.zeitleisteAbgeschlossen || erledigt(ergebnis)) continue;

    if (!erledigt(nach)) {
      // Versand bzw. Uebergabe - ohne diesen Schritt hat der Kunde die Muster noch nicht.
      const seit = erledigt(raus) && raus.am ? raus.am : (erledigt(hat) && hat.am ? hat.am : null);
      const tage = tageSeit(seit, jetzt);
      if (tage === null || tage < ERSTE_NACH_TAGEN || tage > HOECHSTENS_TAGE) continue;
      offen.push({ ...basis, stufe: 'erste', seit, tage });
    } else if ((nach.anzahl || 1) === 1) {
      const tage = tageSeit(nach.am, jetzt);
      if (tage === null || tage < ERINNERUNG_NACH_TAGEN || tage > HOECHSTENS_TAGE) continue;
      offen.push({ ...basis, stufe: 'erinnerung', seit: nach.am, tage, zuletzt: { am: nach.am, von: nach.von || null } });
    }
  }
  offen.sort((a, b) => b.tage - a.tage || String(a.datum).localeCompare(String(b.datum)));
  fertig.sort((a, b) => String(b.am).localeCompare(String(a.am)));
  return { offen, erledigt: fertig };
}

// ---------------------------------------------------------------- Textvorlage

/**
 * Liest Betreff und Text der beiden Mails aus der Vorlage des Inhabers
 * (Markdown, Abschnitte "## Text 1 ..." und "## Text 2 ... Erinnerung ...", darin
 * "**Betreff:** ..." und der Text bis zur naechsten Linie "---").
 *
 * @param {string} md
 * @returns {{ erste: {betreff, text}|null, erinnerung: {betreff, text}|null }}
 */
export function texteAusMarkdown(md) {
  const abschnitte = String(md || '').split(/^##\s+/m).slice(1).map((a) => {
    const [kopf, ...rest] = a.split('\n');
    return { kopf: kopf.trim(), inhalt: rest.join('\n') };
  });
  const lies = (a) => {
    if (!a) return null;
    const vorLinie = a.inhalt.split(/^\s*---\s*$/m)[0];
    const m = vorLinie.match(/^\s*\*\*Betreff:\*\*\s*(.+)$/m);
    if (!m) return null;
    const text = vorLinie.slice(m.index + m[0].length).replace(/^\s*\n/, '').trim();
    return text ? { betreff: m[1].trim(), text } : null;
  };
  const erinnerung = abschnitte.find(a => /erinnerung/i.test(a.kopf));
  const erste = abschnitte.find(a => a !== erinnerung && /^text\s*1\b/i.test(a.kopf))
    || abschnitte.find(a => a !== erinnerung && /e-?mail/i.test(a.kopf));
  return { erste: lies(erste), erinnerung: lies(erinnerung) };
}

/**
 * Fuellt die Vorlage fuer einen Kunden. Was sich nicht sicher fuellen laesst, faellt mit
 * seiner Zeile weg - ein stehengebliebener Platzhalter darf nie beim Kunden ankommen.
 *
 * @param {{betreff, text}} vorlage
 * @param {object} p
 * @param {string|null} p.kundenname
 * @param {string|null} [p.absender]  Name der Person, die schreibt
 * @returns {{ betreff: string, text: string }|null}
 */
export function fuelleText(vorlage, { kundenname = null, absender = null } = {}) {
  if (!vorlage?.text) return null;
  const werte = { ...FESTE_LINKS };
  if (gesetzt(absender)) werte.Name = String(absender).trim();
  const ersetze = s => String(s)
    // Die Anrede (Herr/Frau) steht nicht in den Bestelldaten - "Guten Tag Vorname Nachname," ist korrekt.
    .replace(/[ \t]*\{Anrede\}[ \t]*\{Nachname\}/g, gesetzt(kundenname) ? ` ${String(kundenname).trim()}` : '')
    .replace(/\{([^{}\n]+)\}/g, (ganz, name) => (Object.hasOwn(werte, name) ? werte[name] : ganz));
  const text = ersetze(vorlage.text)
    .replace(/<[^>]+>/g, '')            // <small> u. a. - die Mail ist reiner Text
    .split('\n')
    .filter(zeile => !/\{[^{}\n]+\}/.test(zeile))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { betreff: ersetze(vorlage.betreff || '').replace(/\{[^{}\n]+\}/g, '').trim(), text };
}

/** mailto:-Link mit Betreff und Text - oeffnet das Mailprogramm, sendet nichts. */
export function mailtoLink(email, { betreff = '', text = '' } = {}) {
  if (!gesetzt(email)) return null;
  const teile = [];
  if (betreff) teile.push(`subject=${encodeURIComponent(betreff)}`);
  if (text) teile.push(`body=${encodeURIComponent(text.replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${String(email).trim()}${teile.length ? `?${teile.join('&')}` : ''}`;
}
