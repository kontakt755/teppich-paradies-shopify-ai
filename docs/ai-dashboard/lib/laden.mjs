/**
 * Ansicht "Laden": was im Laden offen ist, als eine einheitliche Zeilenform fuer beide Spalten
 * (Mails links, Zu tun rechts). Reine Funktionen ohne DOM - laufen im Server und im Browser.
 *
 * Nichts wird hier erfasst: Rueckrufe, "Kunde antwortet nicht" und von Hand angelegte Aufgaben
 * kommen aus vorhandenen Quellen; Alter, Farbstufe und Reihenfolge rechnet lib/todos.mjs
 * (FRISTEN, tageSeit, sortiereTodos) - es gibt keine zweite Fristentabelle.
 *
 * Zeile: { schluessel, art, von, text, seit, alterTage, ton, alter, aufgabeId? }
 *   schluessel  "rueckruf:<id>", "fall:<id>", "aufgabe:<id>", spaeter "mail:<id>" - gleich dem Schluessel
 *               der Zustaendigkeit (operations/lib/laden.mjs)
 */
import { FRISTEN, tageSeit, tonNachAlter, alterText, sortiereTodos, rueckrufFaellig, alsTag } from './todos.mjs';
import { werktageSeit } from './beschaffung.mjs';
import { selbstStand } from './lieferweg.mjs';

const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/**
 * @param {object} q
 * @param {object[]} q.rueckrufe    Zeilen von /api/kunden/rueckrufe (mit status, wiedervorlage)
 * @param {object[]} q.kundeWartet  operations/lib/laden.mjs kundeWartet()
 * @param {object[]} q.aufgaben     laden-aufgaben.json
 * @param {object[]} q.zuschnitte   zuschnitte() - Ware aus eigener Lagerrolle, die noch zu schneiden ist
 */
export function ladenTodos({ rueckrufe = [], kundeWartet = [], aufgaben = [], zuschnitte = [] } = {}, { jetzt = new Date() } = {}) {
  const heute = alsTag(jetzt);
  const zeile = (z) => {
    const alterTage = tageSeit(z.seit, jetzt);
    return { ...z, alterTage, ton: tonNachAlter(alterTage, ...z.frist), alter: alterText(alterTage), frist: undefined };
  };
  const liste = [
    ...rueckrufe.filter(r => rueckrufFaellig(r, heute)).map(r => zeile({
      schluessel: `rueckruf:${r.orderId}`, art: 'Rückruf', von: r.kundenname && r.kundenname !== '–' ? r.kundenname : null,
      text: `${r.thema || 'Rückruf'} – ${r.telefon || 'keine Telefonnummer'}`, seit: r.datum, frist: FRISTEN.rueckruf,
    })),
    // Wer erst kurz wartet, ist normal; ab der ersten Frist (14 Tage) ist es ein Fall fuer den Laden - sonst stuenden alle Musterkunden hier.
    ...kundeWartet.filter(w => (w.tage ?? 0) >= FRISTEN.kunde_antwortet[0]).map(w => zeile({
      schluessel: `fall:${w.orderId}`, art: 'Kunde antwortet nicht', von: w.kundenname,
      text: w.text || 'Wir warten auf den Kunden', seit: new Date(jetzt.getTime() - w.tage * 86400000).toISOString(), frist: FRISTEN.kunde_antwortet,
    })),
    // Gleiche Frist wie eine von Hand angelegte "Rolle schneiden": nach einem Tag bernstein, nach zwei rot.
    ...zuschnitte.map(s => zeile({
      schluessel: `schnitt:${s.orderId}:${s.lineItemId}`, art: 'Zuschneiden', von: [s.orderName, s.kundenname].filter(Boolean).join(' · ') || null,
      text: s.text, seit: s.seit, frist: FRISTEN.laden_aufgabe, schnitt: { orderId: s.orderId, lineItemId: s.lineItemId },
    })),
    ...aufgaben.filter(a => !a.erledigtAm).map(a => zeile({
      schluessel: `aufgabe:${a.id}`, art: a.art, von: null, text: a.text, seit: a.erstelltAm, frist: FRISTEN.laden_aufgabe, aufgabeId: a.id,
    })),
  ];
  return sortiereTodos(liste);
}

const BEZAHLT = ['PAID', 'PARTIALLY_REFUNDED']; // wie lib/todos.mjs: unbezahlt ist der Kunde dran, nicht die Schere

/**
 * "Zuschneiden" (Benutzer 12.11.2026): bezahlte Bestellungen mit Ware aus eigener Lagerrolle (lib/lieferweg.mjs,
 * Regeldatei lagerware.json), die noch nicht als zugeschnitten abgehakt ist. Dieselbe Regel wie "Aus eigenem Lager
 * zuschneiden" unter Bestellen (selbstStand) - hier nur als Zeile fuer den Laden, eine je Position.
 * @param {object[]} auftraege  Bestellmodell (auftraege mit positionen, lagerware vom Server markiert)
 * @param {(orderId: string, lineItemId: string) => object|null} eintragVon  Auftragsfluss-Eintrag der Position
 */
