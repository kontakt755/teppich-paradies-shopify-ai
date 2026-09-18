# Shopify-Schreibzugriff: die Token-Suche und der erfundene Mutationsname

**Regel:** Der Shopify-MCP-Server ist bereits authentifiziert. Kein
`SHOPIFY_ADMIN_TOKEN` suchen. Bevor „die API kann das nicht" faellt,
`graphql_schema` fragen. Der Browser ist nie der Ausweichweg.

## Eine Sitzung Token-Suche (2026-09-04)

Eine komplette Sitzung ging dafuer drauf, einen `shpat_`-Token zu suchen und
Variantenpreise ueber Chrome-Automation zu setzen — beides unnoetig. Der
MCP-Server konnte die Schreibzugriffe die ganze Zeit ueber
`graphql_query` / `graphql_mutation`.

Der einzige Ort, der einen echten Token braucht, ist der GitHub-Actions-Job
`.github/workflows/grosshandel-sync.yml` — dort laeuft kein MCP-Server, deshalb
liegt der Token als Repository-Secret `SHOPIFY_ADMIN_TOKEN`.

| Praefix | Wofuer | GraphQL Admin API? |
|---|---|---|
| `atkn_` | App-Automatisierungstoken, CI/CD und Webhooks | nein — „Invalid API key or access token" |
| `shpat_` | Admin API access token einer Store-App | ja |

## Der erfundene Mutationsname (2026-09-05)

Dasselbe Muster eine Ebene hoeher: Ein Subagent bekam den erfundenen Namen
`productCreateVariant` vorgesetzt, suchte 31 Aufrufe lang, scheiterte an
`productUpdate` und meldete, Optionen gingen nur von Hand. Danach acht Runden
Browser-Auswahl und Login — alles auf einer falschen Praemisse. Eine
Schema-Abfrage haette es in einem Aufruf geklaert:

```
graphql_schema(types: ["OptionCreateInput"])  # Welche Mutations nutzen diesen Input?
graphql_schema(types: ["Query", "Mutation"]) # Alles verfuegbar?
```

Daraus folgt fuer Subagenten: Ihnen den Mutationsnamen im Prompt vorzugeben ist
die Ursache, nicht die Hilfe — sie sollen ihn im Schema nachschlagen.

## Die tatsaechlichen Mutationen

- Variantenpreis und SKU: `productVariantsBulkUpdate` (SKU im verschachtelten
  `inventoryItem: { sku }`).
- Neue Produktoption: `productOptionsCreate` mit `variantStrategy: LEAVE_AS_IS`
  — alle vorhandenen Varianten tragen den neuen Wert, ohne dass eine neu
  angelegt wird.
- `productVariantUpdate`, `productVariantCreate`, `productVariantsUpdate`
  existieren nicht.
