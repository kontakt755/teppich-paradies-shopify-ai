# Dynamische Google-Bewertungen Implementation

## Überblick

Diese Implementierung ersetzt die hartcodierte Google-Bewertung `4.8/5 (1.200+ Bewertungen)` durch dynamisch geladene Daten aus dem Google-Unternehmensprofil von **Teppich Paradies Oranienburg GmbH**.

### Features

✅ **Dynamische Bewertungen**: Rating und UserRatingCount werden live aus der Google Places API geladen  
✅ **Sicherer API-Zugriff**: Der API-Key wird nicht öffentlich im Theme hinterlegt  
✅ **Caching**: 1-stundiges Caching reduziert API-Anfragen  
✅ **Keine Fallback-Werte**: Bei API-Fehlern wird keine erfundene Bewertung angezeigt  
✅ **Responsive Design**: Funktioniert auf Desktop und Mobile  
✅ **Zentrale Lösung**: Ein Block funktioniert auf allen Produktseiten  

---

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│         Shopify Produktseiten                           │
│  (product.json, product.fixpreis.json, etc.)            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ tp-google-rating Block (Liquid)                 │   │
│  │ - Zeigt Loading-State                           │   │
│  │ - Lädt Rating via JavaScript                    │   │
│  │ - Rendert ★ Rating/5 (Count) · Link             │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ fetch('/api/store/google-rating')
                       │
┌──────────────────────▼──────────────────────────────────┐
│      Backend Server (Node.js Express)                   │
│      server/index.js                                    │
│                                                         │
│  GET /api/store/google-rating                           │
│  ├─ Validiert API-Key aus Umgebungsvariablen           │
│  ├─ Checked 1h Cache                                   │
│  └─ Ruft Google Places API auf                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│    Google Places API (New)                              │
│    https://places.googleapis.com/v1/places/{placeId}   │
│                                                         │
│  Response:                                             │
│  {                                                     │
│    "places": [{                                        │
│      "rating": 4.8,                                    │
│      "userRatingCount": 347                            │
│    }]                                                  │
│  }                                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Dateien

### Theme-Block
- **`blocks/tp-google-rating.liquid`**: Der Hauptblock für Produktseiten
  - Zeigt Ladezustand während des Fetchens
  - Rendert Sterne (★★★★★), Rating und Bewertungsanzahl
  - Verlinkt direkt zum Google-Profil
  - Responsive CSS für Mobile

### Backend-Server
- **`server/index.js`**: Express-App mit CORS und Logging
- **`server/google-rating-api.js`**: Logik für Places API-Aufrufe und Caching
- **`server/package.json`**: Node.js Dependencies
- **`server/.env.example`**: Beispiel für Umgebungsvariablen

### Produktseiten-Templates
- **`templates/product.json`**: Standard-Produktseite ✅ Aktualisiert
- **`templates/product.fixpreis.json`**: Fixpreis-Produkte ✅ Aktualisiert
- **`templates/product.planken.json`**: Plankenprodukte ✅ Aktualisiert
- **`templates/product.rolle.json`**: Rollenprodukte ✅ Aktualisiert

---

## Setup-Anleitung

### 1. Google Places API konfigurieren

#### 1.1 Google Cloud Project erstellen
1. Gehen Sie zu https://console.cloud.google.com/
2. Erstellen Sie ein neues Projekt oder wählen Sie ein bestehendes
3. Aktivieren Sie die **Places API** (New)
4. Gehen Sie zu **APIs & Services > Credentials**

#### 1.2 API-Key erstellen
1. Klicken Sie auf **+ Create Credentials > API Key**
2. Notieren Sie sich den API-Key

#### 1.3 API-Key einschränken
> ⚠️ **WICHTIG**: Beschränken Sie den Key nur auf Places API!

1. Klicken Sie auf den erstellten Key
2. Unter **API restrictions** wählen Sie:
   - **Restrict key to a specific API** > **Places API**
