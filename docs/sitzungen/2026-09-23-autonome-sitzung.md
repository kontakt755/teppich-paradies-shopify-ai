# Autonome Sitzung 2026-09-23

## Management-Zusammenfassung

**1. Was wurde fertig?**
Alle offenen Pull Requests waren blockiert — jeder einzelne hatte Konflikte
und war nicht mergebar. Damit lag fertige, bezahlte Arbeit still: die
Beratungsfrage nur bei Mustern, die Kasse direkt unter dem Betrag, das
überarbeitete Control Center und das Ratgeber-Portal. Alle Konflikte sind
aufgelöst, geprüft und mergebereit. Dazu zwei neue Korrekturen.

**2. Was wurde verbessert?**
Ein Preisfehler im Produkt-Markup, der rund 250 Produkte betrifft und beim
Merchant Center als Preisabweichung auffällt (Paketpreis stand gegen einen
sichtbaren Quadratmeterpreis). Dazu ein irreführender Größenhinweis beim
Maßteppich und ein Widerspruch im Startseitentitel.

**3. Was konnte nicht gemacht werden?**
Das Mergen selbst. Die Sitzung darf im aktuellen Modus keine Pull Requests
zusammenführen. Alles liegt fertig und grün bereit — es fehlt nur der Klick.

**4. Was braucht eine Entscheidung?**
- Die Merge-Reihenfolge (siehe unten) oder alternativ der Sammelbranch.
- Ob `/search` aus dem Suchindex genommen werden soll (widerspricht einer
  früheren dokumentierten Empfehlung — bewusst nicht eigenmächtig geändert).
- Elf Seitentitel und drei Beschreibungen fehlen im Shopify-Admin; das sind
  Admin-Felder, keine Theme-Dateien.

---

## ERLEDIGT

### Vier blockierte Pull Requests entsperrt

Alle offenen PRs standen auf `CONFLICTING`. Ursache war nicht ein Fehler in
der Arbeit, sondern dass `main` weitergelaufen ist.

| PR | Inhalt | Konflikt | Jetzt |
|---|---|---|---|
| #537 | Beratung nur bei Mustern, Kasse unter dem Betrag, Daten für KI-Suche | 1 Datei | MERGEABLE, CI grün |
| #539 | Control Center: Design und Übersicht | 5 Blöcke in `app.js` | MERGEABLE, CI grün |
| #514 | Ratgeber-Portal, Lexikon, Problem-Finder | 4 Dateien | MERGEABLE, CI grün |

Die Konflikte waren keine Wegwerfentscheidungen. Beim Control Center hatten
beide Seiten dieselbe Bestellansicht geändert: `main` hatte die vollständige
Detailansicht ergänzt, der Branch die Zeile entrümpelt. Beides ist gewünscht
und schließt sich nicht aus — die aufgeräumte Zeile ist jetzt die
Zusammenfassung, darunter klappt die vollständige Bestellung auf.

### Zwei neue Korrekturen

**PR #545 — Preisangabe im Produkt-Markup (wichtigster Einzelbefund)**

Live gemessen:

```
/products/alvora-terrazzo-grau-klebevinyl-2-5mm
  Markup meldet : 218,46 EUR      (Paketpreis)
  Seite zeigt   :  44,95 EUR/m²
  Paketinhalt   :   4,86 m²   ->  218,46 / 4,86 = 44,95
```

Das Markup nannte den Paketpreis, die Seite den Quadratmeterpreis. Das
Merchant Center liest die Produktseite und beanstandet solche Abweichungen.
Betrifft die Produktgruppe mit Paketangabe — Teppichfliesen, Klick- und
Klebevinyl, rund 250 von 509 Produkten.

**PR #543 — Größenhinweis beim Maßteppich**

Geprüft wurde immer richtig: die kürzere Seite gegen die Maximalbreite, die
längere gegen die Maximallänge — ein Stück darf also gedreht werden. Der
Hinweis sagte aber „Möglich: bis 390 × 500 cm" und ließ 500 × 390 unmöglich
aussehen. Nur der Text wurde geändert, nicht die Rechnung.

**In PR #545 enthalten — Startseitentitel**

`<title>` und `og:title` widersprachen sich auf der Startseite. Beide lesen
jetzt dieselbe Variable.

## VERBESSERT

