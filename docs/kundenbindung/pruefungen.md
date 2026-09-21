# Nur geprüft, nicht gebaut: Konfiguration speichern und optionale Ideen

Stand 2026-09-21. Alles hier ist Analyse und Empfehlung.

## 1. Konfiguration speichern / per E-Mail zusenden

### Wie die Konfiguratoren heute arbeiten

- Vier getrennte Rechner, jeder mit eigenem Zustand in Eingabefeldern plus
  JS-Closure: Rollenware (`blocks/tp-rollware-rechner.liquid`, rund 2.000 Zeilen),
  Paket/Verschnitt (`blocks/paket-auswahl.liquid`), Wunschmaß
  (`blocks/tp-teppich-wunschmass.liquid`), Einfassung
  (`assets/tp-einfass-konfigurator.js`). **Kein gemeinsamer Zustand, kein zentraler
  Ort, der die Warenkorb-Eigenschaften baut.**
- Aus der URL wiederherstellbar ist nur die Variante (`?variant=`), also die Farbe.
  Maße, Breite, Zubehör nicht.
- Kein `localStorage`/`sessionStorage` für Rechnerzustand. Ein früherer
  localStorage-Vorbefüller wurde am 2026-09-10 bewusst wieder entfernt.
- Die Rollenware-Produktseite wird gerade umgebaut (#420, Branch
  `feature/pdp-kompakt`).

### Wege und Aufwand

| Weg | Was nötig wäre | Aufwand | Risiko |
|---|---|---|---|
| A · Link zur Auswahl (`?variant=…&breite=…&laenge=…`), beim Laden wiederherstellen, teilen über „Teilen"-Dialog oder `mailto:` | je Rechner: Parameter lesen, Felder setzen, Neuberechnung anstoßen, Tests | Rollenware ≈ 1 Sitzung, jeder weitere Rechner ≈ ½–1 | mittel – Eingriff in getestete Rechner, aber ohne Preislogik zu ändern |
| B · Shop schickt dem Kunden eine Mail mit der Konfiguration | Mailversand aus dem Theme gibt es nicht; ginge nur über Kundenformular → Flow → Shopify Messaging und braucht eine Marketing-Einwilligung | hoch | hoch (Datenschutz, zwei neue Abhängigkeiten) |
| C · Warenkorb per Link nachbauen (`/cart/add?…&properties[…]`) | nichts im Theme | gering | **nicht empfohlen**: umgeht die Rechner, Eigenschaften wären frei manipulierbar, zwei Preis-Apps hängen als Checkout-Regeln dahinter |
| D · Nichts bauen, vorhandene Funktion nutzen | Warenkorbabbrecher-Mail stellt den Checkout **mit** allen Maßen wieder her; der Warenkorb selbst bleibt rund zwei Wochen erhalten | null | null |

### Empfehlung

**Jetzt nicht bauen.** Die Produktlogik müsste an vier Stellen angefasst werden,
eine davon wird gerade umgebaut. Reihenfolge, wenn der Bedarf bleibt:

1. D wirksam machen (Abonnenten gewinnen – dann deckt die vorhandene Mail den
   Fall „konfiguriert, in den Warenkorb gelegt, nicht gekauft" bereits ab).
2. Nach Abschluss von #420: Weg A **nur für Rollenware** (größte Warengruppe),
   ohne Backend, ohne personenbezogene Daten: ein Textlink „Auswahl als Link
   sichern" unterhalb des Warenkorb-Knopfs, nicht davor.
3. B und C nicht verfolgen.

## 2. Optionale Ideen – Aufwand und Nutzen

| Idee | Bestand | Aufwand | Nutzen jetzt | Empfehlung |
|---|---|---|---|---|
| Produktvergleich | **fertig** (bis 3 Produkte) | – | – | nichts tun |
| Projektgalerie | **fertig** („Unsere Arbeit", Vorher/Nachher) | gering (Inhalte) | mittel – Vertrauen | aus Ratgeber-Artikeln verlinken; pflegen statt neu bauen |
| Boden-Finder | Filter-Metafelder vorhanden | mittel als Quiz; **gering** als Ratgeber-Artikel „Welcher Teppichboden passt?" mit Links auf gefilterte Kollektionen | mittel–hoch für Unentschlossene | zuerst als Pilotartikel; ein interaktives Quiz erst, wenn der Artikel Nachfrage zeigt |
| Regionale Verlegeservice-Seiten | `tp-verlegegebiet` mit Service-Schema vorhanden; 37 % der Einstiege landen auf Serviceseiten | mittel je Region | hoch, **wenn** jede Seite echten eigenen Inhalt hat (Referenzen, Anfahrt, Ansprechpartner) | später, wenige echte Regionen; keine Textbaustein-Seiten je Ort (Doorway-Risiko) |
| Favoriten / Merkliste | nein | mittel (lokal im Browser) | gering – die Musterbestellung erfüllt den Zweck besser | nicht jetzt |
| Farbvergleich | großes Farbbild unter der Farbwahl vorhanden | mittel | gering; würde die Produktseite wieder verlängern | nicht jetzt |
| Kundenfotos | nein | Prozess + Einwilligungen nötig | gering bei heutigem Bestellvolumen | nicht jetzt; Referenzgalerie deckt es ab |
| Empfehlungsprogramm | nein | App + laufende Kosten | keiner ohne Käuferbasis | nicht jetzt |
| B2B-Bereich | Seiten vorhanden, davon **zwei praktisch identisch** (`/pages/firmenkunden` und `/pages/fur-geschaftskunden`) | Bereinigung gering; echter B2B-Shop braucht einen größeren Plan | Bereinigung: mittel (Duplicate Content) | erst Dubletten zusammenführen (Weiterleitung), kein B2B-Shop |
| Gespeicherte Projekte | nein | hoch (hängt an „Konfiguration speichern" + Kundenkonto) | gering | nicht verfolgen |
| Wiederbestellung Gewerbe | neue Kundenkonten bieten „Erneut kaufen" nativ | – | keiner ohne Gewerbebestellungen | beobachten |

Leitlinie: Nichts davon kommt auf die Produktseite oberhalb des Warenkorb-Knopfs.
