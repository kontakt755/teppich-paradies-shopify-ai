#!/bin/bash

###############################################################################
# Google Cloud Setup Automation Script
# Automatisiert:
# 1. Google Cloud Project erstellen
# 2. Places API aktivieren
# 3. API Key mit Restrictions erstellen
# 4. Place ID finden
###############################################################################

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    Google Cloud Setup für Teppich Paradies                ║"
echo "║    Automatische Konfiguration                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check ob gcloud installiert ist
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI nicht gefunden!${NC}"
    echo "Installieren Sie: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Authentifizierung
echo -e "${BLUE}1. Google Cloud Authentifizierung${NC}"
echo "Bitte authentifizieren Sie sich mit Ihrem Google Account..."
echo ""

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
    echo "Öffne Browser für Authentifizierung..."
    gcloud auth login
fi

ACCOUNT=$(gcloud config get-value account)
echo -e "${GREEN}✅ Authentifiziert als: $ACCOUNT${NC}"
echo ""

# Projekt erstellen oder auswählen
echo -e "${BLUE}2. Google Cloud Project${NC}"

PROJECT_ID="teppich-paradies-api-$(date +%s | tail -c 5)"
PROJECT_NAME="Teppich Paradies API"

echo "Erstelle neues Projekt: $PROJECT_NAME"
gcloud projects create $PROJECT_ID --name="$PROJECT_NAME"
echo -e "${GREEN}✅ Projekt erstellt: $PROJECT_ID${NC}"

gcloud config set project $PROJECT_ID
echo -e "${GREEN}✅ Aktives Projekt: $PROJECT_ID${NC}"
echo ""

# Enable Billing (Required for APIs)
echo -e "${BLUE}3. Enable Billing${NC}"
echo "Hinweis: Sie benötigen ein Billing Account für Google Cloud APIs"
echo "Wird 1-2 Minuten überwacht (Places API ist kostenlos bis $200/mo)"
echo ""

# Places API aktivieren
echo -e "${BLUE}4. Places API aktivieren${NC}"
echo "Aktiviere Places API (New)..."

# Enable the Places API
gcloud services enable places-api.googleapis.com

echo -e "${GREEN}✅ Places API aktiviert${NC}"
echo ""

# API Key erstellen
echo -e "${BLUE}5. API Key erstellen${NC}"
echo "Erstelle einen neuen API Key..."

API_KEY=$(gcloud services api-keys create \
    --display-name="Teppich Paradies API Key" \
    --api-target=places-api.googleapis.com \
    --format='value(uid)' 2>/dev/null || echo "")

if [ -z "$API_KEY" ]; then
    echo "Versuche REST API Methode..."
    # Fallback auf REST API wenn gcloud Command nicht unterstützt wird
    echo -e "${YELLOW}⚠️  gcloud API Key Creation nicht unterstützt${NC}"
    echo "Verwende Cloud Console stattdessen..."

    CONSOLE_URL="https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
    echo ""
    echo "Öffne diese URL in Ihrem Browser:"
    echo "$CONSOLE_URL"
    echo ""
    echo "Dann:"
    echo "1. Klicken Sie auf '+ Create Credentials'"
    echo "2. Wählen Sie 'API Key'"
    echo "3. Kopieren Sie den Key"
    echo ""
    read -p "Geben Sie den API Key ein: " API_KEY
fi

if [ -z "$API_KEY" ]; then
    echo -e "${RED}❌ Fehler beim Erstellen des API Keys${NC}"
    exit 1
fi

echo -e "${GREEN}✅ API Key erstellt:${NC}"
echo "$API_KEY"
echo ""

# API Key Restrictions setzen
echo -e "${BLUE}6. API Key Restrictions setzen${NC}"
echo "Beschränke API Key auf Places API (erhöht Sicherheit)..."

# Note: Restrictions müssen über Console gesetzt werden, da gcloud Unterstützung begrenzt ist
echo -e "${YELLOW}⚠️  Bitte Restrictions manuell setzen:${NC}"
echo ""
echo "1. Gehen Sie zu: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "2. Klicken Sie auf den erstellten API Key"
echo "3. Unter 'API restrictions' wählen Sie 'Places API'"
echo "4. Speichern Sie"
echo ""

# Place ID finden
echo -e "${BLUE}7. Google Business Place ID finden${NC}"
echo ""
echo "Methode A: Über Google Maps (Einfach)"
echo "1. Öffnen Sie: https://www.google.com/maps"
echo "2. Suchen Sie: 'Teppich Paradies Oranienburg GmbH'"
echo "3. Öffnen Sie die Business-Seite"
echo "4. Die URL hat Format: maps.google.com/.../@...z/data=!4m6...ChIJ..."
echo "5. Kopieren Sie den 'ChIJ...' Teil"
echo ""