| | vorher | nachher |
|---|---|---|
| Offene PRs | 5, alle mit Konflikt, keiner mergebar | 5, alle mergebar, CI grün |
| Bestellzeile im Dashboard | sechs Chips bei jeder Bestellung, auch wenn sie nichts bedeuteten | nur Abweichungen vom Normalfall, volle Bestellung eine Klickebene tiefer |
| Weg zum Originalprodukt | Umweg über Shopify | „Im Lexikon ansehen" an jeder Bestellposition |
| Produkt-Markup Paketware | Paketpreis gegen sichtbaren m²-Preis | derselbe Preis wie auf der Seite, auf den Cent |

## BLOCKIERT

**Pull Requests zusammenführen** — die Sitzung darf im Auto-Modus nicht
mergen (Grund: „Merge Without Review"). Kein Workaround versucht. Alles
liegt mergebereit.

**Merge-Reihenfolge beachten**, die PRs überschneiden sich untereinander:

1. **#537** — konfliktfrei gegen `main`
2. **#539** — überschneidet sich mit #537 in `docs/ai-dashboard/app.js`
3. **#514** — überschneidet sich mit #539 in `app.js` und `index.html`
4. **#543** und **#545** — unabhängig, jederzeit

Nach jedem Merge rechnet GitHub neu; #539 und #514 werden danach erneut
konfliktbehaftet. Die fertige Auflösung aller drei liegt als Branch
`chore/integration-537-539-514` bereit und ist dort bereits geprüft.

Alternative: diesen einen Branch mergen und #537/#539/#514 schließen —
weniger Arbeit, verliert aber die getrennte Review-Historie.

## NOCH OFFEN

**Vom Wunschzettel bereits vorhanden** (nachgesehen, nicht neu gebaut):
Produktlexikon, Kundenbestellungen mit allen Feldern, Testbestellungen
getrennt, Direktversand-Wege (`SUPPLIER_DIRECT`/`SUPPLIER_TO_SITE`),
„So rechnen wir" (am 20.09. entfernt), Meterware-Preistipp und „Im Raum"
(beide bereits standardmäßig aus).

**Echt offen:**
- `/search` ist indexierbar. Die saubere Lösung wäre ein
  `templates/robots.txt.liquid` mit `{{ robots.default_groups }}` plus
  `Disallow: /search`. **Bewusst nicht gemacht:** eine frühere Sitzung hat
  schriftlich empfohlen, diese Datei *nicht* anzulegen. Der Widerspruch
  gehört entschieden, nicht eigenmächtig überschrieben.
- Kollektionsseiten tragen keine Produktliste als strukturierte Daten
  (`ItemList`). Für KI-Antwortsysteme der direkteste Weg zu „welche
  Teppichböden gibt es dort".
- Drei fehlende Meta-Beschreibungen, elf Standard-Titel — **Shopify-Admin,
  keine Theme-Dateien.**
- Checkout: Telefon *oder* E-Mail zur Wahl. Shopifys Checkout gibt das nur
  begrenzt her; nicht angefasst, weil „keine fragilen Hacks" gilt.

## TECHNISCHE EMPFEHLUNGEN

1. **Die PRs zeitnah mergen.** Der eigentliche Engpass ist nicht die
   Entwicklung, sondern dass fertige Arbeit liegen bleibt und `main`
   derweil weiterläuft — daraus entstehen genau diese Konflikte.
2. **Nach #545 das Merchant Center beobachten.** Die Preisabweichung sollte
   verschwinden.
3. **Aufräumen:** rund 40 Arbeitskopien und viele Branches, deren Inhalt
   längst in `main` steckt (Lexikon, Kundenbestellungen, Auftragsfluss).
   Das erschwert die Übersicht, welche Arbeit noch offen ist.

## Belege

Alles lokal geprüft, keine Shop- oder Produktdatenänderung:

- `npm test`: 675 Tests grün
- Dashboard: 95 Tests grün · Operations: 182 Tests grün
- `liquid:guard` 405 Dateien, `schema:guard` 232 Schemata, `template:guard`
  19 Templates — je 0 Fehler
- Zusammengeführtes Dashboard im Browser gegen synthetische Testbestellungen
  geprüft: rendert, keine Konsolenfehler, Auf-/Zuklappen und die Knöpfe in
  der Zeile funktionieren
- Preisbefund per `curl` an der Live-Storefront nachgerechnet

Neue Tests: `produkt-jsonld-paketware` (5), `tp-einfass-massgrenzen-hinweis`
(4), `meta-startseite-titel` (3).