3. Unter **Application restrictions** wählen Sie:
   - **HTTP referrers (web sites)**
   - Geben Sie Ihre Backend-Server-Domain ein (z.B. `api.teppich-paradies.de`)

#### 1.4 Business Place ID finden
1. Suchen Sie "Teppich Paradies Oranienburg GmbH" auf Google Maps
2. Kopieren Sie die Place ID aus der URL oder Inspect-Element
3. Oder nutzen Sie die Place Details API um die ID zu ermitteln

### 2. Backend-Server einrichten

#### 2.1 Dependencies installieren
```bash
cd server
npm install
```

#### 2.2 Umgebungsvariablen konfigurieren
```bash
cp .env.example .env
```

Bearbeiten Sie `.env`:
```env
GOOGLE_PLACES_API_KEY=AIzaSyD...YourKeyHere...
GOOGLE_BUSINESS_PLACE_ID=ChIJ...YourPlaceIdHere...
SHOPIFY_STORE_URL=https://teppich-paradies-live.myshopify.com
NODE_ENV=production
PORT=3001
```

#### 2.3 Server starten
```bash
npm start
```

Die API sollte unter `http://localhost:3001/api/store/google-rating` erreichbar sein.

### 3. Produktseiten aktualisieren

✅ Der Block `tp-google-rating` wurde bereits zu allen Produktseiten hinzugefügt:
- `templates/product.json`
- `templates/product.fixpreis.json`
- `templates/product.planken.json`
- `templates/product.rolle.json`

Der Block wird **nach den TP-Vorteilen** angezeigt.

### 4. Testing lokal

1. Server starten: `npm start` im `server/`-Verzeichnis
2. Shopify Theme lokal servieren
3. Öffnen Sie eine Produktseite
4. Die Google-Bewertung sollte laden und angezeigt werden

---

## Sicherheit

### API-Key Schutz
- ✅ Der API-Key wird **nicht** im öffentlichen Theme hinterlegt
- ✅ Der API-Key wird nur auf dem Backend-Server gespeichert
- ✅ Der Theme lädt die Daten nur über den sicheren `/api/store/google-rating`-Endpunkt
- ✅ Der Key ist auf Places API beschränkt (read-only Zugriff)
- ✅ Der Key ist auf Ihre Backend-Domain beschränkt

### CORS
- ✅ CORS ist nur für die Shopify-Domain konfiguriert
- ✅ Nur GET-Anfragen werden akzeptiert
- ✅ OPTIONS (Pre-flight) wird unterstützt

### Cache
- ✅ Ergebnisse werden 1 Stunde gecacht
- ✅ Reduziert Anfragen an die Google API
- ✅ Spart Kosten

---

## Fehlerbehandlung

### Was passiert bei API-Fehlern?

**Der Block zeigt nichts an!** Es gibt keine Fallback-Werte (wie früher `4.8/5`).

#### Beispiele:
- **API-Ausfallzeit**: Loading-Spinner wird versteckt, kein Fehler sichtbar
- **Ungültiger Place ID**: Fehler in Server-Logs, Frontend zeigt nichts
- **Netzwerkfehler**: Browser-Console hat Error-Log, Frontend zeigt nichts

#### Debugging:
1. Öffnen Sie die **Browser Console** (F12)
2. Suchen Sie nach `Failed to load Google rating: ...`
3. Überprüfen Sie den Server-Log: `npm start`
4. Testen Sie die API direkt:
   ```bash
   curl http://localhost:3001/api/store/google-rating
   ```

---

## Anzeige-Format

### Beispiel
```
★★★★★ 4,8/5 (347 Bewertungen) · Auf Google lesen
```

### Bestandteile
| Element | Quelle | Format |
|---------|--------|--------|
| `★★★★★` | Fest | 5 Sterne-Symbole |
| `4,8` | Google API `rating` | Dezimal DE (1 Stelle) |
| `347` | Google API `userRatingCount` | Ganzzahl DE (mit Tausender-Trennzeichen) |
| `Auf Google lesen` | Fest | Link zu Google Business Profile |

