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

/** Platzhalter aus .env.local.example und der Token-Anleitung - zaehlen nie als Zugang. */
const PLATZHALTER = /^(<.*>|HIER_[A-Z_]+|…|\.\.\.)$/;

/**
 * Liest KEY=VALUE-Zeilen aus .env.local, ohne process.env zu ueberschreiben.
 * Versteht beide Schreibweisen, die im Projekt vorkommen: `KEY=wert` und
 * `export KEY='wert'` (so schreiben app-einrichten.sh und shopify-oauth.mjs).
 * Ohne das `export` blieb ein frisch eingerichteter Zugang unter launchd
 * unsichtbar, weil dort keine Shell die Datei vorher einliest.
 * TP_ENV_LOCAL nennt eine andere Datei - die Tests zeigen damit ins Leere,
 * damit sie nie mit dem echten Zugang des Rechners gegen Shopify laufen.
 */
export function ladeEnvLocal(datei = process.env.TP_ENV_LOCAL || path.join(root, '.env.local')) {
  const werte = {};
  if (!fs.existsSync(datei)) return werte;
  for (const zeile of fs.readFileSync(datei, 'utf8').split(/\r?\n/)) {
    if (zeile.trim().startsWith('#')) continue;
    const m = zeile.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const wert = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (PLATZHALTER.test(wert)) continue;
    werte[m[1]] = wert;
  }
  return werte;
}

/** Gleiche Regel wie erzeugeProxy: fester Token oder Client-ID plus Schluessel. */
export function hatZugangsdaten(env = { ...ladeEnvLocal(), ...process.env }) {
  return Boolean(env.SHOPIFY_ADMIN_TOKEN) || Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET);
}

/**
 * Was zu tun ist, wenn kein Zugang hinterlegt ist. Beginnt bewusst mit
 * "Kein Zugang": daran erkennt die Oberflaeche den Fall (aktualisierungHealth).
 */
export const KEIN_ZUGANG = 'Kein Zugang zu Shopify: in .env.local im Ordner des Dienstes fehlen SHOPIFY_CLIENT_ID und SHOPIFY_CLIENT_SECRET. '
  + 'Einmalig eintragen (Anleitung: operations/README.md, Abschnitt "Zugang einrichten"), danach pruefen mit: npm run operations:verbindung';

/**
 * Zugriffsbereiche, die die Datenquellen des Control Centers zum LESEN
 * brauchen, je Bereich mit den Quellen, die ohne ihn ausfallen. Schreibrechte
 * (write_orders fuer ops.*-Metafelder) gehoeren nicht dazu - die Aktualisierung
 * schreibt nie nach Shopify.
 */
export const LESE_BEREICHE = Object.freeze({
  read_orders: 'Bestellungen, Kennzahlen, Erfuellung, Warenkoerbe',
  read_all_orders: 'Bestellungen, die aelter als 60 Tage sind (ohne diesen Bereich laesst Shopify sie stillschweigend weg)',
  read_customers: 'Kunden (auch Name, E-Mail, Telefon an Bestellungen)',
  read_draft_orders: 'Angebote/Entwuerfe',
  read_products: 'Produktlexikon, Artikeldaten an Bestellpositionen',
  read_metaobjects: 'Lexikon-Eigenschaften (Nutzungsklasse, Lieferant ...)',
  read_inventory: 'Lagerbestand',
  read_locations: 'Standorte fuer den Lagerbestand',
});

/** Die eine Zeile fuer das Feld "Bereiche" (Scopes) der App. */
export const LESE_BEREICHE_ZEILE = Object.keys(LESE_BEREICHE).join(',');

/**
 * Schreibbereiche, die das Control Center selbst braucht - bisher keine,
 * seit der Ansicht "Sonderposten" (Knopf "Im Laden verkauft") zwei. Ohne sie
 * laufen alle Lese-Quellen weiter; nur die eine Aktion meldet, was fehlt.
 * Freischalten macht ausschliesslich der Inhaber im Dev Dashboard.
 */
