# Menüpunkt „Angebote“ mit automatischer Steuerung

Teil von `SHOPIFY_WEITERENTWICKLUNG.md` (Phase 8). Stand 2026-10-08.

## 1. Ist-Zustand (geprüft)

**Rabattarten im Shop**

| Art | Vorhanden | Wo sichtbar | Über Kollektion erfassbar? |
|---|---|---|---|
| Vergleichspreis (compare-at) – Angebotswelle (`aktion.klasse = aktion`, Start/Ende) | ja, `npm run angebot` | Streichpreis + Badge, nur solange `tp-rabatt-sichtbar` „ja“ sagt | Regel „Preis reduziert“ ja – **aber ohne Datum** |
| Vergleichspreis – Dauerrabatt (`preisanker`, Ende 01.11.2026) | ja, 482 Produkte | wie oben | wie oben |
| Zentrale Aktion `tp_aktion` (Metaobjekt) + automatischer Rabatt im Warenkorb | Struktur da, 1 Testeintrag `aktiv=false` | „−15 % Aktion bis …“ auf Karte/Produktseite | nur indirekt (Aktion verweist auf eine Kollektion) |
| Rabattcode | 1 aktiv (Newsletter 15 € ab 100 €) | erst im Checkout | nein – und soll es nicht: Codes sind keine Angebote im Sortiment |
| Automatischer Rabatt | keiner aktiv | Warenkorb | nein |

**Vorhandene Angebots-Kollektionen** (Smart, Regel „Preis reduziert“ + Produkttyp):
`angebote-teppichboden` (112), `angebote-vinylboden` (322), `angebote-linoleum` (9),
`angebote-leisten-zubehoer` (48). Sie stehen auf der Startseite („Aktuelle Angebote“),
nicht im Menü. Stichprobe Seite 1, live, 2026-10-08: jede Karte zeigt einen Streichpreis
(Zubehör ohne Prozent-Badge, weil 5 % unter der Badge-Schwelle von 10 % liegen) – heute konsistent.

**Die Lücke:** „Preis reduziert“ heißt nur `compare_at_price > price`. Das Theme zeigt den
Streichpreis aber erst ab `aktion.start` und nur bis `aktion.ende`. Zwischen Ende der Aktion
und Rückstellung der Preise (`npm run angebot -- ende`, „am Tag danach“) – und bei jedem
vergessenen Vergleichspreis – stünden Produkte in einer Angebots-Kollektion **ohne**
sichtbaren Rabatt. Ein Menüpunkt, der nur „Kollektion nicht leer“ prüft, wäre in diesem Fenster falsch.

## 2. Strategie

**Eine Wahrheit:** Ein Produkt ist ein Angebot genau dann, wenn der Shop gerade einen Rabatt
dafür **anzeigt**:
- `snippets/tp-rabatt-sichtbar` = „ja“ **und** `compare_at_price > price`, oder
- `snippets/tp-aktion-laufend` liefert einen Prozentsatz (zentrale Aktion).

Darauf bauen drei Teile:

1. **Kollektion „Angebote“** (`/collections/angebote`, neu, Smart): Regel `Tag = angebot`.
   Kein Datumsfeld nötig, weil der Tag gepflegt wird:
2. **Tag-Abgleich** `npm run angebote:abgleich` (neues Skript, gleiche Regeln wie das Theme,
   als Node-Modul mit Test): liest alle Produkte mit `aktion.*` bzw. in einer laufenden
   `tp_aktion`-Kollektion, setzt `angebot` bei sichtbarem Rabatt, entfernt ihn sonst.
   Läuft (a) automatisch mit `npm run angebot -- plan/ende`, (b) täglich 00:15 über den
   Dashboard-Dienst auf dem Mac, (c) jederzeit von Hand. Trockenlauf zeigt die Änderungen
   vorher.
3. **Menüpunkt mit Sicherung im Theme:** In `main-menu` steht „Angebote“ →
   `/collections/angebote`. Das Theme blendet den Punkt in **allen drei** Menüdarstellungen
   (Desktop `blocks/_header-menu.liquid`, Mobil-Leiste, Drawer `snippets/tp-drawer-nav.liquid`)
   nur ein, wenn unter den ersten Produkten der Kollektion mindestens eines einen Rabatt
   **anzeigt** (dieselben Snippets wie oben). Ein verspäteter Abgleich kann den Punkt
   also nie fälschlich zeigen; er kann ihn höchstens bis zum nächsten Abgleich zu lange
   verstecken. Zentrales Snippet `tp-menu-link-sichtbar`, damit die drei Stellen nicht
   auseinanderlaufen.

Warum nicht Shopify Flow: Flow ist auf Basic verfügbar und könnte Tags zeitgesteuert setzen,
die Datumslogik läge dann aber ein zweites Mal außerhalb des Repositorys (nicht testbar,
nicht versioniert). Das Skript nutzt dieselben Regeln und Tests wie die Angebotswelle.

