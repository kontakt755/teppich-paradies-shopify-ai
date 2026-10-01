/**
 * Ansicht "Hilfe" (#/hilfe). Bewusst in Alltagssprache und ohne Fachbegriffe - sie ist
 * fuer neue Mitarbeiter am ersten Tag gedacht, nicht fuer Entwickler.
 */
import { esc } from '../kern/helfer.mjs';

function hilfeKarte(titel, inhalt) {
  return `<section class="card" style="margin-bottom:14px"><div class="card-head"><h2>${esc(titel)}</h2></div>${inhalt}</section>`;
}

export function viewHilfe() {
  return `
    <div class="page-head"><div><h1>So arbeitest du damit</h1><p class="sub">Die wichtigsten Handgriffe – in der Reihenfolge, in der sie im Laden vorkommen.</p></div></div>

    ${hilfeKarte('Morgens: Seite „Heute"', `
      <p>Ganz oben steht das Kundengeschäft: offene Aufträge, was noch beim Lieferanten bestellt werden muss, Muster.</p>
      <p><b>Nicht liegen lassen</b> darunter ist Geld, das schon im Haus war: bezahlte Bestellungen ohne Versand, Angebote, auf die jemand wartet, und abgebrochene Warenkörbe. Erscheint der Block nicht, gibt es dort nichts zu tun.</p>
      <p class="small muted">Rechts oben steht, wann die <b>Aufgaben</b> zuletzt geholt wurden – nur die. Wie alt die Bestell-, Kunden- und Lexikondaten sind, steht je Quelle unter <i>Mehr → Insights → Systemzustand</i>. „Jetzt aktualisieren" holt die Betriebsdaten neu.</p>`)}

    ${hilfeKarte('Ein Kunde ruft an', `
      <ol style="margin:0;padding-left:20px;line-height:1.9">
        <li>Oben auf <b>Suche</b> klicken (oder ⌘K drücken).</li>
        <li>Name, Telefonnummer, E-Mail oder Bestellnummer tippen – die Treffer kommen beim Tippen.</li>
        <li>Auf den Kunden klicken: Kontakt, Anschrift und alle Bestellungen mit Positionen.</li>
      </ol>
      <p class="small muted" style="margin-top:8px">Steht bei der Telefonnummer „(aus der Lieferadresse)", stammt sie aus der Bestellung, nicht aus dem Kundenkonto – anrufen kannst du trotzdem.</p>`)}

    ${hilfeKarte('Der Kunde nennt einen Produktnamen', `
      <p>Denselben Weg nehmen: <b>Suche</b> öffnen und den Produktnamen tippen – oder oben auf <b>Lexikon</b>.</p>
      <p>Die Produktseite hat zwei Teile: <b>Für das Kundengespräch</b> (Preis ab, Farben, Material, Brandverhalten, Fußbodenheizung) und <b>Zum Bestellen</b> (unsere SKU, Lieferant, Artikelnummer, Bestelleinheit, Link zum Lieferanten).</p>
      <p>Die <b>Mengenhilfe</b> rechnet die Kundenmenge in Pakete um. Bei einem Muster zeigt das Lexikon das Originalprodukt beim Lieferanten.</p>`)}

    ${hilfeKarte('Beim Lieferanten bestellen', `
      <ol style="margin:0;padding-left:20px;line-height:1.9">
        <li>Oben auf <b>Einkauf</b>: dort stehen die Aufträge und was je Auftrag zu bestellen ist.</li>
        <li>Artikelnummer anklicken – sie wird kopiert.</li>
        <li><b>Beim Lieferanten öffnen</b> führt direkt zum Artikel; steht dort <b>suchen</b>, ist kein Direktlink hinterlegt und die Suche beim Lieferanten wird vorbereitet.</li>
        <li>Nach dem Bestellen den Status setzen, damit der Nächste sieht, was schon läuft.</li>
      </ol>`)}

    ${hilfeKarte('Was die Kennzeichen bedeuten', `
      <ul style="margin:0;padding-left:20px;line-height:1.9">
        <li><b>Fertig / In Arbeit</b> bei Kunden: ob bei dieser Bestellung noch etwas offen ist.</li>
        <li><b>Bezahlt, noch nicht versandt</b>: Geld ist da, Ware nicht raus – das hat Vorrang.</li>
        <li><b>Angebot wartet auf Antwort</b>: ein Angebot wurde erstellt, aber nie bezahlt.</li>
        <li><b>Liegengeblieben</b>: der Kunde hatte den Warenkorb voll und hat abgebrochen.</li>
        <li><b>aus Shopify, keine Bestellung hier</b>: den Kunden gibt es, seine Bestellungen liegen außerhalb der hier geladenen Daten.</li>
      </ul>`)}

    ${hilfeKarte('„nicht hinterlegt" heißt: es fehlt wirklich', `
      <p>Das Dashboard rät nie. Steht irgendwo „nicht hinterlegt", „ungeklärt" oder ein Grund statt einer Zahl, dann fehlt die Angabe in Shopify oder beim Lieferanten – dann lieber nachfragen als schätzen.</p>`)}

    ${hilfeKarte('Aufgaben und Notizen', `
      <p>Der Bereich <b>Aufgaben</b> ist für alles, was im Betrieb ansteht – Laden, Lager, Baustelle, Kunden, Lieferanten.</p>
      <ul style="margin:0;padding-left:20px;line-height:1.9">
        <li><b>+ Erfassen</b> (oben rechts, oder Taste <b>n</b>): hinschreiben, fertig. Art, Person, Bereich und Termin schlägt das Dashboard vor – alles änderbar.</li>
        <li><b>Meine Aufgaben</b>: nur was auf dich läuft. „Fokus" zeigt, was jetzt zählt.</li>
        <li><b>Meine Notizen</b>: dein privater Block. Niemand sonst sieht ihn – auch der Chef nicht. Mit einem Klick wird daraus eine Aufgabe.</li>
        <li><b>Team-Aufgaben / Team-Notizen</b>: alles, was andere angeht.</li>
        <li><b>✓ Abhaken</b> erledigt eine Aufgabe. Erledigtes bleibt im <b>Archiv</b> auffindbar.</li>
        <li><b>Wiederholung</b> in der Aufgabe (z. B. „monatlich"): nach dem Abhaken taucht sie am nächsten Termin von selbst wieder auf.</li>
        <li><b>Anhänge</b>: Bilder, PDF oder Text bis 10 MB direkt an der Aufgabe.</li>
        <li><b>Jetzt prüfen</b> misst Aufgaben mit hinterlegtem Erfolgskriterium am echten Shop – automatisch auch jeden Morgen um 9:30.</li>
      </ul>
      <p class="small muted" style="margin-top:8px">Der Bereich <b>Entwicklung</b> unter „Mehr" ist etwas anderes: dort steht die Arbeit an Shop und Technik (GitHub, KI-Läufe). Für den Ladenalltag brauchst du ihn nicht.</p>`)}

    ${hilfeKarte('Aufgaben aus ChatGPT oder von einem Zettel übernehmen', `
      <p>Im Bereich <b>Aufgaben</b> oben auf <b>Liste einfügen</b>. Eine Zeile je Aufgabe – Aufzählungszeichen, Nummerierung und Kästchen werden automatisch entfernt, Überschriften übersprungen.</p>
      <p>Dann <b>Vorschau</b>: Jede Zeile bekommt einen Vorschlag für Art, Bereich, Person und Termin. Zeilen, die es vielleicht schon gibt, sind rot markiert und <b>nicht</b> angehakt. Mit <b>Ausgewählte anlegen</b> geht nur rein, was du auch willst.</p>
      <p class="small muted">Das kannst du ChatGPT sagen, damit die Liste gleich passt:</p>
      <pre class="mono small" style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:8px;margin:6px 0 0">Gib mir die offenen Aufgaben als einfache Liste.
Eine Zeile je Aufgabe, keine Unterpunkte, keine Erklärungen.
Beginne jede Zeile mit einem Bindestrich.
Schreib die Tätigkeit ans Ende: „Preisliste einpflegen“, nicht „Einpflegen der Preisliste“.
Wenn jemand zuständig ist, nenne den Namen am Anfang.
Wenn es einen Termin gibt, schreib „heute“, „morgen“ oder das Datum dazu.</pre>`)}

    ${hilfeKarte('Wenn etwas nicht stimmt', `
      <ul style="margin:0;padding-left:20px;line-height:1.9">
        <li>Daten sehen alt aus? Rechts oben auf den Stand schauen und <b>Jetzt aktualisieren</b> drücken.</li>
        <li>Seite leer oder Fehlermeldung? Einmal neu laden (⌘R). Bleibt es, bei Ahmet melden.</li>
        <li>Lagerbestand: aktuell führt der Shop keinen echten Bestand – die 999 ist ein Platzhalter, keine Menge.</li>
      </ul>`)}
  `;
}
