/**
 * Ansicht "Hilfe" (#/hilfe). Bewusst in Alltagssprache und ohne Fachbegriffe - sie ist
 * fuer neue Mitarbeiter am ersten Tag gedacht, nicht fuer Entwickler.
 */
import { esc } from '../kern/helfer.mjs';

function hilfeKarte(titel, inhalt) {
  return `<section class="card" style="margin-bottom:14px"><div class="card-head"><h2>${esc(titel)}</h2></div>${inhalt}</section>`;
}

/**
 * Je Menuepunkt ein Satz - dieselben Woerter wie in der Seitenleiste (index.html, BEGRIFFE.md).
 * tests/hilfe-menue.test.mjs prueft jeden Namen gegen index.html; wer das Menue umbenennt, muss
 * auch hier nachziehen (Rundgang 26.10.: die Hilfe kannte die Packstation noch nicht).
 */
export const MENUE_KURZ = [
  ['Heute', 'Die Shop-Übersicht: zuerst die Warenbestellungen, dann Probleme, Muster und Versand. Ein Knopf je Zeile führt direkt hin.'],
  ['Bestellungen', 'Alle Bestellungen der Kunden: was offen ist und was als Nächstes dran ist.'],
  ['Muster bestellen', 'Muster, die noch beim Lieferanten bestellt werden müssen. Vollständige, kostenlose Muster kann das Dashboard selbst per Mail bestellen.'],
  ['Kunden nach Produkt fragen', 'Wer seit 5 Tagen Muster hat, wird gefragt, wie sie angekommen sind: Anruf oder Rückfrage-Mail. Ergebnis anklicken, Notiz eintippen. Oben steht, welche Gründe bisher genannt wurden. Am Handy unter „Mehr“.'],
  ['Packstation', 'Musterumschläge packen. Reiter „Bestellung packen“: je Bestelltag ein Umschlag, Bestellungen eines Kunden vom selben Tag zusammen. Reiter „Muster kommt an“: ein eingetroffenes Muster in den richtigen Umschlag.'],
  ['Musterlager', 'Muster, die wir selbst da haben: was noch liegt, was reserviert ist, einlagern und Aufkleber drucken. Am Handy unter „Mehr“.'],
  ['Lexikon', 'Alles zu einem Produkt: Preis, Farben, Eigenschaften, wo man es bestellt.'],
  ['Eigene Aufkleber drucken', 'Aufkleber mit frei getipptem Text, ohne Produkt, zum Beispiel Wegweiser fürs Lager.'],
  ['Kunden & Einkauf', 'Aufklappen: Kunden suchen, Service-Anfragen, Bestellen beim Lieferanten (mit dem Reiter „Lieferantenpost“ für Auftragsbestätigungen und Lieferscheine), Genossenschaften, Hausverwaltungen.'],
  ['Shop & Inhalte', 'Sonderposten: Reststück oder Rolle im Laden als verkauft buchen, vor Zahlung und Zuschnitt. Bildrechte und Social Media nur mit Büro- oder Inhaberzugang.'],
  ['Verwaltung', 'Aufgaben, Zugänge und diese Hilfe. Was du siehst, hängt von deinem Zugang ab.'],
  ['Fehler melden', 'Ganz unten in der Seitenleiste: kurz schreiben, was nicht stimmt. Die Technik bekommt die Seite mit.'],
];

/**
 * Die Shop-Uebersicht ("Heute") von oben nach unten, mit denselben Ueberschriften wie auf der Seite.
 * tests/hilfe-menue.test.mjs prueft jeden Namen gegen heute.mjs und ihre Bausteine: bis 06.11.2026
 * beschrieb die Hilfe noch einen Block, den es seit 12.10. nicht mehr gab (#1996).
 */
