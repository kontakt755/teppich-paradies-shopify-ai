/**
 * "Probleme" auf der Shop-Übersicht (w-206, Fehlersuche 28.10.2026). Seit dem Rundgang vom
 * 26.10. stand die To-do-Liste nur noch in den Alltagssichten hinter "Weitere Bereiche"; rote
 * Meldungen - Mac-Dienst gestoert, Speicher fast voll, Sicherung fehlgeschlagen, aus der
 * Bestellung entfernte Positionen, ueberschrittener Liefertermin - sah dort niemand.
 *
 * Rot heisst: ein Problem, das heute jemand loesen muss (Skill control-center, Farbe). Das gehoert
 * nach oben zu dem, was Geld oder Aerger bedeutet. Gelbes und Normales bleibt in den
 * Alltagssichten, damit die Warenkunden direkt darunter zuerst kommen. Ohne rotes To-do steht
 * hier nichts - ein leerer Kasten waere Rauschen.
 *
 * Nicht hier: Laden-/Treppenanfragen, Angebote aus Kundenfaellen und Team-Aufgaben - auch wenn
 * sie rot sind. Der Inhaber hat sie am 22.10. aus dem taeglichen Fokus in "Weitere Bereiche"
 * geschoben; die Anfragen stehen dort schon mit Zahl und Alter. In der ersten Probe (29.10.)
 * waren sonst 6 von 8 "Problemen" zwei Wochen alte Treppenanfragen und die Warenkunden rutschten
 * am Handy aus dem Bild. Rueckrufe bleiben: sie haengen an einer Shop-Bestellung.
 *
 * Reine Funktion ohne DOM: heute.mjs liefert die sortierte To-do-Liste der Sicht und den
 * Zeilen-Zeichner (todoZeile), damit Knoepfe und Dialoge dieselben bleiben wie in der Liste.
 */

/** Mehr als drei rote Zeilen schieben die Warenkunden aus dem Blick - der Rest klappt auf. */
export const PROBLEME_SICHTBAR = 3;

/** Arten aus dem Nebenbereich "Laden, Aufgaben" (Inhaber 22.10.) - bleiben hinter "Weitere Bereiche". */
export const NEBENBEREICH_ARTEN = Object.freeze(['service', 'angebot', 'aufgabe']);

/** Nur das Rote ohne den Nebenbereich - die Liste ist schon sortiert (rot zuerst, darin das Aelteste oben). */
export function nurProbleme(todos) {
  return (todos || []).filter(t => t && t.ton === 'crit' && !NEBENBEREICH_ARTEN.includes(t.art));
}

/**
 * @param {object[]} todos  sortierte To-dos einer Sicht (lib/todos.mjs sortiereTodos)
 * @param {object} p
 * @param {(todo: object) => string} p.zeile  zeichnet eine To-do-Zeile (heute.mjs todoZeile)
 * @returns {string} HTML oder '' ohne rotes To-do
 */
export function problemeBlock(todos, { zeile }) {
  const rot = nurProbleme(todos);
  if (!rot.length) return '';
  const oben = rot.slice(0, PROBLEME_SICHTBAR);
  const rest = rot.slice(PROBLEME_SICHTBAR);
  return `<section class="heute-probleme" aria-labelledby="heuteProbleme"><div class="heute-geschaeft-kopf">
    <h2 id="heuteProbleme">Probleme · ${rot.length}</h2>
    <p>Rot heißt: das muss heute jemand lösen. Alles Weitere steht unter „Weitere Bereiche“.</p></div>
    <div class="heute-todos">${oben.map(zeile).join('')}${rest.length
    ? `<details class="heute-rest"><summary>${PROBLEME_SICHTBAR} von ${rot.length} – alle anzeigen</summary>${rest.map(zeile).join('')}</details>` : ''}</div>
  </section>`;
}
