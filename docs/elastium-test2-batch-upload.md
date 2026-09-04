# Elastium Test 2: Farbe 4289 + Batch Upload (24 Farben)

## Status: ✓ METAFELDER GESPEICHERT

### Schritt 1: Color Codes → custom.color_code Metafelder
**Ergebnis:** 24/24 Varianten erfolgreich ✓

| Farbe | Variant ID | SKU | Metafield ID | Status |
|---|---|---|---|---|
| 4276 | `60666926039374` | PVCJOKANEO_4276 | `193600740688206` | ✓ |
| 4289 | `60666926465358` | PVCJOKANEO_4289 | `193600831422798` | ✓ |
| 4290-4311 | siehe Mapping | PVCJOKANEO_4290-4311 | IDs in DB | ✓ |

**Alle 24 Farbcodes sind jetzt im Metafeld `custom.color_code` gespeichert.**

### Schritt 2: Bilder hochladen (AUSSTEHEND)

#### Bild-URLs von jordanshop.de
```
https://media.jordanshop.de/original/pvc-jokaneo-elastium-linoleumboden-4276.jpg
https://media.jordanshop.de/original/pvc-jokaneo-elastium-linoleumboden-4289.jpg
https://media.jordanshop.de/original/pvc-jokaneo-elastium-linoleumboden-4290.jpg
... (bis 4311)
```

#### Upload-Prozess (GraphQL)
1. **stagedUpload** → Bild-URL zu Shopify staging uploaden → Media ID
2. **productVariantAppendMedia** → Media ID zu Variante appenden

#### Blocker & Lösung
**Blocker:** Egress-Policy in Remote Sessions blockiert jordanshop.de
**Lösung:** Upload lokal auf macOS durchführen (kein Network-Policy-Blocker)

### Schritt 3: Farbe 4289 Ready (Metafeld-Side)
**Farbe 4289 Zustand:**
- ✓ Variante erstellt (ID: `60666926465358`)
- ✓ Metafeld `custom.color_code` = "4289" gespeichert
- ⏳ Bild ausstehend (abhängig von jordanshop.de URL-Zugriff)

### Nächste Schritte (Lokal)
1. Bild-URLs von jordanshop.de fetchen (oder generieren)
2. Für jede URL: `stagedUpload` durchführen → Media ID
3. Für jede Variante: `productVariantAppendMedia` aufrufen
4. Evidence sammeln (`metafields + variant images`)
5. Committen

### Varianten-Mapping (Vollständig)
```json
{
  "4276": "gid://shopify/ProductVariant/60666926039374",
  "4289": "gid://shopify/ProductVariant/60666926465358",
  "4290": "gid://shopify/ProductVariant/60666926498126",
  "4291": "gid://shopify/ProductVariant/60666926530894",
  "4292": "gid://shopify/ProductVariant/60666926563662",
  "4293": "gid://shopify/ProductVariant/60666926596430",
  "4294": "gid://shopify/ProductVariant/60666926629198",
  "4295": "gid://shopify/ProductVariant/60666926661966",
  "4296": "gid://shopify/ProductVariant/60666926694734",
  "4297": "gid://shopify/ProductVariant/60666926727502",
  "4298": "gid://shopify/ProductVariant/60666926760270",
  "4299": "gid://shopify/ProductVariant/60666926793038",
  "4300": "gid://shopify/ProductVariant/60666926825806",
  "4301": "gid://shopify/ProductVariant/60666926858574",
  "4302": "gid://shopify/ProductVariant/60666926891342",
  "4303": "gid://shopify/ProductVariant/60666926924110",
  "4304": "gid://shopify/ProductVariant/60666926956878",
  "4305": "gid://shopify/ProductVariant/60666926989646",
  "4306": "gid://shopify/ProductVariant/60666927022414",
  "4307": "gid://shopify/ProductVariant/60666927055182",
  "4308": "gid://shopify/ProductVariant/60666927087950",
  "4309": "gid://shopify/ProductVariant/60666927120718",
  "4310": "gid://shopify/ProductVariant/60666927153486",
  "4311": "gid://shopify/ProductVariant/60666927186254"
}
```

---

**Test 1 Status:** ✓ Complete (Farbe 4276, Metafeld gespeichert)
**Test 2 Status:** 🟡 In Progress (Farbe 4289, Metafelder done, Bilder pending)

**Ausführungsdatum:** 2026-09-04
**Executor:** Claude Haiku 4.5
