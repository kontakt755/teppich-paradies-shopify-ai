# Teppichbereich (Entwurf)

Stand 2026-09-11 · Aufgabe #199 · Branch `feature/teppiche-bereich`

Neuer, eigenständiger Hauptbereich **„Teppiche“** – getrennt von „Teppichboden“.
Gebaut und gepflegt **nur im Entwurfstheme**; nichts davon ist live, es gibt keine Preise
und keinen Kauf. Der Bericht mit Screenshots liegt nicht im Repository (öffentlich).

## Sicherheit – warum hier nichts live gehen kann

| Sperre | Wo |
|---|---|
| Jede `tp-rug`-Datei rendert nur, wenn `theme.role != 'main'` | `snippets/tp-rug-gate.liquid` |
| Seiten sind alternative Vorlagen (`/?view=…`), keine Shop-Seiten; Canonical = Startseite | `snippets/tp-rug-url.liquid` |
| `noindex, nofollow` auf allen Teppich-Vorlagen | `snippets/tp-rug-head.liquid` |
| Kein Product-JSON-LD, kein `money`, kein Warenkorb | Test `qa/tests/tp-rug-core.test.mjs` |
| Testprodukte: Status Entwurf, keinem Verkaufskanal zugeordnet, `seo.hidden` | Shopify-Admin |
| Hauptmenü des Shops (storeweit) unverändert | Menü per Skript im Theme eingesetzt |

Den Bereich live zu schalten heißt: Sperre in `tp-rug-gate` bewusst entfernen, echte Seiten
und Kollektionen anlegen, Adressen in `tp-rug-url` umstellen, Preise/Anfrageprozess klären.

## Adressen im Entwurf

| Seite | Adresse |
|---|---|
| Einstieg | `/?view=tp-teppiche` |
| Alle Teppiche (Filter per `raum`, `form`, `kante`, `farbe`, `material`, `flor`, `faser`, `eigenschaft`, `antirutsch`) | `/?view=tp-teppiche-alle&raum=wohnzimmer` |
| Konfigurator (Demo, `produkt`, `form`, `raum`, `cfg`) | `/?view=tp-teppich-konfigurator&produkt=tp-rug-test-wohnzimmer` |
| Wohnmobil | `/?view=tp-teppiche-wohnmobil` |
| Sonderform nach Skizze/Schablone | `/?view=tp-teppiche-sonderform` |
| Größen-Berater + Einsatzort-Finder | `/?view=tp-teppiche-berater` (`#groesse`, `#finder`) |
| Raum-Visualisierer | `/?view=tp-teppiche-visualisierer` |
| Einfassungen | `/?view=tp-teppiche-einfassungen` |
| Muster anfragen | `/?view=tp-teppiche-muster` |
| Produktseite (echte Produkte) | Vorlage `product.teppich-konfigurator` |
| Kollektion (echte Produkte) | Vorlage `collection.tp-teppiche` (noch nicht angelegt; Section `tp-rug-liste` kann es) |

Warum `?view=` auf der Startseite: Entwurfsprodukte zeigt Shopify nie im Entwurfstheme
(`products_preview` rendert immer das Live-Theme, geprüft 2026-09-11), und
`/collections/all/<tag>` leitet um. Theme-Vorlagen sind der einzige Weg ohne Shop-Objekte.

## Menü

`snippets/tp-rug-nav-inject.liquid` (eine Zeile in `layout/theme.liquid`) klont den Punkt
„Teppichboden“ der gerade aktiven Header-Version und setzt „Teppiche“ dahinter – Desktop
(`header-menu`) und Handy (`header-drawer`, alte und neue Drawer-Variante). Inhalt aus
`snippets/tp-rug-nav.liquid`, für beide Geräte dieselbe Quelle.

Zwei Fallen, beide abgefangen:
- Horizon hydriert den Header nach dem Laden (`section-hydration.js`) und morpht ihn auf den
  Serverstand – der Punkt verschwindet. Ein MutationObserver setzt ihn als Microtask neu ein.
- Der Morph gleicht nach Position ab; durch den zusätzlichen Punkt verliert „Mehr“ sein
  `slot="more"` und stünde sichtbar in der Leiste. `repairMore()` stellt es wieder her.

