# Error Learning: Shopify Varianten-Erstellung

## Problem (was schiefging)

1. Produkt erstellt OHNE Options-Definition
2. Versuch, Varianten zu erstellen mit optionValues → **FEHLER: "Option ist nicht vorhanden"**
3. Versuch, Options nachträglich hinzuzufügen → **FEHLER: productUpdate akzeptiert `options` nicht**

## Root Cause

**Options müssen beim productCreate definiert werden — nicht nachträglich!**

```graphql
❌ FALSCH:
1. productCreate(input: {title: "X"})  // Keine options
2. productUpdate(input: {options: ["Farbe"]})  // Zu spät!
3. productVariantsBulkCreate(variants: [{optionValues: [{optionName: "Farbe", name: "Rot"}]}])

✓ RICHTIG:
1. productCreate(input: {
     title: "X"
     options: ["Farbe"]  // MUSS hier sein!
     variants: [{price: "10", optionValues: [{optionName: "Farbe", name: "Rot"}]}]  // Optional: erste Variante
   })
2. productVariantsBulkCreate(productId: "...", variants: [{optionValues: [{optionName: "Farbe", name: "Blau"}]}])
```

## Korrekte Lösung für Bodenbeläge mit 24 Farben

### Strategie A: ALL-IN-ONE beim CREATE (beste Option)
```graphql
productCreate(input: {
  title: "Elastium Linoleumboden 200cm"
  options: ["Farbe"]  // Define options FIRST
  variants: [
    {price: "39.95", optionValues: [{optionName: "Farbe", name: "Farbe 4276"}], inventoryItem: {sku: "PVCJOKANEO_4276"}}
    ... 23 more variants ...
  ]
}) {
  product { id }
}
```

### Strategie B: Basis + Bulk (wenn Varianten zu lang für create)
```graphql
Step 1:
productCreate(input: {
  title: "Elastium Linoleumboden 200cm"
  options: ["Farbe"]  // CRITICAL
  variants: [{price: "39.95", optionValues: [{optionName: "Farbe", name: "Farbe 4276"}], inventoryItem: {sku: "PVCJOKANEO_4276"}}]
})

Step 2:
productVariantsBulkCreate(productId: "result.id", variants: [
  {price: "39.95", optionValues: [{optionName: "Farbe", name: "Farbe 4289"}], inventoryItem: {sku: "PVCJOKANEO_4289"}}
  ... 22 more ...
])
```

## Publishing (korrekte Syntax)

```graphql
❌ FALSCH:
publishablePublish(id: "...", input: {
  publicationsToPublish: ["id1", "id2"]  // Wrong structure
})

✓ RICHTIG:
publishablePublish(input: {
  id: "gid://shopify/Product/..."
  publicationsToPublish: ["gid://shopify/Publication/239013396814", "gid://shopify/Publication/239013462350"]
})
```

## Action Items for Skill

1. **Update teppichparadies-jordanshop-import Skill:**
   - Dokumentiere: "Options müssen beim productCreate definiert werden"
   - Template: productCreate mit `options: ["Farbe"]`
   - Template: productVariantsBulkCreate mit korrekte optionValues-Struktur ({optionName, name})

2. **Update teppichparadies-product-naming Skill:**
   - Noch OK, aber referenziere diese Varianten-Erstellungs-Regel

3. **Codex Entry erstellen:**
   - "Shopify GraphQL: Varianten mit optionValues"
   - Link zu dieser Learning-Datei

## Testing Strategie

