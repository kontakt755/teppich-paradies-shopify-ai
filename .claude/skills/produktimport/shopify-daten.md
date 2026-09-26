# Shopify-Schreibzugriff und Produktdaten

Ausgelagert aus CLAUDE.md (#670); gilt fuer jeden Schreibvorgang an Produkten, nicht nur fuer Importe.

### Shopify-Schreibzugriff — nicht nach einem Token suchen

**Der Shopify-MCP-Server ist bereits authentifiziert.** Produkte, Varianten,
Metafelder und Preise laufen ueber `graphql_query` / `graphql_mutation`. Kein
`SHOPIFY_ADMIN_TOKEN` noetig — den braucht nur der GitHub-Actions-Job
`.github/workflows/grosshandel-sync.yml` (Repository-Secret). `atkn_`-Tokens
sind Automatisierungstoken ohne Admin-GraphQL-Zugriff; `shpat_` hat ihn.

- Variantenpreis und SKU: `productVariantsBulkUpdate` (SKU in `inventoryItem: { sku }`).
- Neue Option: `productOptionsCreate` mit `variantStrategy: LEAVE_AS_IS`.
- `productVariantUpdate`, `productVariantCreate`, `productVariantsUpdate` existieren nicht.

**Bevor „die API kann das nicht" faellt, das Schema fragen** — auch Subagenten
schlagen den Mutationsnamen selbst nach, statt ihn im Prompt vorgesetzt zu bekommen.
Der Browser ist nie der Ausweichweg. → `docs/lessons/shopify-schreibzugriff.md`

```
graphql_schema(types: ["OptionCreateInput"])  # Welche Mutations nutzen diesen Input?
graphql_schema(types: ["Query", "Mutation"]) # Alles verfuegbar?
```

### Produktdaten (bestimmt, was Bloecke rendern duerfen)

- Farben sind eine echte Produktoption `Farbe` mit Bild je Variante. Bloecke
  gehen auf die **Option**, nicht auf `product.variants` — sonst erscheint
  dieselbe Farbe mehrfach bei zusaetzlichen Breiten-/Laengenvarianten.
- Fixpreis-/Rollenware-Produkte haben nur `Default Title` und kein Variantenbild.
  Bloecke rendern dort **still nichts**, kein Fallback auf `product.images`.
- Paketprodukte erkennt man am Metafeld `custom.qm_pro_paket`.
- €/m² ist die kundenseitige Leitgroesse; der Shopify-Listenpreis bleibt der
  interne Paketpreis und gehoert nicht prominent auf die Kollektionskarte.
- Produkteigenschaften nicht erfinden und nicht aus Bildern ableiten. Im Zweifel
  als offenen Fall dokumentieren.
- **Farbcodes werden abgeschrieben, nie fortgesetzt.** Echte Lieferantenlisten
  haben Luecken. **24 = 24 ist keine Pruefung** — verglichen werden die Codes
  selbst. `npm run farbcode:guard` findet das Zaehlmuster. → `docs/lessons/produktimport.md`
