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

import { sichereMusterLinks } from './muster-kauf-links.mjs';
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
 * Auch fuer "Muster nicht verfuegbar" (Notiz, Mailtext, Server).
 */
export function musterKurz(positionen) {
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
 * @param {Map<string, {am?: string}>|Set<string>|string[]} [opt.abgemeldet]  Adressen der Stoppliste (Antwort "Abmelden")
 * @returns {{ offen: object[], erledigt: object[], abgemeldet: object[] }}
 */
export function musterNachfassen(bestellzeilen = [], { jetzt = new Date(), abgemeldet = null } = {}) {
  const offen = [];
  const fertig = [];
  const stopp = [];
  // Stoppliste: wer "Abmelden" geantwortet hat, wird nicht mehr angeschrieben - weder vom Lauf
  // noch per Klick. Er steht getrennt, damit der Laden sieht, warum er fehlt.
  const stoppliste = abgemeldet instanceof Map ? abgemeldet : new Map([...(abgemeldet || [])].map(e => [e, {}]));
  const abgemeldetEintrag = (email) => (email ? stoppliste.get(String(email).trim().toLowerCase()) || null : null);
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
      produkte: sichereMusterLinks(z.musterKaufLinks),
      kontakt: kontaktweg(z),
    };

    if (erledigt(nach) && nach.am) {
      const vor = tageSeit(nach.am, jetzt);
      if (vor !== null && vor < ERLEDIGT_ZEIGEN_TAGE) fertig.push({ ...basis, am: nach.am, von: nach.von || null, anzahl: nach.anzahl || 1 });
    }
    // Abgeschlossen (Ergebnis eingetragen, spaetere Bestellung erkannt, im alten Modell erledigt): nichts mehr zu tun.
    if (z.zeitleisteAbgeschlossen || erledigt(ergebnis)) continue;

    let faellig = null;
    if (!erledigt(nach)) {
      // Versand bzw. Uebergabe - ohne diesen Schritt hat der Kunde die Muster noch nicht.
      const seit = erledigt(raus) && raus.am ? raus.am : (erledigt(hat) && hat.am ? hat.am : null);
      const tage = tageSeit(seit, jetzt);
      if (tage === null || tage < ERSTE_NACH_TAGEN || tage > HOECHSTENS_TAGE) continue;
      faellig = { ...basis, stufe: 'erste', seit, tage };
    } else if ((nach.anzahl || 1) === 1) {
      const tage = tageSeit(nach.am, jetzt);
      if (tage === null || tage < ERINNERUNG_NACH_TAGEN || tage > HOECHSTENS_TAGE) continue;
      faellig = { ...basis, stufe: 'erinnerung', seit: nach.am, tage, zuletzt: { am: nach.am, von: nach.von || null } };
    }
    if (!faellig) continue;
    const ab = abgemeldetEintrag(basis.kontakt.email || z.email);
    if (ab) stopp.push({ ...faellig, abgemeldetAm: ab.am || null });
    else offen.push(faellig);
  }
  offen.sort((a, b) => b.tage - a.tage || String(a.datum).localeCompare(String(b.datum)));
  stopp.sort((a, b) => b.tage - a.tage || String(a.datum).localeCompare(String(b.datum)));
  fertig.sort((a, b) => String(b.am).localeCompare(String(a.am)));
  return { offen, erledigt: fertig, abgemeldet: stopp };
}

/**
 * Laeuft der automatische Versand? Nur dann ist eine faellige E-Mail-Nachfrage keine Aufgabe
 * fuer einen Menschen. Nicht laufend heisst: Postfach nicht eingerichtet, Ablage mit Stoerung
 * (hinweis) oder keine Textvorlage - dann schickt auch der Lauf nichts.
 *
 * @param {object|null} t  Antwort von /api/kunden/muster-texte ({verfuegbar, versand: {eingerichtet, hinweis, letzterLauf}})
 * @returns {boolean|null} null = noch nicht geladen
 */