export const HEUTE_BLOECKE = [
  ['Warenbestellungen', 'Offene Warenaufträge, bezahlte Kunden zuerst, je Zeile der nächste Schritt. Ist erst ein Teil der Ware da, steht dort „Teillieferung: 1 von 2 Warenartikeln da – fehlt noch: …“.'],
  ['Von uns abschicken', 'Ware, die wir selbst zuschneiden, packen und verschicken.'],
  ['Probleme', 'Was rot ist und eine Bestellung aufhält. Ein Knopf je Zeile führt hin. Steht eine Bestellung schon lange still, stehen dort auch „Abschließen…“ und „Läuft noch“.'],
  ['Muster & Packstation', 'Muster bestellen und Umschläge packen; darunter „Kunden nach Produkt fragen“.'],
  ['Versand & Kunden nachfassen', 'Versandte Bestellungen ohne Empfangsbeleg, automatische Nachfrage-Mails und Bewertungen.'],
  ['Im Hintergrund', 'Ruhige Zeilen: was die Musterautomatik in 7 Tagen bestellt hat und wie alt die Daten sind, mit „Jetzt aktualisieren“.'],
  ['Weitere Bereiche', 'Zum Aufklappen: Laden & Anfragen, Aufgaben, Shop & Technik (nur Inhaber) und die bisherige Gesamtübersicht.'],
];
/** Bloecke, die nur erscheinen, wenn es dort etwas gibt (dieselben Namen wie auf der Seite). */
export const HEUTE_BEI_BEDARF = ['Von uns abschicken', 'Probleme', 'Musterautomatik', 'Alte Bestellungen aufräumen'];

function heuteKarte() {
  const nurBeiBedarf = n => (HEUTE_BEI_BEDARF.includes(n) ? ' <span class="muted">(nur wenn es etwas gibt)</span>' : '');
  return hilfeKarte('Morgens: Seite „Heute"', `
      <p>Die Seite heißt <b>Shop-Übersicht</b>. Von oben nach unten:</p>
      <ol style="margin:0;padding-left:20px;line-height:1.7">
        ${HEUTE_BLOECKE.map(([n, t]) => `<li><b>${esc(n)}</b>${nurBeiBedarf(n)} – ${esc(t)}</li>`).join('')}
      </ol>
      <p style="margin-top:8px">Nur bei Bedarf stehen dazwischen außerdem <b>Musterautomatik</b> mit „Klärung nötig“ (Störung oder fehlende Angaben) und <b>Alte Bestellungen aufräumen</b> (seit 14 Tagen, bei Ware 30, keine Bewegung).</p>
      <p class="small muted"><b>× Rot</b> hält eine Bestellung auf, <b>! Gelb</b> ist zu tun, ohne Zeichen ist alles in Ordnung. Grün gibt es nicht.</p>
      <p class="small muted">Über der Seite steht, wie alt die Daten sind („Stand: vor 3 Min.“). Die Seite holt neue Daten alle paar Minuten von selbst – auch während sie offen ist; was du gerade tippst, bleibt stehen.</p>`);
}

