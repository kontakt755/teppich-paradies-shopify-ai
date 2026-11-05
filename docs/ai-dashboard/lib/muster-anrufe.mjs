/**
 * "Muster anrufen": wer hat seit mindestens 5 Tagen Muster und muss nachtelefoniert werden?
 * Reine Funktionen ohne DOM und ohne Dateizugriff - Browser (Dialog) und Server (Liste, Pruefung)
 * nutzen dieselben Ergebnisse. Die Eintraege selbst liegen in operations/lib/muster-anrufe.mjs.
 *
 * Eine Zeile ist ein Kunde, nicht eine Bestellung: drei Musterbestellungen sind ein Anruf
 * (derselbe Fehler kostete am 02.11. drei gleiche Mails, siehe nachfragenBuendeln()).
 */
import { kalendertage } from './kalendertage.mjs';
import { fuelleText, mailtoLink } from './muster-nachfassen.mjs';

/** Anruf ab so vielen Tagen nach Versand bzw. Uebergabe (Auftrag vom 2026-11-05). */
export const ANRUF_NACH_TAGEN = 5;
/** Noch laenger her und nie angerufen: nicht mehr anfangen (wie musterNachfassen()). */
export const ANRUF_HOECHSTENS_TAGE = 30;
/** Abgeschlossene Anrufe bleiben so lange sichtbar. */
export const ERLEDIGT_ZEIGEN_TAGE = 30;
/** Nach so vielen Versuchen ohne Antwort endet der Anruf von selbst - Dauerklingeln nervt nur. */
export const HOECHSTENS_VERSUCHE = 3;

/**
 * Rechtliche Sperre (§ 7 UWG, Inhaberregel 2026-10-10 "anrufen nur bei Rueckrufwunsch"): solange
 * true, liefert der Server die Telefonnummer nur fuer Kunden mit Rueckrufwunsch. Die Telefonnummer
 * der Lieferadresse ist keine Einwilligung in einen Werbeanruf. Nur der Inhaber hebt das auf.
 */
export const ANRUF_NUR_MIT_RUECKRUFWUNSCH = true;

/**
 * Die Klick-Ergebnisse.
 *   tage     bleibt offen und kommt nach so vielen Tagen wieder
 *   fertig   der Kunde steht nicht mehr auf der Liste
 *   schritt  Ergebnis der Zeitleiste - beendet auch die Nachfrage-Mails
 *   erreicht wir haben gesprochen: zaehlt als "nachgefasst", sonst kaeme zusaetzlich die erste Mail
 *   sperrt   gilt fuer alle Bestellungen dieses Kunden, auch spaetere
 */
export const ANRUF_ERGEBNISSE = Object.freeze([
  { wert: 'nicht_erreicht', text: 'Nicht erreicht', gruppe: 'offen', tage: 1, keinGrund: true },
  { wert: 'ueberlegt_noch', text: 'Überlegt noch', gruppe: 'offen', tage: 7, erreicht: true },
  { wert: 'will_bestellen', text: 'Will bestellen', gruppe: 'offen', tage: 3, erreicht: true },
  { wert: 'muster_nicht_da', text: 'Muster nicht angekommen', gruppe: 'offen', tage: 3, erreicht: true },
  { wert: 'mail_geschickt', text: 'Mail geschickt, Antwort abwarten', gruppe: 'offen', tage: 7, erreicht: true, keinGrund: true },
  { wert: 'gefaellt_nicht', text: 'Muster gefällt nicht', gruppe: 'kein_kauf', fertig: true, schritt: 'kein_interesse' },
  { wert: 'woanders_gekauft', text: 'Hat woanders gekauft', gruppe: 'kein_kauf', fertig: true, schritt: 'kein_interesse' },
  { wert: 'zu_teuer', text: 'Preis zu hoch', gruppe: 'kein_kauf', fertig: true, schritt: 'kein_interesse' },
  { wert: 'kein_bedarf', text: 'Kein Bedarf mehr', gruppe: 'kein_kauf', fertig: true, schritt: 'kein_interesse' },
  { wert: 'hat_bestellt', text: 'Hat bei uns bestellt', gruppe: 'fertig', fertig: true, schritt: 'kunde_hat_bestellt' },
  { wert: 'andere_muster', text: 'Möchte andere Muster', gruppe: 'fertig', fertig: true, erreicht: true },
  { wert: 'keine_anrufe', text: 'Möchte keine Anrufe', gruppe: 'fertig', fertig: true, sperrt: true, keinGrund: true },
  { wert: 'nummer_falsch', text: 'Nummer stimmt nicht', gruppe: 'fertig', fertig: true, keinGrund: true },
].map(Object.freeze));