export const SCHREIB_BEREICHE = Object.freeze({
  write_inventory: 'Sonderposten: "Im Laden verkauft" setzt den Bestand auf 0',
  write_products: 'Sonderposten: Verkaufsangaben (verkauft_am, verkauft_von, verkauft_kanal)',
});

/** Welche Schreibbereiche fehlen in der von Shopify gemeldeten Liste? */
export function fehlendeSchreibBereiche(scope) {
  const erteilt = new Set(String(scope || '').split(',').map(s => s.trim()).filter(Boolean));
  return Object.keys(SCHREIB_BEREICHE).filter(b => !erteilt.has(b));
}

/**
 * Welche Lese-Bereiche fehlen in der von Shopify gemeldeten Liste? Shopify
 * laesst read_x weg, wenn write_x erteilt ist - write_x gilt deshalb als read_x.
 */
export function fehlendeBereiche(scope) {
  const erteilt = new Set(String(scope || '').split(',').map(s => s.trim()).filter(Boolean));
  return Object.keys(LESE_BEREICHE).filter(b => !erteilt.has(b) && !erteilt.has(b.replace(/^read_/, 'write_')));
}

/**
 * Uebersetzt eine rohe Fehlermeldung in "was ist los, was ist zu tun".
 * Liefert null, wenn die Meldung keinem bekannten Fall entspricht - dann
 * bleibt sie unveraendert stehen (nichts raten).
 */
export function wasTun(meldung) {
  const m = String(meldung || '');
  if (/^Kein Zugang/i.test(m)) return null; // nennt den Weg schon selbst
  if (/Token-Tausch fehlgeschlagen: HTTP 4\d\d/.test(m)) {
    if (/shop_not_permitted|not installed|app_not_installed/i.test(m)) {
      return 'Die App ist im Shop nicht installiert oder gehoert nicht zur selben Organisation. Im Dev Dashboard die App oeffnen und im Shop installieren.';
    }
    return 'Shopify lehnt Client-ID oder Schluessel ab. Beide Zeilen in .env.local pruefen (Dev Dashboard > App > Einstellungen); ist die App noch nicht im Shop installiert, zuerst installieren.';
  }
  if (/HTTP 401/.test(m)) {
    return 'Der hinterlegte Token ist ungueltig oder abgelaufen (Token aus "client-credentials" gelten nur 24 Stunden). Die Zeile SHOPIFY_ADMIN_TOKEN aus .env.local loeschen und nur SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET stehen lassen - dann erneuert sich der Zugang selbst.';
  }
  if (/not approved to access/i.test(m)) {
    return 'Der App fehlt die Freigabe fuer geschuetzte Kundendaten. Im Dev Dashboard bei der App unter "API-Zugriff" den Zugriff auf Kundendaten samt Name, E-Mail, Telefon und Adresse einschalten und speichern.';
  }
  if (/HTTP 403|access denied|ACCESS_DENIED/i.test(m)) {
    const bereich = m.match(/`?((?:read|write)_[a-z_]+)`?/)?.[1];
    if (bereich && SCHREIB_BEREICHE[bereich]) {
      return `Der App fehlt das Schreibrecht ${bereich} (${SCHREIB_BEREICHE[bereich]}). Der Inhaber gibt im Dev Dashboard eine neue Version mit ${bereich} in der Bereichszeile frei (operations/README.md, "Zugang einrichten") und bestaetigt die Aenderung im Shop.`;
    }
    return `Der App fehlt ein Zugriffsbereich${bereich ? ` (${bereich})` : ''}. Im Dev Dashboard eine neue Version mit dieser Bereichszeile freigeben und die Aenderung im Shop bestaetigen: ${LESE_BEREICHE_ZEILE} - danach: npm run operations:verbindung`;
  }
  if (/THROTTLED|HTTP 429/i.test(m)) return 'Shopify bremst gerade (zu viele Abfragen). Nichts zu tun - der naechste Lauf holt es nach.';
  if (/HTTP 5\d\d|fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(m)) return 'Shopify oder das Internet war nicht erreichbar. Nichts zu tun - der naechste Lauf versucht es erneut.';
  if (/already in progress|bereits.*Bulk|BULK.*RUNNING/i.test(m)) return 'Es lief noch eine andere Massenabfrage dieser App. Nichts zu tun - der naechste Lauf versucht es erneut.';
  return null;
}