export function versandLaeuft(t) {
  if (!t) return null;
  return Boolean(t.verfuegbar !== false && t.versand?.eingerichtet && !t.versand?.hinweis);
}

/**
 * Wer muss selbst ran? (Startseite "Heute", Codex-Audit 2026-10-19: automatisch geplante Mails
 * zaehlten als "To-dos fuer dich".)
 *   mensch       anrufen (Rueckrufwunsch) oder - solange der Versand nicht laeuft - per E-Mail
 *   automatisch  geht beim naechsten Lauf von selbst per E-Mail raus
 *   ohneWeg      weder E-Mail noch Rueckrufwunsch: nichts zu tun ausser abschliessen - kein To-do
 * Abgemeldete stehen gar nicht in `offen` (musterNachfassen()), werden also nie zur Kontaktaufgabe.
 */
export function teileNachfassen(offen = [], { automatisch = false } = {}) {
  const teile = { mensch: [], automatisch: [], ohneWeg: [] };
  for (const e of offen || []) {
    const weg = e?.kontakt?.weg;
    if (weg === 'rueckruf') teile.mensch.push(e);
    else if (weg === 'email') (automatisch ? teile.automatisch : teile.mensch).push(e);
    else teile.ohneWeg.push(e);
  }
  return teile;
}

/**
 * Eine Nachfrage, die ein Mensch erledigen muss, als Zeile der To-do-Liste auf "Heute"
 * (gleiche Form wie lib/todos.mjs). `ansehenHref` fuehrt zur aufgeklappten Nachfass-Karte,
 * in der Text, "Jetzt senden" und "Erledigt" stehen.
 */
export function nachfassTodo(e, { ansehenHref }) {
  const k = e.kontakt || {};
  const erinnerung = e.stufe === 'erinnerung';
  const wann = erinnerung ? `erste Nachfrage vor ${e.tage} Tagen` : `Muster verschickt vor ${e.tage} Tagen`;
  const tel = k.weg === 'rueckruf' && k.telefon ? String(k.telefon).replace(/[^0-9+]/g, '') : '';
  return {
    id: `nachfassen:${e.orderId}`, art: 'nachfassen', bereich: 'laden',
    // Eine Nachfrage altert nicht wie eine Lieferung: faellig ist sie ab Tag 4, rot wird sie nie.
    ton: '', alterTage: e.tage ?? null,
    titel: `${erinnerung ? 'Erinnerung schicken' : 'Muster nachfassen'}: ${e.kundenname || e.orderName}`,
    kontext: [e.orderName, wann, (e.muster || []).slice(0, 2).join(' · ') || null,
      k.weg === 'rueckruf' ? 'Rückruf gewünscht' : 'per E-Mail'].filter(Boolean).join(' · '),
    knopf: tel ? { text: 'Anrufen', href: `tel:${tel}` } : { text: 'Nachfassen', href: ansehenHref },
  };
}

/** Kein Platzhalter mehr in Betreff oder Text - erst dann darf eine Mail raus. */
export function platzhalterFrei(mail) {
  if (!mail || typeof mail !== 'object') return false;
  const rest = /\{[^{}\n]+\}/;
  return Boolean(mail.text) && !rest.test(String(mail.betreff || '')) && !rest.test(String(mail.text));
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
/**
 * Vorschlag "Muster nicht verfuegbar" (Inhaber 2026-10-16): der Lieferant hat eine Farbe nicht,
 * der Kunde erfaehrt es per Mail und bestellt bei Bedarf andere Muster. Bewusst ohne Termin -
 * wann die Farbe wiederkommt, weiss niemand. Gilt, solange die Vorlage des Inhabers keinen
 * eigenen Abschnitt "nicht verfuegbar" hat. Keine Kundendaten: alles in {} fuellt fuelleText().
 */
export const NICHT_VERFUEGBAR_VORLAGE = Object.freeze({
  betreff: 'Ihre Musterbestellung bei Teppich Paradies',
  text: `Guten Tag {Anrede} {Nachname},

vielen Dank für Ihre Musterbestellung. Leider sind diese Muster derzeit nicht verfügbar:

{Farben}

Wann sie wieder lieferbar sind, können wir im Moment nicht sagen. Gern schicken wir Ihnen Muster in anderen Farben – Sie können sie direkt im Shop bestellen: {Link Muster}

Bei Fragen helfen wir Ihnen gern weiter, auch telefonisch.

Freundliche Grüße
{Name}
Teppich Paradies`,
});

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
  const nichtVerfuegbar = abschnitte.find(a => /nicht\s+verf[uü]e?gbar/i.test(a.kopf));
  const erinnerung = abschnitte.find(a => a !== nichtVerfuegbar && /erinnerung/i.test(a.kopf));
  const erste = abschnitte.find(a => a !== erinnerung && a !== nichtVerfuegbar && /^text\s*1\b/i.test(a.kopf))
    || abschnitte.find(a => a !== erinnerung && a !== nichtVerfuegbar && /e-?mail/i.test(a.kopf));
  return { erste: lies(erste), erinnerung: lies(erinnerung), nichtVerfuegbar: lies(nichtVerfuegbar) };
}