/**
 * Rueckfrage per E-Mail fuer alle, die nicht angerufen werden (keine Nummer oder kein
 * Rueckrufwunsch). Oeffnet nur das Mailprogramm, gesendet wird von Hand; der Antworttext wird
 * danach wie ein Anruf eingetragen. Eingebaute Fassung, bis die Inhaber-Vorlage einen Abschnitt hat.
 */
export const RUECKFRAGE_VORLAGE = Object.freeze({
  betreff: 'Wie gefallen Ihnen Ihre Muster?',
  text: `Guten Tag {Anrede} {Nachname},

Sie haben bei uns Muster bestellt:

{Farben}

Wie gefallen sie Ihnen? Über eine kurze Antwort auf diese E-Mail würden wir uns freuen – auch wenn Sie sich anders entschieden haben. Ein Satz reicht, zum Beispiel: Farbe passt nicht, Preis zu hoch, schon woanders gekauft oder noch am Überlegen. Das hilft uns, besser zu werden.

Wenn Sie noch Fragen haben, helfen wir Ihnen gern, auch telefonisch unter 03301 573 37 20.

Freundliche Grüße
{Name}
Teppich Paradies Oranienburg

Sie möchten keine solchen Nachfragen mehr erhalten? Antworten Sie kurz mit „Abmelden“, dann schreiben wir Ihnen nicht mehr.`,
});

/** mailto:-Link der Rueckfrage fuer eine Zeile der Liste; null ohne E-Mail-Adresse. */
export function rueckfrageLink(zeile, absender = null) {
  if (!zeile?.email) return null;
  return mailtoLink(zeile.email, fuelleText(RUECKFRAGE_VORLAGE, { kundenname: zeile.kundenname, absender, farben: zeile.muster }));
}

export const ANRUF_GRUPPEN = Object.freeze([
  ['offen', 'Bleibt offen'],
  ['kein_kauf', 'Kein Kauf'],
  ['fertig', 'Sonst abgeschlossen'],
]);

export const anrufErgebnis = wert => ANRUF_ERGEBNISSE.find(e => e.wert === wert) || null;
export const anrufErgebnisText = wert => anrufErgebnis(wert)?.text || (wert === 'versuche_aus' ? `${HOECHSTENS_VERSUCHE}× nicht erreicht` : null);

const gesetzt = v => v !== null && v !== undefined && v !== '' && v !== '–';
const schrittVon = (z, schritt) => (z.verlauf || []).find(s => s.schritt === schritt) || null;
const erledigt = s => s?.zustand === 'erledigt';

