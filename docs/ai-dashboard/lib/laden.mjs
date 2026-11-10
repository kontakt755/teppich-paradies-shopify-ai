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

const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/**
 * @param {object} q
 * @param {object[]} q.rueckrufe    Zeilen von /api/kunden/rueckrufe (mit status, wiedervorlage)
 * @param {object[]} q.kundeWartet  operations/lib/laden.mjs kundeWartet()
 * @param {object[]} q.aufgaben     laden-aufgaben.json
 */
export function ladenTodos({ rueckrufe = [], kundeWartet = [], aufgaben = [] } = {}, { jetzt = new Date() } = {}) {
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
    ...aufgaben.filter(a => !a.erledigtAm).map(a => zeile({
      schluessel: `aufgabe:${a.id}`, art: a.art, von: null, text: a.text, seit: a.erstelltAm, frist: FRISTEN.laden_aufgabe, aufgabeId: a.id,
    })),
  ];
  return sortiereTodos(liste);
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
