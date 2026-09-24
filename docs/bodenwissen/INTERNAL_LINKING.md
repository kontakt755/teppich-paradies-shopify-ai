# Interne Verlinkung

Stand 2026-09-23. Beziehungen stehen als Daten in der Artikel-JSON, nicht nur im
Fliesstext — nur so kann ein Gate sie pruefen. Modell: `CONTENT_MODEL.md`.

## Beziehungstypen

| Typ | Feld | Wo es erscheint | Regel |
|---|---|---|---|
| PARENT | `parent` | Brotkrume, Hub | genau einer |
| RELATED | `verwandte` | „Weitere Ratgeber" am Artikelende | zwei bis drei |
| NEXT STEP | `naechster_schritt` | hervorgehoben nach dem Inhalt | hoechstens einer |
| GLOSSARY | `lexikon` | inline im Text, Link auf den Anker | so viele wie noetig |
| PRODUCT | `metafields.produkte` | „Passend dazu" | hoechstens vier |
| SERVICE / CALCULATOR | `metafields.cta` | „Passend dazu" | aus der erlaubten Liste |

## Regeln

1. **Jeder Artikel ist ueber mindestens einen echten HTML-Link erreichbar.**
   Keine wichtige Verbindung nur ueber ein JavaScript-Ereignis.
2. **`verwandte` und die Links im Text sagen dasselbe.** Wer einen Artikel im
   Text verlinkt, traegt ihn auch als `verwandte` ein. Das Gate zaehlt beide.
3. **Ankertexte beschreiben das Ziel.** „Teppichboden richtig messen", nicht
   „hier". Das Gate lehnt nichtssagende Anker ab.
4. **Verkaufsziele stehen nach dem Inhalt**, nie in der Einleitung, hoechstens
   vier. Kein Preis, kein Rabatt, kein „jetzt kaufen" im Fliesstext.
5. **Umgekehrt:** Auf der Produktseite erscheint der Ratgeber hoechstens als
   Textlink unterhalb des Warenkorb-Knopfs. Nichts zwischen Konfiguration und
   Kauf. (Regel aus `docs/ratgeber/README.md`, gilt weiter.)
6. **Lexikonbegriffe** werden inline erklaert und verlinken optional auf den
   Anker. Keine Pop-ups.

## Beispiel: „Teppichboden auf Fliesen" (TB-V-02, geplant)

```
parent              ratgeber-teppichboden
verwandte           untergrund-pruefen-und-vorbereiten, boden-spachteln,
                    teppichboden-verlegen-lose-fixieren-oder-kleben
naechster_schritt   teppichboden-richtig-ausmessen
lexikon             grundierung, spachtelmasse, fixierung
metafields.cta      verlegeservice, zubehoer
metafields.kollektion  teppichboden
```

## Was das Gate prueft

`npm run bodenwissen:guard`:

- jedes Ziel in `verwandte`, `naechster_schritt`, `lexikon` existiert
- kein Verweis auf sich selbst
- jeder `/blogs/…`-Link im Artikeltext zeigt auf einen vorhandenen Artikel
  (Tag-Ansichten zaehlen nicht als Artikel-Link)
- kein nichtssagender Ankertext
- **Hinweis** (kein Fehler), wenn ein veroeffentlichter Artikel keinen
  eingehenden Link aus einem anderen Artikel hat — er ist dann nur ueber den Hub
  erreichbar

Kollektions- und Seitenlinks kann das Repo nicht pruefen; die liegen im Shop.
Dafuer sind `npm run menu:guard` und `qa/run-seo-check.mjs` zustaendig.