Nächster Versuch:
1. Archiviere altes Produkt (gid://shopify/Product/16045134381390)
2. Erstelle NEUES Produkt mit options + erste Variante in productCreate
3. Füge 23 weitere via productVariantsBulkCreate hinzu
4. Publish richtig

## BONUS Learning: Shopify MCP ist NICHT Raw GraphQL

Die `graphql_mutation` / `graphql_query` Tools sind SIMPLIFIED wrapper:
- Sie akzeptieren nicht `options` oder `variants` in productCreate
- Sie haben unterschiedliches Input-Schema als native Shopify Admin API

**Korrekte Strategie:**
- Nutze `create-product` Tool für Basis-Setup (hat optionValues-Support)
- Nutze Raw GraphQL NUR für einfache Updates (Metafields, Publishing)

Diese Erkenntnis spart zukünftig 10+ fehlgeschlagene Versuche!

---

# SKILL IMPROVEMENTS: Rollenware, Tags, Kollektionen, SEO

## 1. Theme-Vorlage: Material-spezifische Description

### ❌ FALSCH (aktuell im Skill)
Alle nutzen gleiche Template → falsch für Linoleum/Vinyl

### ✓ RICHTIG: Template per Material-Typ

#### Template A: Teppichboden (Polmaterial + Struktur)
```html
<div class="pd-card">
<h3>{Marke} Teppichboden</h3>
<p>{Marke} ist ein {Eigenschaft}-Teppichboden mit {Kurzbeschreibung}. 
{weitere Vorteile in 1-2 Sätzen}. 
{Marke} funktioniert mit Fußbodenheizung (Warmwasser und Elektro) 
und ist in {N} Farben sowie den Breiten {Breiten} erhältlich.</p>
<div class="pd-badges">
<span class="pd-badge">{Polhöhe} mm Polhöhe</span>
<span class="pd-badge">{Material}</span>
<span class="pd-badge">Fußbodenheizung geeignet</span>
<span class="pd-badge">Nutzungsklasse {X}</span>
</div>
<table class="pd-specs">
<tr><th>Eignung</th><td>Wohnräume</td></tr>
<tr><th>Material</th><td>{Polmaterial}</td></tr>
<tr><th>Polhöhe</th><td>{X} mm</td></tr>
<tr><th>Verfügbare Breiten</th><td>{Breiten}</td></tr>
<tr><th>Rückenausstattung</th><td>{Träger}</td></tr>
</table>
</div>
```

#### Template B: Linoleumboden / Vinylboden (Elastische Beläge)
```html
<div class="pd-card">
<h3>{Marke} Linoleumboden</h3>
<p>{Marke} ist ein elastischer Linoleumboden mit hoher Strapazierfähigkeit 
und einfacher Reinigung. 
Ideal für Wohnräume und gewerbliche Nutzung durch Rutschhemmung und Dauerhaftigkeit. 
{Marke} funktioniert mit Fußbodenheizung (Warmwasser und Elektro) 
und ist in {N} Farben sowie {Breiten} Breiten erhältlich.</p>
<div class="pd-badges">
<span class="pd-badge">{Stärke} mm Stärke</span>
<span class="pd-badge">Elastisch & rutschhemmend</span>
<span class="pd-badge">Fußbodenheizung geeignet</span>
<span class="pd-badge">Nutzungsklasse {X}</span>
</div>
<table class="pd-specs">
<tr><th>Eignung</th><td>Wohnräume & Gewerbe</td></tr>
<tr><th>Material</th><td>Linoleum elastisch</td></tr>
<tr><th>Stärke</th><td>{Stärke} mm</td></tr>
<tr><th>Verfügbare Breiten</th><td>{Breiten}</td></tr>
<tr><th>Brandverhalten</th><td>{Cfl-s1}</td></tr>
</table>
</div>
```

**Key Differences:**
- Teppichboden: Fokus auf Komfort, Polhöhe, Material
- Linoleum/Vinyl: Fokus auf Strapazierfähigkeit, Gewerbe-Eignung, Reinigung

---

## 2. Tags: Wohnbereiche + Objektbeläge

### ❌ FALSCH (aktuell)
```
art: teppichboden
breite_boden: 200cm
material: linoleum
raum: wohnzimmer  ← NUR Wohn
raum: schlafzimmer
raum: flur
raum: kinderzimmer
```

### ✓ RICHTIG: Material-spezifische Raum-Tags

#### Tags für Teppichboden
```
art: teppichboden
breite_boden: 400cm, 500cm
material: polyamid | polyester | polypropylen
raum: wohnzimmer, schlafzimmer, flur, kinderzimmer
nutzungsklasse: 31, 32, 33, 34, 41, 42
```

#### Tags für Linoleumboden / Vinylboden (Rollenware)
```
art: linoleumboden | vinylboden
breite_boden: 200cm, 400cm
material: linoleum | vinyl
raum: wohnzimmer, schlafzimmer, flur
nutzungsklasse: 34, 41
objekt: büro, gewerbe, einzelhandel  ← NEU
eignung: rutschhemmend, pflegeleicht, hygienebelag
```

---

## 3. Kollektionen-Logik

### ❌ FALSCH (aktuell)
```python
add_to_collection(product_id, "gid://shopify/Collection/688863674702")  # Immer "Teppichboden"
```

### ✓ RICHTIG: Material-basierte Kollektion

```python
def get_collection_for_product(material_type, product_title):
    """
    Bestimme Kollektion basierend auf Material.
    Wenn nicht existent → melde Fehler + erstelle neue Kollektion
    """
    
    if material_type == "teppichboden":
        collection_id = "gid://shopify/Collection/688863674702"  # "Teppichboden"
    elif material_type == "linoleumboden":
        collection_id = get_or_create_collection("Linoleumboden")
    elif material_type == "vinylboden":
        collection_id = get_or_create_collection("Vinylboden")
    else:
        raise Exception(f"Keine Kollektion für {material_type}")
    
    return collection_id

def get_or_create_collection(collection_name):
    """
    Such Kollektion. Wenn nicht existent:
    1. Meldung: "Kollektion '{name}' nicht gefunden. Erstelle..."
    2. Erstelle Kollektion
    3. Gebe ID zurück
    """
    # Search
    result = graphql_query(f'collections with title = "{collection_name}"')
    
    if result.exists:
        return result.id
    else:
        log.warning(f"Kollektion '{collection_name}' nicht gefunden. Erstelle...")
        new_id = create_collection(collection_name)
        log.info(f"✓ Kollektion erstellt: {new_id}")
        return new_id
```

---

## 4. SEO-Text: Kundenfreundlich & "Idiotensicher"

### Richtlinien (NO Fremdwörter!)

#### ❌ FALSCH (zu technisch)
```
Elastium ist ein Linoleum-Elastomerboden mit hochpermeabler Oberflächenvergütung, 
nukleophiler Heterogenität und Oberflächenrauheit für optimale Adhäsion.
```

#### ✓ RICHTIG (einfach, verkaufsstark, hilfreich)

**Grundstruktur:**
```
{Produktname} ist ein robuster, pflegeleichter Boden für {Raum}.
[Warum es gut ist: 3-4 einfache Vorteile]
[Passt überall: Fußbodenheizung? Kinder? Haustiere?]
[Größe & Farben]
```

**Beispiel Linoleumboden:**
```
Elastium Linoleumboden — pflegeleicht für die ganze Familie.

Robuster Boden für Wohnzimmer, Küche und Flur. 
Rutschfest (niemand rutscht aus), leicht zu putzen (ein Wischmopp reicht), 
langlebig (hält jahrelang) und strapazierfähig.

Funktioniert mit Fußbodenheizung — auch wenn es kalt ist, bleibt der Boden 
angenehm warm. Ideal für Haushalte mit Kindern und Haustieren.

Erhältlich in 24 Farben und 200 cm Breite. 
Kostenloses Musterset? Kontaktieren Sie uns.
```

**Checkliste: "Idiotensicher"**
- ✓ Jeder Satz max. 15 Wörter
- ✓ Keine: Homogenität, Nutzungsklasse (→ "langlebig"), Polmaterial (→ "robust")
- ✓ Konkrete Vorteile: "rutschfest", "leicht zu putzen", nicht "tribologisch optimiert"
- ✓ Emotionale Triggers: Familie, Haustiere, Wärme
- ✓ Call-to-Action: "Kontaktieren Sie uns" (nicht "Requestieren Sie Sample")

---

## Integration in Skill

**Update teppichparadies-jordanshop-import:**
1. Theme-Template per Material (Schritt 4: descriptionHtml)
2. Tags-Logik (Schritt 5: Tags)
3. Kollektion-Selection + Create (Schritt 6: Collection mit Fehlerbehandlung)
4. SEO-Text nach Richtlinien (Titel-Tag, Description-Tag)

