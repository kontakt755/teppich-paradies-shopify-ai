# Livegang Seite „Maler Oranienburg“ (Stand 27.11.2026, noch nicht live)

Template im Repository: `templates/page.maler-oranienburg.json`. **Reihenfolge ist wichtig:** Die Shopify-Seite muss existieren und das Template-Suffix `maler-oranienburg` tragen, bevor das Theme live geht; sonst rendert sie mit `page.json`.

## 1. Seite anlegen (unveröffentlicht)

`pageCreate` über die Admin-API (Skill `shopify-massendaten` zu den GraphQL-Fallen, vorher `pages`-Felder im Schema nachsehen):

- `title`: `Maler Oranienburg: Wände streichen lassen`
- `handle`: `maler-oranienburg`
- `templateSuffix`: `maler-oranienburg`
- `isPublished`: `false`
- `body`: leer (der Inhalt kommt aus dem Template)

Danach Title-Tag und Description setzen (Metafelder `global.title_tag` und `global.description_tag`, wie in `domains/shopify/verlegeservice-livegang-vorlage.md`, Abschnitt B). `snippets/meta-tags.liquid` hängt „ – TeppichParadies“ an den Titel an.

- Title-Tag (≤ 55 Zeichen vor dem Zusatz): `Maler Oranienburg: Wände streichen lassen`
- Description (ca. 150 Zeichen): `Wände und Decken streichen, tapezieren und auf Wunsch gleich den neuen Boden: Maler- und Bodenarbeiten aus einer Hand in Oranienburg, Oberhavel und Berlin.`

## 2. Prüfen auf dem Mac (Remote-Sitzungen erreichen die Storefront nicht)

1. Branch mergen nach Freigabe (Skill `ship`), `npm run workflow:doctor`, `workflow:preview`.
2. Preview: Seite bei 390 und 1366 px, eine H1, Formular absenden (intern markierte Anfrage), Mail kommt mit Betreff „Anfrage Malerarbeiten“, Control Center ordnet sie „Malerarbeiten“ zu, Pixel `tp_lead_form_submit` nur nach Erfolg.
3. Seite veröffentlichen, dann `workflow:live` (Skill `deploy`), danach den öffentlichen Shop ohne Preview-Parameter ansehen.
4. `qa/seo.config.json`: Seite `/pages/maler-oranienburg` ergänzen (Title und Description wie oben) und `npm run seo:check` laufen lassen.

## 3. Danach: Anzeigen

Entwurf: `docs/google/maler-boden-search-entwurf-2026-11-27.md`. Anzeigen erst aktivieren, wenn Seite live ist und die Formular-Conversion nachgewiesen ist.
