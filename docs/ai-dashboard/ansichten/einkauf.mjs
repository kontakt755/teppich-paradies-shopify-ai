/**
 * Ansicht "Einkauf" (#/einkauf): Reiter Je Auftrag (Standard), Je Lieferant, Belege, Musterlager, Produktdaten, Hilfe.
 * Teilmodule in ansichten/einkauf/.
 */
import { state } from '../kern/zustand.mjs';
import { esc } from '../kern/helfer.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { ensureAktualisierung, aktualisierenButton } from '../bausteine/aktualisierung.mjs';
import { viewEinkaufBestellungen } from './einkauf/bestellungen.mjs';
import { viewEinkaufAblauf } from './einkauf/ablauf.mjs';
import { viewEinkaufProduktdaten } from './einkauf/produktdaten.mjs';
import { viewEinkaufLieferant } from './einkauf/lieferanten.mjs';
import { viewEinkaufMusterlager } from './einkauf/musterlager.mjs';
import { viewEinkaufBelege, belegArbeit, ensureBelege } from './einkauf/belege.mjs';

function viewEinkaufHilfe() {
  return `<section class="card">
    <h2>Dein Tag beim Bestellen</h2>
    <p class="small muted">So gehst du die Bestellübersicht in der Praxis durch, Schritt für Schritt:</p>
    <ol style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li>Öffne den Tab „Bestellungen" und schau oben auf die Zahlen: wie viele Artikel und Muster noch zu bestellen sind und wie viele Aufträge ein Problem haben.</li>
      <li>Kümmere dich zuerst um den Kasten „Zuerst klären" – dort steht bei jedem Auftrag in Klartext, was fehlt, z. B. eine Großhändler-ID. War es nur eine Testbestellung oder ist der Auftrag anders erledigt, schließe ihn mit „Ohne Einkauf abschließen…" und einem Grund ab.</li>
      <li>Darunter steht je Lieferant eine Karte, von oben nach unten in Arbeitsschritten: <b>Ware bestellen</b> (je Artikel Menge, bei Maßanfertigung Fertigmaß und Einfassung, dazu Kunde und Auftragsnummer), <b>Muster bestellen</b> (je Kunde mit allen Farben), <b>Nachfassen</b> (bestellt, wartet zu lange). Darunter ruhig, was im Plan läuft. Rot markierte Artikel sind blockiert – der Grund steht dabei. Der farbige Knopf ist der Bestellweg: „Bestellmail öffnen", „Im Portal bestellen" (neuer Tab) oder „Anrufen".</li>
      <li>Der Knopf zeigt die fertige Bestellung: Empfänger, Betreff, Text. „Im Mailprogramm öffnen" legt die Mail an – abschicken tust du selbst. „Text kopieren" ist für Portal und Telefon. Artikel, die nicht in der Mail stehen, sind mit Grund aufgelistet (z. B. Artikelnummer fehlt).</li>
      <li>Danach fragt das Dashboard „Als bestellt markieren?". Ein Klick setzt alle Artikel dieser Mail auf „Bestellt"; die Bestellnummer des Lieferanten kannst du dazuschreiben (optional, hilft bei Rückfragen).</li>
      <li>„Positionen bearbeiten" klappt die einzelnen Artikel auf: Artikelnummer mit einem Klick kopieren, „Beim Lieferanten öffnen", „Liste kopieren", „Alle als bestellt markieren…" und der Status je Artikel.</li>
      <li>„Nachfassen“ erscheint, sobald eine Bestellung seit 7 Tagen wartet (gelb), ab 14 Tagen rot; „Ist eingetroffen“ an einer bestellten Ware trägt die Lieferung mit einem Klick ein. Ein Klick auf den Namen des Lieferanten zeigt Kontakt, Bestellweg, Lieferzeit und Verlauf; fehlen dort Angaben, steht dabei, welche (der Inhaber pflegt sie in einer privaten Datei).</li>
      <li>Sobald die Ware bei dir ankommt, setze die Position auf „Geliefert an uns"; sobald sie an den Kunden raus ist (verschickt oder abgeholt), auf „An Kunden raus"; zum Schluss auf „Erledigt".</li>
      <li>„An Kunden raus" bucht den Versand auch in Shopify, und der Kunde bekommt von Shopify die Versandmail. Im Fenster davor kreuzt du an, welche Artikel im Paket sind (der Rest bleibt offen), trägst die Sendungsnummer ein, wenn es eine gibt, und kannst die Mail abwählen, z. B. bei Abholung. Klappt die Buchung nicht, steht es rot an der Position – mit „In Shopify buchen" holst du sie nach.</li>
      <li>Der Filter über den Listen („Noch zu bestellen / Bestellt / Unterwegs / Erledigt") zeigt dir jederzeit, wie viele Artikel in welchem Schritt stehen. Ohne Auswahl siehst du alles, was noch nicht erledigt ist.</li>
    </ol>

    <h3 style="margin-top:20px">Musterlager</h3>
    <ul style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li><b>Einlagern:</b> Kommt ein Probestück 2 × 1 m (PVC, Linoleum) oder eine Bahn 4 m × 20 cm vom Lieferanten, im Reiter „Musterlager“ einlagern – mit Lagerplatz. Eingetroffene Probestücke schlägt die Seite unter „Einlagern?“ selbst vor.</li>
      <li><b>Danach passiert es von selbst:</b> Bestellt ein Kunde ein Muster, das im Lager liegt, steht es auf „aus dem Musterlager“ mit Platz. Es geht nicht in die Bestellmail an den Lieferanten; auf „Heute“ steht „Muster verschicken an …“.</li>
      <li><b>Leer?</b> „Ist leer“ klicken – dann gehen neue Musterbestellungen wieder an den Lieferanten. Einzelmuster zählen beim Verschicken von selbst ab.</li>
    </ul>

    <h3 style="margin-top:20px">Was tun, wenn etwas fehlt?</h3>
    <ul style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li><b>Ein Wert zeigt „Ungeklärt":</b> Das bedeutet, die Angabe ist in Shopify nicht (mehr) hinterlegt – oft weil eine Produktvariante zwischenzeitlich gelöscht wurde. Bitte den Artikel von Hand im Shopify-Adminbereich prüfen und, falls nötig, im Team klären. Nicht raten und nichts erfinden.</li>
      <li><b>Kein Lieferant-Link vorhanden:</b> Bestelle über den gewohnten Weg (Telefon/E-Mail) und melde die fehlende Produktseite, damit sie ergänzt werden kann.</li>
      <li><b>Eine Position lässt sich nicht weiterschalten oder eine Zahl sieht falsch aus:</b> Seite neu laden (der Stand liegt in einer lokalen Datei auf diesem Mac). Bleibt der Fehler, kurz im Team Bescheid geben – nichts wird automatisch verschickt, ein falscher Klick bestellt also nichts.</li>
      <li><b>Die Bestellübersicht bleibt leer:</b> Die Ansicht braucht den lokalen Server (<span class="mono">npm run dashboard</span>) und exportierte Bestelldaten. Ohne die Datei zeigt die Seite einen Hinweis statt erfundener Zahlen.</li>
    </ul>

    <h3 style="margin-top:20px">Begriffe kurz erklärt</h3>
    <ul style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li><b>Position:</b> eine einzelne Zeile innerhalb einer Kundenbestellung, meist ein Artikel in einer bestimmten Farbe/Größe – eine Bestellung kann mehrere Positionen haben.</li>
      <li><b>Ampel:</b> eine farbige Markierung, die auf einen Blick zeigt, wie es um einen Auftrag steht: grün = bereit, gelb = erst prüfen, rot = blockiert (z. B. fehlende Angabe).</li>
      <li><b>Großhändler-ID:</b> die interne Bestellnummer/Artikelnummer, unter der der Lieferant (Großhändler) den Artikel führt – nicht dieselbe Nummer wie in unserem eigenen Shop.</li>
      <li><b>Ungeklärt:</b> die Angabe fehlt oder konnte nicht automatisch ermittelt werden (siehe oben, „Was tun, wenn etwas fehlt?").</li>
      <li><b>Sichten:</b> eine neue Aufgabe wird zuerst bewertet (Priorität, Zuständigkeit, nächster Schritt), bevor jemand sie bearbeitet – vergleichbar mit „Posteingang sortieren".</li>
      <li><b>P0 / P1 / P2 / P3:</b> Prioritätsstufen für Aufgaben im Bereich „Technik", von P0 (kritisch, sofort) bis P3 (niedrig, hat Zeit).</li>
    </ul>

    <h3 style="margin-top:20px">Die drei Unteransichten im Detail</h3>
    <p><b>Bestellungen:</b> zeigt jede offene Kundenbestellung mit Ampel (grün = bereit, gelb = erst prüfen, rot = blockiert, z. B. fehlende Großhändler-ID oder Maßprüfungs-Problem) und darunter die Positionen, gruppiert nach Lieferant. Jede Zeile zeigt Kundenauftrag und Datum, Artikel, Farbe/Variante, die Kundenmenge und die daraus berechnete Bestellmenge beim Lieferanten samt Einheit, die Großhändler-ID, einen Link „Beim Lieferanten öffnen" (öffnet die Lieferanten-Produktseite in einem neuen Tab) und den Status mit dem Button für den nächsten Schritt. Über „Liste kopieren" kannst du die Bestellliste eines Lieferanten weiterhin komplett in eine Mail oder ein Bestellportal einfügen. Muster (Bestellungen von Produktmustern statt ganzer Ware) stehen in einer eigenen Liste. Der Auftrags-Link führt direkt zur Bestellung in Shopify.</p>
    <p><b>Status setzen:</b> „Bestellt" fragt nach der Bestellnummer des Lieferanten (optional, aber hilfreich bei Rückfragen) und merkt sich, wer wann bestellt hat. „Geliefert an uns" und „Erledigt" brauchen keine weitere Eingabe. „An Kunden raus" fragt, welche Artikel im Paket sind, und nach der Sendungsnummer; danach ist der Versand in Shopify gebucht und der Kunde hat die Versandmail. Der Filter über den Listen („Noch zu bestellen / Bestellt / Unterwegs / Erledigt") blendet die Listen entsprechend ein oder aus; erledigte Artikel erscheinen nur unter „Erledigt".</p>
    <p><b>Produktdaten:</b> zeigt je PRODUKT (nicht je Variante) eine Zeile: wie viele Varianten es hat, was fehlt und was der nächste Schritt ist. Oben steht ehrlich, wie viele von den insgesamt erfassten Produkten vollständig sind, wie viele Handarbeit brauchen und wie viele sich von selbst füllen, sobald der laufende Lieferantenabgleich weiterläuft. „Handarbeit" heißt: eine Bestellung ist blockiert, weil Lieferant, Artikelnummer, Farbnummer oder Bestellmenge fehlen – das muss jemand von Hand in der Preisliste nachschauen. Zusatzinformation wie Kollektion oder Hersteller blockiert nichts und taucht nur als „füllt sich automatisch" auf. Filter oben: zuerst die Produkte, die Handarbeit brauchen (dieselbe Zahl wie die Kachel) – daneben „Blockiert eine Bestellung" und „Alle offenen Produkte"; dazu Suche nach Produktname, Handle oder SKU und Filter nach Produktgruppe. Sortiert ist die Liste nach Dringlichkeit – was eine Bestellung aufhält, steht oben. Die Zahl „ohne Großhändler-ID" in der Kachel „Kundengeschäft" auf „Heute" zählt etwas anderes: offene Positionen in tatsächlichen Kundenbestellungen (Bestellübersicht), nicht Lücken im gesamten Produktkatalog – beide Zahlen dürfen auseinanderlaufen, das ist kein Widerspruch.</p>
    <p><b>Wichtig:</b> Alle drei Ansichten laufen nur lokal auf dem Mac (<span class="mono">npm run dashboard</span>), weil sie private Bestell- und Einkaufsdaten lesen. Auf der öffentlichen Seite (GitHub Pages) ist der Bereich Einkauf immer leer – das ist beabsichtigt, damit keine Kundendaten oder Lieferantennamen öffentlich werden. Der Auftragsfluss-Status liegt in einer eigenen lokalen Datei auf deinem Mac und wird nie ins Repository übernommen. Nichts hier wird automatisch verschickt oder bestellt; jede Bestellung bleibt ein bewusster, manueller Schritt. Nach Shopify schreibt aus diesem Bereich nur „An Kunden raus“ (Versand buchen) – und auch das erst nach deinem Klick im Fenster.</p>
  </section>`;
}