export function zuschnitte(auftraege = [], eintragVon = () => null) {
  return auftraege
    .filter(a => !a.testbestellung && !a.storniert && BEZAHLT.includes(String(a.bezahlt)))
    .flatMap(a => (a.positionen || [])
      .filter(p => selbstStand(p, eintragVon(a.id, p.lineItemId)) === 'zuschneiden')
      .map((p) => {
        const menge = p.bestellmenge?.text && !/ungekl/i.test(p.bestellmenge.text) ? p.bestellmenge.text : (p.menge ? `Menge ${p.menge}` : null);
        return {
          orderId: a.id, lineItemId: p.lineItemId, orderName: a.name || null, kundenname: a.details?.kunde?.name || null, seit: a.datum,
          text: [p.titel, p.farbe, menge].filter(Boolean).join(' · ').slice(0, 200) || 'Ware aus eigener Lagerrolle',
        };
      }));
}

/** Portal-Anfragen (11880, Kleinanzeigen) und Rueckrufbitten: eine Antwortmail loest sie nie, nur der Haken zaehlt. */
const PORTAL = /^(Neue Anfrage:|Nutzer-Anfrage)/i;
const RUECKRUF = /r[uü]ckruf/i;
export const mailArt = betreff => (PORTAL.test(betreff || '') ? 'Portalanfrage' : RUECKRUF.test(betreff || '') ? 'Rückrufbitte' : null);

// Eine Antwort auf unsere Mail (Rueckfrage des Lieferanten) braucht jemanden - ein automatisches Dokument nie.
const ANTWORT = /^\s*(re|aw|wg|fwd?|antwort)\s*:/i;

// Nie Sache des Ladens (Benutzer 12.11.2026): eigene Mails, die ueber die Weiterleitung zurueckkommen, und
// Googles Bestaetigung der Weiterleitung. Darauf antwortet niemand, sie wurden sonst nach einem Werktag rot.
const EIGENE_POST = /@(teppich-paradies\.net|tp-oranienburg\.de)$|^forwarding-noreply@google\.com$/i;
// Unzustellbar-Meldung: bleibt sichtbar (eine Mail von uns kam nicht an), aber als Info - antworten kann man darauf nicht.
const UNZUSTELLBAR = /^(mailer-daemon|postmaster)@/i;

/** Ab so vielen Werktagen ohne Antwort ist eine Mail rot (Werkbank w-352: "nach einem Werktag"). */
export const MAIL_ROT_WERKTAGE = 1;

/**
 * Mails aus dem Abruf (operations/lib/laden-mails.mjs) als Zeilen. Schon aus dem Hauptpostfach
 * beantwortete (beantwortetAm) werden nie rot: sie liegen nicht, sie sind nur noch nicht aus dem
 * Laden-Postfach verschwunden - ausser Portal-Anfragen und Rueckrufbitten (nur der Haken "telefonisch
 * erledigt" zaehlt). Das Alter zaehlt in Werktagen. Die Adresse des Absenders verlaesst den Server nicht.
 */
export function ladenMailZeilen(mails = [], { jetzt = new Date() } = {}) {
  return mails.filter(m => !EIGENE_POST.test(m.adresse || '')).map((m) => {
    const alterTage = tageSeit(m.seit, jetzt);
    const werktage = werktageSeit(m.seit, jetzt);
    const unzustellbar = UNZUSTELLBAR.test(m.adresse || '');
    const art = mailArt(m.text);
    // Lieferantenpost (Benutzer 12.11.2026): Bestaetigungen und Avise sind reine Info - nie rot, nur "Gesehen".
    // shortcut: erkannt an "Absender ist Lieferant und Betreff ist keine Antwort"; eine neue Frage des Lieferanten
    // ohne "Re:/AW:" steht damit auch als Info da. Aendern, wenn so eine Frage einmal liegen bleibt.
    const nurInfo = unzustellbar || (Boolean(m.lieferantenpost) && !art && !ANTWORT.test(m.text || ''));
    const beantwortet = art || nurInfo ? null : m.beantwortetAm || null;
    const rot = !nurInfo && !beantwortet && werktage !== null && werktage >= MAIL_ROT_WERKTAGE;
    return {
      schluessel: m.schluessel, art: unzustellbar ? 'Unzustellbar' : nurInfo ? 'Lieferant' : art, nurInfo,
      infoText: unzustellbar ? 'Eine Mail von uns ist nicht angekommen. Bitte Adresse prüfen und neu senden.' : null, von: m.von, text: m.text, seit: m.seit, alterTage, werktage,
      alter: werktage ? mehrzahl(werktage, 'Werktag', 'Werktage') : alterText(alterTage),
      ton: rot ? 'crit' : '', beantwortetAm: beantwortet, nurHaken: Boolean(art),
    };
  });
}

/** So lange steht eine Lieferantenrechnung als "Ware unterwegs" in der Ansicht. */
export const WARE_TAGE = 7;
// Gutschrift, Mahnung und Storno fallen in der Lieferbeleg-Ablage auch unter "rechnung", heissen aber nicht "verladen".
const KEINE_WARE = /gutschrift|credit ?note|mahnung|zahlungserinnerung|kontoauszug|storno/i;

