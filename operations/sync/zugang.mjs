// Zugang zur Admin API fuer das Operations-Modul.
// Reihenfolge: SHOPIFY_ADMIN_TOKEN (shpat_, alte benutzerdefinierte App)
// oder SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (App aus dem Dev Dashboard).
// Dev-Dashboard-Apps liefern keinen festen Token; der Client-Credentials-Grant
// tauscht ID + Schluessel gegen einen Zugangsschluessel mit Ablaufzeit.
// Weder Schluessel noch Token werden geloggt oder in Dateien geschrieben.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STORE = 'sjjyq1-6w';

/** Liest KEY=VALUE-Zeilen aus .env.local, ohne process.env zu ueberschreiben. */
export function ladeEnvLocal(datei = path.join(root, '.env.local')) {
  const werte = {};
  if (!fs.existsSync(datei)) return werte;
  for (const zeile of fs.readFileSync(datei, 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !zeile.trim().startsWith('#')) werte[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return werte;
}

/** Client-Credentials-Grant: liefert { token, scope, gueltigBis }. */
export async function tauscheClientCredentials({ clientId, clientSecret, store = STORE, fetch = globalThis.fetch, jetzt = Date.now }) {
  const res = await fetch(`https://${store}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Antworttext kann keine Geheimnisse enthalten, wird aber gekuerzt.
    throw new Error(`Token-Tausch fehlgeschlagen: HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  const body = await res.json();
  if (!body.access_token) throw new Error('Token-Tausch: Antwort ohne access_token');
  const sek = Number(body.expires_in) || 86400;
  return { token: body.access_token, scope: body.scope || '', gueltigBis: jetzt() + (sek - 300) * 1000 };
}

/**
 * Liefert einen GraphQLProxy. Ohne Zugangsdaten: Sammelmodus (wie bisher).
 * Mit Client-Credentials wird der Token bei Ablauf automatisch erneuert.
 */
export async function erzeugeProxy({ env = { ...ladeEnvLocal(), ...process.env }, fetch = globalThis.fetch, jetzt = Date.now } = {}) {
  if (env.SHOPIFY_ADMIN_TOKEN) {
    return { proxy: new GraphQLProxy({ token: env.SHOPIFY_ADMIN_TOKEN, fetch }), art: 'admin-token', scope: null };
  }
  if (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET) {
    let z = await tauscheClientCredentials({ clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET, fetch, jetzt });
    const proxy = new GraphQLProxy({ token: z.token, fetch });
    const original = proxy.execute.bind(proxy);
    proxy.execute = async (query, variables) => {
      if (jetzt() >= z.gueltigBis) {
        z = await tauscheClientCredentials({ clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET, fetch, jetzt });
        proxy.token = z.token;
      }
      return original(query, variables);
    };
    return { proxy, art: 'client-credentials', scope: z.scope };
  }
  return { proxy: new GraphQLProxy({ token: null, fetch }), art: 'sammeln', scope: null };
}