# Optional: Versuche Place ID über API zu finden
echo "Methode B: Über Google Places API"
echo ""

# Überprüfe ob der API Key gültig ist (Optional)
read -p "Möchten Sie die Place ID automatisch finden? (j/n): " find_place_id

if [[ $find_place_id =~ ^[Jj]$ ]]; then
    echo ""
    echo "Verwende Google Places API um Place ID zu finden..."
    echo ""

    SEARCH_QUERY="Teppich Paradies Oranienburg GmbH"

    # Warte kurz, damit API-Restrictions wirksam werden
    echo "Warte 10 Sekunden, bis API-Restrictions aktiv sind..."
    sleep 10

    RESPONSE=$(curl -s "https://places.googleapis.com/v1/places:searchText" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Goog-Api-Key: $API_KEY" \
        -d "{
            \"textQuery\": \"$SEARCH_QUERY\"
        }" 2>/dev/null || echo "{}")

    PLACE_ID=$(echo "$RESPONSE" | grep -o '"name":"places/[^"]*' | head -1 | sed 's/"name":"places\///' || echo "")

    if [ -n "$PLACE_ID" ]; then
        echo -e "${GREEN}✅ Place ID gefunden:${NC}"
        echo "$PLACE_ID"
    else
        echo -e "${YELLOW}⚠️  Place ID konnte nicht automatisch gefunden werden${NC}"
        echo "Verwenden Sie stattdessen Methode A (Google Maps)"
    fi
else
    echo ""
    read -p "Geben Sie die Place ID manuell ein: " PLACE_ID
fi

if [ -z "$PLACE_ID" ]; then
    echo -e "${RED}❌ Place ID nicht vorhanden${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Place ID: $PLACE_ID${NC}"
echo ""

# Erstelle .env Datei im server/ Verzeichnis
echo -e "${BLUE}8. Environment Datei erstellen${NC}"

ENV_FILE="server/.env"

cat > "$ENV_FILE" << EOF
# Google Places API Configuration
GOOGLE_PLACES_API_KEY=$API_KEY
GOOGLE_BUSINESS_PLACE_ID=$PLACE_ID

# Server Configuration
PORT=3001
NODE_ENV=production

# Shopify Store URL (für CORS)
SHOPIFY_STORE_URL=https://teppich-paradies-live.myshopify.com

# Google Cloud Project ID (für Monitoring)
GOOGLE_CLOUD_PROJECT=$PROJECT_ID
EOF

echo -e "${GREEN}✅ Environment Datei erstellt: $ENV_FILE${NC}"
echo ""

# Backup der Credentials
echo -e "${BLUE}9. Credentials Backup${NC}"

BACKUP_FILE="server/.credentials-backup.json"

cat > "$BACKUP_FILE" << EOF
{
  "project_id": "$PROJECT_ID",
  "api_key": "$API_KEY",
  "place_id": "$PLACE_ID",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "account": "$ACCOUNT"
}
EOF

echo -e "${GREEN}✅ Credentials Backup: $BACKUP_FILE${NC}"
echo ""

# Final Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          ✅ Setup erfolgreich abgeschlossen!              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Zusammenfassung:"
echo "  Project ID:     $PROJECT_ID"
echo "  API Key:        ${API_KEY:0:20}..."
echo "  Place ID:       $PLACE_ID"
echo "  .env File:      $ENV_FILE"
echo ""
echo "📋 Nächste Schritte:"
echo ""
echo "1. GitHub Secrets setzen:"
echo "   https://github.com/kontakt755/teppich-paradies-shopify-ai/settings/secrets/actions"
echo ""
echo "   GOOGLE_PLACES_API_KEY = $API_KEY"
echo "   GOOGLE_BUSINESS_PLACE_ID = $PLACE_ID"
echo "   SHOPIFY_STORE_URL = https://teppich-paradies-live.myshopify.com"
echo ""
echo "2. Lokal testen:"
echo "   cd server && npm run dev"
echo "   curl http://localhost:3001/api/store/google-rating"
echo ""
echo "3. Deployen:"
echo "   Vercel: npx vercel --prod"
echo "   Railway: https://railway.app/new"
echo "   Heroku: heroku create && git push heroku main"
echo ""
echo "⚠️  WICHTIG:"
echo "  - Bewahren Sie den API Key sicher auf!"
echo "  - Speichern Sie die .env Datei NICHT im Git-Repository"
echo "  - Nur GitHub Secrets verwenden für Production"
echo ""
