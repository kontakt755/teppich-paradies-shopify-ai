# Google-Bewertung im Shop

**Stand 2026-09-21: Die Live-Abfrage ist verworfen, der Entwurf ist entfernt (Issue #170, Entscheidung Inhaber).**

## Was gilt
Die sichtbare Bewertung ("4,9/5 aus ueber 240 Bewertungen", Link "Auf Google lesen") ist **statisch**:
`blocks/tp-bewertungsbeleg.liquid`, gespeist aus der Theme-Einstellung. `npm run bewertung:guard`
stellt sicher, dass sie nicht wieder einzeln in Templates gepflegt wird.

Note und Anzahl werden im Google-Unternehmensprofil **abgelesen und abgeschrieben, nie geschaetzt**
(zuletzt 2026-09-12: 4,9 aus 240 Rezensionen). Aendert sich die Bewertung, wird die Theme-Einstellung
von Hand nachgezogen. Ein leeres Feld blendet die Angabe aus.

## Was entfernt wurde und warum
- `blocks/tp-google-rating.liquid` - renderte seit 2026-09-15 absichtlich nichts, lag in keinem Template
  und erzeugte die einzige `schema:guard`-Warnung.
- `server/` (Node-Dienst mit `/api/store/google-rating`) - lauffaehig, aber nie deployed.

Der Grund war nie der Code, sondern das Hosting: Shopify hostet die Storefront, ein Theme kann keine
eigene Route bedienen; ein `fetch('/api/store/google-rating')` trifft Shopify und liefert 404. Ein
Live-Abruf braeuchte einen eigenen gehosteten Dienst plus Shopify App Proxy (`/apps/bewertung`) und die
Schluessel `GOOGLE_PLACES_API_KEY` / `GOOGLE_BUSINESS_PLACE_ID` - also laufende Kosten und Betrieb.

## Falls es spaeter doch gewuenscht ist
Der Entwurf liegt in der Git-Historie: `git log --all --oneline -- server/ blocks/tp-google-rating.liquid`.
Reihenfolge dann: Dienst deployen, App Proxy einrichten, erst danach einen Block bauen, der
`/apps/bewertung` abfragt und bei Fehlern auf die statische Anzeige zurueckfaellt.