Warum nicht in `blocks/_header-menu.liquid`: Diese Dateien pushen am 2026-09-11 mehrere
Sitzungen ins selbe Arbeitstheme und setzen sich gegenseitig zurück.

## Bausteine

| Datei | Aufgabe |
|---|---|
| `assets/tp-rug-core.js` | Formen, Grenzen, Prüfung, Zustand (`createStore`), Berater-Regeln, Zeichnungen (Vorschau, Raumszenen, Nahaufnahmen) |
| `assets/tp-rug-configurator.js` | Konfigurator: Galerie, 8 Schritte, Vorschau, Zusammenfassung, Produktinfos, Anfrage |
| `assets/tp-rug-tools.js` | Liste mit Filtern, Größen-Berater, Einsatzort-Finder, Wohnmobil-Assistent, Anfrage, Visualisierer-Start |
| `assets/tp-rug-visualizer.js` | Raum-Visualisierer (lädt erst bei Bedarf) |
| `assets/tp-rug-upload.js` | Dateiauswahl + `uploadAdapter` (Speicher-Schnittstelle) |
| `assets/tp-rug-request.js` | Anfrage über das Shopify-Kontaktformular |
| `assets/tp-rug.css`, `tp-rug-app.css`, `tp-rug-nav.css` | Gestaltung (nur auf Teppich-Vorlagen bzw. Menü) |
| `sections/tp-rug-*.liquid` | 18 Sections (Einstieg, Kacheln, Schritte, Formen, Einfassungen, Konfigurator, Liste, Berater, Wohnmobil, Anfrage, Visualisierer …) |
| `snippets/tp-rug-katalog.liquid`, `tp-rug-icon.liquid`, `assets/tp-rug-bild-*.svg`, `tp-rug-demo-*.svg`, `tp-rug-kante-*.svg` | **erzeugt** von `npm run tp-rug:build` aus `demo-katalog.json` und dem Kern |

## Datenmodell

Siehe `datenmodell.md`. Kurz: ein JSON-Metafeld `tp_rug.config` je Produkt, fail closed
gelesen (`normalizeProduct`). Unbekannte Formen/Einfassungen fallen weg, Eigenschaften
erscheinen nur bei `true`. Breitengrenzen nur aus den Produktdaten; Länge shopweit 1.000 cm.

## Was nur Prototyp ist

- **Datei-Upload:** Auswahl, Vorschau und Prüfung (JPG/PNG/PDF, 10 MB, 8 Dateien) funktionieren –
  **übertragen wird nichts**. Shopify-Kontaktformulare können keine Anhänge. Die Anfrage nennt die
  Dateinamen; nach dem Absenden bekommt der Kunde Referenz, E-Mail- und WhatsApp-Weg zum Nachreichen.
  Für echten Upload braucht es einen Speicher (Formular-App mit Upload oder eigene API) – dann
  `uploadAdapter` in `tp-rug-upload.js` ersetzen.
- **Visualisierer:** Overlay auf dem eigenen Foto (verschieben, drehen, skalieren, Neigung,
  Vorher/Nachher) – keine Raumerkennung. Austauschbar über `mountVisualizer`/`openVisualizer`.
- **Bilder:** Illustrationen aus dem Kern, als solche gekennzeichnet. Echte Fotos per Editor
  (jede Section hat ein Bildfeld, das die Illustration ersetzt).
- **Konfigurations-ID:** im Browser erzeugt (`TPT-JJMMTT-XXXX`), steht in der Anfrage-E-Mail,
  wird nicht gespeichert. Teilen per Link (`?cfg=`) ohne Server.

## Prüfen

```
npm run tp-rug:check                      # erzeugte Bausteine aktuell?
node --test qa/tests/tp-rug-core.test.mjs # Grenzen, fail closed, keine Preise, Sperre
npm run liquid:guard && npm run schema:guard
```

Push ins Entwurfstheme nur mit `--only` und danach Prüfsummen gegen den Pull vergleichen –
das Theme teilen sich mehrere Sitzungen.
