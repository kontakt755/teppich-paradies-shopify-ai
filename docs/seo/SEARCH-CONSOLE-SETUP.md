# Google Search Console & Bing Webmaster Setup

**Ziel:** Sitemap einreichen damit Google & Bing aktiv crawlen + indexieren.

**Status:** Sitemap ist vorhanden unter https://www.teppich-paradies.net/sitemap.xml

---

## Google Search Console

### Schritt 1: Öffne Google Search Console
👉 https://search.google.com/search-console

Klick auf **"Jetzt starten"** (oben links)

### Schritt 2: Mit Inhaberkonto anmelden
- Verwende dein Google-Konto (das mit der Shopify-Domain verknüpft ist)
- Falls nicht vorhanden: Ein Google-Konto mit der Inhaberemail anlegen

### Schritt 3: Property hinzufügen
1. Oben links: **"Property hinzufügen"**
2. Wähle: **URL-Präfix** (nicht Domain)
3. Gebe ein: `https://www.teppich-paradies.net`
4. Klick: **"Weiter"**

### Schritt 4: Inhaberschaft verifizieren
Google fragt dich, wie du die Domain besitzt. Wähle **eine** dieser Methoden:

#### Option A: HTML-Datei (einfachste für Shopify)
1. Google zeigt eine Datei wie `google1234567890.html`
2. **Speichern** (download)
3. Im Shopify Admin:
   - Online-Shop → Dateien
   - Diese HTML-Datei hochladen (unter `/cdn/shop/files/`)
   - URL wird: `https://www.teppich-paradies.net/cdn/shop/files/google1234567890.html`
4. Zurück zu Google → **"Verifizieren"**

#### Option B: Meta-Tag (automatisch)
1. Google zeigt ein Meta-Tag: `<meta name="google-site-verification" content="...">`
2. Im Shopify Admin:
   - Einstellungen → Online-Shop → Branding
   - Unter "Additional scripts" oder in Theme-Einstellungen → JSON anpassen
   - Tag einfügen
3. Zurück zu Google → **"Verifizieren"**

#### Option C: DNS-Record (am genauesten, braucht Domain-Zugriff)
1. Bei deinem Domain-Registrar (z.B. GoDaddy, 1&1):
   - DNS-Einstellungen öffnen
   - Einen neuen TXT-Record hinzufügen mit Google's Wert
   - Speichern
2. Zurück zu Google → **"Verifizieren"** (kann 24-48h dauern)

### Schritt 5: Sitemap einreichen
1. Nach erfolgreicher Verifizierung: Gehe zu **"Sitemaps"** (linkes Menü)
2. Gebe ein: `https://www.teppich-paradies.net/sitemap.xml`
3. Klick: **"Einreichen"**
4. Fertig ✅

### Schritt 6: Strukturierte Daten überprüfen
1. Gehe zu: **"Verbesserungen"** (linkes Menü)
2. Wähle: **"Strukturierte Daten"**
3. Prüfe: Sind **Product** und **FAQPage** Schemen vorhanden?
   - Sollte zeigen: "Gültig" mit grünem Häkchen
   - Falls nicht: Warte 24-48h, dann neu laden

---

## Bing Webmaster Tools

### Schritt 1: Öffne Bing Webmaster Tools
👉 https://www.bing.com/webmasters/

### Schritt 2: Mit Inhaberkonto anmelden
- Nutze Microsoft-Konto (MSN, Outlook, etc.)
- Falls nicht vorhanden: Neues Konto erstellen

### Schritt 3: Website hinzufügen
1. Klick auf **"Website hinzufügen"**
2. Gebe ein: `https://www.teppich-paradies.net`
3. Klick: **"Hinzufügen"**

### Schritt 4: Inhaberschaft verifizieren
Bing bietet diese Optionen:

#### Option A: XML-Sitemap (schnellste für Shopify)
1. Gebe ein: `https://www.teppich-paradies.net/sitemap.xml`
2. Klick: **"Sitemap hinzufügen"**
3. Fertig — Bing crawlt automatisch!

#### Option B: Meta-Tag
Ähnlich wie Google — Meta-Tag im Theme einfügen

#### Option C: CNAME-Record
Für erweiterte Verifizierung (optional)

### Schritt 5: Sitemap in Bing Webmaster Tools einreichen
1. Linkes Menü: **"Sitemaps"**
2. Gebe ein: `https://www.teppich-paradies.net/sitemap.xml`
3. Klick: **"Hinzufügen"**
4. Fertig ✅

---

## Überprüfung nach 24-48 Stunden

### Google Search Console
- Gehe zu: **"Sitemaps"** → `sitemap.xml`
- Sollte zeigen: "Status: Erfolgreich" mit Anzahl der gescannten URLs

### Bing Webmaster Tools
- Gehe zu: **"Sitemaps"**
- Sollte zeigen: "Status: Verarbeitet" mit Statusmeldungen

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| "Domain-Verifizierung gescheitert" | Prüfe: HTML-Datei ist unter `/cdn/shop/files/` sichtbar, oder Meta-Tag ist im Theme |
| "Sitemap wird nicht gescrawlt" | Warte 24h, dann manuell aktualisieren (Knopf "Abrufen") |
| "0 URLs in Sitemap" | Prüfe: robots.txt erlaubt Crawling von `/` |
| "Schema nicht erkannt" | Warte 48h für vollständiges Crawling der Seiten |

---

## Nächste Schritte nach Einrichtung

1. ✅ Sitemap einreichen (diese Anleitung)
2. ✅ Schema verifizieren (Google Rich Results Test)
3. Warte 7 Tage → Website sollte in Google- & Bing-Suche auftauchen
4. Überwache: Google Search Console → "Leistung" → Impressionen & Klicks

---

**Geschrieben am:** 2026-09-25  
**Seite:** www.teppich-paradies.net  
**Shop:** sjjyq1-6w.myshopify.com