/**
 * "Ware unterwegs" (Inhaber 11.11.2026): Rechnungen gehen nie ans Laden-Postfach, aber eine Rechnung heisst bei
 * vielen Lieferanten "Ware wurde verladen". Quelle ist die Lieferbeleg-Ablage (stuendlicher Postfach-Lauf);
 * hier nur Rechnungen der letzten WARE_TAGE Tage von Absendern, die die privaten Stammdaten als Lieferant kennen
 * (`lieferant` gesetzt) - Dienstleister stehen dort nicht. Nie Betrag, Anhang oder Mailtext.
 * @param {object[]} belege  Belege mit { id, art, datum, betreff, lieferant, refs }
 * @param {object} o
 * @param {(id: string) => string} [o.nameVon]  Anzeigename aus den Stammdaten
 */
export function wareUnterwegs(belege = [], { jetzt = new Date(), nameVon = id => `Lieferant ${id}` } = {}) {
  const ab = jetzt.getTime() - WARE_TAGE * 86400000;
  return belege
    .filter(b => b?.art === 'rechnung' && b.lieferant && !KEINE_WARE.test(b.betreff || '')
      && new Date(b.datum).getTime() >= ab && new Date(b.datum).getTime() <= jetzt.getTime())
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)))
    .map((b) => {
      const am = new Date(b.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
      // Belegnummer (steht schon im Beleg) unterscheidet zwei Rechnungen desselben Lieferanten am selben Tag.
      const bezug = [b.refs?.belegnummer ? `Beleg ${b.refs.belegnummer}` : null, ...(b.refs?.betreffNummern || []), b.refs?.kommission].filter(Boolean).join(' · ').slice(0, 80);
      return {
        // Gleiche Form wie die Mail-Schluessel, damit der Haken dieselbe Ablage nutzen kann.
        schluessel: `ware:${String(b.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`,
        von: nameVon(b.lieferant), text: `Rechnung vom ${am} da, Ware vermutlich verladen`, bezug: bezug || null,
        seit: b.datum, alter: alterText(tageSeit(b.datum, jetzt)),
      };
    });
}

const ANGEKOMMEN = Object.freeze({
  kunde: 'Ware beim Kunden angekommen', kettler: 'Ware beim Kettler angekommen',
  abholung: 'Ware beim Lieferanten abgeholt', unklar: 'Lieferschein unklar – bitte ansehen',
});

/**
 * "Ware angekommen" (Benutzer 12.11.2026): digitale Lieferscheine kommen nicht mehr als Mail in den Laden. Der
 * Schein entsteht bei der Uebergabe mit Unterschrift, darum "angekommen" und nicht "unterwegs". Der Lieferort
 * stammt aus dem PDF (operations/lib/lieferbelege.mjs lieferortAusText). Lieferungen an den Laden erscheinen
 * nicht - die nimmt der Laden selbst an. Gleiche Zeilenform und gleiches Fenster wie wareUnterwegs.
 */
export function wareAngekommen(belege = [], { jetzt = new Date(), nameVon = id => `Lieferant ${id}` } = {}) {
  const ab = jetzt.getTime() - WARE_TAGE * 86400000;
  return belege
    .filter(b => b?.art === 'lieferschein' && b.lieferant && ANGEKOMMEN[b.lieferort?.ort]
      && new Date(b.datum).getTime() >= ab && new Date(b.datum).getTime() <= jetzt.getTime())
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)))
    .map(b => ({
      schluessel: `ware:${String(b.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`,
      von: nameVon(b.lieferant), text: ANGEKOMMEN[b.lieferort.ort],
      bezug: [b.refs?.belegnummer ? `Vorgang ${b.refs.belegnummer}` : null, ...(b.refs?.betreffNummern || []), b.refs?.kommission].filter(Boolean).join(' · ').slice(0, 80) || null,
      seit: b.datum, alter: alterText(tageSeit(b.datum, jetzt)),
    }));
}

/** Die eine rote Zeile oben: offene (von niemandem uebernommene) Eintraege in der roten Stufe. */
export function liegtZuLange(mails = [], todos = []) {
  const rot = l => l.filter(e => !e.zustaendig && e.ton === 'crit').length;
  const teile = [[rot(mails), 'Mail', 'Mails'], [rot(todos), 'Aufgabe', 'Aufgaben']].filter(([n]) => n).map(([n, e, v]) => mehrzahl(n, e, v));
  return teile.length ? `Liegt zu lange: ${teile.join(' und ')} – das hat noch niemand übernommen.` : null;
}

/** Aufgeteilt fuer eine Spalte: offen (rot zuerst, dann aelteste), darunter wer sich kuemmert (zuletzt uebernommen zuerst). */
export function teileSpalte(eintraege = []) {
  const offen = sortiereTodos(eintraege.filter(e => !e.zustaendig));
  const inArbeit = eintraege.filter(e => e.zustaendig).sort((a, b) => String(b.zustaendig.seit).localeCompare(String(a.zustaendig.seit)));
  return { offen, inArbeit };
}