## 3. Abgrenzung zu Sonderposten

- **Angebote** = befristet reduzierte Ware aus dem regulären Sortiment (Meterware, Pakete, Zubehör).
- **Reste & Sonderposten** = dauerhafter Bereich für Einzelstücke mit festen Maßen.

Sonderposten bekommen den Tag `angebot` **nicht** (das Skript schließt Produkttyp
`Sonderposten` aus). Sonst wäre „Angebote“ dauerhaft sichtbar und verlöre seine Funktion als
Aktionssignal. Stattdessen verweist die Angebotsseite unten auf „Reste & Sonderposten“, und
„Reste & Sonderposten“ steht als eigener Menüpunkt, sobald die Kollektion Stücke hat (gleiche
Theme-Sicherung, Bedingung „Kollektion nicht leer“).

## 4. Testfälle (Phase 8/9)

| Fall | Erwartung |
|---|---|
| Aktion läuft (Testprodukt im Entwicklungstheme, `aktion.start = heute`) | Tag gesetzt, Produkt in `/collections/angebote`, Menüpunkt sichtbar (Desktop, Mobil, Drawer) |
| Aktion endet (`aktion.ende = gestern`, Vergleichspreis noch gesetzt) | Theme: Menüpunkt sofort weg; Abgleich: Tag entfernt |
| Keine rabattierten Produkte | Kollektion leer, Menüpunkt weg, `/collections/angebote` zeigt Hinweis + Link „Reste & Sonderposten“ statt leerer Seite |
| Nur Rabattcode aktiv | kein Menüpunkt |
| Zentrale Aktion `tp_aktion` aktiv | Produkte der Aktionskollektion getaggt, Karte zeigt „−X % Aktion bis …“ |
| `menu:guard` gegen die Vorschau | kein toter Link |

## 5. Umsetzungsstand (2026-10-08)

| Teil | Stand |
|---|---|
| `snippets/tp-angebot-sichtbar.liquid` | gebaut – eine Regel für „Angebot“ (Streichpreis sichtbar oder zentrale Aktion; nie Sonderposten) |
| `snippets/tp-menu-link-sichtbar.liquid` | gebaut, an allen vier Menü-Stellen eingehängt (Desktop, Handy-Leiste, Drawer, SEO-Linkliste) |
| `operations/lib/angebote-abgleich.mjs` + Tests | gebaut, 9 Tests; Regel 1:1 aus den Liquid-Snippets (auch die Liquid-Eigenheit: fehlender Vergleichspreis kippt die Rollenware-Regel nicht) |
| `npm run angebote:abgleich` | gebaut; Trockenlauf Standard, `--schreiben`, `--stichtag`, `--ausgabe`; wartet auf Shopify-Budget, Gegenprobe nach dem Schreiben |
| Kollektion `angebote` (Tag = angebot) | **angelegt und im Onlineshop veröffentlicht** (2026-10-08, Freigabe Ahmet in der Werkbank w-029); 510 Produkte, Seite 1: 24/24 Karten mit Streichpreis |
| Tags `angebot` | **geschrieben**: 510 Produkte, Gegenprobe 0 offen / 0 Fehler. Vorher trug kein Produkt den Tag. Rückweg: Liste `~/teppich-paradies-analyse/angebote/abgleich-2026-10-08/vorher.json` → `tagsRemove` je Produkt |
| Menüpunkte „Angebote“ / „Reste & Sonderposten“ in `main-menu` | **erst mit dem Theme-Livegang** – das Live-Theme kennt die Ausblend-Logik noch nicht und würde die Punkte sonst immer zeigen |
| Täglicher Lauf (0:00) | **eingerichtet 2026-10-08** (Dienst `net.teppich-paradies.angebote`, Vorlage in `operations/launchagents/`, PR #995). Vorher: **noch nicht eingerichtet** – dauerhafter Dienst auf dem Mac, braucht ausdrückliche Freigabe. Bis dahin: nach jeder Angebotswelle und am Tag nach einem Aktionsende `npm run angebote:abgleich -- --schreiben` von Hand. Die Theme-Sicherung verhindert in der Zwischenzeit, dass der Menüpunkt ohne sichtbares Angebot erscheint. |

**Belege:**
- Trockenlauf 08.10.: 1.290 aktive Produkte, 510 zeigen einen Rabatt; 0 Produkte mit
  Vergleichspreis, die der Shop nicht als Rabatt zeigt.
- Stichprobe gegen die ausgelieferten Produktseiten: 8/8 Angebote zeigen einen Streichpreis,
  6/6 Nicht-Angebote keinen.
- `--stichtag 2026-11-02` (Tag nach Dauerrabatt-Ende): 0 Angebote → Menüpunkt verschwindet von selbst.
- Entwicklungskopie: Desktop-Menü 24 Einträge wie live, 0 Liquid-Fehler.
