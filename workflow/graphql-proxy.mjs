#!/usr/bin/env node

/**
 * GraphQL-Zugang fuer sync-grosshandel.mjs.
 *
 * Zwei Betriebsarten, entschieden am Token:
 *   - LIVE:    SHOPIFY_ADMIN_TOKEN (shpat_) vorhanden -> echte Aufrufe gegen die
 *              Admin GraphQL API. Das ist der Fall in GitHub Actions, wo kein
 *              MCP-Server laeuft (Repository-Secret SHOPIFY_ADMIN_TOKEN).
 *   - SAMMELN: kein Token -> Aufrufe werden nur protokolliert und exportiert.
 *              Lokal laeuft Schreibzugriff ueber den Shopify-MCP, siehe CLAUDE.md;
 *              ein Token wird dort weder gebraucht noch gesucht.
 *
 * Bis 2026-09-09 gab es nur die Sammel-Betriebsart. In Actions lief der Sync
 * deshalb seit dem 2026-09-04 jede Nacht ins Leere: `data.products` war
 * undefined, und der Fehler wurde als fehlender API-Zugang gelesen (#34).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const DEFAULT_API_VERSION = '2026-07';

export class GraphQLProxy {
  constructor(options = {}) {
    this.store = options.store || 'sjjyq1-6w';
    this.apiVersion = options.apiVersion || process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION;
    this.token = options.token ?? process.env.SHOPIFY_ADMIN_TOKEN ?? null;
    this.fetch = options.fetch || globalThis.fetch;
    this.requestLog = [];
    if (this.token && /^atkn_/.test(this.token)) {
      // App-Automatisierungstoken; liefert an der Admin API "Invalid API key or
      // access token". Frueh und eindeutig scheitern statt mit 401 raten.
      throw new Error('SHOPIFY_ADMIN_TOKEN ist ein atkn_-Token (App-Automatisierung). Die Admin GraphQL API braucht einen shpat_-Token einer Store-App.');
    }
  }

  get live() {
    return Boolean(this.token);
  }

  get endpoint() {
    return `https://${this.store}.myshopify.com/admin/api/${this.apiVersion}/graphql.json`;
  }

  /**
   * LIVE: fuehrt die Query aus und liefert `data`. Wirft bei HTTP-Fehlern und
   * bei GraphQL-`errors`. userErrors einer Mutation bleiben in `data` und
   * werden vom Aufrufer bewertet.
   * SAMMELN: protokolliert nur und liefert null.
   */
  async execute(query, variables = {}) {
    const request = { query, variables, timestamp: new Date().toISOString() };
    this.requestLog.push(request);
    if (!this.live) {
      console.log(`📡 GraphQL-Call gesammelt (${this.requestLog.length} total, kein Token)`);
      return null;
    }
    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': this.token },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Shopify Admin API HTTP ${response.status}${response.status === 401 ? ' (Token ungueltig oder ohne Scope)' : ''}: ${text.slice(0, 200)}`);
    }
    const body = await response.json();
    if (Array.isArray(body.errors) && body.errors.length) {
      throw new Error(`Shopify GraphQL: ${body.errors.map(e => e.message).join('; ').slice(0, 300)}`);
    }
    request.cost = body.extensions?.cost?.actualQueryCost ?? null;
    return body.data ?? {};
  }

  /** Speichert alle Aufrufe (ohne Token) fuer Nachvollziehbarkeit und Batch-Export. */
  exportLog(dir = path.join(rootDir, '.sync-reports')) {
    const logPath = path.join(dir, `graphql-log-${Date.now()}.json`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(this.requestLog, null, 2));
    console.log(`📋 GraphQL-Log: ${logPath}`);
    return logPath;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const proxy = new GraphQLProxy();
  console.log(`GraphQL-Proxy bereit: ${proxy.live ? `LIVE gegen ${proxy.endpoint}` : 'SAMMELN (kein SHOPIFY_ADMIN_TOKEN)'}`);
}