### Responsive
- **Desktop**: Alle Elemente in einer Zeile
- **Mobile (< 750px)**: Text kleiner, Links umbrechen bei Bedarf

---

## Wartung & Monitoring

### Server Status überprüfen
```bash
curl http://localhost:3001/health
# Response: {"status":"ok","timestamp":"2026-09-01T..."}
```

### Cache leeren (manuell)
Der Cache wird automatisch nach 1 Stunde geleert. Um den Cache manuell zu leeren, starten Sie den Server neu:
```bash
npm start  # Stop (Ctrl+C) und neu starten
```

### Google API Kosten
- **Places Details API** kostet $0.05 pro Anfrage (New pricing)
- Mit 1h-Caching: ~24 Anfragen pro Tag = ~$0.36/Tag = ~$11/Monat
- **Kostenfrei** bis $200/Monat Credits im kostenlosen Tier

### Monitoring-Tipps
1. Überprüfen Sie Google Cloud Console für API-Nutzung
2. Beobachten Sie Server-Logs auf Fehler
3. Testen Sie die API wöchentlich manuell

---

## Production Deployment

### Auf Heroku deployen
```bash
# .env in der Production-Umgebung setzen
heroku config:set GOOGLE_PLACES_API_KEY=AIzaSyD...
heroku config:set GOOGLE_BUSINESS_PLACE_ID=ChIJ...

# Deployen
git push heroku main
```

### Auf AWS Lambda + API Gateway
Siehe [AWS Lambda Node.js Setup Guide]

### Auf Vercel
```bash
# Umgebungsvariablen in Vercel-Dashboard setzen
vercel --prod
```

---

## Troubleshooting

### 1. "Rating unavailable" in Browser Console

**Ursache**: Server hat keinen gültigen API-Key oder Place ID

**Lösung**:
```bash
# Überprüfen Sie .env
cat server/.env

# Testen Sie die API direkt
curl http://localhost:3001/api/store/google-rating
# Sollte JSON mit rating und userRatingCount zeigen
```

### 2. CORS-Fehler in Browser

**Ursache**: Server CORS nicht korrekt konfiguriert

**Lösung**:
```javascript
// In server/index.js prüfen:
origin: [
  'https://teppich-paradies-live.myshopify.com',
  'https://teppich-paradies.de',
  // ... Ihre Domains
]
```

### 3. Block wird auf Produktseite nicht angezeigt

**Ursache**: Template nicht aktualisiert

**Lösung**:
```bash
# Überprüfen Sie, dass der Block in der block_order ist:
grep -A5 'block_order' templates/product.json
# Sollte 'tp_google_rating_UdRxKh' enthalten
```

### 4. Rating wird nicht aktualisiert

**Standard**: Die Seite zeigt die gecachten Daten für 1 Stunde.

**Sofort aktualisieren**: Server neu starten
```bash
# Terminal: Ctrl+C und
npm start
```

---

## Google Attribution

Gemäß Google Places API Terms of Service muss folgende Attribution angezeigt werden:

```
★★★★★ 4,8/5 (347 Bewertungen) · Auf Google lesen
```

✅ **Dies ist bereits im Block korrekt eingebunden:**
- Link zu Google Business Profile
- Verwendung der `userRatingCount`
- Korrekte API-Nutzung

---

## Zukünftige Verbesserungen

- [ ] Reviews/Testimonials von Google laden
- [ ] Rating-Trend anzeigen (z.B. "↑ 0,1 diese Woche")
- [ ] Review-Link im Bild/Modal
- [ ] Multi-Language Support
- [ ] A/B Testing für unterschiedliche Layouts

---

## Support & Fragen

Kontakt: tech@teppich-paradies.de

---

**Zuletzt aktualisiert**: 2026-09-01