export function viewEinkauf() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Bestellen</h1><p class="sub">Hier bestellst du beim Lieferanten und verfolgst, bis die Ware da ist.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Einkaufsdaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  // Detailseite eines Lieferanten als Parameter (#/einkauf?lieferant=A) - bleibt damit im
  // Einkauf (Navigation, Rollen, Datenstand) und braucht keine eigene Route.
  if (state.route.params.get('lieferant')) { ensureAktualisierung(); return viewEinkaufLieferant(state.route.params.get('lieferant')); }
  // Standard ist "Je Auftrag" (Kunde bestellt -> wir bestellen beim Lieferanten). Alte Adressen
  // mit ?af= oder ?auftrag= zeigen weiter die Lieferanten-Ansicht, die dort gemeint war.
  const p = state.route.params;
  const roh = p.get('tab') === 'bestellungen' ? 'lieferant' : p.get('tab');
  const tab = ['ablauf', 'lieferant', 'belege', 'musterlager', 'produktdaten', 'hilfe'].includes(roh) ? roh
    : (p.get('af') || p.get('auftrag') || p.get('lf')) ? 'lieferant' : 'ablauf';
  const tabs = [['ablauf', 'Je Auftrag'], ['lieferant', 'Je Lieferant'], ['belege', 'Lieferantenpost'], ['musterlager', 'Musterlager'], ['produktdaten', 'Produktdaten'], ['hilfe', 'Anleitung']];
  ensureAktualisierung();
  // Die Zahl am Reiter "Belege" zeigt, ob dort etwas zu pruefen ist - auch von den anderen Reitern aus.
  ensureBelege();
  const zuPruefen = belegArbeit()?.summe || 0;
  const head = `<div class="page-head"><div><h1>Bestellen</h1><p class="sub">Hier bestellst du beim Lieferanten – je Auftrag der nächste Schritt: bestellen, Ware annehmen, Kunde informieren.</p></div>
      <div class="head-actions">${aktualisierenButton()}</div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" class="tab" role="tab" aria-selected="${tab === k}" data-param="tab" data-value="${k}">${esc(l)}${k === 'belege' && zuPruefen ? ` <span class="tab-zahl">${zuPruefen}</span>` : ''}</button>`).join('')}</div>`;
  const body = tab === 'ablauf' ? viewEinkaufAblauf() : tab === 'lieferant' ? viewEinkaufBestellungen() : tab === 'belege' ? viewEinkaufBelege() : tab === 'musterlager' ? viewEinkaufMusterlager() : tab === 'produktdaten' ? viewEinkaufProduktdaten() : viewEinkaufHilfe();
  return head + body;
}