/** Die Ablaeufe, die jeden Tag vorkommen - Schritt fuer Schritt, mit den Woertern der Knoepfe. */
const ABLAEUFE = [
  ['Kunde bestellt – bis die Ware beim Kunden ist', [
    'Unter <b>Bestellungen</b> (oder auf <b>Heute</b>) steht „Ware beim Lieferanten bestellen“. Bestellung öffnen.',
    'Je Lieferant ein Knopf <b>Bestellmail öffnen</b>: Mail prüfen, selbst abschicken, dann <b>Als bestellt markieren</b>.',
    'Kommt die Ware: <b>Ware ist angekommen</b> drücken und den Kunden anrufen oder anschreiben.',
    'Geht die Ware raus: <b>An Kunden raus…</b> – die Sendungsnummer vom Paketaufkleber eintragen. Jedes Paket hat seine eigene Nummer.',
  ]],
  ['Muster packen', [
    'Links auf <b>Packstation</b>, Reiter <b>Bestellung packen</b>: je Bestelltag ein Umschlag. Umschlag aufklappen – der nächste Schritt leuchtet, ganz oben steht <b>Begleitblatt drucken</b>.',
    '<b>1 · Bestellung drucken</b>: <b>Aufkleber und Adresse drucken</b>. Das Begleitblatt (A4) kommt mit in den Umschlag.',
    '<b>2 · Was ist da?</b> Jedes Muster überkleben, in den Umschlag legen und abhaken. Fehlt eins: <b>Fehlt noch – zurücklegen</b>.',
    '<b>3 · Zukleben und verschicken</b>: Umschlag zukleben, dann <b>Umschlag gepackt – verschicken…</b> und in der Karte bestätigen. Gepackt heißt verschickt: der Kunde bekommt sofort die Versandmail, danach geht der Umschlag zur Post. Zurücknehmen geht dann nicht mehr.',
    'Steht etwas im Reiter <b>Gepackt</b>, wurde es nie als verschickt eingetragen. Liegt der Umschlag noch im Regal: zur Post und <b>Verschickt – Kunde informieren…</b>. War er schon früher raus: <b>War schon früher raus…</b> (ohne Versandmail).',
    'Kommt ein Paket Muster vom Lieferanten: Reiter <b>Muster kommt an</b>. Eintippen, was auf dem Muster steht – die Karte sagt, in welchen Umschlag es gehört.',
    '<b>× Rot</b> heißt: der Kunde wartet auf uns – ein Muster kommt nicht, eine Angabe fehlt, beim Lieferanten seit 14 Tagen bestellt, seit 7 Tagen bezahlt und nicht bestellt oder nie als verschickt eingetragen. <b>! Gelb</b>: seit 7 Tagen bestellt (nachhaken), noch nicht bestellt oder zu klären. Ohne Zeichen ist alles in Ordnung. Die Reiter oben zählen die roten Umschläge.',
  ]],
  ['Genossenschaft anschreiben', [
    'Unter <b>Kunden &amp; Einkauf</b> auf <b>Genossenschaften</b>: oben steht „Als Nächstes“ mit der Firma, die jetzt dran ist.',
    '<b>E-Mail öffnen</b> (der Text steht schon drin) und selbst abschicken – oder <b>Anrufen</b>.',
    'Danach <b>Erledigt: angeschrieben</b> drücken. Zum Nachfassen erscheint die Firma rechtzeitig wieder.',
  ]],
  ['Hausverwaltung pflegen', [
    'Unter <b>Kunden &amp; Einkauf</b> auf <b>Hausverwaltungen</b>. Neue Verwaltung mit <b>+ Hausverwaltung</b> – der Name genügt.',
    'Auf den Namen klicken: dort <b>+ Objekt</b> (Adresse, Zahl der Wohnungen) und je Objekt <b>+ Angebot oder Auftrag</b> mit der Lexware-Nummer.',
    'Über <b>Bearbeiten</b> den Stand setzen und ein Datum bei „Wieder melden am“. Ist es so weit, steht die Verwaltung oben in der Liste.',
  ]],
];

function inEinerMinute() {
  return `<section class="card hilfe-kurz" style="margin-bottom:14px"><div class="card-head"><h2>In 1 Minute erklärt</h2></div>
    <ul style="margin:0;padding-left:20px;line-height:1.7">
      ${MENUE_KURZ.map(([n, t]) => `<li><b>${esc(n)}</b> – ${esc(t)}</li>`).join('')}
    </ul>
    ${ABLAEUFE.map(([titel, schritte]) => `<h3 style="margin:16px 0 4px;font-size:1rem">${esc(titel)}</h3>
      <ol style="margin:0;padding-left:20px;line-height:1.7">${schritte.map(s => `<li>${s}</li>`).join('')}</ol>`).join('')}
    <p class="small muted" style="margin-top:12px">Die Seite lädt neue Daten von selbst. Oben steht, wie alt sie sind („Stand: vor 3 Min.“). Steht dort ein farbiger Hinweis, sind Daten nicht aktuell – dann dem Inhaber Bescheid geben.</p>
  </section>`;
}

