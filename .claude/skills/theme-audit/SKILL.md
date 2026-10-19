---
name: theme-audit
description: Nur lesendes Audit des Horizon-Themes (Repository-Root) und der Live-Seiten auf Performance, Barrierefreiheit, klassisches SEO, strukturierte Daten (JSON-LD, Open Graph) sowie Abrufbarkeit fuer KI-Suchmaschinen (Crawler in robots.txt, Antwortseiten auf der eigenen Domain) und App-Last. Ergaenzt liquid:guard, schema:guard, template:guard, themecheck:guard, seo:check und lighthouse:messen um Quelltext-Pruefungen, die diese nicht abdecken. Verwenden bei "Theme-Audit", "SEO-/AEO-/GEO-Audit", "strukturierte Daten pruefen", "warum zitiert uns ChatGPT nicht", "was sollten wir zuerst verbessern", vor groesseren Theme-Umbauten und nach Aenderungen an JSON-LD-Snippets. Ergebnis ist ein Bericht unter docs/audits/, nie eine Code-Aenderung.
---

# Theme-Audit (nur lesend)

Uebernommen und angepasst aus zwei MIT-lizenzierten GitHub-Skills
(Quellen, Commits und Lizenztexte: [QUELLEN.md](QUELLEN.md)). Die Pruefpunkte
mit ihren Kennungen stehen in [pruefliste.md](pruefliste.md); dort steht zu
jedem Punkt auch, welches unserer Werkzeuge ihn schon abdeckt.

## Grenzen

- **Nur lesen.** Kein Edit, kein Theme-Push, kein Schreibzugriff auf Shopify.
  Was gefunden wird, steht im Bericht; umgesetzt wird spaeter in einer eigenen
  Aufgabe nach `AGENTS.md` (Branch, PR, Guards, Deploy-Kette).
- **Bericht ist oeffentlich** (Repository). Keine Lieferantennamen (nur
  Pseudonyme Lieferant A bis D), keine Theme-IDs, keine Tokens, keine
  Kundendaten, keine Rabattcodes. Auch nicht aus Guard-Ausgaben abschreiben -
  `theme:guard` druckt die Live-ID.
- **Keine Code-Bloecke blind uebernehmen.** Die Vorlagen der Upstream-Skills
  sind Beispiele fuer Dawn-artige Themes. Bei uns gelten Horizon,
  `{% stylesheet %}` statt Inline-`<style>`, `tp-`-Praefix, deutsche Kommentare
  ohne Umlaute in Liquid. Fix-Vorschlaege beschreiben, was sich aendern soll,
  und nennen die Datei - fertiger Code nur, wenn er gegen unsere Snippets
  geprueft ist.
- **Keine erfundenen Werte in Vorschlaegen.** Versandkosten, Rueckgabefrist,
  Lieferzeit, GTIN, Material kommen aus Shop-Daten, Rechtstexten oder
  Merchant Center - nie aus Beispielcode (die Upstream-Vorlage nennt z. B.
  30 Tage Rueckgabe und Versand 0 USD). Rechtstexte, Preise und Varianten
  aendert dieses Audit nie (`AGENTS.md`, "NIEMALS ohne ausdrueckliche Freigabe").
- **Preislogik respektieren.** Das Produkt-JSON-LD fuehrt bei Flaechen- und
  Paketware bewusst den m2-Preis (`snippets/tp-product-structured-data.liquid`,
  Kopfkommentar). Ein Befund "Preis weicht vom Variantenpreis ab" ist dort kein
  Fehler.
- **Keine Wirkungsversprechen.** Fuer KI-Suche liefert ein Audit
  *Abrufbarkeit*, keine Zitate. Zahlen aus den Upstream-Dateien zu
  ChatGPT-Suchverhalten (August 2026) sind dort nicht belegt nachpruefbar und
  gehoeren nicht als Tatsache in unseren Bericht.
- **Schwelle oder Plattformgrenze?** Eine Grenze nur nennen, wenn sie
  belegt ist (Shopify-Doku, Google-Doku). Eigene Schwellen als "Schwelle dieses
  Audits" kennzeichnen.

## Ablauf

### 1. Vorhandene Werkzeuge zuerst

Was ein Guard prueft, wird nicht von Hand nachgeprueft - nur sein Ergebnis
uebernommen:

```
npm run liquid:guard && npm run schema:guard && npm run template:guard
npm run theme:guard && npm run schrift:guard
npm run -s themecheck:guard          # Theme Check, Fehlerstufe
npm run seo:check                     # Live-Seiten: Title, Meta, Canonical, H1, Alt, JSON-LD, Offer (lokal, braucht Browser)
npm run lighthouse:messen             # nur wenn Performance-Aussagen fallen (rund 25 min)
```

In Remote-Sessions ist die Storefront gesperrt: dort nur Quelltext-Punkte und
`node workflow/cli.mjs validate --static`; Live-Punkte als "nicht geprueft"
markieren.

### 2. Struktur erfassen

Theme-Dateien liegen im Repository-Root: `layout/`, `sections/`, `blocks/`,
`snippets/`, `templates/`, `config/`, `assets/`, `locales/`. Zuerst lesen:
`layout/theme.liquid`, `snippets/meta-tags.liquid`, `snippets/scripts.liquid`,
`templates/robots.txt.liquid`, alle Dateien mit `application/ld+json`
(`grep -rln 'ld+json' layout sections snippets blocks`).

### 3. Pruefliste abarbeiten

[pruefliste.md](pruefliste.md) von oben nach unten. Reihenfolge der Bloecke:
Abrufbarkeit (R) vor KI-Zitierfaehigkeit (AEO/GEO), denn Auszeichnungen helfen
nur Seiten, die ein Crawler ueberhaupt holt.

Live-HTML nur lesend holen (`curl -sS -A '...' -o <scratchpad>/x.html URL`) und
mit einem Skript **ausserhalb** des Scratchpad-Ordners auswerten; Python mit
`-I`. Das rohe HTML zaehlt (Crawler fuehren meist kein JavaScript aus), nicht
der DOM im Browser. Produktlinks nur innerhalb `<main>` zaehlen - das
Mega-Menue verfaelscht sonst jede Zaehlung.

Jeder Befund braucht Datei und Zeile (oder URL und Messwert). Nicht gelesene
Dateien heissen "nicht geprueft", nicht "in Ordnung".

### 4. Bericht

Ablage `docs/audits/theme-audit-<JJJJ-MM-TT>.md` (Datum per `date -u`).
Aufbau:

1. Kopf: Datum, Stand (`git rev-parse --short HEAD`), Modus, was live gemessen wurde
2. Ergebnis der Guards aus Schritt 1 (eine Zeile je Guard)
3. Befunde nach Schwere (Kritisch, Hoch, Mittel, Niedrig), je Befund:
   Kennung, Ort, Problem, Wirkung, Vorschlag, Aufwand
4. Was gut umgesetzt ist (mit Ort - schuetzt vor Rueckbau)
5. Nicht geprueft (und warum)
6. Empfohlene Reihenfolge (hoechstens fuenf Punkte, Wirkung durch Aufwand)

Eine Punktzahl ist optional (Upstream: 100 minus 10/5/2/1 je Befund). Sie
taugt zum Vergleich zwischen zwei Laeufen, nicht als Urteil.

### 5. Danach

Befunde, die umgesetzt werden sollen, als Aufgabe per `npm run task`
anlegen - nicht im selben Lauf beheben.
