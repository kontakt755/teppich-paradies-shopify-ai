FROM node:18-alpine

# Arbeitsverzeichnis
WORKDIR /app

# Abhängigkeiten
COPY package*.json ./
RUN npm install --production

# App-Code
COPY . .

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose Port
EXPOSE 3001

# Start-Befehl
ENV NODE_ENV=production
CMD ["node", "index.js"]