export function viewHilfe() {
  return `
    <div class="page-head"><div><h1>So arbeitest du damit</h1><p class="sub">Hier stehen die wichtigsten Handgriffe – in der Reihenfolge, in der sie im Laden vorkommen.</p></div></div>

    ${inEinerMinute()}

    ${heuteKarte()}

    ${hilfeKarte('Ein Kunde ruft an', `
      <ol style="margin:0;padding-left:20px;line-height:1.9">
        <li>Oben auf <b>Suche</b> klicken (oder ⌘K drücken).</li>
        <li>Name, Telefonnummer, E-Mail oder Bestellnummer tippen – die Treffer kommen beim Tippen.</li>
        <li>Auf den Kunden klicken: Kontakt, Anschrift und alle Bestellungen mit Positionen.</li>
      </ol>
      <p class="small muted" style="margin-top:8px">Steht bei der Telefonnummer „(aus der Lieferadresse)", stammt sie aus der Bestellung, nicht aus dem Kundenkonto – anrufen kannst du trotzdem.</p>`)}

    ${hilfeKarte('Der Kunde nennt einen Produktnamen', `
      <p>Denselben Weg nehmen: <b>Suche</b> öffnen und den Produktnamen tippen – oder links auf <b>Lexikon</b>.</p>
      <p>Die Produktseite hat zwei Teile: <b>Für das Kundengespräch</b> (Preis ab, Farben, Material, Brandverhalten, Fußbodenheizung) und <b>Zum Bestellen</b> (unsere SKU, Lieferant, Artikelnummer, Bestelleinheit, Link zum Lieferanten).</p>
      <p>Die <b>Mengenhilfe</b> rechnet die Kundenmenge in Pakete um. Bei einem Muster zeigt das Lexikon das Originalprodukt beim Lieferanten.</p>
      <p><b>Bestellbarkeit</b> oben im Lexikon: <b>× Nur rot</b> zeigt Produkte, die wir so nicht bestellen können (Lieferant, Artikelnummer oder Bestelleinheit fehlt, nichts lieferbar). <b>! Nur gelb</b> zeigt Produkte mit einzelnen nicht lieferbaren Farben oder ohne Raumbild. Noch einmal tippen hebt den Filter auf.</p>`)}

    ${hilfeKarte('Beim Lieferanten bestellen', `
      <ol style="margin:0;padding-left:20px;line-height:1.9">
        <li>Unter <b>Kunden &amp; Einkauf</b> auf <b>Bestellen</b>, Reiter <b>Je Lieferant</b>: je Lieferant eine Karte in drei Schritten – <b>Ware bestellen</b>, <b>Muster bestellen</b>, <b>Nachfassen</b> –, darunter, was im Plan läuft. Was schon beim Kunden ist, zählt dort als erledigt.</li>
        <li>Der farbige Knopf ist der Bestellweg dieses Lieferanten: <b>Bestellmail öffnen</b>, <b>Im Portal bestellen</b> oder <b>Anrufen</b>. Muster haben einen eigenen Knopf.</li>
        <li>Die Bestellung steht fertig da. <b>Im Mailprogramm öffnen</b> – Warenbestellungen schickst du selbst ab. Nur vollständige, kostenlose Muster kann das Dashboard selbst per Mail bestellen – die stehen dann schon als „bestellt“ da. Was nicht in der Mail steht, ist mit Grund aufgelistet.</li>
        <li>Danach fragt das Dashboard <b>Als bestellt markieren?</b> – ein Klick setzt alle Artikel der Mail auf „Bestellt".</li>
        <li><b>Positionen bearbeiten</b> klappt die einzelnen Artikel auf: Artikelnummer kopieren, beim Lieferanten öffnen, Status je Artikel setzen.</li>
        <li>Versehentlich „bestellt“ geklickt? <b>Rückgängig</b> direkt danach, oder später <b>Zurück auf offen…</b> am Artikel bzw. <b>Alle zurück auf offen…</b> an der Karte.</li>
        <li>Muster selbst da (Katalog, Musterlager)? <b>Haben wir da…</b> am Muster oder in der Kundenakte: dann wird es nicht bestellt, sondern erscheint als „Muster vorbeibringen“ bzw. „Muster verschicken“ – mit Ort des Kunden.</li>
      </ol>
      <p style="margin-top:8px"><b>Musterlager:</b> Kommt ein Probestück 2 × 1 m (PVC, Linoleum) oder eine Bahn 4 m × 20 cm vom Lieferanten, dort mit Lagerplatz einlagern – eingetroffene Probestücke schlägt die Seite unter <b>Einlagern?</b> vor. Bestellt ein Kunde ein Muster, das im Lager liegt, steht es auf „aus dem Musterlager“ und geht nicht in die Bestellung an den Lieferanten. Ist nichts mehr da: <b>Ist leer</b>.</p>
      <p style="margin-top:8px"><b>Lieferantenpost</b> (Reiter unter <b>Bestellen</b>): was die Lieferanten geschickt haben – Auftragsbestätigung, Lieferschein, Storno – und ob es zu unserem Stand passt. Den Schritt setzt trotzdem immer ein Mensch.</p>
      <p class="small muted" style="margin-top:8px"><b>! Gelb</b> heißt: seit 7 Tagen bestellt, bitte nachhaken. <b>× Rot</b>: seit 14 Tagen, Liefertermin vorbei, Bestellung blockiert oder Muster nicht lieferbar. Ein Klick auf den Namen zeigt Kontakt, Lieferzeit und Verlauf des Lieferanten.</p>`)}

    ${hilfeKarte('Was die Kennzeichen bedeuten', `
      <ul style="margin:0;padding-left:20px;line-height:1.9">
        <li><b>Fertig / In Arbeit</b> bei Kunden: ob bei dieser Bestellung noch etwas offen ist.</li>
        <li><b>Liegengeblieben</b>: der Kunde hatte den Warenkorb voll und hat abgebrochen.</li>
        <li><b>aus Shopify, keine Bestellung hier</b>: den Kunden gibt es, seine Bestellungen liegen außerhalb der hier geladenen Daten.</li>
      </ul>`)}

    ${hilfeKarte('„nicht hinterlegt" heißt: es fehlt wirklich', `
      <p>Das Dashboard rät nie. Steht irgendwo „nicht hinterlegt", „ungeklärt" oder ein Grund statt einer Zahl, dann fehlt die Angabe in Shopify oder beim Lieferanten – dann lieber nachfragen als schätzen. Oft wurde eine Produktvariante gelöscht: den Artikel in Shopify prüfen und im Team klären.</p>
      <ul style="margin:0;padding-left:20px;line-height:1.9">
        <li><b>Kein Link zum Lieferanten:</b> auf dem gewohnten Weg bestellen (Telefon, E-Mail) und die fehlende Produktseite melden.</li>
        <li><b>Ein Artikel lässt sich nicht weiterschalten oder eine Zahl sieht falsch aus:</b> Seite neu laden. Bleibt es so, im Team Bescheid geben. Einen Stand zu setzen bestellt nichts beim Lieferanten.</li>
      </ul>`)}

    ${hilfeKarte('Begriffe kurz erklärt', `
      <ul style="margin:0;padding-left:20px;line-height:1.9">
        <li><b>Position:</b> eine Zeile einer Kundenbestellung, meist ein Artikel in einer Farbe oder Größe. Eine Bestellung kann mehrere Positionen haben.</li>
        <li><b>Ampel:</b> <b>× Rot</b> hält auf (Angabe fehlt, Muster nicht lieferbar, 14 Tage beim Lieferanten, Liefertermin vorbei), <b>! Gelb</b> ist zu tun (noch nicht bestellt, seit 7 Tagen bestellt: nachhaken). Ohne Zeichen ist alles in Ordnung – Grün gibt es nicht.</li>
        <li><b>Artikelnummer beim Lieferanten:</b> die Nummer, unter der der Lieferant den Artikel führt – nicht unsere SKU im Shop.</li>
        <li><b>Teillieferung:</b> ein Teil der Ware ist bei uns, der Rest noch beim Lieferanten. Dann steht „Teillieferung: 1 von 2 Warenartikeln da – fehlt noch: …“, und der Kunde wird erst informiert, wenn alles da ist.</li>
      </ul>`)}

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
      <p class="small muted" style="margin-top:8px">Der Bereich <b>Technik</b> (unter „Verwaltung“, nur für den Inhaber) ist etwas anderes: dort steht die Arbeit an Shop und Technik (GitHub-Aufgaben). Für den Ladenalltag brauchst du ihn nicht.</p>`)}

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
        <li>Daten sehen alt aus? Oben auf „Stand“ schauen. Steht dort ein farbiger Hinweis „Nicht aktuell“, dem Inhaber Bescheid geben.</li>
        <li>Seite leer oder Fehlermeldung? Einmal neu laden (⌘R). Bleibt es: <button type="button" class="btn btn-sm" data-fehler-melden>Fehler melden</button> – auch in der Seitenleiste unten. Die Technik bekommt die Meldung samt Seite, und du siehst dort, wann sie behoben ist.</li>
        <li>Lagerbestand: aktuell führt der Shop keinen echten Bestand – die 999 ist ein Platzhalter, keine Menge.</li>
      </ul>`)}
  `;
}
