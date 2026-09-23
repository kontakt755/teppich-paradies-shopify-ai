# Content-Datenmodell

Stand 2026-09-23 · Aufgabe #505. Regel und Begruendung der Zweiteilung:
`ARCHITECTURE.md`, Abschnitt 3.

## 1. Zwei Dateien je Artikel, wie bisher

```
content/ratgeber/<bereich>/<handle>.json    Redaktionsdaten + Storefront-Felder
content/ratgeber/<bereich>/<handle>.html    Der Artikeltext, ohne H1
```

Neu sind ausschliesslich **redaktionelle** Felder in der `.json`. Der Block
`metafields` bleibt unveraendert — er beschreibt weiterhin genau die 19
Shopify-Metafelder, die seit 2026-09-21 bestehen und nicht umbenennbar sind.

## 2. Vollstaendiges Schema

```jsonc
{
  // ── Identitaet ────────────────────────────────────────────────────────────
  "id": "RAT-TB-001",              // stabil, nie wiederverwendet; <Bereich>-<Nr.>
  "handle": "teppichboden-richtig-ausmessen",
  "title": "Teppichboden richtig ausmessen: …",
  "blog": "ratgeber-teppichboden",
  "tags": ["Planen & Messen"],     // = Themengruppe, steuert die Hub-Sortierung

  // ── Redaktion (bleibt im Repo) ────────────────────────────────────────────
  "cluster": "teppichboden/planen-messen",
  "parent": "ratgeber-teppichboden",     // Blog-Handle oder Artikel-Handle
  "intent": "anleitung",                 // s. Abschnitt 4
  "frage": "Wie messe ich einen Raum für Teppichboden aus?",
  "begriff": "teppichboden ausmessen",   // der Hauptbegriff, EINMAL im Portal
  "nebenfragen": [
    "Wie viel Zugabe braucht Teppichboden?",
    "Messe ich mit oder ohne Sockelleiste?"
  ],
  "status": "veroeffentlicht",           // s. Abschnitt 3
  "verwandte": ["rollenbreite-und-bahnen-planen"],
  "naechster_schritt": "teppichboden-verlegen-lose-fixieren-oder-kleben",
  "lexikon": ["nutzungsklasse", "rollenbreite"],
  "quellen": [
    { "art": "hausangabe", "titel": "Rollenbreiten im Shop", "url": "/collections/teppichboden" }
  ],
  "bilder": [                            // Shotlist; siehe IMAGE_SHOTLIST.md
    { "zweck": "Zollstock an der breitesten Stelle", "status": "offen" }
  ],
  "pruefung": {
    "zyklus_monate": 24,
    "naechste": "2028-09-21",
    "grund": "Rollenbreiten und Zugabe aendern sich selten"
  },
  "expert_input": [],                    // offene Fachfragen, s. EXPERT_INPUT.md

  // ── Storefront (geht nach Shopify) ────────────────────────────────────────
  "excerpt": "…",
  "seo": { "title": "…", "description": "…" },
  "metafields": {
    "kurzantwort": "…", "art": "Planung",
    "dauer": "", "schwierigkeit": "", "personen": "", "material": [],
    "cta": ["rechner", "muster"],
    "kollektion": "teppichboden", "zubehoer_kollektion": "",
    "geprueft_von": "", "stand": ""
  }
}
```

Alle Redaktionsfelder ausser `id`, `cluster`, `intent`, `frage`, `begriff` und
`status` sind optional; fehlende Felder gelten als leer.

## 3. Statusfluss

```
idee → recherche → fachinput_noetig → entwurf → seo_pruefung → fachpruefung
     → freigegeben → veroeffentlicht → ueberarbeiten ─┐
                                                      ├→ zusammenlegen → weiterleiten → archiv
```

`freigegeben` bleibt der Status, der `scripts/ratgeber-payload.mjs` oeffnet —
unveraendert gegenueber 2026-09-21. `veroeffentlicht` oeffnet ihn ebenfalls
(Artikel steht im Shop, Quelltext bleibt die Wahrheit). Alle uebrigen sperren.

| Status | Bedeutung |
|---|---|
| `idee` | Im Backlog, nichts geschrieben |
| `recherche` | Suchintention und Nebenfragen geklaert, kein Text |
| `fachinput_noetig` | Text steht, wartet auf das Verlegeteam |
| `entwurf` | Text vollstaendig, noch nicht geprueft |
| `seo_pruefung` | Titel, Description, interne Links, Kannibalisierung geprueft |
| `fachpruefung` | Beim Verlegeteam |
| `freigegeben` | Darf angelegt werden |
| `veroeffentlicht` | Steht sichtbar im Shop |
| `ueberarbeiten` | Pruefdatum erreicht oder Befund aus den Daten |
| `zusammenlegen` | Geht in einen anderen Artikel auf |
| `weiterleiten` | Zusammengelegt, Weiterleitung gesetzt |
| `archiv` | Nicht mehr im Portal |

## 4. Suchintention (`intent`)

Fuenf Werte, mehr nicht. Sie sind das Werkzeug gegen Kannibalisierung:
**zwei Artikel duerfen nicht denselben `begriff` mit demselben `intent` tragen.**

