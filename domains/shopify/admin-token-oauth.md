# Admin-API-Token (shpat_) beschaffen

Aufgesetzt am 2026-09-22. Hintergrund ist #34: Der nächtliche Grosshandel-Sync in
GitHub Actions lief ins Leere, weil das Repository-Secret `SHOPIFY_ADMIN_TOKEN` ein
`atkn_`-Token war. Die Admin GraphQL API nimmt nur `shpat_`.

**Lokal braucht niemand einen Token** — dort läuft der Schreibzugriff über den
authentifizierten Shopify-MCP (siehe `CLAUDE.md`). Ein Token wird nur für
GitHub Actions gebraucht, wo kein MCP-Server läuft.

---

## Welcher Weg gilt?

Es gibt drei, und sie hängen davon ab, **wo die App angelegt wurde**. Das zuerst klären,
sonst baut man den falschen Flow.

| App angelegt in | Weg zum Token | Ablauf |
|---|---|---|
| Shopify-Admin → Einstellungen → Apps → **Apps entwickeln** | Token steht fertig in der Oberfläche, **kein OAuth** | läuft nicht ab |
| Dev Dashboard / Partner, arbeitet nur auf Stores der eigenen Organisation | `client_credentials` — ein POST, kein Browser | **24 Stunden** |
| Dev Dashboard / Partner, klassischer Install-Flow | `authorization_code` — Browser + Zustimmung | Offline-Token, bei Custom Apps ohne Ablauf |

Der erste Weg ist der kürzeste und der, den der Kommentar in #34 beschreibt: Scopes
`read_products` und `write_products` freigeben, Token erzeugen, fertig. Er braucht dieses
Werkzeug überhaupt nicht.

Die beiden anderen Wege deckt `npm run shopify:token` ab.

---

## Voraussetzung

In `.env.local` (gitignored, wird nie committet):

```
export SHOPIFY_CLIENT_ID='…'
export SHOPIFY_CLIENT_SECRET='…'
```

Solange dort die Platzhalter `HIER_CLIENT_ID` / `HIER_SECRET` stehen, bricht das Werkzeug
ab, bevor es irgendetwas über das Netz schickt.

---

## Weg 2: client_credentials (ohne Browser)

```
npm run shopify:token -- --grant client-credentials --write-env
```

Ein POST an `/admin/oauth/access_token` mit `grant_type=client_credentials`. Keine
Redirect-URL, keine Zustimmung, keine Merchant-Interaktion.

Der Token ist nur 24 Stunden gültig (`expires_in: 86399`) und taugt deshalb nicht als
statisches Secret. Seit #465 holt `grosshandel-sync.yml` ihn **in jedem Lauf selbst**:

```
node scripts/shopify-oauth.mjs --grant client-credentials --github-env
```

`--github-env` maskiert den Token (`::add-mask::`) und reicht ihn über `$GITHUB_ENV`
als `SHOPIFY_ADMIN_TOKEN` an die folgenden Schritte weiter. Der Schritt läuft nur, wenn
das Secret `SHOPIFY_CLIENT_ID` existiert; sonst gilt weiter `SHOPIFY_ADMIN_TOKEN`.

**Das ist der Weg für neue Apps.** Im Shopify-Admin lassen sich unter „Apps entwickeln"
keine neuen Custom Apps mehr anlegen; neue Apps entstehen im Dev Dashboard.

### Klickfolge für den Inhaber (einmalig)

1. `dev.shopify.com` → **Apps** → **App erstellen** → „Manuell erstellen", Name z. B.
   `TP Grosshandel-Sync`. Die App muss in **derselben Organisation** wie der Store liegen.
2. In der App → **Versionen** → neue Version: **Scopes** `read_products,write_products`,
   App-URL beliebig (z. B. `https://www.teppich-paradies.net`), Embedded aus → **Freigeben**.
3. **Home** der App → **Installieren** → Store `sjjyq1-6w` wählen → zustimmen.
4. **Einstellungen** der App → **Client-ID** und **Secret** kopieren.
5. Beide als Repository-Secrets hinterlegen (fragt den Wert jeweils ab):
   `gh secret set SHOPIFY_CLIENT_ID` und `gh secret set SHOPIFY_CLIENT_SECRET`.
6. Workflow *Grosshandel-Sync* manuell starten.

---

## Weg 3: authorization_code (mit Browser)

Vorher in den App-Einstellungen eintragen, sonst weist Shopify die Rückleitung ab:

```
Allowed redirection URL(s):  http://127.0.0.1:3456/callback
```

Dann:

```
npm run shopify:token -- --grant authorization-code --write-env
```

Das Werkzeug druckt die Authorize-Adresse, öffnet einen Server auf `127.0.0.1:3456`
und wartet fünf Minuten auf die Rückleitung. Adresse im Browser öffnen, App installieren.

**Was an der Rückleitung geprüft wird**, bevor der Code eingetauscht wird — alle drei,
jede Abweichung bricht ab:

1. `state` gegen das erzeugte 32-Byte-Nonce (zeitkonstanter Vergleich)
2. `shop` gegen den erwarteten Host, zusätzlich gegen `<name>.myshopify.com`
3. `hmac` als HMAC-SHA256 über die alphabetisch sortierten übrigen Parameter,
   mit dem Client Secret als Schlüssel, zeitkonstant verglichen

---

## Beleg statt Annahme

Beide Wege enden mit einem echten Aufruf gegen die Admin GraphQL API
(`{ shop { name myshopifyDomain } }`). Erst dessen Antwort belegt den Token — ein
erfolgreicher Token-Endpunkt allein sagt nichts darüber, ob die Scopes reichen.

Das Werkzeug gibt den Token **nie vollständig** aus, nur Präfix und die letzten vier
Zeichen. `--write-env` legt ihn als `SHOPIFY_ADMIN_TOKEN` in `.env.local` ab (chmod 600).

---

## Der letzte Schritt bleibt Handarbeit

Das Repository-Secret setzt der Inhaber selbst:
**GitHub → Settings → Secrets and variables → Actions → `SHOPIFY_ADMIN_TOKEN`.**

`gh secret set SHOPIFY_ADMIN_TOKEN` ist in `.claude/hooks/git-gh-guard.mjs` blockiert —
absichtlich. Ein Agent schiebt keine Zugangsdaten in ein öffentliches Repository.

Danach den Workflow *Grosshandel-Sync* einmal manuell starten. Ein erfolgreicher Dry-Run
ist der Abschluss.
