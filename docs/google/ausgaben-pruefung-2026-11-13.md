# Google Ads: Ausgaben ohne messbaren Kauf, 12.10.–10.11.2026 (Werkbank w-362)

Konto 334-557-2870, 30 Tage, **1.188,99 €** Kosten. Quelle: Google-Ads-Oberfläche im
angemeldeten Chrome (HYPD sah das Konto nicht). Analyse vom 11.11., Entscheidungen vom 13.11.

## Lesehinweis

- Conversions in Ads zählen seit 26.10. auch **Gratismuster (Wert 0)**. Echter Warenkauf laut
  Ads in 30 Tagen: 1 (808,12 €, Search Teppichboden). Shopify zählte bis 09.11. 17 Warenkäufe.
- Ads sieht nur Käufe nach Anzeigenkontakt; **Shopify bleibt die Referenz**. „0 Conversions“
  heißt nicht „bringt nichts“, besonders bei Shopping (dort fehlt der Kaufwert ganz).
- Einzeln sichtbar waren Suchbegriffe für 642,68 €; 546,31 € stehen unter „sonstige
  Suchbegriffe“.

## Vorschläge und Entscheidungen

| Nr. | Betrag | Vorschlag | Entscheidung | Stand |
|---|---:|---|---|---|
| 1 | 637,23 € | Shopping Teppichboden (360,98 €) und Teppich nach Maß (276,25 €) nicht nach Ads-Zahlen kürzen, nur über die Shopify-Herkunft beurteilen | ja (Beobachtung, keine Änderung) | läuft im Tageslauf `shopping-teppichboden-beobachten` |
| 2 | 260,05 € | Shopping Vinyl, Shopping Laminat & Parkett, Search Vinyl pausiert lassen | ja | alle drei pausiert, **Laminat & Parkett ist damit wie Vinyl entschieden** |
| 3 | 168,47 € | in Teppich nach Maß das Gebot der Produktgruppe „vorwerk“ von 0,70 auf 0,45 € senken | **nein** (Claude, 13.11.) | nichts geändert |
| 4 | 30,23 € | in Teppich nach Maß „teppichboden“ ausschließen, damit dort nur die Teppichboden-Kampagnen bieten | ja (Benutzer, 13.11.) | **gesetzt 13.11.**, Kampagnenebene, passende Wortgruppe, nach Neuladen zurückgelesen |
| 5 | 12,75 € | „werksverkauf“ in die Liste „TP Ausschluss: Fachfremd/Jobs/Baumarkt/Wettbewerb“ aufnehmen | **ja** (Claude, 13.11.) | **offen**: braucht eine Sitzung mit Chrome |

Der Benutzer hat am 13.11. zuerst nur Vorschlag 4 gewählt und die Entscheidung zu 3 und 5
danach an Claude übergeben.

### Warum 3 nein

- Der Inhaber hat am 15.10. entschieden, für hochwertige Teppiche bewusst höher zu bieten.
- Die Shopping-Kampagne misst keinen Kaufwert (Conv.-Wert 0). Ein Gebot nach Ads-Zahlen zu
  senken wäre blind; das ist dieselbe Begründung wie bei Vorschlag 1.
- Das Tagesbudget von Teppich nach Maß steht inzwischen auf **20 €** statt 10 €. Die
  30-Tage-Zahlen beschreiben die Lage vor der Erhöhung.
- Neu bewerten nach der Black Week (ab 01.12.), mit Shopify-Bestellungen aus Google Shopping
  als Maßstab, nicht mit Ads-Conversions.

### Warum 5 ja

- Erfüllt die Regel aus dem Zyklus vom 16.10. (`negatives-2026-10-16.md`): klar unpassend,
  Kosten ≥ 1 €, 0 Conversions.
- „vorwerk teppichboden werksverkauf“: 64 Klicks, 291 Einblendungen, 12,75 €, nicht einmal
  ein Gratismuster. Wer „Werksverkauf“ sucht, will das Outlet des Herstellers; das sind wir nicht.
- „vorwerk“ selbst bleibt drin (Inhaberentscheidung 07.10., lokale Anfragen).
- Risiko gering: Der Ausschluss trifft nur Suchen, die „werksverkauf“ enthalten.

## Umsetzung Vorschlag 5 (offen)

Nur mit Zugriff auf das Ads-Konto (lokale Sitzung mit Chrome oder von Hand):

1. Gemeinsam genutzte Bibliothek → Listen mit auszuschließenden Keywords →
   „TP Ausschluss: Fachfremd/Jobs/Baumarkt/Wettbewerb“ → `"werksverkauf"` (passende Wortgruppe).
2. Prüfen, dass die Liste an der Search-Kampagne Teppichboden hängt (dort lief der Begriff);
   sonst dort auf Kampagnenebene setzen.
3. Nach Neuladen zurücklesen (ein Eintrag mehr, sonst unverändert), in w-362 eintragen.

Keine Gebote, Budgets oder Status ändern.

## Offen für den Inhaber

- **Tagesbudget Teppich nach Maß 20 € statt der notierten 10 €.** Wer es wann erhöht hat, ist
  nirgends vermerkt. Bleibt so, bis der Inhaber anders entscheidet. Budgetänderungen trifft
  Claude nicht.

## Budgetlage am 11.11.

- Shopping Teppichboden (25 €/Tag) und Teppich nach Maß (damals notiert 10 €/Tag): „durch
  Budget eingeschränkt“, Verlust > 90 %.
- Search Teppichboden: nur durch das Suchvolumen begrenzt, Rang-Verlust 65,8 %.
- „Search | Gewerbe Ware“ (5 €/Tag) lernt noch, bis dahin 0 € Kosten.