| Wert | Nutzerfrage | Beispiel |
|---|---|---|
| `kaufberatung` | „Was soll ich nehmen?" | Welcher Teppichboden fuer welchen Raum |
| `anleitung` | „Wie mache ich das?" | Teppichboden verlegen |
| `planung` | „Wie viel und in welcher Form?" | Rollenbreite waehlen |
| `problem` | „Warum ist das so und was hilft?" | Teppichboden wirft Wellen |
| `begriff` | „Was bedeutet das?" | Lexikoneintrag, nicht als Artikel |

## 5. Herkunft jedes Feldes aus dem Auftrag

Damit nichts unter den Tisch faellt: Der Auftrag (Abschnitt 7) nennt 40 Felder.
Hier steht, wo jedes liegt.

| Auftrag | Ort |
|---|---|
| interne ID, Hauptthema, Themencluster, Parent-Hub | Repo: `id`, `cluster`, `parent` |
| primaere Suchintention/-frage, Hauptbegriff, Nebenfragen | Repo: `intent`, `frage`, `begriff`, `nebenfragen` |
| Status | Repo: `status` |
| verwendete Quellen, verwandte Ratgeber/Lexikonbegriffe | Repo: `quellen`, `verwandte`, `lexikon` |
| Bilder (Bedarf), naechste Pruefung | Repo: `bilder`, `pruefung` |
| Titel, Slug, Meta Title/Description | Shopify: Titel, Handle, `global.title_tag`/`description_tag` |
| Autor, Veroeffentlichungsdatum | Shopify: Artikel-Autor, `publishedAt` |
| Fachpruefer, letzte fachliche Pruefung | Shopify: `ratgeber.geprueft_von`, `ratgeber.stand` |
| Kurzantwort | Shopify: `ratgeber.kurzantwort` |
| Hauptinhalt, Inhaltsverzeichnis, Praxis-Tipp, Warnhinweise, haeufige Fehler | `<handle>.html` — Verzeichnis baut das Template aus den H2 |
| Videos | Shopify: `ratgeber.video_*`, `transkript` |
| verwandte Produktkategorien, passende Produkte | Shopify: `ratgeber.kollektion`, `ratgeber.produkte` |
| Musterbestellung, Rechner, Verlegeservice, Beratung | Shopify: `ratgeber.cta` |
| Canonical, strukturierte Daten | Theme — nicht als Feld pflegbar, sonst driftet es |
| Indexierungsstatus | Pruefung (`QA_CHECKLIST.md`), kein Feld |
| Search-Console-Daten, Conversiondaten | Messung, nicht im Quelltext (`ANALYTICS.md`) |

Drei Felder aus dem Auftrag bekommen **bewusst kein Datenfeld**: Canonical und
strukturierte Daten erzeugt das Theme aus dem Inhalt (ein pflegbares Feld
wuerde davon abweichen, sobald jemand es vergisst), und der Indexierungsstatus
ist ein Messwert, kein Redaktionsdatum.

## 6. Lexikon und Problem-Finder

Beide sind Shopify-Metaobjekte, ihre Quelltexte liegen wie die Artikel im Repo:

```
content/lexikon/<begriff>.json          → Metaobjekt tp_lexikon
content/probleme/<problem>.json         → Metaobjekt tp_bodenproblem
```

### `tp_lexikon`

| Feld | Typ | Zweck |
|---|---|---|
| `begriff` | Text | Anzeigename, z. B. „Nutzungsklasse" |
| `kurz` | mehrzeilig | 1–3 Saetze, muss fuer sich stehen |
| `lang` | Rich Text | optional, laengere Erklaerung auf der Lexikonseite |
| `gruppe` | Text | Teppichboden · Vinyl · Untergrund · Allgemein |
| `synonyme` | Textliste | fuer die Suche |
| `artikel` | Text | Handle des ausfuehrlichen Artikels, falls vorhanden |

### `tp_bodenproblem`

| Feld | Typ | Zweck |
|---|---|---|
| `symptom` | Text | wie der Kunde es beschreibt: „Kanten heben sich" |
| `belag` | Text | Teppich · Teppichboden · Vinyl · PVC · Laminat · Parkett |
| `ursachen` | Textliste | moegliche Ursachen, keine Diagnose |
| `artikel` | Text | Ziel-Artikel — **Pflichtfeld fuer die Anzeige** |
| `profi_noetig` | Boolean | steuert den Hinweis „Wann sollte ein Profi ran?" |

Ohne `artikel` erscheint ein Problem nicht auf der Seite (`ARCHITECTURE.md` 4.3).

## 7. Was das Gate prueft

`npm run bodenwissen:guard` (neu, ergaenzt `ratgeber:payload`):

1. **Pflichtfelder** vorhanden, `status` und `intent` aus der erlaubten Liste.
2. **Kannibalisierung:** kein zweites Paar `begriff` + `intent` im ganzen Portal.
3. **Verweise loesen auf:** `verwandte`, `naechster_schritt`, `parent`, `lexikon`
   und jeder interne `href` im HTML zeigen auf etwas, das es gibt.
4. **Verwaiste Artikel:** jeder Artikel wird von mindestens einem anderen
   verlinkt oder haengt an einer Themengruppe.
5. **Ankertexte:** kein „hier", „mehr", „klicken".
6. **Pruefzyklus:** `pruefung.naechste` in der Vergangenheit ⇒ Hinweis
   „ueberarbeiten", kein Fehler.
7. **Keine erfundenen Zahlen im Entwurf:** offene `PRUEFEN`-Marken sperren
   weiterhin (bestehende Regel aus `ratgeber-payload.mjs`).
