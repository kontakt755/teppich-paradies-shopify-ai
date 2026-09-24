# Teppich Paradies Bodenwissen

Wissensbereich des Shops: Fragen rund um Teppiche und Bodenbelaege so
beantworten, dass Menschen weiterkommen — und dabei sichtbar machen, dass
hinter dem Shop ein Betrieb steht, der Boeden verkauft **und** verlegt.

Sichtbar unter `/pages/ratgeber`. Aufgabe #505, baut auf #422 auf.

## Wo anfangen

| Frage | Datei |
|---|---|
| Was gibt es schon, was fehlt? | `AUDIT.md` |
| Wie ist das Portal aufgebaut, und warum so? | `ARCHITECTURE.md` |
| Welche Felder hat ein Artikel, wo liegen sie? | `CONTENT_MODEL.md` |
| Welche Regeln gelten beim Schreiben? | `SEO_RULES.md` |
| Wie wird verlinkt? | `INTERNAL_LINKING.md` |
| Was steht als naechstes an? | `CONTENT_BACKLOG.md` |
| Was brauchen wir vom Betrieb? | `EXPERT_INPUT.md` |
| Welche Bilder fehlen? | `IMAGE_SHOTLIST.md` |
| Wie wird gemessen? | `ANALYTICS.md` |
| Was muss vor dem Livegang stimmen? | `QA_CHECKLIST.md` |

`docs/ratgeber/README.md` bleibt daneben bestehen: Es ist das Protokoll des
Livegangs vom 2026-09-21 und die Quelle der Metafeld-Konvention. Wo beide etwas
sagen, gilt die Architektur hier — und `docs/ratgeber/README.md` wird nur dort
angepasst, wo etwas tatsaechlich anders geworden ist.

## Die vier Regeln, die alles andere tragen

1. **Erweitern, nicht ersetzen.** Der Ratgeber laeuft seit dem 21.09. Templates,
   Metafelder, Sections und das Payload-Skript bleiben, wo sie sind.
2. **Ungeprueftes wird gestrichen, nicht vermutet.** Keine erfundenen
   Praxiserfahrungen, Herstellerangaben, Zahlen oder Suchvolumina. Was das
   Verlegeteam nicht bestaetigt hat, steht nicht im Artikel.
3. **Eine Nutzerfrage, ein Artikel.** Die harte Regel prueft das Gate
   (`begriff` + `intent` nur einmal im Portal). Im Zweifel den bestehenden
   Artikel ausbauen.
4. **Besserer Inhalt schlaegt mehr Inhalt.** Es gibt keine Mindestwortzahl und
   keine Keyword-Dichte.

## Taeglich gebraucht

```
npm run bodenwissen:guard                  # Modell, Kannibalisierung, Verweise
npm run bodenwissen:guard -- --json        # Maschinenform
npm run ratgeber:payload -- content/ratgeber/<bereich> --blog-id <gid> --kollektionen <datei>
```

Vor jedem Commit zusaetzlich die Theme-Gates aus `CLAUDE.md`.

## Stand

| Teil | Zustand |
|---|---|
| Bereich Teppichboden, 5 Artikel | live seit 2026-09-21 |
| Redaktionsmodell + Gate | steht |
| Artikel in der Shop-Suche | umgesetzt, noch nicht live |
| Lexikon (16 Begriffe), Problem-Finder (6 mit Ziel), Rechner | gebaut und am Shop geprueft; Metaobjekte angelegt, Seiten fehlen noch |
| Bereiche Teppiche, Vinyl, Untergrund | geplant, Blogs noch nicht angelegt |
| Messung | wartet auf GA4 und Search Console |
