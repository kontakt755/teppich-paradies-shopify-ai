/**
 * Verlegefotos als Produktbilder (Werkbank w-340): aus den Baustellenfotos der
 * Monteure (Social-Modul: Upload-Link und WhatsApp-Gruppe) wird je Baustelle
 * ein To-do im Control Center - "Fotos zu Produkt X bereit zur Sichtung" oder
 * "Produkt nicht im Shop". Hier stehen nur die Regeln; gelesen und geschrieben
 * wird in operations/scripts/verlegefotos-abgleich.mjs.
 *
 * Nichts davon haengt ein Bild an ein Produkt: das braucht die Sichtfreigabe.
 */

import { passendeProdukte, produktHinweis, FOTO_ART } from './baustellenfotos.mjs';

/** Kennung im Feld verknuepft.zweck - trennt diese To-dos von den Instagram-Eingaengen. */
export const ZWECK = 'produktbild';
export const SCHLUESSEL_OHNE_PRODUKT = 'verlegefotos-ohne-produkt';
/** Mehr Bilder je To-do sichtet niemand; der Rest bleibt im Social-Modul. */
export const BILDER_JE_EINTRAG = 8;

export const CHECKLISTE = Object.freeze([
  'Struktur des Bodens scharf erkennbar (das Wichtigste)',
  'Hell genug, kein Blitzfleck, nicht verwackelt',
  'Keine Personen, keine Spiegelungen von Personen',
  'Keine persönlichen Gegenstände, Namen, Klingelschilder, Hausnummern, Post',
  'Kein Werkzeug, keine Verpackung, kein Müll im Bild',
  'Bearbeitung nur Zuschnitt und Belichtung – Struktur und Muster nie verändern, keine KI',
  'Alt-Text als Kundenprojekt, nicht als Farbreferenz (Handyfotos zeigen die Farbe oft falsch)',
  'Hochladen erst nach Sichtfreigabe',
]);

/** Alt-Text fuer das Produktbild: sagt, was das Bild ist - und was es nicht ist. */
export function altText(produktTitel, farbe = null) {
  return `Kundenprojekt: ${produktTitel}${farbe ? ` in ${farbe}` : ''}, von Teppich Paradies verlegt. Handyfoto – die Farbe kann abweichen.`;
}

const checkliste = () => CHECKLISTE.map(p => `☐ ${p}`).join('\n');

/**
 * Was aus den Baustellen wird. Rein: keine Datei, keine Datenbank.
 *
 * baustellen: [{ id, titel, erstellt, bodenart, produkt, bilder: [{ pfad }] }] - nur geprüfte Bilder
 * boeden:     { "<id>": "Selene 620" } - im Buero nachgetragene Bodennamen
 * erledigt:   Set der Schluessel, zu denen es schon ein To-do gibt
 */
export function planeAbgleich(baustellen, produkte, { boeden = {}, erledigt = new Set() } = {}) {
  const eintraege = [];
  const ohneProdukt = [];
  for (const b of baustellen) {
    const schluessel = `social:${b.id}`;
    if (erledigt.has(schluessel) || !b.bilder?.length) continue;
    const boden = String(boeden[b.id] || b.produkt || '').trim();
    if (!boden) { ohneProdukt.push(b); continue; }

    const hinweis = produktHinweis(passendeProdukte(boden, produkte));
    const basis = { art: FOTO_ART, zweck: ZWECK, schluessel, boden, einwilligung: true,
      produkt: hinweis.handle, produktTitel: hinweis.titel, farbe: hinweis.farbe, sicher: hinweis.sicher };
    const kopf = `Baustelle „${b.titel}“ (Social-Eingang #${b.id}), ${b.bilder.length} geprüfte Bilder. Verlegt laut Angabe: ${boden}.`;

    if (hinweis.handle && hinweis.sicher) {
      eintraege.push({
        schluessel, bilder: b.bilder.slice(0, BILDER_JE_EINTRAG),
        titel: `Verlegefotos zu „${hinweis.titel}“ – bereit zur Sichtung`,
        beschreibung: `${kopf}\n${hinweis.text}.\n\nPrüfen:\n${checkliste()}\n\nAlt-Text: ${altText(hinweis.titel, hinweis.farbe)}`,
        erfolgskriterium: 'Bilder gesichtet: freigegeben und am Produkt, oder bewusst verworfen.',
        verknuepft: { ...basis, fall: 'sichtung' },
      });
    } else if (hinweis.handle) {
      eintraege.push({
        schluessel, bilder: b.bilder.slice(0, BILDER_JE_EINTRAG),
        titel: `Verlegefotos „${boden}“ – Produkt zuordnen`,
        beschreibung: `${kopf}\n${hinweis.text}\n\nNach der Zuordnung prüfen:\n${checkliste()}`,
        erfolgskriterium: 'Produkt zugeordnet und Bilder gesichtet, oder bewusst verworfen.',
        verknuepft: { ...basis, fall: 'zuordnen' },
      });
    } else {
      eintraege.push({
        schluessel, bilder: b.bilder.slice(0, 2),
        titel: `Verlegefotos „${boden}“ – Produkt nicht im Shop`,
        beschreibung: `${kopf}\nIm Shop nicht gefunden. Warum führen wir es nicht?\n☐ Führt es ein Großhändler, bei dem wir schon bestellen?\n☐ Gibt es einen anderen Bezugsweg (Hersteller direkt)?\n☐ Könnten wir es selbst versenden (Lagerware, Zuschnitt)?\n☐ Oder nur anders benannt? Dann den Shop-Namen nachtragen und den Lauf wiederholen.`,
        erfolgskriterium: 'Entschieden: ins Sortiment aufnehmen (Skill produktimport) oder bewusst nicht.',
        verknuepft: { ...basis, fall: 'nicht-im-shop' },
      });
    }
  }
  return { eintraege, ohneProdukt };
}

/** Ein Sammel-To-do statt 28 einzelner: ohne Bodennamen gibt es nichts abzugleichen. */
export function sammelEintrag(ohneProdukt) {
  const zeilen = ohneProdukt.slice(0, 40).map(b => `#${b.id} · ${String(b.erstellt).slice(0, 10)} · ${b.titel} · ${b.bilder.length} Bilder`);
  return {
    schluessel: SCHLUESSEL_OHNE_PRODUKT, bilder: [],
    titel: `Verlegefotos: bei ${ohneProdukt.length} Baustellen fehlt der verlegte Boden`,
    beschreibung: `Geprüfte Fotos liegen vor, aber niemand hat eingetragen, welcher Boden verlegt wurde. Ohne Namen kein Abgleich mit dem Shop.\n\nNachtragen (Name und Farbe laut Auftragszettel oder Etikett):\nnpm run verlegefotos:abgleich -- --boden <Nummer> "Name Farbe"\nDanach: npm run verlegefotos:abgleich -- --schreiben\n\n${zeilen.join('\n')}${ohneProdukt.length > 40 ? `\n… und ${ohneProdukt.length - 40} weitere (npm run verlegefotos:abgleich zeigt alle)` : ''}`,
    erfolgskriterium: 'Bodenname je Baustelle nachgetragen oder Baustelle bewusst ausgelassen.',
    verknuepft: { art: 'verlegefotos', zweck: ZWECK, schluessel: SCHLUESSEL_OHNE_PRODUKT, anzahl: ohneProdukt.length },
  };
}