/** Haengt den Handlungshinweis an, wenn es einen gibt. */
export function mitHinweis(meldung) {
  const tun = wasTun(meldung);
  return tun ? `${meldung} - Was tun: ${tun}` : String(meldung);
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
 *
 * Steht ein fester SHOPIFY_ADMIN_TOKEN neben Client-ID und Schluessel, hat der
 * Token Vorrang - wird er aber mit HTTP 401 abgewiesen, wechselt der Proxy
 * einmal auf die Client-Credentials. Hintergrund: `shopify:token --write-env`
 * legt einen 24-Stunden-Token als SHOPIFY_ADMIN_TOKEN ab; ohne den Wechsel
 * fiele der Dauerdienst einen Tag nach der Einrichtung dauerhaft aus.
 */
export async function erzeugeProxy({ env = { ...ladeEnvLocal(), ...process.env }, fetch = globalThis.fetch, jetzt = Date.now } = {}) {
  const hatClient = Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET);
  const tausche = () => tauscheClientCredentials({ clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET, fetch, jetzt });

  /** Haengt Ablauf-Erneuerung und einmaligen 401-Neuversuch an den Proxy. */
  function mitErneuerung(proxy, start) {
    let z = start; // null, solange noch der feste Token gilt
    const original = proxy.execute.bind(proxy);
    proxy.execute = async (query, variables) => {
      if (z && jetzt() >= z.gueltigBis) {
        z = await tausche();
        proxy.token = z.token;
      }
      try {
        return await original(query, variables);
      } catch (err) {
        if (!/HTTP 401/.test(String(err?.message))) throw err;
        z = await tausche();
        proxy.token = z.token;
        return original(query, variables);
      }
    };
    return proxy;
  }

  if (env.SHOPIFY_ADMIN_TOKEN) {
    const proxy = new GraphQLProxy({ token: env.SHOPIFY_ADMIN_TOKEN, fetch });
    return { proxy: hatClient ? mitErneuerung(proxy, null) : proxy, art: 'admin-token', scope: null };
  }
  if (hatClient) {
    const z = await tausche();
    return { proxy: mitErneuerung(new GraphQLProxy({ token: z.token, fetch }), z), art: 'client-credentials', scope: z.scope };
  }
  return { proxy: new GraphQLProxy({ token: null, fetch }), art: 'sammeln', scope: null };
}

/**
 * Kleinste Leseabfrage je Datenquelle. Die gemeldete Bereichsliste allein ist
 * kein Beleg (ein fester Token meldet gar keine) - erst die Antwort zeigt, ob
 * die Quelle wirklich lesbar ist.
 */
export const QUELLEN_PROBEN = Object.freeze({
  lexikon: 'query { products(first: 1) { nodes { id } } }',
  bestellungen: 'query { orders(first: 1) { nodes { id customer { id } } } }',
  kunden: 'query { customers(first: 1) { nodes { id } } }',
  angebote: 'query { draftOrders(first: 1) { nodes { id } } }',
  warenkoerbe: 'query { abandonedCheckouts(first: 1) { nodes { id } } }',
  bestand: 'query { locations(first: 1) { nodes { id inventoryLevels(first: 1) { nodes { id } } } } }',
});

/**
 * Fragt jede Datenquelle einmal an. Wirft nie; liefert je Quelle
 * { quelle, ok, meldung } - meldung samt Handlungshinweis, wenn bekannt.
 * Nur Lesezugriffe.
 */
export async function pruefeQuellen(proxy, proben = QUELLEN_PROBEN) {
  const ergebnis = [];
  for (const [quelle, query] of Object.entries(proben)) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sechs kleine Abfragen, bewusst nacheinander.
      const data = await proxy.execute(query);
      if (data === null) ergebnis.push({ quelle, ok: false, meldung: KEIN_ZUGANG });
      else ergebnis.push({ quelle, ok: true, meldung: null });
    } catch (err) {
      ergebnis.push({ quelle, ok: false, meldung: mitHinweis(err.message) });
    }
  }
  return ergebnis;
}