/**
 * Fuellt die Vorlage fuer einen Kunden. Was sich nicht sicher fuellen laesst, faellt mit
 * seiner Zeile weg - ein stehengebliebener Platzhalter darf nie beim Kunden ankommen.
 *
 * @param {{betreff, text}} vorlage
 * @param {object} p
 * @param {string|null} p.kundenname
 * @param {string|null} [p.absender]  Name der Person, die schreibt
 * @param {string[]} [p.farben]  nur "Muster nicht verfuegbar": betroffene Muster, je Eintrag "Produkt: Farbe"
 * @returns {{ betreff: string, text: string }|null}
 */
export function fuelleText(vorlage, { kundenname = null, absender = null, produkte = [], farben = [] } = {}) {
  if (!vorlage?.text) return null;
  const werte = { ...FESTE_LINKS };
  // "Muster nicht verfuegbar": je Produkt eine Zeile mit seinen Farben (mehrzeilig, ohne Platzhalter).
  const farbZeilen = (farben || []).map(f => String(f ?? '').replace(/[{}]/g, '').trim()).filter(Boolean);
  if (farbZeilen.length) werte.Farben = farbZeilen.map(f => `– ${f}`).join('\n');
  const links = sichereMusterLinks(produkte);
  const auswahl = links.map(p => `${[p.titel, p.farbe].filter(Boolean).join(' · ')}\n${p.url}`).join('\n\n');
  if (links.length) werte['Link Produkt'] = auswahl;
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
  const block = `Ihre gewählten Böden:\n${auswahl}\n\nFragen zum Maß? Wir beraten Sie gern.`;
  const mitAuswahl = auswahl && !vorlage.text.includes('{Link Produkt}')
    ? (/\n(?:Freundliche Grüße|Mit freundlichen Grüßen|Viele Grüße)\b/.test(text) ? text.replace(/\n((?:Freundliche Grüße|Mit freundlichen Grüßen|Viele Grüße)\b)/, `\n\n${block}\n\n$1`) : `${text}\n\n${block}`) : text;
  // Der Betreff hat keine Zeile, die wegfallen koennte: ein unbekannter Platzhalter bleibt stehen,
  // damit platzhalterFrei() ihn sieht und der Versandlauf die Mail zurueckhaelt (statt „Ihre Muster,“ zu schicken).
  return { betreff: ersetze(vorlage.betreff || '').trim(), text: mitAuswahl };
}

/** mailto:-Link mit Betreff und Text - oeffnet das Mailprogramm, sendet nichts. */
export function mailtoLink(email, { betreff = '', text = '' } = {}) {
  if (!gesetzt(email)) return null;
  const teile = [];
  if (betreff) teile.push(`subject=${encodeURIComponent(betreff)}`);
  if (text) teile.push(`body=${encodeURIComponent(text.replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${String(email).trim()}${teile.length ? `?${teile.join('&')}` : ''}`;
}