/** Tag im Format JJJJ-MM-TT in lokaler Zeit, Sonntag rutscht auf Montag (Laden geschlossen). */
export function wiedervorlageTag(tage, jetzt = new Date()) {
  const d = new Date(jetzt);
  d.setDate(d.getDate() + tage);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const heuteTag = jetzt => `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;

/** Telefon der Bestellung: Kundenkonto, sonst Liefer-, sonst Rechnungsadresse (dort steht es meist). */
export function anrufTelefon(z) {
  const d = z?.auftrag?.details;
  return [z?.telefon, d?.kunde?.telefon, d?.lieferadresse?.telefon, d?.rechnungsadresse?.telefon].find(gesetzt) || null;
}

function musterText(z) {
  const jeProdukt = new Map();
  for (const p of z.auftrag?.positionen || []) {
    if (!p?.istMuster) continue;
    const titel = String(p.titel || '').replace(/^\s*Muster\s*:?\s*/i, '').trim() || 'Muster';
    if (!jeProdukt.has(titel)) jeProdukt.set(titel, []);
    if (gesetzt(p.farbe) && !titel.includes(p.farbe) && !jeProdukt.get(titel).includes(p.farbe)) jeProdukt.get(titel).push(p.farbe);
  }
  return [...jeProdukt].map(([titel, farben]) => (farben.length ? `${titel}: ${farben.join(', ')}` : titel));
}

/**
 * Warum wird nicht gekauft? Je Kunde zaehlt seine letzte Aussage. "Nicht erreicht" und aehnliches
 * sagt nichts ueber den Grund und zaehlt nicht mit. Haeufigste zuerst.
 */
function anrufGruende(muster, eintraege, kundeOf) {
  const jeKunde = new Map();
  for (const z of muster) {
    const e = eintraege[z.orderId];
    const art = anrufErgebnis(e?.ergebnis);
    if (!art || art.keinGrund) continue;
    const bisher = jeKunde.get(kundeOf(z));
    if (!bisher || String(e.aktualisiertAm) > String(bisher.aktualisiertAm)) jeKunde.set(kundeOf(z), e);
  }
  const zahl = new Map();
  for (const e of jeKunde.values()) zahl.set(e.ergebnis, (zahl.get(e.ergebnis) || 0) + 1);
  return [...zahl].map(([wert, anzahl]) => ({ wert, text: anrufErgebnisText(wert), anzahl })).sort((a, b) => b.anzahl - a.anzahl);
}

/**
 * Baut die Anrufliste.
 *
 * @param {object[]} zeilen  Bestellzeilen samt Zeitleiste (kundenBestellungen)
 * @param {Record<string, object>} eintraege  operations/lib/muster-anrufe.mjs, Schluessel Bestell-ID
 * @param {object} [opt]
 * @param {Date} [opt.jetzt]
 * @param {Set<string>|string[]} [opt.abgemeldet]  E-Mail-Adressen der Stoppliste: wer dort steht, wird auch nicht angerufen
 * @param {boolean} [opt.nurMitWunsch]  siehe ANRUF_NUR_MIT_RUECKRUFWUNSCH
 * @returns {{ anrufen: object[], ohneNummer: object[], gesperrt: object[], spaeter: object[], erledigt: object[], nurMitWunsch: boolean, gruende: object[] }}
 */
export function musterAnrufliste(zeilen = [], eintraege = {}, { jetzt = new Date(), abgemeldet = [], nurMitWunsch = ANRUF_NUR_MIT_RUECKRUFWUNSCH } = {}) {
  const stopp = new Set([...abgemeldet].map(e => String(e).trim().toLowerCase()));
  const muster = (zeilen || []).filter(z => z && z.auftragsart === 'muster' && !z.testbestellung && !z.storniert);
  // "Moechte keine Anrufe" gilt fuer den Kunden, nicht fuer die eine Bestellung.
  const kundeOf = z => z.kundenSchluessel || `bestellung:${z.orderId}`;
  const keineAnrufe = new Set(muster.filter(z => anrufErgebnis(eintraege[z.orderId]?.ergebnis)?.sperrt).map(kundeOf));

  const offen = new Map();
  const fertig = new Map();
  for (const z of muster) {
    const eintrag = eintraege[z.orderId] || null;
    const raus = schrittVon(z, 'raus');
    const hat = schrittVon(z, 'kunde_hat_muster');
    const seit = erledigt(raus) && raus.am ? raus.am : (erledigt(hat) && hat.am ? hat.am : null);
    const tage = kalendertage(seit, jetzt);
    if (tage === null || tage < ANRUF_NACH_TAGEN) continue;
    const ziel = eintrag?.abgeschlossen ? fertig : offen;
    if (eintrag?.abgeschlossen) {
      const vor = kalendertage(eintrag.aktualisiertAm, jetzt);
      if (vor === null || vor >= ERLEDIGT_ZEIGEN_TAGE) continue;
    } else {
      const ergebnis = schrittVon(z, 'ergebnis');
      // Spaeter gekauft oder anderswo abgeschlossen: niemand ruft mehr an. Nur wer hier eine
      // Eingabe korrigiert hat, bleibt stehen - die Positionen sind dann noch "erledigt".
      const zu = z.zeitleisteAbgeschlossen || erledigt(ergebnis);
      if (zu && !(eintrag?.korrigiertAm && !ergebnis?.automatisch)) continue;
      if (keineAnrufe.has(kundeOf(z))) continue;
      if (gesetzt(z.email) && stopp.has(String(z.email).trim().toLowerCase())) continue;
      if (!eintrag && tage > ANRUF_HOECHSTENS_TAGE) continue;
    }
    const schluessel = kundeOf(z);
    if (!ziel.has(schluessel)) ziel.set(schluessel, []);
    ziel.get(schluessel).push({ z, eintrag, tage, seit });
  }

  const zeile = (schluessel, liste) => {
    const eintragListe = liste.map(l => l.eintrag).filter(Boolean)
      .sort((a, b) => String(b.aktualisiertAm).localeCompare(String(a.aktualisiertAm)));
    const letzter = eintragListe[0] || null;
    const verlauf = new Map();
    for (const e of eintragListe.flatMap(x => x.verlauf || [])) verlauf.set(`${e.am}|${e.von}|${e.ergebnis}`, e);
    const wunsch = liste.some(l => l.z.beratungOffen);
    return {
      schluessel,
      kundenname: liste.map(l => l.z.kundenname).find(gesetzt) || null,
      email: liste.map(l => l.z.email).find(gesetzt) || null,
      kundenSchluessel: liste.find(l => l.z.kundenSchluessel)?.z.kundenSchluessel || null,
      orderIds: liste.map(l => l.z.orderId),
      orderNames: liste.map(l => l.z.orderName),
      muster: [...new Set(liste.flatMap(l => musterText(l.z)))],
      tage: Math.max(...liste.map(l => l.tage)),
      seit: liste.map(l => l.seit).sort()[0],
      rueckrufWunsch: wunsch,
      freigegeben: !nurMitWunsch || wunsch,
      // Ohne Freigabe verlaesst die Nummer den Server gar nicht erst.
      telefon: !nurMitWunsch || wunsch ? liste.map(l => anrufTelefon(l.z)).find(Boolean) || null : null,
      ergebnis: letzter?.ergebnis || null,
      notiz: letzter?.notiz || null,
      wiedervorlage: letzter?.wiedervorlage || null,
      versuche: Math.max(0, ...eintragListe.map(e => e.versuche || 0)),
      aktualisiertAm: letzter?.aktualisiertAm || null,
      aktualisiertVon: letzter?.aktualisiertVon || null,
      verlauf: [...verlauf.values()].sort((a, b) => String(b.am).localeCompare(String(a.am))),
    };
  };

  const heute = heuteTag(jetzt);
  const ergebnis = { anrufen: [], ohneNummer: [], gesperrt: [], spaeter: [], erledigt: [], nurMitWunsch: Boolean(nurMitWunsch), gruende: anrufGruende(muster, eintraege, kundeOf) };
  for (const [schluessel, liste] of offen) {
    const r = zeile(schluessel, liste);
    if (r.wiedervorlage && r.wiedervorlage > heute) ergebnis.spaeter.push(r);
    else if (!r.freigegeben) ergebnis.gesperrt.push(r);
    else if (!r.telefon) ergebnis.ohneNummer.push(r);
    else ergebnis.anrufen.push(r);
  }
  for (const [schluessel, liste] of fertig) ergebnis.erledigt.push(zeile(schluessel, liste));
  // Wer schon einmal dran war und wieder faellig ist, zuerst; sonst laengstes Warten zuerst.
  const dran = (a, b) => Number(Boolean(b.wiedervorlage)) - Number(Boolean(a.wiedervorlage)) || b.tage - a.tage;
  ergebnis.anrufen.sort(dran);
  ergebnis.ohneNummer.sort(dran);
  ergebnis.gesperrt.sort(dran);
  ergebnis.spaeter.sort((a, b) => String(a.wiedervorlage).localeCompare(String(b.wiedervorlage)));
  ergebnis.erledigt.sort((a, b) => String(b.aktualisiertAm).localeCompare(String(a.aktualisiertAm)));
  return ergebnis;
}
